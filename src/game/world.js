// World: owns the level, 3D stage renderer, player, enemies, objects, camera,
// scripting and draw order. The Game (main.js) drives it and layers menus.

import {
  W, H, TILE, T_GATE, T_BLOCK, SCORE, PLAYER,
} from '../engine/constants.js';
import { setClipClock } from './anim_clips.js';
import { Camera } from '../engine/camera.js';
import { VOICES } from '../engine/audio.js';
import { getFxLayers } from '../engine/fxlayers.js';
import { Particles, parseParticleColor } from '../engine/particles.js';
import { Level } from './level.js';
import { Parallax } from './parallax.js';
import { Stage3D, project3D } from './stage3d.js';
import { Player } from './player.js';
import { TurtleAlly } from './ally.js';
import { Spawner, createEnemy } from './enemies.js';
import { createBoss } from './bosses.js';
import { THEMES } from './builder.js';
import { Candle, Item, Projectile, Fire, rollDrop, rectsOverlap } from './objects.js';
import { populateExploration } from './exploration.js';
import { cellsToRevealAt, stageIndexOf } from './castlemap.js';
import { BOSS_RELICS, FORGED_RELIC_EFFECTS } from './relics.js';
import { computeExpYield, enemyExpProfile, stageRankFor } from './progression.js';
import { drawRemotePlayers, drawRemoteEdgeIndicators } from './net_player.js';
import {
  WEAPONS, ELEMENT_META, computeStrengthBreakdown, computeWeaponHit, rollEnemyWeaponDrop,
} from './weapons.js';

/** Frame sequences while a posed boss idles / speaks (idle pose vs. gesture). */
const BOSS_TALK_FRAMES = {
  giantbat: { idle: ['fly1', 'fly0', 'fly1', 'fly2'], talk: ['fly1', 'dive', 'fly0', 'fly1', 'fly2', 'dive'] },
  treant: { idle: ['idle0', 'idle1'], talk: ['idle0', 'roar', 'idle1', 'roar', 'slam'] },
  greatjack: { idle: ['flame0', 'flame1'], talk: ['flame0', 'spit', 'flame1', 'flame0', 'spit'] },
  devilsanta: { idle: ['idle'], talk: ['idle', 'throw', 'idle', 'lunge', 'throw'] },
  bonecaptain: { idle: ['walk0'], talk: ['walk0', 'throw0', 'walk1', 'throw1', 'walk0'] },
  reaper: { idle: ['idle0', 'idle1'], talk: ['idle0', 'windup', 'idle1', 'swing', 'idle0'] },
  cinderqueen: { idle: ['idle'], talk: ['idle', 'cast', 'erupt', 'idle', 'cast'] },
  gorgon: { idle: ['a', 'b'], talk: ['a', 'stare', 'b', 'a', 'stare'] },
  automaton: { idle: ['idle'], talk: ['idle', 'walk', 'overload', 'idle', 'punch'] },
  archivist: { idle: ['idle'], talk: ['idle', 'cast', 'summon', 'idle', 'shield'] },
  archon: { idle: ['idle', 'roar'], talk: ['roar', 'pounce', 'idle', 'roar', 'shell'] },
  reaperlord: { idle: ['idle0', 'idle1'], talk: ['idle0', 'windup', 'idle1', 'swing'] },
  count: { idle: ['idle'], talk: ['idle', 'cast', 'cape', 'idle', 'cast'] },
};

/** Sheet-specific overrides for dedicated Castle Wing boss sheets (`Stages 14–18`). */
const BOSS_SHEET_TALK_FRAMES = {
  alchemist: { idle: ['idle'], talk: ['idle', 'cast', 'summon', 'idle', 'shield'] },
  masquerade: { idle: ['idle', 'cape'], talk: ['idle', 'cape', 'cast', 'lunge', 'cape'] },
  gladiator: { idle: ['walk0'], talk: ['walk0', 'throw0', 'walk1', 'throw1', 'walk0'] },
  oracle: { idle: ['a', 'b'], talk: ['a', 'stare', 'b', 'a', 'stare'] },
  seraph: { idle: ['idle', 'roar'], talk: ['idle', 'roar', 'pounce', 'roar', 'shell'] },
};

/** Idle pose frame shown while a boss speaks (for sheets without a 'walk0'). */
const BOSS_POSE_FRAME = {
  giantbat: 'fly1', gorgon: 'a', greatjack: 'flame0', bonecaptain: 'walk0', treant: 'idle0',
  cinderqueen: 'idle', automaton: 'idle', archivist: 'idle', archon: 'roar',
  devilsanta: 'idle', count: 'idle', reaper: 'idle0', reaperlord: 'idle0',
  alchemist: 'idle', masquerade: 'idle', gladiator: 'walk0', oracle: 'a', seraph: 'idle',
};

export const BOSS_LINES = {
  giantbat: 'SMELL THAT WARM PULSE IN THE MIST, LITTLE HUNTER... MY FANGS SHALL DRAIN YOUR VEINS DRY!',
  treant: 'HEAR THE HUNGRY ROOTS COILING BENEATH YOUR BOOTS... FEED YOUR BONES TO THE DARKWOOD!',
  greatjack: 'COME CLOSER TO THE LANTERN LIGHT, WANDERER... MY GRINNING FLAMES WILL ROAST YOUR SOUL!',
  devilsanta: 'ANOTHER NAUGHTY MORTAL SHIVERING IN THE SNOW... UNWRAP THE FROZEN GRAVE I CARVED FOR YOU!',
  bonecaptain: 'HALT UPON THE BATTLEMENTS, WORM! ARCHERS! CLEAVE THIS TRESPASSER TO RIBBONS!',
  reaper: 'EVERY HEARTBEAT ECHOES CLOSER TO THE CRYPT, MORTAL... YIELD YOUR SOUL TO MY SCYTHE!',
  cinderqueen: 'FEEL THE MAGMA RISING BENEATH YOUR HEELS, LITTLE MOTH... BURN TO ASH BEFORE THE CINDER THRONE!',
  gorgon: 'DARE YOU LIFT YOUR TREMBLING EYES TO MINE, INTRUDER? SHATTER INTO ETERNAL STONE!',
  automaton: 'INSERT YOUR BEATING HEART INTO THE SLOT, PLAYER... THE HOUSE ALWAYS COLLECTS IN BLOOD!',
  archivist: 'SHHH... SILENCE IN THE FORBIDDEN STACKS, HUNTER... YOUR STORY ENDS IN BLOOD ON THIS PAGE!',
  archon: 'A THOUSAND NIGHTS I HAVE HUNGERED IN THE RAFTERS, WORM! KNEEL BENEATH THE GLASS OR BE CRUSHED TO DUST!',
  reaperlord: 'LISTEN... THE GEARS OF MIDNIGHT TOLL YOUR FINAL BREATH... BOW BEFORE THE LORD OF DEATH!',
  count: 'SO... THE LITTLE HUNTER CRAWLS BLEEDING INTO MY THRONE HALL... TONIGHT THE DARKNESS DRINKS ITS FILL!',
};

export class World {
  /** `carry` = {score, lives, hearts, subWeapon} when continuing from a stage. */
  constructor(game, data, carry = null) {
    this.game = game;
    this.assets = game.assets;
    this.audio = game.audio;
    this.font = game.font;
    this.data = data;
    this.stage = data;
    this.theme = THEMES[data.theme] || THEMES.graveyard;
    // Forged wings inherit their base theme's 3D vistas, shader grading & cloud banks.
    this.fxTheme = this.theme.base || data.theme || 'graveyard';
    this.difficulty = game.difficulty;
    this.relics = game.getActiveRelics ? game.getActiveRelics() : new Set();
    this.level = new Level(data);
    this.stage3d = new Stage3D(this.assets, this.level, this.fxTheme, data);
    this.parallax = new Parallax(this.assets, this.level.height, this.theme.layers || 'outdoor');
    if (this.theme.base) this.parallax.setFxTheme(this.fxTheme);   // cloud banks, aurora & god rays of the base realm
    this.particles = new Particles();
    this.camera = new Camera(this.level.width, this.level.height);
    this.score = carry ? carry.score : 0;
    this.lives = carry ? carry.lives : this.difficulty.lives;
    const bonusVessels = game.getVesselCount ? game.getVesselCount() : 0;
    this.hearts = carry ? carry.hearts : (this.difficulty.hearts + bonusVessels * 2 + this.relicBonus('hearts'));
    this.subWeaponCarry = carry ? carry.subWeapon : null;
    this.carryHp = carry && carry.hp ? carry.hp : null;
    this.enterFromDoorId = carry && carry.enterFromDoorId ? carry.enterFromDoorId : null;
    this.timeLeft = this.difficulty.time;
    this.checkpoint = 0;
    this.time = 0;
    this.regenT = 0;
    this.killCount = 0;
    this.freeThrow = false;
    this.flash = 0;
    this.boltX = -1;
    this.boltSeed = 0;
    this.restrikeT = -1;
    const forceBolt = game.params && game.params.has && game.params.has('lightning');
    this.nextLightning = forceBolt ? 0.12 : (4.5 + Math.random() * 5.5);
    this.thunderDelay = -1;
    this.messages = [];          // {text, sub, t, dur}
    this.popups = [];            // {x, y, vy, text, sub, color, scale, t, dur}
    this.expFlashT = 0;
    this.levelUpFlashT = 0;
    this.shockRings = [];        // {x, y, t, dur, maxR, color}
    this.waterRipples = [];      // {x, y, t, dur, amp}
    this._fogWorldY = null;      // world-space terrain elevation for ground mist (never player.y!)
    this.phase = 'intro';        // intro | play | dying | respawn | clear | gameover
    this.phaseT = 0;
    this.hitStop = 0;               // frozen ticks after a whip connects (hit-stop)
    this.bossActive = false;
    this.boss = null;
    this.bossSpoken = false;
    this.voiceCue = null;
    this.ally = null;
    this.flakes = this.theme.weather === 'snow' ? makeFlakes(120, 'snow')
      : this.theme.weather === 'fireflies' ? makeFlakes(42, 'fireflies')
      : this.theme.weather === 'embers' ? makeFlakes(44, 'embers')
      : (this.theme.weather === 'leaves' || this.fxTheme === 'forest' ? makeFlakes(36, 'leaves') : null);
    this.spawnAll();
    if (this.audio.prefetch) this.audio.prefetch('boss');
    if (data.boss && this.audio.prefetchVoice) this.audio.prefetchVoice(data.boss.voice || data.boss.type);
  }

  hasRelic(key) { return this.relics ? this.relics.has(key) : false; }

  /**
   * Summed bonus of a given kind ('maxHp' | 'hearts' | 'whip' | 'subDmg' | 'speed' | 'invuln')
   * from active built-in wing relics (`r.bonuses`) and Castle Forge relics (`r.effect`).
   */
  relicBonus(kind) {
    if (!this.relics) return 0;
    let total = 0;
    for (const key of this.relics) {
      const r = BOSS_RELICS[key];
      if (!r) continue;
      if (r.bonuses && r.bonuses[kind]) total += r.bonuses[kind];
      if (r.effect) {
        const b = FORGED_RELIC_EFFECTS[r.effect];
        if (b && b[kind]) total += b[kind];
      }
    }
    return total;
  }

  /** Total hunter Max HP combining base, Cathedral relic, Ancient Vessels, Forge/Wing relics & Character Level. */
  computeMaxHp() {
    const vesselBonus = this.game && this.game.getVesselCount ? this.game.getVesselCount() : 0;
    const lvBonus = this.game && this.game.getLevelBonuses ? this.game.getLevelBonuses().maxHpBonus : 0;
    return (this.hasRelic('cathedral') ? 20 : PLAYER.maxHp) + vesselBonus + this.relicBonus('maxHp') + lvBonus;
  }

  getAttackMult() {
    return this.game && this.game.getLevelBonuses ? this.game.getLevelBonuses().attackMult : 1;
  }

  getDamageTakenMult() {
    return this.game && this.game.getLevelBonuses ? this.game.getLevelBonuses().damageTakenMult : 1;
  }

  getHandWeapon(slot) {
    if (this.game && this.game.getHandWeapon) return this.game.getHandWeapon(slot);
    return slot === 0 ? WEAPONS.hunters_lash : null;
  }

  // ------------------------------------------------------------- setup

  /** (Re)creates all dynamic entities from the stage data. */
  spawnAll() {
    const d = this.data;
    this.enemies = [];
    this.candles = [];
    this.items = [];
    this.projectiles = [];
    this.fires = [];
    this.waterRipples = [];
    this._fogWorldY = null;
    this.spawners = d.spawners.map((s) => new Spawner(s));
    this.boss = null;
    this.bossActive = false;
    this.bossSpoken = false;
    this.voiceCue = null;
    this.bossIntro = null;
    this.bossHold = false;
    this.gateClosed = false;
    this.camera.resetBounds();
    this.level = new Level(d);     // restores breakable blocks & crumbling slabs
    this.stage3d = new Stage3D(this.assets, this.level, this.fxTheme, d);
    this.level.updateMechanics(0, this.time, null, null);
    for (const c of d.candles) {
      this.candles.push(new Candle(c[0] * TILE + TILE / 2, c[1] * TILE, c[2] || null));
    }
    for (const e of d.enemies) {
      const en = createEnemy(e);
      if (en) this.spawnEnemy(en);
    }
    const exp = populateExploration(this);
    this.sanctuary = exp.sanctuary;
    this.passages = exp.passages;
    this.vessel = exp.vessel;
    this.pedestal = exp.pedestal;
    this.landmarks = [this.sanctuary, ...(this.passages || []), this.vessel, this.pedestal].filter(Boolean);
    this.stage3d.excludeLandmarks(this.landmarks);
    this.inSecretArea = false;

    const cx = d.checkpoints[this.checkpoint];
    const col = Math.floor(cx / TILE);
    const row = Array.isArray(d.checkpointRows) && d.checkpointRows[this.checkpoint] != null
      ? d.checkpointRows[this.checkpoint]
      : (this.checkpoint === 0 && d.start ? Math.round(d.start.y / TILE) : this.level.surfaceRow(col));
    this.player = new Player(cx, (row >= 0 ? row : 11) * TILE);
    this.player.onGround = row >= 0;
    this.player.maxHp = this.computeMaxHp();
    this.player.hp = (this.carryHp && this.checkpoint === 0)
      ? Math.min(this.player.maxHp, this.carryHp)
      : this.player.maxHp;
    this.carryHp = null;
    this.player.airJumpsLeft = this.hasRelic('graveyard') ? 1 : 0;
    this.player.facing = 1;
    this.player.subWeapon = this.subWeaponCarry;
    const w0 = this.getHandWeapon(0);
    this.player.noWhip = !!(w0 && !w0.isWhip);

    let enteredViaPassage = false;
    if (this.enterFromDoorId && this.checkpoint === 0) {
      const target = this.enterFromDoorId === 'sanctuary'
        ? this.sanctuary
        : this.passages.find((g) => g.id === this.enterFromDoorId);
      if (target) {
        this.player.x = target.x;
        this.player.y = target.y;
        this.player.onGround = true;
        if (target === this.sanctuary) target.usedThisVisit = true;
        enteredViaPassage = true;
      }
      this.enterFromDoorId = null;
    }

    const hasTurtle = d.ally === 'turtle' || this.theme.ally === 'turtle';
    this.ally = hasTurtle ? new TurtleAlly(this.player.x + 28, this.player.y) : null;
    this.camera.snapTo(this.player.x, this.player.y);
    if (enteredViaPassage) {
      this.phase = 'play';
      this.phaseT = 0;
      this.messages = [];
      this.showMessage(d.name, d.subtitle || 'CONNECTED AREA', 1.9);
    } else {
      this.phase = 'intro';
      this.phaseT = 0;
      this.showMessage(d.name, d.subtitle || '', 2.6);
    }
    this.recordExploration();
  }

  // --------------------------------------------------------- utilities
  sfx(name) { this.audio.sfx(name); }
  addScore(n) { this.score += Math.round(n * this.difficulty.scoreMult); }
  showMessage(text, sub, dur = 2) { this.messages = [{ text, sub, t: 0, dur }]; }
  /** Registers an enemy, scaling health, contact force & boss tempo by stage rank and difficulty. */
  spawnEnemy(e) {
    const rank = stageRankFor(this.stage);
    const isBoss = e === this.boss || !!(e && e.arena);
    if (isBoss) {
      // Ensure late-game Castle Wings & forged bosses scale with castle depth rather than early-stage base HP
      const rankFloorHp = Math.round(38 + rank * 7.6);
      if (e.hp < rankFloorHp) e.hp = rankFloorHp;
      e.hp = Math.max(12, Math.round(e.hp * this.difficulty.enemyHp));
      e.maxHp = e.hp;
      e.touchDamage = Math.max(3, Math.round((e.touchDamage || 3) * (1 + Math.max(0, rank - 1) * 0.042)));
      e.swingDamage = Math.max(4, Math.round((e.swingDamage || 5) * (1 + Math.max(0, rank - 1) * 0.048)));
      if (e.tempo && rank >= 9) {
        e.tempo *= Math.max(0.76, 1 - (rank - 8) * 0.015);
      }
    } else {
      const rankHpMult = 1 + Math.max(0, rank - 1) * 0.088;
      if (e.hp > 1 || rank >= 4) {
        e.hp = Math.max(1, Math.round(e.hp * rankHpMult * this.difficulty.enemyHp));
        if (e.maxHp != null) e.maxHp = e.hp;
      }
      e.touchDamage = Math.max(2, Math.round((e.touchDamage || 2) * (1 + Math.max(0, rank - 1) * 0.042)));
    }
    this.enemies.push(e);
  }
  spawnProjectile(p) { this.projectiles.push(p); }
  spawnFire(x, y, owner = 'player') { this.fires.push(new Fire(x, y, owner)); this.sfx('fire'); }
  spawnItem(type, x, y) { if (type) this.items.push(new Item(type, x, y)); }

  onPlayerProjectile(type, x, y, dir) {
    if (this.game && this.game.net && this.game.net.connected) {
      this.game.net.sendEvent('projectile', { type, x: Math.round(x), y: Math.round(y), dir });
    }
  }

  throwSubWeapon(player) {
    if (this.hasRelic('arcade')) {
      if (!this.freeThrow) this.hearts = Math.max(0, this.hearts - 1);
      this.freeThrow = !this.freeThrow;
    } else {
      this.hearts = Math.max(0, this.hearts - 1);
    }
    const px = player.x + player.facing * 10;
    const py = player.y - 44;
    const p = new Projectile(player.subWeapon, px, py, player.facing, 'player');
    if (this.hasRelic('darkcave')) p.damage += 1;
    p.damage += this.relicBonus('subDmg');
    this.projectiles.push(p);
    this.sfx('throw');
    this.onPlayerProjectile(player.subWeapon, px, py, player.facing);
  }

  spawnPopup(x, y, text, { sub = null, color = '#ffe9a0', scale = 1, dur = 1.15, vy = -26, banner = false, maxAlpha = 1 } = {}) {
    if (this.popups.length >= 16) this.popups.shift();
    this.popups.push({ x, y, vy, text, sub, color, scale, t: 0, dur, banner, maxAlpha });
  }

  /**
   * Awards experience points for defeating `enemy` via the Adaptive Curve
   * Dynamic Return Formula (anti-grind decay when over-leveled, rubber-band
   * catch-up multiplier when under-leveled).
   */
  awardEnemyExp(enemy, { isBoss = false } = {}) {
    if (!enemy || enemy._expAwarded) return;
    if (!this.game || this.game.titleWorld === this || !this.game.gainExp) return;
    if (!isBoss && this.player && Math.abs(enemy.x - this.player.x) > W * 0.9) return;
    enemy._expAwarded = true;

    const pLv = this.game.charLevel || 1;
    const profile = enemyExpProfile(enemy, this.stage, { isBoss });
    const yieldInfo = computeExpYield(profile.baseExp, pLv, profile.enemyLevel);
    const res = this.game.gainExp(yieldInfo.exp);
    this.expFlashT = 0.28;

    if (res.leveledUp && this.player) {
      this.levelUpFlashT = 1.1;
      this.sfx('level_up');
      const prevMax = this.player.maxHp || PLAYER.maxHp;
      const newMax = this.computeMaxHp();
      const hpDelta = Math.max(0, newMax - prevMax);
      this.player.maxHp = newMax;
      if (this.player.alive) {
        this.player.hp = Math.min(newMax, this.player.hp + hpDelta + 3);
        this.hearts = Math.min(99, this.hearts + 2);
      }
      this.particles.sparks(this.player.x, this.player.y - 32, 6, '#e8cfa0');
      this.spawnPopup(
        this.player.x,
        this.player.y - 70,
        `LV ${String(res.level).padStart(2, '0')}`,
        {
          color: '#e8cfa0',
          scale: 1,
          dur: 1.15,
          vy: -14,
          maxAlpha: 0.78,
        },
      );

      if (this.game.net && this.game.net.connected) {
        this.game.net.sendEvent('level_up', {
          level: res.level,
          x: Math.round(this.player.x),
          y: Math.round(this.player.y),
        });
      }
    }
  }

  onEnemyKilled(enemy) {
    if (enemy !== this.boss) {
      this.awardEnemyExp(enemy);
      if (!this.game || this.game.titleWorld !== this) {
        const dropWid = rollEnemyWeaponDrop(enemy, this.game);
        if (dropWid) {
          this.spawnItem(`weapon:${dropWid}`, enemy.x, enemy.y - 16);
        }
      }
    }
    // SOUL HARVEST relic (Catacombs): every 6 enemies slain restores +1 HP and +1 Heart!
    if (this.hasRelic('catacombs') && enemy !== this.boss) {
      this.killCount = (this.killCount || 0) + 1;
      if (this.killCount % 6 === 0 && this.player && this.player.alive) {
        const cap = this.player.maxHp || PLAYER.maxHp;
        this.player.hp = Math.min(cap, this.player.hp + 1);
        this.hearts = Math.min(99, this.hearts + 1);
        this.particles.sparks(this.player.x, this.player.y - 32, 8, '#9ad17a');
      }
    }
  }

  /** Post-FX hooks (consumed by main.js each frame). */
  onPlayerHurt(dmg) { this.fxHurt = Math.min(1, 0.45 + dmg * 0.12); }
  onBossRoar() {
    this.fxRoar = 0.8;
    if (this.boss) {
      const col = this.fxTheme === 'darkwood' ? [0.22, 0.96, 0.72]
        : this.fxTheme === 'darkcave' ? [1.0, 0.42, 0.10]
        : this.fxTheme === 'cathedral' || this.fxTheme === 'throne' ? [0.98, 0.18, 0.34]
        : [0.72, 0.42, 1.0];
      this.emitShockwave(this.boss.x, this.boss.y - this.boss.h * 0.42, { maxR: 124, dur: 0.48, strength: 0.95, color: col });
    }
  }

  /** Spawns an expanding world-space WebGL shockwave ring + PostFX radial lens wave. */
  emitShockwave(worldX, worldY, { maxR = 136, dur = 0.48, strength = 0.85, color = [1.0, 0.72, 0.34] } = {}) {
    if (this.shockRings.length < 8) {
      this.shockRings.push({ x: worldX, y: worldY, t: 0, dur, maxR, color });
    }
    if (strength > 0 && this.camera) {
      this.fxShock = {
        x: (worldX - this.camera.rx) / W,
        y: (worldY - this.camera.ry) / H,
        strength,
      };
    }
  }

  onPlayerDeath() {
    this.phase = 'dying'; this.phaseT = 0;
    this.sfx('die');
    this.audio.stopMusic(0.8);
  }

  onBossDefeated(boss) {
    this.bossActive = false;
    const a = (boss && boss.arena) || this.data.boss.arena;
    const minY = (a.ceilY != null ? a.ceilY : a.floorY - 220) + 48;
    const maxY = a.floorY - 48;
    const ox = Math.max(a.x0 + 48, Math.min(a.x1 - 48, boss.x));
    const oy = Math.max(minY, Math.min(maxY, boss.y - 36));
    this.emitShockwave(ox, oy, { maxR: 190, dur: 0.65, strength: 1.25, color: [1.0, 0.82, 0.42] });
    const orb = new Item('orb', ox, oy);
    orb.arenaFloorY = a.floorY;
    orb.arenaX0 = a.x0 + 28;
    orb.arenaX1 = a.x1 - 28;
    this.items.push(orb);
    this.sfx('orb');
    if (this.audio && this.audio.playMusic) {
      this.audio.playMusic('clear', false);
    }
    this.enemies = this.enemies.filter((e) => e === boss);
    this.projectiles = this.projectiles.filter((p) => p.owner !== 'enemy');
    this.fires = [];
    if (this.game && this.game.net && this.game.net.connected && !this._remoteBossClear) {
      this.game.net.sendEvent('boss_clear', {
        stageKey: this.stage.key,
        bossName: (this.data.boss && this.data.boss.name) || 'BOSS',
      });
    }
    this._remoteBossClear = false;
  }

  /** Applies cooperative remote actions from another hunter in this exact stage. */
  handleRemoteEvent(ev, peer) {
    if (!ev || !peer || peer.stageKey !== this.stage.key) return;
    const d = ev.data || {};
    if (ev.kind === 'projectile' && d.type) {
      const pr = new Projectile(d.type, d.x ?? peer.x, d.y ?? (peer.y - 42), d.dir === -1 ? -1 : 1, 'player');
      pr.isRemote = true;
      this.projectiles.push(pr);
      if (Math.abs((d.x ?? peer.x) - this.player.x) < W * 0.85) this.sfx('throw');
    } else if (ev.kind === 'hit') {
      const hx = d.x ?? peer.x;
      const hy = d.y ?? (peer.y - 36);
      const dmg = Math.max(1, Math.min(18, Number(d.dmg) || 2));
      if (Math.abs(hx - this.camera.rx - W * 0.5) < W) {
        this.particles.sparks(hx, hy, 5, '#9ef5dc');
      }
      if (d.isBoss) {
        if (this.boss && this.boss.alive && !this.boss.introPose) {
          if (this.boss.hp <= dmg) this._remoteBossClear = true;
          this.boss.takeHit(dmg, peer.x, this);
        }
      } else {
        let best = null, bestDist = 72;
        for (const e of this.enemies) {
          if (!e.alive || e === this.boss) continue;
          const dist = Math.hypot(e.x - hx, (e.y - e.h * 0.5) - hy);
          if (dist < bestDist) { bestDist = dist; best = e; }
        }
        if (best) best.takeHit(dmg, peer.x, this);
      }
    } else if (ev.kind === 'salute') {
      peer.saluteT = 1.8;
      if (Math.abs(peer.x - this.camera.rx - W * 0.5) < W) {
        this.particles.sparks(peer.x, peer.y - 44, 8, '#ffd27a');
        this.sfx('pickup');
      }
    } else if (ev.kind === 'level_up') {
      if (d.level) peer.level = d.level;
      if (Math.abs(peer.x - this.camera.rx - W * 0.5) < W) {
        this.particles.sparks(peer.x, peer.y - 38, 5, '#e8cfa0');
        this.spawnPopup(peer.x, peer.y - 68, `LV ${String(d.level || peer.level || 2).padStart(2, '0')}`, {
          color: '#e8cfa0',
          dur: 1.0,
          vy: -12,
          maxAlpha: 0.68,
        });
      }
    }
  }

  // ------------------------------------------------------------ update
  update(dt, input) {
    this.time += dt;
    { const fxl = getFxLayers(); if (fxl) fxl.update(dt); }
    this.phaseT += dt;
    this.parallax.update(dt);
    this.particles.update(dt);
    this.updateLightning(dt);
    this.updateWeather(dt);
    this.expFlashT = Math.max(0, this.expFlashT - dt);
    this.levelUpFlashT = Math.max(0, this.levelUpFlashT - dt);
    for (const m of this.messages) m.t += dt;
    this.messages = this.messages.filter((m) => m.t < m.dur);
    for (const pop of this.popups) {
      pop.t += dt;
      pop.y += pop.vy * dt;
      pop.vy *= 0.96;
    }
    this.popups = this.popups.filter((pop) => pop.t < pop.dur);
    for (const r of this.shockRings) r.t += dt;
    this.shockRings = this.shockRings.filter((r) => r.t < r.dur);
    for (const wr of this.waterRipples) wr.t += dt;
    this.waterRipples = this.waterRipples.filter((wr) => wr.t < wr.dur);
    if (this.voiceCue) {
      this.voiceCue.t += dt;
      if (this.voiceCue.t >= this.voiceCue.dur) this.voiceCue = null;
    }
    // Hit-stop: a few frozen ticks when the whip lands (particles, weather and
    // the shake keep moving). A jump pressed inside the freeze is buffered.
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      if (input && input.pressed && input.pressed.jump && this.player.alive) this.player.jumpBuffer = PLAYER.buffer;
      return;
    }

    if (this.phase === 'intro' && this.phaseT > 0.6) this.phase = 'play';
    if (this.phase === 'clear') { this.updateEntities(dt, input, false); return; }
    if (this.phase === 'dying') {
      this.level.updateMechanics(dt, this.time, null, null);
      this.player.update(dt, input, this.level, this);
      for (const e of this.enemies) if (e.deathT >= 0) e.update(dt, this.level, this);
      this.camera.update(dt, this.player, this.player.facing);
      if (this.phaseT > 2.3) {
        this.lives -= 1;
        if (this.lives < 0) { this.phase = 'gameover'; this.phaseT = 0; this.game.onGameOver(); }
        else { this.timeLeft = this.difficulty.time; this.spawnAll(); this.game.onRespawn(); }
      }
      return;
    }
    if (this.phase === 'gameover') return;

    if (!(this.boss && !this.boss.alive)) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0 && this.player.alive) { this.timeLeft = 0; this.player.hp = 0; this.player.die(this); }
    }
    // BRIAR BARK relic (Darkwood): slowly mends +1 HP every 8 seconds in combat
    if (this.phase === 'play' && this.hasRelic('darkwood') && this.player.alive) {
      const cap = this.player.maxHp || PLAYER.maxHp;
      if (this.player.hp < cap) {
        this.regenT += dt;
        if (this.regenT >= 8.0) {
          this.regenT = 0;
          this.player.hp = Math.min(cap, this.player.hp + 1);
          this.particles.sparks(this.player.x, this.player.y - 28, 6, '#62f2c2');
        }
      } else {
        this.regenT = 0;
      }
    }
    // Salute / lantern flare (`G`) to greet fellow hunters
    if (this.phase === 'play' && input && input.pressed && input.pressed.salute && this.player.alive) {
      this.player.saluteT = 1.8;
      this.particles.sparks(this.player.x, this.player.y - 44, 8, '#ffd27a');
      this.sfx('pickup');
      if (this.game && this.game.net && this.game.net.connected) {
        this.game.net.sendEvent('salute', { x: Math.round(this.player.x), y: Math.round(this.player.y) });
      }
    }
    this.updateEntities(dt, input, true);
  }

  updateEntities(dt, input, live) {
    const p = this.player;
    const lvl = this.level;
    setClipClock(this.time);   // enemy / boss clip animations run on this clock (frozen by hit-stop)

    // Advance 2.5D moving platforms, orbiting gears & crumbling slabs first,
    // carrying any grounded entities smoothly along their tracks.
    lvl.updateMechanics(dt, this.time, p, live ? this : null);
    lvl.carryEntity(p);
    if (this.ally) lvl.carryEntity(this.ally);
    for (const e of this.enemies) if (!e.flies) lvl.carryEntity(e);
    for (const it of this.items) lvl.carryEntity(it);

    if (live) p.update(dt, input, lvl, this);
    else { p.vx = 0; p.physics(lvl, dt); p.state = 'idle'; }

    // Checkpoints / boss intro sequence (gate + name banner -> voice line -> battle)
    for (let i = this.data.checkpoints.length - 1; i > this.checkpoint; i--) {
      if (p.x >= this.data.checkpoints[i]) { this.checkpoint = i; break; }
    }
    if (!this.bossActive && (!this.boss || this.boss.introPose) && live && this.data.boss && p.x >= this.data.boss.triggerX) {
      this.updateBossIntro(dt, p);
    }
    // Remember the last solid footing (for forgiving pit falls on Easy).
    if (p.onGround && p.alive && !p.riding) {
      const tx = Math.floor(p.x / TILE), ty = Math.floor((p.y + 1) / TILE);
      if (lvl.isSolid(tx, ty) && lvl.isSolid(tx - 1, ty) && lvl.isSolid(tx + 1, ty)) this.lastSafe = { x: p.x, y: p.y };
    }
    if (p.y > lvl.height + 80 && p.alive) {
      if (this.difficulty.pitForgiving && this.lastSafe) {
        p.x = this.lastSafe.x; p.y = this.lastSafe.y; p.vx = 0; p.vy = 0;
        p.invuln = 0; p.hurt(4, p.x + 1, this);
        p.vx = 0; p.vy = -120;
        this.camera.snapTo(p.x, p.y);
        this.particles.dust(p.x, p.y, 10);
      } else { p.hp = 0; p.die(this); }
    }

    // Enemies
    for (const s of this.spawners) s.update(dt, this);
    const camL = this.camera.x - 160, camR = this.camera.x + W + 160;
    for (const e of this.enemies) {
      if (e === this.boss || e.active || (e.x > camL && e.x < camR)) {
        e.active = true;
        e.update(dt, lvl, this);
      }
    }
    for (const pr of this.projectiles) pr.update(dt, lvl, this);
    for (const it of this.items) it.update(dt, lvl, this);
    for (const f of this.fires) f.update(dt);
    if (this.ally) {
      if (live) this.ally.update(dt, lvl, this);
      else { this.ally.vx = 0; this.ally.physics(lvl, dt); }
    }

    if (live && p.alive) {
      this.inSecretArea = false;
      if (this.sanctuary) this.sanctuary.update(p, this);
      if (this.vessel) this.vessel.update(p, this);
      if (this.pedestal) this.pedestal.update(p, this);
      if (this.passages) {
        for (const g of this.passages) {
          g.update(p, input, this);
          if (this.game && this.game.world && this.game.world !== this) return;
        }
      }
      this.recordExploration();
      this.resolveCombat(dt);
    }
    this.updateWaterInteractions(dt);

    this.enemies = this.enemies.filter((e) => !e.dead);
    this.projectiles = this.projectiles.filter((e) => !e.dead);
    this.items = this.items.filter((e) => !e.dead);
    this.fires = this.fires.filter((e) => !e.dead);
    this.candles = this.candles.filter((e) => !e.dead);

    this.camera.update(dt, p, p.facing);
  }

  resolveCombat() {
    const p = this.player;
    const lvl = this.level;
    const strTotal = computeStrengthBreakdown(this).total;
    const flatBonus = (this.hasRelic('jack') ? 1 : 0) + this.relicBonus('whip');
    const diffMult = (this.difficulty.playerDamage || 1) * this.getAttackMult();

    // Dual-Hand Equipment Matrix (`Hand_L` & `Hand_R`) vs candles, blocks, enemies, projectiles
    const strikes = p.activeWeaponStrikes ? p.activeWeaponStrikes() : [];
    const legacyWhip = strikes.length === 0 ? p.whipBox() : null;
    if (legacyWhip && !p.attackHit) {
      strikes.push({
        slotState: { timer: 0.2, win0: 0.14, win1: 0.26, isSkill: false, hitEnemies: new Map(), legacy: true },
        weapon: WEAPONS.hunters_lash,
        box: legacyWhip,
      });
    }

    for (const strike of strikes) {
      const { slotState, weapon, box } = strike;
      let hitSomething = false;

      for (const c of this.candles) {
        if (!c.dead && rectsOverlap(box, c.box)) {
          c.dead = true; hitSomething = true;
          this.sfx('candle');
          this.particles.embers(c.x, c.y - 50, 10);
          this.particles.sparks(c.x, c.y - 40, 6, '#ffd27a');
          this.addScore(SCORE.candle);
          this.spawnItem(c.drop || rollDrop(), c.x, c.y - 40);
        }
      }

      const tx0 = Math.floor(box.x / TILE), tx1 = Math.floor((box.x + box.w) / TILE);
      const ty0 = Math.floor(box.y / TILE), ty1 = Math.floor((box.y + box.h) / TILE);
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        if (lvl.tile(tx, ty) !== T_BLOCK) continue;
        const drop = lvl.breakBlock(tx, ty);
        hitSomething = true;
        this.sfx('block');
        this.camera.shake(2, 0.12);
        this.hitStop = Math.max(this.hitStop, 0.04);
        this.particles.shards(tx * TILE + 16, ty * TILE + 30, 12, '#8a9ab5', ty * TILE + 32);
        if (drop) this.spawnItem(drop, tx * TILE + 16, ty * TILE + 20);
      }

      const multiHits = (slotState.isSkill && weapon.skill && weapon.skill.multiHit) || weapon.multiHit || 1;
      const activeSpan = Math.max(0.04, slotState.win1 - slotState.win0);
      const rehitGap = multiHits > 1 ? (activeSpan / multiHits) : 999;
      const skillMult = (slotState.isSkill && weapon.skill && weapon.skill.mult) ? weapon.skill.mult : 1;

      for (const e of this.enemies) {
        if (!e.alive) continue;
        const prevInfo = slotState.hitEnemies.get(e);
        if (prevInfo && (prevInfo.count >= multiHits || (slotState.timer - prevInfo.lastT) < rehitGap)) continue;

        const hitBox = e === this.boss ? e.box(12) : (e.flies ? e.box(8) : e.box());
        if (rectsOverlap(box, hitBox)) {
          slotState.hitEnemies.set(e, {
            count: (prevInfo ? prevInfo.count : 0) + 1,
            lastT: slotState.timer,
          });
          const hit = computeWeaponHit(weapon, strTotal, e, { skillMult, flatBonus, diffMult });
          this._hitArmorPiercing = !!weapon.armorPiercing;
          e.takeHit(hit.damage, p.x, this, { armorPiercing: !!weapon.armorPiercing });
          this._hitArmorPiercing = false;

          if (e !== this.boss && !e.flies && e.alive && weapon.knockback >= 180) {
            e.vx = (p.x < e.x ? 1 : -1) * weapon.knockback;
            e.knockT = Math.max(e.knockT || 0, 0.22);
          }
          if (slotState.isSkill && weapon.skill && weapon.skill.siphonHp && p.alive) {
            p.hp = Math.min(p.maxHp || PLAYER.maxHp, p.hp + weapon.skill.siphonHp);
          }

          const elemCol = weapon.element && ELEMENT_META[weapon.element]
            ? ELEMENT_META[weapon.element].color
            : (this.hasRelic('jack') ? '#ff9a3c' : '#ffe9a0');
          const cx = Math.max(hitBox.x, Math.min(hitBox.x + hitBox.w, p.facing > 0 ? box.x + box.w * 0.85 : box.x + box.w * 0.15));
          const cy = Math.max(hitBox.y, Math.min(hitBox.y + hitBox.h, box.y + box.h * 0.5));
          this.particles.sparks(cx, cy, weapon.category === 'heavy_blade' ? 9 : 5, elemCol);

          if (!e._lastTagT || this.time - e._lastTagT > 0.65) {
            if (hit.deficit) {
              e._lastTagT = this.time;
              this.spawnPopup(e.x, e.y - e.h - 6, `${hit.damage} (0.5X STR)`, { color: '#ff7a6e', dur: 0.85, vy: -22 });
            } else if (hit.tag === 'weak') {
              e._lastTagT = this.time;
              this.spawnPopup(e.x, e.y - e.h - 6, 'WEAK!', { color: '#7ef7d4', dur: 0.78, vy: -24 });
            } else if (hit.tag === 'resist') {
              e._lastTagT = this.time;
              this.spawnPopup(e.x, e.y - e.h - 6, 'RESIST', { color: '#9aa8c4', dur: 0.75, vy: -20 });
            }
          }

          if (this.game && this.game.net && this.game.net.connected) {
            this.game.net.sendEvent('hit', {
              isBoss: e === this.boss,
              x: Math.round(cx),
              y: Math.round(cy),
              dmg: hit.damage,
            });
          }
          hitSomething = true;
          const shakeAmt = weapon.category === 'heavy_blade' ? 3.8 : (weapon.category === 'light_blade' || weapon.category === 'brawler' ? 1.6 : 2.5);
          this.camera.shake(shakeAmt, 0.1);
          const stopDur = weapon.category === 'heavy_blade'
            ? (e === this.boss ? 0.13 : 0.10)
            : (weapon.category === 'light_blade' || weapon.category === 'brawler' ? 0.04 : (e === this.boss ? 0.11 : 0.08));
          this.hitStop = Math.max(this.hitStop, stopDur);
        }
      }

      for (const pr of this.projectiles) {
        if (!pr.dead && pr.owner === 'enemy' && pr.type !== 'sickle' && rectsOverlap(box, pr.box)) {
          pr.dead = true; hitSomething = true;
          this.particles.sparks(pr.x, pr.y, 5, '#ffffff');
          this.sfx('hit');
        }
      }
      if (hitSomething && (weapon.category === 'whip' || slotState.legacy)) p.attackHit = true;
    }

    // Player projectiles (Heart sub-weapons, Boomerangs, Catalyst bolts & Skill waves) vs enemies / candles
    for (const pr of this.projectiles) {
      if (pr.dead || pr.owner !== 'player') continue;
      for (const e of this.enemies) {
        if (!e.alive || pr.hitSet.has(e)) continue;
        const projBox = (e === this.boss || e.flies) ? e.box(6) : e.box();
        if (rectsOverlap(pr.box, projBox)) {
          pr.hitSet.add(e);
          const projScale = (this.difficulty.playerDamage || 1) * (pr.isRemote ? 1 : this.getAttackMult());
          let finalDmg = Math.round(pr.damage * projScale * 10) / 10;
          if (pr.weaponMeta) {
            const hit = computeWeaponHit(
              { baseDamage: pr.damage, scaling: 0, reqStr: 0, physical: pr.weaponMeta.physical, element: pr.weaponMeta.element },
              strTotal,
              e,
              { diffMult: projScale },
            );
            finalDmg = hit.damage;
            this._hitArmorPiercing = !!pr.weaponMeta.armorPiercing;
            e.takeHit(finalDmg, pr.x, this, { armorPiercing: !!pr.weaponMeta.armorPiercing });
            this._hitArmorPiercing = false;
            if (pr.weaponMeta.siphonHp && p.alive) {
              p.hp = Math.min(p.maxHp || PLAYER.maxHp, p.hp + pr.weaponMeta.siphonHp);
            }
            if (!e._lastTagT || this.time - e._lastTagT > 0.65) {
              if (pr.weaponMeta.deficit) {
                e._lastTagT = this.time;
                this.spawnPopup(e.x, e.y - e.h - 6, `${finalDmg} (0.5X STR)`, { color: '#ff7a6e', dur: 0.85, vy: -22 });
              } else if (hit.tag === 'weak') {
                e._lastTagT = this.time;
                this.spawnPopup(e.x, e.y - e.h - 6, 'WEAK!', { color: '#7ef7d4', dur: 0.78, vy: -24 });
              } else if (hit.tag === 'resist') {
                e._lastTagT = this.time;
                this.spawnPopup(e.x, e.y - e.h - 6, 'RESIST', { color: '#9aa8c4', dur: 0.75, vy: -20 });
              }
            }
          } else {
            e.takeHit(finalDmg, pr.x, this);
          }
          if (pr.pierce > 0) pr.pierce--; else pr.dead = true;
          if (pr.type === 'holy_water') { this.spawnFire(pr.x, Math.floor((e.y) / TILE) * TILE); pr.dead = true; }
          if (pr.dead) break;
        }
      }
      for (const c of this.candles) {
        if (!pr.dead && rectsOverlap(pr.box, c.box)) {
          c.dead = true; this.sfx('candle'); this.particles.embers(c.x, c.y - 50, 8);
          this.addScore(SCORE.candle); this.spawnItem(c.drop || rollDrop(), c.x, c.y - 40);
          if (pr.pierce > 0) pr.pierce--; else pr.dead = true;
        }
      }
    }

    // Fire pools vs enemies / player
    const pb = p.box();
    for (const f of this.fires) {
      if (!f.shouldDamage()) continue;
      if (f.owner === 'enemy') {
        if (rectsOverlap(f.box, pb)) {
          const fireDmg = this.hasRelic('darkcave') ? 1 : 2;
          p.hurt(fireDmg, f.x, this);
        }
      } else {
        const fireHit = Math.round(this.getAttackMult() * 10) / 10;
        for (const e of this.enemies) if (e.alive && rectsOverlap(f.box, e.box())) e.takeHit(fireHit, f.x, this);
      }
    }

    // Enemy contact / melee / projectiles / spikes / lava vs player
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (!e.flies && !e.lavaImmune) {
        const etx = Math.floor(e.x / TILE), ety = Math.floor((e.y + 2) / TILE);
        if (lvl.isLava(etx, ety)) { e.kill(this); this.particles.embers(e.x, e.y, 10); continue; }
      }
      if (e === this.boss) {
        const sb = e.swingBox();
        if (sb && rectsOverlap(sb, pb)) { p.hurt(e.swingDamage || 5, e.x, this); continue; }
        if (e.alpha > 0.7 && rectsOverlap(e.box(-6), pb)) p.hurt(e.touchDamage, e.x, this);
        continue;
      }
      if (e.fade != null && e.fade < 0.55) continue;
      const mb = e.meleeBox && e.meleeBox();
      if (mb && rectsOverlap(mb, pb)) { p.hurt(e.touchDamage + 1, e.x, this); continue; }
      if (rectsOverlap(e.box(e.flies ? -4 : -2), pb)) p.hurt(e.touchDamage, e.x, this);
    }
    const shSlot = p.activeShieldSlot ? p.activeShieldSlot() : null;
    const rankProjScale = 1 + Math.max(0, stageRankFor(this.stage) - 1) * 0.04;
    for (const pr of this.projectiles) {
      if (pr.owner === 'enemy' && !pr.dead && rectsOverlap(pr.box, pb)) {
        // Active Shield Socket blocks frontal enemy projectiles with a metallic clang!
        if (shSlot && pr.type !== 'gaze' && (pr.x - p.x) * p.facing > 0) {
          pr.dead = true;
          this.sfx('block');
          this.particles.sparks(p.x + p.facing * 14, p.y - (p.crouching ? 22 : 36), 8, '#ffd27a');
          this.camera.shake(1.5, 0.08);
          this.spawnPopup(p.x, p.y - 54, 'GUARD!', { color: '#ffd27a', dur: 0.65, vy: -20 });
          continue;
        }
        let dmg = Math.max(1, Math.round(pr.damage * rankProjScale));
        if (this.hasRelic('darkcave') && (pr.type === 'fireball' || pr.type === 'magmaball' || pr.type === 'hellfire')) {
          dmg = Math.max(1, Math.round(dmg * 0.35));
        }
        const connected = p.hurt(dmg, pr.x, this);
        if (connected && pr.petrify) p.petrify(this);
        if (connected && !['sickle', 'skull', 'gas', 'gaze', 'hellfire'].includes(pr.type)) pr.dead = true;
        if (pr.type === 'skull' && p.invuln > 0) pr.dead = true;
      }
    }
    // Spikes & Molten Lava: feet region
    const ftx0 = Math.floor(pb.x / TILE), ftx1 = Math.floor((pb.x + pb.w - 1) / TILE);
    const fty = Math.floor((p.y - 2) / TILE);
    const lty = Math.floor((p.y + 2) / TILE);
    for (let tx = ftx0; tx <= ftx1; tx++) {
      if (lvl.isSpike(tx, fty) && p.y - 2 > fty * TILE + 10) {
        const spikeDmg = this.hasRelic('ramparts') ? 1 : 3;
        p.hurt(spikeDmg, p.x - p.facing * 10, this);
        break;
      }
      if (lvl.isLava(tx, lty) && p.y >= lty * TILE + 2) {
        let lavaDmg = 5;
        if (this.hasRelic('ramparts')) lavaDmg *= 0.5;
        if (this.hasRelic('darkcave')) lavaDmg *= 0.35;
        p.hurt(Math.max(1, Math.round(lavaDmg)), p.x - p.facing * 10, this);
        p.vy = -370;
        p.onGround = false;
        this.sfx('fire');
        this.particles.embers(p.x, p.y - 6, 12);
        break;
      }
    }

    // Items
    const itemPad = this.hasRelic('arcade') ? 10 : 2;
    for (const it of this.items) {
      if (it.dead) continue;
      if (rectsOverlap(it.box(itemPad), pb)) { it.dead = true; this.collect(it.type, it); }
    }
  }

  collect(type, item = null) {
    const p = this.player;
    const maxHp = p.maxHp || PLAYER.maxHp;
    if (item && item.weaponId) {
      this.onWeaponCollected(item.weaponId, item.x, item.y - 12, false);
      return;
    }
    if (typeof type === 'string' && type.startsWith('weapon:')) {
      this.onWeaponCollected(type.slice(7), p.x, p.y - 24, false);
      return;
    }
    switch (type) {
      case 'heart_small': this.hearts = Math.min(99, this.hearts + 1); this.sfx('heart'); break;
      case 'heart_big': this.hearts = Math.min(99, this.hearts + 5); this.sfx('heart'); break;
      case 'money': this.addScore(SCORE.money); this.sfx('pickup'); break;
      case 'meat': p.hp = Math.min(maxHp, p.hp + (this.hasRelic('cathedral') ? 12 : 8)); this.sfx('pickup'); break;
      case 'dagger': case 'axe': case 'holy_water':
        p.subWeapon = type; this.subWeaponCarry = type; this.sfx('pickup'); break;
      case 'orb': this.stageClear(); break;
      default: break;
    }
  }

  // ----------------------------------------------------------- scripting
  /** Frames the boss arena: lock X to the arena and Y so floor sits near the bottom with the ceiling in view. */
  frameArena(b) {
    this.camera.setBounds(b.camX, b.camX);
    const want = Math.max(0, Math.min(this.level.height - H, b.arena.floorY + 46 - H));
    this.camera.setBoundsY(want, want);
  }

  /** True while the boss approach voice line (and its subtitle) is still playing. */
  voiceSpeaking() {
    return !!(this.voiceCue && this.voiceCue.boss && this.voiceCue.t < this.voiceCue.dur);
  }

  /**
   * Boss intro, in order: (1) gate slams and the boss NAME banner appears,
   * (2) once the banner has been read the boss speaks its Daikon line with a
   * subtitle, (3) when the line ends the boss enters and the battle begins.
   * The hunter is held at the arena threshold throughout.
   */
  updateBossIntro(dt, p) {
    const b = this.data.boss;
    this.bossHold = true;
    if (p.x > b.triggerX) { p.x = b.triggerX; if (p.vx > 0) p.vx = 0; }
    if (!this.bossIntro) {
      this.bossIntro = { t: 0, stage: 'banner' };
      this.gateClosed = true;
      for (let r = b.gateRows[0]; r <= b.gateRows[1]; r++) this.level.set(b.gateCol, r, T_GATE);
      this.frameArena(b);
      this.enemies = this.enemies.filter((e) => e.x > b.camX - 100);
      this.sfx('gate');
      this.camera.shake(4, 0.5);
      this.audio.stopMusic(0.8);
      this.showMessage(b.name, 'DEFEAT IT TO CLAIM THE ORB', 3.2);
      // The boss materialises on its dais now, so it is on screen while it speaks.
      this.boss = createBoss(b.type || 'reaper', b.spawn.x, b.spawn.y, b.arena, this.difficulty);
      this.applyBossOverrides(this.boss, b);
      this.boss.alpha = 0;
      this.boss.introPose = true;
      this.boss.poseY = this.boss.y;
      if (!this.assets.frame(this.boss.sheet, this.boss.frame)) {
        const poseFallback = BOSS_POSE_FRAME[this.boss.sheet] || BOSS_POSE_FRAME[b.type];
        if (poseFallback && this.assets.frame(this.boss.sheet, poseFallback)) {
          this.boss.frame = poseFallback;
        }
      }
      return;
    }
    const intro = this.bossIntro;
    intro.t += dt;
    // Posed boss: fade in, breathe and gesture while it speaks; never acts or takes hits until the battle starts.
    if (this.boss && this.boss.introPose) {
      const bs = this.boss;
      bs.alpha = Math.min(1, bs.alpha + dt / 1.1);
      bs.t += dt; bs.flash = 0;
      const talking = intro.stage === 'voice';
      // Slow pacing / drifting on the dais (bounded to +-16 px around the spawn point)
      if (bs.poseX == null) bs.poseX = bs.x;
      const sway = Math.sin(bs.t * (talking ? 1.1 : 0.6)) * (talking ? 16 : 6);
      if (bs.flies) {
        bs.x = bs.poseX + sway;
        bs.y = bs.poseY + Math.sin(bs.t * 2.2) * 6 + (talking ? Math.sin(bs.t * 3.1) * 3 : 0);
      } else {
        bs.vx = (bs.poseX + sway - bs.x) * 6;
        bs.physics(this.level, dt);
      }
      bs.facing = p.x > bs.x ? 1 : -1;
      // Talking gestures: alternate each boss's idle pose with characteristic gesture frames
      const G = BOSS_SHEET_TALK_FRAMES[bs.sheet] || BOSS_TALK_FRAMES[this.data.boss.type];
      if (bs.sheet === 'archon') {
        bs.frame = Math.floor(bs.t * 6) % 2 ? 'pounce' : 'roar';
      } else if (G) {
        const seq = talking ? G.talk : G.idle;
        const cand = seq[Math.floor(bs.t * (talking ? 1.65 : 0.85)) % seq.length];
        if (cand && this.assets.frame(bs.sheet, cand)) bs.frame = cand;
      }
      if (talking && Math.floor(bs.t * 6) % 2 === 0) {
        if (Math.random() < 0.25) this.particles.sparks(bs.x + (Math.random() - 0.5) * bs.w, bs.y - bs.h * 0.8, 1, '#ffd27a');
      }
    }
    if (intro.stage === 'banner' && intro.t >= 1.6) {
      // Banner has been on screen long enough to read: the boss speaks.
      intro.stage = 'voice';
      this.triggerBossVoice();
    } else if (intro.stage === 'voice' && !this.voiceSpeaking()) {
      intro.stage = 'done';
      this.bossHold = false;
      this.startBoss();
    }
  }

  /**
   * Forged wings reuse a built-in boss behaviour but may swap in a generated
   * sprite sheet (same frame names) and tint; see forge.js.
   */
  applyBossOverrides(boss, b) {
    if (!boss || !b) return;
    if (b.sheet && this.assets.info(b.sheet)) boss.sheet = b.sheet;
    else if (b.tint) boss.tint = b.tint;   // no generated sheet: recolour the base boss
    if (b.aura) boss.aura = b.aura;
    if (!this.assets.frame(boss.sheet, boss.frame)) {
      const poseFallback = BOSS_POSE_FRAME[boss.sheet] || BOSS_POSE_FRAME[b.type];
      if (poseFallback && this.assets.frame(boss.sheet, poseFallback)) boss.frame = poseFallback;
    }
  }

  triggerBossVoice() {
    const b = this.data.boss;
    if (!b || this.bossSpoken) return;
    this.bossSpoken = true;
    const key = b.voice || b.type || 'reaper';   // forged bosses carry their own Daikon clip
    const cue = {
      speaker: b.name || 'BOSS',
      text: b.line || BOSS_LINES[b.type || 'reaper'] || 'NONE SHALL PASS BEYOND THIS THRESHOLD!',
      t: 0,
      dur: VOICES[key] ? 8.5 : 4.6,
      boss: true,
    };
    this.voiceCue = cue;
    // Start the boss theme immediately in the background (AudioSys ducks it
    // beneath the Daikon speech and swells it smoothly when the boss finishes!).
    if (this.audio) {
      if (this.audio.playVoice) {
        // Call playVoice first so synchronous voiceDucking + hall acoustics engage before musicBus ramps.
        this.audio.playVoice(key, {
          space: this.voiceSpaceForStage(),
          speechText: cue.text,
          onReady: (dur) => {
            if (this.voiceCue === cue && dur > 1) cue.dur = Math.max(cue.t + 1.2, dur + 0.35);
          },
        });
      }
      this.audio.playMusic('boss');
    }
  }

  voiceSpaceForStage() {
    const k = this.stage.theme || this.fxTheme;
    if (k === 'aqueduct' || k === 'ossuary' || k === 'catacombs' || k === 'darkcave') return 'cistern';
    if (k === 'cathedral' || k === 'throne' || k === 'ballroom' || k === 'library') return 'cathedral';
    if (this.theme && this.theme.outdoor) return 'courtyard';
    return 'hall';
  }

  addWaterRipple(wx, surfaceY, amp = 0.85, splash = false) {
    for (let i = 0; i < this.waterRipples.length; i++) {
      const r = this.waterRipples[i];
      if (r.t < 0.09 && Math.abs(r.x - wx) < 12) {
        r.amp = Math.max(r.amp, amp);
        return;
      }
    }
    if (this.waterRipples.length >= 12) this.waterRipples.shift();
    this.waterRipples.push({ x: wx, y: surfaceY, t: 0, dur: 1.35, amp });

    const nearCam = !this.camera || Math.abs(wx - (this.camera.rx + W * 0.5)) < W * 0.65;
    if (!nearCam) return;
    const count = splash ? 8 : 3;
    const col = (this.stage.theme === 'darkwood' || this.fxTheme === 'darkwood')
      ? 'rgba(165, 250, 224, 0.85)'
      : 'rgba(185, 244, 255, 0.88)';
    for (let i = 0; i < count; i++) {
      const sp = splash ? 78 : 42;
      this.particles.emit({
        x: wx + (Math.random() - 0.5) * 12,
        y: surfaceY - 1,
        vx: (Math.random() - 0.5) * sp * 1.4,
        vy: -(28 + Math.random() * sp),
        life: 0.28 + Math.random() * 0.24,
        color: i % 2 === 0 ? col : 'rgba(235, 252, 255, 0.92)',
        size: splash && i < 3 ? 2 : 1,
        gravity: 320,
        fade: true,
      });
    }
    const now = this.time || 0;
    if (splash && now - (this._lastSplashSfx || -9) > 0.14) {
      this._lastSplashSfx = now;
      this.sfx('water_splash');
    } else if (!splash && now - (this._lastStepSfx || -9) > 0.22) {
      this._lastStepSfx = now;
      this.sfx('water_step');
    }
  }

  updateWaterInteractions(dt) {
    const lvl = this.level;
    if (!lvl || (!lvl.waterRuns.length && !lvl.waterBasins.length)) return;
    const checkEnt = (ent, isPlayer) => {
      if (!ent || ent.alive === false) return;
      const hit = lvl.waterSurfaceAt(ent.x, ent.y);
      const wasIn = !!ent._inWater;
      if (hit && !wasIn) {
        ent._inWater = true;
        ent._waterStepT = 0;
        const fastDrop = Math.abs(ent.vy || 0) > 95;
        this.addWaterRipple(ent.x, hit.surfaceY, fastDrop ? 1.15 : 0.82, isPlayer && fastDrop);
      } else if (!hit && wasIn) {
        ent._inWater = false;
        const prevY = ent._lastWaterY;
        if (prevY != null) this.addWaterRipple(ent.x, prevY, 0.88, isPlayer && (ent.vy || 0) < -80);
      } else if (hit) {
        ent._lastWaterY = hit.surfaceY;
        const speed = Math.abs(ent.vx || 0);
        if (speed > 20 && (ent.onGround || ent.y >= hit.surfaceY - 2)) {
          ent._waterStepT = (ent._waterStepT || 0) + dt;
          const period = isPlayer ? 0.19 : 0.34;
          if (ent._waterStepT >= period) {
            ent._waterStepT = 0;
            this.addWaterRipple(ent.x, hit.surfaceY, isPlayer ? 0.72 : 0.55, false);
          }
        }
      }
    };
    const p = this.player;
    checkEnt(p, true);
    if (p && p.alive && p.attacking && p.attackHitbox) {
      const hb = p.attackHitbox();
      if (hb && p._waterStrikeSeq !== p.attackSeq) {
        const midX = hb.x + hb.w * 0.5;
        const botY = hb.y + hb.h;
        const wHit = lvl.waterSurfaceAt(midX, botY);
        if (wHit) {
          p._waterStrikeSeq = p.attackSeq;
          this.addWaterRipple(midX, wHit.surfaceY, 1.05, true);
        }
      }
    }
    if (this.boss && this.boss.alive) checkEnt(this.boss, false);
    const camX = this.camera ? this.camera.rx : 0;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e || e === this.boss || !e.alive || e.flies) continue;
      if (Math.abs(e.x - (camX + W * 0.5)) > W * 0.7) continue;
      checkEnt(e, false);
    }
  }

  computeFogWorldY(camX) {
    const lvl = this.level;
    const c0 = Math.max(0, Math.floor((camX + W * 0.15) / TILE));
    const c1 = Math.min(lvl.cols - 1, Math.ceil((camX + W * 0.85) / TILE));
    const rows = [];
    for (let c = c0; c <= c1; c += 2) {
      const gr = lvl.groundRow(c);
      if (gr > 0) rows.push(gr);
    }
    let targetY;
    if (rows.length) {
      rows.sort((a, b) => a - b);
      targetY = rows[rows.length >> 1] * TILE;
    } else if (this._fogWorldY != null) {
      targetY = this._fogWorldY;
    } else {
      targetY = this.data && this.data.start ? this.data.start.y : lvl.height - 64;
    }
    if (this._fogWorldY == null || this.game.titleWorld === this) {
      this._fogWorldY = targetY;
    } else {
      this._fogWorldY += (targetY - this._fogWorldY) * 0.08;
    }
    return this._fogWorldY;
  }

  startBoss() {
    const b = this.data.boss;
    const hadIntro = !!this.bossIntro;
    this.bossHold = false;
    this.bossActive = true;
    this.gateClosed = true;
    for (let r = b.gateRows[0]; r <= b.gateRows[1]; r++) this.level.set(b.gateCol, r, T_GATE);
    this.frameArena(b);
    if (this.boss && this.boss.introPose) {
      // Wake the posed boss: skip straight past its entrance fade (already visible).
      this.boss.introPose = false;
      this.boss.alpha = 1;
      this.boss.state = 'enter'; this.boss.stateT = 99; this.boss.fired = false;
      this.boss.facing = this.player.x >= this.boss.x ? 1 : -1;   // always square up to the hunter first
    } else {
      this.boss = createBoss(b.type || 'reaper', b.spawn.x, b.spawn.y, b.arena, this.difficulty);
      this.applyBossOverrides(this.boss, b);
      this.boss.facing = this.player.x >= this.boss.x ? 1 : -1;
    }
    this.spawnEnemy(this.boss);
    const dbgHp = parseInt(this.game.params.get('bosshp') || '0', 10);
    if (dbgHp > 0) this.boss.hp = dbgHp;
    this.enemies = this.enemies.filter((e) => e === this.boss || e.x > b.camX - 100);
    if (!hadIntro) {
      // Direct start (tests / debug / instant arena jump): still announce and voice the boss!
      this.sfx('gate');
      this.camera.shake(4, 0.5);
      this.showMessage(b.name, 'DEFEAT IT TO CLAIM THE ORB', 3);
      this.triggerBossVoice();
    } else {
      this.audio.playMusic('boss');
    }
    setTimeout(() => { this.sfx('boss_roar'); this.onBossRoar(); }, 900);
  }

  /** Snapshot of what persists into the next stage. */
  carry(extra = null) {
    return Object.assign({
      score: this.score,
      lives: this.lives,
      hearts: this.hearts,
      subWeapon: this.player.subWeapon || this.subWeaponCarry,
      hp: this.player && this.player.alive ? this.player.hp : null,
    }, extra);
  }

  /** Marks the Castle Grid cell(s) around the hunter's current coordinates as explored. */
  recordExploration(extraOpts = {}) {
    if (!this.game || !this.game.markCellsExplored || !this.player || !this.stage.key) return;
    const normX = this.level.width > 0 ? this.player.x / this.level.width : 0;
    const normY = this.level.height > 0 ? this.player.y / this.level.height : 0.5;
    const sIdx = Math.max(0, (this.stage.id || 1) - 1);
    const vesselFound = !!(this.game.vessels && ((this.game.vessels >> sIdx) & 1));
    const cells = cellsToRevealAt(this.stage.key, normX, Object.assign({
      inSecret: this.inSecretArea,
      vesselFound,
      normY,
    }, extraOpts));
    this.game.markCellsExplored(cells);
  }

  onSanctuaryAttuned(stone) {
    const sIdx = Math.max(0, (this.stage.id || 1) - 1);
    const wasNew = this.game && this.game.discoverStage ? this.game.discoverStage(sIdx) : false;
    this.recordExploration({ sanctuary: true });
    const p = this.player;
    const maxHp = p.maxHp || PLAYER.maxHp;
    const healed = p.hp < maxHp;
    p.hp = Math.min(maxHp, p.hp + 4);
    this.particles.sparks(stone.x, stone.y - 24, 12, '#62f2c2');
    if (wasNew) {
      this.sfx('pickup');
      this.emitShockwave(stone.x, stone.y - 38, { maxR: 108, dur: 0.44, strength: 0.55, color: [0.35, 0.96, 0.82] });
      this.showMessage('SANCTUARY ATTUNED', 'PRESS M ANYTIME TO VIEW THE CASTLE MAP', 2.2);
    } else if (healed) {
      this.sfx('pickup');
    }
  }

  onVesselCollected(vessel) {
    if (this.game && this.game.collectVessel) this.game.collectVessel(vessel.stageIndex);
    this.inSecretArea = true;
    this.recordExploration({ inSecret: true, vesselFound: true });
    this.player.maxHp = this.computeMaxHp();
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 6);
    this.hearts = Math.min(99, this.hearts + 3);
    this.addScore(2000);
    this.sfx('orb');
    this.particles.sparks(vessel.x, vessel.y - 22, 18, '#ffd27a');
    this.emitShockwave(vessel.x, vessel.y - 44, { maxR: 132, dur: 0.52, strength: 0.75, color: [1.0, 0.84, 0.36] });
    const vCount = this.game && this.game.getVesselCount ? this.game.getVesselCount() : 0;
    const strTag = vCount > 0 && vCount % 3 === 0 ? ' · STR +1' : '';
    this.showMessage('ANCIENT VESSEL FOUND', `MAX VITALITY +1${strTag} · HEARTS +2`, 2.6);
  }

  onWeaponCollected(weaponId, x, y, fromPedestal = false) {
    const w = WEAPONS[weaponId];
    if (!w) return;
    const wasNew = this.game && this.game.unlockWeapon ? this.game.unlockWeapon(weaponId) : true;
    // If Hand_R is empty and Hand_L is 1-handed, auto-slot a newly acquired 1H weapon into Hand_R
    // so the hunter can try dual-wielding right away (or open `E` Armory anytime).
    let autoEquippedR = false;
    if (wasNew && !w.isTwoHanded && this.game && this.game.equipWeapon) {
      const wL = this.getHandWeapon(0);
      const wR = this.getHandWeapon(1);
      if (!wR && (!wL || !wL.isTwoHanded) && (!wL || wL.id !== weaponId)) {
        this.game.equipWeapon(1, weaponId);
        autoEquippedR = true;
      }
    }
    this.addScore(wasNew ? 1000 : 400);
    this.sfx(fromPedestal ? 'orb' : 'pickup');
    const elem = w.element ? ELEMENT_META[w.element] : null;
    const sparkCol = elem ? elem.color : '#ffd27a';
    const ringCol = elem ? elem.rim : [1.0, 0.84, 0.36];
    this.particles.sparks(x, y, 16, sparkCol);
    this.emitShockwave(x, y - 8, { maxR: fromPedestal ? 118 : 88, dur: 0.44, strength: 0.55, color: ringCol });
    if (wasNew) {
      const sub = autoEquippedR
        ? 'EQUIPPED TO R-HAND (C/V/L) · E FOR ARMORY'
        : (w.isTwoHanded ? '2-HANDED ARSENAL · PRESS E FOR ARMORY' : 'PRESS E TO EQUIP IN L / R HAND');
      if (fromPedestal) {
        this.showMessage(`ARSENAL: ${w.name}`, sub, 2.5);
      } else {
        this.spawnPopup(x, y - 22, `NEW WEAPON: ${w.name}`, {
          sub,
          color: sparkCol,
          scale: 1,
          dur: 2.2,
          vy: -18,
          banner: true,
        });
      }
    } else {
      this.spawnPopup(x, y - 16, `${w.short} +400`, { color: sparkCol, dur: 1.1 });
    }
  }

  /** Executes a Cross-Hand Combo Resonance detonation when Hand_L + Hand_R share a `setTag`. */
  triggerComboResonance(player, res, wL, wR) {
    if (!player || !res) return;
    const cx = player.x + player.facing * 14;
    const cy = player.y - 34;
    this.sfx('orb');
    this.camera.shake(4.2, 0.28);
    this.hitStop = Math.max(this.hitStop, 0.08);
    this.emitShockwave(cx, cy, {
      maxR: res.radius || 120,
      dur: 0.52,
      strength: 0.92,
      color: res.color || [1.0, 0.84, 0.36],
    });
    this.particles.sparks(cx, cy, 22, res.hex || '#ffd27a');

    const strTotal = computeStrengthBreakdown(this).total;
    const reqStr = Math.max((wL && wL.reqStr) || 0, (wR && wR.reqStr) || 0);
    const synthWeapon = {
      baseDamage: res.baseDamage || 5.5,
      scaling: 0.28,
      reqStr,
      physical: res.physical || 'blunt',
      element: res.element || null,
    };
    const diffMult = (this.difficulty.playerDamage || 1) * this.getAttackMult();
    let hitAny = false;
    const rad = res.radius || 120;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dist = Math.hypot(e.x - cx, (e.y - e.h * 0.5) - cy);
      if (dist <= rad + e.w * 0.5) {
        const hit = computeWeaponHit(synthWeapon, strTotal, e, { diffMult });
        this._hitArmorPiercing = true;
        e.takeHit(hit.damage, player.x, this, { armorPiercing: true });
        this._hitArmorPiercing = false;
        hitAny = true;
        if (hit.tag === 'weak') {
          this.spawnPopup(e.x, e.y - e.h - 8, 'WEAK!', { color: '#7ef7d4', dur: 0.85, vy: -24 });
        }
      }
    }
    for (const pr of this.projectiles) {
      if (pr.owner === 'enemy' && pr.type !== 'gaze') {
        const dist = Math.hypot(pr.x - cx, pr.y - cy);
        if (dist <= rad) {
          pr.dead = true;
          this.particles.sparks(pr.x, pr.y, 4, res.hex || '#ffffff');
        }
      }
    }
    if (hitAny && res.siphonHp && player.alive) {
      const cap = player.maxHp || PLAYER.maxHp;
      player.hp = Math.min(cap, player.hp + res.siphonHp);
    }
    if (res.projectile) {
      const pr = new Projectile(res.projectile, cx + player.facing * 12, cy, player.facing, 'player');
      pr.damage = Math.max(3, Math.round((res.baseDamage || 5) * 0.85));
      this.spawnProjectile(pr);
    }
    if (res.spawnFlames) {
      for (const off of [-36, 36]) {
        const col = Math.floor((player.x + off) / TILE);
        const fRow = this.level.surfaceRow(col);
        const fy = fRow >= 0 ? fRow * TILE : player.y;
        this.spawnFire(player.x + off, fy, 'player');
      }
    }
    if (res.iceFan) {
      for (let i = -2; i <= 2; i++) {
        const pr = new Projectile('catalyst_frost', cx, cy, player.facing, 'player');
        pr.vy = i * 62;
        pr.damage = 3;
        this.spawnProjectile(pr);
      }
    }
  }

  traversePassage(gate) {
    const destIdx = stageIndexOf(gate.targetKey);
    if (destIdx < 0 || !this.game || !this.game.startGame) return;
    if (this.game.markCellsExplored) {
      this.game.markCellsExplored([
        `${gate.cell[0]},${gate.cell[1]}`,
        `${gate.destCell[0]},${gate.destCell[1]}`,
      ]);
    }
    if (this.game.discoverStage) this.game.discoverStage(destIdx);
    this.sfx('select');
    this.game.startGame(destIdx, this.carry({ enterFromDoorId: gate.id }));
  }

  stageClear() {
    this.phase = 'clear'; this.phaseT = 0;
    this.player.invuln = 999;
    this.recordExploration({ cleared: true });
    if (this.audio.musicKey !== 'clear') this.audio.playMusic('clear', false);
    this.timeBonus = Math.ceil(this.timeLeft) * SCORE.timeBonus;
    this.heartBonus = this.hearts * 100;
    this.score += this.timeBonus + this.heartBonus;
    this.game.onStageClear();
  }

  updateWeather(dt) {
    // Indoors: slow dust motes drifting through the light give the air depth.
    if (!this.theme.outdoor && Math.random() < 0.5) {
      this.particles.emit({
        x: this.camera.x + Math.random() * W, y: this.camera.y + Math.random() * H,
        vx: (Math.random() - 0.5) * 8, vy: 3 + Math.random() * 5, life: 2.5 + Math.random() * 2,
        color: 'rgba(210, 200, 170, 0.22)', size: 1, gravity: 0, fade: true,
      });
    }
    if (!this.flakes) return;
    const camDx = this.camera.x - (this._lastCamX == null ? this.camera.x : this._lastCamX);
    this._lastCamX = this.camera.x;
    for (const f of this.flakes) {
      if (f.kind === 'fireflies' || f.kind === 'embers') {
        f.y += (f.vy + Math.cos(this.time * 1.9 + f.phase) * 14) * dt;
        f.x += (f.vx + Math.sin(this.time * 1.5 + f.phase) * 18) * dt - camDx * f.depth;
        if (f.y < -8) { f.y = H + 6; if (f.kind === 'embers') f.x = Math.random() * W; }
        else if (f.y > H + 8) f.y = -6;
      } else {
        f.y += f.vy * dt;
        f.x += (f.vx + Math.sin(this.time * 1.4 + f.phase) * 16) * dt - camDx * f.depth;
        if (f.y > H + 6) { f.y = -6; f.x = Math.random() * W; }
      }
      if (f.x < -8) f.x += W + 16; else if (f.x > W + 8) f.x -= W + 16;
    }
  }

  drawWeather(ctx, nearOnly = false) {
    if (!this.flakes) return;
    const fxl = getFxLayers();
    const useShaderGlow = !!(fxl && fxl.enabled && fxl.drawSparkBatch);
    const glowBatch = useShaderGlow ? (this._weatherGlow || (this._weatherGlow = [])) : null;
    if (glowBatch) glowBatch.length = 0;

    ctx.save();
    for (const f of this.flakes) {
      if (nearOnly !== f.near) continue;
      if (f.kind === 'fireflies' || f.kind === 'embers') {
        const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(this.time * (f.kind === 'embers' ? 7.5 : 4.2) + f.phase));
        const a = f.alpha * pulse;
        if (glowBatch) {
          const rgba = parseParticleColor(f.color);
          const rad = Math.max(3.2, f.size * 1.9);
          glowBatch.push({
            x: f.x, y: f.y, halfL: rad * (f.kind === 'embers' ? 1.25 : 1.0), halfW: rad,
            dirX: 0, dirY: -1,
            r: rgba[0], g: rgba[1], b: rgba[2], a,
            kind: 2, life: 0.85, seed: (f.phase % 6.28) / 6.28,
          });
        } else {
          ctx.globalAlpha = a;
          ctx.fillStyle = f.color;
          ctx.beginPath();
          ctx.arc(f.x, f.y, Math.max(1.2, f.size * 0.9), 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (f.kind === 'leaves') {
        const rx = Math.round(f.x), ry = Math.round(f.y);
        ctx.globalAlpha = f.alpha;
        ctx.fillStyle = f.color;
        const w = Math.max(1, Math.round(f.size * (0.5 + 0.5 * Math.abs(Math.cos(this.time * 3 + f.phase)))));
        ctx.fillRect(rx, ry, w + 1, f.size);
      } else {
        const rx = Math.round(f.x), ry = Math.round(f.y);
        ctx.globalAlpha = f.alpha;
        ctx.fillStyle = f.color;
        ctx.fillRect(rx, ry, f.size, f.size);
      }
    }
    ctx.restore();
    if (glowBatch && glowBatch.length) fxl.drawSparkBatch(ctx, glowBatch, 'lighter');
  }

  updateLightning(dt) {
    if (!this.theme.outdoor) { this.flash = 0; this.boltX = -1; return; }
    this.flash = Math.max(0, this.flash - dt * 2.1);
    if (this.flash <= 0.01) this.boltX = -1;
    if (this.restrikeT >= 0) {
      this.restrikeT -= dt;
      if (this.restrikeT < 0) {
        this.flash = Math.max(this.flash, 0.85);
        this.boltSeed += 0.37;
      }
    }
    this.nextLightning -= dt;
    if (this.nextLightning <= 0) {
      this.flash = 1.0;
      this.boltX = 88 + Math.random() * (W - 176);
      this.boltSeed = Math.random() * 100;
      this.restrikeT = 0.11 + Math.random() * 0.08;
      this.nextLightning = 7.5 + Math.random() * 11;
      this.thunderDelay = 0.22 + Math.random() * 0.45;
    }
    if (this.thunderDelay >= 0) {
      this.thunderDelay -= dt;
      if (this.thunderDelay < 0) {
        this.sfx('thunder');
        this.camera.shake(2.4, 0.36);
      }
    }
  }

  // -------------------------------------------------------------- draw
  draw(ctx, { hud = true } = {}) {
    const cam = this.camera;
    const camX = cam.rx, camY = cam.ry;
    const t = this.time;
    const outdoor = this.theme.outdoor;
    const roomX = this.level.rooms.length ? this.level.rooms[0].x0 * TILE : Infinity;
    const indoors = !outdoor || this.player.x > roomX + TILE;
    const flash = indoors ? this.flash * 0.35 : this.flash;

    // 1. Far sky, interleaved 2D scrolling parallax & 3D vistas / subterranean abysses.
    // Skip outdoor sky/vista overdraw once camera has crossed inside an opaque castle hall!
    const portalX = roomX < Infinity ? Math.round(project3D(roomX - 18, 144, 40, camX, camY).x) : W;
    const showOutdoor = outdoor && portalX > -8;
    if (showOutdoor) {
      const outClipW = roomX < Infinity ? Math.min(W, Math.max(0, portalX + 12)) : W;
      ctx.save();
      if (outClipW < W) {
        ctx.beginPath();
        ctx.rect(0, 0, outClipW, H);
        ctx.clip();
      }
      // 1a. Sky dome + celestial 3D aurora (behind mountains & trees) + clouds + lightning
      this.parallax.drawSky(ctx, cam, flash, this.boltX, this.boltSeed, (c) => this.stage3d.drawSky3D(c, cam, t));
      // 1b. Far horizon ridges, panoramic vistas & distant castle crags (`fx < 0.25`)
      this.parallax.drawBackRange(ctx, cam, flash, 0, 0.25, false);
      // 1c. Mid-far 3D Gothic Keep (`fx = 0.26`), behind wheeling bat flocks & near trees
      this.stage3d.drawMidHorizon3D(ctx, cam, t, flash);
      // 1d. Wheeling bat flock (`fx = 0.30`) + near scrolling forests / snowbound village (`fx >= 0.30`)
      this.parallax.drawBackRange(ctx, cam, flash, 0.25, 2.0, true);
      ctx.restore();

      // 1e. 3D receding ground/water plane, colonnades & barbican gatehouse set-piece
      this.stage3d.drawOutdoorGround3D(ctx, cam, t);

      if (outClipW > 0) {
        ctx.save();
        if (outClipW < W) {
          ctx.beginPath();
          ctx.rect(0, 0, outClipW, H);
          ctx.clip();
        }
        this.parallax.drawAtmosphere(ctx, cam);
        ctx.restore();
      }
    } else if (!outdoor) {
      ctx.fillStyle = this.theme.bg || '#05040a';
      ctx.fillRect(0, 0, W, H);
      this.stage3d.drawAbyss3D(ctx, cam, t);
    } else {
      ctx.fillStyle = '#06050c';
      ctx.fillRect(0, 0, W, H);
    }

    // 2. 3D Vaulted Interior Halls / Cylindrical Clock Shaft + 3D Boss Set-Pieces
    this.stage3d.drawInterior3D(ctx, cam, t);
    this.stage3d.drawBossCenterpiece3D(ctx, cam, t);
    const fxl = getFxLayers();
    if (fxl && fxl.enabled && !showOutdoor && (this.stage.theme === 'aqueduct' || this.fxTheme === 'ossuary')) {
      fxl.caustics(ctx, { x: 0, y: 72, w: W, h: 204 }, {
        camX,
        tint: this.stage.theme === 'aqueduct' ? [0.24, 0.84, 1.0] : [0.20, 0.72, 0.66],
        alpha: this.stage.theme === 'aqueduct' ? 0.16 : 0.09,
      });
    }

    // 3. Far/mid weather particles + stage decor (with extruded 3D cogwheels) + indoor god-rays
    this.drawWeather(ctx, false);
    this.level.drawDecor(ctx, cam, this.assets, t, this.stage3d);
    if (fxl) {
      fxl.flushFlames(ctx);
      if (fxl.enabled && !showOutdoor) {
        fxl.godRays(ctx, camX, this.fxTheme, 0.65);
      }
    }
    // Atmospheric depth-separation veil: keeps all background parallax, 3D architecture,
    // and wall decor noticeably dimmer so the z = 0 foreground terrain & sprites stand out.
    ctx.fillStyle = showOutdoor ? 'rgba(6, 5, 14, 0.15)' : 'rgba(6, 5, 14, 0.19)';
    ctx.fillRect(0, 0, W, H);

    // 4a. Boss gate + static architectural terrain (viaducts, 3D decks, z = 0 tiles & static balconies)
    if (this.gateClosed) {
      const b = this.data.boss;
      this.assets.draw(ctx, 'arch', 'gate', b.gateCol * TILE + 16 - camX, (b.gateRows[1] + 1) * TILE - camY);
    }
    this.level.drawStaticTiles(ctx, cam, this.assets, t);

    // 4b. Wall-recessed monumental doorways, sanctuary waystone & vessel altar + wall sconce flames.
    // Drawn BEFORE dynamic platforms (`drawDynamicTiles`) so moving lifts, ferries, gear gondolas,
    // and falling corbel tiles always pass cleanly IN FRONT OF doors and wall torches!
    if (this.passages) for (const g of this.passages) g.draw(ctx, cam, this.font, this, t);
    if (this.sanctuary) this.sanctuary.draw(ctx, cam, this.font, t, this);
    if (this.vessel) this.vessel.draw(ctx, cam, this.font, this, t);
    if (this.pedestal) this.pedestal.draw(ctx, cam, this.font, this, t);
    if (fxl) {
      fxl.flushFlames(ctx);
      fxl.flushAttacks(ctx);
    }

    // 4c. Dynamic foreground platforms: crumbling/falling stone slabs & moving lifts/ferries/gondolas
    this.level.drawDynamicTiles(ctx, cam, this.assets, t, this.stage3d);

    // 5. 3D Contact shadows grounding 2D sprites onto static floors & moving lifts
    this.level.drawContactShadows(ctx, cam, this.player, this.enemies, this.candles, this.ally);

    // 6. Crisp z = 0 sprite gameplay layer
    for (const c of this.candles) if (Math.abs(c.x - camX - W / 2) < W) c.draw(ctx, this.assets, camX, camY, t);
    for (const f of this.fires) f.draw(ctx, camX, camY, t);
    for (const it of this.items) it.draw(ctx, this.assets, camX, camY, t);
    for (const e of this.enemies) if (e !== this.boss && e.x > camX - 120 && e.x < camX + W + 120) e.draw(ctx, this.assets, camX, camY);
    if (this.boss) this.boss.draw(ctx, this.assets, camX, camY);
    if (this.ally) this.ally.draw(ctx, this.assets, camX, camY, t);
    const peersHere = this.game && this.game.net ? this.game.net.peersInStage(this.stage.key) : null;
    if (peersHere && peersHere.length) drawRemotePlayers(ctx, this, peersHere, t);
    this.player.draw(ctx, this.assets, camX, camY);
    if (this.player.saluteT > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, this.player.saluteT * 1.5);
      this.font.draw(
        ctx,
        '* HAIL! *',
        Math.round(this.player.x - camX),
        Math.round(this.player.y - camY - 72 - (1 - this.player.saluteT / 1.8) * 8),
        { align: 'center', color: '#ffd27a', shadow: '#05040a', gothic: false },
      );
      ctx.restore();
    }
    if (this.player.skillBanner && this.player.skillBanner.t > 0) {
      const sb = this.player.skillBanner;
      ctx.save();
      ctx.globalAlpha = Math.min(1, sb.t * 2.2);
      this.font.draw(
        ctx,
        sb.text,
        Math.round(this.player.x - camX),
        Math.round(this.player.y - camY - 76 - (1.4 - Math.min(1.4, sb.t)) * 8),
        { align: 'center', color: sb.color || '#ffd27a', shadow: '#05040a', gothic: false },
      );
      ctx.restore();
    }
    for (const pr of this.projectiles) pr.draw(ctx, this.assets, camX, camY);
    if (this.shockRings.length) {
      for (const r of this.shockRings) {
        const p = Math.min(1, r.t / r.dur);
        const rad = 12 + (r.maxR - 12) * (1 - (1 - p) * (1 - p));
        const alpha = (1 - p) * 0.9;
        const sx = Math.round(r.x - camX), sy = Math.round(r.y - camY);
        if (fxl && fxl.enabled) {
          fxl.addShockRing(sx, sy, rad, 8 - p * 4, r.color, alpha);
        } else {
          ctx.save();
          ctx.strokeStyle = `rgba(${Math.round(r.color[0] * 255)},${Math.round(r.color[1] * 255)},${Math.round(r.color[2] * 255)},${(alpha * 0.65).toFixed(3)})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(sx, sy, rad, rad * 0.78, 0, 0, Math.PI * 2); ctx.stroke();
          ctx.restore();
        }
      }
    }
    if (fxl) {
      fxl.flushFlames(ctx);
      fxl.flushAttacks(ctx);
    }
    // 6b. Real-time reflective & refractive WebGL water pools & sluice canals
    this.level.drawWaterSurfaces(ctx, cam, fxl, this.waterRipples, this.stage.theme || this.fxTheme, t);
    this.particles.draw(ctx, camX, camY);

    // 7. Foreground z < 0 framing silhouettes (auto-fading near player/threats/doors) & near weather
    if (showOutdoor) {
      const fgAlpha = Math.max(0, Math.min(1, (roomX - (camX + W * 0.5)) / 240)) * 0.82;
      const fgClipRight = roomX < Infinity ? Math.max(0, portalX - 36) : W;
      this.parallax.drawFront(ctx, cam, fgAlpha, {
        clipRight: fgClipRight,
        playerScreenY: Math.round(this.player.y - camY),
      });
    }
    this.stage3d.drawForeground3D(ctx, cam, this.player, this.enemies, this.landmarks);
    // Shader ground mist anchored to world terrain elevation (never jumps with player.y!)
    if (fxl) {
      const fogCol = outdoor
        ? (this.fxTheme === 'darkwood' ? [0.4, 0.75, 0.68] : [0.62, 0.66, 0.82])
        : (this.stage.theme === 'aqueduct' ? [0.36, 0.74, 0.88] : this.fxTheme === 'darkcave' ? [0.85, 0.34, 0.16] : [0.5, 0.48, 0.6]);
      const amt = outdoor ? 0.42 : (this.stage.theme === 'aqueduct' ? 0.28 : this.fxTheme === 'catacombs' || this.fxTheme === 'ossuary' ? 0.34 : this.fxTheme === 'darkcave' ? 0.24 : 0.16);
      const fogFloorY = Math.round(this.computeFogWorldY(camX) - camY) + 6;
      fxl.fog(ctx, camX, fogFloorY, fogCol, amt, camY);
    }
    this.drawWeather(ctx, true);

    if (flash > 0) { ctx.fillStyle = `rgba(230, 235, 255, ${0.14 * flash})`; ctx.fillRect(0, 0, W, H); }
    this.drawVignette(ctx);
    if (hud) this.drawOverlays(ctx);
  }

  drawVignette(ctx) {
    if (!World._vigCanvas && typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const gctx = c.getContext('2d');
      const g = gctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(5, 3, 12, 0.55)');
      gctx.fillStyle = g;
      gctx.fillRect(0, 0, W, H);
      World._vigCanvas = c;
    }
    if (World._vigCanvas) ctx.drawImage(World._vigCanvas, 0, 0);
  }

  drawOverlays(ctx) {
    const peersHere = this.game && this.game.net ? this.game.net.peersInStage(this.stage.key) : null;
    if (peersHere && peersHere.length) drawRemoteEdgeIndicators(ctx, this.font, this, peersHere);
    if (this.sanctuary) this.sanctuary.drawPrompt(ctx, this.camera, this.font);
    if (this.passages) for (const g of this.passages) g.drawPrompt(ctx, this.camera, this.font, this);
    if (this.popups.length) {
      const camX = this.camera.rx, camY = this.camera.ry;
      for (const pop of this.popups) {
        const alpha = Math.max(0, Math.min(1, pop.t / 0.12, (pop.dur - pop.t) / 0.36)) * (pop.maxAlpha ?? 1);
        if (alpha <= 0.02) continue;
        const tw = this.font.width(pop.text, pop.scale || 1, 1, false);
        const halfW = Math.ceil(tw * 0.5) + 8;
        const sx = Math.max(halfW, Math.min(W - halfW, Math.round(pop.x - camX)));
        const sy = Math.max(54, Math.min(H - 28, Math.round(pop.y - camY)));
        ctx.save();
        ctx.globalAlpha = alpha;
        if (pop.banner) {
          const subW = pop.sub ? this.font.width(pop.sub, 1, 1, false) : 0;
          const bw = Math.max(tw, subW) + 16;
          const bh = pop.sub ? 29 : 19;
          const bx = Math.round(sx - bw * 0.5);
          const by = sy - 3;
          ctx.fillStyle = 'rgba(6, 5, 16, 0.88)';
          ctx.fillRect(bx, by, bw, bh);
          ctx.strokeStyle = pop.color;
          ctx.lineWidth = 1;
          ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
        }
        this.font.draw(ctx, pop.text, sx, sy, {
          scale: pop.scale || 1,
          align: 'center',
          color: pop.color,
          shadow: '#05040a',
          gothic: false,
        });
        if (pop.sub) {
          this.font.draw(ctx, pop.sub, sx, sy + (pop.scale === 2 ? 16 : 9), {
            align: 'center',
            color: '#9ef5dc',
            shadow: '#05040a',
            gothic: false,
          });
        }
        ctx.restore();
      }
    }
    for (const m of this.messages) {
      const k = Math.min(1, m.t / 0.3, (m.dur - m.t) / 0.4);
      ctx.save();
      ctx.globalAlpha = Math.max(0, k);
      this.game.banner([m.text], 150, { scale: 3, sub: m.sub });
      ctx.restore();
    }
  }
}

/** Multi-depth snowflakes or autumn leaves spanning background to near-camera plane. */
function makeFlakes(n, kind = 'snow') {
  const out = [];
  const leafCols = ['#d96b27', '#b8431e', '#e89b3c', '#8c2f24'];
  const flyCols = ['#62f2c2', '#8affd8', '#ffd97d', '#4ae0b0'];
  const emberCols = ['#ff6a1a', '#ff9a3c', '#ffd27a', '#e23c28'];
  for (let i = 0; i < n; i++) {
    const r = Math.random();
    const near = r > 0.82;
    const depth = near ? 1.28 : (0.22 + r * 0.72);
    const isFly = kind === 'fireflies' || kind === 'embers';
    out.push({
      kind,
      near,
      x: Math.random() * W,
      y: Math.random() * H,
      vx: isFly ? ((Math.random() - 0.5) * 18) : (kind === 'leaves' ? (-16 - depth * 18) : (-10 - depth * 22)),
      vy: kind === 'embers' ? (-24 - depth * 32) : isFly ? (-6 - Math.random() * 10) : (kind === 'leaves' ? (22 + depth * 26) : (26 + depth * 52)),
      size: near ? (isFly ? 2 : 3) : (r > 0.48 ? 2 : 1),
      depth,
      alpha: isFly ? 0.88 : (near ? 0.55 : (0.35 + r * 0.45)),
      color: kind === 'embers' ? emberCols[i % emberCols.length] : isFly ? flyCols[i % flyCols.length] : (kind === 'leaves' ? leafCols[i % leafCols.length] : '#eef6ff'),
      phase: Math.random() * 6.28,
    });
  }
  return out;
}
