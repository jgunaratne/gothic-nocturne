// The vampire hunter: movement, whip, sub-weapons, damage and death.

import { PLAYER, TILE } from '../engine/constants.js';
import { Entity } from './entities.js';

export class Player extends Entity {
  constructor(x, y) {
    super(x, y);
    this.w = PLAYER.width;
    this.h = PLAYER.height;
    this.hp = PLAYER.maxHp;
    this.state = 'idle';           // idle | walk | jump | crouch | attack | hurt | dead
    this.attackT = -1;             // time into the current whip
    this.attackHit = false;        // whether this whip already connected
    this.attackCrouch = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.invuln = 0;
    this.hurtT = 0;
    this.deadT = 0;
    this.animT = 0;
    this.walkFrame = 0;
    this.subWeapon = null;         // 'dagger' | 'axe' | 'holy_water'
    this.throwT = 0;
    this.throwing = false;
    this.crouching = false;
    this.petrified = 0;            // seconds left turned to stone
  }

  get alive() { return this.state !== 'dead'; }
  get attacking() { return this.attackT >= 0; }

  /** Turns the hunter to stone; mashing buttons breaks free sooner. */
  petrify(world, dur = PLAYER.petrifyTime) {
    if (this.state === 'dead') return;
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
    if (this.attackT < PLAYER.whipActive[0] || this.attackT > PLAYER.whipActive[1]) return null;
    const reach = PLAYER.whipReach;
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
    const ctl = this.hurtT <= 0;
    const axis = ctl ? input.axis : 0;
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
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
    const rooted = this.attacking && this.onGround;
    const target = rooted || this.crouching ? 0 : axis * PLAYER.speed;
    const accel = this.onGround ? PLAYER.accel : PLAYER.airAccel;
    if (this.hurtT > 0) {
      // Knockback: keep the launch velocity, only friction on the ground.
      if (this.onGround) this.vx *= 0.9;
    } else if (this.vx < target) this.vx = Math.min(target, this.vx + accel * dt);
    else if (this.vx > target) this.vx = Math.max(target, this.vx - accel * dt);
    if (axis !== 0 && !rooted && !this.attacking) this.facing = axis;

    // Jump (coyote + buffer), variable height; down+jump drops through safe one-way ledges.
    if (ctl && this.jumpBuffer > 0 && this.coyote > 0 && !this.crouching) {
      this.vy = -PLAYER.jump; this.coyote = 0; this.jumpBuffer = 0;
      this.onGround = false; this.riding = null;
      world.sfx('jump');
      world.particles.dust(this.x, this.y, 4);
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
      }
    }
    this.throwT = Math.max(0, this.throwT - dt);
    if (this.attacking) {
      this.attackT += dt;
      if (this.attackT >= PLAYER.whipTime) { this.attackT = -1; this.throwing = false; }
    }

    const wasGround = this.onGround;
    const prevVy = this.vy;
    this.physics(level, dt);
    if (!wasGround && this.onGround && prevVy > 250) { world.sfx('land'); world.particles.dust(this.x, this.y, 5); }

    // Animation state
    if (this.hurtT > 0) this.state = 'hurt';
    else if (this.attacking) this.state = 'attack';
    else if (!this.onGround) this.state = 'jump';
    else if (this.crouching) this.state = 'crouch';
    else if (Math.abs(this.vx) > 10) this.state = 'walk';
    else this.state = 'idle';
    if (this.state === 'walk') {
      // 8-frame alternating walk cycle (hero_walk sheet). The cycle advances with
      // distance travelled (one frame per ~8 px) so the feet never slide, with a
      // floor so slow acceleration frames still read as steps.
      // Classic 6-frame whip-hero stride: wide deliberate steps, ~12 fps at full
      // speed, advanced by distance travelled (one frame per ~10 px) so the planted
      // boot never slides.
      this.animT += Math.max(6, Math.abs(this.vx) / 10) * dt;
      this.walkFrame = Math.floor(this.animT) % 6;
    } else this.animT = 0;
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
    amount = Math.max(1, Math.round(amount * world.difficulty.damageTaken));
    this.hp -= amount;
    this.petrified = 0;            // a blow shatters the stone shell
    world.sfx('hurt');
    world.camera.shake(3, 0.2);
    if (world.onPlayerHurt) world.onPlayerHurt(amount);
    if (this.hp <= 0) { this.hp = 0; this.die(world); return true; }
    const d = world.difficulty;
    this.invuln = PLAYER.invuln * (d.invulnMul || 1);
    this.hurtT = PLAYER.hurtTime;
    this.attackT = -1;
    this.crouching = false; this.h = PLAYER.height;
    const dir = fromX > this.x ? -1 : 1;
    const kb = d.knockbackMul == null ? 1 : d.knockbackMul;
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

  frameName() {
    switch (this.state) {
      case 'walk': return 'walk' + this.walkFrame;
      case 'jump': return 'jump';
      case 'crouch': return 'crouch';
      case 'attack': return this.throwing ? 'whip1' : (this.attackT < PLAYER.whipActive[0] ? 'whip0' : 'whip1');
      case 'hurt': case 'dead': return 'hurt';
      default: return 'idle';
    }
  }

  draw(ctx, assets, camX, camY) {
    const blink = this.invuln > 0 && this.state !== 'dead' && Math.floor(this.invuln * 18) % 2 === 0;
    const name = this.frameName();
    let alpha = this.state === 'dead' ? Math.max(0, 1 - Math.max(0, this.deadT - 1.2) / 0.6) : 1;
    if (blink) alpha *= 0.3;
    if (this.state === 'dead' && this.deadT > 0.4) {
      // Collapse: draw the hurt frame rotated toward the ground.
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(Math.round(this.x - camX), Math.round(this.y - camY));
      const k = Math.min(1, (this.deadT - 0.4) / 0.5);
      ctx.rotate(-this.facing * k * Math.PI / 2);
      assets.draw(ctx, 'hero', 'hurt', 0, 0, this.facing < 0);
      ctx.restore();
      return;
    }
    if (this.state === 'attack' && this.attackCrouch && !this.throwing) {
      // Crouching whip: crouch pose plus a procedural low whip lash.
      assets.draw(ctx, 'hero', 'crouch', this.x - camX, this.y - camY, this.facing < 0, alpha);
      if (this.attackT >= PLAYER.whipActive[0] - 0.03) {
        const sx = Math.round(this.x - camX + this.facing * 8), sy = Math.round(this.y - camY - 30);
        const k = Math.min(1, (this.attackT - PLAYER.whipActive[0] + 0.03) / 0.08);
        const len = PLAYER.whipReach * k;
        ctx.save();
        ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(sx + this.facing * len * 0.5, sy + 4, sx + this.facing * len, sy - 1);
        ctx.stroke();
        ctx.fillStyle = '#e8e2c8';
        ctx.fillRect(Math.round(sx + this.facing * len) - 1, sy - 2, 3, 3);
        ctx.restore();
      }
      return;
    }
    if (this.petrified > 0) {
      // Stone statue: grey tint, trembling just before it breaks.
      const jx = this.petrified < 0.35 ? Math.round(Math.sin(this.petrified * 80) * 1.5) : 0;
      assets.draw(ctx, 'hero', (name === 'whip0' || name === 'whip1' || name.startsWith('walk')) ? 'idle' : name, this.x - camX + jx, this.y - camY, this.facing < 0, 1, 1, 'rgba(150, 150, 165, 0.82)');
      return;
    }
    if (this.state === 'attack' && !this.attackCrouch && !this.throwing && name === 'whip1') {
      this.drawWhipStrike(ctx, assets, this.x - camX, this.y - camY, this.facing < 0, alpha);
      return;
    }
    const sheet = this.state === 'walk' && assets.info('hero_walk') ? 'hero_walk' : 'hero';
    assets.draw(ctx, sheet, sheet === 'hero' && name.startsWith('walk') ? 'walk' + (this.walkFrame % 6) : name, this.x - camX, this.y - camY, this.facing < 0, alpha);
  }

  /**
   * The strike frame's painted whip is stretched to PLAYER.whipReach: the
   * body and the knotted tip stay 1:1, the straight lash between them is
   * scaled horizontally (a 2px line stays crisp with smoothing off).
   */
  drawWhipStrike(ctx, assets, x, y, flip, alpha) {
    const f = assets.frame('hero', 'whip1');
    if (!f) return;
    const img = assets.img('hero');
    const bodyW = 34, tipW = 6, midW = f.w - bodyW - tipW;
    const total = Math.round(f.ax + PLAYER.whipReach + 10);   // anchor -> tip end
    const midDest = Math.max(midW, total - bodyW - tipW);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(Math.round(x), Math.round(y - f.ay));
    if (flip) ctx.scale(-1, 1);
    const ox = Math.round(-f.ax);
    ctx.drawImage(img, f.x, f.y, bodyW, f.h, ox, 0, bodyW, f.h);
    ctx.drawImage(img, f.x + bodyW, f.y, midW, f.h, ox + bodyW, 0, midDest, f.h);
    ctx.drawImage(img, f.x + bodyW + midW, f.y, tipW, f.h, ox + bodyW + midDest, 0, tipW, f.h);
    ctx.restore();
  }
}
