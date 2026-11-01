// The vampire hunter: movement, whip, sub-weapons, damage and death.

import { PLAYER, TILE } from '../engine/constants.js';
import { Entity } from './entities.js';
import { Projectile } from './objects.js';
import {
  heroFrame, heroScale, drawStretchedWhip, drawProceduralLash,
  walkAdvance, walkFrameCount, isStepFrame, LAND_TIME, LAND_SOFT_TIME, LAUNCH_TIME,
} from './hero_anim.js';

export class Player extends Entity {
  constructor(x, y) {
    super(x, y);
    this.w = PLAYER.width;
    this.h = PLAYER.height;
    this.maxHp = PLAYER.maxHp;
    this.hp = this.maxHp;
    this.state = 'idle';           // idle | walk | jump | crouch | attack | hurt | dead
    this.attackT = -1;             // time into the current whip
    this.attackHit = false;        // whether this whip already connected
    this.attackCrouch = false;
    this.whipReach = PLAYER.whipReach;
    this.whipTime = PLAYER.whipTime;
    this.whipActive = PLAYER.whipActive.slice();
    this.airJumpsLeft = 0;         // NIGHT WINGS relic (double jump)
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.invuln = 0;
    this.hurtT = 0;
    this.deadT = 0;
    this.animT = 0;
    this.walkFrame = 0;
    this.walkFrames = 8;           // frames in the walk cycle sheet (set from the atlas on draw)
    this.idleT = 0;                // time standing still (idle breathing loop)
    this.landT = 0;                // landing squash / recovery frames
    this.landHard = false;
    this.launchT = 0;              // take-off stretch
    this.lean = 0;                 // weight shift (shear) into acceleration / stops
    this.subWeapon = null;         // 'dagger' | 'axe' | 'holy_water'
    this.throwT = 0;
    this.throwing = false;
    this.crouching = false;
    this.petrified = 0;            // seconds left turned to stone
    this.saluteT = 0;
  }

  get alive() { return this.state !== 'dead'; }
  get attacking() { return this.attackT >= 0; }

  /** Turns the hunter to stone; mashing buttons breaks free sooner. */
  petrify(world, dur = PLAYER.petrifyTime) {
    if (this.state === 'dead') return;
    // AEGIS MIRROR relic (Ossuary): complete immunity to petrification!
    if (world && world.hasRelic && world.hasRelic('ossuary')) {
      world.sfx('pickup');
      world.particles.sparks(this.x, this.y - 30, 8, '#e8d27a');
      return;
    }
    this.petrified = dur;
    this.attackT = -1; this.throwing = false;
    this.crouching = false; this.h = PLAYER.height;
    this.vx = 0; this.hurtT = 0;
    world.sfx('block');
    world.particles.dust(this.x, this.y - 30, 8, '#9a9aa8');
  }

  /** Whip hit box in world coordinates, or null when inactive. */
  whipBox() {
    if (!this.attacking || this.throwing) return null;
    if (this.attackT < this.whipActive[0] || this.attackT > this.whipActive[1]) return null;
    const reach = this.whipReach || PLAYER.whipReach;
    const yTop = this.y - (this.attackCrouch ? 34 : 52);
    const x0 = this.facing > 0 ? this.x + 6 : this.x - 6 - reach;
    return { x: x0, y: yTop, w: reach, h: 18 };
  }

  update(dt, input, level, world) {
    if (this.state === 'dead') {
      this.deadT += dt;
      this.vx *= 0.9;
      this.physics(level, dt);
      return;
    }
    if (this.petrified > 0) {
      // Stone: no control; each button press chips away at the spell.
      this.petrified -= dt;
      if (input.anyPressed) { this.petrified -= 0.12; world.particles.dust(this.x, this.y - 30, 1, '#b8b8c4'); }
      this.invuln = Math.max(0, this.invuln - dt);
      if (this.onGround) this.vx = 0;
      this.physics(level, dt);
      if (this.petrified <= 0) {
        this.petrified = 0;
        this.invuln = Math.max(this.invuln, 0.6);
        world.sfx('block');
        world.particles.shards(this.x, this.y, 10, '#b8b8c4', this.y);
      }
      return;
    }
    const hasRelic = (k) => !!(world && world.hasRelic && world.hasRelic(k));
    this.whipReach = Math.round(PLAYER.whipReach * (hasRelic('library') ? 1.28 : 1));
    const whipScale = hasRelic('clocktower') ? 0.75 : 1;
    this.whipTime = PLAYER.whipTime * whipScale;
    this.whipActive = [PLAYER.whipActive[0] * whipScale, PLAYER.whipActive[1] * whipScale];
    if (this.onGround) this.airJumpsLeft = hasRelic('graveyard') ? 1 : 0;

    const ctl = this.hurtT <= 0;
    const axis = ctl ? input.axis : 0;
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.saluteT = Math.max(0, (this.saluteT || 0) - dt);
    this.landT = Math.max(0, this.landT - dt);
    this.launchT = Math.max(0, this.launchT - dt);
    this.coyote = this.onGround ? PLAYER.coyote : Math.max(0, this.coyote - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (ctl && input.pressed.jump) this.jumpBuffer = PLAYER.buffer;

    // Crouch (ground only), with head-room check when standing up.
    const wantCrouch = ctl && input.down.down && this.onGround && !this.attacking;
    if (wantCrouch && !this.crouching) { this.crouching = true; this.h = PLAYER.crouchHeight; }
    else if (!wantCrouch && this.crouching) {
      this.h = PLAYER.height;
      if (this.headBlocked(level)) this.h = PLAYER.crouchHeight; else this.crouching = false;
    }

    // Horizontal movement: full control on the ground, limited in the air;
    // whipping on the ground roots the hunter in place (classic commitment).
    const moveSpeed = PLAYER.speed * (hasRelic('ramparts') ? 1.15 : 1) * (1 + (world && world.relicBonus ? world.relicBonus('speed') : 0));
    const rooted = this.attacking && this.onGround;
    const target = rooted || this.crouching ? 0 : axis * moveSpeed;
    const accel = this.onGround ? PLAYER.accel : PLAYER.airAccel;
    if (this.hurtT > 0) {
      // Knockback: keep the launch velocity, only friction on the ground.
      if (this.onGround) this.vx *= 0.9;
    } else if (this.vx < target) this.vx = Math.min(target, this.vx + accel * dt);
    else if (this.vx > target) this.vx = Math.max(target, this.vx - accel * dt);
    if (axis !== 0 && !rooted && !this.attacking) this.facing = axis;
    // Weight shift: lean into acceleration, back into a stop (skid); snaps in, eases out.
    const wantLean = this.onGround && this.hurtT <= 0 && !this.attacking
      ? Math.max(-1, Math.min(1, (target - this.vx) / moveSpeed)) * 0.06 : 0;
    this.lean += (wantLean - this.lean) * Math.min(1, (Math.abs(wantLean) > Math.abs(this.lean) ? 30 : 9) * dt);

    // Jump (coyote + buffer), variable height; down+jump drops through safe one-way ledges.
    if (ctl && this.jumpBuffer > 0 && this.coyote > 0 && !this.crouching) {
      this.vy = -PLAYER.jump; this.coyote = 0; this.jumpBuffer = 0;
      this.onGround = false; this.riding = null;
      this.airJumpsLeft = hasRelic('graveyard') ? 1 : 0;
      this.launchT = LAUNCH_TIME; this.landT = 0;
      world.sfx('jump');
      world.particles.dust(this.x, this.y, 4);
    } else if (ctl && input.pressed.jump && !this.onGround && this.coyote <= 0 && this.airJumpsLeft > 0) {
      // NIGHT WINGS relic (Graveyard): mid-air double jump on shadowy bat wings!
      this.airJumpsLeft--;
      this.vy = -PLAYER.jump * 0.94;
      this.jumpBuffer = 0;
      this.dropThrough = false;
      this.launchT = LAUNCH_TIME;
      world.sfx('jump');
      world.particles.sparks(this.x, this.y - 14, 9, '#b48cff');
      world.particles.smoke(this.x, this.y - 10, 3, 'rgba(130, 80, 220, 0.45)');
    }
    if (ctl && this.crouching && input.pressed.jump) {
      if (this.canDropThrough(level)) {
        // Drop through a one-way ledge (or safe mover with a floor below).
        this.dropThrough = true; this.dropFromY = this.y;
        this.y += 1; this.onGround = false; this.riding = null;
        this.jumpBuffer = 0; this.coyote = 0;
      } else {
        // Over a chasm/spikes or on solid stone: uncrouch (if clear) and jump instead of falling!
        this.h = PLAYER.height;
        if (this.headBlocked(level)) {
          this.h = PLAYER.crouchHeight;
        } else {
          this.crouching = false;
          this.vy = -PLAYER.jump; this.coyote = 0; this.jumpBuffer = 0;
          this.onGround = false; this.riding = null;
          this.launchT = LAUNCH_TIME; this.landT = 0;
          world.sfx('jump');
          world.particles.dust(this.x, this.y, 4);
        }
      }
    }
    if (this.dropThrough && ((this.dropFromY != null && this.y > this.dropFromY + 14) || this.vy > 90 || this.onGround)) {
      this.dropThrough = false;
      this.dropFromY = null;
    }
    if (input.released.jump && this.vy < 0) this.vy *= PLAYER.jumpCut;

    // Attack / sub-weapon
    if (ctl && input.pressed.attack && !this.attacking && this.throwT <= 0) {
      if (input.down.up && this.subWeapon && world.hearts > 0) {
        world.throwSubWeapon(this);
        this.throwT = 0.35;
        this.attackT = 0; this.attackCrouch = false; this.attackHit = false;
        this.throwing = true;
      } else {
        this.attackT = 0; this.attackHit = false; this.throwing = false;
        this.attackCrouch = this.crouching;
        world.sfx('whip');
        // CRIMSON MANTLE relic (Throne): whip unleashes a piercing crimson flame wave!
        if (hasRelic('throne')) {
          const waveY = this.y - (this.attackCrouch ? 25 : 42);
          const waveX = this.x + this.facing * 24;
          world.spawnProjectile(new Projectile('crimson_wave', waveX, waveY, this.facing, 'player'));
          if (world.onPlayerProjectile) world.onPlayerProjectile('crimson_wave', waveX, waveY, this.facing);
        }
      }
    }
    this.throwT = Math.max(0, this.throwT - dt);
    if (this.attacking) {
      this.attackT += dt;
      if (!this.throwing && hasRelic('jack') && this.attackT >= this.whipActive[0] && this.attackT <= this.whipActive[1] && Math.random() < 0.65) {
        const tipX = this.x + this.facing * (12 + Math.random() * this.whipReach);
        const tipY = this.y - (this.attackCrouch ? 28 : 44);
        world.particles.embers(tipX, tipY, 1);
      }
      if (this.attackT >= this.whipTime) { this.attackT = -1; this.throwing = false; }
    }

    const wasGround = this.onGround;
    const prevVy = this.vy;
    this.physics(level, dt);
    if (!wasGround && this.onGround) {
      // Touchdown: squash + recovery frames, dust and a thud when it was a real fall.
      this.landHard = prevVy > 250;
      this.landT = this.landHard ? LAND_TIME : LAND_SOFT_TIME;
      this.launchT = 0;
      if (this.landHard) { world.sfx('land'); world.particles.dust(this.x, this.y, 5); }
    }

    // Animation state
    if (this.hurtT > 0) this.state = 'hurt';
    else if (this.attacking) this.state = 'attack';
    else if (!this.onGround) this.state = 'jump';
    else if (this.crouching) this.state = 'crouch';
    else if (Math.abs(this.vx) > 10) this.state = 'walk';
    else this.state = 'idle';
    if (this.state === 'walk') {
      // Stride advanced by distance travelled (one frame per ~9.5 px, with a floor
      // so slow acceleration frames still read as steps) so the planted boot never
      // slides; the boot-contact frames fire a footstep and a puff of dust.
      this.animT += walkAdvance(this.vx, dt);
      const frame = Math.floor(this.animT) % this.walkFrames;
      if (frame !== this.walkFrame && isStepFrame(frame, this.walkFrames)) {
        world.sfx('step');
        world.particles.dust(this.x - this.facing * 5, this.y, 1);
      }
      this.walkFrame = frame;
    } else { this.animT = 0; this.walkFrame = 0; }
    this.idleT = this.state === 'idle' ? this.idleT + dt : 0;
  }

  headBlocked(level) {
    const ty = Math.floor(this.top / TILE);
    const tx0 = Math.floor(this.left / TILE), tx1 = Math.floor((this.right - 0.01) / TILE);
    for (let tx = tx0; tx <= tx1; tx++) if (level.isSolid(tx, ty)) return true;
    return false;
  }

  /** True only when down+jump has a safe landing below (never drops through ferries over pits/spikes). */
  canDropThrough(level) {
    if (this.riding) {
      return level.findDropSurfaceY(this.x, this.y + 4, 150) != null;
    }
    const ty = Math.floor((this.bottom + 0.5) / TILE);
    const tx0 = Math.floor(this.left / TILE), tx1 = Math.floor((this.right - 0.01) / TILE);
    let hasOneWay = false;
    for (let tx = tx0; tx <= tx1; tx++) {
      if (level.isSolid(tx, ty)) return false;
      if (level.isOneWay(tx, ty)) hasOneWay = true;
    }
    return hasOneWay;
  }

  /** Applies damage (scaled by difficulty) with knockback; returns true if it connected. */
  hurt(amount, fromX, world) {
    if (this.invuln > 0 || this.state === 'dead') return false;
    const hasRelic = (k) => !!(world && world.hasRelic && world.hasRelic(k));
    const relicRed = hasRelic('ossuary') ? 0.85 : 1;
    amount = Math.max(1, Math.round(amount * world.difficulty.damageTaken * relicRed));
    this.hp -= amount;
    this.petrified = 0;            // a blow shatters the stone shell
    world.sfx('hurt');
    world.camera.shake(3, 0.2);
    if (world.onPlayerHurt) world.onPlayerHurt(amount);
    if (this.hp <= 0) { this.hp = 0; this.die(world); return true; }
    const d = world.difficulty;
    this.invuln = PLAYER.invuln * (d.invulnMul || 1) * (hasRelic('yule') ? 1.45 : 1) * (1 + (world.relicBonus ? world.relicBonus('invuln') : 0));
    this.hurtT = PLAYER.hurtTime;
    this.attackT = -1;
    this.crouching = false; this.h = PLAYER.height;
    const dir = fromX > this.x ? -1 : 1;
    const kb = (d.knockbackMul == null ? 1 : d.knockbackMul) * (hasRelic('yule') ? 0.5 : 1);
    this.vx = dir * 150 * kb;
    this.vy = -230 * kb;
    this.onGround = false;
    return true;
  }

  die(world) {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.deadT = 0;
    this.attackT = -1;
    this.vx = -this.facing * 60;
    this.vy = -320;
    this.h = PLAYER.height;
    world.onPlayerDeath();
  }

  /** Sheet + frame to draw right now (shared with the network hunters). */
  frame(assets) { return heroFrame(assets, this); }

  /** Squash / stretch and lean about the feet, or null when standing plainly. */
  spriteXf() {
    const sc = heroScale(this);
    const skew = Math.abs(this.lean) > 0.004 ? this.lean : 0;
    if (!sc && !skew) return null;
    return { sx: sc ? sc.sx : 1, sy: sc ? sc.sy : 1, skew };
  }

  draw(ctx, assets, camX, camY) {
    this.walkFrames = walkFrameCount(assets);
    const blink = this.invuln > 0 && this.state !== 'dead' && Math.floor(this.invuln * 18) % 2 === 0;
    const fr = heroFrame(assets, this);
    const flip = this.facing < 0;
    const x = this.x - camX, y = this.y - camY;
    let alpha = this.state === 'dead' ? Math.max(0, 1 - Math.max(0, this.deadT - 1.2) / 0.6) : 1;
    if (blink) alpha *= 0.3;
    if (this.state === 'dead' && fr.sheet === 'hero' && this.deadT > 0.4) {
      // Classic collapse (no death clip): the hurt frame rotated toward the ground.
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(Math.round(x), Math.round(y));
      const k = Math.min(1, (this.deadT - 0.4) / 0.5);
      ctx.rotate(-this.facing * k * Math.PI / 2);
      assets.draw(ctx, 'hero', 'hurt', 0, 0, flip);
      ctx.restore();
      return;
    }
    if (this.petrified > 0) {
      // Stone statue: grey tint, trembling just before it breaks.
      const jx = this.petrified < 0.35 ? Math.round(Math.sin(this.petrified * 80) * 1.5) : 0;
      const still = this.state === 'attack' || this.state === 'walk' ? { sheet: 'hero', name: 'idle' } : fr;
      assets.draw(ctx, still.sheet, still.name, x + jx, y, flip, 1, 1, 'rgba(150, 150, 165, 0.82)');
      return;
    }
    if (fr.proceduralLash) {
      // Crouching whip without a clip: crouch pose plus the drawn low lash.
      assets.draw(ctx, fr.sheet, fr.name, x, y, flip, alpha);
      drawProceduralLash(ctx, x, y, this.facing, this.attackT, this.whipActive[0], this.whipReach);
      return;
    }
    if (fr.stretch) {
      drawStretchedWhip(ctx, assets, fr.sheet, fr.name, x, y, flip, alpha, this.whipReach);
      return;
    }
    assets.draw(ctx, fr.sheet, fr.name, x, y, flip, alpha, 1, null, this.spriteXf());
  }
}
