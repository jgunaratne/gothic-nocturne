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

// Difficulty presets chosen on the title screen. Multipliers apply on top of
// the base tuning above and in the enemy classes.
export const DIFFICULTIES = {
  easy: {
    key: 'easy', name: 'EASY', tagline: 'A GENTLE NIGHT',
    desc: '5 LIVES · HALF DAMAGE · 600 SEC · FEWER FIENDS · HALF SCORE',
    lives: 5, hearts: 10, time: 600,
    damageTaken: 0.5, enemyHp: 0.75, spawnInterval: 1.5, maxAlive: 2,
    throwCooldown: 1.4, bossTempo: 1.3, bossPhase2: 0.4, scoreMult: 0.5,
  },
  normal: {
    key: 'normal', name: 'NORMAL', tagline: 'THE CLASSIC HUNT',
    desc: '3 LIVES · 420 SEC · STANDARD FIENDS',
    lives: 3, hearts: 5, time: 420,
    damageTaken: 1, enemyHp: 1, spawnInterval: 1, maxAlive: 3,
    throwCooldown: 1, bossTempo: 1, bossPhase2: 0.5, scoreMult: 1,
  },
  hard: {
    key: 'hard', name: 'HARD', tagline: 'NO MERCY AT MIDNIGHT',
    desc: '2 LIVES · 1.5X DAMAGE · 300 SEC · RELENTLESS FIENDS · 2X SCORE',
    lives: 2, hearts: 3, time: 300,
    damageTaken: 1.5, enemyHp: 1.5, spawnInterval: 0.65, maxAlive: 4,
    throwCooldown: 0.7, bossTempo: 0.75, bossPhase2: 0.65, scoreMult: 2,
  },
};
export const DIFFICULTY_ORDER = ['easy', 'normal', 'hard'];
export const DEFAULT_DIFFICULTY = 'normal';
