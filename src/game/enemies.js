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
    if (this.type === 'zombie') {
      if (this.alive.length >= diff.maxAlive) { this.timer = 0.6; return; }
      // Rise just off-screen-ish ahead or behind the hunter on real ground.
      for (let tries = 0; tries < 6; tries++) {
        const side = Math.random() < 0.7 ? p.facing : -p.facing;
        const x = p.x + side * (150 + Math.random() * 140);
        const tx = Math.floor(x / TILE);
        if (x < this.x0 || x > this.x1) continue;
        const row = world.level.surfaceRow(tx, Math.max(0, Math.floor(p.y / TILE) - 2));
        if (row < 0 || !world.level.isSolid(tx, row)) continue;
        const z = new Zombie(tx * TILE + TILE / 2, row * TILE, -side, this.variant);
        world.spawnEnemy(z);
        this.alive.push(z);
        break;
      }
      this.timer = (2.4 + Math.random() * 0.8) * diff.spawnInterval;
    } else if (this.type === 'medusa') {
      if (this.alive.length >= diff.maxAlive) { this.timer = 0.6; return; }
      const dir = -p.facing;
      const x = p.facing > 0 ? world.camera.x + 640 + 30 : world.camera.x - 30;
      const y = p.y - 30 - Math.random() * 30;
      const m = new MedusaHead(x, y, dir);
      world.spawnEnemy(m);
      this.alive.push(m);
      this.timer = (2.0 + Math.random() * 0.8) * diff.spawnInterval;
    } else if (this.type === 'bat') {
      // Bats drop from the rafters ahead of the hunter, already swooping.
      if (this.alive.length >= Math.max(1, diff.maxAlive - 1)) { this.timer = 0.8; return; }
      const side = Math.random() < 0.75 ? p.facing : -p.facing;
      const x = p.x + side * (260 + Math.random() * 80);
      const b = new Bat(x, Math.max(16, world.camera.y + 10), this.variant);
      b.wake(-side, p.y - 40);
      world.spawnEnemy(b);
      this.alive.push(b);
      this.timer = (3.2 + Math.random() * 1.2) * diff.spawnInterval;
    }
  }
}
