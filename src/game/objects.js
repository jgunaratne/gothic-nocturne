// Interactive objects: candelabra, item pickups, projectiles and fire pools.

import { TILE, SCORE, PLAYER } from '../engine/constants.js';
import { Entity, rectsOverlap } from './entities.js';
import { drawFlameGlow } from './level.js';

const DROP_TABLE = [
  ['heart_small', 0.62], ['heart_big', 0.16], ['money', 0.12], ['dagger', 0.04],
  ['axe', 0.03], ['holy_water', 0.03],
];

export function rollDrop(rng = Math.random) {
  let r = rng();
  for (const [type, p] of DROP_TABLE) { r -= p; if (r <= 0) return type; }
  return 'heart_small';
}

// ---------------------------------------------------------------- candles

export class Candle {
  constructor(x, y, drop = null) {
    this.x = x; this.y = y;          // bottom-centre
    this.w = 18; this.h = 60;
    this.drop = drop;
    this.dead = false;
    this.phase = Math.random() * 10;
  }
  get box() { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }

  draw(ctx, assets, camX, camY, time) {
    const x = this.x - camX, y = this.y - camY;
    assets.draw(ctx, 'props', 'candelabra', x, y);
    drawFlameGlow(ctx, x, y - 54, time + this.phase, 26, 0.7);
  }
}

// ------------------------------------------------------------------ items

export const ITEM_FRAMES = {
  heart_small: 'heart_small', heart_big: 'heart_big', money: 'money',
  dagger: 'dagger', axe: 'axe', holy_water: 'holy_water', meat: 'meat', orb: 'orb',
};

export class Item extends Entity {
  constructor(type, x, y) {
    super(x, y);
    this.type = type;
    this.w = 14; this.h = 14;
    this.vy = -160;
    this.vx = (Math.random() - 0.5) * 40;
    this.life = type === 'orb' ? Infinity : 8;
    this.gravityScale = 0.8;
  }
  update(dt, level) {
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
    if (this.onGround) this.vx *= 0.8;
    this.physics(level, dt);
    if (this.y > level.height + 100) this.dead = true;
  }
  draw(ctx, assets, camX, camY, time) {
    if (this.life < 2.5 && Math.floor(this.life * 10) % 2 === 0) return;
    const bob = this.type === 'orb' ? Math.sin(time * 4) * 3 : 0;
    if (this.type === 'orb') {
      const x = this.x - camX, y = this.y - camY - 8 + bob;
      const g = ctx.createRadialGradient(x, y, 2, x, y, 28);
      g.addColorStop(0, 'rgba(180, 220, 255, 0.55)');
      g.addColorStop(1, 'rgba(120, 160, 255, 0)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(x - 28, y - 28, 56, 56); ctx.restore();
    }
    assets.draw(ctx, 'items', ITEM_FRAMES[this.type], this.x - camX, this.y - camY + bob);
  }
}

// ------------------------------------------------------------ projectiles

export class Projectile {
  /** owner: 'player' | 'enemy'. */
  constructor(type, x, y, dir, owner) {
    this.type = type; this.x = x; this.y = y; this.dir = dir; this.owner = owner;
    this.dead = false; this.time = 0; this.spin = 0;
    this.pierce = 0; this.gravity = 0; this.ax = 0; this.life = 3;
    this.w = 12; this.h = 12; this.damage = 1;
    this.hitSet = new Set();
    switch (type) {
      case 'dagger': this.vx = dir * 430; this.vy = 0; this.damage = 1; this.life = 1.4; this.w = 18; this.h = 6; break;
      case 'axe': this.vx = dir * 185; this.vy = -440; this.gravity = 1; this.damage = 3; this.pierce = 4; this.w = 16; this.h = 18; break;
      case 'holy_water': this.vx = dir * 150; this.vy = -240; this.gravity = 1; this.damage = 1; this.w = 10; this.h = 14; break;
      case 'bone': this.vx = dir * 200; this.vy = -370; this.gravity = 0.9; this.damage = 2; this.w = 12; this.h = 12; break;
      case 'sickle': this.vx = dir * 300; this.vy = 0; this.ax = -dir * 330; this.damage = 3; this.life = 2.6; this.w = 22; this.h = 22; this.pierce = 99; break;
      case 'skull': this.vx = dir * 120; this.vy = -40; this.damage = 2; this.life = 4; this.w = 14; this.h = 14; this.pierce = 99; this.homing = true; break;
      case 'hellfire': this.vx = dir * 180; this.vy = 0; this.damage = 3; this.life = 2.6; this.w = 16; this.h = 16; this.pierce = 99; break;
      case 'gaze': this.vx = dir * 380; this.vy = 0; this.damage = 3; this.life = 1.6; this.w = 34; this.h = 10; this.pierce = 99; break;
      case 'gas': this.vx = dir * 70; this.vy = 4; this.ax = -dir * 22; this.damage = 1; this.life = 2.6; this.w = 26; this.h = 26; this.pierce = 99; this.petrify = true; break;
      case 'fireball': this.vx = dir * 230; this.vy = 0; this.gravity = 0.12; this.damage = 3; this.life = 2.2; this.w = 14; this.h = 14; break;
      case 'iceshard': this.vx = dir * 260; this.vy = -60; this.gravity = 0.35; this.damage = 2; this.life = 2; this.w = 12; this.h = 8; break;
      case 'snowball': this.vx = dir * 190; this.vy = -330; this.gravity = 0.9; this.damage = 2; this.w = 12; this.h = 12; break;
      case 'present': this.vx = dir * 150; this.vy = -420; this.gravity = 1; this.damage = 3; this.w = 16; this.h = 16; this.bursts = true; break;
      default: this.vx = dir * 200; this.vy = 0;
    }
  }
  get box() { return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h }; }

  update(dt, level, world) {
    this.time += dt;
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    this.vy += 1500 * this.gravity * dt;
    this.vx += this.ax * dt;
    if (this.homing && world.player.alive) {
      const dx = world.player.x - this.x, dy = (world.player.y - 30) - this.y;
      const d = Math.hypot(dx, dy) || 1;
      this.vx += (dx / d) * 260 * dt; this.vy += (dy / d) * 260 * dt;
      const s = Math.hypot(this.vx, this.vy); if (s > 170) { this.vx *= 170 / s; this.vy *= 170 / s; }
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.spin += dt * (this.type === 'dagger' ? 0 : 14) * this.dir;
    if (this.type === 'gas') {
      // The cloud billows out and thins as it drifts.
      const k = this.time / 2.6;
      this.w = this.h = 26 + k * 30;
      if (Math.random() < 0.4) world.particles.emit({ x: this.x + (Math.random() - 0.5) * this.w, y: this.y + (Math.random() - 0.5) * this.h, vx: this.vx * 0.3, vy: -10, life: 0.6, color: 'rgba(150, 130, 180, 0.35)', size: 5, gravity: -0.02, shrink: true });
    }
    if (this.type === 'fireball' && Math.random() < 0.6) world.particles.embers(this.x - this.dir * 6, this.y, 1);
    // Tile contact
    const tx = Math.floor(this.x / TILE), ty = Math.floor(this.y / TILE);
    if (level.isSolid(tx, ty) || (this.type === 'holy_water' && this.vy > 0 && level.isStandable(tx, Math.floor((this.y + 4) / TILE)))) {
      if (this.type === 'holy_water') {
        const floorY = Math.floor((this.y + 4) / TILE) * TILE;
        world.spawnFire(this.x, floorY);
      } else if (this.type === 'dagger') {
        world.particles.sparks(this.x, this.y, 4, '#cfd8e8');
      } else if (this.type === 'fireball') {
        world.particles.embers(this.x, this.y, 8);
      } else if (this.type === 'present' && this.bursts) {
        // Cursed gift: bursts into a fan of ice shards.
        world.particles.sparks(this.x, this.y - 8, 10, '#e23c3c');
        for (let i = -1; i <= 1; i++) {
          const s = new Projectile('iceshard', this.x, this.y - 10, i === 0 ? this.dir : i, 'enemy');
          s.vx = i * 170 + (i === 0 ? this.dir * 40 : 0); s.vy = -260 + Math.abs(i) * 60;
          world.spawnProjectile(s);
        }
        world.sfx('block');
      } else if (this.type === 'snowball' || this.type === 'iceshard') {
        world.particles.dust(this.x, this.y, 4, '#dfe8ff');
      }
      if (!['sickle', 'skull', 'hellfire', 'gaze', 'gas'].includes(this.type)) this.dead = true;
    }
    if (this.y > level.height + 60 || this.x < -40 || this.x > level.width + 40) this.dead = true;
  }

  draw(ctx, assets, camX, camY) {
    const x = Math.round(this.x - camX), y = Math.round(this.y - camY);
    ctx.save();
    ctx.translate(x, y);
    switch (this.type) {
      case 'dagger': {
        const f = assets.frame('items', 'dagger');
        ctx.rotate(this.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
        ctx.drawImage(assets.img('items'), f.x, f.y, f.w, f.h, -f.w / 2, -f.h / 2, f.w, f.h);
        break;
      }
      case 'axe': {
        const f = assets.frame('items', 'axe');
        ctx.rotate(this.spin);
        ctx.drawImage(assets.img('items'), f.x, f.y, f.w, f.h, -f.w / 2, -f.h / 2, f.w, f.h);
        break;
      }
      case 'holy_water': {
        const f = assets.frame('items', 'holy_water');
        ctx.rotate(this.spin * 0.5);
        ctx.drawImage(assets.img('items'), f.x, f.y, f.w, f.h, -f.w / 2, -f.h / 2, f.w, f.h);
        break;
      }
      case 'bone': {
        ctx.rotate(this.spin);
        ctx.fillStyle = '#e8e2c8';
        ctx.fillRect(-7, -2, 14, 4);
        ctx.fillRect(-8, -4, 3, 8); ctx.fillRect(5, -4, 3, 8);
        break;
      }
      case 'sickle': {
        ctx.rotate(this.spin);
        ctx.strokeStyle = '#d8dde8'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0, 0, 10, Math.PI * 0.1, Math.PI * 1.3); ctx.stroke();
        ctx.strokeStyle = '#8a9ab5'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, 10, Math.PI * 0.1, Math.PI * 1.3); ctx.stroke();
        break;
      }
      case 'skull': {
        const t = this.time;
        ctx.fillStyle = `rgba(150, 90, 255, ${0.25 + 0.15 * Math.sin(t * 12)})`;
        ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e8e2c8';
        ctx.fillRect(-5, -6, 10, 9); ctx.fillRect(-3, 3, 6, 3);
        ctx.fillStyle = '#2a1040';
        ctx.fillRect(-4, -3, 3, 3); ctx.fillRect(1, -3, 3, 3);
        break;
      }
      case 'hellfire': {
        // Blue-violet flame orb with a flickering core and tail.
        const t = this.time;
        const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 16);
        g.addColorStop(0, 'rgba(200, 180, 255, 0.9)');
        g.addColorStop(0.5, 'rgba(120, 80, 255, 0.5)');
        g.addColorStop(1, 'rgba(80, 40, 200, 0)');
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g;
        ctx.fillRect(-16, -16, 32, 32);
        ctx.fillStyle = '#d8ccff';
        ctx.fillRect(-3, -3 + Math.round(Math.sin(t * 30)), 6, 6);
        ctx.fillStyle = '#8a60ff';
        ctx.fillRect(-this.dir * 10 - 2, -2, 4, 4);
        break;
      }
      case 'gaze': {
        // Petrifying stare: a bright streak with a soft tail.
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255, 220, 120, 0.35)';
        ctx.fillRect(-20, -5, 40, 10);
        ctx.fillStyle = '#fff0b0';
        ctx.fillRect(-14, -2, 28, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(this.dir * 8 - 3, -1, 6, 2);
        break;
      }
      case 'gas': {
        // Petrifying breath: overlapping violet-grey puffs that thin out.
        const k = 1 - this.time / 2.6, r = this.w / 2;
        ctx.globalAlpha = 0.55 * k + 0.15;
        for (let i = 0; i < 5; i++) {
          const a = this.time * 1.5 + i * 1.26;
          const px0 = Math.cos(a) * r * 0.45, py0 = Math.sin(a * 1.3) * r * 0.35;
          const g = ctx.createRadialGradient(px0, py0, 1, px0, py0, r * 0.7);
          g.addColorStop(0, 'rgba(170, 150, 200, 0.6)');
          g.addColorStop(1, 'rgba(110, 90, 140, 0)');
          ctx.fillStyle = g;
          ctx.fillRect(px0 - r, py0 - r, r * 2, r * 2);
        }
        break;
      }
      case 'fireball': {
        const t = this.time;
        const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 14);
        g.addColorStop(0, 'rgba(255, 240, 180, 0.95)');
        g.addColorStop(0.45, 'rgba(255, 140, 40, 0.7)');
        g.addColorStop(1, 'rgba(200, 60, 20, 0)');
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g;
        ctx.fillRect(-14, -14, 28, 28);
        ctx.fillStyle = '#fff2b0';
        ctx.fillRect(-3, -3 + Math.round(Math.sin(t * 40)), 6, 6);
        ctx.fillStyle = 'rgba(255, 120, 30, 0.8)';
        ctx.fillRect(-this.dir * 12 - 3, -2, 6, 4);
        break;
      }
      case 'iceshard': {
        ctx.rotate(Math.atan2(this.vy, this.vx));
        ctx.fillStyle = '#dff4ff';
        ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -4); ctx.lineTo(-4, 0); ctx.lineTo(-6, 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#8ac8ff';
        ctx.fillRect(-4, -1, 8, 2);
        break;
      }
      case 'snowball': {
        ctx.fillStyle = '#eef6ff';
        ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#b9d4f2';
        ctx.fillRect(-2, 1, 3, 2); ctx.fillRect(1, -3, 2, 2);
        break;
      }
      case 'present': {
        ctx.rotate(this.spin * 0.5);
        ctx.fillStyle = '#9b1c2c';
        ctx.fillRect(-7, -7, 14, 14);
        ctx.fillStyle = '#1a1420';
        ctx.fillRect(-7, -1, 14, 2); ctx.fillRect(-1, -7, 2, 14);
        ctx.fillStyle = '#e8c35a';
        ctx.fillRect(-3, -9, 6, 3);
        break;
      }
      default: break;
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------------- fire

export class Fire {
  constructor(x, floorY) {
    this.x = x; this.y = floorY; this.life = 1.7; this.tick = 0; this.dead = false;
    this.w = 40; this.h = 26;
  }
  get box() { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }
  update(dt) {
    this.life -= dt; this.tick += dt;
    if (this.life <= 0) this.dead = true;
  }
  /** True on damage ticks (every 0.22s). */
  shouldDamage() { if (this.tick >= 0.22) { this.tick = 0; return true; } return false; }
  draw(ctx, camX, camY, time) {
    const x = this.x - camX, y = this.y - camY;
    const k = Math.min(1, this.life / 0.4);
    for (let i = 0; i < 7; i++) {
      const fx = x - 16 + i * 5.3 + Math.sin(time * 20 + i) * 2;
      const h = (10 + 10 * Math.abs(Math.sin(time * 14 + i * 1.7))) * k;
      ctx.fillStyle = i % 2 ? '#ff8a2a' : '#ffd066';
      ctx.fillRect(Math.round(fx), Math.round(y - h), 4, Math.round(h));
      ctx.fillStyle = '#fff2b0';
      ctx.fillRect(Math.round(fx) + 1, Math.round(y - h * 0.4), 2, Math.round(h * 0.4));
    }
    drawFlameGlow(ctx, x, y - 8, time, 34, 0.8 * k);
  }
}

export { rectsOverlap, SCORE, PLAYER };
