// Mobile browser & touch controller support for Gothic Nocturne:
// - Auto-detects coarse-pointer / touch devices (or `?touch=1` / first touch event)
// - Responsive Portrait (top 16:9 stage + lower arcade deck, zero finger occlusion)
//   and Landscape (full-height widescreen + translucent safe-area corner pads)
// - Multi-touch 8-way D-pad with platformer-tuned horizontal priority sectors
// - Multi-touch Whip / Jump / Sub-Weapon cluster supporting thumb-rolls & holds
// - Direct canvas tap support for menus, Castle Map room selection/fast-travel,
//   HUD Mini-Map, Passage Gateways, Castle Forge, and Hunter Callsign
// - Software-keyboard proxy <input> so iOS Safari & Android IME can type in
//   Castle Forge proposals and Hunter Callsign modals without viewport zoom/jump.

import {
  W, H, DIFFICULTY_ORDER, TITLE_MENU_ITEMS, TITLE_MENU_Y0, TITLE_MENU_ROW_H, SETTINGS_ITEMS, SETTINGS_TOP, SETTINGS_ROW_H, SETTINGS_TEST_ARROWS_X,
} from './constants.js';
import { MAP_X, MAP_Y, CELL_SIZE, GRID_COLS, GRID_ROWS, CELL_OWNER, stageIndexOf } from '../game/castlemap.js';
import { STAGES } from '../game/stages.js';
import { BOSS_RELICS } from '../game/relics.js';

const SUB_NAMES = {
  dagger: 'DAGGER',
  axe: 'AXE',
  holy_water: 'WATER',
};

const CALLSIGN_CLEAN = /[^A-Z0-9 _.-]/g;
const FORGE_CLEAN = /[^A-Za-z0-9 '&.,!?:-]/g;

export class TouchControls {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.canvas = game.canvas;
    this.params = game.params;

    this.root = document.getElementById('touch-ui');
    this.stageWrap = document.getElementById('stage-wrap');
    this.bar = document.getElementById('touch-bar');
    this.promptBtn = document.getElementById('touch-prompt');
    this.kbdBar = document.getElementById('touch-kbd-bar');
    this.pads = document.getElementById('touch-pads');
    this.dpad = document.getElementById('touch-dpad');
    this.dpadNub = document.getElementById('dpad-nub');
    this.actions = document.getElementById('touch-actions');
    this.textProxy = document.getElementById('mobile-text-proxy');
    this.safeProbe = document.getElementById('safe-probe');

    this.dpadArms = {};
    if (this.dpad) {
      for (const dir of ['up', 'down', 'left', 'right']) {
        this.dpadArms[dir] = this.dpad.querySelector(`[data-dir="${dir}"]`);
      }
    }
    this.btns = {};
    if (this.actions) {
      for (const k of ['whip', 'jump', 'sub', 'offhand']) {
        this.btns[k] = this.actions.querySelector(`[data-btn="${k}"]`);
      }
    }
    this.pills = {};
    if (this.bar) {
      for (const el of this.bar.querySelectorAll('[data-act]')) {
        this.pills[el.dataset.act] = el;
      }
    }
    this.kbdBtns = {};
    if (this.kbdBar) {
      for (const el of this.kbdBar.querySelectorAll('[data-kbd]')) {
        this.kbdBtns[el.dataset.kbd] = el;
      }
    }
    this.subLabel = document.getElementById('sub-label');
    this.subMeta = document.getElementById('sub-meta');
    this.offhandLabel = document.getElementById('offhand-label');
    this.offhandMeta = document.getElementById('offhand-meta');
    this.whipLabel = document.getElementById('whip-label');
    this.jumpLabel = document.getElementById('jump-label');

    this.forcedOff = this.params.get('touch') === '0';
    this.forcedOn = this.params.get('touch') === '1';
    this.active = false;
    this.orient = 'landscape';
    this.keyboardOpen = false;
    this._baseHeight = window.innerHeight || 0;
    this._uiCache = {};

    this.dpadPointers = new Map();     // pointerId -> { x, y }
    this.actionPointers = new Map();   // pointerId -> { x, y }
    this.dpadDir = { up: false, down: false, left: false, right: false };
    this.actHeld = { whip: false, jump: false, sub: false, offhand: false };
    this._subPulseTicks = 0;

    if (!this.root) return;

    this._initFullscreenSupport();
    this._bindToolbar();
    this._bindDpad();
    this._bindActions();
    this._bindCanvasTap();
    this._bindTextProxy();
    this._bindViewportAndLifecycle();

    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
    if (!this.forcedOff && (this.forcedOn || coarse || mobileUA)) {
      this.enable();
    } else if (!this.forcedOff) {
      const onFirstTouch = (e) => {
        if (e.type === 'touchstart' || e.pointerType === 'touch') {
          window.removeEventListener('touchstart', onFirstTouch);
          window.removeEventListener('pointerdown', onFirstTouch);
          this.enable();
        }
      };
      window.addEventListener('touchstart', onFirstTouch, { passive: true });
      window.addEventListener('pointerdown', onFirstTouch, { passive: true });
    }
  }

  enable() {
    if (this.active || this.forcedOff || !this.root) return;
    this.active = true;
    this.root.hidden = false;
    document.body.classList.add('touch-active');
    this.updateViewportMetrics();
    this.syncUI(true);
    this.game.fit();
  }

  vibrate(ms = 6) {
    if (navigator.vibrate) {
      try { navigator.vibrate(ms); } catch (e) { /* ignore */ }
    }
  }

  // --------------------------------------------------- viewport & safe areas

  getViewportSize() {
    const vv = window.visualViewport;
    const rawW = (vv && vv.width > 0) ? vv.width : (window.innerWidth || document.documentElement.clientWidth || 360);
    const rawH = (vv && vv.height > 0) ? vv.height : (window.innerHeight || document.documentElement.clientHeight || 640);
    const vw = Math.max(1, Math.round(rawW));
    const vh = Math.max(1, Math.round(rawH));
    return { vw, vh, offsetTop: vv ? Math.round(vv.offsetTop) : 0 };
  }

  getSafeInsets() {
    if (!this.safeProbe) return { top: 0, right: 0, bottom: 0, left: 0 };
    const r = this.safeProbe.getBoundingClientRect();
    const { vw, vh } = this.getViewportSize();
    return {
      top: Math.max(0, Math.min(80, Math.round(r.top))),
      left: Math.max(0, Math.min(96, Math.round(r.left))),
      right: Math.max(0, Math.min(96, Math.round(vw - r.right))),
      bottom: Math.max(0, Math.min(64, Math.round(vh - r.bottom))),
    };
  }

  updateViewportMetrics() {
    const { vw, vh, offsetTop } = this.getViewportSize();
    if (!this.keyboardOpen && vh > this._baseHeight) this._baseHeight = vh;
    const proxyFocused = document.activeElement === this.textProxy;
    const shrunk = this._baseHeight > 0 && (this._baseHeight - vh) > 110;
    this.keyboardOpen = !!(proxyFocused && shrunk);

    // Keep orientation locked to landscape if width >= height; when software
    // keyboard shrinks portrait height temporarily, keep portrait classification
    // unless screen itself is wider than base height.
    const rawPortrait = this.keyboardOpen ? (this._baseHeight > vw * 1.02) : (vh > vw * 1.04);
    this.orient = rawPortrait ? 'portrait' : 'landscape';

    if (this.active) {
      document.body.dataset.orient = this.orient;
      document.body.classList.toggle('keyboard-open', this.keyboardOpen);
      document.documentElement.style.setProperty('--vv-h', `${vh}px`);
      document.documentElement.style.setProperty('--vv-top', `${offsetTop}px`);
    }
  }

  /** Computes the optimal CSS width/height for the 640x360 canvas on mobile & desktop. */
  computeCanvasScale() {
    const { vw, vh } = this.getViewportSize();
    if (!this.active) {
      const raw = Math.min(vw / W, vh / H);
      const nearest = Math.max(1, Math.round(raw));
      const snap = raw >= 1
        && Math.abs(raw - nearest) / nearest <= 0.06
        && W * nearest <= vw
        && H * nearest <= vh;
      return snap ? nearest : raw;
    }

    const safe = this.getSafeInsets();
    const s = this.game.state;
    const inTextForm = !!(this.game.editingCallsign || s === 'forge');
    if (this.orient === 'portrait') {
      const availW = Math.max(160, vw - safe.left - safe.right);
      let availH;
      if (this.keyboardOpen || inTextForm) {
        availH = Math.max(120, vh - safe.top - 78);
      } else {
        // Reserve room below the 16:9 stage for the toolbar + ergonomic thumb deck
        const deckMin = Math.min(256, Math.max(196, Math.round(vh * 0.40)));
        availH = Math.max(140, vh - safe.top - safe.bottom - deckMin);
      }
      return Math.min(availW / W, availH / H);
    }

    // Landscape touch mode: fill vertical height cleanly during active play,
    // and reserve a 36px bottom strip on map/menu/forge screens so the bottom
    // toolbar never overlaps inspector cards or prompts.
    const reserveBottomStrip = inTextForm || s === 'map' || s === 'armory' || s === 'saveslots' || s === 'stageselect' || s === 'title' || s === 'difficulty' || s === 'controls' || s === 'settings' || s === 'forging';
    const availW = Math.max(200, vw - safe.left - safe.right);
    const availH = reserveBottomStrip
      ? Math.max(110, vh - Math.max(2, Math.round(safe.top * 0.5)) - Math.max(36, safe.bottom + 30))
      : Math.max(140, vh - Math.round(safe.top * 0.5) - Math.round(safe.bottom * 0.35));
    return Math.min(availW / W, availH / H);
  }

  onStateChange(prev, next) {
    if (!this.active) return;
    if (prev === 'forge' && next !== 'forge') this.blurTextProxy();
    this.syncUI(true);
    this.game.fit();
  }

  _bindViewportAndLifecycle() {
    const onResize = () => {
      this._baseHeight = Math.max(this._baseHeight, window.innerHeight || 0);
      this.updateViewportMetrics();
      this.game.fit();
    };
    window.addEventListener('orientationchange', () => setTimeout(onResize, 60));
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onResize);
      window.visualViewport.addEventListener('scroll', () => {
        if (this.active && window.scrollY !== 0) window.scrollTo(0, 0);
        this.updateViewportMetrics();
      });
    }
    // Prevent iOS Safari pinch-zoom / double-tap-zoom / pull-to-refresh gestures
    this.root.addEventListener('touchstart', (e) => {
      if (e.touches.length > 1) e.preventDefault();
    }, { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('contextmenu', (e) => {
      if (this.active) e.preventDefault();
    });

    // Auto-pause active solo/live combat if mobile browser goes into background
    document.addEventListener('visibilitychange', () => {
      this._releaseAllPointers();
      if (
        document.hidden
        && this.active
        && this.game.state === 'play'
        && this.game.world
        && this.game.world.phase === 'play'
        && !this.params.has('demo')
      ) {
        this.game.setState('pause');
      }
    });
    window.addEventListener('blur', () => this._releaseAllPointers());
  }

  // ------------------------------------------------ fullscreen & toolbar

  _initFullscreenSupport() {
    const pill = this.pills.fullscreen;
    if (!pill) return;
    const supported = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
    pill.hidden = !supported;
    if (supported) {
      const onFsChange = () => {
        const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
        pill.textContent = isFs ? 'EXIT' : 'FULL';
        pill.classList.toggle('is-on', isFs);
        setTimeout(() => { this.updateViewportMetrics(); this.game.fit(); }, 50);
      };
      document.addEventListener('fullscreenchange', onFsChange);
      document.addEventListener('webkitfullscreenchange', onFsChange);
    }
  }

  toggleFullscreen() {
    const docEl = document.documentElement;
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (!isFs) {
      const req = docEl.requestFullscreen || docEl.webkitRequestFullscreen;
      if (req) {
        Promise.resolve(req.call(docEl)).then(() => {
          if (screen.orientation && screen.orientation.lock) {
            screen.orientation.lock('landscape').catch(() => {});
          }
        }).catch(() => {});
      }
    } else {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) Promise.resolve(exit.call(document)).catch(() => {});
    }
  }

  _bindToolbar() {
    if (this.bar) {
      this.bar.addEventListener('pointerdown', (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();
        this.game.audio.unlock();
        this.vibrate(6);
        this._handleToolbarAction(btn.dataset.act);
      });
    }
    if (this.promptBtn) {
      this.promptBtn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.game.audio.unlock();
        this.vibrate(8);
        this._handlePromptTap();
      });
    }
    if (this.kbdBar) {
      this.kbdBar.addEventListener('pointerdown', (e) => {
        const btn = e.target.closest('[data-kbd]');
        if (!btn) return;
        // Prevent blurring #mobile-text-proxy when switching fields or picking a suggestion!
        e.preventDefault();
        e.stopPropagation();
        this.game.audio.unlock();
        this.vibrate(6);
        this._handleKbdAction(btn.dataset.kbd);
      });
    }
  }

  _handleToolbarAction(act) {
    const g = this.game;
    const s = g.state;
    if (g.editingCallsign && act !== 'mute' && act !== 'fx' && act !== 'fullscreen') {
      this.blurTextProxy();
      g.closeCallsignEditor(false);
      return;
    }
    switch (act) {
      case 'pause':
        if (s === 'map') this.input.pulse('map');
        else if (s === 'armory') this.input.pulse('armory');
        else if (s === 'forge') { this.blurTextProxy(); g.forgeUI.cancel(); }
        else if (s === 'forging' || s === 'saveslots' || s === 'difficulty' || s === 'controls' || s === 'settings' || s === 'stageselect') this.input.pulseEscape();
        else if (s === 'play') {
          if (g.world && g.world.canSkipBossIntro && g.world.canSkipBossIntro()) this.input.pulse('start');
          else this.input.pulseEscape();
        }
        else this.input.pulse('start');
        break;
      case 'armory':
        if (s === 'play' || s === 'pause' || s === 'map') g.openArmory(s);
        else if (s === 'armory') this.input.pulse('armory');
        break;
      case 'map':
        if (s === 'play' || s === 'pause' || s === 'map' || s === 'armory') this.input.pulse('map');
        else if (s === 'stageselect') this.input.pulse('start');
        break;
      case 'context':
        if (s === 'play') {
          this.input.pulse('salute');
        } else if (s === 'title' || s === 'stageselect') {
          g.openForge(s);
          if (g.state === 'forge') this.focusTextProxy('forge');
        }
        break;
      case 'callsign':
        if (s === 'title' || s === 'stageselect' || s === 'map' || s === 'pause') {
          g.openCallsignEditor();
          this.focusTextProxy('callsign');
        }
        break;
      case 'mute':
        this.input.pulse('mute');
        break;
      case 'fx':
        this.input.pulse('fx');
        break;
      case 'fullscreen':
        this.toggleFullscreen();
        break;
      default:
        break;
    }
  }

  _handlePromptTap() {
    const g = this.game;
    const w = g.world;
    if (g.state === 'title') {
      this.input.pulse('start');
      return;
    }
    if (g.state !== 'play' || !w || !w.player) return;
    if (w.player.petrified > 0) {
      this.input.pulse('attack');
      return;
    }
    if (w.bossExitDoor && w.bossExitDoor.open && w.bossExitDoor.near) {
      w.enterBossExitDoor(w.bossExitDoor);
      return;
    }
    if (w.passages && w.passages.some((p) => p.near)) {
      this.input.pulse('up');
      return;
    }
    if (w.warpMirror && w.warpMirror.near) {
      g.openMap();
      return;
    }
    if (w.sanctuary && w.sanctuary.near) {
      w.sanctuary.usedThisVisit = true;
      w.sanctuary.saveFlash = 1;
      w.sanctuary.saveCooldown = 0.9;
      w.activateSavePoint(w.sanctuary, { manual: true });
    }
  }

  // ------------------------------------------------ mobile keyboard proxy

  _bindTextProxy() {
    if (!this.textProxy) return;
    this.textProxy.addEventListener('input', () => {
      const g = this.game;
      const raw = this.textProxy.value || '';
      if (g.editingCallsign) {
        const clean = raw.toUpperCase().replace(CALLSIGN_CLEAN, '').slice(0, 12);
        if (clean !== g.callsignDraft) {
          g.callsignDraft = clean;
          g.audio.sfx('bone');
        }
        if (this.textProxy.value !== clean) this.textProxy.value = clean;
      } else if (g.state === 'forge') {
        const ui = g.forgeUI;
        if (ui.focus === 0) {
          const clean = raw.replace(FORGE_CLEAN, '').toUpperCase().slice(0, 28);
          if (clean !== ui.name) {
            ui.name = clean;
            ui.refreshPreview();
            g.audio.sfx('bone');
          }
          if (this.textProxy.value !== clean) this.textProxy.value = clean;
        } else {
          const clean = raw.replace(FORGE_CLEAN, '').toUpperCase().slice(0, 110);
          if (clean !== ui.desc) {
            ui.desc = clean;
            ui.refreshPreview();
            g.audio.sfx('bone');
          }
          if (this.textProxy.value !== clean) this.textProxy.value = clean;
        }
      }
    });
    this.textProxy.addEventListener('focus', () => {
      setTimeout(() => { this.updateViewportMetrics(); this.game.fit(); }, 80);
    });
    this.textProxy.addEventListener('blur', () => {
      setTimeout(() => { this.updateViewportMetrics(); this.game.fit(); }, 80);
    });
  }

  syncProxyFromGame() {
    if (!this.textProxy) return;
    const g = this.game;
    if (g.editingCallsign) {
      this.textProxy.maxLength = 12;
      this.textProxy.value = g.callsignDraft || '';
    } else if (g.state === 'forge') {
      const ui = g.forgeUI;
      this.textProxy.maxLength = ui.focus === 0 ? 28 : 110;
      this.textProxy.value = ui.focus === 0 ? (ui.name || '') : (ui.desc || '');
    }
  }

  /** Must be called synchronously inside a user pointer/touch handler so iOS Safari opens the keyboard! */
  focusTextProxy() {
    if (!this.textProxy) return;
    this.syncProxyFromGame();
    try {
      this.textProxy.focus({ preventScroll: true });
      const len = this.textProxy.value.length;
      this.textProxy.setSelectionRange(len, len);
    } catch (e) { /* ignore */ }
  }

  blurTextProxy() {
    if (this.textProxy && document.activeElement === this.textProxy) {
      this.textProxy.blur();
    }
  }

  _handleKbdAction(act) {
    const g = this.game;
    if (act === 'type') {
      this.focusTextProxy();
      return;
    }
    if (g.editingCallsign) {
      if (act === 'done') { this.blurTextProxy(); g.closeCallsignEditor(true); }
      else if (act === 'cancel') { this.blurTextProxy(); g.closeCallsignEditor(false); }
      return;
    }
    if (g.state === 'forge') {
      const ui = g.forgeUI;
      if (act === 'surprise') {
        ui.onKey({ code: 'Tab' });
        this.syncProxyFromGame();
      } else if (act === 'field') {
        ui.focus = ui.focus ? 0 : 1;
        g.audio.sfx('bone');
        this.focusTextProxy();
      } else if (act === 'done') {
        this.blurTextProxy();
        ui.submit();
      } else if (act === 'cancel') {
        this.blurTextProxy();
        ui.cancel();
      }
    }
  }

  // ------------------------------------------------ multi-touch 8-way D-pad

  _bindDpad() {
    if (!this.dpad) return;
    const onMove = (e) => {
      if (!this.dpadPointers.has(e.pointerId)) return;
      e.preventDefault();
      this.dpadPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this._recomputeDpad();
    };
    const onEnd = (e) => {
      if (!this.dpadPointers.has(e.pointerId)) return;
      e.preventDefault();
      this.dpadPointers.delete(e.pointerId);
      this._recomputeDpad();
    };
    this.dpad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.game.audio.unlock();
      try { this.dpad.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      this.dpadPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this._recomputeDpad(true);
    });
    this.dpad.addEventListener('pointermove', onMove);
    this.dpad.addEventListener('pointerup', onEnd);
    this.dpad.addEventListener('pointercancel', onEnd);
    this.dpad.addEventListener('lostpointercapture', onEnd);
  }

  _recomputeDpad(fromPress = false) {
    let next = { up: false, down: false, left: false, right: false };
    let nubX = 0, nubY = 0;

    if (this.dpadPointers.size > 0) {
      // Use the most recent finger placed on the D-pad
      let pt = null;
      for (const v of this.dpadPointers.values()) pt = v;
      const ring = this.dpad.querySelector('.dpad-ring') || this.dpad;
      const rect = ring.getBoundingClientRect();
      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.5;
      const r = Math.max(24, rect.width * 0.5);
      const dx = pt.x - cx;
      const dy = pt.y - cy;
      const dist = Math.hypot(dx, dy);

      const maxTravel = r * 0.32;
      if (dist > 0.5) {
        const k = Math.min(dist, maxTravel) / dist;
        nubX = dx * k;
        nubY = dy * k;
      }

      if (dist >= r * 0.16) {
        const deg = (Math.atan2(dy, dx) * 180) / Math.PI; // 0=R, 90=D, +-180=L, -90=U
        const absDeg = Math.abs(deg);
        // Platformer-tuned sectors: wide horizontal walk corridors (+-52 deg) so a
        // slightly low thumb never crouches and halts horizontal momentum, while
        // 52..72 deg / 108..128 deg diagonals cleanly allow crouch-aim & up-aim.
        next.right = absDeg <= 70;
        next.left = absDeg >= 110;
        next.down = deg >= 52 && deg <= 128;
        next.up = deg <= -52 && deg >= -128;
      }
    }

    const changed = next.up !== this.dpadDir.up
      || next.down !== this.dpadDir.down
      || next.left !== this.dpadDir.left
      || next.right !== this.dpadDir.right;

    if ((fromPress || changed) && (next.up || next.down || next.left || next.right)) {
      this.vibrate(5);
    }

    this.dpadDir = next;
    for (const dir of ['up', 'down', 'left', 'right']) {
      if (this.dpadArms[dir]) this.dpadArms[dir].classList.toggle('is-down', next[dir]);
    }
    this.dpad.classList.toggle('is-active', this.dpadPointers.size > 0);
    if (this.dpadNub) {
      this.dpadNub.style.transform = `translate3d(${nubX.toFixed(1)}px, ${nubY.toFixed(1)}px, 0)`;
    }
    this._syncCombinedInputs();
  }

  // ------------------------------------------------ multi-touch action buttons

  _bindActions() {
    if (!this.actions) return;
    const onMove = (e) => {
      if (!this.actionPointers.has(e.pointerId)) return;
      e.preventDefault();
      this.actionPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this._recomputeActions(false);
    };
    const onEnd = (e) => {
      if (!this.actionPointers.has(e.pointerId)) return;
      e.preventDefault();
      this.actionPointers.delete(e.pointerId);
      this._recomputeActions(false);
    };
    this.actions.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.game.audio.unlock();
      try { this.actions.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      this.actionPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this._recomputeActions(true);
    });
    this.actions.addEventListener('pointermove', onMove);
    this.actions.addEventListener('pointerup', onEnd);
    this.actions.addEventListener('pointercancel', onEnd);
    this.actions.addEventListener('lostpointercapture', onEnd);
  }

  _recomputeActions(fromPress = false) {
    const next = { whip: false, jump: false, sub: false, offhand: false };
    if (this.actionPointers.size > 0) {
      const specs = [];
      for (const k of ['whip', 'jump', 'sub', 'offhand']) {
        const el = this.btns[k];
        if (!el || el.hidden) continue;
        const r = el.getBoundingClientRect();
        if (r.width <= 0) continue;
        specs.push({
          key: k,
          cx: r.left + r.width * 0.5,
          cy: r.top + r.height * 0.5,
          rad: Math.max(r.width, r.height) * 0.62, // 1.24x diameter supports thumb-roll bridges
        });
      }
      for (const pt of this.actionPointers.values()) {
        let hitAny = false;
        for (const s of specs) {
          if (Math.hypot(pt.x - s.cx, pt.y - s.cy) <= s.rad) {
            next[s.key] = true;
            hitAny = true;
          }
        }
        // If finger landed inside the cluster padding slightly outside a circle, snap to nearest button
        if (!hitAny && specs.length > 0) {
          let best = null, bestD = 76;
          for (const s of specs) {
            const d = Math.hypot(pt.x - s.cx, pt.y - s.cy);
            if (d < bestD) { bestD = d; best = s; }
          }
          if (best) next[best.key] = true;
        }
      }
    }

    const newlySub = next.sub && !this.actHeld.sub;
    const newlyPrimary = (next.whip && !this.actHeld.whip) || (next.jump && !this.actHeld.jump) || (next.offhand && !this.actHeld.offhand);
    if (fromPress || newlyPrimary || newlySub) {
      if (next.whip || next.jump || next.sub || next.offhand) this.vibrate(7);
    }

    // Outside active combat, the secondary top button acts as Escape / Back!
    if (newlySub && this.game.state !== 'play') {
      this.input.pulseEscape();
    }

    this.actHeld = next;
    for (const k of ['whip', 'jump', 'sub', 'offhand']) {
      if (this.btns[k]) this.btns[k].classList.toggle('is-down', next[k]);
    }
    this.actions.classList.toggle('is-active', this.actionPointers.size > 0);
    this._syncCombinedInputs();
  }

  /** Pulses a sub-weapon throw (↑ + Attack) for 3 simulation steps when tapping the HUD sub-weapon box. */
  pulseSubWeapon() {
    this._subPulseTicks = 3;
    this._syncCombinedInputs();
  }

  _syncCombinedInputs() {
    const inPlay = this.game.state === 'play';
    const subThrow = inPlay && (this.actHeld.sub || this._subPulseTicks > 0);
    this.input.setTouch('left', this.dpadDir.left);
    this.input.setTouch('right', this.dpadDir.right);
    this.input.setTouch('down', this.dpadDir.down);
    this.input.setTouch('up', this.dpadDir.up || subThrow);
    this.input.setTouch('attack', this.actHeld.whip || subThrow);
    this.input.setTouch('offhand', this.actHeld.offhand);
    this.input.setTouch('jump', this.actHeld.jump);
  }

  _releaseAllPointers() {
    this.dpadPointers.clear();
    this.actionPointers.clear();
    this.dpadDir = { up: false, down: false, left: false, right: false };
    this.actHeld = { whip: false, jump: false, sub: false, offhand: false };
    this._subPulseTicks = 0;
    for (const dir of ['up', 'down', 'left', 'right']) {
      if (this.dpadArms[dir]) this.dpadArms[dir].classList.remove('is-down');
    }
    for (const k of ['whip', 'jump', 'sub', 'offhand']) {
      if (this.btns[k]) this.btns[k].classList.remove('is-down');
    }
    if (this.dpad) this.dpad.classList.remove('is-active');
    if (this.actions) this.actions.classList.remove('is-active');
    if (this.dpadNub) this.dpadNub.style.transform = 'translate3d(0, 0, 0)';
    this.input.clearTouch();
  }

  // ------------------------------------------------ direct canvas tap

  _bindCanvasTap() {
    const target = this.stageWrap || this.canvas;
    if (!target) return;
    target.addEventListener('pointerdown', (e) => {
      if (!this.active && e.pointerType !== 'touch' && this.game.state !== 'armory' && this.game.state !== 'saveslots') return;
      if (e.pointerType === 'touch') this.enable();
      this.game.audio.unlock();
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const gx = ((e.clientX - rect.left) / rect.width) * W;
      const gy = ((e.clientY - rect.top) / rect.height) * H;
      if (gx < 0 || gx > W || gy < 0 || gy > H) return;
      if (this._handleCanvasPoint(gx, gy)) {
        e.preventDefault();
      }
    });
  }

  _handleCanvasPoint(gx, gy) {
    const g = this.game;

    // 1. Callsign modal overlay
    if (g.editingCallsign) {
      const mx = (W - 336) * 0.5, my = (H - 104) * 0.5;
      if (gx >= mx && gx <= mx + 336 && gy >= my && gy <= my + 104) {
        this.focusTextProxy();
      } else {
        this.blurTextProxy();
        g.closeCallsignEditor(false);
      }
      return true;
    }

    switch (g.state) {
      case 'title': {
        if (g.forge && g.forge.activeJob && gy <= 26) {
          g.openForge('title');
          return true;
        }
        if (g.net && g.net.enabled && gy >= H - 26 && gx >= 110 && gx <= W - 110) {
          g.openCallsignEditor();
          this.focusTextProxy();
          return true;
        }
        const menu = g.getTitleMenuLayout
          ? g.getTitleMenuLayout()
          : { items: new Array(TITLE_MENU_ITEMS), y0: TITLE_MENU_Y0, rowH: TITLE_MENU_ROW_H };
        const nRows = menu.items.length;
        if (gx >= 116 && gx <= W - 116 && gy >= menu.y0 - 4 && gy < menu.y0 + menu.rowH * nRows + 2) {
          const row = Math.max(0, Math.min(nRows - 1, Math.floor((gy - (menu.y0 - 4)) / menu.rowH)));
          if (g.activateTitleMenuItem) {
            g.activateTitleMenuItem(row);
            if (g.state === 'forge') this.focusTextProxy();
          }
          return true;
        }
        this.input.pulse('start');
        return true;
      }

      case 'controls': {
        this.vibrate(5);
        this.input.pulseEscape();
        return true;
      }

      case 'settings': {
        // Settings rows: first tap selects, a second tap on the selected row activates it.
        // Audio test rows: tapping the ← / → zones at the right cycles the cue, tapping the row plays it.
        const top = SETTINGS_TOP - 8;
        if (gx >= 70 && gx <= W - 70 && gy >= top && gy < top + SETTINGS_ROW_H * SETTINGS_ITEMS.length) {
          const idx = Math.max(0, Math.min(SETTINGS_ITEMS.length - 1, Math.floor((gy - top) / SETTINGS_ROW_H)));
          this.vibrate(5);
          const item = SETTINGS_ITEMS[idx];
          if (item && item.test && gx >= W / 2 + SETTINGS_TEST_ARROWS_X) {
            g.settingsIndex = idx;
            g.settingsConfirmReset = false;
            g.cycleAudioTest(item.test, gx < W / 2 + 176 ? -1 : 1);
          } else if (g.settingsIndex === idx && g.stateT > 0.2) {
            g.activateSettingsItem(idx);
          } else {
            g.settingsIndex = idx;
            g.settingsConfirmReset = false;
            g.audio.sfx('bone');
          }
          return true;
        }
        if (gy >= top + SETTINGS_ROW_H * SETTINGS_ITEMS.length + 8) {
          this.input.pulseEscape();
          return true;
        }
        return false;
      }

      case 'saveslots':
        return g.handleSaveSlotsPoint ? g.handleSaveSlotsPoint(gx, gy) : false;

      case 'difficulty': {
        if (gy >= 80 && gy < 112 && gx >= 130 && gx <= W - 130) {
          g.activeSaveSlot = ((g.activeSaveSlot || 0) + 1) % 4;
          g.audio.sfx('bone');
          return true;
        }
        if (gx >= 70 && gx <= W - 70 && gy >= 112 && gy < 278) {
          const idx = Math.max(0, Math.min(DIFFICULTY_ORDER.length - 1, Math.floor((gy - 114) / 54)));
          g.menuIndex = idx;
          if (g.stateT > 0.2) {
            if (g.beginChosenHunt) {
              g.beginChosenHunt(DIFFICULTY_ORDER[idx]);
            } else {
              g.chooseDifficulty(DIFFICULTY_ORDER[idx]);
              g.carryState = null;
              g.startGame(0, null);
            }
          } else {
            g.audio.sfx('bone');
          }
          return true;
        }
        if (gy >= 278) {
          this.input.pulse('start');
          return true;
        }
        return false;
      }

      case 'stageselect':
      case 'map': {
        // Forge ticker on stage-select
        if (g.state === 'stageselect' && g.forge && g.forge.activeJob && gy >= 224 && gy <= 250 && gx >= 300) {
          g.openForge('stageselect');
          return true;
        }
        // Castle Grid cells (34 x 14)
        const mapW = GRID_COLS * CELL_SIZE;
        const mapH = GRID_ROWS * CELL_SIZE;
        if (gx >= MAP_X - 6 && gx <= MAP_X + mapW + 6 && gy >= MAP_Y - 6 && gy <= MAP_Y + mapH + 6) {
          const col = Math.floor((gx - MAP_X) / CELL_SIZE);
          const row = Math.floor((gy - MAP_Y) / CELL_SIZE);
          const stageKey = this._lookupMapStageAt(col, row);
          if (stageKey) {
            this.vibrate(5);
            if (g.mapCursor !== stageKey) {
              g.mapCursor = stageKey;
              g.audio.sfx('bone');
            } else {
              this.input.pulse('start');
            }
            return true;
          }
        }
        // Inspector card action area (right half of top two rows -> Enter / Warp)
        if (gy >= 254 && gy <= 304 && gx >= 300 && gx <= W - 40) {
          this.input.pulse('start');
          return true;
        }
        // Inspector bottom-right shortcuts (P EXPAND / C CALLSIGN / N MUTE)
        if (gy > 304 && gx >= 410) {
          if (g.state === 'stageselect' && gx < 476) {
            g.openForge('stageselect');
            if (g.state === 'forge') this.focusTextProxy();
          } else if (gx < 546) {
            g.openCallsignEditor();
            this.focusTextProxy();
          } else {
            this.input.pulse('mute');
          }
          return true;
        }
        // Top header strip on live map -> Resume play
        if (g.state === 'map' && gy < 34) {
          this.input.pulse('map');
          return true;
        }
        return false;
      }

      case 'forge': {
        const ui = g.forgeUI;
        // Name field (x: 36..408, y: 96..122)
        if (gx >= 28 && gx <= 416 && gy >= 82 && gy < 130) {
          ui.focus = 0;
          this.focusTextProxy();
          return true;
        }
        // Description field (x: 36..408, y: 142..182)
        if (gx >= 28 && gx <= 416 && gy >= 130 && gy <= 190) {
          ui.focus = 1;
          this.focusTextProxy();
          return true;
        }
        // Action bar (ENTER FORGE IT · TAB SURPRISE ME · ESC BACK)
        if (gy >= 288 && gy <= 326) {
          if (gx < 248) { this.blurTextProxy(); ui.submit(); }
          else if (gx <= 430) { ui.onKey({ code: 'Tab' }); this.syncProxyFromGame(); }
          else { this.blurTextProxy(); ui.cancel(); }
          return true;
        }
        return false;
      }

      case 'forging': {
        if (gx > 420 && gy > 316) this.input.pulseEscape();
        else this.input.pulse('start');
        return true;
      }

      case 'armory':
        return g.armoryUI ? g.armoryUI.handlePoint(gx, gy) : false;

      case 'play': {
        const w = g.world;
        // Top-right HUD Mini-Map radar (577, 6, 53x32 + label)
        if (gx >= 564 && gy <= 56) {
          g.openMap();
          return true;
        }
        // HUD Sub-Weapon box & hearts (206..281, 14..48)
        if (gx >= 206 && gx <= 281 && gy <= 50) {
          this.vibrate(6);
          this.pulseSubWeapon();
          return true;
        }
        // HUD Dual-Hand L & R Equipment Sockets (282..339, 14..50) -> Open Armory!
        if (gx >= 282 && gx <= 339 && gy <= 50) {
          this.vibrate(6);
          g.openArmory('play');
          return true;
        }
        if (w && w.player) {
          if (w.player.petrified > 0) {
            this.input.pulse('attack');
            return true;
          }
          // Tap directly on an open Boss Exit Door, nearby Passage Gateway, or Sanctuary Waystone in world space
          if (w.bossExitDoor && w.bossExitDoor.open && w.bossExitDoor.near) {
            const sx = w.bossExitDoor.x - w.camera.rx;
            const sy = w.bossExitDoor.y - w.camera.ry;
            if (Math.abs(gx - sx) <= 54 && gy >= sy - 132 && gy <= sy + 16) {
              this.vibrate(8);
              w.enterBossExitDoor(w.bossExitDoor);
              return true;
            }
          }
          if (w.passages) {
            for (const pg of w.passages) {
              if (!pg.near) continue;
              const sx = pg.x - w.camera.rx;
              const sy = pg.y - w.camera.ry;
              if (Math.abs(gx - sx) <= 52 && gy >= sy - 132 && gy <= sy + 16) {
                this.vibrate(8);
                this.input.pulse('up');
                return true;
              }
            }
          }
          if (w.warpMirror && w.warpMirror.near) {
            const sx = w.warpMirror.x - w.camera.rx;
            const sy = w.warpMirror.y - w.camera.ry;
            if (Math.abs(gx - sx) <= 48 && gy >= sy - 98 && gy <= sy + 12) {
              this.vibrate(8);
              g.openMap();
              return true;
            }
          }
          if (w.sanctuary && w.sanctuary.near) {
            const sx = w.sanctuary.x - w.camera.rx;
            const sy = w.sanctuary.y - w.camera.ry;
            if (Math.abs(gx - sx) <= 48 && gy >= sy - 96 && gy <= sy + 12) {
              this.vibrate(8);
              w.sanctuary.usedThisVisit = true;
              w.sanctuary.saveFlash = 1;
              w.sanctuary.saveCooldown = 0.9;
              w.activateSavePoint(w.sanctuary, { manual: true });
              return true;
            }
          }
        }
        return false;
      }

      case 'pause':
        if (gx >= 564 && gy <= 56) { g.openMap(); return true; }
        if (gx >= 282 && gx <= 339 && gy <= 50) { g.openArmory('pause'); return true; }
        this.input.pulse('start');
        return true;

      case 'clear':
      case 'gameover':
      case 'ending':
        this.input.pulse('start');
        return true;

      default:
        return false;
    }
  }

  _lookupMapStageAt(col, row) {
    const exact = CELL_OWNER.get(`${col},${row}`);
    if (exact) return exact;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const near = CELL_OWNER.get(`${col + dc},${row + dr}`);
      if (near) return near;
    }
    return null;
  }

  // ------------------------------------------------ per-frame UI state sync

  /** Updates contextual button labels, sub-weapon ammo, & gateway prompts without DOM thrash. */
  update() {
    if (this._subPulseTicks > 0) {
      this._subPulseTicks--;
      if (this._subPulseTicks === 0) this._syncCombinedInputs();
    }
    if (!this.active) return;
    this.syncUI(false);
  }

  _setText(key, el, text) {
    if (!el || this._uiCache[key] === text) return;
    this._uiCache[key] = text;
    el.textContent = text;
  }

  _setHidden(key, el, hidden) {
    const h = !!hidden;
    if (!el || this._uiCache[key] === h) return;
    this._uiCache[key] = h;
    el.hidden = h;
  }

  _setClass(key, el, cls, on) {
    const v = !!on;
    if (!el || this._uiCache[key] === v) return;
    this._uiCache[key] = v;
    el.classList.toggle(cls, v);
  }

  syncUI(force = false) {
    if (force) this._uiCache = {};
    const g = this.game;
    const s = g.state;
    const w = g.world;
    const inTextForm = !!(g.editingCallsign || s === 'forge');
    const reserveBottomStrip = inTextForm || s === 'map' || s === 'armory' || s === 'saveslots' || s === 'stageselect' || s === 'title' || s === 'difficulty' || s === 'controls' || s === 'settings' || s === 'forging';
    const subtleMenuPads = !inTextForm && (s === 'map' || s === 'armory' || s === 'saveslots' || s === 'stageselect' || s === 'title' || s === 'controls');

    this._setClass('bodyTextForm', document.body, 'in-text-form', inTextForm);
    this._setClass('bodyBottomStrip', document.body, 'has-bottom-strip', reserveBottomStrip);
    this._setClass('bodyMenuPads', document.body, 'menu-pads', subtleMenuPads);

    // Toggle between gameplay pads and text-entry bar
    this._setHidden('padsHidden', this.pads, inTextForm);
    this._setHidden('kbdHidden', this.kbdBar, !inTextForm);
    if (inTextForm) {
      const isForge = s === 'forge' && !g.editingCallsign;
      this._setHidden('kbdSurprise', this.kbdBtns.surprise, !isForge);
      this._setHidden('kbdField', this.kbdBtns.field, !isForge);
      if (isForge) {
        this._setText('kbdFieldTxt', this.kbdBtns.field, g.forgeUI.focus === 0 ? 'DESC ▾' : 'NAME ▴');
        this._setText('kbdDoneTxt', this.kbdBtns.done, 'FORGE IT');
      } else {
        this._setText('kbdDoneTxt', this.kbdBtns.done, 'SAVE NAME');
      }
    }

    // Toolbar pills
    const pauseTxt = s === 'play' ? 'PAUSE'
      : (s === 'pause' || s === 'map' || s === 'armory') ? '▶ RESUME'
      : (s === 'forge' || s === 'forging' || s === 'saveslots' || s === 'difficulty' || s === 'controls' || s === 'settings' || s === 'stageselect') ? '✕ BACK'
      : 'START';
    this._setText('pillPause', this.pills.pause, pauseTxt);
    this._setClass('pillPauseGold', this.pills.pause, 't-pill-gold', s === 'pause' || s === 'map' || s === 'armory' || s === 'title');

    const showArmory = s === 'play' || s === 'pause' || s === 'map' || s === 'armory';
    this._setHidden('pillArmHide', this.pills.armory, !showArmory);
    this._setClass('pillArmOn', this.pills.armory, 'is-on', s === 'armory');

    const showMap = s === 'play' || s === 'pause' || s === 'map' || s === 'armory';
    this._setHidden('pillMapHide', this.pills.map, !showMap);
    this._setClass('pillMapOn', this.pills.map, 'is-on', s === 'map');

    const showContext = s === 'play' || s === 'title' || s === 'stageselect';
    this._setHidden('pillCtxHide', this.pills.context, !showContext);
    this._setText('pillCtxTxt', this.pills.context, s === 'play' ? 'SALUTE' : 'FORGE');

    const showCall = s === 'title' || s === 'stageselect' || s === 'map' || s === 'pause';
    this._setHidden('pillCallHide', this.pills.callsign, !showCall);

    const muted = !!(g.audio && g.audio.muted);
    this._setText('pillMuteTxt', this.pills.mute, muted ? 'MUTED' : 'SOUND');
    this._setClass('pillMuteOff', this.pills.mute, 'is-dim', muted);

    const fxOn = !!(g.postfx && g.postfx.enabled);
    this._setText('pillFxTxt', this.pills.fx, fxOn ? 'FX ON' : 'FX OFF');
    this._setClass('pillFxOff', this.pills.fx, 'is-dim', !fxOn);

    // Action cluster labels, Dual-Hand sockets & Sub-Weapon state
    if (s === 'play' && w && w.player) {
      const wL = g.getHandWeapon ? g.getHandWeapon(0) : null;
      const wR = g.getHandWeapon ? g.getHandWeapon(1) : null;
      this._setText('whipLbl', this.whipLabel, (wL && wL.short) || 'WHIP');
      this._setText('jumpLbl', this.jumpLabel, 'JUMP');
      this._setHidden('offHide', this.btns.offhand, !wR);
      if (wR) {
        this._setText('offLbl', this.offhandLabel, wR.short || 'R-HAND');
        this._setText('offMeta', this.offhandMeta, 'R');
      }
      const sub = w.player.subWeapon;
      const hearts = w.hearts || 0;
      if (sub) {
        this._setText('subLbl', this.subLabel, SUB_NAMES[sub] || 'SUB');
        this._setText('subMeta', this.subMeta, `♥ ${String(hearts).padStart(2, '0')}`);
        this._setClass('subArmed', this.btns.sub, 'is-armed', hearts > 0);
        this._setClass('subDim', this.btns.sub, 'is-empty', hearts <= 0);
      } else {
        this._setText('subLbl', this.subLabel, 'SUB');
        this._setText('subMeta', this.subMeta, 'NONE');
        this._setClass('subArmed', this.btns.sub, 'is-armed', false);
        this._setClass('subDim', this.btns.sub, 'is-empty', true);
      }
    } else if (s === 'armory') {
      const tab = g.armoryUI ? g.armoryUI.tab : 'armory';
      if (tab === 'armory') {
        this._setText('whipLbl', this.whipLabel, 'EQUIP L');
        this._setText('jumpLbl', this.jumpLabel, 'EQUIP R');
        this._setHidden('offHide', this.btns.offhand, false);
        this._setText('offLbl', this.offhandLabel, 'EQUIP R');
        this._setText('offMeta', this.offhandMeta, 'SLOT 1');
      } else if (tab === 'save') {
        this._setText('whipLbl', this.whipLabel, 'SAVE');
        this._setText('jumpLbl', this.jumpLabel, 'SAVE');
        this._setHidden('offHide', this.btns.offhand, false);
        this._setText('offLbl', this.offhandLabel, 'LOAD');
        this._setText('offMeta', this.offhandMeta, 'SLOT');
      } else {
        const lbl = tab === 'souls' ? 'ATTUNE' : 'OK';
        this._setText('whipLbl', this.whipLabel, lbl);
        this._setText('jumpLbl', this.jumpLabel, lbl);
        this._setHidden('offHide', this.btns.offhand, true);
      }
      this._setText('subLbl', this.subLabel, 'BACK');
      this._setText('subMeta', this.subMeta, 'ESC');
      this._setClass('subArmed', this.btns.sub, 'is-armed', false);
      this._setClass('subDim', this.btns.sub, 'is-empty', false);
    } else {
      this._setText('whipLbl', this.whipLabel, 'OK');
      this._setText('jumpLbl', this.jumpLabel, 'OK');
      this._setHidden('offHide', this.btns.offhand, true);
      const canBack = s === 'map' || s === 'saveslots' || s === 'difficulty' || s === 'controls' || s === 'settings' || s === 'stageselect' || s === 'forging';
      this._setText('subLbl', this.subLabel, canBack ? 'BACK' : 'ALT');
      this._setText('subMeta', this.subMeta, canBack ? 'ESC' : '');
      this._setClass('subArmed', this.btns.sub, 'is-armed', false);
      this._setClass('subDim', this.btns.sub, 'is-empty', !canBack);
    }

    // Contextual one-tap prompt pill & D-pad ▲ glow at doorways
    let promptText = null;
    let dpadUpHint = false;
    if (!inTextForm) {
      if (s === 'play' && w && w.player) {
        if (w.player.petrified > 0) {
          promptText = '⚡ TAP RAPIDLY TO SHATTER STONE';
        } else if (w.bossExitDoor && w.bossExitDoor.open && w.bossExitDoor.near) {
          const nextKey = w.bossExitDoor.resolveNextKey ? w.bossExitDoor.resolveNextKey(w) : null;
          const destIdx = nextKey ? stageIndexOf(nextKey) : -1;
          const dest = destIdx >= 0 ? STAGES[destIdx].name.replace(/^THE\s+/, '') : 'DAWN FINALE';
          promptText = `→ ENTER ${dest}`;
          dpadUpHint = true;
        } else if (w.passages) {
          const nearGate = w.passages.find((pg) => pg.near);
          if (nearGate) {
            const effKey = nearGate.effectiveTargetKey ? nearGate.effectiveTargetKey(w) : nearGate.targetKey;
            const destIdx = stageIndexOf(effKey);
            const dest = destIdx >= 0 ? STAGES[destIdx].name.replace(/^THE\s+/, '') : 'PASSAGE';
            if (nearGate.isOpen(w)) {
              promptText = `▲ ENTER ${dest}`;
              dpadUpHint = true;
            } else if (nearGate.relicOpen && nearGate.relicOpen(w) && nearGate.entryLock) {
              const lock = nearGate.entryLock(w);
              promptText = lock ? `SEALED · ${lock.sub}` : 'SEALED';
            } else {
              const relic = BOSS_RELICS[nearGate.gateRelic];
              promptText = `SEALED · NEEDS ${relic ? relic.name : 'RELIC'}`;
            }
          }
        }
        if (!promptText && w.warpMirror && w.warpMirror.near) {
          promptText = '✦ WARP PORTAL · TAP FOR FAST TRAVEL';
          dpadUpHint = true;
        }
        if (!promptText && w.sanctuary && w.sanctuary.near) {
          promptText = '✦ SAVE SANCTUM · TAP TO SAVE GAME';
          dpadUpHint = true;
        }
      } else if (s === 'title' && this.orient === 'portrait') {
        promptText = '↻ ROTATE FOR WIDESCREEN · TAP TO BEGIN';
      }
    }
    this._setClass('dpadUpHint', this.dpadArms.up, 'is-hint', dpadUpHint);
    this._setHidden('promptHide', this.promptBtn, !promptText);
    if (promptText) this._setText('promptTxt', this.promptBtn, promptText);
  }
}
