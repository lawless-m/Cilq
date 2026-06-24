// Minimal RFC 6455 WebSocket server — zero dependencies, text frames only.
// Enough for the bridge: handshake, masked client frames, ping/pong, close.
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE = 1_000_000; // refuse anything larger, per frame and per assembled message

// Attach a WS endpoint to an existing http.Server. onConnection(conn, req) fires
// after a successful handshake; conn is an EventEmitter with send()/close() and
// 'message' (string), 'close', 'error' events.
export function attachWebSocketServer(server, path, onConnection) {
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname !== path) { socket.destroy(); return; }

    const key = req.headers['sec-websocket-key'];
    if (!key || (req.headers['upgrade'] || '').toLowerCase() !== 'websocket') {
      socket.destroy();
      return;
    }

    const accept = createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );

    const conn = new WsConnection(socket);
    onConnection(conn, req);
    if (head && head.length) conn._ingest(head);
  });
}

class WsConnection extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.fragOpcode = 0;     // opcode of an in-progress fragmented message
    this.fragments = [];     // accumulated payloads for that message
    this.closed = false;

    socket.on('data', (chunk) => this._ingest(chunk));
    socket.on('close', () => this._shutdown());
    socket.on('error', (e) => { this.emit('error', e); this._shutdown(); });
    // A reverse proxy (Apache wstunnel) half-closes by sending FIN: the socket
    // ends but 'close' never fires, leaving it in CLOSE-WAIT and the worker
    // registered forever. Destroy on 'end' so the FD is freed and cleanup runs.
    socket.on('end', () => socket.destroy());
  }

  _ingest(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    try { this._parse(); }
    catch (e) { this.emit('error', e); this.close(1002, 'protocol error'); }
  }

  _parse() {
    while (true) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0];
      const b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let offset = 2;

      if (len === 126) {
        if (this.buf.length < offset + 2) return;
        len = this.buf.readUInt16BE(offset);
        offset += 2;
      } else if (len === 127) {
        if (this.buf.length < offset + 8) return;
        const hi = this.buf.readUInt32BE(offset);
        const lo = this.buf.readUInt32BE(offset + 4);
        len = hi * 2 ** 32 + lo;
        offset += 8;
      }
      if (len > MAX_MESSAGE) throw new Error('frame too large');

      let maskKey;
      if (masked) {
        if (this.buf.length < offset + 4) return;
        maskKey = this.buf.subarray(offset, offset + 4);
        offset += 4;
      }

      if (this.buf.length < offset + len) return; // wait for the rest of the payload

      const payload = Buffer.from(this.buf.subarray(offset, offset + len));
      if (masked) {
        for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i & 3];
      }
      this.buf = this.buf.subarray(offset + len);
      this._frame(fin, opcode, payload);
    }
  }

  _frame(fin, opcode, payload) {
    switch (opcode) {
      case 0x8: // close
        this.close(1000);
        return;
      case 0x9: // ping -> pong
        this._writeFrame(0xA, payload);
        return;
      case 0xA: // pong
        return;
      case 0x1: // text (start)
      case 0x2: // binary (start) — treated as text bytes
        this.fragOpcode = opcode;
        this.fragments = [payload];
        break;
      case 0x0: // continuation
        this.fragments.push(payload);
        break;
      default:
        throw new Error('unknown opcode ' + opcode);
    }

    if (!fin) {
      const total = this.fragments.reduce((n, p) => n + p.length, 0);
      if (total > MAX_MESSAGE) throw new Error('message too large');
      return;
    }
    const message = Buffer.concat(this.fragments);
    this.fragments = [];
    this.emit('message', message.toString('utf8'));
  }

  // Build and write a server frame (FIN set, unmasked).
  _writeFrame(opcode, payload) {
    if (this.closed) return;
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.from([0x80 | opcode, len]);
    } else if (len < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x80 | opcode;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x80 | opcode;
      header[1] = 127;
      header.writeUInt32BE(Math.floor(len / 2 ** 32), 2);
      header.writeUInt32BE(len >>> 0, 6);
    }
    this.socket.write(Buffer.concat([header, payload]));
  }

  send(str) {
    this._writeFrame(0x1, Buffer.from(str, 'utf8'));
  }

  close(code = 1000, reason = '') {
    if (this.closed) return;
    const r = Buffer.from(reason, 'utf8');
    const payload = Buffer.alloc(2 + r.length);
    payload.writeUInt16BE(code, 0);
    r.copy(payload, 2);
    this._writeFrame(0x8, payload);
    this._shutdown();
  }

  _shutdown() {
    if (this.closed) return;
    this.closed = true;
    this.socket.end();
    this.emit('close');
  }
}
