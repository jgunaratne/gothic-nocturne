// Stage bosses built on the enemy sheets (scaled/tinted) plus the Count.
// The Phantom Reaper lives in boss.js; the Reaper Lord extends it.

import { SCORE } from '../engine/constants.js';
import {
  Enemy, Bat, MedusaHead, Pumpkin, FrostWisp, NightOwl, Phantom, CursedTome,
  Gargoyle, MagmaSlime, CinderImp, PlagueAlchemist, PhantomDuelist,
  AbyssalMerman, FallenValkyrie,
} from './enemies.js';
import { Projectile } from './objects.js';
import { Reaper } from './boss.js';
import { getGlowCanvas } from './tex3d.js';
import { getFxLayers } from '../engine/fxlayers.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** Shared boss plumbing: entrance fade, phase 2, hit/death handling. */
class Boss extends Enemy {
  constructor(x, y, arena, difficulty) {
    super(x, y);
    this.arena = arena;
    this.tempo = difficulty ? difficulty.bossTempo : 1;
    this.phase2At = difficulty ? difficulty.bossPhase2 : 0.5;
    this.score = SCORE.boss;
    this.state = 'enter'; this.stateT = 0; this.t = 0;
    this.alpha = 0; this.phase2 = false; this.fired = false;
    this.touchDamage = 4;
    this.swingDamage = 5;
    this.aura = 'rgba(120, 60, 200, 0.22)';
  }

  get alive() { return !this.dead && this.deathT < 0; }
  setState(s) { this.state = s; this.stateT = 0; this.fired = false; }
  faceP(p) { this.facing = p.x > this.x ? 1 : -1; }
  clampX(m = 30) { this.x = clamp(this.x, this.arena.x0 + m, this.arena.x1 - m); }
  swingBox() { return null; }

  checkPhase2(world) {
    if (!this.phase2 && this.hp <= this.maxHp * this.phase2At) {
      this.phase2 = true; world.sfx('boss_roar'); world.camera.shake(5, 0.5);
      if (world.emitShockwave) {
        world.emitShockwave(this.x, this.y - this.h * 0.45, { maxR: 165, dur: 0.55, strength: 1.0, color: [0.95, 0.45, 0.95] });
      }
      this.onPhase2 && this.onPhase2(world);
    }
  }

  takeHit(dmg, fromX, world) {
    if (!this.alive || this.state === 'enter' || this.alpha < 0.6) return false;
    this.hp -= dmg;
    this.flash = 0.12;
    world.sfx('boss_hit');
    world.particles.sparks(this.x + (Math.random() - 0.5) * 30, this.y - this.h / 2, 8, '#ffd27a');
    if (this.hp <= 0) {
      this.hp = 0; this.deathT = 0; this.vx = 0; this.vy = 0;
      world.sfx('boss_die'); world.camera.shake(8, 1.2); world.addScore(this.score);
      if (world.awardEnemyExp) world.awardEnemyExp(this, { isBoss: true });
    }
    return this.hp <= 0;
  }

  updateDeath(dt, world, fall = 0) {
    this.deathT += dt;
    if (Math.random() < 0.6) world.particles.sparks(this.x + (Math.random() - 0.5) * 60, this.y - Math.random() * this.h, 3, '#ffe0a0');
    if (Math.random() < 0.3) world.particles.smoke(this.x, this.y - 30, 2, 'rgba(120,60,200,0.5)');
    this.alpha = Math.max(0, 1 - this.deathT / 2.4);
    this.y = Math.min(this.arena.floorY - 6, this.y + fall * dt);
    this.clampX(36);
    if (this.deathT > 2.6) { this.dead = true; world.onBossDefeated(this); }
  }

  drawAura(ctx, x, y, r) {
    const kind = this.auraKind || (this.aura.includes('220, 40') ? 'crimson' : this.aura.includes('255, 140') ? 'amber' : 'violet');
    const glow = getGlowCanvas(kind);
    if (!glow) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = this.alpha * 0.42;
    ctx.drawImage(glow, x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }

  draw(ctx, assets, camX, camY) {
    if (this.alpha <= 0) return;
    this.drawAura(ctx, this.x - camX, this.y - camY - this.h / 2, this.h);
    this.drawSprite(ctx, assets, camX, camY, this.facing < 0, this.alpha);
  }
}

// ------------------------------------------------------------- Great Bat

export class GiantBat extends Boss {
  constructor(x, y, arena, difficulty) {
    super(x, y, arena, difficulty);
    this.sheet = 'giantbat'; this.frame = 'fly1'; this.scale = 1; this.w = 84; this.h = 52;
    this.hp = 38; this.maxHp = 38; this.flies = true; this.gravityScale = 0;
    this.hangY = Math.max(arena.ceilY + 86, arena.floorY - 138); this.cycle = 0; this.facing = -1;
    this.aura = 'rgba(90, 40, 140, 0.25)';
  }

  update(dt, level, world) {
    this.t += dt; this.stateT += dt; this.flash = Math.max(0, this.flash - dt);
    if (this.deathT >= 0) { this.updateDeath(dt, world, 70); return; }
    this.checkPhase2(world);
    const p = world.player, a = this.arena;
    const flap = ['fly0', 'fly1', 'fly2', 'fly1'];
    this.frame = flap[Math.floor(this.t * (this.state === 'hang' ? 6 : 12)) % 4];
    const bob = Math.sin(this.t * 2.4) * 6;
    switch (this.state) {
      case 'enter':
        this.alpha = Math.min(1, this.stateT / 1.2);
        this.y = this.hangY + bob;
        if (this.stateT > 1.5) this.setState('hang');
        break;
      case 'hang': {
        this.alpha = 1; this.faceP(p);
        const tx = clamp(p.x, a.x0 + 70, a.x1 - 70);
        this.x += (tx - this.x) * Math.min(1, dt * 1.45);
        this.y = this.hangY + bob;
        if (this.stateT > (this.phase2 ? 0.92 : 1.38) * this.tempo) {
          this.cycle++;
          if (this.cycle % 3 === 0) this.setState('summon');
          else {
            this.setState('dive');
            world.sfx('bat_flutter');
            this.from = { x: this.x, y: this.y };
            this.via = { x: p.x, y: p.y - 20 };
            const dir = p.x > this.x ? 1 : -1;
            this.to = { x: clamp(p.x + dir * 250, a.x0 + 60, a.x1 - 60), y: this.hangY };
          }
        }
        break;
      }
      case 'dive': {
        // Quadratic curve: ceiling -> through the hunter -> back up beyond.
        const dur = (this.phase2 ? 0.92 : 1.22) * this.tempo;
        const k = Math.min(1, this.stateT / dur);
        const q = (p0, p1, p2) => (1 - k) * (1 - k) * p0 + 2 * (1 - k) * k * p1 + k * k * p2;
        const nx = q(this.from.x, this.via.x, this.to.x);
        this.facing = nx >= this.x ? 1 : -1;
        this.x = nx; this.y = q(this.from.y, this.via.y, this.to.y);
        if (k > 0.2 && k < 0.75) this.frame = 'dive';
        if (k >= 1) { this.setState('cross'); this.crossY = p.y - 40; this.facing = p.x > this.x ? 1 : -1; }
        break;
      }
      case 'cross':
        this.x += this.facing * (this.phase2 ? 205 : 165) * dt;
        this.y = this.crossY + Math.sin(this.stateT * 5) * 20;
        if (this.phase2 && !this.fired && this.stateT > 0.28) {
          this.fired = true;
          const hf = new Projectile('hellfire', this.x + this.facing * 24, this.y - 18, this.facing, 'enemy');
          const ang = Math.atan2((p.y - 28) - (this.y - 18), p.x - this.x);
          hf.vx = Math.cos(ang) * 215; hf.vy = Math.sin(ang) * 215;
          world.spawnProjectile(hf);
          world.sfx('fire');
        }
        if (this.x < a.x0 + 40 || this.x > a.x1 - 40) { this.clampX(40); this.setState('hang'); }
        break;
      case 'summon':
        this.y = this.hangY + bob;
        if (this.stateT > 0.42 && !this.fired) {
          this.fired = true;
          const adds = world.enemies.filter((e) => e !== this && e.alive).length;
          if (adds < 3) {
            const n = this.phase2 ? 3 : 2;
            for (let i = 0; i < n; i++) {
              const b = new Bat(this.x + (i - (n - 1) * 0.5) * 28, this.y + 14, this.phase2 && i === 1 ? 'fire' : 'normal');
              b.wake(i % 2 ? 1 : -1, p.y - 38); b.homeX = this.x; b.active = true;
              world.spawnEnemy(b);
            }
          }
          world.sfx('bat_flutter');
        }
        if (this.stateT > 1.05) this.setState('hang');
        break;
      default: this.setState('hang');
    }
  }
}

// ---------------------------------------------------------- Bone Captain

export class BoneCaptain extends Boss {
  constructor(x, y, arena, difficulty) {
    super(x, y, arena, difficulty);
    this.sheet = 'bonecaptain'; this.scale = 1; this.w = 34; this.h = 94;
    this.hp = 88; this.maxHp = 88; this.tint = null;
    this.speed = 72; this.facing = -1; this.volleyCd = 1.0; this.chargeCd = 2.6; this.leapCd = 1.6;
    this.aura = 'rgba(200, 60, 60, 0.18)';
  }

  update(dt, level, world) {
    this.t += dt; this.stateT += dt; this.flash = Math.max(0, this.flash - dt);
    if (this.deathT >= 0) { this.updateDeath(dt, world); return; }
    this.checkPhase2(world);
    const p = world.player;
    this.volleyCd -= dt; this.chargeCd -= dt; this.leapCd -= dt;
    const isGladiator = this.sheet === 'gladiator';
    const walk = isGladiator ? ['walk0', 'walk1', 'walk0', 'walk1'] : ['walk0', 'walk1', 'walk2', 'walk3'];
    const dx = p.x - this.x;
    switch (this.state) {
      case 'enter':
        this.alpha = Math.min(1, this.stateT / 1.2);
        this.frame = 'walk0';
        this.physics(level, dt);
        if (this.stateT > 1.4) this.setState('walk');
        break;
      case 'walk': {
        this.alpha = 1; this.faceP(p);
        const sp = this.speed * (this.phase2 ? 1.5 : 1.1);
        this.vx = Math.abs(dx) > 54 ? this.facing * sp : 0;
        this.frame = walk[Math.floor(this.t * 8) % 4];
        this.physics(level, dt); this.clampX(20);
        if (this.onGround && this.volleyCd <= 0 && Math.abs(dx) < 290 && Math.abs(dx) > 56) this.setState('volley');
        else if (this.onGround && this.chargeCd <= 0 && Math.abs(dx) > 135) { this.setState('charge'); world.sfx('knight_slash'); }
        else if (this.onGround && this.leapCd <= 0 && (p.y < this.y - 45 || Math.abs(dx) < 160)) {
          this.setState('leap');
          this.vy = -590;
          this.vx = this.facing * 195;
        }
        break;
      }
      case 'volley':
        this.vx = 0; this.physics(level, dt);
        this.frame = this.stateT < 0.32 ? 'throw0' : 'throw1';
        if (this.stateT >= 0.32 && !this.fired) {
          this.fired = true;
          const n = this.phase2 ? 6 : 4;
          for (let i = 0; i < n; i++) {
            const pKind = isGladiator ? (i % 2 === 0 ? 'axe' : 'starlance') : 'bone';
            const pr = new Projectile(pKind, this.x + this.facing * 20, this.y - 80, this.facing, 'enemy');
            if (pKind === 'starlance') {
              const ang = Math.atan2((p.y - 30) - (this.y - 80), p.x - this.x) + (i - (n - 1) * 0.5) * 0.12;
              pr.vx = Math.cos(ang) * 320; pr.vy = Math.sin(ang) * 320; pr.dir = pr.vx >= 0 ? 1 : -1;
            } else {
              pr.vx = this.facing * (145 + i * 48); pr.vy = -315 - i * 46; pr.damage = 3;
            }
            world.spawnProjectile(pr);
          }
          world.sfx(isGladiator ? 'throw' : 'bone');
        }
        if (this.stateT > 0.74) { this.setState('walk'); this.volleyCd = (1.65 + Math.random() * 0.7) * this.tempo; }
        break;
      case 'charge':
        this.vx = this.facing * (this.phase2 ? 320 : 285);
        this.frame = isGladiator ? 'throw1' : walk[Math.floor(this.t * 18) % 4];
        this.physics(level, dt); this.clampX(20);
        if (this.hitWall || this.stateT > 0.85 || this.x <= this.arena.x0 + 22 || this.x >= this.arena.x1 - 22) {
          this.setState('walk'); this.chargeCd = (2.3 + Math.random() * 0.8) * this.tempo; world.camera.shake(4, 0.24);
        }
        break;
      case 'leap':
        this.frame = 'walk1';
        this.physics(level, dt); this.clampX(20);
        if (this.onGround && this.stateT > 0.18) {
          this.setState('walk');
          this.leapCd = 2.2 * this.tempo;
          world.camera.shake(5, 0.26);
          world.particles.dust(this.x, this.y, 12);
          for (const d of [-1, 1]) {
            const cw = new Projectile('crimson_wave', this.x + d * 22, this.y - 20, d, 'enemy');
            cw.vx = d * 265; cw.life = 0.72; cw.damage = 3;
            world.spawnProjectile(cw);
          }
          world.sfx('block');
        }
        break;
      default: this.setState('walk');
    }
  }

  swingBox() {
    if (this.state !== 'charge') return null;
    return { x: this.facing > 0 ? this.x : this.x - 46, y: this.y - 82, w: 46, h: 72 };
  }
}

// ---------------------------------------------------------- Gorgon Queen

export class Gorgon extends Boss {
  constructor(x, y, arena, difficulty) {
    super(x, y, arena, difficulty);
    this.sheet = 'gorgon'; this.frame = 'a'; this.scale = 1; this.w = 56; this.h = 64;
    this.hp = 120; this.maxHp = 120; this.flies = true; this.gravityScale = 0;
    this.centerY = arena.floorY - 98; this.facing = -1;
    this.aura = 'rgba(90, 200, 120, 0.2)';
  }

  update(dt, level, world) {
    this.t += dt; this.stateT += dt; this.flash = Math.max(0, this.flash - dt);
    if (this.deathT >= 0) { this.updateDeath(dt, world, 40); return; }
    this.checkPhase2(world);
    const p = world.player, a = this.arena;
    const isOracle = this.sheet === 'oracle';
    this.frame = Math.floor(this.t * 6) % 2 ? 'a' : 'b';
    const dx = p.x - this.x;
    switch (this.state) {
      case 'enter':
        this.alpha = Math.min(1, this.stateT / 1.3);
        this.y = this.centerY + Math.sin(this.t * 1.6) * 20;
        if (this.stateT > 1.5) this.setState('drift');
        break;
      case 'drift': {
        this.alpha = 1; this.faceP(p);
        const tx = clamp(p.x + (dx > 0 ? -125 : 125), a.x0 + 50, a.x1 - 50);
        this.x += Math.sign(tx - this.x) * Math.min(Math.abs(tx - this.x), (this.phase2 ? 115 : 88) * dt);
        this.y = this.centerY + Math.sin(this.t * 1.8) * 30;
        if (this.stateT > (this.phase2 ? 1.22 : 1.68) * this.tempo) {
          const r = Math.random();
          if (Math.abs(dx) < 125 || r > 0.72) this.setState('dash');
          else if (r < 0.48) this.setState('gaze');
          else this.setState('spawn');
        }
        break;
      }
      case 'gaze': {
        this.frame = 'stare';
        // Charge the stare, then fire petrifying streaks (+ pressurized waterbolt fan for Oracle).
        if (this.stateT < 0.5 && Math.random() < 0.6) world.particles.sparks(this.x + this.facing * 24, this.y - 40, 2, isOracle ? '#6ce6ff' : '#ffe9a0');
        const shots = this.phase2 ? 3 : 2;
        const firedCount = this.firedCount || 0;
        if (this.stateT > 0.48 + firedCount * 0.24 && firedCount < shots) {
          this.firedCount = firedCount + 1;
          this.faceP(p);
          const pr = new Projectile('gaze', this.x + this.facing * 30, this.y - 36, this.facing, 'enemy');
          pr.vy = clamp(((p.y - 30) - (this.y - 36)) / 0.62, -165, 165);
          world.spawnProjectile(pr);
          if (isOracle) {
            const baseAng = Math.atan2((p.y - 30) - (this.y - 36), p.x - this.x);
            for (const off of [-0.22, 0.22]) {
              const wb = new Projectile('waterbolt', this.x + this.facing * 26, this.y - 36, this.facing, 'enemy');
              const ang = baseAng + off;
              wb.vx = Math.cos(ang) * 305; wb.vy = Math.sin(ang) * 305; wb.dir = wb.vx >= 0 ? 1 : -1;
              world.spawnProjectile(wb);
            }
          }
          world.sfx(isOracle ? 'ice_shard' : 'petrify_gas');
        }
        if (this.stateT > 1.28) { this.firedCount = 0; this.setState('drift'); }
        break;
      }
      case 'spawn':
        if (this.stateT > 0.42 && !this.fired) {
          this.fired = true;
          const adds = world.enemies.filter((e) => e !== this && e.alive).length;
          if (adds < 3) {
            if (isOracle) {
              const fromLeft = p.x > (a.x0 + a.x1) * 0.5;
              const mx = fromLeft ? a.x0 + 36 : a.x1 - 36;
              const mm = new AbyssalMerman(mx, a.floorY, a.x0 + 24, a.x1 - 24);
              world.spawnEnemy(mm);
              const mh = new MedusaHead(this.x + this.facing * 20, this.y - 30, this.facing);
              mh.baseY = p.y - 36; mh.active = true;
              world.spawnEnemy(mh);
            } else {
              const n = this.phase2 ? 3 : 2;
              for (let i = 0; i < n; i++) {
                const m = new MedusaHead(this.x + this.facing * 20, this.y - 30 + (i - (n - 1) * 0.5) * 22, this.facing);
                m.baseY = p.y - 36 + (i - (n - 1) * 0.5) * 24;
                m.active = true;
                world.spawnEnemy(m);
              }
            }
          }
          world.sfx('fire');
        }
        if (this.stateT > 0.92) this.setState('drift');
        break;
      case 'dash': {
        if (this.stateT < 0.05) { this.faceP(p); this.dashY = p.y - 36; }
        this.x += this.facing * (this.phase2 ? 310 : 275) * dt;
        this.y += (this.dashY - this.y) * Math.min(1, dt * 4.2);
        if (this.x < a.x0 + 40 || this.x > a.x1 - 40) { this.clampX(40); this.setState('drift'); }
        break;
      }
      default: this.setState('drift');
    }
  }
}

// ------------------------------------------------------------ Reaper Lord

export class ReaperLord extends Reaper {
  constructor(x, y, arena, difficulty) {
    super(x, y, arena, difficulty);
    this.hp = 180; this.maxHp = 180;
    // Gilded-amber sovereign glaze subtle enough to preserve dark cloak folds & crimson eyes
    this.tint = 'rgba(255, 184, 68, 0.21)';
    this.tempo *= 0.76;
    this.phase2 = true;          // starts with the full move set
    this.enraged = false;
    this.auraRgb = [255, 168, 52];
    this.auraOuterRgb = [184, 24, 46];
    this.slashCore = '#fff6d8';
    this.slashRim = 'rgba(255, 142, 38, 0.88)';
    this.trailTint = 'rgba(255, 152, 44, 0.58)';
    this.sparkColor = '#ffd27a';
    this.smokeColor = 'rgba(186, 44, 52, 0.50)';
  }

  takeHit(dmg, fromX, world) {
    const died = super.takeHit(dmg, fromX, world);
    if (!died && !this.enraged && this.hp <= this.maxHp * 0.55) {
      this.enraged = true;
      this.tempo *= 0.72;
      this.tint = 'rgba(255, 124, 52, 0.26)';
      this.auraRgb = [255, 112, 48];
      this.slashRim = 'rgba(255, 76, 52, 0.92)';
      this.trailTint = 'rgba(255, 92, 54, 0.62)';
      world.sfx('boss_roar');
      world.camera.shake(6, 0.55);
      world.particles.sparks(this.x, this.y - 56, 20, '#ffd27a');
      if (world.emitShockwave) {
        world.emitShockwave(this.x, this.y - 54, {
          maxR: 148,
          dur: 0.52,
          strength: 1.0,
          color: [1.0, 0.68, 0.24],
        });
      }
    }
    return died;
  }

  _drawSoulWisps(ctx, sx, sy, a, frontPass) {
    const t = this.t || 0;
    const count = this.enraged ? 5 : 4;
    const speed = this.enraged ? 3.2 : 2.15;
    const rx = 36;
    const ry = 11;
    const baseY = sy - 58;
    const tilt = Math.sin(t * 1.25) * 0.16;
    const fx = getFxLayers();
    const useShader = !!(fx && fx.enabled && fx.soulWisp);

    if (!useShader) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
    }

    for (let i = 0; i < count; i++) {
      const ang = t * speed + (i * Math.PI * 2) / count;
      const depth = Math.sin(ang);
      if (frontPass ? depth < 0 : depth >= 0) continue;
      const ox = Math.cos(ang) * rx;
      const oy = depth * ry + ox * tilt + Math.sin(t * 4.2 + i * 1.5) * 2.5;
      const wx = Math.round(sx + ox);
      const wy = Math.round(baseY + oy);
      const depth01 = (depth + 1) * 0.5;
      const scale = 0.78 + 0.34 * depth01;
      const wa = (0.64 + 0.32 * depth01) * a;

      if (useShader) {
        // Screen-space derivative of the 3D elliptical orbit gives foreshortened comet wake!
        const vx = -Math.sin(ang) * rx;
        const vy = Math.cos(ang) * ry + vx * tilt;
        const vNorm = 1 / rx;
        fx.soulWisp(ctx, {
          x: wx,
          y: wy,
          radius: 11.5 * scale,
          scale,
          tanX: vx * vNorm * (this.enraged ? 1.32 : 1.0),
          tanY: vy * vNorm * (this.enraged ? 1.32 : 1.0),
          seed: i * 2.37 + 0.5,
          enraged: this.enraged ? 1 : 0,
          core: this.enraged ? [1.0, 0.96, 0.80] : [1.0, 0.98, 0.86],
          mid: this.enraged ? [1.0, 0.36, 0.14] : [1.0, 0.68, 0.18],
          rim: this.enraged ? [0.84, 0.08, 0.24] : [0.66, 0.14, 0.38],
          alpha: wa,
        });
      } else {
        const g = ctx.createRadialGradient(wx, wy, 1, wx, wy, 11 * scale);
        g.addColorStop(0, this.enraged ? `rgba(255, 224, 150, ${wa.toFixed(3)})` : `rgba(255, 232, 168, ${wa.toFixed(3)})`);
        g.addColorStop(0.5, this.enraged ? `rgba(255, 86, 48, ${(wa * 0.65).toFixed(3)})` : `rgba(255, 162, 46, ${(wa * 0.62).toFixed(3)})`);
        g.addColorStop(1, 'rgba(180, 24, 42, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(wx - 13, wy - 15, 26, 28);
        ctx.globalAlpha = wa;
        ctx.fillStyle = this.enraged ? '#ff6438' : '#ffa834';
        ctx.fillRect(wx - 2, wy - 6, 4, 8);
        ctx.fillStyle = '#fff8dc';
        ctx.fillRect(wx - 1, wy - 3, 2, 4);
        ctx.globalAlpha = 1;
      }
    }

    if (!useShader) ctx.restore();
  }

  drawBehindBody(ctx, sx, sy, a) {
    this._drawSoulWisps(ctx, sx, sy, a, false);
  }

  drawFrontBody(ctx, sx, sy, a) {
    this._drawSoulWisps(ctx, sx, sy, a, true);
  }
}

// -------------------------------------------------------------- The Count

export class Count extends Boss {
  constructor(x, y, arena, difficulty) {
    super(x, y, arena, difficulty);
    this.sheet = 'vampire'; this.frame = 'idle'; this.w = 30; this.h = 80;
    this.hp = 215; this.maxHp = 215; this.facing = -1;
    this.actions = 0;
    this._flying = false;
    this._wingSfxT = 0;
    this.aura = 'rgba(220, 40, 60, 0.2)';
  }

  update(dt, level, world) {
    this.t += dt; this.stateT += dt; this.flash = Math.max(0, this.flash - dt);
    const isMasquerade = this.sheet === 'masquerade';
    const flyFrame = this.sheet === 'vampire' ? 'fly' : 'cape';
    if (this.deathT >= 0) {
      this._flying = false;
      this.frame = this.sheet === 'vampire' ? 'hurt' : 'cape';
      this.updateDeath(dt, world, 95);
      return;
    }
    this.checkPhase2(world);
    const p = world.player, a = this.arena;
    const dx = p.x - this.x;
    const inAir = this.state === 'hover' || (!this.onGround && this.y < a.floorY - 4);
    this._flying = inAir;
    this.gravityScale = this.state === 'hover' ? 0 : 1;
    switch (this.state) {
      case 'enter':
        this.alpha = Math.min(1, this.stateT / 1.4);
        this.physics(level, dt);
        this._flying = !this.onGround && this.y < a.floorY - 4;
        this.frame = this._flying ? flyFrame : (this.stateT < 0.85 ? 'cape' : 'idle');
        if (this.stateT > 1.65) this.setState('idle');
        break;
      case 'idle': {
        this.alpha = 1; this.faceP(p); this.vx = 0;
        this.physics(level, dt);
        this._flying = !this.onGround && this.y < a.floorY - 4;
        this.frame = this._flying ? flyFrame : 'idle';
        if (this.stateT > (this.phase2 ? 0.42 : 0.68) * this.tempo) {
          this.actions++;
          const r = Math.random();
          if (this.actions % (this.phase2 ? 3 : 5) === 0) this.setState('hover');
          else if (Math.abs(dx) < 120) this.setState('lunge');
          else if (r < 0.38) this.setState('cast');
          else if (r < 0.56) this.setState('summon');
          else if (r < 0.82) this.setState('blink');
          else this.setState('lunge');
        }
        break;
      }
      case 'cast': {
        this.vx = 0; this.physics(level, dt);
        this._flying = !this.onGround && this.y < a.floorY - 4;
        this.frame = 'cast';
        if (this.stateT > 0.36 && !this.fired) {
          this.fired = true;
          const n = this.phase2 ? 6 : 4, spread = this.phase2 ? 0.78 : 0.52;
          for (let i = 0; i < n; i++) {
            const ang = n === 1 ? 0 : -spread / 2 + (spread * i) / (n - 1);
            const pr = new Projectile('hellfire', this.x + this.facing * 26, this.y - 58, this.facing, 'enemy');
            pr.vx = this.facing * 235 * Math.cos(ang); pr.vy = 235 * Math.sin(ang);
            world.spawnProjectile(pr);
          }
          const sk = new Projectile('skull', this.x + this.facing * 18, this.y - 72, this.facing, 'enemy');
          sk.vy = -120;
          world.spawnProjectile(sk);
          world.sfx('fire');
        }
        if (this.stateT > 0.90) this.setState('idle');
        break;
      }
      case 'lunge':
        if (this.stateT < 0.03) { this.faceP(p); world.sfx('knight_slash'); }
        this.vx = this.stateT < 0.52 ? this.facing * 335 : 0;
        this.frame = this.stateT < 0.52
          ? (this.sheet === 'vampire' ? (Math.floor(this.stateT * 9) % 2 ? 'lunge0' : 'lunge1') : 'lunge')
          : 'idle';
        if ((isMasquerade || this.phase2) && !this.fired && this.stateT > 0.08) {
          this.fired = true;
          const cw = new Projectile('crimson_wave', this.x + this.facing * 24, this.y - 44, this.facing, 'enemy');
          cw.vx = this.facing * 275; cw.damage = 4;
          world.spawnProjectile(cw);
        }
        this.physics(level, dt); this.clampX(18);
        if (this.stateT > 0.82) this.setState('idle');
        break;
      case 'summon':
        this.vx = 0; this.physics(level, dt);
        this._flying = !this.onGround && this.y < a.floorY - 4;
        this.frame = this._flying ? flyFrame : 'cape';
        if (this.stateT > 0.42 && !this.fired) {
          this.fired = true;
          const adds = world.enemies.filter((e) => e !== this && e.alive).length;
          if (adds < 3) {
            if (isMasquerade) {
              const fromLeft = p.x > (a.x0 + a.x1) * 0.5;
              const dxSpawn = fromLeft ? a.x0 + 36 : a.x1 - 36;
              world.spawnEnemy(new PhantomDuelist(dxSpawn, a.floorY, a.x0 + 24, a.x1 - 24));
              const fb = new Bat(this.x, this.y - 64, 'fire');
              fb.wake(this.facing, p.y - 38); fb.homeX = this.x;
              world.spawnEnemy(fb);
            } else {
              for (let i = 0; i < 3; i++) {
                const b = new Bat(this.x + (i - 1) * 24, this.y - 60 - Math.abs(i - 1) * 10, 'fire');
                b.wake(i === 1 ? this.facing : (i === 0 ? -1 : 1), p.y - 38); b.homeX = this.x;
                world.spawnEnemy(b);
              }
            }
          }
          world.sfx('bat_flutter');
        }
        if (this.stateT > 0.98) this.setState('idle');
        break;
      case 'blink': {
        const half = 0.32;
        this.vx = 0; this.physics(level, dt);
        this._flying = !this.onGround && this.y < a.floorY - 4;
        if (this.stateT < half) { this.alpha = 1 - this.stateT / half; this.frame = this._flying ? flyFrame : 'cape'; }
        else if (!this.fired) {
          this.fired = true;
          this.x = clamp(p.x - p.facing * 115, a.x0 + 40, a.x1 - 40);
          this.faceP(p);
          world.particles.smoke(this.x, this.y - 40, 10, 'rgba(200,40,60,0.45)');
          world.sfx('fire');
        } else { this.alpha = Math.min(1, (this.stateT - half) / half); this.frame = this._flying ? flyFrame : 'idle'; }
        if (this.stateT > 0.72) this.setState(Math.random() < 0.65 ? 'lunge' : 'cast');
        break;
      }
      case 'hover': {
        // Rise on flapping bat-wing cape, sweep across the hall raining hellfire, then glide down to land.
        this._flying = true;
        this.frame = flyFrame;
        this._wingSfxT -= dt;
        if (this._wingSfxT <= 0) {
          this._wingSfxT = 0.48;
          world.sfx('bat_flutter');
        }
        if (Math.random() < 0.45) {
          world.particles.emit({
            x: this.x + (Math.random() - 0.5) * 44,
            y: this.y - 36 + (Math.random() - 0.5) * 24,
            vx: -(this.vx || 0) * 0.12 + (Math.random() - 0.5) * 18,
            vy: 12 + Math.random() * 18,
            life: 0.42,
            color: isMasquerade ? 'rgba(245, 95, 195, 0.42)' : 'rgba(195, 28, 52, 0.44)',
            size: 2,
            gravity: 0,
            fade: true,
          });
        }
        const topY = a.floorY - 150;
        if (this.stateT < 0.55) {
          const prevY = this.y;
          this.y += (topY - this.y) * Math.min(1, dt * 6);
          this.vy = dt > 0 ? (this.y - prevY) / dt : -140;
          this.faceP(p); this.vx = 0;
        } else if (this.stateT < 3.0) {
          this.y = topY + Math.sin(this.t * 5.2) * 9;
          this.vx = this.facing * 185;
          this.vy = Math.cos(this.t * 5.2) * 46;
          this.x += this.vx * dt;
          if (this.x < a.x0 + 40 || this.x > a.x1 - 40) { this.clampX(40); this.facing = -this.facing; }
          this.rainT = (this.rainT || 0) - dt;
          if (this.rainT <= 0) {
            this.rainT = 0.28;
            const pr = new Projectile('hellfire', this.x, this.y - 30, this.facing, 'enemy');
            pr.vx = (p.x - this.x) * 0.65; pr.vy = 260;
            world.spawnProjectile(pr);
          }
        } else {
          // Controlled winged glide descent back to the throne floor
          this.vx *= Math.max(0, 1 - dt * 5);
          this.gravityScale = 0.38;
          this.physics(level, dt);
          if (this.onGround) {
            this._flying = false;
            this.vx = 0;
            this.setState('idle');
            world.camera.shake(4, 0.25);
          }
        }
        break;
      }
      default: this.setState('idle');
    }
  }

  draw(ctx, assets, camX, camY) {
    if (this.alpha <= 0) return;
    this.drawAura(ctx, this.x - camX, this.y - camY - this.h / 2, this.h);
    let xf = null;
    if (this._flying && this.deathT < 0) {
      // Forward aerodynamic flight pitch + wingbeat pulse for non-clip sheets
      const speedLean = clamp((this.vx || 0) / 220, -1, 1) * 0.11 * (this.facing < 0 ? -1 : 1);
      if (this.sheet !== 'vampire') {
        const beat = Math.sin(this.t * 11.0);
        xf = { sx: 1 + beat * 0.08, sy: 1 - beat * 0.05, skew: speedLean };
      } else if (Math.abs(speedLean) > 0.005) {
        xf = { sx: 1, sy: 1, skew: speedLean };
      }
    }
    this.drawSprite(ctx, assets, camX, camY, this.facing < 0, this.alpha, xf);
  }

  swingBox() {
    if (this.state !== 'lunge' || this.stateT > 0.52) return null;
    return { x: this.facing > 0 ? this.x : this.x - 62, y: this.y - 72, w: 62, h: 64 };
  }
}

export function createBoss(type, x, y, arena, difficulty) {
  switch (type) {
    case 'giantbat': return new GiantBat(x, y, arena, difficulty);
    case 'treant': return new ElderTreant(x, y, arena, difficulty);
    case 'automaton': return new BrassAutomaton(x, y, arena, difficulty);
    case 'archivist': return new SpectralArchivist(x, y, arena, difficulty);
    case 'archon': return new GargoyleArchon(x, y, arena, difficulty);
    case 'bonecaptain': return new BoneCaptain(x, y, arena, difficulty);
    case 'gorgon': return new Gorgon(x, y, arena, difficulty);
    case 'reaperlord': return new ReaperLord(x, y, arena, difficulty);
    case 'count': return new Count(x, y, arena, difficulty);
    case 'greatjack': return new GreatJack(x, y, arena, difficulty);
    case 'devilsanta': return new DevilSanta(x, y, arena, difficulty);
    case 'cinderqueen': return new CinderQueen(x, y, arena, difficulty);
    case 'reaper':
    default: return new Reaper(x, y, arena, difficulty);
  }
}

// ------------------------------------------------------------- Great Jack

/** A colossal flaming jack-o'-lantern: spits fireballs, drops hoppers,
 *  slams the ground, and in phase 2 erupts in rings of flame. */
export class GreatJack extends Boss {
  constructor(x, y, arena, difficulty) {
    super(x, y, arena, difficulty);
    this.sheet = 'greatjack'; this.frame = 'flame0'; this.scale = 1; this.w = 82; this.h = 86;
    this.hp = 72; this.maxHp = 72; this.flies = true; this.gravityScale = 0;
    this.centerY = arena.floorY - 108; this.facing = -1; this.cycle = 0;
    this.aura = 'rgba(255, 140, 40, 0.22)';
  }

  update(dt, level, world) {
    this.t += dt; this.stateT += dt; this.flash = Math.max(0, this.flash - dt);
    if (this.deathT >= 0) { this.updateDeath(dt, world, 30); if (Math.random() < 0.5) world.particles.embers(this.x + (Math.random() - 0.5) * 60, this.y - 40, 2); return; }
    this.checkPhase2(world);
    const p = world.player, a = this.arena;
    this.frame = Math.floor(this.t * 9) % 2 ? 'flame0' : 'flame1';
    if (Math.random() < 0.6) world.particles.embers(this.x + (Math.random() - 0.5) * 40, this.y - 70, 1);
    const dx = p.x - this.x;
    switch (this.state) {
      case 'enter':
        this.alpha = Math.min(1, this.stateT / 1.3);
        this.y = this.centerY + Math.sin(this.t * 2) * 10;
        if (this.stateT > 1.5) this.setState('drift');
        break;
      case 'drift': {
        this.alpha = 1; this.faceP(p);
        const tx = clamp(p.x + (dx > 0 ? -130 : 130), a.x0 + 50, a.x1 - 50);
        this.x += Math.sign(tx - this.x) * Math.min(Math.abs(tx - this.x), (this.phase2 ? 120 : 92) * dt);
        this.y = this.centerY + Math.sin(this.t * 1.8) * 24;
        if (this.stateT > (this.phase2 ? 1.15 : 1.68) * this.tempo) {
          this.cycle++;
          const r = Math.random();
          if (this.cycle % 4 === 0) this.setState('summon');
          else if (this.phase2 && r < 0.35) this.setState('ring');
          else if (r < 0.65) this.setState('spit');
          else this.setState('slam');
        }
        break;
      }
      case 'spit':
        if (this.stateT > 0.20 && this.stateT < 0.72) this.frame = 'spit';
        if (this.stateT > 0.32 && !this.fired) {
          this.fired = true; this.faceP(p);
          const n = this.phase2 ? 5 : 4;
          for (let i = 0; i < n; i++) {
            const ang = Math.atan2((p.y - 30) - (this.y - 40), p.x - this.x) + (i - (n - 1) / 2) * 0.20;
            const fb = new Projectile('fireball', this.x + this.facing * 30, this.y - 40, this.facing, 'enemy');
            fb.vx = Math.cos(ang) * 255; fb.vy = Math.sin(ang) * 255; fb.dir = fb.vx >= 0 ? 1 : -1; fb.gravity = 0;
            world.spawnProjectile(fb);
          }
          world.sfx('fire');
        }
        if (this.stateT > 0.86) this.setState('drift');
        break;
      case 'summon':
        if (this.stateT > 0.42 && !this.fired) {
          this.fired = true;
          const adds = world.enemies.filter((e) => e !== this && e.alive).length;
          if (adds < 3) {
            for (let i = 0; i < 2; i++) {
              const hx = clamp(p.x + (i === 0 ? -120 : 120), a.x0 + 30, a.x1 - 30);
              const h = new Pumpkin(hx, a.floorY - 200, i === 0 ? 1 : -1, 'hopper');
              world.spawnEnemy(h);
            }
            const l = new Pumpkin(p.facing > 0 ? a.x1 - 10 : a.x0 + 10, p.y - 40, -p.facing, 'lantern');
            world.spawnEnemy(l);
          }
          world.sfx('pumpkin_hop');
        }
        if (this.stateT > 1.0) this.setState('drift');
        break;
      case 'slam': {
        // Hover over the hunter, then crash down and split flames both ways.
        if (this.stateT < 0.62) {
          this.x += (p.x - this.x) * Math.min(1, dt * 4);
          this.y += ((a.floorY - 200) - this.y) * Math.min(1, dt * 5);
        } else if (!this.fired) {
          this.y += 740 * dt;
          if (this.y >= a.floorY - 40) {
            this.y = a.floorY - 40; this.fired = true;
            world.camera.shake(7, 0.4); world.sfx('block');
            if (world.emitShockwave) world.emitShockwave(this.x, a.floorY - 8, { maxR: 155, dur: 0.5, strength: 0.95, color: [1.0, 0.52, 0.14] });
            world.spawnFire(this.x - 50, a.floorY, 'enemy'); world.spawnFire(this.x + 50, a.floorY, 'enemy');
            world.spawnFire(this.x - 105, a.floorY, 'enemy'); world.spawnFire(this.x + 105, a.floorY, 'enemy');
            for (const d of [-1, 1]) { const fb = new Projectile('fireball', this.x + d * 40, a.floorY - 16, d, 'enemy'); fb.vx = d * 245; fb.vy = 0; fb.gravity = 0; world.spawnProjectile(fb); }
          }
        } else {
          this.y += ((this.centerY) - this.y) * Math.min(1, dt * 3.2);
          if (this.stateT > 1.8) this.setState('drift');
        }
        break;
      }
      case 'ring':
        this.y += (this.centerY - this.y) * Math.min(1, dt * 3.5);
        if (this.stateT > 0.48 && !this.fired) {
          this.fired = true;
          for (let i = 0; i < 10; i++) {
            const ang = (i / 10) * Math.PI * 2 + this.t;
            const fb = new Projectile('fireball', this.x, this.y - 40, Math.cos(ang) >= 0 ? 1 : -1, 'enemy');
            fb.vx = Math.cos(ang) * 210; fb.vy = Math.sin(ang) * 210; fb.gravity = 0;
            world.spawnProjectile(fb);
          }
          world.sfx('boss_roar'); world.camera.shake(4, 0.3);
        }
        if (this.stateT > 1.05) this.setState('drift');
        break;
      default: this.setState('drift');
    }
  }
}

// ------------------------------------------------------------ Devil Santa

/** Horned Devil Santa: hurls cursed presents that burst into ice shards,
 *  lunges swinging a chain of iron bells, calls frost wisps, and in
 *  phase 2 summons a blizzard of falling shards. */
export class DevilSanta extends Boss {
  constructor(x, y, arena, difficulty) {
    super(x, y, arena, difficulty);
    this.sheet = 'santa'; this.w = 36; this.h = 92;
    this.hp = 90; this.maxHp = 90; this.facing = -1;
    this.actions = 0; this.frame = 'idle';
    this.aura = 'rgba(220, 40, 40, 0.18)';
  }

  update(dt, level, world) {
    this.t += dt; this.stateT += dt; this.flash = Math.max(0, this.flash - dt);
    if (this.deathT >= 0) { this.frame = 'hurt'; this.updateDeath(dt, world); return; }
    this.checkPhase2(world);
    const p = world.player, a = this.arena;
    const dx = p.x - this.x;
    switch (this.state) {
      case 'enter':
        this.alpha = Math.min(1, this.stateT / 1.4);
        this.frame = 'idle'; this.physics(level, dt);
        if (this.stateT > 1.6) this.setState('stalk');
        break;
      case 'stalk': {
        this.alpha = 1; this.faceP(p);
        const sp = this.phase2 ? 88 : 62;
        this.vx = Math.abs(dx) > 84 ? this.facing * sp : 0;
        this.frame = 'idle';
        this.physics(level, dt); this.clampX(20);
        if (this.stateT > (this.phase2 ? 0.54 : 0.85) * this.tempo) {
          this.actions++;
          const r = Math.random();
          if (this.phase2 && this.actions % 4 === 0) this.setState('blizzard');
          else if (Math.abs(dx) < 125) this.setState('lunge');
          else if (r < 0.45) this.setState('throw');
          else if (r < 0.65) this.setState('summon');
          else this.setState('lunge');
        }
        break;
      }
      case 'throw':
        this.vx = 0; this.frame = 'throw'; this.physics(level, dt);
        if (this.stateT > 0.34 && !this.fired) {
          this.fired = true; this.faceP(p);
          const n = this.phase2 ? 4 : 3;
          for (let i = 0; i < n; i++) {
            const g = new Projectile('present', this.x + this.facing * 20, this.y - 70, this.facing, 'enemy');
            g.vx = this.facing * (125 + i * 68); g.vy = -445 + i * 54;
            world.spawnProjectile(g);
          }
          world.sfx('throw');
        }
        if (this.stateT > 0.84) this.setState('stalk');
        break;
      case 'lunge':
        if (this.stateT < 0.03) { this.faceP(p); world.sfx('knight_slash'); }
        this.vx = this.stateT < 0.56 ? this.facing * 295 : 0;
        this.frame = this.stateT < 0.56 ? 'lunge' : 'idle';
        this.physics(level, dt); this.clampX(18);
        if (this.stateT > 0.88) this.setState('stalk');
        break;
      case 'summon':
        this.vx = 0; this.frame = 'throw'; this.physics(level, dt);
        if (this.stateT > 0.42 && !this.fired) {
          this.fired = true;
          const adds = world.enemies.filter((e) => e !== this && e.alive).length;
          if (adds < 3) {
            const n = this.phase2 ? 3 : 2;
            for (let i = 0; i < n; i++) {
              const fromLeft = i % 2 === 0;
              const w = new FrostWisp(fromLeft ? a.x0 + 10 : a.x1 - 10, p.y - 46 - i * 24, fromLeft ? 1 : -1);
              world.spawnEnemy(w);
            }
          }
          world.sfx('ghost_moan');
        }
        if (this.stateT > 1.0) this.setState('stalk');
        break;
      case 'blizzard':
        // Shards rain from above across the arena for two seconds.
        this.vx = 0; this.frame = 'throw'; this.physics(level, dt);
        this.rainT = (this.rainT || 0) - dt;
        if (this.stateT > 0.35 && this.stateT < 2.4 && this.rainT <= 0) {
          if (!this.fired) { this.fired = true; world.sfx('ice_shard'); }
          this.rainT = 0.11;
          const sx = a.x0 + Math.random() * (a.x1 - a.x0);
          const s = new Projectile('iceshard', sx, a.floorY - 300, 1, 'enemy');
          s.vx = (Math.random() - 0.5) * 65; s.vy = 255; s.gravity = 0.22; s.life = 2.5;
          world.spawnProjectile(s);
        }
        if (this.stateT > 2.65) this.setState('stalk');
        break;
      default: this.setState('stalk');
    }
  }

  swingBox() {
    if (this.state !== 'lunge' || this.stateT > 0.56) return null;
    return { x: this.facing > 0 ? this.x : this.x - 64, y: this.y - 84, w: 64, h: 74 };
  }
}

// ------------------------------------------------------------- Briar King

/** The Briar King (ElderTreant): towering hollow elder-tree sovereign of the
 *  Darkwood. Fires fans of barbed thorns, slams roots to erupt bioluminescent
 *  spores across the clearing, and calls swooping night-owls from the canopy. */
export class ElderTreant extends Boss {
  constructor(x, y, arena, difficulty) {
    super(x, y, arena, difficulty);
    this.sheet = 'treant';
    this.w = 64; this.h = 122;
    this.hp = 56; this.maxHp = 56;
    this.facing = -1;
    this.actions = 0;
    this.frame = 'idle0';
    this.auraKind = 'emerald';
  }

  update(dt, level, world) {
    this.t += dt; this.stateT += dt; this.flash = Math.max(0, this.flash - dt);
    if (this.deathT >= 0) {
      this.frame = 'roar';
      if (Math.random() < 0.5) world.particles.sparks(this.x + (Math.random() - 0.5) * 60, this.y - Math.random() * 110, 2, '#62f2c2');
      this.updateDeath(dt, world);
      return;
    }
    this.checkPhase2(world);
    const p = world.player, a = this.arena;
    const dx = p.x - this.x;

    switch (this.state) {
      case 'enter':
        this.alpha = Math.min(1, this.stateT / 1.4);
        this.frame = 'roar';
        this.physics(level, dt);
        if (this.stateT > 1.6) this.setState('march');
        break;
      case 'march': {
        this.alpha = 1; this.faceP(p);
        const sp = this.phase2 ? 68 : 48;
        this.vx = Math.abs(dx) > 90 ? this.facing * sp : 0;
        this.frame = Math.floor(this.t * 3.6) % 2 ? 'idle1' : 'idle0';
        this.physics(level, dt);
        this.clampX(42);
        if (this.stateT > (this.phase2 ? 0.80 : 1.18) * this.tempo) {
          this.actions++;
          if (this.actions % 3 === 1) this.setState('volley');
          else if (this.actions % 3 === 2) this.setState('roots');
          else this.setState('canopy');
        }
        break;
      }
      case 'volley':
        // Fires a spread of barbed briar thorns from its hollow maw
        this.vx = 0; this.frame = this.stateT < 0.30 ? 'roar' : 'slam';
        this.physics(level, dt);
        if (this.stateT >= 0.32 && !this.fired) {
          this.fired = true; this.faceP(p);
          const n = this.phase2 ? 6 : 4;
          for (let i = 0; i < n; i++) {
            const ang = Math.atan2((p.y - 30) - (this.y - 68), p.x - this.x) + (i - (n - 1) * 0.5) * 0.17;
            const th = new Projectile('thorn', this.x + this.facing * 26, this.y - 68, this.facing, 'enemy');
            th.vx = Math.cos(ang) * 280; th.vy = Math.sin(ang) * 280; th.gravity = 0.05;
            th.dir = th.vx >= 0 ? 1 : -1;
            world.spawnProjectile(th);
          }
          world.sfx('throw');
        }
        if (this.stateT > 0.88) this.setState('march');
        break;
      case 'roots':
        // Slams giant claws into the forest floor, erupting upward spore bursts
        this.vx = 0;
        this.frame = this.stateT < 0.36 ? 'roar' : 'slam';
        this.physics(level, dt);
        if (this.stateT >= 0.36 && !this.fired) {
          this.fired = true;
          world.camera.shake(6, 0.38);
          world.sfx('block');
          if (world.emitShockwave) world.emitShockwave(this.x, a.floorY - 12, { maxR: 155, dur: 0.5, strength: 0.9, color: [0.24, 0.96, 0.72] });
          const count = this.phase2 ? 5 : 4;
          for (let i = 0; i < count; i++) {
            const rx = a.x0 + 52 + ((i + 0.5) / count) * (a.x1 - a.x0 - 104);
            world.particles.shards(rx, a.floorY, 8, '#3f6a54', a.floorY);
            world.particles.sparks(rx, a.floorY - 12, 8, '#62f2c2');
            const sp = new Projectile('spore', rx, a.floorY - 18, rx < p.x ? 1 : -1, 'enemy');
            sp.vx = (p.x >= rx ? 1 : -1) * 96;
            sp.life = 2.4;
            world.spawnProjectile(sp);
          }
          world.sfx('spore_puff');
        }
        if (this.stateT > 1.05) this.setState('march');
        break;
      case 'canopy':
        // Calls Night-Owls swooping from the upper boughs
        this.vx = 0; this.frame = 'roar';
        this.physics(level, dt);
        if (this.stateT >= 0.38 && !this.fired) {
          this.fired = true;
          const adds = world.enemies.filter((e) => e !== this && e.alive).length;
          if (adds < 3) {
            const n = this.phase2 ? 3 : 2;
            for (let i = 0; i < n; i++) {
              const fromLeft = (i % 2 === 0) ? (p.x > (a.x0 + a.x1) * 0.5) : !(p.x > (a.x0 + a.x1) * 0.5);
              const ox = fromLeft ? a.x0 + 18 : a.x1 - 18;
              const owl = new NightOwl(ox, a.floorY - 175 - i * 22);
              owl.wake(fromLeft ? 1 : -1, p.y - 34);
              world.spawnEnemy(owl);
            }
          }
          world.sfx('owl_screech');
        }
        if (this.stateT > 0.96) this.setState('march');
        break;
      default: this.setState('march');
    }
  }
}


// --------------------------------------------------------- Brass Automaton

/** The Brass Automaton: warden of the Gallery of Automata. A hulking clockwork
 *  machine that marches, delivers piston punches, hurls bouncing brass cogs,
 *  and in phase 2 overloads its furnace to spray a ring of cogs. */
export class BrassAutomaton extends Boss {
  constructor(x, y, arena, difficulty) {
    super(x, y, arena, difficulty);
    this.sheet = 'automaton';
    this.w = 58; this.h = 104;
    this.hp = 138; this.maxHp = 138;
    this.facing = -1; this.actions = 0; this.frame = 'idle';
    this.auraKind = 'amber';
  }

  update(dt, level, world) {
    this.t += dt; this.stateT += dt; this.flash = Math.max(0, this.flash - dt);
    if (this.deathT >= 0) {
      this.frame = 'overload';
      if (Math.random() < 0.5) world.particles.sparks(this.x + (Math.random() - 0.5) * 50, this.y - Math.random() * 100, 2, '#ffd27a');
      this.updateDeath(dt, world);
      return;
    }
    this.checkPhase2(world);
    const p = world.player, a = this.arena;
    const dx = p.x - this.x;
    switch (this.state) {
      case 'enter':
        this.alpha = Math.min(1, this.stateT / 1.3);
        this.frame = 'idle'; this.physics(level, dt);
        if (this.stateT > 1.5) this.setState('march');
        break;
      case 'march': {
        this.alpha = 1; this.faceP(p);
        const sp = this.phase2 ? 84 : 58;
        this.vx = Math.abs(dx) > 78 ? this.facing * sp : 0;
        this.frame = Math.abs(this.vx) > 1 && Math.floor(this.t * 5) % 2 ? 'walk' : 'idle';
        if (Math.abs(this.vx) > 1 && Math.floor(this.t * 4) % 2 === 0 && Math.floor(this.t * 8) % 2 === 0) world.particles.dust(this.x, this.y, 1, '#8a7a60');
        this.physics(level, dt); this.clampX(34);
        if (this.stateT > (this.phase2 ? 0.62 : 0.96) * this.tempo) {
          this.actions++;
          if (Math.abs(dx) < 120) this.setState('punch');
          else if (this.phase2 && this.actions % 4 === 0) this.setState('overload');
          else if (this.actions % 2 === 0) this.setState('cogs');
          else this.setState('punch');
        }
        break;
      }
      case 'punch':
        // Wind-up, then a piston punch that lunges forward + fires a rolling cog!
        if (this.stateT < 0.24) { this.vx = 0; this.frame = 'idle'; this.faceP(p); }
        else if (this.stateT < 0.58) {
          this.frame = 'punch';
          this.vx = this.facing * 278;
          if (!this.fired) {
            this.fired = true;
            world.sfx('knight_slash');
            world.particles.smoke(this.x + this.facing * 30, this.y - 70, 4, 'rgba(220,220,230,0.5)');
            const c = new Projectile('cog', this.x + this.facing * 26, this.y - 54, this.facing, 'enemy');
            c.vx = this.facing * 235; c.vy = -180;
            world.spawnProjectile(c);
          }
        } else { this.vx = 0; this.frame = 'idle'; }
        this.physics(level, dt); this.clampX(30);
        if (this.stateT > 0.86) this.setState('march');
        break;
      case 'cogs':
        this.vx = 0; this.frame = this.stateT < 0.30 ? 'idle' : 'overload';
        this.physics(level, dt);
        if (this.stateT >= 0.32 && !this.fired) {
          this.fired = true; this.faceP(p);
          const n = this.phase2 ? 4 : 3;
          for (let i = 0; i < n; i++) {
            const c = new Projectile('cog', this.x + this.facing * 20, this.y - 96, this.facing, 'enemy');
            c.vx = this.facing * (160 + i * 68); c.vy = -310 - i * 54;
            world.spawnProjectile(c);
          }
          world.sfx('throw');
        }
        if (this.stateT > 0.92) this.setState('march');
        break;
      case 'overload':
        // Furnace blows open: ring of cogs, screen shake
        this.vx = 0; this.frame = 'overload'; this.physics(level, dt);
        if (Math.random() < 0.7) world.particles.embers(this.x + (Math.random() - 0.5) * 40, this.y - 70, 1);
        if (this.stateT >= 0.48 && !this.fired) {
          this.fired = true;
          for (let i = 0; i < 9; i++) {
            const ang = -Math.PI * (0.10 + 0.80 * (i / 8));
            const c = new Projectile('cog', this.x, this.y - 90, Math.cos(ang) >= 0 ? 1 : -1, 'enemy');
            c.vx = Math.cos(ang) * 265; c.vy = Math.sin(ang) * 320; c.gravity = 0.6; c.bounces = 2;
            world.spawnProjectile(c);
          }
          world.sfx('boss_roar'); world.camera.shake(6, 0.4);
          if (world.emitShockwave) world.emitShockwave(this.x, this.y - 76, { maxR: 155, dur: 0.5, strength: 0.95, color: [1.0, 0.72, 0.24] });
        }
        if (this.stateT > 1.32) this.setState('march');
        break;
      default: this.setState('march');
    }
  }

  swingBox() {
    if (this.state !== 'punch' || this.stateT < 0.24 || this.stateT > 0.60) return null;
    return { x: this.facing > 0 ? this.x + 10 : this.x - 10 - 78, y: this.y - 92, w: 78, h: 42 };
  }
}


// ------------------------------------------------------- Spectral Archivist

/** The Spectral Archivist: keeper of the forbidden library (and base of the
 *  Grand Alchemist wing boss). Drifts above the dais, hurls fans of razor pages
 *  or volatile flasks, flings cursed tomes, calls phantoms/alchemists, and in
 *  phase 2 raises an impervious shield while a storm rains down. */
export class SpectralArchivist extends Boss {
  constructor(x, y, arena, difficulty) {
    super(x, y, arena, difficulty);
    this.sheet = 'archivist';
    this.w = 50; this.h = 100;
    this.hp = 142; this.maxHp = 142;
    this.flies = true; this.gravityScale = 0;
    this.centerY = arena.floorY - 88; this.y = this.centerY;
    this.facing = -1; this.cycle = 0; this.frame = 'idle';
    this.auraKind = 'violet';
  }

  update(dt, level, world) {
    this.t += dt; this.stateT += dt; this.flash = Math.max(0, this.flash - dt);
    const isAlchemist = this.sheet === 'alchemist';
    if (this.deathT >= 0) {
      this.frame = 'shield';
      if (Math.random() < 0.5) world.particles.sparks(this.x + (Math.random() - 0.5) * 60, this.y - Math.random() * 90, 2, isAlchemist ? '#52f0d4' : '#bfe6ff');
      this.updateDeath(dt, world, 30);
      return;
    }
    this.checkPhase2(world);
    const p = world.player, a = this.arena;
    const dx = p.x - this.x;
    const bob = Math.sin(this.t * 2.0) * 9;
    if (Math.random() < 0.35) world.particles.emit({ x: this.x + (Math.random() - 0.5) * 30, y: this.y - 10, vx: 0, vy: 14, life: 0.7, color: isAlchemist ? 'rgba(82, 240, 212, 0.45)' : 'rgba(170, 210, 255, 0.45)', size: 2, gravity: 0, glow: true });
    switch (this.state) {
      case 'enter':
        this.alpha = Math.min(1, this.stateT / 1.4);
        this.frame = 'idle'; this.y = this.centerY + bob;
        if (this.stateT > 1.55) this.setState('drift');
        break;
      case 'drift': {
        this.alpha = 1; this.faceP(p);
        const tx = clamp(p.x + (dx > 0 ? -120 : 120), a.x0 + 60, a.x1 - 60);
        this.x += Math.sign(tx - this.x) * Math.min(Math.abs(tx - this.x), (this.phase2 ? 115 : 88) * dt);
        this.y = this.centerY + bob;
        this.frame = 'idle';
        if (this.stateT > (this.phase2 ? 1.02 : 1.46) * this.tempo) {
          this.cycle++;
          if (this.cycle % 4 === 0) this.setState('summon');
          else if (this.phase2 && this.cycle % 4 === 2) this.setState('storm');
          else if (this.cycle % 2 === 1) this.setState('pages');
          else this.setState('tomes');
        }
        break;
      }
      case 'pages':
        // A fan of razor pages toward the hunter (+ volatile alchemical firebombs for Alchemist)
        this.y = this.centerY + bob; this.frame = 'cast';
        if (this.stateT >= 0.36 && !this.fired) {
          this.fired = true; this.faceP(p);
          const n = this.phase2 ? 6 : 4;
          for (let i = 0; i < n; i++) {
            const ang = Math.atan2((p.y - 30) - (this.y - 50), p.x - this.x) + (i - (n - 1) / 2) * 0.16;
            const pg = new Projectile('page', this.x + this.facing * 24, this.y - 50, this.facing, 'enemy');
            pg.vx = Math.cos(ang) * 280; pg.vy = Math.sin(ang) * 280; pg.dir = pg.vx >= 0 ? 1 : -1;
            world.spawnProjectile(pg);
          }
          if (isAlchemist) {
            for (let j = 0; j < 2; j++) {
              const fl = new Projectile('alchflask', this.x + this.facing * 18, this.y - 56, this.facing, 'enemy');
              fl.vx = this.facing * (135 + j * 95); fl.vy = -310 - j * 45;
              world.spawnProjectile(fl);
            }
          }
          world.sfx('throw');
        }
        if (this.stateT > 0.90) this.setState('drift');
        break;
      case 'tomes':
        // Books tear off the shelves (or Alchemist lobs a 3-flask firebomb carpet)
        this.y = this.centerY + bob; this.frame = 'summon';
        if (this.stateT >= 0.40 && !this.fired) {
          this.fired = true;
          if (isAlchemist) {
            this.faceP(p);
            for (let i = 0; i < 3; i++) {
              const fl = new Projectile('alchflask', this.x + this.facing * 20, this.y - 56, this.facing, 'enemy');
              fl.vx = this.facing * (105 + i * 85); fl.vy = -345 - i * 35;
              world.spawnProjectile(fl);
            }
            world.sfx('fire');
          } else {
            const adds = world.enemies.filter((e) => e !== this && e.alive).length;
            if (adds < 3) {
              const n = this.phase2 ? 3 : 2;
              for (let i = 0; i < n; i++) {
                const fromLeft = i % 2 === 0;
                const t = new CursedTome(fromLeft ? a.x0 + 20 : a.x1 - 20, a.floorY - 150 - i * 26);
                t.wake(fromLeft ? 1 : -1);
                world.spawnEnemy(t);
                world.particles.dust(t.x, t.y, 6, '#c9b58a');
              }
            }
            world.sfx('tome_flap');
          }
        }
        if (this.stateT > 0.96) this.setState('drift');
        break;
      case 'summon':
        this.y = this.centerY + bob; this.frame = 'summon';
        if (this.stateT >= 0.44 && !this.fired) {
          this.fired = true;
          const adds = world.enemies.filter((e) => e !== this && e.alive).length;
          if (adds < 3) {
            const fromLeft = p.x > (a.x0 + a.x1) / 2;
            if (isAlchemist) {
              const ax = fromLeft ? a.x0 + 36 : a.x1 - 36;
              world.spawnEnemy(new PlagueAlchemist(ax, a.floorY, a.x0 + 24, a.x1 - 24));
            } else {
              const g = new Phantom(fromLeft ? a.x0 + 24 : a.x1 - 24, a.floorY - 110, fromLeft ? 1 : -1);
              g.lungeCd = 0.75;
              world.spawnEnemy(g);
            }
          }
          world.sfx('ghost_moan');
        }
        if (this.stateT > 1.05) this.setState('drift');
        break;
      case 'storm':
        // Grimoire shield up; pages (and volatile flasks for Alchemist) rain across the arena
        this.y = this.centerY - 20 + bob; this.frame = 'shield';
        this.rainT = (this.rainT || 0) - dt;
        if (this.stateT > 0.35 && this.stateT < 2.4 && this.rainT <= 0) {
          this.rainT = 0.11;
          const sx = a.x0 + 24 + Math.random() * (a.x1 - a.x0 - 48);
          const useFlask = isAlchemist && Math.random() < 0.28;
          const pg = new Projectile(useFlask ? 'alchflask' : 'page', sx, a.floorY - 290, 1, 'enemy');
          pg.vx = (Math.random() - 0.5) * 80; pg.vy = useFlask ? 160 : 245;
          if (!useFlask) { pg.gravity = 0.15; pg.life = 2.6; }
          world.spawnProjectile(pg);
        }
        if (this.stateT > 2.75) this.setState('drift');
        break;
      default: this.setState('drift');
    }
  }

  takeHit(dmg, fromX, world) {
    if (this.state === 'storm') { world.sfx('block'); world.particles.sparks(this.x, this.y - 50, 4, '#bfe6ff'); return false; }
    return super.takeHit(dmg, fromX, world);
  }
}


// ---------------------------------------------------------- Gargoyle Archon

/** The Gargoyle Archon: the cathedral's basalt guardian (and base of the
 *  Ashen Seraph celestial boss). Perches high, dives in sweeping pounces,
 *  roars gargoyles or valkyries awake, and curls into an impervious shell. */
export class GargoyleArchon extends Boss {
  constructor(x, y, arena, difficulty) {
    super(x, y, arena, difficulty);
    this.sheet = 'archon';
    this.w = 70; this.h = 104;
    this.hp = 160; this.maxHp = 160;
    this.flies = true; this.gravityScale = 0;
    this.perchY = Math.max(arena.ceilY + 88, arena.floorY - 136); this.y = this.perchY;
    this.facing = -1; this.cycle = 0; this.frame = 'roar'; this._flapping = true;
    this.auraKind = 'crimson';
  }

  update(dt, level, world) {
    this.t += dt; this.stateT += dt; this.flash = Math.max(0, this.flash - dt);
    const isSeraph = this.sheet === 'seraph';
    if (this.deathT >= 0) {
      this._flapping = false;
      this.frame = 'shell';
      if (Math.random() < 0.6) world.particles.shards(this.x + (Math.random() - 0.5) * 60, this.y - Math.random() * 90, 2, '#9a9aa8', this.arena.floorY);
      this.updateDeath(dt, world, 90);
      return;
    }
    this.checkPhase2(world);
    const p = world.player, a = this.arena;
    const bob = Math.sin(this.t * 2.2) * 5;
    // Airborne wingbeat: wings spread wide, then swept back (or upright 6-wing hover for seraph).
    const flap = isSeraph
      ? (Math.floor(this.t * 5) % 2 ? 'roar' : 'idle')
      : (Math.floor(this.t * 6.5) % 2 ? 'pounce' : 'roar');
    this._flapping = false;
    switch (this.state) {
      case 'enter':
        this.alpha = Math.min(1, this.stateT / 1.4);
        this._flapping = true; this.frame = flap; this.y = this.perchY + bob;
        if (this.stateT > 1.55) this.setState('perch');
        break;
      case 'perch': {
        this.alpha = 1; this.faceP(p);
        const tx = clamp(p.x, a.x0 + 80, a.x1 - 80);
        this.x += Math.sign(tx - this.x) * Math.min(Math.abs(tx - this.x), (this.phase2 ? 122 : 92) * dt);
        this.y = this.perchY + bob; this._flapping = true; this.frame = flap;
        if (this.stateT > (this.phase2 ? 0.96 : 1.40) * this.tempo) {
          this.cycle++;
          if (this.cycle % 4 === 0) this.setState('roar');
          else if (this.phase2 && this.cycle % 4 === 2) this.setState('shell');
          else {
            this.setState('pounce');
            this.from = { x: this.x, y: this.y };
            this.via = { x: p.x, y: p.y - 26 };
            const dir = p.x > this.x ? 1 : -1;
            this.to = { x: clamp(p.x + dir * 265, a.x0 + 70, a.x1 - 70), y: this.perchY };
            world.sfx('gargoyle_wake');
          }
        }
        break;
      }
      case 'pounce': {
        const dur = (this.phase2 ? 0.94 : 1.22) * this.tempo;
        const k = Math.min(1, this.stateT / dur);
        const q = (p0, p1, p2) => (1 - k) * (1 - k) * p0 + 2 * (1 - k) * k * p1 + k * k * p2;
        const nx = q(this.from.x, this.via.x, this.to.x);
        this.facing = nx >= this.x ? 1 : -1;
        this.x = nx; this.y = q(this.from.y, this.via.y, this.to.y);
        if (k < 0.75) { this.frame = 'pounce'; } else { this._flapping = true; this.frame = flap; }
        if (!this.fired && k >= 0.16) {
          this.fired = true;
          const baseAng = Math.atan2((p.y - 30) - (this.y - 44), p.x - this.x);
          const offsets = isSeraph ? [-0.20, 0, 0.20] : (this.phase2 ? [-0.14, 0.14] : [0]);
          for (const off of offsets) {
            const pr = new Projectile(isSeraph ? 'starlance' : 'hellfire', this.x + this.facing * 24, this.y - 44, this.facing, 'enemy');
            const ang = baseAng + off;
            const spd = isSeraph ? 320 : 235;
            pr.vx = Math.cos(ang) * spd; pr.vy = Math.sin(ang) * spd; pr.dir = pr.vx >= 0 ? 1 : -1;
            world.spawnProjectile(pr);
          }
          world.sfx(isSeraph ? 'throw' : 'fire');
        }
        if (k > 0.4 && k < 0.6 && Math.random() < 0.5) world.particles.dust(this.x, this.y, 2, '#9a9aa8');
        if (k >= 1) { this.setState('perch'); }
        break;
      }
      case 'roar':
        this.y = this.perchY + bob; this.frame = 'roar';
        if (this.stateT >= 0.42 && !this.fired) {
          this.fired = true;
          const adds = world.enemies.filter((e) => e !== this && e.alive).length;
          if (adds < 3) {
            const n = this.phase2 ? 2 : 1;
            for (let i = 0; i < n; i++) {
              const fromLeft = i === 0 ? p.x > (a.x0 + a.x1) / 2 : p.x <= (a.x0 + a.x1) / 2;
              if (isSeraph) {
                const vk = new FallenValkyrie(fromLeft ? a.x0 + 28 : a.x1 - 28, a.floorY - 125 - i * 24, fromLeft ? 1 : -1);
                world.spawnEnemy(vk);
              } else {
                const g = new Gargoyle(fromLeft ? a.x0 + 24 : a.x1 - 24, a.ceilY + 30, this.phase2 ? 'obsidian' : 'normal');
                g.wake(fromLeft ? 1 : -1, p.y - 34);
                world.spawnEnemy(g);
              }
            }
          }
          world.sfx('boss_roar'); world.camera.shake(5, 0.4);
          if (world.onBossRoar) world.onBossRoar();
        }
        if (this.stateT > 1.05) this.setState('perch');
        break;
      case 'shell':
        // Impervious stone/wing shell high in the apse; masonry or starlances rain across the nave
        this.y += ((this.perchY - 30) - this.y) * Math.min(1, dt * 3.5); this.frame = 'shell';
        this.rainT = (this.rainT || 0) - dt;
        if (this.stateT > 0.42 && this.stateT < 2.55 && this.rainT <= 0) {
          this.rainT = 0.12;
          const sx = a.x0 + Math.random() * (a.x1 - a.x0);
          const useLance = isSeraph && Math.random() < 0.45;
          const sh = new Projectile(useLance ? 'starlance' : 'shard', sx, a.floorY - 300, 1, 'enemy');
          sh.vx = (Math.random() - 0.5) * 60; sh.vy = useLance ? 285 : 235;
          sh.gravity = useLance ? 0.05 : 0.25; sh.life = 2.6;
          world.spawnProjectile(sh);
        }
        if (this.stateT > 2.8) this.setState('perch');
        break;
      default: this.setState('perch');
    }
  }

  takeHit(dmg, fromX, world) {
    if (this.state === 'shell') { world.sfx('block'); world.particles.sparks(this.x, this.y - 50, 4, '#cfd8e8'); return false; }
    return super.takeHit(dmg, fromX, world);
  }

  swingBox() {
    if (this.state !== 'pounce') return null;
    const k = this.stateT / ((this.phase2 ? 0.94 : 1.22) * this.tempo);
    if (k < 0.25 || k > 0.75) return null;
    return { x: this.x - 42, y: this.y - 72, w: 84, h: 64 };
  }
}

// ------------------------------------------------------------ Cinder Queen

/** The Cinder Queen: volcanic empress of the Dark Cave, clad in obsidian-and-gold
 *  plate armor. Launches arcing magma barrages (`cast`), surges across the floor
 *  leaving blazing fire trails (`surge`), erupts pillars of caldera flame (`erupt`),
 *  and in phase 2 summons Cinder Imps and Magma Slimes from the vents! */
export class CinderQueen extends Boss {
  constructor(x, y, arena, difficulty) {
    super(x, y, arena, difficulty);
    this.sheet = 'cinderqueen';
    this.w = 38; this.h = 104;
    this.hp = 116; this.maxHp = 116;
    this.facing = -1; this.actions = 0; this.frame = 'idle';
    this.auraKind = 'amber';
    this.lavaImmune = true;
    this.eruptCols = [];
  }

  onPhase2(world) {
    world.particles.embers(this.x, this.y - 60, 24);
    if (world.onBossRoar) world.onBossRoar();
  }

  update(dt, level, world) {
    this.t += dt; this.stateT += dt; this.flash = Math.max(0, this.flash - dt);
    if (this.deathT >= 0) {
      this.frame = 'erupt';
      if (Math.random() < 0.65) world.particles.embers(this.x + (Math.random() - 0.5) * 60, this.y - Math.random() * 100, 3);
      this.updateDeath(dt, world);
      return;
    }
    this.checkPhase2(world);
    const p = world.player, a = this.arena;
    const dx = p.x - this.x;
    if (Math.random() < 0.45) world.particles.embers(this.x + (Math.random() - 0.5) * 28, this.y - 24 - Math.random() * 70, 1);

    switch (this.state) {
      case 'enter':
        this.alpha = Math.min(1, this.stateT / 1.3);
        this.frame = 'idle';
        this.physics(level, dt);
        if (this.stateT > 1.5) this.setState('stalk');
        break;
      case 'stalk': {
        this.alpha = 1; this.faceP(p);
        const sp = this.phase2 ? 86 : 62;
        this.vx = Math.abs(dx) > 90 ? this.facing * sp : 0;
        this.frame = 'idle';
        this.physics(level, dt); this.clampX(28);
        if (this.stateT > (this.phase2 ? 0.66 : 1.02) * this.tempo) {
          this.actions++;
          if (this.phase2 && this.actions % 4 === 0) this.setState('summon');
          else if (this.actions % 3 === 1) this.setState('meteor');
          else if (this.actions % 3 === 2) {
            this.setState('erupt');
            const n = this.phase2 ? 5 : 4;
            this.eruptCols = [];
            for (let i = 0; i < n; i++) {
              const frac = (i + 0.5) / n;
              const base = a.x0 + 52 + frac * (a.x1 - a.x0 - 104);
              const jitter = (i === Math.floor(n / 2)) ? clamp(p.x, a.x0 + 52, a.x1 - 52) : base;
              this.eruptCols.push(jitter);
            }
          } else {
            this.setState('surge');
            this.faceP(p);
            this.trailT = 0;
          }
        }
        break;
      }
      case 'meteor':
        // Raises blazing scepter to hurl fanned volcanic magma boulders
        this.vx = 0; this.frame = 'cast';
        this.physics(level, dt);
        if (this.stateT >= 0.34 && !this.fired) {
          this.fired = true; this.faceP(p);
          const n = this.phase2 ? 5 : 4;
          for (let i = 0; i < n; i++) {
            const mb = new Projectile('magmaball', this.x + this.facing * 18, this.y - 98, this.facing, 'enemy');
            mb.vx = this.facing * (120 + i * 65);
            mb.vy = -345 - i * 44;
            world.spawnProjectile(mb);
          }
          world.particles.embers(this.x + this.facing * 18, this.y - 102, 12);
          world.sfx('lava_hurl');
        }
        if (this.stateT > 0.92) this.setState('stalk');
        break;
      case 'surge':
        // Blazing dash across the caldera floor leaving a wake of enemy flames
        if (this.stateT < 0.22) {
          this.vx = 0; this.frame = 'cast'; this.faceP(p);
        } else if (this.stateT < 0.80) {
          this.frame = 'surge';
          this.vx = this.facing * (this.phase2 ? 320 : 275);
          if (!this.fired) { this.fired = true; world.sfx('knight_slash'); }
          this.trailT = (this.trailT || 0) - dt;
          if (this.trailT <= 0) {
            this.trailT = 0.13;
            world.spawnFire(this.x - this.facing * 18, a.floorY, 'enemy');
          }
          if (this.x <= a.x0 + 30 || this.x >= a.x1 - 30) this.vx = 0;
        } else {
          this.vx = 0; this.frame = 'idle';
        }
        this.physics(level, dt); this.clampX(28);
        if (this.stateT > 1.0) this.setState('stalk');
        break;
      case 'erupt':
        // Telegraphed glowing fissures along the floor -> erupting magma geysers!
        this.vx = 0;
        this.frame = this.stateT < 0.44 ? 'cast' : 'erupt';
        this.physics(level, dt);
        if (this.stateT < 0.46) {
          for (const gx of this.eruptCols) {
            if (Math.random() < 0.65) world.particles.embers(gx + (Math.random() - 0.5) * 20, a.floorY - 4, 2);
          }
        } else if (!this.fired) {
          this.fired = true;
          world.camera.shake(6, 0.4);
          world.sfx('boss_roar');
          if (world.emitShockwave) world.emitShockwave(this.x, a.floorY - 18, { maxR: 165, dur: 0.54, strength: 1.0, color: [1.0, 0.42, 0.10] });
          for (const gx of this.eruptCols) {
            world.spawnFire(gx, a.floorY, 'enemy');
            world.particles.embers(gx, a.floorY - 16, 14);
            const fb = new Projectile('fireball', gx, a.floorY - 18, 1, 'enemy');
            fb.vx = (Math.random() - 0.5) * 44;
            fb.vy = -300;
            fb.gravity = 0.55;
            fb.life = 1.4;
            world.spawnProjectile(fb);
          }
        }
        if (this.stateT > 1.08) this.setState('stalk');
        break;
      case 'summon': {
        this.vx = 0; this.frame = 'erupt';
        this.physics(level, dt);
        if (this.stateT >= 0.40 && !this.fired) {
          this.fired = true;
          const adds = world.enemies.filter((e) => e !== this && e.alive).length;
          if (adds < 3) {
            const fromLeft = p.x > (a.x0 + a.x1) * 0.5;
            const imp = new CinderImp(fromLeft ? a.x0 + 28 : a.x1 - 28, a.floorY - 130, fromLeft ? 1 : -1);
            world.spawnEnemy(imp);
            const sx = clamp(this.x + this.facing * 54, a.x0 + 36, a.x1 - 36);
            const slime = new MagmaSlime(sx, a.floorY, a.x0 + 24, a.x1 - 24);
            world.spawnEnemy(slime);
          }
          world.sfx('magma_slime');
        }
        if (this.stateT > 0.96) this.setState('stalk');
        break;
      }
      default: this.setState('stalk');
    }
  }

  swingBox() {
    if (this.state !== 'surge' || this.stateT < 0.22 || this.stateT > 0.82) return null;
    return { x: this.x - 32, y: this.y - 92, w: 64, h: 84 };
  }
}
