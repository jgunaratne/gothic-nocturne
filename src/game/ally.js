// Guardian Forest Turtle ally for Stage 2: The Darkwood.
// Scouts alongside the hunter, leaps across woodland terrain, launches spinning
// emerald rune-shell dashes into forest enemies & bosses, and clears spore/thorn
// projectiles.

import { TILE } from '../engine/constants.js';
import { clipFrame } from './anim_clips.js';
import { Entity, rectsOverlap } from './entities.js';
import { getGlowCanvas } from './tex3d.js';

const CLEARABLE_PROJ = new Set(['spore', 'thorn', 'bone', 'snowball', 'iceshard']);

export class TurtleAlly extends Entity {
  constructor(x, y) {
    super(x, y);
    this.w = 30;
    this.h = 24;
    this.facing = 1;
    this.state = 'follow';   // follow | windup | spin | recover
    this.stateT = 0;
    this.animT = 0;
    this.spinCd = 0.6;
    this.spinDir = 1;
    this.bounces = 0;
    this.frame = 'walk0';
    this.hitMap = new Map(); // Enemy -> remaining hit cooldown
    this.warpFlash = 0;
  }

  get alive() { return !this.dead; }

  /** Teleports cleanly beside the hunter with a swirl of emerald forest sparks. */
  warpToPlayer(player, world) {
    let wx = player.x - player.facing * 26;
    const wy = player.y - 8;
    if (world && world.level) {
      const lvl = world.level;
      wx = Math.max(24, Math.min(lvl.width - 24, wx));
      const tx = Math.floor(wx / TILE), ty = Math.floor((wy - 8) / TILE);
      if (lvl.isSolid(tx, ty)) wx = player.x;
    }
    this.x = wx;
    this.y = wy;
    this.vx = 0;
    this.vy = 0;
    this.riding = null;
    this.state = 'follow';
    this.stateT = 0;
    this.warpFlash = 0.35;
    if (world && world.particles) {
      world.particles.sparks(this.x, this.y - 12, 8, '#62f2c2');
    }
  }

  findTarget(world) {
    let best = null;
    let bestD = Infinity;
    for (const e of world.enemies) {
      if (!e.alive) continue;
      if (e === world.boss && e.alpha < 0.65) continue;
      const dx = e.x - this.x;
      const ey = e.y - e.h * 0.45;
      const dy = ey - (this.y - 12);
      if (Math.abs(dx) > 235 || Math.abs(dy) > 96) continue;
      // Do not launch straight into a boss Arena gate from outside, or out of arena
      if (world.bossActive && world.data.boss) {
        const a = world.data.boss.arena;
        if (e.x < a.x0 - 8 || e.x > a.x1 + 8) continue;
      }
      const d = Math.abs(dx) + Math.abs(dy) * 0.8;
      if (d < bestD) { bestD = d; best = e; }
    }
    return best;
  }

  update(dt, level, world) {
    const p = world.player;
    this.stateT += dt;
    this.spinCd = Math.max(0, this.spinCd - dt);
    this.warpFlash = Math.max(0, this.warpFlash - dt);

    for (const [en, rem] of this.hitMap) {
      if (rem - dt <= 0 || !en.alive) this.hitMap.delete(en);
      else this.hitMap.set(en, rem - dt);
    }

    // Keep inside active boss arena once locked, or warp back if separated / fallen
    if (world.bossActive && world.data.boss) {
      const a = world.data.boss.arena;
      if (this.x < a.x0 + 18 || this.x > a.x1 - 18 || this.y > a.floorY + 48) {
        this.warpToPlayer(p, world);
      }
    } else if (
      Math.abs(p.x - this.x) > 300 ||
      Math.abs(p.y - this.y) > 220 ||
      this.y > level.height + 16
    ) {
      this.warpToPlayer(p, world);
    }

    if (this.state === 'follow') {
      const leadX = p.x + p.facing * 28;
      const dx = leadX - this.x;
      if (Math.abs(dx) > 10) {
        this.facing = dx > 0 ? 1 : -1;
        const rush = Math.abs(dx) > 90 ? 185 : 142;
        this.vx = Math.sign(dx) * Math.min(rush, Math.abs(dx) * 4.5);
      } else {
        this.vx *= 0.65;
        if (Math.abs(this.vx) < 4) { this.vx = 0; this.facing = p.facing; }
      }

      // Navigate steps, ledges, and gaps autonomously
      if (this.onGround) {
        const aheadTx = Math.floor((this.x + this.facing * 20) / TILE);
        const feetTy = Math.floor((this.y + 2) / TILE);
        const stepWall = level.isSolid(aheadTx, feetTy - 1);
        const gapAhead = Math.abs(dx) > 28 && !this.riding && !level.isStandable(aheadTx, feetTy) && !level.isStandable(aheadTx, feetTy + 1);
        const playerHigher = p.y < this.y - 36 && Math.abs(p.x - this.x) < 120;
        if (this.hitWall || stepWall || gapAhead || playerHigher) {
          this.vy = -510;
          this.onGround = false;
        }
      }

      this.animT += (Math.abs(this.vx) > 8 ? dt * 9 : dt * 2.2);
      this.frame = 'walk' + (Math.floor(this.animT) % 4);

      if (this.spinCd <= 0 && p.alive && world.phase === 'play') {
        const target = this.findTarget(world);
        if (target) {
          this.state = 'windup';
          this.stateT = 0;
          this.target = target;
          this.spinDir = target.x >= this.x ? 1 : -1;
          this.facing = this.spinDir;
          this.vx = 0;
        }
      }
      this.physics(level, dt);
    } else if (this.state === 'windup') {
      this.vx = 0;
      this.frame = 'shell0';
      if (Math.random() < 0.6 && world.particles) {
        world.particles.sparks(this.x, this.y - 10, 1, '#62f2c2');
      }
      this.physics(level, dt);
      if (this.stateT >= 0.16) {
        this.state = 'spin';
        this.stateT = 0;
        this.bounces = 0;
        this.hitMap.clear();
        if (this.target && this.target.alive) {
          this.spinDir = this.target.x >= this.x ? 1 : -1;
          const targetMidY = this.target.y - this.target.h * 0.5;
          if (this.onGround && targetMidY < this.y - 26) {
            this.vy = Math.max(-390, (targetMidY - this.y) * 4.2);
            this.onGround = false;
          }
        }
        this.facing = this.spinDir;
        world.sfx('shell_spin');
      }
    } else if (this.state === 'spin') {
      this.vx = this.spinDir * 296;
      this.facing = this.spinDir;
      this.animT += dt * 28;
      this.frame = 'shell' + (Math.floor(this.animT) % 4);
      if (Math.random() < 0.65 && world.particles) {
        world.particles.emit({
          x: this.x - this.spinDir * 12,
          y: this.y - 6 - Math.random() * 10,
          vx: -this.spinDir * 40,
          vy: -12 + (Math.random() - 0.5) * 20,
          life: 0.26,
          color: '#62f2c2',
          size: 2,
          gravity: 0,
          glow: true,
        });
      }
      this.physics(level, dt);

      // Bounce off arena bounds or solid walls
      let hitBound = this.hitWall;
      if (world.bossActive && world.data.boss) {
        const a = world.data.boss.arena;
        if (this.x <= a.x0 + 20 && this.spinDir < 0) { this.x = a.x0 + 20; hitBound = true; }
        if (this.x >= a.x1 - 20 && this.spinDir > 0) { this.x = a.x1 - 20; hitBound = true; }
      }
      if (hitBound) {
        this.spinDir = -this.spinDir;
        this.facing = this.spinDir;
        this.bounces++;
        world.sfx('block');
        world.particles.sparks(this.x + this.spinDir * -12, this.y - 12, 5, '#62f2c2');
        if (this.bounces >= 2) {
          this.state = 'recover';
          this.stateT = 0;
          this.vx = this.spinDir * 120;
        }
      }

      // Strike enemies & bosses
      const hb = this.box(6);
      const dmg = Math.max(2, Math.round(2 * (world.difficulty.playerDamage || 1)));
      for (const e of world.enemies) {
        if (!e.alive || this.hitMap.has(e)) continue;
        if (rectsOverlap(hb, e.box(e === world.boss ? 6 : 0))) {
          this.hitMap.set(e, 0.32);
          e.takeHit(dmg, this.x, world);
          world.particles.sparks(e.x, e.y - e.h * 0.45, 7, '#62f2c2');
          if (e === world.boss) {
            // Tactile ricochet off heavy bosses so the shell feels weighty and fair
            this.spinDir = this.x <= e.x ? -1 : 1;
            this.vx = this.spinDir * 195;
            this.vy = -210;
            this.state = 'recover';
            this.stateT = 0;
            this.spinCd = 1.45;
            break;
          }
        }
      }

      // Shatter enemy forest/bone projectiles on contact
      for (const pr of world.projectiles) {
        if (!pr.dead && pr.owner === 'enemy' && CLEARABLE_PROJ.has(pr.type) && rectsOverlap(hb, pr.box)) {
          pr.dead = true;
          world.particles.sparks(pr.x, pr.y, 5, '#8affd8');
          world.sfx('hit');
        }
      }

      if (this.state === 'spin' && this.stateT >= 0.82) {
        this.state = 'recover';
        this.stateT = 0;
        this.spinCd = 1.35;
      }
    } else {
      // recover
      this.vx *= 0.84;
      this.frame = this.stateT < 0.14 ? 'shell1' : 'walk0';
      this.physics(level, dt);
      if (this.stateT >= 0.24) {
        this.state = 'follow';
        this.stateT = 0;
        if (this.spinCd <= 0) this.spinCd = 1.15;
      }
    }
  }

  draw(ctx, assets, camX, camY, time) {
    const sx = this.x - camX, sy = this.y - camY;
    if (sx < -60 || sx > 700) return;

    // Subtle emerald rune aura when spinning or freshly warped
    if (this.state === 'spin' || this.state === 'windup' || this.warpFlash > 0) {
      const glow = getGlowCanvas('emerald');
      if (glow) {
        const r = this.state === 'spin' ? 28 : 22;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = this.state === 'spin' ? 0.52 : 0.34;
        ctx.drawImage(glow, sx - r, sy - 13 - r, r * 2, r * 2);
        ctx.restore();
      }
    }

    const f = clipFrame(assets, this, 'turtle', this.frame);
    assets.draw(ctx, f.sheet, f.name, sx, sy, this.facing < 0);
  }
}
