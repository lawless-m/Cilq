# Browser Bridge Broker

A message broker for JavaScript jobs. **Clients** submit JS over HTTP; connected
**browsers** (running `browser-bridge-client.js`) execute it with `eval` and the
result is routed back. Zero npm dependencies — the WebSocket server is implemented
directly against Node's `http` upgrade (`websocket.js`).

```
client ──HTTP──▶ broker ──WebSocket──▶ browser (eval) ──result──▶ broker ──▶ client
```

## Run

```bash
BRIDGE_TOKEN=BRIDGE node server.js
```

| Env var                  | Default      | Meaning                                            |
|--------------------------|--------------|----------------------------------------------------|
| `BRIDGE_HOST`            | `127.0.0.1`  | Listen address (loopback; Apache fronts it)        |
| `BRIDGE_PORT`            | `3141`       | Listen port                                        |
| `BRIDGE_TOKEN`           | *(empty)*    | Shared secret; empty disables auth (dev only)      |
| `BRIDGE_SYNC_TIMEOUT_MS` | `10000`      | How long `/jobs/sync` waits for a browser result   |
| `BRIDGE_JOB_TTL_MS`      | `300000`     | How long finished jobs are retained for polling    |
| `BRIDGE_PUBLIC_URL`      | *(empty)*    | Public base (e.g. `https://.../bridge`) for absolute examples in `GET /` |

## HTTP API

Auth: send `Authorization: Bearer <BRIDGE_TOKEN>` on every call except the
unauthenticated ones (`/`, `/readme`, `/health`, `/client.js`, `/status`).

| Method | Path           | Body                          | Behaviour                                                            |
|--------|----------------|-------------------------------|---------------------------------------------------------------------|
| GET    | `/`            | —                             | Self-describing manifest (what/auth/endpoints/quickstart). Unauthenticated discovery for agents. |
| GET    | `/readme`      | —                             | This README as Markdown (unauthenticated) — full docs for an agent that wants more than the manifest. |
| POST   | `/jobs/sync`   | `{script, target?, timeout?}` | Dispatch and block until the result arrives. `503` if no browser, `408` on timeout. |
| POST   | `/jobs`        | `{script, target?}`           | Enqueue and return `{jobId}`. Runs now, or when a browser connects.  |
| GET    | `/jobs/:id`    | —                             | Job status + result (`pending`/`dispatched`/`done`/`failed`/`expired`). |
| GET    | `/workers`     | —                             | Connected browsers with identity: `connectionId`, `ip`, `url`, `host`, `path`, `title`. |
| GET    | `/health`      | —                             | `{status, workers, jobs}` (unauthenticated).                        |
| GET    | `/status`      | —                             | HTML dashboard (unauthenticated shell). Live view of connected browsers grouped by host; you paste the token in-page and it polls `/health` + `/workers`. |

`target` is a specific connection ID; omit it to run on any one connected browser.

### Status dashboard

`GET /status` serves a self-contained HTML page (e.g.
`https://dw.ramsden-international.com/bridge/status`). The shell holds no secret;
paste the token in-page (kept in `sessionStorage`, sent only as a `Bearer` header
to `/workers`) and it polls every 2s, showing broker health, worker/job counts,
and connected browsers grouped by host — a quick way to confirm each injection
point is live. For a CLI equivalent, see `check-workers.sh`.

```bash
curl -s -XPOST https://dw.ramsden-international.com/bridge/jobs/sync \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"script":"document.title"}'
```

### Structured result

Jobs return more than a value — the agent gets the value *with its type*, anything
the script logged, and on failure the error *with a stack*:

```json
{
  "jobId": "...", "status": "done",
  "result": "Your Basket",          // the actual value, JSON-typed (not stringified)
  "resultType": "string",           // string|number|boolean|object|array|element|...
  "logs": [{"level":"log","message":"..."}],  // console output captured during eval
  "error": null, "stack": null,
  "workerConnectionId": "...", "createdAt": 1750..., "completedAt": 1750...
}
```

`result` is the real JSON value where serializable; DOM elements become `outerHTML`
(`resultType: "element"`). On `status: "failed"`, `error` and `stack` are populated instead.

### Script form

A job's `script` is either a **JS expression** or **statements ending in `return`**, and
**top-level `await` works**:

```js
document.title                         // expression
(await fetch('/api/cart')).json()      // async expression
const r = await fetch('/api/cart'); return (await r.json()).total;   // statements + return
```

Long-running async jobs may exceed the default `/jobs/sync` timeout (10s) — pass
`timeout` in the body, or use the queued `POST /jobs` + poll path.

### Cooperative pages: the `bridge` helper

Raw eval works on any page, but selectors break when a page is restyled. Pages can
opt into a stable contract instead. The client exposes `window.bridge` to your
scripts; a page declares addressable elements with `data-bridge-node` and/or
registers named actions:

```html
<span data-bridge-node="cart-total">£0.00</span>
<script>
  bridge.register('checkout', () => document.querySelector('#pay').click());
</script>
```

An agent then discovers and drives the page by stable name, not selector:

```js
bridge.nodes()                    // [{node:'cart-total', tag:'span', text:'£42.00', value:undefined}, ...]
bridge.node('cart-total').textContent   // "£42.00"
bridge.actions()                  // ['checkout']
bridge.action('checkout')         // invokes the registered handler
```

| Call | Returns |
|------|---------|
| `bridge.nodes()` | enumerate declared nodes `[{node,tag,text,value}]` — the page's contract |
| `bridge.node(name)` | element tagged `data-bridge-node="name"` (or `null`) |
| `bridge.all(name)` | all elements tagged `data-bridge-node="name"` |
| `bridge.actions()` | registered action names |
| `bridge.action(name, ...args)` | invoke a registered action (may return a Promise — `await` it) |
| `bridge.register(name, fn)` | page-side: register a named action |

Cooperation is opt-in and incremental — tag nodes only where an agent workflow needs
them; un-tagged pages still work via plain DOM. This contract is also advertised in
`GET /` under `pageHelper`.

## Browser side

Load `../browser-bridge-client.js` on your pages. Configure before it loads:

```html
<script>
  window.__BRIDGE_URL   = 'wss://dw.ramsden-international.com/bridge/ws';
  window.__BRIDGE_TOKEN = 'BRIDGE';
</script>
<script src="/browser-bridge-client.js"></script>
```

The client `eval`s incoming scripts, so the page's CSP must not block eval (don't
set a restrictive `script-src` on pages that load the client).

### Auto-inject via Apache (no per-page edits)

The broker serves its own worker script at `/bridge/client.js`, so `mod_substitute`
can inject it into every HTML page Apache serves or proxies:

```apache
AddOutputFilterByType SUBSTITUTE text/html
Substitute "s|</head>|<script src=\"https://dw.ramsden-international.com/bridge/client.js\"></script></head>|in"
```

See `deploy/apache-inject.conf` for the directly-served and proxied variants plus
gotchas (gzip must be off for proxied content, line-length limits). This is the
same `Substitute` trick as the old `apache-conf.txt`, now pointed at the broker.

## Deploy

- `deploy/apache-bridge.conf` — reverse-proxy config, **including the WebSocket
  upgrade rule** (`a2enmod proxy proxy_http proxy_wstunnel`).
- `deploy/browser-bridge-broker.service` — systemd unit.

## Test

```bash
node test.mjs   # spins up the broker, fakes a browser worker, checks every path
```
