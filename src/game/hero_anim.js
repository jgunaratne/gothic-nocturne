// Hunter animation clips.
//
// One place that turns plain hunter state (the local Player or a remote network
// hunter) into the sheet + frame to draw, so both render identically. The clip
// sheets are generated from Gemini Omni video with tools/animate_sprites.py and
// are all optional: when one is missing the classic hero.png poses are used, so
// the game never depends on a clip having been generated.

import { PLAYER } from '../engine/constants.js';

/** Walk cycle: one frame per this many pixels travelled (feet never slide), with a floor. */
export const WALK_PX_PER_FRAME = 9.5;
export const WALK_MIN_FPS = 5;

export const IDLE_FPS = 5;
export const DEATH_FPS = 8;
export const HURT_FLINCH = 0.12;        // seconds of the first hurt frame
export const LAND_TIME = 0.16;          // hard landing: land0 then land1
export const LAND_SOFT_TIME = 0.08;     // soft landing: land1 only
export const LAUNCH_TIME = 0.07;        // take-off stretch

// Whip timeline in normalized time u = attackT / whipTime. The frame boundaries
// are tied to PLAYER.whipActive so the fully extended frames (3-5) are exactly
// the ticks the hit box is live, however the Chrono Pendulum relic rescales the
// whip: 0-2 wind-up, 3-5 crack / extended, 6-7 slack + recoil.
const A0 = PLAYER.whipActive[0] / PLAYER.whipTime;   // 0.325
const A1 = PLAYER.whipActive[1] / PLAYER.whipTime;   // 0.775
const WHIP_U = [0, A0 / 3, A0 * 2 / 3, A0, A0 + (A1 - A0) / 3, A0 + (A1 - A0) * 2 / 3, A1, A1 + (1 - A1) / 2];
const WHIP_STRETCH = new Set([3, 4, 5]);            // painted lash stretched to whipReach
const CWHIP_U = [0, A0, A0 + (A1 - A0) / 2, A1];
const CWHIP_STRETCH = new Set([1, 2]);

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

function phaseIndex(bounds, u) {
  let i = 0;
  for (let k = 1; k < bounds.length; k++) if (u >= bounds[k]) i = k;
  return i;
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
 * Picks the frame for a hunter.
 *
 * `s` is plain state: state ('idle' | 'walk' | 'jump' | 'crouch' | 'attack' |
 * 'hurt' | 'dead'), walkFrame, attackT, whipTime, whipActive, throwing,
 * attackCrouch, vy, landT, landHard, hurtT, deadT, idleT. Missing fields fall
 * back gracefully (remote hunters only send a subset).
 *
 * Returns { sheet, name, stretch, proceduralLash }: `stretch` marks an extended
 * whip frame whose painted lash must be stretched to the hunter's reach,
 * `proceduralLash` the classic crouch pose that needs the drawn low lash.
 */
export function heroFrame(assets, s) {
  const has = (sheet) => !!assets.info(sheet);
  const whipTime = s.whipTime || PLAYER.whipTime;
  const active0 = s.whipActive ? s.whipActive[0] : PLAYER.whipActive[0];
  const pick = (sheet, name, extra) => Object.assign({ sheet, name, stretch: false, proceduralLash: false }, extra);

  switch (s.state) {
    case 'attack': {
      if (s.throwing) return pick('hero', 'whip1');
      const u = Math.max(0, Math.min(0.999, (s.attackT || 0) / whipTime));
      if (s.attackCrouch) {
        if (has('hero_cwhip')) {
          const i = phaseIndex(CWHIP_U, u);
          return pick('hero_cwhip', 'cwhip' + i, { stretch: CWHIP_STRETCH.has(i) });
        }
        return pick('hero', 'crouch', { proceduralLash: true });
      }
      if (has('hero_whip')) {
        const i = phaseIndex(WHIP_U, u);
        return pick('hero_whip', 'whip' + i, { stretch: WHIP_STRETCH.has(i) });
      }
      const name = (s.attackT || 0) < active0 ? 'whip0' : 'whip1';
      return pick('hero', name, { stretch: name === 'whip1' });
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
    case 'crouch':
      return pick('hero', 'crouch');
    case 'walk': {
      // A hard landing still shows the squash for a few ticks before the stride resumes.
      if (has('hero_jump') && s.landHard && s.landT > LAND_TIME - 0.05) return pick('hero_jump', 'land0');
      if (has('hero_walk8')) return pick('hero_walk8', 'walk' + ((s.walkFrame || 0) % 8));
      if (has('hero_walk')) return pick('hero_walk', 'walk' + ((s.walkFrame || 0) % 6));
      return pick('hero', 'walk' + ((s.walkFrame || 0) % 6));
    }
    default: {
      if (has('hero_jump') && s.landT > 0) {
        return pick('hero_jump', s.landHard && s.landT > LAND_TIME / 2 ? 'land0' : 'land1');
      }
      if (has('hero_idle')) return pick('hero_idle', 'idle' + (Math.floor((s.idleT || 0) * IDLE_FPS) % 6));
      return pick('hero', 'idle');
    }
  }
}

/** Squash / stretch for the hunter sprite: { sx, sy } or null when at rest. */
export function heroScale(s) {
  if (s.state === 'dead' || s.state === 'attack' || s.state === 'hurt') return null;
  if (s.landT > 0 && s.landHard && s.state !== 'jump') {
    const k = Math.min(1, s.landT / LAND_TIME);          // 1 at touchdown -> 0
    return { sx: 1 + 0.10 * k, sy: 1 - 0.13 * k };
  }
  if (s.launchT > 0 && s.state === 'jump') {
    const k = Math.min(1, s.launchT / LAUNCH_TIME);
    return { sx: 1 - 0.06 * k, sy: 1 + 0.08 * k };
  }
  return null;
}

/**
 * Draws an extended whip frame stretched to `reach`: the body (hips + hand)
 * and the knotted tip stay 1:1, the lash between them is scaled horizontally
 * (a 2 px line stays crisp with smoothing off). `img` may be a tinted copy of
 * the frame (then sx/sy are 0).
 */
export function drawStretchedWhip(ctx, assets, sheet, name, x, y, flip, alpha, reach, img = null, sx = null, sy = null) {
  const f = assets.frame(sheet, name);
  if (!f) return;
  img = img || assets.img(sheet);
  sx = sx == null ? f.x : sx;
  sy = sy == null ? f.y : sy;
  const legacy = sheet === 'hero';
  const bodyW = legacy ? 34 : Math.min(f.w - 8, Math.round(f.ax + 14));
  const tipW = 6;
  const midW = f.w - bodyW - tipW;
  reach = reach || PLAYER.whipReach;
  const total = Math.round(f.ax + reach + 10);          // anchor -> tip end
  const midDest = Math.max(midW, total - bodyW - tipW);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(Math.round(x), Math.round(y - f.ay));
  if (flip) ctx.scale(-1, 1);
  const ox = Math.round(-f.ax);
  if (midW <= 2) {
    ctx.drawImage(img, sx, sy, f.w, f.h, ox, 0, f.w, f.h);
  } else {
    ctx.drawImage(img, sx, sy, bodyW, f.h, ox, 0, bodyW, f.h);
    ctx.drawImage(img, sx + bodyW, sy, midW, f.h, ox + bodyW, 0, midDest, f.h);
    ctx.drawImage(img, sx + bodyW + midW, sy, tipW, f.h, ox + bodyW + midDest, 0, tipW, f.h);
  }
  ctx.restore();
}

/** The classic crouching lash: a low curve growing out to `reach` over 80 ms. */
export function drawProceduralLash(ctx, x, y, facing, attackT, activeStart, reach, color = '#6b4a2b', tipColor = '#e8e2c8') {
  if (attackT < activeStart - 0.03) return;
  const sx = Math.round(x + facing * 8), sy = Math.round(y - 30);
  const k = Math.min(1, (attackT - activeStart + 0.03) / 0.08);
  const len = (reach || PLAYER.whipReach) * k;
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo(sx + facing * len * 0.5, sy + 4, sx + facing * len, sy - 1);
  ctx.stroke();
  ctx.fillStyle = tipColor;
  const tx = sx + facing * len, ty = sy - 1;
  ctx.beginPath();
  ctx.moveTo(tx + facing * 2.5, ty);
  ctx.lineTo(tx, ty - 1.8);
  ctx.lineTo(tx - facing * 2, ty);
  ctx.lineTo(tx, ty + 1.8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
