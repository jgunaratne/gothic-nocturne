// Audio: Web Audio synthesized sound effects plus a crossfading music looper
// for the Lyria-generated tracks in assets/music/.

const TRACKS = {
  title: 'assets/music/title.mp3',
  graveyard: 'assets/music/graveyard.mp3',
  jack: 'assets/music/jack.mp3',
  yule: 'assets/music/yule.mp3',
  ramparts: 'assets/music/ramparts.mp3',
  catacombs: 'assets/music/catacombs.mp3',
  ossuary: 'assets/music/ossuary.mp3',
  tower: 'assets/music/tower.mp3',
  throne: 'assets/music/throne.mp3',
  boss: 'assets/music/boss.mp3',
  clear: 'assets/music/clear.mp3',
  gameover: 'assets/music/gameover.mp3',
  ending: 'assets/music/ending.mp3',
};
const FALLBACK_TRACK = 'graveyard';
const MAX_DECODED = 3;   // full-length tracks decode to ~50 MB of PCM each

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.buffers = new Map();   // name -> AudioBuffer (LRU, bounded)
    this.loading = new Map();   // name -> Promise<AudioBuffer|null>
    this.current = null;        // {name, sources: [], timer}
    this.muted = false;
    this.musicVolume = 0.55;
    this.sfxVolume = 0.6;
  }

  /** Creates the context on first user gesture (autoplay policy). */
  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.sfxVolume;
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.musicVolume;
    this.musicBus.connect(this.master);
    if (this.pendingTrack) { const t = this.pendingTrack; this.pendingTrack = null; this.playMusic(t.name, t.loop); }
  }

  /** Fetches + decodes a track on demand; keeps only a few decoded. */
  ensureBuffer(name) {
    if (this.buffers.has(name)) {
      const b = this.buffers.get(name);
      this.buffers.delete(name); this.buffers.set(name, b);   // refresh LRU
      return Promise.resolve(b);
    }
    if (this.loading.has(name)) return this.loading.get(name);
    const url = TRACKS[name];
    if (!url) return Promise.resolve(null);
    const p = (async () => {
      try {
        const res = await fetch(url);
        const data = await res.arrayBuffer();
        const buf = await this.ctx.decodeAudioData(data);
        this.buffers.set(name, buf);
        while (this.buffers.size > MAX_DECODED) {
          const oldest = this.buffers.keys().next().value;
          if (this.current && this.current.name === oldest) break;
          this.buffers.delete(oldest);
        }
        return buf;
      } catch (e) {
        console.warn('music load failed', name, e);
        return null;
      } finally {
        this.loading.delete(name);
      }
    })();
    this.loading.set(name, p);
    return p;
  }

  /** Warms the cache for an upcoming track (e.g. the boss theme). */
  prefetch(name) { if (this.ctx && !this.buffers.has(name)) this.ensureBuffer(name); }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.ctx.currentTime, 0.02);
    return this.muted;
  }

  // ---------------------------------------------------------------- music

  /** Plays a track; loops with a short crossfade unless loop=false. */
  playMusic(name, loop = true) {
    if (!TRACKS[name]) { console.warn('unknown track', name, '-> fallback'); name = FALLBACK_TRACK; }
    if (!this.ctx) { this.pendingTrack = { name, loop }; return; }
    if (this.current && this.current.name === name) return;
    this.stopMusic(0.6);
    const entry = { name, sources: [], gain: null, stopped: false, timer: null };
    this.current = entry;
    (async () => {
      const buf = await this.ensureBuffer(name);
      if (entry.stopped) return;  // superseded while the buffer was loading
      if (!buf) { if (this.current === entry) this.current = null; return; }  // allow a retry later
      entry.gain = this.ctx.createGain();
      entry.gain.gain.value = 1;
      entry.gain.connect(this.musicBus);
      const xfade = 0.35;
      const trim = trimPoints(buf);
      const dur = trim.end - trim.start;
      const schedule = (when) => {
        if (entry.stopped) return;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(1, when + xfade);
        g.gain.setValueAtTime(1, when + dur - xfade);
        g.gain.linearRampToValueAtTime(0, when + dur);
        src.connect(g).connect(entry.gain);
        src.start(when, trim.start, dur);
        entry.sources.push(src);
        src.onended = () => { entry.sources = entry.sources.filter((s) => s !== src); };
        if (loop) {
          const next = when + dur - xfade;
          const ms = Math.max(50, (next - this.ctx.currentTime - 1.0) * 1000);
          entry.timer = setTimeout(() => schedule(next), ms);
        }
      };
      schedule(this.ctx.currentTime + 0.05);
    })();
  }

  stopMusic(fade = 0.5) {
    const cur = this.current;
    if (!cur) return;
    cur.stopped = true;
    if (cur.timer) clearTimeout(cur.timer);
    if (cur.gain) {
      const t = this.ctx.currentTime;
      cur.gain.gain.setValueAtTime(cur.gain.gain.value, t);
      cur.gain.gain.linearRampToValueAtTime(0, t + fade);
      const srcs = cur.sources.slice();
      setTimeout(() => srcs.forEach((s) => { try { s.stop(); } catch (e) { /* already stopped */ } }), fade * 1000 + 50);
    }
    this.current = null;
  }

  // ------------------------------------------------------------------ sfx

  _env(gainNode, t, a, d, peak = 1, sustain = 0) {
    const g = gainNode.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + a);
    g.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + d);
  }

  _osc(type, f0, f1, dur, vol = 0.3, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    this._env(g, t, 0.005, dur, vol);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _noise(dur, vol = 0.3, filterFreq = 2000, type = 'bandpass', when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    f.Q.value = 0.8;
    const g = this.ctx.createGain();
    this._env(g, t, 0.004, dur, vol);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t);
  }

  sfx(name) {
    if (!this.ctx) return;
    switch (name) {
      case 'whip':
        this._noise(0.08, 0.35, 3500, 'highpass');
        this._osc('square', 900, 180, 0.09, 0.12, 0.04);
        this._noise(0.05, 0.5, 6000, 'highpass', 0.11);
        break;
      case 'jump': this._osc('square', 220, 520, 0.14, 0.12); break;
      case 'land': this._noise(0.06, 0.18, 300, 'lowpass'); break;
      case 'hit':
        this._noise(0.08, 0.3, 1800);
        this._osc('square', 300, 90, 0.12, 0.18);
        break;
      case 'hurt':
        this._osc('sawtooth', 500, 110, 0.32, 0.22);
        this._noise(0.12, 0.2, 900);
        break;
      case 'die':
        this._osc('sawtooth', 400, 60, 0.9, 0.25);
        this._osc('square', 200, 40, 0.9, 0.15, 0.1);
        break;
      case 'candle':
        this._noise(0.12, 0.25, 5000, 'highpass');
        this._osc('triangle', 1400, 700, 0.1, 0.12);
        break;
      case 'heart':
        this._osc('square', 880, 880, 0.07, 0.12);
        this._osc('square', 1320, 1320, 0.12, 0.12, 0.07);
        break;
      case 'pickup':
        this._osc('square', 660, 660, 0.06, 0.12);
        this._osc('square', 990, 990, 0.06, 0.12, 0.06);
        this._osc('square', 1320, 1320, 0.14, 0.12, 0.12);
        break;
      case 'throw': this._noise(0.16, 0.22, 1200, 'bandpass'); this._osc('triangle', 500, 900, 0.1, 0.08); break;
      case 'enemy_die':
        this._noise(0.25, 0.3, 700, 'lowpass');
        this._osc('square', 180, 50, 0.3, 0.15);
        break;
      case 'bone': this._osc('triangle', 300, 600, 0.08, 0.1); break;
      case 'block':
        this._noise(0.2, 0.35, 500, 'lowpass');
        this._osc('square', 150, 60, 0.18, 0.15);
        break;
      case 'boss_hit':
        this._noise(0.1, 0.3, 1200);
        this._osc('sawtooth', 200, 80, 0.2, 0.2);
        break;
      case 'boss_roar':
        this._osc('sawtooth', 70, 180, 0.9, 0.3);
        this._osc('square', 55, 90, 0.9, 0.2);
        this._noise(0.9, 0.25, 400, 'lowpass');
        break;
      case 'boss_die':
        for (let i = 0; i < 6; i++) { this._noise(0.35, 0.3, 500 - i * 50, 'lowpass', i * 0.18); this._osc('square', 220 - i * 20, 40, 0.3, 0.15, i * 0.18); }
        break;
      case 'thunder':
        this._noise(1.6, 0.35, 220, 'lowpass');
        this._noise(0.5, 0.2, 900, 'lowpass', 0.05);
        break;
      case 'gate':
        this._noise(0.5, 0.35, 300, 'lowpass');
        this._osc('square', 90, 50, 0.5, 0.2);
        break;
      case 'select': this._osc('square', 660, 990, 0.08, 0.12); break;
      case 'pause': this._osc('square', 440, 440, 0.06, 0.1); this._osc('square', 660, 660, 0.08, 0.1, 0.07); break;
      case 'fire': this._noise(0.4, 0.15, 1500, 'bandpass'); break;
      case 'orb':
        [523, 659, 784, 1047].forEach((f, i) => this._osc('triangle', f, f, 0.25, 0.14, i * 0.09));
        break;
      default: break;
    }
  }
}

/** Finds the first/last non-silent sample so loops skip encoder padding. */
function trimPoints(buf) {
  const ch = buf.getChannelData(0);
  const thr = 0.01;
  let s = 0, e = ch.length - 1;
  while (s < ch.length && Math.abs(ch[s]) < thr) s++;
  while (e > s && Math.abs(ch[e]) < thr) e--;
  return { start: s / buf.sampleRate, end: Math.min(buf.duration, e / buf.sampleRate + 0.02) };
}
