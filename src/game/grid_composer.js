// True 2D Architectural Grid-to-Screen Stage Composer for Gothic Nocturne.
// Compiles each biome's 2D layout in `MAP_ROOMS` / `MAP_DOORS` into an exact
// `20 x 5` tile (`640 x 160 px`) per-cell stage so moving left/right/up/down on
// screen ALWAYS matches moving left/right/up/down on the Castle Map, with
// deliberate bay-aligned architectural compositions and strict prop grounding.

import {
  TILE, T_EMPTY, T_PLATFORM, T_BLOCK, T_CRUMBLE, T_SPIKES, T_LAVA, T_WATER,
  T_GROUND, T_STONE, isMaterialTile, isSolidTile,
} from '../engine/constants.js';
import { MAP_ROOMS, stageDoorsFor } from './map_layout.js';
import { THEMES, px, py } from './builder.js';
import {
  GRID_CELL_W, GRID_CELL_H, GRID_TOP_MARGIN, GRID_BOTTOM_PAD, gridFloorRow,
  ROOM_ARCHETYPES, PACING_ZONES, VISUAL_TELLS, createRoomSchemaEntry,
} from './level_schema.js';

/** Deterministic PRNG for subtle non-structural variation (never random scatter). */
function mulberry32(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FLYING_ENEMIES = new Set([
  'bat', 'dragon', 'owl', 'ghost', 'tome', 'gargoyle', 'cinderimp', 'wraith', 'medusa', 'lantern', 'wisp',
  'valkyrie', 'necromancer',
]);

/** Returns architectural floor/wall prop descriptors appropriate to a theme. */
function themePropPalette(themeKey, theme) {
  const fp = theme.props;
  if (fp && fp.sheet && fp.frames && fp.frames.length) {
    const f = fp.frames;
    return {
      tall: [fp.sheet, f[0]],
      altTall: [fp.sheet, f[Math.min(1, f.length - 1)]],
      focal: [fp.sheet, f[Math.min(2, f.length - 1)]],
      low: [fp.sheet, f[Math.min(3, f.length - 1)]],
      sconce: theme.outdoor ? null : ['props', 'torch'],
      hanging: themeKey === 'alchemy' ? 'pendulum' : (themeKey === 'ballroom' ? 'chandelier' : (theme.outdoor ? null : 'cage')),
    };
  }
  switch (theme.decor) {
    case 'graveyard':
      return {
        tall: ['props', 'tombstone'],
        altTall: ['arch', 'column'],
        focal: ['props', 'tombstone'],
        low: ['props', 'shrub'],
        sconce: null,
        hanging: null,
      };
    case 'darkwood':
      return {
        tall: ['darkwood_props', 'ancient_totem'],
        altTall: ['darkwood_props', 'moss_lantern'],
        focal: ['darkwood_props', 'elder_stump'],
        low: ['darkwood_props', 'glow_shrooms'],
        sconce: null,
        hanging: null,
      };
    case 'forest':
      return {
        tall: ['pumpkinprops', 'scarecrow'],
        altTall: ['pumpkinprops', 'jack_big'],
        focal: ['pumpkinprops', 'pumpkins'],
        low: ['pumpkinprops', 'jack_small'],
        sconce: null,
        hanging: null,
      };
    case 'yule':
      return {
        tall: ['xmasprops', 'lamppost'],
        altTall: ['xmasprops', 'tree'],
        focal: ['xmasprops', 'gifts'],
        low: ['xmasprops', 'stump'],
        sconce: null,
        hanging: null,
      };
    case 'ramparts':
      return {
        tall: ['arch', 'column'],
        altTall: ['arch', 'column'],
        focal: ['arch', 'column'],
        low: ['arch', 'column'],
        sconce: ['props', 'torch'],
        hanging: null,
      };
    case 'crypt':
      return {
        tall: ['arch', 'column'],
        altTall: ['props', 'tombstone'],
        focal: ['props', 'tombstone'],
        low: ['props', 'tombstone'],
        sconce: ['props', 'torch'],
        hanging: 'cage',
      };
    case 'cavern':
      return {
        tall: ['cavern_props', 'obsidian_pillar'],
        altTall: ['cavern_props', 'brazier'],
        focal: ['cavern_props', 'magma_vent'],
        low: ['cavern_props', 'stalagmite'],
        sconce: ['props', 'torch'],
        hanging: 'cage',
      };
    case 'arcade':
      return {
        tall: ['arcade_props', 'sage_cabinet'],
        altTall: ['arcade_props', 'oracle_engine'],
        focal: ['arcade_props', 'zoetrope'],
        low: ['arcade_props', 'chess_automaton'],
        sconce: ['props', 'torch'],
        hanging: 'chandelier',
      };
    case 'library':
      return {
        tall: ['library_props', 'bookcase'],
        altTall: ['library_props', 'lectern'],
        focal: ['library_props', 'globe'],
        low: ['library_props', 'tomes'],
        sconce: ['props', 'torch'],
        hanging: 'chandelier',
      };
    case 'cathedral':
      return {
        tall: ['cathedral_props', 'angel'],
        altTall: ['arch', 'column'],
        focal: ['cathedral_props', 'pew'],
        low: ['cathedral_props', 'candles'],
        sconce: ['props', 'torch'],
        hanging: 'chandelier',
      };
    case 'clockwork':
      return {
        tall: ['arch', 'column'],
        altTall: ['arch', 'column'],
        focal: ['arch', 'column'],
        low: ['arch', 'column'],
        sconce: ['props', 'torch'],
        hanging: 'pendulum',
      };
    default: // 'castle' / throne
      return {
        tall: ['arch', 'column'],
        altTall: ['arch', 'column'],
        focal: ['arch', 'column'],
        low: ['arch', 'column'],
        sconce: ['props', 'torch'],
        hanging: 'chandelier',
      };
  }
}

/**
 * Compiles a complete 2D Metroidvania stage from `MAP_ROOMS[spec.key]` and
 * `stageDoorsFor(spec.key)` with exact `20 x 5` tile per-cell geometry.
 */
export function composeGridStage(spec) {
  const {
    id = 1,
    key,
    name,
    subtitle = '',
    theme: themeKey = key,
    seed = id,
    roster = {},
    boss: bossSpec = {},
    outdoorUntilCol = null, // e.g., graveyard outdoor on cols 1..8, indoor castle on cols 9..27
  } = spec;

  const mapRoom = MAP_ROOMS[key];
  if (!mapRoom) throw new Error(`composeGridStage: unknown MAP_ROOMS key '${key}'`);
  const baseTheme = THEMES[themeKey] || THEMES.throne;
  const indoorCastleTheme = key === 'graveyard' ? THEMES.throne : baseTheme;
  const rng = mulberry32(seed * 7919 + 31);

  const { minC, maxC, minR, maxR } = mapRoom.bounds;
  const colSpan = maxC - minC + 1;
  const cols = colSpan * GRID_CELL_W;
  const rows = gridFloorRow(minR, maxR) + GRID_BOTTOM_PAD;
  const bossFloorMr = Math.max(...mapRoom.boss.map(([, r]) => r));
  const bossUpperMr = bossFloorMr - 1;

  const doors = stageDoorsFor(key);
  const doorsByCell = new Map();
  for (const d of doors) {
    const ck = `${d.cell[0]},${d.cell[1]}`;
    if (!doorsByCell.has(ck)) doorsByCell.set(ck, []);
    doorsByCell.get(ck).push(d);
  }

  const rowsByCol = new Map();
  for (let mc = minC; mc <= maxC; mc++) {
    const rs = mapRoom.allCells
      .filter(([c]) => c === mc)
      .map(([, r]) => r)
      .sort((a, b) => a - b);
    rowsByCol.set(mc, rs);
  }

  const hasCell = (mc, mr) => mapRoom.cellSet.has(`${mc},${mr}`);
  const isBossCell = (mc, mr) => mapRoom.bossSet.has(`${mc},${mr}`);
  const isBossUpper = (mc, mr) => isBossCell(mc, mr) && mr === bossUpperMr;
  const isSanctuaryCell = (mc, mr) => `${mc},${mr}` === mapRoom.sanctuaryKey;
  const isSecretCell = (mc, mr) => `${mc},${mr}` === mapRoom.secretKey;
  const isSecretVault = (mc, mr) => isSecretCell(mc, mr) && hasCell(mc, mr - 1);
  const isSecretBalcony = (mc, mr) => isSecretCell(mc, mr) && hasCell(mc, mr + 1) && !hasCell(mc, mr - 1);
  const isHighDoorBalcony = (mc, mr) => {
    const ds = doorsByCell.get(`${mc},${mr}`);
    return !!(ds && ds.some((d) => d.highLedge));
  };
  const isHighPocket = (mc, mr) => isSecretBalcony(mc, mr) || isHighDoorBalcony(mc, mr);

  // Detect pure 1-story diagonal Grand Staircase columns (`[mr_top, mr_bot]`)
  const grandStairCols = new Map(); // mc -> { dir: 'asc' | 'desc', topR, botR }
  for (let mc = minC; mc <= maxC - 6; mc++) {
    const rs = rowsByCol.get(mc);
    if (rs.length !== 2 || rs[1] !== rs[0] + 1) continue;
    const [rt, rb] = rs;
    const hasSpecial = rs.some((r) => (
      isSanctuaryCell(mc, r)
      || isSecretCell(mc, r)
      || isBossCell(mc, r)
      || doorsByCell.has(`${mc},${r}`)
      || (mc === mapRoom.spine[0][0] && r === mapRoom.spine[0][1])
    ));
    if (hasSpecial) continue;
    const lt = hasCell(mc - 1, rt), rtR = hasCell(mc + 1, rt);
    const lb = hasCell(mc - 1, rb), rbR = hasCell(mc + 1, rb);
    if (lb && !lt && rtR && !rbR) {
      grandStairCols.set(mc, { dir: 'asc', topR: rt, botR: rb });
    } else if (lt && !lb && rbR && !rtR) {
      grandStairCols.set(mc, { dir: 'desc', topR: rt, botR: rb });
    }
  }

  // Stairwell connection between `[mc, rTop]` and `[mc, rTop + 1]`
  const hasStairBetween = (mc, rTop) => {
    if (mc >= maxC - 1) return false;
    if (grandStairCols.has(mc)) return false;
    if (!hasCell(mc, rTop) || !hasCell(mc, rTop + 1)) return false;
    if (isHighPocket(mc, rTop)) return false;
    if (isSecretVault(mc, rTop + 1)) return false;
    return true;
  };
  const stairSideBetween = (mc, rTop) => (((mc + rTop) & 1) === 0 ? 'west' : 'east');

  // Choose 1 clean single-row non-special column for the dedicated Armory Dais (`WeaponPedestal`)
  const targetArmoryMc = minC + Math.max(1, Math.round((maxC - 6 - minC) * 0.38));
  let armoryCell = null;
  let bestArmoryScore = Infinity;
  for (let mc = minC + 1; mc <= maxC - 6; mc++) {
    if (grandStairCols.has(mc)) continue;
    const rs = rowsByCol.get(mc);
    for (const mr of rs) {
      if (mc === mapRoom.spine[0][0] && mr === mapRoom.spine[0][1]) continue;
      if (isSanctuaryCell(mc, mr) || isSecretCell(mc, mr) || isBossCell(mc, mr)) continue;
      if (doorsByCell.has(`${mc},${mr}`)) continue;
      if (isSecretVault(mc, mr + 1) || isHighPocket(mc, mr - 1)) continue;
      if (hasStairBetween(mc, mr - 1) && hasStairBetween(mc, mr)) continue;
      const singleBonus = rs.length === 1 ? 0 : 12;
      const dist = Math.abs(mc - targetArmoryMc) + singleBonus;
      if (dist < bestArmoryScore) {
        bestArmoryScore = dist;
        armoryCell = [mc, mr];
      }
    }
  }

  // Stage accumulators
  const ops = [];
  const rawDecor = [];
  const rawCandles = [];
  const enemies = [];
  const spawners = [];
  const movers = [];
  const blockDrops = {};
  const waterBasins = [];
  const doorAnchors = {};
  const secrets = [];
  const roomSchema = [];
  let sanctuaryAnchor = null;
  let vesselAnchor = null;
  let pedestalAnchor = null;
  let drawbridge = null;
  let gateFoyer = null;

  const op = (fn) => ops.push(fn);
  const addCandle = (tx, row, drop = null) => rawCandles.push([tx, row, drop]);
  const addDeco = (sheet, frame, tx, row, dx = 0, dy = 0) => {
    if (!sheet || !frame) return;
    rawDecor.push({ sheet, frame, x: px(tx) + dx, y: py(row) + dy, _tx: tx, _row: row, _dy: dy });
  };
  const addGear = (tx, row, r, speed, dy, z = 58) => {
    rawDecor.push({ type: 'gear', x: px(tx), y: py(row) + dy, r, speed, z });
  };
  const addHanging = (kind, tx, row, phase = 0) => {
    if (!kind) return;
    if (kind === 'chandelier') {
      rawDecor.push({ type: 'chandelier', x: px(tx), y: py(row) - 260, len: 56, r: 24, phase, _tx: tx, _row: row });
    } else if (kind === 'pendulum') {
      rawDecor.push({ type: 'pendulum', x: px(tx), y: py(row) - 250, len: 96, r: 18, period: 2.8, phase, _tx: tx, _row: row });
    } else if (kind === 'cage') {
      rawDecor.push({ type: 'cage', x: px(tx), y: py(row) - 240, len: 52, phase, _tx: tx, _row: row });
    }
  };
  const addWaterBasin = (x0Tile, x1Tile, floorRow, alpha = 0.78) => {
    if (x1Tile < x0Tile) return;
    waterBasins.push({
      x: x0Tile * TILE,
      y: py(floorRow) - 9,
      w: (x1Tile - x0Tile + 1) * TILE,
      h: 12,
      alpha,
    });
  };
  const addEnemy = (specEntry, x0, x1, floorRow) => {
    if (!specEntry) return;
    const { type, off, variant = 'normal', minOff = 2, maxOff = 17, row = floorRow, h = 3 } = specEntry;
    const tx = x0 + off;
    const base = {
      type,
      tx,
      variant,
      min: x0 + minOff,
      max: x0 + maxOff,
    };
    if (FLYING_ENEMIES.has(type)) {
      enemies.push(Object.assign(base, { ty: row - h }));
    } else {
      enemies.push(Object.assign(base, { row }));
    }
  };

  // Helper to pick roster enemies cleanly per biome
  const pickGround = (idx) => {
    const list = roster.ground || [['skeleton', 'normal']];
    return list[idx % list.length];
  };
  const pickHeavy = (idx) => {
    const list = roster.heavy || roster.ground || [['armor', 'normal']];
    return list[idx % list.length];
  };
  const pickSniper = (idx) => {
    const list = roster.sniper || roster.ground || [['skeleton', 'axe']];
    return list[idx % list.length];
  };
  const pickAerial = (idx) => {
    const list = roster.aerial || [['bat', 'normal']];
    return list[idx % list.length];
  };
  const subDrops = ['dagger', 'axe', 'holy_water', 'cross', 'stopwatch'];

  // Material & palette resolver per column (supports Stage 1 outdoor -> indoor castle transition)
  const colContext = (mc) => {
    if (outdoorUntilCol != null && mc > outdoorUntilCol) {
      return {
        outdoor: false,
        mat: T_STONE,
        theme: indoorCastleTheme,
        props: themePropPalette('throne', indoorCastleTheme),
      };
    }
    const mat = (key === 'graveyard' && mc >= 7 && mc <= 8) ? T_STONE : baseTheme.material;
    return {
      outdoor: !!baseTheme.outdoor,
      mat,
      theme: baseTheme,
      props: themePropPalette(themeKey, baseTheme),
    };
  };

  // Safe landmark offset in `[mc, mr]` avoiding any stairwell in `[mc, mr]`
  const safeCenterOffset = (mc, mr) => {
    const upSide = hasStairBetween(mc, mr - 1) ? stairSideBetween(mc, mr - 1) : null;
    const downSide = hasStairBetween(mc, mr) ? stairSideBetween(mc, mr) : null;
    const stairSide = upSide || downSide;
    if (stairSide === 'east') return 6;  // [2..10] 9-tile buffer clear of East Stairwell (13..17)
    if (stairSide === 'west') return 13; // [9..17] 9-tile buffer clear of West Stairwell (2..6)
    return 10;                           // [6..14] dead-center 9-tile buffer
  };

  // Determine start coordinates (`spine[0]`)
  const [startMc, startMr] = mapRoom.spine[0];
  const startX0 = (startMc - minC) * GRID_CELL_W;
  const startFloorR = gridFloorRow(minR, startMr);
  const startSafeOff = safeCenterOffset(startMc, startMr);
  const startOffset = doorsByCell.has(`${startMc},${startMr}`) ? (startSafeOff - 3) : startSafeOff;
  const startPos = { x: px(startX0 + startOffset), y: py(startFloorR) };
  const checkpoints = [startPos.x];
  const checkpointRows = [startFloorR];

  // Track last combat template so adjacent screens always contrast in silhouette
  let combatCounter = 0;

  // =========================================================================
  // Column-by-Column 2D Architectural Compilation (`mc = minC .. maxC - 2`)
  // (`maxC - 1 .. maxC` compiled together below as the 40-tile 2x2 Boss Sanctum)
  // =========================================================================
  for (let mc = minC; mc <= maxC - 2; mc++) {
    const x0 = (mc - minC) * GRID_CELL_W;
    const x1 = x0 + GRID_CELL_W - 1;
    const rs = rowsByCol.get(mc);
    const ctx = colContext(mc);
    const { mat, props, outdoor } = ctx;
    const progressFrac = (mc - minC) / Math.max(1, colSpan - 6);

    const colDoorsMeta = [];
    const colSecretsMeta = [];
    let colHasSanctuary = false;
    let colIsSaveRoom = false;
    let colArchetype = rs.length >= 3 ? ROOM_ARCHETYPES.SHAFT_VERTICAL : ROOM_ARCHETYPES.CORRIDOR_HORIZONTAL;
    let colPacing = progressFrac < 0.22
      ? PACING_ZONES.INTRO_SAFE
      : (progressFrac < 0.58 ? PACING_ZONES.DEVELOP_HAZARD : PACING_ZONES.TWIST_COMBINATION);

    // ---------------------------------------------------------------------
    // CASE 1: Pure 1-Story Diagonal Grand Staircase Column (`[topR, botR]`)
    // ---------------------------------------------------------------------
    if (grandStairCols.has(mc)) {
      const st = grandStairCols.get(mc);
      const floorTop = gridFloorRow(minR, st.topR);
      const floorBot = gridFloorRow(minR, st.botR);
      const asc = st.dir === 'asc';
      colArchetype = ROOM_ARCHETYPES.SHAFT_VERTICAL;

      const leftLandR = asc ? floorBot : floorTop;
      const rightLandR = asc ? floorTop : floorBot;
      const isGateBridge = key === 'graveyard' && mc === 8;
      if (!isGateBridge) {
        op((lv) => {
          // 5-tile flat landings at both ends (`0..4` and `15..19`) + 10-tile walkable Grand Staircase (`5..15`)
          lv.clear(x0, x0 + 4, 0, leftLandR - 1);
          lv.ground(x0, x0 + 4, leftLandR, mat);
          lv.clear(x0 + 15, x0 + 19, 0, rightLandR - 1);
          lv.ground(x0 + 15, x0 + 19, rightLandR, mat);
          lv.stair(x0 + 5, leftLandR, x0 + 15, rightLandR, { passThrough: false, mat, railing: true });
        });
      }

      // Newel-post monuments on both landings (kept clear of the flat Stage 1 drawbridge approach)
      if (!isGateBridge) {
        addDeco(props.tall[0], props.tall[1], x0 + 2, leftLandR);
        addDeco(props.altTall[0], props.altTall[1], x0 + 17, rightLandR);
      }
      if (isGateBridge) {
        // Stage 1 castle approach, left -> right across the cell:
        //   `0`      flat outdoor stone bridgehead continuing seamlessly from `mc = 7` (`leftLandR`)
        //   `1..10`  grand 10-tile (320px) lowered wooden & iron DRAWBRIDGE over the deep castle moat
        //   `11`     monumental Barbican Gatehouse threshold (`rooms[0]` starts here)
        //   `12..20` the Great Stairway climbing INSIDE the castle Entrance Foyer up to the hall floor (`rightLandR`)
        const bx0 = x0 + 1, bx1 = x0 + 10;
        drawbridge = { x0: bx0, x1: bx1, row: leftLandR, waterRow: leftLandR + 2, floorRow: leftLandR + 4 };
        gateFoyer = { x0: x0 + 11, x1: x0 + 19, floorRow: leftLandR, hallRow: rightLandR };
        op((lv) => {
          lv.clear(x0, x0, 0, leftLandR - 1);
          lv.ground(x0, x0, leftLandR, mat);
          lv.clear(bx0, bx1, 0, leftLandR + 3);
          lv.ground(bx0, bx1, leftLandR + 4, mat);
          lv.fill(bx0, bx1, leftLandR + 2, leftLandR + 3, T_WATER);
          lv.platform(bx0, bx1, leftLandR);
          lv.clear(x0 + 11, x0 + 19, 0, leftLandR - 1);
          lv.ground(x0 + 11, x0 + 19, leftLandR, mat);
          lv.stair(x0 + 12, leftLandR, x0 + 20, rightLandR, { passThrough: false, mat, railing: true });
        });
        // Iconic Barbican Gatehouse archway right at the castle threshold (end of the drawbridge)
        addDeco('arch', 'gate', x0 + 11, leftLandR, 14, 0);
      }
      if (props.sconce) {
        const sc0 = isGateBridge ? x0 + 14 : x0 + 7, sc1 = isGateBridge ? x0 + 18 : x0 + 13;
        addDeco(props.sconce[0], props.sconce[1], sc0, Math.round(leftLandR + (rightLandR - leftLandR) * 0.25), 0, -44);
        addDeco(props.sconce[0], props.sconce[1], sc1, Math.round(leftLandR + (rightLandR - leftLandR) * 0.75), 0, -44);
      }
      if (!isGateBridge) {
        addCandle(x0 + 3, leftLandR);
        addCandle(x0 + 16, rightLandR, 'heart_big');
        // Layered grand-stairway defenders: full-flight stair patrol + upper landing sniper + aerial sentry
        const [gStair, gStairVar] = pickGround(mc);
        const [sStair, sStairVar] = pickSniper(mc + 1);
        const [aType, aVar] = pickAerial(mc + 2);
        addEnemy({ type: gStair, variant: gStairVar, off: 3, minOff: 1, maxOff: 17, row: leftLandR }, x0, x1, floorBot);
        addEnemy({ type: sStair, variant: sStairVar, off: 17, minOff: 15, maxOff: 18, row: rightLandR }, x0, x1, floorBot);
        addEnemy({ type: aType, variant: aVar, off: 10, minOff: 3, maxOff: 16, row: Math.min(leftLandR, rightLandR), h: 3 }, x0, x1, floorBot);
      } else {
        // Keep the grand drawbridge deck obstacle-free for a dramatic castle entrance!
        addCandle(x0 + 11, leftLandR, 'heart_big');
      }

      roomSchema.push(createRoomSchemaEntry({
        room_id: `${key}_c${mc}`,
        archetype: colArchetype,
        pacing_zone: colPacing,
        biome: key,
        x0,
        x1,
        entryRow: leftLandR,
        exitRow: rightLandR,
        minRow: Math.max(0, floorTop - 5),
        maxRow: Math.min(rows - 1, floorBot + 3),
        map_cells: asc ? [[mc, st.botR], [mc, st.topR]] : [[mc, st.topR], [mc, st.botR]],
      }));
      continue;
    }

    // ---------------------------------------------------------------------
    // CASE 2: Multi-Story / Single-Story Cell Stack in Column `mc`
    // ---------------------------------------------------------------------
    const botMr = rs[rs.length - 1];
    for (let ri = 0; ri < rs.length; ri++) {
      const mr = rs[ri];
      const floorR = gridFloorRow(minR, mr);
      const isTopInCol = ri === 0;
      const isBotInCol = mr === botMr;
      const prevOwnedMr = ri > 0 ? rs[ri - 1] : null;
      const hasLeft = hasCell(mc - 1, mr);
      const hasRight = hasCell(mc + 1, mr);
      const stairUp = hasStairBetween(mc, mr - 1) ? stairSideBetween(mc, mr - 1) : null;
      const stairDown = hasStairBetween(mc, mr) ? stairSideBetween(mc, mr) : null;
      const cellDoors = doorsByCell.get(`${mc},${mr}`) || [];
      const isStartCell = mc === startMc && mr === startMr;
      const isSanc = isSanctuaryCell(mc, mr);
      const isArmory = !!(armoryCell && armoryCell[0] === mc && armoryCell[1] === mr);
      const hasSecretVaultBelow = isSecretVault(mc, mr + 1);
      const hasHighPocketAbove = isHighPocket(mc, mr - 1);

      // 2A. Night-Wings High Pocket (`isSecretBalcony` or `isHighDoorBalcony`):
      // No full floor across `x0..x1` — ONLY a centered pass-through balcony 5.0 tiles above `[mc, mr + 1]`!
      if (isHighPocket(mc, mr)) {
        const bOff0 = 6;
        const bOff1 = 14;
        op((lv) => {
          lv.clear(x0, x1, Math.max(0, floorR - 4), floorR);
          lv.platform(x0 + bOff0, x0 + bOff1, floorR);
          if (!hasLeft && mc > minC) lv.fill(x0, x0, 0, floorR, mat);
          if (!hasRight && mc < maxC) lv.fill(x1, x1, 0, floorR, mat);
        });

        if (props.sconce) {
          addDeco(props.sconce[0], props.sconce[1], x0 + 7, floorR, 0, -42);
          addDeco(props.sconce[0], props.sconce[1], x0 + 13, floorR, 0, -42);
        }

        if (isSecretBalcony(mc, mr)) {
          const tells = [VISUAL_TELLS.VISIBLE_REWARD, VISUAL_TELLS.PROP_CONTINUATION];
          vesselAnchor = {
            col: x0 + 10,
            row: floorR,
            highBalcony: true,
            visualTells: tells,
          };
          const secEntry = {
            secret_id: `${key}_vessel`,
            position: { x: 10, y: floorR },
            world_col: x0 + 10,
            lock_type: 'DOUBLE_JUMP',
            visual_tell: tells[0],
            visual_tells: tells,
          };
          secrets.push(secEntry);
          colSecretsMeta.push(secEntry);
          addCandle(x0 + 7, floorR, 'meat');
          addCandle(x0 + 13, floorR, 'heart_big');
        } else {
          const d = cellDoors[0];
          const gateCol = x0 + 10;
          doorAnchors[d.id] = {
            col: gateCol,
            floorRow: floorR + GRID_CELL_H,
            gateRow: floorR,
            highLedge: true,
          };
          colDoorsMeta.push({
            door_id: d.id,
            position: { x: 10, y: floorR },
            world_col: gateCol,
            target_room: d.targetKey,
            lock_type: 'DOUBLE_JUMP',
            safe_buffer_verified: true,
          });
          colArchetype = ROOM_ARCHETYPES.LANDMARK_GATE;
          addCandle(x0 + 6, floorR, 'heart_big');
          addCandle(x0 + 14, floorR);
        }
        continue;
      }

      // 2B. Base Floor & Perimeter Curtain Walls for Walkable Cell `[mc, mr]`
      const isOutdoorVista = isBotInCol && outdoor && (
        (key === 'graveyard' && mc === 7)
        || (key === 'skykeep' && (mc === 7 || mc === 16 || mc === 20))
        || (key === 'ramparts' && (mc === 16 || mc === 24))
        || (key === 'yule' && (mc === 4 || mc === 14))
        || (key === 'darkwood' && mc === 12)
      );

      op((lv) => {
        const clearTop = isTopInCol ? 0 : (gridFloorRow(minR, prevOwnedMr) + 1);
        lv.clear(x0, x1, clearTop, floorR - 1);

        if (isBotInCol) {
          if (isOutdoorVista) lv.bridge(x0, x1, floorR, mat);
          else lv.ground(x0, x1, floorR, mat);
        } else {
          // Upper story deck: 1-tile-thick masonry floor so stories below remain open!
          lv.fill(x0, x1, floorR, floorR, mat);
        }

        // Pass-through stairwell cover in `[mc, mr]`'s floor connecting down to `[mc, mr + 1]`
        if (stairDown === 'west') {
          lv.platform(x0 + 2, x0 + 6, floorR);
        } else if (stairDown === 'east') {
          lv.platform(x0 + 13, x0 + 17, floorR);
        }

        // Breakable 4-tile hatch in `[mc, mr]`'s floor above a Sunken Secret Vault `[mc, mr + 1]`
        if (hasSecretVaultBelow) {
          lv.fill(x0 + 7, x0 + 10, floorR, floorR, T_BLOCK);
        }

        // Full walkable inter-story staircase inside `[mc, mr]` climbing up to `[mc, mr - 1]`
        if (stairUp === 'west') {
          lv.stair(x0 + 2, floorR, x0 + 7, floorR - 5, { passThrough: true, mat, railing: true });
        } else if (stairUp === 'east') {
          lv.stair(x0 + 13, floorR - 5, x0 + 18, floorR, { passThrough: true, mat, railing: true });
        }

        // Continuous non-climbable perimeter curtain walls at non-connected cell edges
        const wallTop = prevOwnedMr != null ? (gridFloorRow(minR, prevOwnedMr) + 1) : 0;
        if (!hasLeft && mc > minC) lv.fill(x0, x0, wallTop, floorR, mat);
        if (!hasRight && mc < maxC) lv.fill(x1, x1, wallTop, floorR, mat);
      });

      // 2C. Sunken Secret Vault Interior (`isSecretVault`)
      if (isSecretVault(mc, mr)) {
        op((lv) => {
          // Walkable staircase climbing up to a landing right beneath the `7..10` ceiling hatch
          lv.stair(x0 + 4, floorR, x0 + 7, floorR - 3, { passThrough: true, mat, railing: true });
          lv.platform(x0 + 7, x0 + 10, floorR - 3);
        });
        const tells = [
          VISUAL_TELLS.SPRITE_VARIANT_CRACKED,
          VISUAL_TELLS.PROP_CONTINUATION,
          VISUAL_TELLS.VISIBLE_REWARD,
          VISUAL_TELLS.CAMERA_BLEED,
        ];
        vesselAnchor = {
          col: x0 + 14,
          row: floorR,
          highBalcony: false,
          visualTells: tells,
        };
        const secEntry = {
          secret_id: `${key}_vessel`,
          position: { x: 14, y: floorR },
          world_col: x0 + 14,
          lock_type: 'NONE',
          visual_tell: tells[0],
          visual_tells: tells,
        };
        secrets.push(secEntry);
        colSecretsMeta.push(secEntry);
        addDeco(props.tall[0], props.tall[1], x0 + 3, floorR);
        addDeco(props.tall[0], props.tall[1], x0 + 17, floorR);
        if (props.sconce) {
          addDeco(props.sconce[0], props.sconce[1], x0 + 12, floorR, 0, -42);
          addDeco(props.sconce[0], props.sconce[1], x0 + 16, floorR, 0, -42);
        }
        addCandle(x0 + 12, floorR, 'meat');
        addCandle(x0 + 16, floorR, 'holy_water');
        continue;
      }

      // 2D. Pre-Boss Save Sanctum (`mc === maxC - 2`)
      if (mc === maxC - 2) {
        colArchetype = ROOM_ARCHETYPES.BUFFER_TRANSITION;
        colPacing = PACING_ZONES.SAVE_SANCTUM;
        colIsSaveRoom = true;
        checkpoints.push(px(x0 + 4));
        checkpointRows.push(floorR);

        // Raised central rest altar with flanking stairs & hidden Wall-Meat block
        op((lv) => {
          const daisOpts = { passThrough: false, mat, railing: false, clearAbove: false, fillBottom: isBotInCol ? undefined : floorR };
          lv.fill(x0 + 8, x0 + 12, floorR - 1, floorR - 1, mat);
          lv.stair(x0 + 7, floorR, x0 + 8, floorR - 1, daisOpts);
          lv.stair(x0 + 13, floorR - 1, x0 + 14, floorR, daisOpts);
          lv.set(x0 + 10, floorR - 1, T_BLOCK);
        });
        blockDrops[`${x0 + 10},${floorR - 1}`] = 'meat';

        addDeco(props.tall[0], props.tall[1], x0 + 4, floorR);
        addDeco(props.tall[0], props.tall[1], x0 + 16, floorR);
        addDeco(props.focal[0], props.focal[1], x0 + 6, floorR);
        addDeco(props.focal[0], props.focal[1], x0 + 14, floorR);
        if (props.sconce) {
          addDeco(props.sconce[0], props.sconce[1], x0 + 7, floorR, 0, -46);
          addDeco(props.sconce[0], props.sconce[1], x0 + 13, floorR, 0, -46);
        }
        addHanging(props.hanging, x0 + 10, floorR, 0.5);
        addCandle(x0 + 5, floorR, 'heart_big');
        addCandle(x0 + 10, floorR - 1, subDrops[id % subDrops.length]);
        addCandle(x0 + 15, floorR, 'heart_big');
        continue;
      }

      // 2E. Biome Sanctuary Chapel (`isSanc`: calm fast-travel shrine, `0` enemies)
      if (isSanc) {
        colArchetype = ROOM_ARCHETYPES.BUFFER_TRANSITION;
        colPacing = PACING_ZONES.INTRO_SAFE;
        colHasSanctuary = true;
        const sOff = safeCenterOffset(mc, mr);
        const sCol = x0 + sOff;
        sanctuaryAnchor = { col: sCol, row: floorR };
        checkpoints.push(px(sCol));
        checkpointRows.push(floorR);

        addDeco(props.tall[0], props.tall[1], sCol - 4, floorR);
        addDeco(props.tall[0], props.tall[1], sCol + 4, floorR);
        if (props.sconce) {
          addDeco(props.sconce[0], props.sconce[1], sCol - 3, floorR, 0, -44);
          addDeco(props.sconce[0], props.sconce[1], sCol + 3, floorR, 0, -44);
        }
        addHanging(props.hanging, sCol, floorR, 1.1);
        addCandle(sCol - 4, floorR, 'heart_big');
        addCandle(sCol + 4, floorR, 'heart_big');
        if (key === 'aqueduct' || key === 'skykeep' || key === 'cathedral') {
          addWaterBasin(sCol - 3, sCol + 3, floorR, 0.72);
        }
        continue;
      }

      // 2F. Portal Vestibule (`cellDoors.length > 0`, non-highLedge doorway)
      if (cellDoors.length > 0) {
        const d = cellDoors[0];
        const gOff = safeCenterOffset(mc, mr);
        const gateCol = x0 + gOff;
        doorAnchors[d.id] = {
          col: gateCol,
          floorRow: floorR,
          gateRow: floorR,
          highLedge: false,
        };
        colDoorsMeta.push({
          door_id: d.id,
          position: { x: gOff, y: floorR },
          world_col: gateCol,
          target_room: d.targetKey,
          lock_type: d.gateRelic || 'NONE',
          safe_buffer_verified: true,
        });
        colArchetype = ROOM_ARCHETYPES.LANDMARK_GATE;
        colPacing = PACING_ZONES.MASTERY_REWARD;

        // Symmetrical architectural portal framing
        addDeco(props.tall[0], props.tall[1], gateCol - 4, floorR);
        addDeco(props.altTall[0], props.altTall[1], gateCol + 4, floorR);
        if (props.sconce) {
          addDeco(props.sconce[0], props.sconce[1], gateCol - 3, floorR, 0, -44);
          addDeco(props.sconce[0], props.sconce[1], gateCol + 3, floorR, 0, -44);
        }
        addHanging(props.hanging, gateCol, floorR, 0.3);
        addCandle(gateCol - 4, floorR, 'heart_big');
        addCandle(gateCol + 4, floorR);
        if (key === 'aqueduct') {
          addWaterBasin(Math.max(x0 + 2, gateCol - 4), gateCol - 2, floorR, 0.76);
          addWaterBasin(gateCol + 2, Math.min(x1 - 2, gateCol + 4), floorR, 0.76);
        }
        continue;
      }

      // 2G. Dedicated Armory Dais (`isArmory`: stepped ceremonial weapon pedestal chamber)
      if (isArmory) {
        colArchetype = ROOM_ARCHETYPES.LANDMARK_GATE;
        colPacing = PACING_ZONES.MASTERY_REWARD;
        const pCol = x0 + 10;
        const pRow = floorR - 1;
        // 9-tile raised 1-step stone dais (`[6..14]`) with smooth flanking stairs
        op((lv) => {
          const daisOpts = { passThrough: false, mat, railing: false, clearAbove: false, fillBottom: isBotInCol ? undefined : floorR };
          lv.fill(x0 + 6, x0 + 14, pRow, floorR, mat);
          lv.stair(x0 + 5, floorR, x0 + 6, pRow, daisOpts);
          lv.stair(x0 + 15, pRow, x0 + 16, floorR, daisOpts);
        });
        pedestalAnchor = { col: pCol, row: pRow };

        addDeco(props.tall[0], props.tall[1], x0 + 4, floorR);
        addDeco(props.tall[0], props.tall[1], x0 + 16, floorR);
        if (!outdoor) {
          addDeco('arch', 'banner', x0 + 7, pRow, 0, -48);
          addDeco('arch', 'banner', x0 + 13, pRow, 0, -48);
        }
        if (props.sconce) {
          addDeco(props.sconce[0], props.sconce[1], x0 + 8, pRow, 0, -44);
          addDeco(props.sconce[0], props.sconce[1], x0 + 12, pRow, 0, -44);
        }
        addHanging(props.hanging, pCol, pRow, 0.9);
        addCandle(x0 + 6, pRow, 'heart_big');
        addCandle(x0 + 14, pRow, 'money');
        continue;
      }

      // 2H. Opening Parvis (`isStartCell` without a door: atmospheric stage threshold)
      if (isStartCell) {
        colArchetype = ROOM_ARCHETYPES.BUFFER_TRANSITION;
        colPacing = PACING_ZONES.OPENING_THRESHOLD;

        addDeco(props.tall[0], props.tall[1], x0 + 2, floorR);
        addDeco(props.altTall[0], props.altTall[1], x0 + 10, floorR);
        addDeco(props.tall[0], props.tall[1], x0 + 17, floorR);
        addDeco(props.low[0], props.low[1], x0 + 6, floorR);
        addDeco(props.low[0], props.low[1], x0 + 14, floorR);
        if (props.sconce) {
          addDeco(props.sconce[0], props.sconce[1], x0 + 6, floorR, 0, -46);
          addDeco(props.sconce[0], props.sconce[1], x0 + 14, floorR, 0, -46);
        }
        addCandle(x0 + 8, floorR, 'dagger');
        addCandle(x0 + 15, floorR, 'heart_big');
        continue;
      }

      // 2I. Skylight Atrium Hall (`hasHighPocketAbove`) or Vault Antechamber (`hasSecretVaultBelow`)
      if (hasHighPocketAbove) {
        colArchetype = ROOM_ARCHETYPES.LANDMARK_GATE;
        colPacing = PACING_ZONES.MASTERY_REWARD;

        // Vertical guide chains descending into the atrium to draw the eye up to the high balcony
        addDeco('arch', 'chain', x0 + 6, floorR - 3, 0, -36);
        addDeco('arch', 'chain', x0 + 14, floorR - 3, 0, -36);
        if (!stairUp && !stairDown) {
          addDeco(props.tall[0], props.tall[1], x0 + 3, floorR);
          addDeco(props.tall[0], props.tall[1], x0 + 17, floorR);
        }
        if (props.sconce) {
          addDeco(props.sconce[0], props.sconce[1], x0 + 4, floorR, 0, -44);
          addDeco(props.sconce[0], props.sconce[1], x0 + 16, floorR, 0, -44);
        }
        addCandle(x0 + 8, floorR, 'heart_big');
        addCandle(x0 + 12, floorR);
        const [gType, gVar] = pickGround(mc + mr);
        const [aSky, aSkyVar] = pickAerial(mc + mr + 1);
        addEnemy({ type: gType, variant: gVar, off: 10, minOff: 7, maxOff: 12 }, x0, x1, floorR);
        addEnemy({ type: aSky, variant: aSkyVar, off: 8, minOff: 5, maxOff: 14, h: 3 }, x0, x1, floorR);
        if (!stairUp && !stairDown) {
          const [hSky, hSkyVar] = pickHeavy(mc + mr + 2);
          addEnemy({ type: hSky, variant: hSkyVar, off: 15, minOff: 13, maxOff: 17 }, x0, x1, floorR);
        }
        continue;
      }

      if (hasSecretVaultBelow) {
        colArchetype = ROOM_ARCHETYPES.CORRIDOR_HORIZONTAL;
        colPacing = PACING_ZONES.MASTERY_REWARD;
        blockDrops[`${x0 + 8},${floorR}`] = 'money';
        // Explicit visual tells framing the fissured `7..10` floor hatch (`PROP_CONTINUATION` + `SPRITE_VARIANT_CRACKED`)
        addDeco('arch', 'chain', x0 + 9, floorR + 2, 0, -48);
        if (!stairUp && !stairDown) {
          addDeco(props.altTall[0], props.altTall[1], x0 + 4, floorR);
          addDeco(props.altTall[0], props.altTall[1], x0 + 14, floorR);
        }
        if (props.sconce) {
          addDeco(props.sconce[0], props.sconce[1], x0 + 6, floorR, 0, -44);
          addDeco(props.sconce[0], props.sconce[1], x0 + 12, floorR, 0, -44);
        }
        addCandle(x0 + 6, floorR, 'heart_big');
        const [aType, aVar] = pickAerial(mc + mr);
        addEnemy({ type: aType, variant: aVar, off: 9, minOff: 5, maxOff: 15, h: 3 }, x0, x1, floorR);
        if (!stairDown) {
          const [gVault, gVaultVar] = pickGround(mc + mr + 1);
          addEnemy({ type: gVault, variant: gVaultVar, off: 15, minOff: 12, maxOff: 17 }, x0, x1, floorR);
        }
        if (!stairUp && !stairDown) {
          const [sVault, sVaultVar] = pickSniper(mc + mr + 2);
          addEnemy({ type: sVault, variant: sVaultVar, off: 4, minOff: 2, maxOff: 6 }, x0, x1, floorR);
        }
        continue;
      }

      // 2J. Multi-Story Tower Shaft Chamber (`stairUp || stairDown` in a vertical shaft or overlapping gallery)
      if (stairUp || stairDown) {
        if (rs.length >= 3) colArchetype = ROOM_ARCHETYPES.SHAFT_VERTICAL;
        const centerOff = 9;
        if (key === 'clocktower') {
          addGear(x0 + 10, floorR, (mr & 1) ? 34 : 44, (mr & 1) ? 0.52 : -0.45, -76, 64);
        } else if (!outdoor) {
          addDeco('arch', 'banner', x0 + 10, floorR, 0, -48);
        }
        if (!hasSecretVaultBelow) {
          addDeco(props.focal[0], props.focal[1], x0 + centerOff, floorR);
        }
        if (props.sconce) {
          addDeco(props.sconce[0], props.sconce[1], x0 + 8, floorR, 0, -42);
          addDeco(props.sconce[0], props.sconce[1], x0 + 11, floorR, 0, -42);
        }
        addCandle(x0 + 11, floorR, (mr & 1) === 0 ? 'heart_big' : null);

        // Disciplined patrol inside solid central deck `[7..12]` + shaft aerial + unblocked wing guard
        const [gType, gVar] = (mr + mc) % 3 === 0 ? pickHeavy(mc + mr) : pickGround(mc + mr);
        const [aType, aVar] = pickAerial(mc + mr + 1);
        addEnemy({ type: gType, variant: gVar, off: 9, minOff: 7, maxOff: 12 }, x0, x1, floorR);
        addEnemy({ type: aType, variant: aVar, off: 10, minOff: 6, maxOff: 14, h: 3 }, x0, x1, floorR);
        if (stairUp !== 'east' && stairDown !== 'east') {
          const [sShaft, sShaftVar] = pickSniper(mc + mr + 2);
          addEnemy({ type: sShaft, variant: sShaftVar, off: 15, minOff: 13, maxOff: 17 }, x0, x1, floorR);
        } else if (stairUp !== 'west' && stairDown !== 'west') {
          const [sShaft, sShaftVar] = pickSniper(mc + mr + 2);
          addEnemy({ type: sShaft, variant: sShaftVar, off: 4, minOff: 2, maxOff: 6 }, x0, x1, floorR);
        }
        continue;
      }

      // 2J-bis. Stage 1 Ceremonial Castle Gate Approach (`key === 'graveyard' && mc === 7`):
      // Flat, obstacle-free stone causeway with 3D viaduct arches underneath and zero pits/spikes/enemies,
      // building dramatic anticipation right before the hunter steps onto the grand Castle Drawbridge (`mc === 8`).
      if (key === 'graveyard' && mc === 7) {
        colArchetype = ROOM_ARCHETYPES.BUFFER_TRANSITION;
        colPacing = PACING_ZONES.INTRO_SAFE;
        addDeco('arch', 'column', x0 + 3, floorR);
        addDeco('arch', 'column', x0 + 9, floorR);
        addDeco('arch', 'column', x0 + 15, floorR);
        addDeco('props', 'torch', x0 + 6, floorR, 0, -44);
        addDeco('props', 'torch', x0 + 12, floorR, 0, -44);
        addDeco('props', 'torch', x0 + 18, floorR, 0, -44);
        addCandle(x0 + 6, floorR, 'heart_big');
        addCandle(x0 + 12, floorR);
        addCandle(x0 + 18, floorR, 'heart_big');
        continue;
      }

      // 2K. Pre-Boss Accordion Gauntlet (`mc === maxC - 5, maxC - 4, maxC - 3`)
      const isAccordion1 = mc === maxC - 5;
      const isAccordion2 = mc === maxC - 4;
      const isAccordion3 = mc === maxC - 3;
      if (isAccordion1 || isAccordion2 || isAccordion3) {
        colPacing = PACING_ZONES.PRE_BOSS_ACCORDION;
      }

      // Choose 1 of 4 contrasting architectural room templates (never repeating adjacent templates!)
      let tpl;
      if (isAccordion1) tpl = 'COLONNADE_NAVE';
      else if (isAccordion2) tpl = 'SUNKEN_HAZARD_COURT';
      else if (isAccordion3) tpl = 'TWIN_BALCONY_AMPHITHEATER';
      else if (isOutdoorVista) tpl = 'VIADUCT_PROMENADE';
      else {
        const order = ['COLONNADE_NAVE', 'TWIN_BALCONY_AMPHITHEATER', 'SUNKEN_HAZARD_COURT', 'VIADUCT_PROMENADE'];
        tpl = order[(combatCounter++) % order.length];
      }

      if (tpl === 'COLONNADE_NAVE') {
        colArchetype = ROOM_ARCHETYPES.CORRIDOR_HORIZONTAL;
        const spikedNave = ((mc + mr) & 1) === 1;
        if (spikedNave) {
          // Wide 14-tile Spiked Nave Chasm (`x0 + 3 .. x0 + 16`) with 3 spaced 2-tile floating platforms
          // separated by 3-tile open air gaps (`96px`) over the spikes so the player must jump platform-to-platform!
          const openCenterHole = isBotInCol && (mc % 3 === 0);
          op((lv) => {
            lv.clear(x0 + 3, x0 + 16, floorR, floorR + 1);
            lv.ground(x0 + 3, x0 + 16, floorR + 2, mat);
            lv.fill(x0 + 3, x0 + 16, floorR + 1, floorR + 1, T_SPIKES);
            if (openCenterHole) {
              lv.clear(x0 + 8, x0 + 11, floorR, rows - 1);
            }
            lv.platform(x0 + 4, x0 + 5, floorR - 1);
            lv.platform(x0 + 9, x0 + 10, floorR - 2);
            lv.platform(x0 + 14, x0 + 15, floorR - 1);
          });
          addDeco(props.tall[0], props.tall[1], x0 + 1, floorR);
          addDeco(props.tall[0], props.tall[1], x0 + 18, floorR);
          if (props.sconce) {
            addDeco(props.sconce[0], props.sconce[1], x0 + 2, floorR, 0, -46);
            addDeco(props.sconce[0], props.sconce[1], x0 + 17, floorR, 0, -46);
          }
          addHanging(props.hanging, x0 + 10, floorR, (mc * 0.9) % 6.28);
          addCandle(x0 + 5, floorR - 1, 'heart_big');
          addCandle(x0 + 10, floorR - 2, rng() < 0.35 ? subDrops[(mc + id) % subDrops.length] : 'money');
          addCandle(x0 + 15, floorR - 1);

          const [gType, gVar] = pickGround(mc);
          const [sType, sVar] = pickSniper(mc + 1);
          const [hType, hVar] = colPacing === PACING_ZONES.INTRO_SAFE ? pickGround(mc + 2) : pickHeavy(mc + 2);
          const [aType, aVar] = pickAerial(mc + 3);
          addEnemy({ type: gType, variant: gVar, off: 2, minOff: 1, maxOff: 2 }, x0, x1, floorR);
          addEnemy({ type: sType, variant: sVar, off: 10, minOff: 9, maxOff: 10, row: floorR - 2 }, x0, x1, floorR);
          addEnemy({ type: hType, variant: hVar, off: 18, minOff: 17, maxOff: 18 }, x0, x1, floorR);
          addEnemy({ type: aType, variant: aVar, off: 12, minOff: 4, maxOff: 16, row: floorR - 1, h: 3 }, x0, x1, floorR);
        } else {
          // Twin 5-tile flanking spike trenches (`x0 + 3..7` and `x0 + 12..16`) around a central island pillar (`x0 + 8..11`),
          // with spaced 2-tile floating platforms (`x0 + 4..5` and `x0 + 14..15`) required to clear each spike moat!
          op((lv) => {
            lv.clear(x0 + 3, x0 + 7, floorR, floorR + 1);
            lv.ground(x0 + 3, x0 + 7, floorR + 2, mat);
            lv.fill(x0 + 3, x0 + 7, floorR + 1, floorR + 1, T_SPIKES);
            lv.clear(x0 + 12, x0 + 16, floorR, floorR + 1);
            lv.ground(x0 + 12, x0 + 16, floorR + 2, mat);
            lv.fill(x0 + 12, x0 + 16, floorR + 1, floorR + 1, T_SPIKES);
            lv.platform(x0 + 4, x0 + 5, floorR - 1);
            lv.platform(x0 + 9, x0 + 10, floorR - 2);
            lv.platform(x0 + 14, x0 + 15, floorR - 1);
          });
          addDeco(props.tall[0], props.tall[1], x0 + 1, floorR);
          addDeco(props.focal[0], props.focal[1], x0 + 9, floorR);
          addDeco(props.tall[0], props.tall[1], x0 + 18, floorR);
          if (props.sconce) {
            addDeco(props.sconce[0], props.sconce[1], x0 + 2, floorR, 0, -46);
            addDeco(props.sconce[0], props.sconce[1], x0 + 17, floorR, 0, -46);
          }
          addHanging(props.hanging, x0 + 10, floorR, (mc * 0.9) % 6.28);
          addCandle(x0 + 5, floorR - 1, 'heart_big');
          addCandle(x0 + 10, floorR - 2, rng() < 0.35 ? subDrops[(mc + id) % subDrops.length] : 'money');

          const [gType, gVar] = pickGround(mc);
          const [sType, sVar] = pickSniper(mc + 1);
          const [hType, hVar] = colPacing === PACING_ZONES.INTRO_SAFE ? pickGround(mc + 2) : pickHeavy(mc + 2);
          const [aType, aVar] = pickAerial(mc + 3);
          addEnemy({ type: gType, variant: gVar, off: 9, minOff: 8, maxOff: 11 }, x0, x1, floorR);
          addEnemy({ type: sType, variant: sVar, off: 10, minOff: 9, maxOff: 10, row: floorR - 2 }, x0, x1, floorR);
          addEnemy({ type: hType, variant: hVar, off: 18, minOff: 17, maxOff: 18 }, x0, x1, floorR);
          addEnemy({ type: aType, variant: aVar, off: 12, minOff: 4, maxOff: 16, row: floorR - 1, h: 3 }, x0, x1, floorR);
        }
        if (roster.spawner && (mc % 2 === 0)) {
          spawners.push({ type: roster.spawner, x0: x0 + 2, x1: x1 - 2, variant: roster.spawnerVariant || 'normal' });
        }
      } else if (tpl === 'TWIN_BALCONY_AMPHITHEATER') {
        // Set-piece combat hall: wide 14-tile spike & chasm pit (`x0 + 3 .. x0 + 16`) spanned by two spaced
        // outer floating platforms (`x0 + 4..5`, `x0 + 14..15`) and a central moving platform (`x0 + 7..12`)!
        colArchetype = ROOM_ARCHETYPES.ARENA_COMBAT;
        const openPitHole = isBotInCol && ((mc + id) % 2 === 0);
        op((lv) => {
          lv.clear(x0 + 3, x0 + 16, floorR, floorR + 1);
          lv.ground(x0 + 3, x0 + 16, floorR + 2, mat);
          lv.fill(x0 + 3, x0 + 16, floorR + 1, floorR + 1, T_SPIKES);
          if (openPitHole) {
            lv.clear(x0 + 8, x0 + 11, floorR, rows - 1);
          }
          // Spaced entry/exit floating platforms + high side balconies
          lv.platform(x0 + 4, x0 + 5, floorR - 1);
          lv.platform(x0 + 14, x0 + 15, floorR - 1);
          lv.platform(x0 + 1, x0 + 3, floorR - 3);
          lv.platform(x0 + 16, x0 + 18, floorR - 3);
        });
        movers.push({
          kind: 'linear',
          tiles: 2,
          x0: (x0 + 7) * TILE + 16,
          y0: py(floorR - 2),
          x1: (x0 + 12) * TILE + 16,
          y1: py(floorR - 2),
          period: 3.8,
          phase: (mc * 0.29) % 1,
          dwell: 0.12,
        });
        addDeco(props.low[0], props.low[1], x0 + 1, floorR);
        addDeco(props.low[0], props.low[1], x0 + 18, floorR);
        if (key === 'cathedral') {
          addDeco('stained_glass', ['rose', 'hunter', 'moon'][mc % 3], x0 + 10, floorR, 0, -72);
        }
        if (props.sconce) {
          addDeco(props.sconce[0], props.sconce[1], x0 + 2, floorR, 0, -46);
          addDeco(props.sconce[0], props.sconce[1], x0 + 17, floorR, 0, -46);
        }
        addHanging(props.hanging, x0 + 10, floorR, 1.4);
        addCandle(x0 + 5, floorR - 1, 'heart_big');
        addCandle(x0 + 14, floorR - 1, isAccordion3 ? 'meat' : 'money');
        addCandle(x0 + 2, floorR - 3);

        const [sLeft, sLeftVar] = pickSniper(mc);
        const [hType, hVar] = pickHeavy(mc + 1);
        const [gRight, gRightVar] = pickGround(mc + 3);
        addEnemy({ type: sLeft, variant: sLeftVar, off: 5, minOff: 4, maxOff: 5, row: floorR - 1 }, x0, x1, floorR);
        addEnemy({ type: hType, variant: hVar, off: 2, minOff: 1, maxOff: 2 }, x0, x1, floorR);
        addEnemy({ type: gRight, variant: gRightVar, off: 18, minOff: 17, maxOff: 18 }, x0, x1, floorR);
        if (colPacing !== PACING_ZONES.INTRO_SAFE) {
          const [aAmp, aAmpVar] = pickAerial(mc + 4);
          addEnemy({ type: aAmp, variant: aAmpVar, off: 10, minOff: 4, maxOff: 16, h: 4 }, x0, x1, floorR);
        }
        if (roster.spawner && (mc % 3 === 1)) {
          spawners.push({ type: roster.spawner, x0: x0 + 2, x1: x1 - 2, variant: roster.spawnerVariant || 'normal' });
        }
      } else if (tpl === 'SUNKEN_HAZARD_COURT') {
        // Wide 14-tile Sunken Hazard Court (`x0 + 3 .. x0 + 16`) with spikes, holes, and spaced floating & moving platforms
        colArchetype = ROOM_ARCHETYPES.CORRIDOR_HORIZONTAL;
        const useLava = key === 'darkcave';
        const useWater = key === 'aqueduct' || key === 'ossuary';
        const useFerry = isAccordion2 || ((mc & 1) === 0) || key === 'skykeep' || key === 'ramparts' || key === 'yule' || key === 'clocktower';

        if (useLava) {
          op((lv) => {
            lv.clear(x0 + 3, x0 + 16, floorR, floorR + 1);
            lv.ground(x0 + 3, x0 + 16, floorR + 2, mat);
            lv.fill(x0 + 3, x0 + 6, floorR + 1, floorR + 1, T_SPIKES);
            lv.fill(x0 + 7, x0 + 12, floorR + 1, floorR + 1, T_LAVA);
            lv.fill(x0 + 13, x0 + 16, floorR + 1, floorR + 1, T_SPIKES);
            lv.platform(x0 + 4, x0 + 5, floorR - 1);
            lv.platform(x0 + 9, x0 + 10, floorR - 2);
            lv.platform(x0 + 14, x0 + 15, floorR - 1);
          });
          addCandle(x0 + 10, floorR - 2, 'heart_big');
        } else if (useWater) {
          op((lv) => {
            lv.clear(x0 + 3, x0 + 16, floorR, floorR + 1);
            lv.ground(x0 + 3, x0 + 16, floorR + 2, mat);
            lv.fill(x0 + 3, x0 + 6, floorR + 1, floorR + 1, T_SPIKES);
            lv.fill(x0 + 7, x0 + 12, floorR + 1, floorR + 1, T_WATER);
            lv.fill(x0 + 13, x0 + 16, floorR + 1, floorR + 1, T_SPIKES);
            lv.platform(x0 + 4, x0 + 5, floorR - 1);
            lv.platform(x0 + 9, x0 + 10, floorR - 2);
            lv.platform(x0 + 14, x0 + 15, floorR - 1);
          });
          addWaterBasin(x0 + 7, x0 + 12, floorR + 1, 0.82);
          addCandle(x0 + 10, floorR - 2, 'heart_big');
        } else if (useFerry) {
          op((lv) => {
            lv.clear(x0 + 3, x0 + 16, floorR, floorR + 1);
            lv.ground(x0 + 3, x0 + 16, floorR + 2, mat);
            lv.fill(x0 + 3, x0 + 16, floorR + 1, floorR + 1, T_SPIKES);
            if (isBotInCol) {
              // Deep abyssal chasm hole in the center of the wide spike court
              lv.clear(x0 + 8, x0 + 11, floorR, rows - 1);
            }
            lv.platform(x0 + 4, x0 + 5, floorR - 1);
            lv.platform(x0 + 14, x0 + 15, floorR - 1);
          });
          movers.push({
            kind: 'linear',
            tiles: 2,
            x0: (x0 + 7) * TILE + 16,
            y0: py(floorR - 2),
            x1: (x0 + 12) * TILE + 16,
            y1: py(floorR - 2),
            period: 3.6,
            phase: (mc * 0.35) % 1,
            dwell: 0.14,
          });
          addCandle(x0 + 5, floorR - 1, 'heart_big');
          addCandle(x0 + 15, floorR - 1, subDrops[(mc + 2) % subDrops.length]);
        } else {
          // 14-tile spike & chasm court crossed by 3 spaced 2-tile floating platforms (3-tile open air gaps between each)
          op((lv) => {
            lv.clear(x0 + 3, x0 + 16, floorR, floorR + 1);
            lv.ground(x0 + 3, x0 + 16, floorR + 2, mat);
            lv.fill(x0 + 3, x0 + 16, floorR + 1, floorR + 1, T_SPIKES);
            if (isBotInCol) {
              lv.clear(x0 + 8, x0 + 11, floorR, rows - 1);
            }
            lv.platform(x0 + 4, x0 + 5, floorR - 1);
            lv.platform(x0 + 9, x0 + 10, floorR - 2);
            lv.platform(x0 + 14, x0 + 15, floorR - 1);
          });
          addCandle(x0 + 9, floorR - 2, 'heart_big');
          addCandle(x0 + 5, floorR - 1);
        }

        // Intentional flanking balustrade piers marking BOTH hazard lips!
        addDeco(props.tall[0], props.tall[1], x0 + 1, floorR);
        addDeco(props.tall[0], props.tall[1], x0 + 18, floorR);
        if (props.sconce) {
          addDeco(props.sconce[0], props.sconce[1], x0 + 2, floorR, 0, -46);
          addDeco(props.sconce[0], props.sconce[1], x0 + 17, floorR, 0, -46);
        }
        const [gLeft, gLeftVar] = pickGround(mc);
        const [aType, aVar] = pickAerial(mc + 1);
        const [rType, rVar] = isAccordion2 ? pickHeavy(mc + 3) : pickSniper(mc + 3);
        addEnemy({ type: gLeft, variant: gLeftVar, off: 2, minOff: 1, maxOff: 2 }, x0, x1, floorR);
        addEnemy({ type: aType, variant: aVar, off: 9, minOff: 4, maxOff: 15, h: 3 }, x0, x1, floorR);
        if (colPacing !== PACING_ZONES.INTRO_SAFE) {
          const [aType2, aVar2] = pickAerial(mc + 2);
          addEnemy({ type: aType2, variant: aVar2, off: 13, minOff: 5, maxOff: 16, h: 4 }, x0, x1, floorR);
        }
        addEnemy({ type: rType, variant: rVar, off: 18, minOff: 17, maxOff: 18 }, x0, x1, floorR);
        if (roster.spawner && (mc % 3 === 2)) {
          spawners.push({ type: roster.spawner, x0: x0 + 2, x1: x1 - 2, variant: roster.spawnerVariant || 'normal' });
        }
      } else {
        // `VIADUCT_PROMENADE`: wide 14-tile broken viaduct chasm & spike gauntlet (`x0 + 3 .. x0 + 16`)
        // crossed by spaced 2-tile floating platforms (`x0 + 4..5`, `x0 + 14..15`) and a central moving ferry!
        colArchetype = ROOM_ARCHETYPES.CORRIDOR_HORIZONTAL;
        op((lv) => {
          // Left chasm hole (`x0 + 3 .. x0 + 6`) on bottom story or spike trench on upper stories
          if (isBotInCol) {
            lv.clear(x0 + 3, x0 + 6, floorR, rows - 1);
          } else {
            lv.clear(x0 + 3, x0 + 6, floorR, floorR + 1);
            lv.ground(x0 + 3, x0 + 6, floorR + 2, mat);
            lv.fill(x0 + 3, x0 + 6, floorR + 1, floorR + 1, T_SPIKES);
          }
          // Wide 10-tile sunken spike bed (`x0 + 7 .. x0 + 16`)
          lv.clear(x0 + 7, x0 + 16, floorR, floorR + 1);
          lv.ground(x0 + 7, x0 + 16, floorR + 2, mat);
          lv.fill(x0 + 7, x0 + 16, floorR + 1, floorR + 1, T_SPIKES);
          // Spaced 2-tile floating platforms near each end of the 14-tile hazard span
          lv.platform(x0 + 4, x0 + 5, floorR - 1);
          lv.platform(x0 + 14, x0 + 15, floorR - 1);
        });
        movers.push({
          kind: 'linear',
          tiles: 2,
          x0: (x0 + 7) * TILE + 16,
          y0: py(floorR - 2),
          x1: (x0 + 12) * TILE + 16,
          y1: py(floorR - 2),
          period: 3.7,
          phase: (mc * 0.41) % 1,
          dwell: 0.12,
        });
        addDeco(props.altTall[0], props.altTall[1], x0 + 1, floorR);
        addDeco(props.altTall[0], props.altTall[1], x0 + 18, floorR);
        if (props.sconce) {
          addDeco(props.sconce[0], props.sconce[1], x0 + 2, floorR, 0, -46);
          addDeco(props.sconce[0], props.sconce[1], x0 + 17, floorR, 0, -46);
        }
        addCandle(x0 + 5, floorR - 1);
        addCandle(x0 + 14, floorR - 1, 'heart_big');
        addCandle(x0 + 18, floorR, 'money');

        const [gType, gVar] = pickGround(mc);
        const [sType, sVar] = pickSniper(mc + 1);
        const [hType, hVar] = colPacing === PACING_ZONES.INTRO_SAFE ? pickGround(mc + 2) : pickHeavy(mc + 2);
        const [aType, aVar] = pickAerial(mc + 3);
        addEnemy({ type: gType, variant: gVar, off: 2, minOff: 1, maxOff: 2 }, x0, x1, floorR);
        addEnemy({ type: sType, variant: sVar, off: 15, minOff: 14, maxOff: 15, row: floorR - 1 }, x0, x1, floorR);
        addEnemy({ type: hType, variant: hVar, off: 18, minOff: 17, maxOff: 18 }, x0, x1, floorR);
        addEnemy({ type: aType, variant: aVar, off: 10, minOff: 4, maxOff: 16, h: 4 }, x0, x1, floorR);
        if (roster.spawner && (mc % 2 === 1)) {
          spawners.push({ type: roster.spawner, x0: x0 + 2, x1: x1 - 2, variant: roster.spawnerVariant || 'normal' });
        }
      }
    }

    // Record Section-5 `roomSchema` entry for column `mc`
    const primaryMr = rs[rs.length - 1];
    const topFloor = gridFloorRow(minR, rs[0]);
    const botFloor = gridFloorRow(minR, primaryMr);
    roomSchema.push(createRoomSchemaEntry({
      room_id: `${key}_c${mc}`,
      archetype: colArchetype,
      pacing_zone: colPacing,
      biome: key,
      x0,
      x1,
      entryRow: botFloor,
      exitRow: botFloor,
      minRow: Math.max(0, topFloor - 5),
      maxRow: Math.min(rows - 1, botFloor + 3),
      map_cells: rs.map((r) => [mc, r]),
      secret_cell: rs.some((r) => isSecretCell(mc, r)) ? mapRoom.secret : null,
      sanctuary: colHasSanctuary,
      save_room: colIsSaveRoom,
      doors: colDoorsMeta,
      secrets: colSecretsMeta,
    }));
  }

  // =========================================================================
  // Final 2 Columns `[maxC - 1, maxC]`: Double-Height `2x2` Boss Sanctum (40 tiles)
  // =========================================================================
  const vestX0 = (maxC - 1 - minC) * GRID_CELL_W;
  const arenaX0 = (maxC - minC) * GRID_CELL_W;
  const arenaX1 = arenaX0 + GRID_CELL_W - 1;
  const bossRow = gridFloorRow(minR, bossFloorMr);
  const bossCtx = colContext(maxC);
  const bMat = bossCtx.mat;
  const bProps = bossCtx.props;

  op((lv) => {
    lv.clear(vestX0, arenaX1, 0, bossRow - 1);
    lv.ground(vestX0, arenaX1, bossRow, bMat);
    // Seal the far right end of the Boss Sanctum
    lv.fill(arenaX1, arenaX1, 0, bossRow, bMat);
  });

  // Grand 20-tile Ceremonial Boss Vestibule (`maxC - 1`, `0` enemies)
  addDeco(bProps.tall[0], bProps.tall[1], vestX0 + 3, bossRow);
  addDeco(bProps.altTall[0], bProps.altTall[1], vestX0 + 9, bossRow);
  addDeco(bProps.tall[0], bProps.tall[1], vestX0 + 16, bossRow);
  if (bProps.sconce) {
    addDeco(bProps.sconce[0], bProps.sconce[1], vestX0 + 6, bossRow, 0, -46);
    addDeco(bProps.sconce[0], bProps.sconce[1], vestX0 + 13, bossRow, 0, -46);
  }
  addHanging(bProps.hanging, vestX0 + 10, bossRow, 0.2);
  addCandle(vestX0 + 5, bossRow, 'heart_big');
  addCandle(vestX0 + 14, bossRow, subDrops[(id + 1) % subDrops.length]);

  // 20-tile Boss Arena (`maxC`) — keep cols 17..18 clear for the right-side Boss Exit Door
  addDeco(bProps.tall[0], bProps.tall[1], arenaX0 + 3, bossRow);
  addDeco(bProps.tall[0], bProps.tall[1], arenaX0 + 15, bossRow);
  addDeco(bProps.focal[0], bProps.focal[1], arenaX0 + 10, bossRow);
  if (key === 'cathedral') {
    addDeco('stained_glass', 'rose', arenaX0 + 10, bossRow, 0, -96);
  }
  if (bProps.sconce) {
    addDeco(bProps.sconce[0], bProps.sconce[1], arenaX0 + 7, bossRow, 0, -46);
    addDeco(bProps.sconce[0], bProps.sconce[1], arenaX0 + 13, bossRow, 0, -46);
  }
  if (bossSpec.waterPool || key === 'aqueduct') {
    addWaterBasin(arenaX0 + 2, arenaX0 + 18, bossRow, 0.80);
  }

  checkpoints.push(px(arenaX0));
  checkpointRows.push(bossRow);

  const boss = {
    type: bossSpec.type || 'giantbat',
    name: bossSpec.name || 'BOSS',
    sheet: bossSpec.sheet || null,
    tint: bossSpec.tint || null,
    aura: bossSpec.aura || null,
    voice: bossSpec.voice || null,
    line: bossSpec.line || null,
    gateCol: arenaX0 + 1,
    gateRows: [bossRow - 3, bossRow - 1],
    exitX: (arenaX0 + 18) * TILE + 4,
    exitY: py(bossRow),
    triggerX: px(arenaX0 + 5),
    camX: arenaX0 * TILE,
    spawn: {
      x: px(arenaX0 + 14),
      y: py(bossRow) - (bossSpec.spawnHeight == null ? 70 : bossSpec.spawnHeight),
    },
    arena: {
      x0: (arenaX0 + 2) * TILE + 8,
      x1: (arenaX0 + GRID_CELL_W) * TILE - 8,
      floorY: py(bossRow),
      ceilY: py(bossRow) - 230,
    },
  };

  roomSchema.push(createRoomSchemaEntry({
    room_id: `${key}_boss`,
    archetype: ROOM_ARCHETYPES.BOSS_ARENA,
    pacing_zone: PACING_ZONES.BOSS_SANCTUM,
    biome: key,
    x0: vestX0,
    x1: arenaX1,
    entryRow: bossRow,
    exitRow: bossRow,
    minRow: Math.max(0, bossRow - 9),
    maxRow: Math.min(rows - 1, bossRow + 3),
    map_cells: [[maxC - 1, bossFloorMr], [maxC, bossFloorMr]],
    upper_cells: [[maxC - 1, bossUpperMr], [maxC, bossUpperMr]],
  }));

  // =========================================================================
  // Compile Scratch Tile Grid & Enforce Strict Prop/Candle Grounding Invariants
  // =========================================================================
  const scratchTiles = new Uint8Array(cols * rows);
  const scratchLv = {
    cols,
    rows,
    set(x, y, t) {
      if (x >= 0 && y >= 0 && x < cols && y < rows) scratchTiles[y * cols + x] = t;
    },
    fill(x0_, x1_, y0_, y1_, t) {
      for (let y = y0_; y <= y1_; y++) {
        for (let x = x0_; x <= x1_; x++) this.set(x, y, t);
      }
    },
    ground(x0_, x1_, sr, t = T_GROUND) { this.fill(x0_, x1_, sr, rows - 1, t); },
    bridge(x0_, x1_, r, t = T_GROUND) {
      this.fill(x0_, x1_, r + 1, rows - 1, T_EMPTY);
      this.fill(x0_, x1_, r, r, t);
    },
    clear(x0_, x1_, y0_ = 0, y1_ = rows - 1) { this.fill(x0_, x1_, y0_, y1_, T_EMPTY); },
    platform(x0_, x1_, r) { this.fill(x0_, x1_, r, r, T_PLATFORM); },
    stair(col0, row0, col1, row1, opts = {}) {
      if (opts.passThrough) return;
      const cStart = Math.min(col0, col1);
      const cEnd = Math.max(col0, col1);
      if (cEnd <= cStart || row0 === row1) return;
      const x0s = cStart * TILE;
      const x1s = cEnd * TILE;
      const y0s = (col0 < col1 ? row0 : row1) * TILE;
      const y1s = (col0 < col1 ? row1 : row0) * TILE;
      const sY = (wx) => {
        if (wx <= x0s) return y0s;
        if (wx >= x1s) return y1s;
        return y0s + ((wx - x0s) / (x1s - x0s)) * (y1s - y0s);
      };
      const clearTop = opts.clearTop == null ? 0 : opts.clearTop;
      const fillBottom = opts.fillBottom == null ? (rows - 1) : Math.min(rows - 1, opts.fillBottom);
      const m = opts.mat || T_GROUND;
      for (let tx = cStart; tx < cEnd; tx++) {
        const fillRow = Math.min(rows - 1, Math.ceil(Math.max(sY(tx * TILE - 16), sY((tx + 1) * TILE + 16)) / TILE));
        if (opts.clearAbove !== false && fillRow > clearTop) this.fill(tx, tx, clearTop, fillRow - 1, T_EMPTY);
        if (fillBottom >= fillRow) this.fill(tx, tx, fillRow, fillBottom, m);
      }
    },
  };
  for (const fn of ops) fn(scratchLv);
  const sTile = (x, y) => (x < 0 || y < 0 || x >= cols || y >= rows ? T_EMPTY : scratchTiles[y * cols + x]);

  const landmarkPoints = [];
  if (sanctuaryAnchor) landmarkPoints.push({ x: px(sanctuaryAnchor.col), y: py(sanctuaryAnchor.row) });
  if (vesselAnchor) landmarkPoints.push({ x: px(vesselAnchor.col), y: py(vesselAnchor.row) });
  if (pedestalAnchor) landmarkPoints.push({ x: px(pedestalAnchor.col), y: py(pedestalAnchor.row) });
  for (const da of Object.values(doorAnchors)) {
    landmarkPoints.push({ x: px(da.col), y: py(da.gateRow) });
  }

  const decor = [];
  for (const d of rawDecor) {
    if (d.type) {
      decor.push(d);
      continue;
    }
    const tx = d._tx;
    const r = d._row;
    const dy = d._dy || 0;
    const clean = { sheet: d.sheet, frame: d.frame, x: d.x, y: d.y };
    if (dy < -8) {
      // Wall-mounted sconce / banner / stained glass / hanging chain: keep off solid masonry & landmarks
      if (tx > 0 && tx < cols - 1 && !isSolidTile(sTile(tx, r - 1))) {
        const collidesLandmark = landmarkPoints.some((lp) => Math.abs(lp.x - d.x) < 40 && Math.abs(lp.y - py(r)) < 48);
        if (!collidesLandmark) decor.push(clean);
      }
      continue;
    }
    // Floor-standing prop (`dy === 0`): MUST rest on 3-wide flat solid material with 3 clear air tiles above!
    if (tx <= 0 || tx >= cols - 1 || r < 3 || r >= rows) continue;
    if (!isMaterialTile(sTile(tx, r)) || !isMaterialTile(sTile(tx - 1, r)) || !isMaterialTile(sTile(tx + 1, r))) continue;
    if (isSolidTile(sTile(tx, r - 1)) || isSolidTile(sTile(tx, r - 2)) || isSolidTile(sTile(tx, r - 3))) continue;
    // Keep clear of all interactive landmarks (`PassageGate`, `SanctuaryStone`, `WeaponPedestal`, `AncientVessel`)
    if (landmarkPoints.some((lp) => Math.abs(lp.x - d.x) < 48 && Math.abs(lp.y - d.y) < 64)) continue;
    decor.push(clean);
  }

  const candles = [];
  const candleSeen = new Set();
  for (const [cx, cr, drop] of rawCandles) {
    if (cx <= 0 || cx >= cols - 1 || cr < 2 || cr >= rows) continue;
    const ck = `${cx},${cr}`;
    if (candleSeen.has(ck)) continue;
    const foot = sTile(cx, cr);
    const supportOk = isMaterialTile(foot) || foot === T_PLATFORM || foot === T_CRUMBLE || foot === T_BLOCK;
    if (!supportOk) continue;
    if (isSolidTile(sTile(cx, cr - 1) === T_BLOCK && foot !== T_BLOCK ? sTile(cx, cr - 1) : (foot === T_BLOCK ? T_EMPTY : sTile(cx, cr - 1)))) continue;
    if (landmarkPoints.some((lp) => Math.abs(lp.x - px(cx)) < 36 && Math.abs(lp.y - py(cr)) < 48)) continue;
    candleSeen.add(ck);
    candles.push([cx, cr, drop]);
  }

  // =========================================================================
  // Construct `stage.rooms` for `Stage3D` (height-matched 3D vaulted halls)
  // =========================================================================
  const stageRooms = [];
  const makeHallEntry = (x0_, x1_, y0_, y1_, topMr, botMr_, extra = {}) => {
    const fRow = gridFloorRow(minR, botMr_);
    const tRow = gridFloorRow(minR, topMr);
    const floorY = fRow * TILE;
    const ceilY = Math.min(floorY - 352, (tRow - 11) * TILE);
    const th = extra.wallTheme || baseTheme;
    return {
      x0: x0_,
      x1: x1_,
      y0: y0_,
      y1: y1_,
      floorRow: fRow,
      wall: th.wall,
      parallax: th.wallParallax,
      dark: th.dark,
      edge: !!extra.edge,
      cylinder: !!extra.cylinder,
      _hallBounds: { floorRow: fRow, floorY, ceilY },
    };
  };

  if (key === 'graveyard') {
    // Outdoor moonlit cemetery/moor/forecourt & drawbridge on cols 1..8, then the Barbican
    // Gatehouse threshold opens into a sunken Entrance Foyer (Great Stairway climbing inside the
    // castle) and the 3D Vaulted Entrance Hall on cols 9..27!
    const inStartCol = (outdoorUntilCol - minC + 1) * GRID_CELL_W;
    if (gateFoyer) {
      const foyer = makeHallEntry(gateFoyer.x0, gateFoyer.x1, 0, rows - 1, 11, 13, {
        edge: true,
        wallTheme: indoorCastleTheme,
      });
      // The foyer floor sits at the low moor level; its stairs rise to the main hall floor.
      foyer.floorRow = gateFoyer.floorRow;
      foyer._hallBounds = { floorRow: gateFoyer.floorRow, floorY: gateFoyer.floorRow * TILE, ceilY: foyer._hallBounds.ceilY };
      stageRooms.push(foyer);
    }
    stageRooms.push(makeHallEntry(inStartCol, cols - 1, 0, rows - 1, 11, 13, {
      edge: !gateFoyer,
      wallTheme: indoorCastleTheme,
    }));
  } else if (!baseTheme.outdoor) {
    // Partition indoor stages into contiguous architectural hall runs (splitting cylinder shaft & disjoint vertical decks)
    let runStartMc = minC;
    const colSignature = (mc) => {
      if (key === 'clocktower' && mc === 64) return 'cylinder';
      const rs = rowsByCol.get(mc);
      // Check if column has a large vertical gap (>= 4 unowned rows, e.g. clocktower 62..63)
      for (let i = 1; i < rs.length; i++) {
        if (rs[i] - rs[i - 1] >= 4) return `split:${rs[i - 1]}:${rs[i]}`;
      }
      return `hall:${rs[0]}:${rs[rs.length - 1]}`;
    };

    while (runStartMc <= maxC) {
      const sig = colSignature(runStartMc);
      let runEndMc = runStartMc;
      while (runEndMc + 1 <= maxC && colSignature(runEndMc + 1) === sig) runEndMc++;
      const rx0 = (runStartMc - minC) * GRID_CELL_W;
      const rx1 = (runEndMc - minC + 1) * GRID_CELL_W - 1;

      if (sig === 'cylinder') {
        const rs = rowsByCol.get(runStartMc);
        stageRooms.push(makeHallEntry(rx0, rx1, 0, rows - 1, rs[0], rs[rs.length - 1], { cylinder: true }));
      } else if (sig.startsWith('split:')) {
        const rs = rowsByCol.get(runStartMc);
        let splitIdx = 1;
        for (let i = 1; i < rs.length; i++) {
          if (rs[i] - rs[i - 1] >= 4) { splitIdx = i; break; }
        }
        const upperBot = rs[splitIdx - 1];
        const lowerTop = rs[splitIdx];
        const midY = gridFloorRow(minR, upperBot + 2);
        stageRooms.push(makeHallEntry(rx0, rx1, 0, midY, rs[0], upperBot));
        stageRooms.push(makeHallEntry(rx0, rx1, midY + 1, rows - 1, lowerTop, rs[rs.length - 1]));
      } else {
        let minTop = 999, maxBot = -1;
        for (let c = runStartMc; c <= runEndMc; c++) {
          const rs = rowsByCol.get(c);
          if (rs[0] < minTop) minTop = rs[0];
          if (rs[rs.length - 1] > maxBot) maxBot = rs[rs.length - 1];
        }
        stageRooms.push(makeHallEntry(rx0, rx1, 0, rows - 1, minTop, maxBot));
      }
      runStartMc = runEndMc + 1;
    }
  }

  return {
    id,
    key,
    name,
    subtitle,
    theme: themeKey,
    cols,
    rows,
    start: startPos,
    checkpoints,
    checkpointRows,
    build(level) {
      for (const fn of ops) fn(level);
    },
    rooms: stageRooms,
    decor,
    movers,
    blockDrops,
    candles,
    enemies,
    spawners,
    boss,
    platform: baseTheme.platform || 'platform',
    ally: baseTheme.ally || null,
    gridMeta: {
      minC,
      maxC,
      minR,
      maxR,
      cellSet: mapRoom.cellSet,
      allCells: mapRoom.allCells,
      bossSet: mapRoom.bossSet,
      bossFloorR: bossFloorMr,
      secretKey: mapRoom.secretKey,
    },
    roomSchema,
    doorAnchors,
    sanctuaryAnchor,
    vesselAnchor,
    pedestalAnchor,
    secretCell: mapRoom.secret,
    secrets,
    waterBasins,
    drawbridge,
  };
}
