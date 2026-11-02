#!/usr/bin/env node
// Zero-dependency HTTP static + real-time WebSocket / SSE multiplayer server
// for Gothic Nocturne. Serves ES modules, pixel-art assets, byte-range audio,
// and synchronizes hunters across all 13 regions of the interconnected castle.

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || '8711', 10);
const HOST = process.env.HOST || '0.0.0.0';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_WS_FRAME = 64 * 1024;
const MAX_POST_BODY = 64 * 1024;
const TICK_MS = 50;            // 20 Hz room state broadcast
const KEEPALIVE_MS = 15000;    // 15s WS ping & SSE heartbeat
const STALE_MS = 25000;        // 25s timeout for silent peers

const DEFAULT_CALLSIGNS = [
  'VESPER', 'CORVUS', 'ROWAN', 'SABLE',
  'GARNET', 'ALDER', 'STERLING', 'BRIAR',
  'THORN', 'ASHEN', 'LINDEN', 'ONYX',
];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// --------------------------------------------------------- Multiplayer Rooms

/** @type {Map<string, Map<string, object>>} roomName -> Map<peerId, peer> */
const rooms = new Map();
const startedAt = Date.now();

function sanitizeRoom(raw) {
  const clean = String(raw || 'castle').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return (clean || 'castle').slice(0, 24);
}

function sanitizeName(raw, fallbackSlot = 0) {
  const clean = String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9 _.-]/g, '')
    .trim()
    .slice(0, 12);
  return clean || DEFAULT_CALLSIGNS[fallbackSlot % DEFAULT_CALLSIGNS.length];
}

function sanitizeState(s, prev = null) {
  if (!s || typeof s !== 'object') return prev || defaultPeerState();
  const num = (v, def) => (typeof v === 'number' && Number.isFinite(v) ? v : def);
  return {
    stageKey: typeof s.stageKey === 'string' ? s.stageKey.slice(0, 20) : 'graveyard',
    x: Math.round(num(s.x, 96) * 10) / 10,
    y: Math.round(num(s.y, 320) * 10) / 10,
    vx: Math.round(num(s.vx, 0) * 10) / 10,
    vy: Math.round(num(s.vy, 0) * 10) / 10,
    normX: Math.max(0, Math.min(1, num(s.normX, 0))),
    inSecret: !!s.inSecret,
    anim: typeof s.anim === 'string' ? s.anim.slice(0, 12) : 'idle',
    facing: s.facing === -1 ? -1 : 1,
    walkFrame: Math.max(0, Math.min(7, num(s.walkFrame, 0) | 0)),
    attackT: Math.round(num(s.attackT, -1) * 1000) / 1000,
    attackCrouch: !!s.attackCrouch,
    throwing: !!s.throwing,
    whipReach: Math.max(32, Math.min(140, Math.round(num(s.whipReach, 68)))),
    wId: typeof s.wId === 'string' ? s.wId.slice(0, 28) : null,
    wT: Math.round(num(s.wT, -1) * 1000) / 1000,
    wDur: Math.max(0.05, Math.min(2.0, Math.round(num(s.wDur, 0.3) * 1000) / 1000)),
    wCr: !!s.wCr,
    wGd: !!s.wGd,
    subWeapon: typeof s.subWeapon === 'string' ? s.subWeapon.slice(0, 16) : null,
    petrified: Math.max(0, Math.round(num(s.petrified, 0) * 100) / 100),
    invuln: Math.max(0, Math.round(num(s.invuln, 0) * 100) / 100),
    hp: Math.max(0, Math.min(128, num(s.hp, 16) | 0)),
    maxHp: Math.max(1, Math.min(128, num(s.maxHp, 16) | 0)),
    level: Math.max(1, Math.min(99, num(s.level, 1) | 0)),
    relicsMask: num(s.relicsMask, 0) | 0,
    screen: typeof s.screen === 'string' ? s.screen.slice(0, 16) : 'title',
  };
}

function defaultPeerState() {
  return {
    stageKey: 'graveyard',
    x: 96,
    y: 320,
    vx: 0,
    vy: 0,
    normX: 0.02,
    inSecret: false,
    anim: 'idle',
    facing: 1,
    walkFrame: 0,
    attackT: -1,
    attackCrouch: false,
    throwing: false,
    whipReach: 68,
    subWeapon: null,
    petrified: 0,
    invuln: 0,
    hp: 16,
    maxHp: 16,
    level: 1,
    relicsMask: 0,
    screen: 'title',
  };
}

function getOrCreateRoom(roomName) {
  let r = rooms.get(roomName);
  if (!r) {
    r = new Map();
    rooms.set(roomName, r);
  }
  return r;
}

function allocateSlot(roomMap) {
  const used = new Set();
  for (const p of roomMap.values()) used.add(p.slot);
  for (let i = 0; i < 64; i++) {
    if (!used.has(i)) return i;
  }
  return roomMap.size % 64;
}

function serializePeer(p) {
  return {
    id: p.id,
    slot: p.slot,
    name: p.name,
    s: p.state,
  };
}

function sendToPeer(peer, msgObj) {
  const json = typeof msgObj === 'string' ? msgObj : JSON.stringify(msgObj);
  if (peer.ws && !peer.ws.destroyed && peer.ws.writable) {
    if (peer.ws.writableLength < 256 * 1024) {
      wsSendText(peer.ws, json);
    }
  }
  if (peer.sse && !peer.sse.writableEnded) {
    peer.sse.write(`data: ${json}\n\n`);
  }
}

function broadcastRoom(roomName, msgObj, { excludeId = null, onlyStageKey = null } = {}) {
  const roomMap = rooms.get(roomName);
  if (!roomMap || roomMap.size === 0) return;
  const json = JSON.stringify(msgObj);
  for (const p of roomMap.values()) {
    if (excludeId && p.id === excludeId) continue;
    if (onlyStageKey && (!p.state || p.state.stageKey !== onlyStageKey)) continue;
    sendToPeer(p, json);
  }
}

function registerPeer({ id, roomName, name, state, ws = null, sse = null }) {
  const rName = sanitizeRoom(roomName);
  const roomMap = getOrCreateRoom(rName);
  let peer = id ? roomMap.get(id) : null;
  const now = Date.now();

  if (peer) {
    if (ws) {
      if (peer.ws && peer.ws !== ws && !peer.ws.destroyed) peer.ws.destroy();
      peer.ws = ws;
    }
    if (sse) {
      if (peer.sse && peer.sse !== sse && !peer.sse.writableEnded) peer.sse.end();
      peer.sse = sse;
    }
    if (name) peer.name = sanitizeName(name, peer.slot);
    if (state) peer.state = sanitizeState(state, peer.state);
    peer.lastSeen = now;
    peer.dirty = true;
  } else {
    const peerId = id && /^p_[a-z0-9]{6,20}$/.test(id)
      ? id
      : 'p_' + crypto.randomBytes(5).toString('hex');
    const slot = allocateSlot(roomMap);
    peer = {
      id: peerId,
      room: rName,
      slot,
      name: sanitizeName(name, slot),
      state: sanitizeState(state, null),
      ws,
      sse,
      lastSeen: now,
      dirty: true,
    };
    roomMap.set(peer.id, peer);
    broadcastRoom(rName, { t: 'peer_join', peer: serializePeer(peer) }, { excludeId: peer.id });
  }

  const others = [];
  for (const other of roomMap.values()) {
    if (other.id !== peer.id) others.push(serializePeer(other));
  }
  sendToPeer(peer, {
    t: 'welcome',
    id: peer.id,
    slot: peer.slot,
    name: peer.name,
    room: rName,
    peers: others,
  });
  return peer;
}

function removePeer(peer) {
  if (!peer) return;
  const roomMap = rooms.get(peer.room);
  if (!roomMap) return;
  const cur = roomMap.get(peer.id);
  if (cur !== peer) return;
  // Only remove if neither transport remains open
  const wsAlive = peer.ws && !peer.ws.destroyed && peer.ws.writable;
  const sseAlive = peer.sse && !peer.sse.writableEnded;
  if (wsAlive || sseAlive) return;
  roomMap.delete(peer.id);
  if (roomMap.size === 0) {
    rooms.delete(peer.room);
  } else {
    broadcastRoom(peer.room, { t: 'peer_leave', id: peer.id, name: peer.name });
  }
}

function handleClientMessage(peer, msg) {
  if (!peer || !msg || typeof msg !== 'object') return;
  peer.lastSeen = Date.now();

  switch (msg.t) {
    case 'state': {
      const prevStage = peer.state ? peer.state.stageKey : null;
      const prevScreen = peer.state ? peer.state.screen : null;
      peer.state = sanitizeState(msg.s, peer.state);
      peer.dirty = true;
      if (
        peer.state.screen === 'play'
        && (prevStage !== peer.state.stageKey || prevScreen === 'title')
      ) {
        broadcastRoom(peer.room, {
          t: 'event',
          from: peer.id,
          slot: peer.slot,
          name: peer.name,
          kind: 'stage_enter',
          data: { stageKey: peer.state.stageKey },
        }, { excludeId: peer.id });
      }
      break;
    }
    case 'rename': {
      const next = sanitizeName(msg.name, peer.slot);
      if (next !== peer.name) {
        peer.name = next;
        peer.dirty = true;
        sendToPeer(peer, { t: 'peer_rename', id: peer.id, name: peer.name });
        broadcastRoom(peer.room, { t: 'peer_rename', id: peer.id, name: peer.name }, { excludeId: peer.id });
      }
      break;
    }
    case 'event': {
      const kind = typeof msg.kind === 'string' ? msg.kind.slice(0, 20) : '';
      if (!kind) break;
      const stageScoped = kind === 'whip' || kind === 'projectile' || kind === 'hit' || kind === 'salute';
      broadcastRoom(
        peer.room,
        {
          t: 'event',
          from: peer.id,
          slot: peer.slot,
          name: peer.name,
          kind,
          data: msg.data && typeof msg.data === 'object' ? msg.data : {},
        },
        {
          excludeId: peer.id,
          onlyStageKey: stageScoped && peer.state ? peer.state.stageKey : null,
        },
      );
      break;
    }
    case 'ping': {
      sendToPeer(peer, { t: 'pong', ts: msg.ts || Date.now() });
      break;
    }
    default:
      break;
  }
}

// 20 Hz broadcast tick: streams active peer snapshots across each room
let tickCounter = 0;
setInterval(() => {
  tickCounter++;
  const fullSync = tickCounter % 20 === 0; // Full snapshot every 1.0s even if idle
  for (const [, roomMap] of rooms) {
    if (roomMap.size < 2) {
      for (const p of roomMap.values()) p.dirty = false;
      continue;
    }
    let anyDirty = fullSync;
    if (!anyDirty) {
      for (const p of roomMap.values()) {
        if (p.dirty) { anyDirty = true; break; }
      }
    }
    if (!anyDirty) continue;

    const all = [];
    for (const p of roomMap.values()) {
      all.push(serializePeer(p));
      p.dirty = false;
    }
    for (const recipient of roomMap.values()) {
      const peers = all.filter((item) => item.id !== recipient.id);
      sendToPeer(recipient, { t: 'world_tick', peers });
    }
  }
}, TICK_MS).unref();

// Keepalive & stale-session cleanup
setInterval(() => {
  const now = Date.now();
  for (const [, roomMap] of rooms) {
    for (const peer of [...roomMap.values()]) {
      if (now - peer.lastSeen > STALE_MS) {
        if (peer.ws && !peer.ws.destroyed) peer.ws.destroy();
        if (peer.sse && !peer.sse.writableEnded) peer.sse.end();
        peer.ws = null;
        peer.sse = null;
        removePeer(peer);
        continue;
      }
      if (peer.ws && !peer.ws.destroyed && peer.ws.writable) {
        wsSendFrame(peer.ws, 0x9, Buffer.alloc(0)); // WS Ping
      }
      if (peer.sse && !peer.sse.writableEnded) {
        peer.sse.write(': keepalive\n\n');
      }
    }
  }
}, KEEPALIVE_MS).unref();

// --------------------------------------------------------- RFC 6455 WebSocket

function wsSendFrame(socket, opcode, payloadBuf) {
  const len = payloadBuf.length;
  let header;
  if (len < 126) {
    header = Buffer.allocUnsafe(2);
    header[0] = 0x80 | opcode;
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  try {
    socket.write(Buffer.concat([header, payloadBuf]));
  } catch {
    socket.destroy();
  }
}

function wsSendText(socket, str) {
  wsSendFrame(socket, 0x1, Buffer.from(str, 'utf8'));
}

function handleWsUpgrade(req, socket) {
  const key = req.headers['sec-websocket-key'];
  if (!key || typeof key !== 'string') {
    socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
    socket.destroy();
    return;
  }
  const accept = crypto.createHash('sha1').update(key.trim() + WS_GUID).digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`,
  );
  socket.setNoDelay(true);

  const url = new URL(req.url || '/ws', 'http://localhost');
  let peer = null;
  let buf = Buffer.alloc(0);

  // Auto-register if room query param provided, or wait for `hello` frame
  if (url.searchParams.has('auto')) {
    peer = registerPeer({
      id: url.searchParams.get('id'),
      roomName: url.searchParams.get('room') || 'castle',
      name: url.searchParams.get('name') || '',
      state: null,
      ws: socket,
    });
  }

  socket.on('data', (chunk) => {
    buf = buf.length === 0 ? chunk : Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const b0 = buf[0];
      const b1 = buf[1];
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let payloadLen = b1 & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (buf.length < 4) return;
        payloadLen = buf.readUInt16BE(2);
        offset = 4;
      } else if (payloadLen === 127) {
        if (buf.length < 10) return;
        const bigLen = buf.readBigUInt64BE(2);
        if (bigLen > BigInt(MAX_WS_FRAME)) {
          socket.destroy();
          return;
        }
        payloadLen = Number(bigLen);
        offset = 10;
      }

      if (payloadLen > MAX_WS_FRAME) {
        socket.destroy();
        return;
      }

      const maskBytes = masked ? 4 : 0;
      const frameLen = offset + maskBytes + payloadLen;
      if (buf.length < frameLen) return;

      const payload = Buffer.from(buf.subarray(offset + maskBytes, frameLen));
      if (masked) {
        const maskOffset = offset;
        for (let i = 0; i < payloadLen; i++) {
          payload[i] ^= buf[maskOffset + (i & 3)];
        }
      }
      buf = buf.subarray(frameLen);

      if (opcode === 0x8) { // Close
        wsSendFrame(socket, 0x8, Buffer.alloc(0));
        socket.end();
        return;
      }
      if (opcode === 0x9) { // Ping -> Pong
        if (peer) peer.lastSeen = Date.now();
        wsSendFrame(socket, 0x0a, payload);
        continue;
      }
      if (opcode === 0x0a) { // Pong
        if (peer) peer.lastSeen = Date.now();
        continue;
      }
      if (opcode === 0x1) { // UTF-8 Text JSON
        let msg;
        try {
          msg = JSON.parse(payload.toString('utf8'));
        } catch {
          continue;
        }
        if (msg.t === 'hello') {
          if (peer && peer.room !== sanitizeRoom(msg.room)) {
            peer.ws = null;
            removePeer(peer);
            peer = null;
          }
          peer = registerPeer({
            id: msg.id || (peer && peer.id),
            roomName: msg.room || 'castle',
            name: msg.name,
            state: msg.state,
            ws: socket,
          });
        } else if (peer) {
          handleClientMessage(peer, msg);
        }
      }
    }
  });

  const cleanup = () => {
    if (peer && peer.ws === socket) {
      peer.ws = null;
      removePeer(peer);
      peer = null;
    }
  };
  socket.on('close', cleanup);
  socket.on('end', cleanup);
  socket.on('error', () => {
    socket.destroy();
    cleanup();
  });
}

// --------------------------------------------------------- HTTP Routes & Static Files

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function handleApi(req, res, url) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === '/api/net/status' && req.method === 'GET') {
    const outRooms = {};
    let totalPlayers = 0;
    for (const [rName, rMap] of rooms) {
      totalPlayers += rMap.size;
      outRooms[rName] = {
        count: rMap.size,
        players: [...rMap.values()].map((p) => ({
          id: p.id,
          slot: p.slot,
          name: p.name,
          stageKey: p.state?.stageKey,
          screen: p.state?.screen,
          x: p.state?.x,
          y: p.state?.y,
        })),
      };
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, uptimeSec: Math.round((Date.now() - startedAt) / 1000), totalPlayers, rooms: outRooms }));
    return;
  }

  if (url.pathname === '/api/net/stream' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(': connected\n\n');
    const peer = registerPeer({
      id: url.searchParams.get('id'),
      roomName: url.searchParams.get('room') || 'castle',
      name: url.searchParams.get('name') || '',
      state: null,
      sse: res,
    });
    const cleanup = () => {
      if (peer.sse === res) {
        peer.sse = null;
        removePeer(peer);
      }
    };
    req.on('close', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);
    return;
  }

  if (url.pathname === '/api/net/send' && req.method === 'POST') {
    let body = '';
    let aborted = false;
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_POST_BODY) {
        aborted = true;
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end('{"ok":false,"error":"payload_too_large"}');
        req.destroy();
      }
    });
    req.on('end', () => {
      if (aborted) return;
      let payload;
      try {
        payload = JSON.parse(body);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end('{"ok":false,"error":"invalid_json"}');
        return;
      }
      const rName = sanitizeRoom(payload.room || 'castle');
      const roomMap = rooms.get(rName);
      const peer = roomMap ? roomMap.get(payload.id) : null;
      if (peer && payload.msg) {
        handleClientMessage(peer, payload.msg);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end('{"ok":true}');
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end('{"ok":false,"error":"unknown_peer"}');
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end('{"ok":false,"error":"not_found"}');
}

function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method Not Allowed');
    return;
  }

  let relPath;
  try {
    relPath = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }
  if (relPath === '/') relPath = '/index.html';

  // Block hidden dotfiles (.env, .git, .venv, etc.) and parent traversal
  const parts = relPath.split('/').filter(Boolean);
  if (parts.some((seg) => seg === '..' || seg.startsWith('.'))) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  const absPath = path.resolve(__dirname, ...parts);
  if (!absPath.startsWith(__dirname + path.sep) && absPath !== path.join(__dirname, 'index.html')) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(absPath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(absPath).toLowerCase();
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    const isCode = ext === '.html' || ext === '.js' || ext === '.mjs' || ext === '.css' || ext === '.json';
    const cacheHeader = isCode ? 'no-cache' : 'public, max-age=3600';
    const range = req.headers.range;

    if (range && range.startsWith('bytes=')) {
      const [startStr, endStr] = range.slice(6).split('-');
      let start = startStr ? parseInt(startStr, 10) : 0;
      let end = endStr ? parseInt(endStr, 10) : stat.size - 1;
      if (Number.isNaN(start)) start = 0;
      if (Number.isNaN(end) || end >= stat.size) end = stat.size - 1;
      if (start < 0 || start > end || start >= stat.size) {
        res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
        res.end();
        return;
      }
      const chunkLen = end - start + 1;
      res.writeHead(206, {
        'Content-Type': mime,
        'Content-Length': chunkLen,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': cacheHeader,
      });
      if (req.method === 'HEAD') { res.end(); return; }
      const stream = fs.createReadStream(absPath, { start, end });
      stream.on('error', () => res.destroy());
      stream.pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Type': mime,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': cacheHeader,
    });
    if (req.method === 'HEAD') { res.end(); return; }
    const stream = fs.createReadStream(absPath);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });
}

// ------------------------------------------------------------- Castle Forge
// Player-proposed wings are forged by tools/forge_server.py (Python: Gemini,
// Gempix, Lyria 3, Daikon + the asset pipeline). Proxy its API so the game,
// multiplayer and forge share one origin; when it is not running the client
// falls back to its local procedural forge.
const FORGE_PORT = parseInt(process.env.FORGE_PORT || '8712', 10);
const FORGE_HOST = process.env.FORGE_HOST || '127.0.0.1';

function proxyForge(req, res) {
  const upstream = http.request(
    { host: FORGE_HOST, port: FORGE_PORT, method: req.method, path: req.url, headers: { ...req.headers, host: `${FORGE_HOST}:${FORGE_PORT}` } },
    (up) => {
      res.writeHead(up.statusCode || 502, { ...up.headers, 'Cache-Control': 'no-store' });
      up.pipe(res);
    },
  );
  upstream.setTimeout(30000, () => upstream.destroy(new Error('forge timeout')));
  upstream.on('error', () => {
    if (!res.headersSent) res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: false, error: 'THE FORGE IS NOT RUNNING (tools/forge_server.py)' }));
  });
  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname.startsWith('/api/net/')) {
    handleApi(req, res, url);
    return;
  }
  if (url.pathname.startsWith('/api/forge')) {
    proxyForge(req, res);
    return;
  }
  serveStatic(req, res, url);
});

server.on('upgrade', (req, socket) => {
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname === '/ws' || url.pathname.endsWith('/ws')) {
    handleWsUpgrade(req, socket);
  } else {
    socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
    socket.destroy();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Gothic Nocturne Multiplayer Server listening on http://${HOST}:${PORT}/ (WS /ws + SSE /api/net/stream, Castle Forge proxied from :${FORGE_PORT})`);
});
