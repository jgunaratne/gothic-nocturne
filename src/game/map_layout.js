// Pure 2D Spatial Topology for the 72 x 27 Castle Exploration Grid.
// Kept free of stage/renderer imports so both `castlemap.js` and `grid_composer.js`
// can import `MAP_ROOMS` and `MAP_DOORS` with zero circular module dependencies.

export const GRID_COLS = 72;
export const GRID_ROWS = 27;

function hRun(c0, c1, r) {
  const out = [];
  const step = c0 <= c1 ? 1 : -1;
  for (let c = c0; step > 0 ? c <= c1 : c >= c1; c += step) out.push([c, r]);
  return out;
}

function vRun(c, r0, r1) {
  const out = [];
  const step = r0 <= r1 ? 1 : -1;
  for (let r = r0; step > 0 ? r <= r1 : r >= r1; r += step) out.push([c, r]);
  return out;
}

function makeRoom(def) {
  const spineSeen = new Set();
  const spine = [];
  for (const [c, r] of def.spine) {
    const k = `${c},${r}`;
    if (!spineSeen.has(k)) { spineSeen.add(k); spine.push([c, r]); }
  }
  const extraRaw = def.bonusSecret ? [...def.extra, def.bonusSecret] : def.extra;
  const extra = [];
  const extraSeen = new Set(spineSeen);
  for (const [c, r] of extraRaw) {
    const k = `${c},${r}`;
    if (!extraSeen.has(k)) { extraSeen.add(k); extra.push([c, r]); }
  }
  return Object.assign({}, def, { spine, extra });
}

/**
 * Multi-cell 2D architectural room definitions on the 72 x 27 Castle Grid.
 * Every cell `[mc, mr]` corresponds 1:1 to a `20 x 5` tile (`640 x 160 px`) slice
 * in stage coordinates: moving right/left by 1 screen (`20` tiles) shifts `mc` by `±1`,
 * and moving down/up by 1 story (`5` tiles) shifts `mr` by `±1`.
 */
export const MAP_ROOMS = {
  // 1. GRAVEYARD & GREAT ENTRANCE HALL (cols 1..27, w=27 -> 540 tiles; rows 11..15)
  graveyard: makeRoom({
    where: 'GREAT STAIR & ENTRANCE',
    spine: [
      ...hRun(1, 3, 15),
      ...hRun(3, 5, 14),
      ...hRun(5, 8, 13),
      ...hRun(8, 27, 12),
    ],
    extra: [
      ...hRun(11, 18, 11),      // Walkable 2nd-story Grand Nave Clerestory Gallery
      [20, 11],                 // Isolated Night-Wings Balcony to Ramparts [20,10]
      [21, 11],                 // Isolated Night-Wings Balcony to Ballroom [21,10]
      [14, 13],                 // Isolated Sunken Entrance Crypt Secret [14,13] (below [14,12])
      ...hRun(16, 20, 13),      // East Undercroft (Alchemy [17,13], Arcade [20,13])
      [26, 11], [27, 11],       // 2x2 Boss Sanctum upper vault
    ],
    boss: [[26, 12], [27, 12], [26, 11], [27, 11]],
    sanctuary: [12, 12],
    warp: [19, 12],
    secret: [14, 13],
    bonusSecret: [15, 13],
    bonusSecretFrom: [16, 13],
    labelPos: [16.5, 12.0],
  }),

  // 2. THE DARKWOOD (cols 2..24, w=23 -> 460 tiles; rows 15..19)
  darkwood: makeRoom({
    where: 'ANCIENT WOODS',
    spine: [
      ...hRun(2, 6, 16),
      ...hRun(6, 14, 17),
      ...hRun(14, 24, 18),
    ],
    extra: [
      [4, 15], [5, 15],         // Mossy ravine descent from Graveyard [4,14]
      ...hRun(8, 11, 16),       // Elder-bough canopy walkway above forest stream
      [9, 18],                  // Isolated Sunken Hollow Root Secret [9,18] (below [9,17])
      [14, 19],                 // Creek Mouth gate to Aqueduct [15,19]
      [16, 17],                 // Hollow trunk rise to Alchemy [16,16]
      [23, 17], [24, 17],       // 2x2 Boss Sanctum upper canopy
    ],
    boss: [[23, 18], [24, 18], [23, 17], [24, 17]],
    sanctuary: [10, 17],
    warp: [18, 18],
    secret: [9, 18],
    bonusSecret: [12, 16],
    bonusSecretFrom: [11, 16],
    labelPos: [13.0, 17.5],
  }),

  // 3. JACK-O'-LANTERN WOODS (cols 1..19, w=19 -> 380 tiles; rows 8..12)
  jack: makeRoom({
    where: 'WEST CHAPEL WOODS',
    spine: [
      ...hRun(1, 4, 12),
      ...hRun(4, 7, 11),
      ...hRun(7, 11, 10),
      ...hRun(11, 19, 9),
    ],
    extra: [
      [6, 12],                  // South gatehouse porch from Graveyard [6,13]
      ...hRun(8, 10, 9),        // Belfry ridge above [8..10,10] (Yule [8,8])
      [10, 11],                 // Isolated Sunken Pumpkin Cellar Secret [10,11] (below [10,10])
      [12, 8], [13, 8],         // Autumn chapel loft (Ramparts [13,7])
      [18, 8], [19, 8],         // 2x2 Boss Sanctum upper nave
    ],
    boss: [[18, 9], [19, 9], [18, 8], [19, 8]],
    sanctuary: [8, 10],
    warp: [14, 9],
    secret: [10, 11],
    bonusSecret: [11, 8],
    bonusSecretFrom: [12, 8],
    labelPos: [10.0, 10.0],
  }),

  // 4. THE FROZEN YULE (cols 1..19, w=19 -> 380 tiles; rows 4..8)
  yule: makeRoom({
    where: 'FROZEN SPIRE',
    spine: [
      ...hRun(1, 6, 8),
      ...hRun(6, 10, 7),
      ...hRun(10, 12, 6),
      ...hRun(12, 19, 5),
    ],
    extra: [
      [8, 8],                   // Lantern bridge entry from Jack [8,9]
      [7, 6], [8, 6], [8, 5],   // Bell-tower ascent
      [8, 4],                   // Isolated Night-Wings Spire Balcony to Skykeep [8,3]
      [10, 8],                  // Isolated Sunken Ice Cellar Secret [10,8] (below [10,7])
      [18, 4], [19, 4],         // 2x2 Boss Sanctum upper spire
    ],
    boss: [[18, 5], [19, 5], [18, 4], [19, 4]],
    sanctuary: [7, 7],
    warp: [14, 5],
    secret: [10, 8],
    bonusSecret: [9, 5],
    bonusSecretFrom: [8, 5],
    labelPos: [10.0, 6.4],
  }),

  // 5. THE FLOATING GARDEN (`skykeep`: cols 5..25, w=21 -> 420 tiles; rows 0..3)
  skykeep: makeRoom({
    where: 'FLOATING GARDEN',
    icon: { sheet: 'wing_icons', frame: 'skykeep' },
    spine: [
      ...hRun(5, 11, 3),
      ...hRun(11, 17, 2),
      ...hRun(17, 25, 1),
    ],
    extra: [
      ...hRun(12, 15, 1),       // Upper astrolabe pavilion above [12..15,2]
      [14, 3],                  // Isolated Sunken Cloud-Well Secret [14,3] (below [14,2])
      [17, 3], [18, 3], [19, 3], // East sky-pier to Ramparts [20,3]
      [24, 0], [25, 0],         // 2x2 Boss Sanctum upper dome
    ],
    boss: [[24, 1], [25, 1], [24, 0], [25, 0]],
    sanctuary: [12, 2],
    warp: [20, 1],
    secret: [14, 3],
    bonusSecret: [16, 3],
    bonusSecretFrom: [17, 3],
    labelPos: [15.0, 2.0],
  }),

  // 6. THE RAMPARTS (cols 13..34, w=22 -> 440 tiles; rows 3..10)
  ramparts: makeRoom({
    where: 'WEST WING RAMPARTS',
    spine: [
      ...vRun(20, 10, 5),       // Central 6-story Watchtower ascent above Graveyard [20,11]
      ...hRun(21, 26, 5),
      ...hRun(26, 34, 4),
    ],
    extra: [
      ...hRun(13, 19, 7),       // West Barbican Walk connecting Jack [13,8] & Yule [12,6]
      [13, 6],                  // Upper barbican gate from Yule [12,6]
      [20, 4], [20, 3],         // Crown Watchtower turret touching Skykeep [19,3]
      [26, 3],                  // Isolated Night-Wings High Battlement Secret [26,3] (above [26,4])
      [28, 5],                  // East Murder-Hole parapet down to Coliseum [28,6]
      [33, 3], [34, 3],         // 2x2 Boss Sanctum upper turret
    ],
    boss: [[33, 4], [34, 4], [33, 3], [34, 3]],
    sanctuary: [22, 5],
    warp: [29, 4],
    secret: [26, 3],
    bonusSecret: [25, 4],
    bonusSecretFrom: [26, 4],
    labelPos: [26.0, 4.4],
  }),

  // 7. THE BLOOD COLISEUM (`coliseum`: cols 21..39, w=19 -> 380 tiles; rows 5..8)
  coliseum: makeRoom({
    where: 'WEST WING ARENA',
    icon: { sheet: 'wing_icons', frame: 'coliseum' },
    spine: [
      ...hRun(21, 27, 6),
      ...hRun(27, 39, 7),
    ],
    extra: [
      ...hRun(28, 33, 6),       // Upper Gladiator Tiers
      ...hRun(28, 30, 8),       // Subterranean Hypogeum Beast Cages (Ballroom [30,9])
      [32, 8],                  // Isolated Sunken Gladiator Vault Secret [32,8] (below [32,7])
      [33, 5],                  // Imperial Loggia up to Cathedral [34,5]
      [38, 6], [39, 6],         // 2x2 Boss Sanctum upper amphitheater
    ],
    boss: [[38, 7], [39, 7], [38, 6], [39, 6]],
    sanctuary: [27, 7],
    warp: [34, 7],
    secret: [32, 8],
    bonusSecret: [34, 6],
    bonusSecretFrom: [33, 6],
    labelPos: [31.5, 7.0],
  }),

  // 8. THE PHANTOM BALLROOM (`ballroom`: cols 21..39, w=19 -> 380 tiles; rows 9..10)
  ballroom: makeRoom({
    where: 'GRAND SALON',
    icon: { sheet: 'wing_icons', frame: 'ballroom' },
    spine: [
      ...hRun(21, 39, 10),
    ],
    extra: [
      [23, 9],                  // Isolated Night-Wings Opera Box Secret [23,9] (above [23,10])
      ...hRun(25, 27, 9),       // Walkable Musicians' Gallery
      ...hRun(29, 32, 9),       // East Chandelier Mezzanine (Coliseum [30,8])
      [38, 9], [39, 9],         // 2x2 Boss Sanctum upper ballroom dome
    ],
    boss: [[38, 10], [39, 10], [38, 9], [39, 9]],
    sanctuary: [28, 10],
    warp: [34, 10],
    secret: [23, 9],
    bonusSecret: [33, 9],
    bonusSecretFrom: [32, 9],
    labelPos: [30.0, 9.8],
  }),

  // 9. THE ALCHEMY LAB (`alchemy`: cols 16..34, w=19 -> 380 tiles; rows 14..18)
  alchemy: makeRoom({
    where: 'WEST LABORATORY',
    icon: { sheet: 'wing_icons', frame: 'alchemy' },
    spine: [
      ...hRun(16, 22, 14),
      ...hRun(22, 27, 15),
      ...hRun(27, 34, 16),
    ],
    extra: [
      [16, 15], [16, 16],       // West Reagent Lift from Darkwood [16,17]
      [24, 14],                 // Walkable Upper Gantry
      [26, 14],                 // Isolated Night-Wings Tesla Loft Secret [26,14] (above [26,15])
      [25, 16], [25, 17], [25, 18], // Vat Drainage Pit to Aqueduct [25,19]
      [28, 15], [28, 14],       // East Alembic Chimney to Arcade [28,13]
      [33, 15], [34, 15],       // 2x2 Boss Sanctum upper laboratory
    ],
    boss: [[33, 16], [34, 16], [33, 15], [34, 15]],
    sanctuary: [23, 15],
    warp: [29, 16],
    secret: [26, 14],
    bonusSecret: [24, 16],
    bonusSecretFrom: [25, 16],
    labelPos: [26.0, 15.3],
  }),

  // 10. THE SUNKEN AQUEDUCT (`aqueduct`: cols 15..34, w=20 -> 400 tiles; rows 18..22)
  aqueduct: makeRoom({
    where: 'FLOODED CISTERNS',
    icon: { sheet: 'wing_icons', frame: 'aqueduct' },
    spine: [
      ...hRun(15, 21, 19),
      ...hRun(21, 27, 20),
      ...hRun(27, 34, 21),
    ],
    extra: [
      [19, 20],                 // Isolated Sunken Cistern Secret [19,20] (below [19,19])
      ...hRun(22, 26, 19),      // Upper Sluiceway Deck (meets Alchemy [25,18])
      [26, 21], [26, 22],       // Spillway Shaft down to Dark Cave [26,23]
      [28, 20], [28, 19], [28, 18], // Lock-Gate Tower to Catacombs [29,18]
      [33, 20], [34, 20],       // 2x2 Boss Sanctum upper cistern
    ],
    boss: [[33, 21], [34, 21], [33, 20], [34, 20]],
    sanctuary: [22, 20],
    warp: [29, 21],
    secret: [19, 20],
    bonusSecret: [25, 21],
    bonusSecretFrom: [26, 21],
    labelPos: [24.5, 20.2],
  }),

  // 11. GRAND ARCADE (Central Spine #2: cols 21..51, w=31 -> 620 tiles; rows 10..14)
  arcade: makeRoom({
    where: 'CENTRAL COLONNADE',
    spine: [
      ...hRun(21, 28, 13),
      ...hRun(28, 36, 12),
      ...hRun(36, 45, 11),
      ...hRun(45, 51, 12),
    ],
    extra: [
      ...hRun(30, 34, 11),      // West Merchant Mezzanine (meets Ballroom [32,10])
      [35, 13], [35, 14],       // Charnel Stair down to Catacombs [35,15]
      [38, 12],                 // Isolated Sunken Merchant Vault Secret [38,12] (below [38,11])
      [40, 10],                 // Isolated Night-Wings Balcony to Cathedral [40,9]
      [44, 10],                 // Isolated Night-Wings Balcony to Library [44,9]
      [45, 13],                 // Outer-Wall Gatehouse to Clock Tower [46,13]
      [50, 11], [51, 11],       // 2x2 Boss Sanctum upper rotunda
    ],
    boss: [[50, 12], [51, 12], [50, 11], [51, 11]],
    sanctuary: [34, 12],
    warp: [42, 11],
    secret: [38, 12],
    bonusSecret: [29, 11],
    bonusSecretFrom: [30, 11],
    labelPos: [38.5, 11.8],
  }),

  // 12. THE CATHEDRAL (`cathedral`: cols 34..54, w=21 -> 420 tiles; rows 5..9)
  cathedral: makeRoom({
    where: 'ROYAL NAVE',
    spine: [
      ...hRun(40, 42, 9),
      ...hRun(42, 46, 8),
      ...hRun(46, 48, 7),
      ...hRun(48, 54, 6),
    ],
    extra: [
      ...hRun(34, 40, 5), [40, 6], [40, 7], [40, 8], // West Flying-Buttress Cloister & Bell-Tower
      ...hRun(43, 45, 7),       // Choir Triforium Gallery
      [44, 6],                  // Rood Landing
      [44, 5],                  // Isolated Night-Wings Balcony to Throne [44,4]
      [47, 6],                  // Organ Gallery
      [47, 5],                  // Isolated Night-Wings High Organ Loft Secret [47,5] (above [47,6])
      [48, 8],                  // South Transept Porch to Library [48,9]
      [53, 5], [54, 5],         // 2x2 Boss Sanctum upper rose-window vault
    ],
    boss: [[53, 6], [54, 6], [53, 5], [54, 5]],
    sanctuary: [43, 8],
    warp: [50, 6],
    secret: [47, 5],
    bonusSecret: [43, 6],
    bonusSecretFrom: [44, 6],
    labelPos: [46.5, 7.2],
  }),

  // 13. THE THRONE HALL (`throne`: cols 44..67, w=24 -> 480 tiles; rows 0..5)
  throne: makeRoom({
    where: 'SOVEREIGN KEEP',
    spine: [
      ...hRun(44, 49, 4),
      ...hRun(49, 55, 3),
      ...hRun(55, 61, 2),
      ...hRun(61, 67, 1),
    ],
    extra: [
      [50, 2], [51, 2],         // Walkable Royal Clerestory
      [53, 2],                  // Isolated Night-Wings Sovereign Reliquary Secret [53,2] (above [53,3])
      [57, 3], [57, 4], [57, 5], // Archivists' Spiral Stair down to Library [57,6]
      [61, 3],                  // East Battlement Postern to Clock Tower [62,3]
      [66, 0], [67, 0],         // 2x2 Count's Sanctum upper spire
    ],
    boss: [[66, 1], [67, 1], [66, 0], [67, 0]],
    sanctuary: [52, 3],
    warp: [59, 2],
    secret: [53, 2],
    bonusSecret: [56, 4],
    bonusSecretFrom: [57, 4],
    labelPos: [56.0, 2.2],
  }),

  // 14. THE FORBIDDEN LIBRARY (`library`: cols 43..63, w=21 -> 420 tiles; rows 6..9)
  library: makeRoom({
    where: 'EAST WING LIBRARY',
    spine: [
      ...hRun(43, 53, 9),
      ...hRun(53, 57, 8),
      ...hRun(57, 63, 7),
    ],
    extra: [
      ...hRun(54, 57, 7),       // 2nd-Tier Folio Balcony
      [55, 6],                  // Isolated Night-Wings Forbidden Folio Loft Secret [55,6] (above [55,7])
      [57, 6],                  // 3rd-Tier Celestial Scriptorium (Throne [57,5])
      ...hRun(54, 57, 9),       // Lower Reading Vaults (Clock Tower [57,10])
      [62, 6], [63, 6],         // 2x2 Boss Sanctum upper dome
    ],
    boss: [[62, 7], [63, 7], [62, 6], [63, 6]],
    sanctuary: [51, 9],
    warp: [59, 7],
    secret: [55, 6],
    bonusSecret: [52, 8],
    bonusSecretFrom: [53, 8],
    labelPos: [54.5, 8.0],
  }),

  // 15. THE CLOCK TOWER & OUTER WALL (`clocktower`: cols 46..70, w=25 -> 500 tiles; rows 1..15)
  clocktower: makeRoom({
    where: 'OUTER WALL & BELFRY',
    spine: [
      ...hRun(46, 55, 13),
      [55, 12], [55, 11],
      ...hRun(56, 64, 11),
      ...vRun(64, 10, 2),       // Great Cylindrical Gear-Shaft (col 64, rows 11->2)
      ...hRun(65, 70, 2),       // 4-cell High Belfry Skywalk [65..68, 2] -> 2x2 Boss [69..70, 1..2]
    ],
    extra: [
      [55, 14], [55, 15],       // West Drain Cistern to Ossuary [55,16]
      [57, 10],                 // Mechanism Hatch up to Library [57,9]
      [61, 12], [61, 13], [61, 14], [61, 15], // East Weight-Chain Shaft to Ossuary [61,16]
      [62, 3], [63, 3],         // Upper Escapement Walk to Throne [61,3]
      [62, 2],                  // Isolated Night-Wings Horology Reliquary Secret [62,2] (above [62,3])
      [69, 1], [70, 1],         // 2x2 Boss Sanctum upper belfry
    ],
    boss: [[69, 2], [70, 2], [69, 1], [70, 1]],
    sanctuary: [58, 11],
    warp: [60, 11],
    secret: [62, 2],
    bonusSecret: [54, 11],
    bonusSecretFrom: [55, 11],
    labelPos: [60.5, 11.0],
  }),

  // 16. THE CATACOMBS (`catacombs`: cols 29..50, w=22 -> 440 tiles; rows 15..21)
  catacombs: makeRoom({
    where: 'CENTRAL CATACOMBS',
    spine: [
      [35, 15], [35, 16],
      ...hRun(36, 39, 16),
      [39, 17], [39, 18],
      ...hRun(40, 44, 18),
      ...hRun(44, 50, 19),
    ],
    extra: [
      ...hRun(29, 35, 17), [29, 18], // West Ossuary Tunnel to Aqueduct [28,18]
      [40, 17], [41, 17],       // Walkable Upper Crypt Gallery
      [43, 17],                 // Isolated Night-Wings Bone Reliquary Secret [43,17] (above [43,18])
      [41, 19], [41, 20], [41, 21], // Abyssal Pit Shaft down to Dark Cave [41,22]
      [44, 20],                 // Flooded Crypt Gate to Ossuary [45,20]
      [49, 18], [50, 18],       // 2x2 Boss Sanctum upper vault
    ],
    boss: [[49, 19], [50, 19], [49, 18], [50, 18]],
    sanctuary: [38, 16],
    warp: [46, 19],
    secret: [43, 17],
    bonusSecret: [38, 18],
    bonusSecretFrom: [39, 18],
    labelPos: [42.5, 18.2],
  }),

  // 17. THE OSSUARY (`ossuary`: cols 45..67, w=23 -> 460 tiles; rows 16..22)
  ossuary: makeRoom({
    where: 'UNDERGROUND RIVER',
    spine: [
      ...hRun(45, 55, 20),
      ...hRun(55, 67, 21),
    ],
    extra: [
      [55, 19], [55, 18], [55, 17], [55, 16], // West Waterfall Lift Tower up to Clock Tower [55,15]
      [61, 20], [61, 19], [61, 18], [61, 17], [61, 16], // East Reliquary Lift Tower up to Clock Tower [61,15]
      [57, 22],                 // Submerged Grotto Gate to Dark Cave [57,23]
      [60, 22],                 // Isolated Sunken Ferryman Vault Secret [60,22] (below [60,21])
      [66, 20], [67, 20],       // 2x2 Boss Sanctum upper cavern
    ],
    boss: [[66, 21], [67, 21], [66, 20], [67, 20]],
    sanctuary: [52, 20],
    warp: [58, 21],
    secret: [60, 22],
    bonusSecret: [54, 18],
    bonusSecretFrom: [55, 18],
    labelPos: [58.0, 20.6],
  }),

  // 18. THE DARK CAVE (`darkcave`: cols 26..63, w=38 -> 760 tiles; rows 22..26)
  darkcave: makeRoom({
    where: 'MOLTEN DEPTHS',
    spine: [
      [26, 23], [26, 24],
      ...hRun(27, 38, 24),
      [38, 25],
      ...hRun(39, 63, 25),
    ],
    extra: [
      ...hRun(32, 36, 23),      // Upper Basalt Shelf
      [41, 24], [41, 23], [41, 22], // Chasm Chimney from Catacombs [41,21]
      [48, 26],                 // Isolated Sunken Magma Tube Secret [48,26] (below [48,25])
      [57, 24], [57, 23],       // Obsidian Vent up to Ossuary [57,22]
      [62, 24], [63, 24],       // 2x2 Boss Sanctum upper caldera
    ],
    boss: [[62, 25], [63, 25], [62, 24], [63, 24]],
    sanctuary: [37, 24],
    warp: [52, 25],
    secret: [48, 26],
    bonusSecret: [37, 23],
    bonusSecretFrom: [36, 23],
    labelPos: [47.0, 24.8],
  }),

  // 19. THE BLIGHTED CONSERVATORY (`conservatory`: cols 5..24, w=20 -> 400 tiles; rows 18..22)
  conservatory: makeRoom({
    where: 'SUNKEN GLASSHOUSE',
    icon: { sheet: 'wing_icons_extra', frame: 'conservatory' },
    spine: [
      ...hRun(5, 11, 20),
      ...hRun(11, 17, 21),
      ...hRun(17, 24, 22),
    ],
    extra: [
      [7, 19], [7, 18],         // Glasshouse Root Stair rising to Darkwood [7,17]
      ...hRun(12, 15, 20),      // Walkable Upper Greenhouse Mezzanine
      [14, 22],                 // Isolated Sunken Orchid Vault Secret (below [14,21])
      [17, 20],                 // Hydroponic Lock up to Aqueduct [17,19]
      [23, 21], [24, 21],       // 2x2 Boss Sanctum upper dome
    ],
    boss: [[23, 22], [24, 22], [23, 21], [24, 21]],
    sanctuary: [10, 20],
    warp: [19, 22],
    secret: [14, 22],
    bonusSecret: [16, 20],
    bonusSecretFrom: [17, 20],
    labelPos: [14.5, 21.2],
  }),

  // 20. THE IRON INQUISITION (`dungeon`: cols 36..54, w=19 -> 380 tiles; rows 12..16)
  dungeon: makeRoom({
    where: 'TORTURE GAOL',
    icon: { sheet: 'wing_icons_extra', frame: 'dungeon' },
    spine: [
      ...hRun(36, 42, 14),
      ...hRun(42, 48, 15),
      ...hRun(48, 54, 16),
    ],
    extra: [
      [40, 13], [40, 12],       // Iron Gaol Stair up to Arcade [40,11]
      [37, 15],                 // Charnel Grate down to Catacombs [37,16]
      ...hRun(43, 46, 14),      // Walkable Warden Catwalk
      [45, 16],                 // Isolated Sunken Oubliette Secret (below [45,15])
      [50, 15], [50, 14],       // Watch-Chain Shaft up to Clock Tower [50,13]
      [53, 15], [54, 15],       // 2x2 Boss Sanctum upper cellblock
    ],
    boss: [[53, 16], [54, 16], [53, 15], [54, 15]],
    sanctuary: [42, 15],
    warp: [49, 16],
    secret: [45, 16],
    bonusSecret: [47, 14],
    bonusSecretFrom: [46, 14],
    labelPos: [45.0, 15.0],
  }),

  // 21. THE ASTRAL OBSERVATORY (`observatory`: cols 27..47, w=21 -> 420 tiles; rows 0..4)
  observatory: makeRoom({
    where: 'ASTRAL DOME',
    icon: { sheet: 'wing_icons_extra', frame: 'observatory' },
    spine: [
      ...hRun(27, 33, 2),
      ...hRun(33, 47, 1),
    ],
    extra: [
      [30, 3],                  // Star-Bridge down to Ramparts [30,4]
      ...hRun(35, 38, 0),       // Walkable Upper Celestial Dome
      [37, 2], [37, 3], [37, 4], // Grand Orrery Lift down to Cathedral [37,5]
      [40, 2],                  // Isolated Sunken Lens Vault Secret (below [40,1])
      [45, 2], [45, 3],         // Eclipse Skyway to Throne [45,4]
      [46, 0], [47, 0],         // 2x2 Boss Sanctum upper dome
    ],
    boss: [[46, 1], [47, 1], [46, 0], [47, 0]],
    sanctuary: [34, 1],
    warp: [42, 1],
    secret: [40, 2],
    bonusSecret: [34, 0],
    bonusSecretFrom: [35, 0],
    labelPos: [37.5, 1.4],
  }),
};

/**
 * Wall-to-wall doorways between adjacent cells of neighbouring regions.
 * `gateRelic` (optional) seals shortcut/ability passages until that Boss Relic is earned.
 * `goldenLoop` identifies each biome's Boss-Relic Golden Loop shortcut (`18 / 18` biomes).
 */
export const MAP_DOORS = [
  // Central Spine #1 (`graveyard`, degree = 6!):
  { id: 'gy_dw',    a: 'graveyard',  cellA: [4, 14],  b: 'darkwood',   cellB: [4, 15],  gateRelic: null },
  { id: 'gy_jk',    a: 'graveyard',  cellA: [6, 13],  b: 'jack',       cellB: [6, 12],  gateRelic: null },
  { id: 'gy_alc',   a: 'graveyard',  cellA: [17, 13], b: 'alchemy',    cellB: [17, 14], gateRelic: 'darkwood' },
  { id: 'gy_ram',   a: 'graveyard',  cellA: [20, 11], b: 'ramparts',   cellB: [20, 10], gateRelic: 'graveyard', highA: true },
  { id: 'gy_bal',   a: 'graveyard',  cellA: [21, 11], b: 'ballroom',   cellB: [21, 10], gateRelic: 'jack', highA: true },
  { id: 'gy_arc',   a: 'graveyard',  cellA: [20, 13], b: 'arcade',     cellB: [21, 13], gateRelic: 'graveyard', goldenLoop: 'graveyard' },

  // Western Woods, Frozen Spire & Celestial Skykeep:
  { id: 'jk_yu',    a: 'jack',       cellA: [8, 9],   b: 'yule',       cellB: [8, 8],   gateRelic: null },
  { id: 'jk_ram',   a: 'jack',       cellA: [13, 8],  b: 'ramparts',   cellB: [13, 7],  gateRelic: 'jack', goldenLoop: 'jack' },
  { id: 'yu_sky',   a: 'yule',       cellA: [8, 4],   b: 'skykeep',    cellB: [8, 3],   gateRelic: 'graveyard', highA: true },
  { id: 'yu_ram',   a: 'yule',       cellA: [12, 6],  b: 'ramparts',   cellB: [13, 6],  gateRelic: 'yule', goldenLoop: 'yule' },
  { id: 'sky_ram',  a: 'skykeep',    cellA: [19, 3],  b: 'ramparts',   cellB: [20, 3],  gateRelic: 'skykeep', goldenLoop: 'skykeep' },

  // Darkwood, Alchemy, Aqueduct, Ramparts, Coliseum & Ballroom Golden Loops:
  { id: 'dw_aqu',   a: 'darkwood',   cellA: [14, 19], b: 'aqueduct',   cellB: [15, 19], gateRelic: null },
  { id: 'dw_alc',   a: 'darkwood',   cellA: [16, 17], b: 'alchemy',    cellB: [16, 16], gateRelic: 'darkwood', goldenLoop: 'darkwood' },
  { id: 'ram_col',  a: 'ramparts',   cellA: [23, 5],  b: 'coliseum',   cellB: [23, 6],  gateRelic: null },
  { id: 'ram_col2', a: 'ramparts',   cellA: [28, 5],  b: 'coliseum',   cellB: [28, 6],  gateRelic: 'ramparts', goldenLoop: 'ramparts' },
  { id: 'col_bal',  a: 'coliseum',   cellA: [30, 8],  b: 'ballroom',   cellB: [30, 9],  gateRelic: null },
  { id: 'col_cath', a: 'coliseum',   cellA: [33, 5],  b: 'cathedral',  cellB: [34, 5],  gateRelic: 'coliseum', goldenLoop: 'coliseum' },
  { id: 'bal_arc',  a: 'ballroom',   cellA: [32, 10], b: 'arcade',     cellB: [32, 11], gateRelic: 'ballroom', goldenLoop: 'ballroom' },
  { id: 'alc_aqu',  a: 'alchemy',    cellA: [25, 18], b: 'aqueduct',   cellB: [25, 19], gateRelic: null },
  { id: 'alc_arc',  a: 'alchemy',    cellA: [28, 14], b: 'arcade',     cellB: [28, 13], gateRelic: 'alchemy', goldenLoop: 'alchemy' },
  { id: 'aqu_cat',  a: 'aqueduct',   cellA: [28, 18], b: 'catacombs',  cellB: [29, 18], gateRelic: 'aqueduct', goldenLoop: 'aqueduct' },
  { id: 'aqu_dc',   a: 'aqueduct',   cellA: [26, 22], b: 'darkcave',   cellB: [26, 23], gateRelic: null },

  // Central Spine #2 (`arcade`, degree = 7!) & Eastern Keep Golden Loops:
  { id: 'arc_cat',  a: 'arcade',     cellA: [35, 14], b: 'catacombs',  cellB: [35, 15], gateRelic: null },
  { id: 'arc_cath', a: 'arcade',     cellA: [40, 10], b: 'cathedral',  cellB: [40, 9],  gateRelic: null, highA: true },
  { id: 'arc_lib',  a: 'arcade',     cellA: [44, 10], b: 'library',    cellB: [44, 9],  gateRelic: null, highA: true },
  { id: 'arc_clk',  a: 'arcade',     cellA: [45, 13], b: 'clocktower', cellB: [46, 13], gateRelic: 'arcade', goldenLoop: 'arcade' },
  { id: 'cath_thr', a: 'cathedral',  cellA: [44, 5],  b: 'throne',     cellB: [44, 4],  gateRelic: 'clocktower', highA: true },
  { id: 'cath_lib', a: 'cathedral',  cellA: [48, 8],  b: 'library',    cellB: [48, 9],  gateRelic: 'cathedral', goldenLoop: 'cathedral' },
  { id: 'lib_clk',  a: 'library',    cellA: [57, 9],  b: 'clocktower', cellB: [57, 10], gateRelic: 'library', goldenLoop: 'library' },
  { id: 'clk_thr',  a: 'clocktower', cellA: [62, 3],  b: 'throne',     cellB: [61, 3],  gateRelic: 'clocktower', goldenLoop: 'clocktower' },
  { id: 'thr_lib',  a: 'throne',     cellA: [57, 5],  b: 'library',    cellB: [57, 6],  gateRelic: 'throne', goldenLoop: 'throne' },
  { id: 'cat_dc',   a: 'catacombs',  cellA: [41, 21], b: 'darkcave',   cellB: [41, 22], gateRelic: null },
  { id: 'cat_oss',  a: 'catacombs',  cellA: [44, 20], b: 'ossuary',    cellB: [45, 20], gateRelic: 'catacombs', goldenLoop: 'catacombs' },
  { id: 'dc_oss',   a: 'darkcave',   cellA: [57, 23], b: 'ossuary',    cellB: [57, 22], gateRelic: 'darkcave', goldenLoop: 'darkcave' },
  { id: 'oss_clk1', a: 'ossuary',    cellA: [55, 16], b: 'clocktower', cellB: [55, 15], gateRelic: null },
  { id: 'oss_clk2', a: 'ossuary',    cellA: [61, 16], b: 'clocktower', cellB: [61, 15], gateRelic: 'ossuary', goldenLoop: 'ossuary' },

  // Expanded Castle Wings: Blighted Conservatory, Iron Inquisition & Astral Observatory:
  { id: 'dw_con',   a: 'darkwood',     cellA: [7, 17],  b: 'conservatory', cellB: [7, 18],  gateRelic: null },
  { id: 'con_aqu',  a: 'conservatory', cellA: [17, 20], b: 'aqueduct',     cellB: [17, 19], gateRelic: 'conservatory', goldenLoop: 'conservatory' },
  { id: 'arc_dun',  a: 'arcade',       cellA: [40, 11], b: 'dungeon',      cellB: [40, 12], gateRelic: null },
  { id: 'dun_cat',  a: 'dungeon',      cellA: [37, 15], b: 'catacombs',    cellB: [37, 16], gateRelic: 'dungeon', goldenLoop: 'dungeon' },
  { id: 'dun_clk',  a: 'dungeon',      cellA: [50, 14], b: 'clocktower',   cellB: [50, 13], gateRelic: 'dungeon' },
  { id: 'ram_obs',  a: 'ramparts',     cellA: [30, 4],  b: 'observatory',  cellB: [30, 3],  gateRelic: null },
  { id: 'obs_cath', a: 'observatory',  cellA: [37, 4],  b: 'cathedral',    cellB: [37, 5],  gateRelic: 'observatory', goldenLoop: 'observatory' },
  { id: 'obs_thr',  a: 'observatory',  cellA: [45, 3],  b: 'throne',       cellB: [45, 4],  gateRelic: 'observatory' },
];

export const MAP_LINKS = MAP_DOORS;

// Precompute cell ownership & room metadata
export const CELL_OWNER = new Map();
export const DOOR_EDGES = new Map(); // "c1,r1|c2,r2" -> door

export function edgeKey(c1, r1, c2, r2) {
  return (c1 < c2 || (c1 === c2 && r1 < r2))
    ? `${c1},${r1}|${c2},${r2}`
    : `${c2},${r2}|${c1},${r1}`;
}

export let TOTAL_MAP_CELLS = 0;

function cellSpanFrac(room, cell) {
  if (!room || !room.bounds) return 0.5;
  const span = Math.max(1, room.bounds.maxC - room.bounds.minC + 1);
  return Math.max(0.03, Math.min(0.92, (cell[0] - room.bounds.minC + 0.5) / span));
}

/**
 * (Re)derives every lookup structure from MAP_ROOMS / MAP_DOORS. Called once at
 * load and again whenever the Castle Forge raises a new wing.
 */
export function rebuildMapIndex() {
  CELL_OWNER.clear();
  DOOR_EDGES.clear();
  let total = 0;
  for (const [key, r] of Object.entries(MAP_ROOMS)) {
    r.exits = [];
    r.allCells = [...r.spine, ...r.extra];
    r.cellSet = new Set(r.allCells.map(([c, rw]) => `${c},${rw}`));
    r.bossSet = new Set(r.boss.map(([c, rw]) => `${c},${rw}`));
    r.sanctuaryKey = `${r.sanctuary[0]},${r.sanctuary[1]}`;
    r.secretKey = `${r.secret[0]},${r.secret[1]}`;
    if (!r.warp) {
      const fallbackWarp = r.spine.find(([c, rw]) => {
        const ck = `${c},${rw}`;
        return ck !== r.sanctuaryKey && ck !== r.secretKey && !r.bossSet.has(ck)
          && !(c === r.spine[0][0] && rw === r.spine[0][1]);
      }) || r.sanctuary;
      r.warp = fallbackWarp;
    }
    r.warpKey = `${r.warp[0]},${r.warp[1]}`;
    r.bonusSecretKey = r.bonusSecret ? `${r.bonusSecret[0]},${r.bonusSecret[1]}` : null;
    r.bonusSecretFromKey = r.bonusSecretFrom ? `${r.bonusSecretFrom[0]},${r.bonusSecretFrom[1]}` : null;
    let minC = 999, maxC = -1, minR = 999, maxR = -1;
    for (const [c, rw] of r.allCells) {
      CELL_OWNER.set(`${c},${rw}`, key);
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
      if (rw < minR) minR = rw;
      if (rw > maxR) maxR = rw;
      total++;
    }
    let bMinC = 999, bMaxC = -1, bMinR = 999, bMaxR = -1;
    for (const [bc, br] of r.boss) {
      if (bc < bMinC) bMinC = bc;
      if (bc > bMaxC) bMaxC = bc;
      if (br < bMinR) bMinR = br;
      if (br > bMaxR) bMaxR = br;
    }
    r.bossCenter = [(bMinC + bMaxC + 1) * 0.5, (bMinR + bMaxR + 1) * 0.5];
    r.bounds = { minC, maxC, minR, maxR };
    r.centerCell = [(minC + maxC + 1) * 0.5, (minR + maxR + 1) * 0.5];
  }
  TOTAL_MAP_CELLS = total;
  for (const d of MAP_DOORS) {
    const rmA = MAP_ROOMS[d.a];
    const rmB = MAP_ROOMS[d.b];
    if (!rmA || !rmB) continue;
    if (d.fracA == null || !rmA.forged) d.fracA = cellSpanFrac(rmA, d.cellA);
    if (d.fracB == null || !rmB.forged) d.fracB = cellSpanFrac(rmB, d.cellB);
    if (!rmA.exits.includes(d.b)) rmA.exits.push(d.b);
    if (!rmB.exits.includes(d.a)) rmB.exits.push(d.a);
    DOOR_EDGES.set(edgeKey(d.cellA[0], d.cellA[1], d.cellB[0], d.cellB[1]), d);
  }
}
rebuildMapIndex();

/**
 * Adds a forged wing to the castle: `room` is a MAP_ROOMS record (spine, extra,
 * boss, sanctuary, secret, labelPos, where, icon?) and `door` a MAP_DOORS record
 * joining it to an existing region. Rebuilds the lookup index.
 */
export function registerMapRoom(key, room, door) {
  MAP_ROOMS[key] = room;
  if (door && !MAP_DOORS.some((d) => d.id === door.id)) MAP_DOORS.push(door);
  rebuildMapIndex();
}

// ------------------------------------------------------------ forge placement

/** Deterministic PRNG (mulberry32) so a forged wing lands on the same cells for everyone. */
function seededRng(seed) {
  let a = (seed >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Finds free grid cells for a new wing next to one of the `preferred` regions
 * (falling back to any region) and returns a MAP_ROOMS record plus the door that
 * joins it, or null when the castle is full. Pure w.r.t. MAP_ROOMS; nothing is
 * registered here.
 */
export function placeForgedRoom(key, { preferred = [], seed = 1, spineLen = 9, extras = 3, exclude = null } = {}) {
  const rng = seededRng(seed * 2654435761 + 97);
  const occupied = new Set(CELL_OWNER.keys());
  if (exclude) for (const k of exclude) occupied.add(k);
  const inBounds = (c, r) => c >= 1 && c < GRID_COLS - 1 && r >= 0 && r < GRID_ROWS;
  const free = (c, r) => inBounds(c, r) && !occupied.has(`${c},${r}`);
  const order = [];
  for (const p of preferred) if (MAP_ROOMS[p] && !order.includes(p)) order.push(p);
  for (const k of Object.keys(MAP_ROOMS)) if (!order.includes(k)) order.push(k);

  let best = null;
  const consider = (cand) => {
    if (!best || cand.score > best.score) best = cand;
  };

  order.forEach((anchorKey, anchorRank) => {
    const anchor = MAP_ROOMS[anchorKey];
    const anchorCells = anchor.spine.filter(([c, r]) => !anchor.bossSet.has(`${c},${r}`));
    for (const [ac, ar] of anchorCells) {
      for (const [dc, dr] of DIRS) {
        const sc = ac + dc, sr = ar + dr;
        if (!free(sc, sr)) continue;
        for (let attempt = 0; attempt < 3; attempt++) {
          const spine = [[sc, sr]];
          const used = new Set([`${sc},${sr}`]);
          let dir = [dc, dr];
          let ok = true;
          while (spine.length < spineLen) {
            const [cc, cr] = spine[spine.length - 1];
            const options = [];
            const straight = [cc + dir[0], cr + dir[1]];
            if (free(straight[0], straight[1]) && !used.has(`${straight[0]},${straight[1]}`)) {
              options.push({ cell: straight, d: dir, w: attempt === 0 ? 3 : 1.6 });
            }
            for (const d of DIRS) {
              if (d[0] === dir[0] && d[1] === dir[1]) continue;
              if (d[0] === -dir[0] && d[1] === -dir[1]) continue;
              const n = [cc + d[0], cr + d[1]];
              if (free(n[0], n[1]) && !used.has(`${n[0]},${n[1]}`)) options.push({ cell: n, d, w: 1 });
            }
            if (!options.length) { ok = false; break; }
            let total = 0;
            for (const o of options) total += o.w;
            let pick = rng() * total;
            let chosen = options[options.length - 1];
            for (const o of options) { pick -= o.w; if (pick <= 0) { chosen = o; break; } }
            spine.push(chosen.cell);
            used.add(`${chosen.cell[0]},${chosen.cell[1]}`);
            dir = chosen.d;
          }
          if (!ok) continue;
          const extra = [];
          const extraSet = new Set();
          for (let i = 1; i < spine.length && extra.length < extras; i++) {
            const [cc, cr] = spine[i];
            const ns = DIRS.map(([x, y]) => [cc + x, cr + y])
              .filter(([x, y]) => free(x, y) && !used.has(`${x},${y}`) && !extraSet.has(`${x},${y}`));
            if (!ns.length) continue;
            const n = ns[Math.floor(rng() * ns.length)];
            extra.push(n); extraSet.add(`${n[0]},${n[1]}`);
          }
          if (!extra.length) continue;
          const last = spine[spine.length - 1];
          const boss = [last];
          const prev = spine[spine.length - 2];
          const bossAdj = DIRS.map(([x, y]) => [last[0] + x, last[1] + y])
            .filter(([x, y]) => free(x, y) && !used.has(`${x},${y}`) && !extraSet.has(`${x},${y}`) && !(x === prev[0] && y === prev[1]));
          if (bossAdj.length) boss.push(bossAdj[0]);
          const all = [...spine, ...extra, ...boss.slice(1)];
          let minC = 999, maxC = -1, minR = 999, maxR = -1;
          for (const [c, r] of all) {
            minC = Math.min(minC, c); maxC = Math.max(maxC, c);
            minR = Math.min(minR, r); maxR = Math.max(maxR, r);
          }
          const area = (maxC - minC + 1) * (maxR - minR + 1);
          const turns = spine.slice(2).filter((cell, i) => {
            const a = spine[i], b = spine[i + 1];
            return (b[0] - a[0]) !== (cell[0] - b[0]) || (b[1] - a[1]) !== (cell[1] - b[1]);
          }).length;
          const score = 100 - anchorRank * 12 - area * 0.85 - turns * 1.4 + extra.length * 4 + boss.length * 2 + rng() * 2;
          consider({ score, anchorKey, anchorCell: [ac, ar], spine, extra: [...extra, ...boss.slice(1)], boss, bounds: { minC, maxC, minR, maxR } });
        }
      }
    }
  });
  if (!best) return null;

  const anchor = MAP_ROOMS[best.anchorKey];
  let fracA;
  if (anchor.forged) {
    let spineIdx = anchor.spine.findIndex(([c, r]) => c === best.anchorCell[0] && r === best.anchorCell[1]);
    if (spineIdx < 0) spineIdx = Math.floor(anchor.spine.length / 2);
    fracA = Math.max(0.1, Math.min(0.82, (spineIdx + 0.5) / anchor.spine.length));
  } else {
    fracA = cellSpanFrac(anchor, best.anchorCell);
  }
  const b = best.bounds;
  const warpIdx = Math.min(best.spine.length - 2, Math.max(2, Math.floor(best.spine.length * 0.6)));
  const room = {
    spine: best.spine,
    extra: best.extra,
    boss: best.boss,
    sanctuary: best.spine[1],
    warp: best.spine[warpIdx] || best.spine[1],
    secret: best.extra[0],
    labelPos: [(b.minC + b.maxC + 1) * 0.5, (b.minR + b.maxR + 1) * 0.5 - 0.1],
    forged: true,
  };
  const door = {
    id: `forge_${key}`,
    a: best.anchorKey, cellA: best.anchorCell, fracA,
    b: key, cellB: best.spine[0], fracB: 0.05,
    gateRelic: null,
  };
  return { room, door, anchorKey: best.anchorKey };
}

export function canTraverseDoor(door, relicsSet) {
  if (!door.gateRelic) return true;
  return !!(relicsSet && relicsSet.has(door.gateRelic));
}

/** Returns all physical passage doorway descriptors for a given stage key. */
export function stageDoorsFor(stageKey) {
  const out = [];
  for (const d of MAP_DOORS) {
    if (d.a === stageKey) {
      out.push({
        id: d.id,
        targetKey: d.b,
        atFrac: d.fracA,
        destFrac: d.fracB,
        gateRelic: d.gateRelic,
        goldenLoop: d.goldenLoop || null,
        highLedge: !!d.highA,
        cell: d.cellA,
        destCell: d.cellB,
      });
    } else if (d.b === stageKey) {
      out.push({
        id: d.id,
        targetKey: d.a,
        atFrac: d.fracB,
        destFrac: d.fracA,
        gateRelic: d.gateRelic,
        goldenLoop: d.goldenLoop || null,
        highLedge: !!d.highB,
        cell: d.cellB,
        destCell: d.cellA,
      });
    }
  }
  return out.sort((p, q) => p.atFrac - q.atFrac);
}
