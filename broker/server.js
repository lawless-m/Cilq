import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { attachWebSocketServer } from './websocket.js';

// ---- Config (env-driven) -------------------------------------------------
const PORT = Number(process.env.BRIDGE_PORT ?? 3141);
const HOST = process.env.BRIDGE_HOST ?? '127.0.0.1'; // loopback; Apache fronts it
const TOKEN = process.env.BRIDGE_TOKEN ?? '';        // shared secret; empty = open (dev only)
const SYNC_TIMEOUT_MS = Number(process.env.BRIDGE_SYNC_TIMEOUT_MS ?? 10000);
const JOB_TTL_MS = Number(process.env.BRIDGE_JOB_TTL_MS ?? 5 * 60 * 1000); // retain finished jobs
const CLIENT_PATH = process.env.BRIDGE_CLIENT_PATH ?? path.join(import.meta.dirname, '..', 'browser-bridge-client.js');
const README_PATH = path.join(import.meta.dirname, 'README.md');
// Public base (e.g. https://dw.ramsden-international.com/bridge) for copy-paste
// examples in the manifest. Apache strips the /bridge prefix, so the broker
// can't infer it; left empty, the manifest uses relative paths.
const PUBLIC_URL = (process.env.BRIDGE_PUBLIC_URL ?? '').replace(/\/$/, '');

if (!TOKEN) console.warn('[bridge] WARNING: BRIDGE_TOKEN is empty — auth is disabled.');

// ---- State ---------------------------------------------------------------
const workers = new Map(); // connectionId -> ws
const jobs = new Map();    // jobId -> job
const waiters = new Map(); // jobId -> { res, timer }  (parked sync HTTP responses)

function log(...a) { console.log(new Date().toISOString(), ...a); }

// ---- Job lifecycle -------------------------------------------------------
function createJob({ script, target }) {
  const job = {
    jobId: randomUUID(),
    script,
    target: target ?? null,
    status: 'pending',
    result: null,
    resultType: null,
    error: null,
    stack: null,
    logs: [],
    workerConnectionId: null,
    createdAt: Date.now(),
    completedAt: null,
  };
  jobs.set(job.jobId, job);
  return job;
}

// Pick a worker: specific target if given, else any connected one.
function pickWorker(target) {
  if (target) return workers.get(target) ? target : null;
  const first = workers.keys().next();
  return first.done ? null : first.value;
}

// Returns true if dispatched, false if no worker available.
function dispatch(job) {
  const workerId = pickWorker(job.target);
  if (!workerId) return false;
  const worker = workers.get(workerId);
  job.workerConnectionId = workerId;
  job.status = 'dispatched';
  worker.ws.send(JSON.stringify({ type: 'execute_script', requestId: job.jobId, script: job.script }));
  log(`dispatch job=${job.jobId} -> worker=${workerId}`);
  return true;
}

// Called when a browser returns a result for a job.
function completeJob(jobId, { success, result, resultType, error, stack, logs }) {
  const job = jobs.get(jobId);
  if (!job) return; // unknown / already pruned
  job.status = success ? 'done' : 'failed';
  job.result = success ? (result ?? null) : null;
  job.resultType = success ? (resultType ?? null) : null;
  job.error = success ? null : (error ?? 'unknown error');
  job.stack = stack ?? null;
  job.logs = Array.isArray(logs) ? logs : [];
  job.completedAt = Date.now();
  log(`complete job=${jobId} status=${job.status}`);

  const waiter = waiters.get(jobId);
  if (waiter) {
    clearTimeout(waiter.timer);
    waiters.delete(jobId);
    sendJson(waiter.res, 200, publicJob(job));
  }
}

// When a worker connects, drain pending jobs it can serve.
function drainPending(workerId) {
  for (const job of jobs.values()) {
    if (job.status !== 'pending') continue;
    if (job.target && job.target !== workerId) continue;
    dispatch(job);
  }
}

function publicJob(job) {
  const { jobId, status, result, resultType, error, stack, logs, target, workerConnectionId, createdAt, completedAt } = job;
  return { jobId, status, result, resultType, error, stack, logs, target, workerConnectionId, createdAt, completedAt };
}

// Prune finished jobs past TTL so the map doesn't grow unbounded.
setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS;
  for (const [id, job] of jobs) {
    if (job.completedAt && job.completedAt < cutoff) jobs.delete(id);
  }
}, 60 * 1000).unref();

// ---- HTTP helpers --------------------------------------------------------
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1_000_000) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function authedHttp(req) {
  if (!TOKEN) return true;
  const h = req.headers['authorization'] ?? '';
  return h === `Bearer ${TOKEN}`;
}

// Self-describing manifest so an agent landing on the broker cold (just a URL)
// learns what it is, how to authenticate, and what to call — in one fetch.
function manifest() {
  const u = (p) => (PUBLIC_URL ? PUBLIC_URL + p : p);
  return {
    service: 'browser-bridge-broker',
    what: 'Submit JavaScript jobs; connected browsers eval them; results route back.',
    base: PUBLIC_URL || null,
    auth: 'Send "Authorization: Bearer <token>" on every endpoint except / and /health.',
    endpoints: [
      { method: 'GET', path: '/', auth: false, desc: 'this manifest' },
      { method: 'GET', path: '/readme', auth: false, desc: 'full docs as Markdown' },
      { method: 'GET', path: '/health', auth: false, desc: 'liveness + counts' },
      { method: 'GET', path: '/workers', auth: true, desc: 'connected browsers with identity: connectionId, ip, host, path, url, title' },
      { method: 'POST', path: '/jobs/sync', auth: true, body: '{script, target?, timeout?}', desc: 'run now, block until the browser returns a result (503 if no browser, 408 on timeout)' },
      { method: 'POST', path: '/jobs', auth: true, body: '{script, target?}', desc: 'enqueue; returns {jobId}; runs now or when a browser connects' },
      { method: 'GET', path: '/jobs/:id', auth: true, desc: 'poll a job: status pending|dispatched|done|failed|expired, plus structured result {result, resultType, logs[], error, stack}' },
    ],
    target: 'Omit "target" to run on any one connected browser, or set it to a connectionId from /workers.',
    scripts: 'A JS expression (e.g. document.title) or statements ending in return. Top-level await works: (await fetch("/api/x")).json().',
    pageHelper: {
      note: 'Cooperative pages expose window.bridge to your scripts. Run bridge.nodes()/bridge.actions() first to discover what a page offers, then address it by stable name instead of brittle selectors.',
      api: {
        'bridge.nodes()': "enumerate declared nodes [{node,tag,text,value}] — the page's contract",
        'bridge.node(name)': 'element tagged data-bridge-node="name" (or null)',
        'bridge.all(name)': 'all elements tagged data-bridge-node="name"',
        'bridge.actions()': 'list registered action names',
        'bridge.action(name, ...args)': 'invoke a registered action (may return a Promise — await it)',
        'bridge.register(name, fn)': 'page-side: register a named action',
      },
      example: "bridge.node('cart-total').textContent",
    },
    workers: workers.size,
    quickstart: `curl -s -XPOST ${u('/jobs/sync')} -H 'Authorization: Bearer <token>' -H 'Content-Type: application/json' -d '{"script":"document.title"}'`,
    note: PUBLIC_URL ? undefined : 'Paths are relative to the URL you fetched this from (e.g. /bridge/). Set BRIDGE_PUBLIC_URL for absolute examples.',
  };
}

// Status dashboard. The shell holds no secret; its JS fetches /health (open)
// and /workers (with the token you paste, kept in sessionStorage). Relative
// URLs make it work both at /bridge/status and when served directly.
const STATUS_HTML = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>Browser Bridge — status</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font: 14px/1.5 system-ui, sans-serif; max-width: 820px; margin: 2rem auto; padding: 0 1rem; }
  h1 { font-size: 1.3rem; margin-bottom: .2rem; }
  h3 { margin: 1.2rem 0 .3rem; }
  .row { display: flex; gap: 1rem; align-items: center; flex-wrap: wrap; }
  input { font: inherit; padding: .3rem .5rem; border: 1px solid #bbb; border-radius: 4px; }
  table { border-collapse: collapse; width: 100%; }
  th, td { text-align: left; padding: .3rem .6rem; border-bottom: 1px solid #eee; font-variant-numeric: tabular-nums; }
  th { color: #666; font-weight: 600; }
  .badge { background: #eef; border-radius: 10px; padding: 0 .5rem; font-size: .85em; }
  .ok { color: #0a0; } .err { color: #c00; } .muted { color: #888; }
  #status { font-weight: 600; }
</style></head>
<body>
  <h1>Browser Bridge — status</h1>
  <div class="row">
    <span id="status" class="muted">connecting…</span>
    <span id="summary" class="muted"></span>
    <span class="muted">updated <span id="updated">—</span></span>
  </div>
  <p class="row"><label>Token: <input id="token" type="password" placeholder="Bearer token" size="24"></label></p>
  <div id="sites"><p class="muted">…</p></div>
<script>
(function () {
  var KEY = 'bridgeToken';
  var input = document.getElementById('token');
  input.value = sessionStorage.getItem(KEY) || '';
  input.addEventListener('input', function () { sessionStorage.setItem(KEY, input.value); poll(); });
  var statusEl = document.getElementById('status');
  var summaryEl = document.getElementById('summary');
  var sitesEl = document.getElementById('sites');
  var updatedEl = document.getElementById('updated');
  function esc(s) { var d = document.createElement('div'); d.textContent = (s == null ? '' : String(s)); return d.innerHTML; }
  function render(workers) {
    var byHost = {};
    workers.forEach(function (w) { (byHost[w.host] = byHost[w.host] || []).push(w); });
    var hosts = Object.keys(byHost).sort();
    if (!hosts.length) { sitesEl.innerHTML = '<p class="muted">no browsers connected</p>'; return; }
    var html = '';
    hosts.forEach(function (h) {
      html += '<h3>' + esc(h) + ' <span class="badge">' + byHost[h].length + '</span></h3>';
      html += '<table><thead><tr><th>path</th><th>title</th><th>ip</th><th>connected</th></tr></thead><tbody>';
      byHost[h].forEach(function (w) {
        var ago = Math.round((Date.now() - w.connectedAt) / 1000);
        html += '<tr><td>' + esc(w.path) + '</td><td>' + esc(w.title) + '</td><td>' + esc(w.ip) + '</td><td>' + ago + 's ago</td></tr>';
      });
      html += '</tbody></table>';
    });
    sitesEl.innerHTML = html;
  }
  function poll() {
    fetch('health').then(function (r) { return r.json(); }).then(function (health) {
      statusEl.textContent = 'broker OK'; statusEl.className = 'ok';
      summaryEl.textContent = health.workers + ' worker(s), ' + health.jobs + ' job(s) tracked';
      updatedEl.textContent = new Date().toLocaleTimeString();
      var token = input.value.trim();
      if (!token) { sitesEl.innerHTML = '<p class="muted">enter the token to list connected browsers</p>'; return; }
      fetch('workers', { headers: { Authorization: 'Bearer ' + token } }).then(function (r) {
        if (r.status === 401) { sitesEl.innerHTML = '<p class="err">401 — wrong token</p>'; return null; }
        return r.json();
      }).then(function (resp) { if (resp) render(resp.workers || []); });
    }).catch(function () { statusEl.textContent = 'broker unreachable'; statusEl.className = 'err'; });
  }
  poll();
  setInterval(poll, 2000);
})();
</script>
</body></html>`;

// ---- HTTP API ------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  // Self-describing root — unauthenticated discovery for agents/humans.
  if (req.method === 'GET' && (path === '/' || path === '/help')) {
    return sendJson(res, 200, manifest());
  }

  // Health is unauthenticated so a proxy/monitor can probe it.
  if (req.method === 'GET' && path === '/health') {
    return sendJson(res, 200, { status: 'ok', workers: workers.size, jobs: jobs.size });
  }

  // The worker script is public (the token lives inside it) so browsers can
  // load it. Served here so Apache can auto-inject /bridge/client.js into pages.
  if (req.method === 'GET' && path === '/client.js') {
    try {
      const js = fs.readFileSync(CLIENT_PATH);
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(js);
    } catch {
      return sendJson(res, 404, { error: 'client.js not found on broker' });
    }
  }

  // The README, served as Markdown for agents that ask for the full docs.
  if (req.method === 'GET' && path === '/readme') {
    try {
      const md = fs.readFileSync(README_PATH);
      res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(md);
    } catch {
      return sendJson(res, 404, { error: 'README not found on broker' });
    }
  }

  // Status dashboard shell — open (holds no secret); its JS fetches /workers
  // with the token the viewer supplies.
  if (req.method === 'GET' && path === '/status') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    return res.end(STATUS_HTML);
  }

  if (!authedHttp(req)) return sendJson(res, 401, { error: 'unauthorized' });

  if (req.method === 'GET' && path === '/workers') {
    const list = [...workers.entries()].map(([connectionId, w]) => ({
      connectionId, ip: w.ip, url: w.url, host: w.host, path: w.path, title: w.title, connectedAt: w.connectedAt,
    }));
    return sendJson(res, 200, { workers: list });
  }

  // GET /jobs/:id
  const jobMatch = path.match(/^\/jobs\/([^/]+)$/);
  if (req.method === 'GET' && jobMatch) {
    const job = jobs.get(jobMatch[1]);
    if (!job) return sendJson(res, 404, { error: 'job not found' });
    return sendJson(res, 200, publicJob(job));
  }

  // POST /jobs (async) and POST /jobs/sync
  if (req.method === 'POST' && (path === '/jobs' || path === '/jobs/sync')) {
    let body;
    try { body = JSON.parse(await readBody(req) || '{}'); }
    catch { return sendJson(res, 400, { error: 'invalid JSON body' }); }

    if (!body.script || typeof body.script !== 'string') {
      return sendJson(res, 400, { error: 'script (string) is required' });
    }

    const job = createJob({ script: body.script, target: body.target });
    const dispatched = dispatch(job);

    if (path === '/jobs') {
      // Async: if no worker now, it stays pending and runs when one connects.
      return sendJson(res, 202, publicJob(job));
    }

    // Sync: park the response until the result arrives or we time out.
    if (!dispatched) {
      return sendJson(res, 503, { error: 'no browser connected to run the job', jobId: job.jobId });
    }
    const timer = setTimeout(() => {
      waiters.delete(job.jobId);
      job.status = 'expired';
      job.completedAt = Date.now();
      sendJson(res, 408, { error: 'timed out waiting for browser result', jobId: job.jobId });
    }, body.timeout ?? SYNC_TIMEOUT_MS);
    waiters.set(job.jobId, { res, timer });
    return;
  }

  sendJson(res, 404, { error: 'not found' });
});

// ---- WebSocket (browser workers) ----------------------------------------
attachWebSocketServer(server, '/ws', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (TOKEN && url.searchParams.get('token') !== TOKEN) {
    ws.close(1008, 'unauthorized');
    return;
  }
  const connectionId = url.searchParams.get('connectionId') || randomUUID();
  // Real client IP: behind Apache the socket peer is the proxy, so prefer the
  // forwarded address it adds; fall back to the socket for direct connections.
  const ip = (req.headers['x-forwarded-for']?.split(',')[0].trim())
    || req.socket.remoteAddress || 'unknown';
  const worker = { ws, ip, url: null, host: null, path: null, title: null, connectedAt: Date.now() };
  workers.set(connectionId, worker);
  log(`worker connected: ${connectionId} ip=${ip} (total ${workers.size})`);
  drainPending(connectionId);

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); }
    catch { return; }
    const type = msg.type || msg.Type;
    if (type === 'connection_established') {
      // The page reports where it is; the broker already knows who (ip).
      worker.url = msg.url ?? null;
      worker.host = msg.host ?? null;
      worker.path = msg.path ?? null;
      worker.title = msg.title ?? null;
      return;
    }
    if (type === 'script_result') {
      const requestId = msg.requestId || msg.RequestId;
      completeJob(requestId, {
        success: msg.success ?? msg.Success,
        result: msg.result ?? msg.Result,
        resultType: msg.resultType,
        error: msg.error ?? msg.Error,
        stack: msg.stack,
        logs: msg.logs,
      });
    }
    // console_log / connection_established are informational; ignored here.
  });

  ws.on('close', () => {
    workers.delete(connectionId);
    log(`worker disconnected: ${connectionId} (total ${workers.size})`);
  });

  ws.on('error', (e) => log(`worker ${connectionId} error: ${e.message}`));
});

server.listen(PORT, HOST, () => {
  log(`broker listening on http://${HOST}:${PORT}  (ws path /ws)`);
});
