// Boss Relics: Permanent power-ups earned by defeating each region's boss.
// Every cleared boss grants a distinct, tangible ability that makes the hunt
// easier across subsequent stages and replays.

export const BOSS_RELICS = {
  graveyard: {
    key: 'graveyard',
    boss: 'THE GREAT BAT',
    name: 'NIGHT WINGS',
    short: 'DOUBLE JUMP',
    desc: 'LEAP A SECOND TIME IN MID-AIR ON SHADOWY WINGS',
    color: '#b48cff',
  },
  darkwood: {
    key: 'darkwood',
    boss: 'THE BRIAR KING',
    name: 'BRIAR BARK',
    short: 'REGENERATION',
    desc: 'ANCIENT SAP SLOWLY MENDS +1 HP EVERY 8 SECONDS',
    color: '#62f2c2',
  },
  jack: {
    key: 'jack',
    boss: 'THE GREAT JACK',
    name: 'LANTERN FLAME',
    short: 'SEARING WHIP',
    desc: '+1 WHIP DAMAGE & HARVEST EMBER SPARKS ON STRIKES',
    color: '#ff9a3c',
  },
  yule: {
    key: 'yule',
    boss: 'DEVIL SANTA',
    name: 'FROST AEGIS',
    short: 'WINTER WARD',
    desc: '+45% MERCY INVULNERABILITY & HALVED KNOCKBACK',
    color: '#8ad4ff',
  },
  ramparts: {
    key: 'ramparts',
    boss: 'THE BONE CAPTAIN',
    name: 'IRON GREAVES',
    short: 'SWIFT STRIDE',
    desc: '+15% MOVE SPEED & HALVED SPIKE/LAVA HAZARD DAMAGE',
    color: '#d8e0ef',
  },
  catacombs: {
    key: 'catacombs',
    boss: 'THE PHANTOM REAPER',
    name: 'SOUL HARVEST',
    short: 'LIFE SIPHON',
    desc: 'EVERY 6 FOES SLAIN RESTORES +1 HP AND +1 HEART',
    color: '#9ad17a',
  },
  darkcave: {
    key: 'darkcave',
    boss: 'THE CINDER QUEEN',
    name: 'MAGMA HEART',
    short: 'MOLTEN SHIELD',
    desc: '-65% LAVA & FIRE DAMAGE + +1 SUB-WEAPON DAMAGE',
    color: '#ff6228',
  },
  ossuary: {
    key: 'ossuary',
    boss: 'THE GORGON QUEEN',
    name: 'AEGIS MIRROR',
    short: 'STONE IMMUNITY',
    desc: 'IMMUNE TO PETRIFICATION & -15% DAMAGE TAKEN',
    color: '#e8d27a',
  },
  arcade: {
    key: 'arcade',
    boss: 'THE BRASS AUTOMATON',
    name: 'CLOCKWORK HEART',
    short: 'HEART MAGNET',
    desc: 'EVERY 2ND SUB-WEAPON COSTS 0 HEARTS & MAGNETIC LOOT',
    color: '#f0b85a',
  },
  library: {
    key: 'library',
    boss: 'THE SPECTRAL ARCHIVIST',
    name: 'FORBIDDEN TOME',
    short: 'LONG CHAIN',
    desc: '+28% EXTENDED WHIP REACH FOR SAFER STRIKES',
    color: '#a89cff',
  },
  cathedral: {
    key: 'cathedral',
    boss: 'THE GARGOYLE ARCHON',
    name: 'SANCTUARY HALO',
    short: 'BLESSED VITALITY',
    desc: '+4 MAX HP (20 TOTAL) & STRONGER ROAST MEAT HEALING',
    color: '#ffe89e',
  },
  clocktower: {
    key: 'clocktower',
    boss: 'THE REAPER LORD',
    name: 'CHRONO PENDULUM',
    short: 'SWIFT LASH',
    desc: '+25% FASTER WHIP RECOVERY & SLOWER ENEMY SHOTS',
    color: '#7ce2d4',
  },
  throne: {
    key: 'throne',
    boss: 'THE COUNT',
    name: 'CRIMSON MANTLE',
    short: 'CRIMSON SLASH',
    desc: 'WHIP UNLEASHES A PIERCING CRIMSON FLAME WAVE',
    color: '#ff4a66',
  },
};

export const RELIC_ORDER = Object.keys(BOSS_RELICS);

/**
 * Resolves the Set of active relic stage keys from the player's cleared bitmask
 * (plus optional `?relics=all` or `?relics=graveyard,darkcave` URL test override).
 */
export function resolveActiveRelics(clearedMask, stages, params = null) {
  const active = new Set();
  if (stages) {
    for (let i = 0; i < stages.length; i++) {
      const key = stages[i].key;
      if (((clearedMask >> i) & 1) && BOSS_RELICS[key]) active.add(key);
    }
  }
  if (params && typeof params.get === 'function') {
    const raw = params.get('relics');
    if (raw === 'all') {
      for (const k of RELIC_ORDER) active.add(k);
    } else if (raw) {
      for (const part of raw.split(',')) {
        const k = part.trim();
        if (BOSS_RELICS[k]) active.add(k);
      }
    }
  }
  return active;
}
