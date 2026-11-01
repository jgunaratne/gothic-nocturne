// Keyboard + gamepad input with edge detection and an optional scripted
// driver (used by the title-screen attract demo and headless screenshots).

const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  Space: 'jump', KeyZ: 'jump', KeyJ: 'jump',
  KeyX: 'attack', KeyK: 'attack',
  Enter: 'start', Escape: 'start',
  KeyM: 'map', Tab: 'map',
  KeyN: 'mute', KeyU: 'mute',
  KeyF: 'fx',
  KeyP: 'forge',
};

const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'attack', 'start', 'map', 'mute', 'fx', 'forge'];

export class Input {
  constructor(target) {
    this.down = Object.fromEntries(ACTIONS.map((a) => [a, false]));
    this.pressed = Object.fromEntries(ACTIONS.map((a) => [a, false]));
    this.released = Object.fromEntries(ACTIONS.map((a) => [a, false]));
    this.keyState = {};
    this.padState = {};
    this.script = null;
    this.onFirstInteraction = null;
    this._interacted = false;
    // Text-entry capture (Castle Forge proposal screen): while `typing`, raw
    // keydown events go to `onTypeKey(e)` instead of the action map.
    this.typing = false;
    this.onTypeKey = null;

    const noteInteraction = () => {
      if (this._interacted) return;
      this._interacted = true;
      if (this.onFirstInteraction) this.onFirstInteraction();
    };
    window.addEventListener('keydown', (e) => {
      noteInteraction();
      if (this.typing && this.onTypeKey) {
        this.onTypeKey(e);
        if (e.code !== 'F5' && e.code !== 'F12' && !(e.ctrlKey || e.metaKey)) e.preventDefault();
        return;
      }
      if (e.code === 'Escape') this.keyState._escape = true;
      const a = KEYMAP[e.code];
      if (a) {
        this.keyState[a] = true;
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Escape') this.keyState._escape = false;
      const a = KEYMAP[e.code];
      if (a) { this.keyState[a] = false; e.preventDefault(); }
    });
    window.addEventListener('blur', () => { this.keyState = {}; });
    target.addEventListener('pointerdown', () => { target.focus(); noteInteraction(); });
  }

  pollGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = pads && Array.from(pads).find((g) => g && g.connected);
    const s = {};
    if (p) {
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
      s.left = ax < -0.5 || b(14);
      s.right = ax > 0.5 || b(15);
      s.up = ay < -0.5 || b(12);
      s.down = ay > 0.5 || b(13);
      s.jump = b(0) || b(1);
      s.attack = b(2) || b(3) || b(5) || b(7);
      s.start = b(9);
      s.map = b(8);           // Back / View / Select toggles Castle Map
      s.fx = b(10);           // left-stick click toggles shaders
      s.mute = b(11);         // right-stick click toggles mute
      if (Object.values(s).some(Boolean)) {
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
      const now = !!(this.keyState[a] || this.padState[a] || (scripted && scripted[a]));
      this.pressed[a] = now && !this.down[a];
      this.released[a] = !now && this.down[a];
      this.down[a] = now;
    }
    const escNow = !!this.keyState._escape;
    this.pressed.escape = escNow && !this._escapeDown;
    this._escapeDown = escNow;
  }

  /** True if any action was pressed this frame. */
  get anyPressed() { return ACTIONS.some((a) => this.pressed[a]); }

  get axis() { return (this.down.right ? 1 : 0) - (this.down.left ? 1 : 0); }
}
