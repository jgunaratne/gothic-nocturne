// Stage 1 — "The Graveyard Road": terrain, decoration, spawns and scripting.
// Coordinates are in tiles; `row` is the surface row (0 = top). Decor anchors
// are bottom-centre in world pixels.

import { TILE, T_GROUND, T_STONE, T_BLOCK, T_SPIKES } from '../engine/constants.js';

const COLS = 220;
const ROWS = 14;

const px = (tx) => tx * TILE + TILE / 2;   // tile column -> centre x
const py = (row) => row * TILE;            // surface row -> top y (feet)

function decorList() {
  const d = [];
  const add = (sheet, frame, tx, row, dx = 0, dy = 0) =>
    d.push({ sheet, frame, x: px(tx) + dx, y: py(row) + dy });

  // --- Graveyard (0-47): tombstones and dead shrubs on the ground (row 12)
  [3, 9, 14, 21, 26, 33, 38].forEach((tx) => add('props', 'tombstone', tx, 12));
  [7, 19, 31, 44].forEach((tx) => add('props', 'shrub', tx, 12));
  // --- Ascent (48-95)
  add('props', 'tombstone', 50, 12); add('props', 'tombstone', 63, 11);
  add('props', 'shrub', 69, 10); add('props', 'shrub', 83, 9);
  add('props', 'tombstone', 88, 9);
  // --- Castle gate & courtyard (96-119)
  add('arch', 'column', 97, 9); add('arch', 'gate', 100, 9);
  add('arch', 'column', 104, 11); add('arch', 'window', 110, 11, 0, -20);
  add('arch', 'banner', 114, 11, 0, -40); add('props', 'torch', 107, 11, 0, -44);
  add('props', 'torch', 117, 11, 0, -44);
  // --- Great hall (120-167)
  [120, 140, 166].forEach((tx) => add('arch', 'column', tx, 11));
  [123, 135, 147, 159].forEach((tx) => add('arch', 'window', tx, 11, 0, -24));
  [129, 153].forEach((tx) => add('arch', 'banner', tx, 11, 0, -48));
  [131, 149].forEach((tx) => add('arch', 'chain', tx, 11, 0, -96));
  [125, 145, 163].forEach((tx) => add('props', 'torch', tx, 11, 0, -46));
  // --- Inner sanctum approach (168-199)
  [168, 176, 184, 192, 199].forEach((tx, i) => add('arch', 'column', tx, [11, 10, 9, 11, 11][i]));
  [172, 180, 188, 196].forEach((tx, i) => add('arch', 'window', tx, [11, 10, 9, 11][i], 0, -24));
  [178, 194].forEach((tx, i) => add('arch', 'banner', tx, [10, 11][i], 0, -48));
  add('arch', 'chain', 186, 9, 0, -96);
  add('props', 'torch', 170, 11, 0, -46); add('props', 'torch', 190, 9, 0, -46);
  // --- Boss arena (200-219)
  add('arch', 'column', 203, 11); add('arch', 'column', 218, 11);
  [206, 210, 214].forEach((tx) => add('arch', 'window', tx, 11, 0, -24));
  [208, 212].forEach((tx) => add('arch', 'banner', tx, 11, 0, -48));
  add('props', 'torch', 204, 11, 0, -46); add('props', 'torch', 217, 11, 0, -46);
  return d;
}

export const STAGE1 = {
  name: 'THE GRAVEYARD ROAD',
  cols: COLS,
  rows: ROWS,
  start: { x: px(2), y: py(12) },
  checkpoints: [px(2), px(103), px(200)],

  build(level) {
    // Graveyard road
    level.ground(0, 47, 12, T_GROUND);
    level.clear(28, 29, 12, 13);               // 2-tile pit
    level.clear(40, 42, 12, 13);               // 3-tile pit with a ledge
    level.platform(40, 42, 10);
    level.platform(16, 19, 10);

    // The ascent (steps up toward the castle)
    level.ground(48, 60, 12, T_GROUND);
    level.ground(61, 70, 11, T_GROUND);
    level.ground(71, 80, 10, T_GROUND);
    level.ground(81, 95, 9, T_GROUND);
    level.platform(55, 57, 9);
    level.platform(64, 66, 8);
    level.platform(74, 76, 7);

    // Castle gate and courtyard (stone)
    level.ground(96, 101, 9, T_STONE);
    level.ground(102, 119, 11, T_STONE);

    // Great hall
    level.ground(120, 167, 11, T_STONE);
    level.clear(131, 132, 11, 12); level.fill(131, 132, 12, 12, T_SPIKES);   // spike pit
    level.clear(146, 147, 11, 12); level.fill(146, 147, 12, 12, T_SPIKES);
    level.platform(124, 127, 8);
    level.platform(136, 139, 7);
    level.platform(150, 153, 8);
    level.platform(158, 161, 8);
    level.fill(141, 141, 9, 10, T_BLOCK);      // breakable column
    level.fill(155, 155, 10, 10, T_BLOCK);

    // Inner sanctum approach (dais)
    level.ground(168, 175, 11, T_STONE);
    level.ground(176, 183, 10, T_STONE);
    level.ground(184, 191, 9, T_STONE);
    level.ground(192, 199, 11, T_STONE);
    level.platform(170, 172, 8);
    level.platform(186, 188, 6);

    // Boss arena
    level.ground(200, 219, 11, T_STONE);
  },

  rooms: [{ x0: 102, x1: 219, y0: 0, y1: 13 }],
  decor: decorList(),
  blockDrops: { '141,10': 'meat', '141,9': null, '155,10': 'money' },

  // Whippable candelabra (tx, surface row) — fixed drops override the table.
  candles: [
    [5, 12], [11, 12], [17, 10, 'heart_big'], [23, 12], [35, 12], [46, 12, 'dagger'],
    [52, 12], [56, 9], [67, 11, 'axe'], [74, 7], [85, 9], [92, 9, 'heart_big'],
    [106, 11], [111, 11], [117, 11, 'holy_water'],
    [122, 11], [126, 8], [133, 11], [138, 7, 'heart_big'], [143, 11], [151, 8], [157, 11], [163, 11],
    [169, 11], [171, 8], [175, 11], [181, 10, 'axe'], [187, 6, 'heart_big'], [193, 11], [198, 11],
    [205, 11, 'heart_big'], [216, 11, 'heart_big'],
  ],

  enemies: [
    { type: 'bat', tx: 24, ty: 5 },
    { type: 'skeleton', tx: 36, row: 12, min: 31, max: 39 },
    { type: 'bat', tx: 58, ty: 3 },
    { type: 'skeleton', tx: 76, row: 10, min: 71, max: 80 },
    { type: 'bat', tx: 84, ty: 2 },
    { type: 'skeleton', tx: 90, row: 9, min: 82, max: 95 },
    { type: 'bat', tx: 108, ty: 4 },
    { type: 'skeleton', tx: 112, row: 11, min: 103, max: 119 },
    { type: 'bat', tx: 116, ty: 5 },
    { type: 'skeleton', tx: 128, row: 11, min: 121, max: 130 },
    { type: 'bat', tx: 134, ty: 3 },
    { type: 'skeleton', tx: 144, row: 11, min: 133, max: 145 },
    { type: 'bat', tx: 152, ty: 3 },
    { type: 'skeleton', tx: 160, row: 11, min: 149, max: 166 },
    { type: 'skeleton', tx: 174, row: 11, min: 168, max: 175 },
    { type: 'bat', tx: 178, ty: 3 },
    { type: 'skeleton', tx: 189, row: 9, min: 184, max: 191 },
    { type: 'catoblepas', tx: 180, row: 10, min: 176, max: 183 },
    { type: 'bat', tx: 194, ty: 4 },
    { type: 'skeleton', tx: 196, row: 11, min: 192, max: 199 },
  ],

  spawners: [
    { type: 'zombie', x0: 6, x1: 46 },
    { type: 'medusa', x0: 60, x1: 82 },
    { type: 'zombie', x0: 122, x1: 165 },
    { type: 'medusa', x0: 148, x1: 167 },
    { type: 'zombie', x0: 168, x1: 199 },
    { type: 'medusa', x0: 176, x1: 199 },
  ],

  boss: {
    name: 'THE PHANTOM REAPER',
    gateCol: 201, gateRows: [8, 10],
    triggerX: px(205), camX: 200 * TILE,
    spawn: { x: px(214), y: py(11) - 70 },
    arena: { x0: 202 * TILE + 8, x1: 220 * TILE - 8, floorY: py(11) },
  },
};
