// Boss: the Phantom Reaper (and base class for the Clock Tower's Reaper Lord).
// Hovers with billowing cloak clips, coils into overhead two-handed scythe raises,
// cleaves with crescent arcs & afterimages, hurls boomerang sickles, invokes
// homing skulls with clawed dark-casting poses, and blinks through shadow rifts.

import { SCORE } from '../engine/constants.js';
import { clipFrame } from './anim_clips.js';
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
    this.facing = -1;                 // source art faces right; facing=-1 flips left toward the hunter
    this.touchDamage = 4;
    this.swingDamage = 5;
    this.state = 'enter'; this.stateT = 0; this.t = 0;
    this.baseY = y; this.hoverX = x;
    this.prevX = x;
    this.vxSmooth = 0;
    this.xf = null;
    this.trail = [];
    this.trailT = 0;
    this.alpha = 0;
    this.attackCount = 0;
    this.swingBoxActive = false;
    this.frame = 'idle0';
    this.phase2 = false;

    // Customizable visual signature (overridden by ReaperLord for gilded-crimson sovereignty)
    this.auraRgb = [132, 68, 224];
    this.auraOuterRgb = [72, 26, 138];
    this.slashCore = '#f5edff';
    this.slashRim = 'rgba(176, 96, 255, 0.80)';
    this.trailTint = 'rgba(138, 68, 236, 0.55)';
    this.sparkColor = '#d7b8ff';
    this.smokeColor = 'rgba(120, 60, 200, 0.52)';
  }

  get alive() { return !this.dead && this.deathT < 0; }

  // Source art faces right (like every other sheet); flip to face left.
  get flip() { return this.facing < 0; }

  update(dt, level, world) {
    this.t += dt;
    this.stateT += dt;
    this.flash = Math.max(0, this.flash - dt);
    for (const tr of this.trail) tr.age += dt;
    this.trail = this.trail.filter((tr) => tr.age < tr.dur);

    const p = world.player;
    if (this.deathT >= 0) {
      this.deathT += dt;
      if (Math.random() < 0.65) {
        world.particles.sparks(
          this.x + (Math.random() - 0.5) * 64,
          this.y - Math.random() * 104,
          3,
          this.sparkColor,
        );
      }
      if (Math.random() < 0.35) world.particles.smoke(this.x, this.y - 34, 2, this.smokeColor);
      this.alpha = Math.max(0, 1 - this.deathT / 2.4);
      this.y = Math.min(this.arena.floorY - 6, this.y + 10 * dt);
      this.x = clamp(this.x, this.arena.x0 + 36, this.arena.x1 - 36);
      this.prevX = this.x;
      this.xf = { sx: 1 - 0.14 * Math.min(1, this.deathT / 2.2), sy: 1 + 0.16 * Math.min(1, this.deathT / 2.2), skew: 0 };
      if (this.deathT > 2.6) { this.dead = true; world.onBossDefeated(this); }
      return;
    }
    if (!this.phase2 && this.hp <= this.maxHp * this.phase2At) {
      this.phase2 = true;
      world.sfx('boss_roar');
      world.camera.shake(5, 0.5);
      if (world.onBossRoar) world.onBossRoar();
    }
    const hover = Math.sin(this.t * 2.2) * 10;
    const faceP = () => { this.facing = p.x > this.x ? 1 : -1; };
    const castFrame = this.sheet === 'boss' ? 'cast' : 'windup';
    this.swingBoxActive = false;
    let teleportedThisTick = false;

    switch (this.state) {
      case 'enter':
        this.alpha = Math.min(1, this.stateT / 1.5);
        this.frame = 'idle0';
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
        this.frame = 'idle0';
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
        faceP();
        this.frame = 'windup';
        // Slight upward levitation coil before the scythe drops
        this.y = this.baseY + hover - Math.min(1, this.stateT / 0.36) * 8;
        if (Math.random() < 0.35) {
          world.particles.sparks(this.x - this.facing * 12, this.y - 76, 1, this.sparkColor);
        }
        if (this.stateT > 0.40) {
          this.fired = false;
          this.setState('swing');
          world.sfx('knight_slash');
          world.camera.shake(1.6, 0.14);
        }
        break;
      case 'swing': {
        this.frame = 'swing';
        // Lunge forward with the scythe cleave.
        this.x += this.facing * (this.phase2 ? 235 : 205) * dt;
        this.x = clamp(this.x, this.arena.x0 + 30, this.arena.x1 - 30);
        this.y = this.baseY + hover + 3;
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
        this.frame = this.fired ? 'swing' : 'windup';
        this.y = this.baseY + hover;
        if (!this.fired) faceP();
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
        this.frame = this.stateT < 0.72 ? castFrame : 'idle0';
        this.y = this.baseY + hover - (this.stateT < 0.42 ? 6 : 0);
        if (!this.fired) faceP();
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
          world.particles.sparks(this.x + this.facing * 24, this.y - 54, 10, this.sparkColor);
          world.sfx('wraith_shriek');
        }
        if (this.stateT > 0.85) { this.fired = false; this.setState('hover'); }
        break;
      case 'blink': {
        // Stretch into a shadow needle, vanish, and materialize across the arena.
        const half = 0.36;
        if (this.stateT < half) {
          this.alpha = 1 - this.stateT / half;
        } else if (!this.blinked) {
          this.blinked = true;
          teleportedThisTick = true;
          world.particles.smoke(this.x, this.y - 44, 8, this.smokeColor);
          const side = p.x > (this.arena.x0 + this.arena.x1) / 2 ? -1 : 1;
          this.x = clamp(p.x + side * 135, this.arena.x0 + 40, this.arena.x1 - 40);
          this.baseY = p.y - 54;
          faceP();
          world.particles.smoke(this.x, this.y - 40, 10, this.smokeColor);
          world.particles.sparks(this.x, this.y - 48, 8, this.sparkColor);
        } else {
          this.alpha = Math.min(1, (this.stateT - half) / half);
        }
        this.y = this.baseY + hover;
        this.frame = castFrame;
        if (this.stateT > 0.74) { this.blinked = false; this.setState('windup'); }
        break;
      }
      default: this.setState('hover');
    }

    // Layer B Feel: velocity lean, anticipation coil, lunge stretch & afterimage ghosts
    if (teleportedThisTick) {
      this.prevX = this.x;
      this.vxSmooth = 0;
    } else if (dt > 0) {
      const instVx = (this.x - this.prevX) / dt;
      this.prevX = this.x;
      this.vxSmooth += (instVx - this.vxSmooth) * Math.min(1, dt * 12);
    }

    let sx = 1;
    let sy = 1;
    let skew = clamp(this.vxSmooth / 760, -0.13, 0.13);
    if (this.state === 'windup' || (this.state === 'sickle' && !this.fired)) {
      const k = Math.min(1, this.stateT / 0.34);
      sx = 1 - 0.08 * k;
      sy = 1 + 0.09 * k;
      skew = clamp(skew - this.facing * 0.06 * k, -0.16, 0.16);
    } else if (this.state === 'swing' || (this.state === 'sickle' && this.fired)) {
      const k = Math.max(0, 1 - this.stateT / 0.44);
      sx = 1 + 0.12 * k;
      sy = 1 - 0.09 * k;
      skew = clamp(skew + this.facing * 0.09 * k, -0.18, 0.18);
    } else if (this.state === 'skulls') {
      if (this.stateT < 0.38) {
        const k = this.stateT / 0.38;
        sx = 1 - 0.06 * k;
        sy = 1 + 0.06 * k;
      } else {
        const k = Math.max(0, 1 - (this.stateT - 0.38) / 0.36);
        sx = 1 + 0.09 * k;
        sy = 1 - 0.07 * k;
        skew = clamp(skew + this.facing * 0.07 * k, -0.16, 0.16);
      }
    } else if (this.state === 'blink') {
      const rift = 1 - this.alpha;
      sx = 1 - 0.42 * rift;
      sy = 1 + 0.30 * rift;
    }
    this.xf = { sx, sy, skew };

    if ((this.state === 'swing' && this.stateT < 0.40) || this.state === 'blink') {
      this.trailT -= dt;
      if (this.trailT <= 0 && world.assets) {
        this.trailT = 0.045;
        const cf = clipFrame(world.assets, this);
        if (world.assets.frame(cf.sheet, cf.name)) {
          this.trail.push({
            x: this.x,
            y: this.y,
            sheet: cf.sheet,
            name: cf.name,
            flip: this.flip,
            xf: { sx, sy, skew },
            alpha: this.alpha,
            age: 0,
            dur: 0.22,
          });
          if (this.trail.length > 5) this.trail.shift();
        }
      }
    } else {
      this.trailT = 0;
    }
  }

  setState(s) { this.state = s; this.stateT = 0; }

  /** Scythe hit box (world) while swinging, else null. */
  swingBox() {
    if (!this.swingBoxActive) return null;
    const w = 90;
    return { x: this.facing > 0 ? this.x : this.x - w, y: this.y - 86, w, h: 72 };
  }

  takeHit(dmg, fromX, world) {
    if (!this.alive || this.state === 'enter' || this.alpha < 0.6) return false;
    this.hp -= dmg;
    this.flash = 0.12;
    world.sfx('boss_hit');
    world.particles.sparks(this.x + (Math.random() - 0.5) * 30, this.y - 50, 8, this.sparkColor);
    if (this.hp <= 0) {
      this.hp = 0;
      this.deathT = 0;
      world.hitStop = Math.max(world.hitStop || 0, 0.11);
      world.sfx('boss_die');
      world.camera.shake(8, 1.2);
      world.addScore(this.score);
      if (world.awardEnemyExp) world.awardEnemyExp(this, { isBoss: true });
    }
    return this.hp <= 0;
  }

  drawSlashArc(ctx, sx, sy, a) {
    if (this.state !== 'swing' || this.stateT < 0.01 || this.stateT > 0.38) return;
    const p = (this.stateT - 0.01) / 0.37;
    const head = -1.32 + Math.min(1, p / 0.34) * 1.98;
    const tail = -1.32 + Math.max(0, (p - 0.14) / 0.86) * 1.72;
    if (head - tail <= 0.06) return;
    const fade = (1 - Math.max(0, (p - 0.45) / 0.55)) * a;
    if (fade <= 0.02) return;

    ctx.save();
    ctx.translate(Math.round(sx + this.facing * 18), Math.round(sy - 46));
    ctx.scale(this.facing, 0.82);
    ctx.globalCompositeOperation = 'lighter';

    // Outer spectral/golden crescent ribbon tapering to razor points at head & tail
    const steps = 14;
    const drawCrescent = (rOut, rIn, offX, color, alpha) => {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const ang = tail + (head - tail) * u;
        const px = Math.cos(ang) * rOut;
        const py = Math.sin(ang) * rOut;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      for (let i = steps; i >= 0; i--) {
        const u = i / steps;
        const taper = Math.sin(u * Math.PI);
        const ang = tail + (head - tail) * u;
        const rInner = rOut - (rOut - rIn) * taper;
        const px = Math.cos(ang) * rInner + offX * taper;
        const py = Math.sin(ang) * rInner;
        ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    };

    drawCrescent(88, 62, -8, this.slashRim, 0.62 * fade);
    drawCrescent(85, 75, -4, this.slashCore, 0.88 * fade);
    ctx.restore();
  }

  draw(ctx, assets, camX, camY) {
    const a = this.alpha;
    if (a <= 0) return;
    const sx = this.x - camX;
    const sy = this.y - camY;
    const pulse = 0.5 + 0.5 * Math.sin((this.t || 0) * 3.8);

    // 1. Spectral / Sovereign radial aura
    const [ir, ig, ib] = this.auraRgb;
    const [or, og, ob] = this.auraOuterRgb;
    const rad = this.phase2 ? 78 : 68;
    const g = ctx.createRadialGradient(sx, sy - 50, 4, sx, sy - 50, rad);
    g.addColorStop(0, `rgba(${ir}, ${ig}, ${ib}, ${(0.24 + 0.08 * pulse) * a})`);
    g.addColorStop(1, `rgba(${or}, ${og}, ${ob}, 0)`);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(sx - rad, sy - 50 - rad, rad * 2, rad * 2);
    ctx.restore();

    // 2. Spectral dash / rift afterimage ghosts
    if (this.trail.length) {
      for (const tr of this.trail) {
        const ga = (1 - tr.age / tr.dur) * 0.34 * tr.alpha * a;
        if (ga > 0.02) {
          assets.draw(ctx, tr.sheet, tr.name, tr.x - camX, tr.y - camY, tr.flip, ga, this.scale, this.trailTint, tr.xf);
        }
      }
    }

    // 3. Optional subclass behind-body ornaments (ReaperLord orbiting soul-flames)
    if (this.drawBehindBody) this.drawBehindBody(ctx, sx, sy, a);

    // 4. Main clip-driven sprite with Layer B squash/stretch/lean transform
    this.drawSprite(ctx, assets, camX, camY, this.flip, a, this.introPose ? null : this.xf);

    // 5. Optional subclass front-of-body ornaments + crescent scythe cleave arc
    if (this.drawFrontBody) this.drawFrontBody(ctx, sx, sy, a);
    if (!this.introPose) this.drawSlashArc(ctx, sx, sy, a);
  }
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
