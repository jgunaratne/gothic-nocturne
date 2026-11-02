// Enemies: skeleton warriors, rising zombies, swooping bats, medusa heads,
// plus the region spawners that feed zombies and heads.

import { TILE, SCORE } from '../engine/constants.js';
import { clipFrame } from './anim_clips.js';
import { Entity } from './entities.js';
import { Projectile } from './objects.js';

/** Plays an enemy foley cue only when the enemy is on or near the camera viewport. */
export function enemySfx(world, ent, name) {
  if (!world || !ent) return;
  const cam = world.camera;
  if (cam) {
    const cx = cam.rx != null ? cam.rx : cam.x;
    const cy = cam.ry != null ? cam.ry : cam.y;
    if (ent.x < cx - 140 || ent.x > cx + 780 || ent.y < cy - 140 || ent.y > cy + 520) return;
  }
  world.sfx(name);
}

export class Enemy extends Entity {
  constructor(x, y) {
    super(x, y);
    this.touchDamage = 2;
    this.score = 100;
    this.sheet = 'zombie';
    this.frame = 'walk0';
    this.deathT = -1;
    this.knock = 0;
    this.active = false;
    this.flies = false;
    this.tint = null;      // optional colour multiply (variants)
    this.scale = 1;        // sprite scale (bosses built from enemy sheets)
  }

  get alive() { return !this.dead && this.deathT < 0; }
  meleeBox() { return null; }

  /** Common hit handling: returns true when it died. */
  takeHit(dmg, fromX, world) {
    if (!this.alive) return false;
    this.hp -= dmg;
    this.flash = 0.12;
    world.sfx('hit');
    world.particles.sparks(this.x, this.y - this.h / 2, 6);
    if (this.hp <= 0) { this.kill(world); return true; }
    this.knock = fromX < this.x ? 1 : -1;
    return false;
  }

  kill(world) {
    this.deathT = 0;
    world.addScore(this.score);
    world.sfx('enemy_die');
    world.onEnemyKilled(this);
  }

  updateDeath(dt) {
    this.deathT += dt;
    if (this.deathT > 0.35) this.dead = true;
  }

  drawSprite(ctx, assets, camX, camY, flip, alpha = 1) {
    // Generated clip frames (walk cycles, wind-ups, ...) stand in for the legacy
    // frame when their sheet exists; the state machine above is untouched.
    const f = clipFrame(assets, this);
    assets.draw(ctx, f.sheet, f.name, this.x - camX, this.y - camY, flip, alpha, this.scale, this.tint);
    if (this.flash > 0 && Math.floor(this.flash * 40) % 2 === 0) {
      // Hit flash: additive re-draw brightens the sprite.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      assets.draw(ctx, f.sheet, f.name, this.x - camX, this.y - camY, flip, 0.8 * alpha, this.scale, this.tint);
      ctx.restore();
    }
  }

  draw(ctx, assets, camX, camY) {
    if (this.deathT >= 0) {
      const k = 1 - this.deathT / 0.35;
      this.drawSprite(ctx, assets, camX, camY, this.facing < 0, k);
      return;
    }
    this.drawSprite(ctx, assets, camX, camY, this.facing < 0);
  }
}

// --------------------------------------------------------------- skeleton

export class Skeleton extends Enemy {
  constructor(x, y, min, max, variant = 'normal') {
    super(x, y);
    this.w = 22; this.h = 56; this.hp = 5; this.score = SCORE.skeleton;
    this.sheet = 'skeleton'; this.minX = min; this.maxX = max;
    this.throwT = 1.2 + Math.random() * 0.8;
    this.state = 'walk'; this.stateT = 0; this.animT = 0;
    this.speed = 50; this.facing = -1;
    this.variant = variant;
    this.projectile = 'bone';
    if (variant === 'red') {
      // Red skeletons collapse into a bone pile and reassemble stronger.
      this.hp = 4; this.tint = 'rgba(225, 55, 55, 0.5)'; this.speed = 58; this.revives = true;
    } else if (variant === 'axe') {
      this.hp = 6; this.speed = 54; this.tint = 'rgba(90, 130, 230, 0.42)'; this.projectile = 'axe'; this.score = SCORE.skeleton + 100;
    } else if (variant === 'blood') {
      // Evolved Bloodbone Warrior: relentless stride, twin staggered bone volleys.
      this.hp = 8; this.speed = 66; this.touchDamage = 3;
      this.tint = 'rgba(210, 24, 52, 0.55)'; this.score = SCORE.skeleton + 180;
    } else if (variant === 'frost') {
      // Evolved Rimebone Archer: hurls twin spread ice shards.
      this.hp = 6; this.speed = 54; this.projectile = 'iceshard';
      this.tint = 'rgba(95, 210, 255, 0.46)'; this.score = SCORE.skeleton + 150;
    }
    this.pileT = 0;
  }

  get alive() { return !this.dead && this.deathT < 0 && this.pileT <= 0; }

  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); return; }
    this.flash = Math.max(0, this.flash - dt);
    if (this.pileT > 0) {
      // Bone pile: harmless until it reassembles.
      this.pileT -= dt;
      this.vx = 0;
      this.physics(level, dt);
      if (this.pileT <= 0) {
        this.hp = 4; this.flash = 0.3; this.state = 'walk'; this.stateT = 0;
        world.particles.dust(this.x, this.y, 6, '#c9c3b0');
        enemySfx(world, this, 'bone');
      }
      return;
    }
    const p = world.player;
    const dx = p.x - this.x;
    const near = Math.abs(dx) < 350 && p.alive;
    this.stateT += dt;
    this.throwT -= dt;
    if (this.knock) { this.vx = this.knock * 85; this.knock = 0; this.knockT = 0.13; }
    if (this.knockT > 0) { this.knockT -= dt; this.physics(level, dt); return; }

    if (this.state === 'walk') {
      if (near) this.facing = dx > 0 ? 1 : -1;
      // Keep a fighting distance: advance when far, back off when very close.
      let dir = this.facing;
      const backoffDist = this.variant === 'blood' ? 50 : 68;
      if (near && Math.abs(dx) < backoffDist) dir = -this.facing;
      // Patrol bounds + ledges/walls
      const nextX = this.x + dir * this.speed * dt;
      const atEdge = (dir > 0 && nextX > this.maxX) || (dir < 0 && nextX < this.minX);
      const saveFacing = this.facing; this.facing = dir;
      const blocked = this.blockedAhead(level);
      this.facing = saveFacing;
      if (atEdge || blocked) {
        if (!near) this.facing = -this.facing;
        this.vx = 0;
      } else this.vx = dir * this.speed;
      if (Math.abs(this.vx) > 1) { this.animT += dt * 6.8; } else this.animT = 0;
      const walkFrames = ['walk0', 'walk1', 'walk2', 'walk3'];
      this.frame = walkFrames[Math.floor(this.animT) % 4];
      if (near && this.throwT <= 0 && Math.abs(dx) > 64 && Math.abs(dx) < 325 && Math.abs(p.y - this.y) < 105) {
        this.state = 'throw'; this.stateT = 0; this.vx = 0;
      }
    } else if (this.state === 'throw') {
      this.vx = 0;
      if (this.stateT < 0.29) this.frame = 'throw0';
      else {
        this.frame = 'throw1';
        if (!this.thrown) {
          this.thrown = true;
          const isEasy = world.difficulty && world.difficulty.key === 'easy';
          if (this.variant === 'frost') {
            const count = isEasy ? 1 : 2;
            for (let i = 0; i < count; i++) {
              const s = new Projectile('iceshard', this.x + this.facing * 12, this.y - 44 - i * 8, this.facing, 'enemy');
              s.vx = this.facing * (275 + i * 50);
              s.vy = -45 - i * 65;
              world.spawnProjectile(s);
            }
            enemySfx(world, this, 'ice_shard');
          } else {
            const pr = new Projectile(this.projectile, this.x + this.facing * 10, this.y - 46, this.facing, 'enemy');
            if (this.projectile === 'axe') { pr.vx = this.facing * 185; pr.vy = -420; pr.damage = 4; }
            world.spawnProjectile(pr);
            if (this.variant === 'blood' && !isEasy) {
              const pr2 = new Projectile('bone', this.x + this.facing * 14, this.y - 38, this.facing, 'enemy');
              pr2.vx = this.facing * 275; pr2.vy = -250;
              world.spawnProjectile(pr2);
            }
            enemySfx(world, this, this.projectile === 'axe' ? 'throw' : 'bone');
          }
        }
        if (this.stateT > 0.62) {
          this.state = 'walk'; this.thrown = false;
          this.throwT = (1.65 + Math.random() * 0.9) * world.difficulty.throwCooldown;
        }
      }
    }
    this.physics(level, dt);
  }

  kill(world) {
    if (this.revives) {
      // Collapse instead of dying; score and EXP only the first time.
      if (!this.scored) {
        this.scored = true;
        world.addScore(this.score);
        if (world.awardEnemyExp) world.awardEnemyExp(this);
      }
      world.sfx('enemy_die');
      world.particles.shards(this.x, this.y, 10, '#e8b0a0', this.y);
      this.pileT = world.difficulty && world.difficulty.key === 'easy' ? 4.8 : 3.4;
      this.frame = 'walk0';
      return;
    }
    super.kill(world);
    world.particles.shards(this.x, this.y, 14, '#e8e2c8', this.y);
  }

  draw(ctx, assets, camX, camY) {
    if (this.pileT > 0) {
      // Flattened frame reads as a heap of bones; it twitches before rising.
      const k = this.pileT < 0.8 ? 0.25 + (0.8 - this.pileT) / 0.8 * 0.75 : 0.25;
      ctx.save();
      ctx.translate(Math.round(this.x - camX), Math.round(this.y - camY));
      ctx.scale(1, k);
      assets.draw(ctx, this.sheet, 'walk0', 0, 0, this.facing < 0, 1, 1, this.tint);
      ctx.restore();
      return;
    }
    super.draw(ctx, assets, camX, camY);
  }
}

// ----------------------------------------------------------------- zombie

export class Zombie extends Enemy {
  constructor(x, y, dir, variant = 'normal', standing = false) {
    super(x, y);
    this.w = 20; this.h = 54; this.hp = 2; this.score = SCORE.zombie;
    this.sheet = 'zombie'; this.facing = dir; this.speed = 38;
    this.rise = standing ? 0 : 0.6; // seconds left in the rising animation
    this.animT = Math.random() * 4;
    this.touchDamage = 2;
    this.variant = variant;
    if (variant === 'ghoul') {
      // Ghouls sprint toward the hunter and soak more hits.
      this.hp = 4; this.speed = 68; this.touchDamage = 3;
      this.tint = 'rgba(80, 200, 120, 0.42)'; this.score = SCORE.zombie + 60;
    } else if (variant === 'plague') {
      // Plague-bloated corpse that bursts a toxic spore cloud on death.
      this.hp = 5; this.speed = 52; this.touchDamage = 3;
      this.tint = 'rgba(145, 235, 85, 0.46)'; this.score = SCORE.zombie + 100;
    }
  }

  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); return; }
    this.flash = Math.max(0, this.flash - dt);
    if (this.rise > 0) {
      if (!this._groaned) {
        this._groaned = true;
        enemySfx(world, this, 'zombie_groan');
      }
      this.rise -= dt;
      if (Math.random() < 0.5) world.particles.dust(this.x, this.y, 1, '#4a3a4a');
      this.frame = 'walk0';
      return;
    }
    const p = world.player;
    if (p.alive && Math.abs(p.x - this.x) > 8) this.facing = p.x > this.x ? 1 : -1;
    this.vx = this.facing * this.speed;
    if (this.blockedAhead(level) && this.onGround) {
      // Zombies plod off ledges only when the player is below; otherwise turn.
      if (!(p.y > this.y + 20)) this.vx = 0;
    }
    this.animT += dt * 5.8;
    this.frame = ['walk0', 'walk1', 'walk2', 'walk3'][Math.floor(this.animT) % 4];
    this.physics(level, dt);
    if (this.y > level.height + 60) this.dead = true;
  }

  get alive() { return !this.dead && this.deathT < 0; }
  meleeBox() { return null; }

  draw(ctx, assets, camX, camY) {
    if (this.rise > 0) {
      // Rising from the grave: the sprite climbs up through the ground line.
      const k = 1 - this.rise / 0.6;
      ctx.save();
      ctx.beginPath();
      ctx.rect(this.x - camX - 40, this.y - camY - 64, 80, 64);
      ctx.clip();
      assets.draw(ctx, this.sheet, 'walk0', this.x - camX, this.y - camY + (1 - k) * this.h, this.facing < 0, 1, 1, this.tint);
      ctx.restore();
      return;
    }
    super.draw(ctx, assets, camX, camY);
  }

  kill(world) {
    super.kill(world);
    world.particles.shards(this.x, this.y, 8, '#7a8a9a', this.y);
    world.particles.smoke(this.x, this.y, 4);
    if (this.variant === 'plague') {
      const dir = world.player && world.player.x >= this.x ? 1 : -1;
      const sp = new Projectile('spore', this.x, this.y - 26, dir, 'enemy');
      world.spawnProjectile(sp);
      enemySfx(world, this, 'spore_puff');
    }
  }
}

// -------------------------------------------------------------------- bat

export class Bat extends Enemy {
  constructor(x, y, variant = 'normal') {
    super(x, y);
    this.w = 26; this.h = 18; this.hp = variant === 'fire' ? 2 : 1; this.score = SCORE.bat;
    this.sheet = 'bat'; this.frame = 'fly0'; this.flies = true; this.gravityScale = 0;
    this.state = 'sleep'; this.baseY = y; this.t = 0; this.homeX = x;
    this.wakeT = 0;
    this.touchDamage = variant === 'fire' ? 3 : 2;
    this.speed = 98;
    this.variant = variant;
    if (variant === 'fire') { this.speed = 128; this.tint = 'rgba(255, 110, 30, 0.5)'; this.score = SCORE.bat + 50; }
  }

  /** Starts the swoop immediately (used by spawners and bosses) or after a short wake flutter. */
  wake(dir, targetY, delay = 0) {
    this.state = 'swoop'; this.facing = dir; this.t = 0; this.targetY = targetY; this.wakeT = delay;
  }

  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); this.y += 120 * dt; return; }
    this.flash = Math.max(0, this.flash - dt);
    const p = world.player;
    this.t += dt;
    if (this.state === 'sleep') {
      this.frame = 'fly0';
      if (p.alive && Math.abs(p.x - this.x) < 235 && p.y > this.y - 16) {
        this.wake(p.x > this.x ? 1 : -1, p.y - 40, 0.16);
        enemySfx(world, this, 'bat_flutter');
      }
      return;
    }
    if (this.wakeT > 0) {
      this.wakeT -= dt;
      this.t = 0;
      this.frame = Math.floor(this.wakeT * 18) % 2 ? 'fly1' : 'fly0';
      return;
    }
    // Swoop: glide toward the player's whip height in a gentle sine, then keep crossing.
    this.vx = this.facing * this.speed;
    this.baseY += (this.targetY - this.baseY) * Math.min(1, dt * 1.65);
    this.y = this.baseY + Math.sin(this.t * 3.4) * 20;
    this.x += this.vx * dt;
    if (this.variant === 'fire' && Math.random() < 0.3) world.particles.embers(this.x, this.y - 6, 1);
    if (Math.abs(this.x - this.homeX) > 900 || this.x < -40 || this.x > level.width + 40) this.dead = true;
    this.frame = ['fly0', 'fly1', 'fly2', 'fly1'][Math.floor(this.t * 11) % 4];
  }

  kill(world) {
    super.kill(world);
    world.particles.smoke(this.x, this.y, 5, 'rgba(70,40,110,0.6)');
  }
}

// ---------------------------------------------------------------- medusa

export class MedusaHead extends Enemy {
  constructor(x, y, dir) {
    super(x, y);
    this.w = 22; this.h = 22; this.hp = 1; this.score = SCORE.medusa;
    this.sheet = 'medusa'; this.frame = 'a'; this.flies = true; this.gravityScale = 0;
    this.facing = dir; this.baseY = y; this.t = Math.random() * 6;
    this.touchDamage = 2;
  }
  update(dt, level) {
    if (this.deathT >= 0) { this.updateDeath(dt); return; }
    this.flash = Math.max(0, this.flash - dt);
    this.t += dt;
    this.x += this.facing * 84 * dt;
    this.y = this.baseY + Math.sin(this.t * 2.55) * 27;
    this.frame = Math.floor(this.t * 6) % 2 ? 'a' : 'b';
    if (this.x < -60 || this.x > level.width + 60) this.dead = true;
  }
  kill(world) {
    super.kill(world);
    world.particles.shards(this.x, this.y, 8, '#b7a9c9');
  }
}

// --------------------------------------------------------------- spawners

/** Ground-walking enemy with a patrol range and a ranged "breath/throw"
 *  state; shared by the catoblepas, the ice golem and the snowman. */
class Brute extends Enemy {
  constructor(x, y, min, max) {
    super(x, y);
    this.minX = min; this.maxX = max;
    this.state = 'walk'; this.stateT = 0; this.animT = 0; this.facing = -1;
    this.attackCd = 1.2 + Math.random() * 0.8;
    this.speed = 40; this.walkFrames = ['walk0', 'walk1']; this.attackFrame = 'attack';
    this.attackRange = [48, 260]; this.attackAt = 0.42; this.attackDur = 1.05; this.attackCooldown = 2.5;
    this.heavy = true;
  }

  takeHit(dmg, fromX, world) {
    const died = super.takeHit(dmg, fromX, world);
    if (this.heavy) this.knock = 0;        // too heavy to be knocked back
    return died;
  }

  fire() { /* override */ }

  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); return; }
    this.flash = Math.max(0, this.flash - dt);
    const p = world.player;
    const dx = p.x - this.x;
    const near = Math.abs(dx) < 360 && p.alive;
    this.stateT += dt; this.attackCd -= dt;
    if (this.knock) { this.vx = this.knock * 60; this.knock = 0; this.knockT = 0.12; }
    if (this.knockT > 0) { this.knockT -= dt; this.physics(level, dt); return; }
    if (this.state === 'walk') {
      if (near) this.facing = dx > 0 ? 1 : -1;
      const dir = this.facing;
      const nextX = this.x + dir * this.speed * dt;
      const atEdge = (dir > 0 && nextX > this.maxX) || (dir < 0 && nextX < this.minX);
      if (atEdge || this.blockedAhead(level)) { if (!near) this.facing = -this.facing; this.vx = 0; }
      else this.vx = dir * this.speed;
      this.animT += Math.abs(this.vx) > 1 ? dt * 4.6 : 0;
      this.frame = this.walkFrames[Math.floor(this.animT) % this.walkFrames.length];
      if (near && this.attackCd <= 0 && Math.abs(dx) > this.attackRange[0] && Math.abs(dx) < this.attackRange[1] && Math.abs(p.y - this.y) < 84) {
        this.state = 'attack'; this.stateT = 0; this.vx = 0; this.fired = false;
      }
    } else {
      this.vx = 0;
      this.frame = this.attackFrame;
      if (!this.fired && this.stateT >= this.attackAt) { this.fired = true; this.fire(world, p); }
      if (this.stateT > this.attackDur) { this.state = 'walk'; this.attackCd = this.attackCooldown * world.difficulty.throwCooldown; }
    }
    this.physics(level, dt);
  }
}

// ------------------------------------------------------------ catoblepas

export class Catoblepas extends Brute {
  constructor(x, y, min, max) {
    super(x, y, min, max);
    this.w = 70; this.h = 50; this.hp = 10; this.score = 500; this.touchDamage = 3;
    this.sheet = 'catoblepas'; this.walkFrames = ['walk0', 'walk1', 'walk2']; this.attackFrame = 'breath';
    this.attackRange = [40, 275]; this.attackCooldown = 2.4;
  }
  fire(world) {
    const g = new Projectile('gas', this.x + this.facing * 44, this.y - 20, this.facing, 'enemy');
    world.spawnProjectile(g);
    if (!world.difficulty || world.difficulty.key !== 'easy') {
      const g2 = new Projectile('gas', this.x + this.facing * 38, this.y - 34, this.facing, 'enemy');
      g2.vx *= 1.3; g2.vy = -12;
      world.spawnProjectile(g2);
    }
    enemySfx(world, this, 'petrify_gas');
  }
  kill(world) {
    super.kill(world);
    world.particles.shards(this.x, this.y, 16, '#5a4a4e', this.y);
    world.particles.dust(this.x, this.y, 10, '#6a6070');
    world.camera.shake(3, 0.25);
  }
}

// -------------------------------------------------------------- pumpkins

/** Jack-o'-lantern: a hopping pumpkin, or (variant 'lantern') a flaming
 *  floating head that weaves toward the hunter like a medusa head. */
export class Pumpkin extends Enemy {
  constructor(x, y, dir = -1, variant = 'hopper') {
    super(x, y);
    this.variant = variant; this.sheet = 'pumpkin'; this.facing = dir;
    this.score = 150; this.touchDamage = 2;
    if (this.variant === 'lantern') {
      this.w = 22; this.h = 22; this.hp = 2; this.flies = true; this.gravityScale = 0;
      this.baseY = y; this.t = Math.random() * 6; this.frame = 'flame0'; this.score = 200;
    } else {
      this.w = 24; this.h = 24; this.hp = 3; this.hopT = 0.32 + Math.random() * 0.4; this.frame = 'hop0';
    }
  }
  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); return; }
    this.flash = Math.max(0, this.flash - dt);
    const p = world.player;
    if (this.variant === 'lantern') {
      this.t += dt;
      this.x += this.facing * 84 * dt;
      this.baseY += ((p.y - 40) - this.baseY) * Math.min(1, dt * 0.45);
      this.y = this.baseY + Math.sin(this.t * 2.7) * 24;
      this.frame = Math.floor(this.t * 9) % 2 ? 'flame0' : 'flame1';
      if (Math.random() < 0.5) world.particles.embers(this.x - this.facing * 8, this.y - 10, 1);
      if (this.x < -60 || this.x > level.width + 60) this.dead = true;
      return;
    }
    if (this.knock) { this.vx = this.knock * 110; this.vy = -120; this.knock = 0; }
    if (this.onGround) {
      this.vx *= 0.6;
      this.hopT -= dt;
      this.frame = 'hop0';
      if (this.hopT <= 0 && p.alive) {
        this.facing = p.x > this.x ? 1 : -1;
        const far = Math.abs(p.x - this.x) > 140;
        this.vy = far ? -445 : -345; this.vx = this.facing * (far ? 168 : 124);
        this.onGround = false; this.hopT = 0.36 + Math.random() * 0.38;
        enemySfx(world, this, 'pumpkin_hop');
      }
    } else this.frame = 'hop1';
    this.physics(level, dt);
    if (this.y > level.height + 60) this.dead = true;
  }
  kill(world) {
    super.kill(world);
    world.particles.shards(this.x, this.y, 10, '#ff9a3c', this.y);
    world.particles.embers(this.x, this.y - 10, 8);
  }
}

// ----------------------------------------------------------------- dragon

export class Dragon extends Enemy {
  constructor(x, y, min, max, variant = 'normal') {
    super(x, y);
    this.w = 60; this.h = 36; this.hp = 9; this.score = 600; this.touchDamage = 3;
    this.sheet = 'dragon'; this.frame = 'fly0'; this.flies = true; this.gravityScale = 0;
    this.baseY = y; this.minX = min; this.maxX = max; this.facing = -1;
    this.variant = variant;
    if (variant === 'frost') {
      this.hp = 10; this.tint = 'rgba(110, 215, 255, 0.48)'; this.score = 720;
    } else if (variant === 'elder') {
      this.hp = 12; this.scale = 1.12; this.tint = 'rgba(255, 165, 45, 0.44)'; this.score = 840;
    }
    this.t = Math.random() * 5; this.fireCd = 1.6 + Math.random() * 0.8; this.state = 'fly'; this.stateT = 0;
  }
  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); this.y += 90 * dt; return; }
    this.flash = Math.max(0, this.flash - dt);
    const p = world.player;
    this.t += dt; this.stateT += dt; this.fireCd -= dt;
    const dx = p.x - this.x, near = p.alive && Math.abs(dx) < 360;
    if (this.state === 'fly') {
      if (near) {
        this.facing = dx > 0 ? 1 : -1;
        // Hold position within jumping whip range ahead of the hunter.
        const tx = p.x - this.facing * 86;
        this.x += Math.sign(tx - this.x) * Math.min(Math.abs(tx - this.x), 66 * dt);
        this.baseY += ((p.y - 70) - this.baseY) * Math.min(1, dt * 0.9);
      } else {
        this.x += this.facing * 52 * dt;
        if (this.x < this.minX || this.x > this.maxX) this.facing = -this.facing;
      }
      this.y = this.baseY + Math.sin(this.t * 2.4) * 10;
      this.frame = Math.floor(this.t * 6.5) % 2 ? 'fly0' : 'fly1';
      if (near && this.fireCd <= 0 && Math.abs(dx) < 305) { this.state = 'breath'; this.stateT = 0; this.shots = 0; }
    } else {
      this.frame = 'breath';
      this.y = this.baseY + Math.sin(this.t * 2.2) * 5;
      const totalShots = this.variant === 'elder' ? 3 : 2;
      const due = 0.36 + this.shots * 0.22;
      if (this.shots < totalShots && this.stateT >= due) {
        this.shots++;
        const sx = this.x + this.facing * 34, sy = this.y - 14;
        const baseAng = Math.atan2((p.y - 30) - sy, p.x - sx);
        if (this.variant === 'frost') {
          for (const off of [-0.14, 0.14]) {
            const sh = new Projectile('iceshard', sx, sy, this.facing, 'enemy');
            const ang = baseAng + off;
            sh.vx = Math.cos(ang) * 235; sh.vy = Math.sin(ang) * 235; sh.gravity = 0.08;
            sh.dir = sh.vx >= 0 ? 1 : -1;
            world.spawnProjectile(sh);
          }
          enemySfx(world, this, 'ice_shard');
        } else {
          const ang = baseAng + (this.variant === 'elder' ? (this.shots - 2) * 0.16 : 0);
          const fb = new Projectile('fireball', sx, sy, this.facing, 'enemy');
          fb.vx = Math.cos(ang) * 215; fb.vy = Math.sin(ang) * 215; fb.damage = 3; fb.gravity = 0;
          fb.dir = fb.vx >= 0 ? 1 : -1;
          world.spawnProjectile(fb);
          enemySfx(world, this, 'fire');
        }
      }
      if (this.stateT > 1.05) { this.state = 'fly'; this.fireCd = 2.65 * world.difficulty.throwCooldown; }
    }
  }
  kill(world) {
    super.kill(world);
    world.particles.smoke(this.x, this.y, 8, 'rgba(120,30,30,0.5)');
    world.particles.embers(this.x, this.y - 10, 14);
    world.particles.shards(this.x, this.y, 8, '#7a1e2a');
  }
}

// ------------------------------------------------------------ ice creatures

export class IceGolem extends Brute {
  constructor(x, y, min, max) {
    super(x, y, min, max);
    this.w = 40; this.h = 62; this.hp = 10; this.score = 450; this.touchDamage = 3;
    this.sheet = 'ice'; this.frame = 'golem0'; this.walkFrames = ['golem0', 'golem1']; this.attackFrame = 'golem1';
    this.speed = 36; this.attackRange = [36, 255]; this.attackAt = 0.34; this.attackDur = 0.9; this.attackCooldown = 2.1;
  }
  fire(world) {
    for (let i = 0; i < 3; i++) {
      const s = new Projectile('iceshard', this.x + this.facing * 20, this.y - 36 - i * 10, this.facing, 'enemy');
      s.vx = this.facing * (245 + i * 52); s.vy = -30 - i * 58;
      world.spawnProjectile(s);
    }
    enemySfx(world, this, 'ice_shard');
  }
  kill(world) {
    super.kill(world);
    world.particles.shards(this.x, this.y, 16, '#cfeaff', this.y);
    world.particles.dust(this.x, this.y, 8, '#e8f4ff');
  }
}

export class Snowman extends Brute {
  constructor(x, y, min, max) {
    super(x, y, min, max);
    this.w = 26; this.h = 50; this.hp = 4; this.score = 250; this.touchDamage = 2;
    this.sheet = 'ice'; this.frame = 'snowman0'; this.walkFrames = ['snowman0']; this.attackFrame = 'snowman1';
    this.speed = 30; this.heavy = false; this.attackRange = [60, 315]; this.attackAt = 0.34; this.attackDur = 0.82; this.attackCooldown = 1.85;
  }
  fire(world) {
    for (let i = 0; i < 2; i++) {
      const sb = new Projectile('snowball', this.x + this.facing * 14, this.y - 44, this.facing, 'enemy');
      sb.vx = this.facing * (195 + i * 65);
      sb.vy = -310 - i * 45;
      world.spawnProjectile(sb);
    }
    enemySfx(world, this, 'ice_shard');
  }
  kill(world) {
    super.kill(world);
    world.particles.shards(this.x, this.y, 12, '#f4f8ff', this.y);
  }
}

/** Frost wisp: a weaving spirit like a medusa head, leaving a chilling trail. */
export class FrostWisp extends Enemy {
  constructor(x, y, dir) {
    super(x, y);
    this.w = 22; this.h = 22; this.hp = 2; this.score = 300; this.touchDamage = 2;
    this.sheet = 'wisp'; this.frame = 'wisp0'; this.flies = true; this.gravityScale = 0;
    this.facing = dir; this.baseY = y; this.t = Math.random() * 6;
  }
  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); return; }
    this.flash = Math.max(0, this.flash - dt);
    this.t += dt;
    this.x += this.facing * 78 * dt;
    this.y = this.baseY + Math.sin(this.t * 2.2) * 28;
    this.frame = 'wisp' + (Math.floor(this.t * 8) % 4);
    if (Math.random() < 0.35) world.particles.emit({ x: this.x - this.facing * 8, y: this.y - 8, vx: 0, vy: 10, life: 0.5, color: '#cfeaff', size: 2, gravity: 0, glow: true });
    if (this.x < -60 || this.x > level.width + 60) this.dead = true;
  }
  kill(world) {
    super.kill(world);
    world.particles.sparks(this.x, this.y - 8, 10, '#cfeaff');
  }
}

// ------------------------------------------------------ darkwood creatures

/** Briar wolf: stalks mossy forest clearings and lunges in a low pounce when
 *  the hunter comes within range. */
export class BriarWolf extends Enemy {
  constructor(x, y, min, max, variant = 'normal') {
    super(x, y);
    this.w = 34; this.h = 26; this.hp = 4; this.score = SCORE.wolf || 250; this.touchDamage = 2;
    this.sheet = 'wolf'; this.frame = 'walk0';
    this.minX = min; this.maxX = max; this.facing = -1;
    this.variant = variant;
    if (variant === 'alpha') {
      this.hp = 7; this.scale = 1.16; this.touchDamage = 3;
      this.tint = 'rgba(215, 55, 95, 0.42)'; this.score = (SCORE.wolf || 250) + 170;
    }
    this.state = 'prowl'; this.stateT = 0; this.animT = Math.random() * 4;
    this.lungeCd = 0.8 + Math.random() * 0.5;
  }
  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); return; }
    this.flash = Math.max(0, this.flash - dt);
    const p = world.player;
    const dx = p.x - this.x;
    const near = p.alive && Math.abs(dx) < 310 && Math.abs(p.y - this.y) < 104;
    this.stateT += dt;
    this.lungeCd = Math.max(0, this.lungeCd - dt);
    if (this.knock) { this.vx = this.knock * 95; this.vy = -100; this.knock = 0; }

    if (this.state === 'prowl') {
      if (near) this.facing = dx >= 0 ? 1 : -1;
      const speed = near ? (this.variant === 'alpha' ? 112 : 94) : 58;
      const nextX = this.x + this.facing * speed * dt;
      const atEdge = (this.facing > 0 && nextX > this.maxX) || (this.facing < 0 && nextX < this.minX);
      if (atEdge || this.blockedAhead(level)) {
        if (!near) this.facing = -this.facing;
        this.vx = 0;
      } else {
        this.vx = this.facing * speed;
      }
      this.animT += Math.abs(this.vx) > 2 ? dt * (near ? 10 : 6.5) : dt * 2;
      this.frame = 'walk' + (Math.floor(this.animT) % 3);
      if (near && this.onGround && this.lungeCd <= 0 && Math.abs(dx) > 42 && Math.abs(dx) < 195) {
        this.state = 'crouch';
        this.stateT = 0;
        this.vx = 0;
      }
    } else if (this.state === 'crouch') {
      this.vx = 0;
      this.frame = 'walk1';
      if (this.stateT >= 0.19) {
        this.state = 'lunge';
        this.stateT = 0;
        this.facing = dx >= 0 ? 1 : -1;
        this.vx = this.facing * (this.variant === 'alpha' ? 290 : 258);
        this.vy = -265;
        this.onGround = false;
        enemySfx(world, this, 'wolf_snarl');
      }
    } else {
      // lunge
      this.frame = 'lunge';
      if (this.onGround && this.stateT > 0.12) {
        this.vx *= 0.5;
        this.state = 'prowl';
        this.stateT = 0;
        this.lungeCd = (this.variant === 'alpha' ? 0.85 : 1.15) * world.difficulty.throwCooldown;
      }
    }
    this.physics(level, dt);
    if (this.y > level.height + 60) this.dead = true;
  }
  kill(world) {
    super.kill(world);
    world.particles.shards(this.x, this.y, 10, '#3a5e52', this.y);
    world.particles.sparks(this.x, this.y - 12, 6, '#62f2c2');
  }
}

/** Bioluminescent Sporecap myconid: patrols mossy logs and puffs drifting
 *  glowing spores toward the hunter. */
export class Sporecap extends Brute {
  constructor(x, y, min, max) {
    super(x, y, min, max);
    this.w = 24; this.h = 34; this.hp = 4; this.score = SCORE.mushroom || 250; this.touchDamage = 2;
    this.sheet = 'sporecap';
    this.walkFrames = ['walk0', 'walk1'];
    this.attackFrame = 'puff';
    this.speed = 38; this.heavy = false;
    this.attackRange = [42, 270]; this.attackAt = 0.30; this.attackDur = 0.78; this.attackCooldown = 1.9;
  }
  fire(world) {
    for (let i = 0; i < 2; i++) {
      const sp = new Projectile('spore', this.x + this.facing * 14, this.y - 20 - i * 12, this.facing, 'enemy');
      sp.vx *= (1 + i * 0.22);
      sp.time = i * 0.9;
      world.spawnProjectile(sp);
    }
    world.particles.sparks(this.x + this.facing * 10, this.y - 24, 6, '#62f2c2');
    enemySfx(world, this, 'spore_puff');
  }
  kill(world) {
    super.kill(world);
    world.particles.sparks(this.x, this.y - 16, 12, '#62f2c2');
    world.particles.dust(this.x, this.y, 8, '#4ac8a8');
  }
}

/** Swooping Darkwood Night-Owl: perches high under elder boughs until the
 *  hunter approaches, then glides down in a woodland arc. */
export class NightOwl extends Enemy {
  constructor(x, y) {
    super(x, y);
    this.w = 28; this.h = 20; this.hp = 2; this.score = SCORE.owl || 200; this.touchDamage = 2;
    this.sheet = 'owl'; this.frame = 'fly1';
    this.flies = true; this.gravityScale = 0;
    this.homeY = y; this.state = 'perch'; this.t = Math.random() * 5;
    this.wakeT = 0;
  }
  wake(dir, targetY, delay = 0) {
    this.state = 'swoop';
    this.facing = dir;
    this.targetY = targetY;
    this.t = 0;
    this.wakeT = delay;
  }
  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); return; }
    this.flash = Math.max(0, this.flash - dt);
    const p = world.player;
    this.t += dt;
    if (this.state === 'perch') {
      this.frame = 'fly1';
      this.y = this.homeY + Math.sin(this.t * 3) * 2;
      if (p.alive && Math.abs(p.x - this.x) < 240) {
        this.wake(p.x < this.x ? -1 : 1, p.y - 40, 0.16);
        enemySfx(world, this, 'owl_screech');
      }
      return;
    }
    if (this.wakeT > 0) {
      this.wakeT -= dt;
      this.t = 0;
      this.frame = Math.floor(this.wakeT * 16) % 2 ? 'fly2' : 'fly0';
      return;
    }
    this.x += this.facing * 122 * dt;
    const dive = Math.sin(Math.min(Math.PI, this.t * 1.85));
    this.y = this.homeY + (this.targetY - this.homeY) * dive;
    this.frame = 'fly' + (Math.floor(this.t * 9) % 3);
    if (this.x < world.camera.x - 90 || this.x > world.camera.x + 730) this.dead = true;
  }
  kill(world) {
    super.kill(world);
    world.particles.shards(this.x, this.y, 7, '#6c6286');
    world.particles.sparks(this.x, this.y - 6, 5, '#ffd27a');
  }
}


// ------------------------------------------------------------ library haunts

/** Phantom: a hooded library ghost that drifts toward the hunter, phases in
 *  and out (untouchable while faded), then telegraphs and lunges. */
export class Phantom extends Enemy {
  constructor(x, y, dir = -1) {
    super(x, y);
    this.w = 24; this.h = 40; this.hp = 3; this.score = SCORE.ghost || 300; this.touchDamage = 2;
    this.sheet = 'ghost'; this.frame = 'float0';
    this.flies = true; this.gravityScale = 0;
    this.facing = dir; this.baseY = y; this.t = Math.random() * 6;
    this.state = 'drift'; this.stateT = 0; this.fade = 1; this.lungeCd = 1.4 + Math.random() * 0.8;
  }
  takeHit(dmg, fromX, world) {
    if (this.fade < 0.45) return false;          // phased out: the whip passes through
    return super.takeHit(dmg, fromX, world);
  }
  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); return; }
    this.flash = Math.max(0, this.flash - dt);
    const p = world.player;
    this.t += dt; this.stateT += dt; this.lungeCd -= dt;
    const dx = p.x - this.x, dy = (p.y - 36) - this.y;
    if (this.state === 'drift') {
      // Phase in/out on a slow cycle; home in briskly when near the hunter
      this.fade = 0.65 + 0.35 * Math.sin(this.t * 1.65);
      if (p.alive && Math.abs(dx) < 360) {
        this.facing = dx >= 0 ? 1 : -1;
        this.x += Math.sign(dx) * Math.min(Math.abs(dx), 48 * dt);
        this.baseY += Math.sign(dy) * Math.min(Math.abs(dy), 34 * dt);
      } else {
        this.x += this.facing * 36 * dt;
      }
      this.y = this.baseY + Math.sin(this.t * 2.3) * 8;
      this.frame = Math.floor(this.t * 3.5) % 2 ? 'float1' : 'float0';
      if (Math.random() < 0.3) world.particles.emit({ x: this.x - this.facing * 10, y: this.y - 6 + Math.random() * 10, vx: -this.facing * 12, vy: -8, life: 0.6, color: 'rgba(170, 220, 255, 0.5)', size: 2, gravity: 0, glow: true });
      if (p.alive && this.lungeCd <= 0 && this.fade > 0.78 && Math.abs(dx) < 195 && Math.abs(dy) < 92) {
        this.state = 'windup'; this.stateT = 0; this.fade = 1;
        this.facing = dx >= 0 ? 1 : -1;
        enemySfx(world, this, 'ghost_moan');
      }
    } else if (this.state === 'windup') {
      this.frame = 'lunge'; this.fade = 1;
      this.y = this.baseY + Math.sin(this.stateT * 28) * 2;
      if (this.stateT >= 0.30) {
        this.state = 'lunge'; this.stateT = 0;
        const d = Math.hypot(dx, dy) || 1;
        this.vx = (dx / d) * 208; this.vy = (dy / d) * 208;
      }
    } else {
      this.frame = 'lunge'; this.fade = 1;
      this.x += this.vx * dt; this.baseY += this.vy * dt; this.y = this.baseY;
      if (this.stateT > 0.52) { this.state = 'drift'; this.stateT = 0; this.lungeCd = 2.0 * world.difficulty.throwCooldown; }
    }
    if (this.x < -80 || this.x > level.width + 80) this.dead = true;
  }
  draw(ctx, assets, camX, camY) {
    const a = this.deathT >= 0 ? 1 - this.deathT / 0.35 : Math.max(0.25, this.fade);
    this.drawSprite(ctx, assets, camX, camY, this.facing < 0, a);
  }
  kill(world) {
    super.kill(world);
    world.particles.sparks(this.x, this.y - 10, 12, '#bfe6ff');
    world.particles.smoke(this.x, this.y - 10, 4, 'rgba(170, 200, 255, 0.4)');
  }
}

/** Cursed tome: rests on a shelf until the hunter nears, then bursts out
 *  flapping its covers and snaps at the hunter in short chomping dives. */
export class CursedTome extends Enemy {
  constructor(x, y) {
    super(x, y);
    this.w = 22; this.h = 16; this.hp = 2; this.score = SCORE.tome || 150; this.touchDamage = 2;
    this.sheet = 'tome'; this.frame = 'shut';
    this.flies = true; this.gravityScale = 0;
    this.state = 'shelf'; this.t = Math.random() * 4; this.homeX = x; this.homeY = y;
    this.chompT = 1.3 + Math.random() * 0.7;
  }
  wake(dir) { this.state = 'fly'; this.facing = dir; this.vx = dir * 58; this.vy = -75; this.t = 0; }
  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); this.y += 60 * dt; return; }
    this.flash = Math.max(0, this.flash - dt);
    const p = world.player;
    this.t += dt;
    const dx = p.x - this.x, dy = (p.y - 36) - this.y;
    if (this.state === 'shelf') {
      this.frame = 'shut';
      if (p.alive && Math.abs(dx) < 185 && Math.abs(dy) < 125) {
        this.wake(dx >= 0 ? 1 : -1);
        world.particles.dust(this.x, this.y, 6, '#c9b58a');
        enemySfx(world, this, 'tome_flap');
      }
      return;
    }
    if (this.state === 'fly') {
      // Flap toward the hunter with a bobbing path
      this.facing = dx >= 0 ? 1 : -1;
      this.vx += Math.sign(dx) * 145 * dt; this.vy += Math.sign(dy) * 120 * dt;
      const sp = Math.hypot(this.vx, this.vy), max = 88;
      if (sp > max) { this.vx *= max / sp; this.vy *= max / sp; }
      this.x += this.vx * dt; this.y += this.vy * dt + Math.sin(this.t * 7) * 0.45;
      this.frame = Math.floor(this.t * 9) % 2 ? 'flap1' : 'flap0';
      this.chompT -= dt;
      if (this.chompT <= 0 && Math.abs(dx) < 92 && Math.abs(dy) < 56) {
        // Telegraph: snap shut and hang in mid-air for a beat before the bite
        this.state = 'windup'; this.t = 0;
        this.vx = 0; this.vy = 0;
        this.frame = 'shut';
        enemySfx(world, this, 'tome_chomp');
      }
    } else if (this.state === 'windup') {
      this.frame = 'shut';
      if (this.t >= 0.25) {
        this.state = 'chomp'; this.t = 0;
        const d = Math.hypot(dx, dy) || 1;
        this.vx = (dx / d) * 190; this.vy = (dy / d) * 190;
      }
    } else {
      this.frame = this.t < 0.20 ? 'chomp' : 'shut';
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.vx *= 0.93; this.vy *= 0.93;
      if (this.t > 0.42) { this.state = 'fly'; this.chompT = 1.65 + Math.random() * 0.65; }
    }
    if (this.x < -60 || this.x > level.width + 60 || this.y > level.height + 40) this.dead = true;
  }
  kill(world) {
    super.kill(world);
    world.particles.shards(this.x, this.y, 10, '#e8e2c8', this.y + 40);
    world.particles.shards(this.x, this.y, 5, '#8a2a30', this.y + 40);
  }
}


// --------------------------------------------------------------- gargoyle

/** Stone gargoyle: a statue perched on a ledge or cornice. Whips ring off it
 *  harmlessly until the hunter comes close; then its eyes light, it unfurls
 *  and swoops in long arcs, returning to hover and dive again. */
export class Gargoyle extends Enemy {
  constructor(x, y, variant = 'normal') {
    super(x, y);
    this.w = 28; this.h = 26; this.hp = 4; this.score = SCORE.gargoyle || 350; this.touchDamage = 3;
    this.sheet = 'gargoyle'; this.frame = 'perch';
    this.flies = true; this.gravityScale = 0;
    this.variant = variant;
    if (variant === 'obsidian') {
      // Evolved Obsidian Gargoyle: harder stone hide + sheds razor masonry mid-swoop!
      this.hp = 6; this.tint = 'rgba(155, 70, 225, 0.42)';
      this.score = (SCORE.gargoyle || 350) + 150;
    }
    this.state = 'perch'; this.t = 0; this.homeX = x; this.homeY = y; this.facing = -1;
    this.droppedShard = false;
  }
  takeHit(dmg, fromX, world) {
    if (this.state === 'perch') { world.sfx('block'); world.particles.sparks(this.x, this.y - 12, 4, '#cfd8e8'); return false; }
    return super.takeHit(dmg, fromX, world);
  }
  wake(dir, targetY) { this.state = 'wake'; this.facing = dir; this.t = 0; this.targetY = targetY; this.droppedShard = false; this._wokeSfx = false; }
  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); this.y += 80 * dt; return; }
    this.flash = Math.max(0, this.flash - dt);
    const p = world.player;
    this.t += dt;
    const dx = p.x - this.x, dy = (p.y - 38) - this.y;
    if (this.state === 'perch') {
      this.frame = 'perch';
      if (p.alive && Math.abs(dx) < 225 && dy > -75) this.wake(dx >= 0 ? 1 : -1, p.y - 38);
      return;
    }
    if (this.state === 'wake') {
      this.frame = 'wake';
      if (!this._wokeSfx) { this._wokeSfx = true; enemySfx(world, this, 'gargoyle_wake'); }
      if (this.t > 0.48) { this.state = 'swoop'; this.t = 0; this.fromY = this.y; this.droppedShard = false; world.particles.dust(this.x, this.y, 6, '#9a9aa8'); }
      return;
    }
    if (this.state === 'swoop') {
      const swoopSpeed = this.variant === 'obsidian' ? 148 : 134;
      const swoopDur = this.variant === 'obsidian' ? 1.15 : 1.28;
      this.x += this.facing * swoopSpeed * dt;
      const k = Math.min(1, this.t / swoopDur);
      this.y = this.fromY + (this.targetY - this.fromY) * Math.sin(k * Math.PI);
      this.frame = Math.floor(this.t * 9) % 2 ? 'fly1' : 'fly0';
      if (this.variant === 'obsidian' && !this.droppedShard && k >= 0.48) {
        this.droppedShard = true;
        const sh = new Projectile('shard', this.x, this.y, this.facing, 'enemy');
        sh.vx = this.facing * 55; sh.vy = 215;
        world.spawnProjectile(sh);
      }
      if (k >= 1) { this.state = 'hover'; this.t = 0; this.hoverY = Math.max(this.y, p.y - 68); }
    } else {
      // Hover within reach, turn to face the hunter, then dive again
      this.frame = Math.floor(this.t * 6.5) % 2 ? 'fly1' : 'fly0';
      this.y = this.hoverY + Math.sin(this.t * 3.8) * 5;
      this.x += Math.sign(dx) * 32 * dt;
      if (this.t > 1.02) { this.facing = dx >= 0 ? 1 : -1; this.state = 'swoop'; this.t = 0; this.fromY = this.y; this.targetY = p.y - 38; this.droppedShard = false; }
    }
    if (this.x < -80 || this.x > level.width + 80) this.dead = true;
  }
  kill(world) {
    super.kill(world);
    world.particles.shards(this.x, this.y, 14, '#9a9aa8', this.y + 60);
    world.particles.dust(this.x, this.y, 8, '#b8b8c4');
    world.camera.shake(2, 0.15);
  }
}

// ---------------------------------------------------- volcanic & castle foes

/** Magma Slime: molten volcanic crawler (`magmaslime`). Creeps across basalt
 *  or lava, leaps in an arcing magma pounce, and splashes an enemy floor flame
 *  when it slams back down. Completely immune to lava! */
export class MagmaSlime extends Enemy {
  constructor(x, y, min, max) {
    super(x, y);
    this.w = 28; this.h = 24; this.hp = 5;
    this.score = SCORE.magmaslime || 300;
    this.touchDamage = 3;
    this.sheet = 'magmaslime'; this.frame = 'crawl0';
    this.minX = min; this.maxX = max; this.facing = -1;
    this.lavaImmune = true;
    this.state = 'crawl'; this.stateT = 0; this.animT = Math.random() * 4;
    this.leapCd = 0.9 + Math.random() * 0.7;
  }

  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); return; }
    this.flash = Math.max(0, this.flash - dt);
    const p = world.player;
    const dx = p.x - this.x;
    const near = p.alive && Math.abs(dx) < 310 && Math.abs(p.y - this.y) < 128;
    this.stateT += dt;
    this.leapCd = Math.max(0, this.leapCd - dt);
    if (this.knock) { this.vx = this.knock * 80; this.vy = -95; this.knock = 0; }

    if (this.state === 'crawl') {
      if (near) this.facing = dx >= 0 ? 1 : -1;
      const speed = near ? 58 : 38;
      const nextX = this.x + this.facing * speed * dt;
      const atEdge = (this.facing > 0 && nextX > this.maxX) || (this.facing < 0 && nextX < this.minX);
      if (atEdge || this.blockedAhead(level)) {
        if (!near) this.facing = -this.facing;
        this.vx = 0;
      } else {
        this.vx = this.facing * speed;
      }
      this.animT += dt * 6;
      this.frame = Math.floor(this.animT) % 2 ? 'crawl1' : 'crawl0';
      if (Math.random() < 0.28) world.particles.embers(this.x + (Math.random() - 0.5) * 18, this.y - 8, 1);
      if (near && this.onGround && this.leapCd <= 0 && Math.abs(dx) > 32 && Math.abs(dx) < 225) {
        this.state = 'leap';
        this.stateT = 0;
        this.facing = dx >= 0 ? 1 : -1;
        this.vx = this.facing * 175;
        this.vy = -425;
        this.onGround = false;
        enemySfx(world, this, 'magma_slime');
        world.particles.embers(this.x, this.y - 10, 6);
      }
    } else if (this.state === 'leap') {
      this.frame = 'leap';
      if (Math.random() < 0.55) world.particles.embers(this.x, this.y - 12, 1);
      if (this.onGround && this.stateT > 0.12) {
        this.state = 'land';
        this.stateT = 0;
        this.vx = 0;
        world.spawnFire(this.x, this.y, 'enemy');
        enemySfx(world, this, 'magma_slime');
        world.particles.embers(this.x, this.y - 6, 8);
      }
    } else {
      this.vx = 0;
      this.frame = 'land';
      if (this.stateT > 0.30) {
        this.state = 'crawl';
        this.stateT = 0;
        this.leapCd = (1.2 + Math.random() * 0.5) * world.difficulty.throwCooldown;
      }
    }
    this.physics(level, dt);
    if (this.y > level.height + 60) this.dead = true;
  }

  kill(world) {
    super.kill(world);
    world.particles.embers(this.x, this.y - 12, 14);
    world.particles.shards(this.x, this.y, 10, '#3a1a16', this.y);
  }
}

/** Lava Golem: towering obsidian-and-magma colossus (`lavagolem`). Heavy,
 *  unflinching brute that hurls explosive `'magmaball'` boulders across the cavern. */
export class LavaGolem extends Brute {
  constructor(x, y, min, max) {
    super(x, y, min, max);
    this.w = 36; this.h = 68; this.hp = 12;
    this.score = SCORE.lavagolem || 550;
    this.touchDamage = 4;
    this.lavaImmune = true;
    this.sheet = 'lavagolem';
    this.walkFrames = ['walk0', 'walk1', 'walk2', 'walk1'];
    this.attackFrame = 'hurl';
    this.speed = 36;
    this.attackRange = [55, 310];
    this.attackAt = 0.38;
    this.attackDur = 0.96;
    this.attackCooldown = 2.15;
  }

  fire(world, p) {
    const mb = new Projectile('magmaball', this.x + this.facing * 20, this.y - 68, this.facing, 'enemy');
    const dist = Math.min(295, Math.max(80, Math.abs(p.x - this.x)));
    mb.vx = this.facing * (135 + dist * 0.44);
    mb.vy = -385 - dist * 0.22;
    world.spawnProjectile(mb);
    const fb = new Projectile('fireball', this.x + this.facing * 22, this.y - 54, this.facing, 'enemy');
    fb.vx = this.facing * 245; fb.vy = -35; fb.gravity = 0.08;
    world.spawnProjectile(fb);
    world.particles.embers(this.x + this.facing * 20, this.y - 68, 8);
    enemySfx(world, this, 'lava_hurl');
  }

  kill(world) {
    super.kill(world);
    world.particles.embers(this.x, this.y - 30, 18);
    world.particles.shards(this.x, this.y, 16, '#2d1818', this.y);
    world.camera.shake(3.5, 0.25);
  }
}

/** Cinder Imp: agile winged volcanic fiend (`cinderimp`) that darts above lava
 *  pools and spits aimed fireballs at the hunter. */
export class CinderImp extends Enemy {
  constructor(x, y, dir = -1) {
    super(x, y);
    this.w = 24; this.h = 30; this.hp = 2;
    this.score = SCORE.cinderimp || 300;
    this.touchDamage = 2;
    this.sheet = 'cinderimp'; this.frame = 'fly0';
    this.flies = true; this.gravityScale = 0; this.lavaImmune = true;
    this.facing = dir; this.baseY = y; this.t = Math.random() * 6;
    this.state = 'hover'; this.stateT = 0; this.spitCd = 1.3 + Math.random() * 0.7;
  }

  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); this.y += 95 * dt; return; }
    this.flash = Math.max(0, this.flash - dt);
    const p = world.player;
    this.t += dt; this.stateT += dt; this.spitCd -= dt;
    const dx = p.x - this.x;
    const near = p.alive && Math.abs(dx) < 340;
    if (Math.random() < 0.3) world.particles.embers(this.x, this.y - 10, 1);

    if (this.state === 'hover') {
      if (near) {
        this.facing = dx >= 0 ? 1 : -1;
        const wantX = p.x - this.facing * 82;
        this.x += Math.sign(wantX - this.x) * Math.min(Math.abs(wantX - this.x), 76 * dt);
        const wantY = p.y - 54;
        this.baseY += Math.sign(wantY - this.baseY) * Math.min(Math.abs(wantY - this.baseY), 54 * dt);
      } else {
        this.x += this.facing * 54 * dt;
      }
      this.y = this.baseY + Math.sin(this.t * 3.8) * 9;
      this.frame = Math.floor(this.t * 8.5) % 2 ? 'fly1' : 'fly0';
      if (near && this.spitCd <= 0 && Math.abs(dx) < 285) {
        this.state = 'spit'; this.stateT = 0; this.fired = false;
      }
    } else {
      this.frame = 'spit';
      this.y = this.baseY + Math.sin(this.t * 3.5) * 4;
      if (!this.fired && this.stateT >= 0.36) {
        this.fired = true;
        this.facing = dx >= 0 ? 1 : -1;
        const sx = this.x + this.facing * 16, sy = this.y - 14;
        const baseAng = Math.atan2((p.y - 28) - sy, p.x - sx);
        const offsets = world.difficulty && world.difficulty.key === 'easy' ? [0] : [-0.08, 0.08];
        for (const off of offsets) {
          const fb = new Projectile('fireball', sx, sy, this.facing, 'enemy');
          const ang = baseAng + off;
          fb.vx = Math.cos(ang) * 210; fb.vy = Math.sin(ang) * 210; fb.damage = 3;
          fb.gravity = 0; fb.dir = fb.vx >= 0 ? 1 : -1;
          world.spawnProjectile(fb);
        }
        enemySfx(world, this, 'fire');
      }
      if (this.stateT > 0.78) {
        this.state = 'hover';
        this.spitCd = (2.25 + Math.random() * 0.65) * world.difficulty.throwCooldown;
      }
    }
    if (this.x < -80 || this.x > level.width + 80) this.dead = true;
  }

  kill(world) {
    super.kill(world);
    world.particles.embers(this.x, this.y - 12, 12);
    world.particles.smoke(this.x, this.y - 10, 5, 'rgba(130, 35, 25, 0.55)');
  }
}

/** Plate Knight (`armor`): haunted suit of gothic plate armor wielding a heavy
 *  halberd & shield. Deflects frontal blows briefly while raising its shield
 *  (`guard`), then surges forward in a sweeping halberd cleave (`slash`). */
export class PlateKnight extends Enemy {
  constructor(x, y, min, max, variant = 'normal') {
    super(x, y);
    this.w = 28; this.h = 64; this.hp = 10;
    this.score = SCORE.armor || 450;
    this.touchDamage = 3;
    this.sheet = 'armor'; this.frame = 'walk0';
    this.minX = min; this.maxX = max; this.facing = -1;
    this.heavy = true;
    this.variant = variant;
    if (variant === 'crimson') {
      // Evolved Royal Crimson Guard: heavier plate + fires a crimson shockwave on slash!
      this.hp = 14; this.touchDamage = 4;
      this.tint = 'rgba(230, 50, 75, 0.44)';
      this.score = (SCORE.armor || 450) + 200;
    }
    this.state = 'march'; this.stateT = 0; this.animT = 0;
    this.slashCd = 1.0 + Math.random() * 0.7;
  }

  takeHit(dmg, fromX, world, opts = null) {
    // Shield guard halves frontal damage with a metallic clang — unless pierced by Brawlers!
    const frontal = (fromX - this.x) * this.facing > 0;
    const piercing = !!(opts && opts.armorPiercing) || !!(world && world._hitArmorPiercing);
    if (this.state === 'guard' && frontal) {
      if (piercing) {
        world.particles.sparks(this.x + this.facing * 14, this.y - 40, 8, '#62f2c2');
      } else {
        dmg = Math.max(1, Math.floor(dmg * 0.45));
        world.sfx('block');
        world.particles.sparks(this.x + this.facing * 14, this.y - 40, 6, '#ffd27a');
      }
    }
    const died = super.takeHit(dmg, fromX, world);
    this.knock = 0;
    return died;
  }

  meleeBox() {
    if (this.state !== 'slash' || this.stateT < 0.05 || this.stateT > 0.44) return null;
    const reach = 50;
    return {
      x: this.facing > 0 ? this.x + 8 : this.x - 8 - reach,
      y: this.y - 54,
      w: reach,
      h: 36,
    };
  }

  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); return; }
    this.flash = Math.max(0, this.flash - dt);
    this.knockT = 0;
    const p = world.player;
    const dx = p.x - this.x;
    const near = p.alive && Math.abs(dx) < 310 && Math.abs(p.y - this.y) < 92;
    this.stateT += dt;
    this.slashCd = Math.max(0, this.slashCd - dt);

    if (this.state === 'march') {
      if (near) this.facing = dx >= 0 ? 1 : -1;
      const speed = this.variant === 'crimson' ? 54 : 46;
      const nextX = this.x + this.facing * speed * dt;
      const atEdge = (this.facing > 0 && nextX > this.maxX) || (this.facing < 0 && nextX < this.minX);
      if (atEdge || this.blockedAhead(level)) {
        if (!near) this.facing = -this.facing;
        this.vx = 0;
      } else {
        this.vx = this.facing * speed;
      }
      this.animT += Math.abs(this.vx) > 1 ? dt * 5.2 : 0;
      this.frame = Math.floor(this.animT) % 2 ? 'walk1' : 'walk0';
      const triggerRange = this.variant === 'crimson' ? 175 : 148;
      if (near && this.onGround && this.slashCd <= 0 && Math.abs(dx) < triggerRange) {
        this.state = 'guard';
        this.stateT = 0;
        this.vx = 0;
        enemySfx(world, this, 'block');
      }
    } else if (this.state === 'guard') {
      this.vx = 0;
      this.frame = 'guard';
      if (near) this.facing = dx >= 0 ? 1 : -1;
      if (this.stateT >= 0.34) {
        this.state = 'slash';
        this.stateT = 0;
        this.vx = this.facing * (this.variant === 'crimson' ? 215 : 195);
        enemySfx(world, this, 'knight_slash');
        world.particles.sparks(this.x + this.facing * 24, this.y - 36, 5, '#e8eef8');
        if (this.variant === 'crimson') {
          const cw = new Projectile('crimson_wave', this.x + this.facing * 24, this.y - 34, this.facing, 'enemy');
          cw.damage = 3; cw.life = 0.72; cw.vx = this.facing * 285;
          world.spawnProjectile(cw);
        }
      }
    } else {
      this.frame = 'slash';
      if (this.stateT > 0.28 || this.blockedAhead(level)) this.vx *= 0.78;
      if (this.stateT > 0.56) {
        this.vx = 0;
        this.state = 'march';
        this.stateT = 0;
        this.slashCd = (1.3 + Math.random() * 0.5) * world.difficulty.throwCooldown;
      }
    }
    this.physics(level, dt);
  }

  kill(world) {
    super.kill(world);
    world.particles.shards(this.x, this.y, 16, '#8a9ab5', this.y);
    world.particles.sparks(this.x, this.y - 30, 8, '#ffd27a');
    world.camera.shake(2.5, 0.18);
  }
}

/** Shadow Wraith (`wraith`): crimson-shrouded banshee spirit that glides along
 *  halls and crypts, unleashing homing spectral skulls when it shrieks. */
export class ShadowWraith extends Enemy {
  constructor(x, y, dir = -1, variant = 'normal') {
    super(x, y);
    this.w = 24; this.h = 46; this.hp = 4;
    this.score = SCORE.wraith || 350;
    this.touchDamage = 2;
    this.sheet = 'wraith'; this.frame = 'float0';
    this.flies = true; this.gravityScale = 0;
    this.facing = dir; this.baseY = y; this.t = Math.random() * 6;
    this.variant = variant;
    if (variant === 'banshee') {
      // Evolved Elder Banshee: shrieks twin skull + hellfire bolts!
      this.hp = 6; this.touchDamage = 3;
      this.tint = 'rgba(95, 225, 255, 0.45)';
      this.score = (SCORE.wraith || 350) + 170;
    }
    this.state = 'glide'; this.stateT = 0; this.shriekCd = 1.5 + Math.random() * 0.8;
  }

  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); return; }
    this.flash = Math.max(0, this.flash - dt);
    const p = world.player;
    this.t += dt; this.stateT += dt; this.shriekCd -= dt;
    const dx = p.x - this.x;
    const near = p.alive && Math.abs(dx) < 340;
    if (Math.random() < 0.32) {
      world.particles.emit({
        x: this.x - this.facing * 8, y: this.y - 18 + (Math.random() - 0.5) * 16,
        vx: -this.facing * 10, vy: -8, life: 0.55,
        color: this.variant === 'banshee' ? 'rgba(95, 225, 255, 0.45)' : 'rgba(225, 60, 95, 0.45)',
        size: 2, gravity: 0, glow: true,
      });
    }

    if (this.state === 'glide') {
      if (near) {
        this.facing = dx >= 0 ? 1 : -1;
        const tx = p.x - this.facing * 86;
        this.x += Math.sign(tx - this.x) * Math.min(Math.abs(tx - this.x), 58 * dt);
        const ty = p.y - 36;
        this.baseY += Math.sign(ty - this.baseY) * Math.min(Math.abs(ty - this.baseY), 42 * dt);
      } else {
        this.x += this.facing * 46 * dt;
      }
      this.y = this.baseY + Math.sin(this.t * 2.6) * 11;
      this.frame = Math.floor(this.t * 4.8) % 2 ? 'float1' : 'float0';
      if (near && this.shriekCd <= 0 && Math.abs(dx) < 275) {
        this.state = 'shriek'; this.stateT = 0; this.fired = false;
      }
    } else {
      this.frame = 'shriek';
      this.y = this.baseY + Math.sin(this.t * 8) * 3;
      if (!this.fired && this.stateT >= 0.42) {
        this.fired = true;
        this.facing = dx >= 0 ? 1 : -1;
        const sk = new Projectile('skull', this.x + this.facing * 16, this.y - 28, this.facing, 'enemy');
        world.spawnProjectile(sk);
        if (this.variant === 'banshee') {
          const hf = new Projectile('hellfire', this.x + this.facing * 18, this.y - 22, this.facing, 'enemy');
          const ang = Math.atan2((p.y - 30) - (this.y - 22), p.x - this.x);
          hf.vx = Math.cos(ang) * 235; hf.vy = Math.sin(ang) * 235; hf.dir = hf.vx >= 0 ? 1 : -1;
          world.spawnProjectile(hf);
        }
        world.particles.sparks(this.x + this.facing * 14, this.y - 28, 7, this.variant === 'banshee' ? '#6ce6ff' : '#ff4a66');
        enemySfx(world, this, 'wraith_shriek');
      }
      if (this.stateT > 0.88) {
        this.state = 'glide';
        this.shriekCd = (2.5 + Math.random() * 0.7) * world.difficulty.throwCooldown;
      }
    }
    if (this.x < -80 || this.x > level.width + 80) this.dead = true;
  }

  kill(world) {
    super.kill(world);
    world.particles.sparks(this.x, this.y - 20, 12, '#ff4a66');
    world.particles.smoke(this.x, this.y - 16, 6, 'rgba(140, 20, 45, 0.5)');
  }
}

// --------------------------------------------------- new gothic enemy forms

/** Plague Alchemist (`alchfiend`): beaked heretic grenadier who hops away when
 *  crowded and lobs volatile `'alchflask'` firebombs that ignite the floor! */
export class PlagueAlchemist extends Enemy {
  constructor(x, y, min, max) {
    super(x, y);
    this.w = 24; this.h = 54; this.hp = 6;
    this.score = SCORE.alchfiend || 420;
    this.touchDamage = 2;
    this.sheet = 'alchfiend'; this.frame = 'walk0';
    this.minX = min; this.maxX = max; this.facing = -1;
    this.state = 'stalk'; this.stateT = 0; this.animT = Math.random() * 3;
    this.lobCd = 1.0 + Math.random() * 0.7;
    this.evadeCd = 0;
  }

  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); return; }
    this.flash = Math.max(0, this.flash - dt);
    const p = world.player;
    const dx = p.x - this.x;
    const near = p.alive && Math.abs(dx) < 340 && Math.abs(p.y - this.y) < 110;
    this.stateT += dt;
    this.lobCd = Math.max(0, this.lobCd - dt);
    this.evadeCd = Math.max(0, this.evadeCd - dt);
    if (this.knock) { this.vx = this.knock * 90; this.knock = 0; this.knockT = 0.12; }
    if (this.knockT > 0) { this.knockT -= dt; this.physics(level, dt); return; }

    if (this.state === 'stalk') {
      if (near) this.facing = dx >= 0 ? 1 : -1;
      // Backstep leap if the hunter rushes into melee reach!
      if (near && this.onGround && this.evadeCd <= 0 && Math.abs(dx) < 74) {
        const backX = this.x - this.facing * 52;
        if (backX > this.minX && backX < this.maxX) {
          this.vx = -this.facing * 165;
          this.vy = -255;
          this.onGround = false;
          this.evadeCd = 2.0;
          this.lobCd = Math.min(this.lobCd, 0.2);
        }
      } else if (this.onGround) {
        let dir = this.facing;
        if (near && Math.abs(dx) < 105) dir = -this.facing;
        const speed = 50;
        const nextX = this.x + dir * speed * dt;
        const atEdge = (dir > 0 && nextX > this.maxX) || (dir < 0 && nextX < this.minX);
        const saveF = this.facing; this.facing = dir;
        const blocked = this.blockedAhead(level);
        this.facing = saveF;
        if (atEdge || blocked) {
          if (!near) this.facing = -this.facing;
          this.vx = 0;
        } else {
          this.vx = dir * speed;
        }
      }
      this.animT += Math.abs(this.vx) > 2 ? dt * 6.2 : 0;
      this.frame = Math.floor(this.animT) % 2 ? 'walk1' : 'walk0';
      if (near && this.onGround && this.lobCd <= 0 && Math.abs(dx) > 60 && Math.abs(dx) < 310) {
        this.state = 'lob'; this.stateT = 0; this.vx = 0; this.fired = false;
      }
    } else {
      this.vx = 0;
      this.frame = this.stateT < 0.28 ? 'windup' : 'lob';
      if (!this.fired && this.stateT >= 0.28) {
        this.fired = true;
        this.facing = dx >= 0 ? 1 : -1;
        const dist = Math.min(285, Math.max(75, Math.abs(dx)));
        const count = world.difficulty && world.difficulty.key === 'easy' ? 1 : 2;
        for (let i = 0; i < count; i++) {
          const fl = new Projectile('alchflask', this.x + this.facing * 14, this.y - 44, this.facing, 'enemy');
          fl.vx = this.facing * (95 + dist * (0.44 + i * 0.16));
          fl.vy = -325 - i * 48;
          world.spawnProjectile(fl);
        }
        world.particles.sparks(this.x + this.facing * 14, this.y - 44, 6, '#52f0d4');
        enemySfx(world, this, 'throw');
      }
      if (this.stateT > 0.68) {
        this.state = 'stalk';
        this.lobCd = (1.75 + Math.random() * 0.7) * world.difficulty.throwCooldown;
      }
    }
    this.physics(level, dt);
    if (this.y > level.height + 60) this.dead = true;
  }

  kill(world) {
    super.kill(world);
    world.particles.sparks(this.x, this.y - 24, 14, '#52f0d4');
    world.particles.embers(this.x, this.y - 20, 8);
  }
}

/** Phantom Duelist (`duelist`): aristocratic rapier fencer who parries frontal
 *  strikes with a ringing flash and ripostes immediately with a lightning lunge! */
export class PhantomDuelist extends Enemy {
  constructor(x, y, min, max) {
    super(x, y);
    this.w = 24; this.h = 58; this.hp = 8;
    this.score = SCORE.duelist || 500;
    this.touchDamage = 3;
    this.sheet = 'duelist'; this.frame = 'step0';
    this.minX = min; this.maxX = max; this.facing = -1;
    this.state = 'advance'; this.stateT = 0; this.animT = 0;
    this.lungeCd = 0.9 + Math.random() * 0.6;
  }

  takeHit(dmg, fromX, world, opts = null) {
    const frontal = (fromX - this.x) * this.facing > 0;
    const piercing = !!(opts && opts.armorPiercing) || !!(world && world._hitArmorPiercing);
    if (this.state === 'parry' && frontal && !piercing) {
      if (world && world.difficulty && world.difficulty.key === 'easy') {
        // On Easy, parry deflects half the blow with sparks instead of full immunity + instant riposte.
        dmg = Math.max(1, Math.floor(dmg * 0.5));
        world.sfx('block');
        world.particles.sparks(this.x + this.facing * 16, this.y - 38, 6, '#fff2b2');
      } else {
        // Clean rapier parry -> immediate high-speed riposte lunge!
        world.sfx('block');
        world.particles.sparks(this.x + this.facing * 16, this.y - 38, 10, '#fff2b2');
        this.state = 'lunge';
        this.stateT = 0;
        this.vx = this.facing * 285;
        return false;
      }
    }
    const died = super.takeHit(dmg, fromX, world);
    this.knock = 0;
    return died;
  }

  meleeBox() {
    if (this.state !== 'lunge' || this.stateT < 0.03 || this.stateT > 0.38) return null;
    const reach = 52;
    return {
      x: this.facing > 0 ? this.x + 8 : this.x - 8 - reach,
      y: this.y - 48,
      w: reach,
      h: 28,
    };
  }

  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); return; }
    this.flash = Math.max(0, this.flash - dt);
    const p = world.player;
    const dx = p.x - this.x;
    const near = p.alive && Math.abs(dx) < 320 && Math.abs(p.y - this.y) < 88;
    this.stateT += dt;
    this.lungeCd = Math.max(0, this.lungeCd - dt);

    if (this.state === 'advance') {
      if (near) this.facing = dx >= 0 ? 1 : -1;
      const speed = near ? 72 : 48;
      const nextX = this.x + this.facing * speed * dt;
      const atEdge = (this.facing > 0 && nextX > this.maxX) || (this.facing < 0 && nextX < this.minX);
      if (atEdge || this.blockedAhead(level)) {
        if (!near) this.facing = -this.facing;
        this.vx = 0;
      } else {
        this.vx = this.facing * speed;
      }
      this.animT += Math.abs(this.vx) > 1 ? dt * 7 : 0;
      this.frame = Math.floor(this.animT) % 2 ? 'step1' : 'step0';
      if (near && this.onGround && this.lungeCd <= 0 && Math.abs(dx) < 165) {
        this.state = 'parry';
        this.stateT = 0;
        this.vx = 0;
        enemySfx(world, this, 'block');
      }
    } else if (this.state === 'parry') {
      this.vx = 0;
      this.frame = 'parry';
      if (near) this.facing = dx >= 0 ? 1 : -1;
      if (this.stateT >= 0.30) {
        this.state = 'lunge';
        this.stateT = 0;
        this.vx = this.facing * 268;
        enemySfx(world, this, 'knight_slash');
        world.particles.sparks(this.x + this.facing * 20, this.y - 36, 6, '#ffd6e8');
      }
    } else {
      this.frame = 'lunge';
      if (this.stateT > 0.26 || this.blockedAhead(level)) this.vx *= 0.76;
      if (this.stateT > 0.48) {
        this.vx = 0;
        this.state = 'advance';
        this.stateT = 0;
        this.lungeCd = (1.1 + Math.random() * 0.45) * world.difficulty.throwCooldown;
      }
    }
    this.physics(level, dt);
    if (this.y > level.height + 60) this.dead = true;
  }

  kill(world) {
    super.kill(world);
    world.particles.sparks(this.x, this.y - 30, 12, '#ffd6e8');
    world.particles.smoke(this.x, this.y - 24, 5, 'rgba(190, 60, 120, 0.5)');
  }
}

/** Dread Executioner (`executioner`): towering hooded headsman whose great-axe
 *  cleave shakes the floor and sends a crimson shockwave racing along the stone! */
export class DreadExecutioner extends Enemy {
  constructor(x, y, min, max) {
    super(x, y);
    this.w = 34; this.h = 72; this.hp = 14;
    this.score = SCORE.executioner || 650;
    this.touchDamage = 4;
    this.heavy = true;
    this.sheet = 'executioner'; this.frame = 'walk0';
    this.minX = min; this.maxX = max; this.facing = -1;
    this.state = 'march'; this.stateT = 0; this.animT = 0;
    this.cleaveCd = 1.2 + Math.random() * 0.7;
  }

  takeHit(dmg, fromX, world) {
    const died = super.takeHit(dmg, fromX, world);
    this.knock = 0;
    return died;
  }

  meleeBox() {
    if (this.state !== 'cleave' || this.stateT < 0.04 || this.stateT > 0.44) return null;
    const reach = 58;
    return {
      x: this.facing > 0 ? this.x + 8 : this.x - 8 - reach,
      y: this.y - 66,
      w: reach,
      h: 58,
    };
  }

  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); return; }
    this.flash = Math.max(0, this.flash - dt);
    this.knockT = 0;
    const p = world.player;
    const dx = p.x - this.x;
    const near = p.alive && Math.abs(dx) < 330 && Math.abs(p.y - this.y) < 96;
    this.stateT += dt;
    this.cleaveCd = Math.max(0, this.cleaveCd - dt);

    if (this.state === 'march') {
      if (near) this.facing = dx >= 0 ? 1 : -1;
      const speed = 42;
      const nextX = this.x + this.facing * speed * dt;
      const atEdge = (this.facing > 0 && nextX > this.maxX) || (this.facing < 0 && nextX < this.minX);
      if (atEdge || this.blockedAhead(level)) {
        if (!near) this.facing = -this.facing;
        this.vx = 0;
      } else {
        this.vx = this.facing * speed;
      }
      this.animT += Math.abs(this.vx) > 1 ? dt * 4.4 : 0;
      this.frame = Math.floor(this.animT) % 2 ? 'walk1' : 'walk0';
      if (near && this.onGround && this.cleaveCd <= 0 && Math.abs(dx) < 175) {
        this.state = 'heave';
        this.stateT = 0;
        this.vx = 0;
        this.shocked = false;
        enemySfx(world, this, 'block');
      }
    } else if (this.state === 'heave') {
      this.vx = 0;
      this.frame = 'heave';
      if (near) this.facing = dx >= 0 ? 1 : -1;
      if (this.stateT >= 0.40) {
        this.state = 'cleave';
        this.stateT = 0;
        this.vx = this.facing * 155;
        enemySfx(world, this, 'knight_slash');
      }
    } else {
      this.frame = 'cleave';
      if (!this.shocked && this.stateT >= 0.10) {
        this.shocked = true;
        world.camera.shake(4, 0.22);
        world.particles.shards(this.x + this.facing * 32, this.y, 10, '#9aa8c4', this.y);
        const cw = new Projectile('crimson_wave', this.x + this.facing * 28, this.y - 22, this.facing, 'enemy');
        cw.damage = 4; cw.life = 0.78; cw.vx = this.facing * 295;
        world.spawnProjectile(cw);
      }
      if (this.stateT > 0.24 || this.blockedAhead(level)) this.vx *= 0.72;
      if (this.stateT > 0.68) {
        this.vx = 0;
        this.state = 'march';
        this.stateT = 0;
        this.cleaveCd = (1.55 + Math.random() * 0.55) * world.difficulty.throwCooldown;
      }
    }
    this.physics(level, dt);
    if (this.y > level.height + 60) this.dead = true;
  }

  kill(world) {
    super.kill(world);
    world.particles.shards(this.x, this.y, 18, '#5a222c', this.y);
    world.particles.sparks(this.x, this.y - 36, 10, '#ff5c74');
    world.camera.shake(3.5, 0.24);
  }
}

/** Abyssal Merman (`merman`):scaled cistern hunter that bounds in high
 *  amphibious leaps and spits twin pressurized `'waterbolt'` lances! */
export class AbyssalMerman extends Enemy {
  constructor(x, y, min, max) {
    super(x, y);
    this.w = 26; this.h = 54; this.hp = 6;
    this.score = SCORE.merman || 380;
    this.touchDamage = 3;
    this.sheet = 'merman'; this.frame = 'stalk0';
    this.minX = min; this.maxX = max; this.facing = -1;
    this.state = 'stalk'; this.stateT = 0; this.animT = Math.random() * 3;
    this.actCd = 0.9 + Math.random() * 0.6;
    this.cycle = 0;
  }

  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); return; }
    this.flash = Math.max(0, this.flash - dt);
    const p = world.player;
    const dx = p.x - this.x;
    const near = p.alive && Math.abs(dx) < 330 && Math.abs(p.y - this.y) < 120;
    this.stateT += dt;
    this.actCd = Math.max(0, this.actCd - dt);
    if (this.knock) { this.vx = this.knock * 90; this.vy = -90; this.knock = 0; }

    if (this.state === 'stalk') {
      if (near) this.facing = dx >= 0 ? 1 : -1;
      const speed = near ? 66 : 44;
      const nextX = this.x + this.facing * speed * dt;
      const atEdge = (this.facing > 0 && nextX > this.maxX) || (this.facing < 0 && nextX < this.minX);
      if (atEdge || this.blockedAhead(level)) {
        if (!near) this.facing = -this.facing;
        this.vx = 0;
      } else {
        this.vx = this.facing * speed;
      }
      this.animT += Math.abs(this.vx) > 1 ? dt * 6.5 : 0;
      this.frame = Math.floor(this.animT) % 2 ? 'stalk1' : 'stalk0';
      if (near && this.onGround && this.actCd <= 0) {
        this.cycle++;
        if (this.cycle % 2 === 1 && Math.abs(dx) < 285) {
          this.state = 'spit'; this.stateT = 0; this.vx = 0; this.fired = false;
        } else if (Math.abs(dx) < 220) {
          this.state = 'leap'; this.stateT = 0;
          this.facing = dx >= 0 ? 1 : -1;
          this.vx = this.facing * 195;
          this.vy = -440;
          this.onGround = false;
          world.particles.sparks(this.x, this.y - 10, 6, '#58dcff');
          enemySfx(world, this, 'magma_slime');
        }
      }
    } else if (this.state === 'spit') {
      this.vx = 0;
      this.frame = 'spit';
      if (!this.fired && this.stateT >= 0.28) {
        this.fired = true;
        this.facing = dx >= 0 ? 1 : -1;
        const sx = this.x + this.facing * 16, sy = this.y - 38;
        const baseAng = Math.atan2((p.y - 30) - sy, p.x - sx);
        const offsets = world.difficulty && world.difficulty.key === 'easy' ? [0] : [-0.09, 0.09];
        for (const off of offsets) {
          const wb = new Projectile('waterbolt', sx, sy, this.facing, 'enemy');
          const ang = baseAng + off;
          wb.vx = Math.cos(ang) * 295; wb.vy = Math.sin(ang) * 295; wb.gravity = 0;
          wb.dir = wb.vx >= 0 ? 1 : -1;
          world.spawnProjectile(wb);
        }
        world.particles.sparks(sx, sy, 6, '#6ce6ff');
        enemySfx(world, this, 'ice_shard');
      }
      if (this.stateT > 0.68) {
        this.state = 'stalk';
        this.actCd = (1.35 + Math.random() * 0.55) * world.difficulty.throwCooldown;
      }
    } else {
      // leap
      this.frame = 'leap';
      if (this.onGround && this.stateT > 0.14) {
        this.vx *= 0.45;
        this.state = 'stalk';
        this.actCd = (1.1 + Math.random() * 0.45) * world.difficulty.throwCooldown;
      }
    }
    this.physics(level, dt);
    if (this.y > level.height + 60) this.dead = true;
  }

  kill(world) {
    super.kill(world);
    world.particles.sparks(this.x, this.y - 24, 12, '#58dcff');
    world.particles.shards(this.x, this.y, 10, '#2c6882', this.y);
  }
}

/** Fallen Valkyrie (`valkyrie`): winged celestial spear-maiden that hovers
 *  aloft, hurls blazing `'starlance'` javelins, and dives diagonally across halls! */
export class FallenValkyrie extends Enemy {
  constructor(x, y, dir = -1) {
    super(x, y);
    this.w = 28; this.h = 54; this.hp = 7;
    this.score = SCORE.valkyrie || 520;
    this.touchDamage = 3;
    this.sheet = 'valkyrie'; this.frame = 'hover0';
    this.flies = true; this.gravityScale = 0;
    this.facing = dir; this.baseY = y; this.t = Math.random() * 5;
    this.state = 'hover'; this.stateT = 0; this.actCd = 1.2 + Math.random() * 0.7;
    this.cycle = 0;
  }

  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); this.y += 85 * dt; return; }
    this.flash = Math.max(0, this.flash - dt);
    const p = world.player;
    this.t += dt; this.stateT += dt; this.actCd -= dt;
    const dx = p.x - this.x, dy = (p.y - 34) - this.y;
    const near = p.alive && Math.abs(dx) < 360;

    if (this.state === 'hover') {
      if (near) {
        this.facing = dx >= 0 ? 1 : -1;
        const wantX = p.x - this.facing * 108;
        this.x += Math.sign(wantX - this.x) * Math.min(Math.abs(wantX - this.x), 78 * dt);
        const wantY = p.y - 74;
        this.baseY += Math.sign(wantY - this.baseY) * Math.min(Math.abs(wantY - this.baseY), 56 * dt);
      } else {
        this.x += this.facing * 52 * dt;
      }
      this.y = this.baseY + Math.sin(this.t * 3.6) * 9;
      this.frame = Math.floor(this.t * 7) % 2 ? 'hover1' : 'hover0';
      if (near && this.actCd <= 0 && Math.abs(dx) < 310) {
        this.cycle++;
        this.state = 'aim';
        this.stateT = 0;
        this.fired = false;
      }
    } else if (this.state === 'aim') {
      this.frame = 'aim';
      this.facing = dx >= 0 ? 1 : -1;
      this.y = this.baseY + Math.sin(this.t * 6) * 3;
      if (!this.fired && this.stateT >= 0.30) {
        this.fired = true;
        const sx = this.x + this.facing * 18, sy = this.y - 34;
        const ang = Math.atan2((p.y - 30) - sy, p.x - sx);
        const sl = new Projectile('starlance', sx, sy, this.facing, 'enemy');
        sl.vx = Math.cos(ang) * 335; sl.vy = Math.sin(ang) * 335;
        sl.dir = sl.vx >= 0 ? 1 : -1;
        world.spawnProjectile(sl);
        world.particles.sparks(sx, sy, 7, '#ffe892');
        enemySfx(world, this, 'throw');
      }
      if (this.stateT > 0.62) {
        if (this.cycle % 2 === 0 && p.alive) {
          this.state = 'dive';
          this.stateT = 0;
          const d = Math.hypot(dx, dy) || 1;
          this.vx = (dx / d) * 255;
          this.vy = (dy / d) * 255;
          enemySfx(world, this, 'knight_slash');
        } else {
          this.state = 'hover';
          this.actCd = (1.65 + Math.random() * 0.6) * world.difficulty.throwCooldown;
        }
      }
    } else {
      // dive
      this.frame = 'dive';
      this.x += this.vx * dt;
      this.baseY += this.vy * dt;
      this.y = this.baseY;
      if (Math.random() < 0.5) world.particles.sparks(this.x, this.y - 24, 1, '#ffe892');
      if (this.stateT > 0.52) {
        this.state = 'hover';
        this.actCd = (1.6 + Math.random() * 0.6) * world.difficulty.throwCooldown;
      }
    }
    if (this.x < -80 || this.x > level.width + 80) this.dead = true;
  }

  kill(world) {
    super.kill(world);
    world.particles.sparks(this.x, this.y - 28, 14, '#ffe892');
    world.particles.smoke(this.x, this.y - 22, 6, 'rgba(120, 150, 235, 0.5)');
  }
}

/** Crypt Necromancer (`necromancer`): levitating lich-priest that unleashes
 *  homing skulls & hellfire bolts (`cast`) and raises undead servants (`chant`)! */
export class CryptNecromancer extends Enemy {
  constructor(x, y, dir = -1) {
    super(x, y);
    this.w = 26; this.h = 60; this.hp = 7;
    this.score = SCORE.necromancer || 560;
    this.touchDamage = 2;
    this.sheet = 'necromancer'; this.frame = 'float0';
    this.flies = true; this.gravityScale = 0;
    this.facing = dir; this.baseY = y; this.t = Math.random() * 6;
    this.state = 'float'; this.stateT = 0; this.actCd = 1.4 + Math.random() * 0.7;
    this.cycle = 0;
    this.minions = [];
  }

  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); return; }
    this.flash = Math.max(0, this.flash - dt);
    this.minions = this.minions.filter((m) => !m.dead);
    const p = world.player;
    this.t += dt; this.stateT += dt; this.actCd -= dt;
    const dx = p.x - this.x;
    const near = p.alive && Math.abs(dx) < 360;

    if (this.state === 'float') {
      if (near) {
        this.facing = dx >= 0 ? 1 : -1;
        // Maintain tactical casting distance (~135px from hunter)
        const wantX = p.x - this.facing * 135;
        this.x += Math.sign(wantX - this.x) * Math.min(Math.abs(wantX - this.x), 56 * dt);
        const wantY = p.y - 52;
        this.baseY += Math.sign(wantY - this.baseY) * Math.min(Math.abs(wantY - this.baseY), 38 * dt);
      } else {
        this.x += this.facing * 36 * dt;
      }
      this.y = this.baseY + Math.sin(this.t * 2.5) * 9;
      this.frame = Math.floor(this.t * 4.5) % 2 ? 'float1' : 'float0';
      if (near && this.actCd <= 0 && Math.abs(dx) < 325) {
        this.cycle++;
        const maxMinions = world.difficulty && world.difficulty.key === 'easy' ? 1 : 2;
        this.state = (this.cycle % 2 === 0 && this.minions.length < maxMinions) ? 'chant' : 'cast';
        this.stateT = 0;
        this.fired = false;
      }
    } else if (this.state === 'cast') {
      this.frame = 'cast';
      this.y = this.baseY + Math.sin(this.t * 5) * 4;
      if (!this.fired && this.stateT >= 0.34) {
        this.fired = true;
        this.facing = dx >= 0 ? 1 : -1;
        const sx = this.x + this.facing * 16, sy = this.y - 36;
        const sk = new Projectile('skull', sx, sy - 8, this.facing, 'enemy');
        world.spawnProjectile(sk);
        if (!world.difficulty || world.difficulty.key !== 'easy') {
          const hf = new Projectile('hellfire', sx, sy + 4, this.facing, 'enemy');
          const ang = Math.atan2((p.y - 28) - (sy + 4), p.x - sx);
          hf.vx = Math.cos(ang) * 235; hf.vy = Math.sin(ang) * 235; hf.dir = hf.vx >= 0 ? 1 : -1;
          world.spawnProjectile(hf);
        }
        world.particles.sparks(sx, sy, 8, '#c88cff');
        enemySfx(world, this, 'ghost_moan');
      }
      if (this.stateT > 0.82) {
        this.state = 'float';
        this.actCd = (2.0 + Math.random() * 0.7) * world.difficulty.throwCooldown;
      }
    } else {
      // chant: raise an undead servant on the solid stone beneath
      this.frame = 'chant';
      this.y = this.baseY + Math.sin(this.t * 8) * 3;
      if (!this.fired && this.stateT >= 0.45) {
        this.fired = true;
        const spawnX = this.x + this.facing * 42;
        const tx = Math.max(1, Math.min(level.cols - 2, Math.floor(spawnX / TILE)));
        const row = level.surfaceRow(tx, Math.max(0, Math.floor(this.y / TILE)));
        if (row > 0 && level.isSolid(tx, row)) {
          const mx = tx * TILE + TILE / 2, my = row * TILE;
          const isEasy = world.difficulty && world.difficulty.key === 'easy';
          const m = isEasy
            ? new Zombie(mx, my, this.facing, 'normal', false)
            : (this.cycle % 4 === 0
              ? new Skeleton(mx, my, (tx - 5) * TILE, (tx + 6) * TILE, 'red')
              : new Zombie(mx, my, this.facing, 'ghoul', false));
          m.active = true;
          world.spawnEnemy(m);
          this.minions.push(m);
          world.particles.sparks(mx, my - 16, 10, '#c88cff');
          enemySfx(world, this, 'bone');
        }
      }
      if (this.stateT > 0.95) {
        this.state = 'float';
        this.actCd = (2.3 + Math.random() * 0.7) * world.difficulty.throwCooldown;
      }
    }
    if (this.x < -80 || this.x > level.width + 80) this.dead = true;
  }

  kill(world) {
    super.kill(world);
    world.particles.sparks(this.x, this.y - 28, 14, '#c88cff');
    world.particles.smoke(this.x, this.y - 22, 7, 'rgba(95, 35, 160, 0.55)');
  }
}

/** Wall-pacing spawner factory used by Spawner for float-in enemies. */
function makeFloater(type, x, y, dir, variant) {
  if (type === 'lantern') return new Pumpkin(x, y, dir, 'lantern');
  if (type === 'wisp') return new FrostWisp(x, y, dir);
  if (type === 'ghost') return new Phantom(x, y, dir);
  if (type === 'wraith') return new ShadowWraith(x, y, dir, variant);
  if (type === 'cinderimp') return new CinderImp(x, y, dir);
  if (type === 'valkyrie') return new FallenValkyrie(x, y, dir);
  if (type === 'necromancer') return new CryptNecromancer(x, y, dir);
  return new MedusaHead(x, y, dir);
}

/** Builds a placed enemy from a stage definition entry. */
export function createEnemy(e) {
  const cx = e.tx * TILE + TILE / 2;
  const groundY = (e.row == null ? 0 : e.row) * TILE;
  const minX = (e.min == null ? e.tx - 4 : e.min) * TILE, maxX = ((e.max == null ? e.tx + 4 : e.max) + 1) * TILE;
  switch (e.type) {
    case 'skeleton': return new Skeleton(cx, groundY, minX, maxX, e.variant);
    case 'zombie': return new Zombie(cx, groundY, -1, e.variant, true);
    case 'bat': return new Bat(cx, e.ty * TILE + 16, e.variant);
    case 'medusa': return new MedusaHead(cx, e.ty * TILE + 16, -1);
    case 'wisp': return new FrostWisp(cx, e.ty * TILE + 16, -1);
    case 'lantern': return new Pumpkin(cx, e.ty * TILE + 16, -1, 'lantern');
    case 'catoblepas': return new Catoblepas(cx, groundY, minX, maxX);
    case 'pumpkin': return new Pumpkin(cx, groundY, -1, e.variant === 'lantern' ? 'lantern' : 'hopper');
    case 'dragon': return new Dragon(cx, e.ty * TILE + 16, minX, maxX, e.variant);
    case 'icegolem': return new IceGolem(cx, groundY, minX, maxX);
    case 'snowman': return new Snowman(cx, groundY, minX, maxX);
    case 'wolf': return new BriarWolf(cx, groundY, minX, maxX, e.variant);
    case 'mushroom': return new Sporecap(cx, groundY, minX, maxX);
    case 'owl': return new NightOwl(cx, e.ty * TILE + 16);
    case 'ghost': return new Phantom(cx, e.ty * TILE + 16, -1);
    case 'tome': return new CursedTome(cx, e.ty * TILE + 16);
    case 'gargoyle': return new Gargoyle(cx, e.ty * TILE + 16, e.variant);
    case 'magmaslime': return new MagmaSlime(cx, groundY, minX, maxX);
    case 'lavagolem': return new LavaGolem(cx, groundY, minX, maxX);
    case 'cinderimp': return new CinderImp(cx, e.ty * TILE + 16, -1);
    case 'armor': return new PlateKnight(cx, groundY, minX, maxX, e.variant);
    case 'wraith': return new ShadowWraith(cx, e.ty * TILE + 16, -1, e.variant);
    case 'alchfiend': return new PlagueAlchemist(cx, groundY, minX, maxX);
    case 'duelist': return new PhantomDuelist(cx, groundY, minX, maxX);
    case 'executioner': return new DreadExecutioner(cx, groundY, minX, maxX);
    case 'merman': return new AbyssalMerman(cx, groundY, minX, maxX);
    case 'valkyrie': return new FallenValkyrie(cx, e.ty * TILE + 16, -1);
    case 'necromancer': return new CryptNecromancer(cx, e.ty * TILE + 16, -1);
    default: return null;
  }
}

export class Spawner {
  constructor(def) {
    this.type = def.type;
    this.variant = def.variant || 'normal';
    this.x0 = def.x0 * TILE; this.x1 = (def.x1 + 1) * TILE;
    const isFlying = this.type !== 'zombie' && this.type !== 'pumpkin' && this.type !== 'merman';
    this.timer = isFlying ? 1.3 : 0.9;
    this.alive = [];
  }

  update(dt, world) {
    const p = world.player;
    const diff = world.difficulty;
    this.alive = this.alive.filter((e) => !e.dead);
    if (!p.alive || world.bossActive) return;
    if (p.x < this.x0 - 100 || p.x > this.x1 + 100) { this.timer = Math.min(this.timer, 1.1); return; }
    this.timer -= dt;
    if (this.timer > 0) return;
    const maxFly = diff.maxAlive >= 6 ? 4 : (diff.maxAlive >= 4 ? 3 : 1);
    if (this.type === 'zombie' || this.type === 'pumpkin' || this.type === 'merman') {
      if (this.alive.length >= diff.maxAlive) { this.timer = 0.5; return; }
      // Rise just off-screen-ish ahead or behind the hunter on real ground.
      for (let tries = 0; tries < 6; tries++) {
        const side = Math.random() < 0.7 ? p.facing : -p.facing;
        const x = p.x + side * (145 + Math.random() * 135);
        const tx = Math.floor(x / TILE);
        if (x < this.x0 || x > this.x1) continue;
        const row = world.level.surfaceRow(tx, Math.max(0, Math.floor(p.y / TILE) - 2));
        if (row < 0 || !world.level.isSolid(tx, row)) continue;
        const mx = tx * TILE + TILE / 2, my = row * TILE;
        const z = this.type === 'pumpkin'
          ? new Pumpkin(mx, my, -side, 'hopper')
          : this.type === 'merman'
            ? new AbyssalMerman(mx, my, this.x0, this.x1)
            : new Zombie(mx, my, -side, this.variant);
        world.spawnEnemy(z);
        this.alive.push(z);
        break;
      }
      this.timer = (1.85 + Math.random() * 0.65) * diff.spawnInterval;
    } else if (this.type === 'medusa' || this.type === 'lantern' || this.type === 'wisp' || this.type === 'ghost' || this.type === 'wraith' || this.type === 'cinderimp' || this.type === 'valkyrie' || this.type === 'necromancer') {
      if (this.alive.length >= maxFly) { this.timer = 0.7; return; }
      const dir = -p.facing;
      const x = p.facing > 0 ? world.camera.x + 640 + 30 : world.camera.x - 30;
      const y = p.y - (this.type === 'cinderimp' || this.type === 'valkyrie' || this.type === 'necromancer' ? 58 : 36) - Math.random() * 16;
      const m = makeFloater(this.type, x, y, dir, this.variant);
      m.active = true;
      world.spawnEnemy(m);
      this.alive.push(m);
      this.timer = (this.type === 'wraith' || this.type === 'cinderimp' || this.type === 'valkyrie' || this.type === 'necromancer' ? 3.5 + Math.random() * 0.9 : 2.6 + Math.random() * 0.9) * diff.spawnInterval;
    } else if (this.type === 'tome') {
      // Books tear themselves off the shelves ahead of the hunter, one at a time.
      if (this.alive.length >= maxFly) { this.timer = 0.8; return; }
      for (let i = 0; i < 1; i++) {
        const side = Math.random() < 0.7 ? p.facing : -p.facing;
        const x = p.x + side * (135 + Math.random() * 110);
        if (x < this.x0 || x > this.x1) continue;
        const t = new CursedTome(x, p.y - 64 - Math.random() * 44);
        t.wake(-side);
        t.active = true;
        world.spawnEnemy(t);
        this.alive.push(t);
        world.particles.dust(t.x, t.y, 5, '#c9b58a');
        enemySfx(world, t, 'tome_flap');
      }
      this.timer = (3.6 + Math.random() * 1.0) * diff.spawnInterval;
    } else if (this.type === 'gargoyle') {
      if (this.alive.length >= maxFly) { this.timer = 0.8; return; }
      const side = Math.random() < 0.75 ? p.facing : -p.facing;
      const g = new Gargoyle(p.x + side * (250 + Math.random() * 80), Math.max(16, world.camera.y + 24), this.variant);
      g.wake(-side, p.y - 38);
      g.active = true;
      world.spawnEnemy(g);
      this.alive.push(g);
      this.timer = (3.6 + Math.random() * 1.0) * diff.spawnInterval;
    } else if (this.type === 'bat' || this.type === 'owl') {
      // Bats and owls swoop down from the rafters/canopy ahead of the hunter.
      if (this.alive.length >= maxFly) { this.timer = 0.8; return; }
      const side = Math.random() < 0.75 ? p.facing : -p.facing;
      const x = p.x + side * (260 + Math.random() * 75);
      const yTop = Math.max(16, world.camera.y + 18);
      const b = this.type === 'owl' ? new NightOwl(x, yTop) : new Bat(x, yTop, this.variant);
      b.wake(-side, p.y - 40);
      b.active = true;
      world.spawnEnemy(b);
      this.alive.push(b);
      enemySfx(world, b, this.type === 'owl' ? 'owl_screech' : 'bat_flutter');
      this.timer = (3.2 + Math.random() * 1.0) * diff.spawnInterval;
    }
  }
}
