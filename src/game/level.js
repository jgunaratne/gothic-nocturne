// Tile grid, collision queries, dynamic 2.5D stage mechanics (moving lifts,
// orbiting gear gondolas, crumbling masonry) and 3D-extruded tile rendering.

import {
  TILE, T_EMPTY, T_GROUND, T_STONE, T_CATACOMB, T_CLOCK, T_FOREST, T_SNOW, T_DARKWOOD, T_CAVERN, T_LAVA, T_WATER,
  T_BALLROOM, T_COLISEUM, T_AQUEDUCT, T_SKYKEEP,
  T_PLATFORM, T_CRUMBLE, T_SPIKES, T_BLOCK, T_GATE, T_BOUND,
  MATERIAL_STRIP, isMaterialTile, isSolidTile, W, H,
} from '../engine/constants.js';
import { project3D, FOCAL, EYE_X, EYE_Y } from './stage3d.js';
import { getTexBank, getGlowCanvas, shadeOverlay32, texQuad, texStripZ } from './tex3d.js';
import { getFxLayers } from '../engine/fxlayers.js';

const DECK_Z = 38;     // z-depth of receding walkable top surfaces
const SIDE_Z = 42;     // z-depth of exposed vertical step/cliff side returns
const DECK_FOG = [10, 10, 22];

export class Level {
  constructor(data) {
    this.cols = data.cols;
    this.rows = data.rows;
    this.width = this.cols * TILE;
    this.height = this.rows * TILE;
    this.tiles = new Uint8Array(this.cols * this.rows);
    this.depth = new Uint8Array(this.cols * this.rows);
    this.decor = [];
    this.rooms = data.rooms || [];
    this.blockDrops = data.blockDrops || {};
    this.checkpoints = data.checkpoints || [];
    this.platformImg = data.platform || 'platform';
    this.platformRuns = [];
    this.bridgeRuns = [];
    this.lavaRuns = [];
    this.waterRuns = [];
    this.waterBasins = (data.waterBasins || []).map((b) => Object.assign({}, b));
    // Stage 1 castle-moat drawbridge: `{ x0, x1, row, waterRow, floorRow }` (tiles); the
    // plank deck is a one-way platform run that never lets the hunter drop into the moat.
    this.drawbridge = data.drawbridge ? Object.assign({}, data.drawbridge) : null;
    this.stairs = [];
    this.crumbles = [];
    this.crumbleMap = new Map();
    this.movers = (data.movers || []).map((m) => makeMover(m));
    if (Array.isArray(data.stairs)) {
      for (const s of data.stairs) this.stair(s.col0, s.row0, s.col1, s.row1, s);
    }
    data.build(this);
    this.recompute();
    this._anchorHangingDecor(data.decor || []);
  }

  /**
   * Anchors all ceiling-mounted props (`chandelier`, `cage`, `pendulum`) directly
   * to the overhead solid ceiling soffit or enclosing 3D room vault ceiling, and
   * proportions chain length + scale so they always hang high near the ceiling
   * and never drop near floors, mezzanine platforms, or walkable staircases.
   */
  _anchorHangingDecor(rawList) {
    const out = [];
    for (let i = 0; i < rawList.length; i++) {
      const src = rawList[i];
      if (!src) continue;
      if (src.type !== 'chandelier' && src.type !== 'cage' && src.type !== 'pendulum') {
        out.push(src);
        continue;
      }
      const d = Object.assign({}, src);
      let tx = d._tx != null ? d._tx : Math.floor(d.x / TILE);
      tx = Math.max(1, Math.min(this.cols - 2, tx));

      let refRow = d._row;
      if (refRow == null) {
        const probeStart = Math.max(1, Math.min(this.rows - 1, Math.floor((d.y + 48) / TILE)));
        refRow = -1;
        for (let r = probeStart; r < this.rows; r++) {
          if (this.isStandable(tx, r)) { refRow = r; break; }
        }
        if (refRow < 0) refRow = Math.min(this.rows - 1, Math.round((d.y + 240) / TILE));
      }
      if (refRow < 3 || refRow >= this.rows) continue;

      // Ensure at least 3 clear air tiles above the floor at tx (allow ±2 tile nudge away from solid steps/stairs)
      let openTx = -1;
      for (const off of [0, -1, 1, -2, 2]) {
        const cx = tx + off;
        if (cx <= 0 || cx >= this.cols - 1) continue;
        if (!this.isSolid(cx, refRow - 1) && !this.isSolid(cx, refRow - 2) && !this.isSolid(cx, refRow - 3)) {
          openTx = cx;
          break;
        }
      }
      if (openTx < 0) continue;
      if (openTx !== tx) {
        d.x = openTx * TILE + TILE * 0.5;
        tx = openTx;
      }

      // Raycast straight UP from `refRow - 1` to find the physical overhead solid ceiling tile
      let ceilTile = -1;
      for (let r = refRow - 1; r >= 0; r--) {
        if (this.isSolid(tx, r)) { ceilTile = r; break; }
      }

      let ceilY = null;
      if (ceilTile >= 0) {
        ceilY = (ceilTile + 1) * TILE;
      } else {
        // Open hall reaching up to a 3D vaulted ceiling: match Stage3D's vault springline
        let matchRoom = null;
        for (const rm of this.rooms) {
          if (tx >= rm.x0 && tx <= rm.x1 && refRow >= rm.y0 && refRow <= rm.y1) {
            matchRoom = rm;
            break;
          }
        }
        if (!matchRoom) continue; // Outdoor open sky: never float a chandelier in thin air!
        if (matchRoom._hallBounds && matchRoom._hallBounds.ceilY != null) {
          ceilY = matchRoom._hallBounds.ceilY + 18;
        } else {
          let minSurf = matchRoom.floorRow || refRow;
          const c0 = Math.max(2, matchRoom.x0 + 1), c1 = Math.min(this.cols - 3, matchRoom.x1 - 1);
          for (let c = c0; c <= c1; c++) {
            const sr = this.surfaceRow(c);
            if (sr > 0 && sr < minSurf) minSurf = sr;
          }
          const fY = Math.max(matchRoom.floorRow || 11, refRow) * TILE;
          ceilY = Math.min(Math.max(matchRoom.y0 * TILE - 96, (minSurf - 11) * TILE), fY - 352) + 18;
        }
      }

      // Effective floor directly under `ceilY`: account for any upper balcony platform or staircase below `ceilY`!
      let effFloorY = refRow * TILE;
      const startScanR = Math.max(0, Math.ceil((ceilY + 8) / TILE));
      for (let r = startScanR; r < refRow; r++) {
        if (this.isOneWay(tx, r) || this.isOneWay(tx - 1, r) || this.isOneWay(tx + 1, r)) {
          effFloorY = Math.min(effFloorY, r * TILE);
          break;
        }
      }
      for (const s of this.stairs) {
        if (d.x >= s.minX - 28 && d.x <= s.maxX + 28) {
          const sy = this.stairY(s, Math.max(s.minX, Math.min(s.maxX, d.x)));
          if (sy > ceilY + 16) effFloorY = Math.min(effFloorY, sy);
        }
      }

      const headroom = effFloorY - ceilY;
      if (headroom < 120) continue; // Too low for a ceiling-suspended fixture

      d.y = Math.round(ceilY);
      const maxDrop = Math.min(headroom - 72, Math.round(headroom * 0.45));
      if (d.type === 'chandelier') {
        // chandelier frame `a` is 77x96; scale cleanly so body + chain sits strictly in the upper ceiling zone
        const r = headroom < 168 ? 14 : (headroom < 240 ? 20 : 27);
        const sc = Math.max(0.46, Math.min(1.08, (r * 2.7) / 77));
        const bodyH = 96 * sc;
        d.r = r;
        d.len = Math.max(6, Math.min(78, Math.round(maxDrop - bodyH)));
      } else if (d.type === 'cage') {
        const cageH = headroom < 168 ? 30 : 44;
        d.cageH = cageH;
        d.len = Math.max(8, Math.min(68, Math.round(maxDrop - cageH)));
      } else if (d.type === 'pendulum') {
        const r = headroom < 180 ? 13 : 20;
        d.r = r;
        d.len = Math.max(28, Math.min(136, Math.round(Math.min(headroom - 72, headroom * 0.48) - r)));
      }
      out.push(d);
    }
    this.decor = out;
  }

  // ------------------------------------------------------------ building
  fill(x0, x1, y0, y1, t) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, t);
  }
  /** Solid terrain from `surfaceRow` down to the bottom row. */
  ground(x0, x1, surfaceRow, t = T_GROUND) { this.fill(x0, x1, surfaceRow, this.rows - 1, t); }
  /**
   * 1-tile-thick elevated stone/timber viaduct deck with open space below so
   * 3D background courtyards, frozen lakes and subterranean chasms remain visible.
   */
  bridge(x0, x1, row, t = T_GROUND) {
    this.clear(x0, x1, row + 1, this.rows - 1);
    this.fill(x0, x1, row, row, t);
  }
  /** Fissured stone slabs that tremble and collapse shortly after being stepped on. */
  crumble(x0, x1, row) {
    for (let tx = x0; tx <= x1; tx++) {
      this.set(tx, row, T_CRUMBLE);
      const key = `${tx},${row}`;
      if (!this.crumbleMap.has(key)) {
        const rec = { tx, ty: row, state: 'idle', timer: 0, chunks: null };
        this.crumbles.push(rec);
        this.crumbleMap.set(key, rec);
      }
    }
  }
  clear(x0, x1, y0 = 0, y1 = this.rows - 1) { this.fill(x0, x1, y0, y1, T_EMPTY); }
  water(x0, x1, y0, y1) { this.fill(x0, x1, y0, y1, T_WATER); }
  platform(x0, x1, row) { this.fill(x0, x1, row, row, T_PLATFORM); }
  set(x, y, t) {
    if (x >= 0 && y >= 0 && x < this.cols && y < this.rows) {
      const idx = y * this.cols + x;
      const prev = this.tiles[idx];
      if (prev !== t) {
        this.tiles[idx] = t;
        if (this._tileChunks && (isMaterialTile(prev) || isMaterialTile(t) || prev === T_BLOCK || t === T_BLOCK || prev === T_SPIKES || t === T_SPIKES)) {
          const cx = x >> 4, cy = y >> 4;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) this._tileChunks.delete(((cy + dy) << 12) | (cx + dx));
          }
        }
      }
    }
  }

  /**
   * Registers an inclined walkable staircase between tile-boundary coordinates
   * `(col0, row0)` and `(col1, row1)` (`wx = col * TILE`, `wy = row * TILE`).
   * - `passThrough: false` — solid ground-backed masonry/earth flight (auto-walked on contact).
   * - `passThrough: true`  — mezzanine/stairwell flight (walk past on lower floor, or engage with Up/Down).
   */
  stair(col0, row0, col1, row1, opts = {}) {
    const cStart = Math.min(col0, col1);
    const cEnd = Math.max(col0, col1);
    if (cEnd <= cStart || row0 === row1) return null;
    const x0 = cStart * TILE;
    const x1 = cEnd * TILE;
    const y0 = (col0 < col1 ? row0 : row1) * TILE;
    const y1 = (col0 < col1 ? row1 : row0) * TILE;
    const ascDir = y1 < y0 ? 1 : -1;
    const topX = ascDir > 0 ? x1 : x0;
    const topY = Math.min(y0, y1);
    const botX = ascDir > 0 ? x0 : x1;
    const botY = Math.max(y0, y1);
    const passThrough = !!opts.passThrough;
    const mat = opts.mat || T_STONE;
    const risePx = botY - topY;
    const slope = risePx / (x1 - x0);
    const steps = Math.max(2, Math.round(risePx / 8));
    const railing = false;
    const rec = {
      col0, row0, col1, row1,
      x0, y0, x1, y1,
      minX: x0, maxX: x1,
      topX, topY, botX, botY,
      ascDir, slope, steps,
      passThrough, mat, railing,
      fillRows: [],
    };
    if (!passThrough) {
      const clearTop = opts.clearTop == null ? 0 : opts.clearTop;
      const fillBottom = opts.fillBottom == null ? (this.rows - 1) : Math.min(this.rows - 1, opts.fillBottom);
      for (let tx = cStart; tx < cEnd; tx++) {
        const ya = this.stairY(rec, tx * TILE - 16);
        const yb = this.stairY(rec, (tx + 1) * TILE + 16);
        const fillRow = Math.min(this.rows - 1, Math.ceil(Math.max(ya, yb) / TILE));
        if (opts.clearAbove !== false && fillRow > clearTop) {
          this.fill(tx, tx, clearTop, fillRow - 1, T_EMPTY);
        }
        if (fillBottom >= fillRow) {
          this.fill(tx, tx, fillRow, fillBottom, mat);
        }
        rec.fillRows.push(fillRow);
      }
    }
    this.stairs.push(rec);
    return rec;
  }

  recompute() {
    if (this._tileChunks) this._tileChunks.clear();
    // Depth below the surface for same-material solid tiles (texture rows).
    for (let x = 0; x < this.cols; x++) {
      let run = 0, prev = T_EMPTY;
      for (let y = 0; y < this.rows; y++) {
        const t = this.tiles[y * this.cols + x];
        if (isMaterialTile(t)) {
          if (t === prev) run++;
          else if (y === 0) run = 2; // ceiling blocks starting at row 0 use interior fill, not floor overhang
          else if (prev === T_LAVA || prev === T_WATER || prev === T_BLOCK || (prev === T_SPIKES && t === T_SNOW)) run = 1;
          else run = 0;
        } else run = 0;
        this.depth[y * this.cols + x] = Math.min(run, 3);
        prev = t;
      }
    }
    // Platform runs for cap rendering.
    this.platformRuns = [];
    for (let y = 0; y < this.rows; y++) {
      let x = 0;
      while (x < this.cols) {
        if (this.tile(x, y) === T_PLATFORM) {
          const x0 = x;
          while (x < this.cols && this.tile(x, y) === T_PLATFORM) x++;
          this.platformRuns.push({ x0, x1: x - 1, y });
        } else x++;
      }
    }
    // Elevated 1-tile-thick viaduct spans (solid material tile with open air above & below).
    this.bridgeRuns = [];
    for (let y = 4; y < this.rows - 1; y++) {
      let x = 0;
      while (x < this.cols) {
        const t = this.tile(x, y);
        const isSpan = (col) => isMaterialTile(this.tile(col, y)) && !this.isSolid(col, y - 1) && !this.isSolid(col, y + 1);
        if (isSpan(x)) {
          const x0 = x;
          while (x < this.cols && isSpan(x)) x++;
          this.bridgeRuns.push({ x0, x1: x - 1, y, mat: t });
        } else x++;
      }
    }
    // Contiguous molten lava pool runs for 3D + shader rendering.
    this.lavaRuns = [];
    for (let y = 1; y < this.rows; y++) {
      let x = 0;
      while (x < this.cols) {
        if (this.tile(x, y) === T_LAVA && this.tile(x, y - 1) !== T_LAVA) {
          const x0 = x;
          while (x < this.cols && this.tile(x, y) === T_LAVA && this.tile(x, y - 1) !== T_LAVA) x++;
          let hTiles = 1;
          while (y + hTiles < this.rows && this.tile(x0, y + hTiles) === T_LAVA) hTiles++;
          this.lavaRuns.push({ x0, x1: x - 1, y, hTiles });
        } else x++;
      }
    }
    // Contiguous play-plane water channel / cistern runs for shader rendering & interactive ripples.
    this.waterRuns = [];
    for (let y = 1; y < this.rows; y++) {
      let x = 0;
      while (x < this.cols) {
        if (this.tile(x, y) === T_WATER && this.tile(x, y - 1) !== T_WATER) {
          const x0 = x;
          while (x < this.cols && this.tile(x, y) === T_WATER && this.tile(x, y - 1) !== T_WATER) x++;
          let hTiles = 1;
          while (y + hTiles < this.rows && this.tile(x0, y + hTiles) === T_WATER) hTiles++;
          this.waterRuns.push({ x0, x1: x - 1, y, hTiles });
        } else x++;
      }
    }
  }

  // ------------------------------------------------------------- queries
  tile(tx, ty) {
    if (tx < 0 || tx >= this.cols) return T_BOUND;
    if (ty < 0) return T_EMPTY;
    if (ty >= this.rows) return T_EMPTY;
    return this.tiles[ty * this.cols + tx];
  }
  isSolid(tx, ty) { return isSolidTile(this.tile(tx, ty)); }
  isOneWay(tx, ty) { const t = this.tile(tx, ty); return t === T_PLATFORM || t === T_CRUMBLE; }
  isSpike(tx, ty) { return this.tile(tx, ty) === T_SPIKES; }
  isLava(tx, ty) { return this.tile(tx, ty) === T_LAVA; }
  isWater(tx, ty) { return this.tile(tx, ty) === T_WATER; }
  isStandable(tx, ty) { const t = this.tile(tx, ty); return isSolidTile(t) || t === T_PLATFORM || t === T_CRUMBLE; }
  /** True for the plank deck of the castle-moat drawbridge while lowered (walkable, never drop-through). */
  isDrawbridgeTile(tx, ty) {
    const d = this.drawbridge;
    return !!d && (!d.state || d.state === 'open') && ty === d.row && tx >= d.x0 && tx <= d.x1;
  }
  /** True when platform run `r` is the drawbridge deck (rendered by `drawDrawbridge`). */
  isDrawbridgeRun(r) {
    const d = this.drawbridge;
    return !!d && r.y === d.row && r.x0 <= d.x1 && r.x1 >= d.x0;
  }

  /** World-space surface Y of staircase `s` at `wx` (clamped cleanly to `[s.topY, s.botY]`). */
  stairY(s, wx) {
    if (wx <= s.x0) return s.y0;
    if (wx >= s.x1) return s.y1;
    return s.y0 + ((wx - s.x0) / (s.x1 - s.x0)) * (s.y1 - s.y0);
  }

  /** Returns a solid (`!passThrough`) stair at `(wx, wy)` within vertical tolerance `tol`, or `null`. */
  solidStairNear(wx, wy, tol = 18) {
    let best = null;
    let bestD = tol + 0.001;
    for (let i = 0; i < this.stairs.length; i++) {
      const s = this.stairs[i];
      if (s.passThrough) continue;
      if (wx < s.minX - 2 || wx > s.maxX + 2) continue;
      const d = Math.abs(wy - this.stairY(s, wx));
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  /** Finds a staircase whose bottom foot `(botX, botY)` is within reach of `(wx, wy)`. */
  findBottomStair(wx, wy, tolX = 24, tolY = 16) {
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < this.stairs.length; i++) {
      const s = this.stairs[i];
      if (Math.abs(wy - s.botY) > tolY) continue;
      const rel = (wx - s.botX) * s.ascDir;
      if (rel < -tolX || rel > tolX + 8) continue;
      const d = Math.abs(wx - s.botX) + Math.abs(wy - s.botY);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  /** Finds a staircase whose top lip `(topX, topY)` is within reach of `(wx, wy)`. */
  findTopStair(wx, wy, tolX = 24, tolY = 14) {
    let best = null;
    let bestD = Infinity;
    for (let i = 0; i < this.stairs.length; i++) {
      const s = this.stairs[i];
      if (Math.abs(wy - s.topY) > tolY) continue;
      if (Math.abs(wx - s.topX) > tolX) continue;
      const d = Math.abs(wx - s.topX) + Math.abs(wy - s.topY);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }

  /**
   * Returns `{ x0, x1, surfaceY, bottomY, depth }` when world point `(wx, wy)` is
   * touching or wading in a play-plane water channel or reflecting basin, else `null`.
   */
  waterSurfaceAt(wx, wy) {
    for (let i = 0; i < this.waterRuns.length; i++) {
      const wr = this.waterRuns[i];
      const x0 = wr.x0 * TILE, x1 = (wr.x1 + 1) * TILE;
      if (wx < x0 || wx > x1) continue;
      const surfaceY = wr.y * TILE + 6;
      const bottomY = (wr.y + wr.hTiles) * TILE;
      if (wy >= surfaceY - 4 && wy <= bottomY + 10) {
        return { x0, x1, surfaceY, bottomY, depth: bottomY - surfaceY };
      }
    }
    for (let i = 0; i < this.waterBasins.length; i++) {
      const b = this.waterBasins[i];
      const x0 = b.x, x1 = b.x + b.w;
      if (wx < x0 || wx > x1) continue;
      const surfaceY = b.y, bottomY = b.y + b.h;
      if (wy >= surfaceY - 4 && wy <= bottomY + 10) {
        return { x0, x1, surfaceY, bottomY, depth: bottomY - surfaceY };
      }
    }
    return null;
  }

  /** First standable row at column tx (from the top), or -1. */
  surfaceRow(tx, fromRow = 0) {
    for (let y = fromRow; y < this.rows; y++) if (this.isStandable(tx, y)) return y;
    return -1;
  }

  /**
   * Top row of the true ground mass at column tx: solid terrain material
   * connected to the bottom of the map. Ignores one-way ledges, crumbling
   * slabs, breakable blocks and 1-tile viaduct spans with open air beneath, so
   * background scenery (3D tree colonnades, fences, mausoleums) is planted on
   * the earth instead of hovering at the height of an upper gallery or bridge.
   * Returns -1 over pits, abysses and lava.
   */
  groundRow(tx) {
    if (tx < 0 || tx >= this.cols) return -1;
    let y = this.rows - 1;
    if (!isMaterialTile(this.tile(tx, y))) return -1;
    while (y > 0 && isMaterialTile(this.tile(tx, y - 1))) y--;
    return y;
  }

  /**
   * Ground row at tx, or the nearest column's ground (searching outward up to
   * `radius` columns) when tx is over a gap, so scenery behind a ravine stands
   * level with the banks on either side. Falls back to `fallback`.
   */
  nearestGroundRow(tx, radius = 14, fallback = -1) {
    for (let d = 0; d <= radius; d++) {
      const a = this.groundRow(tx - d);
      if (a >= 0) return a;
      const b = this.groundRow(tx + d);
      if (b >= 0) return b;
    }
    return fallback;
  }

  /** Breaks a block tile; returns the drop item type (or null). */
  breakBlock(tx, ty) {
    if (this.tile(tx, ty) !== T_BLOCK) return null;
    this.set(tx, ty, T_EMPTY);
    const key = `${tx},${ty}`;
    return this.blockDrops[key] || null;
  }

  // ---------------------------------------------------- stage mechanics
  updateMechanics(dt, time, player, world) {
    // 1. Moving lifts & orbiting gear gondolas
    for (const m of this.movers) {
      m.prevX = m.x;
      m.prevY = m.y;
      if (m.kind === 'orbit') {
        const ang = time * m.speed + m.phase;
        m.angle = ang;
        m.x = m.cx + Math.cos(ang) * m.r;
        m.y = m.cy + Math.sin(ang) * m.r;
      } else {
        const pos = evalLinearMover(m.x0, m.y0, m.x1, m.y1, m.period, m.phase, m.dwell, time);
        m.x = pos.x;
        m.y = pos.y;
      }
      if (dt === 0) {
        m.prevX = m.x;
        m.prevY = m.y;
      }
      m.dx = m.x - m.prevX;
      m.dy = m.y - m.prevY;
      m.left = m.x - m.w * 0.5;
      m.right = m.x + m.w * 0.5;
    }

    // 2. Crumbling stone slabs
    if (this.crumbles.length) {
      const pStand = player && player.alive && player.onGround && !player.dropThrough;
      const ptx0 = pStand ? Math.floor(player.left / TILE) : -99;
      const ptx1 = pStand ? Math.floor((player.right - 0.01) / TILE) : -99;
      const pty = pStand ? Math.floor((player.bottom + 1) / TILE) : -99;

      for (const c of this.crumbles) {
        if (c.state === 'idle') {
          if (pStand && c.ty === pty && c.tx >= ptx0 && c.tx <= ptx1) {
            c.state = 'shake';
            c.timer = 0.52;
            if (world) world.particles.dust(c.tx * TILE + 16, c.ty * TILE + 6, 4, '#b8b0a0');
          }
        } else if (c.state === 'shake') {
          c.timer -= dt;
          if (world && Math.random() < 0.35) {
            world.particles.dust(c.tx * TILE + 8 + Math.random() * 16, c.ty * TILE + 14, 1, '#9c9488');
          }
          if (c.timer <= 0) {
            c.state = 'gone';
            c.timer = 2.8;
            c.chunks = [
              { frame: 'breaking', dx: 0, dy: 2, vx: ((c.tx % 2) ? 1 : -1) * 14, vy: 28, rot: 0, vrot: ((c.tx % 2) ? 1 : -1) * 1.5, scale: 0.94 },
              { frame: 'chunk', dx: -8, dy: 10, vx: -36, vy: 48, rot: -0.2, vrot: -3.2, scale: 0.72 },
              { frame: 'chunk', dx: 9, dy: 12, vx: 38, vy: 60, rot: 0.25, vrot: 3.5, scale: 0.66 },
            ];
            this.set(c.tx, c.ty, T_EMPTY);
            if (world) {
              world.sfx('block');
              world.particles.shards(c.tx * TILE + 16, c.ty * TILE + 12, 8, '#8a92a8', c.ty * TILE + 56);
            }
          }
        } else if (c.state === 'gone') {
          c.timer -= dt;
          if (c.chunks) {
            for (const ch of c.chunks) {
              ch.vy = Math.min(480, ch.vy + 740 * dt);
              ch.dx += ch.vx * dt;
              ch.dy += ch.vy * dt;
              ch.rot += ch.vrot * dt;
            }
            if (c.timer < 1.2) c.chunks = null;
          }
          if (c.timer <= 0) {
            c.state = 'idle';
            c.timer = 0;
            c.chunks = null;
            this.set(c.tx, c.ty, T_CRUMBLE);
            if (world) world.particles.dust(c.tx * TILE + 16, c.ty * TILE + 8, 3, '#c8d0e0');
          }
        }
      }
    }

    // 3. Stage 1 Grand Castle-Moat Drawbridge & Portcullis Seal
    if (this.drawbridge && dt > 0) {
      const d = this.drawbridge;
      if (!d.state) d.state = 'open';
      if (d.raise == null) d.raise = 0;
      if (d.portcullis == null) d.portcullis = 0;
      if (d.wheelAngle == null) d.wheelAngle = 0;

      if (d.state === 'open' && player && player.alive && d.triggerX != null && player.x >= d.triggerX) {
        d.state = 'closing';
        d._portcullisSlammed = false;
        const gateCol = d.gateCol != null ? d.gateCol : d.x1 + 1;
        for (let r = 0; r < d.row; r++) {
          if (this.tile(gateCol, r) === T_EMPTY) this.set(gateCol, r, T_GATE);
        }
        for (let tx = d.x0; tx <= d.x1; tx++) {
          if (this.tile(tx, d.row) === T_PLATFORM) this.set(tx, d.row, T_EMPTY);
        }
        this.recompute();
        if (world) {
          world.sfx('gate');
          world.camera.shake(3.6, 0.42);
          world.emitShockwave(gateCol * TILE + 16, d.row * TILE - 48, {
            maxR: 132,
            dur: 0.48,
            strength: 0.65,
            color: [1.0, 0.72, 0.34],
          });
          world.showMessage('THE CASTLE SEALS', 'THE DRAWBRIDGE RISES BEHIND YOU', 2.3);
        }
      } else if (d.state === 'closing') {
        d.portcullis = Math.min(1, d.portcullis + dt * 2.8);
        if (d.portcullis >= 1 && !d._portcullisSlammed) {
          d._portcullisSlammed = true;
          if (world) {
            const gx = (d.gateCol != null ? d.gateCol : d.x1 + 1) * TILE + 16;
            const gy = d.row * TILE;
            world.sfx('block');
            world.camera.shake(2.8, 0.22);
            world.particles.dust(gx, gy - 4, 10, '#c8d0e0');
            world.particles.sparks(gx, gy - 6, 8, '#ffd27a');
          }
        }
        d.raise = Math.min(1, d.raise + dt / 2.15);
        d.wheelAngle -= dt * 3.8;
        if (world && d.raise < 0.75 && d.waterRow != null && Math.random() < 0.28) {
          const dripX = (d.x0 + 1 + Math.random() * Math.max(1, d.x1 - d.x0 - 1)) * TILE;
          world.addWaterRipple(dripX, d.waterRow * TILE + 6, 0.62, false);
        }
        if (d.raise >= 1 && d.portcullis >= 1) {
          d.state = 'closed';
          if (world) {
            world.sfx('block');
            world.camera.shake(2.6, 0.22);
          }
        }
      }
    }
  }

  /** Carries a grounded entity along with the MovingPlatform under its feet. */
  carryEntity(ent) {
    const m = ent && ent.riding;
    if (!m || !ent.onGround || ent.dropThrough) return;
    if (m.dx !== 0) ent.moveX(this, m.dx);
    if (m.dy !== 0) {
      ent.y += m.dy;
      // Prevent rising lift from pushing head into an overhead solid ceiling
      // (ignore vertical side walls where ty + 1 is also solid).
      if (m.dy < 0) {
        const ty = Math.floor(ent.top / TILE);
        const tx0 = Math.floor(ent.left / TILE), tx1 = Math.floor((ent.right - 0.01) / TILE);
        for (let tx = tx0; tx <= tx1; tx++) {
          if (this.isSolid(tx, ty) && !this.isSolid(tx, ty + 1)) {
            ent.y = (ty + 1) * TILE + ent.h;
            break;
          }
        }
      }
    }
  }

  // ------------------------------------------------------------ drawing
  drawDecor(ctx, cam, assets, time, stage3d = null) {
    this._assets = assets;
    const camX = cam.rx, camY = cam.ry;
    const bgTint = 'rgba(6, 5, 16, 0.36)';
    for (const d of this.decor) {
      if (d.type === 'gear') {
        if (stage3d && stage3d.overlapsMural && stage3d.overlapsMural(d.x, d.y)) continue;
        if (stage3d) stage3d.drawGear3D(ctx, camX, camY, d.x, d.y, d.z == null ? 52 : d.z, Object.assign({ bright: 0.76 }, d), time);
        continue;
      }
      // Project 3D depth only when an explicit `d.z > 0` is authored so tile-anchored
      // doorway sconces, banners, and statues stay 100% locked to their `z = 0` tiles
      // across every room (`rooms[0..N]`) instead of drifting across doorways.
      let x, y, sc = 1;
      if (d.z != null && d.z > 0) {
        const p = project3D(d.x, d.y, d.z, camX, camY);
        x = p.x; y = p.y; sc = p.s;
      } else {
        x = d.x - camX; y = d.y - camY;
      }
      if (x < -220 || x > W + 220 || y < -260 || y > H + 300) continue;
      if (d.type === 'pendulum') {
        if (stage3d && stage3d.overlapsMural && stage3d.overlapsMural(d.x, d.y + (d.len || 150) * 0.7)) continue;
        this.drawPendulum(ctx, x, y, d, time);
        continue;
      }
      if (d.type === 'chandelier') {
        if (stage3d && stage3d.overlapsMural && stage3d.overlapsMural(d.x, d.y + (d.len != null ? d.len : 64) + 28)) continue;
        this.drawChandelier(ctx, x, y, d, time);
        continue;
      }
      if (d.type === 'cage') {
        if (stage3d && stage3d.overlapsMural && stage3d.overlapsMural(d.x, d.y + 84)) continue;
        this.drawCage(ctx, x, y, d, time);
        continue;
      }
      if (stage3d && stage3d.overlapsMural) {
        const f = assets.frame(d.sheet, d.frame);
        if (
          (d.sheet === 'stained_glass' || d.frame === 'torch' || d.frame === 'window' ||
           d.frame === 'canal_lantern' || d.frame === 'water_spout' || (f && f.h >= 52)) &&
          stage3d.overlapsMural(d.x, d.y)
        ) {
          continue;
        }
      }
      assets.draw(ctx, d.sheet, d.frame, x, y, false, 1, sc, bgTint);
      if (d.sheet === 'stained_glass') {
        const f = assets.frame('stained_glass', d.frame);
        const glow = getGlowCanvas(d.frame === 'rose' ? 'amber' : d.frame === 'hunter' ? 'crimson' : 'violet');
        if (f && glow) {
          const gw = f.w * sc * 1.6, gh = f.h * sc * 1.3;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.17 + 0.05 * Math.sin(time * 0.7 + d.x);
          ctx.drawImage(glow, x - gw / 2, y - f.ay * sc + f.h * sc / 2 - gh / 2, gw, gh);
          ctx.restore();
        }
      }
      if (d.frame === 'window') {
        const f = assets.frame('arch', 'window');
        const fw = f.w * sc, fh = f.h * sc;
        ctx.save();
        ctx.globalAlpha = 0.08 + 0.03 * Math.sin(time * 0.8 + d.x);
        ctx.fillStyle = '#b08cff';
        ctx.fillRect(Math.round(x - f.ax * sc + 3 * sc), Math.round(y - f.ay * sc + 3 * sc), fw - 6 * sc, fh - 6 * sc);
        ctx.restore();
      }
      if (d.frame === 'torch') { drawFlameGlow(ctx, x, y - 36 * sc, time + d.x, 22 * sc, 0.44); const fx = getFxLayers(); if (fx) fx.addFlame(x, y - 30 * sc, 9 * sc, 16 * sc, [1.0, 0.58, 0.18], d.x * 0.013); }
      else if (d.frame === 'jack_big') drawFlameGlow(ctx, x, y - 20, time + d.x, 30, 0.56);
      else if (d.frame === 'jack_small') drawFlameGlow(ctx, x, y - 12, time + d.x, 20, 0.48);
      else if (d.frame === 'scarecrow') drawFlameGlow(ctx, x, y - 64, time + d.x, 18, 0.48);
      else if (d.frame === 'lamppost') drawFlameGlow(ctx, x, y - 66, time + d.x, 26, 0.48);
      else if (d.frame === 'moss_lantern') drawFlameGlow(ctx, x, y - 48, time + d.x, 28, 0.54, 'emerald');
      else if (d.frame === 'glow_shrooms') drawFlameGlow(ctx, x, y - 12, time + d.x, 22, 0.44, 'emerald');
      else if (d.frame === 'ancient_totem') drawFlameGlow(ctx, x, y - 44, time + d.x, 20, 0.40, 'emerald');
      else if (d.frame === 'brazier') { drawFlameGlow(ctx, x, y - 82 * sc, time + d.x, 30 * sc, 0.56); const fx = getFxLayers(); if (fx) fx.addFlame(x, y - 78 * sc, 16 * sc, 20 * sc, [1.0, 0.55, 0.16], d.x * 0.011); }
      else if (d.frame === 'coal_brazier') { drawFlameGlow(ctx, x, y - 34 * sc, time + d.x, 28 * sc, 0.56, 'crimson'); const fx = getFxLayers(); if (fx) fx.addFlame(x, y - 30 * sc, 12 * sc, 16 * sc, [1.0, 0.42, 0.16], d.x * 0.013); }
      else if (d.frame === 'glass_terrarium' || d.frame === 'carnivorous_bloom') drawFlameGlow(ctx, x, y - 32 * sc, time + d.x, 24 * sc, 0.42, 'emerald');
      else if (d.frame === 'star_orrery' || d.frame === 'celestial_globe') drawFlameGlow(ctx, x, y - 36 * sc, time + d.x, 26 * sc, 0.44, 'cyan');
      else if (d.frame === 'magma_vent') drawFlameGlow(ctx, x, y - 56 * sc, time + d.x, 32 * sc, 0.54);
      else if (d.frame === 'canal_lantern') drawFlameGlow(ctx, x, y - 44 * sc, time + d.x, 26 * sc, 0.52, 'cyan');
      else if (d.frame === 'water_spout') {
        const fx = getFxLayers();
        const fw = Math.max(4, Math.round(10 * sc)), fh = Math.max(8, Math.round(22 * sc));
        if (fx && fx.enabled) {
          fx.waterfall(ctx, { x: Math.round(x - fw * 0.5), y: Math.round(y - 18 * sc), w: fw, h: fh }, {
            camX, tint: [0.18, 0.62, 0.80], foam: [0.72, 0.84, 0.90], alpha: 0.72, speed: 1.3,
          });
        }
        drawFlameGlow(ctx, x, y - 8 * sc, time + d.x, 18 * sc, 0.34, 'cyan');
      }
      else if (d.frame === 'tree') {
        const f = assets.frame('xmasprops', 'tree');
        if (f) {
          for (let i = 0; i < 7; i++) {
            const k = (Math.sin(time * 3 + i * 1.7 + d.x) + 1) / 2;
            if (k < 0.35) continue;
            const lx = x - f.w / 2 + 6 + ((i * 37) % Math.max(1, f.w - 12)), ly = y - 12 - ((i * 23) % Math.max(1, f.h - 24));
            ctx.fillStyle = i % 2 ? `rgba(255, 90, 90, ${k * 0.78})` : `rgba(255, 220, 120, ${k * 0.78})`;
            ctx.fillRect(Math.round(lx), Math.round(ly), 2, 2);
          }
        }
      }
    }
  }

  /**
   * Clock-tower pendulum: pixel-art `hanging_props` hoist wheel, `arch` chain/rod
   * links, and brass/steel `pendulum_bob` swinging in a foreshortened 3D arc.
   */
  drawPendulum(ctx, x, y, d, time) {
    const assets = this._assets;
    const len = d.len || 150, period = d.period || 2.6;
    const a = Math.sin(time * (Math.PI * 2) / period + (d.phase || 0)) * 0.55;
    const depth = Math.cos(a);
    const bx = x + Math.sin(a) * len, by = y + Math.cos(a) * len * (0.85 + 0.15 * depth);
    const bob = assets && assets.frame('hanging_props', 'pendulum_bob');
    const hoist = assets && assets.frame('hanging_props', 'hoist_wheel');
    const hangImg = assets && assets.darkened('hanging_props', 0.28);
    ctx.save();
    if (bob && hangImg) {
      const link = assets.frame('arch', 'chain');
      const linkImg = assets.darkened('arch', 0.28);
      const rLen = Math.hypot(bx - x, by - y);
      const ang = Math.atan2(bx - x, by - y);
      if (link && linkImg) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-ang);
        const step = 11;
        for (let k = 0; k < rLen - 6; k += step) {
          ctx.drawImage(linkImg, link.x, link.y, link.w, Math.min(step, link.h), -3, k, 6, step);
        }
        ctx.restore();
      }
      if (hoist) {
        const hs = 20 / Math.max(16, hoist.w);
        ctx.drawImage(
          hangImg, hoist.x, hoist.y, hoist.w, hoist.h,
          Math.round(x - hoist.w * hs * 0.5), Math.round(y - hoist.h * hs * 0.5),
          Math.round(hoist.w * hs), Math.round(hoist.h * hs),
        );
      }
      const r = d.r || 22;
      const sc = (r * 2.15) / Math.max(20, bob.w);
      ctx.translate(bx, by);
      ctx.rotate(-a * 0.85);
      ctx.scale(sc, sc * (0.76 + 0.24 * depth));
      ctx.drawImage(hangImg, bob.x, bob.y, bob.w, bob.h, Math.round(-bob.w * 0.5), Math.round(-bob.h * 0.55), bob.w, bob.h);
      ctx.restore();
      return;
    }
    ctx.fillStyle = '#1f1912'; ctx.fillRect(Math.round(x) - 6, Math.round(y) - 6, 12, 8);
    ctx.fillStyle = '#685632'; ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
    ctx.strokeStyle = '#2b2319'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(bx, by); ctx.stroke();
    const r = d.r || 22;
    ctx.translate(bx, by);
    ctx.scale(1, 0.7 + 0.3 * depth);
    ctx.fillStyle = '#664e26';
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /** Hanging wrought-iron chandelier: bitmap sprite swinging on a textured chain,
   *  with ceiling mounting canopy, flickering candle frames, and additive glow. */
  drawChandelier(ctx, x, y, d, time) {
    const assets = this._assets;
    const sway = Math.sin(time * 1.1 + (d.phase || 0)) * 0.07;
    const chainLen = d.len != null ? d.len : 64;
    const cx = x + Math.sin(sway) * chainLen, cy = y + Math.cos(sway) * chainLen;
    const f = assets && assets.frame('chandelier', 'a');
    if (!f) return;
    const sc = Math.max(0.46, Math.min(1.10, ((d.r || 27) * 2.7) / f.w));
    const hoist = assets && assets.frame('hanging_props', 'hoist_wheel');
    const hangImg = assets && assets.darkened('hanging_props', 0.28);
    // Chain: repeated arch 'chain' link sprite along the swing, plus ceiling bracket at (x, y)
    ctx.save();
    const link = assets.frame('arch', 'chain');
    const linkImg = assets.darkened('arch', 0.28);
    const ang = Math.atan2(cx - x, cy - y);
    if (link && linkImg && chainLen > 4) {
      ctx.translate(x, y); ctx.rotate(-ang);
      const step = 10;
      for (let k = 0; k < chainLen - 2; k += step) {
        ctx.drawImage(linkImg, link.x, link.y, link.w, Math.min(step, link.h), -3, k, 6, Math.min(step, chainLen - k));
      }
      ctx.rotate(ang); ctx.translate(-x, -y);
    } else if (chainLen > 2) {
      ctx.strokeStyle = '#221e33'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(cx, cy); ctx.stroke();
    }
    if (hoist && hangImg) {
      const hs = (14 * Math.max(0.75, sc)) / Math.max(16, hoist.w);
      ctx.drawImage(
        hangImg, hoist.x, hoist.y, hoist.w, Math.round(hoist.h * 0.55),
        Math.round(x - hoist.w * hs * 0.5), Math.round(y - 2),
        Math.round(hoist.w * hs), Math.max(5, Math.round(hoist.h * 0.55 * hs)),
      );
    }
    // Body: pivot at the top of the sprite's own chain stub
    const flick = Math.sin(time * 9 + (d.phase || 0) * 3) + Math.sin(time * 13.7 + (d.phase || 0));
    const name = flick > 0.2 ? 'b' : 'a';
    ctx.translate(cx, cy);
    ctx.rotate(sway * 0.6);
    ctx.scale(sc, sc);
    const fr = assets.frame('chandelier', name);
    ctx.drawImage(assets.darkened('chandelier', 0.22), fr.x, fr.y, fr.w, fr.h, Math.round(-fr.ax), 0, fr.w, fr.h);
    ctx.restore();
    // Candle glow sits at the ring (middle of the sprite), swaying with it
    const ringY = cy + f.h * sc * 0.52;
    drawFlameGlow(ctx, cx, ringY, time + (d.phase || 0), 22 + 22 * sc, 0.46);
    drawFlameGlow(ctx, cx, ringY - 5 * sc, time * 1.3 + (d.phase || 0), 15 * sc, 0.38);
    const fxl = getFxLayers();
    if (fxl) for (let k = -2; k <= 2; k++) fxl.addFlame(cx + k * 14 * sc, ringY - 8 * sc + Math.abs(k) * 2, 5 * sc, 11 * sc, [1.0, 0.62, 0.2], (d.phase || 0) + k * 0.37);
  }

  /** Crypt gibbet cage: pixel-art `hanging_props.gibbet_cage` swinging on `arch.chain` links. */
  drawCage(ctx, x, y, d, time) {
    const assets = this._assets;
    const sway = Math.sin(time * 0.8 + (d.phase || 0)) * 0.12;
    const len = d.len != null ? d.len : 64, w = 22, h = d.cageH || 40;
    const cx = x + Math.sin(sway) * len, cy = y + Math.cos(sway) * len;
    const cage = assets && assets.frame('hanging_props', 'gibbet_cage');
    const hoist = assets && assets.frame('hanging_props', 'hoist_wheel');
    const hangImg = assets && assets.darkened('hanging_props', 0.28);
    ctx.save();
    if (cage && hangImg) {
      const link = assets.frame('arch', 'chain');
      const linkImg = assets.darkened('arch', 0.28);
      const ang = Math.atan2(cx - x, cy - y);
      if (link && linkImg) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-ang);
        const step = 10;
        for (let k = 0; k < len - 4; k += step) {
          ctx.drawImage(linkImg, link.x, link.y, link.w, Math.min(step, link.h), -3, k, 6, step);
        }
        ctx.restore();
      }
      if (hoist) {
        const hs = 16 / Math.max(16, hoist.w);
        ctx.drawImage(
          hangImg, hoist.x, hoist.y, hoist.w, hoist.h,
          Math.round(x - hoist.w * hs * 0.5), Math.round(y - hoist.h * hs * 0.5),
          Math.round(hoist.w * hs), Math.round(hoist.h * hs),
        );
      }
      const squeeze = 0.86 + 0.14 * Math.cos(sway * 4);
      const sc = (d.cageH || 44) / Math.max(24, cage.h);
      ctx.translate(cx, cy);
      ctx.rotate(sway);
      ctx.scale(sc * squeeze, sc);
      ctx.drawImage(hangImg, cage.x, cage.y, cage.w, cage.h, Math.round(-cage.ax), 0, cage.w, cage.h);
      ctx.restore();
      return;
    }
    ctx.strokeStyle = '#2b2740'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(cx, cy); ctx.stroke();
    ctx.translate(cx, cy); ctx.rotate(sway);
    ctx.strokeStyle = '#3a3424'; ctx.lineWidth = 2;
    ctx.strokeRect(-w / 2, 0, w, h);
    ctx.restore();
  }

  _getStaticTileChunk(cx, cy, assets, spikes, propsImg) {
    if (cx < 0 || cy < 0) return 'empty';
    const tx0 = cx << 4, ty0 = cy << 4;
    if (tx0 >= this.cols || ty0 >= this.rows) return 'empty';
    if (!this._tileChunks) this._tileChunks = new Map();
    const key = (cy << 12) | cx;
    const cached = this._tileChunks.get(key);
    if (cached) return cached;

    const tx1 = Math.min(this.cols - 1, tx0 + 15);
    const ty1 = Math.min(this.rows - 1, ty0 + 15);
    let hasStatic = false;
    for (let ty = ty0; ty <= ty1 && !hasStatic; ty++) {
      const rowOff = ty * this.cols;
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = this.tiles[rowOff + tx];
        if (isMaterialTile(t) || t === T_BLOCK || t === T_SPIKES) {
          if (isMaterialTile(t) && !assets.info(MATERIAL_STRIP[t])) return null;
          if ((t === T_BLOCK || t === T_SPIKES) && !propsImg) return null;
          hasStatic = true;
          break;
        }
      }
    }
    if (!hasStatic) {
      this._tileChunks.set(key, 'empty');
      return 'empty';
    }

    const c = document.createElement('canvas');
    c.width = 520;
    c.height = 540;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    this._renderStaticTileRange(g, tx0, tx1, ty0, ty1, (cx << 9) - 4, (cy << 9) - 12, assets, spikes, propsImg);
    if (this._tileChunks.size >= 48) {
      this._tileChunks.delete(this._tileChunks.keys().next().value);
    }
    this._tileChunks.set(key, c);
    return c;
  }

  _renderStaticTileRange(ctx, tx0, tx1, ty0, ty1, offX, offY, assets, spikes, propsImg) {
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = this.tiles[ty * this.cols + tx];
        if (t === T_EMPTY || t === T_PLATFORM || t === T_CRUMBLE || t === T_GATE || t === T_BOUND || t === T_LAVA || t === T_WATER) continue;
        const x = tx * TILE - offX, y = ty * TILE - offY;
        if (isMaterialTile(t)) {
          let name = MATERIAL_STRIP[t];
          if (assets.info(name + '_b') && hash2(tx >> 3, 7) % 100 < 45) name += '_b';
          const info = assets.info(name), img = assets.img(name);
          if (!info) continue;
          const d = this.depth[ty * this.cols + tx];
          const sx = (tx * TILE) % info.w;
          if (d === 0) {
            ctx.drawImage(img, sx, 0, TILE, info.overhang + TILE, x, y - info.overhang, TILE, info.overhang + TILE);
            if (t === T_SNOW) {
              const hv = hash2(tx, ty);
              if (!this.isSolid(tx - 1, ty)) {
                const ic = 5 + (hv % 6);
                ctx.fillStyle = '#637ea8';
                ctx.fillRect(x - 2, y + 2, 3, 6);
                ctx.fillStyle = '#c8dff8';
                ctx.fillRect(x - 2, y - 1, 4, 4);
                ctx.fillStyle = '#f2f8ff';
                ctx.fillRect(x - 1, y - 2, 3, 2);
                ctx.fillStyle = '#8fb4e0';
                ctx.fillRect(x - 2, y + 7, 2, ic);
                ctx.fillStyle = '#e6f3ff';
                ctx.fillRect(x - 2, y + 6, 1, Math.max(2, ic - 2));
              }
              if (!this.isSolid(tx + 1, ty)) {
                const ic = 5 + ((hv >> 3) % 6);
                ctx.fillStyle = '#5c76a0';
                ctx.fillRect(x + TILE - 1, y + 2, 3, 6);
                ctx.fillStyle = '#c8dff8';
                ctx.fillRect(x + TILE - 2, y - 1, 4, 4);
                ctx.fillStyle = '#f2f8ff';
                ctx.fillRect(x + TILE - 2, y - 2, 3, 2);
                ctx.fillStyle = '#8fb4e0';
                ctx.fillRect(x + TILE, y + 7, 2, ic);
                ctx.fillStyle = '#e6f3ff';
                ctx.fillRect(x + TILE, y + 6, 1, Math.max(2, ic - 2));
              }
            }
          } else {
            ctx.drawImage(img, sx, info.overhang + TILE * d, TILE, TILE, x, y, TILE, TILE);
            const j = hash2(tx, ty) % 100;
            const jmax = t === T_SNOW ? 0.04 : 0.07;
            if (j < 55) { ctx.fillStyle = `rgba(4, 3, 10, ${(0.3 + (j % 7) / 7 * 0.7) * jmax})`; ctx.fillRect(x, y, TILE, TILE); }
          }
          if (t === T_SNOW && d <= 2 && ty + 1 < this.rows && !this.isSolid(tx, ty + 1)) {
            const hv = hash2(tx * 7 + 3, ty * 13 + 5);
            // Uneven alpine slate underside teeth + hanging crystalline icicles
            for (let k = 0; k < 4; k++) {
              const ox = 2 + k * 8 + ((hv >> (k * 2)) & 1);
              const rw = 5 + ((hv >> (k + 3)) & 2);
              const rh = 1 + ((hv >> (k + 6)) & 2);
              ctx.fillStyle = (k & 1) ? '#1a253a' : '#263652';
              ctx.fillRect(x + ox, y + TILE - 1, rw, rh);
              const ilen = 4 + ((hv >> (k * 3 + 1)) % 9);
              const ix = x + ox + 1;
              ctx.fillStyle = '#5d7ca8';
              ctx.fillRect(ix, y + TILE, 3, Math.ceil(ilen * 0.55));
              ctx.fillStyle = '#9ec3ec';
              ctx.fillRect(ix, y + TILE + 1, 2, ilen - 1);
              ctx.fillStyle = '#eaf5ff';
              ctx.fillRect(ix, y + TILE + 1, 1, Math.max(2, ilen - 3));
              ctx.fillRect(ix + 1, y + TILE + ilen - 1, 1, 2);
            }
          }
        } else if (t === T_BLOCK) {
          assets.draw(ctx, 'props', 'block', x + 16, y + 32);
        } else if (t === T_SPIKES && spikes && propsImg) {
          ctx.drawImage(propsImg, spikes.x + (tx % 2) * 32, spikes.y, 32, spikes.h, x, y + TILE - spikes.h, 32, spikes.h);
        }
      }
    }
  }

  drawTiles(ctx, cam, assets, time = 0, stage3d = null) {
    this.drawStaticTiles(ctx, cam, assets, time);
    this.drawDynamicTiles(ctx, cam, assets, time, stage3d);
  }

  /**
   * Static architectural terrain pass (viaducts, 3D walkable decks, crisp z = 0
   * stone/earth faces, lava pools, and static one-way balconies). Drawn BEFORE
   * wall-recessed PassageGate portals & Sanctuary shrines so dynamic moving
   * lifts and crumbling slabs can pass cleanly in front of doorways.
   */
  drawStaticTiles(ctx, cam, assets, time = 0) {
    const camX = cam.rx, camY = cam.ry;
    const tx0 = Math.max(0, Math.floor(camX / TILE) - 1);
    const tx1 = Math.min(this.cols - 1, Math.ceil((camX + W) / TILE) + 1);
    const ty0 = Math.max(0, Math.floor(camY / TILE) - 1);
    const ty1 = Math.min(this.rows - 1, Math.ceil((camY + H) / TILE) + 1);
    const spikes = assets.frame('props', 'spikes'), propsImg = assets.img('props');
    const bank = getTexBank(assets);

    // 1. Texture-mapped 3D Viaduct Arches & Piers underneath open bridge spans.
    for (const br of this.bridgeRuns) {
      if (br.x1 < tx0 - 2 || br.x0 > tx1 + 2) continue;
      this.drawBridgeUnderstructure3D(ctx, camX, camY, br, bank);
    }

    // 2a. Merged, perspective-subdivided & texture-mapped 3D Walkable Top Decks & Ceiling Soffits (z = 0 -> DECK_Z).
    const blockTex = bank ? bank.get('block_stone') : null;
    for (let ty = ty0; ty <= ty1; ty++) {
      const wy = ty * TILE;
      if (wy > camY + EYE_Y + 4) {
        let tx = tx0;
        while (tx <= tx1) {
          const t = this.tiles[ty * this.cols + tx];
          const openAbove = isMaterialTile(t) && this.depth[ty * this.cols + tx] === 0 && (ty === 0 || !this.isSolid(tx, ty - 1));
          if (!openAbove) {
            if (t === T_BLOCK && (ty === 0 || !this.isSolid(tx, ty - 1))) {
              this.drawTopDeck3D(ctx, camX, camY, tx * TILE, wy, TILE, SIDE_Z, blockTex, 0.72);
            }
            tx++;
            continue;
          }
          const startTx = tx;
          while (
            tx <= tx1 &&
            this.tiles[ty * this.cols + tx] === t &&
            this.depth[ty * this.cols + tx] === 0 &&
            (ty === 0 || !this.isSolid(tx, ty - 1))
          ) tx++;
          const topTex = bank ? bank.matTop(t) : null;
          const darkScale = t === T_SNOW ? 0.54 : 0.68;
          this.drawTopDeck3D(ctx, camX, camY, startTx * TILE, wy, (tx - startTx) * TILE, DECK_Z, topTex, darkScale);
        }
      }
      if (wy + TILE < camY + EYE_Y - 8) {
        let tx = tx0;
        while (tx <= tx1) {
          const t = this.tiles[ty * this.cols + tx];
          const openBelow = isMaterialTile(t) && !this.isSolid(tx, ty + 1);
          if (!openBelow) {
            if (t === T_BLOCK && !this.isSolid(tx, ty + 1)) {
              this.drawCeilingSoffit3D(ctx, camX, camY, tx * TILE, (ty + 1) * TILE, TILE, SIDE_Z, blockTex);
            }
            tx++;
            continue;
          }
          const startTx = tx;
          while (
            tx <= tx1 &&
            this.tiles[ty * this.cols + tx] === t &&
            !this.isSolid(tx, ty + 1)
          ) tx++;
          const sideTex = bank ? bank.matSide(t) : null;
          this.drawCeilingSoffit3D(ctx, camX, camY, startTx * TILE, (ty + 1) * TILE, (tx - startTx) * TILE, DECK_Z, sideTex);
        }
      }
    }

    // 2b. Texture-mapped 3D vertical step & cliff side-returns (drawn after decks, strictly behind z = 0 tiles).
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = this.tiles[ty * this.cols + tx];
        if (isMaterialTile(t)) {
          const leftOpen = !this.isSolid(tx - 1, ty), rightOpen = !this.isSolid(tx + 1, ty);
          if (!leftOpen && !rightOpen) continue;
          const sideTex = bank ? bank.matSide(t) : null;
          const isSurf = this.depth[ty * this.cols + tx] === 0;
          if (leftOpen) {
            const joinBelow = ty + 1 <= ty1 && isMaterialTile(this.tile(tx, ty + 1)) && !this.isSolid(tx - 1, ty + 1);
            this.sideFace3D(ctx, camX, camY, tx * TILE, ty * TILE, -1, sideTex, isSurf, t === T_SNOW, joinBelow);
          }
          if (rightOpen) {
            const joinBelow = ty + 1 <= ty1 && isMaterialTile(this.tile(tx, ty + 1)) && !this.isSolid(tx + 1, ty + 1);
            this.sideFace3D(ctx, camX, camY, (tx + 1) * TILE, ty * TILE, 1, sideTex, isSurf, t === T_SNOW, joinBelow);
          }
        } else if (t === T_BLOCK) {
          if (!this.isSolid(tx - 1, ty)) this.sideFace3D(ctx, camX, camY, tx * TILE, ty * TILE, -1, blockTex, true, false, false);
          if (!this.isSolid(tx + 1, ty)) this.sideFace3D(ctx, camX, camY, (tx + 1) * TILE, ty * TILE, 1, blockTex, true, false, false);
        }
      }
    }

    // 3. Crisp z = 0 front 2D terrain faces, overhangs, breakable blocks & spikes (cached in 16x16-tile chunks).
    if (typeof document !== 'undefined') {
      const cx0 = tx0 >> 4, cx1 = tx1 >> 4;
      const cy0 = ty0 >> 4, cy1 = ty1 >> 4;
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const chunk = this._getStaticTileChunk(cx, cy, assets, spikes, propsImg);
          if (chunk && chunk !== 'empty') {
            ctx.drawImage(chunk, (cx << 9) - 4 - camX, (cy << 9) - 12 - camY);
          }
        }
      }
    } else {
      this._renderStaticTileRange(ctx, tx0, tx1, ty0, ty1, camX, camY, assets, spikes, propsImg);
    }

    // 3b. Sunken molten lava pools (receding 3D magma surface + convective WebGL lava shader + warm glow).
    if (this.lavaRuns.length) {
      const fx = getFxLayers();
      const lavaTopTex = bank ? bank.get('top_lava') : null;
      const glow = getGlowCanvas('amber');
      for (const lr of this.lavaRuns) {
        if (lr.x1 < tx0 - 1 || lr.x0 > tx1 + 1) continue;
        const wx = lr.x0 * TILE, wy = lr.y * TILE + 6;
        const pw = (lr.x1 - lr.x0 + 1) * TILE, ph = lr.hTiles * TILE - 4;
        const sx = wx - camX, sy = wy - camY;
        if (wy > camY + EYE_Y + 2 && lavaTopTex) {
          this.drawTopDeck3D(ctx, camX, camY, wx, wy, pw, DECK_Z, lavaTopTex, 0.92);
        }
        if (fx && fx.enabled) {
          fx.lava(ctx, { x: sx, y: sy, w: pw, h: ph }, camX);
        } else {
          ctx.fillStyle = '#380806';
          ctx.fillRect(sx, sy, pw, ph);
          ctx.fillStyle = '#ff6a18';
          ctx.fillRect(sx, sy, pw, 6);
          for (let bx = 0; bx < pw; bx += 16) {
            const wave = Math.round(Math.sin(time * 4 + (wx + bx) * 0.08) * 2);
            ctx.fillStyle = '#ffe066';
            ctx.fillRect(sx + bx + 2, sy + 1 + Math.max(0, wave), 10, 3);
          }
        }
        if (glow) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.28 + 0.08 * Math.sin(time * 3.4 + lr.x0);
          for (let gx = sx + 24; gx < sx + pw; gx += 64) {
            ctx.drawImage(glow, gx - 42, sy - 34, 84, 58);
          }
          ctx.restore();
        }
        if (!this.isSolid(lr.x0 - 1, lr.y)) this.drawLiquidRetainingCurb(ctx, sx - 8, sy - 6, ph + 6, true, true);
        if (!this.isSolid(lr.x1 + 1, lr.y)) this.drawLiquidRetainingCurb(ctx, sx + pw - 2, sy - 6, ph + 6, false, true);
      }
    }

    // 4. One-way platforms with textured 3D support trestles, receding top deck & 3D end caps.
    const platName = assets.info(this.platformImg) ? this.platformImg : 'platform';
    const plat = assets.info(platName), pImg = assets.img(platName);
    const wood = platName === 'platform_wood';
    const platTex = bank ? bank.get(wood ? 'plat_wood' : 'plat_stone') : null;
    const postTex = bank ? bank.get(wood ? 'wood_plank' : 'iron_rivet') : null;
    for (const r of this.platformRuns) {
      if (r.x1 < tx0 || r.x0 > tx1 || r.y < ty0 - 1 || r.y > ty1) continue;
      if (this.isDrawbridgeRun(r)) continue;
      for (let tx = r.x0; tx <= r.x1; tx++) {
        if (tx !== r.x0 && tx !== r.x1 && (tx - r.x0) % 4 !== 2) continue;
        let gy = -1;
        for (let k = 1; k <= 6; k++) if (this.isSolid(tx, r.y + k)) { gy = r.y + k; break; }
        if (gy < 0) continue;
        const wx = tx * TILE + 12, wy0 = r.y * TILE + 16, wy1 = gy * TILE;
        if (wy1 <= wy0) continue;
        const f0 = project3D(wx, wy0, 24, camX, camY), f1 = project3D(wx, wy1, 24, camX, camY);
        const px0 = wx - camX, py0 = wy0 - camY, ph = wy1 - wy0;
        if (postTex) {
          texQuad(ctx, postTex,
            { x: f0.x, y: f0.y }, { x: f0.x + 6, y: f0.y },
            { x: f0.x + 6, y: f1.y }, { x: f0.x, y: f1.y },
            0, wy0, 8, wy0, 8, wy1, 0, wy1,
            shadeOverlay32([0, 0, -1], DECK_FOG, 0.48, 0.55));
          texQuad(ctx, postTex,
            { x: px0, y: py0 }, { x: px0 + 8, y: py0 },
            { x: px0 + 8, y: py0 + ph }, { x: px0, y: py0 + ph },
            0, wy0, 8, wy0, 8, wy1, 0, wy1,
            shadeOverlay32([-0.3, 0, -0.9], DECK_FOG, 0.28, 0.78));
        }
      }
    }
    for (const r of this.platformRuns) {
      if (r.x1 < tx0 || r.x0 > tx1 || r.y < ty0 - 1 || r.y > ty1) continue;
      if (this.isDrawbridgeRun(r)) continue;
      const wy = r.y * TILE, y = wy - camY - 2;
      const spanW = (r.x1 - r.x0 + 1) * TILE;
      if (wy > camY + EYE_Y + 4) {
        this.drawTopDeck3D(ctx, camX, camY, r.x0 * TILE, wy, spanW, 28, platTex, 0.68);
      } else if (wy + 18 < camY + EYE_Y - 4) {
        this.drawCeilingSoffit3D(ctx, camX, camY, r.x0 * TILE, wy + 18, spanW, 28, platTex);
      }
      const slabH = Math.min(20, plat.h);
      this.drawSlabSide3D(ctx, camX, camY, r.x0 * TILE, wy, slabH, 28, -1, platTex);
      this.drawSlabSide3D(ctx, camX, camY, (r.x1 + 1) * TILE, wy, slabH, 28, 1, platTex);
      for (let tx = r.x0; tx <= r.x1; tx++) {
        const x = tx * TILE - camX;
        let sx;
        if (tx === r.x0) sx = 0;
        else if (tx === r.x1) sx = plat.w - TILE;
        else sx = TILE + ((tx - r.x0 - 1) % ((plat.w - 2 * TILE) / TILE)) * TILE;
        ctx.drawImage(pImg, sx, 0, TILE, plat.h, x, y, TILE, plat.h);
      }
    }
    if (this.drawbridge) {
      this.drawDrawbridge(ctx, camX, camY, bank, assets, time);
    }

    // 4b. Walkable 2.5D/3D Gothic staircases (solid stone/earth flights & mezzanine stringer stairs).
    if (this.stairs.length) {
      this.drawStairs3D(ctx, camX, camY, tx0, tx1, assets, bank, pImg, plat, platTex, wood);
    }
  }

  /**
   * Stage 1 Grand Castle-Moat DRAWBRIDGE & Barbican Gatehouse:
   * Spans a 480px (15-tile) flooded moat with 3 cut-stone piers, a twin-turreted
   * West Bridgehead Bastion, a multi-tier East Barbican Gatehouse Keep with 3
   * spinning forged-iron windlass wheels, and a rigid-body oak-and-iron drawbridge
   * leaf that rotates upward (`0 -> 81 deg`) and seals behind the hunter once they
   * step inside the Castle Foyer.
   */
  drawDrawbridge(ctx, camX, camY, bank, assets, time = 0) {
    const d = this.drawbridge;
    if (!d) return;
    const wx0 = d.x0 * TILE, wx1 = (d.x1 + 1) * TILE;
    const wy = d.row * TILE;
    const sx0 = Math.round(wx0 - camX), sx1 = Math.round(wx1 - camX);
    const sy = Math.round(wy - camY);
    if (sx1 < -220 || sx0 > W + 220) return;

    const woodTex = bank ? bank.get('plat_wood') : null;
    const plankTex = bank ? bank.get('wood_plank') : null;
    const stoneTex = bank ? bank.get('wall') : null;
    const deckImg = assets && assets.img ? assets.img('drawbridge_deck') : null;
    const supImg = assets && assets.img ? assets.img('drawbridge_support') : null;
    const gateImg = assets && assets.img ? assets.img('drawbridge_gatehouse') : null;
    const doorPropsImg = assets && assets.img ? assets.img('boss_door_props') : null;

    const deckA = assets && assets.frame ? assets.frame('drawbridge_deck', 'deck_tile_a') : null;
    const deckB = assets && assets.frame ? assets.frame('drawbridge_deck', 'deck_tile_b') : null;
    const railFr = assets && assets.frame ? assets.frame('drawbridge_deck', 'rail_tile') : null;
    const newelFr = assets && assets.frame ? assets.frame('drawbridge_deck', 'newel_post') : null;
    const drumFr = assets && assets.frame ? assets.frame('drawbridge_deck', 'hinge_drum') : null;

    const pierCapFr = assets && assets.frame ? assets.frame('drawbridge_support', 'pier_cap') : null;
    const pierShaftFr = assets && assets.frame ? assets.frame('drawbridge_support', 'pier_shaft') : null;
    const braceFr = assets && assets.frame ? assets.frame('drawbridge_support', 'knee_brace') : null;
    const wheelFr = assets && assets.frame ? assets.frame('drawbridge_support', 'windlass_wheel') : null;
    const shackleFr = assets && assets.frame ? assets.frame('drawbridge_support', 'chain_shackle') : null;
    const linkFr = assets && assets.frame ? assets.frame('drawbridge_support', 'chain_link') : null;

    const watchFr = assets && assets.frame ? assets.frame('drawbridge_gatehouse', 'watch_pier') : null;
    const bastionFr = assets && assets.frame ? assets.frame('drawbridge_gatehouse', 'gatehouse_bastion') : null;
    const portcullisFr = assets && assets.frame ? assets.frame('drawbridge_gatehouse', 'portcullis_grille') : null;
    const bannerFr = assets && assets.frame ? assets.frame('drawbridge_gatehouse', 'royal_banner') : null;
    const guardFr = assets && assets.frame ? assets.frame('boss_door_props', 'entry_guardian') : null;

    const deckH = deckA ? deckA.h - 2 : 26;
    const spanW = sx1 - sx0;
    const fx = getFxLayers();
    const raiseRaw = Math.max(0, Math.min(1, d.raise || 0));
    const ease = raiseRaw * raiseRaw * (3 - 2 * raiseRaw);
    const theta = ease * 1.42; // 0 rad (lowered flat) -> +81.4 deg (raised tight against the East Keep)

    // 1. Three cut-stone Gothic moat piers (`pier_shaft` + `pier_cap`) & diagonal oak `knee_brace` struts
    const floorWy = d.floorRow * TILE;
    const floorSy = Math.round(floorWy - camY);
    const pierPositions = [
      wx0 + (wx1 - wx0) * 0.26,
      wx0 + (wx1 - wx0) * 0.52,
      wx0 + (wx1 - wx0) * 0.78,
    ];
    const pw = pierShaftFr ? pierShaftFr.w - 4 : 26;
    for (const pierCx of pierPositions) {
      if (stoneTex) {
        const fTL = project3D(pierCx - pw / 2, wy + deckH, 8, camX, camY);
        const fTR = project3D(pierCx + pw / 2, wy + deckH, 8, camX, camY);
        const fBL = project3D(pierCx - pw / 2 - 4, floorWy + 6, 8, camX, camY);
        const fBR = project3D(pierCx + pw / 2 + 4, floorWy + 6, 8, camX, camY);
        const bTL = project3D(pierCx - pw / 2, wy + deckH, 36, camX, camY);
        const bTR = project3D(pierCx + pw / 2, wy + deckH, 36, camX, camY);
        const bBL = project3D(pierCx - pw / 2 - 4, floorWy + 6, 36, camX, camY);
        const bBR = project3D(pierCx + pw / 2 + 4, floorWy + 6, 36, camX, camY);
        if (bTL.x < fTL.x - 0.4) {
          texQuad(ctx, stoneTex, bTL, fTL, fBL, bBL, 0, wy, 32, wy, 32, floorWy, 0, floorWy, shadeOverlay32([-1, 0, -0.2], DECK_FOG, 0.44));
        } else if (bTR.x > fTR.x + 0.4) {
          texQuad(ctx, stoneTex, fTR, bTR, bBR, fBR, 0, wy, 32, wy, 32, floorWy, 0, floorWy, shadeOverlay32([1, 0, -0.2], DECK_FOG, 0.44));
        }
      }
      const psx = Math.round(pierCx - camX);
      if (supImg && pierShaftFr && pierCapFr) {
        const capTop = sy + deckH - 8;
        const shaftStart = capTop + pierCapFr.h - 10;
        ctx.save();
        ctx.beginPath();
        ctx.rect(psx - 32, capTop, 64, Math.max(24, floorSy - capTop + 8));
        ctx.clip();
        for (let py = floorSy + 6 - pierShaftFr.h; py + pierShaftFr.h > shaftStart; py -= (pierShaftFr.h - 8)) {
          ctx.drawImage(
            supImg,
            pierShaftFr.x, pierShaftFr.y, pierShaftFr.w, pierShaftFr.h,
            Math.round(psx - pierShaftFr.w * 0.5), Math.round(py), pierShaftFr.w, pierShaftFr.h,
          );
        }
        ctx.drawImage(
          supImg,
          pierCapFr.x, pierCapFr.y, pierCapFr.w, pierCapFr.h,
          Math.round(psx - pierCapFr.w * 0.5), capTop, pierCapFr.w, pierCapFr.h,
        );
        ctx.restore();
      }
      if (supImg && braceFr && theta < 0.14) {
        const braceY = sy + deckH - 3;
        ctx.drawImage(
          supImg,
          braceFr.x, braceFr.y, braceFr.w, braceFr.h,
          psx + 5, braceY, braceFr.w, braceFr.h,
        );
        ctx.save();
        ctx.translate(psx - 5, braceY);
        ctx.scale(-1, 1);
        ctx.drawImage(
          supImg,
          braceFr.x, braceFr.y, braceFr.w, braceFr.h,
          0, 0, braceFr.w, braceFr.h,
        );
        ctx.restore();
      }
    }

    // 2. Twin-Turreted West Bridgehead Bastion, Sentinel Gargoyle & Blazing Braziers
    if (gateImg && watchFr) {
      for (let wIdx = 0; wIdx < 2; wIdx++) {
        const watchCx = sx0 - 13 - wIdx * 34;
        const watchBottom = sy + deckH - 2 + wIdx * 6;
        const watchTop = watchBottom - watchFr.h;
        ctx.drawImage(
          gateImg,
          watchFr.x, watchFr.y, watchFr.w, watchFr.h,
          Math.round(watchCx - watchFr.w * 0.5), watchTop, watchFr.w, watchFr.h,
        );
        drawFlameGlow(ctx, watchCx, watchTop + 3, time + 0.4 + wIdx * 1.1, 30, 0.55);
        if (fx) fx.addFlame(watchCx, watchTop + 6, 10, 16, [1.0, 0.58, 0.18], 0.37 + wIdx * 0.73);
      }
      if (bannerFr) {
        const swayW = Math.round(Math.sin(time * 2.0 + 0.7) * 0.8);
        ctx.drawImage(
          gateImg,
          bannerFr.x, bannerFr.y, bannerFr.w, bannerFr.h,
          Math.round(sx0 - 30 - bannerFr.w * 0.5) + swayW, sy - 64, bannerFr.w, bannerFr.h,
        );
      }
    }
    if (doorPropsImg && guardFr) {
      ctx.drawImage(
        doorPropsImg,
        guardFr.x, guardFr.y, guardFr.w, guardFr.h,
        Math.round(sx0 - 66 - guardFr.w * 0.5), sy - guardFr.h + 2, guardFr.w, guardFr.h,
      );
    }

    // 3. Colossal Multi-Tier East Barbican Gatehouse Keep, Banners & Turret Braziers
    const gateCx = sx1 + 26;
    if (gateImg && bastionFr) {
      const bastionBottom = sy + 6;
      const bastionTop = bastionBottom - bastionFr.h;
      // Upper 2nd-story crenelated Barbican crown rising above the main gatehouse bastion
      ctx.save();
      ctx.beginPath();
      ctx.rect(Math.round(gateCx - bastionFr.w * 0.44), bastionTop - 68, Math.round(bastionFr.w * 0.88), 74);
      ctx.clip();
      ctx.drawImage(
        gateImg,
        bastionFr.x, bastionFr.y, bastionFr.w, Math.min(82, bastionFr.h),
        Math.round(gateCx - bastionFr.w * 0.44), bastionTop - 68,
        Math.round(bastionFr.w * 0.88), Math.min(82, bastionFr.h),
      );
      ctx.fillStyle = 'rgba(8, 7, 18, 0.24)';
      ctx.fillRect(Math.round(gateCx - bastionFr.w * 0.44), bastionTop - 68, Math.round(bastionFr.w * 0.88), 74);
      ctx.restore();

      // Main monumental Barbican gatehouse bastion
      ctx.drawImage(
        gateImg,
        bastionFr.x, bastionFr.y, bastionFr.w, bastionFr.h,
        Math.round(gateCx - bastionFr.w * 0.5), bastionTop, bastionFr.w, bastionFr.h,
      );
      // Raised portcullis teeth gleaming inside the pointed gateway arch when still open
      if (portcullisFr && (d.portcullis || 0) < 0.2) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(Math.round(gateCx - portcullisFr.w * 0.5), sy - 54, portcullisFr.w, 48);
        ctx.clip();
        ctx.drawImage(
          gateImg,
          portcullisFr.x, portcullisFr.y, portcullisFr.w, portcullisFr.h,
          Math.round(gateCx - portcullisFr.w * 0.5), sy - 58, portcullisFr.w, portcullisFr.h,
        );
        ctx.restore();
      }
      // Four royal crimson-and-gold heraldic banners across lower & upper gatehouse turrets
      if (bannerFr) {
        for (const [turretOff, banY] of [[-36, sy - 118], [36, sy - 118], [-26, bastionTop - 44], [26, bastionTop - 44]]) {
          const swayX = Math.round(Math.sin(time * 2.1 + turretOff * 0.1 + banY * 0.02) * 0.8);
          ctx.drawImage(
            gateImg,
            bannerFr.x, bannerFr.y, bannerFr.w, bannerFr.h,
            Math.round(gateCx + turretOff - bannerFr.w * 0.5) + swayX, banY, bannerFr.w, bannerFr.h,
          );
        }
      }
      // Blazing lower & upper gatehouse turret braziers
      drawFlameGlow(ctx, gateCx - 36, sy - 42, time + 1.1, 28, 0.54);
      drawFlameGlow(ctx, gateCx + 36, sy - 42, time + 2.3, 28, 0.54);
      drawFlameGlow(ctx, gateCx - 28, bastionTop - 52, time + 0.6, 24, 0.48);
      drawFlameGlow(ctx, gateCx + 28, bastionTop - 52, time + 1.9, 24, 0.48);
      if (fx) {
        fx.addFlame(gateCx - 36, sy - 38, 8, 14, [1.0, 0.58, 0.18], 1.13);
        fx.addFlame(gateCx + 36, sy - 38, 8, 14, [1.0, 0.58, 0.18], 2.41);
        fx.addFlame(gateCx - 28, bastionTop - 48, 7, 12, [1.0, 0.58, 0.18], 0.63);
        fx.addFlame(gateCx + 28, bastionTop - 48, 7, 12, [1.0, 0.58, 0.18], 1.91);
      }
    }

    // 4. Receding plank top deck + 3D timber soffit when lowered flat (`theta < 0.05`)
    if (woodTex && theta < 0.05) {
      if (wy > camY + EYE_Y + 4) this.drawTopDeck3D(ctx, camX, camY, wx0, wy, wx1 - wx0, 30, woodTex, 0.68);
      const fL = project3D(wx0, wy + deckH, 2, camX, camY);
      const fR = project3D(wx1, wy + deckH, 2, camX, camY);
      const bR = project3D(wx1, wy + deckH + 7, 32, camX, camY);
      const bL = project3D(wx0, wy + deckH + 7, 32, camX, camY);
      texQuad(ctx, plankTex || woodTex, fL, fR, bR, bL, wx0, 0, wx1, 0, wx1, 24, wx0, 24, shadeOverlay32([0, 0.8, -0.5], DECK_FOG, 0.34, 0.80));
    }

    // 5. Rigid-Body Rotating Drawbridge Leaf (hinged at `(sx1, sy)`: balustrade + newel finials + oak deck + hinge drums)
    ctx.save();
    ctx.translate(sx1, sy);
    if (theta > 0.0005) ctx.rotate(theta);

    if (deckImg && railFr) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(-spanW + 6, -railFr.h - 4, Math.max(0, spanW - 12), railFr.h + 6);
      ctx.clip();
      for (let rx = -spanW + 6; rx < -6; rx += railFr.w) {
        ctx.drawImage(
          deckImg,
          railFr.x, railFr.y, railFr.w, railFr.h,
          rx, -railFr.h + 1, railFr.w, railFr.h,
        );
      }
      ctx.restore();
    }
    if (deckImg && newelFr) {
      for (let nx = -spanW + 8; nx <= -8; nx += 64) {
        ctx.drawImage(
          deckImg,
          newelFr.x, newelFr.y, newelFr.w, newelFr.h,
          Math.round(nx - newelFr.w * 0.5), -newelFr.h + 3, newelFr.w, newelFr.h,
        );
      }
    }
    if (deckImg && deckA && deckB) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(-spanW, -3, spanW, deckA.h + 4);
      ctx.clip();
      let dx = -spanW;
      let idx = 0;
      while (dx < 0) {
        const tileFr = (idx & 1) === 0 ? deckA : deckB;
        ctx.drawImage(
          deckImg,
          tileFr.x, tileFr.y, tileFr.w, tileFr.h,
          dx, -2, tileFr.w, tileFr.h,
        );
        dx += tileFr.w;
        idx++;
      }
      ctx.restore();
    } else {
      ctx.fillStyle = '#5e3d20';
      ctx.fillRect(-spanW, -2, spanW, 20);
    }
    if (deckImg && drumFr) {
      for (const drumOff of [-spanW + 2, -2]) {
        ctx.drawImage(
          deckImg,
          drumFr.x, drumFr.y, drumFr.w, drumFr.h,
          Math.round(drumOff - drumFr.w * 0.5), -3, drumFr.w, drumFr.h,
        );
      }
    }
    ctx.restore();

    // 6. Three Taut Hoist Chain Assemblies + Rotating Forged-Iron Windlass Wheels
    const gx = this.rooms.length ? this.rooms[0].x0 * TILE : wx1;
    const showChains = camX < gx + 220;
    if (showChains && supImg && wheelFr && linkFr && shackleFr) {
      const hoistAssemblies = [
        { distFromHinge: spanW - 22, anchorWx: wx1 - 4, anchorWy: wy - 208 },
        { distFromHinge: Math.round(spanW * 0.60), anchorWx: wx1 + 14, anchorWy: wy - 156 },
        { distFromHinge: Math.round(spanW * 0.25), anchorWx: wx1 + 30, anchorWy: wy - 106 },
      ];
      const cosT = Math.cos(theta), sinT = Math.sin(theta);
      const wheelRot = d.wheelAngle || 0;
      const sway = Math.sin(time * 1.6) * 0.5 * (1 - ease);
      ctx.save();
      for (let hIdx = 0; hIdx < hoistAssemblies.length; hIdx++) {
        const ha = hoistAssemblies[hIdx];
        const anchor = project3D(ha.anchorWx, ha.anchorWy, 24, camX, camY);
        const wxScreen = Math.round(anchor.x);
        const wyScreen = Math.round(anchor.y);

        // Rotating spoked forged-iron windlass hoist wheel on the Barbican Keep
        ctx.save();
        ctx.translate(wxScreen, wyScreen);
        ctx.rotate(wheelRot * (1 + hIdx * 0.18));
        ctx.drawImage(
          supImg,
          wheelFr.x, wheelFr.y, wheelFr.w, wheelFr.h,
          -Math.round(wheelFr.w * 0.5), -Math.round(wheelFr.h * 0.5), wheelFr.w, wheelFr.h,
        );
        ctx.restore();

        for (let c = 1; c >= 0; c--) {
          const dH = Math.max(12, ha.distFromHinge - c * 6);
          const ax = sx1 - dH * cosT + 3 * sinT;
          const ay = sy - dH * sinT - 3 * cosT + c;
          const bx = anchor.x + c * 4 + sway;
          const by = anchor.y + 3 + c * 2;
          const len = Math.hypot(bx - ax, by - ay);
          if (len < 10) continue;
          const ang = Math.atan2(by - ay, bx - ax);
          const ux = (bx - ax) / len;
          const uy = (by - ay) / len;
          const step = 15;
          ctx.globalAlpha = c === 0 ? 1.0 : 0.72;
          for (let dist = 4; dist < len - 6; dist += step) {
            ctx.save();
            ctx.translate(ax + ux * dist, ay + uy * dist);
            ctx.rotate(ang);
            ctx.drawImage(
              supImg,
              linkFr.x, linkFr.y, linkFr.w, linkFr.h,
              -Math.round(linkFr.w * 0.5), -Math.round(linkFr.h * 0.5), linkFr.w, linkFr.h,
            );
            ctx.restore();
          }
          ctx.globalAlpha = 1.0;
          ctx.save();
          ctx.translate(ax, ay);
          ctx.rotate(theta);
          ctx.drawImage(
            supImg,
            shackleFr.x, shackleFr.y, shackleFr.w, shackleFr.h,
            -Math.round(shackleFr.w * 0.5), -Math.round(shackleFr.h * 0.55), shackleFr.w, shackleFr.h,
          );
          ctx.restore();
        }
      }
      ctx.restore();
    }
  }

  /**
   * Foreground Barbican Gateway Threshold & Slamming Spiked Portcullis:
   * Drawn AFTER the hunter (`World.draw`) so the hunter strides beneath the stone
   * gateway arch into the Castle Foyer and the spiked iron portcullis slams shut
   * in the foreground channel at `d.gateCol` right behind them!
   */
  drawDrawbridgeForeground(ctx, cam, assets, time = 0) {
    const d = this.drawbridge;
    if (!d) return;
    const gateCol = d.gateCol != null ? d.gateCol : d.x1 + 1;
    const wx = gateCol * TILE + 16;
    const wy = d.row * TILE;
    const sx = Math.round(wx - cam.rx);
    const sy = Math.round(wy - cam.ry);
    if (sx < -120 || sx > W + 120) return;

    const gateImg = assets && assets.img ? assets.img('drawbridge_gatehouse') : null;
    const portFr = assets && assets.frame ? assets.frame('drawbridge_gatehouse', 'portcullis_grille') : null;
    const bgImg = assets && assets.img ? assets.img('boss_gates') : null;
    const shaftFr = assets && assets.frame ? assets.frame('boss_gates', 'jamb_shaft') : null;
    const baseFr = assets && assets.frame ? assets.frame('boss_gates', 'jamb_base') : null;
    const capFr = assets && assets.frame ? assets.frame('boss_gates', 'jamb_cap') : null;
    const botFr = assets && assets.frame ? assets.frame('boss_gates', 'entry_bottom') : null;

    const gateH = 148;
    const topY = sy - gateH;
    const dropFrac = Math.max(0, Math.min(1, d.portcullis || 0));
    const visibleH = Math.round(22 + dropFrac * (gateH - 22));

    // 1. Slamming spiked wrought-iron portcullis grille inside the gateway channel
    if (gateImg && portFr) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx - 26, topY, 52, visibleH + 4);
      ctx.clip();
      const grilleBottom = topY + visibleH;
      for (let py = grilleBottom - portFr.h; py + portFr.h > topY - 8; py -= Math.max(24, portFr.h - 10)) {
        ctx.drawImage(
          gateImg,
          portFr.x, portFr.y, portFr.w, portFr.h,
          Math.round(sx - portFr.w * 0.5), Math.round(py), portFr.w, portFr.h,
        );
      }
      if (bgImg && botFr) {
        ctx.drawImage(
          bgImg,
          botFr.x, botFr.y, botFr.w, botFr.h,
          Math.round(sx - botFr.w * 0.5), Math.round(grilleBottom - botFr.h), botFr.w, botFr.h,
        );
      }
      ctx.restore();
    }

    // 2. Foreground cut-stone portcullis jamb pier + gargoyle finial cap framing the threshold
    if (bgImg && shaftFr && baseFr && capFr) {
      const jambX = sx + 14;
      ctx.save();
      ctx.globalAlpha = 0.94;
      for (let py = sy - baseFr.h - shaftFr.h + 6; py > topY - 6; py -= Math.max(16, shaftFr.h - 4)) {
        ctx.drawImage(
          bgImg,
          shaftFr.x, shaftFr.y, shaftFr.w, shaftFr.h,
          Math.round(jambX - shaftFr.w * 0.5), Math.round(py), shaftFr.w, shaftFr.h,
        );
      }
      ctx.drawImage(
        bgImg,
        baseFr.x, baseFr.y, baseFr.w, baseFr.h,
        Math.round(jambX - baseFr.w * 0.5), sy - baseFr.h + 2, baseFr.w, baseFr.h,
      );
      ctx.drawImage(
        bgImg,
        capFr.x, capFr.y, capFr.w, capFr.h,
        Math.round(jambX - capFr.w * 0.5), topY - capFr.h + 8, capFr.w, capFr.h,
      );
      ctx.restore();
    }
  }

  /**
   * Dynamic foreground platform pass: crumbling stone corbel slabs (plus falling
   * masonry chunks) and moving ferries / lifts / clockwork gear gondolas. Drawn
   * AFTER wall-recessed doorways, shrines, and wall sconce flames so moving
   * platforms always pass cleanly in front of doors and background architecture.
   */
  drawDynamicTiles(ctx, cam, assets, time = 0, stage3d = null) {
    if (!this.crumbles.length && !this.movers.length) return;
    const camX = cam.rx, camY = cam.ry;
    const tx0 = Math.max(0, Math.floor(camX / TILE) - 1);
    const tx1 = Math.min(this.cols - 1, Math.ceil((camX + W) / TILE) + 1);
    const bank = getTexBank(assets);
    const platName = assets.info(this.platformImg) ? this.platformImg : 'platform';
    const plat = assets.info(platName), pImg = assets.img(platName);
    const wood = platName === 'platform_wood';
    const platTex = bank ? bank.get(wood ? 'plat_wood' : 'plat_stone') : null;

    // 5. Gothic crumbling & falling stone corbel slabs (intact, fissured, shattering & reforming).
    if (this.crumbles.length) this.drawCrumbles3D(ctx, camX, camY, tx0, tx1, time, bank, assets);

    // 6. Moving platforms & orbiting clockwork gear gondolas.
    if (this.movers.length) this.drawMovers3D(ctx, camX, camY, pImg, plat, platTex, time, stage3d);
  }

  /** Carved stone retaining curb / coping rim for shallow reflecting basins & liquid channels. */
  drawLiquidRetainingCurb(ctx, x, yTop, h, isLeft, volcanic = false) {
    const rx = Math.round(x), ry = Math.round(yTop), rh = Math.max(8, Math.round(h));
    const w = 10;
    const base = volcanic ? '#2b2024' : '#3d4760';
    const mid = volcanic ? '#433136' : '#586686';
    const hi = volcanic ? '#6e5256' : '#8fa1c4';
    const mort = volcanic ? '#120a0d' : '#161b2a';
    // 3D receding top bevel behind coping stone
    ctx.fillStyle = volcanic ? '#38282c' : '#4a5672';
    ctx.fillRect(rx + (isLeft ? 1 : -1), ry - 2, w, 3);
    // Coping cap & ashlar block body
    ctx.fillStyle = mort;
    ctx.fillRect(rx - 1, ry, w + 2, rh);
    ctx.fillStyle = base;
    ctx.fillRect(rx, ry + 1, w, rh - 2);
    ctx.fillStyle = mid;
    ctx.fillRect(rx + 1, ry + 1, w - 2, Math.max(3, rh - 4));
    ctx.fillStyle = hi;
    ctx.fillRect(rx + 1, ry, w - 2, 2);
    ctx.fillRect(isLeft ? rx + w - 2 : rx + 1, ry + 1, 1, rh - 3);
    if (rh >= 14) {
      ctx.fillStyle = mort;
      ctx.fillRect(rx, ry + Math.floor(rh * 0.5), w, 1);
    }
  }

  /**
   * Real-time reflective & refractive WebGL water pass for play-plane canals and
   * reflecting basins. Runs AFTER 3D halls, tiles, candles, bosses, and the hunter
   * so the water reflects & refracts the live scene and responds to ripple wakes.
   */
  drawWaterSurfaces(ctx, cam, fx, ripples, themeKey, time = 0) {
    if (!this.waterRuns.length && !this.waterBasins.length) return;
    const camX = cam.rx, camY = cam.ry;
    const rects = [];
    for (let i = 0; i < this.waterRuns.length; i++) {
      const wr = this.waterRuns[i];
      const wx = wr.x0 * TILE, wy = wr.y * TILE + 6;
      const pw = (wr.x1 - wr.x0 + 1) * TILE, ph = wr.hTiles * TILE - 6;
      const sx = Math.round(wx - camX), sy = Math.round(wy - camY);
      if (sx + pw < -12 || sx > W + 12 || sy + ph < -8 || sy > H + 8) continue;
      rects.push({
        x: sx, y: sy, w: pw, h: Math.max(8, ph), alpha: null, deep: ph >= 36,
        basin: false,
        leftCurb: !this.isSolid(wr.x0 - 1, wr.y),
        rightCurb: !this.isSolid(wr.x1 + 1, wr.y),
      });
    }
    for (let i = 0; i < this.waterBasins.length; i++) {
      const b = this.waterBasins[i];
      const sx = Math.round(b.x - camX), sy = Math.round(b.y - camY);
      const pw = Math.round(b.w), ph = Math.max(8, Math.round(b.h));
      if (sx + pw < -14 || sx > W + 14 || sy + ph < -8 || sy > H + 8) continue;
      rects.push({
        x: sx, y: sy, w: pw, h: ph, alpha: b.alpha || null, deep: ph >= 28,
        basin: !!b.curbs,
        leftCurb: b.curbs !== false,
        rightCurb: b.curbs !== false,
      });
    }
    if (!rects.length) return;

    // Carve dark recessed stone basin beds BEFORE uploading scene for water refraction
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (!r.basin) continue;
      ctx.fillStyle = '#0a101c';
      ctx.fillRect(r.x - 1, r.y + 1, r.w + 2, r.h);
      ctx.fillStyle = '#182236';
      for (let bx = r.x + 2; bx < r.x + r.w - 4; bx += 16) {
        ctx.fillRect(bx, r.y + r.h - 3, 13, 2);
      }
    }

    const pal = themeKey === 'darkwood'
      ? { tint: [0.10, 0.56, 0.48], deep: [0.02, 0.12, 0.11], foam: [0.72, 0.98, 0.88], alpha: 0.82, glow: 'emerald' }
      : themeKey === 'skykeep'
        ? { tint: [0.34, 0.76, 0.98], deep: [0.08, 0.22, 0.42], foam: [0.92, 0.99, 1.0], alpha: 0.80, glow: 'cyan' }
        : (themeKey === 'ossuary' || themeKey === 'catacombs')
          ? { tint: [0.12, 0.46, 0.54], deep: [0.02, 0.08, 0.13], foam: [0.72, 0.92, 0.95], alpha: 0.80, glow: 'cyan' }
          : { tint: [0.12, 0.62, 0.82], deep: [0.02, 0.13, 0.22], foam: [0.80, 0.97, 1.0], alpha: 0.84, glow: 'cyan' };

    const glow = getGlowCanvas(pal.glow);
    if (fx && fx.enabled) {
      fx.uploadScene(ctx);
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        fx.waterPool(ctx, r, {
          camX, camY, upload: false, ripples,
          tint: pal.tint, deep: pal.deep, foam: pal.foam,
          alpha: r.alpha || pal.alpha,
        });
        if (glow && r.deep) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.14 + 0.04 * Math.sin(time * 2.2 + i);
          for (let gx = r.x + 36; gx < r.x + r.w - 16; gx += 84) {
            ctx.drawImage(glow, gx - 42, r.y - 20, 84, 44);
          }
          ctx.restore();
        }
      }
    } else {
      // Clean 2D fallback when WebGL is unavailable
      ctx.save();
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
        g.addColorStop(0, `rgba(${Math.round(pal.tint[0] * 255)}, ${Math.round(pal.tint[1] * 255)}, ${Math.round(pal.tint[2] * 255)}, 0.58)`);
        g.addColorStop(1, `rgba(${Math.round(pal.deep[0] * 255)}, ${Math.round(pal.deep[1] * 255)}, ${Math.round(pal.deep[2] * 255)}, 0.84)`);
        ctx.fillStyle = g;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.fillStyle = `rgba(${Math.round(pal.foam[0] * 255)}, ${Math.round(pal.foam[1] * 255)}, ${Math.round(pal.foam[2] * 255)}, 0.65)`;
        for (let bx = 0; bx < r.w; bx += 14) {
          const wv = Math.round(Math.sin(time * 3.6 + (r.x + camX + bx) * 0.07) * 1.5);
          ctx.fillRect(r.x + bx, r.y + Math.max(0, wv), 10, 2);
        }
      }
      ctx.restore();
    }

    // Carved stone basin coping rims & retaining curbs framing every reflecting pool
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (r.basin) {
        ctx.fillStyle = '#151a28';
        ctx.fillRect(r.x, r.y + r.h - 1, r.w, 2);
        ctx.fillStyle = 'rgba(145, 165, 204, 0.35)';
        ctx.fillRect(r.x, r.y + r.h + 1, r.w, 1);
      }
      const curbTop = r.y - 3;
      const curbH = r.basin ? r.h + 4 : r.h + 5;
      if (r.leftCurb) this.drawLiquidRetainingCurb(ctx, r.x - 8, curbTop, curbH, true, false);
      if (r.rightCurb) this.drawLiquidRetainingCurb(ctx, r.x + r.w - 2, curbTop, curbH, false, false);
    }
  }

  /** Extruded & texture-mapped 3D viaduct arches, soffits & bridge piers beneath open spans. */
  drawBridgeUnderstructure3D(ctx, camX, camY, br, bank) {
    if (!bank) return;
    const x0 = br.x0 * TILE, x1 = (br.x1 + 1) * TILE;
    const wyTop = (br.y + 1) * TILE - 4;
    const isElder = br.mat === T_DARKWOOD;
    const isWood = br.mat === T_FOREST || br.mat === T_SNOW;
    const isClock = br.mat === T_CLOCK;
    const stoneBody = br.mat === T_AQUEDUCT ? 'aqueduct_stone'
      : br.mat === T_COLISEUM ? 'travertine_stone'
        : (br.mat === T_BALLROOM || br.mat === T_SKYKEEP) ? 'marble'
          : br.mat === T_CATACOMB ? 'crypt_stone' : 'wall';
    const stoneSoffit = br.mat === T_AQUEDUCT ? 'aqueduct_stone'
      : br.mat === T_COLISEUM ? 'travertine_stone'
        : (br.mat === T_BALLROOM || br.mat === T_SKYKEEP) ? 'marble'
          : br.mat === T_CATACOMB ? 'crypt_stone' : 'stone_trim';
    const bodyTex = bank.get(
      isElder ? 'elder_bark' : isClock ? 'iron_truss' : isWood ? 'wood_plank' : stoneBody,
    );
    const soffitTex = bank.get(
      isElder ? 'elder_bark_h' : isClock ? 'iron_rivet' : isWood ? 'wood_plank' : stoneSoffit,
    );
    const trimTex = bank.get(isElder ? 'moss_stone' : isClock ? 'brass_rim' : isWood ? 'iron_rivet' : 'stone_trim');

    // Underside cornice soffit running along z = 2..38 (subdivided per 96px bay)
    const soffitShade = shadeOverlay32([0, 0.8, -0.5], DECK_FOG, 0.36, 0.85);
    for (let sx = x0; sx < x1; sx += 96) {
      const ex = Math.min(x1, sx + 96);
      const fL = project3D(sx, wyTop, 2, camX, camY);
      const fR = project3D(ex + (ex < x1 ? 0.5 : 0), wyTop, 2, camX, camY);
      const bR = project3D(ex + (ex < x1 ? 0.5 : 0), wyTop + 8, 38, camX, camY);
      const bL = project3D(sx, wyTop + 8, 38, camX, camY);
      texQuad(ctx, soffitTex, fL, fR, bR, bL, sx, 0, ex, 0, ex, 32, sx, 32, soffitShade);
    }

    // Repeat 4-tile (128px) vaulted viaduct bays with texture-mapped 3D arches & piers
    const totalTiles = br.x1 - br.x0 + 1;
    const bayTiles = totalTiles >= 4 ? 4 : Math.max(2, totalTiles);
    for (let tx = br.x0; tx <= br.x1; tx += bayTiles) {
      const bx0 = tx * TILE;
      const bx1 = Math.min((br.x1 + 1) * TILE, (tx + bayTiles) * TILE);
      const span = bx1 - bx0;
      if (bx1 - camX < -64 || bx0 - camX > W + 64) continue;

      if (totalTiles >= 5 && tx > br.x0) {
        const pw = 20, px0 = bx0 - pw / 2, ph = (this.rows - br.y) * TILE + 40;
        const pfTL = project3D(px0, wyTop, 10, camX, camY);
        const pfTR = project3D(px0 + pw, wyTop, 10, camX, camY);
        const pfBL = project3D(px0 - 4, wyTop + ph, 10, camX, camY);
        const pfBR = project3D(px0 + pw + 4, wyTop + ph, 10, camX, camY);
        const pbTL = project3D(px0, wyTop, 42, camX, camY);
        const pbTR = project3D(px0 + pw, wyTop, 42, camX, camY);
        const pbBL = project3D(px0 - 4, wyTop + ph, 42, camX, camY);
        const pbBR = project3D(px0 + pw + 4, wyTop + ph, 42, camX, camY);

        if (pbTL.x < pfTL.x - 0.4) {
          texQuad(ctx, bodyTex, pbTL, pfTL, pfBL, pbBL,
            0, wyTop, 32, wyTop, 32, wyTop + ph, 0, wyTop + ph,
            shadeOverlay32([-1, 0, -0.2], DECK_FOG, 0.42));
        } else if (pbTR.x > pfTR.x + 0.4) {
          texQuad(ctx, bodyTex, pfTR, pbTR, pbBR, pfBR,
            0, wyTop, 32, wyTop, 32, wyTop + ph, 0, wyTop + ph,
            shadeOverlay32([1, 0, -0.2], DECK_FOG, 0.42));
        }
        texQuad(ctx, bodyTex, pfTL, pfTR, pfBR, pfBL,
          px0, wyTop, px0 + pw, wyTop, px0 + pw + 4, wyTop + ph, px0 - 4, wyTop + ph,
          shadeOverlay32([0, -0.1, -1], DECK_FOG, 0.28));

        // Texture-mapped pier capital collar
        const capW = pfTR.x - pfTL.x + 6;
        texQuad(ctx, trimTex,
          { x: pfTL.x - 3, y: pfTL.y }, { x: pfTL.x - 3 + capW, y: pfTL.y },
          { x: pfTL.x - 3 + capW, y: pfTL.y + 6 }, { x: pfTL.x - 3, y: pfTL.y + 6 },
          0, 0, 32, 0, 32, 8, 0, 8,
          shadeOverlay32([0, -0.3, -0.9], DECK_FOG, 0.20));
      }

      if (span >= 64) {
        const segs = 6;
        const archRise = Math.min(34, span * 0.26);
        const ySpring = wyTop + archRise + 4;
        const spandrelShade = shadeOverlay32([0, -0.1, -1], DECK_FOG, 0.26);
        let arcU = 0;
        for (let i = 0; i < segs; i++) {
          const t0 = i / segs, t1 = (i + 1) / segs;
          const ax0 = bx0 + span * t0, ax1 = bx0 + span * t1;
          const ay0 = ySpring - Math.sin(t0 * Math.PI) * archRise;
          const ay1 = ySpring - Math.sin(t1 * Math.PI) * archRise;
          const segLen = Math.hypot(ax1 - ax0, ay1 - ay0);

          const af0 = project3D(ax0, ay0, 6, camX, camY);
          const af1 = project3D(ax1, ay1, 6, camX, camY);
          const ab1 = project3D(ax1, ay1, 40, camX, camY);
          const ab0 = project3D(ax0, ay0, 40, camX, camY);
          const nx = Math.cos(((t0 + t1) * 0.5) * Math.PI) * 0.65;
          texQuad(ctx, soffitTex, af0, af1, ab1, ab0,
            arcU, 0, arcU + segLen, 0, arcU + segLen, 34, arcU, 34,
            shadeOverlay32([nx, 0.75, -0.2], DECK_FOG, 0.44));
          arcU += segLen;
        }
        for (let i = 0; i < segs; i++) {
          const t0 = i / segs, t1 = (i + 1) / segs;
          const ax0 = bx0 + span * t0, ax1 = bx0 + span * t1;
          const ay0 = ySpring - Math.sin(t0 * Math.PI) * archRise;
          const ay1 = ySpring - Math.sin(t1 * Math.PI) * archRise;
          const padX = i < segs - 1 ? 0.5 : 0;
          const af0 = project3D(ax0, ay0, 6, camX, camY);
          const st0 = project3D(ax0, wyTop, 6, camX, camY);
          const st1 = project3D(ax1 + padX, wyTop, 6, camX, camY);
          const sf1 = project3D(ax1 + padX, ay1, 6, camX, camY);
          texQuad(ctx, bodyTex, st0, st1, sf1, af0,
            ax0, wyTop, ax1, wyTop, ax1, ay1, ax0, ay0, spandrelShade);
        }
      }
    }
  }

  /** Receding texture-mapped 3D walkable deck behind the crisp `z = 0` front lip. */
  drawTopDeck3D(ctx, camX, camY, wx, wy, w, zBack, topTex, darkScale = 0.68) {
    if (!topTex) return;
    const fY = wy - camY;
    const bRef = project3D(wx, wy, zBack, camX, camY);
    if (fY <= bRef.y + 0.8) return;

    const shade = shadeOverlay32([0, -0.85, -0.35], DECK_FOG, 0.34, darkScale);
    texStripZ(ctx, topTex, camX, camY, wx, wx + w, wy, zBack, 0, 0, 32, shade, 2, FOCAL, EYE_X, EYE_Y);

    const bL = project3D(wx, wy, zBack, camX, camY);
    const bR = project3D(wx + w, wy, zBack, camX, camY);
    ctx.fillStyle = 'rgba(220, 225, 245, 0.10)';
    ctx.fillRect(Math.round(bL.x), Math.round(bL.y), Math.max(1, Math.round(bR.x - bL.x)), 1);
  }

  /** Texture-mapped 3D ceiling soffit on the underside of elevated slabs. */
  drawCeilingSoffit3D(ctx, camX, camY, wx, wyBot, w, zBack, soffitTex) {
    if (!soffitTex) return;
    const fY = wyBot - camY;
    const bL = project3D(wx, wyBot, zBack, camX, camY);
    if (bL.y <= fY + 0.8) return;
    const shade = shadeOverlay32([0, 1, -0.2], [8, 7, 18], 0.52, 0.60);
    texStripZ(ctx, soffitTex, camX, camY, wx, wx + w, wyBot, 0, zBack, 0, 32, shade, 1, FOCAL, EYE_X, EYE_Y);
  }

  /** Texture-mapped 3D perspective vertical side return on exposed step/pit walls. */
  sideFace3D(ctx, camX, camY, wxEdge, wy, dir, sideTex, isSurface, isSnow = false, joinBelow = false) {
    if (!sideTex) return;
    const h = TILE + (joinBelow ? 0.6 : 0);
    const fTop = { x: wxEdge - camX, y: wy - camY };
    const fBot = { x: wxEdge - camX, y: wy + h - camY };
    const bTop = project3D(wxEdge, wy, SIDE_Z, camX, camY);
    const bBot = project3D(wxEdge, wy + h, SIDE_Z, camX, camY);

    const visible = dir < 0 ? (bTop.x < fTop.x - 0.6) : (bTop.x > fTop.x + 0.6);
    if (!visible) return;

    const nrm = dir < 0 ? [-0.92, -0.1, -0.35] : [0.92, -0.1, -0.35];
    const shade = shadeOverlay32(nrm, DECK_FOG, 0.30, isSnow ? 0.86 : 0.92);
    if (dir < 0) {
      texQuad(ctx, sideTex, bTop, fTop, fBot, bBot, 0, wy, SIDE_Z, wy, SIDE_Z, wy + TILE, 0, wy + TILE, shade);
    } else {
      texQuad(ctx, sideTex, fTop, bTop, bBot, fBot, 0, wy, SIDE_Z, wy, SIDE_Z, wy + TILE, 0, wy + TILE, shade);
    }

    if (isSurface) {
      ctx.strokeStyle = isSnow ? 'rgba(215, 232, 255, 0.36)' : 'rgba(232, 226, 200, 0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(fTop.x, fTop.y); ctx.lineTo(bTop.x, bTop.y);
      ctx.stroke();
    }
  }

  /** Texture-mapped 3D side return for thin platforms, crumbling slabs & moving lifts. */
  drawSlabSide3D(ctx, camX, camY, wxEdge, wy, h, zBack, dir, slabTex) {
    if (!slabTex) return;
    const fTop = { x: wxEdge - camX, y: wy - camY - 2 };
    const fBot = { x: wxEdge - camX, y: wy + h - camY - 2 };
    const bTop = project3D(wxEdge, wy - 2, zBack, camX, camY);
    const bBot = project3D(wxEdge, wy + h - 2, zBack, camX, camY);
    const visible = dir < 0 ? (bTop.x < fTop.x - 0.6) : (bTop.x > fTop.x + 0.6);
    if (!visible) return;
    const shade = shadeOverlay32([dir, 0, -0.3], DECK_FOG, 0.34, 0.88);
    if (dir < 0) {
      texQuad(ctx, slabTex, bTop, fTop, fBot, bBot, 0, 0, zBack, 0, zBack, h, 0, h, shade);
    } else {
      texQuad(ctx, slabTex, fTop, bTop, bBot, fBot, 0, 0, zBack, 0, zBack, h, 0, h, shade);
    }
  }

  /** Renders Gothic crumbling & falling stone corbel slabs (intact, fissured, plummeting, or reforming). */
  drawCrumbles3D(ctx, camX, camY, tx0, tx1, time, bank, assets = null) {
    const hasSheet = !!(
      assets && assets.frame && assets.frame('falling_tiles', 'intact') &&
      assets.img && assets.img('falling_tiles')
    );
    const sheetImg = hasSheet ? assets.img('falling_tiles') : null;
    const idleTex = bank ? bank.get('crumble_stone') : null;
    const shakeTex = bank ? bank.get('crumble_shake') : null;

    for (const c of this.crumbles) {
      if (c.tx < tx0 - 1 || c.tx > tx1 + 1) continue;
      const wx = c.tx * TILE, wy = c.ty * TILE;
      if (c.state === 'gone') {
        // Tumbling carved masonry chunks falling into the abyss
        if (hasSheet && c.chunks) {
          for (const ch of c.chunks) {
            const alpha = Math.max(0, Math.min(1, 1 - ch.dy / 168));
            if (alpha <= 0.02) continue;
            const fr = assets.frame('falling_tiles', ch.frame);
            if (!fr) continue;
            const cx = Math.round(wx - camX + 16 + ch.dx);
            const cy = Math.round(wy - camY + 14 + ch.dy);
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(cx, cy);
            ctx.rotate(ch.rot);
            ctx.scale(ch.scale, ch.scale);
            ctx.drawImage(sheetImg, fr.x, fr.y, fr.w, fr.h, Math.round(-fr.w * 0.5), Math.round(-fr.h * 0.5), fr.w, fr.h);
            ctx.restore();
          }
        }
        // Spectral stone reform materialisation right before becoming solid again
        if (c.timer < 0.65) {
          const k = 1 - c.timer / 0.65;
          if (hasSheet) {
            const riseY = Math.round((1 - k) * 9);
            assets.draw(ctx, 'falling_tiles', 'intact', Math.round(wx - camX + 16), Math.round(wy - camY + 34 + riseY), false, k * 0.72);
          }
          const a = k * 0.45;
          ctx.strokeStyle = `rgba(180, 210, 255, ${a.toFixed(2)})`;
          ctx.lineWidth = 1;
          ctx.strokeRect(Math.round(wx - camX + 1), Math.round(wy - camY), TILE - 2, 16);
        }
        continue;
      }

      const shaking = c.state === 'shake';
      const lateShake = shaking && c.timer <= 0.24;
      const jx = shaking ? Math.round(Math.sin(time * (lateShake ? 68 : 54) + c.tx * 3) * (lateShake ? 2.5 : 1.6)) : 0;
      const jy = shaking ? Math.round(Math.cos(time * 47 + c.tx) * 1) + (lateShake ? 2 : 0) : 0;
      const x = Math.round(wx - camX + jx);
      const y = Math.round(wy - camY + jy);

      if (hasSheet) {
        const frameName = !shaking ? 'intact' : (lateShake ? 'breaking' : 'cracked');
        if (shaking) {
          ctx.fillStyle = lateShake ? 'rgba(255, 118, 52, 0.26)' : 'rgba(255, 150, 72, 0.16)';
          ctx.fillRect(x - 1, y - 4, TILE + 2, 26);
        }
        assets.draw(ctx, 'falling_tiles', frameName, x + 16, y + 34);
      } else {
        const slabTex = shaking ? shakeTex : idleTex;
        if (wy > camY + EYE_Y + 4) {
          this.drawTopDeck3D(ctx, camX, camY, wx + jx, wy + jy, TILE, 30, slabTex, 0.72);
        }
        this.drawSlabSide3D(ctx, camX, camY, wx + jx, wy + jy, 18, 30, -1, slabTex);
        this.drawSlabSide3D(ctx, camX, camY, wx + TILE + jx, wy + jy, 18, 30, 1, slabTex);
        if (slabTex) {
          texQuad(
            ctx, slabTex,
            { x, y }, { x: x + TILE, y }, { x: x + TILE, y: y + 18 }, { x, y: y + 18 },
            wx, 0, wx + TILE, 0, wx + TILE, 32, wx, 32, null,
          );
        }
      }
    }
  }

  /** Renders moving 2.5D ferries (with 3D guide chains) & orbiting gear gondolas. */
  drawMovers3D(ctx, camX, camY, pImg, plat, platTex, time, stage3d) {
    const drawnHubs = new Set();
    for (const m of this.movers) {
      if (m.kind === 'orbit') {
        const hubKey = `${m.cx},${m.cy}`;
        if (!drawnHubs.has(hubKey)) {
          drawnHubs.add(hubKey);
          if (stage3d && !m.hideHubGear) {
            stage3d.drawGear3D(ctx, camX, camY, m.cx, m.cy, 34, {
              r: Math.max(36, m.r * 0.78), teeth: 14, thick: 16, speed: m.speed, brass: true,
            }, time);
          }
        }
        const pHub = project3D(m.cx, m.cy, 26, camX, camY);
        const pGond = project3D(m.x, m.y + 8, 10, camX, camY);
        if (Math.max(pHub.x, pGond.x) >= -40 && Math.min(pHub.x, pGond.x) <= W + 40) {
          ctx.strokeStyle = '#1f2336'; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.moveTo(pHub.x, pHub.y); ctx.lineTo(pGond.x, pGond.y); ctx.stroke();
          ctx.strokeStyle = '#7e8ba8'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(pHub.x, pHub.y - 1); ctx.lineTo(pGond.x, pGond.y - 1); ctx.stroke();
        }
      } else {
        const a = project3D(m.x0, m.y0 + 9, 22, camX, camY);
        const b = project3D(m.x1, m.y1 + 9, 22, camX, camY);
        if (Math.max(a.x, b.x) >= -40 && Math.min(a.x, b.x) <= W + 40) {
          ctx.save();
          ctx.strokeStyle = '#1d2032'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          ctx.strokeStyle = '#626d8a'; ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          ctx.restore();
          for (const ep of [a, b]) {
            ctx.fillStyle = '#25293e';
            ctx.beginPath(); ctx.arc(ep.x, ep.y, 5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#9aa8c7';
            ctx.beginPath(); ctx.arc(ep.x, ep.y, 2, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
    }

    for (const m of this.movers) {
      const wx0 = m.left, wy = m.y;
      if (wx0 + m.w - camX < -48 || wx0 - camX > W + 48) continue;
      if (wy > camY + EYE_Y + 4) {
        this.drawTopDeck3D(ctx, camX, camY, wx0, wy, m.w, 28, platTex, 0.72);
      } else if (wy + 18 < camY + EYE_Y - 4) {
        this.drawCeilingSoffit3D(ctx, camX, camY, wx0, wy + 18, m.w, 28, platTex);
      }
      this.drawSlabSide3D(ctx, camX, camY, wx0, wy, 18, 28, -1, platTex);
      this.drawSlabSide3D(ctx, camX, camY, wx0 + m.w, wy, 18, 28, 1, platTex);

      const tiles = Math.max(2, Math.round(m.w / TILE));
      const y = Math.round(wy - camY - 2);
      for (let i = 0; i < tiles; i++) {
        const x = Math.round(wx0 - camX + i * TILE);
        const sx = i === 0 ? 0 : (i === tiles - 1 ? plat.w - TILE : TILE);
        ctx.drawImage(pImg, sx, 0, TILE, plat.h, x, y, TILE, plat.h);
      }
      const cx = Math.round(m.x - camX), cy = Math.round(wy - camY);
      ctx.fillStyle = '#d8b46a';
      ctx.fillRect(Math.round(wx0 - camX + 3), cy + 2, 3, 3);
      ctx.fillRect(Math.round(wx0 + m.w - camX - 6), cy + 2, 3, 3);
      ctx.fillStyle = '#25283c';
      ctx.fillRect(cx - 8, cy + 14, 16, 5);
    }
  }

  /**
   * Renders 2.5D/3D Gothic staircases: back-plane balustrade & newel posts,
   * solid masonry spandrels or open timber/iron stringer carriages, 3D riser
   * side-returns, perspective receding treads, and crisp `z = 0` step nosings.
   */
  drawStairs3D(ctx, camX, camY, tx0, tx1, assets, bank, pImg, plat, platTex, wood) {
    const viewX0 = tx0 * TILE - 48;
    const viewX1 = (tx1 + 1) * TILE + 48;

    for (let si = 0; si < this.stairs.length; si++) {
      const s = this.stairs[si];
      if (s.maxX < viewX0 || s.minX > viewX1) continue;

      const isPass = s.passThrough;
      const zDepth = isPass ? 26 : DECK_Z;
      const topTex = isPass ? platTex : (bank ? bank.matTop(s.mat) : null);
      const sideTex = isPass
        ? (bank ? bank.get(wood ? 'wood_plank' : 'iron_rivet') : null)
        : (bank ? bank.matSide(s.mat) : null);
      const isSnow = !isPass && s.mat === T_SNOW;
      const spanX = s.x1 - s.x0;
      const risePx = s.botY - s.topY;
      const stepW = spanX / s.steps;
      const stepH = risePx / s.steps;

      // 1. Supporting diagonal stringer carriage (passThrough) OR solid terrain spandrel (!passThrough)
      if (isPass) {
        const beamDrop = 15;
        const fA0 = { x: s.x0 - camX, y: s.y0 + 3 - camY };
        const fB0 = { x: s.x1 - camX, y: s.y1 + 3 - camY };
        const fA1 = { x: s.x0 - camX, y: s.y0 + beamDrop - camY };
        const fB1 = { x: s.x1 - camX, y: s.y1 + beamDrop - camY };
        const bA1 = project3D(s.x0, s.y0 + beamDrop, zDepth, camX, camY);
        const bB1 = project3D(s.x1, s.y1 + beamDrop, zDepth, camX, camY);

        // 3D underside soffit of the diagonal stringer when above eye height
        if ((bA1.y > fA1.y + 0.5 || bB1.y > fB1.y + 0.5) && sideTex) {
          texQuad(ctx, sideTex, fA1, fB1, bB1, bA1,
            0, 0, spanX, 0, spanX, zDepth, 0, zDepth,
            shadeOverlay32([0, 0.9, -0.3], DECK_FOG, 0.46, 0.62));
        }
        if (sideTex) {
          texQuad(ctx, sideTex, fA0, fB0, fB1, fA1,
            0, 0, spanX, 0, spanX, 16, 0, 16,
            shadeOverlay32([0, 0.2, -0.95], DECK_FOG, 0.24, 0.86));
        } else {
          ctx.fillStyle = wood ? '#3d2a1b' : '#262b3f';
          ctx.beginPath();
          ctx.moveTo(fA0.x, fA0.y); ctx.lineTo(fB0.x, fB0.y);
          ctx.lineTo(fB1.x, fB1.y); ctx.lineTo(fA1.x, fA1.y);
          ctx.closePath(); ctx.fill();
        }
        ctx.save();
        ctx.strokeStyle = '#12101c';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(fA1.x, fA1.y); ctx.lineTo(fB1.x, fB1.y); ctx.stroke();
        // Rivet / peg studs along the stringer carriage
        ctx.fillStyle = wood ? '#caa06a' : '#9aa8c7';
        const studs = Math.max(2, Math.round(spanX / 32));
        for (let k = 1; k < studs; k++) {
          const u = k / studs;
          const rx = Math.round(fA0.x + (fB0.x - fA0.x) * u);
          const ry = Math.round(fA0.y + (fB0.y - fA0.y) * u + 5);
          ctx.fillRect(rx - 1, ry - 1, 2, 2);
        }
        ctx.restore();
      } else {
        // Solid masonry / earth spandrel filling cleanly from each step tread down to `fillRow * TILE`
        let stripName = MATERIAL_STRIP[s.mat] || 'floor';
        const info = assets.info(stripName);
        const img = assets.img(stripName);
        const cStart = Math.min(s.col0, s.col1);
        for (let i = 0; i < s.steps; i++) {
          const sx0 = s.x0 + i * stepW;
          const sx1 = sx0 + stepW;
          const tyStep = s.ascDir > 0
            ? s.botY - ((i + 1) / s.steps) * risePx
            : s.topY + (i / s.steps) * risePx;
          const colIdx = Math.max(0, Math.min(s.fillRows.length - 1, Math.floor((sx0 + stepW * 0.5) / TILE) - cStart));
          const fillRow = s.fillRows.length ? s.fillRows[colIdx] : Math.ceil(s.botY / TILE);
          const baseY = Math.min(this.rows * TILE, (fillRow + 1) * TILE);
          const x = Math.round(sx0 - camX);
          const w = Math.max(1, Math.round(sx1 - camX) - x);
          const yTop = Math.round(tyStep - camY);
          const fillH = Math.max(stepH + 2, Math.round(baseY - camY) - yTop);
          if (info && img) {
            const srcX = Math.floor(((sx0 % info.w) + info.w) % info.w);
            const srcW = Math.min(w, info.w - srcX);
            let drawnY = 0;
            while (drawnY < fillH) {
              const chunkH = Math.min(TILE, fillH - drawnY);
              const depthBand = drawnY === 0 ? 1 : 2;
              ctx.drawImage(
                img,
                srcX, info.overhang + TILE * depthBand, Math.max(1, srcW), chunkH,
                x, yTop + drawnY, w, chunkH,
              );
              drawnY += chunkH;
            }
          } else {
            ctx.fillStyle = '#242234';
            ctx.fillRect(x, yTop, w, fillH);
          }
        }
      }

      // 3. Individual 3D receding treads, downhill riser returns & crisp z = 0 step nosings
      const stripName = !isPass ? (MATERIAL_STRIP[s.mat] || 'floor') : null;
      const mInfo = stripName ? assets.info(stripName) : null;
      const mImg = stripName ? assets.img(stripName) : null;
      const riserDir = -s.ascDir; // downhill normal direction (-1 left-facing riser, +1 right-facing riser)
      const riserShade = sideTex
        ? shadeOverlay32([riserDir * 0.9, 0.1, -0.4], DECK_FOG, 0.34, isSnow ? 0.86 : 0.88)
        : null;

      for (let i = 0; i < s.steps; i++) {
        const sx0 = s.x0 + i * stepW;
        const sx1 = sx0 + stepW;
        const tyStep = s.ascDir > 0
          ? s.botY - ((i + 1) / s.steps) * risePx
          : s.topY + (i / s.steps) * risePx;

        // 3a. 3D downhill vertical riser side-return
        const rxEdge = s.ascDir > 0 ? sx0 : sx1;
        if (sideTex) {
          const rfTop = { x: rxEdge - camX, y: tyStep - camY };
          const rfBot = { x: rxEdge - camX, y: tyStep + stepH + 1 - camY };
          const rbTop = project3D(rxEdge, tyStep, zDepth, camX, camY);
          const rbBot = project3D(rxEdge, tyStep + stepH + 1, zDepth, camX, camY);
          const vis = riserDir < 0 ? (rbTop.x < rfTop.x - 0.5) : (rbTop.x > rfTop.x + 0.5);
          if (vis) {
            if (riserDir < 0) {
              texQuad(ctx, sideTex, rbTop, rfTop, rfBot, rbBot, 0, 0, zDepth, 0, zDepth, stepH, 0, stepH, riserShade);
            } else {
              texQuad(ctx, sideTex, rfTop, rbTop, rbBot, rfBot, 0, 0, zDepth, 0, zDepth, stepH, 0, stepH, riserShade);
            }
          }
        }

        // 3b. 3D receding horizontal tread top
        if (tyStep > camY + EYE_Y + 3 && topTex) {
          this.drawTopDeck3D(ctx, camX, camY, sx0, tyStep, stepW + 0.4, zDepth, topTex, isSnow ? 0.56 : 0.72);
        }

        // 3c. Crisp z = 0 front tread nosing cap & riser shadow line
        const x = Math.round(sx0 - camX);
        const w = Math.max(1, Math.round(sx1 - camX) - x);
        const y = Math.round(tyStep - camY);
        if (isPass) {
          const capH = Math.min(8, plat ? plat.h : 8);
          if (pImg && plat) {
            const srcX = TILE + (Math.abs(Math.floor(sx0)) % Math.max(1, TILE));
            ctx.drawImage(pImg, Math.min(plat.w - w, srcX), 0, Math.min(w, plat.w), capH, x, y - 1, w, capH);
          } else {
            ctx.fillStyle = wood ? '#785638' : '#58627e';
            ctx.fillRect(x, y, w, 6);
          }
          ctx.fillStyle = wood ? 'rgba(235, 198, 142, 0.35)' : 'rgba(220, 230, 255, 0.30)';
          ctx.fillRect(x, y - 1, w, 1);
        } else if (mInfo && mImg) {
          const srcX = Math.floor(((sx0 % mInfo.w) + mInfo.w) % mInfo.w);
          const capH = mInfo.overhang + Math.min(10, Math.ceil(stepH) + 2);
          ctx.drawImage(
            mImg,
            srcX, 0, Math.min(w, mInfo.w - srcX), capH,
            x, y - mInfo.overhang, w, capH,
          );
          ctx.fillStyle = isSnow ? 'rgba(235, 245, 255, 0.32)' : 'rgba(235, 228, 205, 0.24)';
          ctx.fillRect(x, y, w, 1);
          // Crisp riser shadow line on downhill edge so individual steps always read clearly
          ctx.fillStyle = 'rgba(6, 5, 16, 0.46)';
          ctx.fillRect(s.ascDir > 0 ? x : (x + w - 1), y, 1, Math.ceil(stepH) + 1);
        }
      }
    }
  }

  /**
   * Grounds 2D sprites onto the 3D floor by casting soft dark contact ellipses
   * on the nearest standable surface directly below (also aids jump accuracy!).
   */
  drawContactShadows(ctx, cam, player, enemies, candles, ally = null) {
    const camX = cam.rx, camY = cam.ry;
    const cast = (wx, wy, baseRx, alpha = 0.42, onStair = null) => {
      if (wx - camX < -40 || wx - camX > W + 40) return;
      const groundY = onStair ? this.stairY(onStair, wx) : this.findDropSurfaceY(wx, wy, 108);
      if (groundY == null) return;
      const drop = Math.max(0, groundY - wy);
      const k = 1 - drop / 112;
      if (k <= 0.05) return;
      const rx = Math.max(4, baseRx * (0.55 + 0.45 * k));
      const ry = Math.max(2, rx * 0.26);
      ctx.fillStyle = `rgba(3, 2, 10, ${(alpha * k).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(Math.round(wx - camX), Math.round(groundY - camY + 1), rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    };

    ctx.save();
    if (player && player.alive) cast(player.x, player.y, 13, 0.48, player.onStair);
    if (ally && ally.alive) cast(ally.x, ally.y, 13, 0.44, ally.onStair);
    for (const e of enemies) {
      if (!e.alive || e.flies) continue;
      cast(e.x, e.y, Math.min(22, Math.max(10, e.w * 0.55)), 0.40, e.onStair);
    }
    for (const c of candles) {
      if (!c.dead) cast(c.x, c.y, 8, 0.30, null);
    }
    ctx.restore();
  }

  findDropSurfaceY(wx, wy, maxDrop) {
    let best = Infinity;
    for (const m of this.movers) {
      if (wx >= m.left && wx <= m.right && m.y >= wy - 2 && m.y - wy <= maxDrop) {
        if (m.y < best) best = m.y;
      }
    }
    for (let i = 0; i < this.stairs.length; i++) {
      const s = this.stairs[i];
      if (s.passThrough) continue;
      if (wx >= s.minX && wx <= s.maxX) {
        const sy = this.stairY(s, wx);
        if (sy >= wy - 2 && sy - wy <= maxDrop && sy < best) best = sy;
      }
    }
    const tx = Math.floor(wx / TILE);
    const tyStart = Math.max(0, Math.floor((wy - 2) / TILE));
    const tyEnd = Math.min(this.rows - 1, Math.floor((wy + maxDrop) / TILE));
    for (let ty = tyStart; ty <= tyEnd; ty++) {
      if (this.isSpike(tx, ty)) break;
      if (this.isStandable(tx, ty) && !this.isSpike(tx, ty - 1)) {
        const sy = ty * TILE;
        if (sy >= wy - 2 && sy < best) { best = sy; break; }
      }
    }
    return best < Infinity ? best : null;
  }
}

function evalLinearMover(x0, y0, x1, y1, period, phase, dwell, time) {
  const u = mod(time + phase, period) / period; // 0..1
  const half = u < 0.5 ? u * 2 : (1 - u) * 2;   // 0..1..0
  const t = Math.max(0, Math.min(1, (half - dwell) / Math.max(0.01, 1 - dwell * 2)));
  const eased = 0.5 - 0.5 * Math.cos(t * Math.PI);
  return { x: x0 + (x1 - x0) * eased, y: y0 + (y1 - y0) * eased };
}

function makeMover(cfg) {
  const w = (cfg.tiles || 3) * TILE;
  if (cfg.kind === 'orbit') {
    const cx = cfg.cx, cy = cfg.cy, r = cfg.r || 72;
    const phase = cfg.phase || 0;
    const x = cx + Math.cos(phase) * r, y = cy + Math.sin(phase) * r;
    return {
      kind: 'orbit', cx, cy, r, speed: cfg.speed || 0.65, phase, angle: phase,
      hideHubGear: !!cfg.hideHubGear,
      w, x, y, prevX: x, prevY: y, dx: 0, dy: 0, left: x - w / 2, right: x + w / 2,
    };
  }
  const x0 = cfg.x0, y0 = cfg.y0, x1 = cfg.x1, y1 = cfg.y1;
  const period = cfg.period || 4.8, phase = cfg.phase || 0, dwell = cfg.dwell == null ? 0.08 : cfg.dwell;
  const init = evalLinearMover(x0, y0, x1, y1, period, phase, dwell, 0);
  return {
    kind: 'linear', x0, y0, x1, y1, cx: (x0 + x1) * 0.5,
    period, phase, dwell,
    w, x: init.x, y: init.y, prevX: init.x, prevY: init.y, dx: 0, dy: 0,
    left: init.x - w / 2, right: init.x + w / 2,
  };
}

/** Decor frames that hang on the far wall rather than standing on the floor. */
const WALL_DECOR = new Set(['window', 'banner', 'chain', 'torch', 'wreath', 'rose', 'hunter', 'moon']);

function hash2(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

function mod(a, n) { return ((a % n) + n) % n; }

/** Additive flickering glow using a cached radial-gradient offscreen sprite. */
export function drawFlameGlow(ctx, x, y, t, radius = 24, strength = 0.6, kind = 'flame') {
  const glow = getGlowCanvas(kind);
  const flick = 0.85 + 0.15 * Math.sin(t * 17.3) * Math.sin(t * 7.1 + 1.3);
  const r = radius * flick;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (glow) {
    ctx.globalAlpha = Math.min(1, 0.68 * strength);
    ctx.drawImage(glow, x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
}
