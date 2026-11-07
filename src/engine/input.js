// Keyboard + gamepad input with edge detection and an optional scripted
// driver (used by the title-screen attract demo and headless screenshots).

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  Space: 'jump', KeyZ: 'jump', KeyJ: 'jump',
  KeyX: 'attack', KeyK: 'attack',
  KeyV: 'offhand', KeyL: 'offhand', ShiftLeft: 'offhand', ShiftRight: 'offhand',
  KeyQ: 'dash', Backspace: 'dash',
  KeyR: 'swap',
  KeyB: 'bestiary',
  KeyE: 'armory', KeyI: 'armory',
  Enter: 'start', Escape: 'start',
  KeyM: 'map', Tab: 'map',
  KeyN: 'mute', KeyU: 'mute',
  KeyF: 'fx',
  KeyP: 'forge',
  KeyG: 'salute',
  KeyC: 'callsign',
};

const ACTIONS = [
  'left', 'right', 'up', 'down', 'jump', 'sprint', 'attack', 'offhand', 'dash', 'swap', 'bestiary', 'armory',
  'start', 'map', 'mute', 'fx', 'forge', 'salute', 'callsign',
];

export class Input {
  constructor(target) {
    this.down = Object.fromEntries(ACTIONS.map((a) => [a, false]));
    this.pressed = Object.fromEntries(ACTIONS.map((a) => [a, false]));
    this.released = Object.fromEntries(ACTIONS.map((a) => [a, false]));
    this.keyState = {};
    this.padState = {};
    this.touchState = {};
    this._latched = {};
    this._escapeLatched = false;
    this.script = null;
    this.onFirstInteraction = null;
    this._interacted = false;
    this.hasGamepad = false;
    this._inputMode = 'keyboard';
    this._keyboardUsed = false;
    // Text-entry capture (Castle Forge proposal, multiplayer callsign): while
    // `typing`, raw keydown events go to `onTypeKey(e)` instead of the action map.
    this.typing = false;
    this.onTypeKey = null;

    const noteInteraction = () => {
      this._interacted = true;
      if (this.onFirstInteraction) this.onFirstInteraction();
    };
    window.addEventListener('keydown', (e) => {
      this._keyboardUsed = true;
      this._inputMode = 'keyboard';
      noteInteraction();
      if (this.typing && this.onTypeKey) {
        // When typing through the mobile software-keyboard proxy <input>, let
        // printable characters, Backspace and IME composition flow through its
        // native `input` event; only intercept navigation/submit keys here.
        if (e.target && e.target.dataset && e.target.dataset.mobileProxy === '1') {
          if (
            e.code === 'Escape' || e.code === 'Enter' || e.code === 'NumpadEnter'
            || e.code === 'Tab' || e.code === 'ArrowUp' || e.code === 'ArrowDown'
          ) {
            this.onTypeKey(e);
            e.preventDefault();
          }
          return;
        }
        this.onTypeKey(e);
        if (e.code !== 'F5' && e.code !== 'F12' && !(e.ctrlKey || e.metaKey)) e.preventDefault();
        return;
      }
      if (e.code === 'Escape') this.keyState._escape = true;
      if (e.code === 'KeyC') this.keyState.offhand = true;
      const a = KEYMAP[e.code];
      if (a) {
        this.keyState[a] = true;
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Escape') this.keyState._escape = false;
      if (e.code === 'KeyC') this.keyState.offhand = false;
      const a = KEYMAP[e.code];
      if (a) { this.keyState[a] = false; e.preventDefault(); }
    });
    window.addEventListener('blur', () => { this.keyState = {}; this.touchState = {}; });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { this.keyState = {}; this.touchState = {}; }
    });
    target.addEventListener('pointerdown', () => {
      if (!this.typing) target.focus({ preventScroll: true });
      noteInteraction();
    });
    window.addEventListener('touchstart', () => noteInteraction(), { passive: true });
    window.addEventListener('touchend', () => noteInteraction(), { passive: true });
  }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && Array.from(pads).find((g) => g && g.connected);
    this.hasGamepad = !!p;
    const s = {};
    if (p) {
      if (!this._keyboardUsed && this._inputMode === 'keyboard') {
        this._inputMode = 'gamepad';
      }
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
      s.left = ax < -0.5 || b(14);
      s.right = ax > 0.5 || b(15);
      s.up = ay < -0.5 || b(12);
      s.down = ay > 0.5 || b(13);
      s.jump = b(0);                             // A -> Jump
      s.sprint = b(1);                           // B -> Forward Dash / Sprint (same as double-tap forward)
      s.attack = b(2) || b(5);                   // X / RB -> Hand_L (Slot 0)
      s.offhand = b(3) || b(7);                  // Y / RT -> Hand_R (Slot 1)
      s.dash = b(4);                             // LB -> Backdash / Slide / Magnes Tether
      s.swap = b(6);                             // LT -> Dual Loadout A/B Instant Swap
      s.start = b(9);                            // Start / Menu -> Equipment Grimoire (in play) / Confirm (menus)
      s.map = b(8);           // Back / View / Select toggles Castle Map
      s.fx = b(10);           // left-stick click toggles shaders
      s.mute = b(11);         // right-stick click toggles mute
      if (Object.values(s).some(Boolean)) {
        this._inputMode = 'gamepad';
        if (!this._interacted) { this._interacted = true; this.onFirstInteraction && this.onFirstInteraction(); }
      }
    }
    this.padState = s;
  }

  /** Attach a scripted driver: function(timeSeconds) -> {action: bool}. */
  setScript(fn) { this.script = fn; this.scriptTime = 0; }

  /** Routes raw keystrokes to `handler(e)` (text fields); `null` restores game controls. */
  setTyping(handler) {
    this.typing = !!handler;
    this.onTypeKey = handler || null;
    this.keyState = {};   // never carry a held key across the mode switch
    this.touchState = {};
    this._latched = {};
  }

  /** Sets held state for a virtual touch button/direction (latches short taps so <16ms taps never drop). */
  setTouch(action, isDown) {
    if (!(action in this.down)) return;
    this.touchState[action] = !!isDown;
    if (isDown) this._latched[action] = true;
  }

  /** Queues a one-step press edge (e.g. tapping a menu item, HUD radar, or toolbar pill). */
  pulse(action) {
    if (action in this.down) this._latched[action] = true;
  }

  /** Queues a one-step Escape edge (mobile Back / Cancel). */
  pulseEscape() {
    this._escapeLatched = true;
  }

  /** Releases all held virtual touch inputs immediately. */
  clearTouch() {
    this.touchState = {};
  }

  update(dt) {
    this.pollGamepad();
    let scripted = null;
    if (this.script) {
      this.scriptTime += dt;
      scripted = this.script(this.scriptTime);
      if (!scripted) this.script = null;
    }
    for (const a of ACTIONS) {
      let now = !!(this.keyState[a] || this.padState[a] || this.touchState[a] || (scripted && scripted[a]));
      if (!now && this._latched[a]) {
        if (this.down[a]) {
          now = false; // allow one release tick so rapid double-taps register distinct edges
        } else {
          now = true;
          this._latched[a] = false;
        }
      } else if (now) {
        this._latched[a] = false;
      }
      this.pressed[a] = now && !this.down[a];
      this.released[a] = !now && this.down[a];
      this.down[a] = now;
    }
    let escNow = !!this.keyState._escape;
    if (!escNow && this._escapeLatched) {
      if (this._escapeDown) {
        escNow = false;
      } else {
        escNow = true;
        this._escapeLatched = false;
      }
    } else if (escNow) {
      this._escapeLatched = false;
    }
    this.pressed.escape = escNow && !this._escapeDown;
    this._escapeDown = escNow;
  }

  /** True when a gamepad/Steam Deck controller is the active input device. */
  get isGamepad() { return this._inputMode === 'gamepad'; }

  /** True if any action was pressed this frame. */
  get anyPressed() { return ACTIONS.some((a) => this.pressed[a]); }

  get axis() { return (this.down.right ? 1 : 0) - (this.down.left ? 1 : 0); }
}
