// Modular Dual-Hand Equipment Matrix:
// - Ambidextrous Dual-Slot Handler (Hand_L / Slot 0 & Hand_R / Slot 1)
// - Parallel Interruption & Two-Handed Lockout (`isTwoHanded`)
// - Generic Weapon Classification Matrix (Light Blade, Standard Blade, Heavy Blade,
//   Brawler/Fist, Boomerang/Projectile, plus Shield, Catalyst & Whip)
// - 30-Frame Directional Input Buffer Queue (Hidden Fighting-Game Command Skills)
//   & Cross-Hand Combo Resonance (Set-Tag simultaneous L+R modifiers)
// - Stat Deficit Gate (`playerStr < reqStr => 0.5x scaling`) + XP & Relic/Vessel STR
// - Tactical Damage Matrix: Physical (Cut / Blunt) + Elemental (Fire, Frost, Volt,
//   Holy, Void) vs. per-enemy & per-boss resistance multipliers.

export const WEAPON_CATEGORIES = {
  whip: {
    key: 'whip',
    label: 'LASH',
    movement: 'GROUND ROOT',
    hands: 1,
    summary: 'SWEEPING CHAIN LASH · LONG REACH',
  },
  light_blade: {
    key: 'light_blade',
    label: 'LIGHT BLADE',
    movement: 'FULL MOVE',
    hands: 1,
    summary: 'LINEAR THRUST · INSTANT STARTUP · FULL MOVE',
  },
  standard_blade: {
    key: 'standard_blade',
    label: 'STD BLADE',
    movement: 'JUMP / STEP',
    hands: 1,
    summary: 'OVERHEAD ARC · BALANCED RANGE & STAGGER',
  },
  heavy_blade: {
    key: 'heavy_blade',
    label: 'HEAVY 2H',
    movement: 'ROOTED (2H)',
    hands: 2,
    summary: 'MASSIVE 180° SWEEP · KNOCKBACK · LOCKS OFF-HAND',
  },
  brawler: {
    key: 'brawler',
    label: 'BRAWLER',
    movement: 'LUNGE SHIFT',
    hands: 1,
    summary: 'MULTI-HIT SURGE · IGNORES LIGHT ARMOR & GUARD',
  },
  boomerang: {
    key: 'boomerang',
    label: 'BOOMERANG',
    movement: 'FULL MOVE',
    hands: 1,
    summary: 'OUTWARD LOOP & RETURN · DOUBLE-HIT RANGED',
  },
  shield: {
    key: 'shield',
    label: 'SHIELD',
    movement: 'GUARD WALK',
    hands: 1,
    summary: 'HOLD TO BLOCK SHOTS & HALVE HITS · TAP TO BASH',
  },
  catalyst: {
    key: 'catalyst',
    label: 'CATALYST',
    movement: 'FULL MOVE',
    hands: 1,
    summary: 'ARCANE SPELL FOCUS · RESONATES WITH SHIELDS',
  },
};

export const ELEMENT_META = {
  fire: { label: 'FIRE', color: '#ff7a2f', core: [1.0, 0.94, 0.68], rim: [1.0, 0.34, 0.08] },
  frost: { label: 'FROST', color: '#7ad8ff', core: [0.92, 0.99, 1.0], rim: [0.26, 0.72, 1.0] },
  volt: { label: 'VOLT', color: '#ffe66d', core: [1.0, 1.0, 0.82], rim: [0.98, 0.82, 0.18] },
  holy: { label: 'HOLY', color: '#fff0a8', core: [1.0, 0.98, 0.86], rim: [1.0, 0.82, 0.32] },
  void: { label: 'VOID', color: '#c88cff', core: [0.94, 0.84, 1.0], rim: [0.58, 0.24, 0.98] },
};

export const PHYSICAL_META = {
  cut: { label: 'CUT', color: '#e8eef8' },
  blunt: { label: 'BLUNT', color: '#f0b868' },
};

/** Set-Tag Cross-Hand Resonance spells triggered when Hand_L + Hand_R fire simultaneously. */
export const SET_RESONANCES = {
  consecrated: {
    tag: 'consecrated',
    name: 'SANCTIFIED NOVA',
    element: 'holy',
    physical: 'blunt',
    baseDamage: 5,
    radius: 118,
    color: [1.0, 0.88, 0.42],
    hex: '#ffe89e',
    wardDur: 2.2,
    desc: 'RADIAL HOLY SHOCKWAVE + SANCTUARY AEGIS',
  },
  knightly: {
    tag: 'knightly',
    name: 'BASTION BREAKER',
    element: null,
    physical: 'blunt',
    baseDamage: 5.5,
    radius: 106,
    color: [0.85, 0.90, 1.0],
    hex: '#dce8ff',
    wardDur: 2.4,
    desc: 'ARMOR-SHATTERING TREMOR + IRON GUARD',
  },
  duelist: {
    tag: 'duelist',
    name: 'QUICKSILVER CROSS',
    element: null,
    physical: 'cut',
    baseDamage: 5,
    radius: 102,
    color: [0.62, 0.96, 0.82],
    hex: '#7ef5d2',
    wardDur: 1.6,
    projectile: 'silver_beam',
    desc: 'TWIN CROSS-SLASH + PIERCING SILVER ARC',
  },
  infernal: {
    tag: 'infernal',
    name: 'PYRE SHIELD DETONATION',
    element: 'fire',
    physical: 'blunt',
    baseDamage: 6,
    radius: 126,
    color: [1.0, 0.42, 0.12],
    hex: '#ff7a2f',
    wardDur: 2.5,
    spawnFlames: true,
    desc: 'EXPLOSIVE FLAME NOVA + MOLTEN GROUND RING',
  },
  glacial: {
    tag: 'glacial',
    name: 'RIME AEGIS BURST',
    element: 'frost',
    physical: 'blunt',
    baseDamage: 5.5,
    radius: 122,
    color: [0.38, 0.82, 1.0],
    hex: '#7ad8ff',
    wardDur: 2.6,
    iceFan: true,
    desc: 'FREEZING NOVA + 5-WAY RIME SHARD VOLLEY',
  },
  tempest: {
    tag: 'tempest',
    name: 'FULGURITE DISCHARGE',
    element: 'volt',
    physical: 'cut',
    baseDamage: 6,
    radius: 132,
    color: [1.0, 0.90, 0.25],
    hex: '#ffe66d',
    wardDur: 1.8,
    projectile: 'volt_lance',
    desc: 'THUNDERCLAP SHOCK RING + LIGHTNING LANCE',
  },
  abyssal: {
    tag: 'abyssal',
    name: 'ECLIPSE SINGULARITY',
    element: 'void',
    physical: 'cut',
    baseDamage: 6.5,
    radius: 128,
    color: [0.68, 0.32, 1.0],
    hex: '#c88cff',
    wardDur: 2.2,
    siphonHp: 1,
    desc: 'VOID IMPLOSION + +1 HP SOUL SIPHON ON HIT',
  },
};

/**
 * Full Gothic Arsenal across all classes. Every weapon works identically in
 * Hand_L (Slot 0) or Hand_R (Slot 1); `isTwoHanded` locks out the opposing slot.
 */
export const WEAPONS = {
  hunters_lash: {
    id: 'hunters_lash',
    name: "HUNTER'S LASH",
    short: 'LASH',
    category: 'whip',
    isTwoHanded: false,
    reqStr: 4,
    baseDamage: 1.1,
    scaling: 0.18,
    physical: 'cut',
    element: 'holy',
    setTag: 'consecrated',
    duration: 0.40,
    active: [0.13, 0.31],
    reach: 96,
    knockback: 95,
    shape: 'whip',
    bladeColor: '#b98a52',
    trimColor: '#fff0a8',
    desc: 'CONSECRATED LEATHER & SILVER CHAIN LASH',
    skill: {
      name: 'SANCTIFIED CRACK',
      desc: 'SEARING HOLY WHIP EXTENSION + RADIANT WAVE',
      mult: 1.65,
      projectile: 'holy_wave',
    },
  },

  heraldic_buckler: {
    id: 'heraldic_buckler',
    name: 'IRONWOOD TARGE',
    short: 'TARGE',
    category: 'shield',
    isTwoHanded: false,
    reqStr: 4,
    baseDamage: 1.2,
    scaling: 0.12,
    physical: 'blunt',
    element: null,
    setTag: 'knightly',
    duration: 0.28,
    active: [0.05, 0.18],
    reach: 30,
    knockback: 145,
    guardReduction: 0.50,
    shape: 'buckler',
    bladeColor: '#8a9ab5',
    trimColor: '#d9b36a',
    desc: 'HOLD TO DEFLECT SHOTS · TAP FOR BLUNT BASH',
    skill: {
      name: 'BASTION CHARGE',
      desc: 'ARMORED FORWARD SHIELD RAM THAT CRUSHES BONE',
      mult: 1.85,
      dashVx: 190,
    },
  },

  silver_rapier: {
    id: 'silver_rapier',
    name: 'SILVER ESTOC',
    short: 'ESTOC',
    category: 'light_blade',
    isTwoHanded: false,
    reqStr: 5,
    baseDamage: 1.4,
    scaling: 0.16,
    physical: 'cut',
    element: null,
    setTag: 'duelist',
    duration: 0.22,
    active: [0.04, 0.16],
    reach: 62,
    knockback: 60,
    shape: 'rapier',
    bladeColor: '#dce8ff',
    trimColor: '#ffd27a',
    desc: 'NEEDLE THRUST · ZERO MOVEMENT PENALTY · HIGH DPS',
    skill: {
      name: 'PHANTOM FLURRY',
      desc: 'TRIPLE RAPID NEEDLE THRUSTS + SILVER DART',
      mult: 1.75,
      multiHit: 3,
      projectile: 'silver_beam',
    },
  },

  iron_caestus: {
    id: 'iron_caestus',
    name: 'RIVETED CAESTUS',
    short: 'CAESTUS',
    category: 'brawler',
    isTwoHanded: false,
    reqStr: 5,
    baseDamage: 1.1,
    scaling: 0.14,
    physical: 'blunt',
    element: null,
    setTag: 'duelist',
    duration: 0.26,
    active: [0.04, 0.21],
    reach: 38,
    knockback: 110,
    multiHit: 2,
    armorPiercing: true,
    lungeVx: 145,
    shape: 'fist',
    bladeColor: '#9aa8c4',
    trimColor: '#d98a4e',
    desc: '2-HIT LUNGE · BYPASSES LIGHT ARMOR & SHIELDS',
    skill: {
      name: 'METEOR UPPERCUT',
      desc: 'ARMOR-PIERCING RISING BLOW WITH SHOCK BURST',
      mult: 1.8,
      dashVx: 175,
      popVy: -240,
    },
  },

  crypt_falchion: {
    id: 'crypt_falchion',
    name: 'CRYPT BROADSWORD',
    short: 'SWORD',
    category: 'standard_blade',
    isTwoHanded: false,
    reqStr: 6,
    baseDamage: 2.0,
    scaling: 0.18,
    physical: 'cut',
    element: null,
    setTag: 'knightly',
    duration: 0.32,
    active: [0.08, 0.24],
    reach: 58,
    knockback: 115,
    stepVx: 58,
    shape: 'sword',
    bladeColor: '#cfd8e8',
    trimColor: '#c89b48',
    desc: 'BALANCED OVERHEAD ARC · FREE JUMP & COMBAT STEP',
    skill: {
      name: 'CRESCENT WAVE',
      desc: 'UNLEASHES A PIERCING STEEL BLADE CRESCENT',
      mult: 1.55,
      projectile: 'silver_beam',
    },
  },

  iron_mace: {
    id: 'iron_mace',
    name: 'SANCTUARY MACE',
    short: 'MACE',
    category: 'standard_blade',
    isTwoHanded: false,
    reqStr: 7,
    baseDamage: 2.1,
    scaling: 0.19,
    physical: 'blunt',
    element: 'holy',
    setTag: 'consecrated',
    duration: 0.35,
    active: [0.09, 0.26],
    reach: 52,
    knockback: 145,
    stepVx: 52,
    armorPiercing: true,
    shape: 'mace',
    bladeColor: '#d8e0ef',
    trimColor: '#ffe89e',
    desc: 'BLUNT + HOLY FLANGED MACE · DEVASTATES SKELETONS',
    skill: {
      name: 'BELLBREAKER SLAM',
      desc: 'CONSECRATED CRUSHING ARC + HOLY SPARK PILLAR',
      mult: 1.75,
      projectile: 'holy_wave',
    },
  },

  halcyon_chakram: {
    id: 'halcyon_chakram',
    name: 'SUNSTEEL CHAKRAM',
    short: 'CHAKRAM',
    category: 'boomerang',
    isTwoHanded: false,
    reqStr: 7,
    baseDamage: 1.5,
    scaling: 0.15,
    physical: 'cut',
    element: 'holy',
    setTag: 'consecrated',
    duration: 0.26,
    active: [0.05, 0.16],
    reach: 155,
    knockback: 75,
    shape: 'chakram',
    bladeColor: '#ffe89e',
    trimColor: '#ff9a3c',
    desc: 'BOOMERANG RING · HITS OUTWARD & ON RETURN',
    skill: {
      name: 'SOLAR HALO',
      desc: 'WIDE HIGH-VELOCITY GOLDEN BOOMERANG ORBIT',
      mult: 1.6,
      fastLoop: true,
    },
  },

  ember_codex: {
    id: 'ember_codex',
    name: 'PYRE CATALYST',
    short: 'PYRE TOME',
    category: 'catalyst',
    isTwoHanded: false,
    reqStr: 8,
    baseDamage: 1.7,
    scaling: 0.17,
    physical: 'blunt',
    element: 'fire',
    setTag: 'infernal',
    duration: 0.30,
    active: [0.06, 0.18],
    reach: 180,
    knockback: 80,
    boltType: 'catalyst_fire',
    shape: 'tome',
    bladeColor: '#ff6a28',
    trimColor: '#ffd27a',
    desc: 'SEARING FIREORB · RESONATES WITH PYRE SHIELD',
    skill: {
      name: 'HELLFIRE TRINITY',
      desc: '3-WAY FAN OF EXPLOSIVE EMBER BOLTS',
      mult: 1.45,
      spread: 3,
    },
  },

  frost_stiletto: {
    id: 'frost_stiletto',
    name: 'RIME MISERICORDE',
    short: 'STILETTO',
    category: 'light_blade',
    isTwoHanded: false,
    reqStr: 9,
    baseDamage: 1.7,
    scaling: 0.17,
    physical: 'cut',
    element: 'frost',
    setTag: 'glacial',
    duration: 0.21,
    active: [0.04, 0.15],
    reach: 60,
    knockback: 65,
    shape: 'rapier',
    bladeColor: '#8ad8ff',
    trimColor: '#eef8ff',
    desc: 'RAPID FROST THRUST · QUENCHES MAGMA & FLAME FOES',
    skill: {
      name: 'GLACIAL LUNGE',
      desc: 'HIGH-SPEED DARTING THRUST + RIME ICICLE',
      mult: 1.7,
      dashVx: 172,
      projectile: 'catalyst_frost',
    },
  },

  frost_phylactery: {
    id: 'frost_phylactery',
    name: 'BOREAL CATALYST',
    short: 'RIME ORB',
    category: 'catalyst',
    isTwoHanded: false,
    reqStr: 9,
    baseDamage: 1.8,
    scaling: 0.17,
    physical: 'blunt',
    element: 'frost',
    setTag: 'glacial',
    duration: 0.29,
    active: [0.06, 0.18],
    reach: 185,
    knockback: 75,
    boltType: 'catalyst_frost',
    shape: 'tome',
    bladeColor: '#62c8ff',
    trimColor: '#e8f8ff',
    desc: 'LAUNCHES CRYO LANCES · RESONATES WITH RIME AEGIS',
    skill: {
      name: 'BLIZZARD VOLLEY',
      desc: 'FIRES A 3-SHARD GLACIAL BARRAGE',
      mult: 1.45,
      spread: 3,
    },
  },

  pyre_shield: {
    id: 'pyre_shield',
    name: 'SALAMANDER SHIELD',
    short: 'PYRE SHLD',
    category: 'shield',
    isTwoHanded: false,
    reqStr: 10,
    baseDamage: 1.8,
    scaling: 0.15,
    physical: 'blunt',
    element: 'fire',
    setTag: 'infernal',
    duration: 0.28,
    active: [0.05, 0.19],
    reach: 34,
    knockback: 155,
    guardReduction: 0.42,
    shape: 'shield',
    bladeColor: '#c84228',
    trimColor: '#ffd27a',
    desc: 'FLAME HEATER · DETONATES WITH PYRE CATALYST',
    skill: {
      name: 'SCORCHING BASH',
      desc: 'BLAZING SHIELD SLAM LEAVING SANCTIFIED FIRE',
      mult: 1.8,
      dashVx: 185,
      dropFlame: true,
    },
  },

  cinder_scimitar: {
    id: 'cinder_scimitar',
    name: 'CINDER SHAMSHIR',
    short: 'SHAMSHIR',
    category: 'standard_blade',
    isTwoHanded: false,
    reqStr: 11,
    baseDamage: 2.4,
    scaling: 0.20,
    physical: 'cut',
    element: 'fire',
    setTag: 'infernal',
    duration: 0.30,
    active: [0.07, 0.23],
    reach: 62,
    knockback: 120,
    stepVx: 66,
    shape: 'scimitar',
    bladeColor: '#ff8a3c',
    trimColor: '#ffe49e',
    desc: 'CURVED FLAME SABER · MELTS FROST & BEASTS',
    skill: {
      name: 'SOLAR SLASH',
      desc: 'IGNITES THE AIR WITH A SEARING FIRE WAVE',
      mult: 1.65,
      projectile: 'catalyst_fire',
      dropFlame: true,
    },
  },

  rime_aegis: {
    id: 'rime_aegis',
    name: 'GLACIAL AEGIS',
    short: 'RIME SHLD',
    category: 'shield',
    isTwoHanded: false,
    reqStr: 11,
    baseDamage: 1.9,
    scaling: 0.15,
    physical: 'blunt',
    element: 'frost',
    setTag: 'glacial',
    duration: 0.29,
    active: [0.05, 0.19],
    reach: 34,
    knockback: 160,
    guardReduction: 0.38,
    shape: 'shield',
    bladeColor: '#52a8e8',
    trimColor: '#e8f8ff',
    desc: 'TOWER SHIELD OF RIME · DETONATES WITH BOREAL ORB',
    skill: {
      name: 'AVALANCHE RAM',
      desc: 'FROST-CLAD SHIELD RUSH + RIME SHARD',
      mult: 1.85,
      dashVx: 188,
      projectile: 'catalyst_frost',
    },
  },

  executioner_zweihander: {
    id: 'executioner_zweihander',
    name: 'EXECUTIONER GREATSWORD',
    short: 'GREATSWRD',
    category: 'heavy_blade',
    isTwoHanded: true,
    reqStr: 12,
    baseDamage: 1.8,
    scaling: 0.34,
    physical: 'cut',
    element: null,
    setTag: 'knightly',
    duration: 0.54,
    active: [0.17, 0.40],
    reach: 96,
    knockback: 225,
    shape: 'greatsword',
    bladeColor: '#dce4f2',
    trimColor: '#d9a84e',
    desc: '2-HANDED · MASSIVE 180° OVERHEAD-TO-FLOOR CLEAVE',
    skill: {
      name: 'GUILLOTINE ARC',
      desc: 'EARTH-SHAKING CLEAVE + PIERCING SHOCKWAVE',
      mult: 1.65,
      projectile: 'silver_beam',
      shockwave: true,
    },
  },

  thunder_knuckles: {
    id: 'thunder_knuckles',
    name: 'GALVANIC TALONS',
    short: 'TALONS',
    category: 'brawler',
    isTwoHanded: false,
    reqStr: 12,
    baseDamage: 1.35,
    scaling: 0.15,
    physical: 'blunt',
    element: 'volt',
    setTag: 'tempest',
    duration: 0.25,
    active: [0.03, 0.21],
    reach: 42,
    knockback: 115,
    multiHit: 3,
    armorPiercing: true,
    lungeVx: 162,
    shape: 'fist',
    bladeColor: '#ffe66d',
    trimColor: '#7ce2ff',
    desc: '3-HIT VOLT CLAW BLITZ · SHREDS ARMOR & AUTOMATA',
    skill: {
      name: 'LIGHTNING BLITZ',
      desc: 'HIGH-SPEED VOLT SURGE + THUNDER LANCE',
      mult: 1.65,
      dashVx: 210,
      projectile: 'volt_lance',
    },
  },

  volt_katana: {
    id: 'volt_katana',
    name: 'STORMFANG BLADE',
    short: 'STORMFANG',
    category: 'light_blade',
    isTwoHanded: false,
    reqStr: 13,
    baseDamage: 2.1,
    scaling: 0.19,
    physical: 'cut',
    element: 'volt',
    setTag: 'tempest',
    duration: 0.22,
    active: [0.04, 0.15],
    reach: 68,
    knockback: 80,
    shape: 'katana',
    bladeColor: '#fff29e',
    trimColor: '#62d8ff',
    desc: 'RAZOR VOLT THRUST-DRAW · INSTANT RECOVERY',
    skill: {
      name: 'THUNDER DRAW',
      desc: 'FLASHING IAIDO STROKE + VOLT ARC BEAM',
      mult: 1.75,
      dashVx: 160,
      projectile: 'volt_lance',
    },
  },

  shadow_glaive: {
    id: 'shadow_glaive',
    name: 'NIGHTWING GLAIVE',
    short: 'GLAIVE',
    category: 'boomerang',
    isTwoHanded: false,
    reqStr: 14,
    baseDamage: 2.1,
    scaling: 0.18,
    physical: 'cut',
    element: 'void',
    setTag: 'abyssal',
    duration: 0.25,
    active: [0.05, 0.15],
    reach: 175,
    knockback: 85,
    shape: 'chakram',
    bladeColor: '#c88cff',
    trimColor: '#ff6e9c',
    desc: 'STAR-BLADED VOID BOOMERANG · DOUBLE-HIT RETURN',
    skill: {
      name: 'ECLIPSE GYRE',
      desc: 'LONG-RANGE PIERCING ABYSSAL RETURN GLAIVE',
      mult: 1.65,
      fastLoop: true,
    },
  },

  void_grimoire: {
    id: 'void_grimoire',
    name: 'NOCTURNE CATALYST',
    short: 'VOID TOME',
    category: 'catalyst',
    isTwoHanded: false,
    reqStr: 14,
    baseDamage: 2.2,
    scaling: 0.19,
    physical: 'blunt',
    element: 'void',
    setTag: 'abyssal',
    duration: 0.31,
    active: [0.06, 0.18],
    reach: 195,
    knockback: 90,
    boltType: 'catalyst_void',
    shape: 'tome',
    bladeColor: '#b472ff',
    trimColor: '#ffd27a',
    desc: 'CONJURES SEEKING VOID ORBS · SIPHONS DARKNESS',
    skill: {
      name: 'ABYSSAL CONVERGENCE',
      desc: 'UNLEASHES 3 SEEKING VOID ORBS AT ONCE',
      mult: 1.4,
      spread: 3,
    },
  },

  obsidian_warhammer: {
    id: 'obsidian_warhammer',
    name: 'OBSIDIAN MAUL',
    short: 'WARHAMMER',
    category: 'heavy_blade',
    isTwoHanded: true,
    reqStr: 16,
    baseDamage: 2.0,
    scaling: 0.38,
    physical: 'blunt',
    element: 'fire',
    setTag: 'infernal',
    duration: 0.58,
    active: [0.19, 0.42],
    reach: 92,
    knockback: 260,
    armorPiercing: true,
    shape: 'hammer',
    bladeColor: '#52485c',
    trimColor: '#ff7a2f',
    desc: '2-HANDED · CRUSHES STONE, BONE & PLATE ALIKE',
    skill: {
      name: 'CALDERA QUAKE',
      desc: 'VOLCANIC SLAM ERUPTING GROUND FLAMES & SHOCKWAVE',
      mult: 1.7,
      dropFlame: true,
      shockwave: true,
    },
  },

  astral_scythe: {
    id: 'astral_scythe',
    name: 'VOIDREAVER SCYTHE',
    short: 'GREATSCYTHE',
    category: 'heavy_blade',
    isTwoHanded: true,
    reqStr: 20,
    baseDamage: 2.2,
    scaling: 0.42,
    physical: 'cut',
    element: 'void',
    setTag: 'abyssal',
    duration: 0.52,
    active: [0.16, 0.39],
    reach: 108,
    knockback: 235,
    shape: 'scythe',
    bladeColor: '#d29eff',
    trimColor: '#62f2c2',
    desc: 'ENDGAME 2H REAPER · NEEDS 20 STR OR 0.5X GATE',
    skill: {
      name: 'SOUL HARVEST ARC',
      desc: 'MASSIVE ABYSSAL REAP + MEND +1 HP ON CONNECTION',
      mult: 1.7,
      siphonHp: 1,
      shockwave: true,
      projectile: 'catalyst_void',
    },
  },

  // -------------------------------------------------------------------------
  // 10 Legendary Gothic Relics & Arcane Arms
  // -------------------------------------------------------------------------

  nebula_whipsword: {
    id: 'nebula_whipsword',
    name: 'NEBULA CHAIN-LASH',
    short: 'NEBULA',
    category: 'whip',
    isTwoHanded: false,
    reqStr: 9,
    baseDamage: 1.55,
    scaling: 0.21,
    physical: 'cut',
    element: 'void',
    setTag: 'abyssal',
    duration: 0.34,
    active: [0.09, 0.27],
    reach: 108,
    knockback: 105,
    multiHit: 2,
    trackingWhip: true,
    freeMoveWhip: true,
    shape: 'whip',
    bladeColor: '#b87cff',
    trimColor: '#8ef5ff',
    desc: 'ARTICULATED VOID CHAIN-SWORD · BENDS TOWARD NEARBY FOES',
    skill: {
      name: 'ASTRAL SNARE LASH',
      desc: 'TWIN TRACKING VOID WHIPS + SEEKING DARK ORB',
      mult: 1.65,
      multiHit: 3,
      projectile: 'catalyst_void',
    },
  },

  herald_shield_rod: {
    id: 'herald_shield_rod',
    name: 'HERALDIC SHIELD ROD',
    short: 'SHIELD ROD',
    category: 'standard_blade',
    isTwoHanded: false,
    reqStr: 8,
    baseDamage: 1.85,
    scaling: 0.19,
    physical: 'blunt',
    element: 'holy',
    setTag: 'knightly',
    shieldRod: true,
    duration: 0.29,
    active: [0.07, 0.22],
    reach: 56,
    knockback: 135,
    stepVx: 48,
    shape: 'mace',
    bladeColor: '#dce6f7',
    trimColor: '#ffd27a',
    desc: 'ROYAL SCEPTER · L+R + SHIELD CALLS SACRED SPELL',
    skill: {
      name: 'SOVEREIGN DECREE',
      desc: 'CONSECRATED SCEPTER STRIKE + RADIANT HOLY WAVE',
      mult: 1.7,
      projectile: 'holy_wave',
    },
  },

  meteor_gauntlets: {
    id: 'meteor_gauntlets',
    name: 'SOLAR METEOR CESTUS',
    short: 'METEOR FIST',
    category: 'brawler',
    isTwoHanded: false,
    reqStr: 10,
    baseDamage: 1.05,
    scaling: 0.14,
    physical: 'blunt',
    element: 'fire',
    setTag: 'infernal',
    duration: 0.26,
    active: [0.03, 0.23],
    reach: 48,
    knockback: 125,
    multiHit: 4,
    armorPiercing: true,
    lungeVx: 155,
    shape: 'fist',
    bladeColor: '#e0a25c',
    trimColor: '#ff5268',
    desc: 'BLINDING 4-HIT PHANTOM FIST BARRAGE · CRUSHES GUARD',
    skill: {
      name: 'HUNDRED FIST NOVA',
      desc: '5-HIT METEOR PUNCH RUSH + BLAZING SHOCKWAVE',
      mult: 1.55,
      multiHit: 5,
      dashVx: 215,
      dropFlame: true,
    },
  },

  prism_codex: {
    id: 'prism_codex',
    name: 'PRISM ORB GRIMOIRE',
    short: 'PRISM ORB',
    category: 'catalyst',
    isTwoHanded: false,
    reqStr: 10,
    baseDamage: 1.95,
    scaling: 0.18,
    physical: 'blunt',
    element: 'void',
    setTag: 'abyssal',
    duration: 0.30,
    active: [0.05, 0.17],
    reach: 210,
    knockback: 90,
    boltType: 'prism_orb',
    globusBounce: true,
    shape: 'tome',
    bladeColor: '#9e3678',
    trimColor: '#ff8ae2',
    desc: 'CONJURES TWIN KINETIC SPHERES THAT RICOCHET OFF WALLS 5X',
    skill: {
      name: 'PRISM RICOCHET STORM',
      desc: 'UNLEASHES 4 HIGH-VELOCITY WALL-BOUNCING PRISM SPHERES',
      mult: 1.45,
      spread: 4,
    },
  },

  astral_rune_sword: {
    id: 'astral_rune_sword',
    name: 'HEAVEN RUNE BLADE',
    short: 'RUNESWORD',
    category: 'boomerang',
    isTwoHanded: false,
    reqStr: 12,
    baseDamage: 2.35,
    scaling: 0.20,
    physical: 'cut',
    element: 'holy',
    setTag: 'consecrated',
    duration: 0.26,
    active: [0.05, 0.16],
    reach: 196,
    knockback: 110,
    shape: 'sword',
    bladeColor: '#58c8ff',
    trimColor: '#ffd27a',
    desc: 'HURLS A SPINNING OVERSIZED RUNE GREATSWORD THAT RETURNS',
    skill: {
      name: 'CELESTIAL SWORD FAN',
      desc: 'CASTS A 3-BLADE ASTRAL SWORD FORMATION ACROSS THE HALL',
      mult: 1.6,
      fastLoop: true,
      swordFan: true,
    },
  },

  crimson_bloodblade: {
    id: 'crimson_bloodblade',
    name: 'CRIMSON BLOOD-KATANA',
    short: 'BLOODBLADE',
    category: 'standard_blade',
    isTwoHanded: false,
    reqStr: 13,
    baseDamage: 1.95,
    scaling: 0.20,
    physical: 'cut',
    element: 'void',
    setTag: 'duelist',
    bloodScaling: true,
    duration: 0.25,
    active: [0.05, 0.19],
    reach: 66,
    knockback: 95,
    stepVx: 76,
    shape: 'katana',
    bladeColor: '#3a2234',
    trimColor: '#ff3858',
    desc: 'CURSED IAIDO BLADE · ABSORBS SLAIN BLOOD TO GROW STRONGER!',
    skill: {
      name: 'CRIMSON MOON DRAW',
      desc: 'EVASIVE FLASH-STEP SLASH + PIERCING CRIMSON WAVE',
      mult: 1.8,
      dashVx: 220,
      siphonHp: 1,
      projectile: 'crimson_wave',
    },
  },

  helios_rod: {
    id: 'helios_rod',
    name: 'HELIOS SOLAR ROD',
    short: 'HELIOS RAY',
    category: 'catalyst',
    isTwoHanded: false,
    reqStr: 14,
    baseDamage: 2.30,
    scaling: 0.21,
    physical: 'blunt',
    element: 'fire',
    setTag: 'consecrated',
    laserBeam: true,
    boltType: 'helios_beam',
    duration: 0.30,
    active: [0.04, 0.22],
    reach: 230,
    knockback: 80,
    shape: 'mace',
    bladeColor: '#ffb838',
    trimColor: '#fff6c2',
    desc: 'FIRES AN INSTANT PIERCING HORIZONTAL BEAM OF SOLAR LIGHT',
    skill: {
      name: 'SOLAR CORONA BEAM',
      desc: 'OVERCHARGED TWIN-ELEMENT HOLY + FIRE ANNIHILATION RAY',
      mult: 1.75,
      overbeam: true,
    },
  },

  zephyr_galeblade: {
    id: 'zephyr_galeblade',
    name: 'ZEPHYR WIND-BLADE',
    short: 'GALEBLADE',
    category: 'light_blade',
    isTwoHanded: false,
    reqStr: 15,
    baseDamage: 0.92,
    scaling: 0.11,
    physical: 'cut',
    element: 'volt',
    setTag: 'tempest',
    windFlurry: true,
    multiHit: 4,
    duration: 0.21,
    active: [0.02, 0.19],
    reach: 74,
    knockback: 35,
    shape: 'katana',
    bladeColor: '#98f5ff',
    trimColor: '#ffd27a',
    desc: '4X MOVING WIND-SLASH BUZZSAW · ZERO MOVEMENT PENALTY!',
    skill: {
      name: 'THOUSAND GALE VORTEX',
      desc: '6-HIT CYCLONE SLASH WALL WHILE MOVING AT FULL SPRINT',
      mult: 1.45,
      multiHit: 6,
      projectile: 'silver_beam',
    },
  },

  solais_greatsword: {
    id: 'solais_greatsword',
    name: 'SOLAIS SWORD OF LIGHT',
    short: 'SOLAIS',
    category: 'heavy_blade',
    isTwoHanded: true,
    reqStr: 17,
    baseDamage: 2.35,
    scaling: 0.40,
    physical: 'cut',
    element: 'holy',
    setTag: 'consecrated',
    duration: 0.50,
    active: [0.14, 0.38],
    reach: 106,
    knockback: 245,
    shape: 'greatsword',
    bladeColor: '#fff8d6',
    trimColor: '#ffd25a',
    desc: 'LEGENDARY 2H RADIANT CLAYMORE · MASSIVE HOLY ARC CLEAVE',
    skill: {
      name: 'DAWN JUDGEMENT',
      desc: 'COLOSSAL LIGHT CLEAVE + RADIANT HOLY WAVE & SHOCKWAVE',
      mult: 1.8,
      shockwave: true,
      projectile: 'holy_wave',
    },
  },

  thanatos_scythe: {
    id: 'thanatos_scythe',
    name: 'THANATOS SOUL SCYTHE',
    short: 'SOULSCYTHE',
    category: 'heavy_blade',
    isTwoHanded: true,
    reqStr: 19,
    baseDamage: 2.15,
    scaling: 0.40,
    physical: 'cut',
    element: 'void',
    setTag: 'abyssal',
    spawnMiniScythe: true,
    duration: 0.50,
    active: [0.15, 0.38],
    reach: 110,
    knockback: 230,
    shape: 'scythe',
    bladeColor: '#d8dcff',
    trimColor: '#a86cff',
    desc: '2H DEATH SCYTHE · EVERY SWING SPAWNS A HOMING MINI-SICKLE!',
    skill: {
      name: 'REAPER SICKLE RING',
      desc: 'SUMMONS 3 SEEKING DEATH SICKLES + +1 HP SOUL MEND',
      mult: 1.7,
      siphonHp: 1,
      shockwave: true,
      sickleBurst: 3,
    },
  },
};

/** Special Shield-Rod Sacred Call resonances (`herald_shield_rod` + ANY Shield in opposite hand). */
export const SHIELD_ROD_SPELLS = {
  heraldic_buckler: {
    tag: 'shield_rod_iron',
    name: 'IRON LION AEGIS',
    element: 'holy',
    physical: 'blunt',
    baseDamage: 6.5,
    radius: 124,
    color: [1.0, 0.88, 0.46],
    hex: '#ffe28a',
    wardDur: 4.0,
    healHp: 2,
    desc: 'SHIELD ROD CALL: +2 HP MEND + 4S GOLDEN LION INVULNERABILITY WARD',
  },
  pyre_shield: {
    tag: 'shield_rod_pyre',
    name: 'SALAMANDER CONFLAGRATION',
    element: 'fire',
    physical: 'blunt',
    baseDamage: 8.0,
    radius: 146,
    color: [1.0, 0.38, 0.12],
    hex: '#ff6e2f',
    wardDur: 3.2,
    spawnFlames: true,
    desc: 'SHIELD ROD CALL: GREAT FIREWYRM NOVA + SCORCHED EARTH RING',
  },
  rime_aegis: {
    tag: 'shield_rod_rime',
    name: 'COCYTUS BLIZZARD',
    element: 'frost',
    physical: 'blunt',
    baseDamage: 7.5,
    radius: 142,
    color: [0.42, 0.88, 1.0],
    hex: '#7ae8ff',
    wardDur: 3.4,
    iceFan: true,
    desc: 'SHIELD ROD CALL: ABSOLUTE-ZERO NOVA + 5-SPEAR RIME VOLLEY',
  },
};

export function resolvePairResonance(wL, wR) {
  if (!wL || !wR || wL.isTwoHanded) return null;
  if (wL.shieldRod && wR.category === 'shield') {
    return SHIELD_ROD_SPELLS[wR.id] || SHIELD_ROD_SPELLS.heraldic_buckler;
  }
  if (wR.shieldRod && wL.category === 'shield') {
    return SHIELD_ROD_SPELLS[wL.id] || SHIELD_ROD_SPELLS.heraldic_buckler;
  }
  if (wL.setTag && wL.setTag === wR.setTag && SET_RESONANCES[wL.setTag]) {
    return SET_RESONANCES[wL.setTag];
  }
  return null;
}

export const WEAPON_ORDER = Object.keys(WEAPONS);

/** Deterministic stage pedestal placement across all 18 castle regions. */
export const STAGE_PEDESTAL_WEAPONS = {
  graveyard: 'heraldic_buckler',
  darkwood: 'silver_rapier',
  jack: 'ember_codex',
  yule: 'frost_stiletto',
  ramparts: 'crypt_falchion',
  catacombs: 'iron_mace',
  darkcave: 'pyre_shield',
  ossuary: 'halcyon_chakram',
  arcade: 'thunder_knuckles',
  library: 'frost_phylactery',
  cathedral: 'executioner_zweihander',
  clocktower: 'volt_katana',
  throne: 'astral_scythe',
  alchemy: 'void_grimoire',
  ballroom: 'cinder_scimitar',
  coliseum: 'iron_caestus',
  aqueduct: 'rime_aegis',
  skykeep: 'shadow_glaive',
  conservatory: 'nebula_whipsword',
  dungeon: 'crimson_bloodblade',
  observatory: 'astral_rune_sword',
};

/** Enemy sheet/class -> rare weapon drop table (`[weaponId, chanceUnowned, chanceOwned]`). */
export const ENEMY_WEAPON_DROPS = {
  skeleton: [['iron_mace', 0.11, 0.02], ['crypt_falchion', 0.08, 0.02]],
  armor: [['executioner_zweihander', 0.12, 0.02], ['heraldic_buckler', 0.12, 0.02]],
  tome: [['frost_phylactery', 0.12, 0.02], ['void_grimoire', 0.09, 0.02]],
  cinderimp: [['ember_codex', 0.12, 0.02], ['cinder_scimitar', 0.09, 0.02]],
  magmaslime: [['pyre_shield', 0.10, 0.02]],
  lavagolem: [['obsidian_warhammer', 0.16, 0.03]],
  icegolem: [['rime_aegis', 0.14, 0.02], ['frost_stiletto', 0.10, 0.02]],
  snowman: [['frost_stiletto', 0.09, 0.02]],
  gargoyle: [['halcyon_chakram', 0.12, 0.02]],
  wolf: [['iron_caestus', 0.11, 0.02]],
  sporecap: [['ember_codex', 0.08, 0.015]],
  ghost: [['silver_rapier', 0.10, 0.02]],
  wraith: [['shadow_glaive', 0.11, 0.02]],
  owl: [['volt_katana', 0.10, 0.02]],
  medusa: [['thunder_knuckles', 0.08, 0.015]],
  alchfiend: [['void_grimoire', 0.12, 0.02], ['ember_codex', 0.10, 0.02]],
  duelist: [['silver_rapier', 0.12, 0.02], ['cinder_scimitar', 0.11, 0.02]],
  executioner: [['executioner_zweihander', 0.14, 0.025], ['obsidian_warhammer', 0.12, 0.02]],
  merman: [['rime_aegis', 0.12, 0.02], ['frost_stiletto', 0.10, 0.02]],
  valkyrie: [['shadow_glaive', 0.13, 0.02], ['halcyon_chakram', 0.11, 0.02]],
  necromancer: [['astral_scythe', 0.11, 0.02], ['void_grimoire', 0.12, 0.02]],
  gravekeeper: [['iron_mace', 0.11, 0.02], ['crypt_falchion', 0.08, 0.02]],
  spriggan: [['halcyon_chakram', 0.10, 0.02], ['silver_rapier', 0.08, 0.02]],
  mosstroll: [['obsidian_warhammer', 0.16, 0.03], ['iron_caestus', 0.12, 0.02]],
  scarecrow: [['astral_scythe', 0.10, 0.02], ['cinder_scimitar', 0.09, 0.02]],
  wickerman: [['pyre_shield', 0.16, 0.03], ['ember_codex', 0.12, 0.02]],
  wendigo: [['frost_stiletto', 0.15, 0.03], ['rime_aegis', 0.13, 0.02]],
  arbalest: [['heraldic_buckler', 0.12, 0.02], ['crypt_falchion', 0.10, 0.02]],
  bonegoliath: [['iron_mace', 0.16, 0.03], ['executioner_zweihander', 0.14, 0.025]],
  pyromancer: [['ember_codex', 0.13, 0.02], ['pyre_shield', 0.10, 0.02]],
  clockknight: [['volt_katana', 0.13, 0.02], ['thunder_knuckles', 0.11, 0.02]],
  gearharpy: [['thunder_knuckles', 0.10, 0.02], ['halcyon_chakram', 0.09, 0.02]],
  brasstitan: [['thunder_knuckles', 0.16, 0.03], ['volt_katana', 0.14, 0.025]],
  inkscholar: [['void_grimoire', 0.13, 0.02], ['frost_phylactery', 0.11, 0.02]],
  censerprelate: [['iron_mace', 0.14, 0.02], ['halcyon_chakram', 0.11, 0.02]],
  bloodknight: [['executioner_zweihander', 0.15, 0.025], ['cinder_scimitar', 0.12, 0.02]],
  vathulk: [['void_grimoire', 0.16, 0.03], ['iron_caestus', 0.13, 0.02]],
  waltzdancer: [['silver_rapier', 0.13, 0.02], ['cinder_scimitar', 0.10, 0.02]],
  retiarius: [['iron_caestus', 0.12, 0.02], ['heraldic_buckler', 0.11, 0.02]],
  minotaur: [['executioner_zweihander', 0.16, 0.03], ['iron_caestus', 0.14, 0.025]],
  siren: [['frost_phylactery', 0.12, 0.02], ['rime_aegis', 0.10, 0.02]],
  cisterncrab: [['rime_aegis', 0.16, 0.03], ['obsidian_warhammer', 0.13, 0.02]],
  astralarcher: [['shadow_glaive', 0.13, 0.02], ['astral_rune_sword', 0.12, 0.02]],
  marblecolossus: [['solais_greatsword', 0.18, 0.03], ['astral_scythe', 0.14, 0.025]],

  // 6 New Gothic Species Drop Tables
  dullahan:     [['solais_greatsword', 0.18, 0.03], ['herald_shield_rod', 0.16, 0.025]],
  rulersword:   [['zephyr_galeblade', 0.20, 0.035], ['astral_rune_sword', 0.18, 0.03]],
  novaskeleton: [['helios_rod', 0.20, 0.03], ['nebula_whipsword', 0.14, 0.025]],
  fleaman:      [['meteor_gauntlets', 0.16, 0.025], ['iron_caestus', 0.11, 0.02]],
  bonepillar:   [['prism_codex', 0.18, 0.03], ['herald_shield_rod', 0.12, 0.02]],
  jiangshi:     [['crimson_bloodblade', 0.19, 0.03], ['thanatos_scythe', 0.14, 0.025]],
};

export function resolveEnemySpeciesKey(enemy) {
  if (!enemy) return '';
  if (enemy.resistKey) return enemy.resistKey;
  const sheet = enemy.sheet || '';
  if (sheet === 'ice') {
    return ((enemy.score || 0) >= 400 || (enemy.h || 0) >= 50) ? 'icegolem' : 'snowman';
  }
  if (sheet === 'vampire') return 'count';
  if (sheet === 'santa') return 'devilsanta';
  if (sheet === 'mushroom') return 'sporecap';
  return sheet;
}

export function rollEnemyWeaponDrop(enemy, game, rng = Math.random) {
  const key = resolveEnemySpeciesKey(enemy);
  const table = ENEMY_WEAPON_DROPS[key];
  if (!table || !table.length) return null;
  for (const [wid, chNew, chOwned] of table) {
    const owned = !!(game && game.hasWeapon && game.hasWeapon(wid));
    const chance = owned ? chOwned : chNew;
    if (rng() < chance) return wid;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Damage Matrix: Enemy Physical & Elemental Multipliers
// ---------------------------------------------------------------------------

/**
 * Keyed by resolved species key (`resolveEnemySpeciesKey(enemy)`).
 * Unspecified physical/elemental keys default to `1.0`.
 */
export const ENEMY_RESISTANCES = {
  // Undead & Bone (Armored bones shrug off Cut blades but shatter to Blunt & Holy!)
  skeleton:    { cut: 0.35, blunt: 2.00, holy: 1.75, fire: 1.25, frost: 0.85, void: 0.55 },
  bonecaptain: { cut: 0.45, blunt: 1.85, holy: 1.65, fire: 1.20, void: 0.60 },
  zombie:      { cut: 1.35, blunt: 0.90, holy: 1.85, fire: 1.65, void: 0.50 },
  ghost:       { cut: 0.55, blunt: 0.55, holy: 2.00, fire: 1.35, volt: 1.35, void: 0.40 },
  wraith:      { cut: 0.60, blunt: 0.60, holy: 2.00, frost: 1.30, void: 0.35 },
  boss:        { cut: 0.85, blunt: 1.15, holy: 1.75, fire: 1.25, void: 0.45 }, // Reaper / ReaperLord
  count:       { cut: 0.90, blunt: 0.95, holy: 1.80, fire: 0.75, volt: 1.25, void: 0.40 },
  vampire:     { cut: 0.90, blunt: 0.95, holy: 1.80, fire: 0.75, volt: 1.25, void: 0.40 },

  // Heavy Plate, Stone & Clockwork Constructs
  armor:       { cut: 0.40, blunt: 1.90, volt: 2.00, fire: 0.90, frost: 0.80 },
  automaton:   { cut: 0.45, blunt: 1.75, volt: 2.00, frost: 0.85, holy: 0.85 },
  gargoyle:    { cut: 0.45, blunt: 1.85, volt: 1.50, fire: 0.70 },
  archon:      { cut: 0.55, blunt: 1.70, volt: 1.55, void: 1.25, fire: 0.75 },

  // Woodland, Beasts & Autumn Spirits
  wolf:        { cut: 1.50, blunt: 0.85, fire: 1.75, frost: 1.20 },
  sporecap:    { cut: 1.55, blunt: 0.75, fire: 1.85, frost: 1.35 },
  mushroom:    { cut: 1.55, blunt: 0.75, fire: 1.85, frost: 1.35 },
  treant:      { cut: 1.45, blunt: 0.70, fire: 1.85, frost: 1.20, volt: 0.75 },
  pumpkin:     { cut: 1.40, blunt: 1.25, fire: 0.55, frost: 1.75, holy: 1.45 },
  greatjack:   { cut: 1.25, blunt: 1.15, fire: 0.45, frost: 1.80, holy: 1.50 },

  // Glacial Fiends
  icegolem:    { cut: 0.50, blunt: 1.75, fire: 2.00, frost: 0.25 },
  snowman:     { cut: 1.10, blunt: 1.45, fire: 2.00, frost: 0.25 },
  wisp:        { cut: 0.70, blunt: 0.80, fire: 2.00, frost: 0.20, volt: 1.40 },
  devilsanta:  { cut: 1.00, blunt: 1.20, fire: 1.80, frost: 0.35, holy: 1.55 },
  santa:       { cut: 1.00, blunt: 1.20, fire: 1.80, frost: 0.35, holy: 1.55 },

  // Volcanic & Draconic Fiends
  magmaslime:  { cut: 0.65, blunt: 1.20, fire: 0.25, frost: 2.00, volt: 1.25 },
  lavagolem:   { cut: 0.40, blunt: 1.80, fire: 0.25, frost: 2.00 },
  cinderimp:   { cut: 1.25, blunt: 1.00, fire: 0.25, frost: 2.00, holy: 1.45 },
  dragon:      { cut: 0.85, blunt: 1.15, fire: 0.30, frost: 1.85, volt: 1.50 },
  cinderqueen: { cut: 0.90, blunt: 1.10, fire: 0.30, frost: 1.85, holy: 1.30 },
  firebat:     { cut: 1.35, blunt: 1.00, fire: 0.30, frost: 1.95, holy: 1.45 },

  // Winged, Arcane & Petrifying Horrors
  bat:         { cut: 1.40, blunt: 1.00, volt: 1.85, holy: 1.45 },
  giantbat:    { cut: 1.25, blunt: 0.95, volt: 1.75, holy: 1.55, fire: 1.30 },
  owl:         { cut: 1.35, blunt: 1.00, volt: 1.85, frost: 1.35 },
  medusa:      { cut: 1.35, blunt: 1.10, volt: 1.65, holy: 1.45 },
  gorgon:      { cut: 1.20, blunt: 1.15, volt: 1.60, frost: 1.35 },
  catoblepas:  { cut: 1.20, blunt: 1.25, fire: 1.55, holy: 1.40 },
  tome:        { cut: 1.35, blunt: 0.85, fire: 1.90, void: 0.55, holy: 1.50 },
  archivist:   { cut: 1.20, blunt: 0.85, fire: 1.65, holy: 1.65, void: 0.45 },

  // Castle Wing Bosses & Newly Forged Species
  alchemist:   { cut: 1.15, blunt: 0.95, volt: 1.65, holy: 1.40, fire: 0.65, void: 0.55 },
  masquerade:  { cut: 0.85, blunt: 1.00, holy: 1.75, volt: 1.35, fire: 0.70, void: 0.45 },
  gladiator:   { cut: 0.45, blunt: 1.80, volt: 1.75, fire: 0.85, frost: 1.25 },
  oracle:      { cut: 1.15, blunt: 1.10, volt: 1.85, fire: 0.70, frost: 0.45 },
  seraph:      { cut: 0.60, blunt: 1.65, void: 1.85, volt: 1.35, holy: 0.40 },

  alchfiend:   { cut: 1.35, blunt: 1.05, volt: 1.75, frost: 1.45, fire: 0.55 },
  duelist:     { cut: 0.75, blunt: 1.35, holy: 1.75, volt: 1.50, void: 0.50 },
  executioner: { cut: 0.42, blunt: 1.85, volt: 1.90, holy: 1.35, fire: 0.85 },
  merman:      { cut: 1.30, blunt: 1.05, volt: 2.00, fire: 0.75, frost: 0.45 },
  valkyrie:    { cut: 0.65, blunt: 1.65, void: 1.90, volt: 1.55, holy: 0.40 },
  necromancer: { cut: 1.25, blunt: 1.15, holy: 2.00, fire: 1.55, void: 0.35 },
  gravekeeper:    { cut: 1.25, blunt: 1.10, holy: 1.85, fire: 1.55, void: 0.50 },
  spriggan:       { cut: 1.45, blunt: 0.85, fire: 1.90, frost: 1.25, volt: 0.80 },
  mosstroll:      { cut: 1.30, blunt: 0.85, fire: 1.95, frost: 1.25, volt: 0.75 },
  scarecrow:      { cut: 1.45, blunt: 0.85, fire: 1.95, holy: 1.45, void: 0.65 },
  wickerman:      { cut: 1.15, blunt: 1.25, fire: 0.30, frost: 1.95, holy: 1.45 },
  wendigo:        { cut: 1.20, blunt: 1.15, fire: 2.00, frost: 0.25, holy: 1.45 },
  arbalest:       { cut: 0.55, blunt: 1.75, volt: 1.85, fire: 0.95 },
  bonegoliath:    { cut: 0.38, blunt: 2.00, holy: 1.85, fire: 1.25, void: 0.50 },
  pyromancer:     { cut: 1.30, blunt: 1.05, fire: 0.25, frost: 2.00, holy: 1.40 },
  clockknight:    { cut: 0.45, blunt: 1.80, volt: 2.00, frost: 0.85 },
  gearharpy:      { cut: 0.65, blunt: 1.65, volt: 2.00, frost: 0.85 },
  brasstitan:     { cut: 0.40, blunt: 1.85, volt: 2.00, fire: 0.65, frost: 0.85 },
  inkscholar:     { cut: 1.35, blunt: 0.95, fire: 1.75, holy: 1.65, void: 0.40 },
  censerprelate:  { cut: 0.80, blunt: 1.35, void: 1.80, volt: 1.40, holy: 0.45 },
  bloodknight:    { cut: 0.65, blunt: 1.45, holy: 1.90, volt: 1.45, void: 0.40 },
  vathulk:        { cut: 1.15, blunt: 1.20, volt: 1.90, frost: 1.45, fire: 0.65 },
  waltzdancer:    { cut: 0.70, blunt: 0.80, holy: 1.95, fire: 1.35, void: 0.40 },
  retiarius:      { cut: 0.75, blunt: 1.55, volt: 1.75, holy: 1.45 },
  minotaur:       { cut: 1.15, blunt: 1.20, frost: 1.65, holy: 1.45, fire: 0.85 },
  siren:          { cut: 1.35, blunt: 1.00, volt: 2.00, fire: 0.75, frost: 0.45 },
  cisterncrab:    { cut: 0.42, blunt: 1.90, volt: 2.00, fire: 0.70, frost: 0.55 },
  astralarcher:   { cut: 0.75, blunt: 1.45, void: 1.90, volt: 1.40, holy: 0.40 },
  marblecolossus: { cut: 0.45, blunt: 1.85, void: 1.95, volt: 1.45, holy: 0.35 },

  // 6 New Gothic Species Resistances
  dullahan:       { cut: 0.45, blunt: 1.80, holy: 1.90, volt: 1.55, void: 0.40 },
  rulersword:     { cut: 0.55, blunt: 1.65, volt: 1.95, void: 1.50, holy: 0.65 },
  novaskeleton:   { cut: 0.38, blunt: 2.00, holy: 1.85, fire: 1.30, volt: 0.35, void: 0.55 },
  fleaman:        { cut: 1.55, blunt: 1.15, fire: 1.80, frost: 1.45 },
  bonepillar:     { cut: 0.40, blunt: 2.00, frost: 1.85, holy: 1.65, fire: 0.30 },
  jiangshi:       { cut: 1.25, blunt: 0.90, fire: 1.90, holy: 1.95, volt: 0.45, void: 0.45 },
};

export function getEnemyMultipliers(enemy) {
  if (!enemy) return null;
  if (enemy.sheet === 'bat' && enemy.variant === 'fire') return ENEMY_RESISTANCES.firebat;
  if (enemy.sheet === 'dragon' && enemy.variant === 'frost') return ENEMY_RESISTANCES.icegolem;
  if (enemy.sheet === 'skeleton' && enemy.variant === 'frost') {
    return { cut: 0.35, blunt: 2.00, holy: 1.75, fire: 1.85, frost: 0.25, void: 0.55 };
  }
  const key = resolveEnemySpeciesKey(enemy);
  return ENEMY_RESISTANCES[key] || null;
}

// ---------------------------------------------------------------------------
// Attribute Progression, Stat Deficit Gate & Damage Calculation
// ---------------------------------------------------------------------------

export const BASE_STRENGTH = 5;

/** XP threshold fallback helper (unified with `expRequiredForNextLevel` in `progression.js`). */
export function xpForNextLevel(level) {
  const lv = Math.max(1, Math.min(99, level | 0));
  if (lv >= 99) return 0;
  if (lv >= 19) return 10000;
  const n = lv + 1;
  return 25 * n * n + 25 * n - 50;
}

/**
 * Computes total Hunter `Player_Strength`:
 *   Base (5) + Character Level ups (+1/lv) + Martial Boss Relics (+1 each, plus +1 per 4 other relics)
 *   + Ancient Life Vessels (+1 per 3 vessels) + optional `?str=` URL test override.
 */
export function computeStrengthBreakdown(gameOrWorld) {
  const game = gameOrWorld && gameOrWorld.game ? gameOrWorld.game : gameOrWorld;
  const world = gameOrWorld && gameOrWorld.player ? gameOrWorld : (game && game.world);
  const level = Math.max(1, (game && (game.charLevel || game.hunterLevel)) || 1);
  const levelBonus = level - 1;

  const relics = world && world.relics
    ? world.relics
    : (game && game.getActiveRelics ? game.getActiveRelics() : new Set());
  let martialRelics = 0;
  let otherRelics = 0;
  if (relics) {
    for (const k of relics) {
      if (k === 'coliseum' || k === 'jack' || k === 'throne' || k === 'cathedral' || k === 'clocktower') {
        martialRelics++;
      } else {
        otherRelics++;
      }
    }
  }
  const relicStr = martialRelics + Math.floor(otherRelics / 4);
  const vessels = game && game.getVesselCount ? game.getVesselCount() : 0;
  const vesselStr = Math.floor(vessels / 3);
  const enchantStr = game && game.getEnchantStrBonus ? game.getEnchantStrBonus() : 0;
  let total = BASE_STRENGTH + levelBonus + relicStr + vesselStr + enchantStr;

  const params = game && game.params;
  if (params && typeof params.get === 'function' && params.has('str')) {
    const ov = parseInt(params.get('str') || '', 10);
    if (!Number.isNaN(ov) && ov > 0) total = ov;
  }

  return {
    base: BASE_STRENGTH,
    level,
    levelBonus,
    relicStr,
    vesselStr,
    enchantStr,
    total,
  };
}

/**
 * Core Modular Dual-Hand Equipment Matrix Damage Engine:
 *
 *   If (Player_Strength < Weapon_Required_Strength) Strength_Modifier = 0.5
 *   Else                                            Strength_Modifier = 1.0
 *   Final_Damage = Base_Weapon_Damage + (Player_Strength * Scaling_Coefficient * Strength_Modifier)
 *
 * Multiplied by skill/relic/difficulty modifiers and target Physical + Elemental
 * resistance multipliers (`Cut`/`Blunt` × `Fire`/`Frost`/`Volt`/`Holy`/`Void`).
 */
export function computeWeaponHit(weapon, playerStr, enemy = null, {
  skillMult = 1,
  flatBonus = 0,
  diffMult = 1,
} = {}) {
  if (!weapon) return { damage: 1, deficit: false, resistMult: 1, tag: null };
  const deficit = playerStr < (weapon.reqStr || 0);
  const strModifier = deficit ? 0.5 : 1.0;
  const core = weapon.baseDamage + (playerStr * weapon.scaling * strModifier) + flatBonus;

  let physMult = 1.0;
  let elemMult = 1.0;
  const mults = getEnemyMultipliers(enemy);
  if (mults) {
    if (weapon.physical && mults[weapon.physical] != null) physMult = mults[weapon.physical];
    if (weapon.element && mults[weapon.element] != null) elemMult = mults[weapon.element];
  }
  // Cap combined multiplier to [0.25, 2.6] so bosses never evaporate in 1 swing
  const isBoss = !!(enemy && enemy.arena);
  const rawResist = physMult * elemMult;
  const resistMult = isBoss
    ? Math.max(0.45, Math.min(1.65, 1 + (rawResist - 1) * 0.58))
    : Math.max(0.25, Math.min(2.5, rawResist));

  const scaled = core * skillMult * diffMult * resistMult;
  const damage = Math.max(1, Math.round(scaled));
  const tag = rawResist >= 1.45 ? 'weak' : (rawResist <= 0.65 ? 'resist' : null);
  return {
    damage,
    rawCore: core,
    deficit,
    strModifier,
    resistMult: rawResist,
    tag,
  };
}

// ---------------------------------------------------------------------------
// 30-Frame Fighting-Game Input Buffer Queue & Hidden Command Matcher
// ---------------------------------------------------------------------------

/**
 * Records the last 30 fixed 60Hz frames of directional inputs (normalized to
 * `facing`: F = toward enemy, B = away, D = crouch/down, U = up, DF = down+forward).
 * Matches classic fighting-game motions like `[Down, Down-Right, Right]` (`QCF`).
 */
export class InputBuffer {
  constructor(capacity = 30) {
    this.capacity = capacity;
    this.frames = [];
    this.lastHandPressTick = { 0: -999, 1: -999 };
    this.tick = 0;
  }

  record(input, facing = 1) {
    this.tick++;
    const fwd = facing >= 0 ? !!input.down.right : !!input.down.left;
    const back = facing >= 0 ? !!input.down.left : !!input.down.right;
    const down = !!input.down.down;
    const up = !!input.down.up;

    let tok = 'N';
    if (down && fwd) tok = 'DF';
    else if (down && back) tok = 'DB';
    else if (up && fwd) tok = 'UF';
    else if (down) tok = 'D';
    else if (fwd) tok = 'F';
    else if (back) tok = 'B';
    else if (up) tok = 'U';

    this.frames.push(tok);
    if (this.frames.length > this.capacity) this.frames.shift();
  }

  /**
   * Checks if the last 30 frames contain `[Down, Down-Forward, Forward]`
   * (also tolerates rapid keyboard `[Down -> Forward]` within 18 frames where the
   * player releases Down on the exact tick they press Forward).
   */
  matchQuarterCircleForward() {
    const buf = this.frames;
    const n = buf.length;
    if (n < 2) return false;
    // Require Forward (or Down-Forward) in the most recent 6 frames
    let fIdx = -1;
    for (let i = n - 1; i >= Math.max(0, n - 6); i--) {
      if (buf[i] === 'F') { fIdx = i; break; }
    }
    if (fIdx < 1) return false;

    // Classic [D, DF, F] anywhere in the 30-frame window
    let sawDF = false;
    for (let i = fIdx - 1; i >= 0; i--) {
      if (buf[i] === 'DF') sawDF = true;
      if (buf[i] === 'D' && (sawDF || (fIdx - i) <= 16)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Matches classic Gravity-Boots Super Jump `[Down, Up]` within 22 frames when
   * `Jump` is pressed while `Up` is held!
   */
  matchSuperJump() {
    const buf = this.frames;
    const n = buf.length;
    if (n < 3) return false;
    let sawUp = false;
    for (let i = n - 1; i >= Math.max(0, n - 5); i--) {
      if (buf[i] === 'U' || buf[i] === 'UF') { sawUp = true; break; }
    }
    if (!sawUp) return false;
    for (let i = n - 2; i >= Math.max(0, n - 24); i--) {
      if (buf[i] === 'D' || buf[i] === 'DF' || buf[i] === 'DB') return true;
    }
    return false;
  }

  consumeMotion() {
    this.frames.length = 0;
  }

  noteHandPress(slot) {
    this.lastHandPressTick[slot] = this.tick;
  }

  /**
   * True when Hand_L and Hand_R are pressed on the exact same frame (or within a
   * 2-tick = 33ms human simultaneity window for hardware keyboards/thumbs).
   */
  isCrossHandSimultaneous() {
    return Math.abs(this.lastHandPressTick[0] - this.lastHandPressTick[1]) <= 2;
  }
}

// ---------------------------------------------------------------------------
// Procedural 32-Bit Pixel-Art Weapon Icons & Combat Arc Renderers
// ---------------------------------------------------------------------------

const ICON_CACHE = new Map();
let _weaponSheetImg = null;
let _weaponSheetFrames = null;

/**
 * Binds the loaded `weapons.png` pixel-art sprite atlas so HUD sockets, Armory
 * panels, floating WeaponPedestals, world drops, boomerangs, and melee swings
 * render rich generated 32-bit pixel art (with procedural fallback for headless tests).
 */
export function registerWeaponSprites(assets) {
  if (!assets || !assets.atlas) return;
  const info = assets.info('weapons');
  const img = assets.img('weapons');
  if (info && info.frames && img) {
    _weaponSheetImg = img;
    _weaponSheetFrames = info.frames;
    ICON_CACHE.clear();
    BLADE_CACHE.clear();
  }
}

/**
 * Generates and caches a crisp pixel-art sprite canvas for `weaponId`:
 * - `variant = 'compact'` (default): `20×20` sprite (`hud_<id>`) for HUD & list rows.
 * - `variant = 'relic'`: `32×32` high-detail sprite (`<id>`) for Armory showcase,
 *   WeaponPedestals, world drops, boomerangs, shields, gauntlets & catalysts.
 * Returns `null` in non-DOM environments.
 */
export function getWeaponIconCanvas(weaponId, variant = 'compact') {
  const w = WEAPONS[weaponId];
  if (!w || typeof document === 'undefined') return null;
  const cacheKey = `${weaponId}|${variant}`;
  const cached = ICON_CACHE.get(cacheKey);
  if (cached) return cached;

  if (_weaponSheetImg && _weaponSheetFrames) {
    const fName = variant === 'relic' ? weaponId : (`hud_${weaponId}`);
    const fr = _weaponSheetFrames[fName] || _weaponSheetFrames[weaponId];
    if (fr) {
      const box = variant === 'relic' ? 32 : 20;
      const c = document.createElement('canvas');
      c.width = Math.max(box, fr.w);
      c.height = Math.max(box, fr.h);
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      const dx = Math.floor((c.width - fr.w) * 0.5);
      const dy = Math.floor((c.height - fr.h) * 0.5);
      g.drawImage(_weaponSheetImg, fr.x, fr.y, fr.w, fr.h, dx, dy, fr.w, fr.h);
      ICON_CACHE.set(cacheKey, c);
      return c;
    }
  }

  const c = document.createElement('canvas');
  c.width = 20;
  c.height = 20;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;

  const px = (x, y, col, pw = 1, ph = 1) => {
    g.fillStyle = col;
    g.fillRect(x, y, pw, ph);
  };
  const bCol = w.bladeColor || '#dce8ff';
  const tCol = w.trimColor || '#ffd27a';
  const eCol = w.element && ELEMENT_META[w.element] ? ELEMENT_META[w.element].color : null;
  const out = '#120e1c';

  // Dark silhouette pass helper: draw interior then 1px outline around non-transparent texels
  switch (w.shape) {
    case 'whip':
      px(3, 14, '#6b4a2b', 3, 4);
      px(5, 12, tCol, 2, 2);
      px(6, 6, bCol, 8, 2);
      px(13, 8, bCol, 3, 5);
      px(8, 12, bCol, 5, 2);
      px(7, 10, '#fff4c8', 2, 2);
      break;
    case 'rapier':
      // Diagonal needle blade from bottom-left hilt to top-right tip
      for (let i = 0; i < 12; i++) px(5 + i, 14 - i, i > 9 ? '#ffffff' : bCol, 1, 1);
      px(3, 14, tCol, 5, 2);
      px(4, 12, tCol, 2, 4);
      px(2, 16, '#6b4a2b', 2, 2);
      break;
    case 'katana':
      for (let i = 0; i < 12; i++) {
        const y = 15 - i - (i > 7 ? 1 : 0);
        px(5 + i, y, bCol, 2, 1);
      }
      px(4, 14, tCol, 4, 2);
      px(2, 16, '#4a2848', 3, 2);
      break;
    case 'sword':
    case 'scimitar':
      for (let i = 0; i < 10; i++) {
        const curve = w.shape === 'scimitar' && i > 5 ? 1 : 0;
        px(6 + i, 13 - i - curve, bCol, 2, 2);
        px(6 + i, 13 - i - curve, '#ffffff', 1, 1);
      }
      px(4, 12, tCol, 5, 2);
      px(5, 11, tCol, 2, 5);
      px(3, 15, '#6b4a2b', 3, 3);
      break;
    case 'mace':
      for (let i = 0; i < 8; i++) px(4 + i, 15 - i, '#7a6248', 2, 2);
      px(10, 4, bCol, 6, 6);
      px(12, 2, tCol, 2, 10);
      px(8, 6, tCol, 10, 2);
      px(12, 6, '#ffffff', 2, 2);
      break;
    case 'greatsword':
      for (let i = 0; i < 13; i++) {
        px(5 + i, 14 - i, bCol, 3, 2);
        px(5 + i, 14 - i, '#ffffff', 1, 1);
      }
      px(3, 12, tCol, 6, 2);
      px(5, 10, tCol, 2, 6);
      px(2, 16, '#5c3a28', 3, 3);
      break;
    case 'hammer':
      for (let i = 0; i < 11; i++) px(3 + i, 16 - i, '#7a5234', 2, 2);
      px(9, 2, bCol, 8, 6);
      px(10, 3, tCol, 6, 2);
      px(11, 7, bCol, 6, 4);
      break;
    case 'scythe':
      for (let i = 0; i < 13; i++) px(3 + i, 16 - i, '#6a4878', 2, 1);
      px(8, 3, bCol, 9, 2);
      px(14, 5, bCol, 3, 5);
      px(15, 10, tCol, 2, 3);
      px(9, 3, '#ffffff', 6, 1);
      break;
    case 'fist':
      px(4, 6, bCol, 10, 8);
      px(5, 5, tCol, 9, 2);
      px(14, 6, '#ffffff', 3, 2);
      px(14, 9, '#ffffff', 3, 2);
      px(14, 12, '#ffffff', 2, 2);
      px(6, 9, '#2a2238', 4, 3);
      break;
    case 'chakram':
      px(5, 3, bCol, 10, 2);
      px(5, 15, bCol, 10, 2);
      px(3, 5, bCol, 2, 10);
      px(15, 5, bCol, 2, 10);
      px(9, 1, tCol, 2, 3);
      px(9, 16, tCol, 2, 3);
      px(1, 9, tCol, 3, 2);
      px(16, 9, tCol, 3, 2);
      break;
    case 'buckler':
      px(5, 4, bCol, 10, 12);
      px(6, 3, tCol, 8, 2);
      px(6, 15, tCol, 8, 2);
      px(8, 8, tCol, 4, 4);
      px(9, 9, '#ffffff', 2, 2);
      break;
    case 'shield':
      px(4, 3, tCol, 12, 2);
      px(4, 5, bCol, 12, 8);
      px(6, 13, bCol, 8, 3);
      px(8, 16, tCol, 4, 2);
      px(9, 5, tCol, 2, 9);
      px(6, 8, tCol, 8, 2);
      break;
    case 'tome':
      px(4, 3, bCol, 12, 14);
      px(6, 4, '#f4efe0', 9, 12);
      px(7, 5, bCol, 7, 10);
      px(9, 7, tCol, 3, 5);
      px(10, 8, '#ffffff', 1, 3);
      break;
    default:
      px(5, 5, bCol, 10, 10);
      break;
  }

  if (eCol) {
    px(15, 15, eCol, 2, 2);
  }

  // Crisp 1px dark outline pass around painted pixels
  try {
    const src = g.getImageData(0, 0, 20, 20);
    const outData = g.createImageData(20, 20);
    const sd = src.data;
    const od = outData.data;
    od.set(sd);
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        const idx = (y * 20 + x) * 4;
        if (sd[idx + 3] > 0) continue;
        let adj = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < 20 && ny >= 0 && ny < 20 && sd[(ny * 20 + nx) * 4 + 3] > 0) {
            adj = true;
            break;
          }
        }
        if (adj) {
          od[idx] = 18;
          od[idx + 1] = 14;
          od[idx + 2] = 28;
          od[idx + 3] = 240;
        }
      }
    }
    g.putImageData(outData, 0, 0);
  } catch {
    void out;
  }

  ICON_CACHE.set(cacheKey, c);
  return c;
}

const BLADE_CACHE = new Map();

/**
 * Measured sword-hand grip offsets `(dx, dy)` relative to the hunter's foot
 * anchor `(sx, sy)` when facing right (`facing = +1`), matching `hero_sword`
 * and `hero_csword` pixel frames one-for-one.
 */
const SWORD_HAND_ANCHORS = {
  slash0: [-8, -68],
  slash1: [27, -49],
  slash2: [20, -29],
  thrust0: [15, -46],
  thrust1: [42, -47],
  heavy0: [1, -69],
  heavy1: [16, -21],
  alt0: [-8, -65],
  alt1: [25, -49],
  airslash: [22, -49],
  cslash0: [-9, -22],
  cslash1: [16, -34],
  cslash2: [22, -29],
};

/**
 * Generates and caches a crisp, full-scale pixel-art in-hand weapon sprite
 * pointing along `+X` from its grip point `(gx, gy)`, with pommel, crossguard,
 * metallic fuller, specular steel edge, elemental runes, and 1px dark outline.
 */
export function getWeaponBladeCanvas(weaponId) {
  if (typeof document === 'undefined') return null;
  if (BLADE_CACHE.has(weaponId)) return BLADE_CACHE.get(weaponId);

  const w = WEAPONS[weaponId];
  if (!w) return null;

  if (_weaponSheetImg && _weaponSheetFrames && _weaponSheetFrames[`blade_${weaponId}`]) {
    const fr = _weaponSheetFrames[`blade_${weaponId}`];
    const c = document.createElement('canvas');
    c.width = fr.w;
    c.height = fr.h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(_weaponSheetImg, fr.x, fr.y, fr.w, fr.h, 0, 0, fr.w, fr.h);
    const out = {
      canvas: c,
      gx: typeof fr.ax === 'number' ? fr.ax : Math.round(fr.w * 0.2),
      gy: typeof fr.ay === 'number' ? fr.ay : Math.round(fr.h * 0.5),
      w: fr.w,
      h: fr.h,
    };
    BLADE_CACHE.set(weaponId, out);
    return out;
  }

  let cw = 46, ch = 15, gx = 8, gy = 7;
  if (w.shape === 'rapier' || w.shape === 'katana') {
    cw = 50; ch = 13; gx = 9; gy = 6;
  } else if (w.shape === 'scimitar' || w.shape === 'mace') {
    cw = 46; ch = 17; gx = 8; gy = 8;
  } else if (w.shape === 'greatsword') {
    cw = 68; ch = 21; gx = 12; gy = 10;
  } else if (w.shape === 'hammer') {
    cw = 62; ch = 25; gx = 12; gy = 12;
  } else if (w.shape === 'scythe') {
    cw = 66; ch = 29; gx = 12; gy = 11;
  } else {
    BLADE_CACHE.set(weaponId, null);
    return null;
  }

  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;

  const bCol = w.bladeColor || '#dce4f2';
  const tCol = w.trimColor || '#ffd27a';
  const eCol = w.element && ELEMENT_META[w.element] ? ELEMENT_META[w.element].color : null;
  const px = (x, y, col, rw = 1, rh = 1) => {
    g.fillStyle = col;
    g.fillRect(x | 0, y | 0, rw | 0, rh | 0);
  };

  switch (w.shape) {
    case 'rapier': {
      // Pommel + leather grip + swept basket guard + slender needle estoc blade
      px(2, gy - 1, tCol, 2, 3);
      px(4, gy, '#5c3c28', 5, 2);
      px(8, gy - 4, tCol, 2, 9);
      px(6, gy - 3, tCol, 3, 1);
      px(6, gy + 3, tCol, 3, 1);
      px(10, gy - 1, bCol, 34, 3);
      px(10, gy - 1, '#ffffff', 36, 1);
      px(44, gy, '#ffffff', 4, 1);
      if (eCol) px(12, gy, eCol, 18, 1);
      break;
    }
    case 'katana': {
      // Wrapped tsuka + round tsuba + gently curved single-edged storm katana
      px(2, gy, tCol, 2, 2);
      px(4, gy, '#2b2438', 5, 2);
      px(5, gy, tCol, 1, 1);
      px(7, gy + 1, tCol, 1, 1);
      px(9, gy - 3, tCol, 2, 8);
      for (let i = 0; i < 36; i++) {
        const lift = i > 20 ? (i > 30 ? 2 : 1) : 0;
        const by = gy - lift;
        px(11 + i, by, bCol, 1, 2);
        px(11 + i, by - 1, '#ffffff', 1, 1);
        if (eCol && (i % 5 === 1) && i < 30) px(11 + i, by, eCol, 2, 1);
      }
      px(47, gy - 2, '#ffffff', 2, 1);
      break;
    }
    case 'sword': {
      // Heavy pommel + grip + flared Gothic crossguard + broad fuller steel blade
      px(2, gy - 1, tCol, 3, 3);
      px(5, gy - 1, '#5c3a24', 4, 3);
      px(9, gy - 5, tCol, 2, 11);
      px(8, gy - 6, tCol, 2, 2);
      px(8, gy + 5, tCol, 2, 2);
      px(11, gy - 2, bCol, 29, 5);
      px(11, gy - 2, '#ffffff', 31, 1);
      px(12, gy, '#6e7b94', 22, 1);
      if (eCol) px(13, gy, eCol, 16, 1);
      px(40, gy - 1, bCol, 3, 3);
      px(42, gy, '#ffffff', 3, 1);
      break;
    }
    case 'scimitar': {
      // Curved talwar hilt + sweeping flame-bellied shamshir blade
      px(2, gy, tCol, 3, 3);
      px(5, gy, '#5e3422', 4, 2);
      px(9, gy - 4, tCol, 2, 9);
      for (let i = 0; i < 32; i++) {
        const curve = i > 14 ? Math.floor((i - 14) / 5) : 0;
        const thick = i > 16 && i < 28 ? 5 : 4;
        const by = gy - 1 - curve;
        px(11 + i, by, bCol, 1, thick);
        px(11 + i, by, '#ffffff', 1, 1);
        if (eCol && i > 4 && i < 28) px(11 + i, by + thick - 1, eCol, 1, 1);
      }
      px(43, gy - 5, '#ffffff', 2, 2);
      break;
    }
    case 'mace': {
      // Iron-shod haft + consecrated 6-flanged heavy mace head
      px(2, gy, tCol, 2, 2);
      px(4, gy - 1, '#6a4e35', 22, 3);
      px(12, gy - 1, tCol, 2, 3);
      px(25, gy - 2, tCol, 2, 5);
      px(27, gy - 5, bCol, 10, 11);
      px(29, gy - 7, tCol, 6, 15);
      px(25, gy - 1, tCol, 14, 3);
      px(28, gy - 4, '#ffffff', 6, 2);
      if (eCol) px(30, gy - 1, eCol, 4, 3);
      break;
    }
    case 'greatsword': {
      // 2H pommel + long two-hand grip + wide crossguard + ricasso + parrying lugs + colossal blade
      px(2, gy - 2, tCol, 3, 4);
      px(5, gy - 1, '#4f311f', 8, 3);
      px(8, gy - 1, tCol, 1, 3);
      px(13, gy - 8, tCol, 3, 16);
      px(12, gy - 9, tCol, 2, 2);
      px(12, gy + 7, tCol, 2, 2);
      // Leather-wrapped ricasso + side lugs
      px(16, gy - 2, '#3c2b28', 6, 4);
      px(22, gy - 5, tCol, 2, 10);
      // Broad steel blade with deep central fuller
      px(24, gy - 3, bCol, 36, 6);
      px(24, gy - 3, '#ffffff', 38, 1);
      px(25, gy - 1, '#6d7a94', 28, 2);
      if (eCol) px(26, gy - 1, eCol, 24, 1);
      px(60, gy - 2, bCol, 4, 4);
      px(63, gy - 1, '#ffffff', 3, 2);
      break;
    }
    case 'hammer': {
      // Long 2H war-haft + colossal volcanic obsidian maul head with glowing fissures
      px(2, gy - 1, tCol, 3, 3);
      px(5, gy - 1, '#664329', 36, 3);
      px(15, gy - 1, tCol, 2, 3);
      px(28, gy - 1, tCol, 2, 3);
      px(39, gy - 3, tCol, 3, 7);
      // Massive hammer block + rear spike
      px(41, gy - 9, bCol, 16, 19);
      px(43, gy - 10, bCol, 12, 21);
      px(42, gy - 8, '#8a7e99', 13, 2);
      px(42, gy - 6, tCol, 2, 13);
      px(54, gy - 6, tCol, 2, 13);
      if (eCol) {
        px(46, gy - 5, eCol, 6, 2);
        px(48, gy - 3, '#ffffff', 2, 6);
        px(46, gy + 3, eCol, 6, 2);
      }
      break;
    }
    case 'scythe': {
      // Long curved Voidreaver snath + sweeping crescent reaper blade curving downward (+Y)
      px(2, gy - 1, tCol, 3, 3);
      for (let i = 0; i < 44; i++) {
        const bend = i > 18 && i < 34 ? -1 : 0;
        px(5 + i, gy - 1 + bend, '#5b3f6e', 2, 3);
      }
      px(46, gy - 3, tCol, 5, 6);
      // Sweeping downward crescent reaper blade from socket (48, gy) down to (34, gy + 16)
      for (let i = 0; i < 20; i++) {
        const bx = 49 + Math.round(Math.sin((i / 19) * Math.PI * 0.72) * 12) - Math.floor(i * 0.45);
        const by = gy - 2 + i;
        const bw = Math.max(2, 6 - Math.floor(i / 4));
        px(bx, by, bCol, bw, 2);
        px(bx + bw - 1, by, '#ffffff', 1, 2);
        if (eCol && i < 16) px(bx, by, eCol, 1, 1);
      }
      break;
    }
    default:
      break;
  }

  // Crisp 1px dark outline pass so the blade reads cleanly over both bright & dark stone
  try {
    const src = g.getImageData(0, 0, cw, ch);
    const outData = g.createImageData(cw, ch);
    const sd = src.data;
    const od = outData.data;
    od.set(sd);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const idx = (y * cw + x) * 4;
        if (sd[idx + 3] > 0) continue;
        let adj = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < cw && ny >= 0 && ny < ch && sd[(ny * cw + nx) * 4 + 3] > 0) {
            adj = true;
            break;
          }
        }
        if (adj) {
          od[idx] = 16;
          od[idx + 1] = 12;
          od[idx + 2] = 26;
          od[idx + 3] = 242;
        }
      }
    }
    g.putImageData(outData, 0, 0);
  } catch {
    /* ignore tainted / mock canvas */
  }

  const entry = { canvas: c, gx, gy, w: cw, h: ch };
  BLADE_CACHE.set(weaponId, entry);
  return entry;
}

/**
 * Draws a tapered crescent slash ribbon in local right-facing coordinates (`facing` mirrored outside)
 * between `a0` and `a1` radians around `(cx, cy)` with outer radius `rOuter` and inner radius `rInner`.
 */
function drawCrescentRibbon(ctx, cx, cy, rOuter, rInner, a0, a1, rimHex, midHex, coreHex, alpha = 1) {
  if (alpha <= 0.02 || Math.abs(a1 - a0) < 0.05) return;
  ctx.save();
  ctx.globalAlpha *= alpha;

  // Outer elemental / steel aura crescent
  ctx.fillStyle = rimHex;
  ctx.beginPath();
  ctx.arc(cx, cy, rOuter, a0, a1, false);
  ctx.arc(cx, cy, rInner, a1, a0, true);
  ctx.closePath();
  ctx.fill();

  // Mid bright blade wake concentrated toward the leading edge `a1`
  const aMid = a0 + (a1 - a0) * 0.28;
  ctx.fillStyle = midHex;
  ctx.beginPath();
  ctx.arc(cx, cy, rOuter - 1.5, aMid, a1, false);
  ctx.arc(cx, cy, rInner + (rOuter - rInner) * 0.36, a1, aMid, true);
  ctx.closePath();
  ctx.fill();

  // Razor-white specular leading edge
  const aTip = a0 + (a1 - a0) * 0.56;
  ctx.strokeStyle = coreHex;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, rOuter - 1, aTip, a1, false);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws an active Hand_L or Hand_R sword slash, fencing thrust, 2H heavy cleave,
 * fist blitz, held shield guard, or arcane catalyst focus around the hunter (`sx, sy` feet),
 * anchored directly to the hunter's martial `poseName` fist coordinates.
 */
export function drawWeaponAction(ctx, slotExec, sx, sy, facing, crouch, fxLayers = null, time = 0, poseName = null) {
  if (!slotExec || !slotExec.weapon) return;
  const w = slotExec.weapon;
  if (w.category === 'whip') return; // Drawn via procedural lash in hero_anim / Player.draw

  const dur = Math.max(0.05, slotExec.duration || w.duration || 0.3);
  const k = Math.max(0, Math.min(1, slotExec.timer / dur));
  const anchor = (poseName && SWORD_HAND_ANCHORS[poseName]) || null;
  const handX = sx + facing * (anchor ? anchor[0] : 10);
  const handY = sy + (anchor ? anchor[1] : -(crouch ? 26 : 44)) + (slotExec.slot === 1 ? 2 : 0);

  const elem = w.element ? ELEMENT_META[w.element] : null;
  const coreRgb = elem ? elem.core : [0.95, 0.97, 1.0];
  const rimRgb = elem ? elem.rim : (w.physical === 'blunt' ? [0.95, 0.72, 0.34] : [0.58, 0.76, 1.0]);
  const accentHex = elem ? elem.color : (w.bladeColor || '#dce8ff');
  const rimHex = elem ? elem.color : (w.physical === 'blunt' ? '#e8a852' : '#78a8e8');
  const icon = getWeaponIconCanvas(w.id, 'relic');
  const blade = getWeaponBladeCanvas(w.id);

  ctx.save();
  if (w.category === 'shield' && slotExec.guarding && slotExec.timer >= dur * 0.85) {
    // Raised active shield guard in front of torso
    const gx = Math.round(sx + facing * 14);
    const gy = Math.round(sy - (crouch ? 23 : 38));
    ctx.globalAlpha = 0.96;
    if (icon) {
      ctx.translate(gx, gy);
      if (facing < 0) ctx.scale(-1, 1);
      ctx.drawImage(icon, -13, -13, 26, 26);
    }
    ctx.restore();
    if (fxLayers && fxLayers.enabled) {
      fxLayers.addAttack({
        x: gx + facing * 3, y: gy, rx: 10, ry: 16, dirX: facing, dirY: 0,
        mode: 3, seed: slotExec.slot + 0.3, core: coreRgb, rim: rimRgb,
        alpha: 0.36 + 0.12 * Math.sin(time * 9),
      });
    }
    return;
  }

  switch (w.category) {
    case 'light_blade': {
      // Nimble fencing thrust: chambered coil (`thrust0`) -> deep lunging needle (`thrust1`) -> snap recovery
      const ext = k < 0.22
        ? (k / 0.22) * 0.25
        : (k < 0.56 ? 0.25 + ((k - 0.22) / 0.34) * 0.75 : Math.max(0.15, 1 - (k - 0.56) / 0.44));
      const reach = slotExec.reach || w.reach || 62;
      // Keep tip aligned with the combat thrust hitbox while anchored cleanly to the lunging fist
      const gripPush = poseName === 'thrust1' ? Math.round((ext - 0.85) * 8) : Math.round(ext * 10);
      const gx = Math.round(handX + facing * gripPush);
      const gy = Math.round(handY);
      const bladeLen = blade ? (blade.w - blade.gx) : 38;
      const tipX = gx + facing * bladeLen;

      if (fxLayers && fxLayers.enabled && k >= 0.16 && k <= 0.82) {
        fxLayers.addAttack({
          x: sx + facing * (12 + reach * 0.55), y: gy,
          rx: reach * 0.62, ry: slotExec.isSkill ? 9 : 5.5,
          dirX: facing, dirY: 0, mode: 1, seed: k * 3.1,
          core: coreRgb, rim: rimRgb, alpha: 0.86 * ext,
        });
      }

      // Crisp horizontal fencing speed-streaks & needle piercing wake (or Zephyr Wind-Blade multi-crescent storm!)
      if (w.windFlurry && k >= 0.08 && k <= 0.94) {
        ctx.save();
        ctx.translate(Math.round(sx + facing * 12), Math.round(gy));
        if (facing < 0) ctx.scale(-1, 1);
        for (let wi = 0; wi < 4; wi++) {
          const ph = ((k * 3.4 + wi * 0.25) % 1);
          const rOut = 26 + wi * 12 + ph * 8;
          const a0 = -0.95 + wi * 0.16 - ph * 0.22;
          const a1 = a0 + 1.35;
          drawCrescentRibbon(
            ctx,
            Math.round(wi * 4),
            Math.round((wi - 1.5) * 3),
            rOut,
            rOut * 0.66,
            a0,
            a1,
            '#38d8ff',
            '#aefbff',
            '#ffffff',
            0.78 * (1 - Math.abs(ph - 0.5) * 1.1),
          );
        }
        ctx.restore();
      } else if (k >= 0.18 && k <= 0.80) {
        const streakA = Math.min(1, ext * 1.15);
        ctx.save();
        ctx.globalAlpha = 0.75 * streakA;
        ctx.fillStyle = rimHex;
        const x0 = Math.round(sx + facing * 10);
        const span = Math.round((tipX - x0));
        ctx.fillRect(Math.min(x0, x0 + span), gy - 4, Math.abs(span), 1);
        ctx.fillRect(Math.min(x0, x0 + span) + (facing > 0 ? 8 : 0), gy + 4, Math.max(6, Math.abs(span) - 8), 1);
        ctx.globalAlpha = 0.95 * streakA;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.min(x0, tipX), gy - 1, Math.abs(tipX - x0), slotExec.isSkill ? 3 : 2);
        // 4-point specular star glint at needle point during peak lunge
        if (k >= 0.22 && k <= 0.62) {
          const tx = Math.round(tipX);
          ctx.fillRect(tx - 4, gy, 9, 1);
          ctx.fillRect(tx, gy - 4, 1, 9);
          ctx.fillStyle = accentHex;
          ctx.fillRect(tx - 1, gy - 1, 3, 3);
        }
        ctx.restore();
      }

      // Full-scale pixel-art rapier / katana gripped in the hunter's fist
      ctx.save();
      ctx.translate(gx, gy);
      if (facing < 0) ctx.scale(-1, 1);
      const tilt = k < 0.22 ? -0.10 : (k > 0.78 ? 0.08 : 0);
      if (tilt) ctx.rotate(tilt);
      if (blade) {
        ctx.drawImage(blade.canvas, -blade.gx, -blade.gy);
      } else if (icon) {
        ctx.rotate(Math.PI / 4);
        ctx.drawImage(icon, -10, -10);
      }
      ctx.restore();
      break;
    }

    case 'standard_blade': {
      // 1H Martial Sword / Scimitar / Mace: cocked overhead (`slash0`) -> sweeping forward cut (`slash1`) -> low follow-through (`slash2`)
      let ang;
      if (k < 0.26) {
        const u = k / 0.26;
        ang = -2.35 + u * 0.45; // cocked back above shoulder
      } else if (k < 0.66) {
        const u = (k - 0.26) / 0.40;
        ang = -1.35 + u * 1.72; // rapid overhead-to-waist cut
      } else {
        const u = (k - 0.66) / 0.34;
        ang = 0.37 + u * 0.42;  // low diagonal follow-through
      }

      const r = (slotExec.reach || w.reach || 58) * (slotExec.isSkill ? 1.05 : 0.96);
      const pivotX = sx + facing * (crouch ? 10 : 12);
      const pivotY = sy - (crouch ? 28 : 44);

      // Layered pixel/canvas crescent slash ribbon during active cut
      if (k >= 0.20 && k <= 0.80) {
        const arcK = Math.min(1, (k - 0.20) / 0.48);
        const fade = k > 0.62 ? Math.max(0, 1 - (k - 0.62) / 0.18) : 1;
        const aStart = -1.68 + Math.max(0, arcK - 0.58) * 1.35;
        const aEnd = -1.42 + arcK * 2.18;

        ctx.save();
        ctx.translate(Math.round(pivotX), Math.round(pivotY));
        if (facing < 0) ctx.scale(-1, 1);
        drawCrescentRibbon(
          ctx, 0, 0,
          r * 0.94, r * (slotExec.isSkill ? 0.52 : 0.64),
          aStart, aEnd,
          rimHex, accentHex, '#ffffff',
          0.86 * fade,
        );
        ctx.restore();

        if (fxLayers && fxLayers.enabled) {
          fxLayers.addAttack({
            x: pivotX + facing * r * 0.52, y: pivotY,
            rx: r * 0.64, ry: r * 0.58,
            dirX: facing, dirY: 0.22, mode: 3, seed: slotExec.slot * 1.7 + 0.4,
            core: coreRgb, rim: rimRgb, alpha: 0.68 * fade,
          });
        }
      }

      // Full-scale pixel-art broadsword / scimitar / mace anchored to the hunter's fist
      ctx.save();
      ctx.translate(Math.round(handX), Math.round(handY));
      if (facing < 0) ctx.scale(-1, 1);
      ctx.rotate(ang);
      if (blade) {
        ctx.drawImage(blade.canvas, -blade.gx, -blade.gy);
      } else if (icon) {
        ctx.rotate(Math.PI / 4);
        ctx.drawImage(icon, -4, -18, 22, 22);
      }
      ctx.restore();
      break;
    }

    case 'heavy_blade': {
      // 2H Colossal Greatsword / Warhammer / Scythe: high 2H heave (`heavy0`) -> sweeping 195° cleave (`slash1`) -> floor slam (`heavy1`)
      let ang;
      if (k < 0.28) {
        const u = k / 0.28;
        ang = -2.58 + u * 0.36; // heavy wind-up behind head
      } else if (k < 0.62) {
        const u = (k - 0.28) / 0.34;
        ang = -2.22 + u * 2.68; // massive 195° overhead-to-floor cleave
      } else {
        const u = (k - 0.62) / 0.38;
        ang = 0.46 + Math.min(0.14, u * 0.18); // weighty ground-planted recovery
      }

      const r = (slotExec.reach || w.reach || 96) * 0.96;
      const pivotX = sx + facing * 8;
      const pivotY = sy - 38;

      if (k >= 0.24 && k <= 0.82) {
        const cleaveK = Math.min(1, (k - 0.24) / 0.38);
        const fade = k > 0.60 ? Math.max(0, 1 - (k - 0.60) / 0.22) : 1;
        const aStart = -2.35 + Math.max(0, cleaveK - 0.65) * 1.45;
        const aEnd = -2.10 + cleaveK * 2.72;

        ctx.save();
        ctx.translate(Math.round(pivotX), Math.round(pivotY));
        if (facing < 0) ctx.scale(-1, 1);
        drawCrescentRibbon(
          ctx, 0, 0,
          r * 0.98, r * 0.50,
          aStart, aEnd,
          rimHex, accentHex, '#ffffff',
          0.92 * fade,
        );
        ctx.restore();

        if (fxLayers && fxLayers.enabled) {
          fxLayers.addAttack({
            x: sx + facing * r * 0.44, y: sy - 36,
            rx: r * 0.84, ry: r * 0.74,
            dirX: facing, dirY: 0.28, mode: 3, seed: 2.3,
            core: coreRgb, rim: rimRgb, alpha: 0.78 * fade,
          });
        }
      }

      // Colossal 64px 2H weapon gripped in the hunter's two-handed pose
      ctx.save();
      ctx.translate(Math.round(handX), Math.round(handY));
      if (facing < 0) ctx.scale(-1, 1);
      ctx.rotate(ang);
      if (blade) {
        ctx.drawImage(blade.canvas, -blade.gx, -blade.gy);
      } else if (icon) {
        ctx.rotate(Math.PI / 4);
        ctx.drawImage(icon, -4, -28, 30, 30);
      }
      ctx.restore();
      break;
    }

    case 'brawler': {
      // Rapid multi-hit horizontal punch/claw streaks + armored gauntlet sprite
      const reach = slotExec.reach || w.reach;
      const jab = Math.sin(((k * 2) % 1) * Math.PI) * Math.min(18, reach * 0.48);
      if (icon) {
        ctx.save();
        ctx.translate(Math.round(handX + facing * (6 + jab)), Math.round(handY + 1));
        if (facing < 0) ctx.scale(-1, 1);
        ctx.drawImage(icon, -11, -11, 22, 22);
        ctx.restore();
      }
      for (let i = 0; i < 3; i++) {
        const phase = ((k * 3 + i * 0.33) % 1);
        const px0 = handX + facing * (2 + phase * Math.max(18, reach * 0.75));
        const py0 = handY - 5 + i * 5;
        ctx.fillStyle = i === 1 ? '#ffffff' : accentHex;
        ctx.fillRect(Math.round(px0 - (facing > 0 ? 11 : 0)), Math.round(py0), 11, 2);
      }
      if (fxLayers && fxLayers.enabled) {
        fxLayers.addAttack({
          x: handX + facing * reach * 0.45, y: handY, rx: reach * 0.55, ry: 11,
          dirX: facing, dirY: 0, mode: 1, seed: k * 7.1, core: coreRgb, rim: rimRgb, alpha: 0.78,
        });
      }
      break;
    }

    case 'shield': {
      // Crisp shield bash thrust
      const push = Math.sin(k * Math.PI) * 14;
      const gx = Math.round(handX + facing * push);
      const gy = Math.round(handY + 3);
      if (icon) {
        ctx.translate(gx, gy);
        if (facing < 0) ctx.scale(-1, 1);
        ctx.drawImage(icon, -13, -13, 26, 26);
      }
      break;
    }

    case 'catalyst': {
      // Raised glowing tome / focus orb / Helios Solar Beam rod at extended cast hand
      const gx = Math.round(handX + facing * 5);
      const gy = Math.round(handY - Math.sin(k * Math.PI) * 4);
      if (w.laserBeam && k >= 0.10 && k <= 0.88) {
        const beamLen = slotExec.reach || w.reach || 225;
        const beamA = k < 0.22 ? (k - 0.10) / 0.12 : Math.max(0, 1 - (k - 0.58) / 0.30);
        const beamH = (slotExec.isSkill ? 14 : 9) * Math.max(0.35, beamA);
        const bx0 = facing > 0 ? gx + 8 : gx - 8 - beamLen;
        ctx.save();
        ctx.globalAlpha = Math.min(1, beamA * 0.92);
        ctx.fillStyle = '#ff7a1f';
        ctx.fillRect(bx0, Math.round(gy - beamH), beamLen, Math.round(beamH * 2));
        ctx.fillStyle = '#ffe878';
        ctx.fillRect(bx0, Math.round(gy - beamH * 0.58), beamLen, Math.max(2, Math.round(beamH * 1.16)));
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(bx0, Math.round(gy - Math.max(1, beamH * 0.25)), beamLen, Math.max(2, Math.round(beamH * 0.5)));
        ctx.restore();
        if (fxLayers && fxLayers.enabled) {
          fxLayers.addAttack({
            x: gx + facing * (beamLen * 0.5), y: gy, rx: beamLen * 0.52, ry: beamH * 1.35,
            dirX: facing, dirY: 0, mode: 1, seed: time * 3.1,
            core: [1.0, 0.99, 0.88], rim: [1.0, 0.48, 0.12], alpha: 0.88 * Math.min(1, beamA),
          });
        }
      } else if (fxLayers && fxLayers.enabled) {
        fxLayers.addAttack({
          x: gx + facing * 4, y: gy, rx: 13, ry: 13, dirX: facing, dirY: 0,
          mode: 0, seed: time, core: coreRgb, rim: rimRgb, alpha: 0.85 * (1 - k * 0.5),
        });
      }
      if (blade && w.laserBeam) {
        ctx.translate(gx, gy);
        if (facing < 0) ctx.scale(-1, 1);
        ctx.drawImage(blade.canvas, -blade.gx, -blade.gy);
      } else if (icon) {
        ctx.translate(gx, gy);
        if (facing < 0) ctx.scale(-1, 1);
        ctx.drawImage(icon, -12, -12, 24, 24);
      }
      break;
    }

    default:
      break;
  }
  ctx.restore();
}
