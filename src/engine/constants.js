// Shared constants for Gothic Nocturne.

export const W = 640;            // native width
export const H = 360;            // native height
export const TILE = 32;
export const GRAVITY = 1500;     // px/s^2
export const MAX_FALL = 720;     // px/s
export const DT = 1 / 60;        // fixed simulation step

// Tile ids
/** Bumped whenever assets/ change so browsers never pair a stale atlas with new code. */
export const ASSET_VERSION = '20261108a';

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
export const T_WATER = 21;       // translucent water channel / cistern pool (non-solid, non-lethal)
export const T_CONSERVATORY = 22;// overgrown wrought-iron & orchid conservatory floor ("conservatoryfloor")
export const T_DUNGEON = 23;     // rusted iron prison grates & blood-slate dungeon floor ("dungeonfloor")
export const T_OBSERVATORY = 24; // lapis-and-brass zodiac observatory marble ("observatoryfloor")

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
  [T_CONSERVATORY]: 'conservatoryfloor',
  [T_DUNGEON]: 'dungeonfloor',
  [T_OBSERVATORY]: 'observatoryfloor',
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
  speed: 108,
  accel: 1480,
  airAccel: 820,
  jump: 545,
  jumpCut: 0.45,
  coyote: 0.09,
  buffer: 0.12,
  maxHp: 16,
  width: 20,
  height: 56,
  crouchHeight: 36,
  invuln: 1.05,
  hurtTime: 0.38,
  whipDamage: 2,
  whipTime: 0.40,
  whipActive: [0.13, 0.31],
  whipReach: 96,
  petrifyTime: 1.6,
  dashSpeed: 312,          // (legacy) double-tap dash burst speed (px/s)
  dashTime: 0.26,          // (legacy) dash duration (s)
  dashCooldown: 0.22,      // (legacy) dash recovery (s)
  dashTapWindow: 0.24,     // (legacy) alias of runTapWindow
  runSpeed: 198,           // double-tap sprint speed (px/s), ~1.85x walking
  runTapWindow: 0.24,      // max gap between the two taps that start a sprint (s)
  backdashSpeed: 272,      // rapid backward evade speed preserving forward facing (px/s)
  backdashTime: 0.24,      // backdash duration (cancellable after 0.09s)
  slideSpeed: 288,         // low crouch-slide kick speed (px/s)
  slideTime: 0.28,         // slide kick duration (s)
  slideHeight: 28,         // low collision height during slide (clears 1-tile/2-tile crawl tunnels!)
  divekickVx: 245,         // aerial diagonal comet-kick horizontal speed
  divekickVy: 455,         // aerial diagonal comet-kick downward speed
  superJump: 760,          // [Down, Up + Jump] Gravity-Boots vertical launch speed
};

export const SCORE = {
  candle: 10, zombie: 100, gravekeeper: 220, bat: 200, owl: 200, wolf: 250, mushroom: 250, spriggan: 280, mosstroll: 620,
  scarecrow: 320, wickerman: 640, wendigo: 660, arbalest: 360, bonegoliath: 680,
  ghost: 300, tome: 150, gargoyle: 350,
  magmaslime: 250, cinderimp: 300, pyromancer: 400, lavagolem: 580, armor: 450, wraith: 350,
  clockknight: 440, gearharpy: 320, brasstitan: 720, inkscholar: 420, censerprelate: 480,
  bloodknight: 580, vathulk: 680, waltzdancer: 440, retiarius: 420, minotaur: 740,
  siren: 400, cisterncrab: 680, astralarcher: 460, marblecolossus: 780,
  alchfiend: 380, duelist: 460, executioner: 520, merman: 380, valkyrie: 480, necromancer: 500,
  dullahan: 620, rulersword: 660, novaskeleton: 540, fleaman: 290, bonepillar: 480, jiangshi: 560,
  skeleton: 300, medusa: 300, boss: 3000,
  money: 500, timeBonus: 10,
};

// Difficulty presets chosen on the title screen. Multipliers apply on top of
// the base tuning above and in the enemy classes.
export const DIFFICULTIES = {
  easy: {
    key: 'easy', name: 'EASY', tagline: 'A GENTLE NIGHT',
    desc: '7 LIVES · 1 DMG HITS · 1600 SEC · PITS FORGIVE · CALM FIENDS',
    lives: 7, hearts: 15, time: 1600,
    damageTaken: 0.28, enemyHp: 0.45, spawnInterval: 2.8, maxAlive: 1,
    throwCooldown: 2.35, bossTempo: 1.7, bossPhase2: 0.28, scoreMult: 0.5,
    playerDamage: 1.65, invulnMul: 1.85, pitForgiving: true, knockbackMul: 0.5,
    enemyTimeScale: 0.78, bossTimeScale: 0.88, projTimeScale: 0.78, rankScale: 0.35,
  },
  normal: {
    key: 'normal', name: 'NORMAL', tagline: 'THE CLASSIC HUNT',
    desc: '3 LIVES · 900 SEC · FIERCE CASTLE FIENDS',
    lives: 3, hearts: 5, time: 900,
    damageTaken: 1.15, enemyHp: 1.1, spawnInterval: 0.82, maxAlive: 4,
    throwCooldown: 0.85, bossTempo: 0.86, bossPhase2: 0.62, scoreMult: 1,
    playerDamage: 1, invulnMul: 1, pitForgiving: false, knockbackMul: 1,
  },
  hard: {
    key: 'hard', name: 'HARD', tagline: 'NO MERCY AT MIDNIGHT',
    desc: '2 LIVES · 1.65X DAMAGE · 660 SEC · RELENTLESS LEGIONS · 2X SCORE',
    lives: 2, hearts: 3, time: 660,
    damageTaken: 1.65, enemyHp: 1.6, spawnInterval: 0.54, maxAlive: 6,
    throwCooldown: 0.62, bossTempo: 0.68, bossPhase2: 0.75, scoreMult: 2,
    playerDamage: 1, invulnMul: 0.9, pitForgiving: false, knockbackMul: 1,
  },
};
export const DIFFICULTY_ORDER = ['easy', 'normal', 'hard'];
export const DEFAULT_DIFFICULTY = 'normal';

// ---------------------------------------------------------------- title & settings menus
/** Title menu rows (4 when fresh; 5 when CONTINUE is present). */
export const TITLE_MENU_ITEMS = 4;
/** Title menu geometry defaults (dynamic layout resolved via Game.getTitleMenuLayout()). */
export const TITLE_MENU_Y0 = 228;
export const TITLE_MENU_ROW_H = 18;
export const TITLE_MENU_SAVE_Y0 = 223;
export const TITLE_MENU_SAVE_ROW_H = 16;

/** Settings screen rows (title menu → SETTINGS). */
export const SETTINGS_ITEMS = [
  { id: 'resetProgress', label: 'RESET PROGRESS', desc: 'ERASE SAVE POINT, CLEARED BOSSES, CHARTED MAP, VESSELS, LEVEL & ARMORY · FRESH HUNT' },
  { id: 'unlockAreas', label: 'DEBUG · UNLOCK ALL AREAS', desc: 'EVERY PASSAGE SEAL STANDS OPEN AND THE WHOLE CASTLE MAP IS CHARTED FOR FAST TRAVEL' },
  { id: 'unlockBosses', label: 'DEBUG · UNLOCK BOSSES', desc: "EVERY BOSS GATE DOOR RISES ON APPROACH AND THE COUNT'S THRONE HALL IS OPEN" },
  { id: 'bgmTest', label: 'BG MUSIC TEST', desc: 'CYCLE THROUGH EVERY STAGE THEME · ENTER PLAYS · AGAIN STOPS', test: 'bgm' },
  { id: 'sfxTest', label: 'SOUND TEST', desc: 'CYCLE THROUGH BOSS VOICE OVERS AND SOUND EFFECTS · ENTER PLAYS', test: 'sfx' },
  { id: 'back', label: 'BACK TO TITLE', desc: 'SETTINGS ARE REMEMBERED ON THIS DEVICE' },
];
export const SETTINGS_TOP = 116;
export const SETTINGS_ROW_H = 30;
/** Settings rows that are audio tests: the right-hand value area is split into a `←` prev / `→` next tap zone (touch). */
export const SETTINGS_TEST_ARROWS_X = 124;   // px right of centre where the ← prev / next → zones begin
