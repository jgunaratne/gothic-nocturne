// Stage builder: composes a level from prefab segments with a theme, and
// records candles, enemies, spawners, 2.5D moving mechanisms, decor and the
// boss arena as it goes. Coordinates are tiles; `row` is the walking surface.

import {
  TILE, T_GROUND, T_STONE, T_CATACOMB, T_CLOCK, T_FOREST, T_SNOW, T_DARKWOOD, T_CAVERN,
  T_ALCHEMY, T_BALLROOM, T_COLISEUM, T_AQUEDUCT, T_SKYKEEP,
  T_LAVA, T_WATER, T_BLOCK, T_SPIKES,
} from '../engine/constants.js';
import { WING_PROP_FRAMES } from './castle_wings_assets.js';
import {
  ROOM_ARCHETYPES, PACING_ZONES, VISUAL_TELLS, createRoomSchemaEntry,
} from './level_schema.js';

export const THEMES = {
  graveyard: { outdoor: true, layers: 'outdoor', material: T_GROUND, wall: 'wall', wallParallax: 1, dark: 0.28, music: 'graveyard', bg: '#0b0a14', decor: 'graveyard', accent: '#9ad17a', platform: 'platform' },
  darkwood: { outdoor: true, layers: 'darkwood', material: T_DARKWOOD, wall: 'wall', wallParallax: 1, dark: 0.30, music: 'darkwood', bg: '#071115', decor: 'darkwood', accent: '#62e8b5', platform: 'platform_wood', weather: 'fireflies', ally: 'turtle' },
  forest: { outdoor: true, layers: 'forest', material: T_FOREST, wall: 'wall', wallParallax: 1, dark: 0.28, music: 'jack', bg: '#0b0a14', decor: 'forest', accent: '#ff9a3c', platform: 'platform_wood' },
  yule: { outdoor: true, layers: 'winter', material: T_SNOW, wall: 'wall', wallParallax: 1, dark: 0.28, music: 'yule', bg: '#0a0c18', decor: 'yule', accent: '#9ad8ff', platform: 'platform_wood', weather: 'snow' },
  ramparts: { outdoor: true, layers: 'ramparts', material: T_STONE, wall: 'wall', wallParallax: 1, dark: 0.28, music: 'ramparts', bg: '#0b0a14', decor: 'ramparts', accent: '#8a9ab5', platform: 'platform' },
  catacombs: { outdoor: false, layers: null, material: T_CATACOMB, wall: 'catacombwall', wallParallax: 0.6, dark: 0.32, music: 'catacombs', bg: '#050408', decor: 'crypt', accent: '#c9b58a', platform: 'platform' },
  darkcave: { outdoor: false, layers: null, material: T_CAVERN, wall: 'cavernwall', wallParallax: 0.58, dark: 0.28, music: 'darkcave', bg: '#090304', decor: 'cavern', accent: '#ff6228', platform: 'platform', weather: 'embers' },
  ossuary: { outdoor: false, layers: null, material: T_CATACOMB, wall: 'catacombwall', wallParallax: 0.6, dark: 0.34, music: 'ossuary', bg: '#040306', decor: 'crypt', accent: '#b7a9c9', platform: 'platform' },
  clocktower: { outdoor: false, layers: null, material: T_CLOCK, wall: 'clockwall', wallParallax: 0.5, dark: 0.30, music: 'tower', bg: '#06050a', decor: 'clockwork', accent: '#d9a44a', platform: 'platform_wood', cylinder: true },
  throne: { outdoor: false, layers: null, material: T_STONE, wall: 'wall', wallParallax: 0.7, dark: 0.24, music: 'throne', bg: '#0a0710', decor: 'castle', accent: '#e23c3c', platform: 'platform' },
  cathedral: { outdoor: false, layers: null, material: T_STONE, wall: 'cathedralwall', wallParallax: 0.7, dark: 0.22, music: 'cathedral', bg: '#0a0914', decor: 'cathedral', accent: '#ff5c7a', platform: 'platform' },
  library: { outdoor: false, layers: null, material: T_STONE, wall: 'librarywall', wallParallax: 0.7, dark: 0.28, music: 'library', bg: '#0b0812', decor: 'library', accent: '#b48cff', platform: 'platform_wood' },
  arcade: { outdoor: false, layers: null, material: T_STONE, wall: 'arcadewall', wallParallax: 0.7, dark: 0.26, music: 'arcade', bg: '#0c0810', decor: 'arcade', accent: '#e0b45a', platform: 'platform_wood' },
  alchemy: { base: 'library', outdoor: false, layers: null, material: T_ALCHEMY, wall: 'alchemywall', wallParallax: 0.68, dark: 0.26, music: 'alchemy', bg: '#070b12', decor: 'alchemy', accent: '#4ef2b8', platform: 'platform', props: { sheet: 'alchemy_props', frames: WING_PROP_FRAMES.alchemy } },
  ballroom: { base: 'throne', outdoor: false, layers: null, material: T_BALLROOM, wall: 'ballroomwall', wallParallax: 0.70, dark: 0.22, music: 'ballroom', bg: '#100712', decor: 'ballroom', accent: '#ff8ad4', platform: 'platform', props: { sheet: 'ballroom_props', frames: WING_PROP_FRAMES.ballroom } },
  coliseum: { base: 'ramparts', outdoor: false, layers: null, material: T_COLISEUM, wall: 'coliseumwall', wallParallax: 0.65, dark: 0.24, music: 'coliseum', bg: '#12080a', decor: 'coliseum', accent: '#ff6e54', platform: 'platform', props: { sheet: 'coliseum_props', frames: WING_PROP_FRAMES.coliseum } },
  aqueduct: { base: 'ossuary', outdoor: false, layers: null, material: T_AQUEDUCT, wall: 'aqueductwall', wallParallax: 0.60, dark: 0.26, music: 'aqueduct', bg: '#050c14', decor: 'aqueduct', accent: '#52d6ff', platform: 'platform', props: { sheet: 'aqueduct_props', frames: WING_PROP_FRAMES.aqueduct } },
  skykeep: { base: 'ramparts', outdoor: true, layers: 'skykeep', material: T_SKYKEEP, wall: 'wall', wallParallax: 1, dark: 0.26, music: 'skykeep', bg: '#0a1022', decor: 'skykeep', accent: '#c8f0ff', platform: 'platform', weather: 'fireflies', props: { sheet: 'skykeep_props', frames: WING_PROP_FRAMES.skykeep } },
};

const px = (tx) => tx * TILE + TILE / 2;
const py = (row) => row * TILE;

/** Registers a Castle Forge theme (inherits unspecified fields from its `base`). */
export function registerTheme(key, theme) {
  const base = THEMES[theme.base] || THEMES.graveyard;
  THEMES[key] = Object.assign({}, base, theme, { key });
  return THEMES[key];
}

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
  constructor({ id, key = null, name, subtitle = '', theme, rows = 14, startRow = 11, seed = 1 }) {
    this.id = id; this.biomeKey = key || theme; this.name = name; this.subtitle = subtitle;
    this.themeKey = theme; this.theme = THEMES[theme];
    this.rows = rows; this.row = startRow; this.startRow = startRow; this.x = 0;
    this.mat = this.theme.material;
    this.rng = mulberry32(seed * 7919 + 13);
    this.ops = []; this.candles = []; this.enemies = []; this.spawners = [];
    this.decor = []; this.movers = []; this.blockDrops = {};
    this.checkpoints = [px(2)];
    this.boss = null;
    this.roomSchema = [];
    this.doorAnchors = {};
    this.sanctuaryAnchor = null;
    this.vesselAnchor = null;
    this.secretCell = null;
    this.secrets = [];
    this.waterBasins = [];
  }

  // ------------------------------------------------------------ helpers
  op(fn) { this.ops.push(fn); return this; }
  chance(p) { return this.rng() < p; }
  pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }
  candle(tx, row, drop = null) { this.candles.push([tx, row, drop]); }
  deco(sheet, frame, tx, row, dx = 0, dy = 0) { this.decor.push({ sheet, frame, x: px(tx) + dx, y: py(row) + dy }); }
  gear(tx, row, r, speed, dy, z = 56) { this.decor.push({ type: 'gear', x: px(tx), y: py(row) + dy, r, speed, z }); }
  waterBasin(x0Tile, x1Tile, surfaceY, bottomY, opts = {}) {
    if (x1Tile < x0Tile) return this;
    const floorY = Math.round(((bottomY != null ? bottomY - 3 : surfaceY + 8)) / TILE) * TILE;
    this.waterBasins.push(Object.assign({
      x: x0Tile * TILE + 4,
      y: floorY - 5,
      w: (x1Tile - x0Tile + 1) * TILE - 8,
      h: 9,
      floorY,
      curbs: true,
    }, opts));
    return this;
  }
  checkpoint() { this.checkpoints.push(px(this.x)); return this; }

  /** Adds enemies described relative to a segment: [type, offset, opts]. */
  placeEnemies(list, x0, x1, row) {
    for (const [type, off, o = {}] of list || []) {
      const tx = x0 + off;
      const base = { type, tx, variant: o.variant || 'normal', min: o.min == null ? x0 : o.min, max: o.max == null ? x1 : o.max };
      if (type === 'bat' || type === 'dragon' || type === 'owl' || type === 'ghost' || type === 'tome' || type === 'gargoyle' || type === 'cinderimp' || type === 'wraith') this.enemies.push(Object.assign(base, { ty: row - (o.h || 5) }));
      else this.enemies.push(Object.assign(base, { row: o.row == null ? row : o.row }));
    }
  }

  /** Bay-aligned, architecturally grounded decoration for flat runs (no random scatter). */
  autoDecor(x0, x1, row, density = 1) {
    if (density <= 0 || x1 - x0 < 5) return;
    const kind = this.theme.decor;
    const fp = this.theme.props;   // forged wings: { sheet, frames: [...] } generated props
    const safeStart = x0 + 2;
    const safeEnd = x1 - 2;
    if (safeEnd < safeStart) return;

    // Place at symmetric 8-tile architectural bay centers (matching Stage3D BAY_W = 8 * TILE)
    let bayIdx = 0;
    for (let tx = safeStart + 2; tx <= safeEnd; tx += 8, bayIdx++) {
      if (tx + 3 <= safeEnd && bayIdx % 2 === 0) {
        if (kind === 'clockwork' || kind === 'alchemy') {
          this.decor.push({ type: 'pendulum', x: px(tx + 3), y: py(row) - 250, len: 162, r: 22, period: 2.8, phase: (bayIdx * 1.57) % 6.28 });
        } else if (kind === 'castle' || kind === 'ballroom' || kind === 'arcade' || kind === 'library' || kind === 'cathedral') {
          this.decor.push({ type: 'chandelier', x: px(tx + 3), y: py(row) - 290, len: 92, r: 28, phase: (bayIdx * 1.57) % 6.28 });
        } else if (kind === 'crypt' || kind === 'cavern' || kind === 'coliseum' || kind === 'aqueduct') {
          this.decor.push({ type: 'cage', x: px(tx + 3), y: py(row) - 226, len: 72, phase: (bayIdx * 1.57) % 6.28 });
        }
      }
      if (fp && fp.frames && fp.frames.length) {
        this.deco(fp.sheet, fp.frames[bayIdx % fp.frames.length], tx, row);
        if (tx + 4 <= safeEnd) {
          this.deco('props', this.theme.outdoor ? 'shrub' : 'torch', tx + 4, row, 0, this.theme.outdoor ? 0 : -46);
        }
        continue;
      }
      if (kind === 'graveyard') {
        this.deco('props', bayIdx % 3 === 1 ? 'shrub' : 'tombstone', tx, row);
      } else if (kind === 'castle' || kind === 'ramparts') {
        this.deco('arch', bayIdx % 2 === 0 ? 'column' : 'banner', tx, row, 0, bayIdx % 2 === 0 ? 0 : -48);
        if (tx + 4 <= safeEnd) this.deco('props', 'torch', tx + 4, row, 0, -46);
      } else if (kind === 'crypt') {
        this.deco(bayIdx % 2 === 0 ? 'arch' : 'props', bayIdx % 2 === 0 ? 'column' : 'tombstone', tx, row);
        if (tx + 4 <= safeEnd) this.deco('props', 'torch', tx + 4, row, 0, -46);
      } else if (kind === 'clockwork') {
        this.gear(tx, row, bayIdx % 2 === 0 ? 38 : 50, bayIdx % 2 === 0 ? 0.45 : -0.55, -96, 68);
        if (tx + 4 <= safeEnd) this.deco('props', 'torch', tx + 4, row, 0, -46);
      } else if (kind === 'cathedral') {
        this.deco('stained_glass', ['rose', 'hunter', 'moon'][bayIdx % 3], tx, row, 0, -70);
        if (tx + 3 <= safeEnd) this.deco('cathedral_props', bayIdx % 2 === 0 ? 'pew' : 'angel', tx + 3, row);
      } else if (kind === 'library') {
        this.deco('library_props', ['bookcase', 'lectern', 'globe', 'tomes'][bayIdx % 4], tx, row);
        if (tx + 4 <= safeEnd) this.deco('props', 'torch', tx + 4, row, 0, -46);
      } else if (kind === 'arcade') {
        this.deco('arcade_props', ['sage_cabinet', 'oracle_engine', 'zoetrope', 'chess_automaton'][bayIdx % 4], tx, row);
        if (tx + 4 <= safeEnd) this.deco('props', 'torch', tx + 4, row, 0, -46);
      } else if (kind === 'darkwood') {
        this.deco('darkwood_props', ['moss_lantern', 'ancient_totem', 'elder_stump', 'glow_shrooms'][bayIdx % 4], tx, row);
      } else if (kind === 'forest') {
        this.deco('pumpkinprops', ['jack_big', 'scarecrow', 'pumpkins', 'jack_small'][bayIdx % 4], tx, row);
      } else if (kind === 'yule') {
        this.deco('xmasprops', ['lamppost', 'tree', 'gifts', 'stump'][bayIdx % 4], tx, row);
      } else if (kind === 'cavern') {
        this.deco('cavern_props', ['obsidian_pillar', 'brazier', 'stalagmite', 'magma_vent'][bayIdx % 4], tx, row);
      }
    }
  }

  // ------------------------------------------------------------ guideline room archetypes

  /** Places a memorable biome-specific landmark prop (`STATUE`, `LIGHT_SHAFT`, etc.) for LANDMARK_GATE / SAVE_ROOM. */
  landmarkProp(tx, row, slot = 0) {
    const kind = this.theme.decor;
    const fp = this.theme.props;
    if (fp && fp.frames && fp.frames.length) {
      this.deco(fp.sheet, fp.frames[slot % fp.frames.length], tx, row);
      return;
    }
    if (kind === 'cathedral') {
      if (slot % 2 === 0) this.deco('cathedral_props', 'angel', tx, row);
      else this.deco('stained_glass', 'rose', tx, row, 0, -76);
    } else if (kind === 'library') {
      this.deco('library_props', slot % 2 === 0 ? 'globe' : 'bookcase', tx, row);
    } else if (kind === 'arcade') {
      this.deco('arcade_props', slot % 2 === 0 ? 'sage_cabinet' : 'oracle_engine', tx, row);
    } else if (kind === 'darkwood') {
      this.deco('darkwood_props', slot % 2 === 0 ? 'ancient_totem' : 'moss_lantern', tx, row);
    } else if (kind === 'forest') {
      this.deco('pumpkinprops', slot % 2 === 0 ? 'jack_big' : 'scarecrow', tx, row);
    } else if (kind === 'yule') {
      this.deco('xmasprops', slot % 2 === 0 ? 'tree' : 'lamppost', tx, row);
    } else if (kind === 'cavern') {
      this.deco('cavern_props', slot % 2 === 0 ? 'obsidian_pillar' : 'brazier', tx, row);
    } else if (kind === 'graveyard') {
      this.deco('props', 'tombstone', tx, row);
    } else {
      this.deco('arch', 'column', tx, row);
      if (slot % 2 === 1) this.deco('arch', 'banner', tx, row, 0, -48);
    }
  }

  /**
   * Wraps geometry emitted by `fn(this)` into an explicit Section-5 `roomSchema`
   * entry mapped directly to `mapCells` (plus optional upper/lower extra cells).
   */
  room(archetype, mapCells, fn, o = {}) {
    const x0 = this.x;
    const entryRow = this.row;
    const idx = this.roomSchema.length + 1;
    const roomId = o.id || `${this.biomeKey}_r${String(idx).padStart(2, '0')}`;
    if (o.saveRoom) this.checkpoint();
    this._lastVessel = null;
    fn(this);
    const autoVessel = this._lastVessel;
    this._lastVessel = null;
    const x1 = Math.max(x0, this.x - 1);
    const exitRow = this.row;
    const minR = Math.max(0, Math.min(entryRow, exitRow) - (o.extraTop || 6));
    const maxR = Math.min(this.rows - 1, Math.max(entryRow, exitRow) + (o.extraBottom || 3));

    const doorsMeta = [];
    for (const d of o.doors || []) {
      const col = d.col != null ? d.col : (x0 + (d.offset != null ? d.offset : Math.floor((x1 - x0) * 0.5)));
      const floorRow = d.floorRow != null ? d.floorRow : (entryRow + (d.floorDelta || 0));
      const gateRow = d.highLedge ? floorRow - 5 : floorRow;
      this.doorAnchors[d.id] = { col, floorRow, gateRow, highLedge: !!d.highLedge };
      doorsMeta.push({
        door_id: d.id,
        position: { x: col - x0, y: gateRow },
        world_col: col,
        target_room: d.target || null,
        lock_type: d.lock || (d.highLedge ? 'DOUBLE_JUMP' : 'NONE'),
        safe_buffer_verified: true,
      });
    }

    if (o.sanctuary) {
      const sCol = typeof o.sanctuary === 'object' && o.sanctuary.col != null
        ? o.sanctuary.col
        : (x0 + (typeof o.sanctuary === 'number' ? o.sanctuary : Math.floor((x1 - x0) * 0.5)));
      const sRow = (typeof o.sanctuary === 'object' && o.sanctuary.row != null) ? o.sanctuary.row : entryRow;
      this.sanctuaryAnchor = { col: sCol, row: sRow };
    }

    const secretsMeta = [...(o.secrets || [])];
    const vesselSpec = o.vessel || autoVessel;
    if (vesselSpec) {
      const vCol = vesselSpec.col != null ? vesselSpec.col : (x0 + (vesselSpec.offset != null ? vesselSpec.offset : Math.floor((x1 - x0) * 0.5)));
      const vRow = vesselSpec.row != null ? vesselSpec.row : entryRow;
      const tells = vesselSpec.visualTells || [VISUAL_TELLS.VISIBLE_REWARD, VISUAL_TELLS.PROP_CONTINUATION];
      this.vesselAnchor = {
        col: vCol,
        row: vRow,
        highBalcony: !!vesselSpec.highBalcony,
        visualTells: tells,
      };
      if (o.secretCell) this.secretCell = o.secretCell;
      const secEntry = {
        secret_id: `${this.biomeKey}_vessel`,
        position: { x: vCol - x0, y: vRow },
        world_col: vCol,
        lock_type: vesselSpec.highBalcony ? 'DOUBLE_JUMP' : 'NONE',
        visual_tell: tells[0],
        visual_tells: tells,
      };
      secretsMeta.push(secEntry);
      this.secrets.push(secEntry);
    }

    this.roomSchema.push(createRoomSchemaEntry({
      room_id: roomId,
      archetype,
      pacing_zone: o.pacing || PACING_ZONES.INTRO_SAFE,
      biome: this.biomeKey,
      x0,
      x1,
      entryRow,
      exitRow,
      minRow: minR,
      maxRow: maxR,
      map_cells: mapCells,
      upper_cells: o.upperCells || [],
      upper_high_cells: o.upperHighCells || [],
      lower_cells: o.lowerCells || [],
      lower_deep_cells: o.lowerDeepCells || [],
      secret_cell: o.secretCell || null,
      sanctuary: !!o.sanctuary,
      save_room: !!o.saveRoom,
      doors: doorsMeta,
      secrets: secretsMeta,
      required_abilities: o.requiredAbilities || ['NONE'],
      max_vertical_step_tiles: o.maxVStep || 2.0,
      max_horizontal_gap_tiles: o.maxHGap || 2.0,
    }));
    return this;
  }

  /**
   * Section 3.1 `BUFFER_TRANSITION` (exact single-screen `20 tiles` default):
   * Zero enemies, zero spawners, zero hazards, 100% flat solid floor.
   * Used for biome borders, central Sanctuary rooms, and calm Pre-Boss `SAVE_ROOM`s.
   */
  bufferRoom(len = 20, o = {}) {
    const x0 = this.x, x1 = x0 + len - 1, row = this.row;
    const mid = x0 + Math.floor(len * 0.5);
    this.op((lv) => {
      if (o.vista) lv.bridge(x0, x1, row, this.mat);
      else lv.ground(x0, x1, row, this.mat);
      if (o.highDoorCol != null && row >= 7) {
        lv.platform(o.highDoorCol - 2, o.highDoorCol + 2, row - 5);
      }
    });
    if (o.saveRoom) {
      this.candle(x0 + 4, row, 'heart_big');
      this.candle(x1 - 4, row, 'heart_big');
      this.candle(mid, row, o.drop || 'meat');
    } else {
      this.candle(x0 + 4, row, o.drop || null);
      this.candle(x1 - 4, row, 'heart_big');
    }
    this.landmarkProp(x0 + 2, row, 0);
    this.landmarkProp(x1 - 2, row, 1);
    if (!this.theme.outdoor) {
      this.deco('props', 'torch', x0 + 6, row, 0, -46);
      this.deco('props', 'torch', x1 - 6, row, 0, -46);
    }
    if (o.waterPool || (this.themeKey === 'aqueduct' && !o.dry)) {
      this.waterBasin(x0 + 3, x1 - 3, py(row) - 9, py(row) + 3, { alpha: 0.78 });
    }
    this.x += len;
    return this;
  }

  /**
   * Section 3.1 `CORRIDOR_HORIZONTAL` (Dual-Layer Highway, >= 20-32 tiles wide):
   * - Lower path: ground enemies + fair terrain obstacles (<= 2-tile steps/gaps).
   * - Upper path (`row - 4`, accessed symmetrically via `row - 2` steps at BOTH ends):
   *   unobstructed horizontal speedway so late-game players cross in < 4 seconds!
   */
  corridorDual(len = 24, o = {}) {
    const x0 = this.x, x1 = x0 + len - 1, row = this.row;
    const uRow = row - 4;
    const mid = Math.floor((x0 + x1) * 0.5);
    this.op((lv) => {
      if (o.vista) lv.bridge(x0, x1, row, this.mat);
      else lv.ground(x0, x1, row, this.mat);

      // Optional fair lower-road terrain obstacle in the center of the corridor
      if (o.obstacle === 'crumbleSafe') {
        lv.fill(mid - 1, mid + 1, row, row + 1, 0);
        lv.ground(mid - 2, mid + 2, row + 2, this.mat);
        lv.crumble(mid - 1, mid + 1, row);
      } else if (o.obstacle === 'spikeBridge') {
        lv.fill(mid - 2, mid + 2, row, row + 1, 0);
        lv.ground(mid - 2, mid + 2, row + 2, this.mat);
        lv.fill(mid - 2, mid + 2, row + 1, row + 1, T_SPIKES);
        lv.platform(mid - 1, mid + 1, row - 1);
      } else if (o.obstacle === 'lavaStepping') {
        lv.fill(mid - 3, mid + 3, row, row + 2, 0);
        lv.ground(mid - 3, mid + 3, Math.min(this.rows - 1, row + 3), this.mat);
        lv.fill(mid - 3, mid + 3, row + 1, Math.min(this.rows - 1, row + 2), T_LAVA);
        lv.ground(mid - 1, mid + 1, row, this.mat);
      } else if (o.obstacle === 'waterCanal') {
        lv.ground(mid - 4, mid + 4, row, this.mat);
        lv.fill(mid - 3, mid + 3, row, row + 1, T_WATER);
        lv.ground(mid - 3, mid + 3, Math.min(this.rows - 1, row + 2), this.mat);
        lv.ground(mid - 1, mid, row, this.mat);
      }

      // Symmetric walkable mezzanine stairs on BOTH ends -> fast continuous upper speedway (`row - 4`)
      lv.stair(x0 + 1, row, x0 + 5, uRow, { passThrough: true, mat: this.mat, railing: true });
      lv.stair(x1 - 4, uRow, x1, row, { passThrough: true, mat: this.mat, railing: true });
      lv.platform(x0 + 5, mid - 2, uRow);
      lv.platform(mid + 1, x1 - 5, uRow);
    });

    this.candle(x0 + 3, row);
    this.candle(x1 - 3, row);
    this.candle(x0 + 7, uRow, o.reward || 'heart_big');
    this.candle(x1 - 7, uRow, o.weapon || 'money');

    if (o.enemies) {
      this.placeEnemies(o.enemies, x0, x1, row);
    } else {
      this.placeEnemies([
        ['skeleton', 6, { min: x0 + 4, max: mid - 3 }],
        ['armor', Math.max(len - 7, mid - x0 + 4), { min: mid + 3, max: x1 - 3 }],
      ], x0, x1, row);
    }
    if (o.upperEnemies) this.placeEnemies(o.upperEnemies, x0, x1, uRow);
    if (o.spawn) this.spawners.push({ type: o.spawn, x0: x0 + 2, x1: x1 - 2, variant: o.spawnVariant || 'normal' });
    if (!o.vista) this.autoDecor(x0, x1, row, 0.85);
    this.autoDecor(x0 + 5, x1 - 5, uRow, 0.45);
    this.x += len;
    return this;
  }

  /**
   * Section 3.1 `ARENA_COMBAT` (Set-Piece Combat Hall, 20-24 tiles wide):
   * - Flat solid floor across 100% (>= 70%) of room width.
   * - 2 elevated pass-through platforms at height `row - 3` (with `row - 2` side steps)
   *   for vertical dodging over heavy shield guards and around elevated turrets.
   */
  combatArena(len = 22, o = {}) {
    const x0 = this.x, x1 = x0 + len - 1, row = this.row;
    const p1x0 = x0 + 5, p1x1 = x0 + 8;
    const p2x0 = x1 - 8, p2x1 = x1 - 5;
    this.op((lv) => {
      if (o.vista) lv.bridge(x0, x1, row, this.mat);
      else lv.ground(x0, x1, row, this.mat);
      lv.platform(x0 + 2, x0 + 3, row - 2);
      lv.platform(x1 - 3, x1 - 2, row - 2);
      lv.platform(p1x0, p1x1, row - 3);
      lv.platform(p2x0, p2x1, row - 3);
    });
    this.candle(p1x0 + 1, row - 3, o.drop || 'heart_big');
    this.candle(p2x0 + 2, row - 3, o.weapon || 'money');
    this.candle(x0 + Math.floor(len * 0.5), row);
    this.placeEnemies(o.enemies || [
      ['armor', Math.floor(len * 0.36), { min: x0 + 3, max: x1 - 4 }],
      ['skeleton', p2x0 - x0 + 1, { variant: 'axe', min: p2x0, max: p2x1, row: row - 3 }],
    ], x0, x1, row);
    if (o.spawn) this.spawners.push({ type: o.spawn, x0: x0 + 2, x1: x1 - 2, variant: o.spawnVariant || 'normal' });
    if (!o.vista) this.autoDecor(x0, x1, row, 0.9);
    if (o.waterPool || (this.themeKey === 'aqueduct' && !o.vista && !o.dry)) {
      this.waterBasin(x0 + 3, x1 - 3, py(row) - 9, py(row) + 3, { alpha: 0.78 });
    }
    this.x += len;
    return this;
  }

  /**
   * Section 3.1 `SHAFT_VERTICAL` (Switchback Elevator Shaft, 16-20 tiles wide):
   * - `deltaRows < 0` ascends `|deltaRows|` rows; `deltaRows > 0` descends `deltaRows` rows.
   * - Alternating left/right 3-tile switchback ledges strictly every 2 rows (`<= 2.0` tile step,
   *   `<= 1.0` tile horizontal gap in BOTH directions).
   * - 100% solid forgiving floor across the shaft base (ZERO bottomless kill-pits!).
   * - Chain, torch, and candle breadcrumb visual guides along drops > 8 tiles.
   */
  shaftVertical(deltaRows, o = {}) {
    const len = o.len || 18;
    const x0 = this.x, x1 = x0 + len - 1;
    const entryRow = this.row;
    const exitRow = Math.max(5, Math.min(this.rows - 3, entryRow + deltaRows));
    const topRow = Math.min(entryRow, exitRow);
    const botRow = Math.max(entryRow, exitRow);
    const ascending = exitRow < entryRow;
    const shaftH = botRow - topRow;
    const steps = Math.max(1, Math.ceil(shaftH / 2));
    // Shaft well sits in the middle (`x0 + 4 .. x0 + 11`), flanked by entry/exit stone terraces
    const leftLedgeX = x0 + 5;   // 5..7 (3 tiles)
    const rightLedgeX = x0 + 9;  // 9..11 (3 tiles, 1-tile gap from 5..7!)

    this.op((lv) => {
      if (ascending) {
        // Solid forgiving floor from entry all the way under the shaft well (`x0 .. x0 + 12`)
        lv.ground(x0, x0 + 12, botRow, this.mat);
        lv.ground(x0 + 12, x1, topRow, this.mat);
        for (let i = 1; i <= steps; i++) {
          const r = Math.max(topRow + 1, botRow - i * 2);
          if (r <= topRow) break;
          const useRight = (i % 2 === 0);
          const lx = useRight ? rightLedgeX : leftLedgeX;
          lv.platform(lx, lx + 2, r);
        }
        // Guarantee top-most switchback sits at `rightLedgeX` (`x0+9..11`, 0-tile gap to `x0+12`!) within <= 2 rows of `topRow`
        lv.platform(rightLedgeX, rightLedgeX + 2, Math.min(botRow - 1, topRow + 2));
      } else {
        // Descending from `x0 .. x0 + 4` (`topRow`) into solid forgiving floor `x0 + 5 .. x1` (`botRow`)
        lv.ground(x0, x0 + 4, topRow, this.mat);
        lv.ground(x0 + 5, x1, botRow, this.mat);
        for (let i = 1; i <= steps; i++) {
          const r = Math.min(botRow - 1, topRow + i * 2);
          if (r >= botRow) break;
          // i=1 MUST sit at `leftLedgeX` (`x0+5..7`, 0-tile gap from `x0+4`!) so right-to-left climb has 0 horizontal gap!
          const useLeft = (i % 2 === 1);
          const lx = useLeft ? leftLedgeX : rightLedgeX;
          lv.platform(lx, lx + 2, r);
        }
        if (shaftH >= 3) {
          lv.platform(rightLedgeX, rightLedgeX + 2, Math.max(topRow + 1, botRow - 2));
        }
      }
    });

    if (o.lift !== false && shaftH >= 4) {
      const liftX = (x0 + 8) * TILE;
      this.movers.push({
        kind: 'linear',
        tiles: 2,
        x0: liftX,
        y0: py(botRow),
        x1: liftX,
        y1: py(topRow + 2),
        period: o.period || Math.max(4.8, shaftH * 0.55),
        phase: o.phase || 0,
        dwell: 0.14,
      });
    }

    // Visual guide props & breadcrumb candles along the vertical fall vector (Section 3.2 No Blind Drops)
    for (let r = topRow + 2; r < botRow; r += 4) {
      this.deco('arch', 'chain', x0 + 8, r, 0, -32);
      if (!this.theme.outdoor) this.deco('props', 'torch', x0 + 6, r, 0, -28);
      this.candle(x0 + 6, r, r === topRow + 2 ? (o.reward || 'heart_big') : null);
    }
    this.candle(x0 + 2, entryRow);
    this.candle(x1 - 2, exitRow, o.exitDrop || 'heart_big');

    if (o.enemies) {
      this.placeEnemies(o.enemies, x0, x1, botRow);
    } else {
      this.placeEnemies([
        ['bat', 7, { h: Math.min(6, Math.max(3, Math.floor(shaftH * 0.5))) }],
        ['skeleton', len - 4, { min: x0 + 12, max: x1 - 1, row: exitRow }],
      ], x0, x1, botRow);
    }
    if (o.spawn) this.spawners.push({ type: o.spawn, x0: x0 + 3, x1: x1 - 3, variant: o.spawnVariant || 'normal' });
    this.autoDecor(ascending ? x0 : x0 + 6, ascending ? x0 + 4 : x1, botRow, 0.65);
    this.x += len;
    this.row = exitRow;
    return this;
  }

  /**
   * Section 3.1 `LANDMARK_GATE` (Ability Lock & Doorway Showcase, 20 tiles wide):
   * - Flat 20-tile stone hall with 0 hazards, 0 enemies, and 0 spawners in the doorway safe zone.
   * - If `o.highLedge`, constructs a 5.0-tile (`row - 5`) Night-Wings balcony (`>= J_max + 1.5`)
   *   with ZERO intermediate stepping ledges so single-jump sequence breaking is impossible.
   * - Pairs the gateway with twin biome landmark statues/stained-glass/totems.
   */
  landmarkGate(len = 20, o = {}) {
    const x0 = this.x, x1 = x0 + len - 1, row = this.row;
    const gateCol = x0 + (o.gateOffset != null ? o.gateOffset : Math.floor(len * 0.5));
    this.op((lv) => {
      if (o.vista) lv.bridge(x0, x1, row, this.mat);
      else lv.ground(x0, x1, row, this.mat);
      if (o.highLedge && row >= 7) {
        lv.platform(Math.max(x0 + 4, gateCol - 4), Math.min(x1 - 4, gateCol + 4), row - 5);
      }
    });
    this.landmarkProp(Math.max(x0 + 2, gateCol - 4), row, 0);
    this.landmarkProp(Math.min(x1 - 2, gateCol + 4), row, 1);
    if (o.highLedge && row >= 7) {
      this.deco('arch', 'chain', gateCol - 3, row - 5, 0, -32);
      this.deco('arch', 'chain', gateCol + 3, row - 5, 0, -32);
    }
    if (!this.theme.outdoor) {
      this.deco('props', 'torch', Math.max(x0 + 1, gateCol - 3), row, 0, -46);
      this.deco('props', 'torch', Math.min(x1 - 1, gateCol + 3), row, 0, -46);
      this.decor.push({ type: 'chandelier', x: px(gateCol), y: py(row) - 284, len: 82, r: 28, phase: 0.8 });
    }
    this.candle(x0 + 2, row, o.drop || 'heart_big');
    this.candle(x1 - 2, row);
    if (o.waterPool || (this.themeKey === 'aqueduct' && !o.vista && !o.dry)) {
      this.waterBasin(x0 + 2, Math.max(x0 + 3, gateCol - 3), py(row) - 8, py(row) + 2, { alpha: 0.76 });
      this.waterBasin(Math.min(x1 - 3, gateCol + 3), x1 - 2, py(row) - 8, py(row) + 2, { alpha: 0.76 });
    }
    this.x += len;
    return this;
  }

  /**
   * Section 3.1 `LANDMARK_GATE` with an accessible 2-step Upper Terrace (`row - 4`, 22 tiles wide):
   * Used when a non-highLedge doorway sits on an `upperCells` map cell (`[c, r - 1]`).
   * Symmetric `row - 2` steps at both ends lead onto a 12-tile flat `row - 4` terrace (`x0+5..x1-5`)
   * with `0` enemies, `0` spawners, and `0` hazards.
   */
  upperTerraceGate(len = 22, o = {}) {
    const x0 = this.x, x1 = x0 + len - 1, row = this.row;
    const gateCol = x0 + (o.gateOffset != null ? o.gateOffset : Math.floor(len * 0.5));
    const uRow = row - 4;
    this.op((lv) => {
      if (o.vista) lv.bridge(x0, x1, row, this.mat);
      else lv.ground(x0, x1, row, this.mat);
      lv.stair(x0 + 1, row, x0 + 5, uRow, { passThrough: true, mat: this.mat, railing: true });
      lv.stair(x1 - 4, uRow, x1, row, { passThrough: true, mat: this.mat, railing: true });
      lv.platform(x0 + 5, x1 - 5, uRow);
    });
    this.landmarkProp(x0 + 4, row, 0);
    this.landmarkProp(x1 - 4, row, 1);
    if (!this.theme.outdoor) {
      this.deco('props', 'torch', gateCol - 3, uRow, 0, -42);
      this.deco('props', 'torch', gateCol + 3, uRow, 0, -42);
    }
    this.candle(x0 + 2, row, o.drop || 'heart_big');
    this.candle(x1 - 2, row);
    if (o.waterPool || (this.themeKey === 'aqueduct' && !o.vista && !o.dry)) {
      this.waterBasin(x0 + 2, Math.max(x0 + 3, gateCol - 3), py(row) - 8, py(row) + 2, { alpha: 0.76 });
      this.waterBasin(Math.min(x1 - 3, gateCol + 3), x1 - 2, py(row) - 8, py(row) + 2, { alpha: 0.76 });
    }
    this.x += len;
    return this;
  }

  /**
   * Section 3.1 `LANDMARK_GATE` with a Sunken Undercroft Porch (`row + 4`, 22 tiles wide):
   * Used when a doorway sits on a `lowerCells` map cell (`[c, r + 1..k]`).
   * Main floor passes across `row` via an overhead pass-through span (`x0+6..x1-6`), while
   * symmetric `row + 2` stairwells descend into a 16-tile flat `row + 4` stone porch (`x0+3..x1-3`)
   * with `0` enemies, `0` spawners, and `0` hazards.
   */
  sunkenGate(len = 22, o = {}) {
    const x0 = this.x, x1 = x0 + len - 1, row = this.row;
    const gateCol = x0 + (o.gateOffset != null ? o.gateOffset : Math.floor(len * 0.5));
    const sRow = Math.min(this.rows - 2, row + 4);
    this.op((lv) => {
      lv.ground(x0, x0 + 2, row, this.mat);
      lv.ground(x1 - 2, x1, row, this.mat);
      lv.ground(x0 + 3, x1 - 3, sRow, this.mat);
      lv.fill(x0 + 3, x1 - 3, row + 1, sRow - 1, 0);
      lv.platform(x0 + 3, x1 - 3, row);
      lv.stair(x0 + 3, row, x0 + 7, sRow, { passThrough: true, mat: this.mat, railing: true });
      lv.stair(x1 - 6, sRow, x1 - 2, row, { passThrough: true, mat: this.mat, railing: true });
    });
    this.landmarkProp(gateCol - 4, sRow, 0);
    this.landmarkProp(gateCol + 4, sRow, 1);
    this.deco('arch', 'chain', x0 + 4, row + 2, 0, -48);
    this.deco('arch', 'chain', x1 - 4, row + 2, 0, -48);
    if (!this.theme.outdoor) {
      this.deco('props', 'torch', gateCol - 3, sRow, 0, -42);
      this.deco('props', 'torch', gateCol + 3, sRow, 0, -42);
    }
    this.candle(x0 + 1, row, o.drop || 'heart_big');
    this.candle(x1 - 1, row);
    if (o.waterPool || this.themeKey === 'aqueduct') {
      this.waterBasin(x0 + 3, Math.max(x0 + 4, gateCol - 3), py(sRow) - 9, py(sRow) + 3, { alpha: 0.80 });
      this.waterBasin(Math.min(x1 - 4, gateCol + 3), x1 - 3, py(sRow) - 9, py(sRow) + 3, { alpha: 0.80 });
    }
    this.x += len;
    return this;
  }

  /**
   * Section 4.3 Fair Secret Alcove (`mode: 'vault' | 'balcony'`, 20 tiles wide):
   * Houses the biome's Ancient Life Vessel with explicit programmatic `visual_tell`s:
   * - `'vault'`: Sunken chamber (`row + 4`) beneath fissured `T_BLOCK` slabs (`SPRITE_VARIANT_CRACKED`),
   *   chains continuing through the floor (`PROP_CONTINUATION`), visible golden shrine below
   *   (`VISIBLE_REWARD` + `CAMERA_BLEED`), and symmetric `row + 2` climb-out ledges.
   * - `'balcony'`: 5-tile (`row - 5`) Night-Wings clerestory balcony (`>= J_max + 1.5` hard lock)
   *   with `VISIBLE_REWARD` + `PROP_CONTINUATION` chains and zero intermediate stepping ledges.
   */
  secretChamber(len = 20, o = {}) {
    const x0 = this.x, x1 = x0 + len - 1, row = this.row;
    const mid = x0 + Math.floor(len * 0.5);
    const mode = o.mode || 'vault';
    if (mode === 'balcony' && row >= 7) {
      const bRow = row - 5;
      this.op((lv) => {
        if (o.vista) lv.bridge(x0, x1, row, this.mat);
        else lv.ground(x0, x1, row, this.mat);
        lv.platform(Math.max(x0 + 4, mid - 4), Math.min(x1 - 4, mid + 4), bRow);
      });
      this.deco('arch', 'chain', mid - 2, bRow, 0, -48);
      this.deco('arch', 'chain', mid + 2, bRow, 0, -48);
      this.landmarkProp(mid - 4, row, 0);
      this.landmarkProp(mid + 4, row, 1);
      this.candle(mid - 2, bRow, o.reward || 'meat');
      this.candle(x0 + 3, row);
      this.candle(x1 - 3, row);
      if (o.enemies) this.placeEnemies(o.enemies, x0, x1, row);
      if (!o.vista) this.autoDecor(x0, x1, row, 0.7);
      this._lastVessel = {
        col: mid,
        row: bRow,
        highBalcony: true,
        visualTells: [VISUAL_TELLS.VISIBLE_REWARD, VISUAL_TELLS.PROP_CONTINUATION],
      };
    } else {
      const vx0 = mid - 4, vx1 = mid + 4;
      const vFloor = Math.min(this.rows - 2, row + 4);
      this.op((lv) => {
        lv.ground(x0, x1, row, this.mat);
        lv.fill(vx0, vx1, row + 1, vFloor - 1, 0);
        lv.ground(vx0, vx1, vFloor, this.mat);
        // Fissured breakable entry & exit hatches on both sides of the vault roof
        lv.set(vx0 + 1, row, T_BLOCK);
        lv.set(vx0 + 2, row, T_BLOCK);
        lv.set(vx1 - 2, row, T_BLOCK);
        lv.set(vx1 - 1, row, T_BLOCK);
        // Symmetric 2-tile climb-out ledges (`vFloor -> row + 2 -> row`)
        lv.platform(vx0 + 1, vx0 + 2, row + 2);
        lv.platform(vx1 - 2, vx1 - 1, row + 2);
      });
      this.blockDrops[`${vx0 + 1},${row}`] = 'money';
      // Visual tells: chains & torches continuing directly down through the vault boundary!
      this.deco('arch', 'chain', vx0 + 1, row + 2, 0, -48);
      this.deco('arch', 'chain', vx1 - 1, row + 2, 0, -48);
      if (!this.theme.outdoor) {
        this.deco('props', 'torch', mid - 2, vFloor, 0, -42);
        this.deco('props', 'torch', mid + 2, vFloor, 0, -42);
      }
      this.candle(mid - 2, vFloor, o.reward || 'meat');
      this.candle(mid + 2, vFloor, o.weapon || 'holy_water');
      this.candle(x0 + 3, row);
      this.candle(x1 - 3, row);
      if (o.enemies) this.placeEnemies(o.enemies, x0, x1, row);
      this.autoDecor(x0, x1, row, 0.7);
      this._lastVessel = {
        col: mid,
        row: vFloor,
        highBalcony: false,
        visualTells: [
          VISUAL_TELLS.SPRITE_VARIANT_CRACKED,
          VISUAL_TELLS.PROP_CONTINUATION,
          VISUAL_TELLS.VISIBLE_REWARD,
          VISUAL_TELLS.CAMERA_BLEED,
        ],
      };
    }
    this.x += len;
    return this;
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
    const fp = this.theme.props;
    for (let tx = x0 + 2; tx <= x1 - 2; tx += 6) {
      if (fp && fp.frames && fp.frames.length) this.deco(fp.sheet, fp.frames[(tx >> 1) % fp.frames.length], tx, row);
      else if (kind === 'yule') this.deco('xmasprops', 'lamppost', tx, row);
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
      const flooded = o.water || this.themeKey === 'aqueduct' || this.themeKey === 'ossuary' || this.themeKey === 'darkwood';
      this.op((lv) => {
        lv.ground(x0, x1, floorR, this.mat);
        if (flooded) {
          const wRow = Math.max(1, floorR - 1);
          if (width >= 4) {
            lv.ground(x0, x0, wRow, this.mat);
            lv.ground(x1, x1, wRow, this.mat);
            lv.fill(x0 + 1, x1 - 1, wRow, wRow, T_WATER);
          } else {
            lv.fill(x0, x1, wRow, wRow, T_WATER);
          }
        }
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

    // Symmetric entry & exit steps (row - 2) -> Upper gallery (row - 3) for bidirectional traversal!
    const gx0 = x0 + 4, gx1 = x1 - 4, grow = row - 3;
    this.op((lv) => {
      lv.platform(x0 + 1, x0 + 2, row - 2);
      lv.platform(x1 - 2, x1 - 1, row - 2);
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
    const fp = this.theme.props;
    if (fp && fp.frames && fp.frames.length) {
      const f = fp.frames;
      this.deco(fp.sheet, f[0], x0 + 1, row);
      this.deco(fp.sheet, f[Math.min(1, f.length - 1)], x0 + 5, row);
      this.deco('props', 'torch', x0 + 3, row, 0, -46);
    } else if (kind === 'cathedral') {
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
    } else if (kind === 'cavern') {
      this.deco('cavern_props', 'obsidian_pillar', x0 + 1, row);
      this.deco('cavern_props', 'obsidian_pillar', x0 + 5, row);
      this.deco('cavern_props', 'brazier', x0 + 3, row);
    } else {
      this.deco('arch', 'column', x0 + 1, row);
      this.deco('arch', 'column', x0 + 5, row);
      this.deco('props', 'torch', x0 + 3, row, 0, -46);
    }
    if (kind === 'castle' || kind === 'ballroom') {
      this.decor.push({ type: 'chandelier', x: px(x0 + 3), y: py(row) - 276, len: 84, r: 30, phase: 1.2 });
    }
    this.x += len;
    return this;
  }

  /**
   * Monumental diagonal castle stairway (`dir = +1` ascending `row -= steps`,
   * `dir = -1` descending `row += steps`), with a mid-flight landing, overhead
   * balcony ledges, columns/torches, and stair patrols.
   */
  grandStair(steps = 4, dir = 1, o = {}) {
    const stepW = o.stepW || 3;
    const midIdx = steps >= 4 ? Math.floor(steps / 2) : -1;
    const midW = midIdx > 0 ? 4 : 0;
    const totalW = steps * stepW + midW;
    const x0 = this.x;
    const x1 = x0 + totalW - 1;
    const startRow = this.row;
    const endRow = startRow - dir * steps;

    if (midIdx > 0) {
      const midRow = startRow - dir * midIdx;
      const mx0 = x0 + midIdx * stepW;
      const mx1 = mx0 + midW - 1;
      const f1Start = x0 + 2;
      const f1End = mx0;
      const f2Start = mx1 + 1;
      const f2End = x1 - 1;
      this.op((lv) => {
        lv.ground(x0, f1Start - 1, startRow, this.mat);
        lv.stair(f1Start, startRow, f1End, midRow, { passThrough: false, mat: this.mat, railing: true });
        lv.ground(mx0, mx1, midRow, this.mat);
        if (midRow - 3 >= 2) lv.platform(mx0 + 1, mx1 - 1, midRow - 3);
        lv.stair(f2Start, midRow, f2End, endRow, { passThrough: false, mat: this.mat, railing: true });
        lv.ground(f2End, x1, endRow, this.mat);
      });
      this.candle(x0 + 1, startRow);
      this.candle(x1, endRow, o.reward || null);
      if (midRow - 3 >= 2) this.candle(mx0 + 2, midRow - 3, o.balconyDrop || 'heart_big');
      this.autoDecor(mx0, mx1, midRow, 0.85);
      if (!this.theme.outdoor) {
        this.deco('props', 'torch', Math.floor((f1Start + f1End) * 0.5), Math.round((startRow + midRow) * 0.5), 0, -46);
        this.deco('props', 'torch', Math.floor((f2Start + f2End) * 0.5), Math.round((midRow + endRow) * 0.5), 0, -46);
      }
      this.placeEnemies(o.midEnemies || [['skeleton', 1, { min: x0, max: x1 }]], mx0, mx1, midRow);
    } else {
      const fStart = x0 + 1;
      const fEnd = Math.max(fStart + 1, x1);
      this.op((lv) => {
        lv.ground(x0, x0, startRow, this.mat);
        lv.stair(fStart, startRow, fEnd, endRow, { passThrough: false, mat: this.mat, railing: true });
        lv.ground(fEnd, x1, endRow, this.mat);
      });
      this.candle(x0, startRow);
      this.candle(x1, endRow, o.reward || null);
    }

    if (o.enemies) this.placeEnemies(o.enemies, x0, x1, endRow);
    else {
      this.placeEnemies([['bat', Math.max(2, Math.floor((x1 - x0) * 0.65)), { h: 4 }]], x0, x1, endRow);
      this.placeEnemies([['zombie', Math.max(1, totalW - 2), { min: x0 + 1, max: x1 }]], x0, x1, endRow);
    }
    if (o.spawn) this.spawners.push({ type: o.spawn, x0, x1, variant: o.spawnVariant || 'normal' });
    this.x = x1 + 1;
    this.row = endRow;
    return this;
  }

  /**
   * Full two-story castle gallery (`row` lower hall + `row - 4` upper promenade
   * linked by walkable mezzanine staircases at both ends and a central atrium well).
   */
  doubleDeck(len = 18, o = {}) {
    const x0 = this.x, x1 = this.x + len - 1, row = this.row;
    const ux0 = x0 + 4, ux1 = x1 - 4, uRow = row - 4;
    const mid = Math.floor((x0 + x1) * 0.5);
    this.op((lv) => {
      if (o.vista) lv.bridge(x0, x1, row, this.mat);
      else lv.ground(x0, x1, row, this.mat);
      lv.stair(x0 + 1, row, ux0, uRow, { passThrough: true, mat: this.mat, railing: true });
      lv.stair(ux1 + 1, uRow, x1, row, { passThrough: true, mat: this.mat, railing: true });
      lv.platform(mid - 1, mid, row - 2);
      if (o.solidDeck) {
        lv.platform(ux0, ux1, uRow);
      } else {
        if (mid - 2 >= ux0) lv.platform(ux0, mid - 2, uRow);
        if (ux1 >= mid + 1) lv.platform(mid + 1, ux1, uRow);
      }
    });
    this.candle(x0 + 2, row);
    this.candle(mid + 2, row, 'heart_small');
    this.candle(x1 - 2, row);
    this.candle(ux0 + 1, uRow, o.reward || 'meat');
    this.candle(ux1 - 1, uRow, o.weapon || 'money');
    this.placeEnemies(
      o.enemies || [['skeleton', Math.floor(len * 0.32)], ['armor', Math.floor(len * 0.72)]],
      x0, x1, row,
    );
    if (o.upperEnemies !== false) {
      const uList = o.upperEnemies || [
        ['skeleton', 2, { variant: 'axe', min: ux0, max: Math.max(ux0 + 1, mid - 2), row: uRow }],
        ['bat', Math.floor((ux1 - ux0) * 0.75), { h: 4 }],
      ];
      this.placeEnemies(uList, ux0, ux1, uRow);
    }
    if (o.spawn) this.spawners.push({ type: o.spawn, x0, x1, variant: o.spawnVariant || 'normal' });
    if (!o.vista) this.autoDecor(x0, x1, row, 0.85);
    this.autoDecor(ux0, ux1, uRow, 0.55);
    this.x += len;
    return this;
  }

  /**
   * Three-story grand atrium (`row`, `row - 3` mezzanine, `row - 6` clerestory)
   * with stepped side wells, multi-elevation patrols, and high-tier rewards.
   */
  tripleStacks(len = 22, o = {}) {
    const x0 = this.x, x1 = this.x + len - 1, row = this.row;
    const mRow = row - 3, cRow = row - 6;
    const mid = Math.floor((x0 + x1) * 0.5);
    this.op((lv) => {
      lv.ground(x0, x1, row, this.mat);
      // Ground -> Mezzanine steps & split galleries
      lv.platform(x0 + 1, x0 + 2, row - 2);
      lv.platform(x1 - 2, x1 - 1, row - 2);
      lv.platform(x0 + 3, mid - 2, mRow);
      lv.platform(mid + 2, x1 - 3, mRow);
      // Mezzanine -> Clerestory steps & high span
      lv.platform(x0 + 3, x0 + 4, row - 5);
      lv.platform(x1 - 4, x1 - 3, row - 5);
      lv.platform(mid - 1, mid, row - 5);
      lv.platform(x0 + 5, x1 - 5, cRow);
    });
    this.candle(x0 + 3, row);
    this.candle(x1 - 3, row);
    this.candle(x0 + 5, mRow, 'heart_big');
    this.candle(x1 - 5, mRow, 'money');
    this.candle(mid, cRow, o.reward || 'meat');
    if (o.weapon) this.candle(mid + 3, cRow, o.weapon);
    this.placeEnemies(
      o.enemies || [['armor', Math.floor(len * 0.35)], ['skeleton', Math.floor(len * 0.72), { variant: 'axe' }]],
      x0, x1, row,
    );
    this.placeEnemies(
      o.midEnemies || [
        ['skeleton', 2, { min: x0 + 3, max: mid - 2, row: mRow }],
        ['wraith', Math.floor(len * 0.62), { h: 4 }],
      ],
      x0, x1, mRow,
    );
    if (o.topEnemies !== false) {
      this.placeEnemies(
        o.topEnemies || [['tome', Math.floor((x1 - x0 - 10) * 0.5), { h: 3 }]],
        x0 + 5, x1 - 5, cRow,
      );
    }
    if (o.spawn) this.spawners.push({ type: o.spawn, x0, x1, variant: o.spawnVariant || 'normal' });
    this.autoDecor(x0, x1, row, 0.85);
    this.autoDecor(x0 + 3, x1 - 3, mRow, 0.55);
    this.autoDecor(x0 + 5, x1 - 5, cRow, 0.45);
    this.x += len;
    return this;
  }

  /**
   * Tall vertical tower climb (`len = 10`, ascends from `row` to `row - h`)
   * via staggered 3-tile switchback ledges (strictly 2 tiles per jump, with a
   * forgiving ground floor at the base of the shaft).
   */
  towerClimb(h = 8, o = {}) {
    const len = 10;
    const x0 = this.x, x1 = x0 + len - 1;
    const row = this.row, top = Math.max(5, row - h);
    const steps = Math.ceil((row - top) / 2);
    this.op((lv) => {
      lv.ground(x0, x0 + 6, row, this.mat);
      lv.ground(x0 + 7, x1, top, this.mat);
      for (let i = 1; i <= steps; i++) {
        const lrow = Math.max(top, row - i * 2);
        if (lrow <= top) break;
        const leftSide = (i % 2 === 1);
        const lx0 = leftSide ? x0 + 1 : x0 + 4;
        lv.platform(lx0, lx0 + 2, lrow);
      }
      // Guarantee top-most switchback sits within <= 2 rows of `top` adjacent to `x0 + 7`
      if (row - (steps - 1) * 2 > top + 2 || steps % 2 === 0) {
        lv.platform(x0 + 4, x0 + 6, top + 2);
      }
    });
    if (o.lift) {
      this.movers.push({
        kind: 'linear', tiles: 2,
        x0: (x0 + 3) * TILE, y0: py(row),
        x1: (x0 + 3) * TILE, y1: py(top + 2),
        period: o.period || 5.4, phase: o.phase || 0, dwell: 0.14,
      });
    }
    this.candle(x0 + 1, row);
    if (row - 4 > top) this.candle(x0 + 5, row - 4, 'money');
    this.candle(x0 + 8, top, o.reward || 'heart_big');
    this.placeEnemies(o.enemies || [['bat', 3, { h: Math.min(6, Math.floor(h * 0.5)) }], ['medusa', 6, { row: top + 2 }].slice(0, 0)], x0, x1, row);
    if (o.spawn !== false) this.spawners.push({ type: o.spawn || 'bat', x0, x1, variant: o.spawnVariant || 'normal' });
    if (!this.theme.outdoor || h > 6) {
      this.deco('props', 'torch', x0 + 2, row - Math.min(4, h - 1), 0, -32);
      this.deco('arch', 'chain', x0 + 5, top, 0, -64);
    }
    this.x += len;
    this.row = top;
    return this;
  }

  /**
   * Deep vertical plunge shaft (`len = 10`, descends from `row` to `row + h`)
   * with staggered arrest ledges every 2 rows (`i=1` at `x0+3..5` right next to `x0+2`
   * so right-to-left climbing has 0 horizontal gap and <= 2-tile vertical steps!).
   */
  deepShaft(h = 8, o = {}) {
    const len = 10;
    const x0 = this.x, x1 = x0 + len - 1;
    const row = this.row, bottom = Math.min(this.rows - 4, row + h);
    const steps = Math.ceil((bottom - row - 1) / 2);
    this.op((lv) => {
      lv.ground(x0, x0 + 2, row, this.mat);
      lv.ground(x0 + 3, x1, bottom, this.mat);
      for (let i = 1; i <= steps; i++) {
        const lrow = Math.min(bottom - 1, row + i * 2);
        if (lrow >= bottom) break;
        const leftSide = (i % 2 === 1);
        const lx0 = leftSide ? x0 + 3 : x0 + 6;
        lv.platform(lx0, lx0 + 2, lrow);
      }
    });
    const midRow = Math.min(bottom - 2, row + Math.max(2, Math.floor((bottom - row) * 0.5 / 2) * 2));
    this.candle(x0 + 7, midRow, o.reward || 'heart_big');
    this.candle(x0 + 8, bottom, o.bottomDrop || 'money');
    if (bottom - row > 6) {
      this.deco('arch', 'chain', x0 + 4, row + 3, 0, -32);
      this.deco('arch', 'chain', x0 + 7, Math.min(bottom - 1, row + 6), 0, -32);
    }
    this.placeEnemies(o.enemies || [['bat', 4, { h: 2 }], ['skeleton', 7, { min: x0 + 3, max: x1, row: bottom }]], x0, x1, row);
    if (o.spawn) this.spawners.push({ type: o.spawn, x0, x1, variant: o.spawnVariant || 'normal' });
    this.autoDecor(x0 + 4, x1, bottom, 0.7);
    this.x += len;
    this.row = bottom;
    return this;
  }

  /**
   * Overground / sunken basement loop: upper main road at `row` with 3-tile
   * entry & exit stairwell hatches descending into an arched undercroft tunnel
   * (`row + 4`) stocked with treasures and crypt guards.
   */
  undercroftLoop(len = 16, o = {}) {
    const x0 = this.x, x1 = this.x + len - 1, row = this.row;
    const uRow = Math.min(this.rows - 2, row + 4);
    const mid = Math.floor((x0 + x1) * 0.5);
    this.op((lv) => {
      lv.ground(x0, x0 + 1, row, this.mat);
      lv.ground(x1 - 1, x1, row, this.mat);
      // Sunken basement floor across the full interior span
      lv.ground(x0 + 2, x1 - 2, uRow, this.mat);
      lv.fill(x0 + 2, x1 - 2, row + 1, uRow - 1, 0);
      // Arched upper ceiling/road slab over the central vault + pass-through stairwell hatches
      if (x1 - 6 >= x0 + 6) lv.fill(x0 + 6, x1 - 6, row, row, this.mat);
      lv.platform(x0 + 2, Math.min(x1 - 2, x0 + 5), row);
      lv.platform(Math.max(x0 + 2, x1 - 5), x1 - 2, row);
      // Walkable staircases descending into the sunken undercroft at both hatches
      lv.stair(x0 + 2, row, x0 + 6, uRow, { passThrough: true, mat: this.mat, railing: true });
      lv.stair(x1 - 5, uRow, x1 - 1, row, { passThrough: true, mat: this.mat, railing: true });
    });
    this.candle(x0 + 6, row);
    this.candle(x1 - 6, row);
    this.candle(mid - 1, uRow, o.reward || 'meat');
    this.candle(mid + 2, uRow, o.weapon || 'holy_water');
    this.candle(x0 + 4, uRow, 'money');
    this.placeEnemies(
      o.enemies || [['skeleton', Math.floor(len * 0.5), { min: x0 + 5, max: x1 - 5, row }]],
      x0, x1, row,
    );
    this.placeEnemies(
      o.underEnemies || [['zombie', 4, { min: x0 + 4, max: x1 - 4, row: uRow }], ['skeleton', Math.max(6, len - 6), { variant: 'axe', min: x0 + 4, max: x1 - 4, row: uRow }]],
      x0, x1, uRow,
    );
    this.autoDecor(x0 + 5, x1 - 5, row, 0.75);
    if (!this.theme.outdoor) {
      this.deco('props', 'torch', mid - 2, uRow, 0, -40);
      this.deco('props', 'torch', mid + 2, uRow, 0, -40);
    }
    if (o.waterPool || this.themeKey === 'aqueduct') {
      this.waterBasin(x0 + 3, x1 - 3, py(uRow) - 12, py(uRow) + 3, { alpha: 0.82 });
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
      // Solid forgiving shaft base (zero bottomless pit at shaft bottom!)
      lv.ground(x0, x0 + 4, row, this.mat);
      lv.ground(x0 + 5, x0 + len - 1, top, this.mat);
      lv.fill(x0 + 5, x0 + len - 1, top + 1, this.rows - 1, this.mat);
      // Alternating 2-tile switchback ledges up the shaft sides
      for (let k = 2; k <= h; k += 2) {
        const lrow = Math.max(top + 1, row - k);
        const lx = (k % 4 === 2) ? x0 + 1 : x0 + 3;
        lv.platform(lx, lx + 1, lrow);
      }
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
    const steps = Math.ceil((bottom - row - 1) / 2), len = 9;
    this.op((lv) => {
      lv.ground(x0, x0 + 1, row, this.mat);
      lv.ground(x0 + 2, x0 + len - 1, bottom, this.mat);
      for (let i = 1; i <= steps; i++) {
        const lrow = Math.min(bottom - 1, row + i * 2);
        const lx = (i % 2 === 1) ? x0 + 2 : x0 + 5;
        lv.platform(lx, lx + 2, lrow);
      }
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
   * treasure chamber (meat + gold + sub-weapon) with symmetric ledges to climb out
   * and explicit visual tells (`SPRITE_VARIANT_CRACKED` + `PROP_CONTINUATION` + `VISIBLE_REWARD`).
   */
  hiddenVault(o = {}) {
    const x0 = this.x, len = 10, row = this.row;
    const vx0 = x0 + 2, vx1 = x0 + 7, vfloor = Math.min(this.rows - 2, row + 4);
    this.op((lv) => {
      lv.ground(x0, x0 + len - 1, row, this.mat);
      lv.fill(vx0, vx1, row + 1, vfloor - 1, 0);               // carve the chamber
      lv.ground(vx0, vx1, vfloor, this.mat);
      lv.set(x0 + 3, row, T_BLOCK); lv.set(x0 + 4, row, T_BLOCK);
      lv.set(x0 + 5, row, T_BLOCK); lv.set(x0 + 6, row, T_BLOCK);
      lv.platform(vx0, vx0 + 1, row + 2);                      // left climb-out ledge
      lv.platform(vx1 - 1, vx1, row + 2);                      // right climb-out ledge
    });
    this.blockDrops[`${x0 + 3},${row}`] = 'money';
    this.deco('arch', 'chain', x0 + 3, row + 2, 0, -48);
    this.deco('arch', 'chain', x0 + 6, row + 2, 0, -48);
    this.secrets.push({
      secret_id: `vault_${x0}`,
      position: { x: 3, y: row },
      world_col: x0 + 3,
      lock_type: 'NONE',
      visual_tell: VISUAL_TELLS.SPRITE_VARIANT_CRACKED,
      visual_tells: [VISUAL_TELLS.SPRITE_VARIANT_CRACKED, VISUAL_TELLS.PROP_CONTINUATION, VISUAL_TELLS.VISIBLE_REWARD],
    });
    this.candle(x0 + 1, row);
    this.candle(x0 + 8, row);
    this.candle(vx0 + 2, vfloor, o.reward || 'meat');
    this.candle(vx1 - 1, vfloor, o.weapon || 'holy_water');
    this.candle(vx0 + 1, vfloor, 'money');
    this.placeEnemies(o.enemies || [['skeleton', 8]], x0, x0 + len - 1, row);
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

  /**
   * Volcanic lava basin: sunken pool of molten `T_LAVA` (2 tiles deep over solid
   * `this.mat`) with optional basalt stepping `islands` (`[[off, w], ...]`),
   * `crumble` slabs, one-way `ledge`s, or a chain `ferry` gliding over the magma!
   */
  lavaRun(width, o = {}) {
    const x0 = this.x, x1 = this.x + width - 1, row = this.row;
    const lx0 = width >= 5 ? x0 + 1 : x0;
    const lx1 = width >= 5 ? x1 - 1 : x1;
    this.op((lv) => {
      lv.ground(x0, x1, Math.min(this.rows - 1, row + 3), this.mat);
      if (width >= 5) {
        lv.ground(x0, x0, row + 1, this.mat);
        lv.ground(x1, x1, row + 1, this.mat);
      }
      lv.fill(lx0, lx1, row + 1, Math.min(this.rows - 1, row + 2), T_LAVA);
      for (const [off, w = 2, dr = 0] of o.islands || []) {
        const ix0 = x0 + off, ix1 = Math.min(x1, ix0 + w - 1);
        lv.ground(ix0, ix1, row + dr, this.mat);
      }
      if (o.crumble) {
        for (const [off, w = 2] of o.crumble) {
          lv.crumble(x0 + off, Math.min(x1, x0 + off + w - 1), row);
        }
      }
    });
    for (const [off, h, w = 2] of o.ledges || []) {
      const lx0 = x0 + off, lx1 = lx0 + w - 1, lrow = row - h;
      this.op((lv) => lv.platform(lx0, lx1, lrow));
    }
    if (o.ferry) {
      const platTiles = o.platTiles || 3;
      const halfPx = (platTiles * TILE) * 0.5;
      this.movers.push({
        kind: 'linear',
        tiles: platTiles,
        x0: x0 * TILE + halfPx + 4,
        y0: py(row),
        x1: (x1 + 1) * TILE - halfPx - 4,
        y1: py(row),
        period: o.period || 4.8,
        phase: o.phase || 0,
        dwell: 0.10,
      });
    }
    for (const c of o.candles || []) {
      if (Array.isArray(c)) this.candle(x0 + c[0], c[2] != null ? row - c[2] : row, c[1]);
      else this.candle(x0 + c, row);
    }
    this.placeEnemies(o.enemies, x0, x1, row);
    if (o.spawn) this.spawners.push({ type: o.spawn, x0, x1, variant: o.spawnVariant || 'normal' });
    this.x += width;
    return this;
  }

  /**
   * Flooded stone canal / cistern sluice: sunken 2-tile-deep channel of non-lethal
   * shader `T_WATER` over solid `this.mat` so the hunter can wade or leap across
   * stone stepping `islands` (`[[off, w], ...]`), `ledges`, or a `ferry`.
   */
  canalRun(width, o = {}) {
    const x0 = this.x, x1 = this.x + width - 1, row = this.row;
    const floorR = Math.min(this.rows - 1, row + 3);
    const wx0 = width >= 4 ? x0 + 1 : x0;
    const wx1 = width >= 4 ? x1 - 1 : x1;
    const wTop = Math.min(floorR - 1, row + 1);
    this.op((lv) => {
      lv.ground(x0, x1, floorR, this.mat);
      if (width >= 4) {
        lv.ground(x0, x0, wTop, this.mat);
        lv.ground(x1, x1, wTop, this.mat);
      }
      if (floorR > wTop) lv.fill(wx0, wx1, wTop, floorR - 1, T_WATER);
      for (const [off, w = 2, dr = 0] of o.islands || []) {
        const ix0 = x0 + off, ix1 = Math.min(x1, ix0 + w - 1);
        lv.ground(ix0, ix1, row + dr, this.mat);
      }
    });
    for (const [off, h, w = 2] of o.ledges || []) {
      const lx0 = x0 + off, lx1 = lx0 + w - 1, lrow = row - h;
      this.op((lv) => lv.platform(lx0, lx1, lrow));
    }
    if (o.ferry) {
      const platTiles = o.platTiles || 3;
      const halfPx = (platTiles * TILE) * 0.5;
      this.movers.push({
        kind: 'linear',
        tiles: platTiles,
        x0: x0 * TILE + halfPx + 4,
        y0: py(row),
        x1: (x1 + 1) * TILE - halfPx - 4,
        y1: py(row),
        period: o.period || 4.6,
        phase: o.phase || 0,
        dwell: 0.10,
      });
    }
    for (const c of o.candles || []) {
      if (Array.isArray(c)) this.candle(x0 + c[0], c[2] != null ? row - c[2] : row, c[1]);
      else this.candle(x0 + c, row);
    }
    this.placeEnemies(o.enemies, x0, x1, floorR);
    if (o.spawn) this.spawners.push({ type: o.spawn, x0, x1, variant: o.spawnVariant || 'normal' });
    this.x += width;
    return this;
  }

  /** Walkable staircase up: rises `n` rows across `2 * n` tiles. */
  stepUp(n) {
    if (n <= 0) return this;
    const x0 = this.x, startRow = this.row, endRow = this.row - n;
    const span = 2 * n;
    this.op((lv) => lv.stair(x0, startRow, x0 + span, endRow, { passThrough: false, mat: this.mat, railing: n >= 2 }));
    this.x += span;
    this.row = endRow;
    return this;
  }

  /** Walkable staircase down: descends `n` rows across `2 * n` tiles. */
  stepDown(n) {
    if (n <= 0) return this;
    const x0 = this.x, startRow = this.row, endRow = this.row + n;
    const span = 2 * n;
    this.op((lv) => lv.stair(x0, startRow, x0 + span, endRow, { passThrough: false, mat: this.mat, railing: n >= 2 }));
    this.x += span;
    this.row = endRow;
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

  /** Flat run with a solid ceiling `ceil` (>= 3) tiles above the floor. */
  corridor(len, ceil = 3, o = {}) {
    const safeCeil = Math.max(3, ceil);
    const x0 = this.x, x1 = this.x + len - 1, row = this.row;
    this.op((lv) => { lv.ground(x0, x1, row, this.mat); lv.fill(x0, x1, 0, row - safeCeil - 1, this.mat); });
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
    this.op((lv) => {
      lv.ground(x0, x0 + len - 1, row, this.mat);
      if (o.platforms) {
        lv.platform(x0 + 5, x0 + 7, row - 2);
        lv.platform(x0 + 13, x0 + 15, row - 2);
      }
    });
    this.candle(x0 + 4, row, 'heart_big');
    this.candle(x0 + 14, row, 'heart_big');
    const kind = this.theme.decor;
    const fp = this.theme.props;
    if (fp && fp.frames && fp.frames.length) {
      const f = fp.frames;
      [x0 + 3, x0 + 15].forEach((tx) => this.deco(fp.sheet, f[0], tx, row));
      [x0 + 6, x0 + 13].forEach((tx) => this.deco(fp.sheet, f[Math.min(1, f.length - 1)], tx, row));
      this.deco(fp.sheet, f[Math.min(2, f.length - 1)], x0 + 10, row);
      this.deco('props', 'torch', x0 + 8, row, 0, -46); this.deco('props', 'torch', x0 + 12, row, 0, -46);
    } else if (kind === 'graveyard') {
      this.deco('props', 'tombstone', x0 + 3, row); this.deco('props', 'tombstone', x0 + 15, row);
    } else if (kind === 'cathedral') {
      [x0 + 3, x0 + 15].forEach((tx) => this.deco('cathedral_props', 'angel', tx, row));
      this.deco('stained_glass', 'rose', x0 + 10, row, 0, -96);
      [x0 + 6, x0 + 13].forEach((tx) => this.deco('stained_glass', tx === x0 + 6 ? 'hunter' : 'moon', tx, row, 0, -70));
      this.deco('cathedral_props', 'candles', x0 + 8, row); this.deco('cathedral_props', 'candles', x0 + 12, row);
    } else if (kind === 'library') {
      [x0 + 3, x0 + 15].forEach((tx) => this.deco('library_props', 'bookcase', tx, row));
      this.deco('library_props', 'globe', x0 + 6, row); this.deco('library_props', 'tomes', x0 + 13, row);
      this.deco('props', 'torch', x0 + 8, row, 0, -46); this.deco('props', 'torch', x0 + 12, row, 0, -46);
    } else if (kind === 'arcade') {
      this.deco('arcade_props', 'sage_cabinet', x0 + 3, row); this.deco('arcade_props', 'oracle_engine', x0 + 15, row);
      this.deco('arcade_props', 'zoetrope', x0 + 6, row); this.deco('arcade_props', 'magic_lantern', x0 + 13, row);
      this.deco('props', 'torch', x0 + 9, row, 0, -46); this.deco('props', 'torch', x0 + 11, row, 0, -46);
    } else if (kind === 'darkwood') {
      [x0 + 3, x0 + 15].forEach((tx) => this.deco('darkwood_props', 'ancient_totem', tx, row));
      [x0 + 6, x0 + 13].forEach((tx) => this.deco('darkwood_props', 'moss_lantern', tx, row));
      [x0 + 9, x0 + 11].forEach((tx) => this.deco('darkwood_props', 'glow_shrooms', tx, row));
    } else if (kind === 'forest') {
      [x0 + 3, x0 + 15].forEach((tx) => this.deco('pumpkinprops', 'jack_big', tx, row));
      [x0 + 7, x0 + 13].forEach((tx) => this.deco('pumpkinprops', 'scarecrow', tx, row));
      this.deco('pumpkinprops', 'pumpkins', x0 + 10, row);
    } else if (kind === 'yule') {
      [x0 + 3, x0 + 15].forEach((tx) => this.deco('xmasprops', 'tree', tx, row));
      [x0 + 7, x0 + 13].forEach((tx) => this.deco('xmasprops', 'lamppost', tx, row));
      this.deco('xmasprops', 'gifts', x0 + 10, row);
    } else if (kind === 'ramparts') {
      this.deco('arch', 'column', x0 + 3, row); this.deco('arch', 'column', x0 + 15, row);
      [x0 + 5, x0 + 13].forEach((tx) => this.deco('arch', 'banner', tx, row, 0, -48));
      this.deco('props', 'torch', x0 + 7, row, 0, -46); this.deco('props', 'torch', x0 + 12, row, 0, -46);
    } else if (kind === 'clockwork') {
      this.deco('arch', 'column', x0 + 3, row); this.deco('arch', 'column', x0 + 15, row);
      this.deco('props', 'torch', x0 + 5, row, 0, -46); this.deco('props', 'torch', x0 + 13, row, 0, -46);
    } else if (kind === 'cavern') {
      [x0 + 3, x0 + 15].forEach((tx) => this.deco('cavern_props', 'obsidian_pillar', tx, row));
      [x0 + 6, x0 + 13].forEach((tx) => this.deco('cavern_props', 'brazier', tx, row));
      this.deco('cavern_props', 'magma_vent', x0 + 10, row);
    } else {
      this.deco('arch', 'column', x0 + 3, row); this.deco('arch', 'column', x0 + 15, row);
      [x0 + 5, x0 + 13].forEach((tx) => this.deco('arch', 'banner', tx, row, 0, -48));
      this.deco('props', 'torch', x0 + 4, row, 0, -46); this.deco('props', 'torch', x0 + 14, row, 0, -46);
    }
    this.checkpoints.push(px(x0));
    if (o.waterPool || this.themeKey === 'aqueduct') {
      this.waterBasin(x0 + 2, x0 + len - 2, py(row) - 10, py(row) + 4, { alpha: 0.80 });
    }
    this.boss = {
      type, name,
      sheet: o.sheet || null,
      tint: o.tint || null,
      aura: o.aura || null,
      voice: o.voice || null,
      line: o.line || null,
      gateCol: x0 + 1, gateRows: [row - 3, row - 1],
      exitX: (x0 + 18) * TILE + 4, exitY: py(row),
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
      id: this.id, key: this.biomeKey, name: this.name, subtitle: this.subtitle, theme: this.themeKey,
      cols, rows: this.rows,
      start: { x: px(2), y: py(startRow) },
      checkpoints: this.checkpoints,
      build(level) { ops.forEach((fn) => fn(level)); },
      rooms, decor: this.decor, movers: this.movers, blockDrops: this.blockDrops,
      candles: this.candles, enemies: this.enemies, spawners: this.spawners,
      boss: this.boss, platform: t.platform || 'platform', ally: t.ally || null,
      roomSchema: this.roomSchema,
      doorAnchors: this.doorAnchors,
      sanctuaryAnchor: this.sanctuaryAnchor,
      vesselAnchor: this.vesselAnchor,
      secretCell: this.secretCell,
      secrets: this.secrets,
      waterBasins: this.waterBasins,
    };
  }
}

export { px, py };
