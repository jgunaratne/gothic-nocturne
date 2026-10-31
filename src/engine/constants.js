// Shared constants for Gothic Nocturne.

export const W = 640;            // native width
export const H = 360;            // native height
export const TILE = 32;
export const GRAVITY = 1500;     // px/s^2
export const MAX_FALL = 720;     // px/s
export const DT = 1 / 60;        // fixed simulation step

// Tile ids
export const T_EMPTY = 0;
export const T_GROUND = 1;       // graveyard earth (strip "ground")
export const T_STONE = 2;        // castle floor/wall (strip "floor")
export const T_PLATFORM = 3;     // one-way ledge
export const T_SPIKES = 4;       // hazard
export const T_BLOCK = 5;        // breakable block
export const T_GATE = 6;         // boss gate (solid while closed)
export const T_BOUND = 7;        // invisible solid

export const isSolidTile = (t) =>
  t === T_GROUND || t === T_STONE || t === T_BLOCK || t === T_GATE || t === T_BOUND;

// Gameplay tuning
export const PLAYER = {
  speed: 122,
  accel: 1800,
  airAccel: 900,
  jump: 545,
  jumpCut: 0.45,
  coyote: 0.09,
  buffer: 0.12,
  maxHp: 16,
  width: 20,
  height: 56,
  crouchHeight: 36,
  invuln: 1.25,
  hurtTime: 0.38,
  whipDamage: 2,
  whipTime: 0.40,
  whipActive: [0.13, 0.31],
  whipReach: 62,
};

export const SCORE = {
  candle: 10, zombie: 100, bat: 200, skeleton: 300, medusa: 300, boss: 3000,
  money: 500, timeBonus: 10,
};

export const STAGE_TIME = 420;
export const START_LIVES = 3;
export const START_HEARTS = 5;
