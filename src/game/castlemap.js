// Castle map: the ten stages laid out as connected regions of one castle and
// its grounds (cell-grid map screen). Progression follows the connections:
// a region can be entered once any neighbouring region has been cleared.

import { W, H } from '../engine/constants.js';
import { STAGES } from './stages.js';
import { THEMES } from './builder.js';

// Grid cells: [col, row, w, h] on a 24 x 13 grid (west = outdoors, east = keep).
export const MAP_ROOMS = {
  yule: { cell: [0, 0, 5, 3], where: 'FROZEN HEIGHTS' },
  throne: { cell: [9, 0, 7, 2], where: 'THE KEEP' },
  cathedral: { cell: [17, 0, 3, 3], where: 'THE GREAT NAVE' },
  clocktower: { cell: [20, 0, 3, 6], where: 'THE BELFRY' },
  jack: { cell: [0, 4, 5, 2], where: 'PUMPKIN WOODS' },
  library: { cell: [7, 3, 6, 2], where: 'WEST WING' },
  arcade: { cell: [14, 4, 6, 2], where: 'EAST WING' },
  ramparts: { cell: [6, 6, 9, 2], where: 'OUTER WALLS' },
  darkwood: { cell: [0, 8, 5, 2], where: 'WEST WOODS' },
  graveyard: { cell: [6, 9, 8, 2], where: 'THE GROUNDS' },
  catacombs: { cell: [7, 11, 6, 2], where: 'BENEATH THE KEEP' },
  ossuary: { cell: [14, 11, 6, 2], where: 'THE DEEP CRYPT' },
};

// Passages between regions, with explicit routes (cell-unit polylines) so no
// corridor ever crosses a room. `pass` marks an exterior mountain path.
export const MAP_LINKS = [
  { a: 'graveyard', b: 'darkwood', path: [[6, 9.5], [5, 9.5]] },
  { a: 'darkwood', b: 'jack', path: [[2.5, 8], [2.5, 6]] },
  { a: 'jack', b: 'yule', path: [[2.5, 4], [2.5, 3]] },
  { a: 'yule', b: 'clocktower', path: [[5, 2.5], [6.2, 2.5], [6.2, 5.6], [13.6, 5.6], [13.6, 3.3], [20, 3.3]], pass: true },
  { a: 'graveyard', b: 'ramparts', path: [[10, 9], [10, 8]] },
  { a: 'graveyard', b: 'catacombs', path: [[10, 11], [10, 11]] },
  { a: 'catacombs', b: 'ossuary', path: [[13, 12], [14, 12]] },
  { a: 'ossuary', b: 'arcade', path: [[17, 11], [17, 6]] },
  { a: 'ramparts', b: 'arcade', path: [[14.5, 6], [14.5, 6]] },
  { a: 'ramparts', b: 'library', path: [[10, 6], [10, 5]] },
  { a: 'library', b: 'throne', path: [[11.5, 3], [11.5, 2]] },
  { a: 'arcade', b: 'clocktower', path: [[20, 5], [20, 5]] },
  { a: 'throne', b: 'cathedral', path: [[16, 1], [17, 1]] },
  { a: 'cathedral', b: 'clocktower', path: [[20, 1.5], [20, 1.5]] },
  { a: 'arcade', b: 'cathedral', path: [[18.5, 4], [18.5, 3]] },
];

for (const r of Object.values(MAP_ROOMS)) r.exits = [];
for (const l of MAP_LINKS) { MAP_ROOMS[l.a].exits.push(l.b); MAP_ROOMS[l.b].exits.push(l.a); }

const COLS = 24, ROWS = 13;
const CELL_W = 24, CELL_H = 18;
const MAP_X = Math.round((W - COLS * CELL_W) / 2), MAP_Y = 44;

export function roomRect(key) {
  const [c, r, w, h] = MAP_ROOMS[key].cell;
  return { x: MAP_X + c * CELL_W, y: MAP_Y + r * CELL_H, w: w * CELL_W, h: h * CELL_H };
}

function roomCenter(key) {
  const r = roomRect(key);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Index into STAGES for a map key. */
export function stageIndexOf(key) { return STAGES.findIndex((s) => s.key === key); }

/** Every region can be entered from the map; passages only show the natural route. */
export function isUnlocked() { return true; }

/** True when a neighbouring region has been cleared (the "on the beaten path" hint). */
export function isAdjacentToCleared(key, clearedMask) {
  if (key === 'graveyard') return true;
  return MAP_ROOMS[key].exits.some((n) => (clearedMask >> stageIndexOf(n)) & 1);
}

export function isCleared(key, clearedMask) { return !!((clearedMask >> stageIndexOf(key)) & 1); }

/** Moves the cursor along the map in a direction (dx, dy), preferring connected rooms. */
export function moveCursor(fromKey, dx, dy) {
  const from = roomCenter(fromKey);
  const score = (key) => {
    const c = roomCenter(key);
    const vx = c.x - from.x, vy = c.y - from.y;
    const along = vx * dx + vy * dy;
    if (along <= 4) return -Infinity;
    const across = Math.abs(vx * dy) + Math.abs(vy * dx);
    return along - across * 0.6;
  };
  let best = null, bestS = -Infinity;
  for (const n of MAP_ROOMS[fromKey].exits) { const s = score(n); if (s > bestS) { bestS = s; best = n; } }
  if (best) return best;
  for (const k of Object.keys(MAP_ROOMS)) { if (k === fromKey) continue; const s = score(k); if (s > bestS) { bestS = s; best = k; } }
  return best || fromKey;
}

/** The first uncleared room that `clearedKey` just opened up (for auto-cursor after a clear). */
export function nextRoomAfter(clearedKey, clearedMask) {
  const open = MAP_ROOMS[clearedKey].exits.filter((n) => !isCleared(n, clearedMask));
  return open[0] || null;
}

function cellPt(p) { return { x: MAP_X + p[0] * CELL_W, y: MAP_Y + p[1] * CELL_H }; }

/** Centered label; splits onto two lines when the room is too narrow. */
function drawLabel(ctx, font, text, r, color) {
  const maxW = r.w - 10;
  let lines = [text];
  if (font.width(text, 1) > maxW) {
    const words = text.split(' ');
    if (words.length > 1) {
      const mid = Math.ceil(words.length / 2);
      lines = [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
    }
  }
  const lh = 10;
  let y = Math.round(r.y + r.h / 2 - (lines.length * lh) / 2 + 1);
  for (const ln of lines) {
    font.draw(ctx, ln, Math.round(r.x + r.w / 2), y, { align: 'center', color, shadow: '#120f1c' });
    y += lh;
  }
}

export function drawCastleMap(ctx, font, assets, { cursor, cleared, time, difficultyName }) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 5);
  const ink = '#d8c79c', inkDim = '#6e6552', inkLit = '#f0e4c0';

  // Aged parchment chart (generated) under everything
  const parchment = assets.img('map_parchment');
  if (parchment) ctx.drawImage(parchment, 0, 0, W, H);
  else { ctx.fillStyle = '#1a1410'; ctx.fillRect(0, 0, W, H); }
  font.draw(ctx, `${difficultyName} HUNT`, W / 2, 7, { align: 'center', color: '#a89a74', spacing: 2, shadow: '#1a120c' });
  font.draw(ctx, 'CASTLE MAP', W / 2, 18, { scale: 2, align: 'center', color: '#efe3bf', spacing: 1, shadow: '#3a1c1c' });

  ctx.save();
  // Passages: inked corridors, brighter once either end is cleared; the mountain pass is dashed.
  for (const l of MAP_LINKS) {
    const lit = isCleared(l.a, cleared) || isCleared(l.b, cleared);
    const open = lit || isAdjacentToCleared(l.a, cleared) || isAdjacentToCleared(l.b, cleared);
    ctx.strokeStyle = 'rgba(10, 8, 14, 0.55)'; ctx.lineWidth = 6;
    ctx.setLineDash([]);
    ctx.beginPath();
    l.path.forEach((p, i) => { const q = cellPt(p); if (i === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); });
    ctx.stroke();
    ctx.strokeStyle = lit ? inkLit : open ? ink : inkDim; ctx.lineWidth = 2;
    ctx.setLineDash(l.pass ? [4, 4] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = lit ? inkLit : inkDim;
    for (const p of [l.path[0], l.path[l.path.length - 1]]) { const q = cellPt(p); ctx.fillRect(q.x - 2, q.y - 2, 4, 4); }
  }

  // Rooms: chart boxes with the region emblem and name
  for (const key of Object.keys(MAP_ROOMS)) {
    const r = roomRect(key);
    const st = STAGES[stageIndexOf(key)];
    const theme = THEMES[st.theme] || THEMES.graveyard;
    const done = isCleared(key, cleared), open = isAdjacentToCleared(key, cleared), sel = key === cursor;
    ctx.fillStyle = done ? 'rgba(44, 66, 122, 0.84)' : open ? 'rgba(22, 14, 30, 0.80)' : 'rgba(16, 12, 20, 0.66)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    // Inked double border; cleared rooms get a pale wash line, off-path rooms a fainter stroke
    ctx.strokeStyle = done ? '#b9caf5' : open ? ink : inkDim; ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    ctx.strokeStyle = done ? 'rgba(185, 202, 245, 0.35)' : 'rgba(216, 199, 156, 0.22)';
    ctx.strokeRect(r.x + 3.5, r.y + 3.5, r.w - 7, r.h - 7);
    ctx.fillStyle = theme.accent;
    ctx.fillRect(r.x + 3, r.y + 3, r.w - 6, 1);
    if (sel) {
      ctx.strokeStyle = `rgba(255, 220, 140, ${0.5 + 0.5 * pulse})`; ctx.lineWidth = 2;
      ctx.strokeRect(r.x - 2, r.y - 2, r.w + 4, r.h + 4);
    }
    // Emblem on the left, name centred in the remaining width
    const icon = assets.frame('map_icons', key);
    const iconW = icon ? icon.w + 8 : 0;
    if (icon) assets.draw(ctx, 'map_icons', key, r.x + 6 + icon.w / 2, r.y + r.h / 2 + icon.h / 2, false, open || done ? 1 : 0.55);
    const labelRect = { x: r.x + iconW, y: r.y, w: r.w - iconW - 4, h: r.h };
    drawLabel(ctx, font, st.name.replace(/^THE /, ''), labelRect, done ? '#f2f5ff' : open ? '#efe3bf' : '#9a917a');
    if (done) { ctx.fillStyle = '#ffd27a'; ctx.fillRect(r.x + r.w - 10, r.y + 6, 6, 1); ctx.fillRect(r.x + r.w - 8, r.y + 4, 2, 6); }
    if (sel) {
      const bob = Math.round(Math.sin(time * 6) * 2);
      assets.draw(ctx, 'items', 'heart_small', r.x + r.w - 9, r.y + r.h - 4 + bob);
    }
  }
  ctx.restore();

  // Legend plate (inside the parchment's border)
  const st = STAGES[stageIndexOf(cursor)];
  const theme = THEMES[st.theme] || THEMES.graveyard;
  const done = isCleared(cursor, cleared), open = isAdjacentToCleared(cursor, cleared);
  const lx = MAP_X - 4, ly = MAP_Y + ROWS * CELL_H + 6, lw = COLS * CELL_W + 8, lh = Math.min(48, H - ly - 10);
  ctx.fillStyle = 'rgba(10, 7, 16, 0.9)';
  ctx.fillRect(lx, ly, lw, lh);
  ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.strokeRect(lx + 0.5, ly + 0.5, lw - 1, lh - 1);
  ctx.fillStyle = theme.accent; ctx.fillRect(lx + 1, ly + 1, 3, lh - 2);
  const iconL = assets.frame('map_icons', cursor);
  if (iconL) assets.draw(ctx, 'map_icons', cursor, lx + 22, ly + lh / 2 + iconL.h / 2);
  const tx = lx + 42;
  font.draw(ctx, `STAGE ${st.id}  ·  ${MAP_ROOMS[cursor].where}`, tx, ly + 6, { color: theme.accent, shadow: '#120f1c' });
  font.draw(ctx, st.name, tx, ly + 16, { scale: 2, color: '#efe3bf', shadow: '#120f1c' });
  const rx = lx + lw - 12;
  font.draw(ctx, `BOSS · ${st.boss ? st.boss.name : '???'}`, rx, ly + 6, { align: 'right', color: '#ffb0a0', shadow: '#120f1c' });
  if (done) font.draw(ctx, 'CLEARED  ·  ENTER TO REPLAY', rx, ly + 20, { align: 'right', color: '#9ad17a', shadow: '#120f1c' });
  else font.draw(ctx, 'ENTER / JUMP / WHIP TO BEGIN', rx, ly + 20, { align: 'right', color: pulse > 0.3 ? '#ffd27a' : '#8a6a40', shadow: '#120f1c' });
  if (!done && !open) {
    const via = MAP_ROOMS[cursor].exits.map((n) => STAGES[stageIndexOf(n)].name.replace(/^THE /, '')).join(' / ');
    font.draw(ctx, `OFF THE PATH  ·  REACHED VIA ${via}`, tx, ly + 35, { color: '#a89a74', shadow: '#120f1c' });
  } else font.draw(ctx, st.subtitle || '', tx, ly + 35, { color: '#a89a74', shadow: '#120f1c' });
  font.draw(ctx, 'ARROWS FOLLOW THE PASSAGES', rx, ly + 35, { align: 'right', color: '#6e6552' });
}
