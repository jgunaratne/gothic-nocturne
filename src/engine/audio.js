// Audio: Web Audio synthesized sound effects plus a crossfading music looper
// for the Lyria-generated tracks in assets/music/.

const TRACKS = {
  title: 'assets/music/title.mp3',
  graveyard: 'assets/music/graveyard.mp3',
  darkwood: 'assets/music/darkwood.mp3',
  jack: 'assets/music/jack.mp3',
  yule: 'assets/music/yule.mp3',
  ramparts: 'assets/music/ramparts.mp3',
  catacombs: 'assets/music/catacombs.mp3',
  darkcave: 'assets/music/darkcave.mp3',
  ossuary: 'assets/music/ossuary.mp3',
  tower: 'assets/music/tower.mp3',
  throne: 'assets/music/throne.mp3',
  arcade: 'assets/music/arcade.mp3',
  library: 'assets/music/library.mp3',
  cathedral: 'assets/music/cathedral.mp3',
  alchemy: 'assets/music/alchemy.mp3',
  ballroom: 'assets/music/ballroom.mp3',
  coliseum: 'assets/music/coliseum.mp3',
  aqueduct: 'assets/music/aqueduct.mp3',
  skykeep: 'assets/music/skykeep.mp3',
  boss: 'assets/music/boss.mp3',
  clear: 'assets/music/clear.mp3',
  gameover: 'assets/music/gameover.mp3',
  ending: 'assets/music/ending.mp3',
};

export const VOICES = {
  giantbat: 'assets/voice/giantbat.mp3',
  treant: 'assets/voice/treant.mp3',
  greatjack: 'assets/voice/greatjack.mp3',
  devilsanta: 'assets/voice/devilsanta.mp3',
  bonecaptain: 'assets/voice/bonecaptain.mp3',
  reaper: 'assets/voice/reaper.mp3',
  cinderqueen: 'assets/voice/cinderqueen.mp3',
  gorgon: 'assets/voice/gorgon.mp3',
  reaperlord: 'assets/voice/reaperlord.mp3',
  count: 'assets/voice/count.mp3',
  automaton: 'assets/voice/automaton.mp3',
  archivist: 'assets/voice/archivist.mp3',
  archon: 'assets/voice/archon.mp3',
  wing_alchemy_voice: 'assets/voice/wing_alchemy_voice.mp3',
  wing_ballroom_voice: 'assets/voice/wing_ballroom_voice.mp3',
  wing_coliseum_voice: 'assets/voice/wing_coliseum_voice.mp3',
  wing_aqueduct_voice: 'assets/voice/wing_aqueduct_voice.mp3',
  wing_skykeep_voice: 'assets/voice/wing_skykeep_voice.mp3',
  narrator_ending: 'assets/voice/narrator_ending.mp3',
};
const FALLBACK_TRACK = 'graveyard';
const MAX_DECODED = 3;   // full-length tracks decode to ~50 MB of PCM each

/** Registers a generated music track (Castle Forge) under `name`. */
export function registerTrack(name, url) { TRACKS[name] = url; }
/** Registers a generated boss voice clip (Castle Forge) under `key`. */
export function registerVoice(key, url) { VOICES[key] = url; }
export function hasTrack(name) { return !!TRACKS[name]; }

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.sfxBus = null;
    this.musicBus = null;
    this.voiceBus = null;
    this.voiceDry = null;
    this.voiceReverbWet = null;
    this.voiceEchoWet = null;
    this.voiceEchoFbL = null;
    this.voiceEchoFbR = null;
    this.voiceSpace = 'hall';
    this.buffers = new Map();       // name -> AudioBuffer (LRU, bounded)
    this.loading = new Map();       // name -> Promise<AudioBuffer|null>
    this.voiceRaw = new Map();      // key -> Promise<ArrayBuffer|null>
    this.voiceBuffers = new Map();  // key -> AudioBuffer
    this.activeVoice = null;
    this.duckTimer = null;
    this.current = null;            // {name, sources: [], timer}
    this.muted = false;
    this.musicVolume = 0.55;
    this.sfxVolume = 0.6;
  }

  /** Creates or resumes the context on user gesture (desktop & iOS/Android autoplay/interruption policy). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') {
        this.ctx.resume().catch(() => {});
        this._kickSilent();
      }
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    this._kickSilent();
    if (typeof document !== 'undefined' && !this._visBound) {
      this._visBound = true;
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden && this.ctx && this.ctx.state !== 'running') {
          this.ctx.resume().catch(() => {});
        }
      });
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.sfxVolume;
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = this.voiceDucking ? this.musicVolume * 0.24 : this.musicVolume;
    this.musicBus.connect(this.master);
    this.voiceBus = this.ctx.createGain();
    this.voiceBus.gain.value = 1.0;
    this._initVoiceRoom();
    if (this.pendingTrack) { const t = this.pendingTrack; this.pendingTrack = null; this.playMusic(t.name, t.loop); }
    if (this.pendingVoice) { const v = this.pendingVoice; this.pendingVoice = null; this.playVoice(v.key, v.onDuration, v.opts); }
    if (this.pendingAmbient) { const a = this.pendingAmbient; this.pendingAmbient = null; this.ambient = null; this.playAmbient(a.url, a.volume); }
    for (const n of ['whip', 'jump', 'land', 'hit', 'hurt', 'candle', 'heart', 'pickup', 'throw', 'enemy_die', 'bone', 'block', 'boss_hit', 'boss_roar', 'gate', 'select', 'fire', 'orb', 'thunder', 'die', 'boss_die', 'pause']) this.ensureSfx(n);
  }

  /**
   * Builds a Gothic stone-hall acoustic room chain on `this.voiceBus`:
   *   voiceBus -> 85 Hz HPF -> dry (1.0)
   *                         -> stereo stone-hall ConvolverNode (18 ms pre-delay, early wall reflections, damped 1.4s tail)
   *                         -> damped stereo slapback echo (138 ms L / 184 ms R DelayNodes + cross-feedback)
   * so all boss & narrator voices sound physically situated inside vaulted stone rooms without muddying speech clarity.
   */
  _initVoiceRoom() {
    if (!this.ctx || !this.voiceBus || !this.master) return;
    try {
      const sr = this.ctx.sampleRate || 44100;
      const hpf = this.ctx.createBiquadFilter();
      hpf.type = 'highpass';
      hpf.frequency.value = 85;
      hpf.Q.value = 0.7;
      this.voiceBus.connect(hpf);

      // 1. Crisp dry path for consonant intelligibility
      this.voiceDry = this.ctx.createGain();
      this.voiceDry.gain.value = 0.96;
      hpf.connect(this.voiceDry);
      this.voiceDry.connect(this.master);

      // 2. Synthesized stereo Gothic stone-hall impulse response (early stone reflections + high-damped tail)
      const irDur = 1.45;
      const irLen = Math.floor(sr * irDur);
      const irBuf = this.ctx.createBuffer(2, irLen, sr);
      const preDelay = Math.floor(sr * 0.018);
      const earlyTaps = [
        [0.019, 0.52, -0.35],
        [0.026, -0.44, 0.48],
        [0.033, 0.38, 0.26],
        [0.041, -0.29, -0.36],
        [0.049, 0.25, -0.22],
        [0.058, -0.20, 0.24],
        [0.071, 0.16, -0.17],
      ];
      for (let ch = 0; ch < 2; ch++) {
        const d = irBuf.getChannelData(ch);
        let lp = 0;
        let seed = ch === 0 ? 0x6d2b79f5 : 0x9e3779b9;
        for (let i = preDelay; i < irLen; i++) {
          const t = (i - preDelay) / (irLen - preDelay);
          seed = (Math.imul(seed ^ (seed >>> 15), 0x2c1b3c6d) + 0x165667b1) >>> 0;
          const white = (seed / 0xffffffff) * 2 - 1;
          // Progressive stone air-absorption lowpass as reflections bounce farther down the hall
          const absorb = 0.24 + 0.58 * t;
          lp = lp * absorb + white * (1 - absorb);
          const env = Math.pow(1 - t, 2.75) * (0.42 + 0.58 * Math.exp(-t * 3.8));
          d[i] = lp * env * 0.55;
        }
        for (const [sec, gainL, gainR] of earlyTaps) {
          const idx = Math.min(irLen - 1, Math.floor(sr * sec));
          d[idx] += ch === 0 ? gainL : gainR;
        }
      }
      const conv = this.ctx.createConvolver();
      conv.buffer = irBuf;
      const revLpf = this.ctx.createBiquadFilter();
      revLpf.type = 'lowpass';
      revLpf.frequency.value = 3400;
      this.voiceReverbWet = this.ctx.createGain();
      this.voiceReverbWet.gain.value = 0.28;
      hpf.connect(conv);
      conv.connect(revLpf);
      revLpf.connect(this.voiceReverbWet);
      this.voiceReverbWet.connect(this.master);

      // 3. Subtle stereo hall slapback echo (138 ms L / 184 ms R) with warm stone filtering
      const echoBandHpf = this.ctx.createBiquadFilter();
      echoBandHpf.type = 'highpass';
      echoBandHpf.frequency.value = 210;
      const echoBandLpf = this.ctx.createBiquadFilter();
      echoBandLpf.type = 'lowpass';
      echoBandLpf.frequency.value = 2350;

      const delayL = this.ctx.createDelay(0.5);
      const delayR = this.ctx.createDelay(0.5);
      delayL.delayTime.value = 0.138;
      delayR.delayTime.value = 0.184;

      this.voiceEchoFbL = this.ctx.createGain();
      this.voiceEchoFbR = this.ctx.createGain();
      this.voiceEchoFbL.gain.value = 0.19;
      this.voiceEchoFbR.gain.value = 0.19;

      const merger = this.ctx.createChannelMerger(2);
      this.voiceEchoWet = this.ctx.createGain();
      this.voiceEchoWet.gain.value = 0.145;

      hpf.connect(echoBandHpf);
      echoBandHpf.connect(echoBandLpf);
      echoBandLpf.connect(delayL);
      echoBandLpf.connect(delayR);

      delayL.connect(this.voiceEchoFbL);
      this.voiceEchoFbL.connect(delayR);
      delayR.connect(this.voiceEchoFbR);
      this.voiceEchoFbR.connect(delayL);

      delayL.connect(merger, 0, 0);
      delayR.connect(merger, 0, 1);
      merger.connect(this.voiceEchoWet);
      this.voiceEchoWet.connect(this.master);

      this.setVoiceSpace(this.voiceSpace);
    } catch (e) {
      // Fallback if ConvolverNode or ChannelMergerNode is unavailable in a mock AudioContext
      this.voiceBus.connect(this.master);
    }
  }

  /** Tunes the hall reverb & slapback echo levels to match the current room acoustics. */
  setVoiceSpace(space = 'hall') {
    this.voiceSpace = space || 'hall';
    if (!this.ctx || !this.voiceReverbWet || !this.voiceEchoWet) return;
    const presets = {
      courtyard: { rev: 0.20, echo: 0.15, fb: 0.16 },
      hall:      { rev: 0.28, echo: 0.145, fb: 0.19 },
      cathedral: { rev: 0.35, echo: 0.165, fb: 0.22 },
      cistern:   { rev: 0.37, echo: 0.18, fb: 0.24 },
    };
    const p = presets[this.voiceSpace] || presets.hall;
    const now = this.ctx.currentTime;
    this.voiceReverbWet.gain.setTargetAtTime(p.rev, now, 0.04);
    this.voiceEchoWet.gain.setTargetAtTime(p.echo, now, 0.04);
    if (this.voiceEchoFbL) this.voiceEchoFbL.gain.setTargetAtTime(p.fb, now, 0.04);
    if (this.voiceEchoFbR) this.voiceEchoFbR.gain.setTargetAtTime(p.fb, now, 0.04);
  }

  /** Plays a 1-frame silent buffer inside a gesture so iOS WebKit unlocks audio output immediately. */
  _kickSilent() {
    if (!this.ctx) return;
    try {
      const buf = this.ctx.createBuffer(1, 1, 22050);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.ctx.destination);
      src.start(0);
    } catch (e) { /* ignore */ }
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

  /** Pre-fetches raw Daikon boss voice bytes so playback on approach has zero lag. */
  prefetchVoice(key) {
    const url = VOICES[key];
    if (!url || this.voiceBuffers.has(key) || this.voiceRaw.has(key) || typeof fetch === 'undefined') return;
    const p = fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null);
    this.voiceRaw.set(key, p);
  }

  async ensureVoiceBuffer(key) {
    if (this.voiceBuffers.has(key)) return this.voiceBuffers.get(key);
    const url = VOICES[key];
    if (!url || !this.ctx || typeof fetch === 'undefined') return null;
    try {
      let raw = this.voiceRaw.has(key) ? await this.voiceRaw.get(key) : null;
      if (!raw) {
        const res = await fetch(url);
        if (!res.ok) return null;
        raw = await res.arrayBuffer();
      }
      // Slice copy because decodeAudioData detaches the ArrayBuffer
      const buf = await this.ctx.decodeAudioData(raw.slice(0));
      this.voiceBuffers.set(key, buf);
      this.voiceRaw.delete(key);
      return buf;
    } catch (e) {
      console.warn('voice load failed', key, e);
      return null;
    }
  }

  /** Plays a Daikon boss approach voice line through the hall acoustics chain while smoothly ducking background music. */
  playVoice(key, onDuration = null, opts = null) {
    if (!VOICES[key]) return;
    if (opts && opts.space) this.setVoiceSpace(opts.space);
    this.lastVoicePlayed = key;
    if (!this.ctx) {
      this.pendingVoice = { key, onDuration, opts };
      return;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.activeVoice) {
      try { this.activeVoice.stop(); } catch (e) { /* already ended */ }
      this.activeVoice = null;
    }
    if (this.duckTimer) { clearTimeout(this.duckTimer); this.duckTimer = null; }
    // Duck musicBus immediately so background boss music starting alongside the voice never blasts over speech.
    this.voiceDucking = true;
    if (this.musicBus) {
      const now0 = this.ctx.currentTime;
      this.musicBus.gain.cancelScheduledValues(now0);
      this.musicBus.gain.setTargetAtTime(this.musicVolume * 0.24, now0, 0.05);
    }

    (async () => {
      const buf = await this.ensureVoiceBuffer(key);
      if (!buf || !this.ctx) {
        this.voiceDucking = false;
        if (this.musicBus && this.ctx) {
          this.musicBus.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.22);
        }
        return;
      }
      if (onDuration) onDuration(buf.duration);
      const now = this.ctx.currentTime;
      if (this.musicBus) {
        this.musicBus.gain.cancelScheduledValues(now);
        this.musicBus.gain.setTargetAtTime(this.musicVolume * 0.24, now, 0.06);
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const g = this.ctx.createGain();
      g.gain.value = 1.28;
      src.connect(g).connect(this.voiceBus || this.master);
      this.activeVoice = src;
      let restored = false;
      const restore = () => {
        if (restored) return;
        restored = true;
        if (this.activeVoice === src) this.activeVoice = null;
        this.voiceDucking = false;
        if (this.musicBus && this.ctx) {
          this.musicBus.gain.setTargetAtTime(this.musicVolume, this.ctx.currentTime, 0.34);
        }
      };
      src.onended = () => {
        // Hold ducking briefly while the stone-hall echo & reverb tail rings out
        if (this.duckTimer) clearTimeout(this.duckTimer);
        this.duckTimer = setTimeout(restore, 420);
      };
      this.duckTimer = setTimeout(restore, Math.ceil(buf.duration * 1000) + 600);
      src.start(now + 0.02);
    })();
  }

  get musicKey() {
    if (this.current) return this.current.name;
    if (this.pendingTrack) return this.pendingTrack.name;
    return null;
  }

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

  // ------------------------------------------------------------- ambience

  /**
   * Quiet looping ambience bed (e.g. a generated "wind through empty streets"
   * clip for a forged wing) layered under the music; `null` stops it.
   */
  playAmbient(url, volume = 0.22) {
    if (this.ambient && this.ambient.url === url) return;
    this.stopAmbient();
    if (!url) return;
    const entry = { url, src: null, gain: null, stopped: false };
    this.ambient = entry;
    if (!this.ctx) { this.pendingAmbient = { url, volume }; return; }
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        if (entry.stopped) return;
        const g = this.ctx.createGain();
        g.gain.value = 0;
        g.gain.setTargetAtTime(volume, this.ctx.currentTime, 1.2);
        g.connect(this.musicBus);
        const src = this.ctx.createBufferSource();
        src.buffer = buf; src.loop = true;
        src.connect(g);
        src.start();
        entry.src = src; entry.gain = g;
      } catch (e) { console.warn('ambience load failed', url, e); }
    })();
  }

  stopAmbient(fade = 0.8) {
    const a = this.ambient;
    this.pendingAmbient = null;
    if (!a) return;
    a.stopped = true;
    if (a.gain && this.ctx) {
      const t = this.ctx.currentTime;
      a.gain.gain.setTargetAtTime(0, t, fade * 0.35);
      const src = a.src;
      setTimeout(() => { try { src.stop(); } catch (e) { /* already stopped */ } }, fade * 1000 + 60);
    }
    this.ambient = null;
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

  /** Loads a sampled effect (assets/sfx/<name>.mp3) once; resolves null when absent. */
  ensureSfx(name) {
    if (!this.sfxBuffers) {
      this.sfxBuffers = new Map();
      this.sfxMissing = new Set(['step', 'crack', 'level_up', 'sword_thrust', 'sword_slash', 'sword_heavy', 'water_step', 'water_splash']);
    }
    if (this.sfxBuffers.has(name)) return Promise.resolve(this.sfxBuffers.get(name));
    if (this.sfxMissing.has(name) || this.sfxLoading && this.sfxLoading.has(name)) return Promise.resolve(null);
    if (!this.sfxLoading) this.sfxLoading = new Set();
    this.sfxLoading.add(name);
    return fetch(`assets/sfx/${name}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((raw) => (raw ? this.ctx.decodeAudioData(raw) : null))
      .then((buf) => { if (buf) this.sfxBuffers.set(name, buf); else this.sfxMissing.add(name); return buf; })
      .catch(() => { this.sfxMissing.add(name); return null; })
      .finally(() => this.sfxLoading.delete(name));
  }

  playSample(buf, vol = 1, rate = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g).connect(this.sfxBus);
    src.start();
  }

  sfx(name) {
    if (!this.ctx) return;
    // Sampled effects (generated with tools/generate_sfx.sh) take precedence over the synth.
    if (this.sfxBuffers && this.sfxBuffers.has(name)) {
      const vol = name === 'thunder' ? 1.05 : (name === 'whip' || name === 'hit' ? 0.9 : 0.8);
      const rate = name === 'thunder' ? 0.88 + Math.random() * 0.16 : 0.97 + Math.random() * 0.06;
      this.playSample(this.sfxBuffers.get(name), vol, rate);
      if (name === 'thunder') {
        // Layer a deep sub-bass thunder roll underneath the sampled thunderclap
        this._noise(1.35, 0.24, 140, 'lowpass', 0.04);
      }
      return;
    }
    if (!this.sfxMissing || !this.sfxMissing.has(name)) { this.ensureSfx(name); }
    switch (name) {
      case 'whip':
        this._noise(0.08, 0.35, 3500, 'highpass');
        this._osc('square', 900, 180, 0.09, 0.12, 0.04);
        this._noise(0.05, 0.5, 6000, 'highpass', 0.11);
        break;
      case 'sword_thrust':
        // Crisp rapier / katana air-pierce & steel harmonic glint (never calls ensureSfx)
        this._noise(0.065, 0.24, 3800, 'bandpass');
        this._osc('triangle', 1520, 620, 0.075, 0.11);
        this._osc('sine', 2680, 1840, 0.055, 0.055, 0.01);
        break;
      case 'sword_slash':
        // Balanced 1H steel broadsword / saber arc whoosh + resonant edge ring
        this._noise(0.11, 0.28, 2100, 'bandpass');
        this._noise(0.065, 0.18, 4800, 'highpass', 0.02);
        this._osc('sawtooth', 640, 195, 0.11, 0.095, 0.01);
        this._osc('triangle', 1240, 520, 0.08, 0.065, 0.015);
        break;
      case 'sword_heavy':
        // Massive 2H greatsword / warhammer / greatscythe air-cleave + deep steel resonance
        this._noise(0.19, 0.34, 880, 'bandpass', 0.03);
        this._noise(0.14, 0.22, 340, 'lowpass', 0.05);
        this._osc('sawtooth', 410, 88, 0.20, 0.13, 0.03);
        this._osc('triangle', 980, 310, 0.13, 0.075, 0.05);
        break;
      case 'water_step':
        this._noise(0.055, 0.10, 1650, 'bandpass');
        this._osc('sine', 540, 880, 0.045, 0.035, 0.01);
        break;
      case 'water_splash':
        this._noise(0.14, 0.19, 1350, 'bandpass');
        this._noise(0.09, 0.12, 3200, 'highpass', 0.02);
        this._osc('sine', 420, 760, 0.07, 0.045, 0.015);
        break;
      case 'jump': this._osc('square', 220, 520, 0.14, 0.12); break;
      case 'land': this._noise(0.06, 0.18, 300, 'lowpass'); break;
      case 'step': this._noise(0.03, 0.06, 420, 'lowpass'); break;   // boot contact on walk frames
      case 'crack':                                                    // the lash tip breaking the air
        this._noise(0.025, 0.32, 5200, 'highpass');
        this._osc('square', 1600, 420, 0.04, 0.07);
        break;
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
      case 'level_up':
        [440, 554.37, 659.25, 880, 1174.66].forEach((f, i) => {
          this._osc('triangle', f, f, i === 4 ? 0.34 : 0.18, 0.10, i * 0.068);
          this._osc('square', f * 2, f * 2, i === 4 ? 0.22 : 0.10, 0.025, i * 0.068 + 0.01);
        });
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
