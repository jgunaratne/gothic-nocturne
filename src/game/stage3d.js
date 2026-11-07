// 32-bit era 2.5D background & stage renderer: perspective projection,
// texture-mapped low-poly architectural meshes, scanline perspective vistas,
// vaulted gothic halls, extruded 3D gear trains and boss arena centerpieces.

import { getFxLayers } from '../engine/fxlayers.js';
import { W, H, TILE } from '../engine/constants.js';
import { parallaxElevY } from './parallax.js';
import {
  LIGHT, getTexBank, getGlowCanvas, shadeOverlay32, texTri, texQuad, texQuadSubZ, texStripZ,
} from './tex3d.js';

export const FOCAL = 380;
export const EYE_X = W * 0.5;
export const EYE_Y = 144;

const THEME_PALETTES = {
  graveyard: {
    fog: [11, 10, 22], stone: [78, 92, 118], trim: [132, 146, 174],
    carpet: true, glass: [148, 96, 220], arch: true,
  },
  darkwood: {
    fog: [7, 15, 19], stone: [48, 74, 68], trim: [96, 154, 136],
    carpet: false, glass: [95, 240, 185], arch: false,
  },
  forest: {
    fog: [14, 10, 20], stone: [76, 62, 52], trim: [122, 96, 72],
    carpet: false, glass: [255, 154, 60], arch: false,
  },
  yule: {
    fog: [10, 14, 28], stone: [92, 112, 142], trim: [168, 192, 220],
    carpet: false, glass: [140, 210, 255], arch: false,
  },
  ramparts: {
    fog: [13, 12, 26], stone: [84, 98, 126], trim: [142, 158, 186],
    carpet: false, glass: [140, 175, 235], arch: true,
  },
  catacombs: {
    fog: [8, 6, 14], stone: [88, 78, 70], trim: [138, 124, 106],
    carpet: false, glass: [201, 181, 138], arch: true, crypt: true,
  },
  darkcave: {
    fog: [18, 6, 6], stone: [72, 48, 48], trim: [156, 82, 54],
    carpet: false, glass: [255, 108, 38], arch: true, crypt: true,
  },
  ossuary: {
    fog: [7, 6, 15], stone: [82, 76, 96], trim: [136, 126, 156],
    carpet: false, glass: [130, 215, 190], arch: true, crypt: true,
  },
  clocktower: {
    fog: [9, 8, 16], stone: [66, 76, 94], trim: [186, 142, 72],
    carpet: false, glass: [235, 185, 95], arch: false,
  },
  throne: {
    fog: [12, 7, 18], stone: [86, 94, 120], trim: [158, 166, 194],
    carpet: true, glass: [226, 60, 78], arch: true,
  },
  arcade: {
    fog: [14, 9, 14], stone: [92, 70, 54], trim: [206, 164, 86],
    carpet: true, glass: [168, 110, 230], arch: true,
  },
  library: {
    fog: [11, 8, 18], stone: [74, 58, 48], trim: [150, 118, 84],
    carpet: true, glass: [180, 140, 255], arch: true,
  },
  cathedral: {
    fog: [10, 9, 20], stone: [120, 132, 156], trim: [182, 190, 210],
    carpet: true, glass: [255, 92, 122], arch: true,
  },
  alchemy: {
    fog: [8, 13, 18], stone: [62, 86, 84], trim: [152, 192, 168],
    carpet: false, glass: [78, 242, 184], arch: true,
  },
  ballroom: {
    fog: [15, 8, 20], stone: [106, 78, 108], trim: [214, 174, 122],
    carpet: true, glass: [255, 138, 212], arch: true,
  },
  coliseum: {
    fog: [18, 9, 11], stone: [98, 68, 64], trim: [176, 134, 108],
    carpet: false, glass: [255, 110, 84], arch: true,
  },
  aqueduct: {
    fog: [6, 14, 22], stone: [58, 86, 106], trim: [126, 172, 196],
    carpet: false, glass: [82, 214, 255], arch: true, crypt: true,
  },
  skykeep: {
    fog: [12, 18, 36], stone: [148, 166, 198], trim: [216, 232, 252],
    carpet: false, glass: [180, 238, 255], arch: true,
  },
  conservatory: {
    fog: [7, 16, 18], stone: [54, 92, 86], trim: [148, 212, 182],
    carpet: true, glass: [110, 255, 196], arch: true,
  },
  dungeon: {
    fog: [12, 7, 12], stone: [78, 62, 68], trim: [158, 118, 108],
    carpet: false, glass: [255, 96, 72], arch: true, crypt: true,
  },
  observatory: {
    fog: [8, 12, 28], stone: [98, 114, 162], trim: [224, 192, 118],
    carpet: true, glass: [124, 232, 255], arch: true,
  },
};

/**
 * Projects a world-space point (wx, wy, z) onto the 640x360 screen.
 * z = 0 is the 2D collision plane (1:1 pixel match); z > 0 recedes into depth;
 * z < 0 passes in front of the play plane.
 */
export function project3D(wx, wy, z, camX, camY) {
  const denom = Math.max(40, FOCAL + z);
  const s = FOCAL / denom;
  return {
    x: EYE_X + (wx - camX - EYE_X) * s,
    y: EYE_Y + (wy - camY - EYE_Y) * s,
    s,
  };
}

// Halls whose far-wall lancets may open onto the night sky (the crypts stay buried).
const SKY_THEMES = new Set([
  'graveyard', 'ramparts', 'throne', 'arcade', 'library', 'cathedral',
  'alchemy', 'ballroom', 'coliseum', 'skykeep', 'conservatory', 'observatory',
]);
// Halls that get a slowly turning brass orrery landmark.
const ORRERY_THEMES = new Set(['library', 'arcade', 'alchemy', 'observatory']);
const MOON_RGB = [186, 204, 255];
const BAY_W = 8 * TILE;
const MURAL_BY_THEME = {
  alchemy: 'mural_alchemy',
  ballroom: 'mural_ballroom',
  coliseum: 'mural_coliseum',
  aqueduct: 'mural_aqueduct',
  conservatory: 'mural_conservatory',
  dungeon: 'mural_dungeon',
  observatory: 'mural_observatory',
  catacombs: 'mural_catacombs',
  ossuary: 'mural_catacombs',
  graveyard: 'mural_throne',
  throne: 'mural_throne',
  cathedral: 'mural_throne',
  library: 'mural_throne',
  arcade: 'mural_throne',
};

/**
 * Mid-depth furnishings (z ≈ 90..104) standing on the receding hall floor between
 * the play plane and the far wall: darkened 2D props or procedural 3D sarcophagi.
 */
const MID_PROPS = {
  graveyard: [['cathedral_props', 'angel'], ['props', 'tombstone'], ['cathedral_props', 'angel']],
  ramparts: [['cathedral_props', 'angel']],
  throne: [['cathedral_props', 'angel'], ['throne_props', 'candle_pillar'], ['cathedral_props', 'angel'], ['throne_props', 'candle_pillar']],
  cathedral: [['cathedral_props', 'pew'], ['cathedral_props', 'pew'], ['cathedral_props', 'angel'], ['cathedral_props', 'font'], ['cathedral_props', 'pew'], ['cathedral_props', 'pulpit']],
  library: [['library_props', 'bookcase'], ['library_props', 'globe'], ['library_props', 'ladder'], ['library_props', 'bookcase'], ['library_props', 'lectern']],
  arcade: [['arcade_props', 'sage_cabinet'], ['arcade_props', 'zoetrope'], ['arcade_props', 'chess_automaton'], ['arcade_props', 'magic_lantern'], ['arcade_props', 'oracle_engine']],
  alchemy: [['alchemy_props', 'retort_stand'], ['alchemy_props', 'tesla_coil'], ['alchemy_props', 'elixir_rack'], ['alchemy_props', 'athanor'], ['library_props', 'globe']],
  ballroom: [['ballroom_props', 'gilded_mirror'], ['ballroom_props', 'candelabra'], ['ballroom_props', 'velvet_drape'], ['ballroom_props', 'marble_bust'], ['throne_props', 'candle_pillar']],
  coliseum: [['coliseum_props', 'weapon_rack'], ['coliseum_props', 'trophy_pillar'], ['coliseum_props', 'iron_brazier'], ['coliseum_props', 'war_standard']],
  aqueduct: [['aqueduct_props', 'water_spout'], ['aqueduct_props', 'sluice_wheel'], ['aqueduct_props', 'moss_amphora'], ['aqueduct_props', 'canal_lantern']],
  skykeep: [['skykeep_props', 'moon_astrolabe'], ['skykeep_props', 'ivy_column'], ['skykeep_props', 'fountain_basin'], ['skykeep_props', 'star_lantern']],
  conservatory: [['conservatory_props', 'carnivorous_bloom'], ['conservatory_props', 'iron_trellis'], ['conservatory_props', 'glass_terrarium'], ['conservatory_props', 'marble_urn']],
  dungeon: [['dungeon_props', 'iron_maiden'], ['dungeon_props', 'pillory_rack'], ['dungeon_props', 'coal_brazier'], ['dungeon_props', 'chain_pillar']],
  observatory: [['observatory_props', 'brass_telescope'], ['observatory_props', 'celestial_globe'], ['observatory_props', 'star_orrery'], ['observatory_props', 'zodiac_stele']],
  catacombs: 'sarcophagus',
  ossuary: 'sarcophagus',
  darkcave: [['cavern_props', 'stalagmite'], ['cavern_props', 'obsidian_pillar']],
};

function hash32(a, b = 0) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export class Stage3D {
  constructor(assets, level, themeKey, stageData) {
    this.assets = assets;
    this.bank = getTexBank(assets);
    this.level = level;
    this.themeKey = themeKey;
    this.stageTheme = (stageData && stageData.theme) || themeKey;
    this.pal = THEME_PALETTES[this.stageTheme] || THEME_PALETTES[themeKey] || THEME_PALETTES.graveyard;
    this.data = stageData;
    this.planeCache = new Map();
    this.wallPatterns = {};
    this.landmarkXs = [];
    this._bayKinds = new Map();      // far-wall bay index -> 2.5D feature kind
    this._special = new Map();       // room index -> { stair, orrery } bay indices
    this.fgFrames = this.buildForegroundFrames();
  }

  tex(name) {
    if (!this.bank) this.bank = getTexBank(this.assets);
    return this.bank ? this.bank.get(name) : null;
  }

  primaryStoneKey() {
    if (this.stageTheme === 'aqueduct') return 'aqueduct_stone';
    if (this.stageTheme === 'coliseum') return 'travertine_stone';
    if (this.stageTheme === 'ballroom' || this.stageTheme === 'skykeep' || this.stageTheme === 'observatory') return 'marble';
    if (this.stageTheme === 'dungeon') return 'crypt_stone';
    return this.pal.crypt ? 'crypt_stone' : 'wall';
  }

  trimStoneKey() {
    if (this.stageTheme === 'aqueduct') return 'aqueduct_stone';
    if (this.stageTheme === 'coliseum') return 'travertine_stone';
    if (this.stageTheme === 'ballroom' || this.stageTheme === 'skykeep' || this.stageTheme === 'observatory') return 'marble';
    if (this.stageTheme === 'dungeon') return 'crypt_stone';
    return this.pal.crypt ? 'crypt_stone' : 'stone_trim';
  }

  /** The stage's starting floor row: last-resort footing for scenery over map-wide gaps. */
  startRow() {
    const s = this.data && this.data.start;
    const r = s ? Math.round(s.y / TILE) : 11;
    return r > 0 && r < this.level.rows ? r : 11;
  }

  /**
   * Places foreground framing silhouettes strictly on calm, solid runs away
   * from pits, spikes, moving lifts and boss arenas so gameplay stays 100%
   * readable.
   */
  buildForegroundFrames() {
    const out = [];
    const lv = this.level;
    const bossCol = this.data.boss ? Math.max(0, Math.floor(this.data.boss.camX / TILE) - 6) : lv.cols;
    const portalRoom = (lv.rooms || []).find((rm) => rm.x0 > 0 && rm.edge !== false);
    const portalX = portalRoom ? portalRoom.x0 * TILE : -9999;
    let last = 12;
    for (let tx = 18; tx < bossCol - 8; tx++) {
      if (tx - last < 28) continue;
      let safe = true;
      let surf = -1;
      for (let dx = -3; dx <= 3; dx++) {
        const r = lv.groundRow ? lv.groundRow(tx + dx) : lv.surfaceRow(tx + dx);
        if (
          r < 0
          || !lv.isSolid(tx + dx, r)
          || (r > 0 && (lv.isSpike(tx + dx, r - 1) || lv.isSolid(tx + dx, r - 1)))
          || (r > 1 && lv.isSolid(tx + dx, r - 2))
        ) {
          safe = false;
          break;
        }
        if (dx === 0) surf = r;
      }
      if (!safe || surf < 5) continue;
      const wx = tx * TILE + 16;
      if (Math.abs(wx - portalX) < 200) continue;
      if ((lv.movers || []).some((m) => Math.abs(m.cx - wx) < 180)) continue;
      out.push({ wx, wy: surf * TILE });
      last = tx;
    }
    return out;
  }

  /**
   * Prunes foreground framing columns that would cross in front of monumental
   * passage doorways, sanctuary waystones, or ancient life vessels.
   */
  excludeLandmarks(landmarks) {
    const pts = (landmarks || []).filter((l) => l && Number.isFinite(l.x));
    this.landmarkXs = pts.map((p) => p.x);
    // Far-wall set-piece planning depends on doorway positions: re-plan lazily.
    this._bayKinds.clear();
    this._special.clear();
    if (!pts.length || !this.fgFrames) return;
    this.fgFrames = this.fgFrames.filter((f) => pts.every((p) => Math.abs(p.x - f.wx) >= 132));
  }

  // ================================================= FAR-WALL BAY PLANNING
  /**
   * Footing row for a far-wall set-piece centred on `midX` (half-width `halfW`):
   * the median ground row of the columns in front of it (capped at the hall
   * floor), so stairs, passages and lancets sit at the level the hunter walks on
   * there. Returns -1 when the bay is unusable: outside the hall, inside the
   * boss arena, within reach of a passage doorway / shrine / vessel, or hidden
   * behind solid terrain (one-way ledges don't count) covering the five rows
   * above that footing.
   */
  bayFooting(r, midX, floorRow, halfW) {
    const lv = this.level;
    const x0 = midX - halfW, x1 = midX + halfW;
    if (x0 < r.x0 * TILE + 24 || x1 > (r.x1 + 1) * TILE - 24) return -1;
    const b = this.data.boss;
    if (b && Number.isFinite(b.camX) && x1 > b.camX - 48) return -1;
    for (const lx of this.landmarkXs) if (Math.abs(lx - midX) < halfW + 70) return -1;
    const c0 = Math.floor(x0 / TILE), c1 = Math.floor(x1 / TILE);
    const grounds = [];
    for (let c = c0; c <= c1; c++) {
      const g = lv.groundRow(c);
      if (g >= 0) grounds.push(g);
    }
    grounds.sort((a, b2) => a - b2);
    const row = grounds.length ? Math.min(floorRow, grounds[grounds.length >> 1]) : floorRow;
    let solid = 0, total = 0;
    for (let c = c0; c <= c1; c++) {
      for (let rr = row - 5; rr < row; rr++) {
        total++;
        if (lv.isSolid(c, rr)) solid++;
      }
    }
    return solid <= total * 0.34 ? row : -1;
  }

  /**
   * Evaluates whether placing a 2-bay Grand Mural across `[bi, bi + 1]` anchored to
   * walkway row `candRow` gives the player an unobstructed 3D-projected view as the
   * camera scrolls past. Rejects any span occluded by upper-story floors, solid tiles,
   * bridge piers/arches, landmarks, boss gates, or staircases.
   */
  _evalMuralSpan(r, ceilY, abyssHall, bi, candRow, targetBi, out) {
    const lv = this.level;
    const x0 = bi * BAY_W + 44, x1 = (bi + 2) * BAY_W - 44;
    const midX = (bi + 1) * BAY_W, halfW = (x1 - x0) * 0.5;
    if (x0 < r.x0 * TILE + 24 || x1 > (r.x1 + 1) * TILE - 24) return null;
    const b = this.data.boss;
    if (b && Number.isFinite(b.camX) && x1 > b.camX - 48) return null;
    if (
      bi === out.stair || bi + 1 === out.stair ||
      bi === out.orrery || bi + 1 === out.orrery ||
      out.murals.some((mb) => Math.abs(bi - mb) < 3)
    ) {
      return null;
    }
    for (const lx of this.landmarkXs) {
      if (Math.abs(lx - midX) < halfW + 48) return null;
    }

    const c0 = Math.max(r.x0 + 1, Math.floor((bi * BAY_W + 24) / TILE));
    const c1 = Math.min(r.x1 - 1, Math.floor(((bi + 2) * BAY_W - 24) / TILE));
    const nCols = c1 - c0 + 1;
    if (nCols < 6) return null;

    let walkableCols = 0;
    for (let c = c0; c <= c1; c++) {
      let ok = false;
      for (const rr of [candRow, candRow - 1, candRow + 1]) {
        if (rr < 2 || rr >= lv.rows - 1) continue;
        if (
          lv.isStandable(c, rr) &&
          !lv.isSolid(c, rr - 1) &&
          !lv.isSolid(c, rr - 2) &&
          !lv.isSolid(c, rr - 3)
        ) {
          ok = true;
          break;
        }
      }
      if (ok) walkableCols++;
    }
    if (walkableCols < Math.ceil(nCols * 0.70)) return null;

    const mWalkY = candRow * TILE;
    const mBot = abyssHall ? mWalkY - 34 : mWalkY - 38;
    const mTop = Math.max(ceilY + 52, mBot - 196);
    if (mBot - mTop < 148) return null;

    const zBack = 228;
    const fullVert = r.y0 <= 0 && r.y1 >= lv.rows - 1;
    const maxCamX = Math.max(0, lv.width - W);
    const maxCamY = Math.max(0, lv.height - H);

    for (const sx of [x0 + 32, midX, x1 - 32]) {
      const camX = Math.max(0, Math.min(maxCamX, Math.round(sx - W * 0.42)));
      const camY = Math.max(0, Math.min(maxCamY, Math.round(mWalkY - H * 0.62)));
      const bTL = project3D(x0, mTop, zBack, camX, camY);
      const bBR = project3D(x1, mBot, zBack, camX, camY);
      const clipTop = fullVert ? 0 : Math.max(0, Math.round(r.y0 * TILE - camY));
      const clipBot = fullVert ? H : Math.min(H, Math.round((r.y1 + 1) * TILE - camY));
      if (bTL.y < clipTop + 8 || bBR.y > clipBot - 8) return null;
      if (bBR.y > (mWalkY - camY) - 16) return null;

      const fx0 = camX + Math.max(0, bTL.x - 6);
      const fx1 = camX + Math.min(W, bBR.x + 6);
      const fy0 = camY + bTL.y - 12;
      const fy1 = Math.min(mWalkY - 4, camY + bBR.y + 8);
      const fc0 = Math.max(0, Math.floor(fx0 / TILE));
      const fc1 = Math.min(lv.cols - 1, Math.floor(fx1 / TILE));
      const fr0 = Math.max(0, Math.floor(fy0 / TILE));
      const fr1 = Math.min(lv.rows - 1, Math.floor(fy1 / TILE));

      for (let rr = fr0; rr <= fr1; rr++) {
        for (let cc = fc0; cc <= fc1; cc++) {
          const t = lv.tile(cc, rr);
          if (lv.isSolid(cc, rr) || lv.isStandable(cc, rr) || t === 6 || t === 5) return null;
        }
      }
      if (Array.isArray(lv.bridgeRuns)) {
        for (const br of lv.bridgeRuns) {
          if (
            (br.x1 + 1) * TILE > fx0 && br.x0 * TILE < fx1 &&
            (br.y + 4) * TILE > fy0 && br.y * TILE - 8 < fy1
          ) {
            return null;
          }
        }
      }
      if (Array.isArray(lv.stairs)) {
        for (const st of lv.stairs) {
          const sx0 = Math.min(st.x0, st.x1) - 12, sx1 = Math.max(st.x0, st.x1) + 12;
          const sy0 = Math.min(st.y0, st.y1) - 12, sy1 = Math.max(st.y0, st.y1) + 12;
          if (sx1 > fx0 && sx0 < fx1 && sy1 > fy0 && sy0 < fy1) return null;
        }
      }
      if (Array.isArray(lv.platformRuns)) {
        for (const pr of lv.platformRuns) {
          if (
            (pr.x1 + 1) * TILE > fx0 && pr.x0 * TILE < fx1 &&
            pr.y * TILE < mWalkY - 8 && mWalkY - 4 > fy0 && pr.y * TILE - 4 < fy1
          ) {
            return null;
          }
        }
      }
      if (Array.isArray(lv.movers)) {
        for (const mv of lv.movers) {
          if (
            mv.maxX + 24 > fx0 && mv.minX - 24 < fx1 &&
            mv.maxY + 24 > fy0 && mv.minY - 16 < fy1
          ) {
            return null;
          }
        }
      }
    }

    const nearCheckpoint = Array.isArray(lv.checkpoints) &&
      lv.checkpoints.some((cp) => {
        const cx = typeof cp === 'number' ? cp : cp?.x;
        return Number.isFinite(cx) && Math.abs(cx - midX) < BAY_W + 28;
      });
    const walkPenalty = (nCols - walkableCols) * 2.5;
    return Math.abs(bi - targetBi) + walkPenalty + (nearCheckpoint ? 28 : 0);
  }

  /** Chooses the grand-staircase, orrery, and unobstructed grand-mural bays of a hall (once per room). */
  specialBays(r, roomIndex, floorRow, abyssHall) {
    const hit = this._special.get(roomIndex);
    if (hit) return hit;
    const out = { stair: null, stairRow: floorRow, orrery: null, orreryRow: floorRow, murals: [], muralRows: new Map() };
    if (!r.cylinder) {
      const lv = this.level;
      const { ceilY } = this._roomBounds(r, abyssHall);
      const roomX0 = r.x0 * TILE, roomW = (r.x1 - r.x0 + 1) * TILE;
      const biMin = Math.floor(roomX0 / BAY_W), biMax = Math.floor((r.x1 * TILE) / BAY_W);
      if (!abyssHall) {
        const pick = (frac, exclude) => {
          const target = roomX0 + roomW * frac;
          let best = null, bestRow = floorRow, bestD = Infinity;
          for (let bi = biMin; bi <= biMax; bi++) {
            const m = mod(bi, 6);
            if ((m !== 5 && m !== 1) || bi === exclude) continue;
            const midX = (bi + 0.5) * BAY_W;
            const row = this.bayFooting(r, midX, floorRow, 118);
            if (row < 0) continue;
            const d = Math.abs(midX - target) + (m === 1 ? 600 : 0);   // prefer plain alcove slots
            if (d < bestD) { bestD = d; best = bi; bestRow = row; }
          }
          return { bi: best, row: bestRow };
        };
        const st = pick(0.42, null);
        out.stair = st.bi; out.stairRow = st.row;
        if (ORRERY_THEMES.has(this.stageTheme) || ORRERY_THEMES.has(this.themeKey)) {
          const orr = pick(0.72, out.stair);
          out.orrery = orr.bi; out.orreryRow = orr.row;
        }
      }
      // Monumental 2-bay Grand Mural / Tapestry Galleries (`2 * BAY_W = 512px` wide):
      // evaluate all walkable story tiers across the room and project the exact 3D
      // sightline so murals never hide behind upper-story floors, bridge piers, or stairs.
      const muralKey = MURAL_BY_THEME[this.stageTheme] || MURAL_BY_THEME[this.themeKey];
      if (muralKey && this.assets.img(muralKey) && biMax - biMin >= 3) {
        const fracs = (biMax - biMin >= 9) ? [0.18, 0.56, 0.86] : [0.22, 0.78];
        for (const frac of fracs) {
          const targetBi = Math.round((roomX0 + roomW * frac) / BAY_W);
          let chosen = null, chosenRow = floorRow, bestScore = Infinity;
          for (let bi = biMin + 1; bi <= biMax - 2; bi++) {
            const c0 = Math.max(r.x0 + 1, Math.floor((bi * BAY_W + 24) / TILE));
            const c1 = Math.min(r.x1 - 1, Math.floor(((bi + 2) * BAY_W - 24) / TILE));
            if (c1 <= c0 + 4) continue;
            const rowCounts = new Map();
            const rrMin = Math.max(3, r.y0 + 2);
            const rrMax = Math.min(lv.rows - 2, floorRow + 1);
            for (let c = c0; c <= c1; c++) {
              for (let rr = rrMin; rr <= rrMax; rr++) {
                if (lv.isStandable(c, rr) && !lv.isSolid(c, rr - 1) && !lv.isSolid(c, rr - 2)) {
                  rowCounts.set(rr, (rowCounts.get(rr) || 0) + 1);
                }
              }
            }
            for (const [candRow, cnt] of rowCounts) {
              if (cnt < 4) continue;
              const score = this._evalMuralSpan(r, ceilY, abyssHall, bi, candRow, targetBi, out);
              if (score != null && score < bestScore) {
                bestScore = score;
                chosen = bi;
                chosenRow = candRow;
              }
            }
          }
          if (chosen != null) {
            out.murals.push(chosen);
            out.muralRows.set(chosen, chosenRow);
          }
        }
      }
    }
    this._special.set(roomIndex, out);
    return out;
  }

  /** True when foreground column `wx` crosses horizontally in front of any Grand Mural. */
  overlapsMuralX(wx) {
    const muralKey = MURAL_BY_THEME[this.stageTheme] || MURAL_BY_THEME[this.themeKey];
    if (!muralKey || !this.level.rooms.length) return false;
    const abyssHall = this.themeKey === 'ossuary' || this.themeKey === 'darkcave';
    const tx = Math.floor(wx / TILE);
    for (let ri = 0; ri < this.level.rooms.length; ri++) {
      const r = this.level.rooms[ri];
      if (r.cylinder || tx < r.x0 - 2 || tx > r.x1 + 2) continue;
      const { floorRow } = this._roomBounds(r, abyssHall);
      const sp = this.specialBays(r, ri, floorRow, abyssHall);
      if (!sp.murals || !sp.murals.length) continue;
      for (const mBi of sp.murals) {
        if (wx >= mBi * BAY_W - 44 && wx <= (mBi + 2) * BAY_W + 44) return true;
      }
    }
    return false;
  }

  /** True when world position `(wx, wy)` lies across a 2-bay Grand Mural gallery's sightline. */
  overlapsMural(wx, wy) {
    const muralKey = MURAL_BY_THEME[this.stageTheme] || MURAL_BY_THEME[this.themeKey];
    if (!muralKey || !this.level.rooms.length) return false;
    const abyssHall = this.themeKey === 'ossuary' || this.themeKey === 'darkcave';
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    const maxCamY = Math.max(0, this.level.height - H);
    const sBack = FOCAL / (FOCAL + 228);
    for (let ri = 0; ri < this.level.rooms.length; ri++) {
      const r = this.level.rooms[ri];
      if (r.cylinder || tx < r.x0 - 1 || tx > r.x1 + 1 || ty < r.y0 - 4 || ty > r.y1 + 2) continue;
      const { floorRow, ceilY } = this._roomBounds(r, abyssHall);
      const sp = this.specialBays(r, ri, floorRow, abyssHall);
      if (!sp.murals || !sp.murals.length) continue;
      for (const mBi of sp.murals) {
        if (wx < mBi * BAY_W - 36 || wx > (mBi + 2) * BAY_W + 36) continue;
        const mRow = (sp.muralRows && sp.muralRows.get(mBi)) ?? floorRow;
        const mWalkY = mRow * TILE;
        const mBot = abyssHall ? mWalkY - 34 : mWalkY - 38;
        const mTop = Math.max(ceilY + 52, mBot - 196);
        const camY = Math.max(0, Math.min(maxCamY, Math.round(mWalkY - H * 0.62)));
        const fgTopY = camY + EYE_Y + (mTop - camY - EYE_Y) * sBack;
        if (wy >= fgTopY - 24 && wy <= mWalkY + 18) return true;
      }
    }
    return false;
  }

  /**
   * Which 2.5D feature fills the ground tier of far-wall bay `bi`, with its
   * footing row: 'glass' (stained lancet) | 'crypt' (bone shelves) | 'alcove' |
   * 'sky' (open lancet onto the night) | 'corridor' (deep perspective passage) |
   * 'stair' | 'orrery'. Even bays keep their windows; each group of six bays
   * places one corridor and (in castle halls) one sky lancet on whichever of
   * its odd bays are clear, so blocked slots fall through to the next candidate.
   */
  bayKind(r, roomIndex, bi, floorRow, abyssHall) {
    const key = roomIndex * 100000 + bi;
    const hit = this._bayKinds.get(key);
    if (hit) return hit;
    const crypt = !!this.pal.crypt;
    let kind = crypt ? 'crypt' : (mod(bi, 2) === 0 ? 'glass' : 'alcove');
    let row = floorRow;
    const special = this.specialBays(r, roomIndex, floorRow, abyssHall);
    if (special.murals && special.murals.includes(bi)) {
      kind = 'mural_left';
      row = (special.muralRows && special.muralRows.get(bi)) ?? floorRow;
    } else if (special.murals && special.murals.includes(bi - 1)) {
      kind = 'mural_right';
      row = (special.muralRows && special.muralRows.get(bi - 1)) ?? floorRow;
    }
    else if (special.stair === bi) { kind = 'stair'; row = special.stairRow; }
    else if (special.orrery === bi) { kind = 'orrery'; row = special.orreryRow; }
    else {
      const g = Math.floor(bi / 6) * 6;
      const inMural = (b) => special.murals && (special.murals.includes(b) || special.murals.includes(b - 1));
      const taken = (b) => b === special.stair || b === special.orrery || inMural(b);
      const footing = (b, halfW) => (taken(b) ? -1 : this.bayFooting(r, (b + 0.5) * BAY_W, floorRow, halfW));
      let corridor = null, corridorRow = floorRow;
      for (const b of [g + 3, g + 5, g + 1]) {
        const fr = footing(b, 110);
        if (fr >= 0) { corridor = b; corridorRow = fr; break; }
      }
      let sky = null, skyRow = floorRow;
      if (!crypt && (SKY_THEMES.has(this.stageTheme) || SKY_THEMES.has(this.themeKey))) {
        // Prefer a plain alcove slot; otherwise unglaze one of the group's stained lancets.
        for (const b of [g + 1, g + 5, g + 3, g + 4, g + 2]) {
          if (b === corridor) continue;
          const fr = footing(b, 60);
          if (fr >= 0) { sky = b; skyRow = fr; break; }
        }
      }
      if (bi === corridor) { kind = 'corridor'; row = corridorRow; }
      else if (bi === sky) { kind = 'sky'; row = skyRow; }
    }
    const res = { kind, row };
    this._bayKinds.set(key, res);
    return res;
  }

  // ========================================================= OUTDOOR 3D
  drawOutdoor3D(ctx, cam, time, flash) {
    this.drawSky3D(ctx, cam, time);
    this.drawMidHorizon3D(ctx, cam, time, flash);
    this.drawOutdoorGround3D(ctx, cam, time);
  }

  /** Celestial 3D sky ribbons (drawn inside the sky dome BEHIND mountains & trees). */
  drawSky3D(ctx, cam, time) {
    if (this.stageTheme === 'yule' || this.stageTheme === 'skykeep') {
      this.drawAurora3D(ctx, cam.rx, time);
    }
  }

  /**
   * Mid-far 3D horizon landmarks (`fx ≈ 0.25`, drawn AFTER far mountains/ridges
   * and BEFORE near scrolling cemetery trees & wheeling bat flocks).
   */
  drawMidHorizon3D(ctx, cam, time, flash) {
    const camX = cam.rx, camY = cam.ry;
    if (this.stageTheme === 'skykeep') {
      this.drawDistantKeep3D(ctx, camX, camY, time, flash, 0.84, true);
      return;
    }
    const k = this.themeKey;
    if (k !== 'graveyard' && k !== 'ramparts') return;
    let alpha = 1;
    if (k === 'graveyard' && this.level.rooms.length > 0) {
      const roomX = this.level.rooms[0].x0 * TILE;
      alpha = clamp01((roomX - (camX + W + 96)) / 360);
      if (alpha <= 0.01) return;
    }
    if (alpha < 0.999) {
      ctx.save();
      ctx.globalAlpha = alpha;
      this.drawDistantKeep3D(ctx, camX, camY, time, flash, k === 'ramparts' ? 0.88 : 0.65);
      ctx.restore();
    } else {
      this.drawDistantKeep3D(ctx, camX, camY, time, flash, k === 'ramparts' ? 0.88 : 0.65);
    }
  }

  /**
   * Outdoor 3D ground/water planes & colonnades, aligned right at the ground
   * baseline of the scrolling backdrop layers so trees, pumpkins, tombstones,
   * and snowbound cottages are never sliced in half by the horizon line.
   */
  drawOutdoorGround3D(ctx, cam, time) {
    const camX = cam.rx, camY = cam.ry;
    const k = this.themeKey;

    if (this.stageTheme === 'skykeep') {
      this.drawScanlinePlane(ctx, cam, time, {
        kind: 'cloudsea', horizon: 236, fx: 0.44, focal: 108, flow: 16,
        fog: [14, 22, 46], shimmer: true, shimmerRgb: [196, 238, 255],
      });
      this.drawSkykeepSanctums3D(ctx, camX, camY, time);
      this.drawRampartParapets3D(ctx, camX, camY, 'marble');
    } else if (k === 'ramparts') {
      this.drawHorizonWall(ctx, cam, 186);
      this.drawScanlinePlane(ctx, cam, time, {
        kind: 'courtyard', horizon: 186, fx: 0.44, focal: 120,
        fog: [16, 15, 32], torches: true,
      });
      this.drawRampartParapets3D(ctx, camX, camY);
    } else if (k === 'yule') {
      if (this.stageTheme !== 'yule') {
        this.drawScanlinePlane(ctx, cam, time, {
          kind: 'courtyard', horizon: 242, fx: 0.46, focal: 105,
          fog: [12, 13, 24], torches: false,
        });
      } else {
        this.drawScanlinePlane(ctx, cam, time, {
          kind: 'ice', horizon: 242, fx: 0.46, focal: 105,
          fog: [14, 22, 42], shimmer: true,
          water: { tint: [0.45, 0.62, 0.9], spec: [0.85, 0.95, 1.0], frozen: 1, alpha: 0.62 },
        });
      }
      this.drawYuleVillage3D(ctx, camX, camY, time);
    } else if (k === 'darkwood') {
      this.drawScanlinePlane(ctx, cam, time, {
        kind: 'darkwood', horizon: 242, fx: 0.48, focal: 96, flow: 38,
        fog: [8, 18, 22], shimmer: true, shimmerRgb: [95, 235, 185],
        water: { tint: [0.1, 0.45, 0.42], spec: [0.45, 1.0, 0.8], frozen: 0, alpha: 0.78 },
      });
      this.drawDarkwoodColonnade3D(ctx, camX, camY, time);
    } else if (k === 'forest') {
      this.drawScanlinePlane(ctx, cam, time, {
        kind: 'forest', horizon: 248, fx: 0.50, focal: 95,
        fog: [16, 11, 22],
      });
      this.drawForestColonnade3D(ctx, camX, camY, time);
    } else if (k === 'graveyard') {
      const hasRoom = this.level.rooms.length > 0;
      const roomX = hasRoom ? this.level.rooms[0].x0 * TILE : Infinity;
      if (!hasRoom) {
        // Forged moorland wings: open moor and fence all the way, no barbican set-piece.
        this.drawScanlinePlane(ctx, cam, time, { kind: 'moor', horizon: 238, fx: 0.48, focal: 96, fog: [13, 12, 26] });
        this.drawMausoleums3D(ctx, camX, camY, time, this.level.cols - 1);
        this.drawCemeteryFence3D(ctx, camX, camY, this.level.cols - 1);
      } else if (camX < roomX + 96) {
        const portalX = Math.round(project3D(roomX - 18, EYE_Y, 40, camX, camY).x);
        this.drawScanlinePlane(ctx, cam, time, {
          kind: 'moor', horizon: 238, fx: 0.48, focal: 96,
          fog: [13, 12, 26], clipRight: portalX + 8,
        });
        const fenceEnd = Math.min(this.level.cols - 1, Math.floor(roomX / TILE) - 8);
        this.drawMausoleums3D(ctx, camX, camY, time, fenceEnd);
        this.drawCemeteryFence3D(ctx, camX, camY, fenceEnd);
        this.drawGatehouseSetPiece3D(ctx, camX, camY, time, Math.floor(roomX / TILE));
      }
    }
  }

  /** Undulating 3D aurora ribbons high in the winter sky. */
  drawAurora3D(ctx, camX, time) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let band = 0; band < 2; band++) {
      const baseY = 44 + band * 18;
      const cols = 28;
      for (let i = 0; i < cols; i++) {
        const a0 = i / cols, a1 = (i + 1) / cols;
        const x0 = a0 * (W + 160) - 80, x1 = a1 * (W + 160) - 80;
        const w0 = Math.sin(a0 * 5.2 + time * 0.45 + band * 2.1 - camX * 0.0012);
        const w1 = Math.sin(a1 * 5.2 + time * 0.45 + band * 2.1 - camX * 0.0012);
        const y0 = baseY + w0 * 14, y1 = baseY + w1 * 14;
        const h = 38 + 14 * Math.sin(a0 * 9 + time * 0.7);
        const alpha = (0.045 + 0.03 * Math.max(0, w0)) * (band === 0 ? 1 : 0.75);
        ctx.fillStyle = band === 0
          ? `rgba(90, 230, 195, ${alpha.toFixed(3)})`
          : `rgba(140, 120, 255, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(x0, y0 + h);
        ctx.lineTo(x1, y1 + h);
        ctx.lineTo(x1 + 8, y1 - h * 0.5);
        ctx.lineTo(x0 + 8, y0 - h * 0.5);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /**
   * Texture-mapped High-Polygon 3D Gothic Citadel perched in the background,
   * with Great Nave, transept wings, 9 polygonal towers & needle spires,
   * corbelled machicolation crowns, flying buttresses, arched sky-bridges,
   * and glowing rose + lancet windows turning in true 3D perspective.
   */
  drawDistantKeep3D(ctx, camX, camY, time, flash, scale = 0.7, celestial = false) {
    const keepScreenX = Math.round(W + 140 - mod(camX * 0.26 + 260, W + 920));
    const keepScreenY = Math.round((celestial ? 156 : 168) + parallaxElevY(camY, this.level.height) * 0.11);
    if (keepScreenX < -160 || keepScreenX > W + 160) return;
    const yaw = ((W * 0.5 - keepScreenX) / (W + 280)) * 0.84;
    const fog = this.pal.fog;
    const stoneTex = this.tex(celestial ? 'marble' : 'keep_stone');
    const trimTex = this.tex(celestial ? 'marble' : 'stone_trim');
    const roofTex = this.tex(celestial ? 'stone_trim' : 'slate_roof');
    const flashBoost = flash > 0.05 ? 1.35 : 0.76;

    const proj = (v) => {
      const s = (260 / (260 + v.z)) * scale;
      return { x: keepScreenX + v.x * s, y: keepScreenY + v.y * s, s };
    };

    const drawPrism = (ox, oy, oz, rad, h, sides, coneH = 0, crown = false) => {
      const ptsTop = [], ptsBot = [], ptsCrownB = [], ptsCrownT = [];
      const crownR = rad + 2.4;
      const tip = rotY(ox, oy - h - coneH, oz, yaw);
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const px = ox + ca * rad, pz = oz + sa * rad;
        ptsBot.push(rotY(px, oy, pz, yaw));
        ptsTop.push(rotY(px, oy - h, pz, yaw));
        if (crown) {
          ptsCrownB.push(rotY(ox + ca * crownR, oy - h + 6, oz + sa * crownR, yaw));
          ptsCrownT.push(rotY(ox + ca * crownR, oy - h - 2, oz + sa * crownR, yaw));
        }
      }
      const faceW = Math.max(10, Math.round((Math.PI * 2 * rad) / sides));
      const order = [];
      for (let i = 0; i < sides; i++) {
        const j = (i + 1) % sides;
        order.push({ i, j, z: (ptsBot[i].z + ptsBot[j].z) * 0.5 });
      }
      order.sort((a, b) => b.z - a.z);
      const centerRot = rotY(ox, 0, oz, yaw);
      for (const { i, j } of order) {
        const b0 = proj(ptsBot[i]), b1 = proj(ptsBot[j]);
        const t1 = proj(ptsTop[j]), t0 = proj(ptsTop[i]);
        if (b1.x <= b0.x + 0.25) continue; // backface
        const nx = (ptsBot[i].x + ptsBot[j].x) * 0.5 - centerRot.x;
        const nz = (ptsBot[i].z + ptsBot[j].z) * 0.5 - centerRot.z;
        const n = norm3(nx, -0.1, nz);
        const u0 = i * faceW, u1 = (i + 1) * faceW;
        const wallShade = shadeOverlay32(n, fog, 0.50, flashBoost);
        texQuad(ctx, stoneTex, t0, t1, b1, b0, u0, 0, u1, 0, u1, h, u0, h, wallShade);
        if (crown) {
          const cb0 = proj(ptsCrownB[i]), cb1 = proj(ptsCrownB[j]);
          const ct1 = proj(ptsCrownT[j]), ct0 = proj(ptsCrownT[i]);
          const cShade = shadeOverlay32(norm3(nx, -0.28, nz), fog, 0.46, flashBoost * 1.04);
          texQuad(ctx, trimTex, ct0, ct1, cb1, cb0, u0, 0, u1, 0, u1, 8, u0, 8, cShade);
        }
        if (coneH > 0) {
          const base0 = crown ? proj(ptsCrownT[i]) : t0;
          const base1 = crown ? proj(ptsCrownT[j]) : t1;
          const tp = proj(tip);
          const cn = norm3(nx, -0.52, nz);
          const roofShade = shadeOverlay32(cn, fog, 0.44, flashBoost);
          texTri(ctx, roofTex, base0, base1, tp, u0, coneH, u1, coneH, (u0 + u1) * 0.5, 0, roofShade, 0.45);
        }
      }
    };

    const drawGabledHall = (ox, oy, oz, hw, hd, h, gableH) => {
      const c = [
        [-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd],
        [-hw, -h, -hd], [hw, -h, -hd], [hw, -h, hd], [-hw, -h, hd],
      ].map(([dx, dy, dz]) => rotY(ox + dx, oy + dy, oz + dz, yaw));
      const rF = rotY(ox, oy - h - gableH, oz - hd, yaw);
      const rB = rotY(ox, oy - h - gableH, oz + hd, yaw);
      const faces = [
        { idx: [4, 5, 1, 0], u: hw * 2, v: h, n: rotY(0, -0.08, -1, yaw), z: (c[0].z + c[1].z) * 0.5, gable: rF },
        { idx: [6, 7, 3, 2], u: hw * 2, v: h, n: rotY(0, -0.08, 1, yaw), z: (c[2].z + c[3].z) * 0.5, gable: rB },
        { idx: [7, 4, 0, 3], u: hd * 2, v: h, n: rotY(-1, -0.08, 0, yaw), z: (c[0].z + c[3].z) * 0.5, gable: null },
        { idx: [5, 6, 2, 1], u: hd * 2, v: h, n: rotY(1, -0.08, 0, yaw), z: (c[1].z + c[2].z) * 0.5, gable: null },
      ].sort((a, b) => b.z - a.z);

      for (const f of faces) {
        const p0 = proj(c[f.idx[0]]), p1 = proj(c[f.idx[1]]), p2 = proj(c[f.idx[2]]), p3 = proj(c[f.idx[3]]);
        if (p1.x <= p0.x + 0.25) continue;
        const sh = shadeOverlay32([f.n.x, f.n.y, f.n.z], fog, 0.51, flashBoost);
        texQuad(ctx, stoneTex, p0, p1, p2, p3, 0, 0, f.u, 0, f.u, f.v, 0, f.v, sh);
        if (f.gable && gableH > 0) {
          const gp = proj(f.gable);
          texTri(ctx, stoneTex, p0, gp, p1, 0, gableH, f.u * 0.5, 0, f.u, gableH, sh, 0.45);
        }
      }
      if (gableH > 0) {
        const slopes = [
          { a: c[7], b: c[4], r0: rB, r1: rF, n: rotY(-0.7, -0.7, 0, yaw), z: (c[7].z + c[4].z + rB.z + rF.z) * 0.25 },
          { a: c[5], b: c[6], r0: rF, r1: rB, n: rotY(0.7, -0.7, 0, yaw), z: (c[5].z + c[6].z + rF.z + rB.z) * 0.25 },
        ].sort((u, v) => v.z - u.z);
        for (const sl of slopes) {
          const q0 = proj(sl.r0), q1 = proj(sl.r1), q2 = proj(sl.b), q3 = proj(sl.a);
          const area = (q1.x - q0.x) * (q3.y - q0.y) - (q1.y - q0.y) * (q3.x - q0.x);
          if (area <= 0.2) continue;
          const rSh = shadeOverlay32([sl.n.x, sl.n.y, sl.n.z], fog, 0.45, flashBoost);
          texQuad(ctx, roofTex, q0, q1, q2, q3, 0, 0, hd * 2, 0, hd * 2, gableH + 10, 0, gableH + 10, rSh);
        }
      }
    };

    const drawFlyer = (x0, y0, z0, x1, y1, z1, thick = 4.5) => {
      const aT = proj(rotY(x0, y0, z0, yaw)), bT = proj(rotY(x1, y1, z1, yaw));
      const bB = proj(rotY(x1, y1 + thick, z1, yaw)), aB = proj(rotY(x0, y0 + thick * 1.35, z0, yaw));
      const sh = shadeOverlay32([0, -0.45, -0.88], fog, 0.48, flashBoost);
      texQuad(ctx, trimTex, aT, bT, bB, aB, 0, 0, 28, 0, 28, 8, 0, 8, sh);
    };

    ctx.save();
    const parts = [
      // Multi-tiered polygonal Gothic basilica halls, transepts, 9 towers & needle spires
      { kind: 'hall', ox: 0, oy: 28, oz: 4, hw: 34, hd: 17, h: 66, gable: 24 },
      { kind: 'hall', ox: -46, oy: 30, oz: 10, hw: 18, hd: 13, h: 48, gable: 16 },
      { kind: 'hall', ox: 46, oy: 30, oz: 10, hw: 18, hd: 13, h: 50, gable: 16 },
      { kind: 'tower', ox: -76, oy: 32, oz: 22, r: 10, h: 58, sides: 6, cone: 28, crown: true },
      { kind: 'tower', ox: 74, oy: 30, oz: 20, r: 11, h: 64, sides: 6, cone: 30, crown: true },
      { kind: 'tower', ox: -54, oy: 24, oz: 28, r: 15, h: 82, sides: 6, cone: 36, crown: true },
      { kind: 'tower', ox: 52, oy: 20, oz: 24, r: 15, h: 90, sides: 6, cone: 40, crown: true },
      { kind: 'tower', ox: 0, oy: 26, oz: 0, r: 28, h: 110, sides: 8, cone: 30, crown: true },
      { kind: 'tower', ox: 0, oy: -82, oz: 0, r: 12, h: 40, sides: 8, cone: 38, crown: true },
      { kind: 'tower', ox: -22, oy: -34, oz: -12, r: 7.5, h: 44, sides: 6, cone: 28, crown: false },
      { kind: 'tower', ox: -36, oy: 30, oz: -24, r: 13, h: 66, sides: 6, cone: 30, crown: true },
      { kind: 'tower', ox: 38, oy: 30, oz: -20, r: 14, h: 72, sides: 6, cone: 32, crown: true },
      { kind: 'flyer', x0: -52, y0: -32, z0: 24, x1: -26, y1: -56, z1: 4, ox: -39, oz: 14 },
      { kind: 'flyer', x0: 50, y0: -36, z0: 20, x1: 26, y1: -58, z1: 4, ox: 38, oz: 12 },
      { kind: 'flyer', x0: -35, y0: -20, z0: -22, x1: -22, y1: -44, z1: -6, ox: -28, oz: -14 },
      { kind: 'flyer', x0: 36, y0: -24, z0: -18, x1: 22, y1: -46, z1: -6, ox: 29, oz: -12 },
      { kind: 'flyer', x0: -74, y0: -8, z0: 22, x1: -54, y1: -16, z1: 26, ox: -64, oz: 24 },
      { kind: 'flyer', x0: 72, y0: -12, z0: 20, x1: 52, y1: -20, z1: 24, ox: 62, oz: 22 },
    ].map((p) => Object.assign(p, { rz: rotY(p.ox, 0, p.oz, yaw).z }))
      .sort((a, b) => b.rz - a.rz);

    for (const p of parts) {
      if (p.kind === 'tower') drawPrism(p.ox, p.oy, p.oz, p.r, p.h, p.sides, p.cone, p.crown);
      else if (p.kind === 'hall') drawGabledHall(p.ox, p.oy, p.oz, p.hw, p.hd, p.h, p.gable);
      else drawFlyer(p.x0, p.y0, p.z0, p.x1, p.y1, p.z1);
    }

    // Warm lit Gothic rose window & multi-lancet slits across the citadel faces.
    const pulse = 0.54 + 0.20 * Math.sin(time * 3.1);
    const lancets = [
      { x: 0, y: -56, z: -28, rose: true },
      { x: 0, y: -98, z: -12, rose: false },
      { x: -36, y: -18, z: -36, rose: false },
      { x: 38, y: -22, z: -33, rose: false },
      { x: -54, y: -34, z: 14, rose: false },
      { x: 52, y: -40, z: 10, rose: false },
    ];
    for (const lw of lancets) {
      const wRot = rotY(lw.x, lw.y, lw.z, yaw);
      if (wRot.z >= 14) continue;
      const wp = proj(wRot);
      const wx = Math.round(wp.x), wy = Math.round(wp.y);
      ctx.fillStyle = celestial
        ? `rgba(170, 232, 255, ${(pulse * 0.95).toFixed(2)})`
        : `rgba(255, 188, 92, ${pulse.toFixed(2)})`;
      if (lw.rose) {
        ctx.beginPath();
        ctx.arc(wx, wy - 7, Math.max(2.2, 4.2 * wp.s), 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(wx - 5, wy, 2, 7);
        ctx.fillRect(wx - 1, wy - 1, 2, 8);
        ctx.fillRect(wx + 3, wy, 2, 7);
      } else {
        ctx.fillRect(wx - 3, wy, 2, 6);
        ctx.fillRect(wx + 1, wy, 2, 6);
      }
    }
    ctx.restore();
  }

  /**
   * Scanline-projected horizontal ground/water/abyss plane receding toward
   * `cfg.horizon`. Pre-bakes a 512x128 tileable procedural texture once.
   */
  drawScanlinePlane(ctx, cam, time, cfg) {
    const horizon = Math.round(cfg.horizon + parallaxElevY(cam.ry, this.level.height) * 0.22);
    if (horizon >= H - 2) return;
    const tex = this.getPlaneTexture(cfg.kind);
    const clipW = cfg.clipRight == null ? W : Math.min(W, Math.max(0, Math.round(cfg.clipRight)));
    if (clipW <= 0) return;

    ctx.save();
    if (clipW < W) { ctx.beginPath(); ctx.rect(0, Math.max(0, horizon), clipW, H - Math.max(0, horizon)); ctx.clip(); }

    const scroll = cam.rx * cfg.fx;
    const focal = cfg.focal || 110;
    const yStart = Math.max(0, horizon + 1);
    // Horizontal current in WORLD px/s (left -> right): applied in texel space so perspective
    // naturally makes distant rows drift slower on screen than near rows (true 2.5D flow).
    const flow = cfg.flow || 0;
    for (let y = yStart; y < H; y += 1) {
      const dy = Math.max(1, y - horizon);
      const z = focal / dy;
      const ratio = Math.min(3.0, Math.max(0.95, z * 1.08));
      const shimmer = cfg.shimmer ? Math.sin(y * 0.35 + time * 3.2) * 3.5 : 0;
      const u = mod(scroll * 0.9 + shimmer - EYE_X * ratio - time * flow, tex.width);
      const v = mod(Math.floor(180 / Math.max(0.18, z)) + (cfg.drift ? Math.floor(time * 12) : 0), tex.height - 1);
      let drawn = 0, tu = u;
      while (drawn < clipW) {
        const avail = tex.width - tu;
        const need = (clipW - drawn) * ratio;
        const take = Math.min(avail, need);
        const dw = Math.max(1, Math.ceil(take / ratio));
        ctx.drawImage(tex, Math.floor(tu), v, Math.max(1, Math.ceil(take)), 1, drawn, y, dw, 1);
        drawn += dw;
        tu = 0;
      }
    }

    // Single vertical atmospheric depth-fog pass over the entire ground plane
    const fgGrad = ctx.createLinearGradient(0, Math.max(0, horizon), 0, H);
    fgGrad.addColorStop(0, rgbA(cfg.fog, 0.93));
    fgGrad.addColorStop(0.22, rgbA(cfg.fog, 0.70));
    fgGrad.addColorStop(0.55, rgbA(cfg.fog, 0.42));
    fgGrad.addColorStop(1, rgbA(cfg.fog, 0.24));
    ctx.fillStyle = fgGrad;
    ctx.fillRect(0, yStart, clipW, H - yStart);

    const hz = ctx.createLinearGradient(0, horizon - 10, 0, horizon + 24);
    hz.addColorStop(0, rgbA(cfg.fog, 0));
    hz.addColorStop(0.45, rgbA(cfg.fog, 0.92));
    hz.addColorStop(1, rgbA(cfg.fog, 0));
    ctx.fillStyle = hz;
    ctx.fillRect(0, horizon - 10, clipW, 34);

    if (cfg.torches) {
      const glow = getGlowCanvas('flame');
      const spacing = 180;
      const i0 = Math.floor((scroll - 400) / spacing);
      for (let i = i0; i <= i0 + 8; i++) {
        const rowIdx = ((i * 7) & 3) + 1;
        const dy = 14 + rowIdx * 28;
        const py = horizon + dy;
        if (py >= H - 4) continue;
        const scale = dy / focal;
        const worldOff = i * spacing - scroll;
        const px = Math.round(EYE_X + worldOff * scale * 1.1);
        if (px < -20 || px > clipW + 20) continue;
        const flick = 0.7 + 0.3 * Math.sin(time * 13 + i * 2.7);
        const r = Math.max(4, Math.round(14 * scale));
        if (glow) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.50 * flick;
          ctx.drawImage(glow, px - r * 2.2, py - r * 2.2, r * 4.4, r * 4.4);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.fillStyle = '#ffd88a';
        ctx.fillRect(px - 1, py - 2, Math.max(1, Math.round(2 * scale)), Math.max(1, Math.round(3 * scale)));
      }
    }

    if (cfg.shimmer) {
      const sr = cfg.shimmerRgb || [185, 220, 255];
      ctx.globalCompositeOperation = 'lighter';
      const moonX = Math.round(W * 0.72 - (cam.rx * 0.03) % 80);
      for (let y = Math.max(0, horizon + 4); y < H; y += 4) {
        const k = (y - horizon) / Math.max(1, H - horizon);
        const wob = Math.sin(y * 0.45 + time * 4.2) * (4 + k * 14);
        const rw = Math.round(10 + k * 42);
        ctx.fillStyle = `rgba(${sr[0]}, ${sr[1]}, ${sr[2]}, ${(0.05 + 0.08 * (1 - k)).toFixed(3)})`;
        ctx.fillRect(Math.round(moonX + wob - rw * 0.5), y, rw, 2);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // Shader water: flowing stream / frozen lake / spectral sea overlaid on the plane
    if (cfg.water) {
      const fx = getFxLayers();
      if (fx) {
        fx.water(ctx, { x: 0, y: Math.max(0, horizon), w: clipW, h: H - Math.max(0, horizon) }, {
          horizon, camX: cam.rx * cfg.fx - time * flow, tint: cfg.water.tint, spec: cfg.water.spec,
          frozen: cfg.water.frozen || 0, alpha: (cfg.water.alpha == null ? 1 : cfg.water.alpha) * 0.82,
        });
      }
    }
    ctx.restore();
  }

  /** Texture-mapped 3D crenellated bailey curtain wall & watchtowers along the ramparts horizon. */
  drawHorizonWall(ctx, cam, baseHorizon) {
    const hy = Math.round(baseHorizon + parallaxElevY(cam.ry, this.level.height) * 0.22);
    const scroll = Math.round(cam.rx * 0.35);
    const stoneTex = this.tex('keep_stone');
    const roofTex = this.tex('slate_roof');
    const wallShade = shadeOverlay32([0, -0.1, -1], this.pal.fog, 0.56, 0.72);
    const roofShade = shadeOverlay32([0, -0.5, -0.8], this.pal.fog, 0.50, 0.75);
    if (!stoneTex || !roofTex) return;

    texQuad(
      ctx, stoneTex,
      { x: 0, y: hy - 9 }, { x: W, y: hy - 9 }, { x: W, y: hy + 2 }, { x: 0, y: hy + 2 },
      scroll, 0, scroll + W, 0, scroll + W, 11, scroll, 11, wallShade,
    );
    const i0 = Math.floor((scroll - 24) / 24);
    const i1 = Math.ceil((scroll + W + 24) / 24);
    for (let i = i0; i <= i1; i++) {
      const x = i * 24 - scroll;
      const u = i * 24;
      texQuad(
        ctx, stoneTex,
        { x, y: hy - 15 }, { x: x + 14, y: hy - 15 }, { x: x + 14, y: hy - 9 }, { x, y: hy - 9 },
        u, 0, u + 14, 0, u + 14, 6, u, 6, wallShade,
      );
      if (mod(i, 9) === 0) {
        texQuad(
          ctx, stoneTex,
          { x: x - 4, y: hy - 31 }, { x: x + 18, y: hy - 31 }, { x: x + 18, y: hy - 9 }, { x: x - 4, y: hy - 9 },
          u - 4, 0, u + 18, 0, u + 18, 22, u - 4, 22, wallShade,
        );
        texTri(
          ctx, roofTex,
          { x: x - 6, y: hy - 31 }, { x: x + 20, y: hy - 31 }, { x: x + 7, y: hy - 46 },
          u - 6, 15, u + 20, 15, u + 7, 0, roofShade, 0.45,
        );
      }
    }
  }

  /**
   * 3D texture-mapped stone merlons, corbelled machicolations & periodic bastion
   * watch-turrets running behind the rampart walkway (`z = 38..68`).
   */
  drawRampartParapets3D(ctx, camX, camY, wallKey = 'wall') {
    const lv = this.level;
    // Snap the start column to the world grid (even columns) so merlons never re-seat as the camera scrolls.
    let tx0 = Math.max(0, Math.floor(camX / TILE) - 4);
    tx0 -= tx0 % 2;
    const tx1 = Math.min(lv.cols - 1, Math.ceil((camX + W) / TILE) + 4);
    const capKey = wallKey === 'marble' ? 'marble' : 'stone_trim';
    const roofTex = this.tex(wallKey === 'marble' ? 'marble' : 'slate_roof');
    const fog = this.pal.fog;
    for (let tx = tx0; tx <= tx1; tx += 2) {
      const r = lv.surfaceRow(tx);
      if (r < 0 || !lv.isSolid(tx, r) || !lv.isSolid(tx + 1, r)) continue;
      if (lv.isSpike(tx, r - 1)) continue;
      const wx0 = tx * TILE + 4;
      const wyBot = r * TILE;
      // Periodic 3D projecting bastion watch-turret with faceted spire roof every 12 tiles
      if (mod(tx, 12) === 0 && !this.landmarkXs.some((lx) => Math.abs(lx - (wx0 + 14)) < 140)) {
        const bx = wx0 + 14, bz = 58, bw = 46, bh = 86, bd = 38;
        this.drawBox3D(ctx, camX, camY, bx - bw * 0.5, wyBot - bh, bz, bw, bh + 28, bd, wallKey, { bright: 0.74 });
        this.drawBox3D(ctx, camX, camY, bx - bw * 0.56, wyBot - bh - 6, bz - 4, bw * 1.12, 7, bd + 8, capKey, { bright: 0.80 });
        if (roofTex) {
          const zMid = bz + bd * 0.5;
          const apex = project3D(bx, wyBot - bh - 44, zMid, camX, camY);
          const cFL = project3D(bx - bw * 0.58, wyBot - bh - 6, bz - 5, camX, camY);
          const cFR = project3D(bx + bw * 0.58, wyBot - bh - 6, bz - 5, camX, camY);
          const cBL = project3D(bx - bw * 0.58, wyBot - bh - 6, bz + bd + 5, camX, camY);
          const cBR = project3D(bx + bw * 0.58, wyBot - bh - 6, bz + bd + 5, camX, camY);
          const fogAmt = clamp01((bz - 15) / 360) * 0.52;
          if (cFL.x > cBL.x + 0.3) {
            texTri(ctx, roofTex, cBL, cFL, apex, 0, 38, bd, 38, bd * 0.5, 0, shadeOverlay32([-0.8, -0.55, -0.2], fog, fogAmt, 0.76), 0.45);
          } else if (cBR.x > cFR.x + 0.3) {
            texTri(ctx, roofTex, cFR, cBR, apex, 0, 38, bd, 38, bd * 0.5, 0, shadeOverlay32([0.8, -0.55, -0.2], fog, fogAmt, 0.76), 0.45);
          }
          texTri(ctx, roofTex, cFL, cFR, apex, 0, 38, bw, 38, bw * 0.5, 0, shadeOverlay32([0, -0.55, -0.82], fog, fogAmt, 0.80), 0.45);
        }
      }
      // Corbelled machicolation bracket + crenellated merlon + weathered coping cap
      this.drawBox3D(ctx, camX, camY, wx0 + 6, wyBot, 46, 16, 12, 18, capKey, { bright: 0.68 });
      this.drawBox3D(ctx, camX, camY, wx0, wyBot - 19, 44, 28, 19, 20, wallKey, { topTex: capKey, bright: 0.78 });
      this.drawBox3D(ctx, camX, camY, wx0 - 2, wyBot - 24, 42, 32, 5, 24, capKey, { bright: 0.82 });
    }
  }

  /**
   * Stage 18 (`skykeep`) Multi-Depth 3D Floating Marble Sanctum Islands & Temple Colonnades:
   * suspended terraces (`z = 212` & `z = 116`) with 3D marble decks, stepped tapering
   * corbels underneath, fluted 3D columns, 3D sky-bridge arches, pixel-art garden props,
   * and animated cascading waterfalls pouring into the cloud-sea below.
   */
  drawSkykeepSanctums3D(ctx, camX, camY, time) {
    const A = this.assets;
    const propSheet = A.info('skykeep_props') ? 'skykeep_props' : null;
    const glow = getGlowCanvas('cyan') || getGlowCanvas('emerald');
    const spacing = 420;
    const ranks = [
      { z: 212, dx: 190, dy: -22, w: 196, cols: 4, dark: 0.58, bright: 0.54 },
      { z: 116, dx: 0, dy: 14, w: 168, cols: 3, dark: 0.46, bright: 0.62 },
    ];
    for (let ri = 0; ri < ranks.length; ri++) {
      const rk = ranks[ri];
      const i0 = Math.floor((camX - 360) / spacing);
      const i1 = Math.ceil((camX + W + 360) / spacing);
      for (let i = i0; i <= i1; i++) {
        const cx = i * spacing + rk.dx;
        const bob = Math.sin(time * 0.85 + i * 1.7 + ri * 2.1) * 5;
        const deckY = (this.level.height - 142) + rk.dy + ((Math.abs(i * 5 + ri) % 3) - 1) * 26 + bob;
        const pTest = project3D(cx, deckY, rk.z, camX, camY);
        if (pTest.x < -220 || pTest.x > W + 220) continue;

        const w = rk.w, d = 54;
        // Tapering 3D stepped marble & stone_trim under-corbel
        this.drawBox3D(ctx, camX, camY, cx - w * 0.24, deckY + 34, rk.z + 10, w * 0.48, 26, d - 20, 'stone_trim', { bright: rk.bright * 0.82 });
        this.drawBox3D(ctx, camX, camY, cx - w * 0.38, deckY + 14, rk.z + 4, w * 0.76, 22, d - 8, 'stone_trim', { bright: rk.bright * 0.92 });
        this.drawBox3D(ctx, camX, camY, cx - w * 0.5, deckY, rk.z, w, 16, d, 'marble', { topTex: 'marble', bright: rk.bright });

        // Classical 3D fluted marble temple colonnade & entablature lintel
        const colSpan = w - 36;
        const colH = 88;
        for (let k = 0; k < rk.cols; k++) {
          const px = cx - colSpan * 0.5 + (rk.cols > 1 ? (k / (rk.cols - 1)) * colSpan : 0);
          this.drawPillar3D(ctx, camX, camY, px, deckY - colH, deckY, rk.z + 10, 16, null, rk.bright);
        }
        this.drawBox3D(ctx, camX, camY, cx - w * 0.46, deckY - colH - 12, rk.z + 6, w * 0.92, 12, d - 12, 'marble', { bright: rk.bright });
        this.drawArchSpan3D(ctx, camX, camY, cx - w * 0.36, cx + w * 0.36, deckY - colH + 18, deckY - colH - 4, rk.z + 8, 26, 'stone_trim');

        // Sky-bridge 3D arch linking every second sanctum
        if (ri === 1 && (i & 1) === 0) {
          this.drawArchSpan3D(ctx, camX, camY, cx + w * 0.48, cx + spacing - w * 0.48, deckY + 24, deckY - 6, rk.z + 14, 24, 'marble');
        }

        // Pixel-art skykeep_props (`moon_astrolabe` / `fountain_basin`) standing on the 3D sanctum deck
        if (propSheet) {
          const frameName = (Math.abs(i + ri) & 1) ? 'moon_astrolabe' : 'fountain_basin';
          const pf = A.frame(propSheet, frameName);
          if (pf) {
            const pp = project3D(cx, deckY, rk.z + 18, camX, camY);
            const img = rk.dark > 0 ? A.darkened(propSheet, rk.dark) : A.img(propSheet);
            const dw = pf.w * pp.s, dh = pf.h * pp.s;
            ctx.drawImage(img, pf.x, pf.y, pf.w, pf.h, Math.round(pp.x - pf.ax * pp.s), Math.round(pp.y - dh), Math.round(dw), Math.round(dh));
          }
        }

        // Animated 3D waterfall ribbon pouring off the floating sanctum rim into the cloud-sea
        if (((i + ri) & 1) === 0) {
          const wxFall = cx + ((i & 2) ? -w * 0.28 : w * 0.28);
          const fTop = project3D(wxFall, deckY + 8, rk.z + 2, camX, camY);
          const fBot = project3D(wxFall, deckY + 138, rk.z + 2, camX, camY);
          const fw = Math.max(4, Math.round(13 * fTop.s));
          const fh = Math.max(8, Math.round(fBot.y - fTop.y));
          const fx = getFxLayers();
          if (fx && fx.enabled) {
            fx.waterfall(ctx, { x: Math.round(fTop.x - fw * 0.5), y: Math.round(fTop.y), w: fw, h: fh }, {
              camX, tint: [0.52, 0.88, 1.0], foam: [0.94, 0.99, 1.0], alpha: 0.86, speed: 1.15,
            });
          } else {
            ctx.save();
            const wg = ctx.createLinearGradient(0, fTop.y, 0, fBot.y);
            wg.addColorStop(0, 'rgba(205, 248, 255, 0.72)');
            wg.addColorStop(0.65, 'rgba(110, 214, 255, 0.44)');
            wg.addColorStop(1, 'rgba(140, 226, 255, 0)');
            ctx.fillStyle = wg;
            ctx.fillRect(Math.round(fTop.x - fw * 0.5), Math.round(fTop.y), fw, fh);
            const ripple = Math.round((time * 46) % 14);
            ctx.fillStyle = 'rgba(245, 255, 255, 0.55)';
            for (let sy = Math.round(fTop.y) + ripple; sy < fBot.y - 12; sy += 14) {
              ctx.fillRect(Math.round(fTop.x - fw * 0.25), sy, Math.max(1, Math.round(fw * 0.5)), 5);
            }
            ctx.restore();
          }
          if (glow) {
            const gr = 22 * fTop.s;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.36;
            ctx.drawImage(glow, fTop.x - gr, fTop.y - gr * 0.4, gr * 2, gr * 2);
            ctx.restore();
          }
        }
      }
    }
  }

  /** Receding 3D wrought-iron cemetery fence behind Stage 1's graveyard road. */
  drawCemeteryFence3D(ctx, camX, camY, maxCol) {
    const lv = this.level;
    // Posts live on fixed world columns (multiples of 3); starting from a camera-relative
    // column made the whole fence jump a tile every time the camera crossed a tile edge.
    let tx0 = Math.max(0, Math.floor(camX / TILE) - 3);
    tx0 -= tx0 % 3;
    const tx1 = Math.min(maxCol, Math.ceil((camX + W) / TILE) + 3);
    const z = 54;
    const onSolidStair = (col) => {
      if (!Array.isArray(lv.stairs) || !lv.stairs.length) return false;
      const cx = col * TILE + 16;
      return lv.stairs.some((s) => !s.passThrough && cx >= s.minX - 12 && cx <= s.maxX + 12);
    };
    for (let tx = tx0; tx <= tx1; tx += 3) {
      // Posts stand on flat true ground only (never on staircases, viaduct spans, or ledges over a gap).
      if (onSolidStair(tx)) continue;
      const r = lv.groundRow(tx);
      if (r < 0) continue;
      const wx = tx * TILE + 16, wy = r * TILE;
      this.drawBox3D(ctx, camX, camY, wx - 5, wy - 36, z, 10, 36, 14, 'wall', { bright: 0.78 });
      this.drawBox3D(ctx, camX, camY, wx - 7, wy - 40, z - 2, 14, 4, 18, 'stone_trim', { bright: 0.78 });
      const nr = lv.groundRow(tx + 3);
      if (tx + 3 <= maxCol && nr === r && !onSolidStair(tx + 3)) {
        const p0 = project3D(wx + 5, wy - 28, z + 4, camX, camY);
        const p1 = project3D((tx + 3) * TILE + 11, wy - 28, z + 4, camX, camY);
        const b0 = project3D(wx + 5, wy - 8, z + 4, camX, camY);
        const b1 = project3D((tx + 3) * TILE + 11, wy - 8, z + 4, camX, camY);
        ctx.strokeStyle = '#1c2034';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
        ctx.moveTo(b0.x, b0.y); ctx.lineTo(b1.x, b1.y);
        ctx.stroke();
        for (let k = 1; k <= 4; k++) {
          const t = k / 5;
          const sx = p0.x + (p1.x - p0.x) * t, sy0 = p0.y + (p1.y - p0.y) * t - 5;
          const sy1 = b0.y + (b1.y - b0.y) * t + 6;
          ctx.fillStyle = '#262b44';
          ctx.fillRect(Math.round(sx), Math.round(sy0), 2, Math.round(sy1 - sy0));
        }
      }
    }
  }

  /**
   * Stage 1 Monumental Castle Barbican Gatehouse Keep (just before indoor hall `gateCol`):
   * central sovereign donjon tower, twin towering texture-mapped 3D barbican bastion towers
   * with faceted slate spire roofs, stepped flying buttresses, machicolated parapet gallery,
   * vaulted multi-order portal arch, and west bridgehead abutment piers across the moat.
   */
  drawGatehouseSetPiece3D(ctx, camX, camY, time, gateCol) {
    const gx = gateCol * TILE;
    const db = this.level.drawbridge;
    const westX = db ? db.x0 * TILE : gx - 352;
    if (westX - camX > W + 260 || gx - camX < -280) return;
    const r = db ? db.row : this.level.surfaceRow(gateCol - 3);
    const floorY = (r > 0 ? r : 9) * TILE;
    const moatFloorY = db ? (db.floorRow + 1) * TILE : floorY + 96;
    const roofTex = this.tex('slate_roof');
    const fog = this.pal.fog;

    // 0. West Bridgehead 3D Moat Abutment Bastion & Stepped Turret (`westX`)
    if (db && westX - camX > -220 && westX - camX < W + 220) {
      this.drawBox3D(ctx, camX, camY, westX - 58, floorY - 4, 26, 62, moatFloorY - floorY + 8, 56, 'wall', { bright: 0.74 });
      this.drawBox3D(ctx, camX, camY, westX - 52, floorY - 126, 36, 42, 126, 46, 'wall', { bright: 0.78 });
      this.drawBox3D(ctx, camX, camY, westX - 58, floorY - 138, 34, 54, 14, 50, 'stone_trim', { bright: 0.82 });
      if (roofTex) {
        const wCx = westX - 31, wTop = floorY - 138, wW = 54, wH = 44;
        const apex = project3D(wCx, wTop - wH, 58, camX, camY);
        const fL = project3D(wCx - wW * 0.5, wTop, 34, camX, camY);
        const fR = project3D(wCx + wW * 0.5, wTop, 34, camX, camY);
        const bR = project3D(wCx + wW * 0.5, wTop, 84, camX, camY);
        if (bR.x > fR.x + 0.3) {
          texTri(ctx, roofTex, fR, bR, apex, 0, wH, 50, wH, 25, 0, shadeOverlay32([0.8, -0.55, -0.2], fog, 0.14, 0.76), 0.45);
        }
        texTri(ctx, roofTex, fL, fR, apex, 0, wH, wW, wH, wW * 0.5, 0, shadeOverlay32([0, -0.55, -0.82], fog, 0.12, 0.80), 0.45);
      }
    }

    // 1. Central Towering Sovereign Donjon Keep rising behind the gatehouse (`z = 64..120`)
    this.drawBox3D(ctx, camX, camY, gx - 168, floorY - 318, 64, 146, 128, 56, 'wall_b', { bright: 0.72 });
    this.drawBox3D(ctx, camX, camY, gx - 174, floorY - 332, 60, 158, 16, 62, 'stone_trim', { bright: 0.78 });

    // 2. Deep Moat Curtain Foundation & Recessed Multi-Order Vaulted Portal Arch (`z = 46..92`)
    this.drawBox3D(ctx, camX, camY, gx - 196, floorY - 4, 28, 224, moatFloorY - floorY + 8, 64, 'wall', { bright: 0.72 });
    this.drawBox3D(ctx, camX, camY, gx - 144, floorY - 248, 48, 86, 96, 44, 'wall_b', { bright: 0.76 });
    this.drawArchSpan3D(ctx, camX, camY, gx - 144, gx - 58, floorY - 124, floorY - 172, 48, 44, 'stone_trim');
    this.drawArchSpan3D(ctx, camX, camY, gx - 136, gx - 66, floorY - 130, floorY - 164, 56, 36, 'wall');

    // 3. Monumental Twin Flanking Barbican Bastion Towers + Stepped Buttresses (`z = 36..94`)
    this.drawBox3D(ctx, camX, camY, gx - 198, floorY - 258, 38, 56, 258, 58, 'wall', { bright: 0.78 });
    this.drawBox3D(ctx, camX, camY, gx - 210, floorY - 156, 34, 14, 156, 26, 'stone_trim', { bright: 0.75 });
    this.drawBox3D(ctx, camX, camY, gx - 58, floorY - 274, 38, 60, 274, 58, 'wall', { bright: 0.80 });
    this.drawBox3D(ctx, camX, camY, gx - 4, floorY - 168, 34, 14, 168, 26, 'stone_trim', { bright: 0.75 });

    // 4. Steep 3D Pyramidal Slate Spires Crowning Both Barbican Towers & Central Keep
    if (roofTex) {
      for (const tw of [
        { cx: gx - 95, topY: floorY - 332, w: 92, h: 64, zF: 58, zB: 122 },
        { cx: gx - 170, topY: floorY - 282, w: 66, h: 66, zF: 34, zB: 98 },
        { cx: gx - 28, topY: floorY - 294, w: 70, h: 74, zF: 34, zB: 98 },
      ]) {
        const apex = project3D(tw.cx, tw.topY - tw.h, (tw.zF + tw.zB) * 0.5, camX, camY);
        const fL = project3D(tw.cx - tw.w * 0.5, tw.topY, tw.zF, camX, camY);
        const fR = project3D(tw.cx + tw.w * 0.5, tw.topY, tw.zF, camX, camY);
        const bL = project3D(tw.cx - tw.w * 0.5, tw.topY, tw.zB, camX, camY);
        const bR = project3D(tw.cx + tw.w * 0.5, tw.topY, tw.zB, camX, camY);
        if (fL.x > bL.x + 0.3) {
          texTri(ctx, roofTex, bL, fL, apex, 0, tw.h, 60, tw.h, 30, 0, shadeOverlay32([-0.8, -0.55, -0.2], fog, 0.14, 0.78), 0.45);
        } else if (bR.x > fR.x + 0.3) {
          texTri(ctx, roofTex, fR, bR, apex, 0, tw.h, 60, tw.h, 30, 0, shadeOverlay32([0.8, -0.55, -0.2], fog, 0.14, 0.78), 0.45);
        }
        texTri(ctx, roofTex, fL, fR, apex, 0, tw.h, tw.w, tw.h, tw.w * 0.5, 0, shadeOverlay32([0, -0.55, -0.82], fog, 0.12, 0.82), 0.45);
      }
    }

    // 5. Corbeled Machicolation Gallery & Crenellated Stone Merlons
    for (let i = 0; i < 6; i++) {
      this.drawBox3D(ctx, camX, camY, gx - 196 + i * 38, floorY - 266, 37, 16, 12, 28, 'stone_trim', { bright: 0.72 });
      this.drawBox3D(ctx, camX, camY, gx - 200 + i * 38, floorY - 284, 36, 24, 18, 32, 'stone_trim', { bright: 0.82 });
    }
  }

  /**
   * Stage 4 (`yule`) 3D Snowbound Nordic Village Chapels, Half-Timbered Gables & Ice Spires:
   * multi-polygon pitched roofs, stone chimneys, belfry turrets, and warm amber frost windows.
   */
  drawYuleVillage3D(ctx, camX, camY, time) {
    const lv = this.level;
    const roofTex = this.tex('slate_roof');
    const stoneTex = this.tex('keep_stone');
    const woodTex = this.tex('wood_carved');
    if (!roofTex || !stoneTex) return;
    const spacing = 22, phase = 8;
    const txLo = Math.max(phase, Math.floor((camX - 280) / TILE));
    const txHi = Math.min(lv.cols - 12, Math.ceil((camX + W + 280) / TILE));
    const eyeWorldX = camX + EYE_X;
    const abandoned = this.stageTheme !== 'yule';
    const fog = abandoned ? [12, 13, 24] : this.pal.fog;
    const glow = getGlowCanvas('amber');
    for (let tx = Math.ceil((txLo - phase) / spacing) * spacing + phase; tx <= txHi; tx += spacing) {
      const r = lv.nearestGroundRow(tx, 14, this.startRow());
      if (r < 0) continue;
      const wx = tx * TILE + 16, wy = r * TILE + 4;
      if (this.landmarkXs.some((lx) => Math.abs(lx - wx) < 165)) continue;
      const variant = Math.abs(tx * 5) % 3;
      const z = 114 + variant * 18;
      const w = variant === 0 ? 74 : 62;
      const h = variant === 0 ? 64 : 52;
      const d = 52;
      const ridgeY = wy - h - (variant === 0 ? 40 : 32);
      const fogAmt = clamp01((z - 15) / 360) * (abandoned ? 0.60 : 0.54);
      const bScale = abandoned ? 0.80 : 1.0;

      // Stone foundation plinth + half-timbered upper cottage/chapel body + stone chimney
      this.drawBox3D(ctx, camX, camY, wx - w * 0.5 - 3, wy - 16, z - 2, w + 6, 16, d + 4, 'keep_stone', { bright: 0.72 * bScale });
      this.drawBox3D(ctx, camX, camY, wx - w * 0.5, wy - h, z, w, h - 16, d, (abandoned ? variant !== 0 : variant === 1) ? 'wood_carved' : 'keep_stone', { bright: 0.76 * bScale });
      this.drawBox3D(ctx, camX, camY, wx + w * 0.28, ridgeY - 14, z + 10, 12, (wy - h) - (ridgeY - 14) + 8, 14, 'keep_stone', { bright: 0.74 * bScale });
      if (variant === 0) {
        // Tall belfry turret rising beside the chapel gable
        this.drawBox3D(ctx, camX, camY, wx - w * 0.5 - 18, wy - h - 38, z + 6, 24, h + 38, 26, 'keep_stone', { bright: 0.76 * bScale });
        const bApex = project3D(wx - w * 0.5 - 6, wy - h - 72, z + 19, camX, camY);
        const bFL = project3D(wx - w * 0.5 - 20, wy - h - 38, z + 4, camX, camY);
        const bFR = project3D(wx - w * 0.5 + 8, wy - h - 38, z + 4, camX, camY);
        texTri(ctx, roofTex, bFL, bFR, bApex, 0, 34, 28, 34, 14, 0, shadeOverlay32([0, -0.6, -0.8], fog, fogAmt, 0.84 * bScale), 0.45);
      }

      // Steep pitched roof slopes (far slope first)
      const slope = (dir) => {
        const ex = wx + dir * (w * 0.5 + 6);
        const a = project3D(ex, wy - h + 3, z - 4, camX, camY);
        const b = project3D(wx, ridgeY, z - 4, camX, camY);
        const c = project3D(wx, ridgeY, z + d + 4, camX, camY);
        const e = project3D(ex, wy - h + 3, z + d + 4, camX, camY);
        const sh = shadeOverlay32([dir * 0.68, -0.74, -0.1], fog, fogAmt, 0.84 * bScale);
        texQuad(ctx, roofTex, a, b, c, e, 0, 0, 36, 0, 36, d + 8, 0, d + 8, sh);
      };
      const nearSide = wx < eyeWorldX ? 1 : -1;
      slope(-nearSide);
      slope(nearSide);

      // Carved timber/stone front gable triangle + bargeboards
      const g0 = project3D(wx - w * 0.5, wy - h, z - 0.5, camX, camY);
      const g1 = project3D(wx, ridgeY + 2, z - 0.5, camX, camY);
      const g2 = project3D(wx + w * 0.5, wy - h, z - 0.5, camX, camY);
      texTri(ctx, woodTex || stoneTex, g0, g1, g2, 0, 36, w * 0.5, 0, w, 36, shadeOverlay32([0, -0.15, -1], fog, fogAmt, 0.78 * bScale), 0.45);
      ctx.strokeStyle = abandoned ? 'rgba(104, 114, 142, 0.48)' : 'rgba(205, 226, 250, 0.55)';
      ctx.lineWidth = Math.max(1.5, 2.6 * g1.s);
      ctx.beginPath();
      ctx.moveTo(g0.x - 2, g0.y + 1); ctx.lineTo(g1.x, g1.y - 1); ctx.lineTo(g2.x + 2, g2.y + 1);
      ctx.stroke();

      // Windows: shuttered & boarded-up in Abandoned Village, warm hearth-lit in Yule
      const pulse = 0.62 + 0.24 * Math.sin(time * 2.5 + tx);
      for (let wi = 0; wi < 2; wi++) {
        const ox = wi === 0 ? -w * 0.22 : w * 0.20;
        const wp = project3D(wx + ox, wy - h * 0.58, z - 1, camX, camY);
        const ww = Math.max(3, Math.round(7 * wp.s)), wh = Math.max(4, Math.round(11 * wp.s));
        const wx0 = Math.round(wp.x - ww * 0.5), wy0 = Math.round(wp.y);
        if (abandoned) {
          const hauntedLit = (variant === 0 && wi === 1);
          ctx.fillStyle = hauntedLit ? `rgba(214, 166, 92, ${(0.34 * pulse).toFixed(2)})` : '#0d0b14';
          ctx.fillRect(wx0, wy0, ww, wh);
          // Crossed weathered timber planks nailed across shuttered panes
          ctx.strokeStyle = '#3f2e22';
          ctx.lineWidth = Math.max(1, 1.4 * wp.s);
          ctx.beginPath();
          ctx.moveTo(wx0 - 1, wy0 + 2); ctx.lineTo(wx0 + ww + 1, wy0 + Math.round(wh * 0.45));
          ctx.moveTo(wx0 - 1, wy0 + wh - 2); ctx.lineTo(wx0 + ww + 1, wy0 + Math.round(wh * 0.55));
          ctx.stroke();
          if (hauntedLit && glow) {
            const gr = 12 * wp.s;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.11 * pulse;
            ctx.drawImage(glow, wp.x - gr, wp.y - gr * 0.6, gr * 2, gr * 2);
            ctx.restore();
          }
        } else {
          ctx.fillStyle = `rgba(255, 196, 108, ${pulse.toFixed(2)})`;
          ctx.fillRect(wx0, wy0, ww, wh);
          if (glow) {
            const gr = 18 * wp.s;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.24 * pulse;
            ctx.drawImage(glow, wp.x - gr, wp.y - gr * 0.6, gr * 2, gr * 2);
            ctx.restore();
          }
        }
      }
    }
  }

  /** Texture-mapped 3D gnarled tree colonnade, overarching tapered bough vaults & swaying iron lantern cages in Pumpkin Woods. */
  drawForestColonnade3D(ctx, camX, camY, time) {
    const spacing = 240;
    const i0 = Math.floor((camX - 240) / spacing);
    const i1 = Math.ceil((camX + W + 240) / spacing);
    const glowImg = getGlowCanvas('amber');
    const barkTex = this.tex('bark');
    const fog = this.pal.fog;
    for (let pass = 0; pass < 2; pass++) {
      const z = pass === 0 ? 155 : 78;
      const bright = pass === 0 ? 0.52 : 0.74;
      const fogAmt = clamp01((z - 15) / 360) * 0.52;
      for (let i = i0; i <= i1; i++) {
        const wx = i * spacing + (pass ? 108 : 0);
        const col = Math.max(0, Math.min(this.level.cols - 1, Math.floor(wx / TILE)));
        // Plant trunks on the true ground (never on an upper gallery ledge, viaduct span or ferry gap).
        const r = this.level.nearestGroundRow(col, 14, this.startRow());
        const wy = r * TILE + 8;
        const w = pass === 0 ? 24 : 32;
        // Flared 3D buttress root spurs + main gnarled trunk
        this.drawBox3D(ctx, camX, camY, wx - w * 1.15, wy - 18, z - 2, w * 2.3, 18, 30, 'bark_h', { bright: bright * 0.92, topTex: 'bark_h' });
        this.drawBox3D(ctx, camX, camY, wx - w * 0.80, wy - 38, z - 1, w * 1.6, 22, 28, 'bark', { bright: bright * 0.96 });
        this.drawBox3D(ctx, camX, camY, wx - w / 2, wy - 380, z, w, 380, 26, 'bark', { bright });
        // Multi-segment tapered 3D gnarled canopy boughs arching left & right
        if (barkTex) {
          const bShade = shadeOverlay32([0, -0.45, -0.88], fog, fogAmt, bright);
          for (const dir of [-1, 1]) {
            const pts = [
              { x: wx + dir * (w * 0.35), y: wy - 252, r: 9 },
              { x: wx + dir * 48, y: wy - 286, r: 6.5 },
              { x: wx + dir * 96, y: wy - 304, r: 4.5 },
              { x: wx + dir * 134, y: wy - 294, r: 2.8 },
            ];
            for (let s = 0; s < pts.length - 1; s++) {
              const a = pts[s], b = pts[s + 1];
              const q0 = project3D(a.x, a.y - a.r, z + 2, camX, camY);
              const q1 = project3D(b.x, b.y - b.r, z + 4, camX, camY);
              const q2 = project3D(b.x, b.y + b.r, z + 4, camX, camY);
              const q3 = project3D(a.x, a.y + a.r, z + 2, camX, camY);
              texQuad(ctx, barkTex, q0, q1, q2, q3, s * 32, 0, (s + 1) * 32, 0, (s + 1) * 32, 16, s * 32, 16, bShade);
            }
          }
        }
        if (pass === 1 && (i & 1) === 0) {
          const bx = wx + 46, by = wy - 172;
          this.drawBox3D(ctx, camX, camY, wx, by - 8, z, 54, 10, 14, 'bark_h', { bright, topTex: 'bark_h' });
          const sway = Math.sin(time * 1.5 + i * 1.7) * 8;
          const top = project3D(bx, by + 2, z, camX, camY);
          const bot = project3D(bx + sway, by + 38, z, camX, camY);
          ctx.strokeStyle = '#2a201c'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(bot.x, bot.y); ctx.stroke();
          this.drawBox3D(ctx, camX, camY, bx + sway - 7, by + 38, z - 6, 14, 18, 14, 'iron_rivet', { bright: 0.76 });
          const glow = project3D(bx + sway, by + 47, z - 7, camX, camY);
          ctx.fillStyle = '#e6b862';
          ctx.fillRect(Math.round(glow.x - 3), Math.round(glow.y - 4), 6, 8);
          if (glowImg) {
            const gr = 28 * glow.s;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.48;
            ctx.drawImage(glowImg, glow.x - gr, glow.y - gr, gr * 2, gr * 2);
            ctx.restore();
          }
        }
      }
    }
  }

  /**
   * Darkwood 3D Cathedral of Ancient Elder Trees:
   * mossy buttress trunks at two depths (`z = 162` & `z = 74`), overhead root
   * arches, shelf mushrooms & swaying bioluminescent emerald moss-lanterns.
   */
  drawDarkwoodColonnade3D(ctx, camX, camY, time) {
    const A = this.assets;
    const sheet = A.info('darkwood_trees') ? 'darkwood_trees' : null;
    const glowImg = getGlowCanvas('emerald');
    const spacing = 256;
    const i0 = Math.floor((camX - 320) / spacing);
    const i1 = Math.ceil((camX + W + 320) / spacing);
    const trunks = ['trunk_a', 'trunk_b', 'trunk_c'];
    const horizonY = Math.round(242 + parallaxElevY(camY, this.level.height) * 0.22);
    // Organic elder trunks at three depths (far -> near), rooted firmly into the
    // lowest local forest floor so foreground mounds or perspective eye-lift never
    // leave background tree roots floating in mid-air.
    const passes = [
      { z: 240, dark: 0.62, dx: 64, scale: 1.38, sink: 4 },
      { z: 162, dark: 0.46, dx: 0, scale: 1.20, sink: 8 },
      { z: 74, dark: 0.28, dx: 118, scale: 1.08, sink: 13 },
    ];
    const lowestLocalGroundRow = (col) => {
      let best = -1;
      const c0 = Math.max(0, col - 10);
      const c1 = Math.min(this.level.cols - 1, col + 10);
      for (let c = c0; c <= c1; c++) {
        const gr = this.level.groundRow(c);
        if (gr > best) best = gr;
      }
      return best >= 0 ? best : this.level.nearestGroundRow(col, 18, this.startRow());
    };
    for (let pi = 0; pi < passes.length; pi++) {
      const P = passes[pi];
      for (let i = i0; i <= i1; i++) {
        const wx = i * spacing + P.dx;
        const col = Math.max(0, Math.min(this.level.cols - 1, Math.floor(wx / TILE)));
        const r = lowestLocalGroundRow(col);
        const wy = r * TILE + 10;
        const pr = project3D(wx, wy, P.z, camX, camY);
        if (pr.x < -260 || pr.x > W + 260) continue;
        const groundScreenY = r * TILE - camY;
        const footY = Math.max(horizonY + 14 + pi * 6, Math.round(groundScreenY + P.sink));
        if (sheet) {
          const name = trunks[Math.abs(i * 7 + pi * 3) % trunks.length];
          const f = A.frame(sheet, name);
          const img = P.dark > 0 ? A.darkened(sheet, P.dark) : A.img(sheet);
          const sc = pr.s * P.scale;
          const dw = f.w * sc;
          let dh = f.h * sc;
          // Keep full-canopy trunk_a extending cleanly past the top of the viewport.
          if (name === 'trunk_a' && footY - dh > -2) dh = footY + 6;
          const flip = ((i + pi) & 1) === 1;
          // Grounding root-turf shadow beneath flared buttress roots
          ctx.save();
          ctx.fillStyle = `rgba(4, 10, 12, ${(0.42 - (2 - pi) * 0.08).toFixed(2)})`;
          ctx.beginPath();
          ctx.ellipse(Math.round(pr.x), footY - 2, Math.max(18, Math.round(dw * 0.42)), 6 + pi, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.translate(Math.round(pr.x), footY);
          if (flip) ctx.scale(-1, 1);
          ctx.drawImage(img, f.x, f.y, f.w, f.h, Math.round(-f.ax * sc), Math.round(-dh), Math.round(dw), Math.round(dh));
          ctx.restore();
        } else {
          const wyFoot = camY + EYE_Y + (footY - EYE_Y) / pr.s;
          this.drawBox3D(ctx, camX, camY, wx - 16, wyFoot - 420, P.z, 32, 420, 30, 'elder_bark');
        }
        if (pi === 2) {
          const wyFoot = camY + EYE_Y + (footY - EYE_Y) / pr.s;
          // Curved root arch between near trunks + a swaying hanging lantern
          if ((i & 1) === 0) {
            this.drawArchSpan3D(ctx, camX, camY, wx + 24, wx + spacing - 24, wyFoot - 228, wyFoot - 274, P.z + 6, 22, 'elder_bark_h');
          }
          if (mod(i, 2) === 1 && sheet) {
            const lf = A.frame(sheet, 'lantern');
            const bx = wx - 52, by = wyFoot - 208;
            const sway = Math.sin(time * 1.35 + i * 1.9) * 0.09;
            const lp = project3D(bx, by, P.z - 4, camX, camY);
            const ls = lp.s;
            ctx.save();
            ctx.translate(Math.round(lp.x), Math.round(lp.y));
            ctx.rotate(sway);
            ctx.drawImage(A.darkened(sheet, 0.24), lf.x, lf.y, lf.w, lf.h, Math.round(-lf.ax * ls), 0, Math.round(lf.w * ls), Math.round(lf.h * ls));
            ctx.restore();
            if (glowImg) {
              const pulse = 0.7 + 0.3 * Math.sin(time * 2.6 + i);
              const gr = 30 * ls;
              const gx = lp.x + Math.sin(sway) * lf.h * ls * 0.75, gy = lp.y + lf.h * ls * 0.72;
              ctx.save();
              ctx.globalCompositeOperation = 'lighter';
              ctx.globalAlpha = 0.44 * pulse;
              ctx.drawImage(glowImg, gx - gr, gy - gr, gr * 2, gr * 2);
              ctx.restore();
            }
          }
        }
      }
    }
    // Drifting spore motes between the ranks
    for (let i = i0 * 3; i <= i1 * 3; i++) {
      const wx = i * (spacing / 3) + 40 + Math.sin(time * 0.5 + i) * 18;
      const col = Math.max(0, Math.min(this.level.cols - 1, Math.floor(wx / TILE)));
      const r = this.level.nearestGroundRow(col, 14, this.startRow());
      const wy = r * TILE - 60 - (Math.abs(i * 53) % 150) + Math.sin(time * 0.9 + i * 1.3) * 10;
      const pm = project3D(wx, wy, 120, camX, camY);
      if (pm.x < -10 || pm.x > W + 10) continue;
      const a = 0.35 + 0.35 * Math.sin(time * 3 + i * 0.7);
      ctx.fillStyle = `rgba(120, 255, 210, ${a.toFixed(2)})`;
      ctx.fillRect(Math.round(pm.x), Math.round(pm.y), 2, 2);
    }
  }

  drawAbyss3D(ctx, cam, time) {
    // Only `ossuary` and `darkcave` have an open chasm beneath the hall brink; `catacombs` has an opaque 3D floor.
    if (this.themeKey === 'darkcave') {
      this.drawScanlinePlane(ctx, cam, time, {
        kind: 'magma',
        water: { tint: [0.85, 0.22, 0.04], spec: [1.0, 0.82, 0.28], frozen: 0, alpha: 0.85 },
        horizon: 214, fx: 0.36, focal: 92, flow: 22,
        shimmer: true, shimmerRgb: [255, 120, 40],
        fog: [24, 7, 6],
      });
      return;
    }
    if (this.themeKey !== 'ossuary') return;
    const isAqueduct = this.stageTheme === 'aqueduct';
    // Distant upper subterranean arcades & lanterns drawn BEFORE the water plane so `fx.water` reflects them!
    this.drawAbyssUpperArcades3D(ctx, cam, time, isAqueduct);
    this.drawScanlinePlane(ctx, cam, time, {
      kind: 'abyss',
      water: isAqueduct
        ? { tint: [0.08, 0.48, 0.68], spec: [0.72, 0.98, 1.0], frozen: 0, alpha: 0.88 }
        : { tint: [0.10, 0.38, 0.46], spec: [0.55, 0.96, 0.92], frozen: 0, alpha: 0.78 },
      horizon: 212, fx: 0.38, focal: 92, flow: 44,
      shimmer: true, shimmerRgb: isAqueduct ? [90, 224, 255] : [80, 214, 196],
      fog: isAqueduct ? [7, 18, 30] : [10, 18, 28],
    });
    if (isAqueduct) this.drawAqueductViaducts3D(ctx, cam, time);
  }

  /** Distant subterranean cistern arcades & glowing lanterns above the water horizon for real-time planar reflection. */
  drawAbyssUpperArcades3D(ctx, cam, time, isAqueduct) {
    const camX = cam.rx, camY = cam.ry;
    const z = 310;
    const span = 216;
    const stoneKey = isAqueduct ? 'aqueduct_stone' : 'crypt_stone';
    const trimKey = isAqueduct ? 'stone_trim' : 'crypt_stone';
    const glow = getGlowCanvas(isAqueduct ? 'cyan' : 'emerald');
    const deckY = this.level.height - 96;
    const i0 = Math.floor((camX - 380) / span);
    const i1 = Math.ceil((camX + W + 380) / span);
    for (let i = i0; i <= i1; i++) {
      const x0 = i * span;
      const x1 = x0 + span;
      const pMid = project3D(x0 + span * 0.5, deckY, z, camX, camY);
      if (pMid.x < -180 || pMid.x > W + 180) continue;
      this.drawBox3D(ctx, camX, camY, x0 - 14, deckY - 92, z, 28, 130, 26, stoneKey, { bright: 0.76 });
      this.drawArchSpan3D(ctx, camX, camY, x0 + 14, x1 - 14, deckY - 46, deckY - 92, z + 2, 24, trimKey);
      if (glow) {
        const lp = project3D(x0 + span * 0.5, deckY - 62, z - 4, camX, camY);
        const pulse = 0.72 + 0.28 * Math.sin(time * 2.4 + i * 1.3);
        const rad = 28 * lp.s;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.52 * pulse;
        ctx.drawImage(glow, lp.x - rad, lp.y - rad, rad * 2, rad * 2);
        ctx.restore();
        ctx.fillStyle = isAqueduct ? '#a4f4ff' : '#8ef7d8';
        ctx.fillRect(Math.round(lp.x - 2), Math.round(lp.y - 3), 4, 5);
      }
    }
  }

  /**
   * Stage 17 (`aqueduct`) Multi-Tier 3D Submerged Roman Viaducts & Sluice Waterfalls:
   * stone arch colonnades rising directly out of the 3D cistern sea below the vaulted hall.
   */
  drawAqueductViaducts3D(ctx, cam, time) {
    const camX = cam.rx, camY = cam.ry;
    const waterY = this.level.height + 28;
    const span = 224;
    const fxLayers = getFxLayers();
    const glow = getGlowCanvas('cyan');
    for (const rank of [{ z: 236, dx: 96, bright: 0.68 }, { z: 132, dx: 0, bright: 0.80 }]) {
      const i0 = Math.floor((camX - 300) / span);
      const i1 = Math.ceil((camX + W + 300) / span);
      for (let i = i0; i <= i1; i++) {
        const x0 = i * span + rank.dx;
        const x1 = x0 + span;
        const pCheck = project3D(x0 + span * 0.5, waterY - 80, rank.z, camX, camY);
        if (pCheck.x < -180 || pCheck.x > W + 180) continue;
        this.drawBox3D(ctx, camX, camY, x0 - 16, waterY - 118, rank.z, 32, 118, 30, 'aqueduct_stone', { bright: rank.bright });
        this.drawArchSpan3D(ctx, camX, camY, x0 + 16, x1 - 16, waterY - 68, waterY - 118, rank.z + 2, 26, 'stone_trim');
        if (rank.z === 132 && (i & 1) === 0) {
          const wxFall = x0 + span * 0.5;
          const ft = project3D(wxFall, waterY - 88, rank.z - 2, camX, camY);
          const fb = project3D(wxFall, waterY + 6, rank.z - 2, camX, camY);
          const fw = Math.max(4, Math.round(18 * ft.s));
          const fh = Math.max(6, Math.round(fb.y - ft.y));
          if (fxLayers && fxLayers.enabled) {
            fxLayers.waterfall(ctx, { x: Math.round(ft.x - fw * 0.5), y: Math.round(ft.y), w: fw, h: fh }, {
              camX, tint: [0.22, 0.76, 0.96], foam: [0.88, 0.98, 1.0], alpha: 0.88, speed: 1.25,
            });
          } else {
            ctx.save();
            const wg = ctx.createLinearGradient(0, ft.y, 0, fb.y);
            wg.addColorStop(0, 'rgba(130, 232, 255, 0.65)');
            wg.addColorStop(0.8, 'rgba(64, 184, 236, 0.45)');
            wg.addColorStop(1, 'rgba(190, 248, 255, 0.75)');
            ctx.fillStyle = wg;
            ctx.fillRect(Math.round(ft.x - fw * 0.5), Math.round(ft.y), fw, fh);
            ctx.restore();
          }
          if (glow) {
            const gr = 18 * fb.s;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.34;
            ctx.drawImage(glow, fb.x - gr * 1.4, fb.y - gr * 0.6, gr * 2.8, gr * 1.4);
            ctx.restore();
          }
        }
      }
    }
  }

  // ======================================================== INTERIOR 3D
  drawInterior3D(ctx, cam, time) {
    const camX = cam.rx, camY = cam.ry;
    for (let ri = 0; ri < this.level.rooms.length; ri++) {
      const r = this.level.rooms[ri];
      const rx = r.x0 * TILE - camX, ry = r.y0 * TILE - camY;
      const rw = (r.x1 - r.x0 + 1) * TILE, rh = (r.y1 - r.y0 + 1) * TILE;
      if (rx > W || rx + rw < 0 || ry > H || ry + rh < 0) continue;
      if (r.cylinder) {
        this.drawClockShaft3D(ctx, r, camX, camY, rx, ry, rw, rh, time);
      } else {
        this.drawVaultedHall3D(ctx, r, camX, camY, rx, ry, rw, rh, time, ri);
      }
    }
  }

  /**
   * Texture-Mapped 3D Gothic Vaulted Hall:
   * - Perspective-scaled far masonry wall at z = 200 (100% locked to world UVs)
   * - Recessed 3D arched stained-glass / crypt bays (z = 200..248)
   * - Non-swimming z-strip flagstone hall floor from z = 38 to z = 200 with carpet
   * - Fluted 3D stone colonnade & ashlar-textured pointed rib-vault ceiling overhead
   */
  _roomBounds(r, abyssHall) {
    if (r._hallBounds) return r._hallBounds;
    const lv = this.level;
    const rows = [];
    const c0 = Math.max(2, r.x0 + 1);
    const c1 = Math.min(lv.cols - 3, r.x1 - 1);
    for (let c = c0; c <= c1; c++) {
      const sr = lv.surfaceRow(c);
      if (sr > 0 && sr < lv.rows - 1) rows.push(sr);
    }
    rows.sort((a, b) => a - b);
    const minSurf = rows.length ? rows[0] : (r.floorRow || 11);
    const lowSurf = rows.length ? rows[Math.min(rows.length - 1, Math.floor(rows.length * 0.92))] : (r.floorRow || 11);
    const floorRow = abyssHall ? (r.floorRow || 11) : Math.max(r.floorRow || 11, lowSurf);
    const floorY = floorRow * TILE;
    const ceilY = Math.min(Math.max(r.y0 * TILE - 96, (minSurf - 11) * TILE), floorY - 360);
    r._hallBounds = { floorRow, floorY, ceilY };
    return r._hallBounds;
  }

  drawVaultedHall3D(ctx, r, camX, camY, rx, ry, rw, rh, time, roomIndex = 0) {
    const key = r.wall || 'wall';
    const wallTex = this.tex(key);
    if (!wallTex) return;
    const Z_NEAR = 38, Z_WALL = 200, Z_NICHE = 248;
    const pal = this.pal;
    const abyssHall = this.themeKey === 'ossuary' || this.themeKey === 'darkcave';
    const { floorRow, floorY, ceilY } = this._roomBounds(r, abyssHall);
    const farFloor = project3D(0, floorY, Z_WALL, camX, camY);

    // When entering Stage 1's indoor castle behind the 3D gatehouse (r.x0 > 0 && r.edge !== false),
    // anchor the hall portal clip at the gatehouse tower's z = 40 pier so there is
    // zero parallax slip between the outdoor barbican tower and the indoor hall.
    const isPortal = r.x0 > 0 && r.edge !== false;
    const portalLeft = isPortal
      ? Math.round(project3D(r.x0 * TILE - 18, EYE_Y, 40, camX, camY).x)
      : Math.round(rx);
    const fullVert = r.y0 <= 0 && r.y1 >= this.level.rows - 1;
    const clipLeft = Math.max(0, portalLeft);
    const clipRight = r.x1 >= this.level.cols - 1 ? W : Math.min(W, Math.round(rx + rw));
    const clipTop = fullVert ? 0 : Math.max(0, Math.round(ry));
    const clipBot = fullVert ? H : Math.min(H, Math.round(ry + rh));
    if (clipRight <= clipLeft || clipBot <= clipTop) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(clipLeft, clipTop, clipRight - clipLeft, clipBot - clipTop);
    ctx.clip();

    if (!abyssHall) {
      ctx.fillStyle = rgbA(pal.fog, 1);
      ctx.fillRect(clipLeft, clipTop, clipRight - clipLeft, clipBot - clipTop);
    }

    const bayW = 8 * TILE;
    const minWorldX = r.x0 > 0 ? r.x0 * TILE - bayW : r.x0 * TILE;
    const bStart = Math.max(Math.floor(minWorldX / bayW), Math.floor((camX - 210) / bayW));
    const bEnd = Math.min(Math.floor(r.x1 * TILE / bayW), Math.ceil((camX + W + 210) / bayW));

    // True 3D projected masonry wall at Z_WALL = 200 (s = 0.6552): hits fast 1-draw
    // parallelogram path and locks every brick course to world (wx, wy, Z_WALL)!
    // Shift V origin up by 44px above floorY so scenic wing walls sit clearly above foreground tiles.
    const wxWall0 = bStart * bayW;
    const wxWall1 = (bEnd + 1) * bayW;
    const yWallTop = Math.min(r.y0 * TILE - 160, ceilY - 48);
    const yWallBot = abyssHall ? floorY : (r.y1 + 1) * TILE + 128;
    const wallVOff = floorY - 44 - wallTex.h;
    const dark = Math.max(0.40, Math.min(0.52, (r.dark == null ? 0.28 : r.dark) + 0.14));
    const wallShade = shadeOverlay32([0, 0, -1], pal.fog, dark, 0.76);
    if (wxWall1 > wxWall0 && yWallBot > yWallTop) {
      const w0 = project3D(wxWall0, yWallTop, Z_WALL, camX, camY);
      const w1 = project3D(wxWall1, yWallTop, Z_WALL, camX, camY);
      const w2 = project3D(wxWall1, yWallBot, Z_WALL, camX, camY);
      const w3 = project3D(wxWall0, yWallBot, Z_WALL, camX, camY);
      texQuad(
        ctx, wallTex, w0, w1, w2, w3,
        wxWall0, yWallTop - wallVOff, wxWall1, yWallTop - wallVOff,
        wxWall1, yWallBot - wallVOff, wxWall0, yWallBot - wallVOff,
        wallShade,
      );
    }

    if (abyssHall && wxWall1 > wxWall0) {
      const brinkTex = this.tex(this.primaryStoneKey());
      const k0 = project3D(wxWall0, floorY - 5, Z_WALL, camX, camY);
      const k1 = project3D(wxWall1, floorY - 5, Z_WALL, camX, camY);
      const k2 = project3D(wxWall1, floorY + 5, Z_WALL, camX, camY);
      const k3 = project3D(wxWall0, floorY + 5, Z_WALL, camX, camY);
      texQuad(
        ctx, brinkTex, k0, k1, k2, k3,
        wxWall0, 0, wxWall1, 0, wxWall1, 10, wxWall0, 10,
        shadeOverlay32([0, -0.8, -0.5], pal.fog, 0.38, 0.80),
      );
      ctx.fillStyle = 'rgba(4, 6, 12, 0.78)';
      ctx.fillRect(clipLeft, Math.round(farFloor.y) + 2, clipRight - clipLeft, 4);
    }

    const wallTexB = this.assets.img(key + '_b') ? this.tex(key + '_b') : null;
    const wallVOffB = wallTexB ? (floorY - 44 - wallTexB.h) : 0;
    const windowSpots = [];
    const hallH = floorY - ceilY;
    const tierStep = 224;
    const tierCount = Math.min(3, Math.max(1, Math.floor((hallH - 36) / tierStep)));
    const special = this.specialBays(r, roomIndex, floorRow, abyssHall);
    if (wallTexB && yWallBot > ceilY) {
      for (let bi = bStart; bi <= bEnd; bi++) {
        if ((bi & 1) !== 1) continue;
        const bx0 = bi * bayW, bx1 = bx0 + bayW;
        const p0 = project3D(bx0 + 18, ceilY, Z_WALL, camX, camY);
        const p1 = project3D(bx1 - 18, ceilY, Z_WALL, camX, camY);
        const p2 = project3D(bx1 - 18, yWallBot, Z_WALL, camX, camY);
        const p3 = project3D(bx0 + 18, yWallBot, Z_WALL, camX, camY);
        texQuad(
          ctx, wallTexB, p0, p1, p2, p3,
          bx0 + 18, ceilY - wallVOffB, bx1 - 18, ceilY - wallVOffB,
          bx1 - 18, yWallBot - wallVOffB, bx0 + 18, yWallBot - wallVOffB,
          wallShade,
        );
      }
    }
    for (let bi = bStart; bi <= bEnd; bi++) {
      const bx0 = bi * bayW, bx1 = bx0 + bayW;
      const midX = (bx0 + bx1) * 0.5;
      const nw0 = midX - 46, nw1 = midX + 46;
      const plan = this.bayKind(r, roomIndex, bi, floorRow, abyssHall);
      const kind = plan.kind;
      const localY = plan.row * TILE;
      const mBi = (kind === 'mural_left' || kind === 'mural_right')
        ? (kind === 'mural_left' ? bi : bi - 1)
        : -1;
      const mRow = mBi >= 0
        ? ((special.muralRows && special.muralRows.get(mBi)) ?? floorRow)
        : floorRow;
      const mWalkY = mRow * TILE;
      const mBot = abyssHall ? mWalkY - 34 : mWalkY - 38;
      const mTop = Math.max(ceilY + 52, mBot - 196);
      // Top of a local-level set-piece: upper-tier niches that would collide with it are skipped.
      const reserveTop = kind === 'corridor' ? localY - 176
        : kind === 'stair' ? localY - 240
          : kind === 'sky' ? Math.max(ceilY + 32, localY - 190)
            : kind === 'orrery' ? localY - 190
              : (kind === 'mural_left' || kind === 'mural_right') ? Math.max(ceilY + 20, mTop - 18)
                : null;
      if (kind === 'mural_left' || (kind === 'mural_right' && bi === bStart)) {
        const mBx0 = mBi * bayW;
        const muralKey = MURAL_BY_THEME[this.stageTheme] || MURAL_BY_THEME[this.themeKey];
        if (muralKey && mBot - mTop >= 110) {
          this.drawGrandMuralBay3D(ctx, camX, camY, mBx0 + 44, mBx0 + bayW * 2 - 44, mTop, mBot, Z_WALL, Z_WALL + 28, muralKey, mBi, time);
        }
      }
      if (tierCount === 1 && hallH >= 264 && kind !== 'mural_left' && kind !== 'mural_right') {
        const trifTop = ceilY + 46;
        const trifBot = Math.min(ceilY + 94, (reserveTop != null ? reserveTop : (floorY - 198)) - 14);
        if (trifBot - trifTop >= 30) {
          this.drawTriforiumBay3D(ctx, camX, camY, bx0 + 24, bx1 - 24, trifTop, trifBot, Z_WALL, bi);
        }
      }
      for (let ti = 0; ti < tierCount; ti++) {
        const tierBaseY = floorY - ti * tierStep;
        const nyBot = pal.crypt ? tierBaseY - 18 : tierBaseY - 52;
        const nyTop = Math.max(ceilY + 32, tierBaseY - 190);
        if (nyBot - nyTop < 72) continue;
        if (
          (kind === 'mural_left' || kind === 'mural_right') &&
          ((ti === 0 && mRow === floorRow) || (nyBot + 16 > mTop - 14 && nyTop - 22 < mBot + 14))
        ) {
          continue;
        }
        if (ti > 0 && reserveTop != null && nyBot > reserveTop - 16 && kind !== 'mural_left' && kind !== 'mural_right') continue;
        if (ti === 0 && kind === 'corridor') {
          // Deep one-point-perspective passage cut through the far wall at the local floor level
          this.drawCorridorBay3D(ctx, camX, camY, midX - 64, midX + 64, localY, localY - 150, Z_WALL, bi, time);
          continue;
        }
        if (ti === 0 && (kind === 'stair' || kind === 'orrery')) {
          // Drawn with the furnishings after the hall floor (the stair climbs into its own doorway)
          if (kind === 'orrery' && localY === floorY) {
            this.drawRecessedBay3D(ctx, camX, camY, nw0, nw1, nyTop, nyBot, Z_WALL, Z_NICHE, bi, time);
          }
          continue;
        }
        if (ti === 0 && kind === 'sky') {
          // Open circular-arch lancet at the local floor level
          const sTop = reserveTop, sBot = localY - 52;
          if (sBot - sTop >= 72) {
            this.drawRecessedBay3D(ctx, camX, camY, nw0, nw1, sTop, sBot, Z_WALL, Z_NICHE, bi, time, { sky: true });
            if (plan.row === floorRow) windowSpots.push({ wx: midX, wyTop: sTop, wyBot: sBot, moon: true });
          }
          continue;
        }
        this.drawRecessedBay3D(ctx, camX, camY, nw0, nw1, nyTop, nyBot, Z_WALL, Z_NICHE, bi + ti * 2, time);
        if (ti === 0 && kind === 'glass') {
          windowSpots.push({ wx: midX, wyTop: nyTop, wyBot: nyBot, moon: false });
        }
      }
    }

    if (!abyssHall) {
      this.drawHallFloor3D(
        ctx, camX, camY,
        Math.max(minWorldX, wxWall0),
        Math.min((r.x1 + 1) * TILE, wxWall1),
        floorY, Z_NEAR, Z_WALL, windowSpots, time,
      );
    }

    const bays = [];
    for (let bi = bStart; bi <= bEnd; bi++) {
      const midScreen = (bi + 0.5) * bayW - camX;
      bays.push({ bi, dist: Math.abs(midScreen - EYE_X) });
    }
    bays.sort((a, b) => b.dist - a.dist);

    for (const { bi } of bays) {
      const bx0 = bi * bayW, bx1 = bx0 + bayW;
      this.drawVaultCeilingBay3D(ctx, camX, camY, bx0, bx1, ceilY, Z_NEAR, Z_WALL);
    }

    const pilasterTex = this.primaryStoneKey();
    const trimKey = this.trimStoneKey();
    const trimTex = this.tex(trimKey);
    const pillars = [];
    for (let bi = bStart; bi <= bEnd + 1; bi++) {
      const px = bi * bayW;
      if (px < minWorldX + 8 || px > (r.x1 + 1) * TILE - 8) continue;
      pillars.push({ px, bi, dist: Math.abs(px - camX - EYE_X) });
    }
    pillars.sort((a, b) => b.dist - a.dist);
    for (const { px, bi } of pillars) {
      // Skip wall pilaster right down the middle of a 2-bay Grand Mural Gallery (`bi - 1` is `mural_left`)
      const splitsMural = special.murals && special.murals.includes(bi - 1);
      if (!splitsMural) {
        // Multi-order Gothic wall respond: wide pilaster + engaged shaft + flared corbel capital
        this.drawBox3D(ctx, camX, camY, px - 16, ceilY + 24, Z_WALL - 18, 32, floorY - ceilY - 24, 18, pilasterTex, { bright: 0.74 });
        this.drawBox3D(ctx, camX, camY, px - 8, ceilY + 26, Z_WALL - 28, 16, floorY - ceilY - 34, 12, trimKey, { bright: 0.78 });
        this.drawBox3D(ctx, camX, camY, px - 19, ceilY + 20, Z_WALL - 30, 38, 12, 26, trimKey, { bright: 0.80 });
        // 3D Transverse Vault Spandrel Flyer spanning in depth from foreground pier capital (z=64) to wall respond (z=172)
        if (trimTex) {
          const z0 = 64, z1 = Z_WALL - 28;
          const yNearT = ceilY + 18, yNearB = ceilY + 34;
          const yFarT = ceilY + 18, yFarB = ceilY + 36;
          const pNT = project3D(px, yNearT, z0, camX, camY);
          const pFT = project3D(px, yFarT, z1, camX, camY);
          const pFB = project3D(px, yFarB, z1, camX, camY);
          const pNB = project3D(px, yNearB, z0, camX, camY);
          if (Math.abs(pFT.x - pNT.x) > 1.2) {
            const sideN = pFT.x > pNT.x ? [-1, 0.25, -0.3] : [1, 0.25, -0.3];
            texQuad(ctx, trimTex, pNT, pFT, pFB, pNB, 0, 0, z1 - z0, 0, z1 - z0, 18, 0, 18,
              shadeOverlay32(sideN, pal.fog, 0.44, 0.78));
          }
          // Underside soffit of transverse arch rib
          const sNL = project3D(px - 7, yNearB, z0, camX, camY);
          const sNR = project3D(px + 7, yNearB, z0, camX, camY);
          const sFR = project3D(px + 7, yFarB, z1, camX, camY);
          const sFL = project3D(px - 7, yFarB, z1, camX, camY);
          texQuad(ctx, trimTex, sNL, sNR, sFR, sFL, 0, z0, 14, z0, 14, z1, 0, z1,
            shadeOverlay32([0, 0.85, -0.3], pal.fog, 0.46, 0.76));
        }
        this.drawPillar3D(ctx, camX, camY, px, ceilY + 22, floorY, 54, 22);
      }
    }

    // Wing-specific 3D mid-hall architectural structures (conduit bridges, balconies, arena arches)
    this.drawWingHallStructures3D(ctx, camX, camY, r, roomIndex, floorRow, abyssHall, bStart, bEnd, ceilY, floorY, time);

    // Mid-depth furnishings, the grand staircase and the brass orrery live on the
    // receding hall floor (z = 60..200), in front of the far wall and colonnade.
    if (!abyssHall) {
      this.drawMidProps3D(ctx, camX, camY, r, roomIndex, bStart, bEnd, floorRow, floorY, abyssHall);
      if (special.stair != null && special.stair >= bStart - 1 && special.stair <= bEnd + 1) {
        this.drawGrandStair3D(ctx, camX, camY, (special.stair + 0.5) * bayW, special.stairRow * TILE, Z_WALL, time);
      }
      if (special.orrery != null && special.orrery >= bStart - 1 && special.orrery <= bEnd + 1) {
        this.drawOrrery3D(ctx, camX, camY, (special.orrery + 0.5) * bayW, special.orreryRow * TILE, 150, time);
      }
    }

    if (windowSpots.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const w of windowSpots) {
        const wt = project3D(w.wx - 22, w.wyTop + 20, Z_WALL, camX, camY);
        const wb = project3D(w.wx + 22, w.wyBot, Z_WALL, camX, camY);
        const fb0 = project3D(w.wx - 10, floorY, Z_NEAR + 10, camX, camY);
        const fb1 = project3D(w.wx + 68, floorY, Z_NEAR + 10, camX, camY);
        const pulse = 0.78 + 0.22 * Math.sin(time * 0.9 + w.wx * 0.01);
        const tint = w.moon ? MOON_RGB : pal.glass;
        const g = ctx.createLinearGradient(wt.x, wt.y, fb0.x, fb0.y);
        g.addColorStop(0, rgbA(tint, (w.moon ? 0.12 : 0.10) * pulse));
        g.addColorStop(1, rgbA(tint, 0.01));
        ctx.fillStyle = g;
        fillQuad(ctx, wt, { x: wb.x, y: wt.y + 18 }, fb1, fb0);
      }
      ctx.restore();
    }

    if (r.edge !== false && portalLeft > -48) {
      const e = ctx.createLinearGradient(portalLeft, 0, portalLeft + 44, 0);
      e.addColorStop(0, 'rgba(2, 2, 8, 0.85)');
      e.addColorStop(1, 'rgba(2, 2, 8, 0)');
      ctx.fillStyle = e;
      ctx.fillRect(portalLeft, clipTop, 44, clipBot - clipTop);
    }
    ctx.restore();

    // Re-frame the Stage 1 barbican right pier in front of the portal edge so the
    // 3D stone gatehouse physically overlaps the indoor hall entrance cleanly.
    if (r.x0 > 0 && r.edge !== false && portalLeft > -64 && portalLeft < W + 64) {
      const gx = r.x0 * TILE;
      const gRow = this.level.drawbridge
        ? this.level.drawbridge.row
        : this.level.surfaceRow(Math.max(0, r.x0 - 3));
      const gFloorY = (gRow > 0 ? gRow : 9) * TILE;
      this.drawBox3D(ctx, camX, camY, gx - 58, gFloorY - 274, 38, 60, 274, 58, 'wall', { bright: 0.80 });
      this.drawBox3D(ctx, camX, camY, gx - 22, gFloorY - 290, 36, 26, 18, 32, 'stone_trim', { bright: 0.80 });
    }
  }

  /**
   * 3D Recessed Upper Triforium Gallery Arcade (`zFront -> zFront + 22`) running along
   * the upper nave wall beneath the vault springline: projecting stringcourse cornice,
   * recessed dark triforium passage, triple pointed 3D arcade openings, dwarf colonnettes,
   * and carved balustrade parapet.
   */
  drawTriforiumBay3D(ctx, camX, camY, x0, x1, yTop, yBot, zFront, bayIndex) {
    const fTL = project3D(x0, yTop, zFront, camX, camY);
    const fTR = project3D(x1, yTop, zFront, camX, camY);
    if (fTR.x < -20 || fTL.x > W + 20) return;
    const zBack = zFront + 22;
    const pal = this.pal;
    const trimKey = this.trimStoneKey();
    const trimTex = this.tex(trimKey);
    const wallTex = this.tex(this.primaryStoneKey());
    if (!trimTex || !wallTex) return;

    // 1. Deep shadowed triforium passage back wall (`zBack`)
    const bTL = project3D(x0, yTop, zBack, camX, camY);
    const bTR = project3D(x1, yTop, zBack, camX, camY);
    const bBR = project3D(x1, yBot, zBack, camX, camY);
    const bBL = project3D(x0, yBot, zBack, camX, camY);
    texQuad(ctx, wallTex, bTL, bTR, bBR, bBL, x0, yTop, x1, yTop, x1, yBot, x0, yBot,
      shadeOverlay32([0, 0, -1], pal.fog, 0.56, 0.42));

    // 2. Recessed jambs & soffit
    const fBL = project3D(x0, yBot, zFront, camX, camY);
    const fBR = project3D(x1, yBot, zFront, camX, camY);
    if (bTL.x > fTL.x + 0.3) {
      texQuad(ctx, trimTex, fTL, bTL, bBL, fBL, 0, yTop, 22, yTop, 22, yBot, 0, yBot, shadeOverlay32([1, 0, -0.25], pal.fog, 0.50, 0.72));
    }
    if (bTR.x < fTR.x - 0.3) {
      texQuad(ctx, trimTex, bTR, fTR, fBR, bBR, 0, yTop, 22, yTop, 22, yBot, 0, yBot, shadeOverlay32([-1, 0, -0.25], pal.fog, 0.50, 0.72));
    }

    // 3. Triple semicircular 3D triforium arcade spandrels + dwarf colonnette shafts + balustrade
    const arches = 3;
    const span = (x1 - x0) / arches;
    const springY = yTop + Math.min(20, (yBot - yTop) * 0.46);
    const archRise = Math.max(6, springY - yTop - 3);
    const spShade = shadeOverlay32([0, -0.15, -1], pal.fog, 0.44, 0.78);
    const arcSegs = 6;
    for (let i = 0; i < arches; i++) {
      const ax0 = x0 + i * span;
      for (let s = 0; s < arcSegs; s++) {
        const t0 = s / arcSegs, t1 = (s + 1) / arcSegs;
        const sx0 = ax0 + span * t0, sx1 = ax0 + span * t1;
        const sy0 = springY - Math.sin(t0 * Math.PI) * archRise;
        const sy1 = springY - Math.sin(t1 * Math.PI) * archRise;
        const pt0 = project3D(sx0, yTop, zFront, camX, camY);
        const pt1 = project3D(sx1, yTop, zFront, camX, camY);
        const pb1 = project3D(sx1, sy1, zFront, camX, camY);
        const pb0 = project3D(sx0, sy0, zFront, camX, camY);
        texQuad(ctx, trimTex, pt0, pt1, pb1, pb0, sx0, yTop, sx1, yTop, sx1, sy1, sx0, sy0, spShade);
      }
      if (i > 0) {
        this.drawBox3D(ctx, camX, camY, ax0 - 3.5, springY - 2, zFront - 2, 7, yBot - springY + 2, 8, trimKey, { bright: 0.78 });
      }
    }
    // Projecting upper stringcourse & lower balustrade coping rail
    const w = x1 - x0;
    this.drawBox3D(ctx, camX, camY, x0 - 6, yTop - 6, zFront - 8, w + 12, 6, 10, trimKey, { bright: 0.80 });
    this.drawBox3D(ctx, camX, camY, x0 - 6, yBot - 6, zFront - 8, w + 12, 7, 10, trimKey, { bright: 0.80 });
    void bayIndex;
  }

  /**
   * Texture-mapped 3D multi-order recessed semicircular arch bay:
   * - Outer & inner stepped 3D perspective jambs + curved 3D intrados barrel soffit + weathered sill
   * - Stained-glass circular-arch window with 3D stone mullion, curved sub-arches & rose wheel tracery
   * - Extruded 3D curved stone hoodmold archivolt ring + flush keystone block
   */
  drawRecessedBay3D(ctx, camX, camY, x0, x1, yTop, yBot, zFront, zBack, bayIndex, time, opts = null) {
    const pal = this.pal;
    const halfW = (x1 - x0) * 0.5;
    const midX = (x0 + x1) * 0.5;
    const archR = Math.min(halfW, Math.max(26, (yBot - yTop) * 0.52));
    const springY = Math.min(yBot - 16, yTop + archR);
    const effArchR = Math.max(16, springY - yTop);

    const fTL = project3D(x0, springY, zFront, camX, camY);
    const fTR = project3D(x1, springY, zFront, camX, camY);
    const fBL = project3D(x0, yBot, zFront, camX, camY);
    const fBR = project3D(x1, yBot, zFront, camX, camY);
    if (fTR.x < -24 || fTL.x > W + 24) return;

    const bTL = project3D(x0, springY, zBack, camX, camY);
    const bTR = project3D(x1, springY, zBack, camX, camY);
    const bBL = project3D(x0, yBot, zBack, camX, camY);
    const bBR = project3D(x1, yBot, zBack, camX, camY);
    const bCenter = project3D(midX, springY, zBack, camX, camY);

    const SEGS = 12;
    const fArc = new Array(SEGS + 1);
    const bArc = new Array(SEGS + 1);
    const arcWX = new Array(SEGS + 1);
    const arcWY = new Array(SEGS + 1);
    for (let i = 0; i <= SEGS; i++) {
      const th = Math.PI * (1 - i / SEGS);
      const wx = midX + Math.cos(th) * halfW;
      const wy = springY - Math.sin(th) * effArchR;
      arcWX[i] = wx;
      arcWY[i] = wy;
      fArc[i] = project3D(wx, wy, zFront, camX, camY);
      bArc[i] = project3D(wx, wy, zBack, camX, camY);
    }

    const trimKey = this.trimStoneKey();
    const wallTex = this.tex(this.primaryStoneKey());
    const trimTex = this.tex(trimKey);
    const backShade = shadeOverlay32([0, 0, -1], pal.fog, 0.48, 0.66);
    const skyBay = !!(opts && opts.sky);

    if (skyBay) {
      // 1'. Unglazed circular-arch lancet: moonlit night, drifting clouds & far ridges seen through the wall.
      this.drawSkyOpening3D(ctx, camX, camY, bArc, bBR, bBL, time);
    } else {
      // 1. Textured masonry back wall of the recess (z = zBack): lower body + 12-segment semicircular head
      texQuad(ctx, wallTex, bTL, bTR, bBR, bBL, x0, springY, x1, springY, x1, yBot, x0, yBot, backShade);
      for (let i = 0; i < SEGS; i++) {
        texTri(
          ctx, wallTex, bCenter, bArc[i], bArc[i + 1],
          midX, springY, arcWX[i], arcWY[i], arcWX[i + 1], arcWY[i + 1],
          backShade, 0.55,
        );
      }
    }

    // 2. Stained-glass circular-arch window + 3D stone bar-tracery (mullion + curved sub-arches + rose wheel) or crypt shelves
    if (skyBay) {
      // handled above
    } else if (!pal.crypt && mod(bayIndex, 2) === 0 && this.bank) {
      const winTex = this.bank.stainedWindow(rgbA(pal.glass, 0.42));
      texQuad(ctx, winTex, bTL, bTR, bBR, bBL, 0, 42, 64, 42, 64, 128, 0, 128, null);
      for (let i = 0; i < SEGS; i++) {
        const th0 = Math.PI * (1 - i / SEGS);
        const th1 = Math.PI * (1 - (i + 1) / SEGS);
        const u0 = 32 + Math.cos(th0) * 32, v0 = 42 - Math.sin(th0) * 42;
        const u1 = 32 + Math.cos(th1) * 32, v1 = 42 - Math.sin(th1) * 42;
        texTri(ctx, winTex, bCenter, bArc[i], bArc[i + 1], 32, 42, u0, v0, u1, v1, null, 0.55);
      }
      const pulse = 0.68 + 0.22 * Math.sin(time * 1.1 + bayIndex);
      ctx.fillStyle = rgbA(pal.glass, 0.18 * pulse);
      ctx.beginPath();
      ctx.moveTo(bBL.x + 2, bBL.y - 1);
      for (let i = 0; i <= SEGS; i++) ctx.lineTo(bArc[i].x, bArc[i].y);
      ctx.lineTo(bBR.x - 2, bBR.y - 1);
      ctx.closePath();
      ctx.fill();

      // 3D central stone mullion shaft + transom + curved twin sub-arches + rose wheel oculus
      const traceryBot = yBot - 2, tracerySpring = springY + 2;
      if (traceryBot - tracerySpring > 20) {
        this.drawBox3D(ctx, camX, camY, midX - 2.5, tracerySpring, zBack - 6, 5, traceryBot - tracerySpring, 6, trimKey, { bright: 0.74 });
        const transY = Math.round((tracerySpring + traceryBot) * 0.52);
        this.drawBox3D(ctx, camX, camY, x0 + 4, transY - 2, zBack - 5, (x1 - x0) - 8, 4, 5, trimKey, { bright: 0.72 });
        const trColor = shade32(pal.trim, [-0.2, -0.4, -0.85], pal.fog, 0.44);
        ctx.strokeStyle = trColor;
        const oc = project3D(midX, springY - effArchR * 0.48, zBack - 4, camX, camY);
        ctx.lineWidth = Math.max(1.4, 2.3 * oc.s);
        for (const subMid of [midX - halfW * 0.5, midX + halfW * 0.5]) {
          const subR = halfW * 0.46;
          ctx.beginPath();
          for (let s = 0; s <= 6; s++) {
            const sth = Math.PI * (1 - s / 6);
            const sp = project3D(subMid + Math.cos(sth) * subR, tracerySpring - Math.sin(sth) * (subR * 0.9), zBack - 4, camX, camY);
            if (s === 0) ctx.moveTo(sp.x, sp.y); else ctx.lineTo(sp.x, sp.y);
          }
          ctx.stroke();
        }
        const ocR = Math.max(3.5, effArchR * 0.24 * oc.s);
        ctx.beginPath();
        ctx.arc(oc.x, oc.y, ocR, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (pal.crypt) {
      for (let s = 1; s <= 2; s++) {
        const sy = springY + 6 + s * 36;
        if (sy > yBot - 10) continue;
        this.drawBox3D(ctx, camX, camY, x0 + 2, sy, zBack - 22, x1 - x0 - 4, 6, 22, 'crypt_stone', { bright: 0.8 });
        const sL = project3D(x0 + 6, sy, zBack - 16, camX, camY);
        const sR = project3D(x1 - 6, sy, zBack - 16, camX, camY);
        ctx.fillStyle = shade32([185, 174, 152], [-0.3, -0.5, -0.8], pal.fog, 0.60);
        for (let k = 0; k < 3; k++) {
          const kx = sL.x + 8 + k * ((sR.x - sL.x - 18) / 2);
          ctx.fillRect(Math.round(kx), Math.round(sL.y - 6), 5, 6);
          ctx.fillStyle = '#181422';
          ctx.fillRect(Math.round(kx + 1), Math.round(sL.y - 4), 1, 2);
          ctx.fillRect(Math.round(kx + 3), Math.round(sL.y - 4), 1, 2);
          ctx.fillStyle = shade32([185, 174, 152], [-0.3, -0.5, -0.8], pal.fog, 0.60);
        }
      }
    }

    // 3. Multi-Order Texture-Mapped 3D Perspective Side Jambs + Curved 3D Intrados Barrel Soffit
    const depth = zBack - zFront;
    const zMid = zFront + depth * 0.48;
    if (bTL.x > fTL.x + 0.4) {
      const shL = shadeOverlay32([1, 0, -0.25], pal.fog, 0.50);
      texQuad(ctx, wallTex, fTL, bTL, bBL, fBL, 0, springY, depth, springY, depth, yBot, 0, yBot, shL);
      const mTL = project3D(x0 + 5, springY + 2, zMid, camX, camY);
      const mBL = project3D(x0 + 5, yBot - 2, zMid, camX, camY);
      const mTR0 = project3D(x0, springY + 2, zMid, camX, camY);
      const mBR0 = project3D(x0, yBot - 2, zMid, camX, camY);
      texQuad(ctx, trimTex, mTR0, mTL, mBL, mBR0, 0, springY + 2, 6, springY + 2, 6, yBot, 0, yBot,
        shadeOverlay32([0.3, -0.1, -0.95], pal.fog, 0.46, 0.78));
    }
    if (bTR.x < fTR.x - 0.4) {
      const shR = shadeOverlay32([-1, 0, -0.25], pal.fog, 0.50);
      texQuad(ctx, wallTex, bTR, fTR, fBR, bBR, 0, springY, depth, springY, depth, yBot, 0, yBot, shR);
      const mTR = project3D(x1 - 5, springY + 2, zMid, camX, camY);
      const mBR = project3D(x1 - 5, yBot - 2, zMid, camX, camY);
      const mTL0 = project3D(x1, springY + 2, zMid, camX, camY);
      const mBL0 = project3D(x1, yBot - 2, zMid, camX, camY);
      texQuad(ctx, trimTex, mTR, mTL0, mBL0, mBR, 0, springY + 2, 6, springY + 2, 6, yBot, 0, yBot,
        shadeOverlay32([-0.3, -0.1, -0.95], pal.fog, 0.46, 0.78));
    }
    let arcU = 0;
    for (let i = 0; i < SEGS; i++) {
      const f0 = fArc[i], f1 = fArc[i + 1], b1 = bArc[i + 1], b0 = bArc[i];
      const segLen = Math.hypot(arcWX[i + 1] - arcWX[i], arcWY[i + 1] - arcWY[i]);
      const cross = (f1.x - f0.x) * (b0.y - f0.y) - (f1.y - f0.y) * (b0.x - f0.x);
      if (cross > 0.5) {
        const thMid = Math.PI * (1 - (i + 0.5) / SEGS);
        const shIntrados = shadeOverlay32([-Math.cos(thMid), Math.sin(thMid), -0.25], pal.fog, 0.50, 0.76);
        texQuad(ctx, wallTex, f0, f1, b1, b0, 0, arcU, depth, arcU, depth, arcU + segLen, 0, arcU + segLen, shIntrados);
      }
      arcU += segLen;
    }

    // 4. Texture-mapped 3D Sill Top + Projecting Moulded Sill Ledge
    if (fBL.y > bBL.y + 0.4) {
      const shSill = shadeOverlay32([0, -1, -0.3], pal.fog, 0.44);
      texQuad(ctx, trimTex, bBL, bBR, fBR, fBL, x0, 0, x1, 0, x1, depth, x0, depth, shSill);
    }
    this.drawBox3D(ctx, camX, camY, x0 - 8, yBot, zFront - 6, (x1 - x0) + 16, 7, 6, trimKey, { bright: 0.78 });

    // 5. Extruded 3D Curved Stone Hoodmold Archivolt Ring & Keystone on zFront - 4
    if (trimTex) {
      const zH = zFront - 4;
      const oBL = project3D(x0 - 8, yBot, zH, camX, camY);
      const oTL = project3D(x0 - 8, springY, zH, camX, camY);
      const oTR = project3D(x1 + 8, springY, zH, camX, camY);
      const oBR = project3D(x1 + 8, yBot, zH, camX, camY);
      const shArchL = shadeOverlay32([-0.35, -0.45, -0.82], pal.fog, 0.40, 0.82);
      const shArchR = shadeOverlay32([0.35, -0.45, -0.82], pal.fog, 0.44, 0.78);
      texQuad(ctx, trimTex, oTL, fTL, fBL, oBL, 0, springY, 8, springY, 8, yBot, 0, yBot, shArchL);
      texQuad(ctx, trimTex, fTR, oTR, oBR, fBR, 0, springY, 8, springY, 8, yBot, 0, yBot, shArchR);
      const oArc = new Array(SEGS + 1);
      for (let i = 0; i <= SEGS; i++) {
        const th = Math.PI * (1 - i / SEGS);
        oArc[i] = project3D(midX + Math.cos(th) * (halfW + 8), springY - Math.sin(th) * (effArchR + 8), zH, camX, camY);
      }
      let ringU = 0;
      for (let i = 0; i < SEGS; i++) {
        const thMid = Math.PI * (1 - (i + 0.5) / SEGS);
        const shRing = shadeOverlay32([Math.cos(thMid) * 0.35, -0.42 - Math.sin(thMid) * 0.2, -0.82], pal.fog, 0.41, 0.81);
        texQuad(ctx, trimTex, oArc[i], oArc[i + 1], fArc[i + 1], fArc[i], 0, ringU, 0, ringU + 14, 8, ringU + 14, 8, ringU, shRing);
        ringU += 14;
      }
      this.drawBox3D(ctx, camX, camY, midX - 5, springY - effArchR - 9, zFront - 6, 10, 10, 6, trimKey, { bright: 0.84 });
    }
  }

  /**
   * Monumental 2-Bay (512-world-px wide) 3D Recessed Fresco / Tapestry Gallery:
   * - True 3D recessed stone niche (`zFront -> zBack`) with perspective jambs, soffit, and dado sill
   * - Full 512x288 non-repeating pixel-art mural (`mural_alchemy..mural_catacombs`) texture-mapped on `zBack`
   * - Carved 3D entablature cornice & dado plinth + warm gallery illumination
   */
  drawGrandMuralBay3D(ctx, camX, camY, x0, x1, yTop, yBot, zFront, zBack, muralKey, bayIndex, time) {
    const pal = this.pal;
    const fTL = project3D(x0, yTop, zFront, camX, camY);
    const fTR = project3D(x1, yTop, zFront, camX, camY);
    if (fTR.x < -40 || fTL.x > W + 40) return;
    const fBR = project3D(x1, yBot, zFront, camX, camY);
    const fBL = project3D(x0, yBot, zFront, camX, camY);

    const bTL = project3D(x0, yTop, zBack, camX, camY);
    const bTR = project3D(x1, yTop, zBack, camX, camY);
    const bBR = project3D(x1, yBot, zBack, camX, camY);
    const bBL = project3D(x0, yBot, zBack, camX, camY);

    const depth = zBack - zFront;
    const trimKey = this.trimStoneKey();
    const trimTex = this.tex(trimKey);
    const corniceKey = (this.stageTheme === 'alchemy' || this.stageTheme === 'ballroom' || this.stageTheme === 'observatory') ? 'brass_rim' : trimKey;

    // 1. Full 512x288 pixel-art mural / fresco / tapestry mapped onto the recessed back wall
    const muralTex = this.tex(muralKey);
    const muralShade = shadeOverlay32([0, 0, -1], pal.fog, 0.30, 0.80);
    texQuad(
      ctx, muralTex, bTL, bTR, bBR, bBL,
      0, 0, muralTex.w, 0, muralTex.w, muralTex.h, 0, muralTex.h,
      muralShade,
    );

    // 2. Texture-mapped 3D recessed side jambs, soffit ceiling, and dado sill
    if (bTL.x > fTL.x + 0.4) {
      const shL = shadeOverlay32([1, 0, -0.25], pal.fog, 0.48, 0.80);
      texQuad(ctx, trimTex, fTL, bTL, bBL, fBL, 0, yTop, depth, yTop, depth, yBot, 0, yBot, shL);
    }
    if (bTR.x < fTR.x - 0.4) {
      const shR = shadeOverlay32([-1, 0, -0.25], pal.fog, 0.50, 0.80);
      texQuad(ctx, trimTex, bTR, fTR, fBR, bBR, 0, yTop, depth, yTop, depth, yBot, 0, yBot, shR);
    }
    if (fTL.y < bTL.y - 0.4) {
      const shTop = shadeOverlay32([0, 1, -0.25], pal.fog, 0.54, 0.78);
      texQuad(ctx, trimTex, fTL, fTR, bTR, bTL, x0, 0, x1, 0, x1, depth, x0, depth, shTop);
    }
    if (fBL.y > bBL.y + 0.4) {
      const shBot = shadeOverlay32([0, -1, -0.3], pal.fog, 0.44, 0.80);
      texQuad(ctx, trimTex, bBL, bBR, fBR, fBL, x0, 0, x1, 0, x1, depth, x0, depth, shBot);
    }

    // 3. Projecting 3D entablature cornice & carved dado plinth framing the gallery
    const w = x1 - x0;
    this.drawBox3D(ctx, camX, camY, x0 - 10, yTop - 12, zFront - 10, w + 20, 12, 12, corniceKey, { bright: 0.82 });
    this.drawBox3D(ctx, camX, camY, x0 - 8, yBot, zFront - 8, w + 16, 10, 10, trimKey, { bright: 0.76 });

    // 4. Subtle gallery illumination washing across the mural surface
    const glowKey = (this.stageTheme === 'alchemy' || this.stageTheme === 'conservatory') ? 'emerald'
      : (this.stageTheme === 'aqueduct' || this.stageTheme === 'observatory') ? 'cyan'
        : this.stageTheme === 'ballroom' ? 'violet'
          : this.stageTheme === 'dungeon' ? 'crimson'
            : 'amber';
    const glow = getGlowCanvas(glowKey);
    if (glow) {
      const pulse = 0.78 + 0.22 * Math.sin(time * 1.4 + bayIndex * 0.9);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const t of [0.28, 0.72]) {
        const gp = project3D(x0 + w * t, yTop + (yBot - yTop) * 0.36, zBack - 4, camX, camY);
        const rad = 88 * gp.s;
        ctx.globalAlpha = 0.16 * pulse;
        ctx.drawImage(glow, gp.x - rad, gp.y - rad, rad * 2, rad * 2);
      }
      ctx.restore();
    }
  }

  /**
   * Wing-specific mid-hall 3D architectural structures (z = 110..185) standing between
   * the vaulted back wall and the foreground colonnade for richer 3D spatial depth.
   */
  drawWingHallStructures3D(ctx, camX, camY, r, roomIndex, floorRow, abyssHall, bStart, bEnd, ceilY, floorY, time) {
    const theme = this.stageTheme;
    if (
      theme !== 'alchemy' && theme !== 'ballroom' && theme !== 'coliseum' && theme !== 'aqueduct'
      && theme !== 'conservatory' && theme !== 'dungeon' && theme !== 'observatory'
    ) return;
    const minX = r.x0 * TILE + 32;
    const maxX = (r.x1 + 1) * TILE - 32;
    const hallH = floorY - ceilY;
    if (hallH < 180) return;

    for (let bi = bStart; bi <= bEnd; bi++) {
      const bx0 = bi * BAY_W;
      const midX = bx0 + BAY_W * 0.5;
      if (midX - 96 < minX || midX + 96 > maxX) continue;
      const bKind = this.bayKind(r, roomIndex, bi, floorRow, abyssHall).kind;
      if (bKind === 'mural_left' || bKind === 'mural_right') continue;

      if (theme === 'alchemy' && (bi & 1) === 0) {
        // Overhead 3D riveted iron & brass distillation gantry + counter-rotating pressure cogwheels
        const beamY = ceilY + 56;
        this.drawBox3D(ctx, camX, camY, bx0 + 18, beamY, 118, BAY_W - 36, 14, 34, 'iron_truss', { bright: 0.78 });
        this.drawBox3D(ctx, camX, camY, midX - 20, beamY - 4, 114, 40, 22, 42, 'brass_rim', { bright: 0.80 });
        this.drawBox3D(ctx, camX, camY, midX - 8, beamY + 18, 148, 16, hallH - 74, 16, 'brass_rim', { bright: 0.74 });
        const dir = (bi & 2) ? 1 : -1;
        this.drawGear3D(ctx, camX, camY, midX - 30, beamY + 46, 158, { r: 28, speed: 0.55 * dir, teeth: 10, phase: bi * 0.3, bright: 0.76 }, time);
        this.drawGear3D(ctx, camX, camY, midX + 26, beamY + 62, 162, { r: 22, speed: -0.7 * dir, teeth: 8, phase: 0.4, bright: 0.76 }, time);
      } else if (theme === 'ballroom' && hallH >= 230 && (((bi % 3) + 3) % 3) === 1) {
        // Elevated 3D white-marble & gilded-brass musicians' gallery / opera box
        const galY = ceilY + Math.min(126, Math.round(hallH * 0.46));
        this.drawBox3D(ctx, camX, camY, midX - 88, galY, 138, 176, 12, 48, 'marble', { topTex: 'marble', bright: 0.82 });
        this.drawBox3D(ctx, camX, camY, midX - 84, galY + 12, 146, 20, 24, 36, 'marble', { bright: 0.74 });
        this.drawBox3D(ctx, camX, camY, midX + 64, galY + 12, 146, 20, 24, 36, 'marble', { bright: 0.74 });
        this.drawBox3D(ctx, camX, camY, midX - 88, galY - 26, 138, 176, 6, 8, 'brass_rim', { bright: 0.84 });
        for (let sx = -72; sx <= 72; sx += 36) {
          this.drawBox3D(ctx, camX, camY, midX + sx - 4, galY - 20, 140, 8, 20, 6, 'marble', { bright: 0.78 });
        }
      } else if (theme === 'coliseum' && (bi & 1) === 1) {
        // Recessed 3D travertine vomitorium archway + blazing suspended iron arena brazier
        const archTop = Math.max(ceilY + 38, floorY - 196);
        this.drawArchSpan3D(ctx, camX, camY, midX - 82, midX + 82, archTop + 56, archTop, 136, 40, 'travertine_stone');
        const bzY = ceilY + 78;
        this.drawBox3D(ctx, camX, camY, midX - 2, ceilY + 26, 124, 4, 52, 4, 'iron_rivet', { bright: 0.76 });
        this.drawBox3D(ctx, camX, camY, midX - 16, bzY, 118, 32, 12, 24, 'iron_rivet', { topTex: 'brass_rim', bright: 0.78 });
        const glow = getGlowCanvas('amber');
        if (glow) {
          const gp = project3D(midX, bzY - 6, 124, camX, camY);
          const rad = (34 + 6 * Math.sin(time * 5.2 + bi)) * gp.s;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.26;
          ctx.drawImage(glow, gp.x - rad, gp.y - rad, rad * 2, rad * 2);
          ctx.restore();
        }
      } else if (theme === 'aqueduct' && (((bi % 3) + 3) % 3) === 0) {
        // Subterranean 3D Roman sluice-arch & water-gate spanning mid-depth
        const archTop = Math.max(ceilY + 36, floorY - 190);
        this.drawArchSpan3D(ctx, camX, camY, midX - 88, midX + 88, archTop + 58, archTop, 132, 38, 'aqueduct_stone');
      } else if (theme === 'conservatory' && (bi & 1) === 0) {
        // Victorian 3D wrought-iron glasshouse conservatory arch rib + suspended glowing nightshade terrarium
        const archTop = Math.max(ceilY + 34, floorY - 210);
        this.drawArchSpan3D(ctx, camX, camY, midX - 92, midX + 92, archTop + 62, archTop, 134, 28, 'iron_truss');
        const podY = ceilY + 74;
        this.drawBox3D(ctx, camX, camY, midX - 2, ceilY + 24, 126, 4, 50, 4, 'iron_rivet', { bright: 0.76 });
        this.drawBox3D(ctx, camX, camY, midX - 18, podY, 120, 36, 14, 26, 'brass_rim', { bright: 0.82 });
        const glow = getGlowCanvas('emerald');
        if (glow) {
          const gp = project3D(midX, podY + 8, 126, camX, camY);
          const rad = (38 + 6 * Math.sin(time * 3.8 + bi)) * gp.s;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.28;
          ctx.drawImage(glow, gp.x - rad, gp.y - rad, rad * 2, rad * 2);
          ctx.restore();
        }
      } else if (theme === 'dungeon' && (bi & 1) === 1) {
        // Subterranean 3D iron portcullis gaol arch & suspended red-hot coal brazier
        const archTop = Math.max(ceilY + 42, floorY - 188);
        this.drawArchSpan3D(ctx, camX, camY, midX - 80, midX + 80, archTop + 52, archTop, 138, 42, 'crypt_stone');
        for (let bx = -54; bx <= 54; bx += 27) {
          this.drawBox3D(ctx, camX, camY, midX + bx - 2, archTop + 26, 148, 4, floorY - (archTop + 26), 4, 'iron_rivet', { bright: 0.72 });
        }
        const glow = getGlowCanvas('crimson');
        if (glow) {
          const gp = project3D(midX, floorY - 68, 142, camX, camY);
          const rad = (36 + 5 * Math.sin(time * 4.6 + bi)) * gp.s;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.24;
          ctx.drawImage(glow, gp.x - rad, gp.y - rad, rad * 2, rad * 2);
          ctx.restore();
        }
      } else if (theme === 'observatory' && (bi & 1) === 0) {
        // Celestial 3D gilded-brass meridian arch + counter-rotating astrolabe gear rings
        const archTop = Math.max(ceilY + 32, floorY - 216);
        this.drawArchSpan3D(ctx, camX, camY, midX - 90, midX + 90, archTop + 64, archTop, 136, 30, 'brass_rim');
        const dir = (bi & 2) ? 1 : -1;
        this.drawGear3D(ctx, camX, camY, midX, ceilY + 86, 152, { r: 34, speed: 0.42 * dir, teeth: 12, phase: bi * 0.5, bright: 0.84 }, time);
        const glow = getGlowCanvas('cyan');
        if (glow) {
          const gp = project3D(midX, ceilY + 86, 150, camX, camY);
          const rad = (42 + 6 * Math.sin(time * 3.2 + bi)) * gp.s;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.25;
          ctx.drawImage(glow, gp.x - rad, gp.y - rad, rad * 2, rad * 2);
          ctx.restore();
        }
      }
    }
  }

  /** Texture-mapped 3D perspective flagstone hall floor + royal crimson carpet (zero diagonal swim). */
  drawHallFloor3D(ctx, camX, camY, x0, x1, floorY, zNear, zFar, windows, time) {
    const pal = this.pal;
    const fNearL = project3D(x0, floorY, zNear, camX, camY);
    const fNearR = project3D(x1, floorY, zNear, camX, camY);
    const fFarL = project3D(x0, floorY, zFar, camX, camY);
    const fFarR = project3D(x1, floorY, zFar, camX, camY);
    if (fNearL.y <= fFarL.y + 1) return;

    // Dark mortar undercoat prevents any sub-pixel gap between perspective strips
    ctx.fillStyle = rgbA(pal.fog, 0.96);
    fillQuad(ctx, fFarL, fFarR, fNearR, fNearL);

    const wingFloorKey = this.stageTheme === 'alchemy' ? 'alchemy_hall_floor'
      : this.stageTheme === 'ballroom' ? 'ballroom_hall_floor'
        : this.stageTheme === 'coliseum' ? 'coliseum_hall_floor'
          : this.stageTheme === 'aqueduct' ? 'aqueduct_hall_floor'
            : this.stageTheme === 'conservatory' ? 'conservatory_hall_floor'
              : this.stageTheme === 'dungeon' ? 'dungeon_hall_floor'
                : this.stageTheme === 'observatory' ? 'observatory_hall_floor'
                  : null;
    const floorTex = this.tex(wingFloorKey || (pal.crypt ? 'crypt_floor' : 'hall_floor'));
    const zSteps = [zFar, 152, 108, 70, zNear];
    for (let zi = 0; zi < zSteps.length - 1; zi++) {
      const zA = zSteps[zi], zB = zSteps[zi + 1];
      const fogT = 0.32 + 0.44 * (zA / zFar);
      const shade = shadeOverlay32([0, -0.9, -0.4], pal.fog, fogT, 0.78);
      texStripZ(ctx, floorTex, camX, camY, x0, x1, floorY, zA, zB, zA, zB, shade, 1, FOCAL, EYE_X, EYE_Y);
    }

    // Texture-mapped Runner Carpet (royal crimson, gilded ballroom, mossy conservatory, or celestial observatory)
    if (pal.carpet || this.stageTheme === 'ballroom') {
      const carpetKey = this.stageTheme === 'ballroom' ? 'ballroom_carpet'
        : this.stageTheme === 'conservatory' ? 'conservatory_carpet'
          : this.stageTheme === 'observatory' ? 'observatory_carpet'
            : 'carpet';
      const carpetTex = this.tex(carpetKey);
      const cShade = shadeOverlay32([0, -0.85, -0.5], pal.fog, 0.38, 0.78);
      texStripZ(ctx, carpetTex, camX, camY, x0, x1, floorY, 148, 76, 0, 32, cShade, 2, FOCAL, EYE_X, EYE_Y);
    }

    if (windows.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const w of windows) {
        const pulse = 0.75 + 0.25 * Math.sin(time * 0.9 + w.wx * 0.01);
        const a0 = project3D(w.wx - 20, floorY, 172, camX, camY);
        const a1 = project3D(w.wx + 24, floorY, 172, camX, camY);
        const b1 = project3D(w.wx + 66, floorY, 56, camX, camY);
        const b0 = project3D(w.wx + 4, floorY, 56, camX, camY);
        ctx.fillStyle = rgbA(w.moon ? MOON_RGB : pal.glass, (w.moon ? 0.14 : 0.13) * pulse);
        fillQuad(ctx, a0, a1, b1, b0);
      }
      ctx.restore();
    }

    const sb = ctx.createLinearGradient(0, fFarL.y, 0, fFarL.y + 8);
    sb.addColorStop(0, 'rgba(3, 2, 10, 0.72)');
    sb.addColorStop(1, 'rgba(3, 2, 10, 0)');
    ctx.fillStyle = sb;
    ctx.fillRect(Math.round(fFarL.x), Math.round(fFarL.y), Math.round(fFarR.x - fFarL.x), 8);
  }

  /**
   * One bay of a High-Polygon 3D Gothic Tierceron / Stellar Rib-Vault ceiling overhead:
   * - 12 individually normal-shaded ashlar vaulting web facets (`texTri`)
   * - Extruded 3D polygonal stone transverse, diagonal groin, ridge & tierceron ribs (`texQuad`)
   * - Stepped 3D cruciform keystone boss + carved pendant drop finial at the vault crown
   */
  drawVaultCeilingBay3D(ctx, camX, camY, x0, x1, ceilY, zNear, zFar) {
    const pal = this.pal;
    const midX = (x0 + x1) * 0.5, midZ = (zNear + zFar) * 0.5;
    const springY = ceilY + 46, crownY = ceilY;

    const nL = project3D(x0, springY, zNear, camX, camY);
    const nR = project3D(x1, springY, zNear, camX, camY);
    if (nR.x < -30 || nL.x > W + 30 || Math.max(nL.y, nR.y) < -10) return;

    const fL = project3D(x0, springY, zFar, camX, camY);
    const fR = project3D(x1, springY, zFar, camX, camY);
    const nApex = project3D(midX, crownY + 2, zNear, camX, camY);
    const fApex = project3D(midX, crownY + 2, zFar, camX, camY);
    // Intermediate tierceron & ridge vertices for rich 12-facet stellar vault geometry
    const mL = project3D(x0 + 18, crownY + 12, midZ, camX, camY);
    const mR = project3D(x1 - 18, crownY + 12, midZ, camX, camY);
    const rNear = project3D(midX, crownY - 3, (zNear + midZ) * 0.5, camX, camY);
    const rFar = project3D(midX, crownY - 3, (zFar + midZ) * 0.5, camX, camY);
    const boss = project3D(midX, crownY - 8, midZ, camX, camY);

    const vTex = this.tex(this.primaryStoneKey());
    const trimKey = this.trimStoneKey();
    const trimTex = this.tex(trimKey);

    // 1. 12 individually normal-shaded ashlar vaulting web facets
    const shLN = shadeOverlay32([0.62, 0.68, -0.38], pal.fog, 0.43, 0.80);
    const shLF = shadeOverlay32([0.58, 0.72, 0.36], pal.fog, 0.48, 0.76);
    texTri(ctx, vTex, nL, mL, boss, zNear, springY, midZ, crownY + 12, midZ, crownY, shLN, 0.55);
    texTri(ctx, vTex, mL, fL, boss, midZ, crownY + 12, zFar, springY, midZ, crownY, shLF, 0.55);

    const shRN = shadeOverlay32([-0.62, 0.68, -0.38], pal.fog, 0.47, 0.78);
    const shRF = shadeOverlay32([-0.58, 0.72, 0.36], pal.fog, 0.52, 0.74);
    texTri(ctx, vTex, boss, mR, nR, midZ, crownY, midZ, crownY + 12, zNear, springY, shRN, 0.55);
    texTri(ctx, vTex, fR, mR, boss, zFar, springY, midZ, crownY + 12, midZ, crownY, shRF, 0.55);

    const shFarL = shadeOverlay32([0.28, 0.82, 0.48], pal.fog, 0.50, 0.77);
    const shFarR = shadeOverlay32([-0.28, 0.82, 0.48], pal.fog, 0.54, 0.74);
    texTri(ctx, vTex, fL, fApex, rFar, x0, springY, midX, crownY, midX, crownY - 16, shFarL, 0.55);
    texTri(ctx, vTex, fL, rFar, boss, x0, springY, midX, crownY - 16, midX, crownY - 32, shFarL, 0.55);
    texTri(ctx, vTex, fApex, fR, rFar, midX, crownY, x1, springY, midX, crownY - 16, shFarR, 0.55);
    texTri(ctx, vTex, rFar, fR, boss, midX, crownY - 16, x1, springY, midX, crownY - 32, shFarR, 0.55);

    const shNearL = shadeOverlay32([0.28, 0.82, -0.48], pal.fog, 0.40, 0.80);
    const shNearR = shadeOverlay32([-0.28, 0.82, -0.48], pal.fog, 0.44, 0.77);
    texTri(ctx, vTex, nL, rNear, nApex, x0, springY, midX, crownY - 16, midX, crownY, shNearL, 0.55);
    texTri(ctx, vTex, nL, boss, rNear, x0, springY, midX, crownY - 32, midX, crownY - 16, shNearL, 0.55);
    texTri(ctx, vTex, nApex, rNear, nR, midX, crownY, midX, crownY - 16, x1, springY, shNearR, 0.55);
    texTri(ctx, vTex, rNear, boss, nR, midX, crownY - 16, midX, crownY - 32, x1, springY, shNearR, 0.55);

    // 2. Extruded 3D polygonal moulded stone ribs (transverse, diagonal groin, tierceron & ridge ribs)
    if (trimTex) {
      const ribShade = shadeOverlay32([-0.18, 0.62, -0.76], pal.fog, 0.38, 0.82);
      const drawRib = (a, b, halfW) => {
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (len < 1.5) return;
        const nx = (-dy / len) * halfW, ny = (dx / len) * halfW;
        texQuad(
          ctx, trimTex,
          { x: a.x + nx, y: a.y + ny }, { x: b.x + nx, y: b.y + ny },
          { x: b.x - nx, y: b.y - ny }, { x: a.x - nx, y: a.y - ny },
          0, 0, len, 0, len, 8, 0, 8, ribShade,
        );
      };
      // Near & far pointed transverse arch ribs
      drawRib(nL, nApex, 3.0); drawRib(nApex, nR, 3.0);
      drawRib(fL, fApex, 2.2); drawRib(fApex, fR, 2.2);
      // Diagonal groin ribs
      drawRib(nL, boss, 2.4); drawRib(boss, fR, 2.0);
      drawRib(nR, boss, 2.4); drawRib(boss, fL, 2.0);
      // Longitudinal & transverse ridge + tierceron ribs
      drawRib(nApex, boss, 1.8); drawRib(boss, fApex, 1.6);
      drawRib(mL, boss, 1.7); drawRib(boss, mR, 1.7);
    }

    // 3. Multi-tier carved 3D cruciform roof boss + pendant finial at the vault crown, plus minor ridge bosses
    this.drawBox3D(ctx, camX, camY, midX - 10, crownY - 11, midZ - 8, 20, 6, 16, trimKey, { bright: 0.80 });
    this.drawBox3D(ctx, camX, camY, midX - 6, crownY - 5, midZ - 5, 12, 8, 10, trimKey, { bright: 0.84 });
    this.drawBox3D(ctx, camX, camY, midX - 3, crownY + 3, midZ - 2.5, 6, 5, 5, trimKey, { bright: 0.74 });
  }

  /**
   * Clustered 3D Gothic Compound Pier:
   * - Two-tier stepped chamfered plinth socle
   * - Central fluted pier core + left, right & front engaged colonnette shafts
   * - Mid-height shaft-ring annulet + necking astragal + flared echinus + stepped abacus capital
   */
  drawPillar3D(ctx, camX, camY, wx, yTop, yBot, z, w, texKey = null, bright = null) {
    const useMarble = texKey === 'marble' || this.stageTheme === 'ballroom' || this.stageTheme === 'skykeep';
    const shaftKey = texKey || (useMarble ? 'marble' : 'pillar_shaft');
    const trimKey = useMarble ? 'marble' : this.trimStoneKey();
    const capKey = this.stageTheme === 'ballroom' ? 'brass_rim' : trimKey;
    const bShaft = bright != null ? bright : (useMarble ? 0.80 : 0.76);
    const bCap = bright != null ? bright : 0.79;
    const totalH = yBot - yTop;
    const shaftTop = yTop + 18;
    const shaftH = Math.max(16, totalH - 38);
    const colW = Math.max(5, Math.round(w * 0.34));

    // Central pier core + flanking left/right colonnette shafts + proud front engaged shaft
    const coreUFit = Math.max(24, Math.round(w * 1.45));
    const colUFit = Math.max(12, Math.round(colW * 1.6));
    this.drawBox3D(ctx, camX, camY, wx - w * 0.5, shaftTop, z, w, shaftH, w,
      shaftKey, { uFit: coreUFit, bright: bShaft });
    if (w >= 18 && shaftH >= 48) {
      this.drawBox3D(ctx, camX, camY, wx - w * 0.5 - colW * 0.68, shaftTop + 4, z + w * 0.22, colW, shaftH - 8, colW,
        shaftKey, { uFit: colUFit, bright: bShaft * 0.94 });
      this.drawBox3D(ctx, camX, camY, wx + w * 0.5 - colW * 0.32, shaftTop + 4, z + w * 0.22, colW, shaftH - 8, colW,
        shaftKey, { uFit: colUFit, bright: bShaft * 0.88 });
      this.drawBox3D(ctx, camX, camY, wx - colW * 0.5, shaftTop + 2, z - colW * 0.55, colW, shaftH - 4, colW,
        shaftKey, { uFit: colUFit, bright: Math.min(1, bShaft * 1.05) });
      // Mid-height moulded shaft-ring (annulet) band on tall nave piers
      if (shaftH >= 150) {
        const ringY = Math.round(shaftTop + shaftH * 0.5);
        this.drawBox3D(ctx, camX, camY, wx - w * 0.74, ringY - 3, z - colW * 0.65, w * 1.48, 6, w + colW * 0.9, capKey, { bright: bCap });
      }
    }
    // Multi-order capital: astragal necking + echinus bell + wide stepped abacus + vault springer
    this.drawBox3D(ctx, camX, camY, wx - w * 0.68, yTop + 12, z - 4, w * 1.36, 6, w + 8, trimKey, { bright: bCap * 0.95 });
    this.drawBox3D(ctx, camX, camY, wx - w * 0.84, yTop + 4, z - 6, w * 1.68, 8, w + 12, capKey, { bright: bCap });
    this.drawBox3D(ctx, camX, camY, wx - w * 0.96, yTop - 4, z - 8, w * 1.92, 8, w + 16, capKey, { bright: Math.min(1, bCap * 1.04) });
    // Two-tier stepped chamfered plinth base
    this.drawBox3D(ctx, camX, camY, wx - w * 0.76, yBot - 20, z - 5, w * 1.52, 9, w + 10, trimKey, { bright: bCap * 0.96 });
    this.drawBox3D(ctx, camX, camY, wx - w * 0.92, yBot - 11, z - 8, w * 1.84, 11, w + 16, trimKey, { bright: bCap });
  }

  // ======================================= FAR-WALL DEPTH SET-PIECES (PASS II)
  /**
   * Screen-locked night backdrop seen through open lancets: the sky dome with its
   * drifting moon and shader cloud banks over darkened far ridges and castle
   * crags. Composited at most once per frame, only while a sky bay is on screen.
   */
  getSkyView(camX, time) {
    if (!this._skyView) {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      this._skyView = c;
      this._skyViewKey = null;
    }
    const key = `${Math.round(camX)}|${Math.round(time * 30)}`;
    if (this._skyViewKey === key) return this._skyView;
    this._skyViewKey = key;
    const g = this._skyView.getContext('2d');
    const A = this.assets;
    const SKY_DY = 58;
    g.fillStyle = '#1a1730';
    g.fillRect(0, 0, W, H);
    const sky = A.img('sky');
    let off = 0;
    if (sky) {
      // Same slow drift as the outdoor sky dome, so the moon crosses the lancets over time.
      off = mod(-(camX * 0.04) - time * 1.5, sky.width);
      for (let x = off - sky.width; x < W; x += sky.width) g.drawImage(sky, Math.round(x), SKY_DY);
    }
    const fx = getFxLayers();
    if (fx && fx.enabled) {
      g.save();
      g.translate(0, SKY_DY);
      fx.clouds(g, camX, this.themeKey, 0);
      g.restore();
    }
    // Cool night lift plus a luminous halo around the moon (at x≈470 of the sky art)
    g.fillStyle = 'rgba(70, 90, 170, 0.14)';
    g.fillRect(0, 0, W, 230);
    if (sky) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let x = off - sky.width; x < W; x += sky.width) {
        const mx = x + 470, my = SKY_DY + 108;
        if (mx < -120 || mx > W + 120) continue;
        const halo = g.createRadialGradient(mx, my, 20, mx, my, 120);
        halo.addColorStop(0, 'rgba(200, 212, 255, 0.30)');
        halo.addColorStop(0.5, 'rgba(150, 165, 230, 0.12)');
        halo.addColorStop(1, 'rgba(120, 130, 200, 0)');
        g.fillStyle = halo;
        g.fillRect(mx - 120, my - 120, 240, 240);
      }
      g.restore();
    }
    // Far ridges & castle crags, darkened, with the horizon in the lower third of the lancets.
    for (const [name, f, dy, dark] of [['mountains', 0.09, 74, 0.42], ['castle', 0.22, 84, 0.54]]) {
      if (!A.img(name)) continue;
      const img = A.darkened(name, dark);
      const o = mod(-(camX * f), img.width);
      for (let x = o - img.width; x < W; x += img.width) g.drawImage(img, Math.round(x), dy);
    }
    return this._skyView;
  }

  /** Unglazed circular-arch opening: the night backdrop behind iron rose/arch tracery, clipped to the arch. */
  drawSkyOpening3D(ctx, camX, camY, bArc, bBR, bBL, time) {
    const view = this.getSkyView(camX, time);
    // Bounded elevation parallax keeps moonlit sky & ridges centered across multi-story halls.
    const viewY = Math.round(parallaxElevY(camY, this.level.height) * 0.14);
    const bTL = bArc[0];
    const bTR = bArc[bArc.length - 1];
    const bCrown = bArc[bArc.length >> 1];
    const left = Math.floor(Math.min(bTL.x, bBL.x)) - 1, right = Math.ceil(Math.max(bTR.x, bBR.x)) + 1;
    const top = Math.floor(bCrown.y) - 1, bottom = Math.ceil(Math.max(bBL.y, bBR.y)) + 2;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(bBL.x, bBL.y + 1);
    for (let i = 0; i < bArc.length; i++) ctx.lineTo(bArc[i].x, bArc[i].y);
    ctx.lineTo(bBR.x, bBR.y + 1);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = '#151228';
    ctx.fillRect(left, top, right - left, bottom - top);
    ctx.drawImage(view, 0, viewY);
    // Night haze keeps the opening from outshining the play layer.
    ctx.fillStyle = 'rgba(8, 10, 26, 0.30)';
    ctx.fillRect(left, top, right - left, bottom - top);
    // Wrought-iron circular-arch tracery: central mullion, transom, twin sub-arches, and rose wheel
    const spanX = Math.max(12, bBR.x - bBL.x);
    const s = Math.max(0.5, spanX / 92);
    const mx = (bBL.x + bBR.x) * 0.5;
    const springY = bTL.y, crownY = bCrown.y;
    const archH = Math.max(8, springY - crownY);
    const transomY = springY + (bBL.y - springY) * 0.48;
    const roseY = springY - archH * 0.52;
    const roseR = Math.max(3, archH * 0.24);
    ctx.strokeStyle = 'rgba(14, 14, 26, 0.94)';
    ctx.lineWidth = Math.max(1, Math.round(2.3 * s));
    ctx.beginPath();
    ctx.moveTo(mx, bBL.y + 2); ctx.lineTo(mx, springY);
    ctx.moveTo(bBL.x, transomY); ctx.lineTo(bBR.x, transomY);
    ctx.stroke();
    const subSpan = spanX * 0.25;
    for (const smx of [mx - subSpan, mx + subSpan]) {
      ctx.beginPath();
      ctx.arc(smx, springY, subSpan * 0.96, Math.PI, 0, false);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(mx, roseY, roseR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * One-point-perspective arcaded passage receding from the far wall (z = zFront)
   * deep into darkness: textured side walls, flagstone floor and circular barrel
   * vault, repeating circular transverse arch ribs, fog-to-black falloff and torches
   * at the far end. Crypt passages sink toward deeper vaults; cave tunnels glow amber.
   */
  drawCorridorBay3D(ctx, camX, camY, x0, x1, floorY, yTop, zFront, bayIndex, time) {
    const pal = this.pal;
    const crypt = !!pal.crypt;
    const cave = this.themeKey === 'darkcave';
    const wallTex = this.tex(cave ? 'cavernwall' : this.primaryStoneKey());
    const floorTex = this.tex(crypt ? 'crypt_floor' : 'hall_floor');
    const trimKey = this.trimStoneKey();
    if (!wallTex || !floorTex) return;
    const fog = pal.fog;
    const mid = (x0 + x1) * 0.5;
    const halfW = (x1 - x0) * 0.5;
    const rise = 26;
    const archR = Math.min(halfW, Math.max(30, Math.round(halfW * 0.86)));
    const springOff = archR - rise;                    // keeps crown at yTop - rise while curving semicircularly
    const ARCH_SEGS = 10;
    const VAULT_SEGS = 6;
    const stations = [0, 54, 118, 194, 286, 400];      // depth stations beyond the wall
    const descend = crypt && !cave ? 9 : 0;            // crypt passages sink toward deeper vaults
    const proj = (px, py, pz) => project3D(px, py, pz, camX, camY);
    const P = (wx, wy, dz) => project3D(wx, wy, zFront + dz, camX, camY);
    const fogAt = (dz) => clamp01(0.20 + (dz / 400) * 0.84);

    const nL = P(x0, floorY, 0), nR = P(x1, floorY, 0);
    if (nR.x < -24 || nL.x > W + 24) return;

    // Everything beyond the wall is only visible THROUGH the opening: clip to the circular arch.
    const oL = P(x0, floorY + 1, 0), oR = P(x1, floorY + 1, 0);
    const oArc = new Array(ARCH_SEGS + 1);
    const baseSpringY = yTop + springOff;
    for (let i = 0; i <= ARCH_SEGS; i++) {
      const th = Math.PI * (1 - i / ARCH_SEGS);
      oArc[i] = P(mid + Math.cos(th) * halfW, baseSpringY - Math.sin(th) * archR, 0);
    }
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(oL.x, oL.y);
    for (let i = 0; i <= ARCH_SEGS; i++) ctx.lineTo(oArc[i].x, oArc[i].y);
    ctx.lineTo(oR.x, oR.y);
    ctx.closePath();
    ctx.clip();

    // Far end: fully fogged darkness.
    const last = stations.length - 1;
    const dzEnd = stations[last];
    const endTop = yTop + descend * last - rise - 4, endBot = floorY + descend * last;
    ctx.fillStyle = rgbA(fog, 1);
    fillQuad(ctx, P(x0, endTop, dzEnd), P(x1, endTop, dzEnd), P(x1, endBot, dzEnd), P(x0, endBot, dzEnd));

    for (let k = last - 1; k >= 0; k--) {
      const dz0 = stations[k], dz1 = stations[k + 1];
      const fy0 = floorY + descend * k, fy1 = floorY + descend * (k + 1);
      const cy0 = baseSpringY + descend * k, cy1 = baseSpringY + descend * (k + 1);
      const fogK = fogAt((dz0 + dz1) * 0.5);
      // Flagstone floor (perspective-subdivided near the mouth so stones never swim)
      texQuadSubZ(
        ctx, floorTex, proj,
        { x: x0, y: fy1, z: zFront + dz1 }, { x: x1, y: fy1, z: zFront + dz1 },
        { x: x1, y: fy0, z: zFront + dz0 }, { x: x0, y: fy0, z: zFront + dz0 },
        x0, dz1, x1, dz1, x1, dz0, x0, dz0,
        shadeOverlay32([0, -0.9, -0.4], fog, fogK, 0.9), k < 2 ? 2 : 1,
      );
      // Side walls up to circular arch springline (u runs along depth so the courses recede)
      texQuad(ctx, wallTex, P(x0, cy0, dz0), P(x0, cy1, dz1), P(x0, fy1, dz1), P(x0, fy0, dz0),
        dz0, cy0, dz1, cy1, dz1, fy1, dz0, fy0, shadeOverlay32([1, 0, -0.25], fog, fogK));
      texQuad(ctx, wallTex, P(x1, cy1, dz1), P(x1, cy0, dz0), P(x1, fy0, dz0), P(x1, fy1, dz1),
        dz1, cy1, dz0, cy0, dz0, fy0, dz1, fy1, shadeOverlay32([-1, 0, -0.25], fog, fogK));
      // Curved barrel-vault ceiling strips
      let vU = 0;
      for (let v = 0; v < VAULT_SEGS; v++) {
        const th0 = Math.PI * (1 - v / VAULT_SEGS);
        const th1 = Math.PI * (1 - (v + 1) / VAULT_SEGS);
        const thM = (th0 + th1) * 0.5;
        const wx0 = mid + Math.cos(th0) * halfW, wx1 = mid + Math.cos(th1) * halfW;
        const dy0 = Math.sin(th0) * archR, dy1 = Math.sin(th1) * archR;
        const arcLen = Math.hypot(wx1 - wx0, dy1 - dy0);
        texQuad(
          ctx, wallTex,
          P(wx0, cy0 - dy0, dz0), P(wx1, cy0 - dy1, dz0),
          P(wx1, cy1 - dy1, dz1), P(wx0, cy1 - dy0, dz1),
          vU, dz0, vU + arcLen, dz0, vU + arcLen, dz1, vU, dz1,
          shadeOverlay32([-Math.cos(thM) * 0.65, Math.sin(thM) * 0.85, -0.25], fog, Math.min(1, fogK + 0.06)),
        );
        vU += arcLen;
      }
      // Crypt steps: pale nosings down the sinking floor
      if (descend) {
        ctx.strokeStyle = rgbA([200, 190, 170], 0.22 * (1 - fogK));
        ctx.lineWidth = 1;
        for (let sIdx = 1; sIdx <= 2; sIdx++) {
          const t = sIdx / 3;
          const a = P(x0 + 2, fy0 + (fy1 - fy0) * t, dz0 + (dz1 - dz0) * t);
          const b = P(x1 - 2, fy0 + (fy1 - fy0) * t, dz0 + (dz1 - dz0) * t);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
    }

    // Circular transverse arch ribs at every station inside the passage
    for (let k = 1; k < last; k++) {
      const dz = stations[k];
      const fy = floorY + descend * k, cy = baseSpringY + descend * k;
      const r0 = P(x0, fy, dz), rEnd = P(x1, fy, dz);
      ctx.strokeStyle = shade32(pal.trim, [0, -0.2, -0.95], fog, fogAt(dz));
      ctx.lineWidth = Math.max(1, Math.round(4.2 * r0.s));
      ctx.beginPath();
      ctx.moveTo(r0.x, r0.y);
      for (let i = 0; i <= ARCH_SEGS; i++) {
        const th = Math.PI * (1 - i / ARCH_SEGS);
        const rp = P(mid + Math.cos(th) * halfW, cy - Math.sin(th) * archR, dz);
        ctx.lineTo(rp.x, rp.y);
      }
      ctx.lineTo(rEnd.x, rEnd.y);
      ctx.stroke();
    }

    // A lone torch at the far end and a wall sconce halfway down the left wall
    const glow = getGlowCanvas(cave ? 'amber' : 'flame');
    const torches = [
      { p: P(mid, endTop + (endBot - endTop) * 0.42, dzEnd - 2), r: 36, seed: 0 },
      { p: P(x0 + 3, yTop + descend * 2 + 34, stations[2]), r: 22, seed: 2.3 },
    ];
    for (const t of torches) {
      const flick = 0.72 + 0.28 * Math.sin(time * 11 + bayIndex * 1.7 + t.seed);
      const rr = Math.max(3, t.r * t.p.s);
      if (glow) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55 * flick;
        ctx.drawImage(glow, t.p.x - rr * 2, t.p.y - rr * 2, rr * 4, rr * 4);
        ctx.restore();
      }
      ctx.fillStyle = cave ? '#ffb45a' : '#ffd88a';
      ctx.fillRect(Math.round(t.p.x - 1), Math.round(t.p.y - 2), 2, 3);
    }
    ctx.restore();

    // Curved 3D stone archivolt & jambs framing the circular arch opening in the far wall
    ctx.strokeStyle = shade32(pal.trim, [-0.3, -0.5, -0.8], fog, 0.40);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(oL.x, oL.y - 1);
    for (let i = 0; i <= ARCH_SEGS; i++) ctx.lineTo(oArc[i].x, oArc[i].y);
    ctx.lineTo(oR.x, oR.y - 1);
    ctx.stroke();
    const jambTop = baseSpringY - 2;
    this.drawBox3D(ctx, camX, camY, x0 - 12, jambTop, zFront - 10, 12, floorY - jambTop, 10, trimKey);
    this.drawBox3D(ctx, camX, camY, x1, jambTop, zFront - 10, 12, floorY - jambTop, 10, trimKey);
  }

  /**
   * Mid-depth furnishings (z ≈ 88..103) standing on the receding hall floor:
   * pews, bookcases, automata cabinets, angel statues or 3D sarcophagi, darkened
   * toward the fog so the crisp play layer stays dominant, each grounded by a
   * contact shadow. Deterministic per bay; never in front of set-piece bays or
   * within reach of doorways and shrines.
   */
  drawMidProps3D(ctx, camX, camY, r, roomIndex, bStart, bEnd, floorRow, floorY) {
    const set = MID_PROPS[this.stageTheme] || MID_PROPS[this.themeKey];
    if (!set) return;
    const A = this.assets;
    const fog = this.pal.fog;
    const tint = `rgba(${fog[0]}, ${fog[1]}, ${fog[2]}, 0.54)`;
    for (let bi = bStart; bi <= bEnd; bi++) {
      const h = hash32(bi + 17, this.level.cols);
      if ((h & 7) >= 5) continue;
      const kind = this.bayKind(r, roomIndex, bi, floorRow, false).kind;
      if (kind === 'stair' || kind === 'orrery' || kind === 'corridor' || kind === 'mural_left' || kind === 'mural_right') continue;
      const midX = (bi + 0.5) * BAY_W;
      const side = (bi & 1) ? -1 : 1;
      const wx = midX + side * (42 + ((h >>> 3) & 31));
      const z = 88 + ((h >>> 9) & 15);
      // Stand on the level the hunter walks on in front of the prop.
      const row = this.bayFooting(r, wx, floorRow, 40);
      if (row < 0) continue;
      const fy = row * TILE;
      const p = project3D(wx, fy, z, camX, camY);
      if (p.x < -60 || p.x > W + 60) continue;
      if (set === 'sarcophagus') {
        this.drawSarcophagus3D(ctx, camX, camY, wx, fy, z, h);
        continue;
      }
      const [sheet, frame] = set[(h >>> 14) % set.length];
      const f = A.frame(sheet, frame);
      if (!f) continue;
      ctx.fillStyle = 'rgba(2, 2, 8, 0.38)';
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - 1, f.w * p.s * 0.46, Math.max(2, 3.5 * p.s), 0, 0, Math.PI * 2);
      ctx.fill();
      A.draw(ctx, sheet, frame, p.x, p.y, ((h >>> 20) & 1) === 1, 1, p.s, tint);
    }
  }

  /** Texture-mapped 3D stone sarcophagus with a raised lid and carved effigy ridge. */
  drawSarcophagus3D(ctx, camX, camY, wx, floorY, z, h) {
    const w = 64 + (h & 15), d = 30;
    this.drawBox3D(ctx, camX, camY, wx - w / 2, floorY - 24, z, w, 24, d, 'crypt_stone', { bright: 0.72 });
    this.drawBox3D(ctx, camX, camY, wx - w / 2 - 3, floorY - 30, z - 2, w + 6, 6, d + 4, 'crypt_stone', { bright: 0.82 });
    this.drawBox3D(ctx, camX, camY, wx - 6, floorY - 36, z + 4, 12, 6, d - 8, 'crypt_stone', { bright: 0.66 });
  }

  /**
   * Grand 3D staircase set-piece: a texture-mapped flight rising away from the
   * play plane to a stone landing and a circular-arch doorway in the far wall,
   * with a crimson runner in carpeted halls (no handrails or balusters).
   */
  drawGrandStair3D(ctx, camX, camY, cx, floorY, zWall, time) {
    const pal = this.pal;
    const stepKey = pal.carpet ? 'marble' : this.trimStoneKey();
    const trimKey = this.trimStoneKey();
    const n = 8, rise = 11, run = 15, halfW = 68;
    const zTop = zWall - 12;
    const z0 = zTop - n * run;
    const landingY = floorY - (n + 1) * rise;
    const pL = project3D(cx - halfW, floorY, z0, camX, camY), pR = project3D(cx + halfW, floorY, z0, camX, camY);
    if (pR.x < -40 || pL.x > W + 40) return;

    // The doorway the flight climbs into, then the landing tucked under its threshold.
    this.drawCorridorBay3D(ctx, camX, camY, cx - 44, cx + 44, landingY, landingY - 112, zWall, 99, time);
    this.drawBox3D(ctx, camX, camY, cx - halfW - 10, landingY, zTop, halfW * 2 + 20, rise, zWall - zTop + 28, trimKey);

    const carpetTex = pal.carpet ? this.tex('carpet') : null;
    const cShade = shadeOverlay32([0, -0.85, -0.5], pal.fog, 0.30, 0.96);
    const proj = (px, py, pz) => project3D(px, py, pz, camX, camY);
    for (let k = n - 1; k >= 0; k--) {
      const z = z0 + k * run;
      const y = floorY - (k + 1) * rise;
      this.drawBox3D(ctx, camX, camY, cx - halfW, y, z, halfW * 2, rise, run + 0.5, stepKey);
      if (carpetTex) {
        // Runner over tread and riser
        texQuad(ctx, carpetTex, proj(cx - 22, y, z + run), proj(cx + 22, y, z + run), proj(cx + 22, y, z), proj(cx - 22, y, z),
          cx - 22, 0, cx + 22, 0, cx + 22, 32, cx - 22, 32, cShade);
        texQuad(ctx, carpetTex, proj(cx - 22, y, z), proj(cx + 22, y, z), proj(cx + 22, y + rise, z), proj(cx - 22, y + rise, z),
          cx - 22, 4, cx + 22, 4, cx + 22, 28, cx - 22, 28, shadeOverlay32([0, -0.15, -1], pal.fog, 0.30, 0.9));
      }
    }
    if (carpetTex) {
      texQuad(ctx, carpetTex, proj(cx - 22, landingY, zWall + 4), proj(cx + 22, landingY, zWall + 4), proj(cx + 22, landingY, zTop), proj(cx - 22, landingY, zTop),
        cx - 22, 0, cx + 22, 0, cx + 22, 32, cx - 22, 32, cShade);
    }
  }

  /**
   * Brass orrery landmark: a carved pedestal carrying three tilted armillary
   * rings that turn about the axis at different rates, each with an orbiting
   * planet, around a gilded sun. Segments are depth-sorted around the sun.
   */
  drawOrrery3D(ctx, camX, camY, wx, floorY, z, time) {
    const c = project3D(wx, floorY, z, camX, camY);
    if (c.x < -120 || c.x > W + 120) return;
    this.drawBox3D(ctx, camX, camY, wx - 26, floorY - 4, z - 16, 52, 4, 38, 'brass_rim');
    this.drawBox3D(ctx, camX, camY, wx - 16, floorY - 52, z - 10, 32, 48, 26, 'wood_carved');
    this.drawBox3D(ctx, camX, camY, wx - 22, floorY - 56, z - 14, 44, 4, 34, 'brass_rim');
    const cy = floorY - 56 - 62;
    const centre = project3D(wx, cy, z, camX, camY);
    const s = centre.s;

    const rings = [
      { r: 26, tilt: 0.42, speed: 0.55, col: [226, 182, 98] },
      { r: 40, tilt: -0.62, speed: -0.32, col: [206, 164, 86] },
      { r: 56, tilt: 0.18, speed: 0.20, col: [190, 150, 78] },
    ];
    const segs = 28;
    const back = [], front = [];
    for (let ri = 0; ri < rings.length; ri++) {
      const ring = rings[ri];
      const ct = Math.cos(ring.tilt), st = Math.sin(ring.tilt);
      const rot = time * ring.speed + ri * 1.3;
      let prev = null;
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2 + rot;
        const lz = Math.sin(a) * ring.r;
        const p = project3D(wx + Math.cos(a) * ring.r, cy - st * lz, z + ct * lz, camX, camY);
        if (prev) {
          const depth = (prev.d + ct * lz) * 0.5;
          (depth > 0 ? back : front).push({ a: prev, b: p, depth, col: ring.col });
        }
        prev = p;
        prev.d = ct * lz;
      }
      const pa = rot * 1.7 + ri * 2.1;
      const plz = Math.sin(pa) * ring.r;
      const pp = project3D(wx + Math.cos(pa) * ring.r, cy - st * plz, z + ct * plz, camX, camY);
      const pdepth = ct * plz;
      (pdepth > 0 ? back : front).push({ planet: pp, depth: pdepth, r: (2.6 + ri * 1.1) * s, col: ring.col });
    }
    const drawList = (list) => {
      list.sort((u, v) => v.depth - u.depth);
      for (const item of list) {
        if (item.planet) {
          const pr = Math.max(1.5, item.r);
          const g = ctx.createRadialGradient(item.planet.x - pr * 0.35, item.planet.y - pr * 0.35, 0.5, item.planet.x, item.planet.y, pr);
          g.addColorStop(0, '#f4e4b4');
          g.addColorStop(0.55, `rgb(${item.col[0]}, ${item.col[1]}, ${item.col[2]})`);
          g.addColorStop(1, '#3a2a14');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(item.planet.x, item.planet.y, pr, 0, Math.PI * 2); ctx.fill();
          continue;
        }
        const k = 0.52 + 0.48 * clamp01(0.5 - item.depth / 120);
        ctx.strokeStyle = `rgb(${Math.round(item.col[0] * k)}, ${Math.round(item.col[1] * k)}, ${Math.round(item.col[2] * k)})`;
        ctx.lineWidth = Math.max(1, Math.round(3.2 * s * (item.depth > 0 ? 0.8 : 1.1)));
        ctx.beginPath(); ctx.moveTo(item.a.x, item.a.y); ctx.lineTo(item.b.x, item.b.y); ctx.stroke();
      }
    };
    drawList(back);
    // Axis rod and the gilded sun with its warm glow
    const axTop = project3D(wx, cy - 72, z, camX, camY), axBot = project3D(wx, floorY - 56, z, camX, camY);
    ctx.strokeStyle = '#8a6a34';
    ctx.lineWidth = Math.max(1, Math.round(2 * s));
    ctx.beginPath(); ctx.moveTo(axBot.x, axBot.y); ctx.lineTo(axTop.x, axTop.y); ctx.stroke();
    const glow = getGlowCanvas('amber');
    if (glow) {
      const gr = 28 * s;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5 + 0.08 * Math.sin(time * 2.1);
      ctx.drawImage(glow, centre.x - gr, centre.y - gr, gr * 2, gr * 2);
      ctx.restore();
    }
    const sg = ctx.createRadialGradient(centre.x - 2 * s, centre.y - 2 * s, 1, centre.x, centre.y, 8 * s);
    sg.addColorStop(0, '#fff2c0'); sg.addColorStop(0.6, '#e8b24a'); sg.addColorStop(1, '#7a4a12');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(centre.x, centre.y, 8 * s, 0, Math.PI * 2); ctx.fill();
    drawList(front);
  }

  /**
   * High-polygon texture-mapped 3D Gothic family mausoleums with stepped plinths,
   * corner buttresses, projecting pedimented portals, gabled slate roofs, lit
   * lancets, and flanking 3D obelisk spires on the moor behind the cemetery fence.
   */
  drawMausoleums3D(ctx, camX, camY, time, maxCol) {
    const lv = this.level;
    const spacing = 22, phase = 12;
    const roofTex = this.tex('slate_roof');
    const stoneTex = this.tex('keep_stone');
    const trimTex = this.tex('stone_trim');
    if (!roofTex || !stoneTex) return;
    const txLo = Math.max(phase, Math.floor((camX - 280) / TILE));
    const txHi = Math.min(maxCol - 12, Math.ceil((camX + W + 280) / TILE));
    const eyeWorldX = camX + EYE_X;
    for (let tx = Math.ceil((txLo - phase) / spacing) * spacing + phase; tx <= txHi; tx += spacing) {
      const r = lv.groundRow(tx);
      if (r < 0) continue;
      const wx = tx * TILE + 16, wy = r * TILE;
      if (Array.isArray(lv.stairs) && lv.stairs.some((s) => !s.passThrough && wx >= s.minX - 48 && wx <= s.maxX + 48)) continue;
      if (this.landmarkXs.some((lx) => Math.abs(lx - wx) < 170)) continue;
      const z = 110 + ((tx * 7) % 3) * 14;
      const w = 62, h = 50, d = 52;
      const fog = this.pal.fog;
      const fogAmt = clamp01((z - 15) / 360) * 0.54;

      // Stepped plinth + main tomb body + 2-stage corner Gothic buttresses
      this.drawBox3D(ctx, camX, camY, wx - w / 2 - 5, wy - 8, z - 4, w + 10, 8, d + 8, 'stone_trim', { uFit: (w + 10) * 2, vFit: 18, bright: 0.72 });
      this.drawBox3D(ctx, camX, camY, wx - w / 2, wy - h, z, w, h - 8, d, 'keep_stone', { uFit: w * 1.8, vFit: (h - 8) * 1.8, bright: 0.76 });
      for (const side of [-1, 1]) {
        const bx = side < 0 ? (wx - w / 2 - 7) : (wx + w / 2 - 1);
        this.drawBox3D(ctx, camX, camY, bx, wy - h + 8, z - 3, 8, h - 16, 12, 'stone_trim', { uFit: 18, vFit: (h - 16) * 2, bright: 0.78 });
        this.drawBox3D(ctx, camX, camY, bx - 1, wy - h - 6, z - 2, 10, 14, 10, 'stone_trim', { uFit: 20, vFit: 28, bright: 0.82 });
      }

      // Gabled slate roof: far-facing slope first
      const ridgeY = wy - h - 26;
      const slope = (dir) => {
        const ex = wx + dir * (w / 2 + 5);
        const a = project3D(ex, wy - h + 2, z - 4, camX, camY);
        const b = project3D(wx, ridgeY, z - 4, camX, camY);
        const c = project3D(wx, ridgeY, z + d + 4, camX, camY);
        const e = project3D(ex, wy - h + 2, z + d + 4, camX, camY);
        const sh = shadeOverlay32([dir * 0.7, -0.72, 0], fog, fogAmt, 0.78);
        texQuad(ctx, roofTex, a, b, c, e, 0, 0, 30, 0, 30, d + 8, 0, d + 8, sh);
      };
      const nearSide = wx < eyeWorldX ? 1 : -1;
      slope(-nearSide);
      slope(nearSide);

      // Front stone gable + projecting 3D pedimented portal porch
      const g0 = project3D(wx - w / 2, wy - h, z - 0.5, camX, camY);
      const g1 = project3D(wx, ridgeY + 2, z - 0.5, camX, camY);
      const g2 = project3D(wx + w / 2, wy - h, z - 0.5, camX, camY);
      texTri(ctx, stoneTex, g0, g1, g2, 0, 48, w * 0.9, 0, w * 1.8, 48, shadeOverlay32([0, -0.15, -1], fog, fogAmt, 0.78), 0.45);
      this.drawBox3D(ctx, camX, camY, wx - 14, wy - 34, z - 8, 28, 34, 8, 'stone_trim', { uFit: 56, vFit: 68, bright: 0.80 });
      if (trimTex) {
        const pL = project3D(wx - 16, wy - 34, z - 8.5, camX, camY);
        const pA = project3D(wx, wy - 45, z - 8.5, camX, camY);
        const pR = project3D(wx + 16, wy - 34, z - 8.5, camX, camY);
        texTri(ctx, trimTex, pL, pA, pR, 0, 24, 32, 0, 64, 24, shadeOverlay32([0, -0.35, -0.92], fog, fogAmt, 0.82), 0.45);
      }

      const dr = project3D(wx - 7, wy - 28, z - 9, camX, camY);
      ctx.fillStyle = '#07060e';
      ctx.fillRect(Math.round(dr.x), Math.round(dr.y), Math.max(2, Math.round(14 * dr.s)), Math.max(3, Math.round(28 * dr.s)));
      const ln = project3D(wx - 2, wy - h - 10, z - 1, camX, camY);
      const pulse = 0.55 + 0.3 * Math.sin(time * 2.7 + tx);
      ctx.fillStyle = `rgba(255, 190, 110, ${pulse.toFixed(2)})`;
      ctx.fillRect(Math.round(ln.x), Math.round(ln.y), Math.max(1, Math.round(4 * ln.s)), Math.max(2, Math.round(9 * ln.s)));
      // Cross finial on the ridge
      const cr = project3D(wx, ridgeY - 12, z - 2, camX, camY);
      ctx.fillStyle = '#2b2d44';
      ctx.fillRect(Math.round(cr.x - 1), Math.round(cr.y), 2, Math.max(4, Math.round(12 * cr.s)));
      ctx.fillRect(Math.round(cr.x - 3), Math.round(cr.y + 3 * cr.s), 6, 2);

      // Flanking 3D stepped obelisk monument on alternating tombs
      if ((tx & 1) === 0 && trimTex) {
        const ox = wx + ((tx & 2) ? 56 : -56);
        const oz = z - 8;
        this.drawBox3D(ctx, camX, camY, ox - 9, wy - 12, oz - 2, 18, 12, 18, 'stone_trim', { bright: 0.74 });
        this.drawBox3D(ctx, camX, camY, ox - 6, wy - 54, oz, 12, 42, 12, 'keep_stone', { bright: 0.78 });
        const oApex = project3D(ox, wy - 74, oz + 6, camX, camY);
        const oFL = project3D(ox - 6.5, wy - 54, oz - 0.5, camX, camY);
        const oFR = project3D(ox + 6.5, wy - 54, oz - 0.5, camX, camY);
        const oBL = project3D(ox - 6.5, wy - 54, oz + 12.5, camX, camY);
        const oBR = project3D(ox + 6.5, wy - 54, oz + 12.5, camX, camY);
        if (oFL.x > oBL.x + 0.25) {
          texTri(ctx, trimTex, oBL, oFL, oApex, 0, 20, 12, 20, 6, 0, shadeOverlay32([-0.8, -0.5, -0.2], fog, fogAmt, 0.76), 0.45);
        } else if (oBR.x > oFR.x + 0.25) {
          texTri(ctx, trimTex, oFR, oBR, oApex, 0, 20, 12, 20, 6, 0, shadeOverlay32([0.8, -0.5, -0.2], fog, fogAmt, 0.76), 0.45);
        }
        texTri(ctx, trimTex, oFL, oFR, oApex, 0, 20, 12, 20, 6, 0, shadeOverlay32([0, -0.5, -0.85], fog, fogAmt, 0.82), 0.45);
      }
    }
  }

  // ============================================ CLOCK TOWER 3D CYLINDER & GEARS
  drawClockShaft3D(ctx, r, camX, camY, rx, ry, rw, rh, time) {
    const key = (r.wall || 'clockwall') + '|cyl';
    const wall = this.assets.img(r.wall || 'clockwall');
    if (!wall) return;
    if (!this._cyl) this._cyl = {};
    if (!this._cyl[key]) {
      const c = document.createElement('canvas');
      c.width = wall.width; c.height = wall.height * 4;
      const g = c.getContext('2d');
      for (let i = 0; i < 4; i++) g.drawImage(wall, 0, i * wall.height);
      this._cyl[key] = c;
    }
    const tex = this._cyl[key];
    const radius = W * 0.68;
    const sCyl = FOCAL / (FOCAL + 160);
    // Bricks are stationary in world space (zero self-rotation!) and locked in both
    // horizontal and vertical scale/phase to the iron ring-girders at z = 160.
    const rot = (camX - EYE_X) * sCyl;
    const vy = mod(camY + EYE_Y * (1 - 1 / sCyl), wall.height);
    const srcH = Math.min(wall.height * 3, Math.ceil(H / sCyl));
    // 2px screen columns, each sampling the exact texel span it covers on the
    // cylinder (1:1 at the centre, compressing toward the rim) so the wall never
    // magnifies into chunky 4px stripes.
    const step = 2;

    ctx.save();
    ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip();
    ctx.fillStyle = '#05040a';
    ctx.fillRect(rx, ry, rw, rh);

    const texU = (sx) => {
      const nx = Math.max(-0.999, Math.min(0.999, (sx - EYE_X) / radius));
      return Math.asin(nx) * radius + rot;
    };
    for (let sx = 0; sx < W; sx += step) {
      const nx = (sx + step * 0.5 - EYE_X) / radius;
      if (Math.abs(nx) >= 1) continue;
      const u0 = texU(sx), u1 = texU(sx + step);
      const span = Math.max(1, Math.min(8, u1 - u0));
      const texX = mod(u0, tex.width);
      const sw = Math.min(span, tex.width - texX);
      ctx.drawImage(tex, texX, vy, sw, srcH, sx, 0, step, H);
    }

    // Single cached horizontal cylindrical lighting gradient instead of 320 fillRects
    if (!this._cylShade) {
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0.00, 'rgba(5, 4, 12, 0.96)');
      g.addColorStop(0.16, 'rgba(5, 4, 12, 0.70)');
      g.addColorStop(0.50, 'rgba(5, 4, 12, 0.46)');
      g.addColorStop(0.84, 'rgba(5, 4, 12, 0.70)');
      g.addColorStop(1.00, 'rgba(5, 4, 12, 0.96)');
      this._cylShade = g;
    }
    ctx.fillStyle = this._cylShade;
    ctx.fillRect(0, 0, W, H);

    // Texture-mapped 3D Curved Iron Ring-Girders locked to the exact same sCyl depth!
    const ironTex = this.tex('iron_rivet');
    const ringSpacing = 224;
    const wyMin = camY + EYE_Y - (EYE_Y + 90) / sCyl;
    const wyMax = camY + EYE_Y + (H - EYE_Y + 90) / sCyl;
    const wyStart = Math.floor(wyMin / ringSpacing) * ringSpacing;
    const segs = 9;
    for (let wy = wyStart; wy <= wyMax; wy += ringSpacing) {
      const sy = EYE_Y + (wy - camY - EYE_Y) * sCyl;
      const tilt = (sy - EYE_Y) * 0.14;
      for (let i = 0; i < segs; i++) {
        const a0 = -1.30 + (i / segs) * 2.60;
        const a1 = -1.30 + ((i + 1) / segs) * 2.60;
        const x0 = EYE_X + Math.sin(a0) * radius * 0.98;
        const x1 = EYE_X + Math.sin(a1) * radius * 0.98;
        const y0 = sy + Math.cos(a0) * tilt;
        const y1 = sy + Math.cos(a1) * tilt;
        const facing = Math.cos((a0 + a1) * 0.5);
        const u0 = a0 * radius + rot, u1 = a1 * radius + rot;
        const sh = shadeOverlay32([Math.sin((a0 + a1) * 0.5) * 0.6, -0.2, -facing], this.pal.fog, 0.62 - facing * 0.30, 0.76);
        texQuad(
          ctx, ironTex,
          { x: x0, y: y0 - 5 }, { x: x1, y: y1 - 5 },
          { x: x1, y: y1 + 5 }, { x: x0, y: y0 + 5 },
          u0, 0, u1, 0, u1, 16, u0, 16, sh,
        );
      }
    }

    // Background 3D Structural Truss Beams, Diagonal Lattice Struts & Tilted 3D Bevel Gears!
    const shaftBay = 280;
    const bi0 = Math.floor((camY - 220) / shaftBay);
    const bi1 = Math.ceil((camY + H + 220) / shaftBay);
    const braceShade = shadeOverlay32([0, -0.25, -0.96], this.pal.fog, 0.36, 0.74);
    for (let bi = bi0; bi <= bi1; bi++) {
      const by = bi * shaftBay + 120;
      const cx = ((Math.abs(bi) * 193) % Math.max(320, this.level.width - 320)) + 160;
      // Diagonal 3D riveted iron X-gusset struts anchoring the main cross-girder
      if (ironTex) {
        for (const side of [-1, 1]) {
          const a0 = project3D(cx + side * 36, by + 6, 152, camX, camY);
          const b0 = project3D(cx + side * 196, by + 118, 158, camX, camY);
          const b1 = project3D(cx + side * 196, by + 128, 158, camX, camY);
          const a1 = project3D(cx + side * 36, by + 16, 152, camX, camY);
          texQuad(ctx, ironTex, a0, b0, b1, a1, 0, 0, 160, 0, 160, 12, 0, 12, braceShade);
        }
      }
      this.drawBox3D(ctx, camX, camY, cx - 220, by - 8, 145, 440, 18, 24, 'iron_truss', { bright: 0.74 });
      this.drawBox3D(ctx, camX, camY, cx - 28, by - 16, 140, 56, 34, 32, 'brass_rim', { bright: 0.76 });
      this.drawGear3D(ctx, camX, camY, cx, by - 14, 130, {
        r: 58, teeth: 12, thick: 16, speed: (bi & 1) ? 0.65 : -0.65,
        tiltX: 1.18, tiltY: 0.15, brass: true, bright: 0.76,
      }, time);
      if ((bi & 1) === 0) {
        this.drawGear3D(ctx, camX, camY, cx + 88, by - 36, 150, {
          r: 34, teeth: 9, thick: 12, speed: -0.95,
          tiltX: 0.22, tiltY: -0.35, brass: false, bright: 0.72,
        }, time);
      }
      this.drawBox3D(ctx, camX, camY, cx - 6, by - 150, 126, 12, 280, 12, 'iron_rivet', { bright: 0.74 });
    }
    ctx.restore();
  }

  /**
   * True 3D extruded & texture-mapped polygonal cogwheel:
   * - Fast-paths front-on gears (`!tiltX && !tiltY`) using pre-baked pixel-art
   *   spoked/toothed wheel caps + backface-culled 3D extruded metal tooth flanks.
   * - Full 3D perspective polygon path with camera-space backface culling when tilted.
   */
  drawGear3D(ctx, camX, camY, wx, wy, z, opts, time) {
    const pCenter = project3D(wx, wy, z, camX, camY);
    const rad = opts.r || 42;
    if (pCenter.x < -rad * 2 || pCenter.x > W + rad * 2 || pCenter.y < -rad * 2 || pCenter.y > H + rad * 2) return;

    const teeth = opts.teeth || Math.max(8, Math.round(rad / 4.5));
    const thick = opts.thick || Math.max(12, Math.round(rad * 0.34));
    const ang0 = time * (opts.speed || 0.45) + (opts.phase || 0);
    const tiltX = opts.tiltX || 0;
    const tiltY = opts.tiltY || 0;
    const brass = opts.brass !== false;
    const bright = opts.bright != null ? opts.bright : 1;
    const rimTex = this.tex(brass ? 'brass_rim' : 'iron_rivet');
    const fog = this.pal.fog;
    const fogBase = clamp01(z / 380) * 0.62;
    const eyeWX = camX + EYE_X, eyeWY = camY + EYE_Y, eyeWZ = -FOCAL;

    const rRoot = rad * 0.84, rTip = rad * 1.04, rInner = rad * 0.56, rHub = rad * 0.25;
    const step = (Math.PI * 2) / teeth;

    const profile = [];
    for (let i = 0; i < teeth; i++) {
      const a = i * step;
      profile.push(
        [Math.cos(a) * rRoot, Math.sin(a) * rRoot],
        [Math.cos(a + step * 0.16) * rTip, Math.sin(a + step * 0.16) * rTip],
        [Math.cos(a + step * 0.50) * rTip, Math.sin(a + step * 0.50) * rTip],
        [Math.cos(a + step * 0.66) * rRoot, Math.sin(a + step * 0.66) * rRoot],
      );
    }

    const xform = (lx, ly, lz) => {
      const ca = Math.cos(ang0), sa = Math.sin(ang0);
      let x = lx * ca - ly * sa, y = lx * sa + ly * ca, zz = lz;
      if (tiltX) {
        const cx = Math.cos(tiltX), sx = Math.sin(tiltX);
        const ny = y * cx - zz * sx, nz = y * sx + zz * cx;
        y = ny; zz = nz;
      }
      if (tiltY) {
        const cy = Math.cos(tiltY), sy = Math.sin(tiltY);
        const nx = x * cy + zz * sy, nz = -x * sy + zz * cy;
        x = nx; zz = nz;
      }
      return { wx: wx + x, wy: wy + y, wz: z + zz };
    };
    const pr = (v) => project3D(v.wx, v.wy, v.wz, camX, camY);

    // Axle plunging into depth behind the gear
    this.drawBox3D(ctx, camX, camY, wx - 5, wy - 5, z + thick * 0.5, 10, 10, 64, 'iron_rivet', { bright });

    const front = profile.map(([px, py]) => xform(px, py, -thick * 0.5));
    const back = profile.map(([px, py]) => xform(px, py, thick * 0.5));

    // Build ONLY camera-visible extruded flank quads (camera-space backface culled!)
    const quads = [];
    const n = profile.length;
    let perim = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const segLen = Math.hypot(profile[j][0] - profile[i][0], profile[j][1] - profile[i][1]);
      const f0 = front[i], f1 = front[j], b1 = back[j], b0 = back[i];
      const nrm = quadNormal(f0, f1, b1);
      if (nrm[0] * (eyeWX - f0.wx) + nrm[1] * (eyeWY - f0.wy) + nrm[2] * (eyeWZ - f0.wz) > 0) {
        quads.push({ f0, f1, b1, b0, nrm, u0: perim, u1: perim + segLen, mz: (f0.wz + f1.wz + b1.wz + b0.wz) * 0.25 });
      }
      perim += segLen;
    }
    for (let i = 0; i < teeth; i++) {
      const a0 = i * step, a1 = (i + 1) * step;
      const ix0 = Math.cos(a0) * rInner, iy0 = Math.sin(a0) * rInner;
      const ix1 = Math.cos(a1) * rInner, iy1 = Math.sin(a1) * rInner;
      const f0 = xform(ix1, iy1, -thick * 0.5), f1 = xform(ix0, iy0, -thick * 0.5);
      const b1 = xform(ix0, iy0, thick * 0.5), b0 = xform(ix1, iy1, thick * 0.5);
      const nrm = quadNormal(f0, f1, b1);
      if (nrm[0] * (eyeWX - f0.wx) + nrm[1] * (eyeWY - f0.wy) + nrm[2] * (eyeWZ - f0.wz) > 0) {
        const segLen = Math.hypot(ix1 - ix0, iy1 - iy0);
        quads.push({ f0, f1, b1, b0, nrm, u0: i * segLen, u1: (i + 1) * segLen, mz: (f0.wz + f1.wz + b1.wz + b0.wz) * 0.25 });
      }
    }
    quads.sort((a, b) => b.mz - a.mz);

    // Fast path for front-on 3D cogwheels: pre-baked spoked/toothed 2D wheel caps + 3D extruded flanks!
    if (!tiltX && !tiltY && this.bank) {
      const darkCap = bright < 0.99;
      const backWheel = this.bank.gearWheel(brass, teeth, true);
      const frontWheel = this.bank.gearWheel(brass, teeth, darkCap);
      const pBack = project3D(wx, wy, z + thick * 0.5, camX, camY);
      const pFront = project3D(wx, wy, z - thick * 0.5, camX, camY);
      const hb = (96 / 88) * rTip * pBack.s;
      const hf = (96 / 88) * rTip * pFront.s;

      ctx.save();
      ctx.translate(pBack.x, pBack.y);
      ctx.rotate(ang0);
      ctx.drawImage(backWheel, -hb, -hb, hb * 2, hb * 2);
      ctx.restore();

      for (const q of quads) {
        const sh = shadeOverlay32(q.nrm, fog, clamp01(q.mz / 380) * 0.65, 0.88 * bright);
        texQuad(ctx, rimTex, pr(q.f0), pr(q.f1), pr(q.b1), pr(q.b0), q.u0, 0, q.u1, 0, q.u1, thick, q.u0, thick, sh);
      }

      ctx.save();
      ctx.translate(pFront.x, pFront.y);
      ctx.rotate(ang0);
      ctx.drawImage(frontWheel, -hf, -hf, hf * 2, hf * 2);
      ctx.restore();
      return;
    }

    const capTex = this.tex(brass ? 'brass_gear' : 'iron_gear');
    const uvS = 116 / Math.max(12, rTip);
    const uvU = (lx) => 128 + lx * uvS;
    const uvV = (ly) => 128 + ly * uvS;
    const nrmFront = xform(0, 0, -1), org = xform(0, 0, 0);
    const frontFacing = (nrmFront.wz - org.wz) < 0;

    const drawRingCap = (capZ, isNear) => {
      const capNormal = norm3(
        (nrmFront.wx - org.wx) * (isNear === frontFacing ? 1 : -1),
        (nrmFront.wy - org.wy) * (isNear === frontFacing ? 1 : -1) - 0.25,
        (nrmFront.wz - org.wz) * (isNear === frontFacing ? 1 : -1),
      );
      const sh = shadeOverlay32(capNormal, fog, fogBase, (isNear ? 1.0 : 0.62) * bright);
      const pt = (lx, ly, dz = 0) => pr(xform(lx, ly, capZ + dz));

      const wSp = rad * 0.10;
      for (let s = 0; s < 4; s++) {
        const a = (s / 4) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const nx = -sa * wSp, ny = ca * wSp;
        const lx0 = nx, ly0 = ny, lx1 = -nx, ly1 = -ny;
        const lx2 = ca * (rInner + 2) - nx, ly2 = sa * (rInner + 2) - ny;
        const lx3 = ca * (rInner + 2) + nx, ly3 = sa * (rInner + 2) + ny;
        texQuad(
          ctx, capTex,
          pt(lx0, ly0), pt(lx1, ly1), pt(lx2, ly2), pt(lx3, ly3),
          uvU(lx0), uvV(ly0), uvU(lx1), uvV(ly1), uvU(lx2), uvV(ly2), uvU(lx3), uvV(ly3), sh,
        );
      }

      for (let i = 0; i < teeth; i++) {
        const a0 = i * step, aMid = a0 + step * 0.50, a1 = (i + 1) * step;
        const base = i * 4;
        const [p0x, p0y] = profile[base], [p1x, p1y] = profile[base + 1];
        const [p2x, p2y] = profile[base + 2], [p3x, p3y] = profile[base + 3];
        const [p4x, p4y] = profile[(base + 4) % n];
        const ir0x = Math.cos(a0) * rInner, ir0y = Math.sin(a0) * rInner;
        const irMx = Math.cos(aMid) * rInner, irMy = Math.sin(aMid) * rInner;
        const ir1x = Math.cos(a1) * rInner, ir1y = Math.sin(a1) * rInner;

        const sp0 = pt(p0x, p0y), sp1 = pt(p1x, p1y), sp2 = pt(p2x, p2y), sp3 = pt(p3x, p3y), sp4 = pt(p4x, p4y);
        const si0 = pt(ir0x, ir0y), siM = pt(irMx, irMy), si1 = pt(ir1x, ir1y);

        texQuad(ctx, capTex, si0, sp0, sp3, siM,
          uvU(ir0x), uvV(ir0y), uvU(p0x), uvV(p0y), uvU(p3x), uvV(p3y), uvU(irMx), uvV(irMy), sh);
        texQuad(ctx, capTex, siM, sp3, sp4, si1,
          uvU(irMx), uvV(irMy), uvU(p3x), uvV(p3y), uvU(p4x), uvV(p4y), uvU(ir1x), uvV(ir1y), sh);
        texQuad(ctx, capTex, sp0, sp1, sp2, sp3,
          uvU(p0x), uvV(p0y), uvU(p1x), uvV(p1y), uvU(p2x), uvV(p2y), uvU(p3x), uvV(p3y), sh);
      }

      const hubDz = isNear ? (frontFacing ? -2 : 2) : 0;
      const hubSh = shadeOverlay32(capNormal, fog, fogBase * 0.9, (isNear ? 1.1 : 0.7) * bright);
      const hc = pt(0, 0, hubDz);
      for (let h = 0; h < 8; h++) {
        const ha0 = (h / 8) * Math.PI * 2, ha1 = ((h + 1) / 8) * Math.PI * 2;
        const hx0 = Math.cos(ha0) * rHub, hy0 = Math.sin(ha0) * rHub;
        const hx1 = Math.cos(ha1) * rHub, hy1 = Math.sin(ha1) * rHub;
        texTri(ctx, capTex, hc, pt(hx0, hy0, hubDz), pt(hx1, hy1, hubDz),
          128, 128, uvU(hx0), uvV(hy0), uvU(hx1), uvV(hy1), hubSh, 0.45);
      }
    };

    // Tilted gears only need their camera-facing cap drawn once (back cap is occluded by solid hub/rim)
    drawRingCap(frontFacing ? -thick * 0.5 : thick * 0.5, true);
    for (const q of quads) {
      const sh = shadeOverlay32(q.nrm, fog, clamp01(q.mz / 380) * 0.65, 0.88 * bright);
      texQuad(ctx, rimTex, pr(q.f0), pr(q.f1), pr(q.b1), pr(q.b0), q.u0, 0, q.u1, 0, q.u1, thick, q.u0, thick, sh);
    }
  }

  // ============================================ BOSS ARENA 3D CENTERPIECES
  drawBossCenterpiece3D(ctx, cam, time) {
    const b = this.data.boss;
    if (!b || !b.arena) return;
    const camX = cam.rx, camY = cam.ry;
    const cx = (b.arena.x0 + b.arena.x1) * 0.5;
    const floorY = b.arena.floorY;
    if (cx - camX < -380 || cx - camX > W + 380) return;

    const type = b.type || 'reaper';
    if (this.stageTheme === 'alchemy') {
      this.drawAlchemyReactor3D(ctx, camX, camY, cx, floorY, time);
    } else if (this.stageTheme === 'ballroom') {
      this.drawBallroomGallery3D(ctx, camX, camY, cx, floorY, time);
    } else if (this.stageTheme === 'coliseum') {
      this.drawColiseumTribune3D(ctx, camX, camY, cx, floorY, time);
    } else if (this.stageTheme === 'aqueduct') {
      this.drawAqueductNymphaeum3D(ctx, camX, camY, cx, floorY, time);
    } else if (this.stageTheme === 'skykeep') {
      this.drawSkykeepRotunda3D(ctx, camX, camY, cx, floorY, time);
    } else if (type === 'reaperlord') {
      this.drawAstronomicalClock3D(ctx, camX, camY, cx, floorY - 134, 155, time);
    } else if (type === 'count') {
      this.drawCountThroneApse3D(ctx, camX, camY, cx, floorY, time);
    } else if (type === 'treant') {
      this.drawBriarShrine3D(ctx, camX, camY, cx, floorY, time);
    } else if (type === 'automaton') {
      this.drawAutomataStage3D(ctx, camX, camY, cx, floorY, time);
    } else if (type === 'archivist') {
      this.drawGrandReadingRoom3D(ctx, camX, camY, cx, floorY, time);
    } else if (type === 'archon') {
      this.drawCathedralApse3D(ctx, camX, camY, cx, floorY, time);
    } else if (type === 'greatjack') {
      this.drawMonolithCircle3D(ctx, camX, camY, cx, floorY, time);
    } else if (type === 'devilsanta') {
      this.drawYuleBellTower3D(ctx, camX, camY, cx, floorY, time);
    } else if (type === 'bonecaptain') {
      this.drawRampartBastion3D(ctx, camX, camY, cx, floorY);
    } else if (type === 'gorgon') {
      this.drawPetrifiedTemple3D(ctx, camX, camY, cx, floorY);
    } else if (type === 'cinderqueen') {
      this.drawVolcanicCaldera3D(ctx, camX, camY, cx, floorY, time);
    } else {
      const archTex = this.pal.crypt ? 'crypt_stone' : 'stone_trim';
      this.drawArchSpan3D(ctx, camX, camY, cx - 120, cx + 120, floorY - 150, floorY - 224, 96, 54, archTex);
      this.drawPillar3D(ctx, camX, camY, cx - 120, floorY - 160, floorY, 96, 26);
      this.drawPillar3D(ctx, camX, camY, cx + 120, floorY - 160, floorY, 96, 26);
    }
  }

  /** Alchemy Wing Boss Centerpiece: Grand Alembic Reactor with brass manifold arch, 3D cogwheels & pulsing emerald core. */
  drawAlchemyReactor3D(ctx, camX, camY, cx, floorY, time) {
    this.drawArchSpan3D(ctx, camX, camY, cx - 164, cx + 164, floorY - 178, floorY - 246, 108, 48, 'brass_rim');
    for (const side of [-1, 1]) {
      const tx = cx + side * 168;
      this.drawBox3D(ctx, camX, camY, tx - 20, floorY - 210, 106, 40, 210, 42, 'iron_truss');
      this.drawBox3D(ctx, camX, camY, tx - 28, floorY - 222, 102, 56, 14, 50, 'brass_rim');
      this.drawBox3D(ctx, camX, camY, tx - 28, floorY - 18, 102, 56, 18, 50, 'brass_rim');
    }
    this.drawGear3D(ctx, camX, camY, cx - 96, floorY - 156, 152, { r: 44, speed: 0.52, teeth: 12, bright: 0.78 }, time);
    this.drawGear3D(ctx, camX, camY, cx, floorY - 126, 156, { r: 60, speed: -0.38, teeth: 14, phase: 0.25, bright: 0.78 }, time);
    this.drawGear3D(ctx, camX, camY, cx + 96, floorY - 156, 152, { r: 44, speed: 0.52, teeth: 12, phase: 0.5, bright: 0.78 }, time);
    this.drawBox3D(ctx, camX, camY, cx - 108, floorY - 12, 124, 216, 12, 48, 'iron_rivet', { topTex: 'brass_rim' });
    this.drawBox3D(ctx, camX, camY, cx - 64, floorY - 24, 134, 128, 12, 38, 'brass_rim', { topTex: 'brass_rim' });
    const A = this.assets;
    for (const [dx, frame] of [[-128, 'tesla_coil'], [0, 'athanor'], [128, 'tesla_coil']]) {
      const p = project3D(cx + dx, floorY - (dx === 0 ? 24 : 0), dx === 0 ? 142 : 118, camX, camY);
      A.draw(ctx, 'alchemy_props', frame, p.x, p.y, dx > 0, 1, p.s, 'rgba(6, 8, 18, 0.34)');
    }
    const glow = getGlowCanvas('emerald');
    if (glow) {
      const gp = project3D(cx, floorY - 108, 146, camX, camY);
      const pulse = 0.72 + 0.28 * Math.sin(time * 2.4);
      const r = 92 * gp.s;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.46 * pulse;
      ctx.drawImage(glow, gp.x - r, gp.y - r, r * 2, r * 2);
      ctx.restore();
    }
  }

  /** Ballroom Wing Boss Centerpiece: Imperial Marble Proscenium, elevated Opera Balcony & Gilded Waltz Dais. */
  drawBallroomGallery3D(ctx, camX, camY, cx, floorY, time) {
    this.drawArchSpan3D(ctx, camX, camY, cx - 180, cx + 180, floorY - 208, floorY - 282, 114, 52, 'marble');
    for (const side of [-1, 1]) {
      for (let k = 0; k < 2; k++) {
        const tx = cx + side * (134 + k * 54);
        this.drawPillar3D(ctx, camX, camY, tx, floorY - 224 + k * 14, floorY, 108 + k * 24, 22, 'marble');
      }
    }
    // Elevated 3D imperial opera gallery box
    this.drawBox3D(ctx, camX, camY, cx - 108, floorY - 138, 134, 216, 14, 48, 'marble', { topTex: 'marble', bright: 0.82 });
    this.drawBox3D(ctx, camX, camY, cx - 108, floorY - 164, 132, 216, 6, 10, 'brass_rim', { bright: 0.84 });
    for (let sx = -90; sx <= 90; sx += 36) {
      this.drawBox3D(ctx, camX, camY, cx + sx - 4, floorY - 158, 134, 8, 20, 8, 'marble');
    }
    // Stepped marble & velvet waltz dais
    this.drawBox3D(ctx, camX, camY, cx - 116, floorY - 10, 124, 232, 10, 50, 'marble', { topTex: 'ballroom_carpet' });
    this.drawBox3D(ctx, camX, camY, cx - 72, floorY - 20, 134, 144, 10, 40, 'marble', { topTex: 'ballroom_carpet' });
    const A = this.assets;
    const hp = project3D(cx, floorY - 138, 148, camX, camY);
    A.draw(ctx, 'ballroom_props', 'gilded_mirror', hp.x, hp.y, false, 1, hp.s, 'rgba(8, 6, 18, 0.34)');
    for (const side of [-1, 1]) {
      const bp = project3D(cx + side * 62, floorY - 138, 142, camX, camY);
      A.draw(ctx, 'ballroom_props', 'marble_bust', bp.x, bp.y, side < 0, 1, bp.s, 'rgba(8, 6, 18, 0.34)');
      const cp = project3D(cx + side * 96, floorY - 10, 128, camX, camY);
      A.draw(ctx, 'ballroom_props', 'candelabra', cp.x, cp.y, side < 0, 1, cp.s, 'rgba(8, 6, 18, 0.34)');
    }
    const glow = getGlowCanvas('violet');
    if (glow) {
      const gp = project3D(cx, floorY - 184, 152, camX, camY);
      const pulse = 0.72 + 0.28 * Math.sin(time * 1.5);
      const r = 96 * gp.s;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.42 * pulse;
      ctx.drawImage(glow, gp.x - r, gp.y - r, r * 2, r * 2);
      ctx.restore();
    }
  }

  /** Coliseum Wing Boss Centerpiece: Triple-Arched Travertine Emperor's Tribune & Blazing Arena Braziers. */
  drawColiseumTribune3D(ctx, camX, camY, cx, floorY, time) {
    this.drawArchSpan3D(ctx, camX, camY, cx - 104, cx + 104, floorY - 184, floorY - 256, 112, 54, 'travertine_stone');
    for (const side of [-1, 1]) {
      const sx0 = side < 0 ? cx - 216 : cx + 108;
      const sx1 = side < 0 ? cx - 108 : cx + 216;
      this.drawArchSpan3D(ctx, camX, camY, sx0, sx1, floorY - 148, floorY - 204, 126, 44, 'travertine_stone');
      this.drawPillar3D(ctx, camX, camY, cx + side * 106, floorY - 196, floorY, 106, 24);
      this.drawPillar3D(ctx, camX, camY, cx + side * 214, floorY - 160, floorY, 122, 22);
    }
    // Imperial Tribune podium & brass parapet
    this.drawBox3D(ctx, camX, camY, cx - 84, floorY - 112, 128, 168, 22, 46, 'travertine_stone', { topTex: 'marble' });
    this.drawBox3D(ctx, camX, camY, cx - 88, floorY - 130, 124, 176, 8, 12, 'brass_rim', { bright: 0.82 });
    this.drawBox3D(ctx, camX, camY, cx - 112, floorY - 12, 126, 224, 12, 48, 'stone_trim');
    const A = this.assets;
    for (const side of [-1, 1]) {
      const bp = project3D(cx + side * 72, floorY - 130, 134, camX, camY);
      A.draw(ctx, 'coliseum_props', 'war_standard', bp.x, bp.y, side < 0, 1, bp.s, 'rgba(8, 6, 18, 0.34)');
      const wp = project3D(cx + side * 144, floorY, 122, camX, camY);
      A.draw(ctx, 'coliseum_props', 'trophy_pillar', wp.x, wp.y, side > 0, 1, wp.s, 'rgba(8, 6, 18, 0.34)');
    }
    const glow = getGlowCanvas('amber');
    if (glow) {
      const pulse = 0.78 + 0.22 * Math.sin(time * 4.2);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const side of [-1, 1]) {
        const gp = project3D(cx + side * 106, floorY - 134, 118, camX, camY);
        const r = 64 * gp.s;
        ctx.globalAlpha = 0.44 * pulse;
        ctx.drawImage(glow, gp.x - r, gp.y - r, r * 2, r * 2);
      }
      ctx.restore();
    }
  }

  /** Aqueduct Wing Boss Centerpiece: Sunken Roman Nymphaeum Cascade Vault & Trident Shrine. */
  drawAqueductNymphaeum3D(ctx, camX, camY, cx, floorY, time) {
    this.drawArchSpan3D(ctx, camX, camY, cx - 162, cx + 162, floorY - 186, floorY - 258, 114, 52, 'aqueduct_stone');
    for (const side of [-1, 1]) {
      this.drawPillar3D(ctx, camX, camY, cx + side * 158, floorY - 198, floorY, 110, 24);
      this.drawPillar3D(ctx, camX, camY, cx + side * 98, floorY - 172, floorY, 132, 20);
    }
    // Shimmering WebGL 3D subterranean waterfall veil inside the Nymphaeum apse
    const wTL = project3D(cx - 58, floorY - 182, 154, camX, camY);
    const wTR = project3D(cx + 58, floorY - 182, 154, camX, camY);
    const wBR = project3D(cx + 64, floorY - 12, 148, camX, camY);
    const wBL = project3D(cx - 64, floorY - 12, 148, camX, camY);
    const fxLayers = getFxLayers();
    if (fxLayers && fxLayers.enabled) {
      const wx0 = Math.round(Math.min(wTL.x, wBL.x));
      const wx1 = Math.round(Math.max(wTR.x, wBR.x));
      const wy0 = Math.round(wTL.y);
      const wy1 = Math.round(wBL.y);
      fxLayers.waterfall(ctx, { x: wx0, y: wy0, w: Math.max(8, wx1 - wx0), h: Math.max(8, wy1 - wy0) }, {
        camX, tint: [0.20, 0.74, 0.96], foam: [0.88, 0.98, 1.0], alpha: 0.82, speed: 1.15,
      });
    } else {
      ctx.save();
      ctx.fillStyle = 'rgba(42, 168, 210, 0.34)';
      fillQuad(ctx, wTL, wTR, wBR, wBL);
      for (let i = 0; i < 6; i++) {
        const t = ((i / 6) + time * 0.55) % 1;
        const sy = wTL.y + (wBL.y - wTL.y) * t;
        const sx0 = wTL.x + (wBL.x - wTL.x) * t + 6;
        const sx1 = wTR.x + (wBR.x - wTR.x) * t - 6;
        ctx.fillStyle = `rgba(175, 245, 255, ${(0.36 * (1 - Math.abs(t - 0.5) * 1.4)).toFixed(3)})`;
        ctx.fillRect(sx0, sy, Math.max(4, sx1 - sx0), 3);
      }
      ctx.restore();
    }
    // Stepped mossy basin dais & Oracle shrine props
    this.drawBox3D(ctx, camX, camY, cx - 114, floorY - 12, 124, 228, 12, 50, 'aqueduct_stone');
    this.drawBox3D(ctx, camX, camY, cx - 68, floorY - 24, 134, 136, 12, 38, 'stone_trim');
    const A = this.assets;
    const tp = project3D(cx, floorY - 24, 140, camX, camY);
    A.draw(ctx, 'aqueduct_props', 'sluice_wheel', tp.x, tp.y, false, 1, tp.s);
    for (const side of [-1, 1]) {
      const lp = project3D(cx + side * 92, floorY - 96, 126, camX, camY);
      A.draw(ctx, 'aqueduct_props', 'water_spout', lp.x, lp.y, side < 0, 1, lp.s);
    }
    const glow = getGlowCanvas('cyan');
    if (glow) {
      const gp = project3D(cx, floorY - 94, 144, camX, camY);
      const pulse = 0.72 + 0.28 * Math.sin(time * 2.0);
      const r = 94 * gp.s;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.44 * pulse;
      ctx.drawImage(glow, gp.x - r, gp.y - r, r * 2, r * 2);
      ctx.restore();
    }
  }

  /** Skykeep Wing Boss Centerpiece: Celestial White-Marble Sun-Rotunda & Astrolabe Halo Rings. */
  drawSkykeepRotunda3D(ctx, camX, camY, cx, floorY, time) {
    this.drawArchSpan3D(ctx, camX, camY, cx - 176, cx + 176, floorY - 204, floorY - 284, 118, 50, 'marble');
    for (const side of [-1, 1]) {
      this.drawPillar3D(ctx, camX, camY, cx + side * 168, floorY - 216, floorY, 112, 24, 'marble');
      this.drawPillar3D(ctx, camX, camY, cx + side * 108, floorY - 188, floorY, 138, 20, 'marble');
    }
    // Concentric rotating 3D celestial astrolabe gears suspended inside the marble rotunda
    this.drawGear3D(ctx, camX, camY, cx, floorY - 156, 154, { r: 66, speed: 0.28, teeth: 16, bright: 0.78 }, time);
    this.drawGear3D(ctx, camX, camY, cx, floorY - 156, 148, { r: 42, speed: -0.46, teeth: 12, phase: 0.35, bright: 0.78 }, time);
    // Stepped white-marble & gilded-brass sanctum altar
    this.drawBox3D(ctx, camX, camY, cx - 118, floorY - 12, 122, 236, 12, 52, 'marble', { topTex: 'marble', bright: 0.82 });
    this.drawBox3D(ctx, camX, camY, cx - 72, floorY - 24, 132, 144, 12, 40, 'marble', { topTex: 'brass_rim', bright: 0.84 });
    const A = this.assets;
    const sp = project3D(cx, floorY - 24, 138, camX, camY);
    A.draw(ctx, 'skykeep_props', 'moon_astrolabe', sp.x, sp.y, false, 1, sp.s, 'rgba(8, 10, 24, 0.34)');
    for (const side of [-1, 1]) {
      const up = project3D(cx + side * 102, floorY - 12, 126, camX, camY);
      A.draw(ctx, 'skykeep_props', 'fountain_basin', up.x, up.y, side < 0, 1, up.s, 'rgba(8, 10, 24, 0.34)');
    }
    const glow = getGlowCanvas('moon');
    if (glow) {
      const gp = project3D(cx, floorY - 156, 152, camX, camY);
      const pulse = 0.78 + 0.22 * Math.sin(time * 1.6);
      const r = 104 * gp.s;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.48 * pulse;
      ctx.drawImage(glow, gp.x - r, gp.y - r, r * 2, r * 2);
      ctx.restore();
    }
  }

  /** Cathedral Boss Centerpiece: a soaring apse of clustered piers, a high altar and the great rose window. */
  drawCathedralApse3D(ctx, camX, camY, cx, floorY, time) {
    this.drawArchSpan3D(ctx, camX, camY, cx - 180, cx + 180, floorY - 230, floorY - 300, 120, 54, 'stone_trim');
    for (const side of [-1, 1]) {
      for (let k = 0; k < 2; k++) {
        const tx = cx + side * (130 + k * 70);
        this.drawPillar3D(ctx, camX, camY, tx, floorY - 260 + k * 20, floorY, 110 + k * 30, 22);
      }
    }
    this.drawBox3D(ctx, camX, camY, cx - 110, floorY - 10, 130, 220, 10, 50, 'stone_trim');
    this.drawBox3D(ctx, camX, camY, cx - 70, floorY - 20, 136, 140, 10, 40, 'stone_trim');
    this.drawBox3D(ctx, camX, camY, cx - 28, floorY - 60, 150, 56, 40, 24, 'stone_trim', { topTex: 'wood_plank' });
    const gp = project3D(cx, floorY - 215, 200, camX, camY);
    const glow = getGlowCanvas('crimson');
    if (glow) {
      const pulse = 0.65 + 0.35 * Math.sin(time * 1.2);
      const r = 86 * gp.s;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45 * pulse;
      ctx.drawImage(glow, gp.x - r, gp.y - r, r * 2, r * 2);
      ctx.restore();
    }
  }

  /** Library Boss Centerpiece: a vaulted reading-room apse of towering shelves, a rose window and a spectral lectern dais. */
  drawGrandReadingRoom3D(ctx, camX, camY, cx, floorY, time) {
    this.drawArchSpan3D(ctx, camX, camY, cx - 160, cx + 160, floorY - 176, floorY - 244, 110, 50, 'stone_trim');
    for (const side of [-1, 1]) {
      const tx = cx + side * 170;
      this.drawBox3D(ctx, camX, camY, tx - 20, floorY - 206, 110, 40, 206, 42, 'wood_plank');
      this.drawBox3D(ctx, camX, camY, tx - 28, floorY - 216, 106, 56, 12, 50, 'stone_trim');
    }
    this.drawBox3D(ctx, camX, camY, cx - 92, floorY - 12, 130, 184, 12, 46, 'stone_trim', { topTex: 'wood_plank' });
    this.drawBox3D(ctx, camX, camY, cx - 52, floorY - 22, 138, 104, 10, 36, 'wood_plank', { topTex: 'wood_plank' });
    this.drawBox3D(ctx, camX, camY, cx - 10, floorY - 56, 150, 20, 34, 16, 'wood_plank');
    const gp = project3D(cx, floorY - 190, 190, camX, camY);
    const glow = getGlowCanvas('violet');
    if (glow) {
      const pulse = 0.6 + 0.4 * Math.sin(time * 1.6);
      const r = 70 * gp.s;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5 * pulse;
      ctx.drawImage(glow, gp.x - r, gp.y - r, r * 2, r * 2);
      ctx.restore();
    }
  }

  /** Arcade Boss Centerpiece: a brass proscenium stage with meshing cogwheels, pipes & a winding-key dais. */
  drawAutomataStage3D(ctx, camX, camY, cx, floorY, time) {
    this.drawArchSpan3D(ctx, camX, camY, cx - 150, cx + 150, floorY - 170, floorY - 236, 100, 48, 'brass_rim');
    for (const side of [-1, 1]) {
      const tx = cx + side * 160;
      this.drawBox3D(ctx, camX, camY, tx - 18, floorY - 200, 100, 36, 200, 40, 'iron_truss');
      this.drawBox3D(ctx, camX, camY, tx - 26, floorY - 212, 96, 52, 14, 48, 'brass_rim');
      this.drawBox3D(ctx, camX, camY, tx - 26, floorY - 18, 96, 52, 18, 48, 'brass_rim');
    }
    this.drawGear3D(ctx, camX, camY, cx - 92, floorY - 150, 150, { r: 44, speed: 0.5, teeth: 12 }, time);
    this.drawGear3D(ctx, camX, camY, cx + 2, floorY - 118, 150, { r: 56, speed: -0.39, teeth: 14, phase: 0.22 }, time);
    this.drawGear3D(ctx, camX, camY, cx + 102, floorY - 156, 150, { r: 40, speed: 0.55, teeth: 11, phase: 0.6 }, time);
    this.drawBox3D(ctx, camX, camY, cx - 96, floorY - 12, 126, 192, 12, 44, 'wood_plank', { topTex: 'brass_rim' });
    this.drawBox3D(ctx, camX, camY, cx - 60, floorY - 22, 134, 120, 10, 36, 'wood_plank', { topTex: 'brass_rim' });
    const gp = project3D(cx, floorY - 60, 140, camX, camY);
    const glow = getGlowCanvas('amber');
    if (glow) {
      const pulse = 0.65 + 0.35 * Math.sin(time * 3.4);
      const r = 58 * gp.s;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5 * pulse;
      ctx.drawImage(glow, gp.x - r, gp.y - r, r * 2, r * 2);
      ctx.restore();
    }
  }

  /** Darkwood Boss Centerpiece: Ancient Hollow Elder-Tree Shrine & Bioluminescent Rune Altar! */
  drawBriarShrine3D(ctx, camX, camY, cx, floorY, time) {
    // Twin massive mossy root-pillars + vaulted elder-bark canopy arch
    this.drawArchSpan3D(ctx, camX, camY, cx - 136, cx + 136, floorY - 156, floorY - 236, 118, 46, 'elder_bark_h');
    for (const side of [-1, 1]) {
      const tx = cx + side * 144;
      this.drawBox3D(ctx, camX, camY, tx - 22, floorY - 196, 114, 44, 196, 42, 'elder_bark');
      this.drawBox3D(ctx, camX, camY, tx - 34, floorY - 28, 108, 68, 28, 52, 'elder_bark_h', { topTex: 'elder_bark_h' });
    }
    // Stepped moss-stone druidic dais + glowing heartwood crystal
    this.drawBox3D(ctx, camX, camY, cx - 68, floorY - 14, 126, 136, 14, 38, 'moss_stone');
    this.drawBox3D(ctx, camX, camY, cx - 42, floorY - 26, 132, 84, 12, 34, 'moss_stone');
    const gp = project3D(cx, floorY - 118, 142, camX, camY);
    const glow = getGlowCanvas('emerald');
    if (glow) {
      const pulse = 0.72 + 0.28 * Math.sin(time * 2.1);
      const r = 64 * gp.s;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55 * pulse;
      ctx.drawImage(glow, gp.x - r, gp.y - r, r * 2, r * 2);
      ctx.restore();
    }
  }

  /** Stage 7 Boss Centerpiece: Giant Backlit Texture-Mapped 3D Astronomical Rose-Clock! */
  drawAstronomicalClock3D(ctx, camX, camY, wx, wy, z, time) {
    const c = project3D(wx, wy, z, camX, camY);
    const R = 132 * c.s;
    if (c.x + R < 0 || c.x - R > W) return;

    ctx.save();
    const bg = ctx.createRadialGradient(c.x, c.y, R * 0.1, c.x, c.y, R * 1.15);
    bg.addColorStop(0, 'rgba(220, 232, 255, 0.42)');
    bg.addColorStop(0.65, 'rgba(130, 155, 225, 0.24)');
    bg.addColorStop(0.92, 'rgba(70, 55, 120, 0.18)');
    bg.addColorStop(1, 'rgba(10, 8, 20, 0)');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(c.x, c.y, R * 1.15, 0, Math.PI * 2); ctx.fill();

    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * Math.PI * 2, a1 = ((i + 1) / 12) * Math.PI * 2;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(165, 195, 255, 0.18)' : 'rgba(215, 155, 95, 0.14)';
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.arc(c.x, c.y, R * 0.92, a0 + 0.03, a1 - 0.03);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    // Texture-mapped 12-segment 3D iron & brass outer bezel ring + chapter ring
    const ironTex = this.tex('iron_rivet');
    const brassTex = this.tex('brass_rim');
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * Math.PI * 2, a1 = ((i + 1) / 12) * Math.PI * 2;
      const ca0 = Math.cos(a0), sa0 = Math.sin(a0), ca1 = Math.cos(a1), sa1 = Math.sin(a1);
      const o0 = project3D(wx + ca0 * 130, wy + sa0 * 130, z - 6, camX, camY);
      const o1 = project3D(wx + ca1 * 130, wy + sa1 * 130, z - 6, camX, camY);
      const i0 = project3D(wx + ca0 * 116, wy + sa0 * 116, z - 6, camX, camY);
      const i1 = project3D(wx + ca1 * 116, wy + sa1 * 116, z - 6, camX, camY);
      const sh = shadeOverlay32([ca0 * 0.4, sa0 * 0.4, -0.85], this.pal.fog, 0.34);
      texQuad(ctx, ironTex, o0, o1, i1, i0, i * 32, 0, (i + 1) * 32, 0, (i + 1) * 32, 16, i * 32, 16, sh);

      const c0 = project3D(wx + ca0 * 92, wy + sa0 * 92, z - 4, camX, camY);
      const c1 = project3D(wx + ca1 * 92, wy + sa1 * 92, z - 4, camX, camY);
      const ci0 = project3D(wx + ca0 * 85, wy + sa0 * 85, z - 4, camX, camY);
      const ci1 = project3D(wx + ca1 * 85, wy + sa1 * 85, z - 4, camX, camY);
      texQuad(ctx, brassTex, c0, c1, ci1, ci0, i * 24, 0, (i + 1) * 24, 0, (i + 1) * 24, 8, i * 24, 8, sh);

      // Mullion spoke
      ctx.strokeStyle = '#24283c'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ci0.x, ci0.y); ctx.lineTo(i0.x, i0.y); ctx.stroke();
    }

    // Central texture-mapped 3D brass escapement gear
    this.drawGear3D(ctx, camX, camY, wx, wy, z - 12, { r: 44, teeth: 12, thick: 14, speed: -0.35, brass: true }, time);

    // Texture-mapped 3D brass & iron minute & hour hands
    const drawHand3D = (ang, len, halfW, tex) => {
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const nx = -sa * halfW, ny = ca * halfW;
      const p0 = project3D(wx - ca * 18 + nx, wy - sa * 18 + ny, z - 24, camX, camY);
      const p1 = project3D(wx - ca * 18 - nx, wy - sa * 18 - ny, z - 24, camX, camY);
      const p2 = project3D(wx + ca * len - nx * 0.4, wy + sa * len - ny * 0.4, z - 24, camX, camY);
      const p3 = project3D(wx + ca * len + nx * 0.4, wy + sa * len + ny * 0.4, z - 24, camX, camY);
      texQuad(ctx, tex, p0, p1, p2, p3, 0, 0, 0, 8, len, 8, len, 0,
        shadeOverlay32([-0.3, -0.4, -0.85], this.pal.fog, 0.22));
    };
    drawHand3D(-Math.PI * 0.5 + time * 0.08, 108, 3.2, brassTex);
    drawHand3D(-Math.PI * 0.2 + time * 0.015, 74, 4.2, ironTex);
  }

  /** Stage 8 Boss Centerpiece: Texture-Mapped 3D Marble Throne Dais, Organ & Velvet Throne! */
  drawCountThroneApse3D(ctx, camX, camY, cx, floorY, time) {
    const rw = project3D(cx, floorY - 186, 185, camX, camY);
    const rr = 62 * rw.s;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(rw.x, rw.y, 4, rw.x, rw.y, rr * 1.3);
    g.addColorStop(0, 'rgba(235, 65, 85, 0.42)');
    g.addColorStop(0.65, 'rgba(145, 40, 120, 0.22)');
    g.addColorStop(1, 'rgba(20, 8, 30, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(rw.x, rw.y, rr * 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // 8-segment 3D stone rose-window surround
    const trimTex = this.tex('stone_trim');
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2;
      const o0 = { x: rw.x + Math.cos(a0) * (rr + 4), y: rw.y + Math.sin(a0) * (rr + 4) };
      const o1 = { x: rw.x + Math.cos(a1) * (rr + 4), y: rw.y + Math.sin(a1) * (rr + 4) };
      const i0 = { x: rw.x + Math.cos(a0) * (rr - 3), y: rw.y + Math.sin(a0) * (rr - 3) };
      const i1 = { x: rw.x + Math.cos(a1) * (rr - 3), y: rw.y + Math.sin(a1) * (rr - 3) };
      texQuad(ctx, trimTex, o0, o1, i1, i0, i * 24, 0, (i + 1) * 24, 0, (i + 1) * 24, 8, i * 24, 8,
        shadeOverlay32([0, -0.3, -0.9], this.pal.fog, 0.48));
      const sp = a0 + time * 0.03;
      ctx.strokeStyle = '#2a1c2e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(rw.x, rw.y); ctx.lineTo(rw.x + Math.cos(sp) * rr, rw.y + Math.sin(sp) * rr); ctx.stroke();
    }

    // Twin carved-oak cathedral pipe-organ cases & gilded cylindrical organ pipes!
    for (const side of [-1, 1]) {
      const ox = cx + side * 145;
      this.drawBox3D(ctx, camX, camY, ox - 34, floorY - 72, 136, 68, 72, 26, 'wood_carved');
      this.drawBox3D(ctx, camX, camY, ox - 36, floorY - 76, 134, 72, 5, 30, 'brass_rim');
      for (let p = 0; p < 7; p++) {
        const ph = 78 + (3 - Math.abs(p - 3)) * 22;
        const px = ox - 28 + p * 9;
        this.drawBox3D(ctx, camX, camY, px, floorY - 76 - ph, 138, 7, ph, 10,
          'organ_pipe', { uFit: 8, vOrigin: floorY - 76 - 56 });
      }
    }

    // The Count's throne: generated obsidian-and-crimson throne on its own carved dais,
    // flanked by iron candle pillars and great heraldic banners (projected at depth).
    const A = this.assets;
    const sheet = A.info('throne_props') ? 'throne_props' : null;
    if (sheet) {
      const drawProp = (name, wx, wy, z, flip = false) => {
        const f = A.frame(sheet, name);
        const pr = project3D(wx, wy, z, camX, camY);
        const dw = f.w * pr.s, dh = f.h * pr.s;
        ctx.save();
        ctx.translate(Math.round(pr.x), Math.round(pr.y));
        if (flip) ctx.scale(-1, 1);
        ctx.drawImage(A.img(sheet), f.x, f.y, f.w, f.h, Math.round(-f.ax * pr.s), Math.round(-dh), Math.round(dw), Math.round(dh));
        ctx.restore();
        return pr;
      };
      drawProp('great_banner', cx - 112, floorY - 150, 150);
      drawProp('great_banner', cx + 112, floorY - 150, 150, true);
      drawProp('candle_pillar', cx - 86, floorY, 104);
      drawProp('candle_pillar', cx + 86, floorY, 104, true);
      const tp = drawProp('throne', cx, floorY + 2, 96);
      // Candle glows on the pillars and a crimson aura behind the throne crown
      const glowA = getGlowCanvas('amber');
      const glowC = getGlowCanvas('crimson');
      if (glowA) {
        for (const side of [-1, 1]) {
          const gp = project3D(cx + side * 86, floorY - 150, 104, camX, camY);
          const r = 26 * gp.s;
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 + 0.1 * Math.sin(time * 9 + side);
          ctx.drawImage(glowA, gp.x - r, gp.y - r, r * 2, r * 2); ctx.restore();
        }
      }
      if (glowC) {
        const f = A.frame(sheet, 'throne');
        const r = 54 * tp.s;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.28 + 0.08 * Math.sin(time * 1.7);
        ctx.drawImage(glowC, tp.x - r, tp.y - f.h * tp.s * 0.8 - r, r * 2, r * 2); ctx.restore();
      }
    } else {
      for (let s2 = 0; s2 < 3; s2++) {
        const w = 156 - s2 * 32, h = 10, y = floorY - s2 * 10;
        this.drawBox3D(ctx, camX, camY, cx - w / 2, y - h, 78 + s2 * 14, w, h, 34, 'marble');
      }
    }
  }

  /** Stage 2 Boss Centerpiece: Ring of Texture-Mapped 3D Harvest Rune Monoliths! */
  drawMonolithCircle3D(ctx, camX, camY, cx, floorY, time) {
    const stones = [-170, -95, 0, 95, 170];
    const depths = [88, 148, 178, 148, 88];
    const order = [2, 1, 3, 0, 4];
    for (const idx of order) {
      const sx = cx + stones[idx], sz = depths[idx];
      const h = idx === 2 ? 148 : 112 + (idx % 2) * 16;
      this.drawBox3D(ctx, camX, camY, sx - 15, floorY - h, sz, 30, h, 24, 'rune_stone');
      const rp = project3D(sx, floorY - h * 0.58, sz - 2, camX, camY);
      const pulse = 0.5 + 0.5 * Math.sin(time * 2.5 + idx);
      ctx.fillStyle = `rgba(255, 145, 45, ${(0.35 + 0.4 * pulse).toFixed(2)})`;
      ctx.fillRect(Math.round(rp.x - 2), Math.round(rp.y - 8), 4, 16);
      ctx.fillRect(Math.round(rp.x - 5), Math.round(rp.y - 2), 10, 3);
    }
  }

  /** Stage 3 Boss Centerpiece: Texture-Mapped 3D Stone & Timber Bell-Tower! */
  drawYuleBellTower3D(ctx, camX, camY, cx, floorY, time) {
    this.drawBox3D(ctx, camX, camY, cx - 48, floorY - 196, 130, 96, 196, 52, 'wall');
    this.drawBox3D(ctx, camX, camY, cx - 54, floorY - 204, 126, 108, 10, 60, 'wood_plank');
    this.drawArchSpan3D(ctx, camX, camY, cx - 32, cx + 32, floorY - 138, floorY - 184, 126, 58, 'stone_trim');
    this.drawGear3D(ctx, camX, camY, cx, floorY - 160, 142, { r: 28, teeth: 8, thick: 10, speed: 0.9, brass: false }, time);
  }

  /** Stage 4 Boss Centerpiece: Twin Texture-Mapped 3D Crenellated Watchtowers! */
  drawRampartBastion3D(ctx, camX, camY, cx, floorY) {
    this.drawArchSpan3D(ctx, camX, camY, cx - 120, cx + 120, floorY - 124, floorY - 168, 118, 38, 'stone_trim');
    for (const side of [-1, 1]) {
      const tx = cx + side * 150;
      this.drawBox3D(ctx, camX, camY, tx - 30, floorY - 186, 110, 60, 186, 48, 'wall');
      this.drawBox3D(ctx, camX, camY, tx - 34, floorY - 202, 106, 20, 16, 54, 'stone_trim');
      this.drawBox3D(ctx, camX, camY, tx + 14, floorY - 202, 106, 20, 16, 54, 'stone_trim');
    }
  }

  /** Stage 6 Boss Centerpiece: Texture-Mapped 3D Shattered Classical Temple! */
  drawPetrifiedTemple3D(ctx, camX, camY, cx, floorY) {
    const cols = [-150, -78, 78, 150];
    for (let i = 0; i < cols.length; i++) {
      const px = cx + cols[i];
      const broken = i === 1 ? 44 : 0;
      this.drawPillar3D(ctx, camX, camY, px, floorY - 166 + broken, floorY, 112, 24);
    }
    this.drawBox3D(ctx, camX, camY, cx - 166, floorY - 184, 108, 76, 18, 32, 'marble');
    this.drawBox3D(ctx, camX, camY, cx + 64, floorY - 184, 108, 102, 18, 32, 'marble');
  }

  /** Dark Cave Boss Centerpiece: Obsidian Caldera Arch & Molten Shader Magmafalls! */
  drawVolcanicCaldera3D(ctx, camX, camY, cx, floorY, time) {
    const fxLayers = getFxLayers();
    const useGl = !!(fxLayers && fxLayers.enabled && fxLayers.magmafall);
    const glow = getGlowCanvas('amber');

    const drawMagmaStream = (wx, topY, botY, z, worldW, seed, speed, alpha, softTop = 0) => {
      const mTop = project3D(wx, topY, z, camX, camY);
      const mBot = project3D(wx, botY, z, camX, camY);
      const rw = Math.max(12, Math.round(worldW * mTop.s));
      const rx = Math.round((mTop.x + mBot.x) * 0.5 - rw * 0.5);
      const ry = Math.round(mTop.y);
      const rh = Math.max(12, Math.round(mBot.y - mTop.y));
      if (rx + rw < -16 || rx > W + 16 || rh <= 4) return { mTop, mBot, rw };

      if (useGl) {
        fxLayers.magmafall(ctx, { x: rx, y: ry, w: rw, h: rh }, {
          camX, camY, speed, alpha, seed, softTop,
        });
      } else {
        // Non-WebGL fallback: organic undulating viscous magma stream (never blocky rectangles)
        ctx.save();
        ctx.globalAlpha = alpha;
        const steps = 18;
        const coreW = rw * 0.54;
        ctx.fillStyle = '#260706';
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          const k = i / steps;
          const sy = ry + rh * k;
          const sway = Math.sin(k * 7.5 - time * 2.1 + seed * 4.0) * (rw * 0.08);
          const hw = coreW * (0.52 + 0.12 * Math.sin(k * 11.0 - time * 3.2 + seed) + (k > 0.8 ? (k - 0.8) * 1.1 : 0));
          const sx = rx + rw * 0.5 + sway - hw;
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        for (let i = steps; i >= 0; i--) {
          const k = i / steps;
          const sy = ry + rh * k;
          const sway = Math.sin(k * 7.5 - time * 2.1 + seed * 4.0) * (rw * 0.08);
          const hw = coreW * (0.52 + 0.12 * Math.cos(k * 10.3 - time * 2.9 + seed * 2.0) + (k > 0.8 ? (k - 0.8) * 1.1 : 0));
          ctx.lineTo(rx + rw * 0.5 + sway + hw, sy);
        }
        ctx.closePath();
        ctx.fill();

        const grad = ctx.createLinearGradient(rx + rw * 0.25, ry, rx + rw * 0.75, ry);
        grad.addColorStop(0, '#781406');
        grad.addColorStop(0.28, '#e43b08');
        grad.addColorStop(0.5, '#ffca52');
        grad.addColorStop(0.72, '#e43b08');
        grad.addColorStop(1, '#781406');
        ctx.fillStyle = grad;
        ctx.beginPath();
        for (let i = 0; i <= steps; i++) {
          const k = i / steps;
          const sy = ry + rh * k;
          const sway = Math.sin(k * 7.5 - time * 2.1 + seed * 4.0) * (rw * 0.08);
          const hw = coreW * (0.36 + 0.10 * Math.sin(k * 13.0 - time * 3.8 + seed));
          const sx = rx + rw * 0.5 + sway - hw;
          if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        for (let i = steps; i >= 0; i--) {
          const k = i / steps;
          const sy = ry + rh * k;
          const sway = Math.sin(k * 7.5 - time * 2.1 + seed * 4.0) * (rw * 0.08);
          const hw = coreW * (0.36 + 0.10 * Math.cos(k * 12.2 - time * 3.5 + seed * 1.7));
          ctx.lineTo(rx + rw * 0.5 + sway + hw, sy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      return { mTop, mBot, rw };
    };

    // 1. Distant outer magmafalls plunging into the subterranean magma sea on both flanks
    for (const side of [-1, 1]) {
      const distStream = drawMagmaStream(
        cx + side * 208, floorY - 336, floorY + 34, 198, 34,
        side < 0 ? 4.17 : 9.63, 0.76, 0.72, 1.0,
      );
      if (glow && distStream) {
        const gr = 32 * distStream.mBot.s;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.28 + 0.08 * Math.sin(time * 3.1 + side * 2.0);
        ctx.drawImage(glow, distStream.mBot.x - gr, distStream.mBot.y - gr * 0.8, gr * 2, gr * 1.6);
        ctx.restore();
      }
    }

    // 2. Recessed basalt back-troughs + primary twin molten magmafalls pouring down from the upper caldera ceiling
    for (const side of [-1, 1]) {
      const mx = cx + side * 84;
      this.drawBox3D(ctx, camX, camY, mx - 24, floorY - 340, 162, 48, 356, 18, 'crypt_stone');
      const mainStream = drawMagmaStream(
        mx, floorY - 338, floorY + 28, 152, 44,
        side < 0 ? 1.37 : 6.83, 0.96, 0.98, 0.0,
      );
      // Carved upper volcanic sluice cheeks & lintel framing the magma pouring from above the arch
      this.drawBox3D(ctx, camX, camY, mx - 30, floorY - 340, 142, 13, 128, 22, 'cavernwall');
      this.drawBox3D(ctx, camX, camY, mx + 17, floorY - 340, 142, 13, 128, 22, 'cavernwall');
      this.drawBox3D(ctx, camX, camY, mx - 32, floorY - 344, 136, 64, 18, 28, 'cavernwall');

      if (glow && mainStream) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        // Plunge boil radiance at the base of the cascade
        const grBot = 52 * mainStream.mBot.s;
        ctx.globalAlpha = 0.56 + 0.14 * Math.sin(time * 4.2 + side);
        ctx.drawImage(glow, mainStream.mBot.x - grBot, mainStream.mBot.y - grBot * 0.85, grBot * 2, grBot * 1.65);
        // Warm molten backlight illuminating the caldera arch opening
        const midP = project3D(mx, floorY - 156, 146, camX, camY);
        const grMid = 44 * midP.s;
        ctx.globalAlpha = 0.28 + 0.08 * Math.cos(time * 3.4 - side);
        ctx.drawImage(glow, midP.x - grMid, midP.y - grMid, grMid * 2, grMid * 2);
        ctx.restore();
      }
    }

    // 3. Foreground 3D Obsidian Caldera Arch & Flanking Piers crossing IN FRONT OF the falling magma streams
    this.drawArchSpan3D(ctx, camX, camY, cx - 146, cx + 146, floorY - 148, floorY - 216, 114, 46, 'cavernwall');
    for (const side of [-1, 1]) {
      const px = cx + side * 146;
      this.drawBox3D(ctx, camX, camY, px - 22, floorY - 178, 108, 44, 178, 42, 'cavernwall');
    }
  }

  // ============================================ FOREGROUND 2.5D FRAMING
  /**
   * Draws dark texture-mapped foreground framing pillars & arch corbels (`z = -72`,
   * ~1.23x parallax) that automatically fade down whenever the player or an active
   * threat is near, preserving 100% combat & platforming clarity.
   */
  drawForeground3D(ctx, cam, player, enemies, landmarks = null) {
    const camX = cam.rx, camY = cam.ry;
    const z = -72;
    const fgTex = this.tex(
      this.themeKey === 'darkwood'
        ? 'elder_bark'
        : this.themeKey === 'forest'
          ? 'bark'
          : this.primaryStoneKey(),
    );
    const fgShade = shadeOverlay32([-0.3, -0.2, -0.9], this.pal.fog, 0.22, 0.28);

    for (const f of this.fgFrames) {
      if (this.overlapsMuralX(f.wx)) continue;
      const pTop = project3D(f.wx, f.wy - 250, z, camX, camY);
      const pBot = project3D(f.wx, f.wy + 40, z, camX, camY);
      if (pBot.x < -90 || pBot.x > W + 90) continue;

      let minDist = Math.abs(player.x - f.wx);
      for (const e of enemies) {
        if (e.alive) minDist = Math.min(minDist, Math.abs(e.x - f.wx));
      }
      if (landmarks) {
        for (const l of landmarks) {
          if (l && Number.isFinite(l.x)) minDist = Math.min(minDist, Math.abs(l.x - f.wx));
        }
      }
      const clearFade = Math.max(0.14, Math.min(0.76, (minDist - 48) / 116));
      const w = Math.round(24 * pBot.s);
      const xL = Math.round(pBot.x - w / 2), xR = xL + w;
      const springY = Math.max(48, Math.round(pTop.y + 42));

      ctx.save();
      ctx.globalAlpha = clearFade;

      // Texture-mapped foreground column shaft (UV scaled by 1.28 so z = -72 parallax never upscales texels)
      const uvScale = 1.28;
      texQuad(
        ctx, fgTex,
        { x: xL, y: 0 }, { x: xR, y: 0 }, { x: xR, y: H }, { x: xL, y: H },
        0, 0, w * uvScale, 0, w * uvScale, H * uvScale, 0, H * uvScale, fgShade,
      );

      // Texture-mapped overhead foreground arch corbels curving left & right
      for (const dir of [-1, 1]) {
        const baseX = dir < 0 ? xL : xR;
        const segs = 4;
        for (let s = 0; s < segs; s++) {
          const t0 = s / segs, t1 = (s + 1) / segs;
          const ax0 = baseX + dir * (t0 * t0) * w * 2.1;
          const ax1 = baseX + dir * (t1 * t1) * w * 2.1;
          const ay0 = springY * (1 - t0);
          const ay1 = springY * (1 - t1);
          const q0 = dir < 0 ? { x: ax1, y: 0 } : { x: ax0, y: 0 };
          const q1 = dir < 0 ? { x: ax0, y: 0 } : { x: ax1, y: 0 };
          const q2 = dir < 0 ? { x: ax0, y: ay0 } : { x: ax1, y: ay1 };
          const q3 = dir < 0 ? { x: ax1, y: ay1 } : { x: ax0, y: ay0 };
          texQuad(
            ctx, fgTex, q0, q1, q2, q3,
            q0.x * uvScale, 0, q1.x * uvScale, 0,
            q2.x * uvScale, q2.y * uvScale, q3.x * uvScale, q3.y * uvScale,
            fgShade,
          );
        }
      }

      // Subtle cold moonlit rim along the left edge
      ctx.fillStyle = 'rgba(148, 166, 198, 0.16)';
      ctx.fillRect(xL + 1, 0, 2, H);
      ctx.restore();
    }
  }

  // ============================================ REUSABLE TEXTURED 3D PRIMITIVES
  /**
   * Axis-aligned 3D box `(wx, wy, z)` of size `(w, h, d)`, backface-culled,
   * perspective-subdivided on receding faces, texture-mapped & Lambert-shaded.
   */
  drawBox3D(ctx, camX, camY, wx, wy, z, w, h, d, texKey = 'wall', opts = null) {
    const fTL = project3D(wx, wy, z, camX, camY);
    const fTR = project3D(wx + w, wy, z, camX, camY);
    if (fTR.x < -40 || fTL.x > W + 40) return;
    const fBL = project3D(wx, wy + h, z, camX, camY);
    const fBR = project3D(wx + w, wy + h, z, camX, camY);
    if (fBL.y < -40 || fTL.y > H + 40) return;

    const tex = this.tex(typeof texKey === 'string' ? texKey : 'wall');
    const topTex = (opts && opts.topTex) ? this.tex(opts.topTex) : tex;
    const bright = (opts && opts.bright != null) ? opts.bright : 0.80;
    const fog = this.pal.fog;
    const fogAmt = clamp01((z - 15) / 360) * 0.52;

    const u0 = (opts && opts.uFit) ? 0 : wx;
    const u1 = (opts && opts.uFit) ? opts.uFit : wx + w;
    const vBase = (opts && opts.vOrigin != null) ? (wy - opts.vOrigin) : wy;
    const v0 = (opts && opts.vFit) ? 0 : vBase;
    const v1 = (opts && opts.vFit) ? opts.vFit : vBase + h;
    const proj = (px, py, pz) => project3D(px, py, pz, camX, camY);

    const bTL = project3D(wx, wy, z + d, camX, camY);
    const bTR = project3D(wx + w, wy, z + d, camX, camY);
    const bBL = project3D(wx, wy + h, z + d, camX, camY);

    // 1. Top or bottom receding face
    if (bTL.y < fTL.y - 0.4) {
      const tv0 = (opts && opts.vFit) ? 0 : z + d;
      const tv1 = (opts && opts.vFit) ? opts.vFit : z;
      texQuadSubZ(
        ctx, topTex, proj,
        { x: wx, y: wy, z: z + d }, { x: wx + w, y: wy, z: z + d },
        { x: wx + w, y: wy, z }, { x: wx, y: wy, z },
        u0, tv0, u1, tv0, u1, tv1, u0, tv1,
        shadeOverlay32([0, -1, -0.2], fog, fogAmt, bright),
        d > 28 ? 2 : 1,
      );
    } else if (bBL.y > fBL.y + 0.4) {
      texQuadSubZ(
        ctx, topTex, proj,
        { x: wx, y: wy + h, z }, { x: wx + w, y: wy + h, z },
        { x: wx + w, y: wy + h, z: z + d }, { x: wx, y: wy + h, z: z + d },
        u0, z, u1, z, u1, z + d, u0, z + d,
        shadeOverlay32([0, 1, -0.2], fog, fogAmt, bright * 0.85),
        d > 28 ? 2 : 1,
      );
    }

    // 2. Left or right receding side face (vertical stone courses match front face!)
    const suSpan = (opts && opts.uFit) ? opts.uFit : d;
    const vSlices = (h > 130 && d > 18) ? Math.min(3, Math.ceil(h / 130)) : 1;
    if (bTL.x < fTL.x - 0.4) {
      const shL = shadeOverlay32([-1, 0, -0.2], fog, fogAmt, bright);
      for (let s = 0; s < vSlices; s++) {
        const t0 = s / vSlices, t1 = (s + 1) / vSlices;
        const sy0 = wy + h * t0, sy1 = wy + h * t1 + (s < vSlices - 1 ? 0.6 : 0);
        const sv0 = v0 + (v1 - v0) * t0, sv1 = v0 + (v1 - v0) * t1;
        texQuad(
          ctx, tex,
          proj(wx, sy0, z + d), proj(wx, sy0, z), proj(wx, sy1, z), proj(wx, sy1, z + d),
          u0 - suSpan, sv0, u0, sv0, u0, sv1, u0 - suSpan, sv1, shL,
        );
      }
    } else if (bTR.x > fTR.x + 0.4) {
      const shR = shadeOverlay32([1, 0, -0.2], fog, fogAmt, bright);
      for (let s = 0; s < vSlices; s++) {
        const t0 = s / vSlices, t1 = (s + 1) / vSlices;
        const sy0 = wy + h * t0, sy1 = wy + h * t1 + (s < vSlices - 1 ? 0.6 : 0);
        const sv0 = v0 + (v1 - v0) * t0, sv1 = v0 + (v1 - v0) * t1;
        texQuad(
          ctx, tex,
          proj(wx + w, sy0, z), proj(wx + w, sy0, z + d), proj(wx + w, sy1, z + d), proj(wx + w, sy1, z),
          u1, sv0, u1 + suSpan, sv0, u1 + suSpan, sv1, u1, sv1, shR,
        );
      }
    }

    // 3. Front face (exact screen-space rectangle -> hits fast 1-draw parallelogram path!)
    texQuad(
      ctx, tex, fTL, fTR, fBR, fBL,
      u0, v0, u1, v0, u1, v1, u0, v1,
      shadeOverlay32([0, -0.15, -1], fog, fogAmt, bright),
    );
  }

  /** Extruded & texture-mapped 3D stone arch lintel with curved intrados soffit! */
  drawArchSpan3D(ctx, camX, camY, x0, x1, ySpring, yTop, z, d, texKey = 'stone_trim') {
    const pL = project3D(x0, yTop, z, camX, camY);
    const pR = project3D(x1, yTop, z, camX, camY);
    if (pR.x < -40 || pL.x > W + 40) return;
    const segs = 8;
    const span = x1 - x0;
    const archH = (ySpring - yTop) * 0.68;
    const fog = this.pal.fog;
    const fogAmt = clamp01((z - 15) / 360) * 0.52;
    const tex = this.tex(typeof texKey === 'string' ? texKey : 'stone_trim');
    const frontShade = shadeOverlay32([0, -0.15, -1], fog, fogAmt, 0.80);

    // Pass 1: Curved 3D intrados soffits (z -> z + d) drawn first so they never overlap z front spandrels
    let arcU = 0;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const ax0 = x0 + span * t0, ax1 = x0 + span * t1;
      const ay0 = ySpring - Math.sin(t0 * Math.PI) * archH;
      const ay1 = ySpring - Math.sin(t1 * Math.PI) * archH;
      const segLen = Math.hypot(ax1 - ax0, ay1 - ay0);

      const f0 = project3D(ax0, ay0, z, camX, camY);
      const f1 = project3D(ax1, ay1, z, camX, camY);
      const b1 = project3D(ax1, ay1, z + d, camX, camY);
      const b0 = project3D(ax0, ay0, z + d, camX, camY);
      const nx = Math.cos(((t0 + t1) * 0.5) * Math.PI) * 0.6;
      const soffitShade = shadeOverlay32([nx, 0.8, -0.2], fog, fogAmt + 0.08, 0.76);
      texQuad(ctx, tex, f0, f1, b1, b0, arcU, 0, arcU + segLen, 0, arcU + segLen, d, arcU, d, soffitShade);
      arcU += segLen;
    }

    // Pass 2: Front spandrel masonry segments at z (continuous world-aligned UVs!)
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const ax0 = x0 + span * t0, ax1 = x0 + span * t1;
      const ay0 = ySpring - Math.sin(t0 * Math.PI) * archH;
      const ay1 = ySpring - Math.sin(t1 * Math.PI) * archH;
      const padX = i < segs - 1 ? 0.5 : 0;
      const f0 = project3D(ax0, ay0, z, camX, camY);
      const ft0 = project3D(ax0, yTop, z, camX, camY);
      const ft1 = project3D(ax1 + padX, yTop, z, camX, camY);
      const ff1 = project3D(ax1 + padX, ay1, z, camX, camY);
      texQuad(ctx, tex, ft0, ft1, ff1, f0, ax0, yTop, ax1, yTop, ax1, ay1, ax0, ay0, frontShade);
    }
  }

  // ============================================ PROCEDURAL PLANE TEXTURES
  getPlaneTexture(kind) {
    if (this.planeCache.has(kind)) return this.planeCache.get(kind);
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const g = c.getContext('2d');

    if (kind === 'courtyard') {
      g.fillStyle = '#1d2036'; g.fillRect(0, 0, 512, 128);
      for (let y = 0; y < 128; y += 8) {
        const off = ((y >> 3) & 1) * 12;
        for (let x = -12; x < 512; x += 24) {
          const v = ((x * 13 + y * 7) & 3);
          g.fillStyle = ['#252a44', '#2c3352', '#1f243b', '#31395a'][v];
          g.fillRect(x + off + 1, y + 1, 22, 6);
          g.fillStyle = '#3d476c';
          g.fillRect(x + off + 1, y + 1, 22, 1);
          if ((v & 1) === 0) {
            g.fillStyle = '#181c2e';
            g.fillRect(x + off + 7, y + 4, 2, 1);
          }
        }
      }
      g.fillStyle = '#101830'; g.fillRect(0, 48, 512, 20);
      g.fillStyle = '#29406c';
      for (let x = 0; x < 512; x += 8) g.fillRect(x, 51 + ((x * 3) & 3), 5, 1);
    } else if (kind === 'ice') {
      g.fillStyle = '#1b2b4a'; g.fillRect(0, 0, 512, 128);
      for (let i = 0; i < 220; i++) {
        const x = (i * 73) % 512, y = (i * 29) % 128, w = 8 + (i % 5) * 6;
        g.fillStyle = i % 3 === 0 ? '#2b436e' : '#22365c';
        g.fillRect(x, y, w, 1);
        if (x + w > 512) g.fillRect(x - 512, y, w, 1);
      }
      for (let i = 0; i < 96; i++) {
        const x = (i * 97) % 512, y = (i * 41) % 128;
        g.fillStyle = '#6e94c8';
        g.fillRect(x, y, 5 + (i & 3), 1);
      }
    } else if (kind === 'magma') {
      g.fillStyle = '#1c0505'; g.fillRect(0, 0, 512, 128);
      for (let i = 0; i < 240; i++) {
        const x = (i * 67) % 512, y = (i * 29) % 128, w = 7 + (i % 5) * 5;
        g.fillStyle = ['#4a0d08', '#8c2208', '#d94e14', '#2b0808'][i & 3];
        g.fillRect(x, y, w, 2);
        if (x + w > 512) g.fillRect(x - 512, y, w, 2);
      }
      for (let i = 0; i < 90; i++) {
        g.fillStyle = i % 2 === 0 ? '#ffd858' : '#ff8c24';
        g.fillRect((i * 107) % 512, (i * 43) % 128, 4 + (i & 3), 1);
      }
    } else if (kind === 'abyss' || kind === 'crypt_pit') {
      const oss = kind === 'abyss';
      g.fillStyle = oss ? '#08131e' : '#0b0914'; g.fillRect(0, 0, 512, 128);
      for (let i = 0; i < 200; i++) {
        const x = (i * 67) % 512, y = (i * 31) % 128, w = 8 + (i % 4) * 6;
        g.fillStyle = oss
          ? (i % 3 === 0 ? '#1b4a56' : '#122c3c')
          : (i % 3 === 0 ? '#241c34' : '#171224');
        g.fillRect(x, y, w, 2);
        if (x + w > 512) g.fillRect(x - 512, y, w, 2);
      }
      if (oss) {
        for (let i = 0; i < 72; i++) {
          g.fillStyle = '#4ad2b4';
          g.fillRect((i * 113) % 512, (i * 47) % 128, 4, 1);
        }
      }
    } else if (kind === 'darkwood') {
      g.fillStyle = '#091519'; g.fillRect(0, 0, 512, 128);
      for (let i = 0; i < 260; i++) {
        const x = (i * 53) % 512, y = (i * 37) % 128, w = 6 + (i % 5) * 4;
        g.fillStyle = ['#112828', '#173832', '#0d2024', '#1f4a3e'][i & 3];
        g.fillRect(x, y, w, 1 + (i & 1));
        if (x + w > 512) g.fillRect(x - 512, y, w, 1 + (i & 1));
      }
      // Misty bioluminescent forest stream & glowing moss flecks
      g.fillStyle = '#0c2630'; g.fillRect(0, 44, 512, 26);
      for (let i = 0; i < 84; i++) {
        g.fillStyle = i % 3 === 0 ? '#6ef7c8' : '#2a8f78';
        g.fillRect((i * 89) % 512, 46 + (i * 19) % 22, 4 + (i & 3), 1);
      }
    } else if (kind === 'cloudsea') {
      // Moonlit silver-cerulean billowing cloud-sea plane beneath Floating Sky Gardens
      g.fillStyle = '#182442'; g.fillRect(0, 0, 512, 128);
      for (let i = 0; i < 280; i++) {
        const x = (i * 59) % 512, y = (i * 29) % 128, w = 10 + (i % 6) * 6, h = 1 + (i & 1);
        g.fillStyle = ['#243864', '#314d82', '#4468a3', '#1d2d52'][i & 3];
        g.fillRect(x, y, w, h);
        if (x + w > 512) g.fillRect(x - 512, y, w, h);
      }
      for (let i = 0; i < 140; i++) {
        const x = (i * 83) % 512, y = (i * 37) % 128, w = 6 + (i % 5) * 4;
        g.fillStyle = i % 3 === 0 ? '#b8dcff' : '#7ba6dc';
        g.fillRect(x, y, w, 1);
        if (x + w > 512) g.fillRect(x - 512, y, w, 1);
      }
    } else if (kind === 'forest') {
      g.fillStyle = '#1a131c'; g.fillRect(0, 0, 512, 128);
      for (let i = 0; i < 260; i++) {
        const x = (i * 59) % 512, y = (i * 37) % 128, w = 5 + (i % 4) * 4;
        g.fillStyle = ['#3a221c', '#58301e', '#2a1c24', '#743e22'][i & 3];
        g.fillRect(x, y, w, 1 + (i & 1));
      }
    } else {
      g.fillStyle = '#151428'; g.fillRect(0, 0, 512, 128);
      for (let i = 0; i < 240; i++) {
        const x = (i * 61) % 512, y = (i * 43) % 128, w = 6 + (i % 4) * 5;
        g.fillStyle = ['#1f1e38', '#272646', '#191830', '#2f3154'][i & 3];
        g.fillRect(x, y, w, 2);
      }
    }
    this.planeCache.set(kind, c);
    return c;
  }
}

// =========================================================== HELPERS
function norm3(x, y, z) {
  const m = Math.hypot(x, y, z) || 1;
  return [x / m, y / m, z / m];
}

function rotY(x, y, z, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: x * c + z * s, y, z: -x * s + z * c };
}

function quadNormal(a, b, c) {
  const ux = b.wx - a.wx, uy = b.wy - a.wy, uz = b.wz - a.wz;
  const vx = c.wx - a.wx, vy = c.wy - a.wy, vz = c.wz - a.wz;
  return norm3(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
}

/**
 * Quantized 32-bit palette shader: directional Lambert dot product snapped to
 * 6 crisp value bands and blended toward atmospheric fog.
 */
export function shade32(rgb, n, fogRgb, fogAmt = 0) {
  const dot = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
  const bands = [0.34, 0.48, 0.64, 0.80, 0.96, 1.14];
  const k = bands[Math.min(5, Math.floor(dot * 5.99))];
  const r = Math.round((rgb[0] * k) * (1 - fogAmt) + fogRgb[0] * fogAmt);
  const g = Math.round((rgb[1] * k) * (1 - fogAmt) + fogRgb[1] * fogAmt);
  const b = Math.round((rgb[2] * k) * (1 - fogAmt) + fogRgb[2] * fogAmt);
  return `rgb(${clampByte(r)}, ${clampByte(g)}, ${clampByte(b)})`;
}

function clampByte(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function mod(a, n) { return ((a % n) + n) % n; }
function rgbA(rgb, a) { return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${clamp01(a).toFixed(3)})`; }

export function fillQuad(ctx, a, b, c, d) {
  ctx.beginPath();
  ctx.moveTo(Math.round(a.x), Math.round(a.y));
  ctx.lineTo(Math.round(b.x), Math.round(b.y));
  ctx.lineTo(Math.round(c.x), Math.round(c.y));
  ctx.lineTo(Math.round(d.x), Math.round(d.y));
  ctx.closePath();
  ctx.fill();
}

export function fillTri(ctx, a, b, c) {
  ctx.beginPath();
  ctx.moveTo(Math.round(a.x), Math.round(a.y));
  ctx.lineTo(Math.round(b.x), Math.round(b.y));
  ctx.lineTo(Math.round(c.x), Math.round(c.y));
  ctx.closePath();
  ctx.fill();
}
