// Castle Exploration Map: all thirteen regions laid out as interlocking
// multi-cell architectural chambers on a 34 x 14 grid, joined wall-to-wall by
// open and ability-gated doorways, with per-cell exploration fog of war,
// Sanctuary Waystones, Secret Ancient Vessels, Boss chambers, a live hunter
// location beacon (press M anytime), and a HUD mini-map radar.

import { W, H, TILE } from '../engine/constants.js';
import { STAGES } from './stages.js';
import { THEMES } from './builder.js';
import { BOSS_RELICS } from './relics.js';

export const GRID_COLS = 34;
export const GRID_ROWS = 14;
export const CELL_SIZE = 15;
export const MAP_X = Math.round((W - GRID_COLS * CELL_SIZE) / 2); // 65
export const MAP_Y = 40;

/**
 * Multi-cell room definitions on the 34 x 14 Castle Grid.
 * - `spine`: ordered cells from stage start (t=0) -> boss chamber (t=1).
 * - `extra`: side vaults, vertical lift shafts, clerestories & secret alcoves.
 * - `boss`: boss chamber cell(s).
 * - `sanctuary`: Sanctuary Waystone fast-travel cell.
 * - `secret`: hidden Ancient Life Vessel cell.
 */
export const MAP_ROOMS = {
  yule: {
    where: 'FROZEN HEIGHTS',
    spine: [[6, 2], [5, 2], [4, 2], [3, 2], [2, 2], [1, 2], [1, 3]],
    extra: [[3, 1], [2, 3]],
    boss: [[1, 2], [1, 3]],
    sanctuary: [5, 2],
    secret: [3, 1],
    labelPos: [3.5, 1.0],
  },
  jack: {
    where: 'PUMPKIN WOODS',
    spine: [[5, 5], [5, 4], [4, 4], [4, 5], [3, 5], [2, 5], [1, 5]],
    extra: [[4, 3], [6, 5], [6, 4]],
    boss: [[1, 5], [2, 5]],
    sanctuary: [6, 5],
    secret: [6, 4],
    labelPos: [3.5, 5.5],
  },
  darkwood: {
    where: 'WEST WOODS',
    spine: [[8, 8], [7, 8], [6, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8]],
    extra: [[5, 6], [5, 7], [3, 9]],
    boss: [[1, 8], [2, 8]],
    sanctuary: [7, 8],
    secret: [3, 9],
    labelPos: [4.5, 8.5],
  },
  graveyard: {
    where: 'THE GROUNDS',
    spine: [[9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8], [14, 7], [15, 7], [16, 7]],
    extra: [[13, 7]],
    boss: [[16, 7]],
    sanctuary: [10, 8],
    secret: [13, 7],
    labelPos: [12.0, 8.5],
  },
  ramparts: {
    where: 'OUTER WALLS',
    spine: [[14, 6], [13, 6], [15, 6], [16, 6], [17, 6], [18, 6], [19, 6], [20, 6], [20, 5]],
    extra: [[11, 6], [12, 6], [12, 5], [13, 5], [19, 5]],
    boss: [[19, 5], [20, 5]],
    sanctuary: [14, 6],
    secret: [12, 5],
    labelPos: [16.5, 6.5],
  },
  library: {
    where: 'WEST WING',
    spine: [[13, 4], [13, 3], [12, 3], [11, 3], [14, 3], [15, 3], [15, 2], [16, 2]],
    extra: [[7, 2], [8, 2], [9, 2], [9, 3], [10, 3], [10, 2], [11, 2], [14, 2], [16, 3]],
    boss: [[16, 2], [16, 3]],
    sanctuary: [13, 3],
    secret: [10, 2],
    labelPos: [12.5, 3.0],
  },
  throne: {
    where: 'THE KEEP',
    spine: [[21, 1], [20, 1], [19, 1], [18, 1], [17, 1], [16, 1], [15, 1], [14, 1], [13, 1], [13, 0]],
    extra: [[14, 0], [17, 0]],
    boss: [[13, 0], [13, 1], [14, 0]],
    sanctuary: [19, 1],
    secret: [17, 0],
    labelPos: [17.5, 1.5],
  },
  darkcave: {
    where: 'MOLTEN DEPTHS',
    spine: [[10, 12], [9, 12], [8, 12], [7, 12], [6, 12], [5, 12], [4, 12], [3, 12], [2, 12], [2, 11]],
    extra: [[3, 10], [3, 11], [5, 11], [6, 11], [6, 13]],
    boss: [[2, 11], [2, 12]],
    sanctuary: [8, 12],
    secret: [6, 13],
    labelPos: [6.5, 12.5],
  },
  catacombs: {
    where: 'BENEATH THE KEEP',
    spine: [[12, 9], [12, 10], [12, 11], [13, 11], [14, 11], [15, 11], [16, 11], [17, 11], [18, 11], [18, 10]],
    extra: [[11, 11], [11, 12], [14, 12], [15, 12]],
    boss: [[18, 10], [18, 11]],
    sanctuary: [12, 11],
    secret: [14, 12],
    labelPos: [15.0, 11.5],
  },
  ossuary: {
    where: 'THE DEEP CRYPT',
    spine: [[19, 11], [20, 11], [21, 11], [22, 11], [23, 11], [24, 11], [25, 11], [26, 11], [26, 12]],
    extra: [[23, 10], [23, 9], [23, 8], [21, 12], [22, 12]],
    boss: [[26, 11], [26, 12]],
    sanctuary: [20, 11],
    secret: [21, 12],
    labelPos: [22.5, 11.5],
  },
  arcade: {
    where: 'EAST WING',
    spine: [[21, 6], [22, 6], [23, 6], [24, 6], [25, 6], [26, 6], [27, 6], [27, 5]],
    extra: [[23, 7], [24, 5], [25, 5]],
    boss: [[27, 5], [27, 6]],
    sanctuary: [22, 6],
    secret: [25, 5],
    labelPos: [24.5, 6.5],
  },
  cathedral: {
    where: 'THE GREAT NAVE',
    spine: [[24, 4], [24, 3], [23, 3], [22, 3], [23, 2], [24, 2], [25, 2], [26, 2], [27, 2], [27, 3]],
    extra: [[22, 1], [23, 1], [22, 2], [25, 3], [26, 3], [25, 1]],
    boss: [[27, 2], [27, 3]],
    sanctuary: [23, 3],
    secret: [25, 1],
    labelPos: [24.8, 2.8],
  },
  clocktower: {
    where: 'THE BELFRY',
    spine: [[28, 6], [29, 6], [29, 5], [30, 5], [29, 4], [29, 3], [29, 2], [29, 1], [29, 0], [30, 0]],
    extra: [[28, 4], [30, 3], [28, 2], [30, 1], [31, 3]],
    boss: [[29, 0], [30, 0]],
    sanctuary: [28, 6],
    secret: [31, 3],
    labelPos: [29.5, 3.5],
  },
};

/**
 * Wall-to-wall doorways between adjacent cells of neighbouring regions.
 * `gateRelic` (optional) seals shortcut passages until that Boss Relic is earned!
 * `fracA` / `fracB` place the physical archway along stage A and stage B (`0..1`).
 */
export const MAP_DOORS = [
  { id: 'gy_dw', a: 'graveyard', cellA: [9, 8], fracA: 0.08, b: 'darkwood', cellB: [8, 8], fracB: 0.04, gateRelic: null },
  { id: 'gy_cat', a: 'graveyard', cellA: [12, 8], fracA: 0.40, b: 'catacombs', cellB: [12, 9], fracB: 0.04, gateRelic: null },
  { id: 'gy_ram', a: 'graveyard', cellA: [14, 7], fracA: 0.72, b: 'ramparts', cellB: [14, 6], fracB: 0.04, gateRelic: null },
  { id: 'dw_jk', a: 'darkwood', cellA: [5, 6], fracA: 0.52, b: 'jack', cellB: [5, 5], fracB: 0.04, gateRelic: null },
  { id: 'dw_dc', a: 'darkwood', cellA: [3, 9], fracA: 0.68, b: 'darkcave', cellB: [3, 10], fracB: 0.62, gateRelic: 'graveyard', highB: false },
  { id: 'jk_yu', a: 'jack', cellA: [4, 3], fracA: 0.58, b: 'yule', cellB: [4, 2], fracB: 0.04, gateRelic: null },
  { id: 'yu_lib', a: 'yule', cellA: [6, 2], fracA: 0.66, b: 'library', cellB: [7, 2], fracB: 0.24, gateRelic: 'jack' },
  { id: 'cat_dc', a: 'catacombs', cellA: [11, 12], fracA: 0.34, b: 'darkcave', cellB: [10, 12], fracB: 0.04, gateRelic: null },
  { id: 'cat_oss', a: 'catacombs', cellA: [18, 11], fracA: 0.74, b: 'ossuary', cellB: [19, 11], fracB: 0.04, gateRelic: null },
  { id: 'oss_arc', a: 'ossuary', cellA: [23, 8], fracA: 0.64, b: 'arcade', cellB: [23, 7], fracB: 0.32, gateRelic: 'catacombs' },
  { id: 'ram_lib', a: 'ramparts', cellA: [13, 5], fracA: 0.36, b: 'library', cellB: [13, 4], fracB: 0.04, gateRelic: 'graveyard', highA: true },
  { id: 'ram_arc', a: 'ramparts', cellA: [20, 6], fracA: 0.76, b: 'arcade', cellB: [21, 6], fracB: 0.04, gateRelic: null },
  { id: 'arc_cath', a: 'arcade', cellA: [24, 5], fracA: 0.56, b: 'cathedral', cellB: [24, 4], fracB: 0.04, gateRelic: null },
  { id: 'arc_clk', a: 'arcade', cellA: [27, 6], fracA: 0.78, b: 'clocktower', cellB: [28, 6], fracB: 0.04, gateRelic: null },
  { id: 'cath_clk', a: 'cathedral', cellA: [27, 2], fracA: 0.72, b: 'clocktower', cellB: [28, 2], fracB: 0.58, gateRelic: 'arcade' },
  { id: 'lib_thr', a: 'library', cellA: [15, 2], fracA: 0.76, b: 'throne', cellB: [15, 1], fracB: 0.52, gateRelic: null },
  { id: 'cath_thr', a: 'cathedral', cellA: [22, 1], fracA: 0.42, b: 'throne', cellB: [21, 1], fracB: 0.04, gateRelic: null },
];

export const MAP_LINKS = MAP_DOORS;

// Precompute cell ownership & room metadata
export const CELL_OWNER = new Map();
export const DOOR_EDGES = new Map(); // "c1,r1|c2,r2" -> door

function edgeKey(c1, r1, c2, r2) {
  return (c1 < c2 || (c1 === c2 && r1 < r2))
    ? `${c1},${r1}|${c2},${r2}`
    : `${c2},${r2}|${c1},${r1}`;
}

let _totalCells = 0;
for (const [key, r] of Object.entries(MAP_ROOMS)) {
  r.exits = [];
  r.allCells = [...r.spine, ...r.extra];
  r.cellSet = new Set(r.allCells.map(([c, rw]) => `${c},${rw}`));
  r.bossSet = new Set(r.boss.map(([c, rw]) => `${c},${rw}`));
  r.sanctuaryKey = `${r.sanctuary[0]},${r.sanctuary[1]}`;
  r.secretKey = `${r.secret[0]},${r.secret[1]}`;
  let minC = 99, maxC = -1, minR = 99, maxR = -1;
  for (const [c, rw] of r.allCells) {
    CELL_OWNER.set(`${c},${rw}`, key);
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
    if (rw < minR) minR = rw;
    if (rw > maxR) maxR = rw;
    _totalCells++;
  }
  r.bounds = { minC, maxC, minR, maxR };
  r.centerCell = [(minC + maxC + 1) * 0.5, (minR + maxR + 1) * 0.5];
}
export const TOTAL_MAP_CELLS = _totalCells;

for (const d of MAP_DOORS) {
  if (!MAP_ROOMS[d.a].exits.includes(d.b)) MAP_ROOMS[d.a].exits.push(d.b);
  if (!MAP_ROOMS[d.b].exits.includes(d.a)) MAP_ROOMS[d.b].exits.push(d.a);
  DOOR_EDGES.set(edgeKey(d.cellA[0], d.cellA[1], d.cellB[0], d.cellB[1]), d);
}

export function roomRect(key) {
  const b = MAP_ROOMS[key].bounds;
  return {
    x: MAP_X + b.minC * CELL_SIZE,
    y: MAP_Y + b.minR * CELL_SIZE,
    w: (b.maxC - b.minC + 1) * CELL_SIZE,
    h: (b.maxR - b.minR + 1) * CELL_SIZE,
  };
}

function roomCenter(key) {
  const r = MAP_ROOMS[key];
  return { x: MAP_X + r.centerCell[0] * CELL_SIZE, y: MAP_Y + r.centerCell[1] * CELL_SIZE };
}

/** Index into STAGES for a map key. */
export function stageIndexOf(key) { return STAGES.findIndex((s) => s.key === key); }

export function isCleared(key, clearedMask) {
  const idx = stageIndexOf(key);
  return idx >= 0 && !!((clearedMask >> idx) & 1);
}

export function isDiscovered(key, clearedMask, discoveredMask = 0) {
  if (key === 'graveyard') return true;
  const idx = stageIndexOf(key);
  if (idx >= 0 && (((clearedMask >> idx) & 1) || ((discoveredMask >> idx) & 1))) return true;
  return isAdjacentToCleared(key, clearedMask | discoveredMask);
}

export function isAdjacentToCleared(key, clearedMask) {
  if (key === 'graveyard') return true;
  return MAP_ROOMS[key].exits.some((n) => isCleared(n, clearedMask));
}

export function canTraverseDoor(door, relicsSet) {
  if (!door.gateRelic) return true;
  return !!(relicsSet && relicsSet.has(door.gateRelic));
}

/** Returns all physical passage doorway descriptors for a given stage key. */
export function stageDoorsFor(stageKey) {
  const out = [];
  for (const d of MAP_DOORS) {
    if (d.a === stageKey) {
      out.push({
        id: d.id,
        targetKey: d.b,
        atFrac: d.fracA,
        destFrac: d.fracB,
        gateRelic: d.gateRelic,
        highLedge: !!d.highA,
        cell: d.cellA,
        destCell: d.cellB,
      });
    } else if (d.b === stageKey) {
      out.push({
        id: d.id,
        targetKey: d.a,
        atFrac: d.fracB,
        destFrac: d.fracA,
        gateRelic: d.gateRelic,
        highLedge: !!d.highB,
        cell: d.cellB,
        destCell: d.cellA,
      });
    }
  }
  return out.sort((p, q) => p.atFrac - q.atFrac);
}

/**
 * Maps the hunter's normalized stage X (`0..1`) into the exact Castle Grid
 * cell and sub-cell pixel coordinates on the 640x360 map screen.
 */
export function playerGridLocation(stageKey, normX = 0, inSecret = false) {
  const r = MAP_ROOMS[stageKey] || MAP_ROOMS.graveyard;
  if (inSecret) {
    const [sc, sr] = r.secret;
    return {
      col: sc,
      row: sr,
      cellKey: `${sc},${sr}`,
      px: MAP_X + (sc + 0.5) * CELL_SIZE,
      py: MAP_Y + (sr + 0.5) * CELL_SIZE,
    };
  }
  const t = Math.max(0, Math.min(0.9999, normX));
  const scaled = t * r.spine.length;
  const idx = Math.min(r.spine.length - 1, Math.floor(scaled));
  const sub = scaled - idx;
  const [c0, r0] = r.spine[idx];
  const [c1, r1] = r.spine[Math.min(r.spine.length - 1, idx + 1)];
  const fc = c0 + (c1 - c0) * sub * 0.65 + 0.5;
  const fr = r0 + (r1 - r0) * sub * 0.65 + 0.5;
  return {
    col: c0,
    row: r0,
    cellKey: `${c0},${r0}`,
    px: MAP_X + fc * CELL_SIZE,
    py: MAP_Y + fr * CELL_SIZE,
  };
}

/** Returns cell keys (`"c,r"`) revealed by standing at `normX` in `stageKey`. */
export function cellsToRevealAt(stageKey, normX = 0, { inSecret = false, cleared = false, sanctuary = false, vesselFound = false } = {}) {
  const r = MAP_ROOMS[stageKey];
  if (!r) return [];
  const out = [];
  const t = Math.max(0, Math.min(0.9999, normX));
  const idx = Math.min(r.spine.length - 1, Math.floor(t * r.spine.length));
  const [c, rw] = r.spine[idx];
  out.push(`${c},${rw}`);
  // Also reveal any non-secret, non-boss side hall touching this spine cell
  for (const [ec, erw] of r.extra) {
    const ek = `${ec},${erw}`;
    if (ek === r.secretKey) continue;
    if (Math.abs(ec - c) + Math.abs(erw - rw) <= 1) out.push(ek);
  }
  if (sanctuary) out.push(r.sanctuaryKey);
  if (inSecret || vesselFound) out.push(r.secretKey);
  if (cleared) {
    for (const [bc, brw] of r.boss) out.push(`${bc},${brw}`);
    for (const [sc, srw] of r.spine) out.push(`${sc},${srw}`);
    for (const [ec, erw] of r.extra) {
      if (`${ec},${erw}` !== r.secretKey || vesselFound) out.push(`${ec},${erw}`);
    }
  }
  return out;
}

export function exploredPercent(exploredSet) {
  if (!exploredSet || TOTAL_MAP_CELLS === 0) return 0;
  let n = 0;
  for (const k of exploredSet) if (CELL_OWNER.has(k)) n++;
  return Math.min(100, Math.round((n / TOTAL_MAP_CELLS) * 100));
}

/** Moves the cursor along the map in direction (dx, dy), preferring connected rooms. */
export function moveCursor(fromKey, dx, dy) {
  const from = roomCenter(fromKey);
  const score = (key) => {
    const c = roomCenter(key);
    const vx = c.x - from.x, vy = c.y - from.y;
    const along = vx * dx + vy * dy;
    if (along <= 3) return -Infinity;
    const across = Math.abs(vx * dy) + Math.abs(vy * dx);
    return along - across * 0.65;
  };
  let best = null, bestS = -Infinity;
  for (const n of MAP_ROOMS[fromKey].exits) { const s = score(n); if (s > bestS) { bestS = s; best = n; } }
  if (best) return best;
  for (const k of Object.keys(MAP_ROOMS)) { if (k === fromKey) continue; const s = score(k); if (s > bestS) { bestS = s; best = k; } }
  return best || fromKey;
}

export function nextRoomAfter(clearedKey, clearedMask) {
  const open = MAP_ROOMS[clearedKey].exits.filter((n) => !isCleared(n, clearedMask));
  return open[0] || null;
}

function countBits(mask, max = 13) {
  let n = 0;
  for (let i = 0; i < max; i++) if ((mask >> i) & 1) n++;
  return n;
}

/**
 * Draws a wall segment from (x1, y1) to (x2, y2), leaving a 5px doorway notch
 * in the middle if `door` is provided.
 */
function drawCellWall(ctx, x1, y1, x2, y2, wallColor, door, relicsSet) {
  if (!door) {
    ctx.fillStyle = wallColor;
    if (y1 === y2) ctx.fillRect(x1, y1, x2 - x1 + 1, 1);
    else ctx.fillRect(x1, y1, 1, y2 - y1 + 1);
    return;
  }
  const open = canTraverseDoor(door, relicsSet);
  const gateColor = open ? '#9ef5dc' : (BOSS_RELICS[door.gateRelic]?.color || '#ff6a88');
  if (y1 === y2) {
    const mid = Math.round((x1 + x2) * 0.5);
    ctx.fillStyle = wallColor;
    ctx.fillRect(x1, y1, mid - 3 - x1, 1);
    ctx.fillRect(mid + 3, y1, x2 - (mid + 3) + 1, 1);
    // Doorway jamb ticks or glowing ability-gate bar
    ctx.fillStyle = gateColor;
    if (open) {
      ctx.fillRect(mid - 3, y1 - 1, 1, 3);
      ctx.fillRect(mid + 3, y1 - 1, 1, 3);
    } else {
      ctx.fillRect(mid - 3, y1 - 1, 7, 3);
    }
  } else {
    const mid = Math.round((y1 + y2) * 0.5);
    ctx.fillStyle = wallColor;
    ctx.fillRect(x1, y1, 1, mid - 3 - y1);
    ctx.fillRect(x1, mid + 3, 1, y2 - (mid + 3) + 1);
    ctx.fillStyle = gateColor;
    if (open) {
      ctx.fillRect(x1 - 1, mid - 3, 3, 1);
      ctx.fillRect(x1 - 1, mid + 3, 3, 1);
    } else {
      ctx.fillRect(x1 - 1, mid - 3, 3, 7);
    }
  }
}

/**
 * Full-screen Interconnected Castle Exploration Map (`640x360`).
 * Used both when pressing `M` mid-stage (`mode === 'live'`) and on stage select.
 */
export function drawCastleMap(ctx, font, assets, {
  cursor,
  cleared = 0,
  discovered = 0,
  vessels = 0,
  explored = null,
  relics = null,
  time = 0,
  difficultyName = 'NORMAL',
  mode = 'select',
  currentStageKey = null,
  playerNormX = 0,
  inSecret = false,
}) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 5.2);
  const expSet = explored || new Set();
  const relicSet = relics || new Set();

  // Dimmed parchment + deep cartographer's blueprint slate
  const parchment = assets.img('map_parchment');
  if (parchment) {
    ctx.drawImage(parchment, 0, 0, W, H);
    ctx.fillStyle = 'rgba(7, 8, 18, 0.80)';
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = '#090a14';
    ctx.fillRect(0, 0, W, H);
  }

  // Header bar
  const pct = exploredPercent(expSet);
  const vesselCount = countBits(vessels, STAGES.length);
  const relicCount = relicSet.size;
  if (currentStageKey && STAGES[stageIndexOf(currentStageKey)]) {
    const curName = STAGES[stageIndexOf(currentStageKey)].name.replace(/^THE /, '');
    font.draw(ctx, `* HERE · ${curName}`, 16, 4, { color: '#9ef5dc', shadow: '#05040a', gothic: false });
  } else {
    font.draw(ctx, `${difficultyName} HUNT`, 16, 4, { color: '#a89a74', shadow: '#05040a', gothic: false });
  }
  font.draw(ctx, 'CASTLE EXPLORATION MAP', W / 2, 16, { scale: 2, gothic: false, align: 'center', color: '#efe3bf', shadow: '#05040a' });
  font.draw(
    ctx,
    `MAP ${pct}% · RELICS ${relicCount}/13 · VESSELS ${vesselCount}/13`,
    W - 16,
    4,
    { align: 'right', color: '#ffd27a', shadow: '#05040a', gothic: false },
  );

  // Blueprint grid frame
  const gx0 = MAP_X - 8, gy0 = MAP_Y - 6;
  const gw = GRID_COLS * CELL_SIZE + 16, gh = GRID_ROWS * CELL_SIZE + 12;
  ctx.fillStyle = 'rgba(8, 11, 24, 0.90)';
  ctx.fillRect(gx0, gy0, gw, gh);
  ctx.strokeStyle = '#5a6a8a';
  ctx.lineWidth = 1;
  ctx.strokeRect(gx0 + 0.5, gy0 + 0.5, gw - 1, gh - 1);
  ctx.strokeStyle = '#26304a';
  ctx.strokeRect(gx0 + 2.5, gy0 + 2.5, gw - 5, gh - 5);

  // Subtle background 15x15 blueprint grid lines
  ctx.fillStyle = 'rgba(70, 92, 138, 0.14)';
  for (let c = 0; c <= GRID_COLS; c++) {
    ctx.fillRect(MAP_X + c * CELL_SIZE, MAP_Y, 1, GRID_ROWS * CELL_SIZE);
  }
  for (let r = 0; r <= GRID_ROWS; r++) {
    ctx.fillRect(MAP_X, MAP_Y + r * CELL_SIZE, GRID_COLS * CELL_SIZE, 1);
  }

  // Pass 1: Draw all room cell interiors
  for (const [key, rm] of Object.entries(MAP_ROOMS)) {
    const sIdx = stageIndexOf(key);
    const st = STAGES[sIdx];
    const theme = THEMES[st.theme] || THEMES.graveyard;
    const done = isCleared(key, cleared);
    const disc = isDiscovered(key, cleared, discovered) || key === currentStageKey;
    const vesselFound = sIdx >= 0 && !!((vessels >> sIdx) & 1);
    const sel = key === cursor;

    for (const [c, rw] of rm.allCells) {
      const ck = `${c},${rw}`;
      const cx = MAP_X + c * CELL_SIZE;
      const cy = MAP_Y + rw * CELL_SIZE;
      const isExp = expSet.has(ck) || done;
      const isBoss = rm.bossSet.has(ck);
      const isSanc = ck === rm.sanctuaryKey;
      const isSec = ck === rm.secretKey;

      let fill = 'rgba(18, 22, 36, 0.44)';
      if (isExp) {
        if (isBoss) fill = done ? '#3d368a' : '#962238';
        else if (isSanc) fill = '#19756a';
        else if (isSec) fill = vesselFound ? '#966c1c' : '#6c4e18';
        else fill = '#1e4ea8';
      } else if (disc) {
        if (isBoss) fill = 'rgba(110, 28, 44, 0.48)';
        else if (isSanc) fill = 'rgba(24, 96, 88, 0.45)';
        else if (isSec) fill = vesselFound ? '#8a6218' : 'rgba(110, 82, 26, 0.34)';
        else fill = 'rgba(28, 42, 74, 0.62)';
      }

      ctx.fillStyle = fill;
      ctx.fillRect(cx + 1, cy + 1, CELL_SIZE - 1, CELL_SIZE - 1);

      // Crisp inner highlight along explored rooms
      if (isExp) {
        ctx.fillStyle = isBoss ? 'rgba(255, 160, 175, 0.25)'
          : isSanc ? 'rgba(158, 245, 220, 0.30)'
          : isSec ? 'rgba(255, 224, 130, 0.30)'
          : 'rgba(110, 165, 255, 0.22)';
        ctx.fillRect(cx + 1, cy + 1, CELL_SIZE - 1, 2);
      } else if (sel) {
        ctx.fillStyle = 'rgba(255, 214, 122, 0.14)';
        ctx.fillRect(cx + 1, cy + 1, CELL_SIZE - 1, CELL_SIZE - 1);
      }

      // Theme accent bar on first spine cell
      if (c === rm.spine[0][0] && rw === rm.spine[0][1] && disc) {
        ctx.fillStyle = theme.accent;
        ctx.fillRect(cx + 2, cy + CELL_SIZE - 2, CELL_SIZE - 3, 1);
      }

      // Sanctuary diamond glyph
      if (isSanc && (disc || isExp)) {
        ctx.fillStyle = isExp ? '#affff0' : '#58b8a8';
        ctx.fillRect(cx + 7, cy + 5, 2, 6);
        ctx.fillRect(cx + 5, cy + 7, 6, 2);
      }

      // Secret Vessel pip (gold star when found, pulsing amber glint when unfound in discovered area)
      if (isSec && (disc || isExp)) {
        if (vesselFound) {
          ctx.fillStyle = '#ffe680';
          ctx.fillRect(cx + 6, cy + 6, 4, 4);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(cx + 7, cy + 7, 2, 2);
        } else {
          ctx.fillStyle = `rgba(255, 200, 90, ${0.4 + 0.4 * pulse})`;
          ctx.fillRect(cx + 7, cy + 7, 2, 2);
        }
      }

      // Boss skull/crown marker on primary boss cell
      if (c === rm.boss[0][0] && rw === rm.boss[0][1] && (disc || isExp)) {
        ctx.fillStyle = done ? '#b8d0ff' : '#ffb4c0';
        ctx.fillRect(cx + 5, cy + 5, 6, 4);
        ctx.fillRect(cx + 6, cy + 9, 4, 2);
        ctx.fillStyle = '#140c18';
        ctx.fillRect(cx + 6, cy + 6, 1, 1);
        ctx.fillRect(cx + 9, cy + 6, 1, 1);
      }
    }
  }

  // Pass 2: Draw crisp architectural cell walls + open/gated doorway notches
  for (const [key, rm] of Object.entries(MAP_ROOMS)) {
    const done = isCleared(key, cleared);
    const disc = isDiscovered(key, cleared, discovered) || key === currentStageKey;
    const sel = key === cursor;

    for (const [c, rw] of rm.allCells) {
      const ck = `${c},${rw}`;
      const isExp = expSet.has(ck) || done;
      const wall = sel
        ? `rgba(255, 218, 130, ${0.72 + 0.28 * pulse})`
        : isExp ? '#dce8ff' : disc ? '#5b7099' : '#2a334a';
      const cx = MAP_X + c * CELL_SIZE;
      const cy = MAP_Y + rw * CELL_SIZE;

      // Top wall
      if (!rm.cellSet.has(`${c},${rw - 1}`)) {
        const door = DOOR_EDGES.get(edgeKey(c, rw, c, rw - 1));
        drawCellWall(ctx, cx, cy, cx + CELL_SIZE, cy, wall, door, relicSet);
      }
      // Bottom wall
      if (!rm.cellSet.has(`${c},${rw + 1}`)) {
        const door = DOOR_EDGES.get(edgeKey(c, rw, c, rw + 1));
        drawCellWall(ctx, cx, cy + CELL_SIZE, cx + CELL_SIZE, cy + CELL_SIZE, wall, door, relicSet);
      }
      // Left wall
      if (!rm.cellSet.has(`${c - 1},${rw}`)) {
        const door = DOOR_EDGES.get(edgeKey(c, rw, c - 1, rw));
        drawCellWall(ctx, cx, cy, cx, cy + CELL_SIZE, wall, door, relicSet);
      }
      // Right wall
      if (!rm.cellSet.has(`${c + 1},${rw}`)) {
        const door = DOOR_EDGES.get(edgeKey(c, rw, c + 1, rw));
        drawCellWall(ctx, cx + CELL_SIZE, cy, cx + CELL_SIZE, cy + CELL_SIZE, wall, door, relicSet);
      }
    }
  }

  // Pass 3: Selected region emblem/tag + compact wing names
  for (const [key, rm] of Object.entries(MAP_ROOMS)) {
    const st = STAGES[stageIndexOf(key)];
    const sel = key === cursor;
    const disc = isDiscovered(key, cleared, discovered) || key === currentStageKey;
    if (!disc && !sel) continue;
    const lx = Math.round(MAP_X + rm.labelPos[0] * CELL_SIZE);
    const ly = Math.round(MAP_Y + rm.labelPos[1] * CELL_SIZE - 3);
    const shortName = st.name.replace(/^THE /, '').replace("JACK-O'-LANTERN", 'JACK WOODS');
    if (sel && !(mode === 'live' && key === currentStageKey)) {
      const tw = font.width(shortName, 1, 1, false) + 8;
      ctx.fillStyle = 'rgba(8, 6, 18, 0.88)';
      ctx.fillRect(Math.round(lx - tw / 2), ly - 2, tw, 11);
      ctx.strokeStyle = '#ffd27a';
      ctx.strokeRect(Math.round(lx - tw / 2) + 0.5, ly - 1.5, tw - 1, 10);
      font.draw(ctx, shortName, lx, ly, { align: 'center', color: '#ffd27a', shadow: '#05040a', gothic: false });
    }
  }

  // Pass 4: LIVE HUNTER LOCATION BEACON (exact cell & fractional coordinate!)
  if (currentStageKey) {
    const loc = playerGridLocation(currentStageKey, playerNormX, inSecret);
    const bx = Math.round(loc.px);
    const by = Math.round(loc.py);
    const ringR = 5 + Math.round(pulse * 4);
    ctx.save();
    ctx.strokeStyle = `rgba(158, 245, 220, ${0.85 - pulse * 0.45})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(bx + 0.5, by + 0.5, ringR, 0, Math.PI * 2);
    ctx.stroke();
    // Crosshair ticks
    ctx.fillStyle = '#9ef5dc';
    ctx.fillRect(bx - 6, by, 3, 1);
    ctx.fillRect(bx + 4, by, 3, 1);
    ctx.fillRect(bx, by - 6, 1, 3);
    ctx.fillRect(bx, by + 4, 1, 3);
    // Blinking hunter core pip
    ctx.fillStyle = '#05040a';
    ctx.fillRect(bx - 3, by - 3, 7, 7);
    ctx.fillStyle = pulse > 0.35 ? '#ffffff' : '#ffd27a';
    ctx.fillRect(bx - 2, by - 2, 5, 5);
    ctx.fillStyle = '#ff4a66';
    ctx.fillRect(bx - 1, by - 1, 3, 3);
    // Floating "YOU" tag above beacon
    const tagY = by < MAP_Y + 22 ? by + 9 : by - 16;
    ctx.fillStyle = 'rgba(5, 4, 12, 0.92)';
    ctx.fillRect(bx - 12, tagY - 1, 25, 9);
    ctx.fillStyle = '#9ef5dc';
    ctx.fillRect(bx - 12, tagY - 1, 25, 1);
    font.draw(ctx, 'YOU', bx + 1, tagY, { align: 'center', color: '#ffffff', shadow: '#05040a', gothic: false });
    ctx.restore();
  }

  // Map key micro-legend right below the grid frame (y = 258)
  const ky = gy0 + gh + 4;
  const keyItems = [
    ['#1e4ea8', 'EXPLORED'],
    ['#19756a', 'SANCTUARY'],
    ['#962238', 'BOSS'],
    ['#ffe680', 'VESSEL'],
    ['#b48cff', 'RELIC GATE'],
  ];
  let kx = gx0 + 6;
  for (const [sw, lbl] of keyItems) {
    ctx.fillStyle = sw;
    ctx.fillRect(kx, ky + 1, 6, 6);
    font.draw(ctx, lbl, kx + 9, ky, { color: '#9aa8c4', shadow: '#05040a', gothic: false });
    kx += 9 + font.width(lbl, 1, 1, false) + 14;
  }
  font.draw(ctx, 'ARROWS INSPECT', gx0 + gw - 4, ky, { align: 'right', color: '#7f8ea8', shadow: '#05040a', gothic: false });

  // Bottom Inspector Plate (y = 272..354)
  const sIdx = stageIndexOf(cursor);
  const st = STAGES[sIdx];
  const theme = THEMES[st.theme] || THEMES.graveyard;
  const done = isCleared(cursor, cleared);
  const canWarp = isDiscovered(cursor, cleared, discovered);
  const vesselHere = sIdx >= 0 && !!((vessels >> sIdx) & 1);
  const lx = gx0, ly = 272, lw = gw, lh = 80;
  ctx.fillStyle = 'rgba(8, 6, 18, 0.94)';
  ctx.fillRect(lx, ly, lw, lh);
  ctx.strokeStyle = '#8a7650';
  ctx.lineWidth = 1;
  ctx.strokeRect(lx + 0.5, ly + 0.5, lw - 1, lh - 1);
  ctx.fillStyle = theme.accent;
  ctx.fillRect(lx + 1, ly + 1, 3, lh - 2);

  const iconL = assets.frame('map_icons', cursor);
  if (iconL) assets.draw(ctx, 'map_icons', cursor, lx + 22, ly + 22 + iconL.h / 2);
  const tx = lx + 42;
  const rx = lx + lw - 10;
  font.draw(ctx, `AREA ${String(st.id).padStart(2, '0')} · ${MAP_ROOMS[cursor].where}`, tx, ly + 7, { color: theme.accent, shadow: '#05040a', gothic: false });
  font.draw(ctx, st.name, tx, ly + 18, { scale: 2, gothic: false, color: '#efe3bf', shadow: '#05040a' });

  const relic = BOSS_RELICS[cursor];
  font.draw(ctx, `BOSS · ${st.boss ? st.boss.name : '???'}`, rx, ly + 7, { align: 'right', color: '#ffb0a0', shadow: '#05040a', gothic: false });

  // Action prompt on row 2 right
  if (mode === 'live') {
    if (cursor === currentStageKey) {
      font.draw(ctx, 'CURRENT AREA · M / ESC / ENTER RESUME', rx, ly + 21, { align: 'right', color: '#9ef5dc', shadow: '#05040a', gothic: false });
    } else if (canWarp) {
      font.draw(ctx, 'ENTER WARP TO SANCTUARY · M RESUME', rx, ly + 21, { align: 'right', color: pulse > 0.3 ? '#ffd27a' : '#b89448', shadow: '#05040a', gothic: false });
    } else {
      font.draw(ctx, 'UNCHARTED · EXPLORE NEIGHBOURING AREAS', rx, ly + 21, { align: 'right', color: '#7c8498', shadow: '#05040a', gothic: false });
    }
  } else {
    font.draw(
      ctx,
      done ? 'CLEARED · ENTER TO EXPLORE' : 'ENTER / JUMP / WHIP TO ENTER',
      rx,
      ly + 21,
      { align: 'right', color: done ? '#9ad17a' : (pulse > 0.3 ? '#ffd27a' : '#9a7a42'), shadow: '#05040a', gothic: false },
    );
  }

  // Row 3: Vessel + Relic status
  const vesselTag = vesselHere ? '* ANCIENT VESSEL FOUND (+1 HP)' : '· ANCIENT VESSEL HIDDEN IN AREA';
  font.draw(ctx, vesselTag, tx, ly + 40, { color: vesselHere ? '#ffe680' : '#9aa8c4', shadow: '#05040a', gothic: false });
  if (relic) {
    const rTag = done ? `* ${relic.name} (${relic.short})` : `RELIC · ${relic.name} (${relic.short})`;
    font.draw(ctx, rTag, rx, ly + 40, { align: 'right', color: done ? relic.color : '#c9b88a', shadow: '#05040a', gothic: false });
  }

  // Row 4: Connected passages & any ability gates on this area
  const doorsHere = stageDoorsFor(cursor);
  const gateNotes = doorsHere
    .filter((d) => d.gateRelic)
    .map((d) => {
      const rName = BOSS_RELICS[d.gateRelic]?.name || d.gateRelic;
      const destName = STAGES[stageIndexOf(d.targetKey)].name.replace(/^THE /, '');
      const unlocked = relicSet.has(d.gateRelic);
      return `${destName}: ${unlocked ? 'OPEN' : `NEEDS ${rName}`}`;
    });
  const bottomLeft = gateNotes.length > 0
    ? `GATES · ${gateNotes.join('  |  ')}`
    : `PASSAGES · ${MAP_ROOMS[cursor].exits.map((n) => STAGES[stageIndexOf(n)].name.replace(/^THE /, '')).join(' · ')}`;
  font.draw(ctx, bottomLeft, tx, ly + 56, { color: '#8a9ab5', shadow: '#05040a', gothic: false });
  font.draw(ctx, 'N MUTE', rx, ly + 56, { align: 'right', color: '#5b6b86', shadow: '#05040a', gothic: false });
}

/**
 * Compact 7x4-cell live HUD Mini-Map radar anchored at `(x, y)` (`58x34` px).
 * Shows explored cobalt rooms, sanctuary/boss/secret rooms, walls, and blinking hunter dot!
 */
export function drawMiniMap(ctx, font, world, x, y) {
  const stageKey = world.stage.key;
  const normX = world.level.width > 0 ? world.player.x / world.level.width : 0;
  const loc = playerGridLocation(stageKey, normX, !!world.inSecretArea);
  const game = world.game;
  const expSet = (game && game.exploredCells) ? game.exploredCells : new Set();
  const cleared = (game && game.cleared) || 0;
  const vessels = (game && game.vessels) || 0;
  const colsW = 7, rowsH = 4, cs = 7;
  const pw = colsW * cs + 4, ph = rowsH * cs + 4;

  ctx.save();
  ctx.fillStyle = 'rgba(6, 8, 18, 0.86)';
  ctx.fillRect(x, y, pw, ph);
  ctx.strokeStyle = '#5b6b86';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, pw - 1, ph - 1);

  const cStart = loc.col - Math.floor(colsW / 2);
  const rStart = loc.row - Math.floor(rowsH / 2);

  for (let dr = 0; dr < rowsH; dr++) {
    for (let dc = 0; dc < colsW; dc++) {
      const gc = cStart + dc, gr = rStart + dr;
      const ck = `${gc},${gr}`;
      const ownerKey = CELL_OWNER.get(ck);
      const sx = x + 2 + dc * cs;
      const sy = y + 2 + dr * cs;
      if (!ownerKey) continue;
      const rm = MAP_ROOMS[ownerKey];
      const sIdx = stageIndexOf(ownerKey);
      const done = isCleared(ownerKey, cleared);
      const isExp = expSet.has(ck) || done || (gc === loc.col && gr === loc.row);
      const vesselFound = sIdx >= 0 && !!((vessels >> sIdx) & 1);
      if (isExp) {
        if (rm.bossSet.has(ck)) ctx.fillStyle = done ? '#463fa0' : '#a8263e';
        else if (ck === rm.sanctuaryKey) ctx.fillStyle = '#1d8578';
        else if (ck === rm.secretKey) ctx.fillStyle = vesselFound ? '#b88622' : '#705218';
        else ctx.fillStyle = '#2458be';
      } else {
        ctx.fillStyle = ownerKey === stageKey ? 'rgba(42, 62, 108, 0.68)' : 'rgba(26, 34, 58, 0.45)';
      }
      ctx.fillRect(sx, sy, cs - 1, cs - 1);

      // Crisp mini-walls
      ctx.fillStyle = isExp ? '#cad8ff' : '#4a5a7a';
      if (!rm.cellSet.has(`${gc},${gr - 1}`)) ctx.fillRect(sx, sy, cs, 1);
      if (!rm.cellSet.has(`${gc},${gr + 1}`)) ctx.fillRect(sx, sy + cs - 1, cs, 1);
      if (!rm.cellSet.has(`${gc - 1},${gr}`)) ctx.fillRect(sx, sy, 1, cs);
      if (!rm.cellSet.has(`${gc + 1},${gr}`)) ctx.fillRect(sx + cs - 1, sy, 1, cs);
    }
  }

  // Blinking hunter dot at center cell
  const hx = x + 2 + Math.floor(colsW / 2) * cs + 2;
  const hy = y + 2 + Math.floor(rowsH / 2) * cs + 2;
  if (Math.floor((world.time || 0) * 6) % 2 === 0) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(hx - 1, hy - 1, 3, 3);
  } else {
    ctx.fillStyle = '#ffd27a';
    ctx.fillRect(hx, hy, 2, 2);
  }

  font.draw(ctx, 'M MAP', x + Math.round(pw / 2), y + ph + 2, {
    align: 'center',
    color: '#9eb0d0',
    shadow: '#120f1c',
    gothic: false,
  });
  ctx.restore();
}
