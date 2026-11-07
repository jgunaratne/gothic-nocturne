// Gothic Nocturne — entry point: boot, scaling, game loop and menu states.

import {
  W, H, DT, DIFFICULTIES, DIFFICULTY_ORDER, DEFAULT_DIFFICULTY, ASSET_VERSION, PLAYER,
  TITLE_MENU_Y0, TITLE_MENU_ROW_H, TITLE_MENU_SAVE_Y0, TITLE_MENU_SAVE_ROW_H,
  SETTINGS_ITEMS, SETTINGS_TOP, SETTINGS_ROW_H,
} from './engine/constants.js';
import { Input } from './engine/input.js';
import { Assets } from './engine/assets.js';
import { AudioSys } from './engine/audio.js';
import { Font } from './engine/font.js';
import { PostFX } from './engine/postfx.js';
import { getFxLayers } from './engine/fxlayers.js';
import { NetClient } from './engine/net.js';
import { World } from './game/world.js';
import { STAGES } from './game/stages.js';
import { THEMES } from './game/builder.js';
import { drawHud, drawBanner } from './game/hud.js';
import {
  drawCastleMap, moveCursor, nextRoomAfter, nextAdjacentStageKey, stageIndexOf, isDiscovered,
  exploredCellStats, MAP_ROOMS, CELL_OWNER,
} from './game/castlemap.js';
import { BOSS_RELICS, resolveActiveRelics } from './game/relics.js';
import {
  START_LEVEL, LEVEL_CAP, expRequiredForNextLevel, levelBonuses, applyExpGain,
} from './game/progression.js';
import {
  DEFAULT_DEBUG_FLAGS, canEnterStage, stageEntryLock, bossGateStatus, guardianProgress, allGuardiansFelled,
} from './game/gates.js';
import { Forge } from './game/forge.js';
import { ForgeScreens } from './game/forge_ui.js';
import { ArmoryScreen } from './game/armory_ui.js';
import { WEAPONS, WEAPON_ORDER, SET_RESONANCES, resolvePairResonance } from './game/weapons.js';
import {
  SOUL_GLYPHS, SOUL_ORDER, SOUL_MAX_RANK, BESTIARY_ORDER, computeEnchantBonuses,
} from './game/souls.js';
import { resolveEnemySpeciesKey } from './game/weapons.js';
import { TouchControls } from './engine/touch.js';

const SAVE_STORAGE_KEY = 'gothic.save.v1';

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.assets = new Assets();
    this.audio = new AudioSys();
    this.font = new Font();
    this.input = new Input(canvas);
    this.postfx = new PostFX(canvas);
    if (new URLSearchParams(location.search).has('nofx')) { this.postfx.setEnabled(false); const fl = getFxLayers(); if (fl) fl.setEnabled(false); }
    this.state = 'loading';          // loading | title | controls | settings | difficulty | stageselect | forge | forging | play | map | pause | clear | ending | gameover
    this.forge = new Forge(this);     // Castle Forge: player-proposed wings
    this.forgeUI = new ForgeScreens(this);
    this.titleMenu = 0;               // 0 = begin the hunt, 1 = expand the castle, 2 = controls, 3 = settings
    this.settingsIndex = 0;           // cursor on the title Settings screen
    this.settingsConfirmReset = false; // RESET PROGRESS asks twice
    this.settingsFlash = null;        // { text, t } confirmation line on the Settings screen
    this.wingBanner = null;           // { name, t } after a wing is raised in the background
    this.stateT = 0;
    this.world = null;
    this.titleWorld = null;
    this.acc = 0;
    this.last = performance.now();
    this.params = new URLSearchParams(location.search);
    // Debug flags (title Settings screen): URL `?debug=areas|bosses|all` overrides for this session only.
    this.debug = loadDebugFlags('gothic.debug.v1', this.params);
    // Difficulty: URL override > last choice (localStorage) > default.
    const stored = safeStorageGet('gothic.difficulty');
    const urlDiff = this.params.get('difficulty');
    this.difficultyKey = DIFFICULTIES[urlDiff] ? urlDiff : DIFFICULTIES[stored] ? stored : DEFAULT_DIFFICULTY;
    this.difficulty = DIFFICULTIES[this.difficultyKey];
    this.menuIndex = DIFFICULTY_ORDER.indexOf(this.difficultyKey);
    // Stage & exploration progress: cleared bosses, discovered sanctuaries, hidden vessels, explored map cells.
    const allMask = STAGES.length >= 31 ? 0x7fffffff : ((1 << STAGES.length) - 1);
    const storedCleared = parseInt(safeStorageGet('gothic.cleared.v3') || '0', 10) || 0;
    this.cleared = this.params.get('cleared') === 'all' ? allMask : storedCleared;
    const storedDisc = parseInt(safeStorageGet('gothic.discovered.v1') || '1', 10) || 1;
    this.discovered = this.params.get('discovered') === 'all' ? allMask : (storedDisc | 1 | this.cleared);
    const storedVessels = parseInt(safeStorageGet('gothic.vessels.v1') || '0', 10) || 0;
    this.vessels = this.params.get('vessels') === 'all' ? allMask : storedVessels;
    this.exploredCells = loadExploredSet('gothic.explored.v2', this.params.get('explored') === 'all');
    const prog = loadProgression('gothic.progression.v1', this.params);
    this.charLevel = prog.level;
    this.charExp = prog.exp;
    this._urlLevelOverride = prog.urlOverride;
    const armory = loadArmoryState('gothic.armory.v1', this.params);
    this.ownedWeapons = armory.owned;
    this.handL = armory.handL;
    this.handR = armory.handR;
    this.activeLoadout = armory.activeLoadout || 0;
    this.loadouts = armory.loadouts || [[this.handL, this.handR], ['hunters_lash', null]];
    this._urlArmoryOverride = armory.urlOverride;
    const grimoire = loadGrimoireState('gothic.souls.v1', this.params);
    this.soulRanks = grimoire.soulRanks;
    this.equippedSouls = grimoire.equippedSouls;
    this.bestiarySeen = grimoire.bestiarySeen;
    this.bestiaryKills = grimoire.bestiaryKills;
    this.bloodBladeStacks = grimoire.bloodBladeStacks;
    this.openedChests = grimoire.openedChests;
    this.openedSwitches = grimoire.openedSwitches;
    this._urlSoulOverride = grimoire.urlOverride;
    this.armoryUI = new ArmoryScreen(this);
    const urlStage = parseInt(this.params.get('stage') || '0', 10);
    this.stageIndex = urlStage >= 1 && urlStage <= STAGES.length ? urlStage - 1 : 0;
    this.stageCursor = this.stageIndex;
    this.mapCursor = STAGES[this.stageIndex].key;
    this.visitedStages = new Set([STAGES[this.stageIndex].key]);
    this.carryState = null;          // score/lives/hearts carried between connected stages
    this.saveToast = null;           // { text, t, dur } HUD confirmation after saving
    this._ephemeralSession = !!(
      this.params.has('demo')
      || this.params.has('ending')
      || (this.params.has('screen') && this.params.get('screen') !== 'title')
      || this.params.get('cleared') === 'all'
      || this.params.get('explored') === 'all'
    );
    this.saveData = this.loadSaveData();
    this.editingCallsign = false;
    this.callsignDraft = '';
    this.net = new NetClient(this.params);
    this.net.stageTitleLookup = (key) => {
      const idx = stageIndexOf(key);
      return idx >= 0 ? STAGES[idx].name.replace(/^THE\s+/, '') : String(key).toUpperCase();
    };
    this.net.onRemoteEvent = (ev, peer) => {
      if (this.world && (this.state === 'play' || this.state === 'pause' || this.state === 'map' || this.state === 'armory')) {
        this.world.handleRemoteEvent(ev, peer);
      }
    };
    this.input.onFirstInteraction = () => this.audio.unlock();
    this.touch = new TouchControls(this);
    window.addEventListener('resize', () => this.fit());
    if (window.visualViewport) window.visualViewport.addEventListener('resize', () => this.fit());
    this.fit();
  }

  fit() {
    let s;
    if (this.touch) {
      this.touch.updateViewportMetrics();
      s = this.touch.computeCanvasScale();
    } else {
      const vw = Math.max(1, window.innerWidth);
      const vh = Math.max(1, window.innerHeight);
      const raw = Math.min(vw / W, vh / H);
      const nearest = Math.max(1, Math.round(raw));
      const snap = raw >= 1
        && Math.abs(raw - nearest) / nearest <= 0.06
        && W * nearest <= vw
        && H * nearest <= vh;
      s = snap ? nearest : raw;
    }
    const cw = Math.max(1, Math.round(W * s));
    const ch = Math.max(1, Math.round(H * s));
    this.canvas.style.width = cw + 'px';
    this.canvas.style.height = ch + 'px';
    this.canvas.style.imageRendering = cw < W ? 'auto' : '';
    if (this.postfx) this.postfx.fit();
  }

  async boot() {
    const bootEl = document.getElementById('boot');
    await Promise.all([
      this.assets.load((p) => {
        if (bootEl) bootEl.textContent = `Loading the castle… ${Math.round(p * 100)}%`;
      }),
      this.font.load(ASSET_VERSION),
    ]);
    // Wings raised by the Castle Forge (this server's registry + local ones) join the castle before anything is drawn.
    // Cap at 3.5s so a slow mobile proxy never blocks first frame render.
    try {
      await Promise.race([
        this.forge.loadRegistry(),
        new Promise((resolve) => setTimeout(resolve, 3500)),
      ]);
    } catch (e) { console.warn('Castle Forge registry unavailable', e); }
    {
      // Re-resolve "=all" test overrides and the requested / remembered stage now that forged wings are part of STAGES.
      const allMask = STAGES.length >= 31 ? 0x7fffffff : ((1 << STAGES.length) - 1);
      if (this.params.get('cleared') === 'all') this.cleared = allMask;
      if (this.params.get('discovered') === 'all') this.discovered = allMask;
      if (this.params.get('vessels') === 'all') this.vessels = allMask;
      if (this.params.get('explored') === 'all') {
        for (const k of CELL_OWNER.keys()) this.exploredCells.add(k);
      }
      const urlStage = parseInt(this.params.get('stage') || '0', 10);
      const want = urlStage >= 1 && urlStage <= STAGES.length ? urlStage - 1 : 0;
      if (want !== this.stageIndex) { this.stageIndex = want; this.stageCursor = want; this.mapCursor = STAGES[want].key; }
      this.saveData = this.loadSaveData();
      this.titleMenu = 0;
    }
    if (bootEl) bootEl.remove();
    this.titleWorld = new World(this, STAGES[0]);
    this.titleWorld.messages = [];
    this.titleWorld.camera.snapTo(8 * 32, this.titleWorld.player.y);
    this.titleWorld.camera.x = 2 * 32;
    this.setState('title');
    const screen = this.params.get('screen');   // testing aid
    if (this.params.has('ending') || screen === 'ending') {
      if (!this.world) {
        const endStage = STAGES.find((s) => s.key === 'throne') || STAGES[STAGES.length - 1];
        this.world = new World(this, endStage);
        this.world.score = 148500;
      }
      this.beginEnding();
      if (this.params.has('ending')) this.stateT = Math.max(0, parseFloat(this.params.get('ending')) || 0);
    } else if (screen === 'difficulty' || screen === 'stageselect') {
      this.setState(screen);
    } else if (screen === 'controls') {
      this.openControls();
    } else if (screen === 'settings') {
      this.openSettings();
    } else if (screen === 'forge') {
      this.openForge('title');
    } else if (screen === 'play') {
      this.startGame();
    } else if (screen === 'map') {
      this.startGame();
      this.openMap();
    } else if (screen === 'armory' || screen === 'souls' || screen === 'bestiary') {
      this.startGame();
      const tab = this.params.get('tab') || (screen === 'souls' || screen === 'bestiary' ? screen : 'armory');
      this.openArmory('play', tab);
    } else if (screen === 'clear') {
      this.startGame();
      this.world.timeBonus = 1234;
      this.world.heartBonus = 500;
      this.onStageClear();
      this.stateT = 3.0;
    } else if (screen === 'pause') {
      this.startGame();
      this.world.messages = [];
      this.setState('pause');
    } else if (screen === 'gameover') {
      this.startGame();
      this.onGameOver();
      this.stateT = 2.0;
    }
    if (this.params.has('demo')) this.startDemo();
    // Testing aid: ?forge=<name>[&forgedesc=<text>] proposes a wing immediately (local=1 forces the offline forge).
    if (this.params.has('forge')) {
      if (this.params.get('local') === '1') this.forge.online = false;
      this.forgeUI.openProposal('title');
      this.forgeUI.name = String(this.params.get('forge') || 'Abandoned Village').toUpperCase().slice(0, 28);
      this.forgeUI.desc = String(this.params.get('forgedesc') || '').toUpperCase().slice(0, 110);
      this.setState('forge');
      this.forgeUI.refreshPreview();
      this.forgeUI.submit();
    }
    // Testing aids: ?bossdead=1 opens the defeated-boss exit vortex; ?skip=N pre-simulates N fixed steps.
    if (this.params.get('bossdead') === '1' && this.world) {
      this.world.bossCleared = true;
      this.world.enemies = [];
      if (this.world.bossExitDoor) {
        this.world.bossExitDoor.openNow(this.world);
        if (!this.params.has('at')) {
          this.world.player.x = this.world.bossExitDoor.x - 44;
          this.world.player.y = this.world.bossExitDoor.y;
          this.world.camera.snapTo(this.world.player.x, this.world.player.y);
          this.world.syncBossGateToPlayer();
        }
      }
    }
    const skip = parseInt(this.params.get('skip') || '0', 10);
    for (let i = 0; i < skip; i++) { this.input.update(DT); this.update(DT); }
    this.fit();
    if (!this.touch || !this.touch.active) this.canvas.focus();
    requestAnimationFrame((t) => this.frame(t));
  }

  setState(s) {
    const prev = this.state;
    this.state = s;
    this.stateT = 0;
    if (s === 'pause' && prev !== 'pause') {
      if (prev === 'play') {
        this.audio.sfx('game_pause');
      }
      this.audio.pauseMusic();
    } else if (s === 'play' && this.audio.musicPaused) {
      if (prev === 'pause') {
        this.audio.sfx('game_unpause');
      }
      this.audio.resumeMusic();
    }
    if (this.touch && this.touch.active) {
      this.touch.onStateChange(prev, s);
    }
  }

  /** Locks in a difficulty preset and remembers it for next time. */
  chooseDifficulty(key) {
    this.difficultyKey = DIFFICULTIES[key] ? key : DEFAULT_DIFFICULTY;
    this.difficulty = DIFFICULTIES[this.difficultyKey];
    this.menuIndex = DIFFICULTY_ORDER.indexOf(this.difficultyKey);
    safeStorageSet('gothic.difficulty', this.difficultyKey);
  }

  /** Resolves all currently unlocked Boss Relic power-ups. */
  getActiveRelics() {
    return resolveActiveRelics(this.cleared, STAGES, this.params);
  }

  // ------------------------------------------------ Castle progression gates

  /** Bitmask covering every stage (built-in + forged). */
  allStagesMask() {
    return STAGES.length >= 31 ? 0x7fffffff : ((1 << STAGES.length) - 1);
  }

  /** May the hunter set foot in `key` yet? Only the Count's hall is ever barred. */
  canEnterStage(key) {
    return canEnterStage(key, this.cleared, this.debug);
  }

  /** `{ title, sub }` explaining why `key` is barred, or `null`. */
  stageEntryLock(key) {
    return stageEntryLock(key, this.cleared, this.debug);
  }

  /** Boss Gate Door status for `key` (see gates.js). */
  bossGateStatus(key) {
    return bossGateStatus(key, this.cleared, this.debug);
  }

  /** `{ felled, total }` guardians defeated among the built-in regions. */
  guardianProgress() {
    return guardianProgress(this.cleared);
  }

  /** Discovered for Castle Map fast travel (debug `UNLOCK ALL AREAS` charts everything). */
  isStageDiscovered(key) {
    if (this.debug.unlockAreas) return true;
    return isDiscovered(key, this.cleared, this.discovered);
  }

  /** Discovery mask handed to the Castle Map renderer. */
  discoveredForMap() {
    return this.debug.unlockAreas ? this.allStagesMask() : this.discovered;
  }

  /** Relic set handed to the Castle Map renderer (debug `UNLOCK ALL AREAS` draws every seal open). */
  relicsForMap() {
    if (!this.debug.unlockAreas) return this.getActiveRelics();
    return new Set(Object.keys(BOSS_RELICS));
  }

  /** Per-region progression summary for the Castle Map renderer. */
  mapGateInfo(key) {
    const gs = this.bossGateStatus(key);
    return { bossOpen: gs.open, bossSub: gs.sub, entryLock: this.stageEntryLock(key) };
  }

  /** Warps / enters `key` from the map or stage-select; rebuffs barred regions with the reason. */
  tryEnterStageFromMap(key, carry) {
    const idx = stageIndexOf(key);
    if (idx < 0) return false;
    if (!this.canEnterStage(key)) {
      const lock = this.stageEntryLock(key);
      this.audio.sfx('block');
      this.muteFlash = lock ? `${lock.title} · ${lock.sub}` : 'SEALED';
      this.muteT = 2.2;
      return false;
    }
    this.startGame(idx, carry);
    return true;
  }

  setDebugFlag(flag, on) {
    if (!(flag in DEFAULT_DEBUG_FLAGS)) return;
    this.debug = Object.assign({}, this.debug, { [flag]: !!on });
    safeStorageSet('gothic.debug.v1', JSON.stringify(this.debug));
    if (this.world) this.world.relics = this.getActiveRelics();
  }

  /**
   * Resets the hunt to its initial state: cleared bosses, charted map, sanctuaries,
   * vessels, level & EXP, armory, remembered stage/difficulty and debug flags.
   * Hunter callsign and Castle Forge wings (shared castle content) are kept.
   */
  resetProgress() {
    for (const k of [
      SAVE_STORAGE_KEY,
      'gothic.cleared.v3', 'gothic.discovered.v1', 'gothic.vessels.v1', 'gothic.explored.v2',
      'gothic.progression.v1', 'gothic.armory.v1', 'gothic.souls.v1', 'gothic.stage', 'gothic.difficulty', 'gothic.debug.v1',
    ]) safeStorageRemove(k);
    this.saveData = null;
    this.saveToast = null;
    this.cleared = 0;
    this.discovered = 1;
    this.vessels = 0;
    this.exploredCells = new Set();
    this.charLevel = START_LEVEL;
    this.charExp = 0;
    this._urlLevelOverride = false;
    this.ownedWeapons = new Set(['hunters_lash']);
    this.handL = 'hunters_lash';
    this.handR = null;
    this.activeLoadout = 0;
    this.loadouts = [['hunters_lash', null], ['hunters_lash', null]];
    this._urlArmoryOverride = false;
    this.soulRanks = {};
    this.equippedSouls = { bullet: null, guardian: null, enchant: null };
    this.bestiarySeen = new Set();
    this.bestiaryKills = {};
    this.bloodBladeStacks = 0;
    this.openedChests = new Set();
    this.openedSwitches = new Set();
    this._urlSoulOverride = false;
    this.debug = Object.assign({}, DEFAULT_DEBUG_FLAGS);
    this.difficultyKey = DEFAULT_DIFFICULTY;
    this.difficulty = DIFFICULTIES[this.difficultyKey];
    this.menuIndex = DIFFICULTY_ORDER.indexOf(this.difficultyKey);
    this.stageIndex = 0;
    this.stageCursor = 0;
    this.mapCursor = STAGES[0].key;
    this.visitedStages = new Set([STAGES[0].key]);
    this.carryState = null;
    this.world = null;
  }

  /** Persists newly charted Castle Grid cell coordinates (`"c,r"`). */
  markCellsExplored(cellKeys) {
    if (!cellKeys || !cellKeys.length) return;
    const before = this.exploredCells.size;
    for (const k of cellKeys) if (k) this.exploredCells.add(k);
    if (this.exploredCells.size !== before) {
      safeStorageSet('gothic.explored.v2', JSON.stringify([...this.exploredCells]));
    }
  }

  /** Marks a stage Sanctuary as discovered for Castle Map fast travel. */
  discoverStage(idx) {
    if (idx < 0 || idx >= STAGES.length) return false;
    const bit = 1 << idx;
    const wasNew = (this.discovered & bit) === 0;
    if (wasNew) {
      this.discovered |= bit;
      safeStorageSet('gothic.discovered.v1', String(this.discovered));
    }
    return wasNew;
  }

  /** Permanently records a collected Ancient Life Vessel (+1 Max HP, +2 Starting Hearts). */
  collectVessel(idx) {
    if (idx < 0 || idx >= STAGES.length) return false;
    const bit = 1 << idx;
    const wasNew = (this.vessels & bit) === 0;
    if (wasNew) {
      this.vessels |= bit;
      safeStorageSet('gothic.vessels.v1', String(this.vessels));
    }
    return wasNew;
  }

  /** Number of Ancient Life Vessels collected across all castle regions. */
  getVesselCount() {
    let n = 0;
    let m = this.vessels >>> 0;
    for (let i = 0; i < STAGES.length; i++) {
      if (m & 1) n++;
      m >>>= 1;
    }
    return n;
  }

  // ------------------------------------------------ Save points & castle discovery

  /** True when a continuable save point or post-boss save exists. */
  hasSaveGame() {
    return !!this.saveData;
  }

  /** Returns `{ count, total, exactPct, roundedPct, label }` for castle map discovery. */
  getCastleDiscoveryStats() {
    const started = this.hasSaveGame()
      || this.cleared !== 0
      || this.vessels !== 0
      || this.charLevel > START_LEVEL
      || (this.exploredCells && this.exploredCells.size > 1);
    return exploredCellStats(this.exploredCells, started);
  }

  /** Loads `gothic.save.v1` (or synthesizes a continuable save for legacy progress). */
  loadSaveData() {
    const raw = safeStorageGet(SAVE_STORAGE_KEY);
    if (raw) {
      try {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object' && typeof obj.stageKey === 'string') {
          const sIdx = stageIndexOf(obj.stageKey);
          const diffKey = DIFFICULTIES[obj.difficultyKey] ? obj.difficultyKey : this.difficultyKey;
          const diff = DIFFICULTIES[diffKey] || DIFFICULTIES[DEFAULT_DIFFICULTY];
          const spawnKind = (obj.spawnKind === 'sanctuary' || obj.spawnKind === 'boss_clear' || obj.spawnKind === 'stage_start')
            ? obj.spawnKind
            : 'sanctuary';
          return {
            version: 1,
            savedAt: Number(obj.savedAt) || Date.now(),
            stageKey: obj.stageKey,
            stageName: (sIdx >= 0 ? STAGES[sIdx].name : obj.stageName) || 'THE CASTLE',
            spawnKind,
            reason: typeof obj.reason === 'string' ? obj.reason : 'CRIMSON SANCTUM',
            difficultyKey: diffKey,
            score: Math.max(0, parseInt(obj.score, 10) || 0),
            lives: Math.max(diff.lives, parseInt(obj.lives, 10) || diff.lives),
            hearts: Math.max(0, Number.isFinite(Number(obj.hearts)) ? parseInt(obj.hearts, 10) : diff.hearts),
            subWeapon: typeof obj.subWeapon === 'string' ? obj.subWeapon : null,
            hp: Math.max(1, parseInt(obj.hp, 10) || PLAYER.maxHp),
            charLevel: Math.max(START_LEVEL, parseInt(obj.charLevel, 10) || this.charLevel || START_LEVEL),
            visitedStages: Array.isArray(obj.visitedStages) ? obj.visitedStages.filter((s) => typeof s === 'string') : [],
          };
        }
      } catch (e) { /* ignore malformed save */ }
    }
    if (!this._ephemeralSession) {
      const legacyCleared = parseInt(safeStorageGet('gothic.cleared.v3') || '0', 10) || 0;
      const legacyVessels = parseInt(safeStorageGet('gothic.vessels.v1') || '0', 10) || 0;
      const hasLegacyMap = !!safeStorageGet('gothic.explored.v2') && this.exploredCells && this.exploredCells.size > 1;
      if (legacyCleared > 0 || legacyVessels > 0 || this.charLevel > START_LEVEL || hasLegacyMap) {
        const storedIdx = parseInt(safeStorageGet('gothic.stage') || '0', 10) || 0;
        const idx = Math.max(0, Math.min(STAGES.length - 1, storedIdx));
        const st = STAGES[idx] || STAGES[0];
        const disc = !!(((this.discovered >>> idx) & 1) || ((legacyCleared >>> idx) & 1));
        return {
          version: 1,
          savedAt: Date.now(),
          stageKey: st.key,
          stageName: st.name,
          spawnKind: disc && idx > 0 ? 'sanctuary' : 'stage_start',
          reason: 'CRIMSON SANCTUM',
          difficultyKey: this.difficultyKey,
          score: 0,
          lives: this.difficulty.lives,
          hearts: this.difficulty.hearts + this.getVesselCount() * 2,
          subWeapon: null,
          hp: PLAYER.maxHp + this.getVesselCount(),
          charLevel: this.charLevel,
          visitedStages: [st.key],
        };
      }
    }
    return null;
  }

  /**
   * Records a persistent checkpoint save at a Crimson Save Sanctum or after a Boss Fight.
   * Safe to call multiple times (e.g. boss felled -> orb/rewards claimed -> next stage entered).
   */
  saveCheckpoint({
    spawnKind = 'sanctuary',
    reason = 'CRIMSON SANCTUM',
    world = this.world,
    silentToast = false,
  } = {}) {
    const stage = (world && world.stage) || STAGES[this.stageIndex] || STAGES[0];
    const diff = this.difficulty || DIFFICULTIES[DEFAULT_DIFFICULTY];
    const maxHp = world && world.computeMaxHp ? world.computeMaxHp() : PLAYER.maxHp;
    const saveObj = {
      version: 1,
      savedAt: Date.now(),
      stageKey: stage.key,
      stageName: stage.name,
      spawnKind,
      reason,
      difficultyKey: this.difficultyKey,
      score: world ? Math.max(0, Math.round(world.score || 0)) : 0,
      lives: Math.max(diff.lives, world ? (world.lives ?? diff.lives) : diff.lives),
      hearts: world ? Math.max(0, world.hearts ?? diff.hearts) : diff.hearts,
      subWeapon: (world && world.player && world.player.subWeapon) || (world && world.subWeaponCarry) || null,
      hp: maxHp,
      charLevel: this.charLevel,
      visitedStages: [...(this.visitedStages || [stage.key])],
    };
    this.saveData = saveObj;
    if (!this._ephemeralSession) {
      safeStorageSet(SAVE_STORAGE_KEY, JSON.stringify(saveObj));
      safeStorageSet('gothic.difficulty', this.difficultyKey);
      const sIdx = stageIndexOf(stage.key);
      if (sIdx >= 0) safeStorageSet('gothic.stage', String(sIdx));
    }
    if (!silentToast) {
      const disc = this.getCastleDiscoveryStats();
      this.saveToast = {
        text: `GAME SAVED · ${reason} · CASTLE ${disc.label}`,
        t: 0,
        dur: 2.9,
      };
    }
    return saveObj;
  }

  /** Resumes gameplay directly from `this.saveData` (Save Point or Post-Boss Save). */
  continueFromSave() {
    const save = this.saveData;
    if (!save) {
      this.setState('difficulty');
      this.audio.sfx('select');
      return;
    }
    if (save.difficultyKey && DIFFICULTIES[save.difficultyKey]) {
      this.chooseDifficulty(save.difficultyKey);
    }
    const foundIdx = stageIndexOf(save.stageKey);
    const targetIdx = foundIdx >= 0 ? foundIdx : 0;
    const st = STAGES[targetIdx];
    this.visitedStages = new Set(
      Array.isArray(save.visitedStages) && save.visitedStages.length
        ? save.visitedStages
        : [st.key],
    );
    this.visitedStages.add(st.key);
    const kind = foundIdx >= 0 ? save.spawnKind : 'stage_start';
    const enterFromDoorId = kind === 'sanctuary' ? 'save_point'
      : kind === 'boss_clear' ? 'boss_clear'
      : null;
    const carry = {
      score: Math.max(0, Number(save.score) || 0),
      lives: Math.max(this.difficulty.lives, Number(save.lives) || this.difficulty.lives),
      hearts: Math.max(0, Number.isFinite(Number(save.hearts)) ? Number(save.hearts) : this.difficulty.hearts),
      subWeapon: save.subWeapon || null,
      hp: Number(save.hp) || null,
      enterFromDoorId,
    };
    this.carryState = carry;
    this.startGame(targetIdx, carry);
  }

  /** Dynamic Home Screen menu items and vertical geometry (shared with TouchControls). */
  getTitleMenuLayout() {
    const isTouch = !!(this.touch && this.touch.active);
    const gp = this.guardianProgress();
    const disc = this.getCastleDiscoveryStats();
    const huntSub = gp.felled > 0
      ? `${isTouch ? 'TAP OR PRESS START' : 'START AT STAGE 1'} · GUARDIANS ${gp.felled}/${gp.total}${allGuardiansFelled(this.cleared) ? ' · THE COUNT AWAITS' : ''}`
      : (isTouch ? 'TAP OR PRESS START TO BEGIN A NEW HUNT' : 'PRESS ENTER OR START TO BEGIN THE HUNT');
    const debugOn = this.debug.unlockAreas || this.debug.unlockBosses;
    const items = [];
    if (this.hasSaveGame()) {
      const sv = this.saveData;
      const sIdx = stageIndexOf(sv.stageKey);
      const stName = ((sIdx >= 0 ? STAGES[sIdx].name : sv.stageName) || 'THE CASTLE').replace(/^THE\s+/, '');
      const pointTag = sv.spawnKind === 'boss_clear'
        ? 'BOSS CLEARED'
        : sv.spawnKind === 'stage_start'
          ? 'ENTRANCE'
          : 'SAVE SANCTUM';
      const lv = String(this.charLevel || sv.charLevel || START_LEVEL).padStart(2, '0');
      items.push({
        id: 'continue',
        label: 'CONTINUE',
        sub: `${stName} (${pointTag}) · LV ${lv} · ${disc.label} CASTLE DISCOVERED`,
      });
    }
    items.push(
      { id: 'begin', label: 'BEGIN THE HUNT', sub: huntSub },
      {
        id: 'forge',
        label: 'EXPAND THE CASTLE',
        sub: `PROPOSE A NEW WING · ${this.forge.forgedCount ? `${this.forge.forgedCount} RAISED SO FAR` : 'AI-FORGED LEVEL, ART, MUSIC AND BOSS'}`,
      },
      {
        id: 'controls',
        label: 'CONTROLS',
        sub: isTouch ? 'TOUCH D-PAD, WEAPON CLUSTER & SHORTCUTS' : 'KEYBOARD, GAMEPAD & TOUCH CONTROLS',
      },
      {
        id: 'settings',
        label: 'SETTINGS',
        sub: debugOn ? 'RESET PROGRESS · DEBUG UNLOCKS ACTIVE' : 'RESET PROGRESS · DEBUG UNLOCKS',
      },
    );
    const hasSave = this.hasSaveGame();
    return {
      items,
      y0: hasSave ? TITLE_MENU_SAVE_Y0 : TITLE_MENU_Y0,
      rowH: hasSave ? TITLE_MENU_SAVE_ROW_H : TITLE_MENU_ROW_H,
    };
  }

  indexOfTitleAction(id) {
    const idx = this.getTitleMenuLayout().items.findIndex((it) => it.id === id);
    return idx >= 0 ? idx : 0;
  }

  activateTitleMenuItem(row) {
    const menu = this.getTitleMenuLayout();
    const item = menu.items[row] || menu.items[0];
    if (!item) return;
    this.titleMenu = Math.max(0, Math.min(menu.items.length - 1, row));
    switch (item.id) {
      case 'continue':
        this.continueFromSave();
        break;
      case 'forge':
        this.openForge('title');
        break;
      case 'controls':
        this.openControls();
        break;
      case 'settings':
        this.openSettings();
        break;
      case 'begin':
      default:
        this.setState('difficulty');
        this.audio.sfx('select');
        break;
    }
  }

  /** Combat & vitality bonuses granted by the hunter's current Character Level. */
  getLevelBonuses() {
    return levelBonuses(this.charLevel);
  }

  saveProgression() {
    if (this._urlLevelOverride) return;
    safeStorageSet('gothic.progression.v1', JSON.stringify({
      level: this.charLevel,
      exp: this.charExp,
    }));
  }

  /** Awards `amount` EXP along the Adaptive Curve and resolves any level-ups. */
  gainExp(amount) {
    const prevLevel = this.charLevel;
    const prevBonuses = levelBonuses(prevLevel);
    const res = applyExpGain(this.charLevel, this.charExp, amount);
    this.charLevel = res.level;
    this.charExp = res.exp;
    this.saveProgression();
    return Object.assign(res, {
      prevLevel,
      prevBonuses,
      bonuses: levelBonuses(this.charLevel),
    });
  }

  // ------------------------------------------------ Dual-Hand Equipment Matrix

  hasWeapon(id) {
    return !!(id && this.ownedWeapons && this.ownedWeapons.has(id));
  }

  unlockWeapon(id) {
    if (!id || !WEAPONS[id]) return false;
    const wasNew = !this.ownedWeapons.has(id);
    this.ownedWeapons.add(id);
    if (wasNew) this.saveArmory();
    return wasNew;
  }

  equipWeapon(slot, id) {
    if (slot === 0) {
      const wid = id && WEAPONS[id] ? id : 'hunters_lash';
      this.ownedWeapons.add(wid);
      this.handL = wid;
      if (WEAPONS[wid].isTwoHanded) {
        // Two-handed weapons lock and visually hide Hand_R
        this.handR = null;
      }
    } else {
      if (!id) {
        this.handR = null;
      } else if (WEAPONS[id]) {
        this.ownedWeapons.add(id);
        if (WEAPONS[id].isTwoHanded) {
          this.handL = id;
          this.handR = null;
        } else {
          if (WEAPONS[this.handL] && WEAPONS[this.handL].isTwoHanded) {
            this.handL = 'hunters_lash';
          }
          this.handR = id;
        }
      }
    }
    if (this.loadouts && this.loadouts[this.activeLoadout || 0]) {
      this.loadouts[this.activeLoadout || 0] = [this.handL, this.handR];
    }
    this.saveArmory();
    if (this.touch && this.touch.active) this.touch.syncUI(true);
  }

  /** Instantly toggles between Loadout Set A (0) and Loadout Set B (1) mid-combat! */
  swapLoadout(world = this.world) {
    if (!this.loadouts) this.loadouts = [[this.handL, this.handR], ['hunters_lash', null]];
    this.loadouts[this.activeLoadout || 0] = [this.handL, this.handR];
    this.activeLoadout = this.activeLoadout === 0 ? 1 : 0;
    const [nextL, nextR] = this.loadouts[this.activeLoadout] || ['hunters_lash', null];
    this.handL = nextL && this.ownedWeapons.has(nextL) && WEAPONS[nextL] ? nextL : 'hunters_lash';
    this.handR = !WEAPONS[this.handL].isTwoHanded && nextR && this.ownedWeapons.has(nextR) && WEAPONS[nextR] ? nextR : null;
    this.loadouts[this.activeLoadout] = [this.handL, this.handR];
    this.saveArmory();
    this.audio.sfx('select');
    if (world && world.player) {
      const p = world.player;
      const w0 = this.getHandWeapon(0);
      p.noWhip = !!(w0 && w0.category !== 'whip');
      const setName = this.activeLoadout === 0 ? 'SET A' : 'SET B';
      p.skillBanner = { text: `⇄ ${setName} · ${w0.short}`, color: this.activeLoadout === 0 ? '#ffd27a' : '#62f2c2', t: 0.9 };
      world.particles.sparks(p.x, p.y - 34, 8, this.activeLoadout === 0 ? '#ffd27a' : '#62f2c2');
    }
    if (this.touch && this.touch.active) this.touch.syncUI(true);
  }

  getHandWeapon(slot) {
    const wL = WEAPONS[this.handL] || WEAPONS.hunters_lash;
    if (slot === 0) return wL;
    if (wL.isTwoHanded) return null;
    return this.handR && WEAPONS[this.handR] ? WEAPONS[this.handR] : null;
  }

  getActiveResonance() {
    const wL = this.getHandWeapon(0);
    const wR = this.getHandWeapon(1);
    return resolvePairResonance(wL, wR);
  }

  getEnchantStrBonus() {
    return computeEnchantBonuses(this).strBonus || 0;
  }

  absorbSoul(soulId) {
    const g = SOUL_GLYPHS[soulId];
    if (!g) return { rank: 1, wasNew: false };
    const prev = this.soulRanks[soulId] || 0;
    const rank = Math.min(SOUL_MAX_RANK, prev + 1);
    this.soulRanks[soulId] = rank;
    let wasNew = prev === 0;
    if (!this.equippedSouls[g.type]) {
      this.equippedSouls[g.type] = soulId;
      wasNew = true;
    }
    this.saveGrimoire();
    return { rank, wasNew };
  }

  equipSoul(soulId) {
    const g = SOUL_GLYPHS[soulId];
    if (!g || !(this.soulRanks[soulId] > 0)) return;
    if (this.equippedSouls[g.type] === soulId) {
      this.equippedSouls[g.type] = null;
    } else {
      this.equippedSouls[g.type] = soulId;
    }
    if (this.world && this.world.player) {
      this.world.player.maxHp = this.world.computeMaxHp();
      this.world.player.hp = Math.min(this.world.player.maxHp, this.world.player.hp);
    }
    this.saveGrimoire();
  }

  noteBestiarySeen(enemy) {
    const key = resolveEnemySpeciesKey(enemy);
    if (!key) return;
    if (!this.bestiarySeen.has(key)) {
      this.bestiarySeen.add(key);
      this.saveGrimoire();
    }
  }

  noteBestiaryKill(enemy) {
    const key = resolveEnemySpeciesKey(enemy);
    if (!key) return;
    this.bestiarySeen.add(key);
    this.bestiaryKills[key] = (this.bestiaryKills[key] || 0) + 1;
    this.saveGrimoire();
  }

  addBloodStack() {
    this.bloodBladeStacks = Math.min(24, (this.bloodBladeStacks || 0) + 1);
    this.saveGrimoire();
    return this.bloodBladeStacks;
  }

  markChestOpened(chestId) {
    if (!chestId) return;
    this.openedChests.add(chestId);
    this.saveGrimoire();
  }

  isChestOpened(chestId) {
    return !!(chestId && this.openedChests && this.openedChests.has(chestId));
  }

  markSwitchOpened(switchId) {
    if (!switchId) return;
    this.openedSwitches.add(switchId);
    this.saveGrimoire();
  }

  isSwitchOpened(switchId) {
    return !!(switchId && this.openedSwitches && this.openedSwitches.has(switchId));
  }

  saveGrimoire() {
    if (this._urlSoulOverride) return;
    safeStorageSet('gothic.souls.v1', JSON.stringify({
      soulRanks: this.soulRanks,
      equippedSouls: this.equippedSouls,
      bestiarySeen: [...this.bestiarySeen],
      bestiaryKills: this.bestiaryKills,
      bloodBladeStacks: this.bloodBladeStacks || 0,
      openedChests: [...this.openedChests],
      openedSwitches: [...this.openedSwitches],
    }));
  }

  saveArmory() {
    if (this._urlArmoryOverride) return;
    safeStorageSet('gothic.armory.v1', JSON.stringify({
      owned: [...this.ownedWeapons],
      handL: this.handL,
      handR: this.handR,
      activeLoadout: this.activeLoadout || 0,
      loadouts: this.loadouts,
    }));
  }

  openArmory(returnState = 'play', initialTab = 'armory') {
    this.armoryUI.open(returnState, initialTab);
    this.setState('armory');
    this.audio.sfx('select');
  }

  /** Opens the in-canvas Hunter Callsign editor (`C` on menus/map/pause). */
  openCallsignEditor() {
    this.editingCallsign = true;
    this.callsignDraft = this.net.name || '';
    this.input.setTyping((e) => this.handleCallsignKey(e));   // shared text-entry mode (also used by the Castle Forge)
    this.audio.sfx('select');
    if (this.touch && this.touch.active) { this.touch.syncUI(true); this.fit(); }
  }

  closeCallsignEditor(save = false) {
    if (save) {
      const clean = this.callsignDraft.trim();
      if (clean) {
        this.net.setName(clean);
        this.muteFlash = `CALLSIGN · ${this.net.name}`;
        this.muteT = 1.6;
      }
    }
    this.editingCallsign = false;
    this.input.setTyping(null);
    if (this.touch) {
      this.touch.blurTextProxy();
      if (this.touch.active) { this.touch.syncUI(true); this.fit(); }
    }
    this.audio.sfx('select');
  }

  handleCallsignKey(e) {
    e.preventDefault();
    if (e.code === 'Escape') {
      this.closeCallsignEditor(false);
      return;
    }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      this.closeCallsignEditor(true);
      return;
    }
    if (e.code === 'Backspace') {
      this.callsignDraft = this.callsignDraft.slice(0, -1);
      this.audio.sfx('bone');
      return;
    }
    if (e.key && e.key.length === 1 && this.callsignDraft.length < 12) {
      const ch = e.key.toUpperCase().replace(/[^A-Z0-9 _.-]/g, '');
      if (ch) {
        this.callsignDraft += ch;
        this.audio.sfx('bone');
      }
    }
  }

  buildNetSnapshot() {
    const stageKey = STAGES[this.stageIndex] ? STAGES[this.stageIndex].key : 'graveyard';
    if (!this.world || !this.world.player) {
      return {
        stageKey,
        x: 96,
        y: 320,
        vx: 0,
        vy: 0,
        normX: 0.02,
        normY: 0.65,
        inSecret: false,
        anim: 'idle',
        facing: 1,
        walkFrame: 0,
        attackT: -1,
        attackCrouch: false,
        throwing: false,
        whipReach: 68,
        subWeapon: null,
        petrified: 0,
        invuln: 0,
        hp: 16,
        maxHp: 16,
        level: this.charLevel,
        relicsMask: this.cleared | 0,
        screen: this.state,
      };
    }
    const p = this.world.player;
    const normX = this.world.level.width > 0 ? p.x / this.world.level.width : 0;
    const normY = this.world.level.height > 0 ? p.y / this.world.level.height : 0.5;
    let actSlot = null;
    if (Array.isArray(p.slots)) {
      for (const sl of p.slots) {
        if (sl && sl.active && sl.weapon && sl.weapon.category !== 'whip') {
          if (!actSlot || (actSlot.guarding && !sl.guarding)) actSlot = sl;
        }
      }
    }
    return {
      stageKey: this.world.stage.key,
      x: p.x,
      y: p.y,
      vx: p.vx,
      vy: p.vy,
      normX,
      normY,
      inSecret: !!this.world.inSecretArea,
      anim: p.state,
      dashK: p.dashT > 0 ? Math.round((p.dashT / PLAYER.dashTime) * 100) / 100 : 0,
      runT: p.runT > 0 ? Math.round(p.runT * 100) / 100 : 0,
      runFrame: p.runFrame || 0,
      facing: p.facing,
      walkFrame: p.walkFrame,
      attackT: p.attackT,
      attackCrouch: p.attackCrouch,
      throwing: p.throwing,
      whipReach: p.whipReach,
      wId: actSlot ? actSlot.weapon.id : null,
      wT: actSlot ? actSlot.timer : -1,
      wDur: actSlot ? (actSlot.duration || 0.3) : 0.3,
      wCr: actSlot ? !!(actSlot.crouch || p.crouching) : false,
      wGd: actSlot ? !!actSlot.guarding : false,
      subWeapon: p.subWeapon,
      petrified: p.petrified,
      invuln: p.invuln,
      hp: p.hp,
      maxHp: p.maxHp,
      level: this.charLevel,
      relicsMask: this.cleared | 0,
      screen: this.state,
    };
  }

  /** Opens the full-screen Castle Exploration Map (`M`) showing the hunter's live location. */
  openMap() {
    if (!this.world) return;
    this.world.recordExploration();
    this.mapCursor = STAGES[this.stageIndex].key;
    this.setState('map');
    this.audio.sfx('select');
  }

  /** Starts a stage; `carry` continues score/lives/hearts from the previous one. */
  startGame(stageIndex = this.stageIndex, carry = this.carryState) {
    this.stageIndex = Math.max(0, Math.min(STAGES.length - 1, stageIndex));
    this.mapCursor = STAGES[this.stageIndex].key;
    safeStorageSet('gothic.stage', String(this.stageIndex));
    const stage = STAGES[this.stageIndex];
    if (!this.visitedStages) this.visitedStages = new Set();
    this.visitedStages.add(stage.key);
    this.world = new World(this, stage, carry);
    // ?boss=1 teleports directly to the boss vestibule for testing.
    if (this.params.has('boss') && stage.boss && !carry) {
      this.world.phase = 'play';
      this.world.phaseT = 0;
      this.world.messages = [];
      this.world.player.x = stage.boss.triggerX + 4;
      this.world.player.y = stage.boss.arena.floorY;
      this.world.camera.snapTo(this.world.player.x, this.world.player.y);
      if (this.params.get('boss') === '2') {
        this.world.startBoss();
        this.world.messages = [];
      }
    }
    // ?gate=1 teleports to the vestibule just outside the vertical Boss Gate Door for testing.
    if (this.params.has('gate') && stage.boss && stage.boss.gateCol != null && !carry) {
      this.world.phase = 'play';
      this.world.phaseT = 0;
      this.world.messages = [];
      this.world.player.x = stage.boss.gateCol * 32 - 64;
      this.world.player.y = stage.boss.arena.floorY;
      this.world.camera.snapTo(this.world.player.x, this.world.player.y);
    }
    // ?at=<tile column>[&aty=<tile row>] teleports the hunter for testing.
    let at = parseInt(this.params.get('at') || '-1', 10);
    const aty = parseInt(this.params.get('aty') || '-1', 10);
    if (at >= 0 && !carry) {
      at = Math.min(at, Math.floor(stage.boss.triggerX / 32) + 1);
      const lvl = this.world.level;
      let row = aty >= 1 ? lvl.surfaceRow(at, aty - 1) : lvl.surfaceRow(at);
      if (row < 0) {
        for (let d = 1; d <= 6 && row < 0; d++) {
          row = lvl.surfaceRow(at - d);
          if (row < 0) row = lvl.surfaceRow(at + d);
        }
      }
      const wx = at * 32 + 16;
      let wy = (row >= 0 ? row : 12) * 32;
      const stNear = lvl.solidStairNear && lvl.solidStairNear(wx, wy, 36);
      if (stNear) wy = lvl.stairY(stNear, wx);
      this.world.player.x = wx;
      this.world.player.y = wy;
      if (stNear) this.world.player.onStair = stNear;
      this.world.camera.snapTo(this.world.player.x, this.world.player.y);
      this.world.recordExploration();
    }
    if (this.world.bossActive || (this.params.has('boss') && stage.boss && !carry)) {
      this.world.recordExploration();
    }
    // Testing teleports may land inside the Boss Sanctum or Castle Foyer: sync gates & drawbridge.
    this.world.syncBossGateToPlayer();
    if (this.world.syncDrawbridgeToPlayer) this.world.syncDrawbridgeToPlayer();
    this.setState('play');
    this.audio.playMusic(this.world.theme.music);
    this.audio.playAmbient(this.world.theme.ambient || null);
    this.audio.sfx('select');
  }

  // Hooks from World
  onRespawn() { this.audio.playMusic(this.world.theme.music); }
  onGameOver() {
    if (this.world) this.world.messages = [];
    this.setState('gameover');
    this.audio.playMusic('gameover', false);
    this.audio.stopAmbient();
  }
  /** Persists stage-clear & Boss Relic unlock in-world without opening a modal map screen. */
  unlockStageClear() {
    const wasCleared = !!((this.cleared >>> this.stageIndex) & 1);
    this.cleared |= 1 << this.stageIndex;
    safeStorageSet('gothic.cleared.v3', String(this.cleared));
    if (this.world) {
      this.world.relics = this.getActiveRelics();
    }
    return !wasCleared;
  }
  onStageClear() {
    this.unlockStageClear();
    if (this.world) this.world.messages = [];
    this.setState('clear');
  }

  /** After clearing a stage: advance directly into the next adjacent level, or Dawn Finale after Throne. */
  advance() {
    const key = STAGES[this.stageIndex].key;
    const nextKey = nextAdjacentStageKey(
      key,
      this.cleared,
      this.getActiveRelics(),
      (k) => this.canEnterStage(k),
      this.visitedStages,
    );
    if (!nextKey) { this.beginEnding(); return; }
    const nextIdx = stageIndexOf(nextKey);
    if (nextIdx >= 0) {
      this.discoverStage(nextIdx);
      this.startGame(nextIdx, this.world ? this.world.carry() : this.carryState);
      if (this.world) {
        this.saveCheckpoint({ spawnKind: 'stage_start', reason: 'STAGE CLEAR', world: this.world });
      }
      return;
    }
    this.carryState = this.world ? this.world.carry() : this.carryState;
    this.mapCursor = nextRoomAfter(key, this.cleared) || key;
    this.setState('stageselect');
    this.audio.playMusic('title');
    this.audio.stopAmbient();
  }

  banner(lines, y, opts, ctx = this.ctx) { drawBanner(ctx, this.font, lines, y, opts); }

  /** Scripted attract/testing driver (?demo=1): walk, jump and whip. `?demo=dash` double-taps forward. */
  startDemo() {
    this.startGame();
    this.audio.muted = true;
    if (this.params.get('demo') === 'dash') {
      // Deterministic sprint showcase: no fiends, then double-tap right and hold every 2.5 s.
      // `&dashfreeze=<t>` hit-stops the simulation once the sprint has lasted `t` seconds.
      const freezeT = this.params.has('dashfreeze') ? parseFloat(this.params.get('dashfreeze')) : null;
      this.input.setScript((t) => {
        if (t > 40) return null;
        const w = this.world;
        if (w && w.enemies.length) w.enemies.length = 0;
        if (w && freezeT != null && w.hitStop <= 0 && w.player.runT >= freezeT && w.player.runT > 0) {
          w.hitStop = 1e9;
        }
        const seg = t % 2.5;
        const tapRight = (seg > 0.20 && seg < 0.26) || (seg > 0.32 && seg < 1.9);
        return { right: tapRight };
      });
      return;
    }
    this.input.setScript((t) => {
      if (t > 40) return null;
      const seg = t % 6;
      return {
        right: seg < 4.2,
        jump: (seg > 1.0 && seg < 1.25) || (seg > 2.6 && seg < 2.85),
        attack: (seg > 1.9 && seg < 2.0) || (seg > 4.4 && seg < 4.5) || (seg > 5.2 && seg < 5.3),
        down: seg > 4.6 && seg < 5.1,
      };
    });
  }

  frame(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= DT && steps < 5) {
      this.input.update(DT);
      this.update(DT);
      this.acc -= DT;
      steps++;
    }
    if (this.canvas.clientWidth < 32) this.fit();
    if (this.touch) this.touch.update();
    this.draw();
    const fxWorld = (this.state === 'play' || this.state === 'pause' || this.state === 'armory' || this.state === 'clear' || this.state === 'gameover') ? this.world : null;
    if (fxWorld) {
      if (fxWorld.flash > 0.02) this.postfx.strike(fxWorld.flash);
      if (fxWorld.fxHurt) { this.postfx.damage(fxWorld.fxHurt); fxWorld.fxHurt = 0; }
      if (fxWorld.fxRoar) { this.postfx.flash(fxWorld.fxRoar); fxWorld.fxRoar = 0; }
      if (fxWorld.fxShock) {
        const sh = fxWorld.fxShock;
        this.postfx.shockwave(sh.x, sh.y, sh.strength);
        fxWorld.fxShock = null;
      }
      if (this.postfx.setDynamicLights) {
        const chronoAmt = fxWorld.chronoFreezeT > 0 ? Math.min(1, fxWorld.chronoFreezeT / 0.45) : 0;
        this.postfx.setDynamicLights(fxWorld.gatherDynamicLights ? fxWorld.gatherDynamicLights() : null, chronoAmt);
      }
    } else {
      if (this.postfx.setDynamicLights) this.postfx.setDynamicLights(null, 0);
      if ((this.state === 'title' || this.state === 'controls' || this.state === 'settings' || this.state === 'difficulty' || this.state === 'stageselect') && this.titleWorld && this.titleWorld.flash > 0.02) {
        this.postfx.strike(this.titleWorld.flash);
      }
    }
    this.postfx.draw(dt, fxWorld ? (fxWorld.fxTheme || fxWorld.data.theme) : 'menu');
    requestAnimationFrame((t) => this.frame(t));
  }

  update(dt) {
    this.stateT += dt;
    if (this.saveToast) {
      this.saveToast.t += dt;
      if (this.saveToast.t >= this.saveToast.dur) this.saveToast = null;
    }
    this.net.update(dt, this.net.enabled ? (this._netSnapFn || (this._netSnapFn = () => this.buildNetSnapshot())) : null);
    if (this.editingCallsign) {
      if (this.state === 'title' || this.state === 'controls' || this.state === 'settings' || this.state === 'difficulty' || this.state === 'stageselect') {
        this.updateTitleBackdrop(dt);
      }
      return;
    }
    const inp = this.input;
    if (inp.pressed.mute) { const m = this.audio.toggleMute(); this.muteFlash = m ? 'SOUND OFF' : 'SOUND ON'; this.muteT = 1.2; }
    if (inp.pressed.fx) { const on = this.postfx.toggle(); const fl = getFxLayers(); if (fl) fl.setEnabled(on); this.muteFlash = on ? 'SHADERS ON' : 'SHADERS OFF'; this.muteT = 1.2; }
    if (inp.pressed.callsign && (this.state === 'title' || this.state === 'stageselect' || this.state === 'map' || this.state === 'pause')) {
      this.openCallsignEditor();
      return;
    }
    this.muteT = Math.max(0, (this.muteT || 0) - dt);

    switch (this.state) {
      case 'title': {
        this.updateTitleBackdrop(dt);
        this.audio.playMusic('title');
        this.audio.stopAmbient();
        const menu = this.getTitleMenuLayout();
        const nMenu = menu.items.length;
        if (this.titleMenu >= nMenu) this.titleMenu = 0;
        if (inp.pressed.up) { this.titleMenu = (this.titleMenu + nMenu - 1) % nMenu; this.audio.sfx('bone'); }
        if (inp.pressed.down) { this.titleMenu = (this.titleMenu + 1) % nMenu; this.audio.sfx('bone'); }
        if (inp.pressed.forge) { this.openForge('title'); break; }
        if (inp.pressed.start || inp.pressed.jump || inp.pressed.attack) {
          this.activateTitleMenuItem(this.titleMenu);
        }
        break;
      }
      case 'controls':
        this.updateTitleBackdrop(dt);
        this.updateControls(dt, inp);
        break;
      case 'settings':
        this.updateTitleBackdrop(dt);
        this.updateSettings(dt, inp);
        break;
      case 'forge':
        this.forgeUI.updateProposal(dt, inp);
        break;
      case 'forging':
        this.forgeUI.updateForging(dt, inp);
        break;
      case 'difficulty': {
        this.updateTitleBackdrop(dt);
        if (inp.pressed.escape || inp.pressed.sprint) { this.setState('title'); this.audio.sfx('pause'); break; }
        const n = DIFFICULTY_ORDER.length;
        if (inp.pressed.up || inp.pressed.left) { this.menuIndex = (this.menuIndex + n - 1) % n; this.audio.sfx('bone'); }
        if (inp.pressed.down || inp.pressed.right) { this.menuIndex = (this.menuIndex + 1) % n; this.audio.sfx('bone'); }
        if (this.stateT > 0.25 && (inp.pressed.start || inp.pressed.jump || inp.pressed.attack)) {
          this.chooseDifficulty(DIFFICULTY_ORDER[this.menuIndex]);
          this.carryState = null;
          this.startGame(0, null);
        }
        break;
      }
      case 'stageselect': {
        this.updateTitleBackdrop(dt);
        if (inp.pressed.escape || inp.pressed.sprint) { this.setState('difficulty'); this.audio.sfx('pause'); break; }
        if (inp.pressed.forge) { this.openForge('stageselect'); break; }
        let c = this.mapCursor;
        if (inp.pressed.left) c = moveCursor(c, -1, 0);
        else if (inp.pressed.right) c = moveCursor(c, 1, 0);
        else if (inp.pressed.up) c = moveCursor(c, 0, -1);
        else if (inp.pressed.down) c = moveCursor(c, 0, 1);
        if (c !== this.mapCursor) { this.mapCursor = c; this.audio.sfx('bone'); }
        if (this.stateT > 0.25 && (inp.pressed.start || inp.pressed.jump || inp.pressed.attack)) {
          this.tryEnterStageFromMap(this.mapCursor, this.carryState);
        }
        break;
      }
      case 'play':
        if (inp.pressed.armory) { this.openArmory('play', 'armory'); break; }
        if (inp.pressed.bestiary) { this.openArmory('play', 'bestiary'); break; }
        if (inp.pressed.map) { this.openMap(); break; }
        if (this.world.canSkipBossIntro && this.world.canSkipBossIntro()) {
          const introReady = !this.world.bossIntro || this.world.bossIntro.t >= 0.22 || this.world.voiceSpeaking();
          if (inp.pressed.start || inp.pressed.escape || (introReady && (inp.pressed.jump || inp.pressed.attack || inp.pressed.offhand || inp.pressed.sprint))) {
            this.world.skipBossIntro();
            break;
          }
        }
        if (inp.pressed.escape && this.world.phase === 'play') { this.setState('pause'); break; }
        if (inp.pressed.start && (this.world.phase === 'play' || this.world.phase === 'intro')) {
          this.openArmory('play', 'armory');
          break;
        }
        this.world.update(dt, inp);
        break;
      case 'armory':
        this.armoryUI.update(dt, inp);
        break;
      case 'map': {
        if (inp.pressed.armory) { this.openArmory('map', 'armory'); break; }
        if (inp.pressed.bestiary) { this.openArmory('map', 'bestiary'); break; }
        let c = this.mapCursor;
        if (inp.pressed.left) c = moveCursor(c, -1, 0);
        else if (inp.pressed.right) c = moveCursor(c, 1, 0);
        else if (inp.pressed.up) c = moveCursor(c, 0, -1);
        else if (inp.pressed.down) c = moveCursor(c, 0, 1);
        if (c !== this.mapCursor) { this.mapCursor = c; this.audio.sfx('bone'); }
        if (inp.pressed.map || inp.pressed.escape || inp.pressed.sprint) {
          this.setState('play');
          this.audio.sfx('pause');
          break;
        }
        if (this.stateT > 0.16 && (inp.pressed.start || inp.pressed.jump || inp.pressed.attack)) {
          const curKey = STAGES[this.stageIndex].key;
          if (this.mapCursor === curKey) {
            this.setState('play');
            this.audio.sfx('pause');
          } else if (this.isStageDiscovered(this.mapCursor)) {
            this.tryEnterStageFromMap(
              this.mapCursor,
              this.world.carry({ enterFromDoorId: 'sanctuary' }),
            );
          } else {
            this.audio.sfx('block');
          }
        }
        break;
      }
      case 'pause':
        if (inp.pressed.armory) { this.openArmory('pause', 'armory'); break; }
        if (inp.pressed.bestiary) { this.openArmory('pause', 'bestiary'); break; }
        if (inp.pressed.map) { this.openMap(); break; }
        if (inp.pressed.start || inp.pressed.escape || inp.pressed.sprint) { this.setState('play'); }
        break;
      case 'clear':
        this.world.update(dt, inp);
        if (this.stateT > 2 && (inp.pressed.start || inp.pressed.jump || inp.pressed.attack)) this.advance();
        break;
      case 'ending':
        if (this.stateT > 6 && (inp.pressed.start || inp.pressed.jump || inp.pressed.attack)) {
          this.titleMenu = 0;
          this.setState('title');
          this.audio.stopMusic();
          if (this.audio.stopVoice) this.audio.stopVoice();
          this.endingNarrated = false;
        }
        if (this.state === 'ending' && !this.endingNarrated && this.stateT >= 1.2) {
          this.endingNarrated = true;
          const startOffset = Math.max(0, this.stateT - 1.2);
          this.audio.playVoice('narrator_ending', {
            space: 'cathedral',
            offset: startOffset > 0.25 ? startOffset : 0,
          });
        }
        break;
      case 'gameover':
        if (this.stateT > 1.5 && (inp.pressed.start || inp.pressed.jump || inp.pressed.attack)) {
          this.titleMenu = 0;
          this.setState('title');
          this.audio.stopMusic();
        }
        break;
      default: break;
    }
  }

  updateTitleBackdrop(dt) {
    const tw = this.titleWorld;
    tw.parallax.update(dt);
    tw.particles.update(dt);
    { const fl = getFxLayers(); if (fl) fl.update(dt); }
    tw.updateLightning(dt);
    tw.time += dt;
    tw.level.updateMechanics(dt, tw.time, null, null);
    tw.camera.x += dt * 14;
    if (tw.camera.x > 96 * 32) tw.camera.x = 4 * 32;
  }

  draw() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    switch (this.state) {
      case 'title': this.drawTitle(ctx); break;
      case 'controls': this.drawControls(ctx); break;
      case 'settings': this.drawSettings(ctx); break;
      case 'difficulty': this.drawDifficulty(ctx); break;
      case 'stageselect': this.drawStageSelect(ctx); this.forgeUI.drawTicker(ctx, 230, 572, 'right'); break;
      case 'forge': this.forgeUI.drawProposal(ctx); break;
      case 'forging': this.forgeUI.drawForging(ctx); break;
      case 'map': this.drawLiveMap(ctx); break;
      case 'armory': this.armoryUI.draw(ctx); break;
      case 'play': case 'pause':
        this.world.draw(ctx);
        drawHud(ctx, this.font, this.assets, this.world);
        if (this.state === 'pause') {
          ctx.fillStyle = 'rgba(4, 3, 10, 0.55)'; ctx.fillRect(0, 0, W, H);
          const isTouch = !!(this.touch && this.touch.active);
          const netSub = this.net && this.net.connected
            ? `${this.net.onlineCount} ONLINE (${this.net.room.toUpperCase()}) · ${isTouch ? 'TAP TO RESUME · GEAR · NAME' : 'E ARMORY · C CALLSIGN'} (${this.net.name})`
            : isTouch ? 'TAP SCREEN OR RESUME · GEAR · MAP · NAME' : 'ENTER RESUME · E ARMORY · M MAP · C CALLSIGN · N MUTE';
          this.banner(['PAUSED'], 146, { scale: 3, sub: netSub });
        }
        break;
      case 'clear':
        this.world.draw(ctx);
        drawHud(ctx, this.font, this.assets, this.world);
        this.drawClear(ctx);
        break;
      case 'ending': this.drawEnding(ctx); break;
      case 'gameover': {
        this.world.draw(ctx, { hud: false });
        ctx.fillStyle = 'rgba(4, 3, 10, 0.6)'; ctx.fillRect(0, 0, W, H);
        const isTouch = !!(this.touch && this.touch.active);
        const goSub = this.stateT > 1.5
          ? (this.hasSaveGame()
            ? (isTouch ? 'TAP OR PRESS START · CONTINUE FROM LAST SAVE' : 'PRESS ENTER · CONTINUE FROM LAST SAVE ON TITLE')
            : (isTouch ? 'TAP OR PRESS START' : 'PRESS ENTER'))
          : ' ';
        this.banner(['GAME OVER'], 136, { scale: 4, color: '#e23c3c', sub: goSub });
        this.font.draw(ctx, `LV ${String(this.charLevel).padStart(2, '0')} · SCORE ${String(this.world.score).padStart(7, '0')}`, W / 2, 215, { align: 'center', scale: 2, gothic: false, shadow: '#120f1c' });
        break;
      }
      default: break;
    }
    if (this.editingCallsign) this.drawCallsignModal(ctx);
    if (this.muteT > 0) this.font.draw(ctx, this.muteFlash, W - 10, H - 14, { align: 'right', color: '#8a9ab5', shadow: '#120f1c' });
    this.drawWingBanner(ctx);
  }

  /** Opens the Castle Forge proposal screen; `returnState` is where Esc leads back. */
  openForge(returnState = 'title') {
    if (this.forge.activeJob && this.forge.activeJob.status !== 'error') {
      // A forge is running or just finished: show its progress / reveal instead of a new form.
      this.forgeUI.returnState = returnState;
      this.forgeUI.t = 0;
      if (this.forge.activeJob.status !== 'done') this.forgeUI.revealT = -1;
      this.setState('forging');
      this.audio.sfx('select');
      return;
    }
    this.forge.dismissJob();
    this.forgeUI.openProposal(returnState);
    this.setState('forge');
    this.audio.sfx('select');
  }

  /** Called by the Forge when a wing finishes rising (possibly while playing). */
  onWingRaised(stage) {
    const idx = STAGES.indexOf(stage);
    if (idx >= 0) this.discoverStage(idx);   // the player built it: it is charted at once
    if (this.state !== 'forging') this.wingBanner = { name: stage.name, t: 0 };
    if (this.state === 'stageselect') this.mapCursor = stage.key;
  }

  drawWingBanner(ctx) {
    const b = this.wingBanner;
    if (!b) return;
    b.t += DT;
    if (b.t > 6) { this.wingBanner = null; return; }
    const k = Math.min(1, b.t / 0.4, (6 - b.t) / 0.6);
    ctx.save();
    ctx.globalAlpha = Math.max(0, k);
    const y = this.state === 'play' || this.state === 'pause' ? 40 : 300;
    ctx.fillStyle = 'rgba(5, 4, 12, 0.9)';
    ctx.fillRect(W / 2 - 200, y, 400, 30);
    ctx.fillStyle = '#ffd27a';
    ctx.fillRect(W / 2 - 200, y, 400, 1); ctx.fillRect(W / 2 - 200, y + 29, 400, 1);
    this.font.draw(ctx, 'THE CASTLE HAS GROWN', W / 2, y + 5, { align: 'center', color: '#ffd27a', shadow: '#05040a', gothic: false });
    this.font.draw(ctx, `${b.name} NOW RISES ON THE MAP (M)`, W / 2, y + 16, { align: 'center', color: '#f6f0de', shadow: '#05040a', gothic: false });
    ctx.restore();
  }

  drawCallsignModal(ctx) {
    ctx.save();
    ctx.fillStyle = 'rgba(4, 3, 12, 0.82)';
    ctx.fillRect(0, 0, W, H);
    const mw = 336, mh = 104;
    const mx = Math.round((W - mw) * 0.5), my = Math.round((H - mh) * 0.5);
    ctx.fillStyle = 'rgba(10, 8, 22, 0.96)';
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = '#ffd27a';
    ctx.lineWidth = 1;
    ctx.strokeRect(mx + 0.5, my + 0.5, mw - 1, mh - 1);
    ctx.strokeStyle = '#3a2e4c';
    ctx.strokeRect(mx + 2.5, my + 2.5, mw - 5, mh - 5);

    this.font.draw(ctx, 'HUNTER CALLSIGN', W / 2, my + 12, {
      scale: 2,
      gothic: false,
      align: 'center',
      color: '#ffd27a',
      shadow: '#05040a',
    });

    const boxW = 220, boxH = 26;
    const bx = Math.round((W - boxW) * 0.5), by = my + 40;
    ctx.fillStyle = '#05040c';
    ctx.fillRect(bx, by, boxW, boxH);
    ctx.strokeStyle = '#62f2c2';
    ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);
    const cursor = Math.floor(this.stateT * 3) % 2 === 0 ? '_' : ' ';
    this.font.draw(ctx, `${this.callsignDraft}${cursor}`, W / 2, by + 7, {
      scale: 2,
      gothic: false,
      align: 'center',
      color: '#f4efe0',
      shadow: '#05040a',
    });

    this.font.draw(
      ctx,
      'TYPE A-Z / 0-9  ·  ENTER SAVE  ·  ESC CANCEL',
      W / 2,
      my + 80,
      { align: 'center', color: '#9eb0d0', shadow: '#05040a', gothic: false },
    );
    ctx.restore();
  }

  drawTitle(ctx) {
    const tw = this.titleWorld;
    const t = this.stateT;
    tw.draw(ctx, { hud: false });
    // Deepen the night and let the moon-blue light pool toward the centre
    const g = ctx.createRadialGradient(W * 0.5, 120, 40, W * 0.5, 160, 420);
    g.addColorStop(0, 'rgba(4, 3, 10, 0.28)');
    g.addColorStop(1, 'rgba(4, 3, 10, 0.78)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Drifting fog bands across the lower third
    ctx.save();
    ctx.globalAlpha = 0.16;
    for (let i = 0; i < 3; i++) {
      const y = 232 + i * 26 + Math.sin(t * 0.5 + i) * 4;
      const x = ((t * (9 + i * 6)) % (W + 240)) - 240;
      const fg = ctx.createLinearGradient(x, 0, x + 240, 0);
      fg.addColorStop(0, 'rgba(160, 170, 210, 0)'); fg.addColorStop(0.5, 'rgba(160, 170, 210, 1)'); fg.addColorStop(1, 'rgba(160, 170, 210, 0)');
      ctx.fillStyle = fg;
      ctx.fillRect(x, y, 240, 18);
    }
    ctx.restore();

    const f = this.font;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
    const hasSave = this.hasSaveGame();
    const logo = this.assets.img('title_logo');
    const reveal = Math.min(1, Math.max(0, (t - 0.3) / 1.4));
    if (logo) {
      // Blackletter logo: rises and fades in, then breathes gently with a crimson under-glow
      const lw = hasSave ? 310 : 322;
      const lh = Math.round(logo.height * (lw / logo.width));
      const baseLogoY = hasSave ? 4 : 8;
      const lx = Math.round((W - lw) / 2), ly = Math.round(baseLogoY + (1 - reveal) * 16 + Math.sin(t * 1.3) * 2);
      ctx.save();
      ctx.globalAlpha = reveal;
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(W / 2, ly + lh * 0.5, 20, W / 2, ly + lh * 0.5, 230);
      glow.addColorStop(0, `rgba(170, 40, 60, ${0.22 + 0.1 * pulse})`); glow.addColorStop(1, 'rgba(170, 40, 60, 0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(logo, lx, ly, lw, lh);
      // Lightning: the logo flashes bone-white
      if (tw.flash > 0.5) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = reveal * (tw.flash - 0.5) * 0.9;
        ctx.drawImage(logo, lx, ly, lw, lh);
      }
      ctx.restore();
    } else {
      f.draw(ctx, 'GOTHIC', W / 2, 54, { scale: 6, align: 'center', color: '#e8e2c8', spacing: 2, shadow: '#5b2a3a' });
      f.draw(ctx, 'NOCTURNE', W / 2, 108, { scale: 4, align: 'center', color: '#c23b4a', spacing: 2, shadow: '#120f1c' });
    }
    if (reveal >= 1) {
      // Ornamental rule + Castle Discovery Percentage readout badge
      const ruleY = hasSave ? 199 : 204;
      ctx.fillStyle = '#8a6a3a'; ctx.fillRect(W / 2 - 156, ruleY, 312, 1);
      ctx.fillStyle = '#d9b36a'; ctx.fillRect(W / 2 - 2, ruleY - 2, 4, 4); ctx.fillRect(W / 2 - 156, ruleY - 1, 3, 3); ctx.fillRect(W / 2 + 153, ruleY - 1, 3, 3);

      const disc = this.getCastleDiscoveryStats();
      const gp = this.guardianProgress();
      const badgeW = 292, badgeH = 15;
      const badgeX = Math.round((W - badgeW) * 0.5), badgeY = hasSave ? 204 : 209;
      ctx.fillStyle = 'rgba(8, 6, 18, 0.86)';
      ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
      ctx.strokeStyle = disc.exactPct > 0 ? '#8a6a3a' : '#3e3650';
      ctx.lineWidth = 1;
      ctx.strokeRect(badgeX + 0.5, badgeY + 0.5, badgeW - 1, badgeH - 1);
      // Subtle crimson-to-gold discovery progress bar along bottom of the badge
      const barPad = 4;
      const barMaxW = badgeW - barPad * 2;
      ctx.fillStyle = '#161124';
      ctx.fillRect(badgeX + barPad, badgeY + badgeH - 3, barMaxW, 2);
      const fillW = Math.round(barMaxW * Math.max(0, Math.min(1, disc.exactPct / 100)));
      if (fillW > 0) {
        const bg = ctx.createLinearGradient(badgeX + barPad, 0, badgeX + barPad + barMaxW, 0);
        bg.addColorStop(0, '#ff4a6e');
        bg.addColorStop(0.6, '#ffd27a');
        bg.addColorStop(1, '#62f2c2');
        ctx.fillStyle = bg;
        ctx.fillRect(badgeX + barPad, badgeY + badgeH - 3, fillW, 2);
      }
      const castleLine = gp.felled > 0
        ? `CASTLE DISCOVERED ${disc.label}  ·  GUARDIANS ${gp.felled}/${gp.total}`
        : `CASTLE DISCOVERED ${disc.label}`;
      f.draw(ctx, castleLine, W / 2, badgeY + 3, {
        align: 'center',
        color: disc.exactPct >= 100 ? '#62f2c2' : (disc.exactPct > 0 ? '#ffd27a' : '#a89a74'),
        shadow: '#05040a',
        gothic: false,
      });

      const isTouch = !!(this.touch && this.touch.active);
      const debugOn = this.debug.unlockAreas || this.debug.unlockBosses;
      const menu = this.getTitleMenuLayout();
      if (this.titleMenu >= menu.items.length) this.titleMenu = 0;
      const subY = menu.y0 + menu.rowH * menu.items.length + (hasSave ? 4 : 5);
      menu.items.forEach((item, i) => {
        const sel = this.titleMenu === i;
        const y = menu.y0 + i * menu.rowH;
        const isCont = item.id === 'continue';
        const unselCol = isCont
          ? '#a89476'
          : (item.id === 'settings' && debugOn ? '#9a6f8a' : '#6f6a80');
        const selCol = isCont
          ? (pulse > 0.25 ? '#7ef7d4' : '#56d9b4')
          : (pulse > 0.25 ? '#ffd27a' : '#e0b45a');
        const col = sel ? selCol : unselCol;
        f.draw(ctx, `${sel ? '→ ' : '  '}${item.label}${sel ? ' ←' : '  '}`, W / 2, y, {
          scale: 2,
          align: 'center',
          color: col,
          shadow: isCont && sel ? '#10342e' : '#5b2a3a',
          gothic: false,
        });
        if (sel) {
          f.draw(ctx, item.sub, W / 2, subY, {
            align: 'center',
            color: isCont ? '#d9efe6' : '#a89a74',
            shadow: '#120f1c',
            gothic: false,
          });
        }
      });
      // Game author attribution on the home screen
      ctx.fillStyle = '#3a2e22';
      ctx.fillRect(W / 2 - 140, 321, 280, 1);
      f.draw(ctx, 'CREATED BY JUNIUS AND ALEX GUNARATNE', W / 2, 326, {
        align: 'center',
        color: '#d9b36a',
        shadow: '#120f1c',
        gothic: false,
      });
      if (this.net && this.net.enabled) {
        const netLine = this.net.connected
          ? `ONLINE · ${this.net.onlineCount} IN ${this.net.room.toUpperCase()} · AS ${this.net.name} (${isTouch ? 'TAP TO RENAME' : 'PRESS C'})`
          : 'CONNECTING TO SHARED CASTLE REALM...';
        f.draw(ctx, netLine, W / 2, H - 16, {
          align: 'center',
          color: this.net.connected ? '#62f2c2' : '#8a9ab5',
          shadow: '#120f1c',
          gothic: false,
        });
      } else {
        f.draw(ctx, 'ART · GEMINI & OMNI     MUSIC · LYRIA 3     VOICE · DAIKON     FORGE · GEMINI + GEMPIX     2026', W / 2, H - 16, { align: 'center', color: '#5b6b86' });
      }
      this.forgeUI.drawTicker(ctx, 4);
    }
  }

  // ------------------------------------------------------------ Controls screen

  openControls() {
    this.setState('controls');
    this.audio.sfx('select');
  }

  closeControls() {
    this.titleMenu = this.indexOfTitleAction('controls');
    this.setState('title');
    this.audio.sfx('pause');
  }

  updateControls(dt, inp) {
    if (this.stateT > 0.22 && (inp.pressed.escape || inp.pressed.start || inp.pressed.jump || inp.pressed.attack || inp.pressed.sprint)) {
      this.closeControls();
    }
  }

  drawControls(ctx) {
    this.titleWorld.draw(ctx, { hud: false });
    ctx.fillStyle = 'rgba(4, 3, 10, 0.72)';
    ctx.fillRect(0, 0, W, H);
    const f = this.font;
    const pulse = 0.5 + 0.5 * Math.sin(this.stateT * 2.2);
    const isTouch = !!(this.touch && this.touch.active);
    f.draw(ctx, 'GOTHIC NOCTURNE', W / 2, 22, { scale: 2, align: 'center', color: '#8a9ab5', spacing: 2, shadow: '#120f1c' });
    f.draw(ctx, 'CONTROLS', W / 2, 48, { scale: 3, align: 'center', color: '#e8e2c8', shadow: '#5b2a3a' });
    ctx.fillStyle = '#5b6b86';
    ctx.fillRect(W / 2 - 260, 82, 520, 1);

    const px = 20, py = 90, pw = W - 40, ph = 206;
    ctx.fillStyle = 'rgba(7, 5, 16, 0.90)';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = '#8a6a3a';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
    ctx.strokeStyle = '#2e243d';
    ctx.strokeRect(px + 2.5, py + 2.5, pw - 5, ph - 5);

    // Column headers: Movement vs Combat
    const leftX = px + 12;
    const rightX = W / 2 + 10;
    f.draw(ctx, 'MOVEMENT & PLATFORMING', leftX, py + 10, { color: '#ffd27a', shadow: '#05040a', gothic: false });
    f.draw(ctx, 'COMBAT & DUAL-HAND ARSENAL', rightX, py + 10, { color: '#ffd27a', shadow: '#05040a', gothic: false });
    ctx.fillStyle = '#3a2e4c';
    ctx.fillRect(px + 10, py + 22, pw - 20, 1);
    ctx.fillRect(W / 2, py + 8, 1, 108);

    const moveRows = [
      ['←/→ OR A/D', 'WALK · →→ / PAD B DASH'],
      ['Q / LB', 'BACKDASH · LODESTONE RING'],
      ['Z/SPC/PAD A', 'JUMP · ↓↑+JUMP HIGH JUMP'],
      ['↓+JUMP', 'SLIDE (GND) · DIVEKICK (AIR)'],
    ];
    moveRows.forEach(([k, desc], i) => {
      const ry = py + 30 + i * 21;
      f.draw(ctx, k, leftX, ry, { color: '#62f2c2', shadow: '#05040a', gothic: false });
      f.draw(ctx, desc, leftX + 74, ry, { color: '#e8e2c8', shadow: '#05040a', gothic: false });
    });

    const combatRows = [
      ['X/K · C/V', 'L/R HAND · R SWAP SET A/B'],
      ['↑ + L / R', 'SUB-WEAPON · BULLET SOUL'],
      ['↓↘→ + ATK', 'WEAPON SKILL · L+R CALL'],
      ['↑ + L + R', 'ARCANE GLYPH UNION (5♥)'],
    ];
    combatRows.forEach(([k, desc], i) => {
      const ry = py + 30 + i * 21;
      f.draw(ctx, k, rightX, ry, { color: '#ffb0a0', shadow: '#05040a', gothic: false });
      f.draw(ctx, desc, rightX + 68, ry, { color: '#e8e2c8', shadow: '#05040a', gothic: false });
    });

    // Exploration, shortcuts & touch section
    ctx.fillStyle = '#3a2e4c';
    ctx.fillRect(px + 10, py + 120, pw - 20, 1);
    f.draw(ctx, 'EXPLORATION, GRIMOIRE & CASTLE FORGE', W / 2, py + 128, { align: 'center', color: '#ffd27a', shadow: '#05040a', gothic: false });

    const expLines = [
      ['↑ AT SANCTUM / PORTAL', 'SAVE AT CRIMSON SANCTUM, ENTER DOORWAY, WARP MIRROR OR CHEST'],
      ['START / E  GRIMOIRE & GEAR     B  BESTIARY     VIEW / M  MAP     ESC  PAUSE', ''],
      ['P  CASTLE FORGE     G  SALUTE     C  CALLSIGN     N  MUTE     F  POST-FX', ''],
      ['TOUCH & GAMEPAD', '8-WAY D-PAD + ACTION CLUSTER · TAP MINI-MAP, ARMORY SOCKETS OR DOORS'],
    ];
    expLines.forEach(([a, b], i) => {
      const ry = py + 144 + i * 15;
      if (b) {
        f.draw(ctx, a, leftX, ry, { color: '#62f2c2', shadow: '#05040a', gothic: false });
        f.draw(ctx, b, leftX + 142, ry, { color: '#c9c3b0', shadow: '#05040a', gothic: false });
      } else {
        f.draw(ctx, a, W / 2, ry, { align: 'center', color: '#e8e2c8', shadow: '#05040a', gothic: false });
      }
    });

    const prompt = isTouch ? 'TAP ANYWHERE OR PRESS ✕ BACK TO RETURN' : 'PRESS ESC / ENTER / JUMP TO RETURN TO TITLE';
    if (pulse > 0.25) {
      f.draw(ctx, prompt, W / 2, 306, { align: 'center', color: '#ffd27a', shadow: '#120f1c' });
    }
    f.draw(ctx, 'CREATED BY JUNIUS AND ALEX GUNARATNE', W / 2, 326, { align: 'center', color: '#8a9ab5', shadow: '#120f1c' });
  }

  // ------------------------------------------------------------ Settings screen

  openSettings() {
    this.settingsIndex = 0;
    this.settingsConfirmReset = false;
    this.settingsFlash = null;
    this.setState('settings');
    this.audio.sfx('select');
  }

  closeSettings() {
    this.settingsConfirmReset = false;
    this.titleMenu = this.indexOfTitleAction('settings');
    this.setState('title');
    this.audio.sfx('pause');
  }

  updateSettings(dt, inp) {
    if (this.settingsFlash) {
      this.settingsFlash.t -= dt;
      if (this.settingsFlash.t <= 0) this.settingsFlash = null;
    }
    if (inp.pressed.escape || inp.pressed.sprint) { this.closeSettings(); return; }
    const n = SETTINGS_ITEMS.length;
    if (inp.pressed.up) { this.settingsIndex = (this.settingsIndex + n - 1) % n; this.settingsConfirmReset = false; this.audio.sfx('bone'); }
    if (inp.pressed.down) { this.settingsIndex = (this.settingsIndex + 1) % n; this.settingsConfirmReset = false; this.audio.sfx('bone'); }
    if (this.stateT > 0.25 && (inp.pressed.start || inp.pressed.jump || inp.pressed.attack || inp.pressed.left || inp.pressed.right)) {
      this.activateSettingsItem(this.settingsIndex);
    }
  }

  /** Activates a Settings row (keyboard, gamepad or a touch tap on the row). */
  activateSettingsItem(idx) {
    const item = SETTINGS_ITEMS[idx];
    if (!item) return;
    this.settingsIndex = idx;
    switch (item.id) {
      case 'resetProgress':
        if (!this.settingsConfirmReset) {
          this.settingsConfirmReset = true;
          this.audio.sfx('block');
          return;
        }
        this.settingsConfirmReset = false;
        this.resetProgress();
        this.settingsFlash = { text: 'THE HUNT BEGINS ANEW · ALL PROGRESS ERASED', t: 3.2, color: '#ffd27a' };
        this.audio.sfx('orb');
        if (this.touch && this.touch.active) this.touch.syncUI(true);
        break;
      case 'unlockAreas':
      case 'unlockBosses': {
        this.settingsConfirmReset = false;
        const on = !this.debug[item.id];
        this.setDebugFlag(item.id, on);
        this.settingsFlash = {
          text: `${item.label.replace(/^DEBUG · /, '')} ${on ? 'ENABLED' : 'DISABLED'}`,
          t: 2.4,
          color: on ? '#62f2c2' : '#a89a74',
        };
        this.audio.sfx(on ? 'select' : 'bone');
        break;
      }
      case 'back':
      default:
        this.closeSettings();
        break;
    }
  }

  drawSettings(ctx) {
    this.titleWorld.draw(ctx, { hud: false });
    ctx.fillStyle = 'rgba(4, 3, 10, 0.66)';
    ctx.fillRect(0, 0, W, H);
    const f = this.font;
    const pulse = 0.5 + 0.5 * Math.sin(this.stateT * 2.2);
    const isTouch = !!(this.touch && this.touch.active);
    f.draw(ctx, 'GOTHIC NOCTURNE', W / 2, 28, { scale: 2, align: 'center', color: '#8a9ab5', spacing: 2, shadow: '#120f1c' });
    f.draw(ctx, 'SETTINGS', W / 2, 58, { scale: 3, align: 'center', color: '#e8e2c8', shadow: '#5b2a3a' });
    ctx.fillStyle = '#5b6b86';
    ctx.fillRect(W / 2 - 230, 94, 460, 1);

    // Hunt summary: how far the castle has been conquered
    const gp = this.guardianProgress();
    const disc = this.getCastleDiscoveryStats();
    const countOpen = allGuardiansFelled(this.cleared) || this.debug.unlockBosses;
    const summary = `CASTLE ${disc.label}`
      + ` · GUARDIANS ${String(gp.felled).padStart(2, '0')}/${String(gp.total).padStart(2, '0')}`
      + ` · VESSELS ${String(this.getVesselCount()).padStart(2, '0')}/${STAGES.length}`
      + ` · LV ${String(this.charLevel).padStart(2, '0')}`
      + ` · THE COUNT ${countOpen ? 'AWAITS' : 'SEALED'}`;
    f.draw(ctx, summary, W / 2, 102, { align: 'center', color: countOpen ? '#ffb0a0' : '#a89a74', shadow: '#120f1c', gothic: false });

    SETTINGS_ITEMS.forEach((item, i) => {
      const y = SETTINGS_TOP + i * SETTINGS_ROW_H;
      const selected = i === this.settingsIndex;
      const isToggle = item.id === 'unlockAreas' || item.id === 'unlockBosses';
      const on = isToggle && !!this.debug[item.id];
      const isReset = item.id === 'resetProgress';
      const confirming = isReset && this.settingsConfirmReset;
      const accent = confirming ? '#e23c3c' : isToggle ? (on ? '#62f2c2' : '#ffd27a') : isReset ? '#ffb0a0' : '#c9c3b0';
      if (selected) {
        ctx.fillStyle = confirming ? 'rgba(226, 60, 60, 0.10)' : 'rgba(232, 226, 200, 0.07)';
        ctx.fillRect(W / 2 - 230, y - 7, 460, SETTINGS_ROW_H - 6);
        ctx.fillStyle = accent;
        ctx.fillRect(W / 2 - 230, y - 7, 3, SETTINGS_ROW_H - 6);
      }
      const label = confirming ? 'CONFIRM RESET? PRESS AGAIN' : item.label;
      f.draw(ctx, `${selected ? '→ ' : '  '}${label}`, W / 2 - 218, y, {
        scale: 2, gothic: false, color: selected ? accent : '#6f6a80', shadow: '#120f1c',
      });
      if (isToggle) {
        const tag = on ? '[ ON ]' : '[ OFF ]';
        f.draw(ctx, tag, W / 2 + 222, y, {
          scale: 2, gothic: false, align: 'right', color: on ? '#62f2c2' : (selected ? '#a89a74' : '#4e4a5e'), shadow: '#120f1c',
        });
      } else if (isReset) {
        f.draw(ctx, confirming ? 'ESC CANCEL' : 'ERASES SAVE', W / 2 + 222, y + 3, {
          gothic: false, align: 'right', color: selected ? accent : '#4e4a5e', shadow: '#120f1c',
        });
      }
      const desc = confirming ? 'THIS CANNOT BE UNDONE · CALLSIGN AND FORGED WINGS ARE KEPT' : item.desc;
      f.draw(ctx, desc, W / 2 - 206, y + 18, { color: selected ? '#c9c3b0' : '#4e4a5e', shadow: '#120f1c', gothic: false });
    });

    const prompt = isTouch
      ? 'TAP A ROW TO SELECT · TAP AGAIN TO TOGGLE · ✕ BACK'
      : '↑↓ SELECT     ENTER / JUMP / WHIP TOGGLE     ESC BACK';
    if (pulse > 0.25 || this.settingsFlash) {
      f.draw(ctx, prompt, W / 2, 298, { align: 'center', color: '#ffd27a', shadow: '#120f1c' });
    }
    if (this.settingsFlash) {
      f.draw(ctx, this.settingsFlash.text, W / 2, 316, {
        align: 'center', gothic: false, color: this.settingsFlash.color || '#ffd27a', shadow: '#120f1c',
      });
    } else {
      f.draw(ctx, 'DEBUG UNLOCKS ARE FOR TESTING THE CASTLE · THEY DO NOT GRANT RELICS OR EXP', W / 2, 316, { align: 'center', color: '#5b6b86' });
    }
  }

  drawDifficulty(ctx) {
    this.titleWorld.draw(ctx, { hud: false });
    ctx.fillStyle = 'rgba(4, 3, 10, 0.6)';
    ctx.fillRect(0, 0, W, H);
    const f = this.font;
    f.draw(ctx, 'GOTHIC NOCTURNE', W / 2, 28, { scale: 2, align: 'center', color: '#8a9ab5', spacing: 2, shadow: '#120f1c' });
    f.draw(ctx, 'CHOOSE YOUR FATE', W / 2, 62, { scale: 3, align: 'center', color: '#e8e2c8', shadow: '#5b2a3a' });
    ctx.fillStyle = '#5b6b86';
    ctx.fillRect(W / 2 - 170, 100, 340, 1);

    const colors = { easy: '#9ad17a', normal: '#ffd27a', hard: '#e23c3c' };
    const top = 122, rowH = 54;
    DIFFICULTY_ORDER.forEach((key, i) => {
      const d = DIFFICULTIES[key];
      const y = top + i * rowH;
      const selected = i === this.menuIndex;
      if (selected) {
        ctx.fillStyle = 'rgba(232, 226, 200, 0.07)';
        ctx.fillRect(W / 2 - 230, y - 8, 460, rowH - 8);
        ctx.fillStyle = colors[key];
        ctx.fillRect(W / 2 - 230, y - 8, 3, rowH - 8);
        const bob = Math.round(Math.sin(this.stateT * 6) * 2);
        this.assets.draw(ctx, 'items', 'heart_small', W / 2 - 205 + bob, y + 14);
      }
      f.draw(ctx, d.name, W / 2 - 185, y - 4, { scale: 3, color: selected ? colors[key] : '#6f6a80', shadow: '#120f1c' });
      f.draw(ctx, d.tagline, W / 2 - 185 + f.width(d.name, 3, 1, true) + 16, y + 8, { color: selected ? '#e8e2c8' : '#5b5670', shadow: '#120f1c' });
      f.draw(ctx, d.desc, W / 2 - 185, y + 29, { color: selected ? '#c9c3b0' : '#4e4a5e', shadow: '#120f1c' });
    });

    const pulse = 0.5 + 0.5 * Math.sin(this.stateT * 2.2);
    const diffPrompt = (this.touch && this.touch.active)
      ? 'TAP A FATE OR USE D-PAD + OK'
      : '↑↓ SELECT     ENTER / JUMP / WHIP CONFIRM';
    if (pulse > 0.25) f.draw(ctx, diffPrompt, W / 2, 300, { align: 'center', color: '#ffd27a', shadow: '#120f1c' });
    f.draw(ctx, 'YOUR CHOICE IS REMEMBERED FOR NEXT TIME', W / 2, 322, { align: 'center', color: '#5b6b86' });
  }

  drawClear(ctx) {
    const w = this.world;
    const k = Math.min(1, this.stateT / 0.6);
    ctx.save();
    ctx.globalAlpha = k;
    ctx.fillStyle = 'rgba(4, 3, 10, 0.58)'; ctx.fillRect(0, 0, W, H);
    this.banner(['STAGE CLEAR'], 58, {
      scale: 3,
      color: '#ffd27a',
      sub: `${w.difficulty.name} · LV ${String(this.charLevel).padStart(2, '0')} · SCORE X${w.difficulty.scoreMult}`,
    }, ctx);
    const lines = [
      ['TIME BONUS', w.timeBonus],
      ['HEART BONUS', w.heartBonus],
      ['SCORE', w.score],
    ];
    // Dark plate behind the tally so the figures read over busy scenery
    ctx.fillStyle = 'rgba(4, 3, 10, 0.84)';
    ctx.fillRect(W / 2 - 140, 130, 280, 68);
    ctx.fillStyle = '#5b6b86';
    ctx.fillRect(W / 2 - 140, 130, 280, 1); ctx.fillRect(W / 2 - 140, 197, 280, 1);
    lines.forEach(([label, val], i) => {
      if (this.stateT < 0.7 + i * 0.4) return;
      this.font.draw(ctx, label, W / 2 - 122, 139 + i * 18, { scale: 2, gothic: false, color: '#c9c3b0', shadow: '#120f1c' });
      this.font.draw(ctx, String(val).padStart(7, '0'), W / 2 + 122, 139 + i * 18, { scale: 2, gothic: false, align: 'right', shadow: '#120f1c' });
    });

    // Boss Relic Power-Up unlocked card
    const relic = BOSS_RELICS[STAGES[this.stageIndex].key];
    if (relic && this.stateT >= 1.9) {
      const rk = Math.min(1, (this.stateT - 1.9) / 0.35);
      ctx.save();
      ctx.globalAlpha = k * rk;
      const rx = W / 2 - 216, ry = 206, rw = 432, rh = 62;
      ctx.fillStyle = 'rgba(8, 6, 18, 0.90)';
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = relic.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
      ctx.strokeStyle = '#3a2e4c';
      ctx.strokeRect(rx + 2.5, ry + 2.5, rw - 5, rh - 5);
      ctx.fillStyle = relic.color;
      ctx.fillRect(rx + 2, ry + 2, 3, 3);
      ctx.fillRect(rx + rw - 5, ry + 2, 3, 3);
      ctx.fillRect(rx + 2, ry + rh - 5, 3, 3);
      ctx.fillRect(rx + rw - 5, ry + rh - 5, 3, 3);
      this.font.draw(ctx, '* BOSS POWER-UP UNLOCKED *', W / 2, ry + 8, { align: 'center', color: '#ffd27a', shadow: '#120f1c', gothic: false });
      this.font.draw(ctx, `${relic.name} - ${relic.short}`, W / 2, ry + 22, { scale: 2, align: 'center', color: relic.color, shadow: '#120f1c', gothic: false });
      this.font.draw(ctx, relic.desc, W / 2, ry + 44, { align: 'center', color: '#e8e2c8', shadow: '#120f1c', gothic: false });
      ctx.restore();
    }

    if (this.stateT > 2.4 && Math.floor(this.stateT * 2.2) % 2 === 0) {
      const last = STAGES[this.stageIndex].key === 'throne';
      const isTouch = !!(this.touch && this.touch.active);
      const clearPrompt = isTouch
        ? (last ? 'TAP TO CONTINUE' : 'TAP FOR THE CASTLE MAP')
        : (last ? 'PRESS ENTER' : 'PRESS ENTER FOR THE CASTLE MAP');
      this.font.draw(ctx, clearPrompt, W / 2, 286, { scale: 2, gothic: false, align: 'center', color: '#ffd27a', shadow: '#120f1c' });
    }
    ctx.restore();
  }

  drawStageSelect(ctx) {
    this.titleWorld.draw(ctx, { hud: false });
    drawCastleMap(ctx, this.font, this.assets, {
      cursor: this.mapCursor,
      cleared: this.cleared,
      discovered: this.discoveredForMap(),
      vessels: this.vessels,
      explored: this.exploredCells,
      relics: this.relicsForMap(),
      time: this.stateT,
      difficultyName: this.difficulty.name,
      charLevel: this.charLevel,
      mode: 'select',
      gateInfo: (key) => this.mapGateInfo(key),
      remotePlayers: this.net ? this.net.activePeers() : null,
      onlineCount: this.net ? this.net.onlineCount : 1,
      roomName: this.net ? this.net.room : 'castle',
      netConnected: !!(this.net && this.net.connected),
    });
  }

  drawLiveMap(ctx) {
    if (this.world) this.world.draw(ctx, { hud: false });
    const normX = this.world && this.world.level.width > 0
      ? this.world.player.x / this.world.level.width
      : 0;
    const normY = this.world && this.world.level.height > 0
      ? this.world.player.y / this.world.level.height
      : 0.5;
    drawCastleMap(ctx, this.font, this.assets, {
      cursor: this.mapCursor,
      cleared: this.cleared,
      discovered: this.discoveredForMap(),
      vessels: this.vessels,
      explored: this.exploredCells,
      relics: this.relicsForMap(),
      time: this.stateT,
      difficultyName: this.difficulty.name,
      charLevel: this.charLevel,
      mode: 'live',
      gateInfo: (key) => this.mapGateInfo(key),
      currentStageKey: STAGES[this.stageIndex].key,
      playerNormX: normX,
      playerNormY: normY,
      inSecret: !!(this.world && this.world.inSecretArea),
      remotePlayers: this.net ? this.net.activePeers() : null,
      onlineCount: this.net ? this.net.onlineCount : 1,
      roomName: this.net ? this.net.room : 'castle',
      netConnected: !!(this.net && this.net.connected),
    });
  }

  /** Starts the finale: 5-act animated dawn story (including Gemini Omni vigil scene) + Grand Epilogue & Credits. */
  beginEnding() {
    this.setState('ending');
    this.endingNarrated = false;
    if (this.audio.stopVoice) this.audio.stopVoice();
    this.audio.playMusic('ending', false);
    this.audio.stopAmbient();
    if (this.audio.prefetchVoice) this.audio.prefetchVoice('narrator_ending');
  }

  drawEnding(ctx) {
    const VOICE_START_T = 1.2;
    const hwVoiceT = (this.audio && this.audio.getVoicePlaybackTime)
      ? this.audio.getVoicePlaybackTime('narrator_ending')
      : null;
    const t = hwVoiceT !== null ? (VOICE_START_T + hwVoiceT) : this.stateT;
    const vT = t - VOICE_START_T;
    const f = this.font;
    const w = this.world;
    const A = this.assets;
    const p1 = A.img('ending_1');
    const p2 = A.img('ending_2');
    const p3 = A.img('ending_3');
    const p4 = A.img('ending_4');
    const p5 = A.img('ending_5');
    const omniImg = A.img('ending_omni');

    // Timeline locked to `narrator_ending.mp3` (38.67s spoken voice starting at t = 1.2s):
    //   0.0 - 14.1  Act I:   The Shattering of the Sovereign Keep (ending_1 + quake, lightning, falling debris, bats)
    //  14.1 - 24.2  Act II:  The Breaking of the Blood Curse (ending_4 + dawn rays & rising guardian relic soul motes)
    //  24.2 - 27.6  Act III: The Sanctuary Vigil — Gemini Omni (`omni_1p5`) 12-frame animated cutscene (`ending_omni`)
    //  27.6 - 32.3  Act IV:  The Graveyard Road at First Light (ending_2 + lifting silver mist & soul wisps)
    //  32.3 - 40.3  Act V:   Sunrise Over the Freed Valley (ending_3 + golden sunbeams & wheeling dawn birds)
    //  40.3+        Act VI:  Grand Epilogue & Credits Roll (Junius & Alex Gunaratne attribution + hunt chronicle)
    const drawPanel = (img, from, to, zoomFrom, zoomTo, panX, panY = 0) => {
      if (!img) return;
      const k = Math.max(0, Math.min(1, (t - from) / Math.max(0.01, to - from)));
      // Smooth cosine ease + gentle zoom on 2x (1280x720) supersampled panels with
      // high-quality bilinear filtering and subpixel float coordinates to avoid
      // nearest-neighbor row/column beat interference (moiré) when zooming.
      const ease = 0.5 - 0.5 * Math.cos(k * Math.PI);
      const z = zoomFrom + (zoomTo - zoomFrom) * ease;
      const dw = W * z, dh = H * z;
      const dx = (W - dw) * 0.5 + panX * ease;
      const dy = (H - dh) * 0.5 + panY * ease;
      const prevSmooth = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.imageSmoothingEnabled = prevSmooth;
    };
    const drawOmniClip = (from) => {
      const fi = Math.max(0, Math.floor((t - from) * 6)) % 12;
      const fr = A.frame('ending_omni', `f${fi}`);
      if (omniImg && fr) {
        // Exact 2x integer scale (320x180 -> 640x360) with no fractional zoom
        // so the 32-bit pixel-art Omni animation renders without moiré.
        ctx.drawImage(omniImg, fr.x, fr.y, fr.w, fr.h, 0, 0, W, H);
      } else if (p5) {
        drawPanel(p5, 24.2, 27.6, 1.0, 1.03, -4);
      }
    };
    const fadeBetween = (a, b) => Math.max(0, Math.min(1, (t - a) / Math.max(0.01, b - a)));

    if (!this._embers) {
      this._embers = Array.from({ length: 76 }, (_, i) => ({
        x: ((i * 97) % W),
        y: ((i * 53) % H),
        s: 0.45 + ((i * 29) % 100) / 100,
        p: i,
      }));
    }

    ctx.fillStyle = '#05040a';
    ctx.fillRect(0, 0, W, H);

    if (t < 14.1) {
      // Act I: The Shattering of the Sovereign Keep
      const quake = t < 5.6 ? Math.max(0, 1 - t / 5.6) * 5 : 0;
      ctx.save();
      ctx.translate(
        Math.round(Math.sin(t * 43) * quake),
        Math.round(Math.cos(t * 37) * quake),
      );
      drawPanel(p1, 0, 14.1, 1.0, 1.035, -8);
      ctx.restore();

      const flash = Math.max(0, Math.sin(t * 7.3) * Math.sin(t * 3.1)) * Math.max(0, 1 - t / 7.5);
      if (flash > 0.52) {
        ctx.fillStyle = `rgba(255, 86, 62, ${(flash - 0.52) * 0.52})`;
        ctx.fillRect(0, 0, W, H);
      }
      // Falling masonry fragments & rising embers
      for (const e of this._embers) {
        const ex = (e.x + Math.sin(t * 0.9 + e.p) * 12 + t * 9 * e.s) % (W + 20) - 10;
        const ey = (e.y - t * 28 * e.s) % H;
        const yy = ey < 0 ? ey + H : ey;
        ctx.fillStyle = e.p % 3 === 0 ? '#ffd27a' : (e.p % 2 === 0 ? '#ff8a3c' : '#e23c3c');
        ctx.fillRect(Math.round(ex), Math.round(yy), e.s > 1.05 ? 2 : 1, e.s > 1.05 ? 2 : 1);
      }
      // Escaping belfry bats wheeling across the moon
      for (let b = 0; b < 9; b++) {
        const bx = ((280 + b * 24 + t * (36 + b * 5)) % (W + 60)) - 30;
        const by = 118 - (t % 7.0) * (12 + (b % 3) * 4) + Math.sin(t * 6 + b) * 8;
        if (by > 24 && by < H - 70) {
          const wing = Math.sin(t * 18 + b * 1.7) > 0 ? -2 : 2;
          ctx.fillStyle = '#120a1c';
          ctx.fillRect(Math.round(bx), Math.round(by), 2, 2);
          ctx.fillRect(Math.round(bx - 3), Math.round(by + wing), 3, 1);
          ctx.fillRect(Math.round(bx + 2), Math.round(by + wing), 3, 1);
        }
      }
      if (t > 0.5 && t < 5.0) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, (t - 0.5) / 0.35, (5.0 - t) / 0.5));
        this.banner(['THE NIGHT IS OVER'], 32, { scale: 3, color: '#ffd27a', band: true });
        ctx.restore();
      }
    } else if (t < 24.2) {
      // Act II: The Breaking of the Blood Curse in the Sovereign Throne Hall (`ending_4`)
      drawPanel(p4 || p1, 14.1, 24.2, 1.035, 1.0, 6, -2);
      // Streaming dawn sunbeams through the shattered rose window
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let r = 0; r < 4; r++) {
        const pulse = 0.05 + 0.03 * Math.sin(t * 2.1 + r * 1.4);
        ctx.fillStyle = `rgba(255, 210, 122, ${pulse})`;
        ctx.beginPath();
        ctx.moveTo(W * 0.5 - 36 + r * 22, 22);
        ctx.lineTo(W * 0.5 - 18 + r * 22, 22);
        ctx.lineTo(W * 0.5 - 120 + r * 68, H - 58);
        ctx.lineTo(W * 0.5 - 165 + r * 68, H - 58);
        ctx.closePath();
        ctx.fill();
      }
      // Ascending guardian relic soul motes (gold & spectral teal)
      for (let i = 0; i < 36; i++) {
        const e = this._embers[i];
        const sx = W * 0.22 + ((e.x * 0.62 + Math.sin(t * 1.4 + i) * 18) % (W * 0.56));
        const sy = H - 64 - (((t - 14.1) * (22 + (i % 5) * 6) + i * 19) % (H - 96));
        ctx.fillStyle = i % 3 === 0 ? '#62f2c2' : (i % 2 === 0 ? '#ffd27a' : '#ff9ad5');
        ctx.fillRect(Math.round(sx), Math.round(sy), i % 4 === 0 ? 3 : 2, i % 4 === 0 ? 3 : 2);
      }
      ctx.restore();
      if (t > 14.5 && t < 17.5) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, (t - 14.5) / 0.35, (17.5 - t) / 0.45));
        this.banner(['THE BLOOD CURSE UNBOUND'], 32, { scale: 2, color: '#62f2c2', band: true });
        ctx.restore();
      }
    } else if (t < 27.6) {
      // Act III: The Sanctuary Vigil — Gemini Omni (`omni_1p5`) animated video scene (`ending_omni`)
      drawOmniClip(24.2);
      // Warm watchfire flicker & drifting fireflies
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const flicker = 0.10 + 0.04 * Math.sin(t * 9.5) + 0.03 * Math.cos(t * 14.2);
      const fg = ctx.createRadialGradient(W * 0.42, H * 0.66, 8, W * 0.42, H * 0.66, 175);
      fg.addColorStop(0, `rgba(255, 168, 74, ${flicker})`);
      fg.addColorStop(1, 'rgba(255, 120, 40, 0)');
      ctx.fillStyle = fg;
      ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 28; i++) {
        const e = this._embers[i];
        const fx = (e.x + Math.sin(t * 1.6 + e.p) * 20) % W;
        const fy = (e.y - (t - 24.2) * 18 * e.s) % (H - 60);
        const yy = fy < 24 ? fy + (H - 84) : fy;
        ctx.fillStyle = i % 3 === 0 ? '#ffd27a' : '#ff9a3c';
        ctx.fillRect(Math.round(fx), Math.round(yy), 2, 2);
      }
      ctx.restore();
      if (t > 24.5 && t < 27.2) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, (t - 24.5) / 0.35, (27.2 - t) / 0.40));
        this.banner(['THE SANCTUARY VIGIL'], 32, { scale: 2, color: '#ffd27a', band: true });
        ctx.restore();
      }
    } else if (t < 32.3) {
      // Act IV: The Graveyard Road at First Light (`ending_2`)
      drawPanel(p2, 27.6, 32.3, 1.035, 1.0, 6);
      // Drifting silver morning mist ribbons lifting off the road
      ctx.save();
      ctx.globalAlpha = 0.16;
      for (let m = 0; m < 3; m++) {
        const my = 198 + m * 28 - (t - 27.6) * 2.2;
        const mx = (((t - 27.6) * (14 + m * 6) + m * 140) % (W + 260)) - 260;
        const mg = ctx.createLinearGradient(mx, 0, mx + 260, 0);
        mg.addColorStop(0, 'rgba(210, 220, 245, 0)');
        mg.addColorStop(0.5, 'rgba(210, 220, 245, 1)');
        mg.addColorStop(1, 'rgba(210, 220, 245, 0)');
        ctx.fillStyle = mg;
        ctx.fillRect(mx, my, 260, 16);
      }
      ctx.restore();
    } else if (t < 40.3) {
      // Act V: Sunrise Over the Freed Valley (`ending_3`)
      drawPanel(p3, 32.3, 40.3, 1.0, 1.035, -6);
      const kd = fadeBetween(32.3, 39.5);
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, `rgba(255, 198, 118, ${0.06 + 0.16 * kd})`);
      g.addColorStop(1, 'rgba(255, 190, 110, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      // Wheeling white dawn birds rising into the golden sky
      for (let b = 0; b < 7; b++) {
        const bx = ((120 + b * 48 + (t - 32.3) * (24 + b * 3)) % (W - 80)) + 40;
        const by = 148 - (t - 32.3) * (7 + (b % 3) * 2) + Math.sin(t * 4 + b) * 5;
        if (by > 28 && by < 220) {
          const wing = Math.sin(t * 12 + b * 1.4) > 0 ? -1 : 1;
          ctx.fillStyle = '#fff4dc';
          ctx.fillRect(Math.round(bx), Math.round(by), 2, 1);
          ctx.fillRect(Math.round(bx - 2), Math.round(by + wing), 2, 1);
          ctx.fillRect(Math.round(bx + 2), Math.round(by + wing), 2, 1);
        }
      }
    } else {
      // Act VI: Grand Epilogue & Credits Roll (40.3s+)
      drawPanel(p3, 40.3, 66.0, 1.035, 1.06, -4);
      ctx.fillStyle = 'rgba(6, 4, 14, 0.76)';
      ctx.fillRect(0, 0, W, H);
      // Gentle golden dust motes over the epilogue
      for (let i = 0; i < 32; i++) {
        const e = this._embers[i];
        const ex = (e.x + Math.sin(t * 0.7 + e.p) * 14) % W;
        const ey = (e.y - t * 10 * e.s) % H;
        const yy = ey < 0 ? ey + H : ey;
        ctx.fillStyle = i % 3 === 0 ? '#62f2c2' : '#ffd27a';
        ctx.fillRect(Math.round(ex), Math.round(yy), 1, 1);
      }
      const logo = A.img('title_logo');
      if (logo) {
        const lw = 224, lh = Math.round(logo.height * (lw / logo.width));
        const lx = Math.round((W - lw) / 2), ly = 4;
        const lg = ctx.createRadialGradient(W / 2, ly + lh * 0.5, 20, W / 2, ly + lh * 0.5, 180);
        lg.addColorStop(0, 'rgba(4, 3, 10, 0.72)');
        lg.addColorStop(1, 'rgba(4, 3, 10, 0)');
        ctx.fillStyle = lg;
        ctx.fillRect(0, 0, W, ly + lh + 14);
        const prevSmooth = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(logo, lx, ly, lw, lh);
        ctx.imageSmoothingEnabled = prevSmooth;
      }
      const cardFade = Math.max(0, Math.min(1, (t - 40.3) / 0.6));
      if (cardFade > 0.01) {
        ctx.save();
        ctx.globalAlpha = cardFade;
        const cx = W / 2 - 252, cy = 142, cw = 504, ch = 186;
        ctx.fillStyle = 'rgba(5, 4, 12, 0.90)';
        ctx.fillRect(cx, cy, cw, ch);
        ctx.strokeStyle = '#8a6a3a';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx + 0.5, cy + 0.5, cw - 1, ch - 1);
        ctx.strokeStyle = '#2e243d';
        ctx.strokeRect(cx + 2.5, cy + 2.5, cw - 5, ch - 5);

        const gp = this.guardianProgress();
        const scoreLine = w
          ? `FINAL SCORE ${String(w.score).padStart(7, '0')} · ${w.difficulty.name} · LV ${String(this.charLevel).padStart(2, '0')}`
          : `GUARDIANS FELLED ${gp.felled}/${gp.total} · ANCIENT VESSELS ${this.getVesselCount()}/${STAGES.length}`;

        // Vertically scrolling End Credits roll inside the clipped frame
        const creditRows = [
          { dy: 0, text: '- CHRONICLE OF THE DAWN -', scale: 2, color: '#ffd27a' },
          { dy: 20, text: scoreLine, scale: 1, color: '#e8e2c8' },
          { dy: 44, text: 'CREATED BY', scale: 1, color: '#a89a74' },
          { dy: 60, text: 'JUNIUS GUNARATNE  &  ALEX GUNARATNE', scale: 2, color: '#ffd27a' },
          { dy: 90, text: 'EXECUTIVE PRODUCER & LEAD ARCHITECT', scale: 1, color: '#a89a74' },
          { dy: 105, text: 'JUNIUS GUNARATNE', scale: 2, color: '#f6f0de' },
          { dy: 135, text: 'CREATIVE DIRECTOR, LEVEL & COMBAT DESIGN', scale: 1, color: '#a89a74' },
          { dy: 150, text: 'ALEX GUNARATNE', scale: 2, color: '#f6f0de' },
          { dy: 180, text: 'STORY, LORE & WORLD BUILDING', scale: 1, color: '#a89a74' },
          { dy: 195, text: 'JUNIUS GUNARATNE  &  ALEX GUNARATNE', scale: 2, color: '#ffd27a' },
          { dy: 225, text: '2.5D RENDERING ENGINE & WEBGL SHADERS', scale: 1, color: '#a89a74' },
          { dy: 240, text: 'JUNIUS & ALEX GUNARATNE', scale: 1, color: '#e8e2c8' },
          { dy: 266, text: 'PIXEL ART, SPRITES & ANIMATED CUTSCENES', scale: 1, color: '#a89a74' },
          { dy: 281, text: 'GEMINI  ·  GEMINI OMNI (OMNI_1P5)  ·  GEMPIX', scale: 1, color: '#b8c4dc' },
          { dy: 307, text: 'SYMPHONIC GOTHIC SCORE & BOSS THEMES', scale: 1, color: '#a89a74' },
          { dy: 322, text: 'LYRIA 3 GENERATIVE AUDIO', scale: 1, color: '#b8c4dc' },
          { dy: 348, text: 'VOICE ACTING & NARRATION', scale: 1, color: '#a89a74' },
          { dy: 363, text: 'DAIKON SPEECH SYNTHESIS', scale: 1, color: '#b8c4dc' },
          { dy: 395, text: 'CREATED BY JUNIUS AND ALEX GUNARATNE', scale: 2, color: '#ffd27a' },
          { dy: 420, text: 'THANK YOU FOR PLAYING GOTHIC NOCTURNE', scale: 2, color: '#62f2c2' },
          { dy: 444, text: 'PEACE HAS RETURNED TO TRANSYLVANIA · 2026', scale: 1, color: '#e8e2c8' },
        ];

        const rollElapsed = Math.max(0, t - 40.5);
        const scrollSpeed = 24; // px per second upward scroll
        const startBaseY = cy + ch - 26;
        const finalLockScroll = 395 + 26 - 64; // settles with final attribution & thank-you centered in frame
        const scrollOffset = Math.min(finalLockScroll, rollElapsed * scrollSpeed);

        ctx.save();
        ctx.beginPath();
        ctx.rect(cx + 4, cy + 6, cw - 8, ch - 12);
        ctx.clip();

        for (const item of creditRows) {
          const ry = Math.round(startBaseY + item.dy - scrollOffset);
          if (ry < cy - 18 || ry > cy + ch + 18) continue;
          // Smooth fade near top and bottom edges of the scroll window
          const distTop = ry - (cy + 8);
          const distBot = (cy + ch - 14) - ry;
          const edgeAlpha = Math.max(0, Math.min(1, distTop / 18, distBot / 18));
          ctx.globalAlpha = cardFade * edgeAlpha;
          f.draw(ctx, item.text, W / 2, ry, {
            scale: item.scale || 1,
            gothic: false,
            align: 'center',
            color: item.color,
            shadow: '#05040a',
          });
        }
        ctx.restore();

        const pulse = 0.72 + 0.28 * Math.sin(t * 4.2);
        ctx.save();
        ctx.globalAlpha = cardFade * pulse;
        f.draw(ctx, (this.touch && this.touch.active) ? 'TAP OR PRESS START' : 'PRESS ENTER TO RETURN TO TITLE', W / 2, 336, {
          scale: 2,
          gothic: false,
          align: 'center',
          color: '#ffd27a',
          shadow: '#05040a',
        });
        ctx.restore();
        ctx.restore();
      }
    }

    // Crossfades between all 6 acts (placed inside natural breath pauses of narrator_ending.mp3)
    for (const [a, b] of [[13.7, 14.5], [23.7, 24.7], [27.2, 27.9], [31.9, 32.7], [39.8, 40.8]]) {
      if (t > a && t < b) {
        const k = 1 - Math.abs((t - (a + b) / 2) / ((b - a) / 2));
        ctx.fillStyle = `rgba(5, 4, 10, ${k})`;
        ctx.fillRect(0, 0, W, H);
      }
    }

    // Letterbox + high-legibility timed captions synced to narrator_ending.mp3 (0..40.3s)
    if (t < 40.3) {
      ctx.fillStyle = '#05040a';
      ctx.fillRect(0, 0, W, 22);
      ctx.fillStyle = '#5a462c';
      ctx.fillRect(0, 22, W, 1);
      // Scene progress chapter indicator in the top letterbox bar
      const actIdx = t < 14.1 ? 1 : t < 24.2 ? 2 : t < 27.6 ? 3 : t < 32.3 ? 4 : 5;
      const actTitle = [
        '',
        'ACT I · THE FALL OF CASTLE NOCTURNE',
        'ACT II · THE SHATTERED SOVEREIGN THRONE',
        'ACT III · THE SANCTUARY WATCHFIRE (GEMINI OMNI)',
        'ACT IV · THE CYPRESS ROAD AT DAWN',
        'ACT V · SUNRISE OVER THE FREED VALLEY',
      ][actIdx];
      f.draw(ctx, actTitle, W / 2, 7, { align: 'center', color: '#a89a74', shadow: '#05040a', gothic: false });

      const barH = 58, barY = H - barH;
      ctx.fillStyle = 'rgba(5, 4, 12, 0.94)';
      ctx.fillRect(0, barY, W, barH);
      ctx.fillStyle = '#7a603a';
      ctx.fillRect(0, barY, W, 1);

      // Exact phrase timestamps synced to assets/voice/narrator_ending.mp3 (vT = seconds from voice start)
      const voiceCaps = [
        [-0.05,  3.95, 'AND SO THE COUNT WAS DUST,'],
        [ 4.15,  7.40, 'AND HIS KEEP FELL SILENT.'],
        [ 7.75, 12.75, 'THE BELLS OF MIDNIGHT CRACKED AND TUMBLED FROM THE BELFRY,'],
        [13.20, 17.80, 'AND THE DARKNESS THAT HAD FED ON THE VALLEY FOR A HUNDRED YEARS'],
        [17.95, 22.65, 'DRAINED AWAY LIKE WATER FROM A BROKEN CUP.'],
        [23.55, 26.20, 'THE HUNTER DID NOT LOOK BACK.'],
        [26.55, 30.95, 'HE WALKED THE GRAVEYARD ROAD AS THE MIST LIFTED,'],
        [31.35, 34.35, 'AND FOR THE FIRST TIME IN HIS LIFE...'],
        [34.65, 38.55, '...HE WALKED IT TOWARD THE SUNRISE.'],
      ];
      for (const [a, b, text] of voiceCaps) {
        if (vT < a || vT > b) continue;
        const k = Math.min(1, (vT - a) / 0.24, (b - vT) / 0.24);
        ctx.save();
        ctx.globalAlpha = Math.max(0, k);
        const lines = f.wrap(text, W - 32, 2, 1, false);
        const step = 20;
        const blockH = lines.length * step - 6;
        const startY = barY + Math.round((barH - blockH) / 2);
        lines.forEach((ln, i) => {
          f.draw(ctx, ln, W / 2, startY + i * step, {
            scale: 2,
            gothic: false,
            align: 'center',
            color: '#f6f0de',
            shadow: '#05040a',
          });
        });
        ctx.restore();
      }
    }
  }

}

const game = new Game(document.getElementById('game'));
window.__gothic = game;
game.boot().catch((e) => {
  console.error(e);
  const el = document.getElementById('boot');
  el.textContent = 'Failed to load: ' + e.message;
});

function loadExploredSet(key, revealAll = false) {
  const startCell = MAP_ROOMS.graveyard && MAP_ROOMS.graveyard.spine[0] ? MAP_ROOMS.graveyard.spine[0] : [1, 15];
  const out = new Set([`${startCell[0]},${startCell[1]}`]);
  if (revealAll) {
    for (const rm of Object.values(MAP_ROOMS)) {
      for (const [c, r] of rm.allCells) out.add(`${c},${r}`);
    }
    return out;
  }
  const raw = safeStorageGet(key);
  if (!raw) return out;
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) for (const item of arr) if (typeof item === 'string') out.add(item);
  } catch (e) { /* ignore malformed storage */ }
  return out;
}

function loadProgression(key, params) {
  if (params && params.get('resetlevel') === '1') {
    safeStorageSet(key, JSON.stringify({ level: START_LEVEL, exp: 0 }));
    return { level: START_LEVEL, exp: 0, urlOverride: false };
  }
  if (params && (params.has('level') || params.has('exp'))) {
    const rawLv = parseInt(params.get('level') || String(START_LEVEL), 10);
    const level = Number.isFinite(rawLv)
      ? Math.max(START_LEVEL, Math.min(LEVEL_CAP, rawLv))
      : START_LEVEL;
    const req = expRequiredForNextLevel(level);
    const rawExp = parseInt(params.get('exp') || '0', 10);
    const exp = Number.isFinite(rawExp) && req > 0
      ? Math.max(0, Math.min(req - 1, rawExp))
      : 0;
    return { level, exp, urlOverride: true };
  }
  const raw = safeStorageGet(key);
  if (raw) {
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        const lv = Math.max(START_LEVEL, Math.min(LEVEL_CAP, parseInt(obj.level, 10) || START_LEVEL));
        const req = expRequiredForNextLevel(lv);
        const ex = req > 0 ? Math.max(0, Math.min(req - 1, parseInt(obj.exp, 10) || 0)) : 0;
        return { level: lv, exp: ex, urlOverride: false };
      }
    } catch (e) { /* ignore malformed storage */ }
  }
  return { level: START_LEVEL, exp: 0, urlOverride: false };
}

function loadArmoryState(key, params) {
  const owned = new Set(['hunters_lash']);
  let handL = 'hunters_lash';
  let handR = null;
  let activeLoadout = 0;
  let loadouts = [['hunters_lash', null], ['hunters_lash', null]];
  let urlOverride = false;

  if (params && params.get('resetarmory') === '1') {
    safeStorageSet(key, JSON.stringify({ owned: ['hunters_lash'], handL: 'hunters_lash', handR: null, activeLoadout: 0, loadouts }));
    return { owned, handL, handR, activeLoadout, loadouts, urlOverride: false };
  }

  const raw = safeStorageGet(key);
  if (raw) {
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        if (Array.isArray(obj.owned)) {
          for (const w of obj.owned) if (WEAPONS[w]) owned.add(w);
        }
        if (obj.handL && WEAPONS[obj.handL]) { handL = obj.handL; owned.add(handL); }
        if (obj.handR && WEAPONS[obj.handR] && !WEAPONS[obj.handR].isTwoHanded) {
          handR = obj.handR;
          owned.add(handR);
        }
        if (obj.activeLoadout === 1) activeLoadout = 1;
        if (Array.isArray(obj.loadouts) && obj.loadouts.length === 2) {
          loadouts = obj.loadouts.map((pair) => [
            Array.isArray(pair) && pair[0] && WEAPONS[pair[0]] ? pair[0] : 'hunters_lash',
            Array.isArray(pair) && pair[1] && WEAPONS[pair[1]] && !WEAPONS[pair[1]].isTwoHanded ? pair[1] : null,
          ]);
        } else {
          loadouts[0] = [handL, handR];
        }
      }
    } catch (e) { /* ignore malformed storage */ }
  }

  if (params) {
    const wp = params.get('weapons');
    if (wp === 'all') {
      for (const w of WEAPON_ORDER) owned.add(w);
      urlOverride = true;
    } else if (wp) {
      for (const w of wp.split(',')) {
        const clean = w.trim();
        if (WEAPONS[clean]) owned.add(clean);
      }
      urlOverride = true;
    }
    const hl = params.get('handL');
    if (hl && WEAPONS[hl]) {
      handL = hl;
      owned.add(hl);
      urlOverride = true;
    }
    const hr = params.get('handR');
    if (hr === 'none' || hr === 'empty') {
      handR = null;
      urlOverride = true;
    } else if (hr && WEAPONS[hr] && !WEAPONS[hr].isTwoHanded) {
      handR = hr;
      owned.add(hr);
      urlOverride = true;
    }
  }

  if (WEAPONS[handL] && WEAPONS[handL].isTwoHanded) {
    handR = null;
  }
  loadouts[activeLoadout] = [handL, handR];

  return { owned, handL, handR, activeLoadout, loadouts, urlOverride };
}

function loadGrimoireState(key, params) {
  const soulRanks = {};
  const equippedSouls = { bullet: null, guardian: null, enchant: null };
  const bestiarySeen = new Set();
  const bestiaryKills = {};
  let bloodBladeStacks = 0;
  const openedChests = new Set();
  const openedSwitches = new Set();
  let urlOverride = false;

  const raw = safeStorageGet(key);
  if (raw) {
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        if (obj.soulRanks && typeof obj.soulRanks === 'object') {
          for (const [sid, rk] of Object.entries(obj.soulRanks)) {
            if (SOUL_GLYPHS[sid] && rk > 0) soulRanks[sid] = Math.min(SOUL_MAX_RANK, rk | 0);
          }
        }
        if (obj.equippedSouls && typeof obj.equippedSouls === 'object') {
          for (const t of ['bullet', 'guardian', 'enchant']) {
            const sid = obj.equippedSouls[t];
            if (sid && SOUL_GLYPHS[sid] && soulRanks[sid] > 0) equippedSouls[t] = sid;
          }
        }
        if (Array.isArray(obj.bestiarySeen)) {
          for (const sp of obj.bestiarySeen) if (typeof sp === 'string') bestiarySeen.add(sp);
        }
        if (obj.bestiaryKills && typeof obj.bestiaryKills === 'object') {
          for (const [sp, cnt] of Object.entries(obj.bestiaryKills)) {
            if ((cnt | 0) > 0) { bestiaryKills[sp] = cnt | 0; bestiarySeen.add(sp); }
          }
        }
        if ((obj.bloodBladeStacks | 0) > 0) bloodBladeStacks = Math.min(24, obj.bloodBladeStacks | 0);
        if (Array.isArray(obj.openedChests)) for (const cid of obj.openedChests) openedChests.add(String(cid));
        if (Array.isArray(obj.openedSwitches)) for (const sid of obj.openedSwitches) openedSwitches.add(String(sid));
      }
    } catch (e) { /* ignore malformed storage */ }
  }

  if (params) {
    if (params.get('souls') === 'all') {
      for (const sid of SOUL_ORDER) soulRanks[sid] = 3;
      equippedSouls.bullet = equippedSouls.bullet || 'nova_ray';
      equippedSouls.guardian = equippedSouls.guardian || 'sovereign_ring';
      equippedSouls.enchant = equippedSouls.enchant || 'scholar_fortune';
      urlOverride = true;
    }
    if (params.get('bestiary') === 'all') {
      for (const sp of BESTIARY_ORDER) {
        bestiarySeen.add(sp);
        bestiaryKills[sp] = Math.max(1, bestiaryKills[sp] || 3);
      }
      urlOverride = true;
    }
  }

  return { soulRanks, equippedSouls, bestiarySeen, bestiaryKills, bloodBladeStacks, openedChests, openedSwitches, urlOverride };
}

function loadDebugFlags(key, params) {
  const flags = Object.assign({}, DEFAULT_DEBUG_FLAGS);
  const raw = safeStorageGet(key);
  if (raw) {
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        for (const k of Object.keys(DEFAULT_DEBUG_FLAGS)) if (typeof obj[k] === 'boolean') flags[k] = obj[k];
      }
    } catch (e) { /* ignore malformed storage */ }
  }
  const url = params && params.get('debug');
  if (url) {
    const parts = url.split(',').map((s) => s.trim());
    if (parts.includes('all') || parts.includes('areas')) flags.unlockAreas = true;
    if (parts.includes('all') || parts.includes('bosses')) flags.unlockBosses = true;
    if (parts.includes('none') || parts.includes('off')) { flags.unlockAreas = false; flags.unlockBosses = false; }
  }
  return flags;
}

function safeStorageGet(key) {
  try { return window.localStorage.getItem(key); } catch (e) { return null; }
}
function safeStorageSet(key, value) {
  try { window.localStorage.setItem(key, value); } catch (e) { /* private mode */ }
}
function safeStorageRemove(key) {
  try { window.localStorage.removeItem(key); } catch (e) { /* private mode */ }
}
