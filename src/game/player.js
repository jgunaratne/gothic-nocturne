// The vampire hunter: movement, ambidextrous dual-hand equipment matrix,
// 30-frame fighting-game command skills, cross-hand resonance, sub-weapons, damage & death.

import { PLAYER, TILE } from '../engine/constants.js';
import { Entity } from './entities.js';
import { Projectile } from './objects.js';
import { getFxLayers } from '../engine/fxlayers.js';
import {
  heroFrame, heroScale, drawWhipFrame, lashTip, fidgetLength,
  walkAdvance, walkFrameCount, isStepFrame,
  LAND_TIME, LAND_SOFT_TIME, LAUNCH_TIME, TURN_TIME, CROUCH_BLEND, FIDGET_AFTER, RUN_PX_PER_FRAME,
} from './hero_anim.js';
import {
  WEAPONS, ELEMENT_META, SET_RESONANCES, InputBuffer,
  computeStrengthBreakdown, computeWeaponHit, drawWeaponAction,
} from './weapons.js';

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
    this.fidgetLen = 0;            // seconds of the idle fidget clip (set from the atlas on draw)
    this.idleT = 0;                // time standing still (idle breathing loop)
    this.landT = 0;                // landing squash / recovery frames
    this.landHard = false;
    this.launchT = 0;              // take-off stretch
    this.lean = 0;                 // weight shift (shear) into acceleration / stops
    this.turnT = 0;                // skid frame after a direction change
    this.crouchBlendT = 0;         // half-crouch in-between on the way down / up
    this.fidgetT = -1;             // time into the idle fidget clip (< 0: not fidgeting)
    this.subWeapon = null;         // 'dagger' | 'axe' | 'holy_water'
    this.throwT = 0;
    this.throwing = false;
    this.crouching = false;
    this.petrified = 0;            // seconds left turned to stone
    this.saluteT = 0;
    this.dashT = 0;                // (legacy) dash burst timer, always 0 now that double-tap sprints
    this.dashDir = 0;
    this.dashCd = 0;
    this.dashTapDir = 0;           // last tapped horizontal direction (double-tap detection)
    this.dashTapT = 0;             // seconds since that tap (counts down)
    this.dashTrail = [];           // (legacy) afterimage ghosts, unused by the run
    this.runT = 0;                 // seconds spent in the current double-tap sprint (0 = not running)
    this.runDir = 0;               // sprint direction (+1 / -1)
    this.runDist = 0;              // distance covered this sprint (drives the run-cycle frame)
    this.runFrame = 0;

    // Ambidextrous Dual-Hand Equipment Matrix (`slots[0]` = Hand_L, `slots[1]` = Hand_R)
    this.inputBuffer = new InputBuffer(30);
    this.slots = [this._emptySlot(0), this._emptySlot(1)];
    this.resonanceCd = 0;
    this.resonanceWardT = 0;
    this.resonanceWardColor = null;
    this.skillBanner = null;       // { text, color, t, dur }
  }

  _emptySlot(slot) {
    return {
      slot,
      active: false,
      weapon: null,
      timer: 0,
      duration: 0,
      win0: 0,
      win1: 0,
      reach: 0,
      crouch: false,
      isSkill: false,
      guarding: false,
      firedProj: false,
      hitEnemies: new Map(),
      hitCandles: false,
      hitBlocks: false,
    };
  }

  _clearSlots() {
    this.slots[0] = this._emptySlot(0);
    this.slots[1] = this._emptySlot(1);
    this.attackT = -1;
    this.throwing = false;
  }

  /** Returns active shield slot state if either hand is currently guarding. */
  activeShieldSlot() {
    for (const s of this.slots) {
      if (s.active && s.guarding && s.weapon && s.weapon.category === 'shield') return s;
    }
    return null;
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
    this._clearSlots();
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

  /**
   * Returns all currently live melee weapon hitboxes across Hand_L (`slots[0]`)
   * and Hand_R (`slots[1]`). Both hands can overlap or interrupt in parallel!
   */
  activeWeaponStrikes() {
    const out = [];
    for (const s of this.slots) {
      if (!s.active || !s.weapon) continue;
      const w = s.weapon;
      if (w.category === 'boomerang' || w.category === 'catalyst') continue;
      if (s.timer < s.win0 || s.timer > s.win1) continue;

      const reach = s.reach || w.reach || 56;
      const f = this.facing;
      let box = null;
      switch (w.category) {
        case 'whip': {
          const yTop = this.y - (s.crouch ? 34 : 52);
          box = { x: f > 0 ? this.x + 6 : this.x - 6 - reach, y: yTop, w: reach, h: 18 };
          break;
        }
        case 'light_blade': {
          // Crisp linear forward thrust at chest/shoulder height
          const yTop = this.y - (s.crouch ? 30 : 45);
          box = { x: f > 0 ? this.x + 4 : this.x - 4 - reach, y: yTop, w: reach, h: 16 };
          break;
        }
        case 'standard_blade': {
          // Forward overhead-to-waist arc
          const yTop = this.y - (s.crouch ? 44 : 62);
          box = { x: f > 0 ? this.x - 4 : this.x + 4 - reach, y: yTop, w: reach + 4, h: 44 };
          break;
        }
        case 'heavy_blade': {
          // Massive 180-degree sweeping cleave covering behind-overhead to floor-front!
          const backSpan = 22;
          box = {
            x: f > 0 ? this.x - backSpan : this.x + backSpan - (reach + backSpan),
            y: this.y - 78,
            w: reach + backSpan,
            h: 78,
          };
          break;
        }
        case 'brawler': {
          // Tight horizontal multi-hit strike zone
          const yTop = this.y - (s.crouch ? 32 : 46);
          box = { x: f > 0 ? this.x + 2 : this.x - 2 - reach, y: yTop, w: reach, h: 24 };
          break;
        }
        case 'shield': {
          // Short blunt shield-bash impact zone
          const yTop = this.y - (s.crouch ? 32 : 46);
          box = { x: f > 0 ? this.x + 2 : this.x - 2 - reach, y: yTop, w: reach, h: 28 };
          break;
        }
        default:
          break;
      }
      if (box) out.push({ slotState: s, weapon: w, box });
    }
    return out;
  }

  update(dt, input, level, world) {
    if (this.state === 'dead') {
      this.wantStairCatch = false;
      this.deadT += dt;
      this.vx *= 0.9;
      this.physics(level, dt);
      return;
    }
    if (this.petrified > 0) {
      // Stone: no control; each button press chips away at the spell.
      this.wantStairCatch = false;
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
    this.wantStairCatch = !!(ctl && input.down.up && !input.down.down);
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.saluteT = Math.max(0, (this.saluteT || 0) - dt);
    this.resonanceCd = Math.max(0, this.resonanceCd - dt);
    this.resonanceWardT = Math.max(0, this.resonanceWardT - dt);
    if (this.skillBanner) {
      this.skillBanner.t -= dt;
      if (this.skillBanner.t <= 0) this.skillBanner = null;
    }
    this.landT = Math.max(0, this.landT - dt);
    this.launchT = Math.max(0, this.launchT - dt);
    this.coyote = this.onGround ? PLAYER.coyote : Math.max(0, this.coyote - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (ctl && input.pressed.jump) this.jumpBuffer = PLAYER.buffer;

    // -----------------------------------------------------------------------
    // Double-tap forward RUN: two taps of the same direction within RUN_TAP_WINDOW
    // break into a sustained sprint (RUN_SPEED) for as long as that direction is held,
    // opening with a short launch burst, dust & a whoosh.
    // -----------------------------------------------------------------------
    this.dashTapT = Math.max(0, this.dashTapT - dt);
    if (this.dashTapT <= 0) this.dashTapDir = 0;
    if (ctl) {
      const tap = input.pressed.right ? 1 : input.pressed.left ? -1 : 0;
      if (tap !== 0) {
        const canRun = this.runT <= 0 && this.onGround && !this.onStair
          && !this.attacking && !this.throwing && this.hurtT <= 0 && !this.crouching
          && !this.slots.some((s) => s.active && !s.guarding);
        if (tap === this.dashTapDir && this.dashTapT > 0 && canRun) {
          this.runT = 0.0001;
          this.runDir = tap;
          this.runDist = 0;
          this.dashTapDir = 0; this.dashTapT = 0;
          this.facing = tap;
          this.turnT = 0;
          world.sfx('dash');
          world.particles.dust(this.x - tap * 8, this.y, 6);
          if (world.camera && world.camera.shake) world.camera.shake(1.2, 0.07);
        } else {
          this.dashTapDir = tap;
          this.dashTapT = PLAYER.runTapWindow;
        }
      }
    }
    if (this.runT > 0) {
      const holding = ctl && ((this.runDir > 0 && input.down.right && !input.down.left) || (this.runDir < 0 && input.down.left && !input.down.right));
      const blocked = this.hurtT > 0 || this.crouching || this.onStair || this.attacking || this.throwing
        || this.slots.some((s) => s.active && !s.guarding && s.weapon && s.weapon.category !== 'light_blade');
      if (!holding || blocked) this.runT = 0;
      else this.runT += dt;
    }
    const running = this.runT > 0;
    // Legacy dash-burst fields kept at rest (afterimage trail no longer used by the run).
    this.dashT = 0;
    if (this.dashTrail.length) this.dashTrail.length = 0;

    // Record directional frame into 30-frame fighting-game Input Buffer Queue
    if (ctl) this.inputBuffer.record(input, this.facing);

    const wL = (world && world.getHandWeapon ? world.getHandWeapon(0) : null) || WEAPONS.hunters_lash;
    const wR = (wL && wL.isTwoHanded) ? null : (world && world.getHandWeapon ? world.getHandWeapon(1) : null);
    this.noWhip = !!(wL && wL.category !== 'whip');

    // Check active movement constraints across both hands:
    // - Heavy Blade (2H) & Whip root grounded movement during swing
    // - Light Blade, Boomerang, Catalyst allow 100% full movement
    // - Standard Blade allows free jump & forward combat step
    // - Shield slows walk slightly while held in active guard
    const isRootingSlot = (s) => s.active && s.weapon && (s.weapon.category === 'heavy_blade' || s.weapon.category === 'whip');
    const anyBlockingCrouch = this.attacking || this.slots.some((s) => s.active && !s.guarding && s.weapon && s.weapon.category === 'heavy_blade');
    const guardSlot = this.activeShieldSlot();
    const speedScale = guardSlot ? 0.72 : 1.0;
    const relicSpeedMul = Math.min(
      1.16,
      (hasRelic('ramparts') ? 1.08 : 1) * (1 + (world && world.relicBonus ? world.relicBonus('speed') : 0)),
    );
    const moveSpeed = PLAYER.speed * speedScale * relicSpeedMul;
    const rooted = this.onGround && (this.throwing || isRootingSlot(this.slots[0]) || isRootingSlot(this.slots[1]));

    // -----------------------------------------------------------------------
    // Walkable Staircase Engagement (Bottom `Up` climb & Top `Down` / open-balcony descent)
    // -----------------------------------------------------------------------
    let stairIntentAxis = 0;
    let suppressCrouchForStair = false;
    if (ctl && !rooted && this.onGround && !this.onStair && !this.dropThrough && level) {
      if (input.down.up && !input.down.down && level.findBottomStair) {
        const bs = level.findBottomStair(this.x, this.y, 26, 16);
        if (bs && (axis === 0 || axis === bs.ascDir)) {
          stairIntentAxis = bs.ascDir;
          if ((this.x + bs.ascDir * moveSpeed * dt - bs.botX) * bs.ascDir > 0) {
            this.onStair = bs;
            this.riding = null;
          }
        }
      }
      if (!this.onStair && level.findTopStair) {
        const ts = level.findTopStair(this.x, this.y, 26, 14);
        if (ts) {
          const downDir = -ts.ascDir;
          if (input.down.down && !input.down.up && (axis === 0 || axis === downDir)) {
            suppressCrouchForStair = true;
            stairIntentAxis = downDir;
            if ((this.x + downDir * moveSpeed * dt - ts.topX) * downDir > 0) {
              this.onStair = ts;
              this.riding = null;
            }
          } else if (ts.passThrough && axis === downDir && !input.down.up) {
            const beyondCol = ts.ascDir > 0
              ? Math.floor((ts.topX - 4) / TILE)
              : Math.floor((ts.topX + 4) / TILE);
            const topRow = Math.round(ts.topY / TILE);
            if (!level.isStandable(beyondCol, topRow) && (this.x + downDir * moveSpeed * dt - ts.topX) * downDir > 0) {
              this.onStair = ts;
              this.riding = null;
            }
          }
        }
      }
    }

    // Crouch (ground only, suppressed on stairs), with head-room check when standing up.
    const wantCrouch = ctl && input.down.down && this.onGround && !this.onStair && !suppressCrouchForStair && !anyBlockingCrouch;
    if (wantCrouch && !this.crouching) { this.crouching = true; this.h = PLAYER.crouchHeight; this.crouchBlendT = CROUCH_BLEND; }
    else if (!wantCrouch && this.crouching) {
      this.h = PLAYER.height;
      if (this.headBlocked(level)) this.h = PLAYER.crouchHeight;
      else { this.crouching = false; this.crouchBlendT = CROUCH_BLEND; }
    }
    this.crouchBlendT = Math.max(0, this.crouchBlendT - dt);
    this.turnT = Math.max(0, this.turnT - dt);

    let driveAxis = axis !== 0 ? axis : stairIntentAxis;
    if (this.onStair) {
      if (axis !== 0) driveAxis = axis;
      else if (ctl && input.down.up && !input.down.down) driveAxis = this.onStair.ascDir;
      else if (ctl && input.down.down && !input.down.up) driveAxis = -this.onStair.ascDir;
      else driveAxis = 0;
    }
    const stairSpeedMul = this.onStair ? (1 / Math.hypot(1, this.onStair.slope * 0.65)) : 1;
    let target = rooted || this.crouching ? 0 : driveAxis * moveSpeed * stairSpeedMul;
    let accel = this.onGround ? PLAYER.accel : PLAYER.airAccel;
    if (running) {
      // Sprint: quick ramp to RUN_SPEED (relic speed bonuses still apply), held while the direction is held.
      const ramp = Math.min(1, this.runT / 0.14);
      target = this.runDir * (moveSpeed + (PLAYER.runSpeed * relicSpeedMul - moveSpeed) * (0.55 + 0.45 * ramp));
      accel = PLAYER.accel * (this.onGround ? 3 : 1.2);
    }
    if (this.hurtT > 0) {
      // Knockback: keep the launch velocity, only friction on the ground.
      if (this.onGround) this.vx *= 0.9;
    } else if (this.vx < target) this.vx = Math.min(target, this.vx + accel * dt);
    else if (this.vx > target) this.vx = Math.max(target, this.vx - accel * dt);

    const lockFacing = running || this.attacking || this.slots.some((s) => s.active && !s.guarding && s.weapon && s.weapon.category !== 'light_blade' && s.weapon.category !== 'boomerang' && s.weapon.category !== 'catalyst');
    if (driveAxis !== 0 && !rooted && !lockFacing) {
      // Direction change at speed on the ground: a few ticks of skid frame.
      if (driveAxis !== this.facing && this.onGround && Math.abs(this.vx) > 32) this.turnT = TURN_TIME;
      this.facing = driveAxis;
    }
    // Weight shift: lean into acceleration, back into a stop (skid); snaps in, eases out.
    const wantLean = running && this.onGround
      ? this.runDir * 0.13
      : this.onGround && this.hurtT <= 0 && !this.attacking
        ? Math.max(-1, Math.min(1, (target - this.vx) / Math.max(1, moveSpeed))) * 0.10 : 0;
    this.lean += (wantLean - this.lean) * Math.min(1, (Math.abs(wantLean) > Math.abs(this.lean) ? 40 : 8) * dt);

    // Jump (coyote + buffer), variable height; Heavy Blade roots feet on ground during active cleave!
    const jumpRooted = this.onGround && this.slots.some((s) => s.active && s.weapon && s.weapon.category === 'heavy_blade' && s.timer < s.win1);
    const stairDropJump = !!(
      ctl && !jumpRooted && this.onStair && this.onStair.passThrough
      && input.down.down && input.pressed.jump
      && level && level.findDropSurfaceY(this.x, this.y + 4, 220) != null
    );
    if (stairDropJump) {
      this.dropThrough = true; this.dropFromY = this.y;
      this.onStair = null; this.onGround = false; this.riding = null;
      this.y += 2; this.vy = Math.max(this.vy, 45);
      this.jumpBuffer = 0; this.coyote = 0;
    } else if (ctl && !jumpRooted && this.jumpBuffer > 0 && this.coyote > 0 && !this.crouching) {
      if (this.onStair && Math.abs(this.x - this.onStair.topX) < this.w * 0.5 + 2 && this.y > this.onStair.topY) {
        this.y = this.onStair.topY;
      }
      this.vy = -PLAYER.jump; this.coyote = 0; this.jumpBuffer = 0;
      this.onGround = false; this.riding = null; this.onStair = null;
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

    // -----------------------------------------------------------------------
    // Ambidextrous Dual-Hand Equipment Matrix (`Hand_L` = Slot 0, `Hand_R` = Slot 1)
    // - `↑ + Attack` throws Heart sub-weapon when armed
    // - Simultaneous `Hand_L + Hand_R` with matching `setTag` fires Combo Resonance
    // - 30-frame `[Down, Down-Forward, Forward] + Hand` triggers Hidden Command Skill
    // - Independent `slots[0]` and `slots[1]` allow Parallel Interruption!
    // -----------------------------------------------------------------------
    this.throwT = Math.max(0, this.throwT - dt);

    if (ctl) {
      const pressL = !!input.pressed.attack;
      const pressR = !!input.pressed.offhand;

      // Sub-weapon priority (`↑ + Attack`)
      if (pressL && input.down.up && this.subWeapon && world && world.hearts > 0 && !this.attacking && this.throwT <= 0) {
        world.throwSubWeapon(this);
        this.throwT = 0.35;
        this.attackT = 0; this.attackCrouch = false; this.attackHit = false;
        this.throwing = true;
      } else {
        if (pressL) this.inputBuffer.noteHandPress(0);
        if (pressR && wR) this.inputBuffer.noteHandPress(1);

        // Cross-Hand Combo Resonance (`Hand_L + Hand_R` within 2 frames & matching `setTag`)
        let firedResonance = false;
        if (
          (pressL || pressR)
          && wL && wR && !wL.isTwoHanded
          && wL.setTag && wL.setTag === wR.setTag
          && this.resonanceCd <= 0
          && this.inputBuffer.isCrossHandSimultaneous()
        ) {
          const res = SET_RESONANCES[wL.setTag];
          if (res && world && world.triggerComboResonance) {
            this.resonanceCd = 3.2;
            this.resonanceWardT = res.wardDur || 2.0;
            this.resonanceWardColor = res.hex || '#ffd27a';
            this.skillBanner = { text: `✦ ${res.name}! ✦`, color: res.hex || '#ffd27a', t: 1.4 };
            // Cancel shield guard so the resonance detonation takes center stage
            for (const s of this.slots) s.guarding = false;
            world.triggerComboResonance(this, res, wL, wR);
            firedResonance = true;
          }
        }

        if (!firedResonance) {
          if (pressL && wL && (!this.slots[0].active || this.slots[0].guarding) && this.throwT <= 0) {
            this._startSlotAction(0, wL, input, level, world, whipScale);
          }
          if (pressR && wR && (!this.slots[1].active || this.slots[1].guarding)) {
            // Parallel Interruption: if Hand_L was in recovery frames (`timer > win1`),
            // starting Hand_R immediately frees any grounded recovery lock!
            if (this.slots[0].active && this.slots[0].timer > this.slots[0].win1 && this.slots[0].weapon && this.slots[0].weapon.category !== 'whip') {
              this.slots[0] = this._emptySlot(0);
            }
            this._startSlotAction(1, wR, input, level, world, whipScale);
          } else if (pressL && wL && this.slots[1].active && this.slots[1].timer > this.slots[1].win1) {
            this.slots[1] = this._emptySlot(1);
          }
        }
      }
    }

    // Advance both hand slots independently
    for (let si = 0; si < 2; si++) {
      const s = this.slots[si];
      if (!s.active || !s.weapon) continue;
      const w = s.weapon;
      const btnHeld = si === 0 ? !!input.down.attack : !!input.down.offhand;
      const prevTimer = s.timer;
      s.timer += dt;

      // Spawn ranged weapon projectiles (Boomerang, Catalyst, or Command Skill waves) at `win0`
      if (!s.firedProj && prevTimer < s.win0 && s.timer >= s.win0) {
        s.firedProj = true;
        this._emitSlotPayloads(s, world);
      }

      // Ground-slam sparks & stone dust when a 2H Heavy Blade cleave crashes into the floor
      if (w.category === 'heavy_blade' && this.onGround && world && world.particles) {
        const slamT = s.win0 + (s.win1 - s.win0) * 0.72;
        if (prevTimer < slamT && s.timer >= slamT) {
          const ix = this.x + this.facing * ((s.reach || w.reach || 92) * 0.72);
          world.particles.sparks(ix, this.y - 4, 7, w.trimColor || '#ffd27a');
          world.particles.dust(ix, this.y, 5);
          world.camera.shake(2.2, 0.09);
        }
      }

      // Continuous Shield Guard while holding button
      if (w.category === 'shield' && btnHeld && ctl) {
        s.guarding = true;
        if (s.timer > s.duration) s.timer = s.duration;
      } else {
        s.guarding = false;
        if (s.timer >= s.duration) {
          this.slots[si] = this._emptySlot(si);
        }
      }
    }

    // Advance classic whip / sub-weapon throw timeline (`this.attackT`)
    if (this.attacking) {
      const prevAttackT = this.attackT;
      this.attackT += dt;
      if (!this.throwing && prevAttackT < this.whipActive[0] && this.attackT >= this.whipActive[0]) {
        // The crack: the tick the lash reaches full length and the hit box goes live.
        const tip = lashTip(this.x, this.y, this.facing, this.whipReach, this.attackCrouch);
        world.particles.sparks(tip.x, tip.y, 5, '#fff2c8');
        world.sfx('crack');
        world.camera.shake(1, 0.05);
      }
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
      if (this.landHard) { world.sfx('land'); world.particles.dust(this.x, this.y, 8); }
    }

    // Animation state
    if (this.hurtT > 0) this.state = 'hurt';
    else if (this.attacking) this.state = 'attack';
    else if (!this.onGround) this.state = 'jump';
    else if (this.runT > 0 && Math.abs(this.vx) > 10) this.state = 'run';
    else if (this.crouching) this.state = 'crouch';
    else if (Math.abs(this.vx) > 10) this.state = 'walk';
    else this.state = 'idle';
    if (this.state === 'run') {
      // Sprint cycle advanced by distance (one frame per ~11 px); contact frames kick up dust + footfalls.
      this.runDist += Math.abs(this.vx) * dt;
      const frame = Math.floor(this.runDist / RUN_PX_PER_FRAME) % 8;
      if (frame !== this.runFrame && (frame === 1 || frame === 5)) {
        world.sfx('step');
        world.particles.dust(this.x - this.facing * 9, this.y, 2);
      }
      this.runFrame = frame;
      this.animT = 0; this.walkFrame = 0;
    } else if (this.state === 'walk') {
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
    // Standing still for a while: play the fidget clip once, then start over.
    if (this.state !== 'idle') this.fidgetT = -1;
    else if (this.fidgetT >= 0) {
      this.fidgetT += dt;
      if (this.fidgetT >= this.fidgetLen) { this.fidgetT = -1; this.idleT = 0; }
    } else if (this.idleT > FIDGET_AFTER && this.fidgetLen > 0) this.fidgetT = 0;
  }

  _startSlotAction(slot, weapon, input, level, world, whipScale = 1) {
    // Prevent throwing duplicate boomerang from the exact same hand while its ring is still orbiting
    if (weapon.category === 'boomerang' && world && world.projectiles) {
      const alreadyFlying = world.projectiles.some(
        (pr) => !pr.dead && pr.owner === 'player' && pr.isBoomerang && pr.handSlot === slot,
      );
      if (alreadyFlying) return;
    }

    const isSkill = !!(weapon.skill && this.inputBuffer.matchQuarterCircleForward());
    if (isSkill) {
      this.inputBuffer.consumeMotion();
      // Stand up cleanly if headroom allows so dash/uppercut/cleave skills launch freely
      if (this.crouching) {
        this.h = PLAYER.height;
        if (this.headBlocked(level)) this.h = PLAYER.crouchHeight;
        else this.crouching = false;
      }
      const elemCol = weapon.element && ELEMENT_META[weapon.element]
        ? ELEMENT_META[weapon.element].color
        : '#ffd27a';
      this.skillBanner = {
        text: `* ${weapon.skill.name}! *`,
        color: elemCol,
        t: 1.15,
      };
    }

    const hasRelic = (k) => !!(world && world.hasRelic && world.hasRelic(k));
    const speedFactor = hasRelic('clocktower') ? 0.78 : 1.0;
    const reachScale = hasRelic('library') ? 1.22 : 1.0;
    const dur = (weapon.duration || 0.3) * speedFactor * (isSkill ? 1.12 : 1.0);
    const a0 = (weapon.active ? weapon.active[0] : 0.06) * speedFactor;
    const a1 = (weapon.active ? weapon.active[1] : 0.20) * speedFactor * (isSkill ? 1.15 : 1.0);
    const reach = Math.round((weapon.reach || 58) * reachScale * (isSkill ? 1.22 : 1.0));

    const s = {
      slot,
      active: true,
      weapon,
      timer: 0,
      duration: dur,
      win0: a0,
      win1: a1,
      reach,
      crouch: this.crouching,
      isSkill,
      guarding: weapon.category === 'shield' && (slot === 0 ? !!input.down.attack : !!input.down.offhand),
      firedProj: false,
      hitEnemies: new Map(),
      hitCandles: false,
      hitBlocks: false,
    };
    this.slots[slot] = s;

    // Category & Skill movement impulses
    if (isSkill && weapon.skill.dashVx) {
      this.vx = this.facing * weapon.skill.dashVx;
    } else if (weapon.category === 'brawler' && weapon.lungeVx) {
      this.vx = this.facing * weapon.lungeVx;
    } else if (weapon.category === 'standard_blade' && this.onGround && !this.crouching && weapon.stepVx) {
      if (input.axis === 0 || input.axis === this.facing) {
        this.vx = this.facing * weapon.stepVx;
      }
    } else if (weapon.category === 'heavy_blade' && this.onGround) {
      this.vx = 0;
    }
    if (isSkill && weapon.skill.popVy) {
      if (this.onStair && Math.abs(this.x - this.onStair.topX) < this.w * 0.5 + 2 && this.y > this.onStair.topY) {
        this.y = this.onStair.topY;
      }
      this.vy = weapon.skill.popVy;
      this.onGround = false;
      this.riding = null;
      this.onStair = null;
    }

    // Whip category also drives the hunter's Omni whip clip + procedural lash
    if (weapon.category === 'whip') {
      this.whipReach = Math.round(PLAYER.whipReach * (hasRelic('library') ? 1.28 : 1) * (isSkill ? 1.28 : 1));
      this.whipTime = PLAYER.whipTime * whipScale;
      this.whipActive = [PLAYER.whipActive[0] * whipScale, PLAYER.whipActive[1] * whipScale];
      s.duration = this.whipTime;
      s.win0 = this.whipActive[0];
      s.win1 = this.whipActive[1];
      s.reach = this.whipReach;
      this.attackT = 0;
      this.attackHit = false;
      this.throwing = false;
      this.attackCrouch = this.crouching;
      if (world) world.sfx('whip');
    } else if (world) {
      if (weapon.category === 'heavy_blade') {
        world.sfx('sword_heavy');
        world.camera.shake(1.8, 0.08);
      } else if (weapon.category === 'light_blade') {
        world.sfx('sword_thrust');
      } else if (weapon.category === 'standard_blade') {
        world.sfx('sword_slash');
      } else if (weapon.category === 'brawler') {
        world.sfx('sword_thrust');
      } else if (weapon.category === 'catalyst' || weapon.category === 'boomerang') {
        world.sfx('throw');
      } else if (weapon.category === 'shield') {
        world.sfx('block');
      } else {
        world.sfx('sword_slash');
      }
    }

    // CRIMSON MANTLE relic (Throne): melee swings unleash a piercing crimson wave!
    if (world && hasRelic('throne') && weapon.category !== 'shield' && weapon.category !== 'catalyst' && weapon.category !== 'boomerang') {
      const waveY = this.y - (this.crouching ? 25 : 42);
      const waveX = this.x + this.facing * 24;
      world.spawnProjectile(new Projectile('crimson_wave', waveX, waveY, this.facing, 'player'));
      if (world.onPlayerProjectile) world.onPlayerProjectile('crimson_wave', waveX, waveY, this.facing);
    }
  }

  _emitSlotPayloads(s, world) {
    if (!world || !s.weapon) return;
    const w = s.weapon;
    const sk = s.isSkill ? w.skill : null;
    const strTotal = computeStrengthBreakdown(world).total;
    const baseHit = computeWeaponHit(w, strTotal, null, {
      skillMult: sk && sk.mult ? sk.mult : 1,
      flatBonus: (world.hasRelic('jack') ? 1 : 0) + world.relicBonus('whip'),
      diffMult: 1,
    });
    const spawnY = this.y - (s.crouch ? 24 : 38);
    const spawnX = this.x + this.facing * 16;

    const attachMeta = (pr, mult = 1) => {
      pr.damage = Math.max(1, Math.round(baseHit.rawCore * mult * 10) / 10);
      pr.weaponMeta = {
        weapon: w,
        physical: w.physical,
        element: w.element,
        armorPiercing: !!w.armorPiercing,
        siphonHp: (sk && sk.siphonHp) || 0,
        deficit: baseHit.deficit,
      };
      return pr;
    };

    if (w.category === 'boomerang') {
      const pr = attachMeta(new Projectile('weapon_boomerang', spawnX, spawnY, this.facing, 'player'), sk && sk.mult ? sk.mult : 1);
      pr.weaponId = w.id;
      pr.weaponElement = w.element;
      pr.handSlot = s.slot;
      pr.maxDist = Math.round((w.reach || 155) * (sk && sk.fastLoop ? 1.32 : 1.0));
      if (sk && sk.fastLoop) {
        pr.vx = this.facing * 410;
        pr.returnSpeed = 430;
      }
      world.spawnProjectile(pr);
      return;
    }

    if (w.category === 'catalyst') {
      const boltType = w.boltType || 'catalyst_fire';
      const count = (sk && sk.spread) ? sk.spread : 1;
      for (let i = 0; i < count; i++) {
        const pr = attachMeta(new Projectile(boltType, spawnX, spawnY, this.facing, 'player'), count > 1 ? 0.85 : 1.0);
        if (count > 1) {
          const offset = i - (count - 1) * 0.5;
          pr.vy = offset * 68;
        }
        world.spawnProjectile(pr);
      }
      return;
    }

    // Command Skill extra effects on melee / whip weapons
    if (sk) {
      if (sk.projectile) {
        const pr = attachMeta(new Projectile(sk.projectile, spawnX + this.facing * 8, spawnY, this.facing, 'player'), 0.95);
        world.spawnProjectile(pr);
      }
      if (sk.dropFlame) {
        const floorRow = world.level.surfaceRow(Math.floor((this.x + this.facing * 28) / TILE));
        const fy = floorRow >= 0 ? floorRow * TILE : this.y;
        world.spawnFire(this.x + this.facing * 28, fy, 'player');
      }
      if (sk.shockwave) {
        const elem = w.element && ELEMENT_META[w.element] ? ELEMENT_META[w.element].core : [1.0, 0.84, 0.42];
        world.emitShockwave(this.x + this.facing * 32, this.y - 18, {
          maxR: 112, dur: 0.42, strength: 0.65, color: elem,
        });
        world.camera.shake(3.5, 0.18);
      }
    }
  }
    // Re-add headBlocked immediately before canDropThrough
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
      if (level.isDrawbridgeTile && level.isDrawbridgeTile(tx, ty)) return false;
      if (level.isOneWay(tx, ty)) hasOneWay = true;
    }
    return hasOneWay;
  }

  /** Applies damage (scaled by difficulty, shield guard & resonance ward) with knockback; returns true if it connected. */
  hurt(amount, fromX, world) {
    if (this.invuln > 0 || this.state === 'dead') return false;
    const hasRelic = (k) => !!(world && world.hasRelic && world.hasRelic(k));
    const relicRed = hasRelic('ossuary') ? 0.85 : 1;
    const lvRed = world && world.getDamageTakenMult ? world.getDamageTakenMult() : 1;
    const wardRed = this.resonanceWardT > 0 ? 0.55 : 1;

    // Active frontal Shield Guard mitigates incoming melee/contact blows & softens knockback!
    const shSlot = this.activeShieldSlot();
    const frontal = (fromX - this.x) * this.facing > 0;
    let shieldRed = 1;
    let guarded = false;
    if (shSlot && frontal) {
      shieldRed = shSlot.weapon.guardReduction || 0.5;
      guarded = true;
      world.sfx('block');
      world.particles.sparks(this.x + this.facing * 14, this.y - 34, 8, '#ffd27a');
      if (world.spawnPopup) {
        world.spawnPopup(this.x, this.y - 58, 'GUARD!', { color: '#9ef5dc', dur: 0.7 });
      }
    }

    amount = Math.max(1, Math.round(amount * world.difficulty.damageTaken * relicRed * lvRed * wardRed * shieldRed));
    this.hp -= amount;
    this.petrified = 0;            // a blow shatters the stone shell
    if (!guarded) world.sfx('hurt');
    world.camera.shake(guarded ? 1.5 : 3, 0.2);
    if (world.onPlayerHurt) world.onPlayerHurt(amount);
    if (this.hp <= 0) { this.hp = 0; this.die(world); return true; }
    const d = world.difficulty;
    this.invuln = PLAYER.invuln * (d.invulnMul || 1) * (hasRelic('yule') ? 1.45 : 1) * (1 + (world.relicBonus ? world.relicBonus('invuln') : 0));
    this.hurtT = guarded ? PLAYER.hurtTime * 0.45 : PLAYER.hurtTime;
    if (!guarded) this._clearSlots();
    this.crouching = false; this.h = PLAYER.height;
    const dir = fromX > this.x ? -1 : 1;
    const kb = (d.knockbackMul == null ? 1 : d.knockbackMul) * (hasRelic('yule') ? 0.5 : 1) * (guarded ? 0.35 : 1);
    this.vx = dir * 150 * kb;
    this.vy = guarded ? -95 * kb : -230 * kb;
    this.onGround = false;
    this.onStair = null;
    return true;
  }

  die(world) {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.deadT = 0;
    this._clearSlots();
    this.vx = -this.facing * 60;
    this.vy = -320;
    this.onStair = null;
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
    this.fidgetLen = fidgetLength(assets);
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
    if (fr.lash) {
      // Whip body frame + the procedural lash flying out / cracking / dropping.
      drawWhipFrame(ctx, assets, fr.sheet, fr.name, x, y, flip, alpha, this.whipReach, fr.lash);
    } else {
      assets.draw(ctx, fr.sheet, fr.name, x, y, flip, alpha, 1, null, this.spriteXf());
    }

    // Resonance Ward shimmering protective ring
    if (this.resonanceWardT > 0) {
      ctx.save();
      ctx.strokeStyle = this.resonanceWardColor || '#ffd27a';
      ctx.globalAlpha = Math.min(0.65, this.resonanceWardT * 0.45);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(Math.round(x), Math.round(y - 30), 20, 30, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Dual-Hand weapon visual arcs, needle thrusts, 2H cleaves, fist blitzes & held shields
    const fxl = getFxLayers();
    for (let si = 0; si < 2; si++) {
      const s = this.slots[si];
      if (s && s.active && s.weapon && s.weapon.category !== 'whip') {
        drawWeaponAction(ctx, s, x, y, this.facing, this.crouching, fxl, this.idleT + this.animT, fr.name);
      }
    }
  }
}
