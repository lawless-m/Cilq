// End-to-end smoke test: starts the broker, connects a fake browser worker
// (raw masked WS frames), and exercises sync/async/auth paths. No deps.
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import net from 'node:net';

const PORT = 31410;
const TOKEN = 'testsecret';
const base = `http://127.0.0.1:${PORT}`;

let failures = 0;
function check(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures++;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- minimal WS client (masks frames, as browsers do) -------------------
function fakeBrowser(onExecute) {
  const sock = net.connect(PORT, '127.0.0.1');
  const key = randomBytes(16).toString('base64');
  let handshaken = false;
  let buf = Buffer.alloc(0);

  sock.on('connect', () => {
    sock.write(
      `GET /ws?token=${TOKEN}&connectionId=tester HTTP/1.1\r\n` +
      `Host: 127.0.0.1:${PORT}\r\n` +
      'Upgrade: websocket\r\nConnection: Upgrade\r\n' +
      `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`
    );
  });

  sock.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    if (!handshaken) {
      const idx = buf.indexOf('\r\n\r\n');
      if (idx === -1) return;
      const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
      if (!buf.toString('utf8', 0, idx).includes(accept)) throw new Error('bad accept');
      handshaken = true;
      buf = buf.subarray(idx + 4);
      sendMasked({ type: 'connection_established', url: 'https://dw.example/cart', host: 'dw.example', path: '/cart', title: 'Cart' });
    }
    // parse unmasked server frames (text only, small)
    while (buf.length >= 2) {
      const opcode = buf[0] & 0x0f;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) { len = buf.readUInt16BE(2); off = 4; }
      if (buf.length < off + len) return;
      const payload = buf.subarray(off, off + len).toString('utf8');
      buf = buf.subarray(off + len);
      if (opcode === 0x1) onExecute(JSON.parse(payload), sendMasked);
    }
  });

  function sendMasked(obj) {
    const data = Buffer.from(JSON.stringify(obj), 'utf8');
    const mask = randomBytes(4);
    const masked = Buffer.from(data);
    for (let i = 0; i < masked.length; i++) masked[i] ^= mask[i & 3];
    let header;
    if (data.length < 126) header = Buffer.from([0x81, 0x80 | data.length]);
    else { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 0x80 | 126; header.writeUInt16BE(data.length, 2); }
    sock.write(Buffer.concat([header, mask, masked]));
  }
  return sock;
}

async function api(path, { method = 'GET', token = TOKEN, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}

// --- run -----------------------------------------------------------------
const proc = spawn('node', ['server.js'], {
  cwd: import.meta.dirname,
  env: { ...process.env, BRIDGE_PORT: String(PORT), BRIDGE_TOKEN: TOKEN, BRIDGE_HOST: '127.0.0.1' },
  stdio: ['ignore', 'inherit', 'inherit'],
});

try {
  await sleep(500);

  // 1. health is open
  check('health open (no token)', (await api('/health', { token: null })).status === 200);

  // 1a. self-describing manifest, unauthenticated
  const root = await api('/', { token: null });
  check('manifest at / (no token)', root.status === 200 && root.json.service === 'browser-bridge-broker');
  check('manifest lists endpoints + workers', Array.isArray(root.json.endpoints) && typeof root.json.workers === 'number');
  check('manifest advertises bridge helper', !!root.json.pageHelper && !!root.json.pageHelper.api['bridge.nodes()']);

  // 1b. worker script served unauthenticated for Apache injection
  const clientRes = await fetch(`${base}/client.js`);
  const clientBody = await clientRes.text();
  check('client.js served unauthenticated', clientRes.status === 200 && clientBody.includes('WebSocket'));

  // 2. auth enforced
  check('jobs/sync rejects bad token', (await api('/jobs/sync', { method: 'POST', token: 'wrong', body: { script: '1' } })).status === 401);

  // 3. no worker -> sync 503
  check('sync 503 when no worker', (await api('/jobs/sync', { method: 'POST', body: { script: '1+1' } })).status === 503);

  // 4. connect a browser that evaluates the script and echoes requestId
  // Mirror the client's evaluator: expression mode with await, body fallback.
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const compile = (s) => {
    try { return new AsyncFunction('return (' + s + '\n);'); }
    catch { return new AsyncFunction(s); }
  };
  fakeBrowser(async (msg, reply) => {
    const logs = [{ level: 'log', message: 'ran: ' + msg.script }];
    let success = true, result = null, resultType = null, error = null, stack = null;
    try { const v = await compile(msg.script)(); result = v; resultType = typeof v; }
    catch (e) { success = false; error = e.message; stack = e.stack; }
    reply({ type: 'script_result', requestId: msg.requestId, success, result, resultType, error, stack, logs });
  });
  await sleep(400);

  const w = (await api('/workers')).json.workers.find((x) => x.connectionId === 'tester');
  check('worker listed', !!w);
  check('worker ip captured', !!w && !!w.ip);
  check('worker host captured from connection_established', !!w && w.host === 'dw.example' && w.path === '/cart');

  // 5. sync round-trip
  const sync = await api('/jobs/sync', { method: 'POST', body: { script: '40 + 2' } });
  check('sync returns done', sync.status === 200 && sync.json.status === 'done');
  check('sync result structured', sync.json.result === 42 && sync.json.resultType === 'number');
  check('sync logs passed through', Array.isArray(sync.json.logs) && sync.json.logs.length === 1);

  // 6. async submit + poll
  const submit = await api('/jobs', { method: 'POST', body: { script: '7 * 6' } });
  check('async accepted', submit.status === 202 && !!submit.json.jobId);
  await sleep(300);
  const polled = await api(`/jobs/${submit.json.jobId}`);
  check('async result correct', polled.json.status === 'done' && polled.json.result === 42);

  // 7. error path carries message + stack
  const bad = await api('/jobs/sync', { method: 'POST', body: { script: 'nope.bork()' } });
  check('error job reports failed', bad.json.status === 'failed' && !!bad.json.error && !!bad.json.stack);

  // 8. top-level await resolves (and the broker waits for the delayed result)
  const asyncJob = await api('/jobs/sync', { method: 'POST', body: { script: 'await new Promise(r => setTimeout(() => r(99), 50))' } });
  check('async/await job resolves', asyncJob.json.status === 'done' && asyncJob.json.result === 99);

  // 9. multi-statement script with explicit return (body-mode fallback)
  const multi = await api('/jobs/sync', { method: 'POST', body: { script: 'const a = 20;\nreturn a + 22;' } });
  check('multi-statement with return', multi.json.result === 42);
} finally {
  proc.kill();
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
