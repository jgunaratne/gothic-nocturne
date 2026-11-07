// Adaptive Curve Character Leveling & Experience System.
//
// Phase 1 — Quadratic Escalation (Levels 1 to N-1):
//   EXP_req(L -> L+1) = A * (L+1)^2 + B * (L+1) - C   (A=25, B=25, C=50)
//   Lv 1->2: 100, Lv 2->3: 250, Lv 3->4: 450, ..., Lv 18->19: 9,450 EXP.
//
// Phase 2 — Linear Cap Shift (Levels N to Cap):
//   EXP_req = 10,000 EXP flat per rank during late-game / open-castle routing.
//
// Dynamic Return Formula (Anti-Grind & Rubber-Band Catch-Up Multiplier):
//   Level_Delta = Player_Level - Enemy_Level
//   - Over-leveled (Delta > 0): Base_EXP * (0.66 ^ Delta), floored at 1 EXP.
//   - Equal rank  (Delta == 0): Base_EXP.
//   - Under-leveled (Delta < 0): Base_EXP * min(3.5, 1.25 ^ |Delta|).

export const START_LEVEL = 1;
export const LEVEL_CAP = 99;

export const QUAD_A = 25;
export const QUAD_B = 25;
export const QUAD_C = 50;

export const LINEAR_THRESHOLD_LEVEL = 19;
export const LINEAR_CAP_EXP = 10000;

export const OVERLEVEL_SCALAR = 0.66;
export const UNDERLEVEL_SCALAR = 1.25;
export const UNDERLEVEL_MAX_MULT = 3.5;
export const MIN_EXP_FLOOR = 1;

/** Natural enemy tier rank for each of the 18 interconnected castle regions. */
export const STAGE_RANKS = {
  graveyard: 1,
  darkwood: 3,
  jack: 4,
  yule: 6,
  ramparts: 7,
  catacombs: 9,
  darkcave: 10,
  ossuary: 12,
  alchemy: 13,
  arcade: 14,
  ballroom: 15,
  library: 16,
  aqueduct: 17,
  cathedral: 18,
  coliseum: 19,
  clocktower: 20,
  skykeep: 21,
  conservatory: 11,
  dungeon: 15,
  observatory: 22,
  throne: 24,
};

/**
 * EXP required to advance from `level` to `level + 1`.
 * Returns `0` once `LEVEL_CAP` is reached.
 */
export function expRequiredForNextLevel(level) {
  const lv = Math.max(START_LEVEL, Math.min(LEVEL_CAP, Math.floor(level || START_LEVEL)));
  if (lv >= LEVEL_CAP) return 0;
  if (lv >= LINEAR_THRESHOLD_LEVEL) return LINEAR_CAP_EXP;
  const nextLv = lv + 1;
  return QUAD_A * nextLv * nextLv + QUAD_B * nextLv - QUAD_C;
}

/** Cumulative total EXP required from Level 1 (`0 EXP`) to reach `level`. */
export function cumulativeExpForLevel(level) {
  const lv = Math.max(START_LEVEL, Math.min(LEVEL_CAP, Math.floor(level || START_LEVEL)));
  let total = 0;
  for (let i = START_LEVEL; i < lv; i++) {
    total += expRequiredForNextLevel(i);
  }
  return total;
}

/** Active progression curve phase label for UI inspection. */
export function curvePhaseForLevel(level) {
  const lv = Math.max(START_LEVEL, Math.floor(level || START_LEVEL));
  if (lv >= LEVEL_CAP) return 'MAX';
  if (lv >= LINEAR_THRESHOLD_LEVEL) return 'LINEAR';
  return 'QUADRATIC';
}

/**
 * Dynamic Return Formula:
 * Computes actual EXP awarded for defeating an enemy of `enemyLevel` at `playerLevel`.
 */
export function computeExpYield(baseExp, playerLevel, enemyLevel) {
  const pLv = Math.max(START_LEVEL, Math.min(LEVEL_CAP, Math.floor(playerLevel || START_LEVEL)));
  const eLv = Math.max(1, Math.floor(enemyLevel || 1));
  const cleanBase = Math.max(1, Math.round(baseExp || 1));
  const delta = pLv - eLv;

  let multiplier = 1;
  let band = 'even';
  if (delta > 0) {
    multiplier = Math.pow(OVERLEVEL_SCALAR, delta);
    band = 'diminished';
  } else if (delta < 0) {
    multiplier = Math.min(UNDERLEVEL_MAX_MULT, Math.pow(UNDERLEVEL_SCALAR, -delta));
    band = 'catchup';
  }

  const exp = Math.max(MIN_EXP_FLOOR, Math.round(cleanBase * multiplier));
  return {
    exp,
    baseExp: cleanBase,
    multiplier,
    delta,
    enemyLevel: eLv,
    band,
  };
}

/** Resolves the baseline enemy rank for a built-in or Castle Forge stage. */
export function stageRankFor(stage) {
  if (!stage) return 1;
  if (stage.key && STAGE_RANKS[stage.key] != null) return STAGE_RANKS[stage.key];
  const baseKey = stage.baseTheme || stage.theme;
  if (baseKey && STAGE_RANKS[baseKey] != null) {
    return Math.max(8, Math.min(22, STAGE_RANKS[baseKey] + 2));
  }
  if (typeof stage.id === 'number' && stage.id > 18) return 14;
  return Math.max(1, Math.min(23, stage.id || 1));
}

/**
 * Resolves `{ baseExp, enemyLevel }` for any defeated enemy or stage boss.
 */
export function enemyExpProfile(enemy, stage, { isBoss = false } = {}) {
  const sLv = stageRankFor(stage);

  if (isBoss) {
    const bType = (stage && stage.boss && stage.boss.type) || (enemy && enemy.sheet) || 'reaper';
    const isApex = bType === 'count' || bType === 'reaperlord' || (stage && stage.key === 'throne');
    const isEarly = bType === 'giantbat' && sLv <= 2;
    const rankOffset = isApex ? 3 : 2;
    const baseExp = isApex
      ? 360 + sLv * 150
      : isEarly
        ? 220 + sLv * 120
        : 240 + sLv * 140;
    return { baseExp, enemyLevel: sLv + rankOffset };
  }

  const sheet = (enemy && enemy.sheet) || 'zombie';
  const variant = (enemy && enemy.variant) || 'normal';
  const score = (enemy && enemy.score) || 100;

  switch (sheet) {
    case 'bat':
      return variant === 'fire'
        ? { baseExp: 26 + sLv * 16, enemyLevel: sLv + 1 }
        : { baseExp: 16 + sLv * 12, enemyLevel: sLv };
    case 'zombie':
      if (variant === 'plague') return { baseExp: 32 + sLv * 18, enemyLevel: sLv + 1 };
      return variant === 'ghoul'
        ? { baseExp: 26 + sLv * 16, enemyLevel: sLv + 1 }
        : { baseExp: 20 + sLv * 14, enemyLevel: sLv };
    case 'medusa':
    case 'owl':
    case 'tome':
      return { baseExp: 20 + sLv * 14, enemyLevel: sLv };
    case 'wisp':
    case 'ghost':
    case 'cinderimp':
      return { baseExp: 30 + sLv * 18, enemyLevel: sLv + 1 };
    case 'pumpkin':
      return variant === 'lantern'
        ? { baseExp: 26 + sLv * 16, enemyLevel: sLv }
        : { baseExp: 34 + sLv * 19, enemyLevel: sLv + 1 };
    case 'gargoyle':
      return variant === 'obsidian'
        ? { baseExp: 54 + sLv * 27, enemyLevel: sLv + 2 }
        : { baseExp: 40 + sLv * 22, enemyLevel: sLv + 1 };
    case 'wraith':
      return variant === 'banshee'
        ? { baseExp: 56 + sLv * 28, enemyLevel: sLv + 2 }
        : { baseExp: 40 + sLv * 22, enemyLevel: sLv + 1 };
    case 'wolf':
      return variant === 'alpha'
        ? { baseExp: 54 + sLv * 27, enemyLevel: sLv + 2 }
        : { baseExp: 40 + sLv * 22, enemyLevel: sLv + 1 };
    case 'sporecap':
    case 'magmaslime':
      return { baseExp: 40 + sLv * 22, enemyLevel: sLv + 1 };
    case 'alchfiend':
    case 'merman':
    case 'gravekeeper':
    case 'spriggan':
    case 'scarecrow':
    case 'arbalest':
    case 'pyromancer':
    case 'gearharpy':
    case 'inkscholar':
    case 'waltzdancer':
    case 'retiarius':
    case 'siren':
    case 'astralarcher':
      return { baseExp: 54 + sLv * 26, enemyLevel: sLv + 1 };
    case 'duelist':
    case 'valkyrie':
    case 'necromancer':
    case 'clockknight':
    case 'censerprelate':
    case 'bloodknight':
      return { baseExp: 72 + sLv * 35, enemyLevel: sLv + 2 };
    case 'skeleton':
      if (variant === 'blood') return { baseExp: 62 + sLv * 30, enemyLevel: sLv + 2 };
      if (variant === 'frost') return { baseExp: 54 + sLv * 26, enemyLevel: sLv + 1 };
      if (variant === 'axe') return { baseExp: 54 + sLv * 26, enemyLevel: sLv + 2 };
      if (variant === 'red') return { baseExp: 46 + sLv * 24, enemyLevel: sLv + 1 };
      return { baseExp: 42 + sLv * 24, enemyLevel: sLv + 1 };
    case 'ice':
      // IceGolem (score 450, h 62) vs Snowman (score 250)
      return score >= 400
        ? { baseExp: 78 + sLv * 38, enemyLevel: sLv + 2 }
        : { baseExp: 38 + sLv * 21, enemyLevel: sLv + 1 };
    case 'mosstroll':
    case 'wickerman':
    case 'wendigo':
    case 'bonegoliath':
    case 'brasstitan':
    case 'vathulk':
    case 'minotaur':
    case 'cisterncrab':
    case 'marblecolossus':
    case 'lavagolem':
      return { baseExp: 98 + sLv * 46, enemyLevel: sLv + 3 };
    case 'dragon':
    case 'armor':
    case 'executioner':
    case 'catoblepas':
      return variant === 'crimson' || variant === 'elder' || variant === 'elite'
        ? { baseExp: 98 + sLv * 46, enemyLevel: sLv + 3 }
        : { baseExp: 82 + sLv * 40, enemyLevel: sLv + 2 };
    default:
      return score >= 400
        ? { baseExp: 76 + sLv * 38, enemyLevel: sLv + 2 }
        : { baseExp: 28 + sLv * 18, enemyLevel: sLv + 1 };
  }
}

/**
 * Computes combat & vitality bonuses for `level`.
 * Level 1 returns zero bonuses so baseline Stage 1 balance is 100% preserved.
 */
export function levelBonuses(level) {
  const lv = Math.max(START_LEVEL, Math.min(LEVEL_CAP, Math.floor(level || START_LEVEL)));
  const d = lv - START_LEVEL;
  if (d <= 0) {
    return {
      level: START_LEVEL,
      maxHpBonus: 0,
      attackMult: 1,
      damageTakenMult: 1,
      attackPct: 0,
      defensePct: 0,
    };
  }
  const maxHpBonus = Math.min(24, Math.floor(Math.min(16, d) * 0.5 + Math.max(0, d - 16) * 0.25));
  const attackMult = 1 + Math.min(0.80, d * 0.045) + Math.min(0.70, Math.max(0, d - 18) * 0.015);
  const damageTakenMult = 1 / (1 + Math.min(0.95, d * 0.024));
  return {
    level: lv,
    maxHpBonus,
    attackMult,
    damageTakenMult,
    attackPct: Math.round((attackMult - 1) * 100),
    defensePct: Math.round((1 - damageTakenMult) * 100),
  };
}

/**
 * Applies `gainedExp` to `(currentLevel, currentExp)` and resolves any rank-ups
 * (including multi-level jumps when rubber-banding against high-tier bosses).
 */
export function applyExpGain(currentLevel, currentExp, gainedExp) {
  let lv = Math.max(START_LEVEL, Math.min(LEVEL_CAP, Math.floor(currentLevel || START_LEVEL)));
  let exp = Math.max(0, Math.floor(currentExp || 0));
  const add = Math.max(0, Math.floor(gainedExp || 0));

  if (lv >= LEVEL_CAP) {
    return { level: LEVEL_CAP, exp: 0, expReq: 0, leveledUp: false, levelsGained: 0 };
  }

  exp += add;
  let levelsGained = 0;
  while (lv < LEVEL_CAP) {
    const req = expRequiredForNextLevel(lv);
    if (req <= 0 || exp < req) break;
    exp -= req;
    lv += 1;
    levelsGained += 1;
  }
  if (lv >= LEVEL_CAP) exp = 0;

  return {
    level: lv,
    exp,
    expReq: expRequiredForNextLevel(lv),
    leveledUp: levelsGained > 0,
    levelsGained,
  };
}

/** Compact HUD formatter so EXP readouts (`340/700`, `2.4K/10K`) always fit crisply. */
export function formatCompactExp(n) {
  const v = Math.max(0, Math.floor(n || 0));
  if (v < 1000) return String(v);
  if (v < 9950) {
    const k = (v / 1000).toFixed(1);
    return (k.endsWith('.0') ? k.slice(0, -2) : k) + 'K';
  }
  return `${Math.round(v / 1000)}K`;
}
