// Stage builder: composes a level from prefab segments with a theme, and
// records candles, enemies, spawners, decor and the boss arena as it goes.
// Coordinates are tiles; `row` is the current walking surface row.

import {
  TILE, T_GROUND, T_STONE, T_CATACOMB, T_CLOCK, T_BLOCK, T_SPIKES,
} from '../engine/constants.js';

export const THEMES = {
  graveyard: { outdoor: true, layers: 'outdoor', material: T_GROUND, wall: 'wall', wallParallax: 1, dark: 0.42, music: 'stage', bg: '#0b0a14', decor: 'graveyard', accent: '#9ad17a' },
  ramparts: { outdoor: true, layers: 'ramparts', material: T_STONE, wall: 'wall', wallParallax: 1, dark: 0.42, music: 'stage', bg: '#0b0a14', decor: 'ramparts', accent: '#8a9ab5' },
  catacombs: { outdoor: false, layers: null, material: T_CATACOMB, wall: 'catacombwall', wallParallax: 0.6, dark: 0.5, music: 'catacombs', bg: '#050408', decor: 'crypt', accent: '#c9b58a' },
  ossuary: { outdoor: false, layers: null, material: T_CATACOMB, wall: 'catacombwall', wallParallax: 0.6, dark: 0.62, music: 'catacombs', bg: '#040306', decor: 'crypt', accent: '#b7a9c9' },
  clocktower: { outdoor: false, layers: null, material: T_CLOCK, wall: 'clockwall', wallParallax: 0.5, dark: 0.42, music: 'tower', bg: '#06050a', decor: 'clockwork', accent: '#d9a44a' },
  throne: { outdoor: false, layers: null, material: T_STONE, wall: 'wall', wallParallax: 0.7, dark: 0.3, music: 'stage', bg: '#0a0710', decor: 'castle', accent: '#e23c3c' },
};

const px = (tx) => tx * TILE + TILE / 2;
const py = (row) => row * TILE;

/** Small deterministic PRNG so stage decoration is stable between runs. */
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class StageBuilder {
  constructor({ id, name, subtitle = '', theme, rows = 14, startRow = 11, seed = 1 }) {
    this.id = id; this.name = name; this.subtitle = subtitle;
    this.themeKey = theme; this.theme = THEMES[theme];
    this.rows = rows; this.row = startRow; this.startRow = startRow; this.x = 0;
    this.mat = this.theme.material;
    this.rng = mulberry32(seed * 7919 + 13);
    this.ops = []; this.candles = []; this.enemies = []; this.spawners = [];
    this.decor = []; this.blockDrops = {}; this.checkpoints = [px(2)];
    this.boss = null;
  }

  // ------------------------------------------------------------ helpers
  op(fn) { this.ops.push(fn); return this; }
  chance(p) { return this.rng() < p; }
  pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }
  candle(tx, row, drop = null) { this.candles.push([tx, row, drop]); }
  deco(sheet, frame, tx, row, dx = 0, dy = 0) { this.decor.push({ sheet, frame, x: px(tx) + dx, y: py(row) + dy }); }
  gear(tx, row, r, speed, dy) { this.decor.push({ type: 'gear', x: px(tx), y: py(row) + dy, r, speed }); }
  checkpoint() { this.checkpoints.push(px(this.x)); return this; }

  /** Adds enemies described relative to a segment: [type, offset, opts]. */
  placeEnemies(list, x0, x1, row) {
    for (const [type, off, o = {}] of list || []) {
      const tx = x0 + off;
      if (type === 'skeleton') this.enemies.push({ type, tx, row: o.row == null ? row : o.row, min: o.min == null ? x0 : o.min, max: o.max == null ? x1 : o.max, variant: o.variant || 'normal' });
      else if (type === 'bat') this.enemies.push({ type, tx, ty: row - (o.h || 5), variant: o.variant || 'normal' });
    }
  }

  /** Theme-appropriate background decoration sprinkled on a ground run. */
  autoDecor(x0, x1, row, density = 1) {
    const kind = this.theme.decor;
    for (let tx = x0; tx <= x1; tx++) {
      const r = this.rng() / density;
      if (kind === 'graveyard') {
        if (r < 0.16) this.deco('props', 'tombstone', tx, row);
        else if (r < 0.23) this.deco('props', 'shrub', tx, row);
      } else if (kind === 'castle') {
        if (r < 0.07) this.deco('arch', 'column', tx, row);
        else if (r < 0.13) this.deco('arch', 'window', tx, row, 0, -24);
        else if (r < 0.17) this.deco('arch', 'banner', tx, row, 0, -48);
        else if (r < 0.20) this.deco('arch', 'chain', tx, row, 0, -96);
        else if (r < 0.26) this.deco('props', 'torch', tx, row, 0, -46);
      } else if (kind === 'ramparts') {
        if (r < 0.07) this.deco('arch', 'column', tx, row);
        else if (r < 0.11) this.deco('arch', 'banner', tx, row, 0, -48);
        else if (r < 0.17) this.deco('props', 'torch', tx, row, 0, -46);
        else if (r < 0.20) this.deco('arch', 'chain', tx, row, 0, -96);
      } else if (kind === 'crypt') {
        if (r < 0.05) this.deco('arch', 'column', tx, row);
        else if (r < 0.10) this.deco('props', 'tombstone', tx, row);
        else if (r < 0.15) this.deco('arch', 'chain', tx, row, 0, -96);
        else if (r < 0.22) this.deco('props', 'torch', tx, row, 0, -46);
      } else if (kind === 'clockwork') {
        if (r < 0.07) this.gear(tx, row, this.pick([28, 36, 48, 60]), this.pick([0.35, -0.5, 0.7, -0.25]), -60 - this.rng() * 110);
        else if (r < 0.11) this.deco('arch', 'chain', tx, row, 0, -96);
        else if (r < 0.15) this.deco('props', 'torch', tx, row, 0, -46);
      }
    }
  }

  // ------------------------------------------------------------ prefabs

  /**
   * Flat walkable run. opts: candles [off | [off, drop]], enemies [[type,
   * off, o]], ledges [[off, height, width]], spawn 'zombie'|'medusa'|'bat'
   * (+ spawnVariant), decor false to skip auto decoration.
   */
  flat(len, o = {}) {
    const x0 = this.x, x1 = this.x + len - 1, row = this.row;
    this.op((lv) => lv.ground(x0, x1, row, this.mat));
    for (const c of o.candles || []) {
      if (Array.isArray(c)) this.candle(x0 + c[0], row, c[1]); else this.candle(x0 + c, row);
    }
    for (const [off, h, w = 3] of o.ledges || []) {
      const lx0 = x0 + off, lx1 = lx0 + w - 1, lrow = row - h;
      this.op((lv) => lv.platform(lx0, lx1, lrow));
      if (o.ledgeCandles !== false && this.chance(0.6)) this.candle(lx0 + Math.floor(w / 2), lrow, this.chance(0.25) ? 'heart_big' : null);
    }
    this.placeEnemies(o.enemies, x0, x1, row);
    if (o.spawn) this.spawners.push({ type: o.spawn, x0, x1, variant: o.spawnVariant || 'normal' });
    if (o.decor !== false) this.autoDecor(x0, x1, row, o.decorDensity || 1);
    this.x += len;
    return this;
  }

  /** Bottomless pit; optional one-way ledge `ledge` tiles above the surface. */
  gap(width, o = {}) {
    if (o.ledge != null) {
      const lx0 = this.x, lx1 = this.x + width - 1, lrow = this.row - o.ledge;
      this.op((lv) => lv.platform(lx0, lx1, lrow));
    }
    this.x += width;
    return this;
  }

  /** Lowered floor lined with spikes (2 tiles deep); optional ledge above. */
  spikeRun(width, o = {}) {
    const x0 = this.x, x1 = this.x + width - 1, row = this.row;
    this.op((lv) => { lv.ground(x0, x1, row + 2, this.mat); lv.fill(x0, x1, row + 1, row + 1, T_SPIKES); });
    if (o.ledge != null) {
      const w = o.ledgeWidth || Math.max(2, width - 2), lx0 = x0 + Math.floor((width - w) / 2), lrow = row - o.ledge;
      this.op((lv) => lv.platform(lx0, lx0 + w - 1, lrow));
    }
    this.x += width;
    return this;
  }

  /** Staircase up: n steps, each 2 tiles wide and 1 tile tall. */
  stepUp(n) {
    for (let i = 1; i <= n; i++) {
      const x0 = this.x, r = this.row - i;
      this.op((lv) => lv.ground(x0, x0 + 1, r, this.mat));
      this.x += 2;
    }
    this.row -= n;
    return this;
  }

  /** Staircase down: n steps, each 2 tiles wide. */
  stepDown(n) {
    for (let i = 1; i <= n; i++) {
      const x0 = this.x, r = this.row + i;
      this.op((lv) => lv.ground(x0, x0 + 1, r, this.mat));
      this.x += 2;
    }
    this.row += n;
    return this;
  }

  /** Cliff drop: the next segment starts n tiles lower. */
  drop(n) { this.row += n; return this; }

  /** Zig-zag of one-way ledges rising n tiles (ground continues below). */
  climb(n, o = {}) {
    const k = Math.ceil(n / 2), x0 = this.x, row = this.row;
    const under = o.under == null ? true : o.under;
    const span = 2 * k + 1;
    if (under) this.op((lv) => lv.ground(x0, x0 + span - 1, row, this.mat));
    for (let i = 1; i <= k; i++) {
      const h = Math.min(2 * i, n);
      const lx0 = x0 + 2 * (i - 1) + 1, lrow = row - h;
      this.op((lv) => lv.platform(lx0, lx0 + 1, lrow));
      if (o.candles && i % 2 === 0) this.candle(lx0, lrow);
    }
    this.x += span;
    this.row -= n;
    return this;
  }

  /** Flat run with a solid ceiling `ceil` tiles above the floor. */
  corridor(len, ceil = 2, o = {}) {
    const x0 = this.x, x1 = this.x + len - 1, row = this.row;
    this.op((lv) => { lv.ground(x0, x1, row, this.mat); lv.fill(x0, x1, 0, row - ceil - 1, this.mat); });
    for (const c of o.candles || []) this.candle(x0 + c, row);
    if (o.spawn) this.spawners.push({ type: o.spawn, x0, x1, variant: o.spawnVariant || 'normal' });
    this.placeEnemies(o.enemies, x0, x1, row);
    this.x += len;
    return this;
  }

  /** Breakable block column h tall standing on the ground (drops per row). */
  blocks(h, drops = [], o = {}) {
    const x0 = this.x, row = this.row;
    const w = o.width || 1;
    this.op((lv) => { lv.ground(x0, x0 + w - 1, row, this.mat); lv.fill(x0, x0 + w - 1, row - h, row - 1, T_BLOCK); });
    drops.forEach((d, i) => { if (d) this.blockDrops[`${x0},${row - 1 - i}`] = d; });
    this.x += w;
    return this;
  }

  /** Boss arena: gate, trigger, camera lock, spawn point and bounds. */
  arena(type, name, o = {}) {
    const x0 = this.x, row = this.row, len = 20;
    this.op((lv) => lv.ground(x0, x0 + len - 1, row, this.mat));
    this.candle(x0 + 4, row, 'heart_big');
    this.candle(x0 + 16, row, 'heart_big');
    if (this.theme.decor === 'graveyard') {
      this.deco('props', 'tombstone', x0 + 3, row); this.deco('props', 'tombstone', x0 + 17, row);
    } else {
      this.deco('arch', 'column', x0 + 3, row); this.deco('arch', 'column', x0 + 18, row);
      [x0 + 6, x0 + 10, x0 + 14].forEach((tx) => this.deco('arch', 'window', tx, row, 0, -24));
      [x0 + 8, x0 + 12].forEach((tx) => this.deco('arch', 'banner', tx, row, 0, -48));
      this.deco('props', 'torch', x0 + 4, row, 0, -46); this.deco('props', 'torch', x0 + 17, row, 0, -46);
    }
    this.checkpoints.push(px(x0));
    this.boss = {
      type, name,
      gateCol: x0 + 1, gateRows: [row - 3, row - 1],
      triggerX: px(x0 + 5), camX: x0 * TILE,
      spawn: { x: px(x0 + 14), y: py(row) - (o.spawnHeight == null ? 70 : o.spawnHeight) },
      arena: { x0: (x0 + 2) * TILE + 8, x1: (x0 + len) * TILE - 8, floorY: py(row), ceilY: py(row) - 230 },
    };
    this.x += len;
    return this;
  }

  // --------------------------------------------------------------- done
  /** Produces the stage data object consumed by World/Level. */
  done() {
    const ops = this.ops.slice();
    const t = this.theme;
    const cols = this.x;
    const rooms = t.outdoor ? [] : [{ x0: 0, x1: cols - 1, y0: 0, y1: this.rows - 1, wall: t.wall, parallax: t.wallParallax, dark: t.dark, edge: false }];
    const startRow = this.startRow;
    return {
      id: this.id, name: this.name, subtitle: this.subtitle, theme: this.themeKey,
      cols, rows: this.rows,
      start: { x: px(2), y: py(startRow) },
      checkpoints: this.checkpoints,
      build(level) { ops.forEach((fn) => fn(level)); },
      rooms, decor: this.decor, blockDrops: this.blockDrops,
      candles: this.candles, enemies: this.enemies, spawners: this.spawners,
      boss: this.boss,
    };
  }
}

export { px, py };
