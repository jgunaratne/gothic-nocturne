// The eighteen stages of Gothic Nocturne: long, true-2D screen-matched
// Metroidvania biomes (380–760 tiles / 19–38 screens wide, multi-story vertical
// galleries, grand staircases, watchtower shafts, and sunken undercrofts)
// compiled 1:1 (`20 x 5` tiles = `640 x 160 px` per map cell) from `MAP_ROOMS`
// and `MAP_DOORS` on the 72 x 27 Castle Exploration Map.

import { STAGE1 as GRAVEYARD } from './level_data.js';
import { composeGridStage } from './grid_composer.js';

const stage1 = Object.assign({}, GRAVEYARD, {
  id: 1,
  key: 'graveyard',
  theme: 'graveyard',
  subtitle: 'GREAT STAIRWAY & ENTRANCE HALL',
});

// ---------------------------------------------------------------- stage 2: the darkwood
function buildDarkwood() {
  return composeGridStage({
    id: 2,
    key: 'darkwood',
    name: 'THE DARKWOOD',
    subtitle: 'GUARDIAN TURTLE IN SHADOW WOODS',
    theme: 'darkwood',
    seed: 9,
    roster: {
      ground: [['wolf', 'normal'], ['wolf', 'alpha'], ['mushroom', 'normal'], ['zombie', 'plague']],
      heavy: [['wolf', 'alpha'], ['merman', 'normal'], ['mushroom', 'normal']],
      sniper: [['mushroom', 'normal'], ['merman', 'normal'], ['alchfiend', 'normal']],
      aerial: [['owl', 'normal'], ['bat', 'normal'], ['necromancer', 'normal']],
      spawner: 'owl',
    },
    boss: {
      type: 'treant',
      name: 'THE BRIAR KING',
      spawnHeight: 0,
    },
  });
}

// ---------------------------------------------------------------- stage 3: jack-o'-lantern woods
function buildJackOLantern() {
  return composeGridStage({
    id: 3,
    key: 'jack',
    name: "THE JACK-O'-LANTERN",
    subtitle: 'WEST CHAPEL & AUTUMN SPIRE',
    theme: 'forest',
    seed: 17,
    roster: {
      ground: [['pumpkin', 'normal'], ['skeleton', 'axe'], ['zombie', 'plague'], ['alchfiend', 'normal']],
      heavy: [['executioner', 'normal'], ['catoblepas', 'normal'], ['skeleton', 'blood']],
      sniper: [['dragon', 'normal'], ['alchfiend', 'normal'], ['dragon', 'elder']],
      aerial: [['bat', 'fire'], ['dragon', 'normal'], ['dragon', 'elder'], ['necromancer', 'normal']],
      spawner: 'lantern',
    },
    boss: {
      type: 'greatjack',
      name: 'THE GREAT JACK',
      spawnHeight: 120,
    },
  });
}

// ---------------------------------------------------------------- stage 4: the frozen yule
function buildFrozenYule() {
  return composeGridStage({
    id: 4,
    key: 'yule',
    name: 'THE FROZEN YULE',
    subtitle: "DEVIL SANTA'S WINTER SPIRE",
    theme: 'yule',
    seed: 23,
    roster: {
      ground: [['snowman', 'normal'], ['skeleton', 'frost'], ['wolf', 'alpha'], ['skeleton', 'axe']],
      heavy: [['icegolem', 'normal'], ['catoblepas', 'normal'], ['armor', 'normal']],
      sniper: [['snowman', 'normal'], ['skeleton', 'frost'], ['dragon', 'frost']],
      aerial: [['dragon', 'frost'], ['valkyrie', 'normal'], ['wisp', 'normal']],
      spawner: 'wisp',
    },
    boss: {
      type: 'devilsanta',
      name: 'DEVIL SANTA',
      spawnHeight: 0,
    },
  });
}

// ---------------------------------------------------------------- stage 5: the ramparts
function buildRamparts() {
  return composeGridStage({
    id: 5,
    key: 'ramparts',
    name: 'THE RAMPARTS',
    subtitle: 'THREE WATCHTOWERS & TOWER BRIDGES',
    theme: 'ramparts',
    seed: 31,
    roster: {
      ground: [['skeleton', 'axe'], ['duelist', 'normal'], ['skeleton', 'blood'], ['armor', 'normal']],
      heavy: [['armor', 'crimson'], ['executioner', 'normal'], ['catoblepas', 'normal']],
      sniper: [['skeleton', 'axe'], ['skeleton', 'red'], ['alchfiend', 'normal']],
      aerial: [['valkyrie', 'normal'], ['gargoyle', 'normal'], ['bat', 'fire']],
      spawner: 'medusa',
    },
    boss: {
      type: 'bonecaptain',
      name: 'THE BONE CAPTAIN',
      spawnHeight: 0,
    },
  });
}

// ---------------------------------------------------------------- stage 6: the catacombs
function buildCatacombs() {
  return composeGridStage({
    id: 6,
    key: 'catacombs',
    name: 'THE CATACOMBS',
    subtitle: 'CHARNEL SHAFTS & ANCIENT CRYPTS',
    theme: 'catacombs',
    seed: 41,
    roster: {
      ground: [['zombie', 'plague'], ['zombie', 'ghoul'], ['skeleton', 'blood'], ['skeleton', 'axe']],
      heavy: [['executioner', 'normal'], ['armor', 'normal'], ['catoblepas', 'normal']],
      sniper: [['skeleton', 'blood'], ['skeleton', 'red'], ['alchfiend', 'normal']],
      aerial: [['necromancer', 'normal'], ['wraith', 'banshee'], ['wraith', 'normal']],
      spawner: 'medusa',
    },
    boss: {
      type: 'reaper',
      name: 'THE PHANTOM REAPER',
      spawnHeight: 70,
    },
  });
}

// ---------------------------------------------------------------- stage 7: the dark cave
function buildDarkCave() {
  return composeGridStage({
    id: 7,
    key: 'darkcave',
    name: 'THE DARK CAVE',
    subtitle: 'MOLTEN DEPTHS · BEWARE THE RISING MAGMA',
    theme: 'darkcave',
    seed: 53,
    roster: {
      ground: [['magmaslime', 'normal'], ['skeleton', 'blood'], ['alchfiend', 'normal']],
      heavy: [['lavagolem', 'normal'], ['executioner', 'normal'], ['armor', 'crimson']],
      sniper: [['alchfiend', 'normal'], ['dragon', 'elder'], ['skeleton', 'red']],
      aerial: [['cinderimp', 'normal'], ['dragon', 'elder'], ['bat', 'fire']],
      spawner: 'cinderimp',
    },
    boss: {
      type: 'cinderqueen',
      name: 'THE CINDER QUEEN',
      spawnHeight: 0,
    },
  });
}

// ---------------------------------------------------------------- stage 8: the ossuary
function buildOssuary() {
  return composeGridStage({
    id: 8,
    key: 'ossuary',
    name: 'THE OSSUARY',
    subtitle: 'UNDERGROUND RIVER & RELIQUARY ABYSS',
    theme: 'ossuary',
    seed: 61,
    roster: {
      ground: [['merman', 'normal'], ['zombie', 'plague'], ['zombie', 'ghoul'], ['skeleton', 'blood']],
      heavy: [['executioner', 'normal'], ['catoblepas', 'normal'], ['armor', 'normal']],
      sniper: [['merman', 'normal'], ['skeleton', 'blood'], ['skeleton', 'red']],
      aerial: [['necromancer', 'normal'], ['wraith', 'banshee'], ['medusa', 'normal']],
      spawner: 'merman',
    },
    boss: {
      type: 'gorgon',
      name: 'THE GORGON QUEEN',
      spawnHeight: 90,
      waterPool: true,
    },
  });
}

// ---------------------------------------------------------------- stage 9: the arcade
function buildArcade() {
  return composeGridStage({
    id: 9,
    key: 'arcade',
    name: 'THE ARCADE',
    subtitle: 'MARBLE GALLERY OF ANCIENT AUTOMATA',
    theme: 'arcade',
    seed: 71,
    roster: {
      ground: [['duelist', 'normal'], ['armor', 'normal'], ['skeleton', 'axe']],
      heavy: [['armor', 'crimson'], ['executioner', 'normal'], ['catoblepas', 'normal']],
      sniper: [['alchfiend', 'normal'], ['skeleton', 'red'], ['duelist', 'normal']],
      aerial: [['valkyrie', 'normal'], ['wraith', 'normal'], ['gargoyle', 'obsidian']],
      spawner: 'medusa',
    },
    boss: {
      type: 'automaton',
      name: 'THE BRASS AUTOMATON',
      spawnHeight: 0,
    },
  });
}

// ---------------------------------------------------------------- stage 10: the library
function buildLibrary() {
  return composeGridStage({
    id: 10,
    key: 'library',
    name: 'THE LIBRARY',
    subtitle: 'EAST WING STACKS & FORBIDDEN ARCHIVES',
    theme: 'library',
    seed: 79,
    roster: {
      ground: [['alchfiend', 'normal'], ['duelist', 'normal'], ['armor', 'normal']],
      heavy: [['armor', 'crimson'], ['executioner', 'normal'], ['catoblepas', 'normal']],
      sniper: [['alchfiend', 'normal'], ['tome', 'normal'], ['skeleton', 'blood']],
      aerial: [['necromancer', 'normal'], ['tome', 'normal'], ['ghost', 'normal'], ['wraith', 'banshee']],
      spawner: 'tome',
    },
    boss: {
      type: 'archivist',
      name: 'THE SPECTRAL ARCHIVIST',
      spawnHeight: 96,
    },
  });
}

// ---------------------------------------------------------------- stage 11: the cathedral
function buildCathedral() {
  return composeGridStage({
    id: 11,
    key: 'cathedral',
    name: 'THE CATHEDRAL',
    subtitle: 'ROYAL NAVE & ROSE-WINDOW CLERESTORY',
    theme: 'cathedral',
    seed: 89,
    roster: {
      ground: [['duelist', 'normal'], ['armor', 'normal'], ['skeleton', 'blood']],
      heavy: [['armor', 'crimson'], ['executioner', 'normal'], ['catoblepas', 'normal']],
      sniper: [['skeleton', 'blood'], ['alchfiend', 'normal'], ['skeleton', 'axe']],
      aerial: [['valkyrie', 'normal'], ['gargoyle', 'obsidian'], ['necromancer', 'normal']],
      spawner: 'gargoyle',
      spawnerVariant: 'obsidian',
    },
    boss: {
      type: 'archon',
      name: 'THE GARGOYLE ARCHON',
      spawnHeight: 160,
    },
  });
}

// ---------------------------------------------------------------- stage 12: the clock tower
function buildClockTower() {
  return composeGridStage({
    id: 12,
    key: 'clocktower',
    name: 'THE CLOCK TOWER',
    subtitle: 'OUTER WALL SHAFT & MIDNIGHT BELFRY',
    theme: 'clocktower',
    seed: 97,
    roster: {
      ground: [['duelist', 'normal'], ['skeleton', 'blood'], ['armor', 'normal']],
      heavy: [['executioner', 'normal'], ['armor', 'crimson'], ['catoblepas', 'normal']],
      sniper: [['alchfiend', 'normal'], ['skeleton', 'blood'], ['skeleton', 'axe']],
      aerial: [['valkyrie', 'normal'], ['gargoyle', 'obsidian'], ['medusa', 'normal']],
      spawner: 'medusa',
    },
    boss: {
      type: 'reaperlord',
      name: 'THE REAPER LORD',
      spawnHeight: 70,
    },
  });
}

// ---------------------------------------------------------------- stage 13: the throne hall
function buildThroneHall() {
  return composeGridStage({
    id: 13,
    key: 'throne',
    name: 'THE THRONE HALL',
    subtitle: 'SOVEREIGN KEEP · THE COUNT AWAITS',
    theme: 'throne',
    seed: 107,
    roster: {
      ground: [['duelist', 'normal'], ['armor', 'crimson'], ['skeleton', 'blood']],
      heavy: [['executioner', 'normal'], ['armor', 'crimson'], ['lavagolem', 'normal']],
      sniper: [['alchfiend', 'normal'], ['dragon', 'elder'], ['skeleton', 'blood']],
      aerial: [['valkyrie', 'normal'], ['necromancer', 'normal'], ['wraith', 'banshee'], ['cinderimp', 'normal']],
      spawner: 'wraith',
      spawnerVariant: 'banshee',
    },
    boss: {
      type: 'count',
      name: 'THE COUNT',
      spawnHeight: 0,
    },
  });
}

// ---------------------------------------------------------------- stage 14: the alchemy lab
function buildAlchemyLab() {
  return composeGridStage({
    id: 14,
    key: 'alchemy',
    name: 'THE ALCHEMY LAB',
    subtitle: 'RETORT TOWERS & VATS OF VITAE',
    theme: 'alchemy',
    seed: 113,
    roster: {
      ground: [['alchfiend', 'normal'], ['zombie', 'plague'], ['skeleton', 'blood']],
      heavy: [['executioner', 'normal'], ['lavagolem', 'normal'], ['armor', 'crimson']],
      sniper: [['alchfiend', 'normal'], ['tome', 'normal'], ['dragon', 'elder']],
      aerial: [['necromancer', 'normal'], ['wraith', 'banshee'], ['tome', 'normal']],
      spawner: 'ghost',
    },
    boss: {
      type: 'archivist',
      name: 'THE GRAND ALCHEMIST',
      spawnHeight: 96,
      sheet: 'alchemist',
      aura: 'rgba(78, 242, 184, 0.26)',
      voice: 'wing_alchemy_voice',
      line: 'BEHOLD THE GREAT WORK, MORTAL... YOUR VERY BLOOD SHALL TRANSMUTE MY PHILOSOPHER STONE!',
    },
  });
}

// ---------------------------------------------------------------- stage 15: the phantom ballroom
function buildPhantomBallroom() {
  return composeGridStage({
    id: 15,
    key: 'ballroom',
    name: 'THE PHANTOM BALLROOM',
    subtitle: 'WALTZ OF A THOUSAND MIRRORS',
    theme: 'ballroom',
    seed: 127,
    roster: {
      ground: [['duelist', 'normal'], ['armor', 'crimson'], ['skeleton', 'blood']],
      heavy: [['armor', 'crimson'], ['duelist', 'normal'], ['executioner', 'normal']],
      sniper: [['duelist', 'normal'], ['alchfiend', 'normal'], ['skeleton', 'blood']],
      aerial: [['valkyrie', 'normal'], ['wraith', 'banshee'], ['ghost', 'normal']],
      spawner: 'ghost',
    },
    boss: {
      type: 'count',
      name: 'THE MASQUERADE DUKE',
      spawnHeight: 0,
      sheet: 'masquerade',
      aura: 'rgba(255, 110, 208, 0.24)',
      voice: 'wing_ballroom_voice',
      line: 'MAY I HAVE THIS FINAL WALTZ, LITTLE HUNTER? WHEN THE HARPSICHORD STOPS, YOUR HEART SHALL TOO!',
    },
  });
}

// ---------------------------------------------------------------- stage 16: the blood coliseum
function buildBloodColiseum() {
  return composeGridStage({
    id: 16,
    key: 'coliseum',
    name: 'THE BLOOD COLISEUM',
    subtitle: 'ROAR OF THE IRON AMPHITHEATER',
    theme: 'coliseum',
    seed: 139,
    roster: {
      ground: [['duelist', 'normal'], ['executioner', 'normal'], ['skeleton', 'blood']],
      heavy: [['executioner', 'normal'], ['armor', 'crimson'], ['lavagolem', 'normal']],
      sniper: [['skeleton', 'blood'], ['dragon', 'elder'], ['alchfiend', 'normal']],
      aerial: [['valkyrie', 'normal'], ['gargoyle', 'obsidian'], ['cinderimp', 'normal']],
      spawner: 'medusa',
    },
    boss: {
      type: 'bonecaptain',
      name: 'THE IRON GLADIATOR',
      spawnHeight: 0,
      sheet: 'gladiator',
      aura: 'rgba(255, 80, 56, 0.24)',
      voice: 'wing_coliseum_voice',
      line: 'SALUTE THE BLOOD SANDS, CHALLENGER! NO MORTAL HAS EVER WALKED OUT THROUGH MY CHAMPION GATE!',
    },
  });
}

// ---------------------------------------------------------------- stage 17: the sunken aqueduct
function buildSunkenAqueduct() {
  return composeGridStage({
    id: 17,
    key: 'aqueduct',
    name: 'THE SUNKEN AQUEDUCT',
    subtitle: 'FLOODED CISTERNS BENEATH THE KEEP',
    theme: 'aqueduct',
    seed: 149,
    roster: {
      ground: [['merman', 'normal'], ['zombie', 'plague'], ['skeleton', 'frost']],
      heavy: [['icegolem', 'normal'], ['executioner', 'normal'], ['catoblepas', 'normal']],
      sniper: [['merman', 'normal'], ['dragon', 'frost'], ['skeleton', 'frost']],
      aerial: [['wraith', 'banshee'], ['necromancer', 'normal'], ['dragon', 'frost']],
      spawner: 'merman',
    },
    boss: {
      type: 'gorgon',
      name: 'THE DROWNED ORACLE',
      spawnHeight: 90,
      waterPool: true,
      sheet: 'oracle',
      aura: 'rgba(66, 200, 255, 0.25)',
      voice: 'wing_aqueduct_voice',
      line: 'HEAR THE BLACK TIDE RISING IN THE CISTERNS, HUNTER... SINK BENEATH MY SILENT WATERS FOREVER!',
    },
  });
}

// ---------------------------------------------------------------- stage 18: the floating garden
function buildFloatingGarden() {
  return composeGridStage({
    id: 18,
    key: 'skykeep',
    name: 'THE FLOATING GARDEN',
    subtitle: 'MARBLE SANCTUMS AMONG THE CLOUDS',
    theme: 'skykeep',
    seed: 163,
    roster: {
      ground: [['duelist', 'normal'], ['armor', 'crimson'], ['skeleton', 'frost']],
      heavy: [['armor', 'crimson'], ['executioner', 'normal'], ['catoblepas', 'normal']],
      sniper: [['dragon', 'frost'], ['skeleton', 'frost'], ['alchfiend', 'normal']],
      aerial: [['valkyrie', 'normal'], ['gargoyle', 'obsidian'], ['owl', 'normal']],
      spawner: 'valkyrie',
    },
    boss: {
      type: 'archon',
      name: 'THE MOONLIT SERAPH',
      spawnHeight: 160,
      waterPool: true,
      sheet: 'seraph',
      aura: 'rgba(138, 232, 255, 0.26)',
      voice: 'wing_skykeep_voice',
      line: 'ABOVE THE CLOUDS NO MORTAL FOOT MAY TREAD... PLUMMET FROM THESE CELESTIAL GARDENS INTO THE NIGHT!',
    },
  });
}

export const STAGES = [
  stage1, buildDarkwood(), buildJackOLantern(), buildFrozenYule(), buildRamparts(),
  buildCatacombs(), buildDarkCave(), buildOssuary(), buildArcade(), buildLibrary(),
  buildCathedral(), buildClockTower(), buildThroneHall(),
  buildAlchemyLab(), buildPhantomBallroom(), buildBloodColiseum(), buildSunkenAqueduct(), buildFloatingGarden(),
].map((s, i) => Object.assign(s, { id: i + 1 }));

/** Stage lookup by map key. */
export const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s) => [s.key, s]));

/** Number of hand-made stages; everything after these was raised by the Castle Forge. */
export const BUILTIN_STAGE_COUNT = STAGES.length;

/** Appends a forged stage (ids stay `index + 1`, which exploration relies on). */
export function registerStage(stage) {
  if (STAGE_BY_KEY[stage.key]) return STAGE_BY_KEY[stage.key];
  stage.id = STAGES.length + 1;
  STAGES.push(stage);
  STAGE_BY_KEY[stage.key] = stage;
  return stage;
}
