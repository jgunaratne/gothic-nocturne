// Enemies: skeleton warriors, rising zombies, swooping bats, medusa heads,
// plus the region spawners that feed zombies and heads.

import { TILE, SCORE } from '../engine/constants.js';
import { Entity } from './entities.js';
import { Projectile } from './objects.js';

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
    assets.draw(ctx, this.sheet, this.frame, this.x - camX, this.y - camY, flip, alpha, this.scale, this.tint);
    if (this.flash > 0 && Math.floor(this.flash * 40) % 2 === 0) {
      // Hit flash: additive re-draw brightens the sprite.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      assets.draw(ctx, this.sheet, this.frame, this.x - camX, this.y - camY, flip, 0.8 * alpha, this.scale, this.tint);
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
    this.w = 22; this.h = 56; this.hp = 4; this.score = SCORE.skeleton;
    this.sheet = 'skeleton'; this.minX = min; this.maxX = max;
    this.throwT = 2 + Math.random();
    this.state = 'walk'; this.stateT = 0; this.animT = 0;
    this.speed = 42; this.facing = -1;
    this.variant = variant;
    this.projectile = 'bone';
    if (variant === 'red') {
      // Red skeletons collapse into a bone pile and reassemble.
      this.hp = 3; this.tint = 'rgba(225, 55, 55, 0.5)'; this.speed = 50; this.revives = true;
    } else if (variant === 'axe') {
      this.hp = 5; this.tint = 'rgba(90, 130, 230, 0.42)'; this.projectile = 'axe'; this.score = SCORE.skeleton + 100;
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
      if (this.pileT <= 0) { this.hp = 3; this.flash = 0.3; this.state = 'walk'; this.stateT = 0; world.particles.dust(this.x, this.y, 6, '#c9c3b0'); }
      return;
    }
    const p = world.player;
    const dx = p.x - this.x;
    const near = Math.abs(dx) < 320 && p.alive;
    this.stateT += dt;
    this.throwT -= dt;
    if (this.knock) { this.vx = this.knock * 90; this.knock = 0; this.knockT = 0.15; }
    if (this.knockT > 0) { this.knockT -= dt; this.physics(level, dt); return; }

    if (this.state === 'walk') {
      if (near) this.facing = dx > 0 ? 1 : -1;
      // Keep a fighting distance: advance when far, back off when very close.
      let dir = this.facing;
      if (near && Math.abs(dx) < 70) dir = -this.facing;
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
      if (Math.abs(this.vx) > 1) { this.animT += dt * 6; } else this.animT = 0;
      const walkFrames = ['walk0', 'walk1', 'walk2', 'walk3'];
      this.frame = walkFrames[Math.floor(this.animT) % 4];
      if (near && this.throwT <= 0 && Math.abs(dx) > 80 && Math.abs(dx) < 300 && Math.abs(p.y - this.y) < 90) {
        this.state = 'throw'; this.stateT = 0; this.vx = 0;
      }
    } else if (this.state === 'throw') {
      this.vx = 0;
      if (this.stateT < 0.38) this.frame = 'throw0';
      else {
        this.frame = 'throw1';
        if (!this.thrown) {
          this.thrown = true;
          const pr = new Projectile(this.projectile, this.x + this.facing * 10, this.y - 46, this.facing, 'enemy');
          if (this.projectile === 'axe') { pr.vx = this.facing * 150; pr.vy = -400; pr.damage = 3; }
          world.spawnProjectile(pr);
          world.sfx(this.projectile === 'axe' ? 'throw' : 'bone');
        }
        if (this.stateT > 0.75) {
          this.state = 'walk'; this.thrown = false;
          this.throwT = (2.2 + Math.random() * 1.2) * world.difficulty.throwCooldown;
        }
      }
    }
    this.physics(level, dt);
  }

  kill(world) {
    if (this.revives) {
      // Collapse instead of dying; score only the first time.
      if (!this.scored) { this.scored = true; world.addScore(this.score); }
      world.sfx('enemy_die');
      world.particles.shards(this.x, this.y, 10, '#e8b0a0', this.y);
      this.pileT = 4.5;
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
  constructor(x, y, dir, variant = 'normal') {
    super(x, y);
    this.w = 20; this.h = 54; this.hp = 1; this.score = SCORE.zombie;
    this.sheet = 'zombie'; this.facing = dir; this.speed = 30;
    this.rise = 0.7;          // seconds left in the rising animation
    this.animT = Math.random() * 4;
    this.touchDamage = 2;
    if (variant === 'ghoul') {
      // Ghouls are quicker and take two hits.
      this.hp = 2; this.speed = 56; this.tint = 'rgba(80, 200, 120, 0.42)'; this.score = SCORE.zombie + 50;
    }
  }

  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); return; }
    this.flash = Math.max(0, this.flash - dt);
    if (this.rise > 0) {
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
    this.animT += dt * 5;
    this.frame = ['walk0', 'walk1', 'walk2', 'walk3'][Math.floor(this.animT) % 4];
    this.physics(level, dt);
    if (this.y > level.height + 60) this.dead = true;
  }

  get alive() { return !this.dead && this.deathT < 0; }
  meleeBox() { return null; }

  draw(ctx, assets, camX, camY) {
    if (this.rise > 0) {
      // Rising from the grave: the sprite climbs up through the ground line.
      const k = 1 - this.rise / 0.7;
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
  }
}

// -------------------------------------------------------------------- bat

export class Bat extends Enemy {
  constructor(x, y, variant = 'normal') {
    super(x, y);
    this.w = 26; this.h = 18; this.hp = 1; this.score = SCORE.bat;
    this.sheet = 'bat'; this.flies = true; this.gravityScale = 0;
    this.state = 'sleep'; this.baseY = y; this.t = 0; this.homeX = x;
    this.touchDamage = 2;
    this.speed = 118;
    this.variant = variant;
    if (variant === 'fire') { this.speed = 168; this.tint = 'rgba(255, 110, 30, 0.5)'; this.score = SCORE.bat + 50; }
  }

  /** Starts the swoop immediately (used by spawners and bosses). */
  wake(dir, targetY) {
    this.state = 'swoop'; this.facing = dir; this.t = 0; this.targetY = targetY;
  }

  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); this.y += 120 * dt; return; }
    this.flash = Math.max(0, this.flash - dt);
    const p = world.player;
    this.t += dt;
    if (this.state === 'sleep') {
      this.frame = 'fly0';
      if (p.alive && Math.abs(p.x - this.x) < 230 && p.y > this.y) this.wake(p.x > this.x ? 1 : -1, p.y - 36);
      return;
    }
    // Swoop: glide toward the player's height in a sine, then keep crossing.
    this.vx = this.facing * this.speed;
    this.baseY += (this.targetY - this.baseY) * Math.min(1, dt * 1.2);
    this.y = this.baseY + Math.sin(this.t * 4.2) * 34;
    this.x += this.vx * dt;
    if (this.variant === 'fire' && Math.random() < 0.3) world.particles.embers(this.x, this.y - 6, 1);
    if (Math.abs(this.x - this.homeX) > 900 || this.x < -40 || this.x > level.width + 40) this.dead = true;
    this.frame = ['fly0', 'fly1', 'fly2', 'fly1'][Math.floor(this.t * 12) % 4];
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
    this.sheet = 'medusa'; this.flies = true; this.gravityScale = 0;
    this.facing = dir; this.baseY = y; this.t = Math.random() * 6;
    this.touchDamage = 2;
  }
  update(dt, level) {
    if (this.deathT >= 0) { this.updateDeath(dt); return; }
    this.flash = Math.max(0, this.flash - dt);
    this.t += dt;
    this.x += this.facing * 92 * dt;
    this.y = this.baseY + Math.sin(this.t * 3.1) * 40;
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
    this.attackCd = 2 + Math.random();
    this.speed = 34; this.walkFrames = ['walk0', 'walk1']; this.attackFrame = 'attack';
    this.attackRange = [60, 240]; this.attackAt = 0.5; this.attackDur = 1.3; this.attackCooldown = 3.2;
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
    const near = Math.abs(dx) < 340 && p.alive;
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
      this.animT += Math.abs(this.vx) > 1 ? dt * 4 : 0;
      this.frame = this.walkFrames[Math.floor(this.animT) % this.walkFrames.length];
      if (near && this.attackCd <= 0 && Math.abs(dx) > this.attackRange[0] && Math.abs(dx) < this.attackRange[1] && Math.abs(p.y - this.y) < 70) {
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
    this.w = 70; this.h = 50; this.hp = 8; this.score = 500; this.touchDamage = 3;
    this.sheet = 'catoblepas'; this.walkFrames = ['walk0', 'walk1', 'walk2']; this.attackFrame = 'breath';
    this.attackRange = [50, 250];
  }
  fire(world) {
    const g = new Projectile('gas', this.x + this.facing * 44, this.y - 20, this.facing, 'enemy');
    world.spawnProjectile(g);
    world.sfx('fire');
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
    if (variant === 'lantern') {
      this.w = 22; this.h = 22; this.hp = 1; this.flies = true; this.gravityScale = 0;
      this.baseY = y; this.t = Math.random() * 6; this.frame = 'flame0'; this.score = 200;
    } else {
      this.w = 24; this.h = 24; this.hp = 2; this.hopT = 0.4 + Math.random() * 0.5; this.frame = 'hop0';
    }
  }
  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); return; }
    this.flash = Math.max(0, this.flash - dt);
    const p = world.player;
    if (this.variant === 'lantern') {
      this.t += dt;
      this.x += this.facing * 95 * dt;
      this.baseY += ((p.y - 36) - this.baseY) * Math.min(1, dt * 0.6);
      this.y = this.baseY + Math.sin(this.t * 3.4) * 36;
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
        this.vy = far ? -430 : -330; this.vx = this.facing * (far ? 150 : 110);
        this.onGround = false; this.hopT = 0.5 + Math.random() * 0.5;
        world.sfx('bone');
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
  constructor(x, y, min, max) {
    super(x, y);
    this.w = 60; this.h = 36; this.hp = 10; this.score = 600; this.touchDamage = 3;
    this.sheet = 'dragon'; this.flies = true; this.gravityScale = 0;
    this.baseY = y; this.minX = min; this.maxX = max; this.facing = -1;
    this.t = Math.random() * 5; this.fireCd = 2 + Math.random(); this.state = 'fly'; this.stateT = 0;
  }
  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); this.y += 90 * dt; return; }
    this.flash = Math.max(0, this.flash - dt);
    const p = world.player;
    this.t += dt; this.stateT += dt; this.fireCd -= dt;
    const dx = p.x - this.x, near = p.alive && Math.abs(dx) < 380;
    if (this.state === 'fly') {
      if (near) {
        this.facing = dx > 0 ? 1 : -1;
        // Hold position above and ahead of the hunter.
        const tx = p.x - this.facing * 150;
        this.x += Math.sign(tx - this.x) * Math.min(Math.abs(tx - this.x), 75 * dt);
        this.baseY += ((p.y - 110) - this.baseY) * Math.min(1, dt * 0.8);
      } else {
        this.x += this.facing * 55 * dt;
        if (this.x < this.minX || this.x > this.maxX) this.facing = -this.facing;
      }
      this.y = this.baseY + Math.sin(this.t * 2.6) * 14;
      this.frame = Math.floor(this.t * 6) % 2 ? 'fly0' : 'fly1';
      if (near && this.fireCd <= 0 && Math.abs(dx) < 320) { this.state = 'breath'; this.stateT = 0; this.shots = 0; }
    } else {
      this.frame = 'breath';
      this.y = this.baseY + Math.sin(this.t * 2.6) * 6;
      const due = 0.35 + this.shots * 0.22;
      if (this.shots < 3 && this.stateT >= due) {
        this.shots++;
        const fb = new Projectile('fireball', this.x + this.facing * 34, this.y - 14, this.facing, 'enemy');
        const ang = Math.atan2((p.y - 30) - (this.y - 14), p.x - (this.x + this.facing * 34));
        fb.vx = Math.cos(ang) * 230; fb.vy = Math.sin(ang) * 230; fb.dir = fb.vx >= 0 ? 1 : -1;
        world.spawnProjectile(fb);
        world.sfx('fire');
      }
      if (this.stateT > 1.2) { this.state = 'fly'; this.fireCd = 2.8 * world.difficulty.throwCooldown; }
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
    this.w = 40; this.h = 62; this.hp = 7; this.score = 450; this.touchDamage = 3;
    this.sheet = 'ice'; this.walkFrames = ['golem0', 'golem1']; this.attackFrame = 'golem1';
    this.speed = 28; this.attackRange = [40, 230]; this.attackAt = 0.4; this.attackDur = 1.0; this.attackCooldown = 2.6;
  }
  fire(world) {
    for (let i = 0; i < 2; i++) {
      const s = new Projectile('iceshard', this.x + this.facing * 20, this.y - 40 - i * 12, this.facing, 'enemy');
      s.vx = this.facing * (240 + i * 60); s.vy = -40 - i * 70;
      world.spawnProjectile(s);
    }
    world.sfx('throw');
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
    this.w = 26; this.h = 50; this.hp = 3; this.score = 250; this.touchDamage = 2;
    this.sheet = 'ice'; this.walkFrames = ['snowman0']; this.attackFrame = 'snowman1';
    this.speed = 22; this.heavy = false; this.attackRange = [70, 300]; this.attackAt = 0.4; this.attackDur = 0.9; this.attackCooldown = 2.2;
  }
  fire(world) {
    world.spawnProjectile(new Projectile('snowball', this.x + this.facing * 14, this.y - 44, this.facing, 'enemy'));
    world.sfx('throw');
  }
  kill(world) {
    super.kill(world);
    world.particles.shards(this.x, this.y, 12, '#f4f8ff', this.y);
  }
}

/** Frost wisp: a weaving spirit like a medusa head, but it drifts slower
 *  and leaves a chilling trail. */
export class FrostWisp extends Enemy {
  constructor(x, y, dir) {
    super(x, y);
    this.w = 22; this.h = 22; this.hp = 1; this.score = 300; this.touchDamage = 2;
    this.sheet = 'wisp'; this.flies = true; this.gravityScale = 0;
    this.facing = dir; this.baseY = y; this.t = Math.random() * 6;
  }
  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); return; }
    this.flash = Math.max(0, this.flash - dt);
    this.t += dt;
    this.x += this.facing * 80 * dt;
    this.y = this.baseY + Math.sin(this.t * 2.6) * 46;
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
  constructor(x, y, min, max) {
    super(x, y);
    this.w = 34; this.h = 26; this.hp = 3; this.score = SCORE.wolf || 250; this.touchDamage = 2;
    this.sheet = 'wolf'; this.frame = 'walk0';
    this.minX = min; this.maxX = max; this.facing = -1;
    this.state = 'prowl'; this.stateT = 0; this.animT = Math.random() * 4;
    this.lungeCd = 1.1 + Math.random() * 0.7;
  }
  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); return; }
    this.flash = Math.max(0, this.flash - dt);
    const p = world.player;
    const dx = p.x - this.x;
    const near = p.alive && Math.abs(dx) < 280 && Math.abs(p.y - this.y) < 96;
    this.stateT += dt;
    this.lungeCd = Math.max(0, this.lungeCd - dt);
    if (this.knock) { this.vx = this.knock * 100; this.vy = -110; this.knock = 0; }

    if (this.state === 'prowl') {
      if (near) this.facing = dx >= 0 ? 1 : -1;
      const speed = near ? 82 : 52;
      const nextX = this.x + this.facing * speed * dt;
      const atEdge = (this.facing > 0 && nextX > this.maxX) || (this.facing < 0 && nextX < this.minX);
      if (atEdge || this.blockedAhead(level)) {
        if (!near) this.facing = -this.facing;
        this.vx = 0;
      } else {
        this.vx = this.facing * speed;
      }
      this.animT += Math.abs(this.vx) > 2 ? dt * (near ? 9 : 6) : dt * 2;
      this.frame = 'walk' + (Math.floor(this.animT) % 3);
      if (near && this.onGround && this.lungeCd <= 0 && Math.abs(dx) > 48 && Math.abs(dx) < 175) {
        this.state = 'crouch';
        this.stateT = 0;
        this.vx = 0;
      }
    } else if (this.state === 'crouch') {
      this.vx = 0;
      this.frame = 'walk1';
      if (this.stateT >= 0.24) {
        this.state = 'lunge';
        this.stateT = 0;
        this.facing = dx >= 0 ? 1 : -1;
        this.vx = this.facing * 235;
        this.vy = -255;
        this.onGround = false;
        world.sfx('whip');
      }
    } else {
      // lunge
      this.frame = 'lunge';
      if (this.onGround && this.stateT > 0.12) {
        this.vx *= 0.5;
        this.state = 'prowl';
        this.stateT = 0;
        this.lungeCd = 1.5 * world.difficulty.throwCooldown;
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
    this.w = 24; this.h = 34; this.hp = 3; this.score = SCORE.mushroom || 250; this.touchDamage = 2;
    this.sheet = 'sporecap';
    this.walkFrames = ['walk0', 'walk1'];
    this.attackFrame = 'puff';
    this.speed = 32; this.heavy = false;
    this.attackRange = [48, 250]; this.attackAt = 0.35; this.attackDur = 0.85; this.attackCooldown = 2.3;
  }
  fire(world) {
    const sp = new Projectile('spore', this.x + this.facing * 14, this.y - 22, this.facing, 'enemy');
    world.spawnProjectile(sp);
    world.particles.sparks(this.x + this.facing * 10, this.y - 24, 6, '#62f2c2');
    world.sfx('fire');
  }
  kill(world) {
    super.kill(world);
    world.particles.sparks(this.x, this.y - 16, 12, '#62f2c2');
    world.particles.dust(this.x, this.y, 8, '#4ac8a8');
  }
}

/** Swooping Darkwood Night-Owl: perches high under elder boughs until the
 *  hunter approaches, then glides down in a fast woodland arc. */
export class NightOwl extends Enemy {
  constructor(x, y) {
    super(x, y);
    this.w = 28; this.h = 20; this.hp = 2; this.score = SCORE.owl || 200; this.touchDamage = 2;
    this.sheet = 'owl'; this.frame = 'fly1';
    this.flies = true; this.gravityScale = 0;
    this.homeY = y; this.state = 'perch'; this.t = Math.random() * 5;
  }
  wake(dir, targetY) {
    this.state = 'swoop';
    this.facing = dir;
    this.targetY = targetY;
    this.t = 0;
  }
  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); return; }
    this.flash = Math.max(0, this.flash - dt);
    const p = world.player;
    this.t += dt;
    if (this.state === 'perch') {
      this.frame = 'fly1';
      this.y = this.homeY + Math.sin(this.t * 3) * 2;
      if (p.alive && Math.abs(p.x - this.x) < 235) {
        this.wake(p.x < this.x ? -1 : 1, p.y - 34);
      }
      return;
    }
    this.x += this.facing * 148 * dt;
    const dive = Math.sin(Math.min(Math.PI, this.t * 2.2));
    this.y = this.homeY + (this.targetY - this.homeY) * dive + Math.sin(this.t * 7) * 5;
    this.frame = 'fly' + (Math.floor(this.t * 10) % 3);
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
 *  and out (untouchable while faded), then lunges with a skull-faced shriek. */
export class Phantom extends Enemy {
  constructor(x, y, dir = -1) {
    super(x, y);
    this.w = 24; this.h = 40; this.hp = 2; this.score = SCORE.ghost || 300; this.touchDamage = 2;
    this.sheet = 'ghost'; this.frame = 'float0';
    this.flies = true; this.gravityScale = 0;
    this.facing = dir; this.baseY = y; this.t = Math.random() * 6;
    this.state = 'drift'; this.stateT = 0; this.fade = 1; this.lungeCd = 1.4 + Math.random();
  }
  takeHit(dmg, fromX, world) {
    if (this.fade < 0.5) return false;          // phased out: the whip passes through
    return super.takeHit(dmg, fromX, world);
  }
  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); return; }
    this.flash = Math.max(0, this.flash - dt);
    const p = world.player;
    this.t += dt; this.stateT += dt; this.lungeCd -= dt;
    const dx = p.x - this.x, dy = (p.y - 30) - this.y;
    if (this.state === 'drift') {
      // Phase in/out on a slow cycle; home in gently on the hunter
      this.fade = 0.55 + 0.45 * Math.sin(this.t * 1.7);
      if (p.alive) {
        this.facing = dx >= 0 ? 1 : -1;
        this.x += Math.sign(dx) * Math.min(Math.abs(dx), 48 * dt);
        this.baseY += Math.sign(dy) * Math.min(Math.abs(dy), 36 * dt);
      }
      this.y = this.baseY + Math.sin(this.t * 2.4) * 10;
      this.frame = Math.floor(this.t * 3) % 2 ? 'float1' : 'float0';
      if (Math.random() < 0.3) world.particles.emit({ x: this.x - this.facing * 10, y: this.y - 6 + Math.random() * 10, vx: -this.facing * 12, vy: -8, life: 0.6, color: 'rgba(170, 220, 255, 0.5)', size: 2, gravity: 0, glow: true });
      if (p.alive && this.lungeCd <= 0 && this.fade > 0.8 && Math.abs(dx) < 200 && Math.abs(dy) < 90) {
        this.state = 'lunge'; this.stateT = 0; this.fade = 1;
        const d = Math.hypot(dx, dy) || 1;
        this.vx = (dx / d) * 250; this.vy = (dy / d) * 250;
        world.sfx('fire');
      }
    } else {
      this.frame = 'lunge'; this.fade = 1;
      this.x += this.vx * dt; this.baseY += this.vy * dt; this.y = this.baseY;
      if (this.stateT > 0.55) { this.state = 'drift'; this.stateT = 0; this.lungeCd = 2.2 * world.difficulty.throwCooldown; }
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
    this.w = 22; this.h = 16; this.hp = 1; this.score = SCORE.tome || 150; this.touchDamage = 1;
    this.sheet = 'tome'; this.frame = 'shut';
    this.flies = true; this.gravityScale = 0;
    this.state = 'shelf'; this.t = Math.random() * 4; this.homeX = x; this.homeY = y;
    this.chompT = 1.4 + Math.random() * 0.8;
  }
  wake(dir) { this.state = 'fly'; this.facing = dir; this.vx = dir * 60; this.vy = -90; this.t = 0; }
  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); this.y += 60 * dt; return; }
    this.flash = Math.max(0, this.flash - dt);
    const p = world.player;
    this.t += dt;
    const dx = p.x - this.x, dy = (p.y - 28) - this.y;
    if (this.state === 'shelf') {
      this.frame = 'shut';
      if (p.alive && Math.abs(dx) < 150 && Math.abs(dy) < 110) {
        this.wake(dx >= 0 ? 1 : -1);
        world.particles.dust(this.x, this.y, 6, '#c9b58a');
        world.sfx('candle');
      }
      return;
    }
    if (this.state === 'fly') {
      // Flap toward the hunter with a bobbing path
      this.facing = dx >= 0 ? 1 : -1;
      this.vx += Math.sign(dx) * 180 * dt; this.vy += Math.sign(dy) * 150 * dt;
      const sp = Math.hypot(this.vx, this.vy), max = 98;
      if (sp > max) { this.vx *= max / sp; this.vy *= max / sp; }
      this.x += this.vx * dt; this.y += this.vy * dt + Math.sin(this.t * 9) * 0.6;
      this.frame = Math.floor(this.t * 9) % 2 ? 'flap1' : 'flap0';
      this.chompT -= dt;
      if (this.chompT <= 0 && Math.abs(dx) < 80 && Math.abs(dy) < 50) {
        // Telegraph: snap shut and hang for a beat before the bite
        this.state = 'chomp'; this.t = 0;
        const d = Math.hypot(dx, dy) || 1;
        this.vx = (dx / d) * 210; this.vy = (dy / d) * 210;
        this.frame = 'shut';
        world.sfx('bone');
      }
    } else {
      this.frame = this.t < 0.18 ? 'chomp' : 'shut';
      this.x += this.vx * dt; this.y += this.vy * dt;
      this.vx *= 0.94; this.vy *= 0.94;
      if (this.t > 0.42) { this.state = 'fly'; this.chompT = 1.6 + Math.random() * 0.8; }
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
  constructor(x, y) {
    super(x, y);
    this.w = 28; this.h = 26; this.hp = 3; this.score = SCORE.gargoyle || 350; this.touchDamage = 3;
    this.sheet = 'gargoyle'; this.frame = 'perch';
    this.flies = true; this.gravityScale = 0;
    this.state = 'perch'; this.t = 0; this.homeX = x; this.homeY = y; this.facing = -1;
  }
  takeHit(dmg, fromX, world) {
    if (this.state === 'perch') { world.sfx('block'); world.particles.sparks(this.x, this.y - 12, 4, '#cfd8e8'); return false; }
    return super.takeHit(dmg, fromX, world);
  }
  wake(dir, targetY) { this.state = 'wake'; this.facing = dir; this.t = 0; this.targetY = targetY; }
  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); this.y += 80 * dt; return; }
    this.flash = Math.max(0, this.flash - dt);
    const p = world.player;
    this.t += dt;
    const dx = p.x - this.x, dy = (p.y - 34) - this.y;
    if (this.state === 'perch') {
      this.frame = 'perch';
      if (p.alive && Math.abs(dx) < 200 && dy > -60) this.wake(dx >= 0 ? 1 : -1, p.y - 34);
      return;
    }
    if (this.state === 'wake') {
      this.frame = 'wake';
      if (this.t === dt) world.sfx('block');
      if (this.t > 0.5) { this.state = 'swoop'; this.t = 0; this.fromY = this.y; world.particles.dust(this.x, this.y, 6, '#9a9aa8'); }
      return;
    }
    if (this.state === 'swoop') {
      // Arc down through the hunter's height and climb back up on the far side
      this.x += this.facing * 150 * dt;
      const k = Math.min(1, this.t / 1.3);
      this.y = this.fromY + (this.targetY - this.fromY) * Math.sin(k * Math.PI);
      this.frame = Math.floor(this.t * 9) % 2 ? 'fly1' : 'fly0';
      if (k >= 1) { this.state = 'hover'; this.t = 0; this.hoverY = this.y; }
    } else {
      // Hover briefly, turn to face the hunter, then dive again
      this.frame = Math.floor(this.t * 6) % 2 ? 'fly1' : 'fly0';
      this.y = this.hoverY + Math.sin(this.t * 4) * 6;
      this.x += Math.sign(dx) * 30 * dt;
      if (this.t > 0.9) { this.facing = dx >= 0 ? 1 : -1; this.state = 'swoop'; this.t = 0; this.fromY = this.y; this.targetY = p.y - 30; }
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
    this.w = 28; this.h = 24; this.hp = 3;
    this.score = SCORE.magmaslime || 300;
    this.touchDamage = 3;
    this.sheet = 'magmaslime'; this.frame = 'crawl0';
    this.minX = min; this.maxX = max; this.facing = -1;
    this.lavaImmune = true;
    this.state = 'crawl'; this.stateT = 0; this.animT = Math.random() * 4;
    this.leapCd = 1.2 + Math.random() * 0.9;
  }

  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); return; }
    this.flash = Math.max(0, this.flash - dt);
    const p = world.player;
    const dx = p.x - this.x;
    const near = p.alive && Math.abs(dx) < 280 && Math.abs(p.y - this.y) < 120;
    this.stateT += dt;
    this.leapCd = Math.max(0, this.leapCd - dt);
    if (this.knock) { this.vx = this.knock * 85; this.vy = -100; this.knock = 0; }

    if (this.state === 'crawl') {
      if (near) this.facing = dx >= 0 ? 1 : -1;
      const speed = near ? 48 : 32;
      const nextX = this.x + this.facing * speed * dt;
      const atEdge = (this.facing > 0 && nextX > this.maxX) || (this.facing < 0 && nextX < this.minX);
      if (atEdge || this.blockedAhead(level)) {
        if (!near) this.facing = -this.facing;
        this.vx = 0;
      } else {
        this.vx = this.facing * speed;
      }
      this.animT += dt * 5.5;
      this.frame = Math.floor(this.animT) % 2 ? 'crawl1' : 'crawl0';
      if (Math.random() < 0.28) world.particles.embers(this.x + (Math.random() - 0.5) * 18, this.y - 8, 1);
      if (near && this.onGround && this.leapCd <= 0 && Math.abs(dx) > 36 && Math.abs(dx) < 210) {
        this.state = 'leap';
        this.stateT = 0;
        this.facing = dx >= 0 ? 1 : -1;
        this.vx = this.facing * 155;
        this.vy = -410;
        this.onGround = false;
        world.sfx('fire');
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
        world.particles.embers(this.x, this.y - 6, 8);
      }
    } else {
      this.vx = 0;
      this.frame = 'land';
      if (this.stateT > 0.36) {
        this.state = 'crawl';
        this.stateT = 0;
        this.leapCd = (1.6 + Math.random() * 0.6) * world.difficulty.throwCooldown;
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
    this.w = 36; this.h = 68; this.hp = 8;
    this.score = SCORE.lavagolem || 550;
    this.touchDamage = 4;
    this.lavaImmune = true;
    this.sheet = 'lavagolem';
    this.walkFrames = ['walk0', 'walk1', 'walk2', 'walk1'];
    this.attackFrame = 'hurl';
    this.speed = 30;
    this.attackRange = [65, 290];
    this.attackAt = 0.44;
    this.attackDur = 1.05;
    this.attackCooldown = 2.7;
  }

  fire(world, p) {
    const mb = new Projectile('magmaball', this.x + this.facing * 20, this.y - 68, this.facing, 'enemy');
    const dist = Math.min(280, Math.max(80, Math.abs(p.x - this.x)));
    mb.vx = this.facing * (120 + dist * 0.42);
    mb.vy = -380 - dist * 0.22;
    world.spawnProjectile(mb);
    world.particles.embers(this.x + this.facing * 20, this.y - 68, 8);
    world.sfx('fire');
  }

  kill(world) {
    super.kill(world);
    world.particles.embers(this.x, this.y - 30, 18);
    world.particles.shards(this.x, this.y, 16, '#2d1818', this.y);
    world.camera.shake(3.5, 0.25);
  }
}

/** Cinder Imp: agile winged volcanic fiend (`cinderimp`) that darts above lava
 *  pools, hovers out of easy reach, and spits aimed fireballs at the hunter. */
export class CinderImp extends Enemy {
  constructor(x, y, dir = -1) {
    super(x, y);
    this.w = 24; this.h = 30; this.hp = 2;
    this.score = SCORE.cinderimp || 300;
    this.touchDamage = 3;
    this.sheet = 'cinderimp'; this.frame = 'fly0';
    this.flies = true; this.gravityScale = 0; this.lavaImmune = true;
    this.facing = dir; this.baseY = y; this.t = Math.random() * 6;
    this.state = 'hover'; this.stateT = 0; this.spitCd = 1.3 + Math.random() * 0.9;
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
        const wantX = p.x - this.facing * 125;
        this.x += Math.sign(wantX - this.x) * Math.min(Math.abs(wantX - this.x), 108 * dt);
        const wantY = p.y - 86;
        this.baseY += Math.sign(wantY - this.baseY) * Math.min(Math.abs(wantY - this.baseY), 72 * dt);
      } else {
        this.x += this.facing * 65 * dt;
      }
      this.y = this.baseY + Math.sin(this.t * 5.2) * 14;
      this.frame = Math.floor(this.t * 9) % 2 ? 'fly1' : 'fly0';
      if (near && this.spitCd <= 0 && Math.abs(dx) < 290) {
        this.state = 'spit'; this.stateT = 0; this.fired = false;
      }
    } else {
      this.frame = 'spit';
      this.y = this.baseY + Math.sin(this.t * 5.2) * 5;
      if (!this.fired && this.stateT >= 0.28) {
        this.fired = true;
        this.facing = dx >= 0 ? 1 : -1;
        const fb = new Projectile('fireball', this.x + this.facing * 16, this.y - 14, this.facing, 'enemy');
        const ang = Math.atan2((p.y - 28) - (this.y - 14), p.x - (this.x + this.facing * 16));
        fb.vx = Math.cos(ang) * 235; fb.vy = Math.sin(ang) * 235;
        fb.gravity = 0; fb.dir = fb.vx >= 0 ? 1 : -1;
        world.spawnProjectile(fb);
        world.sfx('fire');
      }
      if (this.stateT > 0.72) {
        this.state = 'hover';
        this.spitCd = (2.1 + Math.random() * 0.7) * world.difficulty.throwCooldown;
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
  constructor(x, y, min, max) {
    super(x, y);
    this.w = 28; this.h = 64; this.hp = 7;
    this.score = SCORE.armor || 450;
    this.touchDamage = 3;
    this.sheet = 'armor'; this.frame = 'walk0';
    this.minX = min; this.maxX = max; this.facing = -1;
    this.state = 'march'; this.stateT = 0; this.animT = 0;
    this.slashCd = 1.4 + Math.random() * 0.8;
  }

  takeHit(dmg, fromX, world) {
    // Shield guard halves frontal damage with a metallic clang!
    const frontal = (fromX - this.x) * this.facing > 0;
    if (this.state === 'guard' && frontal) {
      dmg = Math.max(1, Math.floor(dmg * 0.5));
      world.sfx('block');
      world.particles.sparks(this.x + this.facing * 14, this.y - 40, 6, '#ffd27a');
    }
    const died = super.takeHit(dmg, fromX, world);
    this.knock = 0;
    return died;
  }

  meleeBox() {
    if (this.state !== 'slash' || this.stateT < 0.06 || this.stateT > 0.42) return null;
    const reach = 46;
    return {
      x: this.facing > 0 ? this.x + 8 : this.x - 8 - reach,
      y: this.y - 52,
      w: reach,
      h: 34,
    };
  }

  update(dt, level, world) {
    if (this.deathT >= 0) { this.updateDeath(dt); return; }
    this.flash = Math.max(0, this.flash - dt);
    const p = world.player;
    const dx = p.x - this.x;
    const near = p.alive && Math.abs(dx) < 280 && Math.abs(p.y - this.y) < 84;
    this.stateT += dt;
    this.slashCd = Math.max(0, this.slashCd - dt);

    if (this.state === 'march') {
      if (near) this.facing = dx >= 0 ? 1 : -1;
      const speed = 38;
      const nextX = this.x + this.facing * speed * dt;
      const atEdge = (this.facing > 0 && nextX > this.maxX) || (this.facing < 0 && nextX < this.minX);
      if (atEdge || this.blockedAhead(level)) {
        if (!near) this.facing = -this.facing;
        this.vx = 0;
      } else {
        this.vx = this.facing * speed;
      }
      this.animT += Math.abs(this.vx) > 1 ? dt * 4.5 : 0;
      this.frame = Math.floor(this.animT) % 2 ? 'walk1' : 'walk0';
      if (near && this.onGround && this.slashCd <= 0 && Math.abs(dx) < 135) {
        this.state = 'guard';
        this.stateT = 0;
        this.vx = 0;
        world.sfx('block');
      }
    } else if (this.state === 'guard') {
      this.vx = 0;
      this.frame = 'guard';
      if (near) this.facing = dx >= 0 ? 1 : -1;
      if (this.stateT >= 0.42) {
        this.state = 'slash';
        this.stateT = 0;
        this.vx = this.facing * 175;
        world.sfx('whip');
        world.particles.sparks(this.x + this.facing * 24, this.y - 36, 5, '#e8eef8');
      }
    } else {
      this.frame = 'slash';
      if (this.stateT > 0.28 || this.blockedAhead(level)) this.vx *= 0.78;
      if (this.stateT > 0.62) {
        this.vx = 0;
        this.state = 'march';
        this.stateT = 0;
        this.slashCd = (1.7 + Math.random() * 0.6) * world.difficulty.throwCooldown;
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
 *  halls and crypts, unleashing a homing spectral skull when it shrieks. */
export class ShadowWraith extends Enemy {
  constructor(x, y, dir = -1) {
    super(x, y);
    this.w = 24; this.h = 46; this.hp = 3;
    this.score = SCORE.wraith || 350;
    this.touchDamage = 3;
    this.sheet = 'wraith'; this.frame = 'float0';
    this.flies = true; this.gravityScale = 0;
    this.facing = dir; this.baseY = y; this.t = Math.random() * 6;
    this.state = 'glide'; this.stateT = 0; this.shriekCd = 1.6 + Math.random();
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
        color: 'rgba(225, 60, 95, 0.45)', size: 2, gravity: 0, glow: true,
      });
    }

    if (this.state === 'glide') {
      if (near) {
        this.facing = dx >= 0 ? 1 : -1;
        const tx = p.x - this.facing * 115;
        this.x += Math.sign(tx - this.x) * Math.min(Math.abs(tx - this.x), 68 * dt);
        const ty = p.y - 26;
        this.baseY += Math.sign(ty - this.baseY) * Math.min(Math.abs(ty - this.baseY), 44 * dt);
      } else {
        this.x += this.facing * 52 * dt;
      }
      this.y = this.baseY + Math.sin(this.t * 3.1) * 16;
      this.frame = Math.floor(this.t * 4.5) % 2 ? 'float1' : 'float0';
      if (near && this.shriekCd <= 0 && Math.abs(dx) < 270) {
        this.state = 'shriek'; this.stateT = 0; this.fired = false;
      }
    } else {
      this.frame = 'shriek';
      this.y = this.baseY + Math.sin(this.t * 8) * 4;
      if (!this.fired && this.stateT >= 0.34) {
        this.fired = true;
        this.facing = dx >= 0 ? 1 : -1;
        const sk = new Projectile('skull', this.x + this.facing * 16, this.y - 28, this.facing, 'enemy');
        world.spawnProjectile(sk);
        world.particles.sparks(this.x + this.facing * 14, this.y - 28, 7, '#ff4a66');
        world.sfx('fire');
      }
      if (this.stateT > 0.85) {
        this.state = 'glide';
        this.shriekCd = (2.6 + Math.random() * 0.8) * world.difficulty.throwCooldown;
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

/** Wall-pacing spawner factory used by Spawner for float-in enemies. */
function makeFloater(type, x, y, dir, variant) {
  if (type === 'lantern') return new Pumpkin(x, y, dir, 'lantern');
  if (type === 'wisp') return new FrostWisp(x, y, dir);
  if (type === 'ghost') return new Phantom(x, y, dir);
  if (type === 'wraith') return new ShadowWraith(x, y, dir);
  if (type === 'cinderimp') return new CinderImp(x, y, dir);
  return new MedusaHead(x, y, dir);
}

/** Builds a placed enemy from a stage definition entry. */
export function createEnemy(e) {
  const cx = e.tx * TILE + TILE / 2;
  const groundY = (e.row == null ? 0 : e.row) * TILE;
  const minX = (e.min == null ? e.tx - 4 : e.min) * TILE, maxX = ((e.max == null ? e.tx + 4 : e.max) + 1) * TILE;
  switch (e.type) {
    case 'skeleton': return new Skeleton(cx, groundY, minX, maxX, e.variant);
    case 'bat': return new Bat(cx, e.ty * TILE + 16, e.variant);
    case 'catoblepas': return new Catoblepas(cx, groundY, minX, maxX);
    case 'pumpkin': return new Pumpkin(cx, groundY, -1, e.variant === 'lantern' ? 'lantern' : 'hopper');
    case 'dragon': return new Dragon(cx, e.ty * TILE + 16, minX, maxX);
    case 'icegolem': return new IceGolem(cx, groundY, minX, maxX);
    case 'snowman': return new Snowman(cx, groundY, minX, maxX);
    case 'wolf': return new BriarWolf(cx, groundY, minX, maxX);
    case 'mushroom': return new Sporecap(cx, groundY, minX, maxX);
    case 'owl': return new NightOwl(cx, e.ty * TILE + 16);
    case 'ghost': return new Phantom(cx, e.ty * TILE + 16, -1);
    case 'tome': return new CursedTome(cx, e.ty * TILE + 16);
    case 'gargoyle': return new Gargoyle(cx, e.ty * TILE + 16);
    case 'magmaslime': return new MagmaSlime(cx, groundY, minX, maxX);
    case 'lavagolem': return new LavaGolem(cx, groundY, minX, maxX);
    case 'cinderimp': return new CinderImp(cx, e.ty * TILE + 16, -1);
    case 'armor': return new PlateKnight(cx, groundY, minX, maxX);
    case 'wraith': return new ShadowWraith(cx, e.ty * TILE + 16, -1);
    default: return null;
  }
}

export class Spawner {
  constructor(def) {
    this.type = def.type;
    this.variant = def.variant || 'normal';
    this.x0 = def.x0 * TILE; this.x1 = (def.x1 + 1) * TILE;
    this.timer = 1.2;
    this.alive = [];
  }

  update(dt, world) {
    const p = world.player;
    const diff = world.difficulty;
    this.alive = this.alive.filter((e) => !e.dead);
    if (!p.alive || world.bossActive) return;
    if (p.x < this.x0 - 100 || p.x > this.x1 + 100) { this.timer = Math.min(this.timer, 1.0); return; }
    this.timer -= dt;
    if (this.timer > 0) return;
    if (this.type === 'zombie' || this.type === 'pumpkin') {
      if (this.alive.length >= diff.maxAlive) { this.timer = 0.6; return; }
      // Rise just off-screen-ish ahead or behind the hunter on real ground.
      for (let tries = 0; tries < 6; tries++) {
        const side = Math.random() < 0.7 ? p.facing : -p.facing;
        const x = p.x + side * (150 + Math.random() * 140);
        const tx = Math.floor(x / TILE);
        if (x < this.x0 || x > this.x1) continue;
        const row = world.level.surfaceRow(tx, Math.max(0, Math.floor(p.y / TILE) - 2));
        if (row < 0 || !world.level.isSolid(tx, row)) continue;
        const z = this.type === 'pumpkin'
          ? new Pumpkin(tx * TILE + TILE / 2, row * TILE, -side, 'hopper')
          : new Zombie(tx * TILE + TILE / 2, row * TILE, -side, this.variant);
        world.spawnEnemy(z);
        this.alive.push(z);
        break;
      }
      this.timer = (2.4 + Math.random() * 0.8) * diff.spawnInterval;
    } else if (this.type === 'medusa' || this.type === 'lantern' || this.type === 'wisp' || this.type === 'ghost' || this.type === 'wraith' || this.type === 'cinderimp') {
      if (this.alive.length >= diff.maxAlive) { this.timer = 0.6; return; }
      const dir = -p.facing;
      const x = p.facing > 0 ? world.camera.x + 640 + 30 : world.camera.x - 30;
      const y = p.y - (this.type === 'cinderimp' ? 76 : 30) - Math.random() * 30;
      const m = makeFloater(this.type, x, y, dir, this.variant);
      world.spawnEnemy(m);
      this.alive.push(m);
      this.timer = (this.type === 'wraith' || this.type === 'cinderimp' ? 3.2 : 2.0 + Math.random() * 0.8) * diff.spawnInterval;
    } else if (this.type === 'tome') {
      // Books tear themselves off the shelves ahead of the hunter, one at a time.
      if (this.alive.length >= Math.max(1, diff.maxAlive - 1)) { this.timer = 0.9; return; }
      for (let i = 0; i < 1; i++) {
        const side = Math.random() < 0.7 ? p.facing : -p.facing;
        const x = p.x + side * (120 + Math.random() * 120);
        if (x < this.x0 || x > this.x1) continue;
        const t = new CursedTome(x, p.y - 70 - Math.random() * 60);
        t.wake(-side);
        world.spawnEnemy(t);
        this.alive.push(t);
        world.particles.dust(t.x, t.y, 5, '#c9b58a');
      }
      world.sfx('candle');
      this.timer = (4.0 + Math.random() * 1.2) * diff.spawnInterval;
    } else if (this.type === 'gargoyle') {
      if (this.alive.length >= Math.max(1, diff.maxAlive - 1)) { this.timer = 0.9; return; }
      const side = Math.random() < 0.75 ? p.facing : -p.facing;
      const g = new Gargoyle(p.x + side * (250 + Math.random() * 90), Math.max(16, world.camera.y + 24));
      g.wake(-side, p.y - 34);
      world.spawnEnemy(g);
      this.alive.push(g);
      this.timer = (3.6 + Math.random() * 1.2) * diff.spawnInterval;
    } else if (this.type === 'bat' || this.type === 'owl') {
      // Bats and owls swoop down from the rafters/canopy ahead of the hunter.
      if (this.alive.length >= Math.max(1, diff.maxAlive - 1)) { this.timer = 0.8; return; }
      const side = Math.random() < 0.75 ? p.facing : -p.facing;
      const x = p.x + side * (260 + Math.random() * 80);
      const yTop = Math.max(16, world.camera.y + 14);
      const b = this.type === 'owl' ? new NightOwl(x, yTop) : new Bat(x, yTop, this.variant);
      b.wake(-side, p.y - 36);
      world.spawnEnemy(b);
      this.alive.push(b);
      this.timer = (3.0 + Math.random() * 1.1) * diff.spawnInterval;
    }
  }
}
