# Cilq

An agent-driven JavaScript job broker. **Clients** (typically an AI agent, but any
HTTP caller works) submit JS over HTTP; connected **browsers** running
`browser-bridge-client.js` execute it with `eval` and the result is routed back —
the real value with its type, captured console logs, and a stack trace on failure.

```
client ──HTTP──▶ broker ──WebSocket──▶ browser (eval) ──result──▶ broker ──▶ client
```

The broker is a single Node.js process with **zero npm dependencies** — the
WebSocket server is implemented directly against Node's `http` upgrade.

## Quick start

```bash
cd broker
BRIDGE_TOKEN=BRIDGE node server.js          # broker on 127.0.0.1:3141
```

Open `test.html` in a browser (it points the client at `ws://localhost:3141/ws`
with token `BRIDGE`) so there's a worker connected, then dispatch a job:

```bash
curl -s -XPOST http://localhost:3141/jobs/sync \
  -H "Authorization: Bearer BRIDGE" -H 'Content-Type: application/json' \
  -d '{"script":"document.title"}'
```

An agent landing on the broker cold can fetch `GET /` for a self-describing
manifest, or `GET /readme` for the full docs.

## Repository layout

```
Cilq/
├── broker/                     # the broker (Node.js, zero deps)
│   ├── server.js               #   HTTP + job lifecycle
│   ├── websocket.js            #   hand-rolled WebSocket server
│   ├── test.mjs                #   end-to-end test (fakes a browser worker)
│   ├── check-workers.sh        #   list connected workers by site
│   ├── deploy/                 #   Apache reverse-proxy + systemd unit + auto-inject
│   └── README.md               #   ← full API reference and deployment docs
├── browser-bridge-client.js    # the worker script loaded into browser pages
├── test.html                   # local worker test page
└── legacy/                     # the original C# bridge server + Chrome extension
```

**See [`broker/README.md`](broker/README.md) for the full HTTP API, the cooperative
`window.bridge` page contract, the `/status` dashboard, and deployment.**

## Browser side

Pages connect to the broker by loading `browser-bridge-client.js`, configured via
`window.__BRIDGE_URL` / `window.__BRIDGE_TOKEN` before it loads. It can be injected
into every page automatically via Apache `mod_substitute` (the broker serves the
script at `/client.js`) — see `broker/deploy/apache-inject.conf`.

## Legacy

This project began as the **Claude Browser Bridge**: a C#/ASP.NET Core bridge
server paired with a Chrome/Edge extension for real-time browser debugging. That
implementation now lives in [`legacy/`](legacy/) and is no longer maintained,
along with `SETUP.md`, `start.txt`, and `apache-conf.txt`, which describe that
older design. The current broker supersedes all of it.

## License

Private project. See [LICENSE](LICENSE).
