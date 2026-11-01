// Interactive objects: candelabra, item pickups, projectiles and fire pools.

import { TILE, SCORE, PLAYER } from '../engine/constants.js';
import { Entity, rectsOverlap } from './entities.js';
import { drawFlameGlow } from './level.js';
import { getGlowCanvas } from './tex3d.js';
import { getFxLayers } from '../engine/fxlayers.js';

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
    const fx = getFxLayers();
    if (fx) { fx.addFlame(x - 7, y - 50, 5, 12, [1.0, 0.6, 0.2], this.phase); fx.addFlame(x, y - 55, 5, 13, [1.0, 0.62, 0.22], this.phase + 1.1); fx.addFlame(x + 7, y - 50, 5, 12, [1.0, 0.6, 0.2], this.phase + 2.3); }
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
    const isOrb = type === 'orb';
    this.w = isOrb ? 20 : 14;
    this.h = isOrb ? 20 : 14;
    this.vy = isOrb ? -130 : -160;
    this.vx = isOrb ? 0 : (Math.random() - 0.5) * 40;
    this.life = isOrb ? Infinity : 8;
    this.gravityScale = 0.8;
    this.arenaFloorY = null;
    this.arenaX0 = null;
    this.arenaX1 = null;
  }
  update(dt, level, world = null) {
    const isOrb = this.type === 'orb';
    if (!isOrb) {
      this.life -= dt;
      if (this.life <= 0) this.dead = true;
      // CLOCKWORK HEART relic: magnetic pull toward nearby hunter
      if (world && world.hasRelic && world.hasRelic('arcade') && world.player && world.player.alive) {
        const dx = world.player.x - this.x;
        const dy = (world.player.y - 24) - (this.y - 7);
        const dist = Math.hypot(dx, dy);
        if (dist > 4 && dist < 86) {
          this.x += (dx / dist) * 165 * dt;
          this.y += (dy / dist) * 135 * dt;
        }
      }
    }
    if (this.onGround) this.vx *= 0.8;
    this.physics(level, dt, { collide: true, oneWay: !isOrb });
    if (isOrb) {
      if (this.arenaX0 != null) this.x = Math.max(this.arenaX0, Math.min(this.arenaX1, this.x));
      if (this.arenaFloorY != null && this.y >= this.arenaFloorY) {
        this.y = this.arenaFloorY;
        this.vy = 0;
        this.onGround = true;
      }
    } else if (this.y > level.height + 100) {
      this.dead = true;
    }
  }
  draw(ctx, assets, camX, camY, time) {
    if (this.life < 2.5 && Math.floor(this.life * 10) % 2 === 0) return;
    const bob = this.type === 'orb' ? Math.sin(time * 4) * 3 : 0;
    if (this.type === 'orb') {
      const x = this.x - camX, y = this.y - camY - 8 + bob;
      const glow = getGlowCanvas('ice');
      if (glow) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.65;
        ctx.drawImage(glow, x - 28, y - 28, 56, 56);
        ctx.restore();
      }
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
      case 'skull': this.vx = dir * 100; this.vy = -30; this.damage = 2; this.life = 2.6; this.w = 14; this.h = 14; this.pierce = 99; this.homing = true; break;
      case 'hellfire': this.vx = dir * 180; this.vy = 0; this.damage = 3; this.life = 2.6; this.w = 16; this.h = 16; this.pierce = 99; break;
      case 'gaze': this.vx = dir * 380; this.vy = 0; this.damage = 3; this.life = 1.6; this.w = 34; this.h = 10; this.pierce = 99; break;
      case 'gas': this.vx = dir * 70; this.vy = 4; this.ax = -dir * 22; this.damage = 1; this.life = 2.6; this.w = 26; this.h = 26; this.pierce = 99; this.petrify = true; break;
      case 'fireball': this.vx = dir * 230; this.vy = 0; this.gravity = 0.12; this.damage = 3; this.life = 2.2; this.w = 14; this.h = 14; break;
      case 'iceshard': this.vx = dir * 260; this.vy = -60; this.gravity = 0.35; this.damage = 2; this.life = 2; this.w = 12; this.h = 8; break;
      case 'snowball': this.vx = dir * 190; this.vy = -330; this.gravity = 0.9; this.damage = 2; this.w = 12; this.h = 12; break;
      case 'present': this.vx = dir * 150; this.vy = -420; this.gravity = 1; this.damage = 3; this.w = 16; this.h = 16; this.bursts = true; break;
      case 'spore': this.vx = dir * 118; this.vy = -28; this.damage = 2; this.life = 2.8; this.w = 14; this.h = 14; break;
      case 'shard': this.vx = 0; this.vy = 200; this.gravity = 0.25; this.damage = 2; this.life = 2.6; this.w = 12; this.h = 14; break;
      case 'page': this.vx = dir * 240; this.vy = 0; this.damage = 1; this.life = 2.0; this.w = 14; this.h = 10; break;
      case 'cog': this.vx = dir * 210; this.vy = -330; this.gravity = 0.85; this.damage = 2; this.w = 16; this.h = 16; this.bounces = 1; break;
      case 'thorn': this.vx = dir * 255; this.vy = 0; this.gravity = 0.12; this.damage = 2; this.life = 2.2; this.w = 16; this.h = 8; break;
      case 'magmaball': this.vx = dir * 185; this.vy = -360; this.gravity = 0.88; this.damage = 3; this.life = 2.8; this.w = 16; this.h = 16; break;
      case 'crimson_wave': this.vx = dir * 340; this.vy = 0; this.damage = 2; this.life = 0.44; this.w = 24; this.h = 26; this.pierce = 3; break;
      default: this.vx = dir * 200; this.vy = 0;
    }
  }
  get box() { return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h }; }

  update(dt, level, world) {
    // CHRONO PENDULUM relic slows enemy projectiles by 20%
    const stepDt = (this.owner === 'enemy' && world && world.hasRelic && world.hasRelic('clocktower')) ? dt * 0.8 : dt;
    this.time += stepDt;
    this.life -= stepDt;
    if (this.life <= 0) { this.dead = true; return; }
    dt = stepDt;
    this.vy += 1500 * this.gravity * dt;
    this.vx += this.ax * dt;
    if (this.homing && world.player.alive) {
      const dx = world.player.x - this.x, dy = (world.player.y - 30) - this.y;
      const d = Math.hypot(dx, dy) || 1;
      this.vx += (dx / d) * 145 * dt; this.vy += (dy / d) * 145 * dt;
      const s = Math.hypot(this.vx, this.vy); if (s > 125) { this.vx *= 125 / s; this.vy *= 125 / s; }
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
    if ((this.type === 'fireball' || this.type === 'magmaball') && Math.random() < 0.65) world.particles.embers(this.x - this.dir * 6, this.y, 1);
    if (this.type === 'crimson_wave' && Math.random() < 0.7) world.particles.sparks(this.x - this.dir * 6, this.y + (Math.random() - 0.5) * 14, 1, '#ff4a66');
    if (this.type === 'spore') {
      this.vy = Math.cos(this.time * 4.8) * 34;
    }
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
      } else if (this.type === 'magmaball') {
        world.particles.embers(this.x, this.y - 4, 12);
        if (this.vy > 0) {
          const floorY = ty * TILE;
          world.spawnFire(this.x, floorY, 'enemy');
        }
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
      } else if (this.type === 'spore' || this.type === 'thorn') {
        world.particles.sparks(this.x, this.y, 5, '#62f2c2');
      } else if (this.type === 'page') {
        world.particles.shards(this.x, this.y, 3, '#e8e2c8', this.y + 20);
      } else if (this.type === 'shard') {
        world.particles.shards(this.x, this.y, 5, '#9a9aa8', this.y + 10);
        world.particles.dust(this.x, this.y, 3, '#b8b8c4');
      } else if (this.type === 'cog') {
        world.particles.sparks(this.x, this.y, 6, '#ffd27a');
        if (this.bounces > 0 && this.vy > 0) {
          this.bounces--; this.y = ty * TILE - this.h / 2 - 1; this.vy = -260; this.vx *= 0.85;
          world.sfx('block');
          return;
        }
      }
      if (!['sickle', 'skull', 'hellfire', 'gaze', 'gas', 'crimson_wave'].includes(this.type)) this.dead = true;
    }
    if (this.y > level.height + 60 || this.x < -40 || this.x > level.width + 40) this.dead = true;
  }

  draw(ctx, assets, camX, camY) {
    const x = Math.round(this.x - camX), y = Math.round(this.y - camY);
    if (x < -56 || x > 696 || y < -56 || y > 416) return;
    const fx = getFxLayers();
    const useFx = !!(fx && fx.enabled);
    const pImg = assets ? assets.img('projectiles') : null;
    const drawProjSprite = (name, rot = 0, flipX = false, scale = 1) => {
      const f = assets && assets.frame('projectiles', name);
      if (!f || !pImg) return false;
      ctx.save();
      if (rot) ctx.rotate(rot);
      if (flipX || scale !== 1) ctx.scale(flipX ? -scale : scale, scale);
      ctx.drawImage(pImg, f.x, f.y, f.w, f.h, -f.w / 2, -f.h / 2, f.w, f.h);
      ctx.restore();
      return true;
    };
    const seed = (this.x0 || 0) * 0.013 + (this.y0 || 0) * 0.019;

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
        if (!drawProjSprite('bone', this.spin, false, 0.9)) {
          ctx.rotate(this.spin);
          ctx.fillStyle = '#e8e2c8';
          ctx.fillRect(-7, -2, 14, 4);
          ctx.fillRect(-8, -4, 3, 8); ctx.fillRect(5, -4, 3, 8);
        }
        break;
      }
      case 'sickle': {
        if (useFx) {
          fx.addAttack({
            x, y, rx: 16, ry: 16, dirX: Math.cos(this.spin), dirY: Math.sin(this.spin),
            mode: 3, seed, core: [0.92, 0.88, 1.0], rim: [0.58, 0.34, 0.98], alpha: 0.72,
          });
        }
        if (!drawProjSprite('sickle', this.spin)) {
          ctx.rotate(this.spin);
          ctx.strokeStyle = '#d8dde8'; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(0, 0, 10, Math.PI * 0.1, Math.PI * 1.3); ctx.stroke();
          ctx.strokeStyle = '#8a9ab5'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(0, 0, 10, Math.PI * 0.1, Math.PI * 1.3); ctx.stroke();
        }
        break;
      }
      case 'skull': {
        const t = this.time;
        if (useFx) {
          fx.addAttack({
            x, y, rx: 14, ry: 22, dirX: this.vx || this.dir, dirY: this.vy,
            mode: 0, seed, core: [0.92, 0.82, 1.0], rim: [0.52, 0.22, 0.96], alpha: 0.78,
          });
        } else {
          ctx.fillStyle = `rgba(150, 90, 255, ${0.25 + 0.15 * Math.sin(t * 12)})`;
          ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
        }
        if (!drawProjSprite('skull', 0, (this.vx || this.dir) < 0, 0.9)) {
          ctx.fillStyle = '#e8e2c8';
          ctx.fillRect(-5, -6, 10, 9); ctx.fillRect(-3, 3, 6, 3);
          ctx.fillStyle = '#2a1040';
          ctx.fillRect(-4, -3, 3, 3); ctx.fillRect(1, -3, 3, 3);
        }
        break;
      }
      case 'hellfire': {
        if (useFx) {
          fx.addAttack({
            x, y, rx: 13, ry: 26, dirX: this.vx || this.dir, dirY: this.vy,
            mode: 0, seed, core: [0.94, 0.90, 1.0], rim: [0.46, 0.24, 1.0], alpha: 0.95,
          });
          ctx.fillStyle = '#f2ecff';
          ctx.fillRect(-2, -2, 4, 4);
          break;
        }
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
        if (useFx) {
          fx.addAttack({
            x, y, rx: 24, ry: 8, dirX: this.vx || this.dir, dirY: this.vy,
            mode: 1, seed, core: [1.0, 0.98, 0.80], rim: [0.42, 0.96, 0.58], alpha: 0.95,
          });
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(this.dir * 8 - 2, -1, 5, 2);
          break;
        }
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
        const k = Math.max(0.15, 1 - this.time / 2.6), r = this.w / 2;
        if (useFx) {
          fx.addAttack({
            x, y, rx: r * 1.15, ry: r * 1.15, dirX: this.dir, dirY: 0,
            mode: 2, seed, core: [0.86, 0.78, 1.0], rim: [0.42, 0.30, 0.62],
            alpha: 0.72 * k + 0.14, composite: 'source-over',
          });
          break;
        }
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
        if (useFx) {
          fx.addAttack({
            x, y, rx: 12, ry: 24, dirX: this.vx || this.dir, dirY: this.vy,
            mode: 0, seed, core: [1.0, 0.96, 0.72], rim: [1.0, 0.38, 0.08], alpha: 0.96,
          });
          ctx.fillStyle = '#fff6c8';
          ctx.fillRect(-2, -2, 4, 4);
          break;
        }
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
        const ang = Math.atan2(this.vy, this.vx);
        if (useFx) {
          fx.addAttack({
            x, y, rx: 10, ry: 20, dirX: Math.cos(ang), dirY: Math.sin(ang),
            mode: 0, seed, core: [0.92, 0.98, 1.0], rim: [0.32, 0.74, 1.0], alpha: 0.68,
          });
        }
        if (!drawProjSprite('iceshard', ang, false, 0.85)) {
          ctx.rotate(ang);
          ctx.fillStyle = '#dff4ff';
          ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -4); ctx.lineTo(-4, 0); ctx.lineTo(-6, 4); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#8ac8ff';
          ctx.fillRect(-4, -1, 8, 2);
        }
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
        if (useFx) fx.addFlame(x, y - 9, 7, 9, [1.0, 0.62, 0.18], seed);
        if (!drawProjSprite('present', this.spin * 0.45, false, 0.9)) {
          ctx.rotate(this.spin * 0.5);
          ctx.fillStyle = '#9b1c2c';
          ctx.fillRect(-7, -7, 14, 14);
          ctx.fillStyle = '#1a1420';
          ctx.fillRect(-7, -1, 14, 2); ctx.fillRect(-1, -7, 2, 14);
          ctx.fillStyle = '#e8c35a';
          ctx.fillRect(-3, -9, 6, 3);
        }
        break;
      }
      case 'spore': {
        if (useFx) {
          fx.addAttack({
            x, y, rx: 11, ry: 18, dirX: this.vx || this.dir, dirY: this.vy,
            mode: 0, seed, core: [0.86, 1.0, 0.94], rim: [0.18, 0.92, 0.68], alpha: 0.88,
          });
        } else {
          const glow = getGlowCanvas('emerald');
          if (glow) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.72;
            ctx.drawImage(glow, -14, -14, 28, 28);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
          }
        }
        ctx.fillStyle = '#52e8b8';
        ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#d8fff0';
        ctx.fillRect(-2, -2, 3, 3);
        break;
      }
      case 'shard': {
        ctx.rotate(this.spin * 0.4);
        ctx.fillStyle = '#7e8292';
        ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, -2); ctx.lineTo(4, 7); ctx.lineTo(-5, 5); ctx.lineTo(-6, -3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#b8bccb';
        ctx.fillRect(-2, -5, 3, 4);
        break;
      }
      case 'page': {
        const ang = Math.atan2(this.vy, this.vx) + Math.sin(this.time * 18) * 0.45;
        if (useFx) {
          fx.addAttack({
            x, y, rx: 9, ry: 16, dirX: Math.cos(ang), dirY: Math.sin(ang),
            mode: 0, seed, core: [0.94, 0.88, 1.0], rim: [0.58, 0.36, 0.96], alpha: 0.52,
          });
        }
        if (!drawProjSprite('page', ang, false, 0.85)) {
          ctx.rotate(ang);
          ctx.fillStyle = '#e8e2c8';
          ctx.fillRect(-7, -4, 14, 8);
          ctx.fillStyle = '#9a8c6a';
          ctx.fillRect(-5, -2, 10, 1); ctx.fillRect(-5, 1, 8, 1);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(5, -4, 2, 8);
        }
        break;
      }
      case 'cog': {
        if (!drawProjSprite('cog', this.spin, false, 0.92)) {
          ctx.rotate(this.spin);
          ctx.fillStyle = '#b98a3a';
          for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); ctx.fillRect(-2, -9, 4, 18); }
          ctx.fillStyle = '#e2b55c';
          ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#4a3418';
          ctx.beginPath(); ctx.arc(0, 0, 2.2, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'thorn': {
        const ang = Math.atan2(this.vy, this.vx);
        if (useFx) {
          fx.addAttack({
            x, y, rx: 8, ry: 16, dirX: Math.cos(ang), dirY: Math.sin(ang),
            mode: 0, seed, core: [0.78, 1.0, 0.88], rim: [0.20, 0.78, 0.56], alpha: 0.55,
          });
        }
        ctx.rotate(ang);
        ctx.fillStyle = '#4a352c';
        ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-7, -4); ctx.lineTo(-4, 0); ctx.lineTo(-7, 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#62f2c2';
        ctx.fillRect(-3, -1, 9, 2);
        break;
      }
      case 'magmaball': {
        if (useFx) {
          fx.addAttack({
            x, y, rx: 14, ry: 26, dirX: this.vx || this.dir, dirY: this.vy,
            mode: 0, seed, core: [1.0, 0.92, 0.52], rim: [0.98, 0.30, 0.05], alpha: 0.90,
          });
        } else {
          const glow = getGlowCanvas('amber');
          if (glow) {
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.78;
            ctx.drawImage(glow, -18, -18, 36, 36);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
          }
        }
        if (!drawProjSprite('magmaball', this.spin * 0.6, false, 0.92)) {
          ctx.rotate(this.spin * 0.6);
          ctx.fillStyle = '#2d1414';
          ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ff6a1a';
          ctx.fillRect(-5, -2, 10, 4); ctx.fillRect(-2, -6, 4, 12);
          ctx.fillStyle = '#ffe878';
          ctx.fillRect(-2, -2, 4, 4);
        }
        break;
      }
      case 'crimson_wave': {
        if (useFx) {
          fx.addAttack({
            x, y, rx: 18, ry: 18, dirX: this.dir, dirY: 0,
            mode: 3, seed, core: [1.0, 0.88, 0.92], rim: [1.0, 0.16, 0.32], alpha: 0.96,
          });
          break;
        }
        ctx.scale(this.dir, 1);
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = 'rgba(255, 64, 96, 0.85)';
        ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(-4, 0, 13, -1.05, 1.05); ctx.stroke();
        ctx.strokeStyle = '#ffd6df';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(-2, 0, 12, -0.85, 0.85); ctx.stroke();
        break;
      }
      default: break;
    }
    ctx.restore();
  }
}

// ------------------------------------------------------------------- fire

export class Fire {
  constructor(x, floorY, owner = 'player') {
    this.x = x; this.y = floorY; this.owner = owner;
    this.life = owner === 'enemy' ? 1.35 : 1.7;
    this.tick = 0; this.dead = false;
    this.w = owner === 'enemy' ? 32 : 40; this.h = 26;
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
    const fx = getFxLayers();
    if (fx && fx.enabled) {
      for (let i = 0; i < 4; i++) fx.addFlame(x - 15 + i * 10, y, 14, (22 + 8 * Math.abs(Math.sin(time * 9 + i))) * k, [1.0, 0.5, 0.12], this.x * 0.01 + i);
      drawFlameGlow(ctx, x, y - 8, time, 34, 0.8 * k);
      return;
    }
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
