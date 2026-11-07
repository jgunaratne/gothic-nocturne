// Castle Exploration Map: all eighteen built-in regions (plus Castle Forge wings)
// laid out as interlocking multi-story halls, vertical tower shafts, diagonal grand
// stairways, sky-bridges, and subterranean waterways on a 72 x 27 grid, joined
// wall-to-wall by open, relic-gated, and Golden Loop doorways, with per-cell fog
// of war, Sanctuary Waystones, Secret Ancient Vessels, Boss chambers, a live
// screen-matched hunter location beacon (press M anytime), and a HUD mini-map radar.

import { W, H } from '../engine/constants.js';
import { STAGES } from './stages.js';
import { THEMES } from './builder.js';
import { BOSS_RELICS } from './relics.js';
import { paletteForSlot } from './net_player.js';
import { stageRankFor } from './progression.js';
import { lookupStageCell, revealStageCells } from './level_schema.js';
import {
  GRID_COLS,
  GRID_ROWS,
  MAP_ROOMS,
  MAP_DOORS,
  MAP_LINKS,
  CELL_OWNER,
  DOOR_EDGES,
  TOTAL_MAP_CELLS,
  edgeKey,
  rebuildMapIndex,
  registerMapRoom,
  placeForgedRoom,
  canTraverseDoor,
  stageDoorsFor,
} from './map_layout.js';

export {
  GRID_COLS,
  GRID_ROWS,
  MAP_ROOMS,
  MAP_DOORS,
  MAP_LINKS,
  CELL_OWNER,
  DOOR_EDGES,
  TOTAL_MAP_CELLS,
  rebuildMapIndex,
  registerMapRoom,
  placeForgedRoom,
  canTraverseDoor,
  stageDoorsFor,
};

export const CELL_SIZE = 8;
export const MAP_X = Math.round((W - GRID_COLS * CELL_SIZE) / 2); // 32
export const MAP_Y = 36;

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
  return idx >= 0 && !!((clearedMask >>> idx) & 1);
}

export function isDiscovered(key, clearedMask, discoveredMask = 0) {
  if (key === 'graveyard') return true;
  const idx = stageIndexOf(key);
  if (idx >= 0 && (((clearedMask >>> idx) & 1) || ((discoveredMask >>> idx) & 1))) return true;
  return isAdjacentToCleared(key, clearedMask | discoveredMask);
}

export function isAdjacentToCleared(key, clearedMask) {
  if (key === 'graveyard') return true;
  return MAP_ROOMS[key].exits.some((n) => isCleared(n, clearedMask));
}

/**
 * Maps the hunter's normalized stage X (`0..1`) and Y (`0..1`) into the exact
 * Castle Grid cell and sub-cell pixel coordinates on the 640x360 map screen.
 * Uses direct `stage.roomSchema` screen-to-map lookup on built-in stages and
 * falls back to spine interpolation on Castle Forge wings.
 */
export function playerGridLocation(stageKey, normX = 0, inSecret = false, normY = 0.5) {
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
  const sIdx = stageIndexOf(stageKey);
  const st = sIdx >= 0 ? STAGES[sIdx] : null;
  const direct = st ? lookupStageCell(st, normX, normY == null ? 0.5 : normY, inSecret) : null;
  if (direct && r.cellSet.has(`${direct.col},${direct.row}`)) {
    return {
      col: direct.col,
      row: direct.row,
      cellKey: `${direct.col},${direct.row}`,
      px: MAP_X + direct.fc * CELL_SIZE,
      py: MAP_Y + direct.fr * CELL_SIZE,
    };
  }
  const t = Math.max(0, Math.min(0.9999, normX));
  const scaled = t * r.spine.length;
  const idx = Math.min(r.spine.length - 1, Math.floor(scaled));
  const sub = scaled - idx;
  let [c0, r0] = r.spine[idx];
  const [c1, r1] = r.spine[Math.min(r.spine.length - 1, idx + 1)];
  if (normY != null && (normY < 0.34 || normY > 0.72)) {
    const dr = normY < 0.34 ? -1 : 1;
    if (r.cellSet.has(`${c0},${r0 + dr}`) && `${c0},${r0 + dr}` !== r.secretKey) {
      r0 += dr;
    }
  }
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

/** Returns cell keys (`"c,r"`) revealed by standing at `(normX, normY)` in `stageKey`. */
export function cellsToRevealAt(stageKey, normX = 0, {
  inSecret = false,
  cleared = false,
  sanctuary = false,
  vesselFound = false,
  normY = 0.5,
} = {}) {
  const r = MAP_ROOMS[stageKey];
  if (!r) return [];
  const sIdx = stageIndexOf(stageKey);
  const st = sIdx >= 0 ? STAGES[sIdx] : null;
  if (st && (st.gridMeta || st.roomSchema)) {
    const directReveal = revealStageCells(st, r, normX, normY, {
      inSecret, cleared, sanctuary, vesselFound,
    });
    if (directReveal) {
      return directReveal.filter((ck) => r.cellSet.has(ck));
    }
  }
  const out = [];
  const t = Math.max(0, Math.min(0.9999, normX));
  const idx = Math.min(r.spine.length - 1, Math.floor(t * r.spine.length));
  const [c, rw] = r.spine[idx];
  out.push(`${c},${rw}`);
  for (const [ec, erw] of r.extra) {
    const ek = `${ec},${erw}`;
    if (ek === r.secretKey) continue;
    const dist = Math.abs(ec - c) + Math.abs(erw - rw);
    if (dist <= 1) out.push(ek);
    else if (dist <= 2 && ((normY < 0.38 && erw <= rw) || (normY > 0.66 && erw >= rw))) out.push(ek);
  }
  if (sanctuary) out.push(r.sanctuaryKey);
  if (inSecret || vesselFound) out.push(r.secretKey);
  if (cleared) {
    for (const [bc, brw] of r.boss) out.push(`${bc},${brw}`);
    for (const [sc, srw] of r.spine) out.push(`${sc},${srw}`);
    for (const [ec, erw] of r.extra) {
      if (`${ec},${erw}` !== r.secretKey && `${ec},${erw}` !== r.bonusSecretKey) out.push(`${ec},${erw}`);
      else if (`${ec},${erw}` === r.secretKey && vesselFound) out.push(`${ec},${erw}`);
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
  const room = MAP_ROOMS[clearedKey];
  if (!room) return null;
  const open = room.exits.filter((n) => !isCleared(n, clearedMask));
  return open[0] || null;
}

/**
 * Resolves the next adjacent/nearby stage to enter when walking through the
 * Boss Exit Door or a progression passage from `clearedKey`.
 * Always progresses to a nearby connected stage that has NOT been completed yet
 * (and avoids returning to `'graveyard'` or stages already visited this session
 * whenever unvisited uncompleted regions remain).
 * Returns `null` after `'throne'` (The Count) so the Dawn Finale plays.
 */
export function nextAdjacentStageKey(clearedKey, clearedMask, relicsSet = null, canEnter = null, visitedSet = null) {
  if (clearedKey === 'throne') return null;
  const curIdx = stageIndexOf(clearedKey);
  const room = MAP_ROOMS[clearedKey];
  if (!room || !room.exits || !room.exits.length) {
    return (curIdx >= 0 && curIdx + 1 < STAGES.length) ? STAGES[curIdx + 1].key : null;
  }
  const effectiveRelics = relicsSet ? new Set([...relicsSet, clearedKey]) : null;
  const doors = stageDoorsFor(clearedKey);
  const canReachNeighbor = (neighborKey) => {
    if (!effectiveRelics) return true;
    const matching = doors.filter((d) => d.targetKey === neighborKey);
    if (!matching.length) return true;
    return matching.some((d) => canTraverseDoor(d, effectiveRelics));
  };
  const isAllowed = (k) => k && k !== clearedKey && (typeof canEnter !== 'function' || canEnter(k));
  const isUncleared = (k) => !isCleared(k, clearedMask);
  const isUnvisited = (k) => k !== 'graveyard' && (!visitedSet || !visitedSet.has(k));
  const isFresh = (k) => isUncleared(k) && isUnvisited(k);

  // Order candidate neighbors so forward castle stages (higher stage index) come before
  // earlier stages (preventing backward loops to Graveyard when forward neighbors exist).
  const orderForward = (list) => [...list].sort((a, b) => {
    const reachA = canReachNeighbor(a) ? 0 : 1;
    const reachB = canReachNeighbor(b) ? 0 : 1;
    if (reachA !== reachB) return reachA - reachB;
    const ia = stageIndexOf(a);
    const ib = stageIndexOf(b);
    const fwdA = ia > curIdx ? 0 : 1;
    const fwdB = ib > curIdx ? 0 : 1;
    if (fwdA !== fwdB) return fwdA - fwdB;
    return ia - ib;
  });

  const exits = orderForward(room.exits.filter(isAllowed));

  // 1. Direct adjacent stages that are both uncleared and not yet visited this session
  const freshAdjacent = exits.filter(isFresh);
  if (freshAdjacent.length) {
    const nonThrone = freshAdjacent.filter((n) => n !== 'throne' || clearedKey === 'clocktower');
    return nonThrone[0] || freshAdjacent[0];
  }

  // 2. Direct adjacent stages that are uncleared (excluding Graveyard unless no other uncleared stage exists)
  const unclearedAdjacent = exits.filter((n) => isUncleared(n) && n !== 'graveyard');
  if (unclearedAdjacent.length) {
    const nonThrone = unclearedAdjacent.filter((n) => n !== 'throne' || clearedKey === 'clocktower');
    return nonThrone[0] || unclearedAdjacent[0];
  }

  // 3. BFS across the Castle Grid to find the nearest remaining uncompleted region in the castle
  const bfsFind = (predicate) => {
    const seen = new Set([clearedKey]);
    const queue = [...exits];
    for (const k of queue) seen.add(k);
    while (queue.length) {
      const key = queue.shift();
      if (isAllowed(key) && predicate(key)) return key;
      const r = MAP_ROOMS[key];
      if (!r || !r.exits) continue;
      const nextNeighbors = [...r.exits].sort((a, b) => {
        const ia = stageIndexOf(a);
        const ib = stageIndexOf(b);
        const fwdA = ia > curIdx ? 0 : 1;
        const fwdB = ib > curIdx ? 0 : 1;
        return fwdA !== fwdB ? fwdA - fwdB : ia - ib;
      });
      for (const nxt of nextNeighbors) {
        if (!seen.has(nxt)) {
          seen.add(nxt);
          queue.push(nxt);
        }
      }
    }
    return null;
  };

  const nearestFresh = bfsFind((k) => isFresh(k) && k !== 'throne');
  if (nearestFresh) return nearestFresh;

  const nearestUnclearedNonGy = bfsFind((k) => isUncleared(k) && k !== 'graveyard' && k !== 'throne');
  if (nearestUnclearedNonGy) return nearestUnclearedNonGy;

  const nearestAnyUncleared = bfsFind((k) => isUncleared(k));
  if (nearestAnyUncleared) return nearestAnyUncleared;

  // 4. Fallback scan of STAGES in order for any allowed uncleared stage
  for (const st of STAGES) {
    if (isAllowed(st.key) && isUncleared(st.key)) return st.key;
  }

  // 5. Entire castle cleared: step into a forward / unvisited neighbor
  return exits.find(isUnvisited) || exits[0] || room.exits[0];
}

function countBits(mask, max = 18) {
  let n = 0;
  for (let i = 0; i < max; i++) if ((mask >>> i) & 1) n++;
  return n;
}

/**
 * Returns true if two adjacent cells `(c1, r1)` and `(c2, r2)` inside the SAME
 * region `rm` share an open physical passage/stairwell/hatch rather than a solid
 * internal masonry wall or sealed floor.
 */
function isInternalEdgeOpen(rm, key, c1, r1, c2, r2) {
  const k1 = `${c1},${r1}`;
  const k2 = `${c2},${r2}`;
  if (rm.bossSet.has(k1) && rm.bossSet.has(k2)) return true;

  // Breakable-wall hidden chamber (`bonusSecretKey`) ONLY connects horizontally to `bonusSecretFromKey`
  if (rm.bonusSecretKey && (k1 === rm.bonusSecretKey || k2 === rm.bonusSecretKey)) {
    const other = k1 === rm.bonusSecretKey ? k2 : k1;
    return r1 === r2 && other === rm.bonusSecretFromKey;
  }

  // Ancient Vessel chamber (`secretKey`) ONLY connects vertically (floor hatch or high balcony), never horizontally
  if (k1 === rm.secretKey || k2 === rm.secretKey) {
    return c1 === c2;
  }

  // Isolated high-balcony doorway pockets only connect vertically to the hall below, never horizontally
  if (r1 === r2) {
    const isHighDoorCell = (ck) => MAP_DOORS.some((d) => (
      (d.a === key && d.highA && `${d.cellA[0]},${d.cellA[1]}` === ck)
      || (d.b === key && d.highB && `${d.cellB[0]},${d.cellB[1]}` === ck)
    ));
    if (isHighDoorCell(k1) || isHighDoorCell(k2)) return false;
  }

  return true;
}

/**
 * Draws an internal partition between two adjacent cells of the same stage:
 * - Solid 1px wall if sealed (`!open`),
 * - Crisp 2px corner jambs with a 4px open doorway/stairwell notch if connected (`open`).
 */
function drawInternalCellThreshold(ctx, x1, y1, x2, y2, wallColor, jambColor, open) {
  if (!open) {
    ctx.fillStyle = wallColor;
    if (y1 === y2) ctx.fillRect(x1, y1, x2 - x1 + 1, 1);
    else ctx.fillRect(x1, y1, 1, y2 - y1 + 1);
    return;
  }
  ctx.fillStyle = jambColor;
  if (y1 === y2) {
    // Horizontal edge (stairwell / skylight between r and r + 1): 2px corner jambs, 4px center opening
    ctx.fillRect(x1, y1, 2, 1);
    ctx.fillRect(x2 - 1, y1, 2, 1);
  } else {
    // Vertical edge (corridor threshold between c and c + 1): 2px top/bottom jambs, 4px center doorway
    ctx.fillRect(x1, y1, 1, 2);
    ctx.fillRect(x1, y2 - 1, 1, 2);
  }
}

/**
 * Draws a wall segment from (x1, y1) to (x2, y2) on an 8px cell edge, leaving
 * a crisp 3px doorway notch (or glowing relic-gate bar) if `door` is provided.
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
    ctx.fillRect(x1, y1, Math.max(1, mid - 2 - x1), 1);
    ctx.fillRect(mid + 2, y1, Math.max(1, x2 - (mid + 2) + 1), 1);
    ctx.fillStyle = gateColor;
    if (open) {
      ctx.fillRect(mid - 2, y1 - 1, 1, 3);
      ctx.fillRect(mid + 2, y1 - 1, 1, 3);
    } else {
      ctx.fillRect(mid - 2, y1 - 1, 5, 3);
    }
  } else {
    const mid = Math.round((y1 + y2) * 0.5);
    ctx.fillStyle = wallColor;
    ctx.fillRect(x1, y1, 1, Math.max(1, mid - 2 - y1));
    ctx.fillRect(x1, mid + 2, 1, Math.max(1, y2 - (mid + 2) + 1));
    ctx.fillStyle = gateColor;
    if (open) {
      ctx.fillRect(x1 - 1, mid - 2, 3, 1);
      ctx.fillRect(x1 - 1, mid + 2, 3, 1);
    } else {
      ctx.fillRect(x1 - 1, mid - 2, 3, 5);
    }
  }
}

/**
 * Full-screen Interconnected Castle Exploration Map (`640x360`, 68x27 cells).
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
  charLevel = 1,
  mode = 'select',
  currentStageKey = null,
  playerNormX = 0,
  playerNormY = 0.5,
  inSecret = false,
  remotePlayers = null,
  onlineCount = 1,
  roomName = 'castle',
  netConnected = false,
  gateInfo = null,
}) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 5.2);
  const expSet = explored || new Set();
  const relicSet = relics || new Set();
  // Progression gates (see gates.js): `{ bossOpen, entryLock }` per region, when the caller provides them.
  const gateOf = (key) => (typeof gateInfo === 'function' ? gateInfo(key) : null) || { bossOpen: true, entryLock: null };

  // Dimmed parchment + deep cartographer's blueprint slate
  const parchment = assets.img('map_parchment');
  if (parchment) {
    ctx.drawImage(parchment, 0, 0, W, H);
    ctx.fillStyle = 'rgba(7, 8, 18, 0.82)';
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.fillStyle = '#090a14';
    ctx.fillRect(0, 0, W, H);
  }

  // Header bar
  const pct = exploredPercent(expSet);
  const vesselCount = countBits(vessels, STAGES.length);
  const relicCount = relicSet.size;
  const peers = Array.isArray(remotePlayers) ? remotePlayers : [];
  if (currentStageKey && STAGES[stageIndexOf(currentStageKey)]) {
    const curName = STAGES[stageIndexOf(currentStageKey)].name.replace(/^THE /, '');
    const onlineTag = netConnected ? ` · ${onlineCount} ONLINE` : '';
    font.draw(ctx, `* HERE · ${curName}${onlineTag}`, 16, 4, { color: '#9ef5dc', shadow: '#05040a', gothic: false });
  } else {
    const onlineTag = netConnected ? ` · ${onlineCount} ONLINE (${roomName.toUpperCase()})` : '';
    font.draw(ctx, `${difficultyName} HUNT${onlineTag}`, 16, 4, { color: netConnected && onlineCount > 1 ? '#62f2c2' : '#a89a74', shadow: '#05040a', gothic: false });
  }
  font.draw(ctx, 'CASTLE EXPLORATION MAP', W / 2, 14, { scale: 2, gothic: false, align: 'center', color: '#efe3bf', shadow: '#05040a' });
  font.draw(
    ctx,
    `LV ${String(charLevel).padStart(2, '0')} · MAP ${pct}% · RELICS ${relicCount}/${STAGES.length} · VESSELS ${vesselCount}/${STAGES.length}`,
    W - 16,
    4,
    { align: 'right', color: '#ffd27a', shadow: '#05040a', gothic: false },
  );

  // Blueprint grid frame (y = 31..257)
  const gx0 = MAP_X - 6, gy0 = MAP_Y - 5;
  const gw = GRID_COLS * CELL_SIZE + 12, gh = GRID_ROWS * CELL_SIZE + 10;
  ctx.fillStyle = 'rgba(7, 10, 22, 0.92)';
  ctx.fillRect(gx0, gy0, gw, gh);
  ctx.strokeStyle = '#5a6a8a';
  ctx.lineWidth = 1;
  ctx.strokeRect(gx0 + 0.5, gy0 + 0.5, gw - 1, gh - 1);
  ctx.strokeStyle = '#26304a';
  ctx.strokeRect(gx0 + 2.5, gy0 + 2.5, gw - 5, gh - 5);

  // Subtle background 8x8 cartographer sub-grid
  ctx.fillStyle = 'rgba(66, 88, 134, 0.11)';
  for (let c = 0; c <= GRID_COLS; c++) {
    ctx.fillRect(MAP_X + c * CELL_SIZE, MAP_Y, 1, GRID_ROWS * CELL_SIZE);
  }
  for (let r = 0; r <= GRID_ROWS; r++) {
    ctx.fillRect(MAP_X, MAP_Y + r * CELL_SIZE, GRID_COLS * CELL_SIZE, 1);
  }

  // Pass 1: Draw all room cell interiors (Crimson Save Sanctums, Golden Warp Chambers, Boss Halls, Hidden Vaults)
  for (const [key, rm] of Object.entries(MAP_ROOMS)) {
    const sIdx = stageIndexOf(key);
    const st = STAGES[sIdx];
    if (!st) continue;
    const theme = THEMES[st.theme] || THEMES.graveyard;
    const done = isCleared(key, cleared);
    const disc = isDiscovered(key, cleared, discovered) || key === currentStageKey;
    const vesselFound = sIdx >= 0 && !!((vessels >>> sIdx) & 1);
    const sel = key === cursor;
    const isVisibleCell = (ck) => (ck === rm.bonusSecretKey ? expSet.has(ck) : true);

    for (const [c, rw] of rm.allCells) {
      const ck = `${c},${rw}`;
      if (!isVisibleCell(ck)) continue;
      const cx = MAP_X + c * CELL_SIZE;
      const cy = MAP_Y + rw * CELL_SIZE;
      const isBonusSec = ck === rm.bonusSecretKey;
      const isExp = isBonusSec ? expSet.has(ck) : (expSet.has(ck) || done);
      const isBoss = rm.bossSet.has(ck);
      const isSanc = ck === rm.sanctuaryKey;
      const isWarp = ck === rm.warpKey;
      const isSec = ck === rm.secretKey;

      let fill = 'rgba(18, 22, 36, 0.44)';
      if (isExp) {
        if (isBoss) fill = done ? '#3d368a' : '#7a2266';
        else if (isSanc) fill = '#cc2244';
        else if (isWarp) fill = '#cc8e14';
        else if (isBonusSec) fill = '#268c64';
        else if (isSec) fill = vesselFound ? '#1f877a' : '#165e56';
        else fill = '#1e4ea8';
      } else if (disc) {
        if (isBoss) fill = 'rgba(104, 28, 92, 0.48)';
        else if (isSanc) fill = 'rgba(168, 28, 58, 0.48)';
        else if (isWarp) fill = 'rgba(176, 122, 20, 0.46)';
        else if (isSec) fill = vesselFound ? '#1c7a6e' : 'rgba(24, 96, 88, 0.40)';
        else fill = 'rgba(28, 42, 74, 0.64)';
      }

      const leftKey = `${c - 1},${rw}`;
      const topKey = `${c},${rw - 1}`;
      const joinL = (rm.cellSet.has(leftKey) && isVisibleCell(leftKey)) ? 0 : 1;
      const joinT = (rm.cellSet.has(topKey) && isVisibleCell(topKey)) ? 0 : 1;
      ctx.fillStyle = fill;
      ctx.fillRect(cx + joinL, cy + joinT, CELL_SIZE - joinL, CELL_SIZE - joinT);

      // Crisp inner architectural ceiling highlight along exterior room ceilings
      if (isExp && !(rm.cellSet.has(topKey) && isVisibleCell(topKey))) {
        ctx.fillStyle = isBoss ? 'rgba(220, 165, 255, 0.28)'
          : isSanc ? 'rgba(255, 168, 186, 0.42)'
          : isWarp ? 'rgba(255, 236, 150, 0.44)'
          : (isBonusSec || isSec) ? 'rgba(158, 255, 224, 0.36)'
          : 'rgba(120, 178, 255, 0.25)';
        ctx.fillRect(cx + joinL, cy + 1, CELL_SIZE - joinL, 1);
      } else if (sel && !isExp) {
        ctx.fillStyle = 'rgba(255, 214, 122, 0.16)';
        ctx.fillRect(cx + joinL, cy + joinT, CELL_SIZE - joinL, CELL_SIZE - joinT);
      }

      // Theme accent threshold bar on entrance cell
      if (c === rm.spine[0][0] && rw === rm.spine[0][1] && disc) {
        ctx.fillStyle = theme.accent;
        ctx.fillRect(cx + 1, cy + CELL_SIZE - 2, CELL_SIZE - 1, 1);
      }

      // Crimson Save Sanctum polyhedron/cross glyph
      if (isSanc && (disc || isExp)) {
        ctx.fillStyle = isExp ? '#ffe4ec' : '#d86882';
        ctx.fillRect(cx + 3, cy + 2, 2, 5);
        ctx.fillRect(cx + 2, cy + 3, 4, 3);
        if (isExp) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(cx + 3, cy + 3, 2, 2);
        }
      }

      // Golden Warp Chamber astral portal diamond
      if (isWarp && (disc || isExp)) {
        ctx.fillStyle = isExp ? '#9ef5ff' : '#d8a848';
        ctx.fillRect(cx + 3, cy + 2, 2, 4);
        ctx.fillRect(cx + 2, cy + 3, 4, 2);
        if (isExp) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(cx + 3, cy + 3, 2, 2);
        }
      }

      // Hidden Breakable-Wall Bonus Chamber reliquary chest pip
      if (isBonusSec && isExp) {
        ctx.fillStyle = '#ffd84d';
        ctx.fillRect(cx + 2, cy + 3, 4, 3);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(cx + 3, cy + 3, 2, 1);
      }

      // Secret Vessel pip
      if (isSec && (disc || isExp)) {
        if (vesselFound) {
          ctx.fillStyle = '#ffe680';
          ctx.fillRect(cx + 2, cy + 2, 4, 4);
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(cx + 3, cy + 3, 2, 2);
        } else {
          ctx.fillStyle = `rgba(158, 255, 224, ${0.42 + 0.42 * pulse})`;
          ctx.fillRect(cx + 3, cy + 3, 2, 2);
        }
      }
    }

    // Boss chamber emblem centered inside the multi-cell boss sanctum!
    const anyBossExp = done || rm.boss.some(([bc, br]) => expSet.has(`${bc},${br}`));
    if (disc || anyBossExp) {
      const bx = Math.round(MAP_X + rm.bossCenter[0] * CELL_SIZE);
      const by = Math.round(MAP_Y + rm.bossCenter[1] * CELL_SIZE);
      const gate = gateOf(key);
      const sealed = !done && !gate.bossOpen;
      ctx.fillStyle = '#140c18';
      ctx.fillRect(bx - 3, by - 3, 7, 7);
      ctx.fillStyle = done ? '#b8d0ff' : (sealed ? '#7a4e5c' : '#ffb4c0');
      ctx.fillRect(bx - 2, by - 2, 5, 3);
      ctx.fillRect(bx - 1, by + 1, 3, 2);
      ctx.fillStyle = '#140c18';
      ctx.fillRect(bx - 1, by - 1, 1, 1);
      ctx.fillRect(bx + 1, by - 1, 1, 1);
      if (sealed) {
        // Sealed Boss Gate Door: a tiny padlock pinned to the chamber emblem
        const lx = bx + 4, ly = by - 6;
        ctx.fillStyle = '#05040a';
        ctx.fillRect(lx - 1, ly - 1, 6, 7);
        ctx.fillStyle = key === 'throne' ? `rgba(226, 60, 60, ${0.7 + 0.3 * pulse})` : '#ff6a88';
        ctx.fillRect(lx, ly + 2, 4, 3);
        ctx.fillRect(lx, ly, 1, 2);
        ctx.fillRect(lx + 3, ly, 1, 2);
        ctx.fillRect(lx + 1, ly - 1, 2, 1);
      }
    }
  }

  // Pass 2: Draw crisp architectural perimeter walls, external gates & internal room doorway ticks
  for (const [key, rm] of Object.entries(MAP_ROOMS)) {
    const done = isCleared(key, cleared);
    const disc = isDiscovered(key, cleared, discovered) || key === currentStageKey;
    const sel = key === cursor;
    const isVisibleCell = (ck) => (ck === rm.bonusSecretKey ? expSet.has(ck) : true);

    for (const [c, rw] of rm.allCells) {
      const ck = `${c},${rw}`;
      if (!isVisibleCell(ck)) continue;
      const isBonusSec = ck === rm.bonusSecretKey;
      const isExp = isBonusSec ? expSet.has(ck) : (expSet.has(ck) || done);
      const wall = sel
        ? `rgba(255, 218, 130, ${0.76 + 0.24 * pulse})`
        : isExp ? '#dce8ff' : disc ? '#5b7099' : '#2a334a';
      const jamb = sel
        ? 'rgba(255, 224, 148, 0.56)'
        : isExp ? 'rgba(198, 222, 255, 0.50)' : disc ? 'rgba(96, 120, 164, 0.42)' : 'rgba(46, 58, 84, 0.35)';
      const cx = MAP_X + c * CELL_SIZE;
      const cy = MAP_Y + rw * CELL_SIZE;

      const nUp = `${c},${rw - 1}`;
      const nDn = `${c},${rw + 1}`;
      const nLt = `${c - 1},${rw}`;
      const nRt = `${c + 1},${rw}`;

      if (!(rm.cellSet.has(nUp) && isVisibleCell(nUp))) {
        const door = DOOR_EDGES.get(edgeKey(c, rw, c, rw - 1));
        drawCellWall(ctx, cx, cy, cx + CELL_SIZE, cy, wall, door, relicSet);
      }
      if (!(rm.cellSet.has(nDn) && isVisibleCell(nDn))) {
        const door = DOOR_EDGES.get(edgeKey(c, rw, c, rw + 1));
        drawCellWall(ctx, cx, cy + CELL_SIZE, cx + CELL_SIZE, cy + CELL_SIZE, wall, door, relicSet);
      } else if (!(rm.bossSet.has(ck) && rm.bossSet.has(nDn))) {
        const open = isInternalEdgeOpen(rm, key, c, rw, c, rw + 1);
        drawInternalCellThreshold(ctx, cx, cy + CELL_SIZE, cx + CELL_SIZE, cy + CELL_SIZE, wall, jamb, open);
      }

      if (!(rm.cellSet.has(nLt) && isVisibleCell(nLt))) {
        const door = DOOR_EDGES.get(edgeKey(c, rw, c - 1, rw));
        drawCellWall(ctx, cx, cy, cx, cy + CELL_SIZE, wall, door, relicSet);
      }
      if (!(rm.cellSet.has(nRt) && isVisibleCell(nRt))) {
        const door = DOOR_EDGES.get(edgeKey(c, rw, c + 1, rw));
        drawCellWall(ctx, cx + CELL_SIZE, cy, cx + CELL_SIZE, cy + CELL_SIZE, wall, door, relicSet);
      } else if (!(rm.bossSet.has(ck) && rm.bossSet.has(nRt))) {
        const open = isInternalEdgeOpen(rm, key, c, rw, c + 1, rw);
        drawInternalCellThreshold(ctx, cx + CELL_SIZE, cy, cx + CELL_SIZE, cy + CELL_SIZE, wall, jamb, open);
      }
    }
  }

  // Pass 3: Selected region floating banner tag
  for (const [key, rm] of Object.entries(MAP_ROOMS)) {
    const st = STAGES[stageIndexOf(key)];
    if (!st) continue;
    const sel = key === cursor;
    const disc = isDiscovered(key, cleared, discovered) || key === currentStageKey;
    if (!disc && !sel) continue;
    if (sel && !(mode === 'live' && key === currentStageKey)) {
      const shortName = st.name.replace(/^THE /, '').replace("JACK-O'-LANTERN", 'JACK WOODS');
      const tw = font.width(shortName, 1, 1, false) + 8;
      const rawX = Math.round(MAP_X + rm.labelPos[0] * CELL_SIZE);
      const rawY = Math.round(MAP_Y + rm.labelPos[1] * CELL_SIZE - 5);
      const lx = Math.max(MAP_X + Math.ceil(tw / 2) + 2, Math.min(MAP_X + GRID_COLS * CELL_SIZE - Math.ceil(tw / 2) - 2, rawX));
      const ly = Math.max(MAP_Y + 3, Math.min(MAP_Y + GRID_ROWS * CELL_SIZE - 11, rawY));
      ctx.fillStyle = 'rgba(8, 6, 18, 0.90)';
      ctx.fillRect(Math.round(lx - tw / 2), ly - 2, tw, 11);
      ctx.strokeStyle = '#ffd27a';
      ctx.strokeRect(Math.round(lx - tw / 2) + 0.5, ly - 1.5, tw - 1, 10);
      font.draw(ctx, shortName, lx, ly, { align: 'center', color: '#ffd27a', shadow: '#05040a', gothic: false });
    }
  }

  // Pass 3.5: REMOTE NETWORK HUNTER BEACONS across all castle wings!
  const localLoc = currentStageKey ? playerGridLocation(currentStageKey, playerNormX, inSecret, playerNormY) : null;
  const placedTags = [];
  if (localLoc) {
    const lbx = Math.round(localLoc.px);
    const lby = Math.round(localLoc.py);
    const lTagY = lby < MAP_Y + 20 ? lby + 8 : lby - 15;
    placedTags.push({ x: lbx - 13, y: lTagY - 1, w: 27, h: 10 });
  }
  if (peers.length > 0) {
    ctx.save();
    peers.forEach((rp, idx) => {
      if (!rp.stageKey || !MAP_ROOMS[rp.stageKey]) return;
      const rLoc = playerGridLocation(rp.stageKey, rp.normX || 0, !!rp.inSecret, rp.normY ?? 0.5);
      const rbx = Math.round(rLoc.px);
      const rby = Math.round(rLoc.py);
      const pal = paletteForSlot(rp.slot);
      const rRing = 4 + Math.round(((pulse + idx * 0.33) % 1) * 4);

      ctx.strokeStyle = pal.hex;
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(rbx + 0.5, rby + 0.5, rRing, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      ctx.fillStyle = '#05040a';
      ctx.fillRect(rbx - 3, rby - 3, 7, 7);
      ctx.fillStyle = pal.hex;
      ctx.fillRect(rbx - 2, rby - 2, 5, 5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(rbx - 1, rby - 1, 2, 2);

      const label = (rp.name || 'HUNTER').slice(0, 10);
      const tw = font.width(label, 1, 1, false) + 6;
      const baseTagX = Math.max(MAP_X + 2, Math.min(MAP_X + GRID_COLS * CELL_SIZE - tw - 2, Math.round(rbx - tw * 0.5)));
      const candidates = [
        [baseTagX, rby - 14],
        [baseTagX, rby + 7],
        [baseTagX, rby + 18],
        [baseTagX, rby - 25],
        [Math.min(MAP_X + GRID_COLS * CELL_SIZE - tw - 2, rbx + 6), rby - 4],
        [Math.max(MAP_X + 2, rbx - tw - 6), rby - 4],
      ];
      let tagX = baseTagX;
      let tagY = rby + 7;
      for (const [cx, cy] of candidates) {
        if (cy < MAP_Y + 2 || cy > MAP_Y + GRID_ROWS * CELL_SIZE - 11) continue;
        const overlaps = placedTags.some((b) => cx < b.x + b.w + 2 && cx + tw + 2 > b.x && cy < b.y + b.h + 1 && cy + 9 + 1 > b.y);
        if (!overlaps) {
          tagX = cx;
          tagY = cy;
          break;
        }
      }
      placedTags.push({ x: tagX, y: tagY - 1, w: tw, h: 10 });

      ctx.fillStyle = 'rgba(5, 4, 12, 0.92)';
      ctx.fillRect(tagX, tagY - 1, tw, 9);
      ctx.fillStyle = pal.hex;
      ctx.fillRect(tagX, tagY - 1, tw, 1);
      font.draw(ctx, label, tagX + Math.round(tw * 0.5), tagY, {
        align: 'center',
        color: pal.hex,
        shadow: '#05040a',
        gothic: false,
      });
    });
    ctx.restore();
  }

  // Pass 4: LIVE HUNTER LOCATION BEACON
  if (currentStageKey && localLoc) {
    const bx = Math.round(localLoc.px);
    const by = Math.round(localLoc.py);
    const ringR = 5 + Math.round(pulse * 4);
    ctx.save();
    ctx.strokeStyle = `rgba(158, 245, 220, ${0.85 - pulse * 0.45})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(bx + 0.5, by + 0.5, ringR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#9ef5dc';
    ctx.fillRect(bx - 6, by, 3, 1);
    ctx.fillRect(bx + 4, by, 3, 1);
    ctx.fillRect(bx, by - 6, 1, 3);
    ctx.fillRect(bx, by + 4, 1, 3);
    ctx.fillStyle = '#05040a';
    ctx.fillRect(bx - 3, by - 3, 7, 7);
    ctx.fillStyle = pulse > 0.35 ? '#ffffff' : '#ffd27a';
    ctx.fillRect(bx - 2, by - 2, 5, 5);
    ctx.fillStyle = '#ff4a66';
    ctx.fillRect(bx - 1, by - 1, 3, 3);
    const tagY = by < MAP_Y + 20 ? by + 8 : by - 15;
    ctx.fillStyle = 'rgba(5, 4, 12, 0.92)';
    ctx.fillRect(bx - 12, tagY - 1, 25, 9);
    ctx.fillStyle = '#9ef5dc';
    ctx.fillRect(bx - 12, tagY - 1, 25, 1);
    font.draw(ctx, 'YOU', bx + 1, tagY, { align: 'center', color: '#ffffff', shadow: '#05040a', gothic: false });
    ctx.restore();
  }

  // Map key micro-legend right below the grid frame (y = 260)
  const ky = gy0 + gh + 3;
  const keyItems = [
    ['#1e4ea8', 'EXPLORED'],
    ['#cc2244', 'SAVE'],
    ['#cc8e14', 'WARP'],
    ['#7a2266', 'BOSS'],
    ['#1f877a', 'VESSEL'],
    ['#b48cff', 'RELIC GATE'],
  ];
  let kx = gx0 + 6;
  for (const [sw, lbl] of keyItems) {
    ctx.fillStyle = sw;
    ctx.fillRect(kx, ky + 1, 6, 6);
    font.draw(ctx, lbl, kx + 9, ky, { color: '#9aa8c4', shadow: '#05040a', gothic: false });
    kx += 9 + font.width(lbl, 1, 1, false) + 12;
  }
  font.draw(ctx, 'ARROWS INSPECT', gx0 + gw - 4, ky, { align: 'right', color: '#7f8ea8', shadow: '#05040a', gothic: false });

  // Bottom Inspector Plate (y = 272..352)
  const sIdx = stageIndexOf(cursor);
  const st = STAGES[sIdx];
  const theme = THEMES[st.theme] || THEMES.graveyard;
  const done = isCleared(cursor, cleared);
  const canWarp = isDiscovered(cursor, cleared, discovered);
  const vesselHere = sIdx >= 0 && !!((vessels >>> sIdx) & 1);
  const lx = gx0, ly = 272, lw = gw, lh = 80;
  ctx.fillStyle = 'rgba(8, 6, 18, 0.94)';
  ctx.fillRect(lx, ly, lw, lh);
  ctx.strokeStyle = '#8a7650';
  ctx.lineWidth = 1;
  ctx.strokeRect(lx + 0.5, ly + 0.5, lw - 1, lh - 1);
  ctx.fillStyle = theme.accent;
  ctx.fillRect(lx + 1, ly + 1, 3, lh - 2);

  const iconSpec = MAP_ROOMS[cursor].icon || { sheet: 'map_icons', frame: cursor };
  const iconL = assets.frame(iconSpec.sheet, iconSpec.frame);
  if (iconL) assets.draw(ctx, iconSpec.sheet, iconSpec.frame, lx + 22, ly + 22 + iconL.h / 2);
  const tx = lx + 42;
  const rx = lx + lw - 10;
  const areaTag = MAP_ROOMS[cursor].forged ? 'FORGED WING' : `AREA ${String(st.id).padStart(2, '0')}`;
  const areaRank = String(stageRankFor(st)).padStart(2, '0');
  font.draw(ctx, `${areaTag} · RANK ${areaRank} · ${MAP_ROOMS[cursor].where}`, tx, ly + 7, { color: theme.accent, shadow: '#05040a', gothic: false });
  font.draw(ctx, st.name, tx, ly + 18, { scale: 2, gothic: false, color: '#efe3bf', shadow: '#05040a' });

  const relic = BOSS_RELICS[cursor];
  const cursorGate = gateOf(cursor);
  const bossSealed = !done && !cursorGate.bossOpen;
  const entryLock = cursorGate.entryLock;
  const bossLine = `BOSS · ${st.boss ? st.boss.name : '???'}${done ? '' : (bossSealed ? ' · GATE SEALED' : ' · GATE OPEN')}`;
  font.draw(ctx, bossLine, rx, ly + 7, { align: 'right', color: bossSealed ? '#ff6a88' : '#ffb0a0', shadow: '#05040a', gothic: false });

  if (entryLock) {
    font.draw(ctx, `${entryLock.title} · ${entryLock.sub}`, rx, ly + 21, { align: 'right', color: pulse > 0.3 ? '#e23c3c' : '#a8263e', shadow: '#05040a', gothic: false });
  } else if (mode === 'live') {
    if (cursor === currentStageKey) {
      font.draw(ctx, 'CURRENT AREA · M / ESC / ENTER RESUME', rx, ly + 21, { align: 'right', color: '#9ef5dc', shadow: '#05040a', gothic: false });
    } else if (canWarp) {
      font.draw(ctx, 'ENTER WARP TO PORTAL · M RESUME', rx, ly + 21, { align: 'right', color: pulse > 0.3 ? '#ffd27a' : '#b89448', shadow: '#05040a', gothic: false });
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

  // Row 4: Connected passages, hunters in region, & any ability gates on this area
  const huntersInCursor = peers.filter((rp) => rp.stageKey === cursor).map((rp) => rp.name);
  const doorsHere = stageDoorsFor(cursor);
  const gateNotes = doorsHere
    .filter((d) => d.gateRelic)
    .map((d) => {
      const rName = BOSS_RELICS[d.gateRelic]?.name || d.gateRelic;
      const destStage = STAGES[stageIndexOf(d.targetKey)];
      const destName = destStage ? destStage.name.replace(/^THE /, '') : d.targetKey.toUpperCase();
      const unlocked = relicSet.has(d.gateRelic);
      return `${destName}: ${unlocked ? 'OPEN' : `NEEDS ${rName}`}`;
    });
  const rightHint = mode === 'select' ? 'P EXPAND · C CALLSIGN · N MUTE' : 'C CALLSIGN · N MUTE';
  const maxLeftW = Math.max(120, (rx - tx) - font.width(rightHint, 1, 1, false) - 14);
  let bottomLeft = '';
  if (huntersInCursor.length > 0) {
    bottomLeft = `HUNTERS HERE · ${huntersInCursor.join(', ')}`;
  } else if (bossSealed && cursorGate.bossSub) {
    bottomLeft = `BOSS GATE · ${cursorGate.bossSub}`;
  } else if (gateNotes.length > 0) {
    bottomLeft = `GATES · ${gateNotes.slice(0, 2).join('  ·  ')}`;
  } else {
    const allExitNames = MAP_ROOMS[cursor].exits
      .map((n) => (STAGES[stageIndexOf(n)]?.name || n).replace(/^THE /, ''));
    for (let k = allExitNames.length; k >= 1; k--) {
      const rest = allExitNames.length - k;
      const suffix = rest > 0 ? ` · +${rest}` : '';
      const cand = `PASSAGES · ${allExitNames.slice(0, k).join(' · ')}${suffix}`;
      bottomLeft = cand;
      if (font.width(cand, 1, 1, false) <= maxLeftW) break;
    }
  }
  while (bottomLeft.length > 16 && font.width(bottomLeft, 1, 1, false) > maxLeftW) {
    bottomLeft = bottomLeft.slice(0, -4).trimEnd() + '...';
  }
  font.draw(ctx, bottomLeft, tx, ly + 56, { color: huntersInCursor.length > 0 ? '#62f2c2' : '#8a9ab5', shadow: '#05040a', gothic: false });
  font.draw(ctx, rightHint, rx, ly + 56, { align: 'right', color: '#5b6b86', shadow: '#05040a', gothic: false });
}

/**
 * Compact 9x5-cell live HUD Mini-Map radar anchored at `(x, y)` (`58x34` px).
 * Shows explored cobalt halls, sanctuary/boss/secret rooms, walls, and blinking hunter dot!
 */
export function drawMiniMap(ctx, font, world, x, y) {
  const stageKey = world.stage.key;
  const normX = world.level.width > 0 ? world.player.x / world.level.width : 0;
  const normY = world.level.height > 0 ? world.player.y / world.level.height : 0.5;
  const loc = playerGridLocation(stageKey, normX, !!world.inSecretArea, normY);
  const game = world.game;
  const expSet = (game && game.exploredCells) ? game.exploredCells : new Set();
  const cleared = (game && game.cleared) || 0;
  const vessels = (game && game.vessels) || 0;
  const colsW = 9, rowsH = 5, cs = 6;
  const pw = colsW * cs + 4, ph = rowsH * cs + 4; // 58 x 34 px

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
      const isVisibleCell = (keyCell) => (keyCell === rm.bonusSecretKey ? expSet.has(keyCell) : true);
      if (!isVisibleCell(ck)) continue;
      const sIdx = stageIndexOf(ownerKey);
      const done = isCleared(ownerKey, cleared);
      const isBonusSec = ck === rm.bonusSecretKey;
      const isExp = isBonusSec ? expSet.has(ck) : (expSet.has(ck) || done || (gc === loc.col && gr === loc.row));
      const vesselFound = sIdx >= 0 && !!((vessels >>> sIdx) & 1);
      if (isExp) {
        if (rm.bossSet.has(ck)) ctx.fillStyle = done ? '#463fa0' : '#842470';
        else if (ck === rm.sanctuaryKey) ctx.fillStyle = '#d42648';
        else if (ck === rm.warpKey) ctx.fillStyle = '#d49618';
        else if (isBonusSec) ctx.fillStyle = '#288e66';
        else if (ck === rm.secretKey) ctx.fillStyle = vesselFound ? '#228c7e' : '#18645a';
        else ctx.fillStyle = '#2458be';
      } else {
        ctx.fillStyle = ownerKey === stageKey ? 'rgba(42, 62, 108, 0.68)' : 'rgba(26, 34, 58, 0.45)';
      }
      ctx.fillRect(sx, sy, cs, cs);

      // Crisp exterior mini-walls & internal doorway corner ticks
      const nUp = `${gc},${gr - 1}`;
      const nDn = `${gc},${gr + 1}`;
      const nLt = `${gc - 1},${gr}`;
      const nRt = `${gc + 1},${gr}`;
      ctx.fillStyle = isExp ? '#cad8ff' : '#4a5a7a';
      if (!(rm.cellSet.has(nUp) && isVisibleCell(nUp))) ctx.fillRect(sx, sy, cs, 1);
      if (!(rm.cellSet.has(nDn) && isVisibleCell(nDn))) ctx.fillRect(sx, sy + cs - 1, cs, 1);
      else if (!(rm.bossSet.has(ck) && rm.bossSet.has(nDn))) {
        if (isInternalEdgeOpen(rm, ownerKey, gc, gr, gc, gr + 1)) {
          ctx.fillStyle = isExp ? 'rgba(196, 220, 255, 0.48)' : 'rgba(74, 90, 122, 0.40)';
          ctx.fillRect(sx, sy + cs - 1, 1, 1);
          ctx.fillRect(sx + cs - 1, sy + cs - 1, 1, 1);
        } else {
          ctx.fillRect(sx, sy + cs - 1, cs, 1);
        }
      }
      ctx.fillStyle = isExp ? '#cad8ff' : '#4a5a7a';
      if (!(rm.cellSet.has(nLt) && isVisibleCell(nLt))) ctx.fillRect(sx, sy, 1, cs);
      if (!(rm.cellSet.has(nRt) && isVisibleCell(nRt))) ctx.fillRect(sx + cs - 1, sy, 1, cs);
      else if (!(rm.bossSet.has(ck) && rm.bossSet.has(nRt))) {
        if (isInternalEdgeOpen(rm, ownerKey, gc, gr, gc + 1, gr)) {
          ctx.fillStyle = isExp ? 'rgba(196, 220, 255, 0.48)' : 'rgba(74, 90, 122, 0.40)';
          ctx.fillRect(sx + cs - 1, sy, 1, 1);
          ctx.fillRect(sx + cs - 1, sy + cs - 1, 1, 1);
        } else {
          ctx.fillRect(sx + cs - 1, sy, 1, cs);
        }
      }
    }
  }

  // Remote hunter dots within the 9x5 radar window
  const netPeers = game && game.net ? game.net.activePeers() : null;
  if (netPeers && netPeers.length > 0) {
    for (const rp of netPeers) {
      if (!rp.stageKey || !MAP_ROOMS[rp.stageKey]) continue;
      const rLoc = playerGridLocation(rp.stageKey, rp.normX || 0, !!rp.inSecret, rp.normY ?? 0.5);
      const dc = rLoc.col - cStart;
      const dr = rLoc.row - rStart;
      if (dc < 0 || dc >= colsW || dr < 0 || dr >= rowsH) continue;
      const rxDot = x + 2 + dc * cs + 2;
      const ryDot = y + 2 + dr * cs + 2;
      const pal = paletteForSlot(rp.slot);
      ctx.fillStyle = '#05040a';
      ctx.fillRect(rxDot - 1, ryDot - 1, 4, 4);
      ctx.fillStyle = pal.hex;
      ctx.fillRect(rxDot, ryDot, 2, 2);
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
