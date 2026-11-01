// Pooled particles: combat sparks, whip-slash hit bursts, incandescent embers,
// faceted bone/stone shards, and wispy dust/smoke puffs.
// Rendered through FxLayers' batched WebGL spark shader (`SPARK_FRAG`) when
// available, with a clean rotated-vector 2D fallback (zero square fillRects).

import { W, H, GRAVITY } from './constants.js';
import { getFxLayers } from './fxlayers.js';

const KIND_ID = {
  spark: 0,
  hitburst: 1,
  ember: 2,
  shard: 3,
  dust: 4,
  smoke: 4,
};

const COLOR_CACHE = new Map();

/** Parses `#rgb`, `#rrggbb`, or `rgb/rgba(...)` into `[r, g, b, a]` (`0..1`). */
export function parseParticleColor(str) {
  if (!str) return [1, 1, 1, 1];
  const hit = COLOR_CACHE.get(str);
  if (hit) return hit;
  let out = [1, 0.92, 0.65, 1];
  const s = String(str).trim();
  if (s[0] === '#') {
    if (s.length === 4) {
      out = [
        parseInt(s[1] + s[1], 16) / 255,
        parseInt(s[2] + s[2], 16) / 255,
        parseInt(s[3] + s[3], 16) / 255,
        1,
      ];
    } else if (s.length >= 7) {
      out = [
        parseInt(s.slice(1, 3), 16) / 255,
        parseInt(s.slice(3, 5), 16) / 255,
        parseInt(s.slice(5, 7), 16) / 255,
        1,
      ];
    }
  } else if (s.startsWith('rgb')) {
    const m = s.match(/[\d.]+/g);
    if (m && m.length >= 3) {
      out = [
        Math.min(1, parseFloat(m[0]) / 255),
        Math.min(1, parseFloat(m[1]) / 255),
        Math.min(1, parseFloat(m[2]) / 255),
        m.length >= 4 ? Math.min(1, parseFloat(m[3])) : 1,
      ];
    }
  }
  if (COLOR_CACHE.size < 256) COLOR_CACHE.set(str, out);
  return out;
}

export class Particles {
  constructor(max = 700) {
    this.items = [];
    this.max = max;
    this._matteBatch = [];
    this._glowBatch = [];
  }

  /**
   * opts: {x, y, vx, vy, life, color, size, gravity (0..1), drag, fade,
   *        shrink, glow, kind, angle}
   */
  emit(opts) {
    if (this.items.length >= this.max) this.items.shift();
    const kind = opts.kind || (opts.glow ? 'spark' : (opts.bounce ? 'shard' : 'dust'));
    const life = opts.life || 0.5;
    this.items.push({
      x: opts.x,
      y: opts.y,
      vx: opts.vx || 0,
      vy: opts.vy || 0,
      life,
      maxLife: life,
      color: opts.color || '#fff',
      rgba: parseParticleColor(opts.color || '#fff'),
      size: opts.size || 2,
      gravity: opts.gravity == null ? 1 : opts.gravity,
      drag: opts.drag || 0,
      fade: opts.fade !== false,
      shrink: !!opts.shrink,
      glow: !!opts.glow || kind === 'spark' || kind === 'hitburst' || kind === 'ember',
      bounce: opts.bounce || 0,
      floorY: opts.floorY == null ? Infinity : opts.floorY,
      kind,
      seed: opts.seed != null ? opts.seed : Math.random(),
      angle: opts.angle == null ? (Math.random() - 0.5) * 0.9 : opts.angle,
    });
  }

  burst(x, y, n, fn) {
    for (let i = 0; i < n; i++) this.emit(fn(i, n));
  }

  /** Directional star-slash & expanding corona flare at a combat impact point. */
  hitBurst(x, y, color = '#ffe9a0', size = 18, angle = null) {
    this.emit({
      x,
      y,
      vx: 0,
      vy: 0,
      life: 0.18,
      color,
      size,
      gravity: 0,
      fade: true,
      glow: true,
      kind: 'hitburst',
      angle: angle == null ? ((Math.random() < 0.5 ? 1 : -1) * (0.42 + Math.random() * 0.35)) : angle,
    });
  }

  /** Convenience bursts ------------------------------------------------ */
  sparks(x, y, n = 8, color = '#ffe9a0') {
    if (n >= 4) {
      this.hitBurst(x, y, color, Math.min(26, 13 + n * 0.85));
    }
    this.burst(x, y, n, (i) => {
      // Stratified angles with jitter so bursts fan out evenly instead of clumping
      const baseA = (i / Math.max(1, n)) * Math.PI * 2 + (Math.random() - 0.5) * 0.75;
      const s = 95 + Math.random() * 195;
      return {
        x,
        y,
        vx: Math.cos(baseA) * s,
        vy: Math.sin(baseA) * s - 55,
        life: 0.22 + Math.random() * 0.28,
        color,
        size: 2.2 + Math.random() * 2.2,
        gravity: 0.58,
        drag: 2.6,
        glow: true,
        kind: 'spark',
      };
    });
  }

  embers(x, y, n = 6) {
    this.burst(x, y, n, () => ({
      x: x + (Math.random() - 0.5) * 10,
      y,
      vx: (Math.random() - 0.5) * 58,
      vy: -45 - Math.random() * 95,
      life: 0.48 + Math.random() * 0.62,
      color: Math.random() < 0.5 ? '#ffb347' : '#ff6a2a',
      size: 2.4 + Math.random() * 2.2,
      gravity: -0.12,
      glow: true,
      shrink: true,
      kind: 'ember',
    }));
  }

  dust(x, y, n = 5, color = '#8a8294') {
    this.burst(x, y, n, () => ({
      x: x + (Math.random() - 0.5) * 16,
      y,
      vx: (Math.random() - 0.5) * 70,
      vy: -20 - Math.random() * 40,
      life: 0.3 + Math.random() * 0.3,
      color,
      size: 3 + Math.random() * 2.5,
      gravity: 0.28,
      shrink: true,
      kind: 'dust',
    }));
  }

  shards(x, y, n = 10, color = '#e8e2c8', floorY = Infinity) {
    this.burst(x, y, n, () => ({
      x: x + (Math.random() - 0.5) * 20,
      y: y - Math.random() * 40,
      vx: (Math.random() - 0.5) * 220,
      vy: -80 - Math.random() * 220,
      life: 0.7 + Math.random() * 0.6,
      color,
      size: 3 + Math.random() * 2.5,
      gravity: 1,
      bounce: 0.4,
      floorY,
      kind: 'shard',
    }));
  }

  smoke(x, y, n = 8, color = 'rgba(90,70,120,0.55)') {
    this.burst(x, y, n, () => ({
      x: x + (Math.random() - 0.5) * 30,
      y: y - Math.random() * 50,
      vx: (Math.random() - 0.5) * 30,
      vy: -20 - Math.random() * 30,
      life: 0.8 + Math.random() * 0.8,
      color,
      size: 6 + Math.random() * 7,
      gravity: -0.05,
      shrink: false,
      kind: 'smoke',
    }));
  }

  update(dt) {
    const it = this.items;
    for (let i = it.length - 1; i >= 0; i--) {
      const p = it[i];
      p.life -= dt;
      if (p.life <= 0) { it[i] = it[it.length - 1]; it.pop(); continue; }
      p.vy += GRAVITY * p.gravity * dt;
      if (p.drag) { p.vx -= p.vx * p.drag * dt; p.vy -= p.vy * p.drag * dt; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y > p.floorY) { p.y = p.floorY; p.vy = -p.vy * p.bounce; p.vx *= 0.7; }
    }
  }

  draw(ctx, camX, camY) {
    if (!this.items.length) return;
    const fxl = getFxLayers();
    if (fxl && fxl.enabled && fxl.drawSparkBatch) {
      const matte = this._matteBatch;
      const glow = this._glowBatch;
      matte.length = 0;
      glow.length = 0;

      for (const p of this.items) {
        const sx = p.x - camX;
        const sy = p.y - camY;
        if (sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) continue;
        const lifeFrac = Math.max(0, Math.min(1, p.life / p.maxLife));
        const fade = p.fade ? Math.min(1, lifeFrac * 2.1) : 1;
        const alpha = fade * p.rgba[3];
        if (alpha <= 0.015) continue;

        let s = p.size;
        if (p.shrink) s = Math.max(1.2, s * (0.35 + 0.65 * lifeFrac));
        const kindId = KIND_ID[p.kind] != null ? KIND_ID[p.kind] : 0;

        let dirX = 1, dirY = 0, halfL = s, halfW = s;
        if (kindId === 0) {
          // Combat spark: stretch along velocity vector into a luminous comet-streak
          const spd = Math.hypot(p.vx, p.vy);
          if (spd > 4) { dirX = p.vx / spd; dirY = p.vy / spd; }
          const spdNorm = Math.min(1, spd / 240);
          halfW = Math.max(3.2, s * 1.45);
          halfL = halfW * (1.0 + spdNorm * 2.35);
        } else if (kindId === 1) {
          // Whip-slash impact flare
          dirX = Math.cos(p.angle);
          dirY = Math.sin(p.angle);
          halfL = s;
          halfW = s;
        } else if (kindId === 2) {
          // Incandescent ember
          const spd = Math.hypot(p.vx, p.vy);
          if (spd > 4) { dirX = p.vx / spd; dirY = p.vy / spd; }
          const spdNorm = Math.min(1, spd / 150);
          halfW = Math.max(3.0, s * 1.4);
          halfL = halfW * (1.0 + spdNorm * 0.85);
        } else if (kindId === 3) {
          halfL = Math.max(2.5, s * 1.15);
          halfW = halfL;
        } else {
          // Wispy dust/smoke expands slightly as it dissipates
          const grow = p.kind === 'smoke' ? (1.0 + (1.0 - lifeFrac) * 0.45) : 1.0;
          halfL = Math.max(2.5, s * grow);
          halfW = halfL;
        }

        // Shift spark quad center slightly backward along velocity so `headX` sits right at `(sx, sy)`
        const shift = kindId === 0 && halfL > halfW * 1.15 ? -0.42 * (halfL - halfW) : 0;
        const qx = sx + dirX * shift;
        const qy = sy + dirY * shift;
        const item = {
          x: qx, y: qy, halfL, halfW, dirX, dirY,
          r: p.rgba[0], g: p.rgba[1], b: p.rgba[2], a: alpha,
          kind: kindId, life: lifeFrac, seed: p.seed,
        };
        if (p.glow) glow.push(item);
        else matte.push(item);
      }

      if (matte.length) fxl.drawSparkBatch(ctx, matte, 'source-over');
      if (glow.length) fxl.drawSparkBatch(ctx, glow, 'lighter');
      return;
    }

    // Clean non-square 2D vector fallback (?nofx / headless)
    ctx.save();
    for (const p of this.items) {
      const sx = p.x - camX, sy = p.y - camY;
      if (sx < -32 || sx > W + 32 || sy < -32 || sy > H + 32) continue;
      const lifeFrac = Math.max(0, Math.min(1, p.life / p.maxLife));
      const a = (p.fade ? Math.min(1, lifeFrac * 2) : 1) * p.rgba[3];
      if (a <= 0.02) continue;
      let s = p.size;
      if (p.shrink) s = Math.max(1, s * lifeFrac);

      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      if (p.kind === 'hitburst') {
        const r = s * (0.45 + 0.55 * (1 - lifeFrac));
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(p.angle);
        ctx.beginPath();
        ctx.moveTo(-r, 0); ctx.lineTo(0, -1.6); ctx.lineTo(r, 0); ctx.lineTo(0, 1.6);
        ctx.moveTo(0, -r * 0.7); ctx.lineTo(1.4, 0); ctx.lineTo(0, r * 0.7); ctx.lineTo(-1.4, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (p.kind === 'spark' || p.kind === 'ember') {
        const ang = Math.atan2(p.vy, p.vx);
        const len = Math.max(s * 1.4, Math.min(12, Math.hypot(p.vx, p.vy) * 0.045 + s));
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(ang);
        ctx.beginPath();
        ctx.moveTo(s, 0);
        ctx.lineTo(0, -s * 0.55);
        ctx.lineTo(-len, 0);
        ctx.lineTo(0, s * 0.55);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (p.kind === 'shard') {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(p.seed * 6.28 + lifeFrac * 8);
        ctx.beginPath();
        ctx.moveTo(0, -s); ctx.lineTo(s * 0.65, 0); ctx.lineTo(0, s); ctx.lineTo(-s * 0.65, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(1, s * 0.65), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}
