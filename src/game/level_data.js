// Stage 1 — "The Graveyard Road": moonlit cemetery parvis, Great Stairway moor
// ascent (Darkwood & West Chapel crossroads), 3D moat viaduct, Barbican
// Gatehouse, multi-story Great Entrance Hall (Central Spine #1, degree = 6) with
// 2nd-story Clerestory Gallery & Sunken East Undercroft, Pre-Boss Accordion,
// Save Sanctum, and 2x2 Boss Sanctum — mapped 1:1 (`20 x 5` tiles per cell) to
// `MAP_ROOMS.graveyard` on the 72 x 27 Castle Exploration Map.

import { composeGridStage } from './grid_composer.js';

export const STAGE1 = composeGridStage({
  id: 1,
  key: 'graveyard',
  name: 'THE GRAVEYARD ROAD',
  subtitle: 'GREAT STAIRWAY & ENTRANCE HALL',
  theme: 'graveyard',
  seed: 1,
  outdoorUntilCol: 8, // Cols 1..8 outdoor Cemetery, Moor, Viaduct & Stairway; Cols 9..27 indoor Castle Hall
  roster: {
    ground: [['skeleton', 'normal'], ['zombie', 'normal'], ['skeleton', 'axe']],
    heavy: [['armor', 'normal'], ['catoblepas', 'normal']],
    sniper: [['skeleton', 'axe'], ['skeleton', 'red']],
    aerial: [['bat', 'normal'], ['medusa', 'normal']],
    spawner: 'zombie',
  },
  boss: {
    type: 'giantbat',
    name: 'THE GREAT BAT',
    spawnHeight: 150,
  },
});
