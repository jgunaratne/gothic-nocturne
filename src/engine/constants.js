// Shared constants for Gothic Nocturne.

export const W = 640;            // native width
export const H = 360;            // native height
export const TILE = 32;
export const GRAVITY = 1500;     // px/s^2
export const MAX_FALL = 720;     // px/s
export const DT = 1 / 60;        // fixed simulation step

// Tile ids
/** Bumped whenever assets/ change so browsers never pair a stale atlas with new code. */
export const ASSET_VERSION = '20261101h';

export const T_EMPTY = 0;
export const T_GROUND = 1;       // graveyard earth (strip "ground")
export const T_STONE = 2;        // castle floor/wall (strip "floor")
export const T_PLATFORM = 3;     // one-way ledge
export const T_SPIKES = 4;       // hazard
export const T_BLOCK = 5;        // breakable block
export const T_GATE = 6;         // boss gate (solid while closed)
export const T_BOUND = 7;        // invisible solid
export const T_CATACOMB = 8;     // ossuary flagstones (strip "catacomb")
export const T_CLOCK = 9;        // clock-tower iron walkway (strip "clockfloor")
export const T_FOREST = 10;      // autumn forest floor (strip "forestfloor")
export const T_SNOW = 11;        // snowbound ground (strip "snowfloor")
export const T_CRUMBLE = 12;     // fissured stone slab that crumbles underfoot
export const T_DARKWOOD = 13;    // mossy dark-forest earth & roots (strip "darkwoodfloor")
export const T_CAVERN = 14;      // volcanic obsidian cavern stone (strip "cavernfloor")
export const T_LAVA = 15;        // searing molten lava pool hazard (non-solid)
export const T_ALCHEMY = 16;     // alchemical brass-grated flagstones (strip "alchemyfloor")
export const T_BALLROOM = 17;    // rose-marble & gilt parquet hall floor (strip "ballroomfloor")
export const T_COLISEUM = 18;    // blood-sand & iron-bound arena stone (strip "coliseumfloor")
export const T_AQUEDUCT = 19;    // mossy flooded viaduct masonry (strip "aqueductfloor")
export const T_SKYKEEP = 20;     // moonlit celestial garden marble (strip "skykeepfloor")

/** Terrain material tile id -> strip asset name. */
export const MATERIAL_STRIP = {
  [T_GROUND]: 'ground',
  [T_STONE]: 'floor',
  [T_CATACOMB]: 'catacomb',
  [T_CLOCK]: 'clockfloor',
  [T_FOREST]: 'forestfloor',
  [T_SNOW]: 'snowfloor',
  [T_DARKWOOD]: 'darkwoodfloor',
  [T_CAVERN]: 'cavernfloor',
  [T_ALCHEMY]: 'alchemyfloor',
  [T_BALLROOM]: 'ballroomfloor',
  [T_COLISEUM]: 'coliseumfloor',
  [T_AQUEDUCT]: 'aqueductfloor',
  [T_SKYKEEP]: 'skykeepfloor',
};
export const isMaterialTile = (t) => t in MATERIAL_STRIP;

/** First tile id handed out to forged (player-proposed) terrain materials. */
export const T_FORGE_BASE = 32;

/**
 * Registers a new solid terrain material drawn from `stripName` (an atlas
 * entry of type "strip"). Used by the Castle Forge for generated wings.
 */
export function registerMaterial(tileId, stripName) {
  MATERIAL_STRIP[tileId] = stripName;
  return tileId;
}

export const isSolidTile = (t) =>
  (t in MATERIAL_STRIP) || t === T_BLOCK || t === T_GATE || t === T_BOUND;

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
  whipReach: 96,
  petrifyTime: 1.5,
};

export const SCORE = {
  candle: 10, zombie: 100, bat: 200, owl: 200, wolf: 250, mushroom: 250, ghost: 300, tome: 150, gargoyle: 350,
  magmaslime: 250, cinderimp: 300, lavagolem: 450, armor: 450, wraith: 350,
  skeleton: 300, medusa: 300, boss: 3000,
  money: 500, timeBonus: 10,
};

// Difficulty presets chosen on the title screen. Multipliers apply on top of
// the base tuning above and in the enemy classes.
export const DIFFICULTIES = {
  easy: {
    key: 'easy', name: 'EASY', tagline: 'A GENTLE NIGHT',
    desc: '7 LIVES · 1 DMG HITS · 1000 SEC · PITS FORGIVE · STRONG WHIP',
    lives: 7, hearts: 15, time: 1000,
    damageTaken: 0.4, enemyHp: 0.6, spawnInterval: 2.2, maxAlive: 1,
    throwCooldown: 2.0, bossTempo: 1.6, bossPhase2: 0.3, scoreMult: 0.5,
    playerDamage: 1.5, invulnMul: 1.6, pitForgiving: true, knockbackMul: 0.6,
  },
  normal: {
    key: 'normal', name: 'NORMAL', tagline: 'THE CLASSIC HUNT',
    desc: '3 LIVES · 540 SEC · STANDARD FIENDS',
    lives: 3, hearts: 5, time: 540,
    damageTaken: 1, enemyHp: 1, spawnInterval: 1, maxAlive: 3,
    throwCooldown: 1, bossTempo: 1, bossPhase2: 0.5, scoreMult: 1,
    playerDamage: 1, invulnMul: 1, pitForgiving: false, knockbackMul: 1,
  },
  hard: {
    key: 'hard', name: 'HARD', tagline: 'NO MERCY AT MIDNIGHT',
    desc: '2 LIVES · 1.5X DAMAGE · 390 SEC · RELENTLESS FIENDS · 2X SCORE',
    lives: 2, hearts: 3, time: 390,
    damageTaken: 1.5, enemyHp: 1.5, spawnInterval: 0.65, maxAlive: 4,
    throwCooldown: 0.7, bossTempo: 0.75, bossPhase2: 0.65, scoreMult: 2,
    playerDamage: 1, invulnMul: 1, pitForgiving: false, knockbackMul: 1,
  },
};
export const DIFFICULTY_ORDER = ['easy', 'normal', 'hard'];
export const DEFAULT_DIFFICULTY = 'normal';
