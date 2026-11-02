// Real-time multiplayer network client for Gothic Nocturne.
// Connects over WebSocket (/ws) with automatic SSE (/api/net/stream) fallback,
// synchronizes hunters across all 13 castle regions at 20 Hz, and interpolates
// remote hunter motion & animations smoothly at 60 fps.

import { PLAYER } from './constants.js';
import { walkAdvance, FIDGET_AFTER } from '../game/hero_anim.js';

function randomPeerId() {
  const bytes = new Uint8Array(5);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return 'p_' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function safeSessionId() {
  if (typeof window === 'undefined') return randomPeerId();
  try {
    let id = window.sessionStorage.getItem('gothic.netId');
    if (!id || !/^p_[a-z0-9]{6,20}$/.test(id)) {
      id = randomPeerId();
      window.sessionStorage.setItem('gothic.netId', id);
    }
    return id;
  } catch {
    return randomPeerId();
  }
}

function safeLocalGet(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function safeLocalSet(key, val) {
  try { window.localStorage.setItem(key, val); } catch { /* private mode */ }
}

export class NetClient {
  constructor(params = new URLSearchParams()) {
    this.enabled = typeof window !== 'undefined'
      && window.location
      && /^https?:$/i.test(window.location.protocol)
      && !params.has('offline');

    this.id = safeSessionId();
    this.room = (params.get('room') || 'castle').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24) || 'castle';
    const urlName = (params.get('name') || '').trim();
    const savedName = safeLocalGet('gothic.hunterName') || '';
    this.requestedName = (urlName || savedName).toUpperCase().replace(/[^A-Z0-9 _.-]/g, '').trim().slice(0, 12);
    if (urlName && this.requestedName) safeLocalSet('gothic.hunterName', this.requestedName);

    this.name = this.requestedName || 'HUNTER';
    this.slot = 0;
    this.connected = false;
    this.transport = 'none';       // 'ws' | 'sse' | 'none'
    this.peers = new Map();        // peerId -> interpolated remote hunter record
    this.feed = [];                // [{ text, color, t, dur }]
    this.onRemoteEvent = null;     // (ev) => void
    this.stageTitleLookup = null;  // (stageKey) => display title

    this._ws = null;
    this._sse = null;
    this._reconnectTimer = 0;
    this._reconnectDelay = 1.2;
    this._sendAcc = 0;
    this._lastSentKey = '';
    this._lastSnapshot = null;
    this._wsFailedCount = 0;

    if (this.enabled) {
      this.connect();
      window.addEventListener('beforeunload', () => this.disconnect());
    }
  }

  /** Total hunters currently in the shared castle room (including local player when connected). */
  get onlineCount() {
    return (this.connected ? 1 : 0) + this.peers.size;
  }

  /** Remote hunters currently in a specific castle stage (excluding title-screen idlers). */
  peersInStage(stageKey) {
    const out = [];
    for (const p of this.peers.values()) {
      if (p.stageKey === stageKey && p.screen !== 'title' && p.screen !== 'difficulty') {
        out.push(p);
      }
    }
    return out;
  }

  /** All active remote hunters anywhere in the castle (for Castle Map & Mini-Map). */
  activePeers() {
    const out = [];
    for (const p of this.peers.values()) {
      if (p.screen !== 'title' && p.screen !== 'difficulty') {
        out.push(p);
      }
    }
    return out;
  }

  pushFeed(text, color = '#9ef5dc', dur = 3.8) {
    if (!text) return;
    this.feed.unshift({ text, color, t: 0, dur });
    if (this.feed.length > 3) this.feed.length = 3;
  }

  setName(rawName) {
    const clean = String(rawName || '')
      .toUpperCase()
      .replace(/[^A-Z0-9 _.-]/g, '')
      .trim()
      .slice(0, 12);
    if (!clean) return;
    this.requestedName = clean;
    this.name = clean;
    safeLocalSet('gothic.hunterName', clean);
    this._sendRaw({ t: 'rename', name: clean });
  }

  connect() {
    if (!this.enabled || this._ws || this._sse) return;
    this._connectWebSocket();
  }

  _connectWebSocket() {
    let wsUrl;
    try {
      const u = new URL('ws', window.location.href);
      u.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      u.searchParams.set('room', this.room);
      u.searchParams.set('id', this.id);
      if (this.requestedName) u.searchParams.set('name', this.requestedName);
      wsUrl = u.toString();
    } catch {
      this._connectSse();
      return;
    }

    let opened = false;
    let ws;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      this._connectSse();
      return;
    }
    this._ws = ws;

    const handshakeTimeout = window.setTimeout(() => {
      if (!opened && this._ws === ws) {
        try { ws.close(); } catch { /* ignore */ }
      }
    }, 3000);

    ws.addEventListener('open', () => {
      window.clearTimeout(handshakeTimeout);
      if (this._ws !== ws) return;
      opened = true;
      this.connected = true;
      this.transport = 'ws';
      this._wsFailedCount = 0;
      this._reconnectDelay = 1.2;
      this._sendRaw({
        t: 'hello',
        id: this.id,
        room: this.room,
        name: this.requestedName,
        state: this._lastSnapshot,
      });
    });

    ws.addEventListener('message', (ev) => {
      if (typeof ev.data !== 'string') return;
      try {
        this._handleServerMessage(JSON.parse(ev.data));
      } catch { /* ignore malformed packet */ }
    });

    const onClose = () => {
      window.clearTimeout(handshakeTimeout);
      if (this._ws !== ws) return;
      this._ws = null;
      this.connected = false;
      this.transport = 'none';
      if (!opened) {
        this._wsFailedCount++;
        if (this._wsFailedCount >= 1) {
          this._connectSse();
          return;
        }
      }
      this._reconnectTimer = this._reconnectDelay;
      this._reconnectDelay = Math.min(5.0, this._reconnectDelay * 1.5);
    };

    ws.addEventListener('close', onClose);
    ws.addEventListener('error', () => { /* handled by close */ });
  }

  _connectSse() {
    if (!this.enabled || typeof EventSource === 'undefined') return;
    let sseUrl;
    try {
      const u = new URL('api/net/stream', window.location.href);
      u.searchParams.set('room', this.room);
      u.searchParams.set('id', this.id);
      if (this.requestedName) u.searchParams.set('name', this.requestedName);
      sseUrl = u.toString();
    } catch {
      return;
    }

    let es;
    try {
      es = new EventSource(sseUrl);
    } catch {
      return;
    }
    this._sse = es;

    es.onopen = () => {
      if (this._sse !== es) return;
      this.connected = true;
      this.transport = 'sse';
      this._reconnectDelay = 1.5;
      if (this._lastSnapshot) {
        this._sendRaw({ t: 'state', s: this._lastSnapshot });
      }
    };

    es.onmessage = (ev) => {
      if (!ev.data) return;
      try {
        this._handleServerMessage(JSON.parse(ev.data));
      } catch { /* ignore */ }
    };

    es.onerror = () => {
      if (this._sse !== es) return;
      try { es.close(); } catch { /* ignore */ }
      this._sse = null;
      this.connected = false;
      this.transport = 'none';
      this._reconnectTimer = this._reconnectDelay;
      this._reconnectDelay = Math.min(5.0, this._reconnectDelay * 1.5);
    };
  }

  disconnect() {
    if (this._ws) {
      try { this._ws.close(); } catch { /* ignore */ }
      this._ws = null;
    }
    if (this._sse) {
      try { this._sse.close(); } catch { /* ignore */ }
      this._sse = null;
    }
    this.connected = false;
    this.transport = 'none';
  }

  _sendRaw(obj) {
    if (!this.connected) return;
    if (this.transport === 'ws' && this._ws && this._ws.readyState === 1) {
      try {
        this._ws.send(JSON.stringify(obj));
      } catch { /* socket closing */ }
    } else if (this.transport === 'sse') {
      fetch('api/net/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: this.id, room: this.room, msg: obj }),
        keepalive: true,
      }).catch(() => {});
    }
  }

  sendEvent(kind, data = {}) {
    this._sendRaw({ t: 'event', kind, data });
  }

  _handleServerMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'welcome': {
        this.id = msg.id || this.id;
        this.slot = msg.slot || 0;
        if (!this.requestedName && msg.name) this.name = msg.name;
        this.peers.clear();
        if (Array.isArray(msg.peers)) {
          for (const raw of msg.peers) {
            if (raw && raw.id && raw.id !== this.id) this._upsertPeer(raw, true);
          }
        }
        break;
      }
      case 'peer_join': {
        if (msg.peer && msg.peer.id && msg.peer.id !== this.id) {
          const isNew = !this.peers.has(msg.peer.id);
          const p = this._upsertPeer(msg.peer, true);
          if (isNew && p) this.pushFeed(`${p.name} ENTERED THE CASTLE`, '#9ef5dc');
        }
        break;
      }
      case 'peer_leave': {
        const gone = this.peers.get(msg.id);
        if (gone) {
          this.peers.delete(msg.id);
          this.pushFeed(`${gone.name} DEPARTED`, '#8a9ab5', 2.8);
        }
        break;
      }
      case 'peer_rename': {
        if (msg.id === this.id) {
          this.name = msg.name || this.name;
        } else {
          const p = this.peers.get(msg.id);
          if (p && msg.name) p.name = msg.name;
        }
        break;
      }
      case 'world_tick': {
        if (!Array.isArray(msg.peers)) break;
        const seen = new Set();
        for (const raw of msg.peers) {
          if (!raw || !raw.id || raw.id === this.id) continue;
          seen.add(raw.id);
          this._upsertPeer(raw, false);
        }
        for (const existingId of [...this.peers.keys()]) {
          if (!seen.has(existingId)) this.peers.delete(existingId);
        }
        break;
      }
      case 'event': {
        if (msg.from === this.id) break;
        const p = this.peers.get(msg.from);
        if (msg.kind === 'stage_enter' && msg.data?.stageKey) {
          const stTitle = this.stageTitleLookup
            ? this.stageTitleLookup(msg.data.stageKey)
            : msg.data.stageKey.toUpperCase();
          this.pushFeed(`${msg.name || (p && p.name) || 'HUNTER'} → ${stTitle}`, '#ffd27a', 3.4);
        } else if (msg.kind === 'boss_clear' && msg.data?.bossName) {
          this.pushFeed(`${msg.name || 'HUNTER'} VANQUISHED ${msg.data.bossName}`, '#ffb0a0', 4.5);
        } else if (msg.kind === 'level_up' && msg.data?.level) {
          this.pushFeed(`${msg.name || (p && p.name) || 'HUNTER'} REACHED LV ${String(msg.data.level).padStart(2, '0')}!`, '#ffd27a', 3.6);
        }
        if (this.onRemoteEvent) this.onRemoteEvent(msg, p);
        break;
      }
      default:
        break;
    }
  }

  _upsertPeer(raw, snap) {
    const s = raw.s || {};
    let p = this.peers.get(raw.id);
    if (!p) {
      p = {
        id: raw.id,
        slot: raw.slot || 0,
        name: raw.name || 'HUNTER',
        stageKey: s.stageKey || 'graveyard',
        x: s.x ?? 96,
        y: s.y ?? 320,
        tx: s.x ?? 96,
        ty: s.y ?? 320,
        vx: s.vx ?? 0,
        vy: s.vy ?? 0,
        normX: s.normX ?? 0,
        inSecret: !!s.inSecret,
        anim: s.anim || 'idle',
        facing: s.facing === -1 ? -1 : 1,
        walkFrame: s.walkFrame || 0,
        walkAnimT: s.walkFrame || 0,
        attackT: s.attackT ?? -1,
        attackCrouch: !!s.attackCrouch,
        throwing: !!s.throwing,
        whipReach: s.whipReach || PLAYER.whipReach,
        wId: s.wId || null,
        wT: s.wT ?? -1,
        wDur: s.wDur || 0.3,
        wCr: !!s.wCr,
        wGd: !!s.wGd,
        subWeapon: s.subWeapon || null,
        petrified: s.petrified || 0,
        invuln: s.invuln || 0,
        hp: s.hp ?? PLAYER.maxHp,
        maxHp: s.maxHp ?? PLAYER.maxHp,
        level: Math.max(1, s.level || 1),
        relicsMask: s.relicsMask || 0,
        screen: s.screen || 'play',
        saluteT: 0,
        passResonanceCd: 0,
      };
      this.peers.set(raw.id, p);
      return p;
    }

    p.slot = raw.slot != null ? raw.slot : p.slot;
    if (raw.name) p.name = raw.name;

    const stageChanged = s.stageKey && s.stageKey !== p.stageKey;
    p.stageKey = s.stageKey || p.stageKey;
    p.tx = s.x ?? p.tx;
    p.ty = s.y ?? p.ty;
    p.vx = s.vx ?? 0;
    p.vy = s.vy ?? 0;
    p.normX = s.normX ?? p.normX;
    p.inSecret = !!s.inSecret;
    p.facing = s.facing === -1 ? -1 : 1;
    p.attackCrouch = !!s.attackCrouch;
    p.throwing = !!s.throwing;
    p.whipReach = s.whipReach || PLAYER.whipReach;
    p.wId = s.wId || null;
    p.wDur = s.wDur || 0.3;
    p.wCr = !!s.wCr;
    p.wGd = !!s.wGd;
    const incomingWT = s.wT ?? -1;
    if (incomingWT >= 0 && (p.wT == null || p.wT < 0 || s.wGd)) {
      p.wT = incomingWT;
    } else if (incomingWT < 0 && (!p.wId || p.wT > p.wDur * 0.85)) {
      p.wT = -1;
    }
    p.subWeapon = s.subWeapon || null;
    p.petrified = s.petrified || 0;
    p.invuln = s.invuln || 0;
    p.hp = s.hp ?? p.hp;
    p.maxHp = s.maxHp ?? p.maxHp;
    if (s.level) p.level = Math.max(1, s.level);
    p.relicsMask = s.relicsMask || 0;
    p.screen = s.screen || 'play';

    // Trigger attack animation cleanly even if packet landed mid-swing
    const incomingAttack = s.attackT ?? -1;
    if (incomingAttack >= 0 && p.attackT < 0) {
      p.attackT = incomingAttack;
    } else if (incomingAttack < 0 && p.attackT > PLAYER.whipTime * 0.85) {
      p.attackT = -1;
    }
    p.anim = p.attackT >= 0 ? 'attack' : (s.anim || 'idle');

    if (snap || stageChanged || Math.hypot(p.tx - p.x, p.ty - p.y) > 220) {
      p.x = p.tx;
      p.y = p.ty;
    }
    return p;
  }

  /** Interpolates all remote hunters at 60 fps and manages reconnects & HUD feed. */
  update(dt, snapshot = null) {
    if (!this.enabled) return;

    // Feed timers
    for (let i = this.feed.length - 1; i >= 0; i--) {
      this.feed[i].t += dt;
      if (this.feed[i].t >= this.feed[i].dur) this.feed.splice(i, 1);
    }

    // Reconnect timer
    if (!this.connected && !this._ws && !this._sse && this._reconnectTimer > 0) {
      this._reconnectTimer -= dt;
      if (this._reconnectTimer <= 0) this.connect();
    }

    // 60 fps dead-reckoning + spring smoothing for remote hunters
    const spring = Math.min(1, dt * 16);
    for (const p of this.peers.values()) {
      p.saluteT = Math.max(0, p.saluteT - dt);
      p.passResonanceCd = Math.max(0, p.passResonanceCd - dt);
      p.invuln = Math.max(0, p.invuln - dt);

      // Dead-reckon target slightly between 20 Hz packets (capped to prevent floor overshoot)
      p.tx += p.vx * dt * 0.55;
      if (Math.abs(p.vy) > 8 && p.anim === 'jump') {
        p.ty += p.vy * dt * 0.45;
      }
      p.x += (p.tx - p.x) * spring;
      p.y += (p.ty - p.y) * spring;

      if (p.wT != null && p.wT >= 0 && p.wId) {
        if (p.wGd) {
          p.wT = Math.min(p.wDur || 0.3, p.wT + dt);
        } else {
          p.wT += dt;
          if (p.wT >= (p.wDur || 0.3)) {
            p.wT = -1;
            p.wId = null;
          }
        }
      }

      if (p.attackT >= 0) {
        p.attackT += dt;
        const whipScale = ((p.relicsMask >> 11) & 1) ? 0.75 : 1; // clocktower swift lash
        if (p.attackT >= PLAYER.whipTime * whipScale) {
          p.attackT = -1;
          if (p.anim === 'attack') p.anim = Math.abs(p.vx) > 10 ? 'walk' : 'idle';
        } else {
          p.anim = 'attack';
        }
      }

      if (p.anim === 'walk' || (p.anim !== 'jump' && p.anim !== 'crouch' && p.anim !== 'attack' && Math.abs(p.vx) > 12)) {
        p.walkAnimT += walkAdvance(p.vx, dt);
        p.walkFrame = Math.floor(p.walkAnimT);   // the hunter clip applies its own frame count
      } else {
        p.walkAnimT = 0;
      }
      // Local clocks for the breathing idle and the death sequence (not sent over the wire)
      p.idleT = p.anim === 'idle' ? (p.idleT || 0) + dt : 0;
      p.deadT = p.anim === 'dead' ? (p.deadT || 0) + dt : 0;
      if (p.anim !== 'idle') p.fidgetT = -1;
      else if (p.fidgetT >= 0) { p.fidgetT += dt; if (p.fidgetT > 1.2) { p.fidgetT = -1; p.idleT = 0; } }
      else if (p.idleT > FIDGET_AFTER) p.fidgetT = 0;
    }

    // Outbound state throttle (20 Hz active, ~3 Hz when completely stationary)
    if (snapshot) {
      this._lastSnapshot = snapshot;
      this._sendAcc += dt;
      const key = `${snapshot.stageKey}|${Math.round(snapshot.x)}|${Math.round(snapshot.y)}|${snapshot.anim}|${snapshot.facing}|${snapshot.attackT >= 0 ? 1 : 0}|${snapshot.wId || ''}|${snapshot.screen}`;
      const changed = key !== this._lastSentKey;
      const interval = changed ? 0.05 : 0.35;
      if (this.connected && this._sendAcc >= interval) {
        this._sendAcc = 0;
        this._lastSentKey = key;
        this._sendRaw({ t: 'state', s: snapshot });
      }
    }
  }
}
