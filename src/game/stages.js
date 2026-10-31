// The six stages of Gothic Nocturne.

import { STAGE1 as GRAVEYARD } from './level_data.js';
import { StageBuilder } from './builder.js';

// ---------------------------------------------------------------- stage 1
// Hand-built in level_data.js; the Great Bat guards the gate.
const stage1 = Object.assign({}, GRAVEYARD, {
  id: 1, theme: 'graveyard', subtitle: 'A MOONLIT ROAD TO THE KEEP',
  boss: Object.assign({}, GRAVEYARD.boss, {
    type: 'giantbat', name: 'THE GREAT BAT',
    spawn: { x: GRAVEYARD.boss.spawn.x, y: GRAVEYARD.boss.arena.floorY - 150 },
    arena: Object.assign({}, GRAVEYARD.boss.arena, { ceilY: GRAVEYARD.boss.arena.floorY - 230 }),
  }),
});

// ---------------------------------------------------------------- stage 2
function buildRamparts() {
  const b = new StageBuilder({ id: 2, name: 'THE RAMPARTS', subtitle: 'ALONG THE OUTER WALLS', theme: 'ramparts', startRow: 11, seed: 2 });
  b.flat(14, { candles: [4, 10], enemies: [['bat', 9, { h: 5 }]] })
    .gap(2)
    .flat(10, { candles: [5], enemies: [['skeleton', 6]] })
    .stepUp(2)
    .flat(10, { candles: [[3, 'dagger']], ledges: [[5, 3, 3]], enemies: [['bat', 8, { h: 6 }]] })
    .gap(3, { ledge: 2 })
    .flat(12, { candles: [2, 9], enemies: [['skeleton', 7, { variant: 'axe' }], ['bat', 3, { h: 5 }]] })
    .spikeRun(3)
    .flat(10, { candles: [4], ledges: [[2, 2, 2], [6, 4, 2]], spawn: 'bat' })
    .climb(4, { candles: true })
    .flat(8, { candles: [[3, 'heart_big'], 6], enemies: [['skeleton', 5]] })
    .drop(4)
    .flat(14, { candles: [3, 10], spawn: 'medusa', enemies: [['bat', 6, { h: 4 }]] })
    .gap(2)
    .flat(8, { candles: [[4, 'axe']] })
    .stepUp(1)
    .gap(2, { ledge: 1 }).flat(2, { decor: false }).gap(2, { ledge: 2 }).flat(2, { decor: false }).gap(3, { ledge: 1 })
    .flat(12, { candles: [3, 8], enemies: [['skeleton', 4], ['skeleton', 9]] })
    .checkpoint()
    .flat(6, { candles: [[3, 'heart_big']] })
    .arena('bonecaptain', 'THE BONE CAPTAIN', { spawnHeight: 0 });
  return b.done();
}

// ---------------------------------------------------------------- stage 3
function buildCatacombs() {
  const b = new StageBuilder({ id: 3, name: 'THE CATACOMBS', subtitle: 'WHERE THE DEAD DO NOT REST', theme: 'catacombs', startRow: 9, seed: 3 });
  b.flat(12, { candles: [3, 9], enemies: [['bat', 7, { h: 5 }]] })
    .corridor(10, 2, { candles: [4], spawn: 'medusa' })
    .flat(12, { candles: [[5, 'holy_water']], spawn: 'zombie', enemies: [['skeleton', 9]] })
    .blocks(3, ['meat', null, null])
    .stepDown(2)
    .flat(14, { candles: [3, 10], enemies: [['skeleton', 6, { variant: 'red' }], ['bat', 11, { h: 6 }]] })
    .spikeRun(2)
    .flat(12, { candles: [2], ledges: [[3, 3, 3], [8, 2, 2]], spawn: 'zombie' })
    .gap(2, { ledge: 2 })
    .flat(10, { candles: [[4, 'heart_big']], enemies: [['skeleton', 7, { variant: 'axe' }]] })
    .corridor(14, 3, { candles: [3, 10], spawn: 'medusa', enemies: [['skeleton', 6]] })
    .stepUp(2)
    .flat(12, { candles: [2, 8], enemies: [['skeleton', 4, { variant: 'red' }], ['skeleton', 10]], spawn: 'zombie' })
    .spikeRun(3, { ledge: 2 })
    .flat(10, { candles: [[3, 'dagger'], 8], enemies: [['bat', 5, { h: 5 }], ['bat', 9, { h: 7 }]] })
    .gap(2)
    .flat(12, { candles: [4], ledges: [[6, 3, 3]], spawn: 'zombie', enemies: [['skeleton', 9, { variant: 'axe' }]] })
    .checkpoint()
    .flat(8, { candles: [[4, 'heart_big']] })
    .arena('reaper', 'THE PHANTOM REAPER');
  return b.done();
}

// ---------------------------------------------------------------- stage 4
function buildOssuary() {
  const b = new StageBuilder({ id: 4, name: 'THE OSSUARY', subtitle: 'A THOUSAND HOLLOW EYES', theme: 'ossuary', startRow: 11, seed: 4 });
  b.flat(10, { candles: [3, 7], enemies: [['bat', 6, { h: 5, variant: 'fire' }]] })
    .spikeRun(4, { ledge: 2 })
    .flat(8, { candles: [[3, 'axe']], enemies: [['skeleton', 5, { variant: 'axe' }]] })
    .spikeRun(3, { ledge: 1 }).flat(2, { decor: false }).spikeRun(3, { ledge: 2 }).flat(2, { decor: false }).spikeRun(3, { ledge: 1 })
    .flat(10, { candles: [4], spawn: 'zombie', spawnVariant: 'ghoul' })
    .stepUp(2)
    .flat(10, { candles: [2, 7], enemies: [['skeleton', 5, { variant: 'red' }], ['bat', 8, { h: 5, variant: 'fire' }]] })
    .blocks(2, ['money', null])
    .corridor(12, 2, { candles: [5], spawn: 'medusa' })
    .flat(12, { candles: [[6, 'heart_big']], ledges: [[2, 3, 3], [7, 2, 3]], spawn: 'bat' })
    .climb(3)
    .flat(8, { candles: [3], enemies: [['skeleton', 5, { variant: 'axe' }]] })
    .drop(3)
    .flat(14, { candles: [3, 10], enemies: [['skeleton', 4, { variant: 'red' }], ['skeleton', 10, { variant: 'red' }]], spawn: 'zombie', spawnVariant: 'ghoul' })
    .gap(2, { ledge: 1 })
    .flat(10, { candles: [[4, 'holy_water']], enemies: [['bat', 3, { h: 5, variant: 'fire' }], ['bat', 8, { h: 6, variant: 'fire' }]] })
    .spikeRun(5, { ledge: 2, ledgeWidth: 2 })
    .flat(12, { candles: [3, 9], spawn: 'medusa', enemies: [['skeleton', 6, { variant: 'axe' }]] })
    .checkpoint()
    .flat(6, { candles: [[3, 'heart_big']] })
    .arena('gorgon', 'THE GORGON QUEEN', { spawnHeight: 90 });
  return b.done();
}

// ---------------------------------------------------------------- stage 5
function buildClockTower() {
  const b = new StageBuilder({ id: 5, name: 'THE CLOCK TOWER', subtitle: 'GEARS GRIND TOWARD MIDNIGHT', theme: 'clocktower', rows: 28, startRow: 25, seed: 5 });
  b.flat(12, { candles: [3, 8], enemies: [['bat', 7, { h: 5 }]] })
    .climb(6, { candles: true })
    .flat(10, { candles: [[4, 'dagger']], enemies: [['skeleton', 6]], spawn: 'bat' })
    .gap(2)
    .flat(8, { candles: [3], enemies: [['bat', 5, { h: 4, variant: 'fire' }]] })
    .climb(4)
    .flat(10, { candles: [2, 7], enemies: [['skeleton', 5, { variant: 'axe' }]] })
    .spikeRun(2)
    .flat(8, { candles: [[4, 'heart_big']], spawn: 'medusa' })
    .climb(3, { candles: true })
    .flat(12, { candles: [3, 9], enemies: [['skeleton', 6, { variant: 'red' }], ['bat', 10, { h: 5, variant: 'fire' }]], spawn: 'bat' })
    .gap(3, { ledge: 2 })
    .flat(8, { candles: [[3, 'axe']], enemies: [['skeleton', 5]] })
    .climb(3)
    .flat(12, { candles: [2, 6, 10], spawn: 'medusa', enemies: [['skeleton', 8, { variant: 'axe' }]] })
    .spikeRun(3, { ledge: 2 })
    .flat(10, { candles: [4], ledges: [[6, 3, 3]], enemies: [['skeleton', 3, { variant: 'red' }]], spawn: 'bat', spawnVariant: 'fire' })
    .checkpoint()
    .flat(6, { candles: [[3, 'heart_big']] })
    .arena('reaperlord', 'THE REAPER LORD');
  return b.done();
}

// ---------------------------------------------------------------- stage 6
function buildThroneHall() {
  const b = new StageBuilder({ id: 6, name: 'THE THRONE HALL', subtitle: 'THE COUNT AWAITS', theme: 'throne', startRow: 11, seed: 6 });
  b.flat(16, { candles: [3, 7, 12], enemies: [['bat', 9, { h: 5 }]] })
    .gap(2)
    .flat(12, { candles: [[4, 'holy_water']], enemies: [['skeleton', 6], ['bat', 10, { h: 6, variant: 'fire' }]] })
    .flat(14, { candles: [2, 11], ledges: [[3, 3, 3], [8, 2, 4]], spawn: 'bat' })
    .stepUp(2)
    .flat(12, { candles: [5], spawn: 'zombie', spawnVariant: 'ghoul', enemies: [['skeleton', 9, { variant: 'red' }]] })
    .spikeRun(3, { ledge: 2 })
    .flat(10, { candles: [[3, 'axe'], 8], enemies: [['skeleton', 4, { variant: 'axe' }], ['skeleton', 8, { variant: 'axe' }]] })
    .corridor(10, 3, { candles: [4], spawn: 'medusa' })
    .stepDown(2)
    .flat(16, { candles: [3, 8, 13], enemies: [['skeleton', 6, { variant: 'red' }], ['bat', 10, { h: 5 }], ['bat', 14, { h: 4, variant: 'fire' }]], spawn: 'zombie' })
    .blocks(3, ['meat', null, 'money'])
    .spikeRun(3, { ledge: 1 }).flat(2, { decor: false }).spikeRun(4, { ledge: 2 })
    .flat(12, { candles: [[5, 'heart_big']], enemies: [['skeleton', 8, { variant: 'axe' }]], spawn: 'medusa' })
    .gap(2, { ledge: 2 })
    .flat(14, { candles: [3, 10], ledges: [[5, 3, 4]], enemies: [['skeleton', 4, { variant: 'red' }], ['skeleton', 11, { variant: 'axe' }], ['bat', 8, { h: 6, variant: 'fire' }]], spawn: 'bat', spawnVariant: 'fire' })
    .corridor(8, 3, { candles: [4], spawn: 'medusa' })
    .flat(10, { candles: [[3, 'dagger'], 7], spawn: 'zombie', spawnVariant: 'ghoul', enemies: [['skeleton', 6, { variant: 'red' }]] })
    .checkpoint()
    .flat(6, { candles: [[3, 'heart_big']] })
    .arena('count', 'THE COUNT', { spawnHeight: 0 });
  return b.done();
}

export const STAGES = [stage1, buildRamparts(), buildCatacombs(), buildOssuary(), buildClockTower(), buildThroneHall()];
