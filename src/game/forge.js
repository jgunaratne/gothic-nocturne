// Castle Forge: lets the player propose a new wing ("an Abandoned Village") and
// grows the castle around it. A blueprint (drafted by Gemini on the forge
// server, or by the procedural designer below) is turned into a real stage with
// the existing prefab StageBuilder, a theme inheriting one of the thirteen base
// realms, generated art / Lyria music / Daikon boss voice when the server
// produced them (tinted base assets otherwise), a relic, and new rooms on the
// Castle Exploration Map joined to a neighbouring region by a passage gateway.

import { ASSET_VERSION, T_FORGE_BASE, registerMaterial } from '../engine/constants.js';
import { registerTrack, registerVoice } from '../engine/audio.js';
import { StageBuilder, THEMES, registerTheme } from './builder.js';
import { STAGE_BY_KEY, registerStage } from './stages.js';
import { MAP_ROOMS, registerMapRoom, placeForgedRoom, stageIndexOf } from './castlemap.js';
import { registerRelic, FORGED_RELIC_EFFECTS } from './relics.js';
import { registerLayerSet } from './parallax.js';
import { registerForgedMaterial } from './tex3d.js';

export const FORGE_API = 'api/forge';
export const MAX_FORGED_WINGS = 12;     // 18 built-in + 12 forged stays inside 31-bit progress masks
const LOCAL_KEY = 'gothic.forge.local.v1';

// ------------------------------------------------------------------ vocabulary

/** Base realms a forged wing can inherit (3D vistas, grading, decor, enemy rosters). */
export const BASE_THEMES = {
  graveyard: { label: 'MOONLIT MOOR', outdoor: true, rows: 18, startRow: 11, backdrop: 'forest', strip: 'ground', words: ['grave', 'cemetery', 'moor', 'road', 'church', 'mist', 'fog', 'hill', 'meadow', 'field', 'ruin', 'abandoned', 'plague', 'hamlet', 'village', 'gallows', 'shuttered'], enemies: ['gravekeeper', 'zombie', 'skeleton', 'armor', 'bat', 'ghost'], spawn: ['zombie', 'bat', 'ghost'], boss: ['giantbat', 'bonecaptain', 'reaper'] },
  darkwood: { label: 'ANCIENT WOODS', outdoor: true, rows: 18, startRow: 11, backdrop: 'darkwood_canopy', strip: 'darkwoodfloor', words: ['wood', 'forest', 'grove', 'swamp', 'marsh', 'bog', 'glade', 'thicket', 'root', 'tree', 'garden', 'jungle', 'fen'], enemies: ['wolf', 'spriggan', 'mushroom', 'mosstroll', 'owl', 'bat'], spawn: ['owl', 'bat'], boss: ['treant'] },
  forest: { label: 'HAUNTED HARVEST', outdoor: true, rows: 18, startRow: 11, backdrop: 'deepforest', strip: 'forestfloor', words: ['pumpkin', 'harvest', 'autumn', 'orchard', 'farm', 'barn', 'scarecrow', 'lantern', 'vineyard', 'mill'], enemies: ['scarecrow', 'pumpkin', 'wickerman', 'skeleton', 'bat'], spawn: ['lantern', 'pumpkin'], boss: ['greatjack'] },
  yule: { label: 'SNOWBOUND VILLAGE', outdoor: true, rows: 18, startRow: 11, backdrop: 'winter', strip: 'snowfloor', words: ['snow', 'ice', 'frozen', 'winter', 'frost', 'yule', 'blizzard', 'cottage', 'market', 'inn', 'street', 'square', 'glacier', 'tundra'], enemies: ['snowman', 'icegolem', 'wendigo', 'wolf', 'wisp', 'skeleton'], spawn: ['wisp'], boss: ['devilsanta', 'bonecaptain'] },
  ramparts: { label: 'OUTER WALLS', outdoor: true, rows: 18, startRow: 11, backdrop: 'castle', strip: 'floor', words: ['wall', 'rampart', 'battlement', 'gate', 'bridge', 'siege', 'bailey', 'watch', 'keep', 'fort', 'barracks', 'harbor', 'harbour', 'dock', 'pier', 'lighthouse'], enemies: ['arbalest', 'skeleton', 'armor', 'executioner', 'gargoyle', 'bat'], spawn: ['bat', 'gargoyle'], boss: ['bonecaptain'] },
  catacombs: { label: 'BURIAL CRYPTS', outdoor: false, rows: 18, startRow: 9, strip: 'catacomb', words: ['catacomb', 'crypt', 'tomb', 'sewer', 'cistern', 'dungeon', 'cellar', 'vault', 'well', 'underground', 'tunnel', 'mine', 'prison', 'oubliette', 'drain'], enemies: ['zombie', 'skeleton', 'bonegoliath', 'executioner', 'necromancer', 'wraith', 'ghost'], spawn: ['zombie', 'wraith'], boss: ['reaper', 'gorgon'] },
  darkcave: { label: 'MOLTEN CAVERNS', outdoor: false, rows: 20, startRow: 12, strip: 'cavernfloor', words: ['cave', 'cavern', 'volcano', 'lava', 'magma', 'forge', 'furnace', 'foundry', 'fire', 'ember', 'smith', 'kiln', 'inferno', 'hell'], enemies: ['magmaslime', 'pyromancer', 'lavagolem', 'cinderimp', 'bat'], spawn: ['cinderimp'], boss: ['cinderqueen'] },
  ossuary: { label: 'ABYSSAL OSSUARY', outdoor: false, rows: 16, startRow: 11, strip: 'catacomb', words: ['ossuary', 'bone', 'skull', 'abyss', 'pit', 'chasm', 'charnel', 'temple', 'shrine', 'altar', 'void'], enemies: ['merman', 'skeleton', 'bonegoliath', 'catoblepas', 'necromancer', 'medusa', 'wraith'], spawn: ['medusa', 'merman', 'necromancer'], boss: ['gorgon'] },
  arcade: { label: 'GILDED GALLERY', outdoor: false, rows: 20, startRow: 15, strip: 'floor', words: ['arcade', 'gallery', 'automaton', 'machine', 'workshop', 'clockwork', 'casino', 'theatre', 'theater', 'carnival', 'circus', 'museum', 'toy', 'puppet', 'doll'], enemies: ['clockknight', 'brasstitan', 'duelist', 'armor', 'gearharpy', 'gargoyle'], spawn: ['gearharpy', 'gargoyle'], boss: ['automaton'] },
  library: { label: 'HAUNTED STACKS', outdoor: false, rows: 20, startRow: 13, strip: 'floor', words: ['library', 'archive', 'study', 'scriptorium', 'school', 'academy', 'observatory', 'laboratory', 'alchemist', 'alchemy', 'tome', 'book', 'wizard', 'sorcerer', 'witch'], enemies: ['inkscholar', 'alchfiend', 'vathulk', 'tome', 'necromancer', 'duelist', 'ghost'], spawn: ['tome', 'ghost', 'necromancer'], boss: ['archivist'] },
  cathedral: { label: 'GREAT NAVE', outdoor: false, rows: 26, startRow: 23, strip: 'floor', words: ['cathedral', 'chapel', 'nave', 'abbey', 'monastery', 'cloister', 'sanctum', 'basilica', 'organ', 'choir', 'glass', 'convent', 'bell'], enemies: ['censerprelate', 'armor', 'executioner', 'gargoyle', 'valkyrie', 'wraith'], spawn: ['gargoyle', 'valkyrie'], boss: ['archon'] },
  clocktower: { label: 'CLOCKWORK SPIRE', outdoor: false, rows: 34, startRow: 31, strip: 'clockfloor', words: ['clock', 'gear', 'belfry', 'spire', 'tower', 'steeple', 'windmill', 'engine', 'elevator', 'shaft'], enemies: ['clockknight', 'arbalest', 'brasstitan', 'skeleton', 'gearharpy', 'medusa'], spawn: ['gearharpy', 'medusa'], boss: ['reaperlord', 'automaton'] },
  throne: { label: 'ROYAL HALLS', outdoor: false, rows: 18, startRow: 11, strip: 'floor', words: ['throne', 'hall', 'ballroom', 'court', 'palace', 'royal', 'king', 'queen', 'banquet', 'chamber', 'manor', 'mansion', 'estate', 'armory', 'armoury', 'treasury', 'gallery of mirrors'], enemies: ['bloodknight', 'duelist', 'censerprelate', 'executioner', 'armor', 'waltzdancer', 'wraith', 'necromancer'], spawn: ['waltzdancer', 'wraith'], boss: ['count', 'reaperlord'] },
};

/** Boss behaviours a forged wing may reuse; `frames` lists the sheet a generated sprite must match. */
export const BOSS_BASES = {
  treant: { spawnHeight: 0, frames: ['idle0', 'idle1', 'slam', 'roar'], sheet: 'treant', nouns: ['ELDER', 'ROOTFATHER', 'WARDEN', 'OAK KING'] },
  greatjack: { spawnHeight: 120, frames: ['flame0', 'flame1', 'spit'], sheet: 'greatjack', nouns: ['HARVEST KING', 'LANTERN', 'SCARECROW LORD'] },
  devilsanta: { spawnHeight: 0, frames: null, sheet: 'santa', nouns: ['BELLRINGER', 'TOLLMAN', 'WINTER LORD', 'GIFTBRINGER'] },
  bonecaptain: { spawnHeight: 0, frames: null, sheet: 'bonecaptain', nouns: ['CAPTAIN', 'SEXTON', 'MAYOR', 'MARSHAL', 'WARDEN'] },
  cinderqueen: { spawnHeight: 0, frames: ['idle', 'cast', 'surge', 'erupt'], sheet: 'cinderqueen', nouns: ['CINDER WITCH', 'FORGE QUEEN', 'EMBER PRIESTESS'] },
  gorgon: { spawnHeight: 90, frames: ['a', 'b', 'stare'], sheet: 'gorgon', nouns: ['ORACLE', 'PRIESTESS', 'SERPENT QUEEN'] },
  automaton: { spawnHeight: 0, frames: ['idle', 'walk', 'punch', 'overload'], sheet: 'automaton', nouns: ['AUTOMATON', 'ENGINE', 'TOYMAKER', 'CLOCKWORK WARDEN'] },
  archivist: { spawnHeight: 96, frames: ['idle', 'cast', 'summon', 'shield'], sheet: 'archivist', nouns: ['SCHOLAR', 'CHRONICLER', 'LIBRARIAN', 'ALCHEMIST'] },
  archon: { spawnHeight: 160, frames: ['idle', 'roar', 'pounce', 'shell'], sheet: 'archon', nouns: ['ARCHON', 'GARGOYLE', 'STONE SAINT'] },
  giantbat: { spawnHeight: 150, frames: null, sheet: 'giantbat', nouns: ['NIGHTWING', 'BAT', 'SHRIEKER'] },
  reaper: { spawnHeight: 70, frames: ['idle0', 'idle1', 'windup', 'swing'], sheet: 'boss', nouns: ['REAPER', 'GRAVEDIGGER', 'FERRYMAN'] },
  reaperlord: { spawnHeight: 70, frames: null, sheet: 'boss', nouns: ['REAPER LORD', 'DEATH KNIGHT'] },
  count: { spawnHeight: 0, frames: null, sheet: 'vampire', nouns: ['BARON', 'MARGRAVE', 'COUNTESS', 'DUKE'] },
};

export const GROUND_ENEMIES = [
  'skeleton', 'zombie', 'catoblepas', 'pumpkin', 'icegolem', 'snowman', 'wolf', 'mushroom',
  'magmaslime', 'lavagolem', 'armor', 'alchfiend', 'duelist', 'executioner', 'merman',
  'gravekeeper', 'spriggan', 'scarecrow', 'arbalest', 'pyromancer', 'clockknight', 'inkscholar',
  'censerprelate', 'bloodknight', 'retiarius', 'astralarcher',
  'mosstroll', 'wickerman', 'wendigo', 'bonegoliath', 'brasstitan', 'vathulk', 'minotaur', 'cisterncrab', 'marblecolossus',
];
export const FLYING_ENEMIES = [
  'bat', 'medusa', 'dragon', 'owl', 'ghost', 'tome', 'gargoyle', 'cinderimp', 'wraith',
  'valkyrie', 'necromancer', 'gearharpy', 'waltzdancer', 'siren',
];
export const SPAWNER_TYPES = [
  'zombie', 'pumpkin', 'medusa', 'lantern', 'wisp', 'ghost', 'wraith', 'cinderimp', 'tome',
  'gargoyle', 'bat', 'owl', 'merman', 'valkyrie', 'necromancer', 'gearharpy', 'waltzdancer', 'siren',
];
const ENEMY_VARIANTS = {
  skeleton: ['normal', 'axe', 'red', 'blood', 'frost'],
  bat: ['normal', 'fire'],
  zombie: ['normal', 'ghoul', 'plague'],
  wolf: ['normal', 'alpha'],
  dragon: ['normal', 'frost', 'elder'],
  gargoyle: ['normal', 'obsidian'],
  armor: ['normal', 'crimson'],
  wraith: ['normal', 'banshee'],
};
const DROPS = ['dagger', 'axe', 'holy_water', 'meat', 'heart_big', 'heart_small', 'money'];
const WEATHERS = ['none', 'snow', 'fireflies', 'embers', 'leaves'];

/** Prefab vocabulary: numeric ranges clamp whatever the blueprint asked for. */
const PREFABS = {
  flat: { len: [6, 16] }, vistaBridge: { len: [6, 14] }, corridor: { len: [8, 12], ceil: [2, 6] },
  crumbleRun: { len: [3, 5] }, ferryGap: { len: [6, 6] }, splitRoute: { len: [12, 16] },
  doubleDeck: { len: [16, 20] }, tripleStacks: { len: [20, 24] }, undercroftLoop: { len: [16, 18] },
  towerClimb: { h: [4, 6] }, deepShaft: { h: [4, 6] },
  gearWheel: {}, liftShaft: { h: [3, 6] }, descent: { h: [3, 6] }, hiddenVault: {},
  swingRun: { n: [2, 4] }, lavaRun: { len: [6, 10] }, canalRun: { len: [6, 10] }, stepUp: { n: [1, 3] }, stepDown: { n: [1, 3] },
  climb: { n: [2, 5] }, blocks: { h: [2, 3] }, spikeRun: { len: [3, 6] }, gap: { len: [2, 2] },
};

export const SUGGESTIONS = [
  ['ABANDONED VILLAGE', 'A plague-emptied hamlet of shuttered cottages, a dry well and a bell tower that still tolls at midnight'],
  ['SUNKEN CISTERN', 'Flooded brick vaults beneath the keep where drowned things wait in black water'],
  ["ALCHEMIST'S OBSERVATORY", 'A crooked tower of brass orreries, bubbling retorts and star charts scrawled in blood'],
  ['BLOOD ORCHARD', 'Rows of weeping crimson trees heavy with fruit that whispers your name'],
  ['DROWNED HARBOUR', 'Rotting piers and beached hulks under a green lighthouse beam'],
  ['PUPPET THEATRE', 'A gilded playhouse where marionettes cut their own strings'],
  ['FROZEN MONASTERY', 'Ice-choked cloisters and a chapel of silent bells on the mountain'],
  ['MIRROR GALLERY', 'An endless hall of tarnished mirrors that reflect things that are not there'],
];

// ------------------------------------------------------------------- helpers

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clampInt = (v, lo, hi, def) => {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return def == null ? lo : def;
  return Math.max(lo, Math.min(hi, n));
};

/** "Abandoned Village" -> "abandoned_village" (unique against existing stages). */
export function slugify(name) {
  let s = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'wing';
  if (/^\d/.test(s)) s = 'w_' + s;
  let key = s, n = 2;
  while (STAGE_BY_KEY[key] || MAP_ROOMS[key]) key = `${s}_${n++}`;
  return key;
}

/** "abandoned village" -> "THE ABANDONED VILLAGE". */
export function titleCaseName(raw) {
  let s = String(raw || '').replace(/\s+/g, ' ').trim().toUpperCase().replace(/[^A-Z0-9 '&.,!?-]/g, '');
  if (!s) s = 'NAMELESS WING';
  if (!/^(THE|A|AN) /.test(s)) s = 'THE ' + s;
  return s.slice(0, 30);
}

const hexToRgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const isHex = (s) => !!hexToRgb(s);

/** Picks the base realm whose keyword list best matches the proposal text. */
export function guessBaseTheme(text) {
  const t = ` ${String(text || '').toLowerCase()} `;
  let best = null, bestScore = 0;
  for (const [key, bt] of Object.entries(BASE_THEMES)) {
    let score = 0;
    for (const w of bt.words) {
      const idx = t.indexOf(w);
      if (idx >= 0) score += w.length + (t[idx - 1] === ' ' ? 2 : 0);
    }
    if (score > bestScore) { bestScore = score; best = key; }
  }
  return best || ['yule', 'darkwood', 'forest', 'ramparts', 'catacombs', 'library'][hashString(t) % 6];
}

// ------------------------------------------------------- procedural designer

const ADJECTIVES = ['HOLLOW', 'WITHERED', 'FORSAKEN', 'PALE', 'RUSTED', 'SILENT', 'CRIMSON', 'WEEPING', 'ASHEN', 'GILDED', 'DROWNED', 'NAMELESS'];
const RELIC_NOUNS = ['SIGIL', 'BELL', 'LANTERN', 'SEAL', 'CHARM', 'IDOL', 'KEY', 'CROWN', 'TALISMAN'];
const SUBTITLES = [
  'WHERE THE {N} KEEPS ITS DEAD', 'NO LIGHT RETURNS FROM THE {N}', 'THE {N} REMEMBERS YOUR NAME',
  'BEWARE THE BELLS OF THE {N}', 'EVERY DOOR IN THE {N} IS OPEN', 'THE {N} WAS NEVER EMPTY',
];
const BOSS_LINE_TEMPLATES = [
  'NO ONE LEAVES THE {N} ALIVE, HUNTER... THE BELLS HAVE ALREADY TOLLED FOR YOU!',
  'SO THE LITTLE HUNTER WANDERS INTO THE {N}... COME CLOSER, AND BECOME PART OF IT FOREVER!',
  'I HAVE WAITED A HUNDRED WINTERS IN THE {N}, WORM... TONIGHT MY HUNGER ENDS WITH YOU!',
  'THE {N} IS MINE, HUNTER! KNEEL AMONG ITS RUINS OR BE BURIED BENEATH THEM!',
];
const WHERE_WORDS = ['FORSAKEN REACH', 'OUTER DARK', 'LOST QUARTER', 'HOLLOW MARCHES', 'FAR WING', 'BLACK ANNEX', 'SILENT WARD', 'LOWER MARCHES'];

/**
 * Deterministic procedural blueprint from a proposal; also sent to the forge
 * server as the fallback should Gemini's draft fail validation.
 */
export function designBlueprint({ name, description = '' }, seedOverride = null) {
  const displayName = titleCaseName(name);
  const shortName = displayName.replace(/^(THE|A|AN) /, '');
  const seed = seedOverride != null ? seedOverride : hashString(displayName + '|' + description);
  const rng = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const base = guessBaseTheme(`${name} ${description}`);
  const bt = BASE_THEMES[base];
  const outdoor = bt.outdoor;
  const key = slugify(shortName);
  const bossType = pick(bt.boss);
  const bossName = `THE ${pick(ADJECTIVES)} ${pick(BOSS_BASES[bossType].nouns)}`;
  const g = bt.enemies.filter((e) => GROUND_ENEMIES.includes(e));
  const f = bt.enemies.filter((e) => FLYING_ENEMIES.includes(e));
  const g0 = g[0] || 'skeleton', g1 = g[1] || g0, g2 = g[2] || g1;
  const fl = f[0] || 'bat', fl1 = f[1] || fl;
  const sp0 = bt.spawn[0] || 'bat', sp1 = bt.spawn[1] || sp0;
  const hueShift = Math.round((rng() - 0.5) * 70);
  const accentPalette = ['#c9a86a', '#8ad4ff', '#ff9a6a', '#b48cff', '#9ad17a', '#ff6a88', '#62f2c2', '#ffd27a'];
  const accent = pick(accentPalette);
  const relicEffect = pick(Object.keys(FORGED_RELIC_EFFECTS));
  const voiceFemale = bossType === 'cinderqueen' || bossType === 'gorgon' || rng() < 0.3;
  const long = (len) => len + Math.floor(rng() * 3) - 1;
  const run = outdoor ? 'vistaBridge' : 'corridor';
  const segments = [
    { type: 'flat', len: 12, candles: [3, 9], enemies: [[g0, 5], [g1, 8], [fl, 10, { h: 5 }]] },
    { type: 'crumbleRun', len: 3, safe: true, belowBlock: 'money' },
    { type: 'flat', len: long(10), candles: [[4, 'dagger'], 8], enemies: [[g1, 3], [g2, 6], [g0, 9]], spawn: sp0 },
    { type: 'stepUp', n: 2 },
    { type: run, len: 10, ceil: 3, candles: [3, 7], enemies: [[fl, 3, { h: 5 }], [g0, 6], [fl1, 8, { h: 4 }]] },
    { type: 'ferryGap', len: 6, platTiles: 3, period: 4.6, candle: 'axe', safeFloor: !outdoor },
    { type: 'stepDown', n: 2 },
    { type: 'splitRoute', len: 14, reward: 'meat', spawn: sp1, vista: outdoor && rng() < 0.5, enemies: [[g1, 3], [g2, 6], [g0, 9], [g1, 12]], upperEnemies: [[fl, 5, { h: 6 }], [fl1, 10, { h: 5 }]] },
    { type: 'crumbleRun', len: 3, spikes: true },
    { type: 'flat', len: long(10), candles: [3, 8], enemies: [[g2, 4], [g1, 8]] },
    rng() < 0.5 ? { type: 'liftShaft', h: 4, spawn: FLYING_ENEMIES.includes(sp0) || sp0 === 'bat' ? sp0 : 'bat', reward: 'holy_water' } : { type: 'climb', n: 3, candles: true },
    { type: 'flat', len: long(10), candles: [[3, 'holy_water'], 8], enemies: [[fl, 3, { h: 5 }], [g1, 6], [g2, 9]], spawn: sp0 },
    { type: 'descent', h: 4, enemies: [[fl, 2, { h: 2 }], [fl1, 4, { h: 3 }]] },
    { type: 'hiddenVault', reward: 'meat', weapon: 'axe', enemies: [[g1, 5], [g2, 8]] },
    { type: 'swingRun', n: 3, period: 2.8, reward: 'heart_big' },
    { type: 'flat', len: 9, candles: [4], enemies: [[g0, 3], [g2, 5], [g1, 8]] },
    { type: 'crumbleRun', len: 4, safe: true, belowBlock: 'money' },
    { type: run, len: 8, ceil: 3, candles: [[4, 'heart_big']], enemies: [[fl, 3, { h: 5 }], [g1, 5], [fl1, 7, { h: 4 }]], spawn: sp1 },
  ];
  if (base === 'clocktower' || base === 'arcade') segments.splice(10, 0, { type: 'gearWheel', safe: true, speed: 0.52, reward: 'dagger' });
  if (base === 'darkcave') segments.splice(4, 0, { type: 'lavaRun', len: 8, islands: [[2, 2], [5, 2]], candles: [[3, 'dagger']], enemies: [['bat', 6, { h: 5, variant: 'fire' }]] });
  if ((base === 'ossuary' || base === 'catacombs' || base === 'darkwood') && /water|cistern|sewer|harbour|harbor|drown|canal|aqueduct|pool|lake|river/i.test(`${name} ${description}`)) {
    segments.splice(4, 0, { type: 'canalRun', len: 8, islands: [[2, 2], [5, 2]], candles: [[3, 'dagger']], enemies: [[g0, 6]] });
  }
  const place = shortName;
  const descr = String(description || '').trim() || `${shortName.toLowerCase()} of the vampire's castle`;
  return {
    key, name: displayName, subtitle: pick(SUBTITLES).replace('{N}', shortName), where: pick(WHERE_WORDS),
    description: descr, base, outdoor, connectsTo: neighboursFor(base), seed,
    rows: bt.rows, startRow: bt.startRow,
    palette: { accent, bg: outdoor ? '#0b0a14' : '#070610', hueShift, saturate: 0.9 + rng() * 0.2 },
    weather: base === 'yule' ? 'snow' : base === 'darkwood' ? 'fireflies' : base === 'darkcave' ? 'embers' : base === 'forest' ? 'leaves' : 'none',
    segments,
    boss: {
      type: bossType, name: bossName, line: pick(BOSS_LINE_TEMPLATES).replace('{N}', place),
      voice: { female: voiceFemale, direction: `Begin with a cruel echoing laugh, drop to a chilling whisper, then shout the final threat with evil fury. Character: ${bossName}, guardian of ${place}.` },
      art: `${bossName}, the monstrous guardian of ${descr}: a towering gothic horror boss matching the silhouette and pose set of its archetype`,
    },
    relic: { name: `${pick(RELIC_NOUNS)} OF THE ${place.split(' ').slice(-1)[0]}`.slice(0, 26), effect: relicEffect, color: accent },
    art: {
      style: `${shortName.toLowerCase()}: ${descr}`,
      props: ['prop_a', 'prop_b', 'prop_c', 'prop_d'],
    },
    music: `Stage theme for ${descr}: dark gothic ${outdoor ? 'outdoor adventure' : 'subterranean dread'} in a minor key at ${128 + Math.floor(rng() * 36)} BPM, pipe organ, harpsichord, pulsing synth bass, crisp drums, a memorable haunting lead melody.`,
    ambience: `${outdoor ? 'Cold night wind' : 'Dripping water and distant echoes'} in ${descr}, eerie, sparse, loopable ambience`,
    source: 'procedural',
  };
}

/** Preferred neighbours on the castle map for a base realm (outdoor wings hug the grounds). */
function neighboursFor(base) {
  const pref = {
    graveyard: ['graveyard', 'darkwood', 'ramparts'], darkwood: ['darkwood', 'aqueduct', 'graveyard'], forest: ['jack', 'darkwood', 'yule'],
    yule: ['yule', 'skykeep', 'jack'], ramparts: ['ramparts', 'coliseum', 'skykeep', 'graveyard'], catacombs: ['catacombs', 'aqueduct', 'ossuary', 'darkcave'],
    darkcave: ['darkcave', 'catacombs', 'aqueduct'], ossuary: ['ossuary', 'catacombs', 'clocktower'], arcade: ['arcade', 'ballroom', 'clocktower', 'cathedral'],
    library: ['library', 'alchemy', 'throne', 'cathedral'], cathedral: ['cathedral', 'arcade', 'throne'], clocktower: ['clocktower', 'library', 'arcade'],
    throne: ['throne', 'ballroom', 'cathedral', 'library'],
  };
  return pref[base] || ['graveyard'];
}

// ------------------------------------------------------------- validation

/** Coerces any blueprint (Gemini's or ours) into a safe, buildable one. */
export function sanitizeBlueprint(raw, fallback) {
  const bp = (raw && typeof raw === 'object') ? raw : {};
  const fb = fallback || designBlueprint({ name: bp.name || 'Nameless Wing', description: bp.description || '' });
  const out = Object.assign({}, fb);
  const base = BASE_THEMES[bp.base] ? bp.base : fb.base;
  const bt = BASE_THEMES[base];
  out.base = base;
  out.outdoor = bt.outdoor;
  out.rows = bt.rows;
  out.startRow = bt.startRow;
  out.name = titleCaseName(bp.name || fb.name);
  out.key = fb.key || slugify(out.name);
  out.subtitle = String(bp.subtitle || fb.subtitle).toUpperCase().replace(/[^A-Z0-9 '&.,!?:-]/g, '').slice(0, 44) || fb.subtitle;
  out.where = String(bp.where || fb.where).toUpperCase().replace(/[^A-Z0-9 '-]/g, '').slice(0, 20) || fb.where;
  out.description = String(bp.description || fb.description).slice(0, 240);
  out.connectsTo = (Array.isArray(bp.connectsTo) ? bp.connectsTo : []).filter((k) => MAP_ROOMS[k]).concat(fb.connectsTo);
  out.seed = Number.isFinite(Number(bp.seed)) ? (Number(bp.seed) >>> 0) : fb.seed;
  const pal = bp.palette || {};
  out.palette = {
    accent: isHex(pal.accent) ? pal.accent : fb.palette.accent,
    bg: isHex(pal.bg) ? pal.bg : fb.palette.bg,
    hueShift: clampInt(pal.hueShift, -60, 60, fb.palette.hueShift),
    saturate: Math.max(0.6, Math.min(1.4, Number(pal.saturate) || fb.palette.saturate)),
  };
  out.weather = WEATHERS.includes(bp.weather) ? bp.weather : fb.weather;
  out.segments = sanitizeSegments(Array.isArray(bp.segments) && bp.segments.length >= 8 ? bp.segments : fb.segments, bt);
  const boss = bp.boss || {};
  const bossType = BOSS_BASES[boss.type] ? boss.type : fb.boss.type;
  out.boss = {
    type: bossType,
    name: String(boss.name || fb.boss.name).toUpperCase().replace(/[^A-Z0-9 '-]/g, '').slice(0, 28) || fb.boss.name,
    line: String(boss.line || fb.boss.line).toUpperCase().replace(/[^A-Z0-9 '.,!?-]/g, '').slice(0, 120) || fb.boss.line,
    voice: {
      female: typeof (boss.voice && boss.voice.female) === 'boolean' ? boss.voice.female : fb.boss.voice.female,
      direction: String((boss.voice && boss.voice.direction) || fb.boss.voice.direction).slice(0, 400),
    },
    art: String(boss.art || fb.boss.art).slice(0, 600),
  };
  const relic = bp.relic || {};
  out.relic = {
    name: String(relic.name || fb.relic.name).toUpperCase().replace(/[^A-Z0-9 '-]/g, '').slice(0, 26) || fb.relic.name,
    effect: FORGED_RELIC_EFFECTS[relic.effect] ? relic.effect : fb.relic.effect,
    color: isHex(relic.color) ? relic.color : out.palette.accent,
  };
  const art = bp.art || {};
  const propNames = (Array.isArray(art.props) ? art.props : fb.art.props)
    .map((p) => String(p && typeof p === 'object' ? p.name : p).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 16))
    .filter((p, i, a) => p && a.indexOf(p) === i)
    .slice(0, 4);
  out.art = Object.assign({}, fb.art, { style: String(art.style || fb.art.style).slice(0, 300), props: propNames.length === 4 ? propNames : fb.art.props });
  for (const k of ['palette', 'floorSurface', 'floorBelow', 'wall', 'backdrop', 'icon']) if (typeof art[k] === 'string') out.art[k] = art[k].slice(0, 400);
  out.music = String(bp.music || fb.music).slice(0, 600);
  out.ambience = String(bp.ambience || fb.ambience).slice(0, 300);
  out.source = bp.source || 'gemini';
  return out;
}

function sanitizeEnemyList(list, len, allowFlying = true) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const e of list.slice(0, 6)) {
    const arr = Array.isArray(e) ? e : (e && typeof e === 'object' ? [e.type, e.offset, e] : null);
    if (!arr) continue;
    const type = String(arr[0]);
    const flying = FLYING_ENEMIES.includes(type);
    if (!flying && !GROUND_ENEMIES.includes(type)) continue;
    if (flying && !allowFlying) continue;
    const off = clampInt(arr[1], 1, Math.max(1, len - 2), Math.floor(len / 2));
    const o = (arr[2] && typeof arr[2] === 'object') ? arr[2] : {};
    const opts = {};
    if (flying) opts.h = clampInt(o.h, 2, 7, 5);
    if (ENEMY_VARIANTS[type] && ENEMY_VARIANTS[type].includes(o.variant)) opts.variant = o.variant;
    out.push([type, off, opts]);
  }
  return out;
}

function sanitizeCandles(list, len) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const c of list.slice(0, 4)) {
    if (Array.isArray(c)) {
      const off = clampInt(c[0], 1, Math.max(1, len - 2), 2);
      out.push(DROPS.includes(c[1]) ? [off, c[1]] : off);
    } else out.push(clampInt(c, 1, Math.max(1, len - 2), 2));
  }
  return out;
}

const drop = (v, def = null) => (DROPS.includes(v) ? v : def);
const spawnType = (v) => (SPAWNER_TYPES.includes(v) ? v : null);

/** Validates prefab segments and keeps the walking row inside the level. */
export function sanitizeSegments(segments, bt) {
  const out = [];
  const minRow = 5, maxRow = bt.rows - 3;
  let row = bt.startRow;
  let cols = 0;
  for (const raw of segments) {
    if (out.length >= 24 || cols > 190) break;
    const s = Array.isArray(raw) ? Object.assign({ type: raw[0] }, raw[1] || {}, typeof raw[1] === 'number' ? { len: raw[1], n: raw[1], h: raw[1] } : {}, raw[2] || {}) : raw;
    if (!s || typeof s !== 'object') continue;
    const type = String(s.type);
    const spec = PREFABS[type];
    if (!spec) continue;
    const seg = { type };
    const len = spec.len ? clampInt(s.len, spec.len[0], spec.len[1], spec.len[0]) : 0;
    if (spec.len) seg.len = len;
    if (spec.ceil) seg.ceil = clampInt(s.ceil, spec.ceil[0], spec.ceil[1], 3);
    if (spec.n) seg.n = clampInt(s.n, spec.n[0], spec.n[1], spec.n[0]);
    if (spec.h) seg.h = clampInt(s.h, spec.h[0], spec.h[1], spec.h[0]);
    // Row bookkeeping so lifts/descents never leave the grid.
    if (type === 'stepUp' || type === 'climb') { seg.n = Math.min(seg.n, row - minRow); if (seg.n < (type === 'climb' ? 2 : 1)) continue; row -= seg.n; }
    else if (type === 'stepDown') { seg.n = Math.min(seg.n, maxRow - row); if (seg.n < 1) continue; row += seg.n; }
    else if (type === 'liftShaft' || type === 'towerClimb') { seg.h = Math.min(seg.h, row - minRow); if (seg.h < 3) continue; row -= seg.h; }
    else if (type === 'descent' || type === 'deepShaft') { seg.h = Math.min(seg.h, maxRow - row); if (seg.h < 3) continue; row += seg.h; }
    else if (type === 'tripleStacks' && row < 8) continue;
    else if (type === 'doubleDeck' && row < 6) continue;
    else if (type === 'undercroftLoop' && row + 4 >= bt.rows - 1) continue;
    else if (type === 'gearWheel') { if (row - 4 < minRow) continue; row -= 4; }
    else if (type === 'ferryGap') { const rise = clampInt(s.rise, -4, 4, 0); seg.rise = Math.max(row - maxRow, Math.min(row - minRow, rise)); row -= seg.rise; }
    const eLen = len || (type === 'splitRoute' ? 14 : 10);
    if (s.candles !== undefined) seg.candles = sanitizeCandles(s.candles, eLen);
    if (s.enemies !== undefined) seg.enemies = sanitizeEnemyList(s.enemies, eLen, type !== 'corridor');
    if (s.upperEnemies !== undefined) seg.upperEnemies = sanitizeEnemyList(s.upperEnemies, eLen);
    if (spawnType(s.spawn)) seg.spawn = s.spawn;
    if (s.spawnVariant && ENEMY_VARIANTS[seg.spawn] && ENEMY_VARIANTS[seg.spawn].includes(s.spawnVariant)) seg.spawnVariant = s.spawnVariant;
    for (const k of ['safe', 'spikes', 'abyss', 'vista', 'safeFloor', 'ferry']) if (typeof s[k] === 'boolean') seg[k] = s[k];
    if (s.candle !== undefined) seg.candle = s.candle === true ? true : drop(s.candle, 'heart_big');
    for (const k of ['reward', 'weapon', 'belowBlock']) if (s[k] !== undefined) { const d = drop(s[k]); if (d) seg[k] = d; }
    if (s.period !== undefined) seg.period = Math.max(2.0, Math.min(6.0, Number(s.period) || 4.6));
    if (s.speed !== undefined) seg.speed = Math.max(-0.7, Math.min(0.7, Number(s.speed) || 0.5));
    if (s.platTiles !== undefined) seg.platTiles = clampInt(s.platTiles, 2, 3, 3);
    if (s.ledge !== undefined) seg.ledge = clampInt(s.ledge, 2, 4, 3);
    if (Array.isArray(s.drops)) seg.drops = s.drops.slice(0, 3).map((d) => drop(d));
    if (Array.isArray(s.islands)) seg.islands = s.islands.slice(0, 4).map((i) => [clampInt(i && i[0], 1, Math.max(1, eLen - 2), 2), clampInt(i && i[1], 1, 3, 2)]);
    if (Array.isArray(s.crumble)) seg.crumble = s.crumble.slice(0, 3).map((i) => [clampInt(i && i[0], 1, Math.max(1, eLen - 2), 2), clampInt(i && i[1], 1, 3, 2)]);
    if (Array.isArray(s.ledges)) seg.ledges = s.ledges.slice(0, 3).map((l) => [clampInt(l && l[0], 1, Math.max(1, eLen - 3), 2), clampInt(l && l[1], 2, 4, 2), clampInt(l && l[2], 2, 3, 2)]);
    out.push(seg);
    cols += len || (type === 'gearWheel' ? 12 : type === 'hiddenVault' ? 9 : type === 'liftShaft' ? 7 : type === 'swingRun' ? seg.n * 4 + 1 : type === 'descent' ? 2 * Math.ceil(seg.h / 2) + 3 : type === 'climb' ? seg.n + 3 : (seg.n || 1) * 2);
  }
  if (!out.length || out[0].type !== 'flat') out.unshift({ type: 'flat', len: 12, candles: [3, 9], enemies: [[bt.enemies.find((e) => GROUND_ENEMIES.includes(e)) || 'skeleton', 6]] });
  // Bring the walking row back toward the arena's comfortable height.
  while (row < 8) { const n = Math.min(3, 8 - row); out.push({ type: 'stepDown', n }); row += n; }
  while (row > maxRow) { const n = Math.min(3, row - maxRow); out.push({ type: 'stepUp', n }); row -= n; }
  return out;
}

/** Replays validated segments onto a StageBuilder. */
export function applySegments(b, segments) {
  for (const s of segments) {
    const o = Object.assign({}, s);
    delete o.type; delete o.len; delete o.n; delete o.h; delete o.ceil; delete o.drops;
    switch (s.type) {
      case 'flat': b.flat(s.len, o); break;
      case 'vistaBridge': b.vistaBridge(s.len, o); break;
      case 'corridor': b.corridor(s.len, s.ceil, o); break;
      case 'crumbleRun': b.crumbleRun(s.len, o); break;
      case 'ferryGap': b.ferryGap(s.len, o); break;
      case 'splitRoute': b.splitRoute(s.len, o); break;
      case 'doubleDeck': b.doubleDeck(s.len, o); break;
      case 'tripleStacks': b.tripleStacks(s.len, o); break;
      case 'undercroftLoop': b.undercroftLoop(s.len, o); break;
      case 'towerClimb': b.towerClimb(s.h, o); break;
      case 'deepShaft': b.deepShaft(s.h, o); break;
      case 'gearWheel': b.gearWheel(o); break;
      case 'liftShaft': b.liftShaft(s.h, o); break;
      case 'descent': b.descent(s.h, o); break;
      case 'hiddenVault': b.hiddenVault(o); break;
      case 'swingRun': b.swingRun(s.n, o); break;
      case 'lavaRun': b.lavaRun(s.len, o); break;
      case 'canalRun': b.canalRun(s.len, o); break;
      case 'stepUp': b.stepUp(s.n); break;
      case 'stepDown': b.stepDown(s.n); break;
      case 'climb': b.climb(s.n, o); break;
      case 'blocks': b.blocks(s.h, s.drops || ['meat', null, 'money'], o); break;
      case 'spikeRun': b.spikeRun(s.len, o); break;
      case 'gap': b.gap(o && o.ledge ? s.len : Math.min(2, s.len || 2), o); break;
      default: break;
    }
  }
}

// ------------------------------------------------------------- registration

/** Hue-shifted copy of a loaded image (fallback art when nothing was generated). */
function tintedCopy(img, hueShift, saturate = 1, brightness = 1) {
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d');
  if ('filter' in g) g.filter = `hue-rotate(${hueShift}deg) saturate(${saturate}) brightness(${brightness})`;
  g.drawImage(img, 0, 0);
  return c;
}

let _nextMaterial = T_FORGE_BASE;

/**
 * Registers one forged wing (registry `entry` = { key, blueprint, assets,
 * music, voice, ambient, createdAt, source }) into every game system. Resolves
 * the stage, or null when it cannot be placed.
 */
export async function registerForgedEntry(entry, { assets, audio = null } = {}) {
  const src = entry.blueprint || {};
  const fb = designBlueprint({ name: src.name || entry.key, description: src.description || '' });
  fb.key = entry.key || fb.key;
  const bp = sanitizeBlueprint(src, fb);
  bp.key = entry.key || bp.key;
  if (STAGE_BY_KEY[bp.key]) return STAGE_BY_KEY[bp.key];
  const bt = BASE_THEMES[bp.base];
  const base = THEMES[bp.base];
  const prefix = `forge_${bp.key}_`;
  const v = encodeURIComponent(`${entry.createdAt || entry.key}_${ASSET_VERSION}`);
  const gen = entry.assets || {};
  const loaded = {};
  // 1. Generated art (server) ...
  await Promise.all(Object.entries(gen).map(async ([kind, info]) => {
    if (!info || !info.file) return;
    const ok = await assets.registerFromUrl(prefix + kind, Object.assign({}, info), `assets/${info.file}?v=${v}`);
    if (ok) loaded[kind] = prefix + kind;
  }));
  // ... 2. or tinted copies of the base realm's art.
  const hue = bp.palette.hueShift || 0, sat = bp.palette.saturate || 1;
  if (!loaded.floor && assets.img(bt.strip)) {
    assets.register(prefix + 'floor', Object.assign({}, assets.info(bt.strip), { file: null }), tintedCopy(assets.img(bt.strip), hue, sat));
    loaded.floor = prefix + 'floor';
  }
  if (!bt.outdoor && !loaded.wall && assets.img(base.wall)) {
    assets.register(prefix + 'wall', Object.assign({}, assets.info(base.wall), { file: null }), tintedCopy(assets.img(base.wall), hue, sat, 0.95));
    loaded.wall = prefix + 'wall';
  }
  if (bt.outdoor && !loaded.backdrop && bt.backdrop && assets.img(bt.backdrop)) {
    assets.register(prefix + 'backdrop', Object.assign({}, assets.info(bt.backdrop), { file: null }), tintedCopy(assets.img(bt.backdrop), hue, sat));
    loaded.backdrop = prefix + 'backdrop';
  }
  // 3. Terrain material + 3D textures
  const floorInfo = assets.info(loaded.floor);
  const tileId = _nextMaterial++;
  registerMaterial(tileId, loaded.floor);
  registerForgedMaterial(tileId, loaded.floor, { overhang: (floorInfo && floorInfo.overhang) || 4, sideBg: bp.palette.bg });
  // 4. Parallax + music + voice
  if (bt.outdoor) registerLayerSet(bp.key, { backdropImg: loaded.backdrop || null, baseSet: base.layers || 'outdoor', accentRgb: hexToRgb(bp.palette.accent) || [200, 210, 255] });
  let musicKey = base.music;
  if (entry.music) { registerTrack(bp.key, `assets/${entry.music}?v=${v}`); musicKey = bp.key; }
  // The boss always speaks under its own key: without a generated clip the
  // forged subtitle simply plays silently instead of borrowing a base boss's line.
  const voiceKey = prefix + 'voice';
  if (entry.voice) registerVoice(voiceKey, `assets/${entry.voice}?v=${v}`);
  // 5. Theme
  const propsInfo = loaded.props ? assets.info(loaded.props) : null;
  const propFrames = propsInfo && propsInfo.frames ? Object.keys(propsInfo.frames) : [];
  registerTheme(bp.key, {
    base: bp.base, outdoor: bt.outdoor, layers: bt.outdoor ? bp.key : null, material: tileId,
    wall: loaded.wall || base.wall, music: musicKey, bg: bp.palette.bg, accent: bp.palette.accent,
    weather: bp.weather === 'none' ? null : bp.weather, ally: null,
    props: propFrames.length ? { sheet: loaded.props, frames: propFrames } : null,
    ambient: entry.ambient ? `assets/${entry.ambient}?v=${v}` : null, forged: true,
  });
  // 6. Stage
  const b = new StageBuilder({ id: 0, name: bp.name, subtitle: bp.subtitle, theme: bp.key, rows: bp.rows, startRow: bp.startRow, seed: (bp.seed % 1000) + 1 });
  applySegments(b, bp.segments);
  b.vestibule({ drop: 'heart_big' });
  b.arena(bp.boss.type, bp.boss.name, { spawnHeight: BOSS_BASES[bp.boss.type].spawnHeight });
  const stage = Object.assign(b.done(), { key: bp.key, forged: true, blueprint: bp });
  const rgb = hexToRgb(bp.palette.accent) || [200, 160, 255];
  Object.assign(stage.boss, {
    line: bp.boss.line,
    voice: voiceKey,
    female: Boolean(bp.boss.voice && bp.boss.voice.female),
    sheet: loaded.boss || null,
    tint: loaded.boss ? null : `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.38)`,
    aura: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.22)`,
  });
  // 7. Castle map rooms + passage, relic
  const placed = placeForgedRoom(bp.key, { preferred: bp.connectsTo, seed: bp.seed, spineLen: 9 + (bp.seed % 3), extras: 3 });
  if (!placed) { console.warn('Castle Forge: no room left on the map for', bp.key); return null; }
  registerStage(stage);
  const icon = loaded.icon ? { sheet: loaded.icon, frame: 'icon' } : ((MAP_ROOMS[bp.base] && MAP_ROOMS[bp.base].icon) || { sheet: 'map_icons', frame: bp.base });
  registerMapRoom(bp.key, Object.assign(placed.room, { where: bp.where, icon }), placed.door);
  registerRelic(bp.key, Object.assign({}, bp.relic, { boss: bp.boss.name }));
  stage.anchorKey = placed.anchorKey;
  return stage;
}

// ------------------------------------------------------------------ client

/** Talks to the forge server (tools/forge_server.py) and falls back to local forging. */
export class Forge {
  constructor(game) {
    this.game = game;
    this.online = null;           // null = unknown, true/false after health check
    this.capabilities = {};
    this.entries = [];            // registered registry entries (server + local)
    this.activeJob = null;        // { id, status, steps, blueprint, entry, error, local, preview }
    this.pendingReveal = null;    // key of a freshly raised wing awaiting its map reveal
    this.lastError = null;
    this._pollTimer = null;
  }

  get forgedCount() { return this.entries.length; }

  async health() {
    try {
      const res = await fetch(`${FORGE_API}/health`, { cache: 'no-store' });
      if (!res.ok) throw new Error(String(res.status));
      const j = await res.json();
      this.online = !!j.ok;
      this.capabilities = j;
    } catch (e) {
      this.online = false;
      this.capabilities = {};
    }
    return this.online;
  }

  /** Boot: registers every wing already raised on this server (and locally). */
  async loadRegistry() {
    const { assets, audio } = this.game;
    await this.health();
    let list = [];
    if (this.online) {
      try {
        const res = await fetch(`${FORGE_API}/stages`, { cache: 'no-store' });
        if (res.ok) list = (await res.json()).stages || [];
      } catch (e) { /* offline after all */ }
    }
    if (!list.length) {
      try {
        const res = await fetch(`assets/forge/stages.json?v=${ASSET_VERSION}`);
        if (res.ok) {
          const data = await res.json();
          list = Array.isArray(data) ? data : (data.stages || []);
        }
      } catch (e) { /* no static forge registry */ }
    }
    for (const local of this.loadLocal()) if (!list.some((e) => e.key === local.key)) list.push(local);
    for (const entry of list.slice(0, MAX_FORGED_WINGS)) {
      try {
        const stage = await registerForgedEntry(entry, { assets, audio });
        if (stage) this.entries.push(entry);
      } catch (e) { console.warn('Castle Forge: could not register', entry && entry.key, e); }
    }
    // Resume a job that was still forging when the page was last closed.
    const resumeId = safeGet('gothic.forge.job');
    if (resumeId && this.online) {
      const st = await this.fetchJob(resumeId);
      if (st && st.status !== 'done' && st.status !== 'error') this.watch(st);
      else safeSet('gothic.forge.job', '');
    }
    return this.entries.length;
  }

  loadLocal() {
    try { const arr = JSON.parse(safeGet(LOCAL_KEY) || '[]'); return Array.isArray(arr) ? arr : []; } catch (e) { return []; }
  }

  saveLocal(entry) {
    const arr = this.loadLocal().filter((e) => e.key !== entry.key);
    arr.push(entry);
    safeSet(LOCAL_KEY, JSON.stringify(arr));
  }

  /** Starts forging a proposed wing; returns the job (server-backed or local). */
  async propose({ name, description = '' }) {
    if (this.entries.length >= MAX_FORGED_WINGS) throw new Error('THE CASTLE CAN HOLD NO MORE WINGS');
    const fallback = designBlueprint({ name, description });
    this.lastError = null;
    if (this.online === null) await this.health();
    if (this.online) {
      try {
        const res = await fetch(FORGE_API, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, description, fallback }),
        });
        if (!res.ok) throw new Error(`forge server ${res.status}`);
        const job = await res.json();
        job.local = false;
        job.preview = this.previewFor(job.blueprint || fallback);
        safeSet('gothic.forge.job', job.id);
        this.watch(job);
        return job;
      } catch (e) {
        console.warn('Castle Forge server unavailable, forging locally', e);
        this.online = false;
      }
    }
    return this.forgeLocally(fallback);
  }

  /** Offline forge: the procedural blueprint, tinted base art, base music; animated step list. */
  forgeLocally(blueprint) {
    const steps = [
      ['blueprint', 'DRAFTING THE BLUEPRINT'], ['art', 'QUARRYING STONE AND PAINTING THE SKY'],
      ['music', 'COMPOSING THE SCORE'], ['voice', 'SUMMONING THE GUARDIAN'], ['register', 'RAISING THE WALLS'],
    ].map(([key, label]) => ({ key, label, state: 'pending', detail: '' }));
    const job = { id: `local_${Date.now()}`, status: 'running', steps, blueprint, entry: null, error: null, local: true, startedAt: Date.now() };
    job.preview = this.previewFor(blueprint);
    this.activeJob = job;
    const timeline = [
      [0.6, () => { steps[0].state = 'done'; steps[0].detail = `${blueprint.base.toUpperCase()} STYLE · ${blueprint.segments.length} SEGMENTS`; steps[1].state = 'running'; }],
      [2.2, () => { steps[1].state = 'done'; steps[1].detail = 'INHERITED AND RECOLOURED (NO FORGE SERVER)'; steps[2].state = 'running'; }],
      [3.4, () => { steps[2].state = 'skipped'; steps[2].detail = `BASE THEME SCORE (${blueprint.base.toUpperCase()})`; steps[3].state = 'running'; }],
      [4.4, () => { steps[3].state = 'skipped'; steps[3].detail = 'SUBTITLED ONLY'; steps[4].state = 'running'; }],
      [5.4, async () => {
        const entry = { key: blueprint.key, blueprint, assets: null, music: null, voice: null, ambient: null, createdAt: Date.now(), source: 'local' };
        await this.finishJob(job, entry);
      }],
    ];
    steps[0].state = 'running';
    for (const [t, fn] of timeline) setTimeout(fn, t * 1000);
    return job;
  }

  /** Pure placement preview (same algorithm as registration) for the forging screen's ghost rooms. */
  previewFor(blueprint) {
    if (!blueprint) return null;
    try {
      const bp = blueprint.segments ? blueprint : null;
      const seed = bp ? bp.seed : 1;
      return placeForgedRoom(blueprint.key || 'preview', { preferred: blueprint.connectsTo || [], seed, spineLen: 9 + (seed % 3), extras: 3 });
    } catch (e) { return null; }
  }

  async fetchJob(id) {
    try {
      const res = await fetch(`${FORGE_API}/job/${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) { return null; }
  }

  watch(job) {
    this.activeJob = Object.assign({ local: false }, job);
    if (!this.activeJob.preview) this.activeJob.preview = this.previewFor(this.activeJob.blueprint);
    clearTimeout(this._pollTimer);
    const tick = async () => {
      const cur = this.activeJob;
      if (!cur || cur.local) return;
      const st = await this.fetchJob(cur.id);
      if (st) {
        const hadBp = !!cur.blueprint;
        Object.assign(cur, st, { local: false, preview: cur.preview });
        if (!hadBp && cur.blueprint) cur.preview = this.previewFor(cur.blueprint);
        if (st.status === 'done' && st.entry) { await this.finishJob(cur, st.entry); return; }
        if (st.status === 'error') { cur.status = 'error'; this.lastError = st.error || 'THE FORGE FAILED'; safeSet('gothic.forge.job', ''); return; }
      }
      this._pollTimer = setTimeout(tick, 1500);
    };
    this._pollTimer = setTimeout(tick, 800);
  }

  async finishJob(job, entry) {
    try {
      const stage = await registerForgedEntry(entry, { assets: this.game.assets, audio: this.game.audio });
      if (!stage) throw new Error('NO ROOM LEFT IN THE CASTLE GROUNDS');
      this.entries.push(entry);
      if (job.local || entry.source === 'local') this.saveLocal(entry);
      job.entry = entry;
      job.stageKey = stage.key;
      job.status = 'done';
      for (const s of job.steps || []) if (s.state === 'running' || s.state === 'pending') s.state = 'done';
      this.pendingReveal = stage.key;
      if (this.game.onWingRaised) this.game.onWingRaised(stage, job);
    } catch (e) {
      job.status = 'error';
      job.error = String(e.message || e).toUpperCase();
      this.lastError = job.error;
    }
    safeSet('gothic.forge.job', '');
  }

  dismissJob() {
    if (this.activeJob && (this.activeJob.status === 'done' || this.activeJob.status === 'error')) this.activeJob = null;
  }

  /** Index into STAGES of the most recently raised wing (or -1). */
  latestStageIndex() {
    const last = this.entries[this.entries.length - 1];
    return last ? stageIndexOf(last.key) : -1;
  }
}

function safeGet(key) { try { return window.localStorage.getItem(key); } catch (e) { return null; } }
function safeSet(key, value) { try { window.localStorage.setItem(key, value); } catch (e) { /* private mode */ } }

