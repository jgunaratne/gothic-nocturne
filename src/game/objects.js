// Interactive objects: candelabra, item pickups, projectiles and fire pools.

import { TILE, SCORE, PLAYER } from '../engine/constants.js';
import { Entity, rectsOverlap } from './entities.js';
import { drawFlameGlow } from './level.js';
import { getGlowCanvas } from './tex3d.js';
import { getFxLayers } from '../engine/fxlayers.js';
import { WEAPONS, ELEMENT_META, getWeaponIconCanvas } from './weapons.js';

const DROP_TABLE = [
  ['heart_small', 0.57], ['heart_big', 0.16], ['money', 0.12], ['dagger', 0.04],
  ['axe', 0.03], ['holy_water', 0.03], ['cross', 0.03], ['stopwatch', 0.02],
];

export function rollDrop(rng = Math.random) {
  let r = rng();
  for (const [type, p] of DROP_TABLE) { r -= p; if (r <= 0) return type; }
  return 'heart_small';
}

// ---------------------------------------------------------------- candles

export class Candle {
  constructor(x, y, drop = null, kind = 'candelabra') {
    this.x = x; this.y = y;          // bottom-centre
    this.kind = kind || 'candelabra';
    this.w = this.kind === 'candelabra' ? 18 : 22;
    this.h = this.kind === 'sconce' ? 36 : (this.kind === 'lantern' ? 42 : 60);
    this.drop = drop;
    this.dead = false;
    this.phase = Math.random() * 10;
  }
  get box() { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }

  draw(ctx, assets, camX, camY, time) {
    const x = Math.round(this.x - camX), y = Math.round(this.y - camY);
    const fx = getFxLayers();
    if (this.kind === 'sconce') {
      if (assets && assets.frame('exploration_props', 'wall_sconce') && assets.img('exploration_props')) {
        assets.draw(ctx, 'exploration_props', 'wall_sconce', x, y);
      } else if (assets) {
        assets.draw(ctx, 'props', 'torch', x, y);
      }
      drawFlameGlow(ctx, x, y - 28, time + this.phase, 24, 0.72);
      if (fx) fx.addFlame(x, y - 25, 7, 13, [1.0, 0.62, 0.20], this.phase);
      return;
    }
    if (this.kind === 'lantern') {
      const sway = Math.round(Math.sin(time * 2.2 + this.phase) * 1.5);
      if (assets && assets.frame('arch', 'chain') && assets.img('arch')) {
        assets.draw(ctx, 'arch', 'chain', x, y - 34);
      }
      if (assets && assets.frame('exploration_props', 'hanging_lantern') && assets.img('exploration_props')) {
        assets.draw(ctx, 'exploration_props', 'hanging_lantern', x + sway, y);
      } else if (assets) {
        assets.draw(ctx, 'props', 'candelabra', x + sway, y);
      }
      drawFlameGlow(ctx, x + sway, y - 16, time + this.phase, 26, 0.74);
      if (fx) fx.addFlame(x + sway, y - 14, 6, 10, [1.0, 0.74, 0.28], this.phase + 0.7);
      return;
    }
    assets.draw(ctx, 'props', 'candelabra', x, y);
    drawFlameGlow(ctx, x, y - 54, time + this.phase, 26, 0.7);
    if (fx) { fx.addFlame(x - 7, y - 50, 5, 12, [1.0, 0.6, 0.2], this.phase); fx.addFlame(x, y - 55, 5, 13, [1.0, 0.62, 0.22], this.phase + 1.1); fx.addFlame(x + 7, y - 50, 5, 12, [1.0, 0.6, 0.2], this.phase + 2.3); }
  }
}

// ------------------------------------------------------------------ items

export const ITEM_FRAMES = {
  heart_small: 'heart_small', heart_big: 'heart_big', money: 'money',
  dagger: 'dagger', axe: 'axe', holy_water: 'holy_water',
  cross: 'cross', stopwatch: 'stopwatch',
  meat: 'meat', orb: 'orb',
};

export class Item extends Entity {
  constructor(type, x, y) {
    super(x, y);
    this.type = type;
    this.weaponId = typeof type === 'string' && type.startsWith('weapon:') ? type.slice(7) : null;
    const isOrb = type === 'orb';
    const isWeapon = !!this.weaponId;
    this.w = isOrb ? 20 : (isWeapon ? 18 : 14);
    this.h = isOrb ? 20 : (isWeapon ? 18 : 14);
    this.vy = isOrb ? -130 : (isWeapon ? -180 : -160);
    this.vx = isOrb ? 0 : (Math.random() - 0.5) * 40;
    this.life = isOrb ? Infinity : (isWeapon ? 16 : 8);
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
    }
    // Drops always fall under gravity and settle on the floor; nothing pulls them toward the hunter.
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
    if (this.weaponId) {
      const w = WEAPONS[this.weaponId];
      const bob = Math.sin(time * 4.4) * 2.5;
      const sx = Math.round(this.x - camX);
      const sy = Math.round(this.y - camY - 11 + bob);
      const elem = w && w.element ? ELEMENT_META[w.element] : null;
      ctx.save();
      const g = ctx.createRadialGradient(sx, sy, 2, sx, sy, 20);
      g.addColorStop(0, elem ? `${elem.color}77` : 'rgba(255, 216, 122, 0.48)');
      g.addColorStop(1, 'rgba(10, 8, 22, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(sx - 20, sy - 20, 40, 40);
      const icon = getWeaponIconCanvas(this.weaponId, 'relic');
      if (icon) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(icon, sx - 14, sy - 14, 28, 28);
      } else {
        ctx.fillStyle = elem ? elem.color : '#ffd27a';
        ctx.fillRect(sx - 5, sy - 5, 10, 10);
      }
      ctx.restore();
      return;
    }
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
    if (this.type === 'cross' || this.type === 'stopwatch') {
      const ef = assets && assets.frame('exploration_props', this.type);
      if (ef && assets.img('exploration_props')) {
        assets.draw(ctx, 'exploration_props', this.type, this.x - camX, this.y - camY + bob);
        return;
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
      case 'cross':
        this.vx = dir * 310; this.vy = 0; this.damage = 2.6; this.life = 2.8;
        this.w = 24; this.h = 24; this.pierce = 99;
        this.isBoomerang = true; this.returning = false;
        this.x0 = x; this.y0 = y; this.maxDist = 205; this.returnSpeed = 345;
        this.weaponMeta = { physical: 'cut', element: 'holy', armorPiercing: true, deficit: false };
        break;
      case 'bone': this.vx = dir * 228; this.vy = -375; this.gravity = 0.9; this.damage = 3; this.w = 12; this.h = 12; break;
      case 'sickle': this.vx = dir * 335; this.vy = 0; this.ax = -dir * 355; this.damage = 4; this.life = 2.6; this.w = 22; this.h = 22; this.pierce = 99; break;
      case 'skull': this.vx = dir * 132; this.vy = -30; this.damage = 3; this.life = 2.8; this.w = 14; this.h = 14; this.pierce = 99; this.homing = true; break;
      case 'hellfire': this.vx = dir * 222; this.vy = 0; this.damage = 4; this.life = 2.6; this.w = 16; this.h = 16; this.pierce = 99; break;
      case 'gaze': this.vx = dir * 415; this.vy = 0; this.damage = 4; this.life = 1.6; this.w = 34; this.h = 10; this.pierce = 99; break;
      case 'gas': this.vx = dir * 86; this.vy = 4; this.ax = -dir * 20; this.damage = 2; this.life = 2.7; this.w = 26; this.h = 26; this.pierce = 99; this.petrify = true; break;
      case 'fireball': this.vx = dir * 268; this.vy = 0; this.gravity = 0.12; this.damage = 3; this.life = 2.2; this.w = 14; this.h = 14; break;
      case 'iceshard': this.vx = dir * 296; this.vy = -60; this.gravity = 0.35; this.damage = 3; this.life = 2.1; this.w = 12; this.h = 8; break;
      case 'snowball': this.vx = dir * 220; this.vy = -335; this.gravity = 0.9; this.damage = 3; this.w = 12; this.h = 12; break;
      case 'present': this.vx = dir * 175; this.vy = -425; this.gravity = 1; this.damage = 4; this.w = 16; this.h = 16; this.bursts = true; break;
      case 'spore': this.vx = dir * 150; this.vy = -28; this.damage = 3; this.life = 2.8; this.w = 14; this.h = 14; break;
      case 'shard': this.vx = 0; this.vy = 235; this.gravity = 0.28; this.damage = 3; this.life = 2.6; this.w = 12; this.h = 14; break;
      case 'page': this.vx = dir * 278; this.vy = 0; this.damage = 2; this.life = 2.1; this.w = 14; this.h = 10; break;
      case 'cog': this.vx = dir * 240; this.vy = -335; this.gravity = 0.85; this.damage = 3; this.w = 16; this.h = 16; this.bounces = 2; break;
      case 'thorn': this.vx = dir * 285; this.vy = 0; this.gravity = 0.12; this.damage = 3; this.life = 2.2; this.w = 16; this.h = 8; break;
      case 'magmaball': this.vx = dir * 212; this.vy = -365; this.gravity = 0.88; this.damage = 4; this.life = 2.8; this.w = 16; this.h = 16; break;
      case 'alchflask': this.vx = dir * 215; this.vy = -335; this.gravity = 0.86; this.damage = 3; this.life = 2.6; this.w = 14; this.h = 14; break;
      case 'waterbolt': this.vx = dir * 305; this.vy = 0; this.gravity = 0.05; this.damage = 3; this.life = 2.0; this.w = 18; this.h = 10; break;
      case 'starlance': this.vx = dir * 335; this.vy = 0; this.gravity = 0; this.damage = 4; this.life = 2.1; this.w = 24; this.h = 10; break;
      case 'crimson_wave': this.vx = dir * 340; this.vy = 0; this.damage = 2; this.life = 0.44; this.w = 24; this.h = 26; this.pierce = 3; break;
      case 'weapon_boomerang':
        this.vx = dir * 320; this.vy = 0; this.damage = 2; this.life = 2.5;
        this.w = 22; this.h = 22; this.pierce = 99;
        this.isBoomerang = true; this.returning = false;
        this.x0 = x; this.y0 = y; this.maxDist = 158; this.returnSpeed = 350;
        break;
      case 'silver_beam':
        this.vx = dir * 400; this.vy = 0; this.damage = 2; this.life = 0.50;
        this.w = 26; this.h = 18; this.pierce = 3;
        break;
      case 'holy_wave':
        this.vx = dir * 330; this.vy = 0; this.damage = 2.4; this.life = 0.62;
        this.w = 26; this.h = 28; this.pierce = 4;
        break;
      case 'volt_lance':
        this.vx = dir * 470; this.vy = 0; this.damage = 2.4; this.life = 0.48;
        this.w = 34; this.h = 12; this.pierce = 5;
        break;
      case 'catalyst_fire':
        this.vx = dir * 290; this.vy = 0; this.damage = 2.2; this.life = 1.15;
        this.w = 16; this.h = 16; this.pierce = 1;
        break;
      case 'catalyst_frost':
        this.vx = dir * 345; this.vy = 0; this.damage = 2.1; this.life = 1.05;
        this.w = 18; this.h = 12; this.pierce = 2;
        break;
      case 'catalyst_void':
        this.vx = dir * 235; this.vy = 0; this.damage = 2.4; this.life = 1.65;
        this.w = 18; this.h = 18; this.pierce = 2; this.voidSeek = true;
        break;
      case 'prism_orb':
        this.vx = dir * 315; this.vy = -165; this.damage = 2.2; this.life = 2.6;
        this.w = 16; this.h = 16; this.pierce = 99; this.wallRicochet = 5;
        break;
      case 'helios_beam':
        this.vx = dir * 640; this.vy = 0; this.damage = 2.8; this.life = 0.28;
        this.w = 72; this.h = 16; this.pierce = 99;
        break;
      case 'nova_beam':
        this.vx = dir * 560; this.vy = 0; this.damage = owner === 'enemy' ? 5 : 4.2;
        this.life = 0.42; this.w = 68; this.h = 14; this.pierce = 99;
        break;
      case 'dullahan_helm':
        this.vx = dir * 290; this.vy = -24; this.damage = owner === 'enemy' ? 4 : 3.8;
        this.life = 2.4; this.w = 20; this.h = 20; this.pierce = 99;
        this.isBoomerang = true; this.returning = false;
        this.x0 = x; this.y0 = y; this.maxDist = 148; this.returnSpeed = 310;
        break;
      case 'mini_sickle':
        this.vx = dir * 180; this.vy = -85; this.damage = 1.9; this.life = 2.2;
        this.w = 16; this.h = 16; this.pierce = 2; this.voidSeek = true;
        break;
      case 'abyss_sphere':
        this.vx = dir * 155; this.vy = -90; this.gravity = 0.85; this.damage = owner === 'enemy' ? 4 : 3.6;
        this.life = 3.2; this.w = 20; this.h = 20; this.bounces = 6; this.pierce = owner === 'player' ? 4 : 0;
        break;
      case 'seal_pillar':
        this.vx = 0; this.vy = 0; this.damage = owner === 'enemy' ? 4 : 4.4;
        this.life = 0.52; this.w = 24; this.h = 96; this.pierce = 99;
        break;
      default: this.vx = dir * 200; this.vy = 0;
    }
  }
  get box() { return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h }; }

  update(dt, level, world) {
    if (this.owner === 'enemy' && world && world.chronoFreezeT > 0) return;
    // CHRONO PENDULUM relic & Easy-mode pace soften enemy projectile speed along the same arc
    const relicSlow = (this.owner === 'enemy' && world && world.hasRelic && world.hasRelic('clocktower')) ? 0.8 : 1;
    const diffSlow = (this.owner === 'enemy' && world && world.difficulty && world.difficulty.projTimeScale) ? world.difficulty.projTimeScale : 1;
    const stepDt = dt * relicSlow * diffSlow;
    this.time += stepDt;
    this.life -= stepDt;
    if (this.life <= 0) { this.dead = true; return; }
    dt = stepDt;
    this.vy += 1500 * this.gravity * dt;
    this.vx += this.ax * dt;
    if (this.isBoomerang) {
      if (!this.returning) {
        const dist = Math.hypot(this.x - (this.x0 || 0), this.y - (this.y0 || 0));
        // Smoothly decelerate near apex then reverse & re-arm hitSet for double-hit return!
        if (dist >= (this.maxDist || 155) * 0.78) {
          this.vx -= this.dir * 980 * dt;
        }
        if (dist >= (this.maxDist || 155) || (this.dir * this.vx) <= 18) {
          this.returning = true;
          this.hitSet.clear();
        }
      } else if (world && world.player && world.player.alive) {
        const tx = world.player.x;
        const ty = world.player.y - 34;
        const dx = tx - this.x;
        const dy = ty - this.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 18 && this.time > 0.16) {
          this.dead = true;
          world.particles.sparks(this.x, this.y, 4, '#ffe9a0');
          return;
        }
        const spd = this.returnSpeed || 350;
        this.vx += ((dx / d) * spd - this.vx) * Math.min(1, 11 * dt);
        this.vy += ((dy / d) * spd - this.vy) * Math.min(1, 11 * dt);
      }
    }
    if (this.voidSeek && world && world.enemies) {
      let best = null, bestD = 220;
      for (const e of world.enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - this.x, (e.y - e.h * 0.5) - this.y);
        if (d < bestD) { bestD = d; best = e; }
      }
      if (best) {
        const dx = best.x - this.x, dy = (best.y - best.h * 0.5) - this.y;
        const d = Math.hypot(dx, dy) || 1;
        this.vx += (dx / d) * 340 * dt;
        this.vy += (dy / d) * 340 * dt;
        const s = Math.hypot(this.vx, this.vy);
        if (s > 265) { this.vx *= 265 / s; this.vy *= 265 / s; }
      }
    }
    if (this.homing && world.player.alive) {
      const dx = world.player.x - this.x, dy = (world.player.y - 30) - this.y;
      const d = Math.hypot(dx, dy) || 1;
      this.vx += (dx / d) * 195 * dt; this.vy += (dy / d) * 195 * dt;
      const s = Math.hypot(this.vx, this.vy); if (s > 160) { this.vx *= 160 / s; this.vy *= 160 / s; }
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
    if ((this.type === 'fireball' || this.type === 'magmaball' || this.type === 'catalyst_fire') && Math.random() < 0.65) world.particles.embers(this.x - this.dir * 6, this.y, 1);
    if (this.type === 'alchflask' && Math.random() < 0.65) world.particles.sparks(this.x, this.y - 4, 1, '#52f0d4');
    if (this.type === 'waterbolt' && Math.random() < 0.65) world.particles.sparks(this.x - this.dir * 6, this.y, 1, '#58dcff');
    if (this.type === 'starlance' && Math.random() < 0.75) world.particles.sparks(this.x - this.dir * 7, this.y, 1, '#ffe892');
    if (this.type === 'crimson_wave' && Math.random() < 0.7) world.particles.sparks(this.x - this.dir * 6, this.y + (Math.random() - 0.5) * 14, 1, '#ff4a66');
    if (this.type === 'volt_lance' && Math.random() < 0.8) world.particles.sparks(this.x - this.dir * 8, this.y + (Math.random() - 0.5) * 8, 1, '#ffe66d');
    if (this.type === 'catalyst_void' && Math.random() < 0.55) world.particles.sparks(this.x, this.y, 1, '#c88cff');
    if (this.type === 'spore') {
      this.vy = Math.cos(this.time * 4.8) * 34;
    }
    // Tile contact (player projectiles shatter breakable `T_BLOCK` walls & floor hatches first)
    if (this.owner === 'player' && world && world.shatterBlocksInRect) {
      const broke = world.shatterBlocksInRect({
        x: this.x - this.w * 0.5 - 2,
        y: this.y - this.h * 0.5 - 2,
        w: this.w + 4,
        h: this.h + (this.vy > 0 ? 10 : 4),
      });
      if (broke > 0) {
        if (this.type === 'holy_water') {
          const floorY = Math.floor((this.y + 4) / TILE) * TILE;
          world.spawnFire(this.x, floorY);
          this.dead = true;
          return;
        }
        if (this.pierce > 0) this.pierce--;
        else if (this.type !== 'cross') {
          this.dead = true;
          return;
        }
      }
    }
    const tx = Math.floor(this.x / TILE), ty = Math.floor(this.y / TILE);
    if (level.isSolid(tx, ty) || (this.type === 'holy_water' && this.vy > 0 && level.isStandable(tx, Math.floor((this.y + 4) / TILE)))) {
      if (this.type === 'holy_water') {
        const floorY = Math.floor((this.y + 4) / TILE) * TILE;
        world.spawnFire(this.x, floorY);
      } else if (this.type === 'alchflask') {
        world.particles.sparks(this.x, this.y - 4, 10, '#52f0d4');
        world.particles.embers(this.x, this.y - 4, 6);
        if (this.vy > 0) {
          world.spawnFire(this.x, ty * TILE, 'enemy');
        }
      } else if (this.type === 'waterbolt') {
        world.particles.sparks(this.x, this.y, 7, '#6ce6ff');
      } else if (this.type === 'starlance') {
        world.particles.sparks(this.x, this.y, 8, '#ffe892');
      } else if (this.type === 'dagger') {
        world.particles.sparks(this.x, this.y, 4, '#cfd8e8');
      } else if (this.type === 'fireball' || this.type === 'catalyst_fire') {
        world.particles.embers(this.x, this.y, 8);
      } else if (this.type === 'catalyst_frost') {
        world.particles.dust(this.x, this.y, 5, '#8ad8ff');
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
      } else if (this.type === 'cog' || this.type === 'abyss_sphere') {
        world.particles.sparks(this.x, this.y, 5, this.type === 'abyss_sphere' ? '#c88cff' : '#ffd27a');
        if (this.bounces > 0 && this.vy > 0) {
          this.bounces--;
          this.y = ty * TILE - this.h / 2 - 1;
          this.vy = this.type === 'abyss_sphere' ? -155 : -260;
          this.vx *= this.type === 'abyss_sphere' ? 0.96 : 0.85;
          if (this.type === 'cog') world.sfx('block');
          return;
        }
      } else if (this.type === 'prism_orb' && this.wallRicochet > 0) {
        // High-velocity 2D ricochet off solid walls, floors & ceilings!
        this.wallRicochet--;
        const prevTx = Math.floor((this.x - this.vx * dt) / TILE);
        const prevTy = Math.floor((this.y - this.vy * dt) / TILE);
        let flipped = false;
        if (prevTx !== tx && level.isSolid(tx, prevTy)) {
          this.vx = -this.vx;
          this.dir = this.vx >= 0 ? 1 : -1;
          this.x += this.vx * dt * 1.4;
          flipped = true;
        }
        if (prevTy !== ty && level.isSolid(prevTx, ty)) {
          this.vy = -this.vy;
          this.y += this.vy * dt * 1.4;
          flipped = true;
        }
        if (!flipped) {
          this.vy = -this.vy;
          this.vx = -this.vx;
        }
        this.hitSet.clear();
        world.particles.sparks(this.x, this.y, 5, '#ff7ae2');
        return;
      }
      if (![
        'sickle', 'skull', 'hellfire', 'gaze', 'gas', 'crimson_wave', 'cross',
        'weapon_boomerang', 'silver_beam', 'holy_wave', 'volt_lance', 'catalyst_void',
        'helios_beam', 'nova_beam', 'dullahan_helm', 'mini_sickle', 'seal_pillar',
      ].includes(this.type)) this.dead = true;
    }
    if (!this.isBoomerang && (this.y > level.height + 60 || this.x < -40 || this.x > level.width + 40)) this.dead = true;
  }

  draw(ctx, assets, camX, camY) {
    const x = Math.round(this.x - camX), y = Math.round(this.y - camY);
    if (x < -56 || x > 696 || y < -56 || y > 416) return;
    const fx = getFxLayers();
    const useFx = !!(fx && fx.enabled);
    const pImg = assets ? assets.img('projectiles') : null;
    const extraImg = assets ? assets.img('extra_projectiles') : null;
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
    const drawExtraSprite = (name, rot = 0, flipX = false, scale = 1) => {
      const f = assets && assets.frame('extra_projectiles', name);
      if (!f || !extraImg) return false;
      ctx.save();
      if (rot) ctx.rotate(rot);
      if (flipX || scale !== 1) ctx.scale(flipX ? -scale : scale, scale);
      ctx.drawImage(extraImg, f.x, f.y, f.w, f.h, -f.w / 2, -f.h / 2, f.w, f.h);
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
      case 'cross': {
        if (useFx) {
          fx.addAttack({
            x, y, rx: 18, ry: 18, dirX: Math.cos(this.spin * 1.4), dirY: Math.sin(this.spin * 1.4),
            mode: 3, seed, core: [1.0, 0.99, 0.90], rim: [0.46, 0.84, 1.0], alpha: 0.86,
          });
        }
        const cf = assets && assets.frame('exploration_props', 'cross');
        const cImg = assets && assets.img('exploration_props');
        ctx.rotate(this.spin * 1.35);
        if (cf && cImg) {
          ctx.drawImage(cImg, cf.x, cf.y, cf.w, cf.h, -cf.w / 2, -cf.h / 2, cf.w, cf.h);
        } else {
          ctx.fillStyle = '#eaf6ff';
          ctx.fillRect(-10, -2, 20, 4);
          ctx.fillRect(-2, -10, 4, 20);
        }
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
        if (!drawExtraSprite('snowball', this.spin * 0.4, false, 0.9)) {
          ctx.fillStyle = '#eef6ff';
          ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#b9d4f2';
          ctx.fillRect(-2, 1, 3, 2); ctx.fillRect(1, -3, 2, 2);
        }
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
        if (!drawExtraSprite('spore', Math.sin(this.time * 6) * 0.2, false, 0.85)) {
          ctx.fillStyle = '#52e8b8';
          ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#d8fff0';
          ctx.fillRect(-2, -2, 3, 3);
        }
        break;
      }
      case 'shard': {
        if (!drawExtraSprite('shard', this.spin * 0.4, false, 0.9)) {
          ctx.rotate(this.spin * 0.4);
          ctx.fillStyle = '#7e8292';
          ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, -2); ctx.lineTo(4, 7); ctx.lineTo(-5, 5); ctx.lineTo(-6, -3); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#b8bccb';
          ctx.fillRect(-2, -5, 3, 4);
        }
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
        if (!drawExtraSprite('thorn', ang, false, 0.9)) {
          ctx.rotate(ang);
          ctx.fillStyle = '#4a352c';
          ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-7, -4); ctx.lineTo(-4, 0); ctx.lineTo(-7, 4); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#62f2c2';
          ctx.fillRect(-3, -1, 9, 2);
        }
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
      case 'weapon_boomerang': {
        const elem = this.weaponElement ? ELEMENT_META[this.weaponElement] : null;
        if (useFx) {
          fx.addAttack({
            x, y, rx: 15, ry: 15, dirX: Math.cos(this.spin * 1.4), dirY: Math.sin(this.spin * 1.4),
            mode: 3, seed,
            core: elem ? elem.core : [1.0, 0.96, 0.82],
            rim: elem ? elem.rim : [0.95, 0.72, 0.28],
            alpha: 0.78,
          });
        }
        ctx.rotate(this.spin * 1.5);
        const icon = this.weaponId ? getWeaponIconCanvas(this.weaponId, 'relic') : null;
        if (icon) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(icon, -14, -14, 28, 28);
        } else {
          ctx.strokeStyle = elem ? elem.color : '#ffe89e';
          ctx.lineWidth = 3;
          ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke();
        }
        break;
      }
      case 'silver_beam': {
        if (useFx) {
          fx.addAttack({
            x, y, rx: 16, ry: 12, dirX: this.dir, dirY: 0,
            mode: 3, seed, core: [0.96, 0.99, 1.0], rim: [0.52, 0.82, 1.0], alpha: 0.92,
          });
          break;
        }
        ctx.scale(this.dir, 1);
        ctx.strokeStyle = '#dce8ff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(-3, 0, 10, -0.95, 0.95); ctx.stroke();
        break;
      }
      case 'holy_wave': {
        if (useFx) {
          fx.addAttack({
            x, y, rx: 18, ry: 20, dirX: this.dir, dirY: 0,
            mode: 3, seed, core: [1.0, 0.98, 0.86], rim: [1.0, 0.80, 0.28], alpha: 0.96,
          });
          break;
        }
        ctx.scale(this.dir, 1);
        ctx.strokeStyle = '#ffe89e'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(-4, 0, 13, -1.1, 1.1); ctx.stroke();
        break;
      }
      case 'volt_lance': {
        if (useFx) {
          fx.addAttack({
            x, y, rx: 24, ry: 8.5, dirX: this.dir, dirY: 0,
            mode: 4, seed, core: [1.0, 1.0, 0.86], rim: [1.0, 0.86, 0.18], alpha: 0.98,
          });
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-16, -1, 32, 2);
          ctx.fillRect(this.dir * 12 - 2, -2, 4, 4);
          break;
        }
        ctx.fillStyle = '#fff8c8';
        ctx.fillRect(-14, -2, 28, 4);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(this.dir * 8 - 3, -1, 6, 2);
        break;
      }
      case 'catalyst_fire': {
        if (useFx) {
          fx.addAttack({
            x, y, rx: 13, ry: 22, dirX: this.vx || this.dir, dirY: this.vy,
            mode: 0, seed, core: [1.0, 0.95, 0.72], rim: [1.0, 0.36, 0.08], alpha: 0.95,
          });
        }
        ctx.fillStyle = '#fff2b0';
        ctx.fillRect(-3, -3, 6, 6);
        break;
      }
      case 'catalyst_frost': {
        const ang = Math.atan2(this.vy, this.vx || this.dir);
        if (useFx) {
          fx.addAttack({
            x, y, rx: 12, ry: 18, dirX: Math.cos(ang), dirY: Math.sin(ang),
            mode: 0, seed, core: [0.92, 0.99, 1.0], rim: [0.28, 0.74, 1.0], alpha: 0.88,
          });
        }
        ctx.rotate(ang);
        ctx.fillStyle = '#dff6ff';
        ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-7, -4); ctx.lineTo(-4, 0); ctx.lineTo(-7, 4); ctx.closePath(); ctx.fill();
        break;
      }
      case 'catalyst_void': {
        if (useFx) {
          fx.addAttack({
            x, y, rx: 14, ry: 14, dirX: this.vx || this.dir, dirY: this.vy,
            mode: 0, seed, core: [0.94, 0.86, 1.0], rim: [0.60, 0.22, 0.98], alpha: 0.92,
          });
        }
        ctx.fillStyle = '#241038';
        ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#d8a8ff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.stroke();
        break;
      }
      case 'alchflask': {
        if (useFx) {
          fx.addAttack({
            x, y, rx: 13, ry: 20, dirX: this.vx || this.dir, dirY: this.vy,
            mode: 0, seed, core: [0.76, 1.0, 0.94], rim: [1.0, 0.62, 0.14], alpha: 0.92,
          });
        }
        if (!drawExtraSprite('alchflask', this.spin * 0.75, false, 0.92)) {
          ctx.rotate(this.spin * 0.75);
          ctx.fillStyle = '#2ad8c8';
          ctx.beginPath(); ctx.arc(0, 1, 5.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#d89b3c';
          ctx.fillRect(-2, -6, 4, 4);
          ctx.fillStyle = '#e8fffb';
          ctx.fillRect(-2, -1, 2, 2);
        }
        break;
      }
      case 'waterbolt': {
        const ang = Math.atan2(this.vy, this.vx || this.dir);
        if (useFx) {
          fx.addAttack({
            x, y, rx: 15, ry: 9, dirX: Math.cos(ang), dirY: Math.sin(ang),
            mode: 1, seed, core: [0.88, 0.99, 1.0], rim: [0.16, 0.76, 0.96], alpha: 0.92,
          });
        }
        ctx.rotate(ang);
        ctx.fillStyle = '#38c8ee';
        ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(-8, -4); ctx.lineTo(-5, 0); ctx.lineTo(-8, 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#e6fcff';
        ctx.fillRect(-3, -1, 9, 2);
        break;
      }
      case 'starlance': {
        const ang = Math.atan2(this.vy, this.vx || this.dir);
        if (useFx) {
          fx.addAttack({
            x, y, rx: 19, ry: 8, dirX: Math.cos(ang), dirY: Math.sin(ang),
            mode: 1, seed, core: [1.0, 0.99, 0.88], rim: [1.0, 0.80, 0.24], alpha: 0.96,
          });
        }
        ctx.rotate(ang);
        ctx.fillStyle = '#ffd668';
        ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-10, -4); ctx.lineTo(-6, 0); ctx.lineTo(-10, 4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-6, -1, 14, 2);
        break;
      }
      case 'prism_orb': {
        if (useFx) {
          fx.addAttack({
            x, y, rx: 14, ry: 14, dirX: this.vx || this.dir, dirY: this.vy,
            mode: 0, seed, core: [1.0, 0.88, 0.98], rim: [0.92, 0.22, 0.78], alpha: 0.95,
          });
        }
        if (!drawExtraSprite('prism_orb', this.spin * 0.6, false, 0.92)) {
          ctx.fillStyle = '#ff6ad5';
          ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(-1, -1, 3.5, 0, Math.PI * 2); ctx.fill();
        }
        break;
      }
      case 'helios_beam':
      case 'nova_beam': {
        const isNova = this.type === 'nova_beam';
        const rimCol = this.beamHex || (isNova ? '#28e8f8' : '#ff8a24');
        const midCol = isNova ? '#9efcff' : '#ffe878';
        if (useFx) {
          fx.addAttack({
            x, y, rx: 44, ry: 12.5, dirX: this.dir, dirY: 0,
            mode: 4, seed,
            core: this.beamCore || (isNova ? [0.92, 1.0, 1.0] : [1.0, 0.99, 0.88]),
            rim: this.beamRim || (isNova ? [0.12, 0.88, 1.0] : [1.0, 0.48, 0.12]),
            alpha: 0.98,
          });
          // Incandescent 2px core filament + nose star spark; outer corona & helices come from Mode 4 GLSL shader
          ctx.globalAlpha = 0.92;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-36, -1, 72, 2);
          ctx.fillRect(this.dir * 32 - 2, -2, 5, 4);
          break;
        }
        ctx.fillStyle = rimCol;
        ctx.fillRect(-34, -6, 68, 12);
        ctx.fillStyle = midCol;
        ctx.fillRect(-34, -4, 68, 8);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-34, -2, 68, 4);
        break;
      }
      case 'dullahan_helm': {
        if (useFx) {
          fx.addAttack({
            x, y, rx: 16, ry: 16, dirX: this.vx || this.dir, dirY: this.vy,
            mode: 0, seed, core: [0.85, 0.98, 1.0], rim: [0.58, 0.22, 0.96], alpha: 0.88,
          });
        }
        if (!drawExtraSprite('dullahan_helm', Math.sin(this.time * 12) * 0.15, (this.vx || this.dir) < 0, 0.92)) {
          ctx.rotate(this.spin * 0.45);
          ctx.fillStyle = '#3b2858';
          ctx.fillRect(-7, -7, 14, 13);
          ctx.fillStyle = '#b85cff';
          ctx.fillRect(-9, -11, 8, 5);
          ctx.fillStyle = '#52f8e8';
          ctx.fillRect(0, -3, 6, 3);
        }
        break;
      }
      case 'mini_sickle': {
        if (useFx) {
          fx.addAttack({
            x, y, rx: 12, ry: 12, dirX: Math.cos(this.spin), dirY: Math.sin(this.spin),
            mode: 3, seed, core: [0.94, 0.90, 1.0], rim: [0.62, 0.28, 0.98], alpha: 0.82,
          });
        }
        if (!drawProjSprite('sickle', this.spin * 1.4, false, 0.68)) {
          ctx.rotate(this.spin * 1.4);
          ctx.strokeStyle = '#e8dcff'; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(0, 0, 7, 0.2, Math.PI * 1.35); ctx.stroke();
        }
        break;
      }
      case 'abyss_sphere': {
        if (useFx) {
          fx.addAttack({
            x, y, rx: 15, ry: 15, dirX: this.dir, dirY: 0,
            mode: 0, seed, core: [0.92, 0.78, 1.0], rim: [0.46, 0.14, 0.82], alpha: 0.92,
          });
        }
        if (!drawExtraSprite('abyss_sphere', this.spin * 0.5, false, 0.94)) {
          ctx.fillStyle = '#2a0e46';
          ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#d47aff'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(0, 0, 8.5, 0, Math.PI * 2); ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-2, -3, 3, 3);
        }
        break;
      }
      case 'seal_pillar': {
        const k = Math.sin(Math.min(1, this.time / 0.52) * Math.PI);
        const w0 = Math.max(4, Math.round(20 * k));
        if (useFx) {
          fx.addAttack({
            x, y, rx: w0 * 0.9, ry: 48, dirX: 0, dirY: -1,
            mode: 1, seed, core: [1.0, 0.98, 0.82], rim: [0.98, 0.68, 0.16], alpha: 0.94 * k,
          });
        }
        ctx.fillStyle = '#ffb838';
        ctx.fillRect(-w0 >> 1, -48, w0, 96);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-Math.max(2, w0 >> 2), -48, Math.max(2, w0 >> 1), 96);
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
    this.tick = 0.20; this.dead = false;
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
