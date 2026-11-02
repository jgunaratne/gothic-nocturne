// Gothic Nocturne — entry point: boot, scaling, game loop and menu states.

import { W, H, DT, DIFFICULTIES, DIFFICULTY_ORDER, DEFAULT_DIFFICULTY, ASSET_VERSION } from './engine/constants.js';
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
  drawCastleMap, moveCursor, nextRoomAfter, stageIndexOf, isDiscovered, MAP_ROOMS, CELL_OWNER,
} from './game/castlemap.js';
import { BOSS_RELICS, resolveActiveRelics } from './game/relics.js';
import {
  START_LEVEL, LEVEL_CAP, expRequiredForNextLevel, levelBonuses, applyExpGain,
} from './game/progression.js';
import { Forge } from './game/forge.js';
import { ForgeScreens } from './game/forge_ui.js';
import { ArmoryScreen } from './game/armory_ui.js';
import { WEAPONS, WEAPON_ORDER, SET_RESONANCES } from './game/weapons.js';
import { TouchControls } from './engine/touch.js';

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
    this.state = 'loading';          // loading | title | difficulty | stageselect | forge | forging | play | map | pause | clear | ending | gameover
    this.forge = new Forge(this);     // Castle Forge: player-proposed wings
    this.forgeUI = new ForgeScreens(this);
    this.titleMenu = 0;               // 0 = begin the hunt, 1 = expand the castle
    this.wingBanner = null;           // { name, t } after a wing is raised in the background
    this.stateT = 0;
    this.world = null;
    this.titleWorld = null;
    this.acc = 0;
    this.last = performance.now();
    this.params = new URLSearchParams(location.search);
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
    this._urlArmoryOverride = armory.urlOverride;
    this.armoryUI = new ArmoryScreen(this);
    const urlStage = parseInt(this.params.get('stage') || '0', 10);
    this.stageIndex = urlStage >= 1 && urlStage <= STAGES.length ? urlStage - 1
      : Math.min(STAGES.length - 1, parseInt(safeStorageGet('gothic.stage') || '0', 10) || 0);
    this.stageCursor = this.stageIndex;
    this.mapCursor = STAGES[this.stageIndex].key;
    this.carryState = null;          // score/lives/hearts carried between connected stages
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
      const stored = parseInt(safeStorageGet('gothic.stage') || '0', 10) || 0;
      const want = urlStage >= 1 && urlStage <= STAGES.length ? urlStage - 1 : Math.min(STAGES.length - 1, stored);
      if (want !== this.stageIndex) { this.stageIndex = want; this.stageCursor = want; this.mapCursor = STAGES[want].key; }
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
    } else if (screen === 'forge') {
      this.openForge('title');
    } else if (screen === 'play') {
      this.startGame();
    } else if (screen === 'map') {
      this.startGame();
      this.openMap();
    } else if (screen === 'armory') {
      this.startGame();
      this.openArmory('play');
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
    // Testing aids: ?skip=N pre-simulates N fixed steps before the first draw.
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
    this.saveArmory();
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
    if (!wL || !wR || wL.isTwoHanded) return null;
    if (wL.setTag && wL.setTag === wR.setTag && SET_RESONANCES[wL.setTag]) {
      return SET_RESONANCES[wL.setTag];
    }
    return null;
  }

  saveArmory() {
    if (this._urlArmoryOverride) return;
    safeStorageSet('gothic.armory.v1', JSON.stringify({
      owned: [...this.ownedWeapons],
      handL: this.handL,
      handR: this.handR,
    }));
  }

  openArmory(returnState = 'play') {
    this.armoryUI.open(returnState);
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
  onStageClear() {
    this.cleared |= 1 << this.stageIndex;
    safeStorageSet('gothic.cleared.v3', String(this.cleared));
    if (this.world) {
      this.world.messages = [];
      this.world.relics = this.getActiveRelics();
    }
    this.setState('clear');
  }

  /** After the clear screen: next stage, or the ending after the last one. */
  advance() {
    const key = STAGES[this.stageIndex].key;
    if (key === 'throne') { this.beginEnding(); return; }
    // Back to the castle map: carry the run forward and point at the passage just opened.
    this.carryState = this.world.carry();
    this.mapCursor = nextRoomAfter(key, this.cleared) || key;
    this.setState('stageselect');
    this.audio.playMusic('title');
    this.audio.stopAmbient();
  }

  banner(lines, y, opts) { drawBanner(this.ctx, this.font, lines, y, opts); }

  /** Scripted attract/testing driver (?demo=1): walk, jump and whip. */
  startDemo() {
    this.startGame();
    this.audio.muted = true;
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
    } else if ((this.state === 'title' || this.state === 'difficulty' || this.state === 'stageselect') && this.titleWorld && this.titleWorld.flash > 0.02) {
      this.postfx.strike(this.titleWorld.flash);
    }
    this.postfx.draw(dt, fxWorld ? (fxWorld.fxTheme || fxWorld.data.theme) : 'menu');
    requestAnimationFrame((t) => this.frame(t));
  }

  update(dt) {
    this.stateT += dt;
    this.net.update(dt, this.buildNetSnapshot());
    if (this.editingCallsign) {
      if (this.state === 'title' || this.state === 'difficulty' || this.state === 'stageselect') {
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
      case 'title':
        this.updateTitleBackdrop(dt);
        this.audio.playMusic('title');
        this.audio.stopAmbient();
        if (inp.pressed.up || inp.pressed.down) { this.titleMenu = this.titleMenu ? 0 : 1; this.audio.sfx('bone'); }
        if (inp.pressed.forge) { this.openForge('title'); break; }
        if (inp.pressed.start || inp.pressed.jump || inp.pressed.attack) {
          if (this.titleMenu === 1) this.openForge('title');
          else { this.setState('difficulty'); this.audio.sfx('select'); }
        }
        break;
      case 'forge':
        this.forgeUI.updateProposal(dt, inp);
        break;
      case 'forging':
        this.forgeUI.updateForging(dt, inp);
        break;
      case 'difficulty': {
        this.updateTitleBackdrop(dt);
        if (inp.pressed.escape) { this.setState('title'); this.audio.sfx('pause'); break; }
        const n = DIFFICULTY_ORDER.length;
        if (inp.pressed.up || inp.pressed.left) { this.menuIndex = (this.menuIndex + n - 1) % n; this.audio.sfx('bone'); }
        if (inp.pressed.down || inp.pressed.right) { this.menuIndex = (this.menuIndex + 1) % n; this.audio.sfx('bone'); }
        if (this.stateT > 0.25 && (inp.pressed.start || inp.pressed.jump || inp.pressed.attack)) {
          this.chooseDifficulty(DIFFICULTY_ORDER[this.menuIndex]);
          this.carryState = null;
          this.setState('stageselect'); this.audio.sfx('select');
        }
        break;
      }
      case 'stageselect': {
        this.updateTitleBackdrop(dt);
        if (inp.pressed.escape) { this.setState('difficulty'); this.audio.sfx('pause'); break; }
        if (inp.pressed.forge) { this.openForge('stageselect'); break; }
        let c = this.mapCursor;
        if (inp.pressed.left) c = moveCursor(c, -1, 0);
        else if (inp.pressed.right) c = moveCursor(c, 1, 0);
        else if (inp.pressed.up) c = moveCursor(c, 0, -1);
        else if (inp.pressed.down) c = moveCursor(c, 0, 1);
        if (c !== this.mapCursor) { this.mapCursor = c; this.audio.sfx('bone'); }
        if (this.stateT > 0.25 && (inp.pressed.start || inp.pressed.jump || inp.pressed.attack)) {
          this.startGame(stageIndexOf(this.mapCursor));
        }
        break;
      }
      case 'play':
        if (inp.pressed.armory) { this.openArmory('play'); break; }
        if (inp.pressed.map) { this.openMap(); break; }
        if (inp.pressed.start && this.world.phase === 'play') { this.setState('pause'); this.audio.sfx('pause'); break; }
        this.world.update(dt, inp);
        break;
      case 'armory':
        this.armoryUI.update(dt, inp);
        break;
      case 'map': {
        if (inp.pressed.armory) { this.openArmory('map'); break; }
        let c = this.mapCursor;
        if (inp.pressed.left) c = moveCursor(c, -1, 0);
        else if (inp.pressed.right) c = moveCursor(c, 1, 0);
        else if (inp.pressed.up) c = moveCursor(c, 0, -1);
        else if (inp.pressed.down) c = moveCursor(c, 0, 1);
        if (c !== this.mapCursor) { this.mapCursor = c; this.audio.sfx('bone'); }
        if (inp.pressed.map || inp.pressed.escape) {
          this.setState('play');
          this.audio.sfx('pause');
          break;
        }
        if (this.stateT > 0.16 && (inp.pressed.start || inp.pressed.jump || inp.pressed.attack)) {
          const curKey = STAGES[this.stageIndex].key;
          if (this.mapCursor === curKey) {
            this.setState('play');
            this.audio.sfx('pause');
          } else if (isDiscovered(this.mapCursor, this.cleared, this.discovered)) {
            this.startGame(
              stageIndexOf(this.mapCursor),
              this.world.carry({ enterFromDoorId: 'sanctuary' }),
            );
          } else {
            this.audio.sfx('block');
          }
        }
        break;
      }
      case 'pause':
        if (inp.pressed.armory) { this.openArmory('pause'); break; }
        if (inp.pressed.map) { this.openMap(); break; }
        if (inp.pressed.start || inp.pressed.escape) { this.setState('play'); this.audio.sfx('pause'); }
        break;
      case 'clear':
        this.world.update(dt, inp);
        if (this.stateT > 2 && (inp.pressed.start || inp.pressed.jump || inp.pressed.attack)) this.advance();
        break;
      case 'ending':
        if (this.stateT > 6 && (inp.pressed.start || inp.pressed.jump || inp.pressed.attack)) { this.setState('title'); this.audio.stopMusic(); this.endingNarrated = false; }
        if (this.state === 'ending' && !this.endingNarrated && this.stateT > 2.4) { this.endingNarrated = true; this.audio.playVoice('narrator_ending', { space: 'cathedral' }); }
        break;
      case 'gameover':
        if (this.stateT > 1.5 && (inp.pressed.start || inp.pressed.jump || inp.pressed.attack)) { this.setState('title'); this.audio.stopMusic(); }
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
      case 'gameover':
        this.world.draw(ctx, { hud: false });
        ctx.fillStyle = 'rgba(4, 3, 10, 0.6)'; ctx.fillRect(0, 0, W, H);
        this.banner(['GAME OVER'], 136, { scale: 4, color: '#e23c3c', sub: this.stateT > 1.5 ? ((this.touch && this.touch.active) ? 'TAP OR PRESS START' : 'PRESS ENTER') : ' ' });
        this.font.draw(ctx, `LV ${String(this.charLevel).padStart(2, '0')} · SCORE ${String(this.world.score).padStart(7, '0')}`, W / 2, 215, { align: 'center', scale: 2, gothic: false, shadow: '#120f1c' });
        break;
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
    const logo = this.assets.img('title_logo');
    const reveal = Math.min(1, Math.max(0, (t - 0.3) / 1.4));
    if (logo) {
      // Blackletter logo: rises and fades in, then breathes gently with a crimson under-glow
      const lw = 340, lh = Math.round(logo.height * (lw / logo.width));
      const lx = Math.round((W - lw) / 2), ly = Math.round(18 + (1 - reveal) * 16 + Math.sin(t * 1.3) * 2);
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
      f.draw(ctx, 'GOTHIC', W / 2, 62, { scale: 6, align: 'center', color: '#e8e2c8', spacing: 2, shadow: '#5b2a3a' });
      f.draw(ctx, 'NOCTURNE', W / 2, 118, { scale: 4, align: 'center', color: '#c23b4a', spacing: 2, shadow: '#120f1c' });
    }
    if (reveal >= 1) {
      // Ornamental rule and tagline
      ctx.fillStyle = '#8a6a3a'; ctx.fillRect(W / 2 - 150, 226, 300, 1);
      ctx.fillStyle = '#d9b36a'; ctx.fillRect(W / 2 - 2, 224, 4, 4); ctx.fillRect(W / 2 - 150, 225, 3, 3); ctx.fillRect(W / 2 + 147, 225, 3, 3);
      f.draw(ctx, 'A 32-BIT WHIP-CRACKING ACTION PLATFORMER', W / 2, 234, { align: 'center', color: '#a89a74', shadow: '#120f1c' });
      const isTouch = !!(this.touch && this.touch.active);
      // Title menu: begin the hunt, or propose a new wing for the Castle Forge to raise
      const items = [
        ['BEGIN THE HUNT', isTouch ? 'TAP OR PRESS START' : 'PRESS ENTER OR START'],
        ['EXPAND THE CASTLE', `PROPOSE A NEW WING · ${this.forge.forgedCount ? `${this.forge.forgedCount} RAISED SO FAR` : 'AI-FORGED LEVEL, ART, MUSIC AND BOSS'}`],
      ];
      items.forEach(([label, sub], i) => {
        const sel = this.titleMenu === i;
        const y = 246 + i * 18;
        const col = sel ? (pulse > 0.25 ? '#ffd27a' : '#e0b45a') : '#6f6a80';
        f.draw(ctx, `${sel ? '→ ' : '  '}${label}${sel ? ' ←' : '  '}`, W / 2, y, { scale: 2, align: 'center', color: col, shadow: '#5b2a3a', gothic: false });
        if (sel) f.draw(ctx, sub, W / 2, 284, { align: 'center', color: '#a89a74', shadow: '#120f1c', gothic: false });
      });
      // Controls plate
      ctx.fillStyle = 'rgba(4, 3, 10, 0.55)';
      ctx.fillRect(W / 2 - 248, 298, 496, 34);
      ctx.fillStyle = '#3a2e22'; ctx.fillRect(W / 2 - 248, 298, 496, 1); ctx.fillRect(W / 2 - 248, 331, 496, 1);
      const lines = isTouch ? [
        'D-PAD MOVE   JUMP   L-HAND & R-HAND WEAPONS   SUB THROWS HEART ITEM',
        'GEAR OPENS DUAL-HAND ARMORY   TAP MINI-MAP FOR FAST TRAVEL   ↓↘→ SKILL',
      ] : [
        '←→ MOVE   ↓ CROUCH   Z/J/SPACE JUMP   X/K L-HAND   C/V/L R-HAND   ↓↘→ SKILL',
        'E ARMORY  M MAP  ↑ PASSAGES / + L-HAND SUB  P FORGE  G SALUTE  N MUTE  F FX',
      ];
      lines.forEach((l, i) => f.draw(ctx, l, W / 2, 304 + i * 12, { align: 'center', color: i === 1 ? '#ffb0a0' : '#c9c3b0', shadow: '#120f1c' }));
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
        f.draw(ctx, 'ART · GEMINI     MUSIC · LYRIA 3     VOICE · DAIKON     FORGE · GEMINI + GEMPIX     2026', W / 2, H - 16, { align: 'center', color: '#5b6b86' });
      }
      this.forgeUI.drawTicker(ctx, 4);
    }
  }

  drawDifficulty(ctx) {
    const tw = this.titleWorld;
    tw.draw(ctx, { hud: false });
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
    });
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
    const tw = this.titleWorld;
    tw.draw(ctx, { hud: false });
    drawCastleMap(ctx, this.font, this.assets, {
      cursor: this.mapCursor,
      cleared: this.cleared,
      discovered: this.discovered,
      vessels: this.vessels,
      explored: this.exploredCells,
      relics: this.getActiveRelics(),
      time: this.stateT,
      difficultyName: this.difficulty.name,
      charLevel: this.charLevel,
      mode: 'select',
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
      discovered: this.discovered,
      vessels: this.vessels,
      explored: this.exploredCells,
      relics: this.getActiveRelics(),
      time: this.stateT,
      difficultyName: this.difficulty.name,
      charLevel: this.charLevel,
      mode: 'live',
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

  /** Starts the finale: collapse, three illustrated panels with the narrator, dawn, logo. */
  beginEnding() {
    this.setState('ending');
    this.endingNarrated = false;
    this.audio.playMusic('ending', false);
    this.audio.stopAmbient();
    if (this.audio.prefetchVoice) this.audio.prefetchVoice('narrator_ending');
  }

  drawEnding(ctx) {
    const t = this.stateT;
    const f = this.font;
    const w = this.world;
    const A = this.assets;
    const p1 = A.img('ending_1'), p2 = A.img('ending_2'), p3 = A.img('ending_3');
    // Timeline (seconds): 0-7 collapse panel with quake & crimson cracks, 7-20 road panel,
    // 20-33 dawn panel, 33+ logo/credits. Slow drifts (Ken Burns) on every panel.
    const drawPanel = (img, from, to, zoomFrom, zoomTo, panX) => {
      if (!img) return;
      const k = Math.max(0, Math.min(1, (t - from) / Math.max(0.01, to - from)));
      const z = zoomFrom + (zoomTo - zoomFrom) * k;
      const dw = W * z, dh = H * z;
      const dx = (W - dw) / 2 + panX * k, dy = (H - dh) / 2;
      ctx.drawImage(img, Math.round(dx), Math.round(dy), Math.round(dw), Math.round(dh));
    };
    const fadeBetween = (a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));

    ctx.fillStyle = '#05040a'; ctx.fillRect(0, 0, W, H);
    if (t < 8.2) {
      // 1. The keep comes down: slow push-in, quake shake, crimson flashes, falling embers
      const quake = t < 6 ? Math.max(0, 1 - t / 6) * 5 : 0;
      ctx.save();
      ctx.translate(Math.round((Math.random() - 0.5) * quake), Math.round((Math.random() - 0.5) * quake));
      drawPanel(p1, 0, 8, 1.0, 1.12, -18);
      ctx.restore();
      const flash = Math.max(0, Math.sin(t * 7.3) * Math.sin(t * 3.1)) * Math.max(0, 1 - t / 6);
      if (flash > 0.55) { ctx.fillStyle = `rgba(255, 80, 60, ${(flash - 0.55) * 0.5})`; ctx.fillRect(0, 0, W, H); }
      if (!this._embers) this._embers = Array.from({ length: 70 }, (_, i) => ({ x: Math.random() * W, y: Math.random() * H, s: 0.4 + Math.random(), p: i }));
      for (const e of this._embers) {
        const ex = (e.x + Math.sin(t * 0.8 + e.p) * 12 + t * 9 * e.s) % (W + 20) - 10;
        const ey = (e.y - t * 26 * e.s) % H; const yy = ey < 0 ? ey + H : ey;
        ctx.fillStyle = e.p % 3 ? '#ff9a3c' : '#ffd27a';
        ctx.fillRect(Math.round(ex), Math.round(yy), e.s > 1.1 ? 2 : 1, e.s > 1.1 ? 2 : 1);
      }
      if (t > 0.6) this.banner(['THE NIGHT IS OVER'], 38, { scale: 3, color: '#ffd27a', band: true });
    } else if (t < 21) {
      drawPanel(p2, 8, 21, 1.1, 1.0, 14);
    } else if (t < 34) {
      drawPanel(p3, 21, 34, 1.0, 1.1, -10);
      // Dawn: warm light swelling over the valley
      const kd = fadeBetween(21, 30);
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, `rgba(255, 190, 110, ${0.05 + 0.12 * kd})`); g.addColorStop(1, 'rgba(255, 190, 110, 0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } else {
      // Final card: logo over the dawn panel, framed score & credits plate
      drawPanel(p3, 34, 60, 1.1, 1.18, -6);
      ctx.fillStyle = 'rgba(6, 4, 14, 0.74)'; ctx.fillRect(0, 0, W, H);
      const logo = A.img('title_logo');
      if (logo) {
        const lw = 276, lh = Math.round(logo.height * (lw / logo.width));
        const lx = Math.round((W - lw) / 2), ly = 10;
        const lg = ctx.createRadialGradient(W / 2, ly + lh * 0.5, 24, W / 2, ly + lh * 0.5, 210);
        lg.addColorStop(0, 'rgba(4, 3, 10, 0.72)');
        lg.addColorStop(1, 'rgba(4, 3, 10, 0)');
        ctx.fillStyle = lg;
        ctx.fillRect(0, 0, W, ly + lh + 24);
        ctx.drawImage(logo, lx, ly, lw, lh);
      }
      const cx = W / 2 - 228, cy = 186, cw = 456, ch = 156;
      ctx.fillStyle = 'rgba(5, 4, 12, 0.90)';
      ctx.fillRect(cx, cy, cw, ch);
      ctx.strokeStyle = '#8a6a3a';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx + 0.5, cy + 0.5, cw - 1, ch - 1);
      ctx.strokeStyle = '#2e243d';
      ctx.strokeRect(cx + 2.5, cy + 2.5, cw - 5, ch - 5);
      if (w) {
        f.draw(ctx, `FINAL SCORE ${String(w.score).padStart(7, '0')}`, W / 2, 198, { scale: 2, gothic: false, align: 'center', color: '#ffd27a', shadow: '#05040a' });
        f.draw(ctx, `${w.difficulty.name} · LV ${String(this.charLevel).padStart(2, '0')} · ${w.lives} LIVES REMAINING · ${w.hearts} HEARTS`, W / 2, 222, { gothic: false, align: 'center', color: '#e8e2c8', shadow: '#05040a' });
      }
      ctx.fillStyle = '#5a462c';
      ctx.fillRect(W / 2 - 150, 240, 300, 1);
      f.draw(ctx, 'THANK YOU FOR PLAYING', W / 2, 250, { scale: 2, gothic: false, align: 'center', color: '#f6f0de', shadow: '#05040a' });
      f.draw(ctx, 'ART · GEMINI     MUSIC · LYRIA 3     VOICE · DAIKON', W / 2, 278, { gothic: false, align: 'center', color: '#b8c4dc', shadow: '#05040a' });
      const pulse = 0.72 + 0.28 * Math.sin(t * 4.2);
      ctx.save();
      ctx.globalAlpha = pulse;
      f.draw(ctx, (this.touch && this.touch.active) ? 'TAP OR PRESS START' : 'PRESS ENTER', W / 2, 306, { scale: 2, gothic: false, align: 'center', color: '#ffd27a', shadow: '#05040a' });
      ctx.restore();
    }
    // Crossfades between panels
    for (const [a, b] of [[7.4, 8.6], [20.4, 21.6], [33.4, 34.6]]) {
      if (t > a && t < b) { const k = 1 - Math.abs((t - (a + b) / 2) / ((b - a) / 2)); ctx.fillStyle = `rgba(5, 4, 10, ${k})`; ctx.fillRect(0, 0, W, H); }
    }
    // Letterbox + high-legibility timed captions during the narrated panels (0..34s)
    if (t < 34) {
      ctx.fillStyle = '#05040a';
      ctx.fillRect(0, 0, W, 22);
      ctx.fillStyle = '#5a462c';
      ctx.fillRect(0, 22, W, 1);
      const barH = 58, barY = H - barH;
      ctx.fillStyle = 'rgba(5, 4, 12, 0.94)';
      ctx.fillRect(0, barY, W, barH);
      ctx.fillStyle = '#7a603a';
      ctx.fillRect(0, barY, W, 1);
      const caps = [
        [2.4, 8.0, 'AND SO THE COUNT WAS DUST, AND HIS KEEP FELL SILENT.'],
        [8.6, 14.5, 'THE BELLS OF MIDNIGHT CRACKED AND TUMBLED FROM THE BELFRY,'],
        [14.5, 20.3, 'AND THE DARKNESS THAT FED ON THE VALLEY DRAINED AWAY.'],
        [21.6, 27.5, 'THE HUNTER DID NOT LOOK BACK. HE WALKED THE GRAVEYARD ROAD AS THE MIST LIFTED,'],
        [27.5, 33.3, 'AND FOR THE FIRST TIME IN HIS LIFE... HE WALKED IT TOWARD THE SUNRISE.'],
      ];
      for (const [a, b, text] of caps) {
        if (t < a || t > b) continue;
        const k = Math.min(1, (t - a) / 0.35, (b - t) / 0.35);
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
  let urlOverride = false;

  if (params && params.get('resetarmory') === '1') {
    safeStorageSet(key, JSON.stringify({ owned: ['hunters_lash'], handL: 'hunters_lash', handR: null }));
    return { owned, handL, handR, urlOverride: false };
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

  return { owned, handL, handR, urlOverride };
}

function safeStorageGet(key) {
  try { return window.localStorage.getItem(key); } catch (e) { return null; }
}
function safeStorageSet(key, value) {
  try { window.localStorage.setItem(key, value); } catch (e) { /* private mode */ }
}
