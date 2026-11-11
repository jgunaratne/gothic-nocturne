// The vampire hunter: movement, ambidextrous dual-hand equipment matrix,
// 30-frame fighting-game command skills, cross-hand resonance, sub-weapons, damage & death.

import { PLAYER, TILE, T_BLOCK } from '../engine/constants.js';
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
  computeStrengthBreakdown, computeWeaponHit, drawWeaponAction, drawCarriedShield, resolvePairResonance,
} from './weapons.js';
import { computeEnchantBonuses } from './souls.js';

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
    this.runT = 0;                 // seconds spent in the current double-tap / controller-B sprint (0 = not running)
    this.runDir = 0;               // sprint direction (+1 / -1)
    this.runDist = 0;              // distance covered this sprint (drives the run-cycle frame)
    this.runFrame = 0;
    this.sprintBurstT = 0;         // minimum forward dash burst when tapping controller Dash from standstill
    this._sprintAutoSteer = false; // true while a standstill controller Dash drives forward without stick input

    // Classic Castle-Explorer Movement Suite: Backdash, Low Slide, Aerial Divekick, Super Jump & Magnes
    this.backdashT = 0;            // remaining backdash time (cancellable after 0.085s)
    this.backdashCd = 0;
    this.grazeT = 0;               // brief projectile graze evasion on backdash startup
    this.slideT = 0;               // remaining crouch-slide kick duration
    this.slideCd = 0;
    this.slideHits = new Set();    // enemies already struck by current slide kick
    this.divekickT = 0;            // active aerial diagonal comet-kick timer
    this.divekickHits = new Set(); // enemies struck during current divekick
    this.superJumpT = 0;           // rising super-jump phantom wake timer
    this.tetherNode = null;        // active Lodestone Magnet Anchor (`MagnetNode`)
    this.afterimages = [];         // [{ x, y, facing, sheet, name, alpha, color, t, dur }]
    this.whipAimDy = 0;            // vertical target-tracking curve for Nebula Chain-Lash
    this.whipColor = '#6b4a2b';
    this.whipTipColor = '#e8e2c8';

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
    this._resolveSafeHeight(world && world.level, false);
    this.vx = 0; this.hurtT = 0;
    world.sfx('block');
    world.particles.dust(this.x, this.y - 30, 8, '#9a9aa8');
  }

  /** Whip hit box in world coordinates, or null when inactive. */
  whipBox() {
    if (!this.attacking || this.throwing) return null;
    if (this.attackT < this.whipActive[0] || this.attackT > this.whipActive[1]) return null;
    const reach = this.whipReach || PLAYER.whipReach;
    const low = !!(this.attackCrouch || this.crouching || this.attackDown);
    const yTop = this.y - (low ? 34 : 52);
    const x0 = this.facing > 0 ? (low ? this.x - 12 : this.x + 6) : (low ? this.x + 12 - (reach + 18) : this.x - 6 - reach);
    return { x: x0, y: yTop, w: low ? reach + 18 : reach, h: low ? (this.y + 18 - yTop) : 18 };
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
      const crouch = !!(s.crouch || this.crouching);
      const lowAim = !!(crouch || s.downAim);
      let box = null;
      switch (w.category) {
        case 'whip': {
          const aimDy = w.trackingWhip ? (this.whipAimDy || 0) : 0;
          const baseTop = this.y - (crouch ? 34 : 52);
          const yTop = Math.min(baseTop, baseTop + aimDy);
          const extraH = Math.abs(aimDy);
          box = {
            x: f > 0 ? this.x + 6 : this.x - 6 - reach,
            y: yTop,
            w: reach,
            h: (lowAim ? (this.y + 14 - baseTop) : 20) + extraH,
          };
          break;
        }
        case 'light_blade': {
          // Crisp linear forward thrust at chest/shoulder height (sweeps floor when crouching/down-aiming)
          const yTop = this.y - (crouch ? 30 : 45);
          box = { x: f > 0 ? this.x + 4 : this.x - 4 - reach, y: yTop, w: reach, h: lowAim ? (this.y + 14 - yTop) : 16 };
          break;
        }
        case 'standard_blade': {
          // Forward overhead-to-waist arc (reaches floor tiles when crouching/down-aiming)
          const yTop = this.y - (crouch ? 44 : 62);
          box = { x: f > 0 ? this.x - 4 : this.x + 4 - reach, y: yTop, w: reach + 4, h: lowAim ? (this.y + 14 - yTop) : 44 };
          break;
        }
        case 'heavy_blade': {
          // Massive 180-degree sweeping cleave covering behind-overhead to floor-front!
          const backSpan = 22;
          box = {
            x: f > 0 ? this.x - backSpan : this.x + backSpan - (reach + backSpan),
            y: this.y - 78,
            w: reach + backSpan,
            h: lowAim ? 92 : 84,
          };
          break;
        }
        case 'brawler': {
          // Tight horizontal multi-hit strike zone
          const yTop = this.y - (crouch ? 32 : 46);
          box = { x: f > 0 ? this.x + 2 : this.x - 2 - reach, y: yTop, w: reach, h: lowAim ? (this.y + 14 - yTop) : 24 };
          break;
        }
        case 'shield': {
          // Short blunt shield-bash impact zone
          const yTop = this.y - (crouch ? 32 : 46);
          box = { x: f > 0 ? this.x + 2 : this.x - 2 - reach, y: yTop, w: reach, h: lowAim ? (this.y + 14 - yTop) : 28 };
          break;
        }
        default:
          break;
      }
      if (box) {
        // Dedicated block-breaking envelope:
        // - Crouching, holding Down, or cleaving with a blade shatters floor-set T_BLOCK hatches
        //   directly beneath and in front of the hunter's boots.
        // - Standing melee swings also graze floor hatches immediately ahead of the hunter's
        //   leading boot (`+14px` forward) and overhead ceiling hatches (`y - 66`) without
        //   altering enemy combat hitboxes.
        const cleaveUnderFeet = lowAim || w.category === 'heavy_blade';
        let blockBox = box;
        if (cleaveUnderFeet) {
          const bx = f > 0 ? Math.min(box.x, this.x - 12) : Math.min(box.x, this.x + 12 - (reach + 14));
          const by = Math.min(box.y, this.y - 64);
          blockBox = {
            x: bx,
            y: by,
            w: Math.max(box.w, reach + 24),
            h: Math.max(box.h, (this.y + 18) - by),
          };
        } else {
          const frontW = Math.max(24, reach - 8);
          const fx0 = f > 0 ? Math.min(box.x, this.x + 14) : Math.min(box.x, this.x - 14 - frontW);
          const fx1 = Math.max(box.x + box.w, f > 0 ? this.x + 14 + frontW : this.x - 14);
          const fy0 = Math.min(box.y, this.y - 66);
          const fy1 = Math.max(box.y + box.h, this.onGround ? this.y + 12 : box.y + box.h);
          blockBox = { x: fx0, y: fy0, w: fx1 - fx0, h: fy1 - fy0 };
        }
        out.push({ slotState: s, weapon: w, box, blockBox });
      }
    }

    // Low Slide Kick & Aerial Diagonal Divekick boot hitboxes
    if (this.slideT > 0) {
      const f = this.facing;
      const box = { x: f > 0 ? this.x - 4 : this.x - 28, y: this.y - 24, w: 32, h: 24 };
      out.push({
        slotState: { timer: 0.1, win0: 0, win1: 1, isSkill: false, hitEnemies: this._slideHitMap || (this._slideHitMap = new Map()), isSlide: true },
        weapon: { id: '_slide_kick', name: 'SLIDE KICK', category: 'brawler', physical: 'blunt', element: null, baseDamage: 1.15, scaling: 0.15, reqStr: 0, knockback: 135 },
        box,
        blockBox: { x: box.x - 4, y: box.y - 4, w: box.w + 8, h: box.h + 12 },
      });
    } else if (this.divekickT > 0) {
      const f = this.facing;
      const box = { x: f > 0 ? this.x - 4 : this.x - 24, y: this.y - 22, w: 28, h: 28 };
      out.push({
        slotState: { timer: 0.1, win0: 0, win1: 1, isSkill: false, hitEnemies: this._diveHitMap || (this._diveHitMap = new Map()), isDivekick: true },
        weapon: { id: '_dive_kick', name: 'COMET DIVEKICK', category: 'brawler', physical: 'blunt', element: null, baseDamage: 1.55, scaling: 0.18, reqStr: 0, knockback: 145 },
        box,
        blockBox: { x: box.x - 4, y: box.y - 4, w: box.w + 8, h: box.h + 14 },
      });
    }
    return out;
  }

  onDivekickBounce(world) {
    const ench = computeEnchantBonuses(world && world.game);
    this.divekickT = 0;
    if (this._diveHitMap) this._diveHitMap.clear();
    this.vy = -430 * (1 + (ench.speedPct || 0) * 0.55);
    this.vx = this.facing * 135;
    this.launchT = LAUNCH_TIME;
    if (world) {
      world.sfx('jump');
      world.particles.sparks(this.x + this.facing * 10, this.y - 6, 8, '#9ef5ff');
    }
  }

  pushAfterimage(color = 'rgba(92, 212, 255, 0.52)', dur = 0.22) {
    if (this.afterimages.length >= 10) this.afterimages.shift();
    this.afterimages.push({
      x: this.x,
      y: this.y,
      facing: this.facing,
      state: this.state,
      vy: this.vy,
      walkFrame: this.walkFrame,
      runFrame: this.runFrame,
      backdashT: this.backdashT,
      color,
      t: 0,
      dur,
    });
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
    this.grazeT = Math.max(0, this.grazeT - dt);
    this.backdashCd = Math.max(0, this.backdashCd - dt);
    this.slideCd = Math.max(0, this.slideCd - dt);
    this.superJumpT = Math.max(0, this.superJumpT - dt);
    this.saluteT = Math.max(0, (this.saluteT || 0) - dt);
    this.resonanceCd = Math.max(0, this.resonanceCd - dt);
    this.resonanceWardT = Math.max(0, this.resonanceWardT - dt);
    for (const gh of this.afterimages) gh.t += dt;
    if (this.afterimages.length) {
      this.afterimages = this.afterimages.filter((gh) => gh.t < gh.dur);
    }
    if (this.skillBanner) {
      this.skillBanner.t -= dt;
      if (this.skillBanner.t <= 0) this.skillBanner = null;
    }
    this.landT = Math.max(0, this.landT - dt);
    this.launchT = Math.max(0, this.launchT - dt);
    this.coyote = this.onGround ? PLAYER.coyote : Math.max(0, this.coyote - dt);
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    if (ctl && input.pressed.jump) this.jumpBuffer = PLAYER.buffer;

    // Instant Dual-Loadout A/B Hot-Swap (`R` / Gamepad `LT`)
    if (ctl && input.pressed.swap && world && world.game && world.game.swapLoadout) {
      world.game.swapLoadout(world);
    }

    // -----------------------------------------------------------------------
    // Forward DASH / RUN (double-tap Left/Right OR controller `B` / `sprint` button):
    // breaks into a sustained sprint (RUN_SPEED) opening with a launch burst, dust & whoosh.
    // Pressing Down + Run (or Down while running / double-tapping while holding Down) slides!
    // -----------------------------------------------------------------------
    const wasRunning = this.runT > 0;
    const prevRunDir = this.runDir;
    let doubleTapSlideDir = 0;
    this.dashTapT = Math.max(0, this.dashTapT - dt);
    this.sprintBurstT = Math.max(0, (this.sprintBurstT || 0) - dt);
    if (this.dashTapT <= 0) this.dashTapDir = 0;
    if (ctl && this.backdashT > 0 && (PLAYER.backdashTime - this.backdashT) >= 0.085 && input.pressed.sprint) {
      this.backdashT = 0;
    }
    const isRunHeld = () => {
      const holdingDir = (this.runDir > 0 && input.down.right && !input.down.left)
        || (this.runDir < 0 && input.down.left && !input.down.right);
      const oppositeDir = (this.runDir > 0 && input.down.left && !input.down.right)
        || (this.runDir < 0 && input.down.right && !input.down.left);
      if (holdingDir) this._sprintAutoSteer = false;
      const holding = ctl && !oppositeDir && (holdingDir || (this._sprintAutoSteer && input.down.sprint) || this.sprintBurstT > 0);
      const blocked = this.hurtT > 0 || this.crouching || (this.onGround && input.down.down);
      return holding && !blocked;
    };
    if (this.runT > 0 && !isRunHeld()) {
      this.runT = 0;
      this._sprintAutoSteer = false;
      this.sprintBurstT = 0;
    }
    if (ctl) {
      const canRun = this.runT <= 0 && this.onGround && this.hurtT <= 0 && !this.crouching && this.backdashT <= 0 && this.slideT <= 0;
      const lowTunnel = this.onGround && this.crouching && this.h <= PLAYER.slideHeight;
      const tap = input.pressed.right ? 1 : input.pressed.left ? -1 : 0;
      if (tap !== 0) {
        if (tap === this.dashTapDir && this.dashTapT > 0) {
          if ((input.down.down || lowTunnel) && this.onGround && this.hurtT <= 0 && this.backdashT <= 0 && this.slideT <= 0) {
            doubleTapSlideDir = tap;
            this.dashTapDir = 0;
            this.dashTapT = 0;
          } else if (canRun) {
            this._startSprint(tap, world, false);
          }
        } else {
          this.dashTapDir = tap;
          this.dashTapT = PLAYER.runTapWindow;
        }
      }
      if (this.runT <= 0 && canRun && !input.down.down) {
        if (input.pressed.sprint) {
          const dir = axis !== 0 ? axis : (this.facing || 1);
          this._startSprint(dir, world, axis === 0);
        } else if (input.down.sprint && axis !== 0) {
          this._startSprint(axis, world, false);
        }
      }
    }
    if (this.runT > 0) {
      if (!isRunHeld()) {
        this.runT = 0;
        this._sprintAutoSteer = false;
        this.sprintBurstT = 0;
      } else {
        this.runT += dt;
      }
    }
    const running = this.runT > 0;
    // Legacy dash-burst fields kept at rest (afterimage trail no longer used by the run).
    this.dashT = 0;
    if (this.dashTrail.length) this.dashTrail.length = 0;

    // Record directional frame into 30-frame fighting-game Input Buffer Queue
    if (ctl) this.inputBuffer.record(input, this.facing);

    const wL = (world && world.getHandWeapon ? world.getHandWeapon(0) : null) || WEAPONS.hunters_lash;
    const wR = (wL && wL.isTwoHanded) ? null : (world && world.getHandWeapon ? world.getHandWeapon(1) : null);
    this.handWeapons = [wL, wR];
    this.noWhip = !!(wL && wL.category !== 'whip');

    // Check active movement constraints across both hands:
    // - Heavy Blade (2H) & Whip root grounded movement during swing
    // - Light Blade, Boomerang, Catalyst allow 100% full movement
    // - Standard Blade allows free jump & forward combat step
    // - Shield slows walk slightly while held in active guard
    const isRootingSlot = (s) => s.active && s.weapon && (
      s.weapon.category === 'heavy_blade'
      || (s.weapon.category === 'whip' && !s.weapon.freeMoveWhip)
    );
    const anyBlockingCrouch = (this.attacking && !this.attackCrouch)
      || this.slots.some((s) => s.active && !s.guarding && !s.crouch && s.weapon && s.weapon.category === 'heavy_blade');
    const guardSlot = this.activeShieldSlot();
    const speedScale = guardSlot ? 0.72 : 1.0;
    const ench = computeEnchantBonuses(world && world.game);
    const relicSpeedMul = Math.min(
      1.26,
      (hasRelic('ramparts') ? 1.08 : 1) * (1 + (world && world.relicBonus ? world.relicBonus('speed') : 0) + (ench.speedPct || 0)),
    );
    const moveSpeed = PLAYER.speed * speedScale * relicSpeedMul;
    const stepSpeed = running ? Math.max(moveSpeed, Math.abs(this.vx), PLAYER.runSpeed * relicSpeedMul) : moveSpeed;
    const rooted = !running && this.backdashT <= 0 && this.slideT <= 0 && this.onGround && (this.throwing || isRootingSlot(this.slots[0]) || isRootingSlot(this.slots[1]));

    // -----------------------------------------------------------------------
    // Lodestone Magnet Tether (`Magnes`): Hold `Q` / `LB` (or `Up` in mid-air)
    // near a ceiling Lodestone Orb to latch & slingshot across chasms/shafts!
    // -----------------------------------------------------------------------
    let wantTether = false;
    if (ctl && world && world.magnetNodes && world.magnetNodes.length) {
      const holdMag = !!input.down.dash || (!this.onGround && !!input.down.up && !input.down.attack && !input.down.offhand);
      if (holdMag) {
        let best = this.tetherNode;
        if (best && Math.hypot(best.x - this.x, best.y - (this.y - 28)) > 298) best = null;
        if (!best) {
          let bestD = 248;
          for (const mn of world.magnetNodes) {
            const d = Math.hypot(mn.x - this.x, mn.y - (this.y - 28));
            if (d < bestD) { bestD = d; best = mn; }
          }
          if (best && world) {
            world.sfx('pickup');
            world.particles.sparks(best.x, best.y, 7, '#58dcff');
          }
        }
        if (best) {
          this.tetherNode = best;
          wantTether = true;
          this.onGround = false;
          this.onStair = null;
          this.riding = null;
          this.divekickT = 0;
          this.slideT = 0;
          const dx = best.x - this.x;
          const dy = best.y - (this.y - 28);
          this.vx += (dx * 11.4 + axis * 205 - this.vx * 1.45) * dt;
          this.vy += (dy * 11.6 - 1560 - this.vy * 1.35) * dt;
          if (Math.random() < 0.55) this.pushAfterimage('rgba(88, 220, 255, 0.45)', 0.16);
        }
      }
    }
    if (!wantTether && this.tetherNode) {
      // Slingshot release boost!
      this.vx = Math.max(-440, Math.min(440, this.vx * 1.12));
      this.vy = Math.max(-560, Math.min(420, this.vy * 1.06 - 45));
      this.tetherNode = null;
      if (world) world.sfx('dash');
    }

    // -----------------------------------------------------------------------
    // Backdash (`Q` / `LB`) & Emergent Backdash-Cancel (after 0.085s)
    // -----------------------------------------------------------------------
    if (this.backdashT > 0) {
      this.backdashT = Math.max(0, this.backdashT - dt);
      const elapsed = PLAYER.backdashTime - this.backdashT;
      if (Math.floor(elapsed * 45) !== Math.floor((elapsed - dt) * 45)) {
        this.pushAfterimage('rgba(110, 210, 255, 0.54)', 0.22);
      }
      // Classic Backdash-Cancel: Crouch, Jump, or Attack after 0.085s cancels recovery!
      if (ctl && elapsed >= 0.085 && (input.down.down || input.pressed.jump || input.pressed.attack || input.pressed.offhand)) {
        this.backdashT = 0;
      }
    } else if (
      ctl && !wantTether && input.pressed.dash && !input.down.down
      && this.onGround && this.backdashCd <= 0
    ) {
      this._clearSlots();
      this.runT = 0;
      this._sprintAutoSteer = false;
      this.sprintBurstT = 0;
      this._resolveSafeHeight(level, false);
      this.backdashT = PLAYER.backdashTime;
      this.backdashCd = 0.26;
      this.grazeT = 0.11;
      this.vx = -this.facing * PLAYER.backdashSpeed * relicSpeedMul;
      this.pushAfterimage('rgba(140, 180, 255, 0.62)', 0.24);
      if (world) {
        world.sfx('dash');
        world.particles.dust(this.x + this.facing * 8, this.y, 5);
        if (world.onMovementWake) world.onMovementWake(this, 'backdash');
      }
    }

    // -----------------------------------------------------------------------
    // Walkable Staircase Engagement (Bottom `Up` / sprint climb & Top `Down` / open-balcony descent)
    // Evaluated before slide/crouch so pressing `Down` at the top of a staircase descends cleanly.
    // -----------------------------------------------------------------------
    let stairIntentAxis = 0;
    let suppressCrouchForStair = false;
    if (ctl && !rooted && this.slideT <= 0 && this.onGround && !this.onStair && !this.dropThrough && level) {
      if (!input.down.down && level.findBottomStair) {
        const bs = level.findBottomStair(this.x, this.y, running ? 32 : 26, 16);
        const wantClimb = bs && (
          (input.down.up && (axis === 0 || axis === bs.ascDir))
          || (running && this.runDir === bs.ascDir && (!bs.passThrough || input.down.up || this.blockedAhead(level)))
        );
        if (wantClimb) {
          stairIntentAxis = bs.ascDir;
          if ((this.x + bs.ascDir * stepSpeed * dt - bs.botX) * bs.ascDir > 0) {
            this.onStair = bs;
            this.riding = null;
          }
        }
      }
      if (!this.onStair && level.findTopStair) {
        const ts = level.findTopStair(this.x, this.y, (running || wasRunning) ? 32 : 26, 14);
        if (ts) {
          const downDir = -ts.ascDir;
          if (input.down.down && !input.down.up && (axis === 0 || axis === downDir)) {
            suppressCrouchForStair = true;
            stairIntentAxis = downDir;
            if ((this.x + downDir * stepSpeed * dt - ts.topX) * downDir > 0) {
              this.onStair = ts;
              this.riding = null;
            }
          } else if (ts.passThrough && (axis === downDir || (running && this.runDir === downDir)) && !input.down.up) {
            const beyondCol = ts.ascDir > 0
              ? Math.floor((ts.topX - 4) / TILE)
              : Math.floor((ts.topX + 4) / TILE);
            const topRow = Math.round(ts.topY / TILE);
            if (!level.isStandable(beyondCol, topRow) && (this.x + downDir * stepSpeed * dt - ts.topX) * downDir > 0) {
              this.onStair = ts;
              this.riding = null;
            }
          }
        }
      }
    }

    // Advance Low Crouch-Slide Kick (`slideT`) & Aerial Diagonal Divekick (`divekickT`)
    if (this.slideT > 0) {
      const hitSolidWall = this.hitWall && this._wallAheadAtHeight(level, this.facing, PLAYER.slideHeight);
      this.slideT = hitSolidWall ? 0 : Math.max(0, this.slideT - dt);
      if (Math.random() < 0.6) this.pushAfterimage('rgba(120, 225, 255, 0.48)', 0.18);
      if (world && Math.random() < 0.5) world.particles.dust(this.x - this.facing * 8, this.y, 1);
      if (this.slideT <= 0) {
        // Keep low slide coasting through open 1-tile crawl tunnels, but stop cleanly against dead-end walls
        // or when steering opposite so dead-end 1-tile niches (e.g. Wall-Meat pockets) never trap the hunter!
        this.h = PLAYER.crouchHeight;
        if (level && this.headBlocked(level)) {
          this.h = PLAYER.slideHeight;
          this.crouching = true;
          if (!hitSolidWall && !this._wallAheadAtHeight(level, this.facing, PLAYER.slideHeight) && axis !== -this.facing) {
            this.slideT = 0.06;
            this.vx = this.facing * PLAYER.slideSpeed * 0.72;
          } else {
            this.vx = 0;
          }
        } else {
          this.crouching = true;
        }
      }
    } else if (ctl && !wantTether && this.onGround && this.slideCd <= 0 && !this.onStair) {
      const lowTunnel = this.crouching && this.h <= PLAYER.slideHeight;
      const wantRunSlide = (
        (input.down.down && (input.pressed.dash || input.pressed.sprint))
        || (!suppressCrouchForStair && input.pressed.down && (input.down.sprint || wasRunning))
        || (!suppressCrouchForStair && doubleTapSlideDir !== 0)
        || (lowTunnel && input.pressed.sprint)
      );
      if (wantRunSlide) {
        if (doubleTapSlideDir !== 0) this.facing = doubleTapSlideDir;
        else if (axis !== 0) this.facing = axis;
        else if (wasRunning && prevRunDir !== 0) this.facing = prevRunDir;
        this._startSlide(relicSpeedMul, world);
      }
    }

    if (this.divekickT > 0) {
      this.divekickT = Math.max(0, this.divekickT - dt);
      if (this.onGround) {
        this.divekickT = 0;
        if (world) world.particles.dust(this.x, this.y, 6);
      } else {
        this.vx = this.facing * PLAYER.divekickVx * relicSpeedMul;
        this.vy = Math.max(this.vy, PLAYER.divekickVy);
        if (Math.random() < 0.7) this.pushAfterimage('rgba(255, 118, 168, 0.52)', 0.18);
      }
    }
    if (this.superJumpT > 0 && Math.random() < 0.7) {
      this.pushAfterimage('rgba(198, 148, 255, 0.56)', 0.22);
    }

    // Crouch (ground only, suppressed on stairs), with head-room check across standing/crouch/slide heights.
    const wantCrouch = ctl && input.down.down && this.onGround && !this.onStair && !suppressCrouchForStair && !anyBlockingCrouch && this.backdashT <= 0;
    const prevCrouch = this.crouching;
    if (this.slideT > 0) {
      this.crouching = true;
      this.h = PLAYER.slideHeight;
    } else {
      this._resolveSafeHeight(level, wantCrouch);
      if (this.crouching !== prevCrouch) this.crouchBlendT = CROUCH_BLEND;
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
    const inLowTunnel = this.onGround && this.crouching && this.h <= PLAYER.slideHeight && this.slideT <= 0;
    let target = rooted ? 0 : (inLowTunnel ? driveAxis * moveSpeed * 0.9 : (this.crouching ? 0 : driveAxis * moveSpeed * stairSpeedMul));
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
    } else if (wantTether || this.divekickT > 0) {
      // Velocity driven directly by magnetic spring or diagonal divekick vector
    } else if (this.backdashT > 0) {
      const bk = this.backdashT / PLAYER.backdashTime;
      this.vx = -this.facing * PLAYER.backdashSpeed * relicSpeedMul * (0.35 + 0.65 * bk);
    } else if (this.slideT > 0) {
      const sk = Math.min(1, this.slideT / (PLAYER.slideTime * 0.45));
      this.vx = this.facing * PLAYER.slideSpeed * relicSpeedMul * (0.45 + 0.55 * sk);
    } else if (this.vx < target) this.vx = Math.min(target, this.vx + accel * dt);
    else if (this.vx > target) this.vx = Math.max(target, this.vx - accel * dt);

    const lockFacing = running || this.backdashT > 0 || this.slideT > 0 || this.divekickT > 0 || this.attacking || this.slots.some((s) => s.active && !s.guarding && s.weapon && s.weapon.category !== 'light_blade' && s.weapon.category !== 'boomerang' && s.weapon.category !== 'catalyst');
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

    // Jump (coyote + buffer), variable height; Heavy Blade roots feet on ground during active cleave unless running!
    const jumpRooted = !running && this.onGround && this.slots.some((s) => s.active && s.weapon && s.weapon.category === 'heavy_blade' && s.timer < s.win1);
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
      // Gravity-Boots Super High-Jump (`[Down, Up] + Jump` once Night Wings are unlocked!)
      const isSuperJump = hasRelic('graveyard') && input.down.up && this.inputBuffer.matchSuperJump();
      if (isSuperJump) {
        this.inputBuffer.consumeMotion();
        this.vy = -PLAYER.superJump;
        this.superJumpT = 0.42;
        this.skillBanner = { text: '✦ GRAVITY LEAP ✦', color: '#d2a8ff', t: 0.95 };
        this.pushAfterimage('rgba(198, 148, 255, 0.65)', 0.25);
        world.sfx('dash');
        world.particles.sparks(this.x, this.y - 12, 12, '#d8b4ff');
        if (world.onMovementWake) world.onMovementWake(this, 'superjump');
      } else {
        this.vy = -PLAYER.jump * (1 + (ench.speedPct || 0) * 0.35);
      }
      this.coyote = 0; this.jumpBuffer = 0;
      this.onGround = false; this.riding = null; this.onStair = null;
      this.airJumpsLeft = hasRelic('graveyard') ? 1 : 0;
      this.launchT = LAUNCH_TIME; this.landT = 0;
      world.sfx('jump');
      world.particles.dust(this.x, this.y, 4);
    } else if (ctl && input.pressed.jump && !this.onGround && this.coyote <= 0 && input.down.down && this.divekickT <= 0 && !wantTether) {
      // Aerial Diagonal Comet Divekick (`↓ + Jump` while airborne -> bounces off enemies!)
      this._clearSlots();
      this.divekickT = 0.46;
      if (this._diveHitMap) this._diveHitMap.clear();
      if (axis !== 0) this.facing = axis;
      this.vx = this.facing * PLAYER.divekickVx * relicSpeedMul;
      this.vy = PLAYER.divekickVy;
      this.jumpBuffer = 0;
      this.dropThrough = false;
      this.pushAfterimage('rgba(255, 118, 168, 0.60)', 0.22);
      world.sfx('sword_thrust');
      if (world.onMovementWake) world.onMovementWake(this, 'divekick');
    } else if (ctl && input.pressed.jump && !this.onGround && this.coyote <= 0 && this.airJumpsLeft > 0) {
      // NIGHT WINGS relic (Graveyard): mid-air double jump on shadowy bat wings!
      this.airJumpsLeft--;
      this.divekickT = 0;
      this.vy = -PLAYER.jump * 0.94 * (1 + (ench.speedPct || 0) * 0.35);
      this.jumpBuffer = 0;
      this.dropThrough = false;
      this.launchT = LAUNCH_TIME;
      world.sfx('jump');
      world.particles.sparks(this.x, this.y - 14, 9, '#b48cff');
      world.particles.smoke(this.x, this.y - 10, 3, 'rgba(130, 80, 220, 0.45)');
      if (world.onMovementWake) world.onMovementWake(this, 'doublejump');
    }
    if (ctl && this.crouching && input.pressed.jump && this.slideT <= 0) {
      if (this.canDropThrough(level)) {
        // Drop through a one-way ledge (or safe mover with a floor below).
        this.dropThrough = true; this.dropFromY = this.y;
        this.y += 1; this.onGround = false; this.riding = null;
        this.jumpBuffer = 0; this.coyote = 0;
      } else if (this.slideCd <= 0) {
        // On solid stone (`↓ + Jump`): execute the classic Low Crouch-Slide Kick!
        if (axis !== 0) this.facing = axis;
        this.jumpBuffer = 0;
        this._startSlide(relicSpeedMul, world);
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
      if (pressL) this.inputBuffer.noteHandPress(0);
      if (pressR) this.inputBuffer.noteHandPress(1);

      // 1. Glyph Union (`↑ + Hand_L + Hand_R` simultaneously, costs 5 Hearts!)
      if (
        (pressL || pressR)
        && input.down.up
        && this.inputBuffer.isCrossHandSimultaneous()
        && world && world.hearts >= 5
        && world.triggerGlyphUnion
        && this.resonanceCd <= 0
      ) {
        this.resonanceCd = 2.4;
        this._clearSlots();
        world.triggerGlyphUnion(this, wL, wR);
      } else if (
        // 2. Crimson Bullet Soul Glyph (`↑ + R-Hand`, costs 2 Hearts when equipped!)
        pressR && input.down.up
        && world && world.canCastBulletSoul && world.canCastBulletSoul()
        && this.throwT <= 0
      ) {
        world.castBulletSoul(this);
        this.throwT = 0.34;
        this.attackT = 0; this.attackCrouch = false; this.attackHit = false;
        this.throwing = true;
      } else if (pressL && input.down.up && this.subWeapon && world && (world.canThrowSubWeapon ? world.canThrowSubWeapon(this) : world.hearts > 0) && !this.attacking && this.throwT <= 0) {
        // 3. Classic Sub-Weapon (`↑ + L-Hand`, costs 1 Heart)
        world.throwSubWeapon(this);
        this.throwT = 0.35;
        this.attackT = 0; this.attackCrouch = false; this.attackHit = false;
        this.throwing = true;
      } else {
        // 4. Cross-Hand Combo Resonance & Shield-Rod Sacred Call (`Hand_L + Hand_R`)
        let firedResonance = false;
        const pairRes = (wL && wR && !wL.isTwoHanded) ? resolvePairResonance(wL, wR) : null;
        if (
          (pressL || pressR)
          && pairRes
          && this.resonanceCd <= 0
          && this.inputBuffer.isCrossHandSimultaneous()
        ) {
          if (world && world.triggerComboResonance) {
            this.resonanceCd = 3.2;
            this.resonanceWardT = pairRes.wardDur || 2.0;
            this.resonanceWardColor = pairRes.hex || '#ffd27a';
            this.skillBanner = { text: `✦ ${pairRes.name}! ✦`, color: pairRes.hex || '#ffd27a', t: 1.4 };
            for (const s of this.slots) s.guarding = false;
            world.triggerComboResonance(this, pairRes, wL, wR);
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
    this.depenetrateX(level);
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
    else if (this.divekickT > 0 && !this.onGround) this.state = 'divekick';
    else if (this.backdashT > 0) this.state = 'backdash';
    else if (this.slideT > 0) this.state = 'slide';
    else if (!this.onGround) this.state = 'jump';
    else if (this.runT > 0 && Math.abs(this.vx) > 10) this.state = 'run';
    else if (this.crouching) this.state = 'crouch';
    else if (Math.abs(this.vx) > 10) this.state = 'walk';
    else this.state = 'idle';
    if (this.state === 'run' || (this.runT > 0 && this.onGround && Math.abs(this.vx) > 10)) {
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
        this._resolveSafeHeight(level, false);
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
      downAim: !!(input && input.down && input.down.down),
      isSkill,
      guarding: weapon.category === 'shield' && (slot === 0 ? !!input.down.attack : !!input.down.offhand),
      firedProj: false,
      hitEnemies: new Map(),
      hitCandles: false,
      hitBlocks: false,
    };
    this.slots[slot] = s;

    // Category & Skill movement impulses (never slow down an active run!)
    if (isSkill && weapon.skill.dashVx) {
      this.vx = this.facing * Math.max(Math.abs(this.vx), weapon.skill.dashVx);
    } else if (weapon.category === 'brawler' && weapon.lungeVx) {
      this.vx = this.facing * Math.max(Math.abs(this.vx), weapon.lungeVx);
    } else if (weapon.category === 'standard_blade' && this.onGround && !this.crouching && weapon.stepVx && this.runT <= 0) {
      if (input.axis === 0 || input.axis === this.facing) {
        this.vx = this.facing * weapon.stepVx;
      }
    } else if (weapon.category === 'heavy_blade' && this.onGround && this.runT <= 0) {
      this.vx = 0;
    }
    if (isSkill && weapon.skill.popVy && this.h >= PLAYER.height) {
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
      const baseReach = weapon.reach || PLAYER.whipReach;
      this.whipReach = Math.round(baseReach * (hasRelic('library') ? 1.28 : 1) * (isSkill ? 1.28 : 1));
      this.whipTime = (weapon.duration || PLAYER.whipTime) * whipScale;
      const wa0 = weapon.active ? weapon.active[0] : PLAYER.whipActive[0];
      const wa1 = weapon.active ? weapon.active[1] : PLAYER.whipActive[1];
      this.whipActive = [wa0 * whipScale, wa1 * whipScale];
      this.whipColor = weapon.bladeColor || '#6b4a2b';
      this.whipTipColor = weapon.trimColor || '#e8e2c8';
      this.whipAimDy = 0;
      if (weapon.trackingWhip && world && world.enemies) {
        let bestD = 148;
        const handY = this.y - (this.crouching ? 28 : 44);
        for (const e of world.enemies) {
          if (!e.alive) continue;
          const dx = (e.x - this.x) * this.facing;
          if (dx < 8 || dx > this.whipReach + 28) continue;
          const dy = (e.y - e.h * 0.5) - handY;
          if (Math.abs(dy) > 48) continue;
          const d = Math.hypot(dx, dy);
          if (d < bestD) {
            bestD = d;
            this.whipAimDy = Math.max(-36, Math.min(36, dy));
          }
        }
      }
      s.duration = this.whipTime;
      s.win0 = this.whipActive[0];
      s.win1 = this.whipActive[1];
      s.reach = this.whipReach;
      this.attackT = 0;
      this.attackHit = false;
      this.throwing = false;
      this.attackCrouch = this.crouching;
      this.attackDown = s.downAim;
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
      const fanCount = (sk && sk.swordFan) ? 3 : 1;
      for (let fi = 0; fi < fanCount; fi++) {
        const pr = attachMeta(new Projectile('weapon_boomerang', spawnX, spawnY, this.facing, 'player'), sk && sk.mult ? (fanCount > 1 ? 0.92 : sk.mult) : 1);
        pr.weaponId = w.id;
        pr.weaponElement = w.element;
        pr.handSlot = s.slot;
        pr.maxDist = Math.round((w.reach || 155) * (sk && sk.fastLoop ? 1.32 : 1.0));
        if (sk && sk.fastLoop) {
          pr.vx = this.facing * 410;
          pr.returnSpeed = 430;
        }
        if (fanCount > 1) {
          pr.vy = (fi - 1) * 72;
        }
        world.spawnProjectile(pr);
      }
      return;
    }

    if (w.category === 'catalyst') {
      const boltType = w.boltType || 'catalyst_fire';
      const defaultCount = w.globusBounce ? 2 : 1;
      const count = (sk && sk.spread) ? sk.spread : defaultCount;
      for (let i = 0; i < count; i++) {
        const pr = attachMeta(new Projectile(boltType, spawnX, spawnY, this.facing, 'player'), count > 1 ? 0.85 : 1.0);
        if (w.globusBounce) {
          const dirSign = i % 2 === 0 ? -1 : 1;
          pr.vy = dirSign * (135 + Math.floor(i / 2) * 55);
        } else if (count > 1) {
          const offset = i - (count - 1) * 0.5;
          pr.vy = offset * 68;
        }
        if (sk && sk.overbeam) {
          pr.h = 26;
          pr.damage = Math.round(pr.damage * 1.45 * 10) / 10;
        }
        world.spawnProjectile(pr);
      }
      return;
    }

    // Thanatos Soul Scythe passive: spawns a seeking spectral mini-sickle on every cleave!
    if (w.spawnMiniScythe) {
      const nSickles = (sk && sk.sickleBurst) ? sk.sickleBurst : 1;
      for (let si = 0; si < nSickles; si++) {
        const pr = attachMeta(new Projectile('mini_sickle', spawnX + this.facing * 12, spawnY - 8, this.facing, 'player'), 0.55);
        pr.vy = -70 + (si - (nSickles - 1) * 0.5) * 65;
        world.spawnProjectile(pr);
      }
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
  _startSprint(dir, world, autoSteer = false) {
    this.runT = 0.0001;
    this.runDir = dir;
    this.runDist = 0;
    this.dashTapDir = 0;
    this.dashTapT = 0;
    this._sprintAutoSteer = !!autoSteer;
    this.sprintBurstT = autoSteer ? PLAYER.dashTime : 0;
    this.facing = dir;
    this.turnT = 0;
    if (world) {
      world.sfx('dash');
      if (world.particles) world.particles.dust(this.x - dir * 8, this.y, 6);
      if (world.camera && world.camera.shake) world.camera.shake(1.2, 0.07);
    }
  }

  _startSlide(relicSpeedMul, world) {
    this._clearSlots();
    this.runT = 0;
    this._sprintAutoSteer = false;
    this.sprintBurstT = 0;
    this.slideT = PLAYER.slideTime;
    this.slideCd = 0.24;
    if (this._slideHitMap) this._slideHitMap.clear();
    this.crouching = true;
    this.h = PLAYER.slideHeight;
    this.vx = this.facing * PLAYER.slideSpeed * relicSpeedMul;
    this.pushAfterimage('rgba(120, 225, 255, 0.56)', 0.22);
    if (world) {
      world.sfx('dash');
      world.particles.dust(this.x - this.facing * 10, this.y, 6);
      world.particles.sparks(this.x + this.facing * 10, this.y - 4, 4, '#ffe89e');
      if (world.onMovementWake) world.onMovementWake(this, 'slide');
    }
  }

  headBlocked(level) {
    if (!level) return false;
    const ty0 = Math.floor(this.top / TILE);
    const ty1 = Math.floor((this.bottom - 0.01) / TILE);
    const tx0 = Math.floor(this.left / TILE), tx1 = Math.floor((this.right - 0.01) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      // Climbing a staircase sinks the uphill foot into the top landing's lip: not a ceiling.
      if (this.isStairLipRow(ty)) continue;
      for (let tx = tx0; tx <= tx1; tx++) if (level.isSolid(tx, ty)) return true;
    }
    return false;
  }

  /** Picks the tallest safe stance (`height` -> `crouchHeight` -> `slideHeight`) that does not overlap a ceiling. */
  _resolveSafeHeight(level, wantCrouch = false) {
    if (!level) {
      this.crouching = !!wantCrouch;
      this.h = wantCrouch ? PLAYER.crouchHeight : PLAYER.height;
      return;
    }
    if (!wantCrouch) {
      this.h = PLAYER.height;
      if (!this.headBlocked(level)) {
        this.crouching = false;
        return;
      }
    }
    this.crouching = true;
    this.h = PLAYER.crouchHeight;
    if (this.headBlocked(level)) {
      this.h = PLAYER.slideHeight;
    }
  }

  /** True if an unbreakable solid wall blocks horizontal motion `dir` (-1/+1) at `height`. */
  _wallAheadAtHeight(level, dir, height = PLAYER.slideHeight) {
    if (!level || !dir) return false;
    const probeX = dir > 0 ? this.right + 1.5 : this.left - 1.5;
    const tx = Math.floor(probeX / TILE);
    const ty0 = Math.floor((this.y - height) / TILE);
    const ty1 = Math.floor((this.y - 0.01) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) {
      if (level.isSolid(tx, ty) && level.tile(tx, ty) !== T_BLOCK) return true;
    }
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
    this._resolveSafeHeight(world && world.level, false);
    const dir = fromX > this.x ? -1 : 1;
    const kb = (d.knockbackMul == null ? 1 : d.knockbackMul) * (hasRelic('yule') ? 0.5 : 1) * (guarded ? 0.35 : 1);
    this.vx = dir * 150 * kb;
    this.vy = this.h < PLAYER.height ? 0 : (guarded ? -95 * kb : -230 * kb);
    if (this.vy < 0) this.onGround = false;
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

    // Translucent cyan/violet phantom afterimages (Backdash, Slide, Divekick, Super-Jump, Magnes)
    if (this.afterimages && this.afterimages.length) {
      for (const gh of this.afterimages) {
        const ga = Math.max(0, 1 - gh.t / gh.dur) * 0.52;
        if (ga <= 0.02) continue;
        const gfr = heroFrame(assets, gh);
        assets.draw(ctx, gfr.sheet, gfr.name, gh.x - camX, gh.y - camY, gh.facing < 0, ga, 1, gh.color);
      }
    }

    // Active Lodestone Magnet Tether (`Magnes`) electric cobalt beam
    if (this.tetherNode) {
      const mx = Math.round(this.tetherNode.x - camX);
      const my = Math.round(this.tetherNode.y - camY);
      const hx = Math.round(x);
      const hy = Math.round(y - 34);
      ctx.save();
      ctx.strokeStyle = '#38d8ff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      const midX = (hx + mx) * 0.5 + Math.sin(this.idleT * 42 + this.x * 0.1) * 5;
      const midY = (hy + my) * 0.5 + Math.cos(this.idleT * 37) * 5;
      ctx.lineTo(midX, midY);
      ctx.lineTo(mx, my);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

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
      // Whip body frame + the procedural lash flying out / cracking / dropping (curves toward foes for Nebula!).
      const lashWithAim = Object.assign({}, fr.lash, { aimDy: this.whipAimDy || 0 });
      drawWhipFrame(ctx, assets, fr.sheet, fr.name, x, y, flip, alpha, this.whipReach, lashWithAim,
        null, null, null, this.whipColor || '#6b4a2b', this.whipTipColor || '#e8e2c8');
    } else {
      assets.draw(ctx, fr.sheet, fr.name, x, y, flip, alpha, 1, null, this.spriteXf());
    }

    // Aerial Diagonal Divekick glowing comet boot spear
    if (this.divekickT > 0 && !this.onGround) {
      ctx.save();
      ctx.translate(Math.round(x + this.facing * 10), Math.round(y - 8));
      if (flip) ctx.scale(-1, 1);
      ctx.fillStyle = '#ff6a9e';
      ctx.beginPath();
      ctx.moveTo(12, 8); ctx.lineTo(-8, -10); ctx.lineTo(-2, -12); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(4, 2, 6, 4);
      ctx.restore();
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

    // Dual-Hand weapon visual arcs, needle thrusts, 2H cleaves, fist blitzes & side-perspective shields
    const fxl = getFxLayers();
    if (this.handWeapons && this.state !== 'dead' && this.state !== 'stairs') {
      const carryState = (this.state === 'walk' && this.runT > 0) ? 'run' : this.state;
      const stridePhase = carryState === 'run'
        ? (this.runFrame / 8) * Math.PI * 2
        : (carryState === 'walk' ? (this.walkFrame / Math.max(1, this.walkFrames || 6)) * Math.PI * 2 : 0);
      let firstCarriedShield = false;
      for (let si = 0; si < 2; si++) {
        const hw = this.handWeapons[si];
        const s = this.slots[si];
        if (hw && hw.category === 'shield' && !(s && s.active)) {
          drawCarriedShield(ctx, hw, x, y, this.facing, carryState, this.crouching, stridePhase, alpha, firstCarriedShield);
          firstCarriedShield = true;
        }
      }
    }
    for (let si = 0; si < 2; si++) {
      const s = this.slots[si];
      if (s && s.active && s.weapon && s.weapon.category !== 'whip') {
        drawWeaponAction(ctx, s, x, y, this.facing, this.crouching, fxl, this.idleT + this.animT, fr.name);
      }
    }
  }
}
