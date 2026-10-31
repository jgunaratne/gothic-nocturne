// Pooled particles: sparks, dust, bone shards, embers, fog puffs.

import { GRAVITY } from './constants.js';

export class Particles {
  constructor(max = 600) {
    this.items = [];
    this.max = max;
  }

  /**
   * opts: {x, y, vx, vy, life, color, size, gravity (0..1), drag, fade,
   *        shrink, glow}
   */
  emit(opts) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push({
      x: opts.x, y: opts.y,
      vx: opts.vx || 0, vy: opts.vy || 0,
      life: opts.life || 0.5, maxLife: opts.life || 0.5,
      color: opts.color || '#fff',
      size: opts.size || 2,
      gravity: opts.gravity == null ? 1 : opts.gravity,
      drag: opts.drag || 0,
      fade: opts.fade !== false,
      shrink: !!opts.shrink,
      glow: !!opts.glow,
      bounce: opts.bounce || 0,
      floorY: opts.floorY == null ? Infinity : opts.floorY,
    });
  }

  burst(x, y, n, fn) {
    for (let i = 0; i < n; i++) this.emit(fn(i, n));
  }

  /** Convenience bursts ------------------------------------------------ */
  sparks(x, y, n = 8, color = '#ffe9a0') {
    this.burst(x, y, n, () => {
      const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 160;
      return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 0.25 + Math.random() * 0.3, color, size: 1 + Math.random() * 2, gravity: 0.6, glow: true };
    });
  }

  embers(x, y, n = 6) {
    this.burst(x, y, n, () => ({
      x: x + (Math.random() - 0.5) * 10, y, vx: (Math.random() - 0.5) * 50, vy: -40 - Math.random() * 90,
      life: 0.5 + Math.random() * 0.6, color: Math.random() < 0.5 ? '#ffb347' : '#ff6a2a', size: 1 + Math.random() * 2, gravity: -0.1, glow: true, shrink: true,
    }));
  }

  dust(x, y, n = 5, color = '#8a8294') {
    this.burst(x, y, n, () => ({
      x: x + (Math.random() - 0.5) * 16, y, vx: (Math.random() - 0.5) * 70, vy: -20 - Math.random() * 40,
      life: 0.3 + Math.random() * 0.3, color, size: 2 + Math.random() * 2, gravity: 0.3, shrink: true,
    }));
  }

  shards(x, y, n = 10, color = '#e8e2c8', floorY = Infinity) {
    this.burst(x, y, n, () => ({
      x: x + (Math.random() - 0.5) * 20, y: y - Math.random() * 40, vx: (Math.random() - 0.5) * 220, vy: -80 - Math.random() * 220,
      life: 0.7 + Math.random() * 0.6, color, size: 2 + Math.random() * 2, gravity: 1, bounce: 0.4, floorY,
    }));
  }

  smoke(x, y, n = 8, color = 'rgba(90,70,120,0.55)') {
    this.burst(x, y, n, () => ({
      x: x + (Math.random() - 0.5) * 30, y: y - Math.random() * 50, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 30,
      life: 0.8 + Math.random() * 0.8, color, size: 4 + Math.random() * 6, gravity: -0.05, shrink: false,
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
    for (const p of this.items) {
      const t = p.life / p.maxLife;
      const a = p.fade ? Math.min(1, t * 2) : 1;
      let s = p.size;
      if (p.shrink) s = Math.max(1, s * t);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      const x = Math.round(p.x - camX - s / 2), y = Math.round(p.y - camY - s / 2);
      ctx.fillRect(x, y, Math.round(s), Math.round(s));
      if (p.glow) {
        ctx.globalAlpha = a * 0.35;
        ctx.fillRect(x - 1, y - 1, Math.round(s) + 2, Math.round(s) + 2);
      }
    }
    ctx.globalAlpha = 1;
  }
}
