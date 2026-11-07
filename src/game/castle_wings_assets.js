// Asset wiring for the 8 expanded Castle Wings:
//   - Stage 14: The Alchemy Lab (`alchemy`)
//   - Stage 15: The Phantom Ballroom (`ballroom`)
//   - Stage 16: The Blood Coliseum (`coliseum`)
//   - Stage 17: The Sunken Aqueduct (`aqueduct`)
//   - Stage 18: The Floating Garden (`skykeep`)
//   - Stage 19: The Blighted Conservatory (`conservatory`)
//   - Stage 20: The Iron Inquisition (`dungeon`)
//   - Stage 21: The Astral Observatory (`observatory`)
// All terrain strips, wide 4-bay indoor walls, monumental wall murals,
// panoramic sky-garden backdrops, prop sheets, map emblems, and boss sheets
// are generated pixel-art PNGs loaded from `assets/atlas.json`.

import {
  T_ALCHEMY, T_BALLROOM, T_COLISEUM, T_AQUEDUCT, T_SKYKEEP,
  T_CONSERVATORY, T_DUNGEON, T_OBSERVATORY,
} from '../engine/constants.js';
import { registerForgedMaterial } from './tex3d.js';
import { registerLayerSet } from './parallax.js';

export const WING_PROP_FRAMES = {
  alchemy: ['retort_stand', 'tesla_coil', 'elixir_rack', 'athanor'],
  ballroom: ['gilded_mirror', 'candelabra', 'velvet_drape', 'marble_bust'],
  coliseum: ['weapon_rack', 'trophy_pillar', 'iron_brazier', 'war_standard'],
  aqueduct: ['water_spout', 'sluice_wheel', 'moss_amphora', 'canal_lantern'],
  skykeep: ['moon_astrolabe', 'ivy_column', 'fountain_basin', 'star_lantern'],
  conservatory: ['carnivorous_bloom', 'iron_trellis', 'glass_terrarium', 'marble_urn'],
  dungeon: ['iron_maiden', 'pillory_rack', 'coal_brazier', 'chain_pillar'],
  observatory: ['brass_telescope', 'celestial_globe', 'star_orrery', 'zodiac_stele'],
};

const WING_MATERIALS = [
  { id: T_ALCHEMY, strip: 'alchemyfloor', sideBg: '#090d14' },
  { id: T_BALLROOM, strip: 'ballroomfloor', sideBg: '#120814' },
  { id: T_COLISEUM, strip: 'coliseumfloor', sideBg: '#14090b' },
  { id: T_AQUEDUCT, strip: 'aqueductfloor', sideBg: '#061018' },
  { id: T_SKYKEEP, strip: 'skykeepfloor', sideBg: '#0c1224' },
  { id: T_CONSERVATORY, strip: 'conservatoryfloor', sideBg: '#081216' },
  { id: T_DUNGEON, strip: 'dungeonfloor', sideBg: '#0c080d' },
  { id: T_OBSERVATORY, strip: 'observatoryfloor', sideBg: '#080c1c' },
];

export function registerCastleWingAssets(assets) {
  if (!assets || !assets.atlas) return;

  for (const m of WING_MATERIALS) {
    registerForgedMaterial(m.id, m.strip, { overhang: 5, sideBg: m.sideBg });
  }

  registerLayerSet('skykeep', {
    skyImg: 'skykeep_far',
    backdropImg: 'skykeep_backdrop',
    baseSet: 'ramparts',
    accentRgb: [190, 236, 255],
  });
}
