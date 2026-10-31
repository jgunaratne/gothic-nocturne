// Stage builder: composes a level from prefab segments with a theme, and
// records candles, enemies, spawners, 2.5D moving mechanisms, decor and the
// boss arena as it goes. Coordinates are tiles; `row` is the walking surface.

import {
  TILE, T_GROUND, T_STONE, T_CATACOMB, T_CLOCK, T_FOREST, T_SNOW, T_DARKWOOD, T_BLOCK, T_SPIKES,
} from '../engine/constants.js';

export const THEMES = {
  graveyard: { outdoor: true, layers: 'outdoor', material: T_GROUND, wall: 'wall', wallParallax: 1, dark: 0.42, music: 'graveyard', bg: '#0b0a14', decor: 'graveyard', accent: '#9ad17a', platform: 'platform' },
  darkwood: { outdoor: true, layers: 'darkwood', material: T_DARKWOOD, wall: 'wall', wallParallax: 1, dark: 0.44, music: 'darkwood', bg: '#071115', decor: 'darkwood', accent: '#62e8b5', platform: 'platform_wood', weather: 'fireflies', ally: 'turtle' },
  forest: { outdoor: true, layers: 'forest', material: T_FOREST, wall: 'wall', wallParallax: 1, dark: 0.42, music: 'jack', bg: '#0b0a14', decor: 'forest', accent: '#ff9a3c', platform: 'platform_wood' },
  yule: { outdoor: true, layers: 'winter', material: T_SNOW, wall: 'wall', wallParallax: 1, dark: 0.42, music: 'yule', bg: '#0a0c18', decor: 'yule', accent: '#9ad8ff', platform: 'platform_wood', weather: 'snow' },
  ramparts: { outdoor: true, layers: 'ramparts', material: T_STONE, wall: 'wall', wallParallax: 1, dark: 0.42, music: 'ramparts', bg: '#0b0a14', decor: 'ramparts', accent: '#8a9ab5', platform: 'platform' },
  catacombs: { outdoor: false, layers: null, material: T_CATACOMB, wall: 'catacombwall', wallParallax: 0.6, dark: 0.48, music: 'catacombs', bg: '#050408', decor: 'crypt', accent: '#c9b58a', platform: 'platform' },
  ossuary: { outdoor: false, layers: null, material: T_CATACOMB, wall: 'catacombwall', wallParallax: 0.6, dark: 0.56, music: 'ossuary', bg: '#040306', decor: 'crypt', accent: '#b7a9c9', platform: 'platform' },
  clocktower: { outdoor: false, layers: null, material: T_CLOCK, wall: 'clockwall', wallParallax: 0.5, dark: 0.42, music: 'tower', bg: '#06050a', decor: 'clockwork', accent: '#d9a44a', platform: 'platform_wood', cylinder: true },
  throne: { outdoor: false, layers: null, material: T_STONE, wall: 'wall', wallParallax: 0.7, dark: 0.30, music: 'throne', bg: '#0a0710', decor: 'castle', accent: '#e23c3c', platform: 'platform' },
  cathedral: { outdoor: false, layers: null, material: T_STONE, wall: 'cathedralwall', wallParallax: 0.7, dark: 0.26, music: 'cathedral', bg: '#0a0914', decor: 'cathedral', accent: '#ff5c7a', platform: 'platform' },
  library: { outdoor: false, layers: null, material: T_STONE, wall: 'librarywall', wallParallax: 0.7, dark: 0.36, music: 'library', bg: '#0b0812', decor: 'library', accent: '#b48cff', platform: 'platform_wood' },
  arcade: { outdoor: false, layers: null, material: T_STONE, wall: 'arcadewall', wallParallax: 0.7, dark: 0.34, music: 'arcade', bg: '#0c0810', decor: 'arcade', accent: '#e0b45a', platform: 'platform_wood' },
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
    this.decor = []; this.movers = []; this.blockDrops = {};
    this.checkpoints = [px(2)];
    this.boss = null;
  }

  // ------------------------------------------------------------ helpers
  op(fn) { this.ops.push(fn); return this; }
  chance(p) { return this.rng() < p; }
  pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }
  candle(tx, row, drop = null) { this.candles.push([tx, row, drop]); }
  deco(sheet, frame, tx, row, dx = 0, dy = 0) { this.decor.push({ sheet, frame, x: px(tx) + dx, y: py(row) + dy }); }
  gear(tx, row, r, speed, dy, z = 56) { this.decor.push({ type: 'gear', x: px(tx), y: py(row) + dy, r, speed, z }); }
  checkpoint() { this.checkpoints.push(px(this.x)); return this; }

  /** Adds enemies described relative to a segment: [type, offset, opts]. */
  placeEnemies(list, x0, x1, row) {
    for (const [type, off, o = {}] of list || []) {
      const tx = x0 + off;
      const base = { type, tx, variant: o.variant || 'normal', min: o.min == null ? x0 : o.min, max: o.max == null ? x1 : o.max };
      if (type === 'bat' || type === 'dragon' || type === 'owl' || type === 'ghost' || type === 'tome' || type === 'gargoyle') this.enemies.push(Object.assign(base, { ty: row - (o.h || 5) }));
      else this.enemies.push(Object.assign(base, { row: o.row == null ? row : o.row }));
    }
  }

  /** Theme-appropriate background decoration sprinkled on a ground run. */
  autoDecor(x0, x1, row, density = 1) {
    const kind = this.theme.decor;
    for (let tx = x0; tx <= x1; tx++) {
      const r = this.rng() / density;
      // Hanging 2.5D set pieces with real swing/foreshortening.
      if (this.rng() < 0.042) {
        if (kind === 'clockwork') this.decor.push({ type: 'pendulum', x: px(tx), y: py(row) - 250, len: 150 + Math.round(this.rng() * 40), r: 20 + Math.round(this.rng() * 8), period: 2.4 + this.rng() * 0.8, phase: this.rng() * 6 });
        else if (kind === 'castle' || kind === 'arcade' || kind === 'library' || kind === 'cathedral') this.decor.push({ type: 'chandelier', x: px(tx), y: py(row) - 290, len: 80 + Math.round(this.rng() * 36), r: 26 + Math.round(this.rng() * 10), phase: this.rng() * 6 });
        else if (kind === 'crypt') this.decor.push({ type: 'cage', x: px(tx), y: py(row) - 226, len: 60 + Math.round(this.rng() * 36), phase: this.rng() * 6 });
      }
      if (kind === 'graveyard') {
        if (r < 0.16) this.deco('props', 'tombstone', tx, row);
        else if (r < 0.23) this.deco('props', 'shrub', tx, row);
      } else if (kind === 'castle') {
        if (r < 0.06) this.deco('arch', 'column', tx, row);
        else if (r < 0.12) this.deco('arch', 'banner', tx, row, 0, -48);
        else if (r < 0.16) this.deco('arch', 'chain', tx, row, 0, -96);
        else if (r < 0.23) this.deco('props', 'torch', tx, row, 0, -46);
      } else if (kind === 'ramparts') {
        if (r < 0.06) this.deco('arch', 'column', tx, row);
        else if (r < 0.11) this.deco('arch', 'banner', tx, row, 0, -48);
        else if (r < 0.18) this.deco('props', 'torch', tx, row, 0, -46);
        else if (r < 0.21) this.deco('arch', 'chain', tx, row, 0, -96);
      } else if (kind === 'crypt') {
        if (r < 0.05) this.deco('arch', 'column', tx, row);
        else if (r < 0.10) this.deco('props', 'tombstone', tx, row);
        else if (r < 0.15) this.deco('arch', 'chain', tx, row, 0, -96);
        else if (r < 0.22) this.deco('props', 'torch', tx, row, 0, -46);
      } else if (kind === 'clockwork') {
        if (r < 0.09) this.gear(tx, row, this.pick([30, 38, 50, 64]), this.pick([0.4, -0.55, 0.72, -0.3]), -60 - this.rng() * 110, this.pick([44, 68, 96]));
        else if (r < 0.13) this.deco('arch', 'chain', tx, row, 0, -96);
        else if (r < 0.17) this.deco('props', 'torch', tx, row, 0, -46);
      } else if (kind === 'cathedral') {
        if (r < 0.05) this.deco('stained_glass', this.pick(['rose', 'hunter', 'moon']), tx, row, 0, -70);
        else if (r < 0.09) this.deco('cathedral_props', 'angel', tx, row);
        else if (r < 0.13) this.deco('cathedral_props', 'pew', tx, row);
        else if (r < 0.17) this.deco('cathedral_props', 'candles', tx, row);
        else if (r < 0.19) this.deco('cathedral_props', 'font', tx, row);
        else if (r < 0.21) this.deco('cathedral_props', 'pulpit', tx, row);
        else if (r < 0.25) this.deco('arch', 'column', tx, row);
        else if (r < 0.29) this.deco('arch', 'banner', tx, row, 0, -48);
      } else if (kind === 'library') {
        if (r < 0.07) this.deco('library_props', 'bookcase', tx, row);
        else if (r < 0.11) this.deco('library_props', 'lectern', tx, row);
        else if (r < 0.14) this.deco('library_props', 'globe', tx, row);
        else if (r < 0.17) this.deco('library_props', 'ladder', tx, row);
        else if (r < 0.21) this.deco('library_props', 'tomes', tx, row);
        else if (r < 0.27) this.deco('props', 'torch', tx, row, 0, -46);
        else if (r < 0.30) this.deco('arch', 'chain', tx, row, 0, -96);
      } else if (kind === 'arcade') {
        if (r < 0.05) this.deco('arcade_props', 'sage_cabinet', tx, row);
        else if (r < 0.09) this.deco('arcade_props', 'oracle_engine', tx, row);
        else if (r < 0.13) this.deco('arcade_props', 'zoetrope', tx, row);
        else if (r < 0.16) this.deco('arcade_props', 'chess_automaton', tx, row);
        else if (r < 0.19) this.deco('arcade_props', 'magic_lantern', tx, row);
        else if (r < 0.25) this.deco('props', 'torch', tx, row, 0, -46);
        else if (r < 0.29) this.gear(tx, row, this.pick([26, 34, 44]), this.pick([0.4, -0.5, 0.65]), -150 - this.rng() * 70, this.pick([60, 84]));
        else if (r < 0.32) this.deco('arch', 'chain', tx, row, 0, -96);
      } else if (kind === 'darkwood') {
        if (r < 0.08) this.deco('darkwood_props', 'moss_lantern', tx, row);
        else if (r < 0.16) this.deco('darkwood_props', 'glow_shrooms', tx, row);
        else if (r < 0.22) this.deco('darkwood_props', 'elder_stump', tx, row);
        else if (r < 0.26) this.deco('darkwood_props', 'ancient_totem', tx, row);
        else if (r < 0.31) this.deco('props', 'shrub', tx, row);
      } else if (kind === 'forest') {
        if (r < 0.07) this.deco('pumpkinprops', 'jack_big', tx, row);
        else if (r < 0.14) this.deco('pumpkinprops', 'jack_small', tx, row);
        else if (r < 0.18) this.deco('pumpkinprops', 'pumpkins', tx, row);
        else if (r < 0.21) this.deco('pumpkinprops', 'scarecrow', tx, row);
        else if (r < 0.28) this.deco('props', 'shrub', tx, row);
      } else if (kind === 'yule') {
        if (r < 0.06) this.deco('xmasprops', 'tree', tx, row);
        else if (r < 0.10) this.deco('xmasprops', 'lamppost', tx, row);
        else if (r < 0.14) this.deco('xmasprops', 'gifts', tx, row);
        else if (r < 0.17) this.deco('xmasprops', 'wreath', tx, row, 0, -70);
        else if (r < 0.22) this.deco('xmasprops', 'stump', tx, row);
        else if (r < 0.26) this.deco('props', 'tombstone', tx, row);
      }
    }
  }

  // ------------------------------------------------------------ prefabs

  /** Flat walkable ground run. */
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

  /**
   * Elevated 1-tile-thick viaduct span with 3D stone/timber arches underneath,
   * leaving the lower viewport open so 3D vistas (courtyards, lakes, abysses) shine.
   */
  vistaBridge(len, o = {}) {
    const x0 = this.x, x1 = this.x + len - 1, row = this.row;
    this.op((lv) => lv.bridge(x0, x1, row, this.mat));
    for (const c of o.candles || []) {
      if (Array.isArray(c)) this.candle(x0 + c[0], row, c[1]); else this.candle(x0 + c, row);
    }
    for (const [off, h, w = 3] of o.ledges || []) {
      const lx0 = x0 + off, lx1 = lx0 + w - 1, lrow = row - h;
      this.op((lv) => lv.platform(lx0, lx1, lrow));
    }
    this.placeEnemies(o.enemies, x0, x1, row);
    if (o.spawn) this.spawners.push({ type: o.spawn, x0, x1, variant: o.spawnVariant || 'normal' });
    // Sparse bridge-post lanterns/torches every 6 tiles to frame the vista without clutter.
    const kind = this.theme.decor;
    for (let tx = x0 + 2; tx <= x1 - 2; tx += 6) {
      if (kind === 'yule') this.deco('xmasprops', 'lamppost', tx, row);
      else if (kind === 'darkwood') this.deco('darkwood_props', 'moss_lantern', tx, row);
      else if (kind === 'forest') this.deco('pumpkinprops', 'jack_small', tx, row);
      else this.deco('props', 'torch', tx, row, 0, -44);
    }
    this.x += len;
    return this;
  }

  /**
   * Fissured 3D stone slabs that tremble and collapse when stepped on.
   * `o.safe` (default true) places a sunken floor 2 tiles below to teach the
   * mechanic safely; `o.spikes` lines a spike trench; `o.abyss` drops into open air.
   */
  crumbleRun(width, o = {}) {
    const x0 = this.x, x1 = this.x + width - 1, row = this.row;
    this.op((lv) => {
      if (o.spikes) {
        lv.ground(x0, x1, row + 2, this.mat);
        lv.fill(x0, x1, row + 1, row + 1, T_SPIKES);
      } else if (!o.abyss && o.safe !== false) {
        lv.ground(x0, x1, row + 2, this.mat);
      }
      lv.crumble(x0, x1, row);
    });
    if (o.candle) this.candle(x0 + Math.floor(width / 2), row, o.candle === true ? null : o.candle);
    if (o.belowBlock && !o.spikes && !o.abyss && o.safe !== false) {
      const bx = x0 + Math.floor(width / 2);
      this.op((lv) => lv.set(bx, row + 1, T_BLOCK));
      this.blockDrops[`${bx},${row + 1}`] = o.belowBlock;
    }
    this.x += width;
    return this;
  }

  /**
   * Scenic chasm spanned by a smooth 2.5D moving ferry platform on a 3D chain track.
   * Optional `o.rise` elevates (positive) or descends (negative) across the crossing.
   */
  ferryGap(width = 6, o = {}) {
    const x0 = this.x, x1 = this.x + width - 1;
    const startRow = this.row;
    const rise = o.rise || 0;
    const endRow = startRow - rise;
    const platTiles = o.platTiles || 3;
    const halfPx = (platTiles * TILE) * 0.5;

    if (o.safeFloor) {
      const floorR = Math.min(this.rows - 1, Math.max(startRow, endRow) + 2);
      this.op((lv) => {
        lv.ground(x0, x1, floorR, this.mat);
        if (floorR - startRow > 2) lv.platform(x0, x0 + 1, floorR - 2);
      });
    }

    this.movers.push({
      kind: 'linear',
      tiles: platTiles,
      x0: x0 * TILE + halfPx + 4,
      y0: py(startRow),
      x1: (x1 + 1) * TILE - halfPx - 4,
      y1: py(endRow),
      period: o.period || 4.8,
      phase: o.phase || 0,
      dwell: 0.10,
    });

    if (o.candle) {
      const midTx = x0 + Math.floor(width / 2);
      const midRow = Math.min(startRow, endRow) - 2;
      this.op((lv) => lv.platform(midTx, midTx + 1, midRow));
      this.candle(midTx, midRow, o.candle === true ? 'heart_big' : o.candle);
    }

    this.x += width;
    this.row = endRow;
    return this;
  }

  /**
   * Dual-path Risk/Reward architecture:
   * - Lower road (`row`): heavier combat patrol, optional `vista` viaduct bridge.
   * - Upper 3D-supported gallery (`row - 3`, entered via `row - 2` step ledge):
   *   elevated vantage with high-value treasure/sub-weapon/meat reward!
   */
  splitRoute(len = 14, o = {}) {
    const x0 = this.x, x1 = this.x + len - 1, row = this.row;
    if (o.vista) this.op((lv) => lv.bridge(x0, x1, row, this.mat));
    else this.op((lv) => lv.ground(x0, x1, row, this.mat));

    // Entry step (row - 2) -> Upper gallery (row - 3)
    const gx0 = x0 + 4, gx1 = x1 - 2, grow = row - 3;
    this.op((lv) => {
      lv.platform(x0 + 1, x0 + 2, row - 2);
      lv.platform(gx0, gx1, grow);
    });

    // Lower road candles & opposition
    this.candle(x0 + 2, row);
    this.candle(x1 - 1, row);
    this.placeEnemies(o.enemies || [['skeleton', Math.floor(len * 0.45)], ['skeleton', Math.floor(len * 0.78), { variant: 'axe' }]], x0, x1, row);
    if (o.spawn) this.spawners.push({ type: o.spawn, x0, x1, variant: o.spawnVariant || 'normal' });

    // Upper gallery reward & light aerial guard
    const midG = Math.floor((gx0 + gx1) * 0.5);
    this.candle(midG, grow, o.reward || 'meat');
    this.candle(gx1 - 1, grow, 'money');
    if (o.upperEnemies !== false) {
      this.placeEnemies(o.upperEnemies || [['bat', Math.floor(len * 0.6), { h: 5 }]], x0, x1, row);
    }

    if (!o.vista) this.autoDecor(x0, x1, row, 0.85);
    this.x += len;
    return this;
  }

  /**
   * Clockwork Set-Piece: Giant extruded 3D cogwheel with 3 orbiting 2-tile
   * gondolas carrying the hunter 4 tiles upward across a 6-tile open shaft!
   */
  gearWheel(o = {}) {
    const len = 12;
    const x0 = this.x, x1 = this.x + len - 1;
    const startRow = this.row;
    const rise = 4;
    const endRow = startRow - rise;
    const cx = (x0 + 6) * TILE;
    const cy = py(startRow - 2);
    const radius = 64; // 2 tiles: bottom touches startRow, top reaches endRow; outer edges kiss x0+3 and x0+9!

    this.op((lv) => {
      // Entry landing (x0 .. x0+2)
      lv.ground(x0, x0 + 2, startRow, this.mat);
      // Optional safety deck 2 tiles below startRow (completely clear of the wheel's orbit!)
      if (o.safe !== false) {
        lv.ground(x0 + 3, x0 + 8, Math.min(this.rows - 1, startRow + 2), this.mat);
      }
      // Elevated exit landing (x0+9 .. x1), clear of rightmost gondola edge at (x0+9)*TILE
      lv.ground(x0 + 9, x1, endRow, this.mat);
    });

    const speed = o.speed || 0.52;
    for (let i = 0; i < 3; i++) {
      this.movers.push({
        kind: 'orbit',
        tiles: 2,
        cx, cy,
        r: radius,
        speed,
        phase: (i / 3) * Math.PI * 2,
      });
    }
    // Companion meshing 3D gears in the background
    this.decor.push({ type: 'gear', x: cx - 78, y: cy - 46, r: 34, speed: -speed * 1.5, z: 72 });
    this.decor.push({ type: 'gear', x: cx + 82, y: cy + 42, r: 30, speed: -speed * 1.7, z: 72 });

    this.candle(x0 + 1, startRow);
    this.candle(x0 + 10, endRow, o.reward || 'heart_big');
    this.x += len;
    this.row = endRow;
    return this;
  }

  /**
   * Pre-boss calm & framing vestibule: checkpoint, twin 3D framing columns and
   * torches, generous sub-weapon heart supply, and zero spawners/enemies.
   */
  vestibule(o = {}) {
    this.checkpoint();
    const x0 = this.x, len = 7, row = this.row;
    this.op((lv) => lv.ground(x0, x0 + len - 1, row, this.mat));
    this.candle(x0 + 2, row, o.drop || 'heart_big');
    this.candle(x0 + 5, row, 'heart_big');
    const kind = this.theme.decor;
    if (kind === 'cathedral') {
      this.deco('cathedral_props', 'angel', x0 + 1, row);
      this.deco('cathedral_props', 'angel', x0 + 5, row);
      this.deco('stained_glass', 'hunter', x0 + 3, row, 0, -70);
    } else if (kind === 'library') {
      this.deco('library_props', 'bookcase', x0 + 1, row);
      this.deco('library_props', 'bookcase', x0 + 5, row);
      this.deco('library_props', 'lectern', x0 + 3, row);
    } else if (kind === 'arcade') {
      this.deco('arcade_props', 'sage_cabinet', x0 + 1, row);
      this.deco('arcade_props', 'oracle_engine', x0 + 5, row);
      this.deco('props', 'torch', x0 + 3, row, 0, -46);
    } else if (kind === 'darkwood') {
      this.deco('darkwood_props', 'ancient_totem', x0 + 1, row);
      this.deco('darkwood_props', 'ancient_totem', x0 + 5, row);
      this.deco('darkwood_props', 'moss_lantern', x0 + 3, row);
    } else if (kind === 'forest') {
      this.deco('pumpkinprops', 'jack_big', x0 + 1, row);
      this.deco('pumpkinprops', 'jack_big', x0 + 5, row);
    } else if (kind === 'yule') {
      this.deco('xmasprops', 'lamppost', x0 + 1, row);
      this.deco('xmasprops', 'lamppost', x0 + 5, row);
    } else {
      this.deco('arch', 'column', x0 + 1, row);
      this.deco('arch', 'column', x0 + 5, row);
      this.deco('props', 'torch', x0 + 3, row, 0, -46);
    }
    if (kind === 'castle') {
      this.decor.push({ type: 'chandelier', x: px(x0 + 3), y: py(row) - 276, len: 84, r: 30, phase: 1.2 });
    }
    this.x += len;
    return this;
  }


  /**
   * Vertical lift shaft: a chain-drawn 2-tile elevator rising `h` tiles between
   * two landings, with wall ledges to hop off onto for candles, and bats dropping
   * from the shaft head. Changes the level's row by -h.
   */
  liftShaft(h = 5, o = {}) {
    const x0 = this.x, len = 7, row = this.row, top = row - h;
    this.op((lv) => {
      lv.ground(x0, x0 + 1, row, this.mat);                // entry landing
      lv.ground(x0 + 5, x0 + len - 1, top, this.mat);      // exit landing
      lv.fill(x0 + 5, x0 + len - 1, top + 1, this.rows - 1, this.mat);
      // Wall ledges alternating up the shaft sides
      for (let k = 2; k < h; k += 2) lv.platform(k % 4 === 2 ? x0 + 1 : x0 + 4, k % 4 === 2 ? x0 + 1 : x0 + 4, row - k);
    });
    this.movers.push({ kind: 'linear', tiles: 2, x0: (x0 + 3) * TILE, y0: py(row), x1: (x0 + 3) * TILE, y1: py(top), period: o.period || 5.2, phase: o.phase || 0, dwell: 0.14 });
    this.candle(x0, row);
    this.candle(x0 + 6, top, o.reward || 'heart_big');
    if (h >= 4) this.candle(x0 + 4, row - 4 + (h % 2), 'money');
    if (o.spawn !== false) this.spawners.push({ type: o.spawn || 'bat', x0, x1: x0 + len - 1, variant: o.spawnVariant || 'normal' });
    const kind = this.theme.decor;
    if (kind === 'clockwork' || kind === 'arcade') this.gear(x0 + 3, top, 30, 0.6, -40, 60);
    else this.deco('arch', 'chain', x0 + 3, top, 0, -96);
    this.x += len;
    this.row = top;
    return this;
  }

  /**
   * Zig-zag descent: one-way ledges stepping down `h` tiles through an open
   * shaft (bats harass the drop), landing on a wider floor below.
   */
  descent(h = 6, o = {}) {
    const x0 = this.x, row = this.row, bottom = row + h;
    const steps = Math.ceil(h / 2), len = 2 * steps + 3;
    this.op((lv) => {
      lv.ground(x0, x0, row, this.mat);
      for (let i = 1; i <= steps; i++) {
        const lrow = Math.min(bottom - 1, row + i * 2);
        const lx = (i % 2 === 1) ? x0 + 2 : x0 + 1 + 2 * ((i + 1) % 2) + 2;
        lv.platform(lx, lx + 1, lrow);
      }
      lv.ground(x0 + 1, x0 + len - 1, bottom, this.mat);
    });
    this.candle(x0 + 2, row + 2, o.candle || null);
    this.candle(x0 + len - 2, bottom, 'heart_small');
    this.placeEnemies(o.enemies || [['bat', 3, { h: 2 }]], x0, x0 + len - 1, row);
    this.x += len;
    this.row = bottom;
    return this;
  }

  /**
   * Hidden vault: two breakable blocks set INTO the floor conceal a sunken
   * treasure chamber (meat + gold + sub-weapon) with a ledge to climb back out.
   */
  hiddenVault(o = {}) {
    const x0 = this.x, len = 9, row = this.row;
    const vx0 = x0 + 2, vx1 = x0 + 6, vfloor = row + 4;
    this.op((lv) => {
      lv.ground(x0, x0 + len - 1, row, this.mat);
      lv.fill(vx0, vx1, row + 1, vfloor - 1, 0);               // carve the chamber
      lv.set(x0 + 3, row, T_BLOCK); lv.set(x0 + 4, row, T_BLOCK);
      lv.platform(vx0, vx0, row + 2);                           // climb-out ledge
    });
    this.blockDrops[`${x0 + 3},${row}`] = 'money';
    this.candle(x0 + 1, row);
    this.candle(x0 + 7, row);
    this.candle(vx0 + 2, vfloor, o.reward || 'meat');
    this.candle(vx1 - 1, vfloor, o.weapon || 'holy_water');
    this.candle(vx1 - 3, vfloor, 'money');
    this.placeEnemies(o.enemies || [['skeleton', 7]], x0, x0 + len - 1, row);
    this.autoDecor(x0, x0 + len - 1, row, 0.6);
    this.x += len;
    return this;
  }

  /**
   * Swing run: a timing gauntlet of short, fast moving platforms shuttling
   * across an open drop, each out of phase with the last. `o.safe` adds a
   * floor 3 tiles down so misses cost time, not a life.
   */
  swingRun(n = 3, o = {}) {
    const x0 = this.x, row = this.row, span = 4, len = n * span + 1;
    this.op((lv) => {
      lv.ground(x0, x0, row, this.mat);
      if (o.safe !== false) lv.ground(x0, x0 + len - 1, Math.min(this.rows - 1, row + 3), this.mat);
    });
    for (let i = 0; i < n; i++) {
      const sx = x0 + 1 + i * span;
      this.movers.push({
        kind: 'linear', tiles: 2,
        x0: sx * TILE + TILE + 4, y0: py(row),
        x1: (sx + span) * TILE - TILE - 4, y1: py(row),
        period: o.period || 2.6, phase: i * 1.3, dwell: 0.06,
      });
    }
    this.op((lv) => lv.ground(x0 + len - 1, x0 + len - 1, row, this.mat));
    this.candle(x0 + len - 1, row, o.reward || 'heart_big');
    if (o.spawn) this.spawners.push({ type: o.spawn, x0, x1: x0 + len - 1, variant: 'normal' });
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
    const kind = this.theme.decor;
    if (kind === 'graveyard') {
      this.deco('props', 'tombstone', x0 + 3, row); this.deco('props', 'tombstone', x0 + 17, row);
    } else if (kind === 'cathedral') {
      [x0 + 3, x0 + 17].forEach((tx) => this.deco('cathedral_props', 'angel', tx, row));
      this.deco('stained_glass', 'rose', x0 + 10, row, 0, -96);
      [x0 + 6, x0 + 14].forEach((tx) => this.deco('stained_glass', tx === x0 + 6 ? 'hunter' : 'moon', tx, row, 0, -70));
      this.deco('cathedral_props', 'candles', x0 + 8, row); this.deco('cathedral_props', 'candles', x0 + 12, row);
    } else if (kind === 'library') {
      [x0 + 3, x0 + 17].forEach((tx) => this.deco('library_props', 'bookcase', tx, row));
      this.deco('library_props', 'globe', x0 + 6, row); this.deco('library_props', 'tomes', x0 + 14, row);
      this.deco('props', 'torch', x0 + 8, row, 0, -46); this.deco('props', 'torch', x0 + 12, row, 0, -46);
    } else if (kind === 'arcade') {
      this.deco('arcade_props', 'sage_cabinet', x0 + 3, row); this.deco('arcade_props', 'oracle_engine', x0 + 17, row);
      this.deco('arcade_props', 'zoetrope', x0 + 6, row); this.deco('arcade_props', 'magic_lantern', x0 + 14, row);
      this.deco('props', 'torch', x0 + 9, row, 0, -46); this.deco('props', 'torch', x0 + 11, row, 0, -46);
    } else if (kind === 'darkwood') {
      [x0 + 3, x0 + 17].forEach((tx) => this.deco('darkwood_props', 'ancient_totem', tx, row));
      [x0 + 6, x0 + 14].forEach((tx) => this.deco('darkwood_props', 'moss_lantern', tx, row));
      [x0 + 9, x0 + 11].forEach((tx) => this.deco('darkwood_props', 'glow_shrooms', tx, row));
    } else if (kind === 'forest') {
      [x0 + 3, x0 + 17].forEach((tx) => this.deco('pumpkinprops', 'jack_big', tx, row));
      [x0 + 7, x0 + 13].forEach((tx) => this.deco('pumpkinprops', 'scarecrow', tx, row));
      this.deco('pumpkinprops', 'pumpkins', x0 + 10, row);
    } else if (kind === 'yule') {
      [x0 + 3, x0 + 17].forEach((tx) => this.deco('xmasprops', 'tree', tx, row));
      [x0 + 7, x0 + 13].forEach((tx) => this.deco('xmasprops', 'lamppost', tx, row));
      this.deco('xmasprops', 'gifts', x0 + 10, row);
    } else if (kind === 'ramparts') {
      this.deco('arch', 'column', x0 + 3, row); this.deco('arch', 'column', x0 + 18, row);
      [x0 + 5, x0 + 15].forEach((tx) => this.deco('arch', 'banner', tx, row, 0, -48));
      this.deco('props', 'torch', x0 + 7, row, 0, -46); this.deco('props', 'torch', x0 + 13, row, 0, -46);
    } else if (kind === 'clockwork') {
      this.deco('arch', 'column', x0 + 3, row); this.deco('arch', 'column', x0 + 18, row);
      this.deco('props', 'torch', x0 + 5, row, 0, -46); this.deco('props', 'torch', x0 + 16, row, 0, -46);
    } else {
      this.deco('arch', 'column', x0 + 3, row); this.deco('arch', 'column', x0 + 18, row);
      [x0 + 5, x0 + 16].forEach((tx) => this.deco('arch', 'banner', tx, row, 0, -48));
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
    const rooms = t.outdoor ? [] : [{
      x0: 0, x1: cols - 1, y0: 0, y1: this.rows - 1,
      floorRow: this.row,
      wall: t.wall, parallax: t.wallParallax, dark: t.dark, edge: false, cylinder: !!t.cylinder,
    }];
    const startRow = this.startRow;
    return {
      id: this.id, name: this.name, subtitle: this.subtitle, theme: this.themeKey,
      cols, rows: this.rows,
      start: { x: px(2), y: py(startRow) },
      checkpoints: this.checkpoints,
      build(level) { ops.forEach((fn) => fn(level)); },
      rooms, decor: this.decor, movers: this.movers, blockDrops: this.blockDrops,
      candles: this.candles, enemies: this.enemies, spawners: this.spawners,
      boss: this.boss, platform: t.platform || 'platform', ally: t.ally || null,
    };
  }
}

export { px, py };
