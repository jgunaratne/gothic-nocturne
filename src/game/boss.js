// Boss: the Phantom Reaper. Hovers, closes in for scythe swings, hurls
// boomerang sickles, summons homing skulls, and blinks across the arena.

import { SCORE } from '../engine/constants.js';
import { Enemy } from './enemies.js';
import { Projectile } from './objects.js';

export class Reaper extends Enemy {
  constructor(x, y, arena, difficulty) {
    super(x, y);
    this.w = 44; this.h = 96; this.hp = 104; this.maxHp = 104;
    this.score = SCORE.boss; this.sheet = 'boss'; this.flies = true; this.gravityScale = 0;
    this.arena = arena;
    this.tempo = difficulty ? difficulty.bossTempo : 1;         // < 1 = attacks sooner
    this.phase2At = difficulty ? difficulty.bossPhase2 : 0.5;   // fraction of max HP
    this.facing = -1;                 // source art faces LEFT; facing=-1 means "unflipped"
    this.touchDamage = 4;
    this.swingDamage = 5;
    this.state = 'enter'; this.stateT = 0; this.t = 0;
    this.baseY = y; this.hoverX = x;
    this.alpha = 0;
    this.attackCount = 0;
    this.swingBoxActive = false;
    this.frame = 'idle0';
    this.phase2 = false;
  }

  get alive() { return !this.dead && this.deathT < 0; }

  // Source art faces right (like every other sheet); flip to face left.
  get flip() { return this.facing < 0; }

  update(dt, level, world) {
    this.t += dt;
    this.stateT += dt;
    this.flash = Math.max(0, this.flash - dt);
    const p = world.player;
    if (this.deathT >= 0) {
      this.deathT += dt;
      if (Math.random() < 0.6) world.particles.sparks(this.x + (Math.random() - 0.5) * 60, this.y - Math.random() * 100, 3, '#d7b8ff');
      if (Math.random() < 0.3) world.particles.smoke(this.x, this.y - 30, 2, 'rgba(120,60,200,0.5)');
      this.alpha = Math.max(0, 1 - this.deathT / 2.4);
      this.y = Math.min(this.arena.floorY - 6, this.y + 10 * dt);
      this.x = clamp(this.x, this.arena.x0 + 36, this.arena.x1 - 36);
      if (this.deathT > 2.6) { this.dead = true; world.onBossDefeated(this); }
      return;
    }
    if (!this.phase2 && this.hp <= this.maxHp * this.phase2At) { this.phase2 = true; world.sfx('boss_roar'); world.camera.shake(5, 0.5); }
    const hover = Math.sin(this.t * 2.2) * 10;
    const faceP = () => { this.facing = p.x > this.x ? 1 : -1; };
    this.swingBoxActive = false;

    switch (this.state) {
      case 'enter':
        this.alpha = Math.min(1, this.stateT / 1.5);
        this.frame = Math.floor(this.t * 3) % 2 ? 'idle0' : 'idle1';
        this.y = this.baseY + hover;
        if (this.stateT > 1.8) this.setState('hover');
        break;
      case 'hover': {
        this.alpha = 1;
        faceP();
        const speed = this.phase2 ? 118 : 88;
        const targetX = p.x + (p.x > this.x ? -105 : 105);
        this.x += Math.sign(targetX - this.x) * Math.min(speed * dt, Math.abs(targetX - this.x));
        this.x = clamp(this.x, this.arena.x0 + 30, this.arena.x1 - 30);
        // Hover with the robe hem near the hunter's knees so the whip can reach.
        const targetY = p.y - 12 + Math.sin(this.t * 0.9) * 22;
        this.baseY += (targetY - this.baseY) * Math.min(1, dt * 1.8);
        this.baseY = clamp(this.baseY, this.arena.floorY - 160, this.arena.floorY - 14);
        this.y = this.baseY + hover;
        this.frame = Math.floor(this.t * 3) % 2 ? 'idle0' : 'idle1';
        const dur = (this.phase2 ? 1.02 : 1.50) * this.tempo;
        if (this.stateT > dur) {
          const dx = Math.abs(p.x - this.x);
          const roll = Math.random();
          if (dx < 135) this.setState('windup');
          else if (roll < 0.44) this.setState('sickle');
          else if (roll < 0.72) this.setState('skulls');
          else if (roll < 0.88) this.setState('blink');
          else this.setState('windup');
        }
        break;
      }
      case 'windup':
        this.frame = 'windup';
        this.y = this.baseY + hover;
        if (this.stateT > 0.40) { this.fired = false; this.setState('swing'); world.sfx('knight_slash'); }
        break;
      case 'swing': {
        this.frame = 'swing';
        // Lunge forward with the swing.
        this.x += this.facing * (this.phase2 ? 235 : 205) * dt;
        this.x = clamp(this.x, this.arena.x0 + 30, this.arena.x1 - 30);
        this.y = this.baseY + hover;
        this.swingBoxActive = this.stateT > 0.04 && this.stateT < 0.36;
        if (this.phase2 && this.stateT > 0.08 && !this.fired) {
          this.fired = true;
          const cw = new Projectile('crimson_wave', this.x + this.facing * 26, this.y - 46, this.facing, 'enemy');
          cw.vx = this.facing * 245;
          world.spawnProjectile(cw);
        }
        if (this.stateT > 0.52) { this.fired = false; this.setState('hover'); }
        break;
      }
      case 'sickle':
        this.frame = 'windup';
        this.y = this.baseY + hover;
        if (this.stateT > 0.32 && !this.fired) {
          this.fired = true;
          faceP();
          const ys = this.phase2 ? [-74, -48, -22] : [-64, -32];
          for (let i = 0; i < ys.length; i++) {
            const sk = new Projectile('sickle', this.x + this.facing * 20, this.y + ys[i], this.facing, 'enemy');
            sk.vx *= (1 + i * 0.08);
            world.spawnProjectile(sk);
          }
          world.sfx('throw');
          this.frame = 'swing';
        }
        if (this.stateT > 0.78) { this.fired = false; this.setState('hover'); }
        break;
      case 'skulls':
        this.frame = 'windup';
        this.y = this.baseY + hover;
        if (this.stateT > 0.38 && !this.fired) {
          this.fired = true;
          faceP();
          const count = this.phase2 ? 4 : 3;
          for (let i = 0; i < count; i++) {
            const off = (i - (count - 1) * 0.5) * 20;
            const s = new Projectile('skull', this.x + off, this.y - 80, this.facing, 'enemy');
            s.vy = -135 + i * 34;
            world.spawnProjectile(s);
          }
          if (this.phase2) {
            const hf = new Projectile('hellfire', this.x + this.facing * 22, this.y - 48, this.facing, 'enemy');
            const ang = Math.atan2((p.y - 30) - (this.y - 48), p.x - this.x);
            hf.vx = Math.cos(ang) * 235; hf.vy = Math.sin(ang) * 235;
            world.spawnProjectile(hf);
          }
          world.sfx('wraith_shriek');
        }
        if (this.stateT > 0.85) { this.fired = false; this.setState('hover'); }
        break;
      case 'blink': {
        // Fade out, reappear on the other side of the hunter.
        const half = 0.36;
        if (this.stateT < half) this.alpha = 1 - this.stateT / half;
        else if (!this.blinked) {
          this.blinked = true;
          const side = p.x > (this.arena.x0 + this.arena.x1) / 2 ? -1 : 1;
          this.x = clamp(p.x + side * 135, this.arena.x0 + 40, this.arena.x1 - 40);
          this.baseY = p.y - 54;
          faceP();
          world.particles.smoke(this.x, this.y - 40, 10, 'rgba(120,60,200,0.5)');
        } else this.alpha = Math.min(1, (this.stateT - half) / half);
        this.y = this.baseY + hover;
        this.frame = 'idle1';
        if (this.stateT > 0.74) { this.blinked = false; this.setState('windup'); }
        break;
      }
      default: this.setState('hover');
    }
  }

  setState(s) { this.state = s; this.stateT = 0; }

  /** Scythe hit box (world) while swinging, else null. */
  swingBox() {
    if (!this.swingBoxActive) return null;
    const w = 86;
    return { x: this.facing > 0 ? this.x : this.x - w, y: this.y - 86, w, h: 70 };
  }

  takeHit(dmg, fromX, world) {
    if (!this.alive || this.state === 'enter' || this.alpha < 0.6) return false;
    this.hp -= dmg;
    this.flash = 0.12;
    world.sfx('boss_hit');
    world.particles.sparks(this.x + (Math.random() - 0.5) * 30, this.y - 50, 8, '#d7b8ff');
    if (this.hp <= 0) {
      this.hp = 0;
      this.deathT = 0;
      world.sfx('boss_die');
      world.camera.shake(8, 1.2);
      world.addScore(this.score);
      if (world.awardEnemyExp) world.awardEnemyExp(this, { isBoss: true });
    }
    return this.hp <= 0;
  }

  draw(ctx, assets, camX, camY) {
    const a = this.alpha;
    if (a <= 0) return;
    // Spectral aura
    const x = this.x - camX, y = this.y - camY - 50;
    const g = ctx.createRadialGradient(x, y, 4, x, y, 70);
    g.addColorStop(0, `rgba(120, 60, 200, ${0.22 * a})`);
    g.addColorStop(1, 'rgba(80, 30, 140, 0)');
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(x - 70, y - 70, 140, 140); ctx.restore();
    this.drawSprite(ctx, assets, camX, camY, this.flip, a);
  }
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
