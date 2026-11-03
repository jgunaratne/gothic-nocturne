// Castle progression gates: which Boss Sanctums may be challenged, and when the
// Count's Throne Hall finally opens.
//
// The hunt spreads outward across the Castle Exploration Map: a region's Boss
// Gate Door only rises once a *neighbouring* region's guardian has been felled
// (the Graveyard Road is always open), and the Count waits behind his doors
// until every other guardian in the castle lies defeated. Debug flags from the
// title Settings screen can lift either rule.

import { STAGES, BUILTIN_STAGE_COUNT } from './stages.js';
import { MAP_ROOMS } from './map_layout.js';

export const FIRST_STAGE_KEY = 'graveyard';
export const FINAL_STAGE_KEY = 'throne';

/** Default debug flags (see the title Settings screen). */
export const DEFAULT_DEBUG_FLAGS = Object.freeze({ unlockAreas: false, unlockBosses: false });

function stageIndexOf(key) { return STAGES.findIndex((s) => s.key === key); }

function isCleared(key, clearedMask) {
  const idx = stageIndexOf(key);
  return idx >= 0 && !!(((clearedMask || 0) >>> idx) & 1);
}

function shortName(key) {
  const st = STAGES[stageIndexOf(key)];
  return (st ? st.name : String(key)).replace(/^THE\s+/, '');
}

/** Indices of every built-in guardian stage the Count demands felled (all but his own hall). */
export function guardianStageIndices() {
  const out = [];
  const n = Math.min(STAGES.length, BUILTIN_STAGE_COUNT);
  for (let i = 0; i < n; i++) {
    const st = STAGES[i];
    if (st && st.boss && st.key !== FINAL_STAGE_KEY) out.push(i);
  }
  return out;
}

/** `{ felled, total }` guardians defeated so far among the built-in castle regions. */
export function guardianProgress(clearedMask) {
  const idx = guardianStageIndices();
  let felled = 0;
  for (const i of idx) if (((clearedMask || 0) >>> i) & 1) felled++;
  return { felled, total: idx.length };
}

export function allGuardiansFelled(clearedMask) {
  const { felled, total } = guardianProgress(clearedMask);
  return felled >= total;
}

/** Cleared neighbouring regions of `key` on the Castle Map (names, shortest first). */
function clearedNeighbours(key, clearedMask) {
  const room = MAP_ROOMS[key];
  if (!room || !room.exits) return [];
  return room.exits.filter((n) => isCleared(n, clearedMask));
}

/**
 * Non-recursive gate test used for ordering hints: `key`'s Boss Gate Door stands
 * open (first stage, already cleared, or any neighbour cleared).
 */
function gateOpenShallow(key, clearedMask) {
  if (key === FINAL_STAGE_KEY) return allGuardiansFelled(clearedMask);
  if (key === FIRST_STAGE_KEY || isCleared(key, clearedMask)) return true;
  return clearedNeighbours(key, clearedMask).length > 0;
}

/** Neighbouring guardians still standing, the ones whose own gates already stand open first. */
function neighbourNames(key, clearedMask) {
  const room = MAP_ROOMS[key];
  if (!room || !room.exits) return [];
  const score = (n) => (gateOpenShallow(n, clearedMask) ? 0 : 1);
  return room.exits
    .filter((n) => n !== FINAL_STAGE_KEY)
    .sort((a, b) => score(a) - score(b) || shortName(a).length - shortName(b).length)
    .map(shortName);
}

/**
 * Whether the hunter may physically enter `stageKey` at all (passage gateways,
 * boss exit doors, map fast travel and the stage-select screen all consult this).
 * Only the Count's hall is ever barred: it opens once every guardian is felled.
 */
export function canEnterStage(stageKey, clearedMask, debug = DEFAULT_DEBUG_FLAGS) {
  if (stageKey !== FINAL_STAGE_KEY) return true;
  if (debug && (debug.unlockBosses || debug.unlockAreas)) return true;
  return allGuardiansFelled(clearedMask);
}

/** Short banner explaining why `stageKey` cannot be entered yet (or `null` when it can). */
export function stageEntryLock(stageKey, clearedMask, debug = DEFAULT_DEBUG_FLAGS) {
  if (canEnterStage(stageKey, clearedMask, debug)) return null;
  const { felled, total } = guardianProgress(clearedMask);
  return {
    title: "THE COUNT'S HALL IS SEALED",
    sub: `FELL EVERY GUARDIAN FIRST · ${felled}/${total}`,
  };
}

/**
 * Resolves the Boss Gate Door for `stageKey`.
 * Returns `{ open, title, sub, felled, total, final }` where `title`/`sub`
 * describe the seal when `open` is false.
 */
export function bossGateStatus(stageKey, clearedMask, debug = DEFAULT_DEBUG_FLAGS) {
  const { felled, total } = guardianProgress(clearedMask);
  const base = { felled, total, final: stageKey === FINAL_STAGE_KEY };
  if (debug && debug.unlockBosses) return Object.assign(base, { open: true, title: null, sub: 'DEBUG · ALL BOSSES UNLOCKED' });
  if (isCleared(stageKey, clearedMask)) return Object.assign(base, { open: true, title: null, sub: 'GUARDIAN ALREADY FELLED' });

  if (stageKey === FINAL_STAGE_KEY) {
    if (felled >= total) return Object.assign(base, { open: true, title: null, sub: 'EVERY GUARDIAN HAS FALLEN' });
    return Object.assign(base, {
      open: false,
      title: 'THE COUNT AWAITS',
      sub: `FELL EVERY GUARDIAN TO OPEN THIS DOOR · ${felled}/${total}`,
    });
  }

  const idx = stageIndexOf(stageKey);
  if (stageKey === FIRST_STAGE_KEY || idx < 0 || !MAP_ROOMS[stageKey]) {
    return Object.assign(base, { open: true, title: null, sub: 'THE HUNT BEGINS HERE' });
  }
  const done = clearedNeighbours(stageKey, clearedMask);
  if (done.length) {
    return Object.assign(base, { open: true, title: null, sub: `UNSEALED BY ${shortName(done[0])}` });
  }
  const names = neighbourNames(stageKey, clearedMask);
  const list = names.slice(0, 2).join(' OR ');
  return Object.assign(base, {
    open: false,
    title: 'SEALED BOSS GATE',
    sub: list ? `FELL A NEIGHBOURING GUARDIAN · ${list}${names.length > 2 ? ' ...' : ''}` : 'FELL A NEIGHBOURING GUARDIAN FIRST',
  });
}
