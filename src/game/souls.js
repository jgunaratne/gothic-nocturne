// Tactical Soul Glyphs & Hunter's Bestiary Compendium:
// - Three concurrent Soul Glyph sockets inspired by handheld gothic action-RPGs:
//     * Crimson Bullet Glyph (`bullet`): active monster spell (`↑ + R-Hand`, 2 Hearts)
//     * Cobalt Guardian Glyph (`guardian`): autonomous orbital blades, familiar shield, or dash wake
//     * Amber Enchant Glyph (`enchant`): passive stat, critical-rate, luck, or vitality blessing
// - Duplicate soul absorptions rank a glyph from Lv 1 up to Lv 9.
// - Complete Hunter's Bestiary tracking encounters, vanquishes, weaknesses, weapon drops & souls.

import { ELEMENT_META, PHYSICAL_META, ENEMY_RESISTANCES, ENEMY_WEAPON_DROPS, WEAPONS, resolveEnemySpeciesKey } from './weapons.js';

export const SOUL_TYPES = {
  bullet:   { key: 'bullet',   label: 'CRIMSON BULLET',  short: 'BULLET',   color: '#ff5874', core: [1.0, 0.86, 0.90], rim: [1.0, 0.22, 0.38] },
  guardian: { key: 'guardian', label: 'COBALT GUARDIAN', short: 'GUARDIAN', color: '#58c8ff', core: [0.88, 0.98, 1.0], rim: [0.18, 0.64, 1.0] },
  enchant:  { key: 'enchant',  label: 'AMBER ENCHANT',   short: 'ENCHANT',  color: '#ffd25a', core: [1.0, 0.97, 0.82], rim: [0.98, 0.72, 0.16] },
};

export const SOUL_MAX_RANK = 9;

export const SOUL_GLYPHS = {
  // ---- Crimson Bullet Glyphs (Active Monster Spells: `↑ + R-Hand`, 2 Hearts) ----
  nova_ray: {
    id: 'nova_ray',
    name: 'NOVA OSSUARY RAY',
    short: 'NOVA RAY',
    type: 'bullet',
    heartCost: 2,
    element: 'volt',
    physical: 'blunt',
    basePower: 4.6,
    rankScale: 0.42,
    desc: 'FIRES AN INSTANT PIERCING COSMIC DEATH-RAY ACROSS THE CORRIDOR',
  },
  severed_helm: {
    id: 'severed_helm',
    name: 'DULLAHAN SPIRIT HELM',
    short: 'SPIRIT HELM',
    type: 'bullet',
    heartCost: 2,
    element: 'void',
    physical: 'blunt',
    basePower: 4.2,
    rankScale: 0.38,
    desc: 'HURLS A HOMING SPECTRAL KNIGHT HELM WRAPPED IN ABYSSAL FLAME',
  },
  bone_pyre: {
    id: 'bone_pyre',
    name: 'RELIQUARY DRAGON PYRE',
    short: 'BONE PYRE',
    type: 'bullet',
    heartCost: 2,
    element: 'fire',
    physical: 'blunt',
    basePower: 3.8,
    rankScale: 0.36,
    desc: 'BELCHES TWIN DRAGON FIREBALLS AND A ROLLING CINDER ORB',
  },
  talisman_bolt: {
    id: 'talisman_bolt',
    name: 'ANCESTRAL SEAL PILLAR',
    short: 'SEAL BOLT',
    type: 'bullet',
    heartCost: 2,
    element: 'holy',
    physical: 'cut',
    basePower: 4.5,
    rankScale: 0.40,
    desc: 'ERUPTS GOLDEN TALISMAN LIGHTNING PILLARS AHEAD OF THE HUNTER',
  },
  phantom_axes: {
    id: 'phantom_axes',
    name: 'VANGUARD TWIN AXES',
    short: 'TWIN AXES',
    type: 'bullet',
    heartCost: 2,
    element: null,
    physical: 'cut',
    basePower: 3.6,
    rankScale: 0.35,
    desc: 'FLINGS TWO HEAVY PARABOLIC BATTLE-AXES OVERHEAD',
  },
  glacial_spear: {
    id: 'glacial_spear',
    name: 'BOREAL TRIDENT FAN',
    short: 'RIME FAN',
    type: 'bullet',
    heartCost: 2,
    element: 'frost',
    physical: 'cut',
    basePower: 3.4,
    rankScale: 0.34,
    desc: 'LAUNCHES A 3-WAY SPREAD OF PIERCING RIME CRYSTAL LANCES',
  },
  hellfire_triad: {
    id: 'hellfire_triad',
    name: 'NOCTURNE HELLFIRE',
    short: 'HELLFIRE',
    type: 'bullet',
    heartCost: 2,
    element: 'fire',
    physical: 'blunt',
    basePower: 3.7,
    rankScale: 0.36,
    desc: 'CONJURES THREE SPREAD ORBS OF DARK CRIMSON HELLFIRE',
  },
  petrify_gaze: {
    id: 'petrify_gaze',
    name: 'GORGON ASTRAL BEAM',
    short: 'GAZE BEAM',
    type: 'bullet',
    heartCost: 2,
    element: 'void',
    physical: 'cut',
    basePower: 4.0,
    rankScale: 0.36,
    desc: 'PROJECTS A HIGH-VELOCITY VIOLET STONE-SHATTERING GAZE',
  },

  // ---- Cobalt Guardian Glyphs (Autonomous Orbitals / Familiar Wards) ----
  sovereign_ring: {
    id: 'sovereign_ring',
    name: 'SOVEREIGN BLADE RING',
    short: 'BLADE RING',
    type: 'guardian',
    element: 'holy',
    physical: 'cut',
    basePower: 1.8,
    rankScale: 0.25,
    desc: 'SUMMONS ORBITING SPECTRAL DAGGERS (2->4 BY RANK) THAT SLICE NEARBY FOES',
  },
  aegis_familiar: {
    id: 'aegis_familiar',
    name: 'SENTINEL BUCKLER WARD',
    short: 'AEGIS WARD',
    type: 'guardian',
    element: 'volt',
    physical: 'blunt',
    basePower: 2.0,
    rankScale: 0.22,
    desc: 'FLOATING RUNIC TARGE PERIODICALLY BLOCKS ENEMY SHOTS AUTOMATICALLY',
  },
  wraith_shroud: {
    id: 'wraith_shroud',
    name: 'PHANTOM BACKDASH WAKE',
    short: 'MIST WAKE',
    type: 'guardian',
    element: 'void',
    physical: 'cut',
    basePower: 2.4,
    rankScale: 0.30,
    desc: 'BACKDASHES, SLIDES & DIVEKICKS LEAVE A DAMAGING ABYSSAL AFTERIMAGE',
  },
  bat_echo: {
    id: 'bat_echo',
    name: 'VESPER SONAR WINGS',
    short: 'SONAR WING',
    type: 'guardian',
    element: 'volt',
    physical: 'blunt',
    basePower: 2.1,
    rankScale: 0.26,
    desc: 'DOUBLE-JUMPS & SUPER-JUMPS RELEASE A DAMAGING SONIC PULSE RING',
  },

  // ---- Amber Enchant Glyphs (Passive Stat, Critical & Sustain Blessings) ----
  flea_agility: {
    id: 'flea_agility',
    name: 'ACROBAT SWIFTNESS',
    short: 'SWIFTNESS',
    type: 'enchant',
    desc: '+8%..+20% MOVE/SLIDE SPEED & HIGHER DIVEKICK BOUNCE BY RANK',
  },
  golem_might: {
    id: 'golem_might',
    name: 'TITAN MARROW',
    short: 'TITAN STR',
    type: 'enchant',
    desc: 'GRANTS +2..+6 STRENGTH & +2..+8 MAX HP BY GLYPH RANK',
  },
  scholar_fortune: {
    id: 'scholar_fortune',
    name: 'ARCHIVIST OCULUS',
    short: 'CRIT LUCK',
    type: 'enchant',
    desc: '+10%..+28% CRITICAL HIT CHANCE & +35% RARE SOUL/WEAPON DROP LUCK',
  },
  blood_feast: {
    id: 'blood_feast',
    name: 'CRIMSON VAMPIRISM',
    short: 'SIPHON',
    type: 'enchant',
    desc: 'CRITICAL STRIKES & COMMAND SKILLS MEND +1 HP (35%..75% CHANCE)',
  },
};

export const SOUL_ORDER = Object.keys(SOUL_GLYPHS);

/** Maps resolved enemy species keys to their Soul Glyph drop `[soulId, baseDropChance]`. */
export const SPECIES_SOUL_MAP = {
  // 6 New Iconic Gothic Species
  novaskeleton: ['nova_ray', 0.28],
  dullahan:     ['severed_helm', 0.28],
  bonepillar:   ['bone_pyre', 0.26],
  jiangshi:     ['talisman_bolt', 0.26],
  rulersword:   ['sovereign_ring', 0.30],
  fleaman:      ['flea_agility', 0.26],

  // Existing Castle Bestiary Species
  skeleton:      ['phantom_axes', 0.14],
  bonecaptain:   ['phantom_axes', 0.45],
  bonegoliath:   ['golem_might', 0.22],
  zombie:        ['blood_feast', 0.12],
  gravekeeper:   ['phantom_axes', 0.16],
  bat:           ['bat_echo', 0.13],
  owl:           ['bat_echo', 0.16],
  medusa:        ['petrify_gaze', 0.15],
  catoblepas:    ['petrify_gaze', 0.24],
  wolf:          ['flea_agility', 0.16],
  sporecap:      ['golem_might', 0.15],
  spriggan:      ['flea_agility', 0.16],
  mosstroll:     ['golem_might', 0.22],
  pumpkin:       ['hellfire_triad', 0.14],
  scarecrow:     ['scholar_fortune', 0.16],
  wickerman:     ['hellfire_triad', 0.22],
  icegolem:      ['glacial_spear', 0.22],
  snowman:       ['glacial_spear', 0.16],
  wisp:          ['glacial_spear', 0.16],
  wendigo:       ['glacial_spear', 0.24],
  armor:         ['aegis_familiar', 0.20],
  arbalest:      ['aegis_familiar', 0.18],
  clockknight:   ['aegis_familiar', 0.20],
  brasstitan:    ['golem_might', 0.24],
  gearharpy:     ['bat_echo', 0.16],
  wraith:        ['wraith_shroud', 0.20],
  ghost:         ['wraith_shroud', 0.18],
  tome:          ['scholar_fortune', 0.20],
  inkscholar:    ['scholar_fortune', 0.22],
  necromancer:   ['severed_helm', 0.20],
  magmaslime:    ['bone_pyre', 0.15],
  cinderimp:     ['hellfire_triad', 0.18],
  pyromancer:    ['hellfire_triad', 0.22],
  lavagolem:     ['golem_might', 0.22],
  dragon:        ['bone_pyre', 0.22],
  gargoyle:      ['aegis_familiar', 0.18],
  censerprelate: ['talisman_bolt', 0.20],
  alchfiend:     ['scholar_fortune', 0.18],
  vathulk:       ['golem_might', 0.22],
  duelist:       ['sovereign_ring', 0.18],
  waltzdancer:   ['wraith_shroud', 0.18],
  bloodknight:   ['blood_feast', 0.24],
  executioner:   ['phantom_axes', 0.20],
  retiarius:     ['flea_agility', 0.18],
  minotaur:      ['golem_might', 0.24],
  merman:        ['glacial_spear', 0.16],
  siren:         ['bat_echo', 0.18],
  cisterncrab:   ['aegis_familiar', 0.22],
  valkyrie:      ['sovereign_ring', 0.22],
  astralarcher:  ['nova_ray', 0.20],
  marblecolossus:['golem_might', 0.26],
};

/** Human-readable Gothic Bestiary metadata for HUD Target Plate & Bestiary Compendium. */
export const BESTIARY_META = {
  // Newly Forged Classic Archetypes
  dullahan:       { name: 'DULLAHAN KNIGHT',    stars: 4, lore: 'HEADLESS VIOLET PLATE SENTINEL THAT HURLS ITS FLAMING SPIRIT HELM.' },
  rulersword:     { name: 'SPECTRAL SOVEREIGN', stars: 5, lore: 'SENTIENT ROYAL RUNE-BLADE COMMANDING AN ORBITING WHEEL OF DAGGERS.' },
  novaskeleton:   { name: 'NOVA OSSUARY',       stars: 4, lore: 'ASTRAL-CHARGED SKELETON GUNNER THAT FIRES CORRIDOR-SPANNING BEAMS.' },
  fleaman:        { name: 'FLEA STALKER',       stars: 2, lore: 'LOW-CROUCHED FERAL IMP THAT VAULTS OVER HIGH BLADES IN ERRATIC HOPS.' },
  bonepillar:     { name: 'BONE RELIQUARY',     stars: 3, lore: 'IRON-CHAINED TOWER OF DRAGON SKULLS BELCHING STAGGERED PYRE VOLLEYS.' },
  jiangshi:       { name: 'TALISMAN JIANGSHI',  stars: 4, lore: 'SEALED UNDEAD ARISTOCRAT WHOSE RIGID HOPS SUMMON LIGHTNING PILLARS.' },

  // Core Castle Fiends
  zombie:         { name: 'CRYPT RISEN',        stars: 1, lore: 'SHAMBLING CORPSE CLAWING OUT OF RAIN-SOAKED GRAVEYARD LOAM.' },
  gravekeeper:    { name: 'GRAVEKEEPER',        stars: 2, lore: 'LANTERN-BEARING SEXTON SWINGING AN IRON BURIAL SPADE.' },
  skeleton:       { name: 'BONE LEGIONNAIRE',   stars: 2, lore: 'REANIMATED FOOTMAN HURLING RIBS AND FEMURS FROM BALCONIES.' },
  bat:            { name: 'VESPER BAT',         stars: 1, lore: 'CAVE FLYER THAT ROOSTS UNDER ARCHES AND DIVES IN SINE WAVES.' },
  medusa:         { name: 'GORGON HEAD',        stars: 2, lore: 'SERPENT-CROWNED HEAD WEAVING HYPNOTIC ARCS ACROSS CHASMS.' },
  wolf:           { name: 'BRIAR WOLF',         stars: 2, lore: 'THORN-MANED PREDATOR THAT CROUCHES BEFORE HIGH-VELOCITY LUNGES.' },
  sporecap:       { name: 'SPORECAP MYCONID',   stars: 2, lore: 'LUMINESCENT FUNGAL BRUTE EXHALING DRIFTING TOXIC SPORES.' },
  owl:            { name: 'NOCTURNE OWL',       stars: 2, lore: 'SILENT CANOPY RAPTOR SWOOPING DOWN ON UNGUARDED HUNTERS.' },
  spriggan:       { name: 'ELDER SPRIGGAN',     stars: 2, lore: 'GNARLED BARK SPIRIT DARTING THROUGH BIOLUMINESCENT GROVES.' },
  mosstroll:      { name: 'MOSS COLOSSUS',      stars: 3, lore: 'TOWERING ROOT-BOUND TROLL WHOSE FISTS SHAKE THE FOREST FLOOR.' },
  pumpkin:        { name: 'JACK FIEND',         stars: 2, lore: 'VINE-LEGGED LANTERN GOURD HOPPING THROUGH HAUNTED BRAMBLES.' },
  scarecrow:      { name: 'GALLOWS SCARECROW',  stars: 2, lore: 'STITCHED HARVEST EFFIGY STALKING AUTUMN RAVINES.' },
  wickerman:      { name: 'WICKER TITAN',       stars: 3, lore: 'BLAZING EFFIGY COLOSSUS RADIATING SEARING HEARTH EMBERS.' },
  dragon:         { name: 'CRIMSON WYVERN',     stars: 3, lore: 'WINGED DRAKE HOVERING OUTSIDE BELFRIES TO SPIT FIREBALLS.' },
  catoblepas:     { name: 'CATOBLEPAS',         stars: 3, lore: 'HEAVY IRON-HORNED BEAST EXHALING VIOLET PETRIFYING MIASMA.' },
  icegolem:       { name: 'GLACIAL GOLEM',      stars: 3, lore: 'JAGGED RIME CONSTRUCT SHATTERING ONLY TO HEAVY BLUNT & FIRE.' },
  snowman:        { name: 'FROST EFFIGY',       stars: 2, lore: 'TOP-HATTED WINTER REVENANT PELTING CAUSEWAYS WITH PACKED ICE.' },
  wisp:           { name: 'BOREAL WISP',        stars: 2, lore: 'SKULL-FACED SPIRIT OF SWIRLING NORTHERN ICE CRYSTALS.' },
  wendigo:        { name: 'HOARFROST WENDIGO',  stars: 4, lore: 'ANTLERED ARCTIC BEHEMOTH LUNGING THROUGH AURORA BLIZZARDS.' },
  armor:          { name: 'PLATE VANGUARD',     stars: 3, lore: 'SHIELDED CASTLE GUARDIAN IMPERVIOUS TO LIGHT FRONTAL SLASHES.' },
  arbalest:       { name: 'SIEGE ARBALEST',     stars: 3, lore: 'RAMPARTS CROSSBOWMAN LOCKING DOWN PARAPET APPROACHES.' },
  bonegoliath:    { name: 'OSSUARY GOLIATH',    stars: 4, lore: 'FUSED TITAN OF CENTURIES-OLD CRYPT BONES AND IRON CHAINS.' },
  wraith:         { name: 'SHADOW WRAITH',      stars: 3, lore: 'TELEPORTING SPECTER PHASE-SHIFTING BEHIND ITS QUARRY.' },
  ghost:          { name: 'WEEPING PHANTOM',    stars: 2, lore: 'TRANSLUCENT HALL SPIRIT DRIFTING THROUGH SOLID STONE.' },
  tome:           { name: 'BITING GRIMOIRE',    stars: 2, lore: 'SPELLBOOK FLAPPING LEATHER COVERS LIKE FANGED JAWS.' },
  inkscholar:     { name: 'INK SCHOLAR',        stars: 3, lore: 'CURSED LIBRARIAN HURLING RAZOR-EDGED ARCANE MANUSCRIPT PAGES.' },
  necromancer:    { name: 'CRYPT NECROMANCER',  stars: 4, lore: 'DEATH-PRIEST SUMMONING HOMING SKULLS FROM ANCIENT OSSUARIES.' },
  magmaslime:     { name: 'MAGMA OOZE',         stars: 2, lore: 'VISCOUS MOLTEN DROPLET CLINGING TO OBSIDIAN CAVERN FLOORS.' },
  cinderimp:      { name: 'CINDER IMP',         stars: 2, lore: 'ASH-WINGED DEVIL DARTING ABOVE VOLCANIC LAVA RIVERS.' },
  pyromancer:     { name: 'FLAME ZEALOT',       stars: 3, lore: 'MAGMA CULTIST LOBBING VOLCANIC METEORS ACROSS CHASMS.' },
  lavagolem:      { name: 'OBSIDIAN GOLEM',     stars: 4, lore: 'BASALT-AND-MAGMA BRUTE VULNERABLE TO FROST & WARHAMMERS.' },
  clockknight:    { name: 'CLOCKWORK KNIGHT',   stars: 3, lore: 'SPRING-DRIVEN BRASS SWORDSMAN PATROLLING GEAR GALLERIES.' },
  gearharpy:      { name: 'PINION HARPY',       stars: 3, lore: 'BRASS-WINGED AUTOMATON DROPPING TOOTHED SAW-COGS.' },
  brasstitan:     { name: 'BRASS COLOSSUS',     stars: 4, lore: 'STEAM-POWERED TOWER CONSTRUCT CRUSHING GALLERY PLANKS.' },
  gargoyle:       { name: 'BELFRY GARGOYLE',    stars: 3, lore: 'STONE PERCHER THAT WAKES WITH A SHRIEK WHEN APPROACHED.' },
  censerprelate:  { name: 'CENSER PRELATE',     stars: 3, lore: 'CORRUPTED CATHEDRAL CLERIC SWINGING BURNING INCENSE CHAINS.' },
  alchfiend:      { name: 'RETORT HOMUNCULUS',  stars: 3, lore: 'VOLATILE LAB MUTANT LOBBING CORROSIVE EMERALD FLASKS.' },
  vathulk:        { name: 'ALEMBIC HULK',       stars: 4, lore: 'GLASS-TANKED ABOMINATION BRIMMING WITH CAUSTIC REAGENTS.' },
  duelist:        { name: 'SALON FENCER',       stars: 3, lore: 'MASKED ARISTOCRAT PARRYING AND LUNGING WITH SILVER ESTOCS.' },
  waltzdancer:    { name: 'PHANTOM DANCER',     stars: 3, lore: 'BALLROOM APPARITION PIROUETTING IN DEADLY CRIMSON RINGS.' },
  bloodknight:    { name: 'CRIMSON CHEVALIER',  stars: 4, lore: 'ELITE VAMPIRIC SWORDMASTER WIELDING A RUNE GREATSWORD.' },
  executioner:    { name: 'ARENA EXECUTIONER',  stars: 4, lore: 'HOODED HEADSMAN CLEAVING SANDS WITH A TWO-HANDED AXE.' },
  retiarius:      { name: 'COLISEUM RETIARIUS', stars: 3, lore: 'TRIDENT GLADIATOR PINNING CHALLENGERS IN SPIKED PITS.' },
  minotaur:       { name: 'LABYRINTH MINOTAUR', stars: 4, lore: 'BRONZE-HORNED BULL BEAST CHARGING ACROSS ARENA TIERS.' },
  merman:         { name: 'CISTERN TRITON',     stars: 2, lore: 'SCALED AMPHIBIAN LEAPING FROM FLOODED AQUEDUCT CHANNELS.' },
  siren:          { name: 'AQUEDUCT SIREN',     stars: 3, lore: 'WINGED WATER SPIRIT FIRING HIGH-PRESSURE CERULEAN BOLTS.' },
  cisterncrab:    { name: 'IRON-SHELL CRAB',    stars: 4, lore: 'BARNACLED LEVIATHAN GUARDING SUNKEN SLUICE ARCHES.' },
  valkyrie:       { name: 'CELESTIAL VALKYRIE', stars: 4, lore: 'SPEAR-MAIDEN HOVERING OVER MOONLIT CLOUD TERRACES.' },
  astralarcher:   { name: 'STARLIGHT ARCHER',   stars: 3, lore: 'OBSERVATORY SENTINEL LOOSING LUMINOUS CONSTELLATION SHAFTS.' },
  marblecolossus: { name: 'SERAPHIC COLOSSUS',  stars: 5, lore: 'CARRARA MARBLE GUARDIAN ANIMATED BY ASTRAL GOLD FILIGREE.' },

  // Guardians / Bosses
  giantbat:       { name: 'THE GREAT BAT',        stars: 4, isBoss: true, lore: 'SOVEREIGN NIGHT-STALKER OF THE ENTRANCE HALL RAFTERS.' },
  treant:         { name: 'THE BRIAR KING',       stars: 4, isBoss: true, lore: 'ELDER HEART-TREE GUARDIAN OF THE BIOLUMINESCENT WOOD.' },
  greatjack:      { name: 'THE GREAT JACK',       stars: 4, isBoss: true, lore: 'HARVEST PUMPKIN MONARCH OF THE AUTUMN HOLLOW.' },
  devilsanta:     { name: 'DEVIL SANTA',          stars: 4, isBoss: true, lore: 'HORNED YULE TYRANT OF THE AURORA ICE VILLAGE.' },
  bonecaptain:    { name: 'THE BONE CAPTAIN',     stars: 4, isBoss: true, lore: 'UNDYING COMMANDER OF THE CASTLE RAMPARTS.' },
  boss:           { name: 'THE PHANTOM REAPER',   stars: 5, isBoss: true, lore: 'SCYTHE-BEARING HARVESTER OF THE SUNKEN CATACOMBS.' },
  cinderqueen:    { name: 'THE CINDER QUEEN',     stars: 5, isBoss: true, lore: 'OBSIDIAN WARRIOR-MONARCH OF THE MOLTEN ABYSS.' },
  gorgon:         { name: 'THE GORGON QUEEN',     stars: 5, isBoss: true, lore: 'STONE-GAZED MATRIARCH OF THE OSSUARY CHASM.' },
  automaton:      { name: 'BRASS AUTOMATON',      stars: 5, isBoss: true, lore: 'TITANIC CLOCKWORK ENGINE OF THE GILDED ARCADE.' },
  archivist:      { name: 'SPECTRAL ARCHIVIST',   stars: 5, isBoss: true, lore: 'KEEPER OF FORBIDDEN GRIMOIRES IN THE HIGH LIBRARY.' },
  archon:         { name: 'GARGOYLE ARCHON',      stars: 5, isBoss: true, lore: 'BASALT CATHEDRAL SOVEREIGN BENEATH THE ROSE WINDOW.' },
  alchemist:      { name: 'GRAND ALCHEMIST',      stars: 5, isBoss: true, lore: 'MASTER OF PHILOSOPHER RETORTS AND VOLATILE TRANSMUTATION.' },
  masquerade:     { name: 'MASQUERADE DUKE',      stars: 5, isBoss: true, lore: 'PHANTOM NOBLE CONDUCTING THE ETERNAL CRIMSON WALTZ.' },
  gladiator:      { name: 'IRON GLADIATOR',       stars: 5, isBoss: true, lore: 'UNDEFEATED CHAMPION OF THE SUBTERRANEAN COLISEUM.' },
  oracle:         { name: 'DROWNED ORACLE',       stars: 5, isBoss: true, lore: 'SEERESS ENTHRONED IN THE DEEPEST AQUEDUCT CISTERN.' },
  seraph:         { name: 'MOONLIT SERAPH',       stars: 5, isBoss: true, lore: 'SIX-WINGED CELESTIAL SENTINEL OF THE FLOATING GARDEN.' },
  mandragora:     { name: 'NIGHTSHADE QUEEN',     stars: 5, isBoss: true, lore: 'BOTANICAL SOVEREIGN OF THE BLIGHTED CONSERVATORY GLASSHOUSE.' },
  inquisitor:     { name: 'GRAND INQUISITOR',     stars: 5, isBoss: true, lore: 'IRON-MASKED WARDEN OF THE SUBTERRANEAN TORTURE VAULTS.' },
  astromancer:    { name: 'ECLIPSE ASTROMANCER',  stars: 5, isBoss: true, lore: 'HIGH SEER WHO BENDS STARLIGHT BENEATH THE CELESTIAL ORRERY.' },
  count:          { name: 'THE COUNT',            stars: 5, isBoss: true, lore: 'IMMORTAL LORD OF CASTLE NOCTURNE.' },
};

export const BESTIARY_ORDER = [
  // Showcase the 6 newly forged gothic castle fiends right near the top alongside early horrors
  'zombie', 'bat', 'skeleton', 'fleaman', 'medusa', 'dullahan', 'rulersword', 'novaskeleton',
  'bonepillar', 'jiangshi', 'gravekeeper', 'wolf', 'sporecap', 'owl', 'spriggan', 'mosstroll',
  'pumpkin', 'scarecrow', 'wickerman', 'icegolem', 'snowman', 'wisp', 'wendigo',
  'armor', 'arbalest', 'bonegoliath', 'wraith', 'ghost', 'magmaslime', 'cinderimp', 'pyromancer', 'lavagolem',
  'dragon', 'catoblepas', 'clockknight', 'gearharpy', 'brasstitan', 'tome', 'inkscholar', 'necromancer',
  'gargoyle', 'censerprelate', 'alchfiend', 'vathulk', 'duelist', 'waltzdancer', 'bloodknight',
  'executioner', 'retiarius', 'minotaur', 'merman', 'siren', 'cisterncrab', 'valkyrie', 'astralarcher', 'marblecolossus',
  'giantbat', 'treant', 'greatjack', 'devilsanta', 'bonecaptain', 'boss', 'cinderqueen', 'gorgon',
  'automaton', 'archivist', 'archon', 'alchemist', 'masquerade', 'gladiator', 'oracle', 'seraph',
  'mandragora', 'inquisitor', 'astromancer', 'count',
];

export function getEnemyDisplayInfo(enemy) {
  const key = resolveEnemySpeciesKey(enemy);
  const meta = BESTIARY_META[key];
  const rawName = (enemy && enemy.bossName) || (meta && meta.name) || (key ? key.toUpperCase() : 'FIEND');
  const stars = (meta && meta.stars) || (enemy && enemy.arena ? 5 : 2);
  const soulPair = SPECIES_SOUL_MAP[key];
  const soul = soulPair ? SOUL_GLYPHS[soulPair[0]] : null;
  const mults = ENEMY_RESISTANCES[key] || null;
  const weakList = [];
  const resistList = [];
  if (mults) {
    for (const [k, v] of Object.entries(mults)) {
      const label = (ELEMENT_META[k] && ELEMENT_META[k].label) || (PHYSICAL_META[k] && PHYSICAL_META[k].label) || k.toUpperCase();
      const color = (ELEMENT_META[k] && ELEMENT_META[k].color) || (PHYSICAL_META[k] && PHYSICAL_META[k].color) || '#dce4f2';
      if (v >= 1.45) weakList.push({ key: k, label, color, mult: v });
      else if (v <= 0.65) resistList.push({ key: k, label, color, mult: v });
    }
  }
  const drops = (ENEMY_WEAPON_DROPS[key] || []).map(([wid]) => WEAPONS[wid]).filter(Boolean);
  return {
    key,
    name: rawName,
    stars,
    lore: (meta && meta.lore) || 'DENIZEN OF CASTLE NOCTURNE.',
    soul,
    weakList,
    resistList,
    drops,
  };
}

/** Computes active passive bonuses granted by the Hunter's equipped Amber Enchant Glyph. */
export function computeEnchantBonuses(game) {
  const out = { strBonus: 0, maxHpBonus: 0, speedPct: 0, critBonus: 0, luckMult: 1, siphonChance: 0 };
  if (!game || !game.equippedSouls) return out;
  const encId = game.equippedSouls.enchant;
  if (!encId || !SOUL_GLYPHS[encId]) return out;
  const rank = Math.max(1, Math.min(SOUL_MAX_RANK, (game.soulRanks && game.soulRanks[encId]) || 1));
  switch (encId) {
    case 'flea_agility':
      out.speedPct = 0.08 + (rank - 1) * 0.015;
      break;
    case 'golem_might':
      out.strBonus = 2 + Math.floor((rank - 1) * 0.5);
      out.maxHpBonus = 2 + Math.floor((rank - 1) * 0.75);
      break;
    case 'scholar_fortune':
      out.critBonus = 0.10 + (rank - 1) * 0.022;
      out.luckMult = 1.35 + (rank - 1) * 0.05;
      break;
    case 'blood_feast':
      out.siphonChance = 0.35 + (rank - 1) * 0.05;
      break;
    default:
      break;
  }
  return out;
}

/** Rolls whether a slain enemy manifests a floating Tactical Soul Glyph Orb. */
export function rollEnemySoulDrop(enemy, game, rng = Math.random) {
  const key = resolveEnemySpeciesKey(enemy);
  const pair = SPECIES_SOUL_MAP[key];
  if (!pair) return null;
  const [soulId, baseChance] = pair;
  if (!SOUL_GLYPHS[soulId]) return null;
  const curRank = (game && game.soulRanks && game.soulRanks[soulId]) || 0;
  if (curRank >= SOUL_MAX_RANK) return null;
  const ench = computeEnchantBonuses(game);
  // Generous first-discovery chance so players actively experience Soul Absorption during a run,
  // tapering cleanly for Rank 2..9 upgrades.
  const chance = (curRank === 0 ? baseChance : baseChance * 0.42) * (ench.luckMult || 1);
  return rng() < chance ? soulId : null;
}

/**
 * Luminous Tactical Soul / Glyph Orb that rises from a vanquished fiend or
 * Arcane Glyph Pedestal, hovers with a sacred sigil ring, then streaks into the hunter!
 */
export class SoulOrb {
  constructor(soulId, x, y) {
    this.soulId = soulId;
    this.x = x;
    this.y = y;
    this.vx = (Math.random() - 0.5) * 36;
    this.vy = -125;
    this.t = 0;
    this.dead = false;
  }

  get glyph() { return SOUL_GLYPHS[this.soulId] || null; }
  get meta() {
    const g = this.glyph;
    return (g && SOUL_TYPES[g.type]) || SOUL_TYPES.bullet;
  }

  update(dt, world) {
    this.t += dt;
    const p = world && world.player;
    if (!p || !p.alive) {
      if (this.t > 8) this.dead = true;
      return;
    }
    if (this.t < 0.38) {
      // Dramatic upward release + brief hover suspension
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vx *= 0.90;
      this.vy *= 0.88;
      return;
    }
    const tx = p.x;
    const ty = p.y - 32;
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    const speed = Math.min(540, 190 + (this.t - 0.38) * 420);
    this.vx += ((dx / dist) * speed - this.vx) * Math.min(1, 14 * dt);
    this.vy += ((dy / dist) * speed - this.vy) * Math.min(1, 14 * dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (Math.random() < 0.75 && world.particles) {
      world.particles.sparks(this.x, this.y, 1, this.meta.color);
    }

    if (dist < 18 || this.t > 5.5) {
      this.dead = true;
      if (world.onSoulAbsorbed) world.onSoulAbsorbed(this.soulId, p.x, p.y - 34);
    }
  }

  draw(ctx, camX, camY, time, fxLayers = null, assets = null) {
    const sx = Math.round(this.x - camX);
    const sy = Math.round(this.y - camY);
    const m = this.meta;
    const pulse = 0.65 + 0.35 * Math.sin(time * 12 + this.t * 5);

    ctx.save();
    const g = ctx.createRadialGradient(sx, sy, 1, sx, sy, 18);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, m.color);
    g.addColorStop(1, 'rgba(10, 8, 22, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(sx - 18, sy - 18, 36, 36);

    const orbFr = assets && assets.frame && assets.frame('exploration_props', 'soul_orb');
    if (orbFr && assets.img('exploration_props')) {
      assets.draw(ctx, 'exploration_props', 'soul_orb', sx, Math.round(sy + orbFr.h * 0.5));
    } else {
      // Fallback rotating gothic diamond sigil ring
      const r = 7 + pulse * 2.5;
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 1;
      ctx.translate(sx, sy);
      ctx.rotate(time * 3.8);
      ctx.strokeRect(-r * 0.6, -r * 0.6, r * 1.2, r * 1.2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-3, -3, 6, 6);
    }
    ctx.restore();

    if (fxLayers && fxLayers.enabled) {
      fxLayers.addAttack({
        x: sx, y: sy, rx: 11, ry: 11, dirX: 0, dirY: -1,
        mode: 0, seed: this.t * 2.1, core: m.core, rim: m.rim, alpha: 0.75,
      });
    }
  }
}
