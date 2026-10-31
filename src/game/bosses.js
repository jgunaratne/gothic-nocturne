// Stage bosses built on the enemy sheets (scaled/tinted) plus the Count.
// The Phantom Reaper lives in boss.js; the Reaper Lord extends it.

import { SCORE } from '../engine/constants.js';
import { Enemy, Bat, MedusaHead } from './enemies.js';
import { Projectile } from './objects.js';
import { Reaper } from './boss.js';

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
    this.y += fall * dt;
    if (this.deathT > 2.6) { this.dead = true; world.onBossDefeated(this); }
  }

  drawAura(ctx, x, y, r) {
    const g = ctx.createRadialGradient(x, y, 4, x, y, r);
    g.addColorStop(0, this.aura);
    g.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = this.alpha; ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.restore();
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
    this.sheet = 'bat'; this.scale = 2.6; this.w = 84; this.h = 52;
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
    this.sheet = 'skeleton'; this.scale = 1.7; this.w = 34; this.h = 94;
    this.hp = 30; this.maxHp = 30; this.tint = 'rgba(200, 40, 40, 0.4)';
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
    this.sheet = 'medusa'; this.scale = 3; this.w = 56; this.h = 64;
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
    case 'bonecaptain': return new BoneCaptain(x, y, arena, difficulty);
    case 'gorgon': return new Gorgon(x, y, arena, difficulty);
    case 'reaperlord': return new ReaperLord(x, y, arena, difficulty);
    case 'count': return new Count(x, y, arena, difficulty);
    case 'reaper':
    default: return new Reaper(x, y, arena, difficulty);
  }
}
