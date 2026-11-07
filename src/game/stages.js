// The twenty-one stages of Gothic Nocturne: long, true-2D screen-matched
// gothic action-exploration biomes (380–760 tiles / 19–38 screens wide, multi-story vertical
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
      ground: [['wolf', 'normal'], ['spriggan', 'normal'], ['mushroom', 'normal'], ['wolf', 'alpha']],
      heavy: [['mosstroll', 'normal'], ['wolf', 'alpha']],
      sniper: [['spriggan', 'normal'], ['mushroom', 'normal']],
      aerial: [['owl', 'normal'], ['bat', 'normal']],
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
      ground: [['scarecrow', 'normal'], ['fleaman', 'normal'], ['pumpkin', 'normal'], ['skeleton', 'axe']],
      heavy: [['wickerman', 'normal'], ['scarecrow', 'normal']],
      sniper: [['scarecrow', 'normal'], ['pumpkin', 'normal']],
      aerial: [['lantern', 'normal'], ['bat', 'fire']],
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
      ground: [['snowman', 'normal'], ['jiangshi', 'normal'], ['skeleton', 'frost'], ['wolf', 'alpha']],
      heavy: [['wendigo', 'normal'], ['icegolem', 'normal'], ['jiangshi', 'normal']],
      sniper: [['skeleton', 'frost'], ['snowman', 'normal']],
      aerial: [['wisp', 'normal'], ['dragon', 'frost']],
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
      ground: [['arbalest', 'normal'], ['skeleton', 'axe'], ['armor', 'normal'], ['fleaman', 'normal']],
      heavy: [['dullahan', 'normal'], ['executioner', 'normal'], ['armor', 'crimson']],
      sniper: [['arbalest', 'normal'], ['bonepillar', 'normal'], ['skeleton', 'axe']],
      aerial: [['gargoyle', 'normal'], ['bat', 'normal']],
      spawner: 'bat',
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
      ground: [['zombie', 'ghoul'], ['novaskeleton', 'normal'], ['fleaman', 'normal'], ['skeleton', 'red']],
      heavy: [['bonegoliath', 'normal'], ['bonepillar', 'normal'], ['executioner', 'normal']],
      sniper: [['novaskeleton', 'normal'], ['bonepillar', 'normal'], ['skeleton', 'blood']],
      aerial: [['necromancer', 'normal'], ['wraith', 'normal'], ['ghost', 'normal']],
      spawner: 'zombie',
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
      ground: [['magmaslime', 'normal'], ['pyromancer', 'normal']],
      heavy: [['lavagolem', 'normal'], ['pyromancer', 'normal']],
      sniper: [['pyromancer', 'normal'], ['dragon', 'elder']],
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
      ground: [['merman', 'normal'], ['novaskeleton', 'normal'], ['skeleton', 'blood'], ['zombie', 'ghoul']],
      heavy: [['bonegoliath', 'normal'], ['bonepillar', 'normal'], ['catoblepas', 'normal']],
      sniper: [['novaskeleton', 'normal'], ['bonepillar', 'normal'], ['merman', 'normal']],
      aerial: [['medusa', 'normal'], ['necromancer', 'normal'], ['wraith', 'banshee']],
      spawner: 'medusa',
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
      ground: [['clockknight', 'normal'], ['duelist', 'normal'], ['armor', 'normal']],
      heavy: [['brasstitan', 'normal'], ['dullahan', 'normal'], ['clockknight', 'normal']],
      sniper: [['clockknight', 'normal'], ['arbalest', 'normal']],
      aerial: [['rulersword', 'normal'], ['gearharpy', 'normal'], ['gargoyle', 'normal']],
      spawner: 'gearharpy',
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
      ground: [['inkscholar', 'normal'], ['jiangshi', 'normal'], ['duelist', 'normal'], ['armor', 'normal']],
      heavy: [['dullahan', 'normal'], ['armor', 'crimson'], ['inkscholar', 'normal']],
      sniper: [['inkscholar', 'normal'], ['tome', 'normal']],
      aerial: [['rulersword', 'normal'], ['tome', 'normal'], ['ghost', 'normal'], ['necromancer', 'normal']],
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
      ground: [['censerprelate', 'normal'], ['dullahan', 'normal'], ['armor', 'normal'], ['skeleton', 'blood']],
      heavy: [['dullahan', 'normal'], ['censerprelate', 'normal'], ['executioner', 'normal']],
      sniper: [['censerprelate', 'normal'], ['arbalest', 'normal']],
      aerial: [['gargoyle', 'obsidian'], ['valkyrie', 'normal'], ['wraith', 'normal']],
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
      ground: [['clockknight', 'normal'], ['novaskeleton', 'normal'], ['arbalest', 'normal'], ['fleaman', 'normal']],
      heavy: [['brasstitan', 'normal'], ['dullahan', 'normal'], ['clockknight', 'normal']],
      sniper: [['novaskeleton', 'normal'], ['arbalest', 'normal'], ['clockknight', 'normal']],
      aerial: [['rulersword', 'normal'], ['gearharpy', 'normal'], ['medusa', 'normal'], ['gargoyle', 'obsidian']],
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
      ground: [['bloodknight', 'normal'], ['dullahan', 'normal'], ['novaskeleton', 'normal'], ['duelist', 'normal']],
      heavy: [['dullahan', 'normal'], ['bloodknight', 'normal'], ['bonepillar', 'normal']],
      sniper: [['novaskeleton', 'normal'], ['bonepillar', 'normal'], ['dragon', 'normal']],
      aerial: [['rulersword', 'normal'], ['wraith', 'banshee'], ['necromancer', 'normal'], ['dragon', 'normal']],
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
      ground: [['alchfiend', 'normal'], ['novaskeleton', 'normal'], ['jiangshi', 'normal'], ['inkscholar', 'normal']],
      heavy: [['vathulk', 'normal'], ['dullahan', 'normal'], ['alchfiend', 'normal']],
      sniper: [['alchfiend', 'normal'], ['inkscholar', 'normal']],
      aerial: [['ghost', 'normal'], ['tome', 'normal'], ['necromancer', 'normal']],
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
      ground: [['duelist', 'normal'], ['jiangshi', 'normal'], ['bloodknight', 'normal']],
      heavy: [['dullahan', 'normal'], ['bloodknight', 'normal'], ['jiangshi', 'normal']],
      sniper: [['duelist', 'normal'], ['waltzdancer', 'normal']],
      aerial: [['rulersword', 'normal'], ['waltzdancer', 'normal'], ['ghost', 'normal'], ['wraith', 'banshee']],
      spawner: 'waltzdancer',
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
      ground: [['retiarius', 'normal'], ['fleaman', 'normal'], ['skeleton', 'blood'], ['armor', 'crimson']],
      heavy: [['minotaur', 'normal'], ['dullahan', 'normal'], ['bonepillar', 'normal']],
      sniper: [['retiarius', 'normal'], ['skeleton', 'axe']],
      aerial: [['dragon', 'normal'], ['gargoyle', 'obsidian']],
      spawner: 'bat',
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
      ground: [['merman', 'normal'], ['zombie', 'ghoul']],
      heavy: [['cisterncrab', 'normal'], ['catoblepas', 'normal']],
      sniper: [['merman', 'normal'], ['siren', 'normal']],
      aerial: [['siren', 'normal'], ['medusa', 'normal']],
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
      ground: [['astralarcher', 'normal'], ['dullahan', 'normal'], ['duelist', 'normal']],
      heavy: [['marblecolossus', 'normal'], ['dullahan', 'normal'], ['astralarcher', 'normal']],
      sniper: [['astralarcher', 'normal'], ['novaskeleton', 'normal'], ['valkyrie', 'normal']],
      aerial: [['rulersword', 'normal'], ['valkyrie', 'normal'], ['owl', 'normal']],
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

// ---------------------------------------------------------------- stage 19: the blighted conservatory
function buildBlightedConservatory() {
  return composeGridStage({
    id: 19,
    key: 'conservatory',
    name: 'THE BLIGHTED CONSERVATORY',
    subtitle: 'CARNIVOROUS GLASSHOUSE & NIGHTSHADE',
    theme: 'conservatory',
    seed: 173,
    roster: {
      ground: [['sporecap', 'normal'], ['spriggan', 'normal'], ['alchfiend', 'normal']],
      heavy: [['mosstroll', 'normal'], ['dullahan', 'normal'], ['vathulk', 'normal']],
      sniper: [['alchfiend', 'normal'], ['sporecap', 'normal'], ['astralarcher', 'normal']],
      aerial: [['medusa', 'normal'], ['owl', 'normal'], ['rulersword', 'normal']],
      spawner: 'medusa',
    },
    boss: {
      type: 'archivist',
      name: 'THE NIGHTSHADE QUEEN',
      spawnHeight: 88,
      sheet: 'mandragora',
      aura: 'rgba(255, 92, 168, 0.28)',
      voice: 'wing_conservatory_voice',
      line: 'BREATHE DEEP OF MY CRIMSON BLOSSOMS, LITTLE HUNTER... YOUR BONES SHALL FERTILIZE MY GARDEN FOREVER!',
    },
  });
}

// ---------------------------------------------------------------- stage 20: the iron inquisition
function buildIronInquisition() {
  return composeGridStage({
    id: 20,
    key: 'dungeon',
    name: 'THE IRON INQUISITION',
    subtitle: 'TORTURE VAULTS & EXECUTIONER GAOL',
    theme: 'dungeon',
    seed: 181,
    roster: {
      ground: [['jiangshi', 'normal'], ['fleaman', 'normal'], ['executioner', 'normal']],
      heavy: [['executioner', 'normal'], ['dullahan', 'normal'], ['bonepillar', 'normal']],
      sniper: [['bonepillar', 'normal'], ['necromancer', 'normal'], ['bloodknight', 'normal']],
      aerial: [['wraith', 'normal'], ['necromancer', 'normal'], ['rulersword', 'normal']],
      spawner: 'fleaman',
    },
    boss: {
      type: 'bonecaptain',
      name: 'THE GRAND INQUISITOR',
      spawnHeight: 0,
      sheet: 'inquisitor',
      aura: 'rgba(255, 82, 66, 0.28)',
      voice: 'wing_dungeon_voice',
      line: 'CONFESS YOUR TRESPASS UPON THE RACK, HERETIC... BY IRON AND FLAME, I SENTENCE YOU TO DEATH!',
    },
  });
}

// ---------------------------------------------------------------- stage 21: the astral observatory
function buildAstralObservatory() {
  return composeGridStage({
    id: 21,
    key: 'observatory',
    name: 'THE ASTRAL OBSERVATORY',
    subtitle: 'CELESTIAL ORRERY & ECLIPSE DOME',
    theme: 'observatory',
    seed: 191,
    roster: {
      ground: [['astralarcher', 'normal'], ['novaskeleton', 'normal'], ['duelist', 'normal']],
      heavy: [['marblecolossus', 'normal'], ['dullahan', 'normal'], ['novaskeleton', 'normal']],
      sniper: [['novaskeleton', 'normal'], ['astralarcher', 'normal'], ['valkyrie', 'normal']],
      aerial: [['rulersword', 'normal'], ['valkyrie', 'normal'], ['waltzdancer', 'normal']],
      spawner: 'rulersword',
    },
    boss: {
      type: 'count',
      name: 'THE ECLIPSE ASTROMANCER',
      spawnHeight: 0,
      sheet: 'astromancer',
      aura: 'rgba(124, 232, 255, 0.28)',
      voice: 'wing_observatory_voice',
      line: 'I HAVE READ YOUR FLEETING STAR IN THE HEAVENS, MORTAL... KNEEL BEFORE THE TOTAL ECLIPSE!',
    },
  });
}

export const STAGES = [
  stage1, buildDarkwood(), buildJackOLantern(), buildFrozenYule(), buildRamparts(),
  buildCatacombs(), buildDarkCave(), buildOssuary(), buildArcade(), buildLibrary(),
  buildCathedral(), buildClockTower(), buildThroneHall(),
  buildAlchemyLab(), buildPhantomBallroom(), buildBloodColiseum(), buildSunkenAqueduct(), buildFloatingGarden(),
  buildBlightedConservatory(), buildIronInquisition(), buildAstralObservatory(),
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
