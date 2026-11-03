// Hunter animation clips.
//
// One place that turns plain hunter state (the local Player or a remote network
// hunter) into the sheet + frame to draw, so both render identically. The clip
// sheets are generated from Gemini Omni video with tools/animate_sprites.py and
// are all optional: when one is missing the classic hero.png poses are used, so
// the game never depends on a clip having been generated.
//
// The whip is the one place the frames are not enough: a crack is a travelling
// wave, not a pose. During the extension and the live hit-box window the body
// comes from the painted frame and the lash is drawn procedurally per tick
// (see `whipPhase` / `drawWhipFrame`), then the painted slack frames take over.

import { PLAYER } from '../engine/constants.js';

/** Walk cycle: one frame per this many pixels travelled (deliberate, weighty stride), with a gentle floor. */
export const WALK_PX_PER_FRAME = 14.2;
export const WALK_MIN_FPS = 2.8;

export const IDLE_FPS = 6;
export const FIDGET_AFTER = 5.0;        // seconds of standing still before the idle fidget
export const FIDGET_FPS = 8;
export const DEATH_FPS = 8;
export const HURT_FLINCH = 0.12;        // seconds of the first hurt frame
export const LAND_TIME = 0.20;          // hard landing: land0 then land1 (+ squash)
export const LAND_SOFT_TIME = 0.08;     // soft landing: land1 only
export const LAUNCH_TIME = 0.08;        // take-off stretch
export const TURN_TIME = 0.08;          // skid frame on a direction change
export const CROUCH_BLEND = 0.05;       // half-crouch in-between on the way down / up
export const DASH_FRAMES = 7;           // dash0 crouch, dash1 launch, dash2..4 sprint, dash5 brake, dash6 settle
export const RUN_PX_PER_FRAME = 11.5;   // sprint cycle: one of 8 frames per ~11.5 px travelled (~17 fps at full speed)
export const RUN_LAUNCH = 0.10;         // seconds of the explosive launch frame when a sprint starts
export const WHIP_EXTEND_MAX = 0.07;    // seconds the lash takes to fly out before the hit box is live

export function walkAdvance(vx, dt) {
  return Math.max(WALK_MIN_FPS, Math.abs(vx) / WALK_PX_PER_FRAME) * dt;
}

export function walkFrameCount(assets) {
  return assets.info('hero_walk8') ? 8 : 6;
}

/** Walk frames whose boot hits the ground (footstep events). */
export function isStepFrame(frame, count) {
  return count === 8 ? (frame === 0 || frame === 4) : (frame === 0 || frame === 3);
}

function frameCount(assets, sheet, prefix) {
  const info = assets.info(sheet);
  if (!info || !info.frames) return 0;
  let n = 0;
  while (info.frames[prefix + n]) n++;
  return n;
}

/** Jump pose from vertical speed (negative = rising). */
function jumpName(vy) {
  if (vy == null) return 'apex';
  if (vy < -330) return 'rise0';
  if (vy < -90) return 'rise1';
  if (vy <= 90) return 'apex';
  if (vy < 330) return 'fall0';
  return 'fall1';
}

/**
 * Where the whip is inside its swing. Times are the hunter's own (whipTime,
 * whipActive), so the hit box (`attackT >= whipActive[0]`) and the picture
 * agree tick for tick however the Chrono Pendulum rescales the lash.
 *
 *   wind-up   [0, a0 - ext)      painted anticipation frames
 *   extend    [a0 - ext, a0)     extended-arm body + lash flying out (k 0..1)
 *   live      [a0, a1)           body frames 3/4/5 + lash: crack, overshoot, tip drop (k 0..1)
 *   slack     [a1, T)            painted follow-through frames
 */
export function whipPhase(s) {
  const T = s.whipTime || PLAYER.whipTime;
  const a0 = s.whipActive ? s.whipActive[0] : PLAYER.whipActive[0];
  const a1 = s.whipActive ? s.whipActive[1] : PLAYER.whipActive[1];
  const t = Math.max(0, Math.min(T - 0.0001, s.attackT || 0));
  const ext = Math.min(WHIP_EXTEND_MAX, a0 * 0.55);
  if (t < a0 - ext) return { mode: 'windup', k: t / Math.max(0.001, a0 - ext) };
  if (t < a0) return { mode: 'extend', k: (t - (a0 - ext)) / ext };
  if (t < a1) return { mode: 'live', k: (t - a0) / Math.max(0.001, a1 - a0) };
  return { mode: 'slack', k: (t - a1) / Math.max(0.001, T - a1) };
}

/**
 * Resolves active non-whip weapon animation descriptor `{ category, k, crouch, guarding }`
 * from either local `Player.slots` or remote network peer `meleeAnim`.
 */
export function activeMeleeAnim(s) {
  if (s.meleeAnim && s.meleeAnim.category && s.meleeAnim.category !== 'whip') {
    return s.meleeAnim;
  }
  if (!Array.isArray(s.slots)) return null;
  let best = null;
  for (let i = 0; i < s.slots.length; i++) {
    const sl = s.slots[i];
    if (!sl || !sl.active || !sl.weapon || sl.weapon.category === 'whip') continue;
    // Prefer an active swing/thrust over a held shield guard
    if (!best || (best.guarding && !sl.guarding)) best = sl;
  }
  if (!best) return null;
  const dur = Math.max(0.05, best.duration || best.weapon.duration || 0.3);
  return {
    category: best.weapon.category,
    k: Math.max(0, Math.min(1, (best.timer || 0) / dur)),
    crouch: !!(best.crouch || s.crouching),
    guarding: !!best.guarding,
    airborne: s.onGround === false || s.state === 'jump',
  };
}

/**
 * Picks the martial body pose from `hero_sword` / `hero_csword` for sword,
 * rapier, greatsword, brawler, shield, boomerang, and catalyst actions.
 */
function pickMeleeFrame(assets, m) {
  const hasSword = !!assets.info('hero_sword');
  const hasCSword = !!assets.info('hero_csword');
  if (!hasSword) return null;

  const { category, k, crouch, guarding, airborne } = m;

  if (guarding && category === 'shield') {
    if (crouch && hasCSword) return { sheet: 'hero_csword', name: 'cslash1', lash: null };
    return { sheet: 'hero_sword', name: 'thrust0', lash: null };
  }

  if (airborne && !crouch) {
    if (category === 'heavy_blade' && k < 0.28) return { sheet: 'hero_sword', name: 'heavy0', lash: null };
    if (category === 'standard_blade' && k < 0.24) return { sheet: 'hero_sword', name: 'slash0', lash: null };
    return { sheet: 'hero_sword', name: 'airslash', lash: null };
  }

  if (crouch && hasCSword) {
    if (category === 'light_blade') {
      const nm = k < 0.24 ? 'cslash0' : (k < 0.78 ? 'cslash2' : 'cslash1');
      return { sheet: 'hero_csword', name: nm, lash: null };
    }
    const nm = k < 0.28 ? 'cslash0' : (k < 0.68 ? 'cslash1' : 'cslash2');
    return { sheet: 'hero_csword', name: nm, lash: null };
  }

  switch (category) {
    case 'light_blade': {
      // Nimble fencing coil -> deep extended lunge thrust -> crisp recovery
      const nm = k < 0.22 ? 'thrust0' : (k < 0.78 ? 'thrust1' : 'thrust0');
      return { sheet: 'hero_sword', name: nm, lash: null };
    }
    case 'standard_blade': {
      // 1H overhead wind-up -> stepping horizontal slash -> low diagonal follow-through
      const nm = k < 0.26 ? 'slash0' : (k < 0.66 ? 'slash1' : 'slash2');
      return { sheet: 'hero_sword', name: nm, lash: null };
    }
    case 'heavy_blade': {
      // 2H high back-shoulder heave -> driving mid-cleave -> crushing low two-handed slam
      const nm = k < 0.30 ? 'heavy0' : (k < 0.56 ? 'slash1' : 'heavy1');
      return { sheet: 'hero_sword', name: nm, lash: null };
    }
    case 'brawler': {
      const nm = k < 0.18 ? 'thrust0' : ((Math.floor(k * 4) & 1) === 0 ? 'alt1' : 'slash1');
      return { sheet: 'hero_sword', name: nm, lash: null };
    }
    case 'shield': {
      const nm = k < 0.28 ? 'thrust0' : 'alt1';
      return { sheet: 'hero_sword', name: nm, lash: null };
    }
    default: {
      // Boomerang / Catalyst cast
      const nm = k < 0.28 ? 'alt0' : 'slash1';
      return { sheet: 'hero_sword', name: nm, lash: null };
    }
  }
}

/**
 * Frame of the double-tap dash clip from the dash phase `k` (1 = just started, 0 = done):
 * crouch anticipation (1 tick) -> explosive launch -> 3 streamlined sprint strides cycling
 * at speed -> braking skid -> upright settle. Falls back to the walk cycle without the clip.
 */
export function dashName(k) {
  if (k > 0.94) return 'dash0';
  if (k > 0.82) return 'dash1';
  if (k > 0.30) {
    const stride = Math.floor(((0.82 - k) / 0.52) * 6) % 3;   // ~2 cycles of 3 strides
    return 'dash' + (2 + stride);
  }
  if (k > 0.12) return 'dash5';
  return 'dash6';
}

/**
 * Picks the frame for a hunter.
 *
 * `s` is plain state: state ('idle' | 'walk' | 'jump' | 'crouch' | 'attack' |
 * 'hurt' | 'dead'), walkFrame, attackT, whipTime, whipActive, throwing,
 * attackCrouch, vy, landT, landHard, launchT, hurtT, deadT, idleT, fidgetT,
 * turnT, crouchBlendT, slots / meleeAnim. Missing fields fall back gracefully.
 *
 * Returns { sheet, name, lash }: when `lash` is set the frame is a whip body
 * whose lash must be drawn procedurally (`drawWhipFrame`), with lash.mode
 * 'extend' | 'live' and lash.k the phase 0..1.
 */
export function heroFrame(assets, s) {
  const has = (sheet) => !!assets.info(sheet);
  const pick = (sheet, name, lash = null) => ({ sheet, name, lash });

  // Non-whip martial weapons (swords, rapiers, greatswords, brawlers, shields, catalysts)
  // drive dedicated swordsmanship & martial body stances when not hurt, dead, or whipping.
  if (s.state !== 'hurt' && s.state !== 'dead' && s.state !== 'attack') {
    const melee = activeMeleeAnim(s);
    if (melee) {
      const mf = pickMeleeFrame(assets, melee);
      if (mf) return mf;
    }
  }

  switch (s.state) {
    case 'attack': {
      if (s.throwing) {
        if (has('hero_sword')) return pick('hero_sword', (s.attackT || 0) < 0.08 ? 'alt0' : 'slash1');
        return pick('hero', 'whip1');
      }
      const ph = whipPhase(s);
      const lash = ph.mode === 'extend' || ph.mode === 'live' ? { mode: ph.mode, k: ph.k } : null;
      if (s.attackCrouch) {
        if (has('hero_cwhip')) {
          if (ph.mode === 'windup') return pick('hero_cwhip', 'cwhip0');
          if (ph.mode === 'extend') return pick('hero_cwhip', 'cwhip1', lash);
          if (ph.mode === 'live') return pick('hero_cwhip', ph.k < 0.5 ? 'cwhip1' : 'cwhip2', lash);
          return pick('hero_cwhip', 'cwhip3');
        }
        // Classic crouch pose: the low lash is drawn over it from the hip.
        return pick('hero', 'crouch', lash ? Object.assign({ fromHip: true }, lash) : null);
      }
      if (has('hero_whip')) {
        if (ph.mode === 'windup') return pick('hero_whip', ph.k < 0.5 ? 'whip0' : 'whip1');
        if (ph.mode === 'extend') return pick('hero_whip', 'whip3', lash);
        if (ph.mode === 'live') return pick('hero_whip', 'whip' + (3 + Math.min(2, Math.floor(ph.k * 3))), lash);
        return pick('hero_whip', ph.k < 0.5 ? 'whip6' : 'whip7');
      }
      if (ph.mode === 'windup') return pick('hero', 'whip0');
      return pick('hero', 'whip1', lash);
    }
    case 'hurt':
      if (has('hero_hurt')) {
        const hurtT = s.hurtT == null ? 0 : s.hurtT;
        return pick('hero_hurt', hurtT > PLAYER.hurtTime - HURT_FLINCH ? 'hurt0' : 'hurt1');
      }
      return pick('hero', 'hurt');
    case 'dead':
      if (has('hero_hurt')) {
        const i = Math.min(5, Math.floor((s.deadT || 0) * DEATH_FPS));
        return pick('hero_hurt', 'die' + i);
      }
      return pick('hero', 'hurt');
    case 'jump':
      if (has('hero_jump')) return pick('hero_jump', jumpName(s.vy));
      return pick('hero', 'jump');
    case 'dash': {
      const k = s.dashK != null ? s.dashK : (s.dashT != null ? s.dashT / PLAYER.dashTime : 0.5);
      if (has('hero_dash')) return pick('hero_dash', dashName(k));
      if (has('hero_walk8')) return pick('hero_walk8', 'walk' + (Math.floor((1 - k) * 12) % 8));
      return pick('hero', 'walk' + (Math.floor((1 - k) * 12) % 6));
    }
    case 'run': {
      // Explosive launch pose for the first ticks of a double-tap sprint, then the 8-frame run cycle.
      if (has('hero_dash') && s.runT != null && s.runT < RUN_LAUNCH) return pick('hero_dash', 'dash1');
      if (has('hero_run')) return pick('hero_run', 'run' + ((s.runFrame || 0) % 8));
      if (has('hero_walk8')) return pick('hero_walk8', 'walk' + ((s.runFrame || 0) % 8));
      return pick('hero', 'walk' + ((s.runFrame || 0) % 6));
    }
    case 'crouch':
      if (has('hero_jump') && s.crouchBlendT > 0) return pick('hero_jump', 'land1');
      if (s.noWhip && has('hero_csword')) return pick('hero_csword', 'crouch_nowhip');
      return pick('hero', 'crouch');
    case 'walk': {
      if (has('hero_turn') && s.turnT > 0) return pick('hero_turn', s.turnT > TURN_TIME / 2 ? 'turn0' : 'turn1');
      // A hard landing still shows the squash for a few ticks before the stride resumes.
      if (has('hero_jump') && s.landHard && s.landT > LAND_TIME - 0.06) return pick('hero_jump', 'land0');
      if (has('hero_walk8')) return pick('hero_walk8', 'walk' + ((s.walkFrame || 0) % 8));
      if (has('hero_walk')) return pick('hero_walk', 'walk' + ((s.walkFrame || 0) % 6));
      return pick('hero', 'walk' + ((s.walkFrame || 0) % 6));
    }
    default: {
      if (has('hero_turn') && s.turnT > 0) return pick('hero_turn', s.turnT > TURN_TIME / 2 ? 'turn0' : 'turn1');
      if (has('hero_jump') && s.crouchBlendT > 0) return pick('hero_jump', 'land1');
      if (has('hero_jump') && s.landT > 0) {
        return pick('hero_jump', s.landHard && s.landT > LAND_TIME / 2 ? 'land0' : 'land1');
      }
      if (!s.noWhip && has('hero_fidget') && s.fidgetT != null && s.fidgetT >= 0) {
        const n = frameCount(assets, 'hero_fidget', 'fidget');
        return pick('hero_fidget', 'fidget' + Math.min(n - 1, Math.floor(s.fidgetT * FIDGET_FPS)));
      }
      if (s.noWhip && has('hero_csword')) {
        return pick('hero_csword', 'idle_nowhip');
      }
      if (has('hero_idle')) {
        const n = frameCount(assets, 'hero_idle', 'idle') || 6;
        return pick('hero_idle', 'idle' + (Math.floor((s.idleT || 0) * IDLE_FPS) % n));
      }
      return pick('hero', 'idle');
    }
  }
}

/** Length of the idle fidget clip in seconds (0 when there is none). */
export function fidgetLength(assets) {
  return frameCount(assets, 'hero_fidget', 'fidget') / FIDGET_FPS;
}

/** Squash / stretch for the hunter sprite: { sx, sy } or null when at rest. */
export function heroScale(s) {
  if (s.state === 'dead' || s.state === 'attack' || s.state === 'hurt') return null;
  if (s.state === 'run') {
    // Launch stretch that relaxes into a steady 4% forward lean-stretch while sprinting.
    const t = s.runT != null ? s.runT : 1;
    const e = Math.max(0, 1 - t / 0.22);
    return { sx: 1.04 + 0.12 * e, sy: 1 - 0.03 - 0.07 * e };
  }
  if (s.state === 'dash') {
    // Launch: bold horizontal stretch that relaxes through the sprint; brake: short squash.
    const k = s.dashK != null ? s.dashK : (s.dashT != null ? s.dashT / PLAYER.dashTime : 0.5);
    if (k > 0.94) return { sx: 1.10, sy: 0.90 };
    if (k > 0.55) { const e = (k - 0.55) / 0.39; return { sx: 1 + 0.16 * e, sy: 1 - 0.10 * e }; }
    if (k < 0.30 && k > 0.12) { const e = (0.30 - k) / 0.18; return { sx: 1 + 0.08 * e, sy: 1 - 0.06 * e }; }
    return null;
  }
  if (s.landT > 0 && s.landHard && s.state !== 'jump') {
    const k = Math.pow(Math.min(1, s.landT / LAND_TIME), 1.6);   // hard in, eased out
    return { sx: 1 + 0.18 * k, sy: 1 - 0.20 * k };
  }
  if (s.launchT > 0 && s.state === 'jump') {
    const k = Math.min(1, s.launchT / LAUNCH_TIME);
    return { sx: 1 - 0.08 * k, sy: 1 + 0.12 * k };
  }
  return null;
}

// --------------------------------------------------------------------------
// Whip lash
// --------------------------------------------------------------------------

const anchorCache = new Map();

/**
 * Where the painted lash leaves the body in a whip frame: `bodyW` columns of
 * body (hips + extended arm) and the hand row `hy`, found by scanning the
 * frame once for the row the thin painted lash occupies beyond the body.
 */
export function lashAnchor(assets, sheet, name) {
  const key = sheet + '|' + name;
  let a = anchorCache.get(key);
  if (a) return a;
  const f = assets.frame(sheet, name);
  if (!f) return null;
  const bodyW = sheet === 'hero' && name === 'whip1' ? 34 : Math.min(f.w - 4, Math.round(f.ax + 14));
  let hy = Math.round(f.h * 0.2);
  try {
    const c = document.createElement('canvas');
    c.width = f.w; c.height = f.h;
    const g = c.getContext('2d');
    g.drawImage(assets.img(sheet), f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    const d = g.getImageData(0, 0, f.w, f.h).data;
    let best = -1;
    for (let y = 0; y < f.h; y++) {
      let n = 0;
      for (let x = bodyW; x < f.w; x++) if (d[(y * f.w + x) * 4 + 3] > 0) n++;
      if (n > best) { best = n; hy = y; }
    }
    if (best <= 0) {
      // No painted lash beyond the body (crouch frames): use the arm's topmost row + 2.
      for (let y = 0; y < f.h; y++) {
        let hit = false;
        for (let x = bodyW - 6; x < bodyW; x++) if (d[(y * f.w + x) * 4 + 3] > 0) { hit = true; break; }
        if (hit) { hy = Math.min(f.h - 1, y + 2); break; }
      }
    }
  } catch (e) { /* no pixel readback: keep the estimate */ }
  a = { bodyW, hy };
  anchorCache.set(key, a);
  return a;
}

/**
 * Points of the lash (local space: hand at the origin, +x forward, y down)
 * for a phase: 'extend' flies out with a travelling S-wave, 'live' cracks
 * (overshoot + decaying tip wave) and then lets the tip drop.
 */
export function lashPoints(reach, lash, segments = 14) {
  const pts = [];
  const { mode, k } = lash;
  let len, amp, speed, lift, drop;
  if (mode === 'extend') {
    len = reach * (0.22 + 0.78 * k);
    amp = 7 * (1 - 0.5 * k);           // wave while the lash unrolls
    speed = 1.6;
    lift = 14 * (1 - k);               // comes down from the overhead arc
    drop = 0;
  } else {
    const settle = Math.exp(-k * 6);
    len = reach * (1 + 0.05 * settle * Math.cos(k * 22));
    amp = 3.5 * Math.exp(-k * 5);
    speed = 3.2;
    lift = 0;
    const fall = Math.max(0, (k - 0.5) / 0.5);
    drop = fall * fall * 28;
    len *= 1 - 0.12 * fall * fall;
  }
  for (let i = 0; i <= segments; i++) {
    const s = i / segments;
    const wave = amp * Math.sin(2 * Math.PI * (s * 1.4 - k * speed)) * (mode === 'extend' ? (1 - s) : s);
    const y = wave - lift * Math.sin(Math.PI * s) + drop * Math.pow(s, 2.4);
    pts.push([Math.round(len * s), Math.round(y)]);
  }
  return pts;
}

/**
 * Draws a whip body frame plus the procedural lash from its hand. `img` may be
 * a tinted copy of the frame (then sx/sy are 0). When `lash.fromHip` is set
 * (classic crouch pose) the whole frame is drawn and the lash leaves the hip.
 */
export function drawWhipFrame(ctx, assets, sheet, name, x, y, flip, alpha, reach, lash,
  img = null, sx = null, sy = null, color = '#6b4a2b', tipColor = '#e8e2c8') {
  const f = assets.frame(sheet, name);
  if (!f) return;
  img = img || assets.img(sheet);
  sx = sx == null ? f.x : sx;
  sy = sy == null ? f.y : sy;
  reach = reach || PLAYER.whipReach;
  const a = lash.fromHip ? { bodyW: f.w, hy: f.h - 30 } : lashAnchor(assets, sheet, name);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(Math.round(x), Math.round(y - f.ay));
  if (flip) ctx.scale(-1, 1);
  const ox = Math.round(-f.ax);
  ctx.drawImage(img, sx, sy, a.bodyW, f.h, ox, 0, a.bodyW, f.h);
  // Lash from the hand: a 2 px line of integer points keeps the pixel look.
  const hx = lash.fromHip ? 8 : ox + a.bodyW - 1;
  const hy = a.hy;
  const pts = lashPoints(reach, lash);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(hx + pts[i][0], hy + pts[i][1]);
  ctx.stroke();
  // Knotted tip (brighter on the crack tick).
  const [tx, ty] = pts[pts.length - 1];
  const crack = lash.mode === 'live' && lash.k < 0.2;
  ctx.fillStyle = crack ? '#ffffff' : tipColor;
  ctx.fillRect(hx + tx - 1, hy + ty - 1, 3, 3);
  if (crack) { ctx.fillRect(hx + tx - 3, hy + ty, 7, 1); ctx.fillRect(hx + tx, hy + ty - 3, 1, 7); }
  ctx.restore();
}

/** World-space tip of the lash for events (sparks on the crack). */
export function lashTip(x, y, facing, reach, crouch) {
  return { x: x + facing * (8 + reach), y: y - (crouch ? 30 : 44) };
}
