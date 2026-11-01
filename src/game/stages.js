// The thirteen stages of Gothic Nocturne, paced with sawtooth intensity curves,
// teach-then-test 2.5D mechanics, open vista bridges, risk/reward split routes,
// volcanic lava basins, and calm pre-boss vestibules. Stages are linked into one
// castle map (see castlemap.js): `exits` names neighbouring regions.

import { STAGE1 as GRAVEYARD } from './level_data.js';
import { StageBuilder } from './builder.js';

// ---------------------------------------------------------------- stage 1
// Hand-built in level_data.js; the Great Bat guards the gate.
const stage1 = Object.assign({}, GRAVEYARD, {
  id: 1, key: 'graveyard', theme: 'graveyard', subtitle: 'A MOONLIT ROAD TO THE KEEP',
  boss: Object.assign({}, GRAVEYARD.boss, {
    type: 'giantbat', name: 'THE GREAT BAT',
    spawn: { x: GRAVEYARD.boss.spawn.x, y: GRAVEYARD.boss.arena.floorY - 150 },
    arena: Object.assign({}, GRAVEYARD.boss.arena, { ceilY: GRAVEYARD.boss.arena.floorY - 230 }),
  }),
});

// ---------------------------------------------------------------- stage 2: the darkwood
function buildDarkwood() {
  const b = new StageBuilder({ id: 2, name: 'THE DARKWOOD', subtitle: 'GUARDIAN TURTLE IN SHADOW WOODS', theme: 'darkwood', rows: 18, startRow: 11, seed: 9 });
  b.flat(13, { candles: [3, 9], enemies: [['wolf', 6], ['mushroom', 10]] })
    // Teach mossy crumbling slabs safely over a fern-lined hollow
    .crumbleRun(3, { safe: true, belowBlock: 'money' })
    .flat(11, { candles: [[4, 'dagger'], 9], enemies: [['mushroom', 4], ['wolf', 8], ['owl', 10, { h: 5 }]], spawn: 'owl' })
    .stepUp(2)
    // Open elder-root viaduct bridge overlooking the 3D bioluminescent forest stream!
    .vistaBridge(10, { candles: [3, 7], enemies: [['owl', 4, { h: 5 }], ['mushroom', 7]] })
    // Mossy log-raft ferry gliding across a misty woodland gorge
    .ferryGap(6, { platTiles: 3, period: 4.6, candle: 'axe' })
    .stepDown(2)
    // Risk/Reward: lower briar-wolf pack trail vs. high canopy platform run
    .splitRoute(14, {
      reward: 'meat',
      spawn: 'owl',
      enemies: [['wolf', 4], ['mushroom', 8], ['wolf', 11]],
      upperEnemies: [['owl', 8, { h: 6 }]],
    })
    // Test crumbling slabs over thorny briars
    .crumbleRun(3, { spikes: true })
    .flat(10, { candles: [3, 8], enemies: [['wolf', 4], ['mushroom', 8]] })
    // Deeper into the wood: a climb through the boughs and a second ferry over the stream
    .climb(3, { candles: true })
    .flat(10, { candles: [[3, 'holy_water'], 8], enemies: [['owl', 3, { h: 5 }], ['wolf', 7]], spawn: 'owl' })
    // Drop down the root-choked ravine and raid the buried hollow beneath the trail
    .descent(5, { enemies: [['owl', 3, { h: 2 }]] })
    .hiddenVault({ reward: 'meat', weapon: 'axe', enemies: [['wolf', 7]] })
    .swingRun(3, { period: 2.8, reward: 'heart_big' })
    .liftShaft(5, { spawn: 'owl', reward: 'holy_water' })
    .flat(9, { candles: [4], enemies: [['mushroom', 3], ['mushroom', 7]] })
    .crumbleRun(4, { abyss: true })
    .vistaBridge(8, { candles: [[4, 'heart_big']], enemies: [['owl', 4, { h: 5 }], ['wolf', 6]], spawn: 'owl' })
    .vestibule({ drop: 'heart_big' })
    .arena('treant', 'THE BRIAR KING', { spawnHeight: 0 });
  return Object.assign(b.done(), { key: 'darkwood' });
}

// ---------------------------------------------------------------- stage 3: jack-o'-lantern
function buildJackOLantern() {
  const b = new StageBuilder({ id: 3, name: "THE JACK-O'-LANTERN", subtitle: 'A HARVEST OF GRINNING FIRE', theme: 'forest', rows: 18, startRow: 11, seed: 7 });
  b.flat(12, { candles: [3, 9], enemies: [['pumpkin', 6], ['bat', 10, { h: 5 }]] })
    // Teach crumbling stone slabs safely over a shallow leaf-lined hollow
    .crumbleRun(3, { safe: true, belowBlock: 'money' })
    .flat(10, { candles: [[4, 'dagger']], enemies: [['pumpkin', 3], ['pumpkin', 8]], spawn: 'lantern' })
    .stepUp(2)
    // Open timber trestle bridge revealing the 3D autumn ravine & swaying lanterns
    .vistaBridge(10, { candles: [3, 7], enemies: [['dragon', 5, { h: 5 }]] })
    // Rope-pulley ferry across a woodland gorge
    .ferryGap(6, { platTiles: 3, period: 4.6, candle: 'axe' })
    .stepDown(2)
    // Risk/Reward: lower ambush road vs. high canopy walkway with roast meat
    .splitRoute(14, {
      reward: 'meat',
      spawn: 'zombie',
      enemies: [['skeleton', 5], ['pumpkin', 9], ['pumpkin', 12]],
      upperEnemies: [['dragon', 8, { h: 6 }]],
    })
    // Test crumbling slabs over bramble spikes
    .crumbleRun(3, { spikes: true })
    .flat(10, { candles: [3, 8], enemies: [['catoblepas', 6]] })
    // Pumpkin patch hollow: hopper swarm, then a climb back onto the ridge road
    .descent(4, { enemies: [['bat', 3, { h: 2 }]] })
    .flat(12, { candles: [[3, 'holy_water'], 9], spawn: 'pumpkin', enemies: [['skeleton', 6, { variant: 'axe' }]] })
    .swingRun(3, { period: 2.7, reward: 'heart_big', spawn: 'lantern' })
    .liftShaft(4, { spawn: 'bat', reward: 'axe' })
    .vistaBridge(9, { candles: [4], enemies: [['dragon', 4, { h: 5 }]], spawn: 'lantern' })
    .ferryGap(6, { rise: -2, platTiles: 3, period: 4.8, candle: 'heart_big' })
    .flat(8, { candles: [3], enemies: [['pumpkin', 2], ['pumpkin', 5]] })
    .vistaBridge(8, { candles: [[4, 'heart_big']], enemies: [['dragon', 4, { h: 5 }], ['skeleton', 6, { variant: 'red' }]], spawn: 'lantern' })
    .vestibule({ drop: 'heart_big' })
    .arena('greatjack', 'THE GREAT JACK', { spawnHeight: 120 });
  return Object.assign(b.done(), { key: 'jack' });
}

// ---------------------------------------------------------------- stage 4: frozen yule
function buildFrozenYule() {
  const b = new StageBuilder({ id: 4, name: 'THE FROZEN YULE', subtitle: "DEVIL SANTA'S WINTER WAKE", theme: 'yule', rows: 18, startRow: 11, seed: 8 });
  b.flat(12, { candles: [3, 9], enemies: [['snowman', 6], ['bat', 10, { h: 5 }]] })
    .stepUp(2)
    // Arched causeway overlooking the 3D shimmering frozen lake & aurora!
    .vistaBridge(12, { candles: [[4, 'holy_water'], 9], enemies: [['snowman', 5], ['bat', 8, { h: 5 }]], spawn: 'wisp' })
    // Teach ice-cracked crumble slabs safely before testing over the lake
    .crumbleRun(3, { safe: true, candle: 'heart_big' })
    .flat(10, { candles: [3, 7], enemies: [['icegolem', 5], ['snowman', 8]] })
    // Chain-drawn ice ferry gliding across an open canal
    .ferryGap(6, { platTiles: 3, period: 4.8, candle: 'axe' })
    // Risk/Reward: upper snow-gable gallery vs. lower ice-golem patrol
    .splitRoute(14, {
      vista: true,
      reward: 'meat',
      spawn: 'wisp',
      enemies: [['icegolem', 5], ['snowman', 10]],
      upperEnemies: [['bat', 8, { h: 6 }]],
    })
    .stepDown(2)
    .crumbleRun(3, { spikes: true })
    .flat(12, { candles: [3, 9], enemies: [['catoblepas', 5], ['skeleton', 9, { variant: 'axe' }]], spawn: 'wisp' })
    // Frozen village square: lamplit streets, then the lake crossing to the chapel
    .liftShaft(4, { spawn: 'wisp', reward: 'dagger' })
    .flat(10, { candles: [[3, 'dagger'], 8], enemies: [['snowman', 3], ['icegolem', 7]] })
    .descent(4, { enemies: [['bat', 3, { h: 2 }]] })
    .vistaBridge(10, { candles: [4], enemies: [['bat', 5, { h: 5 }], ['snowman', 8]], spawn: 'wisp' })
    .ferryGap(6, { rise: -2, platTiles: 3, period: 4.6, candle: 'heart_big' })
    .crumbleRun(4, { abyss: true })
    .flat(9, { candles: [3, 7], enemies: [['icegolem', 5]] })
    .vestibule({ drop: 'heart_big' })
    .arena('devilsanta', 'DEVIL SANTA', { spawnHeight: 0 });
  return Object.assign(b.done(), { key: 'yule' });
}

// ---------------------------------------------------------------- stage 5: ramparts
function buildRamparts() {
  const b = new StageBuilder({ id: 5, name: 'THE RAMPARTS', subtitle: 'ALONG THE OUTER WALLS', theme: 'ramparts', rows: 18, startRow: 11, seed: 2 });
  b.flat(10, { candles: [4, 8], enemies: [['bat', 7, { h: 5 }]] })
    // Open 3D stone viaduct high above the torchlit bailey courtyard!
    .vistaBridge(12, { candles: [[4, 'dagger'], 9], enemies: [['skeleton', 6], ['bat', 10, { h: 5 }]] })
    .crumbleRun(3, { safe: true, belowBlock: 'money' })
    .flat(8, { candles: [4], enemies: [['skeleton', 5, { variant: 'axe' }]] })
    // Diagonal siege lift rising 2 tiles across a breached curtain wall!
    .ferryGap(6, { rise: 2, period: 5.0, candle: 'heart_big' })
    // High battlement split route overlooking the rotating 3D Keep
    .splitRoute(14, {
      vista: true,
      reward: 'meat',
      spawn: 'medusa',
      enemies: [['armor', 5], ['skeleton', 10, { variant: 'axe' }]],
      upperEnemies: [['bat', 7, { h: 6 }]],
    })
    // Descending chain ferry back to the main curtain wall
    .ferryGap(6, { rise: -2, period: 4.6, candle: 'axe' })
    .vistaBridge(10, { candles: [3, 7], enemies: [['catoblepas', 6]], spawn: 'bat' })
    .crumbleRun(3, { abyss: true })
    .flat(8, { candles: [4], enemies: [['armor', 5]] })
    // The second wall: a tower stair, a long archer's gallery and the gatehouse approach
    .liftShaft(5, { spawn: 'bat', reward: 'dagger' })
    .corridor(10, 3, { candles: [4], spawn: 'medusa', enemies: [['skeleton', 6, { variant: 'axe' }]] })
    .swingRun(3, { period: 2.5, safe: false, reward: 'heart_big' })
    .descent(4, { enemies: [['bat', 3, { h: 2 }]] })
    .vistaBridge(12, { candles: [[3, 'holy_water'], 9], enemies: [['armor', 4], ['bat', 8, { h: 5 }], ['skeleton', 10, { variant: 'red' }]], spawn: 'bat' })
    .crumbleRun(3, { spikes: true })
    .flat(9, { candles: [3, 7], enemies: [['catoblepas', 5]] })
    .vestibule({ drop: 'heart_big' })
    .arena('bonecaptain', 'THE BONE CAPTAIN', { spawnHeight: 0 });
  return Object.assign(b.done(), { key: 'ramparts' });
}

// ---------------------------------------------------------------- stage 6: catacombs
function buildCatacombs() {
  const b = new StageBuilder({ id: 6, name: 'THE CATACOMBS', subtitle: 'WHERE THE DEAD DO NOT REST', theme: 'catacombs', rows: 18, startRow: 9, seed: 3 });
  b.flat(10, { candles: [3, 8], enemies: [['bat', 6, { h: 5 }]] })
    .corridor(10, 2, { candles: [4], spawn: 'medusa' })
    .stepDown(2)
    .flat(10, { candles: [[4, 'holy_water']], spawn: 'zombie', enemies: [['skeleton', 7]] })
    // Teach ancient crumbling crypt slabs over a sunken burial trench with hidden meat!
    .crumbleRun(3, { safe: true, belowBlock: 'meat' })
    // Risk/Reward: upper burial-tier catwalk vs. red-skeleton floor
    .splitRoute(14, {
      reward: 'axe',
      spawn: 'zombie',
      enemies: [['skeleton', 5, { variant: 'red' }], ['catoblepas', 10]],
      upperEnemies: [['bat', 8, { h: 5 }]],
    })
    // Chain-drawn ossuary slab gliding across a sunken crypt vault
    .ferryGap(6, { safeFloor: true, period: 4.6, candle: 'heart_big' })
    .corridor(12, 3, { candles: [3, 9], spawn: 'medusa', enemies: [['wraith', 7, { h: 4 }]] })
    .crumbleRun(3, { spikes: true })
    .flat(12, { candles: [[3, 'dagger'], 9], spawn: 'zombie', enemies: [['skeleton', 5, { variant: 'axe' }], ['wraith', 9, { h: 5 }]] })
    // Lower galleries: a descent past the charnel wells into the deep crypt
    .hiddenVault({ reward: 'meat', weapon: 'holy_water', enemies: [['skeleton', 7, { variant: 'red' }]] })
    .descent(4, { enemies: [['bat', 3, { h: 2 }]] })
    .corridor(10, 2, { candles: [5], spawn: 'medusa', enemies: [['skeleton', 3, { variant: 'red' }]] })
    .crumbleRun(3, { safe: true, candle: 'money' })
    .flat(10, { candles: [3, 8], spawn: 'zombie', enemies: [['catoblepas', 6]] })
    .ferryGap(6, { rise: 2, safeFloor: true, period: 4.8, candle: 'axe' })
    .blocks(3, ['meat', null, 'money'])
    .flat(9, { candles: [3], enemies: [['wraith', 4, { h: 5 }], ['skeleton', 7, { variant: 'axe' }]] })
    .vestibule({ drop: 'heart_big' })
    .arena('reaper', 'THE PHANTOM REAPER');
  return Object.assign(b.done(), { key: 'catacombs' });
}

// ---------------------------------------------------------------- stage 7: the dark cave
function buildDarkCave() {
  const b = new StageBuilder({
    id: 7,
    name: 'THE DARK CAVE',
    subtitle: 'MOLTEN DEPTHS · BEWARE THE RISING MAGMA',
    theme: 'darkcave',
    rows: 20,
    startRow: 12,
    seed: 19,
  });
  b.flat(12, { candles: [3, 9], enemies: [['magmaslime', 5], ['cinderimp', 9, { h: 5 }]] })
    // Teach volcanic lava basins safely with wide basalt stepping islands
    .lavaRun(8, {
      islands: [[2, 2], [5, 2]],
      candles: [[3, 'dagger']],
      enemies: [['bat', 6, { h: 5, variant: 'fire' }]],
    })
    .flat(11, { candles: [3, 8], enemies: [['magmaslime', 4], ['lavagolem', 8]] })
    .stepUp(2)
    // Basalt viaduct arching high above the 3D convective magma sea!
    .vistaBridge(10, { candles: [[4, 'holy_water'], 8], enemies: [['cinderimp', 4, { h: 5 }], ['magmaslime', 7]], spawn: 'cinderimp' })
    // Iron chain ferry gliding across a wide boiling magma pool
    .lavaRun(8, {
      ferry: true,
      platTiles: 3,
      period: 4.6,
      ledges: [[3, 2, 2]],
      candles: [[3, 'axe', 2]],
    })
    .stepDown(2)
    // Risk/Reward: lower lava-golem road vs. high obsidian gallery with roast meat
    .splitRoute(15, {
      reward: 'meat',
      enemies: [['lavagolem', 5], ['magmaslime', 10], ['skeleton', 13, { variant: 'red' }]],
      upperEnemies: [['cinderimp', 8, { h: 6 }]],
    })
    // Test fissured basalt crumble slabs directly over molten lava!
    .lavaRun(6, {
      crumble: [[1, 2], [4, 2]],
      candles: [[2, 'heart_big']],
    })
    .flat(10, { candles: [3, 8], enemies: [['lavagolem', 5], ['cinderimp', 8, { h: 5 }]] })
    // Plunge deeper toward the volcanic core & raid a sunken obsidian chamber
    .descent(4, { enemies: [['cinderimp', 3, { h: 3 }]] })
    .hiddenVault({ reward: 'meat', weapon: 'holy_water', enemies: [['magmaslime', 6]] })
    // Final caldera crossing: stepping islands + leaping magma slimes + cinder imps
    .lavaRun(10, {
      islands: [[2, 2], [5, 2], [8, 1]],
      ledges: [[4, 2, 2]],
      candles: [[5, 'heart_big']],
      enemies: [['cinderimp', 6, { h: 5 }]],
    })
    .liftShaft(4, { spawn: 'bat', spawnVariant: 'fire', reward: 'axe' })
    .vistaBridge(10, { candles: [3, 8], enemies: [['lavagolem', 5], ['cinderimp', 8, { h: 5 }]], spawn: 'cinderimp' })
    .blocks(3, ['meat', null, 'money'])
    .flat(9, { candles: [3, 7], enemies: [['magmaslime', 3], ['lavagolem', 7]] })
    .vestibule({ drop: 'heart_big' })
    .arena('cinderqueen', 'THE CINDER QUEEN', { spawnHeight: 0 });
  return Object.assign(b.done(), { key: 'darkcave' });
}

// ---------------------------------------------------------------- stage 7: ossuary
function buildOssuary() {
  const b = new StageBuilder({ id: 7, name: 'THE OSSUARY', subtitle: 'A THOUSAND HOLLOW EYES', theme: 'ossuary', rows: 16, startRow: 11, seed: 4 });
  b.flat(10, { candles: [3, 7], enemies: [['bat', 6, { h: 5, variant: 'fire' }]] })
    // Open bone-stone viaduct arches framing the 3D spectral teal soul-abyss!
    .vistaBridge(12, { candles: [[4, 'axe'], 9], enemies: [['skeleton', 6, { variant: 'axe' }], ['bat', 10, { h: 5, variant: 'fire' }]] })
    .crumbleRun(3, { safe: true, belowBlock: 'money' })
    .flat(8, { candles: [4], spawn: 'zombie', spawnVariant: 'ghoul' })
    // Spectral chain ferry gliding across the glowing soul-sea!
    .ferryGap(6, { period: 4.6, candle: 'holy_water' })
    .corridor(10, 2, { candles: [5], spawn: 'medusa' })
    // High reliquary gallery above the broken ossuary bridge
    .splitRoute(14, {
      vista: true,
      reward: 'meat',
      spawn: 'zombie', spawnVariant: 'ghoul',
      enemies: [['skeleton', 4, { variant: 'red' }], ['catoblepas', 10]],
      upperEnemies: [['bat', 7, { h: 6, variant: 'fire' }]],
    })
    .crumbleRun(3, { spikes: true })
    .vistaBridge(10, { candles: [3, 7], spawn: 'medusa', enemies: [['skeleton', 6, { variant: 'axe' }]] })
    // The bone-choked lower nave and the long span out over the abyss
    .stepDown(2)
    .flat(10, { candles: [[3, 'dagger'], 8], spawn: 'zombie', spawnVariant: 'ghoul', enemies: [['wraith', 5, { h: 5 }], ['cinderimp', 8, { h: 5 }]] })
    .ferryGap(6, { rise: 2, period: 4.8, candle: 'heart_big' })
    .crumbleRun(4, { abyss: true })
    .vistaBridge(12, { candles: [4, 9], spawn: 'medusa', enemies: [['catoblepas', 5], ['wraith', 9, { h: 5 }]] })
    .flat(8, { candles: [3], enemies: [['skeleton', 4, { variant: 'axe' }]] })
    .vestibule({ drop: 'heart_big' })
    .arena('gorgon', 'THE GORGON QUEEN', { spawnHeight: 90 });
  return Object.assign(b.done(), { key: 'ossuary' });
}

// ---------------------------------------------------------------- stage 8: the arcade
function buildArcade() {
  const b = new StageBuilder({ id: 8, name: 'THE ARCADE', subtitle: 'GALLERY OF ANCIENT AUTOMATA', theme: 'arcade', rows: 20, startRow: 15, seed: 11 });
  b.flat(12, { candles: [3, 9], enemies: [['skeleton', 6], ['bat', 10, { h: 5 }]] })
    // Fortune-teller hall: medusa heads drift between the glowing cabinets
    .corridor(10, 3, { candles: [4], spawn: 'medusa', enemies: [['skeleton', 6, { variant: 'axe' }]] })
    .crumbleRun(3, { safe: true, belowBlock: 'money' })
    .flat(10, { candles: [[4, 'dagger'], 8], enemies: [['skeleton', 3], ['skeleton', 7, { variant: 'red' }]], spawn: 'bat' })
    // Grand gallery lift between the tiers of machines
    .ferryGap(6, { rise: 2, safeFloor: true, period: 4.8, candle: 'axe' })
    // Risk/Reward: upper viewing balcony above the machine floor
    .splitRoute(16, {
      reward: 'meat',
      spawn: 'medusa',
      enemies: [['armor', 5], ['catoblepas', 11]],
      upperEnemies: [['bat', 8, { h: 6, variant: 'fire' }]],
    })
    .stepDown(2)
    .crumbleRun(3, { spikes: true })
    .flat(12, { candles: [3, 9], enemies: [['armor', 5], ['bat', 9, { h: 4 }]], spawn: 'zombie', spawnVariant: 'ghoul' })
    .blocks(3, ['meat', null, 'money'])
    .swingRun(4, { period: 2.4, reward: 'heart_big', spawn: 'medusa' })
    // Clockwork annex: cog lifts feeding the Automaton's workshop
    .gearWheel({ safe: true, speed: 0.5, reward: 'holy_water' })
    .liftShaft(4, { spawn: 'bat', reward: 'dagger' })
    .corridor(10, 3, { candles: [5], spawn: 'medusa', enemies: [['skeleton', 6]] })
    .ferryGap(6, { rise: -2, safeFloor: true, period: 4.6, candle: 'heart_big' })
    .flat(10, { candles: [[3, 'axe'], 8], enemies: [['catoblepas', 5], ['skeleton', 9, { variant: 'axe' }]], spawn: 'bat' })
    .vestibule({ drop: 'heart_big' })
    .arena('automaton', 'THE BRASS AUTOMATON', { spawnHeight: 0 });
  return Object.assign(b.done(), { key: 'arcade' });
}

// ---------------------------------------------------------------- stage 9: the library
function buildLibrary() {
  const b = new StageBuilder({ id: 9, name: 'THE LIBRARY', subtitle: 'WHERE THE BOOKS BITE BACK', theme: 'library', rows: 20, startRow: 13, seed: 13 });
  b.flat(12, { candles: [3, 9], enemies: [['tome', 5, { h: 4 }], ['tome', 8, { h: 6 }], ['skeleton', 10]] })
    // Reading hall: the first phantom drifts between the stacks
    .corridor(10, 3, { candles: [4], spawn: 'tome', enemies: [['ghost', 6, { h: 4 }]] })
    .crumbleRun(3, { safe: true, belowBlock: 'money' })
    .flat(10, { candles: [[4, 'holy_water'], 8], enemies: [['tome', 3, { h: 5 }], ['tome', 6, { h: 3 }], ['ghost', 8, { h: 5 }]], spawn: 'tome' })
    .liftShaft(5, { spawn: 'tome', reward: 'dagger' })
    // Upper gallery: shelf ladders and a long balcony over the reading room
    .splitRoute(16, {
      reward: 'meat',
      spawn: 'ghost',
      enemies: [['skeleton', 5, { variant: 'axe' }], ['tome', 9, { h: 3 }], ['tome', 12, { h: 5 }]],
      upperEnemies: [['ghost', 8, { h: 6 }]],
    })
    .ferryGap(6, { rise: -2, safeFloor: true, period: 4.8, candle: 'axe' })
    .flat(12, { candles: [3, 9], enemies: [['tome', 4, { h: 4 }], ['ghost', 7, { h: 5 }], ['tome', 10, { h: 6 }]], spawn: 'tome' })
    .crumbleRun(3, { spikes: true })
    .descent(5, { enemies: [['tome', 3, { h: 2 }]] })
    .hiddenVault({ reward: 'meat', weapon: 'axe', enemies: [['skeleton', 7]] })
    // Forbidden stacks: ghosts pour from the shelves
    .corridor(12, 3, { candles: [4, 9], spawn: 'ghost', enemies: [['tome', 3, { h: 4 }], ['tome', 8, { h: 5 }]] })
    .blocks(3, ['meat', null, 'money'])
    .stepDown(2)
    .flat(10, { candles: [[3, 'dagger'], 8], enemies: [['catoblepas', 5], ['tome', 8, { h: 5 }]], spawn: 'tome' })
    .ferryGap(6, { rise: 2, safeFloor: true, period: 4.6, candle: 'heart_big' })
    .flat(9, { candles: [3, 7], enemies: [['wraith', 4, { h: 5 }], ['armor', 7]] })
    .vestibule({ drop: 'heart_big' })
    .arena('archivist', 'THE SPECTRAL ARCHIVIST', { spawnHeight: 96 });
  return Object.assign(b.done(), { key: 'library' });
}

// ---------------------------------------------------------------- stage 10: the cathedral
function buildCathedral() {
  // A soaring nave: 26 rows tall so the vaulting, clerestory and rose windows tower overhead.
  const b = new StageBuilder({ id: 10, name: 'THE CATHEDRAL', subtitle: 'LIGHT THROUGH A THOUSAND PANES', theme: 'cathedral', rows: 26, startRow: 23, seed: 17 });
  b.flat(12, { candles: [3, 9], enemies: [['gargoyle', 6, { h: 5 }], ['skeleton', 10]] })
    // Nave aisle beneath the lancets: gargoyles wake from the cornices
    .corridor(10, 6, { candles: [4], spawn: 'gargoyle', enemies: [['skeleton', 6, { variant: 'axe' }]] })
    .crumbleRun(3, { safe: true, belowBlock: 'money' })
    .flat(10, { candles: [[4, 'holy_water'], 8], enemies: [['gargoyle', 3, { h: 6 }], ['bat', 7, { h: 5, variant: 'fire' }]] })
    // Climb the choir screen into the triforium gallery
    .climb(5, { candles: true })
    .flat(8, { candles: [3], enemies: [['skeleton', 5, { variant: 'red' }]], spawn: 'gargoyle' })
    .ferryGap(6, { rise: 3, safeFloor: true, period: 5.0, candle: 'axe' })
    // High clerestory walkway in front of the great windows
    .splitRoute(16, {
      vista: true,
      reward: 'meat',
      spawn: 'bat', spawnVariant: 'fire',
      enemies: [['skeleton', 5, { variant: 'axe' }], ['gargoyle', 10, { h: 5 }]],
      upperEnemies: [['gargoyle', 8, { h: 6 }]],
    })
    .crumbleRun(4, { abyss: true })
    // Descend past the organ loft back to the transept floor
    .ferryGap(6, { rise: -4, safeFloor: true, period: 5.0, candle: 'heart_big' })
    .stepDown(2)
    .flat(12, { candles: [3, 9], enemies: [['catoblepas', 5], ['gargoyle', 9, { h: 5 }]], spawn: 'medusa' })
    .blocks(3, ['meat', null, 'money'])
    .corridor(10, 6, { candles: [4], spawn: 'gargoyle', enemies: [['armor', 6]] })
    .flat(9, { candles: [[3, 'dagger'], 7], enemies: [['gargoyle', 4, { h: 6 }], ['wraith', 7, { h: 5 }]] })
    .vestibule({ drop: 'heart_big' })
    .arena('archon', 'THE GARGOYLE ARCHON', { spawnHeight: 160 });
  return Object.assign(b.done(), { key: 'cathedral' });
}

// ---------------------------------------------------------------- stage 11: clock tower
function buildClockTower() {
  const b = new StageBuilder({ id: 11, name: 'THE CLOCK TOWER', subtitle: 'GEARS GRIND TOWARD MIDNIGHT', theme: 'clocktower', rows: 34, startRow: 31, seed: 5 });
  b.flat(10, { candles: [3, 7], enemies: [['bat', 6, { h: 5 }]] })
    // Set-piece 1: Giant extruded 3D Brass Cogwheel with 3 orbiting gondolas (safe floor underneath!)
    .gearWheel({ safe: true, speed: 0.52, reward: 'dagger' })
    .flat(10, { candles: [3, 8], enemies: [['skeleton', 6]], spawn: 'bat' })
    .crumbleRun(3, { safe: true, candle: 'money' })
    .climb(3, { candles: true })
    .flat(8, { candles: [4], enemies: [['skeleton', 5, { variant: 'axe' }]] })
    // Set-piece 2: Diagonal counterweight lift ascending 3 tiles across the central shaft!
    .ferryGap(6, { rise: 3, safeFloor: true, period: 5.0, candle: 'meat' })
    .flat(10, { candles: [3, 7], spawn: 'medusa', enemies: [['skeleton', 6, { variant: 'red' }]] })
    // Set-piece 3: Counter-rotating 3D Iron & Brass Gear Wheel climbing to the belfry!
    .gearWheel({ safe: true, speed: -0.56, reward: 'axe' })
    .crumbleRun(3, { spikes: true })
    .flat(10, { candles: [3, 8], enemies: [['armor', 5], ['bat', 8, { h: 5, variant: 'fire' }]], spawn: 'bat', spawnVariant: 'fire' })
    // The upper works: pendulum gallery, a third wheel and the long walk to the belfry
    .corridor(10, 3, { candles: [4], spawn: 'medusa', enemies: [['armor', 6]] })
    .climb(3, { candles: true })
    .flat(8, { candles: [[3, 'holy_water']], enemies: [['skeleton', 5, { variant: 'red' }]], spawn: 'bat', spawnVariant: 'fire' })
    .gearWheel({ safe: true, speed: 0.6, reward: 'heart_big' })
    .crumbleRun(3, { abyss: true })
    .flat(9, { candles: [3, 7], enemies: [['catoblepas', 5]] })
    .vestibule({ drop: 'heart_big' })
    .arena('reaperlord', 'THE REAPER LORD');
  return Object.assign(b.done(), { key: 'clocktower' });
}

// ---------------------------------------------------------------- stage 12: throne hall
function buildThroneHall() {
  const b = new StageBuilder({ id: 12, name: 'THE THRONE HALL', subtitle: 'THE COUNT AWAITS', theme: 'throne', rows: 18, startRow: 11, seed: 6 });
  b.flat(14, { candles: [3, 7, 11], enemies: [['bat', 9, { h: 5 }]] })
    // Grand cathedral nave: upper stained-glass clerestory gallery vs. red-skeleton floor
    .splitRoute(16, {
      reward: 'holy_water',
      spawn: 'zombie', spawnVariant: 'ghoul',
      enemies: [['skeleton', 5, { variant: 'red' }], ['skeleton', 11, { variant: 'axe' }]],
      upperEnemies: [['bat', 9, { h: 5, variant: 'fire' }]],
    })
    // Ascending sanctuary lift beneath swaying 3D chandeliers!
    .ferryGap(6, { rise: 2, safeFloor: true, period: 4.8, candle: 'axe' })
    .corridor(10, 3, { candles: [4], spawn: 'medusa', enemies: [['skeleton', 6]] })
    .stepDown(2)
    .flat(12, { candles: [3, 9], enemies: [['catoblepas', 6], ['bat', 10, { h: 4, variant: 'fire' }]], spawn: 'zombie' })
    .blocks(3, ['meat', null, 'money'])
    .crumbleRun(3, { spikes: true })
    .ferryGap(6, { period: 4.6, candle: 'heart_big' })
    .flat(12, { candles: [[4, 'dagger'], 9], spawn: 'medusa', enemies: [['skeleton', 5, { variant: 'red' }], ['skeleton', 9, { variant: 'axe' }]] })
    // The royal apartments: a long gallery of banners and the final stair to the dais
    .corridor(12, 3, { candles: [3, 9], spawn: 'wraith', enemies: [['armor', 4], ['skeleton', 9, { variant: 'red' }]] })
    .hiddenVault({ reward: 'meat', weapon: 'holy_water', enemies: [['armor', 7]] })
    .swingRun(3, { period: 2.3, safe: false, reward: 'heart_big', spawn: 'medusa' })
    .climb(3, { candles: true })
    .flat(10, { candles: [[3, 'holy_water'], 8], enemies: [['lavagolem', 5], ['cinderimp', 8, { h: 5 }]], spawn: 'zombie', spawnVariant: 'ghoul' })
    .crumbleRun(4, { abyss: true })
    .flat(9, { candles: [3, 7], enemies: [['armor', 3], ['wraith', 7, { h: 5 }]] })
    .vestibule({ drop: 'heart_big' })
    .arena('count', 'THE COUNT', { spawnHeight: 0 });
  return Object.assign(b.done(), { key: 'throne' });
}

export const STAGES = [
  stage1, buildDarkwood(), buildJackOLantern(), buildFrozenYule(), buildRamparts(),
  buildCatacombs(), buildDarkCave(), buildOssuary(), buildArcade(), buildLibrary(),
  buildCathedral(), buildClockTower(), buildThroneHall(),
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
