// Metroidvania Level Design Schema, Physics Rulers & Exact 2D Screen-to-Map Bijection
// Implements Sections 1–6 of the Metroidvania Level Design & Generation Guidelines:
// - Grid-unit physics rulers & 75% critical-path traversal budgets
// - Exact `20 x 5` tile (`640 x 160 px`) per-cell 2D coordinate bijection (`GRID_CELL_W`, `GRID_CELL_H`)
// - Explicit RoomArchetype & Kishōtenketsu pacing zone tags
// - Section-5 room schema serialization (`stage.roomSchema`)
// - Direct 1:1 orientation-preserving screen-to-map cell lookup (`lookupStageCell`)

import { TILE, W, H, GRAVITY, PLAYER } from '../engine/constants.js';

// Exact 2D Grid-to-Screen constants:
// 1 map column = 20 tiles (640 px = W, exactly 1 full screen width!)
// 1 map row    = 5 tiles  (160 px = 1 architectural story = exact Night-Wings double-jump height!)
export const GRID_CELL_W = 20;
export const GRID_CELL_H = 5;
export const GRID_TOP_MARGIN = 9;
export const GRID_BOTTOM_PAD = 4;

export function gridFloorRow(minR, mr) {
  return GRID_TOP_MARGIN + (mr - minR) * GRID_CELL_H;
}

// Exact controller jump apex: v0^2 / (2 * g) in tiles (545^2 / (3000 * 32) = 3.094 tiles)
const RAW_MAX_JUMP_TILES = (PLAYER.jump * PLAYER.jump) / (2 * GRAVITY * TILE);
const RAW_AIR_TIME_SEC = (2 * PLAYER.jump) / GRAVITY;
const RAW_MAX_GAP_TILES = (PLAYER.speed * RAW_AIR_TIME_SEC) / TILE;

export const PHYSICS_RULERS = Object.freeze({
  TILE_PX: TILE,                                      // 32x32 px
  SCREEN_WIDTH_TILES: W / TILE,                       // 20 tiles (640 px)
  SCREEN_HEIGHT_TILES: H / TILE,                      // 11.25 tiles (360 px)
  PLAYER_STANDING_TILES: {
    w: PLAYER.width / TILE,                           // 0.625 tiles (20 px)
    h: PLAYER.height / TILE,                          // 1.75 tiles (56 px)
  },
  PLAYER_CROUCH_TILES: {
    w: PLAYER.width / TILE,                           // 0.625 tiles (20 px)
    h: PLAYER.crouchHeight / TILE,                    // 1.125 tiles (36 px)
  },
  MIN_CORRIDOR_CLEARANCE_TILES: 3,                    // >= 3 tiles (96 px) standard hallway headroom
  MIN_TUNNEL_CLEARANCE_TILES: 2,                      // crouch/step clearance
  J_MIN_TILES: 1.5,                                   // tap jump height
  J_MAX_TILES: Number(RAW_MAX_JUMP_TILES.toFixed(2)), // 3.09 tiles (99 px) single-jump ceiling
  J_SAFE_75_TILES: 2.0,                               // <= 2.0 tiles (65% of J_max <= 75% budget)
  J_OPTIONAL_MAX_TILES: 3.0,                          // 90-97% reserved strictly for optional challenges
  J_DOUBLE_BONUS_TILES: 2.73,                         // Night Wings 2nd jump bonus (~5.82 tiles total)
  J_ABILITY_GATE_MIN_TILES: 5.0,                      // >= J_max + 1.5 (4.59 -> 5.0 tiles = 160 px hard lock)
  G_MAX_TILES: Number((RAW_MAX_GAP_TILES + 0.45).toFixed(2)), // ~3.21 tiles with coyoteledge margin
  G_SAFE_75_TILES: 2.0,                               // <= 2.0 tiles unassisted critical-path flat gap
  G_OPTIONAL_MAX_TILES: 3.0,                          // optional challenge flat gap
  DOOR_BUFFER_H_TILES: 4,                             // 4 tiles clear horizontally from doorway center
  DOOR_BUFFER_V_TILES: 3,                             // 3 tiles clear vertically above doorway floor
  MAX_UNMARKED_DROP_TILES: 8,                         // > 8 tiles requires aligned landing or visual guides
});

export const ROOM_ARCHETYPES = Object.freeze({
  CORRIDOR_HORIZONTAL: 'CORRIDOR_HORIZONTAL',
  SHAFT_VERTICAL: 'SHAFT_VERTICAL',
  ARENA_COMBAT: 'ARENA_COMBAT',
  BUFFER_TRANSITION: 'BUFFER_TRANSITION',
  LANDMARK_GATE: 'LANDMARK_GATE',
  BOSS_ARENA: 'BOSS_ARENA',
});

export const PACING_ZONES = Object.freeze({
  OPENING_THRESHOLD: 'OPENING_THRESHOLD',
  INTRO_SAFE: 'INTRO_SAFE',
  DEVELOP_HAZARD: 'DEVELOP_HAZARD',
  TWIST_COMBINATION: 'TWIST_COMBINATION',
  MASTERY_REWARD: 'MASTERY_REWARD',
  PRE_BOSS_ACCORDION: 'PRE_BOSS_ACCORDION',
  SAVE_SANCTUM: 'SAVE_SANCTUM',
  BOSS_SANCTUM: 'BOSS_SANCTUM',
});

export const VISUAL_TELLS = Object.freeze({
  SPRITE_VARIANT_CRACKED: 'SPRITE_VARIANT_CRACKED',
  CAMERA_BLEED: 'CAMERA_BLEED',
  PROP_CONTINUATION: 'PROP_CONTINUATION',
  VISIBLE_REWARD: 'VISIBLE_REWARD',
});

export const ENEMY_ROLES = Object.freeze({
  mushroom: 'PATROL_CRAWLER',
  magmaslime: 'PATROL_CRAWLER',
  pumpkin: 'PATROL_CRAWLER',
  bat: 'CEILING_DROPPER',
  owl: 'CEILING_DROPPER',
  cinderimp: 'CEILING_DROPPER',
  gargoyle: 'CEILING_DROPPER',
  gearharpy: 'CEILING_DROPPER',
  armor: 'SHIELD_GUARD',
  catoblepas: 'SHIELD_GUARD',
  icegolem: 'SHIELD_GUARD',
  lavagolem: 'SHIELD_GUARD',
  executioner: 'SHIELD_GUARD',
  clockknight: 'SHIELD_GUARD',
  censerprelate: 'SHIELD_GUARD',
  bloodknight: 'SHIELD_GUARD',
  mosstroll: 'SHIELD_GUARD',
  wickerman: 'SHIELD_GUARD',
  wendigo: 'SHIELD_GUARD',
  bonegoliath: 'SHIELD_GUARD',
  brasstitan: 'SHIELD_GUARD',
  vathulk: 'SHIELD_GUARD',
  minotaur: 'SHIELD_GUARD',
  cisterncrab: 'SHIELD_GUARD',
  marblecolossus: 'SHIELD_GUARD',
  snowman: 'TURRET_SNIPER',
  skeleton: 'TURRET_SNIPER',
  dragon: 'TURRET_SNIPER',
  tome: 'TURRET_SNIPER',
  alchfiend: 'TURRET_SNIPER',
  spriggan: 'TURRET_SNIPER',
  arbalest: 'TURRET_SNIPER',
  pyromancer: 'TURRET_SNIPER',
  inkscholar: 'TURRET_SNIPER',
  retiarius: 'TURRET_SNIPER',
  astralarcher: 'TURRET_SNIPER',
  wolf: 'GROUND_RUSHER',
  duelist: 'GROUND_RUSHER',
  merman: 'GROUND_RUSHER',
  gravekeeper: 'GROUND_RUSHER',
  scarecrow: 'GROUND_RUSHER',
  zombie: 'GROUND_SWARM',
  ghost: 'AERIAL_WEAVER',
  wraith: 'AERIAL_WEAVER',
  medusa: 'AERIAL_WEAVER',
  lantern: 'AERIAL_WEAVER',
  wisp: 'AERIAL_WEAVER',
  valkyrie: 'AERIAL_WEAVER',
  necromancer: 'AERIAL_WEAVER',
  waltzdancer: 'AERIAL_WEAVER',
  siren: 'AERIAL_WEAVER',
});

/**
 * Constructs a standardized Section-5 room metadata descriptor.
 */
export function createRoomSchemaEntry({
  room_id,
  archetype,
  pacing_zone = PACING_ZONES.INTRO_SAFE,
  biome,
  x0,
  x1,
  entryRow,
  exitRow,
  minRow = 0,
  maxRow = 20,
  map_cells = [],
  upper_cells = [],
  upper_high_cells = [],
  lower_cells = [],
  lower_deep_cells = [],
  secret_cell = null,
  sanctuary = false,
  save_room = false,
  doors = [],
  secrets = [],
  required_abilities = ['NONE'],
  max_vertical_step_tiles = 2.0,
  max_horizontal_gap_tiles = 2.0,
}) {
  const width = Math.max(1, x1 - x0 + 1);
  const height = Math.max(8, maxRow - minRow + 1);
  const traversal_validation = {
    left_to_right: {
      required_abilities,
      max_vertical_step_tiles,
      max_horizontal_gap_tiles,
    },
    right_to_left: {
      required_abilities,
      max_vertical_step_tiles,
      max_horizontal_gap_tiles,
    },
  };
  for (const s of secrets) {
    if (s && s.secret_id) {
      traversal_validation[`main_to_${s.secret_id}`] = {
        required_abilities: [s.lock_type || 'NONE'],
        max_vertical_step_tiles: s.lock_type === 'DOUBLE_JUMP' ? 5.0 : 2.0,
        max_horizontal_gap_tiles: 2.0,
      };
    }
  }
  return {
    room_id,
    archetype,
    pacing_zone,
    dimensions_tiles: { width, height },
    biome,
    bounds: { x0, x1, entryRow, exitRow, minRow, maxRow },
    map_cells,
    upper_cells,
    upper_high_cells,
    lower_cells,
    lower_deep_cells,
    secret_cell,
    sanctuary: !!sanctuary,
    save_room: !!save_room,
    doors,
    secrets,
    traversal_validation,
  };
}

function interpCellList(cells, t) {
  if (!cells || !cells.length) return null;
  const clamped = Math.max(0, Math.min(0.9999, t));
  const scaled = clamped * cells.length;
  const idx = Math.min(cells.length - 1, Math.floor(scaled));
  const sub = scaled - idx;
  const [c0, r0] = cells[idx];
  const [c1, r1] = cells[Math.min(cells.length - 1, idx + 1)];
  return {
    col: c0,
    row: r0,
    fc: c0 + (c1 - c0) * sub * 0.72 + 0.5,
    fr: r0 + (r1 - r0) * sub * 0.72 + 0.5,
  };
}

/**
 * Direct Screen-to-Map Bijection:
 * - On 2D grid-composed built-in stages (`stage.gridMeta`), maps `(tx, ty)` directly
 *   via `col = minC + floor(tx / 20)` and `row = minR + floor((ty - 9 + 2.5) / 5)`
 *   so moving right/left by 20 tiles ALWAYS shifts `col` by ±1, and moving down/up by
 *   5 tiles ALWAYS shifts `row` by ±1!
 * - Falls back to `stage.roomSchema` interpolation on Castle Forge procedural wings.
 */
export function lookupStageCell(stage, normX = 0, normY = 0.5, inSecret = false) {
  if (!stage) return null;
  if (inSecret && stage.secretCell) {
    const [sc, sr] = stage.secretCell;
    return { col: sc, row: sr, fc: sc + 0.5, fr: sr + 0.5, room: null };
  }

  if (stage.gridMeta) {
    const gm = stage.gridMeta;
    const tx = Math.max(0, Math.min(stage.cols - 0.001, normX * stage.cols));
    const ty = Math.max(0, Math.min(stage.rows - 0.001, normY * stage.rows));
    const rawCol = Math.max(gm.minC, Math.min(gm.maxC, gm.minC + Math.floor(tx / GRID_CELL_W)));
    const rawRow = gm.minR + Math.floor((ty - GRID_TOP_MARGIN + GRID_CELL_H * 0.5) / GRID_CELL_H);

    let col = rawCol;
    let row = rawRow;
    if (!gm.cellSet.has(`${col},${row}`)) {
      // Snap vertically within `rawCol` first (e.g., jumping into open sky above an outdoor road)
      let bestDist = Infinity;
      let bestCell = null;
      for (const [c, r] of gm.allCells) {
        if (c === rawCol) {
          const d = Math.abs(r - rawRow);
          if (d < bestDist) { bestDist = d; bestCell = [c, r]; }
        }
      }
      if (!bestCell) {
        for (const [c, r] of gm.allCells) {
          const d = Math.abs(c - rawCol) + Math.abs(r - rawRow);
          if (d < bestDist) { bestDist = d; bestCell = [c, r]; }
        }
      }
      if (bestCell) {
        col = bestCell[0];
        row = bestCell[1];
      }
    }

    const subX = (tx - (col - gm.minC) * GRID_CELL_W) / GRID_CELL_W;
    const cellFloor = gridFloorRow(gm.minR, row);
    const subY = 0.5 + (ty - cellFloor) / GRID_CELL_H;
    const fc = col + Math.max(0.12, Math.min(0.88, subX));
    const fr = row + Math.max(0.12, Math.min(0.88, subY));

    let rm = null;
    if (Array.isArray(stage.roomSchema)) {
      for (const cand of stage.roomSchema) {
        if (tx >= cand.bounds.x0 && tx < cand.bounds.x1 + 1) { rm = cand; break; }
      }
    }
    return { col, row, fc, fr, room: rm };
  }

  if (!Array.isArray(stage.roomSchema) || !stage.roomSchema.length) return null;

  const tx = Math.max(0, Math.min(stage.cols - 0.01, normX * stage.cols));
  const ty = Math.max(0, Math.min(stage.rows - 0.01, normY * stage.rows));

  let rm = stage.roomSchema[0];
  for (let i = 0; i < stage.roomSchema.length; i++) {
    const cand = stage.roomSchema[i];
    if (tx >= cand.bounds.x0 && tx < cand.bounds.x1 + 1) {
      rm = cand;
      break;
    }
    if (tx >= cand.bounds.x1 + 1) rm = cand;
  }

  const spanX = Math.max(1, rm.bounds.x1 - rm.bounds.x0 + 1);
  const u = Math.max(0, Math.min(0.9999, (tx - rm.bounds.x0) / spanX));
  const dRow = rm.bounds.exitRow - rm.bounds.entryRow;

  if (rm.archetype === ROOM_ARCHETYPES.SHAFT_VERTICAL && rm.map_cells.length > 1 && Math.abs(dRow) >= 3) {
    const vRaw = (ty - rm.bounds.entryRow) / dRow;
    const v = Math.max(0, Math.min(0.9999, vRaw));
    const hit = interpCellList(rm.map_cells, v);
    if (hit) return Object.assign(hit, { room: rm, u, v });
  }

  const refRow = rm.bounds.entryRow + dRow * u;
  let activeCells = rm.map_cells;
  if (rm.upper_high_cells && rm.upper_high_cells.length && ty <= refRow - 4.4) {
    activeCells = rm.upper_high_cells;
  } else if (rm.upper_cells && rm.upper_cells.length && ty <= refRow - 2.5) {
    activeCells = rm.upper_cells;
  } else if (rm.lower_deep_cells && rm.lower_deep_cells.length && ty >= refRow + 4.4) {
    activeCells = rm.lower_deep_cells;
  } else if (rm.lower_cells && rm.lower_cells.length && ty >= refRow + 2.5) {
    activeCells = rm.lower_cells;
  }

  const hit = interpCellList(activeCells, u) || interpCellList(rm.map_cells, u);
  if (!hit) return null;
  return Object.assign(hit, { room: rm, u });
}

/**
 * Returns cell keys (`"c,r"`) revealed by standing at `(normX, normY)` in `stage`.
 */
export function revealStageCells(stage, mapRoom, normX = 0, normY = 0.5, {
  inSecret = false,
  cleared = false,
  sanctuary = false,
  vesselFound = false,
} = {}) {
  if (!mapRoom) return [];
  const hit = lookupStageCell(stage, normX, normY, inSecret);
  if (!hit) return null;

  const out = [`${hit.col},${hit.row}`];

  if (stage && stage.gridMeta) {
    // Only reveal the player's exact current cell, plus the upper half of a 2x2 double-height Boss Sanctum!
    if (mapRoom.bossSet && mapRoom.bossSet.has(`${hit.col},${hit.row}`)) {
      const upperKey = `${hit.col},${hit.row - 1}`;
      if (mapRoom.bossSet.has(upperKey)) out.push(upperKey);
    }
    if (sanctuary) out.push(mapRoom.sanctuaryKey);
    if (inSecret || vesselFound) out.push(mapRoom.secretKey);
    if (cleared) {
      for (const [bc, br] of mapRoom.boss) out.push(`${bc},${br}`);
      for (const [sc, sr] of mapRoom.spine) out.push(`${sc},${sr}`);
      for (const [ec, er] of mapRoom.extra) {
        if (`${ec},${er}` !== mapRoom.secretKey || vesselFound) out.push(`${ec},${er}`);
      }
    }
    return out;
  }

  const rm = hit.room;
  if (rm) {
    const baseHit = interpCellList(rm.map_cells, hit.v != null ? hit.v : hit.u);
    if (baseHit) out.push(`${baseHit.col},${baseHit.row}`);

    const ty = normY * stage.rows;
    const refRow = rm.bounds.entryRow + (rm.bounds.exitRow - rm.bounds.entryRow) * (hit.u || 0);
    if (ty <= refRow - 2.2) {
      for (const [uc, ur] of rm.upper_cells || []) {
        if (`${uc},${ur}` !== mapRoom.secretKey) out.push(`${uc},${ur}`);
      }
      if (ty <= refRow - 4.2) {
        for (const [uc, ur] of rm.upper_high_cells || []) {
          if (`${uc},${ur}` !== mapRoom.secretKey) out.push(`${uc},${ur}`);
        }
      }
    }
    if (ty >= refRow + 2.2) {
      for (const [lc, lr] of rm.lower_cells || []) {
        if (`${lc},${lr}` !== mapRoom.secretKey) out.push(`${lc},${lr}`);
      }
      if (ty >= refRow + 4.2) {
        for (const [lc, lr] of rm.lower_deep_cells || []) {
          if (`${lc},${lr}` !== mapRoom.secretKey) out.push(`${lc},${lr}`);
        }
      }
    }
    if (rm.archetype === ROOM_ARCHETYPES.BOSS_ARENA) {
      for (const [bc, br] of mapRoom.boss || []) out.push(`${bc},${br}`);
    }
  }

  if (sanctuary) out.push(mapRoom.sanctuaryKey);
  if (inSecret || vesselFound) out.push(mapRoom.secretKey);
  if (cleared) {
    for (const [bc, br] of mapRoom.boss) out.push(`${bc},${br}`);
    for (const [sc, sr] of mapRoom.spine) out.push(`${sc},${sr}`);
    for (const [ec, er] of mapRoom.extra) {
      if (`${ec},${er}` !== mapRoom.secretKey || vesselFound) out.push(`${ec},${er}`);
    }
  }
  return out;
}
