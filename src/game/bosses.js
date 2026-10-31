// Stage bosses built on the enemy sheets (scaled/tinted) plus the Count.
// The Phantom Reaper lives in boss.js; the Reaper Lord extends it.

import { SCORE } from '../engine/constants.js';
import { Enemy, Bat, MedusaHead, Pumpkin, FrostWisp, NightOwl, Phantom, CursedTome, Gargoyle } from './enemies.js';
import { Projectile } from './objects.js';
import { Reaper } from './boss.js';
import { getGlowCanvas } from './tex3d.js';

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
    this.touchDamage = 3;
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
    this.sheet = 'giantbat'; this.scale = 1; this.w = 84; this.h = 52;
    this.hp = 24; this.maxHp = 24; this.flies = true; this.gravityScale = 0;
    this.hangY = arena.ceilY + 50; this.cycle = 0; this.facing = -1;
    this.aura = 'rgba(90, 40, 140, 0.25)';
  }

  update(dt, level, world) {
    this.t += dt; this.stateT += dt; this.flash = Math.max(0, this.flash - dt);
    if (this.deathT >= 0) { this.updateDeath(dt, world, 70); return; }
    this.checkPhase2(world);
    const p = world.player, a = this.arena;
    const flap = ['fly0', 'fly1', 'fly2', 'fly1'];
    this.frame = flap[Math.floor(this.t * (this.state === 'hang' ? 5 : 11)) % 4];
    const bob = Math.sin(this.t * 2.2) * 6;
    switch (this.state) {
      case 'enter':
        this.alpha = Math.min(1, this.stateT / 1.2);
        this.y = this.hangY + bob;
        if (this.stateT > 1.6) this.setState('hang');
        break;
      case 'hang': {
        this.alpha = 1; this.faceP(p);
        const tx = clamp(p.x, a.x0 + 70, a.x1 - 70);
        this.x += (tx - this.x) * Math.min(1, dt * 1.4);
        this.y = this.hangY + bob;
        if (this.stateT > (this.phase2 ? 0.9 : 1.5) * this.tempo) {
          this.cycle++;
          if (this.cycle % 3 === 0) this.setState('summon');
          else {
            this.setState('dive');
            this.from = { x: this.x, y: this.y };
            this.via = { x: p.x, y: p.y - 20 };
            const dir = p.x > this.x ? 1 : -1;
            this.to = { x: clamp(p.x + dir * 240, a.x0 + 60, a.x1 - 60), y: this.hangY };
          }
        }
        break;
      }
      case 'dive': {
        // Quadratic curve: ceiling -> through the hunter -> back up beyond.
        const dur = (this.phase2 ? 1.0 : 1.35) * this.tempo;
        const k = Math.min(1, this.stateT / dur);
        const q = (p0, p1, p2) => (1 - k) * (1 - k) * p0 + 2 * (1 - k) * k * p1 + k * k * p2;
        const nx = q(this.from.x, this.via.x, this.to.x);
        this.facing = nx >= this.x ? 1 : -1;
        this.x = nx; this.y = q(this.from.y, this.via.y, this.to.y);
        if (k > 0.2 && k < 0.75) this.frame = 'dive';
        if (k >= 1) { this.setState('cross'); this.crossY = p.y - 44; this.facing = p.x > this.x ? 1 : -1; }
        break;
      }
      case 'cross':
        this.x += this.facing * (this.phase2 ? 200 : 155) * dt;
        this.y = this.crossY + Math.sin(this.stateT * 5) * 30;
        if (this.x < a.x0 + 40 || this.x > a.x1 - 40) { this.clampX(40); this.setState('hang'); }
        break;
      case 'summon':
        this.y = this.hangY + bob;
        if (this.stateT > 0.5 && !this.fired) {
          this.fired = true;
          const n = this.phase2 ? 3 : 2;
          for (let i = 0; i < n; i++) {
            const b = new Bat(this.x + (i - 1) * 30, this.y + 14);
            b.wake(i % 2 ? 1 : -1, p.y - 40); b.homeX = this.x;
            world.spawnEnemy(b);
          }
          world.sfx('throw');
        }
        if (this.stateT > 1.3) this.setState('hang');
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
    this.hp = 30; this.maxHp = 30; this.tint = null;
    this.speed = 55; this.facing = -1; this.volleyCd = 1.5; this.chargeCd = 4; this.leapCd = 2;
    this.aura = 'rgba(200, 60, 60, 0.18)';
  }

  update(dt, level, world) {
    this.t += dt; this.stateT += dt; this.flash = Math.max(0, this.flash - dt);
    if (this.deathT >= 0) { this.updateDeath(dt, world); return; }
    this.checkPhase2(world);
    const p = world.player;
    this.volleyCd -= dt; this.chargeCd -= dt; this.leapCd -= dt;
    const walk = ['walk0', 'walk1', 'walk2', 'walk3'];
    const dx = p.x - this.x;
    switch (this.state) {
      case 'enter':
        this.alpha = Math.min(1, this.stateT / 1.2);
        this.frame = 'walk0';
        this.physics(level, dt);
        if (this.stateT > 1.5) this.setState('walk');
        break;
      case 'walk': {
        this.alpha = 1; this.faceP(p);
        const sp = this.speed * (this.phase2 ? 1.45 : 1);
        this.vx = Math.abs(dx) > 60 ? this.facing * sp : 0;
        this.frame = walk[Math.floor(this.t * 7) % 4];
        this.physics(level, dt); this.clampX(20);
        if (this.onGround && this.volleyCd <= 0 && Math.abs(dx) < 260 && Math.abs(dx) > 70) this.setState('volley');
        else if (this.onGround && this.chargeCd <= 0 && Math.abs(dx) > 200) this.setState('charge');
        else if (this.onGround && this.leapCd <= 0 && p.y < this.y - 60) { this.setState('leap'); this.vy = -560; this.vx = this.facing * 150; }
        break;
      }
      case 'volley':
        this.vx = 0; this.physics(level, dt);
        this.frame = this.stateT < 0.4 ? 'throw0' : 'throw1';
        if (this.stateT >= 0.4 && !this.fired) {
          this.fired = true;
          const n = this.phase2 ? 5 : 3;
          for (let i = 0; i < n; i++) {
            const pr = new Projectile('bone', this.x + this.facing * 20, this.y - 80, this.facing, 'enemy');
            pr.vx = this.facing * (130 + i * 45); pr.vy = -300 - i * 50; pr.damage = 2;
            world.spawnProjectile(pr);
          }
          world.sfx('bone');
        }
        if (this.stateT > 0.9) { this.setState('walk'); this.volleyCd = (2.4 + Math.random()) * this.tempo; }
        break;
      case 'charge':
        this.vx = this.facing * 240;
        this.frame = walk[Math.floor(this.t * 16) % 4];
        this.physics(level, dt); this.clampX(20);
        if (this.hitWall || this.stateT > 0.9 || this.x <= this.arena.x0 + 22 || this.x >= this.arena.x1 - 22) {
          this.setState('walk'); this.chargeCd = (3.5 + Math.random()) * this.tempo; world.camera.shake(3, 0.2);
        }
        break;
      case 'leap':
        this.frame = 'walk1';
        this.physics(level, dt); this.clampX(20);
        if (this.onGround && this.stateT > 0.2) { this.setState('walk'); this.leapCd = 3 * this.tempo; world.camera.shake(3, 0.2); world.particles.dust(this.x, this.y, 8); }
        break;
      default: this.setState('walk');
    }
  }

  swingBox() {
    if (this.state !== 'charge') return null;
    return { x: this.facing > 0 ? this.x : this.x - 40, y: this.y - 80, w: 40, h: 70 };
  }
}

// ---------------------------------------------------------- Gorgon Queen

export class Gorgon extends Boss {
  constructor(x, y, arena, difficulty) {
    super(x, y, arena, difficulty);
    this.sheet = 'gorgon'; this.scale = 1; this.w = 56; this.h = 64;
    this.hp = 36; this.maxHp = 36; this.flies = true; this.gravityScale = 0;
    this.centerY = arena.floorY - 110; this.facing = -1;
    this.aura = 'rgba(90, 200, 120, 0.2)';
  }

  update(dt, level, world) {
    this.t += dt; this.stateT += dt; this.flash = Math.max(0, this.flash - dt);
    if (this.deathT >= 0) { this.updateDeath(dt, world, 40); return; }
    this.checkPhase2(world);
    const p = world.player, a = this.arena;
    this.frame = Math.floor(this.t * 5) % 2 ? 'a' : 'b';
    const dx = p.x - this.x;
    switch (this.state) {
      case 'enter':
        this.alpha = Math.min(1, this.stateT / 1.3);
        this.y = this.centerY + Math.sin(this.t * 1.6) * 20;
        if (this.stateT > 1.6) this.setState('drift');
        break;
      case 'drift': {
        this.alpha = 1; this.faceP(p);
        const tx = clamp(p.x + (dx > 0 ? -150 : 150), a.x0 + 50, a.x1 - 50);
        this.x += Math.sign(tx - this.x) * Math.min(Math.abs(tx - this.x), (this.phase2 ? 110 : 80) * dt);
        this.y = this.centerY + Math.sin(this.t * 1.6) * 45;
        if (this.stateT > 2.0 * this.tempo) {
          const r = Math.random();
          if (this.phase2 && (Math.abs(dx) < 120 || r > 0.8)) this.setState('dash');
          else if (r < 0.55) this.setState('gaze');
          else this.setState('spawn');
        }
        break;
      }
      case 'gaze': {
        this.frame = 'stare';
        // Charge the stare, then fire a petrifying streak at chest height.
        if (this.stateT < 0.7 && Math.random() < 0.5) world.particles.sparks(this.x + this.facing * 24, this.y - 40, 2, '#ffe9a0');
        const shots = this.phase2 ? 2 : 1;
        const firedCount = this.firedCount || 0;
        if (this.stateT > 0.7 + firedCount * 0.3 && firedCount < shots) {
          this.firedCount = firedCount + 1;
          this.faceP(p);
          const pr = new Projectile('gaze', this.x + this.facing * 30, this.y - 36, this.facing, 'enemy');
          pr.vy = clamp(((p.y - 30) - (this.y - 36)) / 0.7, -140, 140);
          world.spawnProjectile(pr);
          world.sfx('throw');
        }
        if (this.stateT > 1.5) { this.firedCount = 0; this.setState('drift'); }
        break;
      }
      case 'spawn':
        if (this.stateT > 0.5 && !this.fired) {
          this.fired = true;
          const n = this.phase2 ? 3 : 2;
          for (let i = 0; i < n; i++) {
            const m = new MedusaHead(this.x + this.facing * 20, this.y - 30 + (i - 1) * 24, this.facing);
            m.baseY = p.y - 30 + (i - 1) * 30;
            world.spawnEnemy(m);
          }
          world.sfx('fire');
        }
        if (this.stateT > 1.0) this.setState('drift');
        break;
      case 'dash': {
        if (this.stateT < 0.05) { this.faceP(p); this.dashY = p.y - 40; }
        this.x += this.facing * 320 * dt;
        this.y += (this.dashY - this.y) * Math.min(1, dt * 4);
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
    this.hp = 64; this.maxHp = 64;
    this.tint = 'rgba(255, 190, 70, 0.3)';
    this.tempo *= 0.8;
    this.phase2 = true;          // starts with the full move set
    this.enraged = false;
  }
  takeHit(dmg, fromX, world) {
    const died = super.takeHit(dmg, fromX, world);
    if (!died && !this.enraged && this.hp <= this.maxHp * 0.5) {
      this.enraged = true; this.tempo *= 0.7; world.sfx('boss_roar'); world.camera.shake(5, 0.5);
    }
    return died;
  }
}

// -------------------------------------------------------------- The Count

export class Count extends Boss {
  constructor(x, y, arena, difficulty) {
    super(x, y, arena, difficulty);
    this.sheet = 'vampire'; this.w = 30; this.h = 80;
    this.hp = 72; this.maxHp = 72; this.facing = -1;
    this.actions = 0;
    this.aura = 'rgba(220, 40, 60, 0.2)';
  }

  update(dt, level, world) {
    this.t += dt; this.stateT += dt; this.flash = Math.max(0, this.flash - dt);
    if (this.deathT >= 0) { this.frame = 'hurt'; this.updateDeath(dt, world); return; }
    this.checkPhase2(world);
    const p = world.player, a = this.arena;
    const dx = p.x - this.x;
    this.gravityScale = this.state === 'hover' ? 0 : 1;
    switch (this.state) {
      case 'enter':
        this.alpha = Math.min(1, this.stateT / 1.5);
        this.frame = this.stateT < 0.9 ? 'cape' : 'idle';
        this.physics(level, dt);
        if (this.stateT > 1.8) this.setState('idle');
        break;
      case 'idle': {
        this.alpha = 1; this.faceP(p); this.vx = 0; this.frame = 'idle';
        this.physics(level, dt);
        if (this.stateT > (this.phase2 ? 0.55 : 0.9) * this.tempo) {
          this.actions++;
          const r = Math.random();
          if (this.phase2 && this.actions % 4 === 0) this.setState('hover');
          else if (Math.abs(dx) < 110) this.setState('lunge');
          else if (r < 0.35) this.setState('cast');
          else if (r < 0.55) this.setState('summon');
          else if (r < 0.8) this.setState('blink');
          else this.setState('lunge');
        }
        break;
      }
      case 'cast': {
        this.frame = 'cast'; this.vx = 0; this.physics(level, dt);
        if (this.stateT > 0.45 && !this.fired) {
          this.fired = true;
          const n = this.phase2 ? 5 : 3, spread = this.phase2 ? 0.7 : 0.45;
          for (let i = 0; i < n; i++) {
            const ang = n === 1 ? 0 : -spread / 2 + (spread * i) / (n - 1);
            const pr = new Projectile('hellfire', this.x + this.facing * 26, this.y - 58, this.facing, 'enemy');
            pr.vx = this.facing * 185 * Math.cos(ang); pr.vy = 185 * Math.sin(ang);
            world.spawnProjectile(pr);
          }
          world.sfx('fire');
        }
        if (this.stateT > 1.1) this.setState('idle');
        break;
      }
      case 'lunge':
        if (this.stateT < 0.03) { this.faceP(p); world.sfx('whip'); }
        this.vx = this.stateT < 0.55 ? this.facing * 290 : 0;
        this.frame = this.stateT < 0.55 ? (Math.floor(this.stateT * 8) % 2 ? 'lunge0' : 'lunge1') : 'idle';
        this.physics(level, dt); this.clampX(18);
        if (this.stateT > 0.95) this.setState('idle');
        break;
      case 'summon':
        this.frame = 'cape'; this.vx = 0; this.physics(level, dt);
        if (this.stateT > 0.5 && !this.fired) {
          this.fired = true;
          for (let i = 0; i < 3; i++) {
            const b = new Bat(this.x + (i - 1) * 24, this.y - 60 - Math.abs(i - 1) * 10);
            b.wake(i === 1 ? this.facing : (i === 0 ? -1 : 1), p.y - 40); b.homeX = this.x;
            world.spawnEnemy(b);
          }
          world.sfx('throw');
        }
        if (this.stateT > 1.2) this.setState('idle');
        break;
      case 'blink': {
        const half = 0.4;
        this.vx = 0; this.physics(level, dt);
        if (this.stateT < half) { this.alpha = 1 - this.stateT / half; this.frame = 'cape'; }
        else if (!this.fired) {
          this.fired = true;
          this.x = clamp(p.x - p.facing * 130, a.x0 + 40, a.x1 - 40);
          world.particles.smoke(this.x, this.y - 40, 10, 'rgba(200,40,60,0.45)');
          world.sfx('fire');
        } else { this.alpha = Math.min(1, (this.stateT - half) / half); this.frame = 'idle'; }
        if (this.stateT > 0.95) this.setState(this.phase2 ? 'lunge' : 'idle');
        break;
      }
      case 'hover': {
        // Rise on bat wings, sweep across the hall raining hellfire, land.
        this.frame = 'cape';
        const topY = a.floorY - 150;
        if (this.stateT < 0.7) {
          this.y += (topY - this.y) * Math.min(1, dt * 5);
          this.faceP(p); this.vx = 0;
        } else if (this.stateT < 3.2) {
          this.y = topY + Math.sin(this.t * 3) * 8;
          this.x += this.facing * 150 * dt;
          if (this.x < a.x0 + 40 || this.x > a.x1 - 40) { this.clampX(40); this.facing = -this.facing; }
          this.rainT = (this.rainT || 0) - dt;
          if (this.rainT <= 0) {
            this.rainT = 0.4;
            const pr = new Projectile('hellfire', this.x, this.y - 30, this.facing, 'enemy');
            pr.vx = (p.x - this.x) * 0.5; pr.vy = 230;
            world.spawnProjectile(pr);
          }
        } else {
          this.gravityScale = 1; this.physics(level, dt);
          if (this.onGround) { this.setState('idle'); world.camera.shake(3, 0.2); }
        }
        break;
      }
      default: this.setState('idle');
    }
  }

  swingBox() {
    if (this.state !== 'lunge' || this.stateT > 0.55) return null;
    return { x: this.facing > 0 ? this.x : this.x - 56, y: this.y - 72, w: 56, h: 64 };
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
    this.sheet = 'greatjack'; this.scale = 1; this.w = 82; this.h = 86;
    this.hp = 34; this.maxHp = 34; this.flies = true; this.gravityScale = 0;
    this.centerY = arena.floorY - 120; this.facing = -1; this.cycle = 0;
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
        if (this.stateT > 1.6) this.setState('drift');
        break;
      case 'drift': {
        this.alpha = 1; this.faceP(p);
        const tx = clamp(p.x + (dx > 0 ? -150 : 150), a.x0 + 50, a.x1 - 50);
        this.x += Math.sign(tx - this.x) * Math.min(Math.abs(tx - this.x), (this.phase2 ? 120 : 85) * dt);
        this.y = this.centerY + Math.sin(this.t * 1.8) * 30;
        if (this.stateT > (this.phase2 ? 1.3 : 2.0) * this.tempo) {
          this.cycle++;
          const r = Math.random();
          if (this.cycle % 4 === 0) this.setState('summon');
          else if (this.phase2 && r < 0.3) this.setState('ring');
          else if (r < 0.65) this.setState('spit');
          else this.setState('slam');
        }
        break;
      }
      case 'spit':
        if (this.stateT > 0.25 && this.stateT < 0.8) this.frame = 'spit';
        if (this.stateT > 0.4 && !this.fired) {
          this.fired = true; this.faceP(p);
          const n = this.phase2 ? 4 : 3;
          for (let i = 0; i < n; i++) {
            const ang = Math.atan2((p.y - 30) - (this.y - 40), p.x - this.x) + (i - (n - 1) / 2) * 0.22;
            const fb = new Projectile('fireball', this.x + this.facing * 30, this.y - 40, this.facing, 'enemy');
            fb.vx = Math.cos(ang) * 220; fb.vy = Math.sin(ang) * 220; fb.dir = fb.vx >= 0 ? 1 : -1; fb.gravity = 0;
            world.spawnProjectile(fb);
          }
          world.sfx('fire');
        }
        if (this.stateT > 1.0) this.setState('drift');
        break;
      case 'summon':
        if (this.stateT > 0.5 && !this.fired) {
          this.fired = true;
          for (let i = 0; i < 2; i++) {
            const hx = clamp(p.x + (i === 0 ? -120 : 120), a.x0 + 30, a.x1 - 30);
            const h = new Pumpkin(hx, a.floorY - 200, i === 0 ? 1 : -1, 'hopper');
            world.spawnEnemy(h);
          }
          const l = new Pumpkin(p.facing > 0 ? a.x1 - 10 : a.x0 + 10, p.y - 40, -p.facing, 'lantern');
          world.spawnEnemy(l);
          world.sfx('throw');
        }
        if (this.stateT > 1.2) this.setState('drift');
        break;
      case 'slam': {
        // Hover over the hunter, then crash down and split flames both ways.
        if (this.stateT < 0.8) {
          this.x += (p.x - this.x) * Math.min(1, dt * 3);
          this.y += ((a.floorY - 200) - this.y) * Math.min(1, dt * 4);
        } else if (!this.fired) {
          this.y += 620 * dt;
          if (this.y >= a.floorY - 40) {
            this.y = a.floorY - 40; this.fired = true;
            world.camera.shake(7, 0.4); world.sfx('block');
            world.spawnFire(this.x - 50, a.floorY); world.spawnFire(this.x + 50, a.floorY);
            for (const d of [-1, 1]) { const fb = new Projectile('fireball', this.x + d * 40, a.floorY - 16, d, 'enemy'); fb.vx = d * 200; fb.vy = 0; fb.gravity = 0; world.spawnProjectile(fb); }
          }
        } else {
          this.y += ((this.centerY) - this.y) * Math.min(1, dt * 2.5);
          if (this.stateT > 2.2) this.setState('drift');
        }
        break;
      }
      case 'ring':
        this.y += (this.centerY - this.y) * Math.min(1, dt * 3);
        if (this.stateT > 0.6 && !this.fired) {
          this.fired = true;
          for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2 + this.t;
            const fb = new Projectile('fireball', this.x, this.y - 40, Math.cos(ang) >= 0 ? 1 : -1, 'enemy');
            fb.vx = Math.cos(ang) * 170; fb.vy = Math.sin(ang) * 170; fb.gravity = 0;
            world.spawnProjectile(fb);
          }
          world.sfx('boss_roar'); world.camera.shake(4, 0.3);
        }
        if (this.stateT > 1.3) this.setState('drift');
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
    this.hp = 60; this.maxHp = 60; this.facing = -1;
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
        this.alpha = Math.min(1, this.stateT / 1.5);
        this.frame = 'idle'; this.physics(level, dt);
        if (this.stateT > 1.8) this.setState('stalk');
        break;
      case 'stalk': {
        this.alpha = 1; this.faceP(p);
        const sp = this.phase2 ? 70 : 48;
        this.vx = Math.abs(dx) > 90 ? this.facing * sp : 0;
        this.frame = 'idle';
        this.physics(level, dt); this.clampX(20);
        if (this.stateT > (this.phase2 ? 0.7 : 1.1) * this.tempo) {
          this.actions++;
          const r = Math.random();
          if (this.phase2 && this.actions % 4 === 0) this.setState('blizzard');
          else if (Math.abs(dx) < 120) this.setState('lunge');
          else if (r < 0.45) this.setState('throw');
          else if (r < 0.65) this.setState('summon');
          else this.setState('lunge');
        }
        break;
      }
      case 'throw':
        this.vx = 0; this.frame = 'throw'; this.physics(level, dt);
        if (this.stateT > 0.4 && !this.fired) {
          this.fired = true; this.faceP(p);
          const n = this.phase2 ? 3 : 2;
          for (let i = 0; i < n; i++) {
            const g = new Projectile('present', this.x + this.facing * 20, this.y - 70, this.facing, 'enemy');
            g.vx = this.facing * (120 + i * 70); g.vy = -440 + i * 60;
            world.spawnProjectile(g);
          }
          world.sfx('throw');
        }
        if (this.stateT > 1.0) this.setState('stalk');
        break;
      case 'lunge':
        if (this.stateT < 0.03) { this.faceP(p); world.sfx('whip'); }
        this.vx = this.stateT < 0.6 ? this.facing * 260 : 0;
        this.frame = this.stateT < 0.6 ? 'lunge' : 'idle';
        this.physics(level, dt); this.clampX(18);
        if (this.stateT > 1.0) this.setState('stalk');
        break;
      case 'summon':
        this.vx = 0; this.frame = 'throw'; this.physics(level, dt);
        if (this.stateT > 0.5 && !this.fired) {
          this.fired = true;
          for (let i = 0; i < 2; i++) {
            const w = new FrostWisp(i === 0 ? a.x0 + 10 : a.x1 - 10, p.y - 50 - i * 30, i === 0 ? 1 : -1);
            world.spawnEnemy(w);
          }
          world.sfx('fire');
        }
        if (this.stateT > 1.2) this.setState('stalk');
        break;
      case 'blizzard':
        // Shards rain from above across the arena for two seconds.
        this.vx = 0; this.frame = 'throw'; this.physics(level, dt);
        this.rainT = (this.rainT || 0) - dt;
        if (this.stateT > 0.4 && this.stateT < 2.4 && this.rainT <= 0) {
          this.rainT = 0.16;
          const sx = a.x0 + Math.random() * (a.x1 - a.x0);
          const s = new Projectile('iceshard', sx, a.floorY - 300, 1, 'enemy');
          s.vx = (Math.random() - 0.5) * 60; s.vy = 220; s.gravity = 0.2; s.life = 2.5;
          world.spawnProjectile(s);
        }
        if (this.stateT > 2.8) this.setState('stalk');
        break;
      default: this.setState('stalk');
    }
  }

  swingBox() {
    if (this.state !== 'lunge' || this.stateT > 0.6) return null;
    return { x: this.facing > 0 ? this.x : this.x - 60, y: this.y - 84, w: 60, h: 74 };
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
    this.hp = 30; this.maxHp = 30;
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
        if (this.stateT > 1.7) this.setState('march');
        break;
      case 'march': {
        this.alpha = 1; this.faceP(p);
        const sp = this.phase2 ? 52 : 36;
        this.vx = Math.abs(dx) > 96 ? this.facing * sp : 0;
        this.frame = Math.floor(this.t * 3.2) % 2 ? 'idle1' : 'idle0';
        this.physics(level, dt);
        this.clampX(42);
        if (this.stateT > (this.phase2 ? 1.0 : 1.55) * this.tempo) {
          this.actions++;
          if (this.actions % 3 === 1) this.setState('volley');
          else if (this.actions % 3 === 2) this.setState('roots');
          else this.setState('canopy');
        }
        break;
      }
      case 'volley':
        // Fires a spread of barbed briar thorns from its hollow maw
        this.vx = 0; this.frame = this.stateT < 0.35 ? 'roar' : 'slam';
        this.physics(level, dt);
        if (this.stateT >= 0.38 && !this.fired) {
          this.fired = true; this.faceP(p);
          const n = this.phase2 ? 4 : 3;
          for (let i = 0; i < n; i++) {
            const ang = Math.atan2((p.y - 30) - (this.y - 68), p.x - this.x) + (i - (n - 1) * 0.5) * 0.20;
            const th = new Projectile('thorn', this.x + this.facing * 26, this.y - 68, this.facing, 'enemy');
            th.vx = Math.cos(ang) * 245; th.vy = Math.sin(ang) * 245; th.gravity = 0.05;
            th.dir = th.vx >= 0 ? 1 : -1;
            world.spawnProjectile(th);
          }
          world.sfx('throw');
        }
        if (this.stateT > 1.05) this.setState('march');
        break;
      case 'roots':
        // Slams giant claws into the forest floor, erupting upward spore bursts
        this.vx = 0;
        this.frame = this.stateT < 0.42 ? 'roar' : 'slam';
        this.physics(level, dt);
        if (this.stateT >= 0.42 && !this.fired) {
          this.fired = true;
          world.camera.shake(6, 0.38);
          world.sfx('block');
          const count = this.phase2 ? 4 : 3;
          for (let i = 0; i < count; i++) {
            const rx = a.x0 + 56 + ((i + 0.5) / count) * (a.x1 - a.x0 - 112);
            world.particles.shards(rx, a.floorY, 8, '#3f6a54', a.floorY);
            world.particles.sparks(rx, a.floorY - 12, 8, '#62f2c2');
            const sp = new Projectile('spore', rx, a.floorY - 18, rx < p.x ? 1 : -1, 'enemy');
            sp.vx = (p.x >= rx ? 1 : -1) * 78;
            sp.life = 2.2;
            world.spawnProjectile(sp);
          }
        }
        if (this.stateT > 1.25) this.setState('march');
        break;
      case 'canopy':
        // Calls Night-Owls swooping from the upper boughs
        this.vx = 0; this.frame = 'roar';
        this.physics(level, dt);
        if (this.stateT >= 0.45 && !this.fired) {
          this.fired = true;
          const n = this.phase2 ? 2 : 1;
          for (let i = 0; i < n; i++) {
            const fromLeft = (i % 2 === 0) ? (p.x > (a.x0 + a.x1) * 0.5) : true;
            const ox = fromLeft ? a.x0 + 18 : a.x1 - 18;
            const owl = new NightOwl(ox, a.floorY - 175 - i * 24);
            owl.wake(fromLeft ? 1 : -1, p.y - 34);
            world.spawnEnemy(owl);
          }
          world.sfx('boss_roar');
        }
        if (this.stateT > 1.15) this.setState('march');
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
    this.hp = 44; this.maxHp = 44;
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
        if (this.stateT > 1.6) this.setState('march');
        break;
      case 'march': {
        this.alpha = 1; this.faceP(p);
        const sp = this.phase2 ? 64 : 42;
        this.vx = Math.abs(dx) > 84 ? this.facing * sp : 0;
        this.frame = Math.abs(this.vx) > 1 && Math.floor(this.t * 4) % 2 ? 'walk' : 'idle';
        if (Math.abs(this.vx) > 1 && Math.floor(this.t * 4) % 2 === 0 && Math.floor(this.t * 8) % 2 === 0) world.particles.dust(this.x, this.y, 1, '#8a7a60');
        this.physics(level, dt); this.clampX(34);
        if (this.stateT > (this.phase2 ? 0.8 : 1.3) * this.tempo) {
          this.actions++;
          if (Math.abs(dx) < 110) this.setState('punch');
          else if (this.phase2 && this.actions % 4 === 0) this.setState('overload');
          else if (this.actions % 2 === 0) this.setState('cogs');
          else this.setState('punch');
        }
        break;
      }
      case 'punch':
        // Wind-up, then a piston punch that lunges forward
        if (this.stateT < 0.3) { this.vx = 0; this.frame = 'idle'; this.faceP(p); }
        else if (this.stateT < 0.6) {
          this.frame = 'punch';
          this.vx = this.facing * 230;
          if (!this.fired) { this.fired = true; world.sfx('whip'); world.particles.smoke(this.x + this.facing * 30, this.y - 70, 4, 'rgba(220,220,230,0.5)'); }
        } else { this.vx = 0; this.frame = 'idle'; }
        this.physics(level, dt); this.clampX(30);
        if (this.stateT > 1.0) this.setState('march');
        break;
      case 'cogs':
        this.vx = 0; this.frame = this.stateT < 0.35 ? 'idle' : 'overload';
        this.physics(level, dt);
        if (this.stateT >= 0.4 && !this.fired) {
          this.fired = true; this.faceP(p);
          const n = this.phase2 ? 3 : 2;
          for (let i = 0; i < n; i++) {
            const c = new Projectile('cog', this.x + this.facing * 20, this.y - 96, this.facing, 'enemy');
            c.vx = this.facing * (150 + i * 70); c.vy = -300 - i * 60;
            world.spawnProjectile(c);
          }
          world.sfx('throw');
        }
        if (this.stateT > 1.1) this.setState('march');
        break;
      case 'overload':
        // Furnace blows open: ring of cogs, screen shake
        this.vx = 0; this.frame = 'overload'; this.physics(level, dt);
        if (Math.random() < 0.7) world.particles.embers(this.x + (Math.random() - 0.5) * 40, this.y - 70, 1);
        if (this.stateT >= 0.6 && !this.fired) {
          this.fired = true;
          for (let i = 0; i < 7; i++) {
            const ang = -Math.PI * (0.12 + 0.76 * (i / 6));
            const c = new Projectile('cog', this.x, this.y - 90, Math.cos(ang) >= 0 ? 1 : -1, 'enemy');
            c.vx = Math.cos(ang) * 230; c.vy = Math.sin(ang) * 300; c.gravity = 0.6; c.bounces = 1;
            world.spawnProjectile(c);
          }
          world.sfx('boss_roar'); world.camera.shake(6, 0.4);
        }
        if (this.stateT > 1.6) this.setState('march');
        break;
      default: this.setState('march');
    }
  }

  swingBox() {
    if (this.state !== 'punch' || this.stateT < 0.3 || this.stateT > 0.62) return null;
    return { x: this.facing > 0 ? this.x + 10 : this.x - 10 - 74, y: this.y - 92, w: 74, h: 40 };
  }
}


// ------------------------------------------------------- Spectral Archivist

/** The Spectral Archivist: keeper of the forbidden library. Drifts above the
 *  reading-room dais, hurls fans of razor pages, flings cursed tomes off the
 *  shelves at the hunter, calls phantoms, and in phase 2 raises a grimoire
 *  shield while a storm of pages rains down. */
export class SpectralArchivist extends Boss {
  constructor(x, y, arena, difficulty) {
    super(x, y, arena, difficulty);
    this.sheet = 'archivist';
    this.w = 50; this.h = 100;
    this.hp = 38; this.maxHp = 38;
    this.flies = true; this.gravityScale = 0;
    this.centerY = arena.floorY - 96; this.y = this.centerY;
    this.facing = -1; this.cycle = 0; this.frame = 'idle';
    this.auraKind = 'violet';
  }

  update(dt, level, world) {
    this.t += dt; this.stateT += dt; this.flash = Math.max(0, this.flash - dt);
    if (this.deathT >= 0) {
      this.frame = 'shield';
      if (Math.random() < 0.5) world.particles.sparks(this.x + (Math.random() - 0.5) * 60, this.y - Math.random() * 90, 2, '#bfe6ff');
      this.updateDeath(dt, world, 30);
      return;
    }
    this.checkPhase2(world);
    const p = world.player, a = this.arena;
    const dx = p.x - this.x;
    const bob = Math.sin(this.t * 1.8) * 9;
    if (Math.random() < 0.35) world.particles.emit({ x: this.x + (Math.random() - 0.5) * 30, y: this.y - 10, vx: 0, vy: 14, life: 0.7, color: 'rgba(170, 210, 255, 0.45)', size: 2, gravity: 0, glow: true });
    switch (this.state) {
      case 'enter':
        this.alpha = Math.min(1, this.stateT / 1.4);
        this.frame = 'idle'; this.y = this.centerY + bob;
        if (this.stateT > 1.7) this.setState('drift');
        break;
      case 'drift': {
        this.alpha = 1; this.faceP(p);
        const tx = clamp(p.x + (dx > 0 ? -140 : 140), a.x0 + 60, a.x1 - 60);
        this.x += Math.sign(tx - this.x) * Math.min(Math.abs(tx - this.x), (this.phase2 ? 110 : 80) * dt);
        this.y = this.centerY + bob;
        this.frame = 'idle';
        if (this.stateT > (this.phase2 ? 1.1 : 1.7) * this.tempo) {
          this.cycle++;
          if (this.cycle % 4 === 0) this.setState('summon');
          else if (this.phase2 && this.cycle % 4 === 2) this.setState('storm');
          else if (this.cycle % 2 === 1) this.setState('pages');
          else this.setState('tomes');
        }
        break;
      }
      case 'pages':
        // A fan of razor pages toward the hunter
        this.y = this.centerY + bob; this.frame = 'cast';
        if (this.stateT >= 0.45 && !this.fired) {
          this.fired = true; this.faceP(p);
          const n = this.phase2 ? 5 : 3;
          for (let i = 0; i < n; i++) {
            const ang = Math.atan2((p.y - 30) - (this.y - 50), p.x - this.x) + (i - (n - 1) / 2) * 0.17;
            const pg = new Projectile('page', this.x + this.facing * 24, this.y - 50, this.facing, 'enemy');
            pg.vx = Math.cos(ang) * 240; pg.vy = Math.sin(ang) * 240; pg.dir = pg.vx >= 0 ? 1 : -1;
            world.spawnProjectile(pg);
          }
          world.sfx('throw');
        }
        if (this.stateT > 1.1) this.setState('drift');
        break;
      case 'tomes':
        // Books tear off the shelves on both sides and dive at the hunter
        this.y = this.centerY + bob; this.frame = 'summon';
        if (this.stateT >= 0.5 && !this.fired) {
          this.fired = true;
          const n = this.phase2 ? 2 : 1;
          for (let i = 0; i < n; i++) {
            const fromLeft = i % 2 === 0;
            const t = new CursedTome(fromLeft ? a.x0 + 20 : a.x1 - 20, a.floorY - 150 - i * 30);
            t.wake(fromLeft ? 1 : -1);
            world.spawnEnemy(t);
            world.particles.dust(t.x, t.y, 6, '#c9b58a');
          }
          world.sfx('candle');
        }
        if (this.stateT > 1.2) this.setState('drift');
        break;
      case 'summon':
        this.y = this.centerY + bob; this.frame = 'summon';
        if (this.stateT >= 0.55 && !this.fired) {
          this.fired = true;
          const g = new Phantom(p.x > (a.x0 + a.x1) / 2 ? a.x0 + 24 : a.x1 - 24, a.floorY - 110, p.x > (a.x0 + a.x1) / 2 ? 1 : -1);
          g.lungeCd = 1.0;
          world.spawnEnemy(g);
          world.sfx('boss_roar');
        }
        if (this.stateT > 1.3) this.setState('drift');
        break;
      case 'storm':
        // Grimoire shield up; pages rain across the arena for two seconds
        this.y = this.centerY - 20 + bob; this.frame = 'shield';
        this.rainT = (this.rainT || 0) - dt;
        if (this.stateT > 0.4 && this.stateT < 2.4 && this.rainT <= 0) {
          this.rainT = 0.14;
          const sx = a.x0 + Math.random() * (a.x1 - a.x0);
          const pg = new Projectile('page', sx, a.floorY - 290, 1, 'enemy');
          pg.vx = (Math.random() - 0.5) * 80; pg.vy = 210; pg.gravity = 0.15; pg.life = 2.6;
          world.spawnProjectile(pg);
        }
        if (this.stateT > 2.9) this.setState('drift');
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

/** The Gargoyle Archon: the cathedral's basalt guardian. Perches high under
 *  the rose window, dives in long pounces across the nave, roars the lesser
 *  gargoyles awake, and curls into an impervious stone shell that sheds a
 *  rain of razor masonry. */
export class GargoyleArchon extends Boss {
  constructor(x, y, arena, difficulty) {
    super(x, y, arena, difficulty);
    this.sheet = 'archon';
    this.w = 70; this.h = 104;
    this.hp = 46; this.maxHp = 46;
    this.flies = true; this.gravityScale = 0;
    this.perchY = arena.ceilY + 70; this.y = this.perchY;
    this.facing = -1; this.cycle = 0; this.frame = 'roar';
    this.auraKind = 'crimson';
  }

  update(dt, level, world) {
    this.t += dt; this.stateT += dt; this.flash = Math.max(0, this.flash - dt);
    if (this.deathT >= 0) {
      this.frame = 'shell';
      if (Math.random() < 0.6) world.particles.shards(this.x + (Math.random() - 0.5) * 60, this.y - Math.random() * 90, 2, '#9a9aa8', this.arena.floorY);
      this.updateDeath(dt, world, 90);
      return;
    }
    this.checkPhase2(world);
    const p = world.player, a = this.arena;
    const dx = p.x - this.x;
    const bob = Math.sin(this.t * 2) * 5;
    // Airborne wingbeat: wings spread wide, then swept back, ~3 beats a second.
    const flap = Math.floor(this.t * 6) % 2 ? 'pounce' : 'roar';
    switch (this.state) {
      case 'enter':
        this.alpha = Math.min(1, this.stateT / 1.4);
        this.frame = flap; this.y = this.perchY + bob;
        if (this.stateT > 1.7) this.setState('perch');
        break;
      case 'perch': {
        this.alpha = 1; this.faceP(p);
        const tx = clamp(p.x, a.x0 + 80, a.x1 - 80);
        this.x += Math.sign(tx - this.x) * Math.min(Math.abs(tx - this.x), (this.phase2 ? 120 : 85) * dt);
        this.y = this.perchY + bob; this.frame = flap;
        if (this.stateT > (this.phase2 ? 1.0 : 1.6) * this.tempo) {
          this.cycle++;
          if (this.cycle % 4 === 0) this.setState('roar');
          else if (this.phase2 && this.cycle % 4 === 2) this.setState('shell');
          else {
            this.setState('pounce');
            this.from = { x: this.x, y: this.y };
            this.via = { x: p.x, y: p.y - 30 };
            const dir = p.x > this.x ? 1 : -1;
            this.to = { x: clamp(p.x + dir * 260, a.x0 + 70, a.x1 - 70), y: this.perchY };
            world.sfx('whip');
          }
        }
        break;
      }
      case 'pounce': {
        const dur = (this.phase2 ? 1.0 : 1.3) * this.tempo;
        const k = Math.min(1, this.stateT / dur);
        const q = (p0, p1, p2) => (1 - k) * (1 - k) * p0 + 2 * (1 - k) * k * p1 + k * k * p2;
        const nx = q(this.from.x, this.via.x, this.to.x);
        this.facing = nx >= this.x ? 1 : -1;
        this.x = nx; this.y = q(this.from.y, this.via.y, this.to.y);
        this.frame = k < 0.75 ? 'pounce' : flap;
        if (k > 0.4 && k < 0.6 && Math.random() < 0.5) world.particles.dust(this.x, this.y, 2, '#9a9aa8');
        if (k >= 1) { this.setState('perch'); }
        break;
      }
      case 'roar':
        this.y = this.perchY + bob; this.frame = 'roar';
        if (this.stateT >= 0.5 && !this.fired) {
          this.fired = true;
          const n = this.phase2 ? 2 : 1;
          for (let i = 0; i < n; i++) {
            const fromLeft = i === 0 ? p.x > (a.x0 + a.x1) / 2 : p.x <= (a.x0 + a.x1) / 2;
            const g = new Gargoyle(fromLeft ? a.x0 + 24 : a.x1 - 24, a.ceilY + 30);
            g.wake(fromLeft ? 1 : -1, p.y - 34);
            world.spawnEnemy(g);
          }
          world.sfx('boss_roar'); world.camera.shake(5, 0.4);
          if (world.onBossRoar) world.onBossRoar();
        }
        if (this.stateT > 1.3) this.setState('perch');
        break;
      case 'shell':
        // Impervious stone shell high in the apse; masonry rains across the nave
        this.y += ((this.perchY - 30) - this.y) * Math.min(1, dt * 3); this.frame = 'shell';
        this.rainT = (this.rainT || 0) - dt;
        if (this.stateT > 0.5 && this.stateT < 2.6 && this.rainT <= 0) {
          this.rainT = 0.17;
          const sx = a.x0 + Math.random() * (a.x1 - a.x0);
          const sh = new Projectile('shard', sx, a.floorY - 300, 1, 'enemy');
          sh.vx = (Math.random() - 0.5) * 60; sh.vy = 200; sh.gravity = 0.25; sh.life = 2.6;
          world.spawnProjectile(sh);
        }
        if (this.stateT > 3.0) this.setState('perch');
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
    const k = this.stateT / ((this.phase2 ? 1.0 : 1.3) * this.tempo);
    if (k < 0.3 || k > 0.7) return null;
    return { x: this.x - 40, y: this.y - 70, w: 80, h: 60 };
  }
}
