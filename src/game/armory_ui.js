// Dual-Hand Equipment Matrix, Tactical Soul Glyphs, Bestiary, 4-Slot Saves & Settings:
// - `WeaponPedestal`: physical gothic stone altar holding each stage's signature weapon
// - `ArmoryScreen`: 6-Item Gothic Grimoire (`START` / `E` / `I` / `B` / Touch `GEAR`):
//     1. ARMORY: Ambidextrous Hand_L & Hand_R sockets, Dual Loadout A/B swap (`R`),
//        Stat Deficit Gate math, Shield Rod Sacred Call & Set Resonance
//     2. SOULS: Crimson Bullet, Cobalt Guardian & Amber Enchant Soul Glyphs (`Lv 1..9`)
//     3. BESTIARY: Monster Compendium with kill counts, weaknesses, weapon & soul drops
//     4. SAVE: 4 Independent Chronicle Save Slots (Save, Load, Clear, Save & Exit)
//     5. SETTINGS: Audio, Shaders, Callsign, Debug Unlocks, Reset & Exit to Main Menu
//     6. MAIN MENU: Top-bar Exit to Main Menu item (1-click exit or Save & Exit).

import { W, H } from '../engine/constants.js';
import { getFxLayers } from '../engine/fxlayers.js';
import { rectsOverlap } from './objects.js';
import {
  WEAPONS, WEAPON_ORDER, WEAPON_CATEGORIES, ELEMENT_META, PHYSICAL_META,
  SET_RESONANCES, computeStrengthBreakdown, computeWeaponHit, xpForNextLevel,
  getWeaponIconCanvas, resolvePairResonance,
} from './weapons.js';
import {
  SOUL_GLYPHS, SOUL_ORDER, SOUL_TYPES, SOUL_MAX_RANK, BESTIARY_ORDER, BESTIARY_META,
  getEnemyDisplayInfo,
} from './souls.js';
import { formatCompactExp } from './progression.js';
import { STAGES } from './stages.js';

const TABS = ['armory', 'souls', 'bestiary', 'save', 'settings', 'exit'];
const SAVE_SLOTS_N = 4;

const ARMORY_SETTINGS_ROWS = [
  {
    id: 'exitHome',
    label: 'EXIT TO MAIN MENU',
    sub: 'BACK TO START SCREEN',
    title: 'EXIT TO MAIN MENU',
    desc: 'LEAVE THE CURRENT HUNT AND RETURN TO THE MAIN MENU START SCREEN. YOUR SAVED CHRONICLE SLOTS ARE PRESERVED.',
  },
  {
    id: 'openSave',
    label: 'SAVE GAME (4 SLOTS)',
    sub: 'SAVE OR LOAD SLOT 1-4',
    title: 'CHRONICLE SAVE SLOTS (1-4)',
    desc: 'OPEN THE 4-SLOT CHRONICLE SAVE MANAGER TO RECORD YOUR CURRENT HUNT, LOAD ANOTHER SAVE SLOT, OR CLEAR A SLOT.',
  },
  {
    id: 'mute',
    label: 'SOUND & MUSIC',
    sub: 'SCORE, VOICE & SFX',
    title: 'SYMPHONIC AUDIO & VOICE',
    desc: 'TOGGLE SYMPHONIC STAGE & BOSS MUSIC, SPOKEN GUARDIAN VOICE LINES, AND COMBAT SOUND EFFECTS (SHORTCUT: KEY N OR R3).',
  },
  {
    id: 'postfx',
    label: 'POST-FX SHADERS',
    sub: 'BLOOM & CRT LIGHTING',
    title: '2.5D SHADERS & LIGHTING',
    desc: 'TOGGLE DYNAMIC WEBGL TORCHLIGHT, ELEMENTAL GLOW LAYERS, LIGHTNING BLOOM, AND CRT SCANLINES (SHORTCUT: KEY F OR L3).',
  },
  {
    id: 'callsign',
    label: 'HUNTER CALLSIGN',
    sub: 'CO-OP REALM IDENTITY',
    title: 'MULTIPLAYER CALLSIGN',
    desc: 'CHANGE THE CALLSIGN DISPLAYED ABOVE YOUR HUNTER IN THE SHARED CASTLE REALM AND ON CO-OP BANNERS.',
  },
  {
    id: 'unlockAreas',
    label: 'UNLOCK ALL AREAS',
    sub: 'DEBUG GATEWAYS & MAP',
    title: 'DEBUG: UNLOCK ALL AREAS',
    desc: 'OPEN EVERY GUARDIAN PASSAGE GATEWAY AND CHART ALL CASTLE MAP WAYSTONES FOR FREE EXPLORATION AND TESTING.',
  },
  {
    id: 'unlockBosses',
    label: 'UNLOCK ALL BOSSES',
    sub: 'DEBUG THRONE & SEALS',
    title: 'DEBUG: UNLOCK ALL BOSSES',
    desc: 'UNSEAL EVERY GUARDIAN BOSS DOOR AND OPEN THE SOVEREIGN THRONE ROOM WITHOUT FELLING ALL GUARDIANS FIRST.',
  },
  {
    id: 'resetProgress',
    label: 'RESET PROGRESS',
    sub: 'ERASE SAVE & ARSENAL',
    title: 'RESET ALL PROGRESS',
    desc: 'ERASES SAVED CHECKPOINTS, CLEARED BOSSES, VESSELS, LEVEL, ARSENAL, AND SOULS, THEN RETURNS TO THE HOME SCREEN.',
  },
];

export class WeaponPedestal {
  constructor(weaponId, x, y) {
    this.weaponId = weaponId;
    this.x = x;
    this.y = y;
    this.near = false;
  }

  get weapon() { return WEAPONS[this.weaponId] || null; }
  get box() { return { x: this.x - 18, y: this.y - 68, w: 36, h: 68 }; }

  isCollected(world) {
    return !!(world && world.game && world.game.hasWeapon && world.game.hasWeapon(this.weaponId));
  }

  update(player, world) {
    if (!this.weapon || !player) return;
    const dx = Math.abs(player.x - this.x);
    const dy = Math.abs(player.y - this.y);
    this.near = dx < 54 && dy < 56;
    if (!this.isCollected(world) && rectsOverlap(this.box, player.box())) {
      world.onWeaponCollected(this.weaponId, this.x, this.y - 44, true);
    }
  }

  draw(ctx, cam, font, world, time) {
    const w = this.weapon;
    if (!w) return;
    const sx = Math.round(this.x - cam.rx);
    const sy = Math.round(this.y - cam.ry);
    if (sx < -64 || sx > W + 64 || sy < -40 || sy > H + 84) return;

    const taken = this.isCollected(world);
    const pulse = 0.5 + 0.5 * Math.sin(time * 4.2 + this.x * 0.02);
    const elem = w.element ? ELEMENT_META[w.element] : null;
    const accent = elem ? elem.color : (w.trimColor || '#ffd27a');
    const assets = world && world.assets;
    const hasShrineSprite = !!(assets && assets.frame && assets.frame('shrines', 'vessel_empty'));
    const plinthTopY = hasShrineSprite ? (sy - 46) : (sy - 28);

    ctx.save();

    ctx.fillStyle = 'rgba(4, 3, 10, 0.58)';
    ctx.fillRect(sx - 24, sy - 2, 48, 4);
    ctx.fillStyle = '#1b1826';
    ctx.fillRect(sx - 22, sy - 4, 44, 4);
    ctx.fillStyle = '#342e46';
    ctx.fillRect(sx - 20, sy - 5, 40, 1);

    if (hasShrineSprite) {
      assets.draw(ctx, 'shrines', 'vessel_empty', sx, sy);
    } else {
      ctx.fillStyle = '#262238';
      ctx.fillRect(sx - 16, sy - 28, 32, 26);
      ctx.fillStyle = '#3e3856';
      ctx.fillRect(sx - 18, sy - 30, 36, 4);
      ctx.fillRect(sx - 18, sy - 6, 36, 4);
      ctx.fillStyle = '#6e1d30';
      ctx.fillRect(sx - 8, sy - 26, 16, 18);
    }

    ctx.fillStyle = '#181424';
    ctx.fillRect(sx - 15, plinthTopY - 3, 30, 3);
    ctx.fillStyle = taken ? '#7a6848' : '#d8b25c';
    ctx.fillRect(sx - 13, plinthTopY - 2, 26, 1);
    ctx.fillStyle = '#2d293e';
    ctx.fillRect(sx - 14, plinthTopY - 9, 3, 7);
    ctx.fillRect(sx + 11, plinthTopY - 9, 3, 7);
    ctx.fillRect(sx - 16, plinthTopY - 11, 3, 3);
    ctx.fillRect(sx + 13, plinthTopY - 11, 3, 3);
    ctx.fillStyle = accent;
    ctx.globalAlpha = taken ? 0.55 : (0.75 + 0.25 * pulse);
    ctx.fillRect(sx - 15, plinthTopY - 11, 2, 2);
    ctx.fillRect(sx + 13, plinthTopY - 11, 2, 2);
    ctx.fillRect(sx - 4, sy - 24, 8, 2);
    ctx.globalAlpha = 1;

    for (const cxOff of [-17, 16]) {
      ctx.fillStyle = '#e8dcc0';
      ctx.fillRect(sx + cxOff, plinthTopY - 5, 2, 4);
      ctx.fillStyle = '#ffd27a';
      ctx.fillRect(sx + cxOff, plinthTopY - 7, 2, 2);
    }

    const bob = Math.round(Math.sin(time * 3.4) * (taken ? 1.5 : 3));
    const cy = plinthTopY - 20 + bob;
    const g = ctx.createRadialGradient(sx, cy, 2, sx, cy, taken ? 22 : 32);
    g.addColorStop(0, elem ? `${elem.color}${taken ? '38' : '77'}` : `rgba(255, 218, 128, ${(taken ? 0.18 : (0.38 + 0.16 * pulse)).toFixed(3)})`);
    g.addColorStop(1, 'rgba(12, 10, 24, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(sx - 34, cy - 34, 68, 68);

    const fxl = getFxLayers();
    if (fxl && fxl.enabled) {
      fxl.addAttack({
        x: sx, y: cy, rx: taken ? 10 : 15, ry: taken ? 12 : 18,
        dirX: 0, dirY: -1, mode: 0, seed: this.x * 0.013,
        core: elem ? elem.core : [1.0, 0.96, 0.80],
        rim: elem ? elem.rim : [0.92, 0.72, 0.30],
        alpha: taken ? (0.24 + 0.08 * pulse) : (0.54 + 0.18 * pulse),
      });
      fxl.addFlame(sx - 16, plinthTopY - 6, 4, 7, [1.0, 0.68, 0.22], this.x * 0.019);
      fxl.addFlame(sx + 17, plinthTopY - 6, 4, 7, [1.0, 0.68, 0.22], this.x * 0.019 + 1.3);
    }

    const icon = getWeaponIconCanvas(w.id, 'relic');
    if (icon) {
      ctx.save();
      ctx.globalAlpha = taken ? (0.62 + 0.14 * pulse) : 1.0;
      ctx.drawImage(icon, Math.round(sx - icon.width * 0.5), Math.round(cy - icon.height * 0.5));
      ctx.restore();
    } else {
      ctx.fillStyle = accent;
      ctx.fillRect(sx - 5, cy - 5, 10, 10);
    }

    ctx.restore();
  }

  drawPrompt(ctx, cam, font, world, time = 0) {
    const w = this.weapon;
    if (!w || !this.near) return;
    const sx = Math.round(this.x - cam.rx);
    const sy = Math.round(this.y - cam.ry);
    if (sx < -64 || sx > W + 64 || sy < -40 || sy > H + 84) return;
    const taken = this.isCollected(world);
    const elem = w.element ? ELEMENT_META[w.element] : null;
    const accent = elem ? elem.color : (w.trimColor || '#ffd27a');
    const bob = Math.round(Math.sin(time * 3.4) * (taken ? 1.5 : 3));
    const cy = sy - 66 + bob;
    const isPad = !!(world && world.game && world.game.input && world.game.input.isGamepad);
    const tag = taken ? `${w.name} · PRESS ${isPad ? 'START' : 'E'} FOR ARMORY` : `CLAIM ${w.name}`;
    const lw = font.width(tag, 1, 1, false) + 12;
    const lx = Math.max(6, Math.min(W - lw - 6, Math.round(sx - lw * 0.5)));
    const ly = Math.max(46, cy - 26);
    ctx.save();
    ctx.fillStyle = 'rgba(6, 5, 16, 0.94)';
    ctx.fillRect(lx, ly, lw, 13);
    ctx.strokeStyle = accent;
    ctx.strokeRect(lx + 0.5, ly + 0.5, lw - 1, 12);
    font.draw(ctx, tag, lx + Math.round(lw * 0.5), ly + 3, {
      align: 'center', color: '#f6f0de', shadow: '#05040a', gothic: false,
    });
    ctx.restore();
  }
}

export class ArmoryScreen {
  constructor(game) {
    this.game = game;
    this.tab = 'armory';
    this.cursor = 0;
    this.scroll = 0;
    this.soulCursor = 0;
    this.soulScroll = 0;
    this.bestiaryCursor = 0;
    this.bestiaryScroll = 0;
    this.saveCursor = 0;
    this.confirmClearSlot = false;
    this.exitCursor = 0;
    this.settingsCursor = 0;
    this.confirmReset = false;
    this.returnState = 'play';
    this.flashMsg = '';
    this.flashT = 0;
  }

  open(returnState = 'play', initialTab = 'armory') {
    this.returnState = returnState === 'armory' ? 'play' : returnState;
    this.tab = TABS.includes(initialTab) ? initialTab : 'armory';
    const list = this.ownedList();
    const curL = this.game.handL;
    const idx = list.indexOf(curL);
    this.cursor = idx >= 0 ? idx : 0;
    this.ensureVisible(list.length);
    this.saveCursor = Math.max(0, Math.min(SAVE_SLOTS_N - 1, this.game.activeSaveSlot || 0));
    this.confirmClearSlot = false;
    this.exitCursor = 0;
    this.confirmReset = false;
    this.flashT = 0;
  }

  ownedList() {
    const owned = this.game.ownedWeapons || new Set(['hunters_lash']);
    const out = WEAPON_ORDER.filter((id) => owned.has(id));
    return out.length ? out : ['hunters_lash'];
  }

  ownedSoulList() {
    const ranks = this.game.soulRanks || {};
    const owned = SOUL_ORDER.filter((id) => (ranks[id] || 0) > 0);
    return owned.length ? owned : SOUL_ORDER;
  }

  ensureVisible(total) {
    const rows = 9;
    if (this.cursor < this.scroll) this.scroll = this.cursor;
    if (this.cursor >= this.scroll + rows) this.scroll = this.cursor - rows + 1;
    this.scroll = Math.max(0, Math.min(Math.max(0, total - rows), this.scroll));
  }

  ensureSoulVisible(total) {
    const rows = 9;
    if (this.soulCursor < this.soulScroll) this.soulScroll = this.soulCursor;
    if (this.soulCursor >= this.soulScroll + rows) this.soulScroll = this.soulCursor - rows + 1;
    this.soulScroll = Math.max(0, Math.min(Math.max(0, total - rows), this.soulScroll));
  }

  ensureBestiaryVisible(total) {
    const rows = 10;
    if (this.bestiaryCursor < this.bestiaryScroll) this.bestiaryScroll = this.bestiaryCursor;
    if (this.bestiaryCursor >= this.bestiaryScroll + rows) this.bestiaryScroll = this.bestiaryCursor - rows + 1;
    this.bestiaryScroll = Math.max(0, Math.min(Math.max(0, total - rows), this.bestiaryScroll));
  }

  toast(msg) {
    this.flashMsg = msg;
    this.flashT = 1.8;
  }

  update(dt, inp) {
    this.flashT = Math.max(0, this.flashT - dt);
    const onActionTab = this.tab === 'settings' || this.tab === 'save' || this.tab === 'exit';
    const kbdEnterOnActionTab = onActionTab && inp.pressed.start && !inp.pressed.escape && !inp.isGamepad;
    if (
      !kbdEnterOnActionTab
      && (inp.pressed.armory || inp.pressed.escape || inp.pressed.start || inp.pressed.sprint || (this.tab === 'bestiary' && inp.pressed.bestiary))
    ) {
      this.confirmReset = false;
      this.confirmClearSlot = false;
      this.game.setState(this.returnState || 'play');
      this.game.audio.sfx('pause');
      return;
    }
    if (inp.pressed.bestiary && this.tab !== 'bestiary') {
      this.confirmReset = false;
      this.confirmClearSlot = false;
      this.tab = 'bestiary';
      this.game.audio.sfx('select');
      if (this.game.touch && this.game.touch.active) this.game.touch.syncUI(true);
      return;
    }
    if (inp.pressed.map && this.game.world) {
      this.confirmReset = false;
      this.confirmClearSlot = false;
      this.game.openMap();
      return;
    }
    if (inp.pressed.swap && this.game.swapLoadout) {
      this.game.swapLoadout(this.game.world);
      this.toast(`SWITCHED TO ${this.game.activeLoadout === 0 ? 'LOADOUT SET A' : 'LOADOUT SET B'}`);
      return;
    }
    // Left / Right switch between ARMORY · SOULS · BESTIARY · SAVE · SETTINGS · MAIN MENU
    if (inp.pressed.left) {
      this.confirmReset = false;
      this.confirmClearSlot = false;
      const ti = (TABS.indexOf(this.tab) + TABS.length - 1) % TABS.length;
      this.tab = TABS[ti];
      if (this.tab === 'exit') this.exitCursor = 0;
      this.game.audio.sfx('bone');
      if (this.game.touch && this.game.touch.active) this.game.touch.syncUI(true);
      return;
    }
    if (inp.pressed.right) {
      this.confirmReset = false;
      this.confirmClearSlot = false;
      const ti = (TABS.indexOf(this.tab) + 1) % TABS.length;
      this.tab = TABS[ti];
      if (this.tab === 'exit') this.exitCursor = 0;
      this.game.audio.sfx('bone');
      if (this.game.touch && this.game.touch.active) this.game.touch.syncUI(true);
      return;
    }

    if (this.tab === 'exit') {
      if (inp.pressed.up) {
        this.exitCursor = (this.exitCursor + 2) % 3;
        this.game.audio.sfx('bone');
      } else if (inp.pressed.down) {
        this.exitCursor = (this.exitCursor + 1) % 3;
        this.game.audio.sfx('bone');
      } else if (kbdEnterOnActionTab || inp.pressed.jump || inp.pressed.attack || inp.pressed.offhand) {
        this._activateExitOption(this.exitCursor);
      }
      return;
    }

    if (this.tab === 'save') {
      if (inp.pressed.up) {
        this.saveCursor = (this.saveCursor + SAVE_SLOTS_N - 1) % SAVE_SLOTS_N;
        this.confirmClearSlot = false;
        this.game.audio.sfx('bone');
      } else if (inp.pressed.down) {
        this.saveCursor = (this.saveCursor + 1) % SAVE_SLOTS_N;
        this.confirmClearSlot = false;
        this.game.audio.sfx('bone');
      } else if (kbdEnterOnActionTab || inp.pressed.jump || inp.pressed.attack) {
        this._saveIntoSlot(this.saveCursor);
      } else if (inp.pressed.offhand) {
        this._loadSlot(this.saveCursor);
      } else if (inp.pressed.dash) {
        this._clearSlot(this.saveCursor);
      }
      return;
    }

    if (this.tab === 'settings') {
      const sn = ARMORY_SETTINGS_ROWS.length;
      if (inp.pressed.up) {
        this.settingsCursor = (this.settingsCursor + sn - 1) % sn;
        this.confirmReset = false;
        this.game.audio.sfx('bone');
      } else if (inp.pressed.down) {
        this.settingsCursor = (this.settingsCursor + 1) % sn;
        this.confirmReset = false;
        this.game.audio.sfx('bone');
      } else if (kbdEnterOnActionTab || inp.pressed.jump || inp.pressed.attack || inp.pressed.offhand) {
        this._activateSettingsRow(this.settingsCursor, false);
      }
      return;
    }

    if (this.tab === 'souls') {
      const sList = this.ownedSoulList();
      const sn = sList.length;
      if (inp.pressed.up) {
        this.soulCursor = (this.soulCursor + sn - 1) % sn;
        this.ensureSoulVisible(sn);
        this.game.audio.sfx('bone');
      } else if (inp.pressed.down) {
        this.soulCursor = (this.soulCursor + 1) % sn;
        this.ensureSoulVisible(sn);
        this.game.audio.sfx('bone');
      } else if (inp.pressed.attack || inp.pressed.jump || inp.pressed.offhand) {
        const sid = sList[this.soulCursor];
        if (sid && (this.game.soulRanks[sid] || 0) > 0) {
          this.game.equipSoul(sid);
          const g = SOUL_GLYPHS[sid];
          const active = this.game.equippedSouls[g.type] === sid;
          this.toast(active ? `ATTUNED: ${g.name}` : `UNBOUND: ${g.name}`);
          this.game.audio.sfx('select');
        } else {
          this.toast('DEFEAT MONSTERS TO ABSORB THIS SOUL GLYPH!');
          this.game.audio.sfx('block');
        }
      }
      return;
    }

    if (this.tab === 'bestiary') {
      const bn = BESTIARY_ORDER.length;
      if (inp.pressed.up) {
        this.bestiaryCursor = (this.bestiaryCursor + bn - 1) % bn;
        this.ensureBestiaryVisible(bn);
        this.game.audio.sfx('bone');
      } else if (inp.pressed.down) {
        this.bestiaryCursor = (this.bestiaryCursor + 1) % bn;
        this.ensureBestiaryVisible(bn);
        this.game.audio.sfx('bone');
      }
      return;
    }

    const list = this.ownedList();
    const n = list.length;
    if (inp.pressed.up) {
      this.cursor = (this.cursor + n - 1) % n;
      this.ensureVisible(n);
      this.game.audio.sfx('bone');
    } else if (inp.pressed.down) {
      this.cursor = (this.cursor + 1) % n;
      this.ensureVisible(n);
      this.game.audio.sfx('bone');
    }

    const selId = list[this.cursor];
    if (!selId) return;

    if (inp.pressed.attack) {
      this.equipSlot(0, selId);
    } else if (inp.pressed.offhand || inp.pressed.jump) {
      this.equipSlot(1, selId);
    }
  }

  equipSlot(slot, weaponId) {
    const w = WEAPONS[weaponId];
    if (!w) return;
    if (slot === 1 && w.isTwoHanded) {
      this.game.equipWeapon(0, weaponId);
      this.toast(`${w.short} EQUIPPED (2H LOCKS R-HAND)`);
      this.game.audio.sfx('select');
      return;
    }
    if (slot === 1 && this.game.handR === weaponId && !w.isTwoHanded) {
      this.game.equipWeapon(1, null);
      this.toast('HAND R CLEARED');
      this.game.audio.sfx('bone');
      return;
    }
    this.game.equipWeapon(slot, weaponId);
    const res = this.game.getActiveResonance();
    if (res) {
      this.toast(`✦ RESONANCE READY: ${res.name}`);
    } else {
      this.toast(`${slot === 0 ? 'HAND L' : 'HAND R'} · ${w.name}`);
    }
    this.game.audio.sfx('select');
  }

  _setTab(nextTab) {
    if (!TABS.includes(nextTab)) return;
    this.confirmReset = false;
    this.confirmClearSlot = false;
    if (nextTab === 'exit') this.exitCursor = 0;
    this.tab = nextTab;
    this.game.audio.sfx('bone');
    if (this.game.touch && this.game.touch.active) this.game.touch.syncUI(true);
  }

  _saveIntoSlot(slotIdx, andExit = false) {
    const g = this.game;
    this.confirmClearSlot = false;
    const idx = Math.max(0, Math.min(SAVE_SLOTS_N - 1, slotIdx | 0));
    this.saveCursor = idx;
    if (g.saveToSlot) {
      g.saveToSlot(idx, {
        spawnKind: 'manual_pos',
        reason: 'GRIMOIRE SAVE',
        world: g.world,
        manual: true,
        silentToast: false,
      });
    }
    const disc = g.getCastleDiscoveryStats ? g.getCastleDiscoveryStats().label : '';
    this.toast(`SAVED TO SLOT ${idx + 1}${disc ? ` · CASTLE ${disc}` : ''}`);
    g.audio.sfx('orb');
    if (andExit) {
      g.returnToTitle();
    }
  }

  _loadSlot(slotIdx) {
    const g = this.game;
    this.confirmClearSlot = false;
    const idx = Math.max(0, Math.min(SAVE_SLOTS_N - 1, slotIdx | 0));
    this.saveCursor = idx;
    const hasSlot = !!(g.saveSlots && g.saveSlots[idx]);
    if (!hasSlot) {
      this.toast(`SLOT ${idx + 1} IS EMPTY · PRESS SAVE FIRST`);
      g.audio.sfx('block');
      return;
    }
    if (g.loadFromSaveSlot) {
      g.loadFromSaveSlot(idx);
    }
  }

  _clearSlot(slotIdx) {
    const g = this.game;
    const idx = Math.max(0, Math.min(SAVE_SLOTS_N - 1, slotIdx | 0));
    this.saveCursor = idx;
    const hasSlot = !!(g.saveSlots && g.saveSlots[idx]);
    if (!hasSlot) {
      this.confirmClearSlot = false;
      this.toast(`SLOT ${idx + 1} IS ALREADY EMPTY`);
      g.audio.sfx('bone');
      return;
    }
    if (!this.confirmClearSlot) {
      this.confirmClearSlot = true;
      this.toast(`PRESS CLEAR AGAIN TO ERASE SLOT ${idx + 1}`);
      g.audio.sfx('block');
      return;
    }
    this.confirmClearSlot = false;
    if (g.clearSaveSlot) g.clearSaveSlot(idx);
    this.toast(`SLOT ${idx + 1} CLEARED`);
    g.audio.sfx('orb');
  }

  _activateExitOption(idx) {
    const g = this.game;
    if (idx === 0) {
      g.returnToTitle();
    } else if (idx === 1) {
      const slot = Math.max(0, Math.min(SAVE_SLOTS_N - 1, g.activeSaveSlot || 0));
      this._saveIntoSlot(slot, true);
    } else {
      g.setState(this.returnState || 'play');
      g.audio.sfx('pause');
    }
  }

  _activateSettingsRow(idx, fromPointer = false) {
    const row = ARMORY_SETTINGS_ROWS[idx];
    if (!row) return;
    const g = this.game;
    this.settingsCursor = idx;
    switch (row.id) {
      case 'exitHome':
        this.confirmReset = false;
        g.returnToTitle();
        break;
      case 'openSave':
        this.confirmReset = false;
        this._setTab('save');
        break;
      case 'mute': {
        this.confirmReset = false;
        const muted = g.audio.toggleMute();
        this.toast(muted ? 'AUDIO MUTED' : 'SYMPHONIC AUDIO & VOICE ON');
        if (!muted) g.audio.sfx('select');
        if (g.touch && g.touch.active) g.touch.syncUI(true);
        break;
      }
      case 'postfx': {
        this.confirmReset = false;
        const on = g.postfx.toggle();
        const fl = getFxLayers();
        if (fl) fl.setEnabled(on);
        this.toast(on ? '2.5D SHADERS & LIGHTING ON' : '2.5D SHADERS OFF');
        g.audio.sfx(on ? 'select' : 'bone');
        if (g.touch && g.touch.active) g.touch.syncUI(true);
        break;
      }
      case 'callsign':
        this.confirmReset = false;
        g.openCallsignEditor();
        if (fromPointer && g.touch && g.touch.active) g.touch.focusTextProxy();
        break;
      case 'unlockAreas':
      case 'unlockBosses': {
        this.confirmReset = false;
        const on = !(g.debug && g.debug[row.id]);
        g.setDebugFlag(row.id, on);
        this.toast(`${row.label} ${on ? 'ENABLED' : 'DISABLED'}`);
        g.audio.sfx(on ? 'select' : 'bone');
        break;
      }
      case 'resetProgress':
        if (!this.confirmReset) {
          this.confirmReset = true;
          this.toast('PRESS AGAIN TO ERASE ALL PROGRESS & RETURN HOME');
          g.audio.sfx('block');
          return;
        }
        this.confirmReset = false;
        g.resetProgress();
        g.audio.sfx('orb');
        g.returnToTitle();
        break;
      default:
        break;
    }
  }

  handlePoint(gx, gy) {
    // Top header bar items (`y < 32`)
    if (gy < 32) {
      if (gx >= 6 && gx < 56) { this._setTab('armory'); return true; }
      if (gx >= 56 && gx < 100) { this._setTab('souls'); return true; }
      if (gx >= 100 && gx < 162) { this._setTab('bestiary'); return true; }
      if (gx >= 162 && gx < 202) { this._setTab('save'); return true; }
      if (gx >= 202 && gx < 264) { this._setTab('settings'); return true; }
      // Clicking/tapping MAIN MENU in the top bar exits directly to the Main Menu!
      if (gx >= 264 && gx < 333) {
        this.confirmReset = false;
        this.confirmClearSlot = false;
        this.game.returnToTitle();
        return true;
      }
      if (gx >= 335 && gx < 410 && this.game.swapLoadout) {
        this.game.swapLoadout(this.game.world);
        this.toast(`SWITCHED TO ${this.game.activeLoadout === 0 ? 'LOADOUT SET A' : 'LOADOUT SET B'}`);
        return true;
      }
      if (gx > 470) {
        this.confirmReset = false;
        this.confirmClearSlot = false;
        this.game.setState(this.returnState || 'play');
        this.game.audio.sfx('pause');
        return true;
      }
    }
    if (gy > 328 && gx > 470) {
      this.confirmReset = false;
      this.confirmClearSlot = false;
      this.game.setState(this.returnState || 'play');
      this.game.audio.sfx('pause');
      return true;
    }
    if (this.tab === 'exit') {
      if (gx >= 140 && gx <= 500 && gy >= 110 && gy < 278) {
        const idx = Math.floor((gy - 110) / 56);
        if (idx >= 0 && idx < 3) {
          this.exitCursor = idx;
          this._activateExitOption(idx);
          return true;
        }
      }
      return false;
    }
    if (this.tab === 'save') {
      // Left panel: 4 Chronicle Save Slot Cards (`16..246, 42..318`)
      if (gx >= 16 && gx <= 246 && gy >= 42 && gy < 318) {
        const idx = Math.floor((gy - 42) / 69);
        if (idx >= 0 && idx < SAVE_SLOTS_N) {
          this.saveCursor = idx;
          this.confirmClearSlot = false;
          this.game.audio.sfx('bone');
          return true;
        }
      }
      // Right panel action buttons (`266..612, 244..310`)
      if (gy >= 244 && gy <= 272) {
        if (gx >= 266 && gx <= 434) { this._saveIntoSlot(this.saveCursor, false); return true; }
        if (gx >= 444 && gx <= 612) { this._loadSlot(this.saveCursor); return true; }
      }
      if (gy >= 278 && gy <= 306) {
        if (gx >= 266 && gx <= 434) { this._clearSlot(this.saveCursor); return true; }
        if (gx >= 444 && gx <= 612) { this._saveIntoSlot(this.saveCursor, true); return true; }
      }
      return false;
    }
    if (this.tab === 'settings') {
      if (gx >= 16 && gx <= 246 && gy >= 42 && gy < 42 + ARMORY_SETTINGS_ROWS.length * 34) {
        const idx = Math.floor((gy - 42) / 34);
        if (idx >= 0 && idx < ARMORY_SETTINGS_ROWS.length) {
          if (ARMORY_SETTINGS_ROWS[idx].id === 'resetProgress' && this.settingsCursor !== idx) {
            this.settingsCursor = idx;
            this.confirmReset = false;
            this.game.audio.sfx('bone');
          } else {
            this._activateSettingsRow(idx, true);
          }
          return true;
        }
      }
      // Bottom action buttons in right-hand settings card: [RESUME HUNT] and [EXIT TO START]
      if (gy >= 280 && gy <= 312) {
        if (gx >= 266 && gx <= 434) {
          this.confirmReset = false;
          this.game.setState(this.returnState || 'play');
          this.game.audio.sfx('pause');
          return true;
        }
        if (gx >= 444 && gx <= 612) {
          this.confirmReset = false;
          this.game.returnToTitle();
          return true;
        }
      }
      if (gx >= 254 && gx <= 624 && gy >= 42 && gy <= 140) {
        this._activateSettingsRow(this.settingsCursor, true);
        return true;
      }
      return false;
    }
    if (this.tab === 'souls') {
      const sList = this.ownedSoulList();
      if (gx >= 16 && gx <= 246 && gy >= 86 && gy < 311) {
        const idx = this.soulScroll + Math.floor((gy - 86) / 25);
        if (idx >= 0 && idx < sList.length) {
          this.soulCursor = idx;
          const sid = sList[idx];
          if ((this.game.soulRanks[sid] || 0) > 0) this.game.equipSoul(sid);
          this.game.audio.sfx('select');
          return true;
        }
      }
      return false;
    }
    if (this.tab === 'bestiary') {
      if (gx >= 16 && gx <= 246 && gy >= 40 && gy < 320) {
        const idx = this.bestiaryScroll + Math.floor((gy - 42) / 27);
        if (idx >= 0 && idx < BESTIARY_ORDER.length) {
          this.bestiaryCursor = idx;
          this.game.audio.sfx('bone');
          return true;
        }
      }
      return false;
    }
    const list = this.ownedList();
    if (gx >= 16 && gx <= 246 && gy >= 86 && gy < 311) {
      const row = Math.floor((gy - 86) / 25);
      const idx = this.scroll + row;
      if (idx >= 0 && idx < list.length) {
        if (this.cursor !== idx) {
          this.cursor = idx;
          this.game.audio.sfx('bone');
        } else {
          this.equipSlot(0, list[idx]);
        }
        return true;
      }
    }
    const selId = list[this.cursor];
    if (gy >= 34 && gy <= 78 && selId) {
      if (gx >= 16 && gx <= 228) { this.equipSlot(0, selId); return true; }
      if (gx >= 412 && gx <= 624) { this.equipSlot(1, selId); return true; }
    }
    if (gy >= 286 && gy <= 322 && selId) {
      if (gx >= 262 && gx <= 434) { this.equipSlot(0, selId); return true; }
      if (gx >= 442 && gx <= 618) { this.equipSlot(1, selId); return true; }
    }
    return false;
  }

  draw(ctx) {
    const g = this.game;
    const f = g.font;
    const shadow = '#05040a';

    if (g.world) {
      g.world.draw(ctx, { hud: false });
    }
    ctx.save();
    ctx.fillStyle = 'rgba(5, 4, 14, 0.91)';
    ctx.fillRect(0, 0, W, H);

    // Header band + 6 Top Grimoire Items (including SAVE & MAIN MENU) + Set A/B Toggle
    ctx.fillStyle = 'rgba(16, 12, 30, 0.96)';
    ctx.fillRect(0, 0, W, 30);
    ctx.fillStyle = '#6e5838';
    ctx.fillRect(0, 29, W, 1);

    const tabDefs = [
      ['armory', 'ARMORY', 8, 47],
      ['souls', 'SOULS', 58, 41],
      ['bestiary', 'BESTIARY', 102, 59],
      ['save', 'SAVE', 164, 37],
      ['settings', 'SETTINGS', 204, 59],
      ['exit', 'MAIN MENU', 266, 65],
    ];
    for (const [tk, lbl, tx, tw] of tabDefs) {
      const act = this.tab === tk;
      const isExit = tk === 'exit';
      ctx.fillStyle = act
        ? (isExit ? 'rgba(92, 34, 48, 0.96)' : 'rgba(66, 46, 94, 0.96)')
        : (isExit ? 'rgba(34, 16, 28, 0.94)' : 'rgba(18, 14, 34, 0.92)');
      ctx.fillRect(tx, 5, tw, 20);
      ctx.strokeStyle = act ? '#ffd27a' : (isExit ? '#8a4252' : '#42385c');
      ctx.strokeRect(tx + 0.5, 5.5, tw - 1, 19);
      const txtCol = act ? '#ffd27a' : (isExit ? '#ffb89a' : (tk === 'save' ? '#9ef5dc' : '#8a9ab5'));
      f.draw(ctx, lbl, tx + Math.round(tw / 2), 11, {
        align: 'center', color: txtCol, shadow, gothic: false,
      });
    }

    const isPad = !!(g.input && g.input.isGamepad);
    const setIdx = g.activeLoadout ? 1 : 0;
    ctx.fillStyle = 'rgba(20, 28, 38, 0.94)';
    ctx.fillRect(337, 5, 70, 20);
    ctx.strokeStyle = setIdx === 0 ? '#ffd27a' : '#62f2c2';
    ctx.strokeRect(337.5, 5.5, 69, 19);
    f.draw(ctx, `[${isPad ? 'LT' : 'R'}] SET ${setIdx === 0 ? 'A' : 'B'}`, 372, 11, {
      align: 'center', color: setIdx === 0 ? '#ffd27a' : '#62f2c2', shadow, gothic: false,
    });

    const strInfo = computeStrengthBreakdown(g);
    const nextXp = xpForNextLevel(strInfo.level);
    const curXp = g.charExp != null ? g.charExp : 0;
    const xpTxt = nextXp > 0 ? `${formatCompactExp(curXp)}/${formatCompactExp(nextXp)}` : 'MAX';
    f.draw(
      ctx,
      `LV ${String(strInfo.level).padStart(2, '0')} · EXP ${xpTxt} · STR ${String(strInfo.total).padStart(2, '0')}`,
      632,
      11,
      { align: 'right', color: '#9ef5dc', shadow, gothic: false },
    );

    if (this.tab === 'souls') {
      this._drawSoulsTab(ctx, strInfo);
      ctx.restore();
      return;
    }
    if (this.tab === 'bestiary') {
      this._drawBestiaryTab(ctx);
      ctx.restore();
      return;
    }
    if (this.tab === 'save') {
      this._drawSaveTab(ctx);
      ctx.restore();
      return;
    }
    if (this.tab === 'settings') {
      this._drawSettingsTab(ctx);
      ctx.restore();
      return;
    }
    if (this.tab === 'exit') {
      this._drawExitTab(ctx);
      ctx.restore();
      return;
    }

    // -----------------------------------------------------------------
    // TAB 1: ARMORY (Ambidextrous Dual-Slot Sockets + Weapon Inspector)
    // -----------------------------------------------------------------
    const wL = WEAPONS[g.handL] || WEAPONS.hunters_lash;
    const locked2H = !!(wL && wL.isTwoHanded);
    const wR = locked2H ? null : (WEAPONS[g.handR] || null);
    const res = g.getActiveResonance();

    this._drawHandSocket(ctx, 16, 36, 212, 42, isPad ? 'HAND L · [X / RB]' : 'HAND L · [X / K]', wL, strInfo.total, false);
    this._drawHandSocket(ctx, 412, 36, 212, 42, isPad ? 'HAND R · [Y / RT]' : 'HAND R · [C / V / L]', wR, strInfo.total, locked2H);

    const bx = 234, by = 36, bw = 172, bh = 42;
    ctx.fillStyle = res ? 'rgba(34, 24, 46, 0.95)' : 'rgba(12, 10, 22, 0.92)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = res ? res.hex : (locked2H ? '#d9a84e' : '#3a3252');
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    if (locked2H) {
      f.draw(ctx, 'TWO-HANDED GRIP', bx + bw / 2, by + 9, {
        align: 'center', color: '#ffd27a', shadow, gothic: false,
      });
      f.draw(ctx, 'HAND R LOCKED & HIDDEN', bx + bw / 2, by + 23, {
        align: 'center', color: '#9aa8c4', shadow, gothic: false,
      });
    } else if (res) {
      f.draw(ctx, '✦ L+R COMBO RESONANCE', bx + bw / 2, by + 8, {
        align: 'center', color: res.hex, shadow, gothic: false,
      });
      f.draw(ctx, res.name, bx + bw / 2, by + 22, {
        align: 'center', color: '#f6f0de', shadow, gothic: false,
      });
    } else {
      f.draw(ctx, 'CROSS-HAND MATRIX', bx + bw / 2, by + 8, {
        align: 'center', color: '#7e8aa8', shadow, gothic: false,
      });
      f.draw(ctx, 'MATCH SET OR SHIELD ROD', bx + bw / 2, by + 22, {
        align: 'center', color: '#58627a', shadow, gothic: false,
      });
    }

    const list = this.ownedList();
    this.ensureVisible(list.length);
    ctx.fillStyle = 'rgba(10, 8, 22, 0.94)';
    ctx.fillRect(16, 84, 230, 238);
    ctx.strokeStyle = '#3e3556';
    ctx.strokeRect(16.5, 84.5, 229, 237);

    const visibleRows = 9;
    for (let i = 0; i < visibleRows; i++) {
      const idx = this.scroll + i;
      if (idx >= list.length) break;
      const wid = list[idx];
      const w = WEAPONS[wid];
      const ry = 87 + i * 25;
      const selected = idx === this.cursor;
      const inL = g.handL === wid;
      const inR = !locked2H && g.handR === wid;
      const deficit = strInfo.total < w.reqStr;

      if (selected) {
        ctx.fillStyle = 'rgba(64, 46, 88, 0.88)';
        ctx.fillRect(18, ry, 226, 23);
        ctx.strokeStyle = '#ffd27a';
        ctx.strokeRect(18.5, ry + 0.5, 225, 22);
      } else if (i % 2 === 1) {
        ctx.fillStyle = 'rgba(20, 16, 36, 0.55)';
        ctx.fillRect(18, ry, 226, 23);
      }

      const icon = getWeaponIconCanvas(wid);
      if (icon) ctx.drawImage(icon, 22, ry + 2);

      const labelCol = deficit ? '#ffb088' : (selected ? '#ffffff' : '#e8e2c8');
      f.draw(ctx, w.name.slice(0, inL || inR ? 26 : 29), 46, ry + 4, { color: labelCol, shadow, gothic: false });
      const catLbl = WEAPON_CATEGORIES[w.category] ? WEAPON_CATEGORIES[w.category].label : w.category.toUpperCase();
      f.draw(ctx, `${catLbl} · REQ ${w.reqStr}`, 46, ry + 13, {
        color: deficit ? '#ff6e6e' : '#7e8aa8', shadow, gothic: false,
      });

      if (inL || inR) {
        const badge = inL ? (w.isTwoHanded ? '2H' : 'L') : 'R';
        const bCol = inL ? '#ffd27a' : '#62f2c2';
        ctx.fillStyle = '#141024';
        ctx.fillRect(220, ry + 5, 20, 12);
        ctx.strokeStyle = bCol;
        ctx.strokeRect(220.5, ry + 5.5, 19, 11);
        f.draw(ctx, badge, 230, ry + 7, { align: 'center', color: bCol, shadow, gothic: false });
      }
    }

    const selId = list[this.cursor] || 'hunters_lash';
    const sw = WEAPONS[selId] || WEAPONS.hunters_lash;
    const cat = WEAPON_CATEGORIES[sw.category] || WEAPON_CATEGORIES.standard_blade;
    const bloodBonus = sw.bloodScaling ? Math.min(6, (g.bloodBladeStacks || 0) * 0.25) : 0;
    const hitInfo = computeWeaponHit(sw, strInfo.total, null, {
      flatBonus: bloodBonus + (g.world ? ((g.world.hasRelic('jack') ? 1 : 0) + g.world.relicBonus('whip')) : 0),
      diffMult: g.difficulty ? (g.difficulty.playerDamage || 1) : 1,
    });

    const ix = 254, iy = 84, iw = 370, ih = 238;
    ctx.fillStyle = 'rgba(12, 10, 26, 0.96)';
    ctx.fillRect(ix, iy, iw, ih);
    ctx.strokeStyle = '#6e5838';
    ctx.strokeRect(ix + 0.5, iy + 0.5, iw - 1, ih - 1);

    ctx.fillStyle = '#080612';
    ctx.fillRect(ix + 12, iy + 10, 44, 44);
    ctx.strokeStyle = sw.element && ELEMENT_META[sw.element] ? ELEMENT_META[sw.element].color : '#8a9ab5';
    ctx.strokeRect(ix + 12.5, iy + 10.5, 43, 43);
    const bigIcon = getWeaponIconCanvas(sw.id, 'relic');
    if (bigIcon) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(bigIcon, ix + 16, iy + 14, 36, 36);
      ctx.restore();
    }

    f.draw(ctx, sw.name, ix + 64, iy + 12, {
      scale: 2, gothic: false, color: '#f6f0de', shadow,
    });
    f.draw(
      ctx,
      `${cat.label} · ${sw.isTwoHanded ? '2 HANDS' : '1 HAND'} · ${cat.movement}`,
      ix + 64,
      iy + 32,
      { color: '#9eb0d0', shadow, gothic: false },
    );
    const descLine = f.wrap(sw.desc, iw - 72, 1, 1, false)[0] || sw.desc;
    f.draw(ctx, descLine, ix + 64, iy + 44, { color: '#c9c3b0', shadow, gothic: false });

    let chipX = ix + 12;
    const chipY = iy + 62;
    const phys = PHYSICAL_META[sw.physical] || PHYSICAL_META.cut;
    chipX = this._drawChip(ctx, chipX, chipY, `PHYS: ${phys.label}`, phys.color);
    if (sw.element && ELEMENT_META[sw.element]) {
      const el = ELEMENT_META[sw.element];
      chipX = this._drawChip(ctx, chipX, chipY, `ELEM: ${el.label}`, el.color);
    } else {
      chipX = this._drawChip(ctx, chipX, chipY, 'ELEM: NONE', '#6e7890');
    }
    if (sw.bloodScaling) {
      chipX = this._drawChip(ctx, chipX, chipY, `BLOOD +${bloodBonus.toFixed(1)}`, '#ff4868');
    } else if (sw.armorPiercing) {
      chipX = this._drawChip(ctx, chipX, chipY, 'PIERCES GUARD', '#ffd27a');
    }
    this._drawChip(ctx, chipX, chipY, `SET: ${(sw.setTag || 'NONE').toUpperCase()}`, '#b8a8ff');

    const sx0 = ix + 12, sy0 = iy + 82, sw0 = iw - 24, sh0 = 52;
    ctx.fillStyle = hitInfo.deficit ? 'rgba(54, 16, 24, 0.86)' : 'rgba(16, 30, 28, 0.78)';
    ctx.fillRect(sx0, sy0, sw0, sh0);
    ctx.strokeStyle = hitInfo.deficit ? '#ff5a6e' : '#4ec9a0';
    ctx.strokeRect(sx0 + 0.5, sy0 + 0.5, sw0 - 1, sh0 - 1);

    const gateText = hitInfo.deficit
      ? `! STAT DEFICIT GATE: 0.5X SCALING (STR ${strInfo.total} < REQ ${sw.reqStr})`
      : `✓ STAT EFFICIENCY: 1.0X FULL SCALING (STR ${strInfo.total} >= REQ ${sw.reqStr})`;
    f.draw(ctx, gateText, sx0 + 8, sy0 + 7, {
      color: hitInfo.deficit ? '#ff8a98' : '#7ef5c8', shadow, gothic: false,
    });
    const formulaText = `DMG ${hitInfo.damage}  =  BASE ${sw.baseDamage.toFixed(1)} + (STR ${strInfo.total} X ${sw.scaling.toFixed(2)} X ${hitInfo.strModifier.toFixed(1)})`;
    f.draw(ctx, formulaText, sx0 + 8, sy0 + 21, { color: '#f4efe0', shadow, gothic: false });
    f.draw(
      ctx,
      `STR: BASE ${strInfo.base} + LV ${strInfo.levelBonus} + RELICS ${strInfo.relicStr} + VESSELS ${strInfo.vesselStr} + SOUL ${strInfo.enchantStr || 0}`,
      sx0 + 8,
      sy0 + 35,
      { color: '#8a9ab5', shadow, gothic: false },
    );

    const cx0 = ix + 12, cy0 = iy + 140, cw0 = iw - 24, ch0 = 56;
    ctx.fillStyle = 'rgba(20, 16, 38, 0.88)';
    ctx.fillRect(cx0, cy0, cw0, ch0);
    ctx.strokeStyle = '#524678';
    ctx.strokeRect(cx0 + 0.5, cy0 + 0.5, cw0 - 1, ch0 - 1);

    if (sw.skill) {
      f.draw(ctx, `COMMAND SKILL [↓ ↘ → + HAND]: ${sw.skill.name}`, cx0 + 8, cy0 + 7, {
        color: '#ffd27a', shadow, gothic: false,
      });
      f.draw(ctx, sw.skill.desc, cx0 + 8, cy0 + 20, { color: '#dce4f5', shadow, gothic: false });
    }
    const setRes = sw.shieldRod
      ? { name: 'SHIELD ROD SACRED CALL (ANY SHIELD)', hex: '#ffe28a' }
      : (sw.setTag ? SET_RESONANCES[sw.setTag] : null);
    if (setRes && !sw.isTwoHanded) {
      f.draw(ctx, `L+R RESONANCE: ${setRes.name}`, cx0 + 8, cy0 + 36, {
        color: setRes.hex, shadow, gothic: false,
      });
    } else if (sw.isTwoHanded) {
      f.draw(ctx, 'TWO-HANDED: MASSIVE ARC · LOCKS OFF-HAND', cx0 + 8, cy0 + 36, {
        color: '#d9b36a', shadow, gothic: false,
      });
    }

    const btnY = iy + 204;
    this._drawActionBtn(ctx, ix + 12, btnY, 168, 24, isPad ? '[X / RB] EQUIP HAND L' : '[X / K] EQUIP HAND L', '#ffd27a', g.handL === sw.id);
    const rKey = isPad ? 'Y / A' : 'C / V';
    const rLabel = sw.isTwoHanded
      ? `[${rKey}] EQUIP 2H GRIP`
      : (g.handR === sw.id ? `[${rKey}] UNEQUIP R` : (isPad ? '[Y / A] EQUIP HAND R' : '[C / V / L] EQUIP HAND R'));
    this._drawActionBtn(ctx, ix + 190, btnY, 168, 24, rLabel, '#62f2c2', !sw.isTwoHanded && g.handR === sw.id);

    const footText = this.flashT > 0
      ? this.flashMsg
      : (isPad
        ? `ARSENAL ${list.length}/${WEAPON_ORDER.length} · ←/→ TABS · LT SWAP SET · X HAND L · Y/A HAND R · START/B CLOSE`
        : `ARSENAL ${list.length}/${WEAPON_ORDER.length} · ←/→ TABS · R SWAP SET · X HAND L · C/V HAND R · START/E CLOSE`);
    f.draw(ctx, footText, W / 2, 336, {
      align: 'center', color: this.flashT > 0 ? '#ffd27a' : '#9aa8c4', shadow, gothic: false,
    });

    ctx.restore();
  }

  _drawSoulsTab(ctx) {
    const g = this.game;
    const f = g.font;
    const shadow = '#05040a';

    // Top 3 Active Soul Glyph Sockets (`CRIMSON BULLET` · `COBALT GUARDIAN` · `AMBER ENCHANT`)
    const cols = [
      ['bullet', '↑+R BULLET', 16, 198],
      ['guardian', 'GUARDIAN WARD', 221, 198],
      ['enchant', 'ENCHANT BOON', 426, 198],
    ];
    for (const [st, title, sx, sw] of cols) {
      const m = SOUL_TYPES[st];
      const sid = g.equippedSouls && g.equippedSouls[st];
      const sg = sid ? SOUL_GLYPHS[sid] : null;
      const rk = sid ? (g.soulRanks[sid] || 1) : 0;
      ctx.fillStyle = 'rgba(14, 12, 28, 0.96)';
      ctx.fillRect(sx, 36, sw, 42);
      ctx.strokeStyle = sg ? m.color : '#3a3452';
      ctx.strokeRect(sx + 0.5, 36.5, sw - 1, 41);
      ctx.fillStyle = m.color;
      ctx.fillRect(sx + 8, 46, 8, 8);
      f.draw(ctx, title, sx + 22, 42, { color: m.color, shadow, gothic: false });
      f.draw(ctx, sg ? `${sg.name} (LV.${rk})` : 'UNATTUNED SOCKET', sx + 22, 56, {
        color: sg ? '#f6f0de' : '#58627a', shadow, gothic: false,
      });
    }

    const sList = this.ownedSoulList();
    this.ensureSoulVisible(sList.length);
    ctx.fillStyle = 'rgba(10, 8, 22, 0.94)';
    ctx.fillRect(16, 84, 230, 238);
    ctx.strokeStyle = '#3e3556';
    ctx.strokeRect(16.5, 84.5, 229, 237);

    for (let i = 0; i < 9; i++) {
      const idx = this.soulScroll + i;
      if (idx >= sList.length) break;
      const sid = sList[idx];
      const sg = SOUL_GLYPHS[sid];
      const m = SOUL_TYPES[sg.type];
      const rk = (g.soulRanks && g.soulRanks[sid]) || 0;
      const eq = g.equippedSouls && g.equippedSouls[sg.type] === sid;
      const ry = 87 + i * 25;
      if (idx === this.soulCursor) {
        ctx.fillStyle = 'rgba(64, 46, 88, 0.88)';
        ctx.fillRect(18, ry, 226, 23);
        ctx.strokeStyle = '#ffd27a';
        ctx.strokeRect(18.5, ry + 0.5, 225, 22);
      }
      ctx.fillStyle = rk > 0 ? m.color : '#38344e';
      ctx.fillRect(24, ry + 7, 8, 8);
      f.draw(ctx, rk > 0 ? sg.name.slice(0, 24) : '??? UNABSORBED SOUL', 38, ry + 4, {
        color: rk > 0 ? '#f6f0de' : '#5e6680', shadow, gothic: false,
      });
      f.draw(ctx, `${m.short} · ${rk > 0 ? `RANK ${rk}/${SOUL_MAX_RANK}` : 'UNFOUND'}`, 38, ry + 13, {
        color: rk > 0 ? m.color : '#4c5268', shadow, gothic: false,
      });
      if (eq) {
        f.draw(ctx, 'ON', 236, ry + 8, { align: 'right', color: '#ffd27a', shadow, gothic: false });
      }
    }

    const selId = sList[this.soulCursor] || SOUL_ORDER[0];
    const selG = SOUL_GLYPHS[selId];
    const selM = SOUL_TYPES[selG.type];
    const selRk = (g.soulRanks && g.soulRanks[selId]) || 0;
    const ix = 254, iy = 84, iw = 370, ih = 238;
    ctx.fillStyle = 'rgba(12, 10, 26, 0.96)';
    ctx.fillRect(ix, iy, iw, ih);
    ctx.strokeStyle = selM.color;
    ctx.strokeRect(ix + 0.5, iy + 0.5, iw - 1, ih - 1);

    f.draw(ctx, selRk > 0 ? selG.name : 'UNABSORBED TACTICAL SOUL', ix + 16, iy + 14, {
      scale: 2, gothic: false, color: selRk > 0 ? '#f6f0de' : '#6e7690', shadow,
    });
    f.draw(ctx, `${selM.label} · POTENCY RANK ${selRk}/${SOUL_MAX_RANK}`, ix + 16, iy + 38, {
      color: selM.color, shadow, gothic: false,
    });
    const lines = f.wrap(selG.desc, iw - 32, 1, 1, false);
    lines.forEach((ln, idx) => f.draw(ctx, ln, ix + 16, iy + 58 + idx * 13, { color: '#dce4f5', shadow, gothic: false }));

    f.draw(ctx, 'HOW TO WIELD SOUL GLYPHS:', ix + 16, iy + 108, { color: '#ffd27a', shadow, gothic: false });
    f.draw(ctx, '· CRIMSON BULLET: PRESS [↑ + R-HAND] (2 HEARTS)', ix + 16, iy + 123, { color: '#ff90a4', shadow, gothic: false });
    f.draw(ctx, '· COBALT GUARDIAN: ACTIVE AUTOMATICALLY IN PLAY', ix + 16, iy + 137, { color: '#8ad8ff', shadow, gothic: false });
    f.draw(ctx, '· AMBER ENCHANT: PASSIVE STAT & CRIT BLESSING', ix + 16, iy + 151, { color: '#ffe08a', shadow, gothic: false });
    f.draw(ctx, '· GLYPH UNION: [↑ + L-HAND + R-HAND] (5 HEARTS)', ix + 16, iy + 165, { color: '#d8b4ff', shadow, gothic: false });

    const isPad = !!(g.input && g.input.isGamepad);
    const ownedCount = SOUL_ORDER.filter((k) => (g.soulRanks[k] || 0) > 0).length;
    const foot = this.flashT > 0
      ? this.flashMsg
      : (isPad
        ? `SOULS ${ownedCount}/${SOUL_ORDER.length} · ←/→ TABS · ↑↓ SELECT · A/X/Y ATTUNE · START/B CLOSE`
        : `SOULS ${ownedCount}/${SOUL_ORDER.length} · ←/→ TABS · ↑↓ SELECT · X/SPACE ATTUNE · START/E CLOSE`);
    f.draw(ctx, foot, W / 2, 336, {
      align: 'center', color: this.flashT > 0 ? '#ffd27a' : '#9aa8c4', shadow, gothic: false,
    });
  }

  _drawBestiaryTab(ctx) {
    const g = this.game;
    const f = g.font;
    const shadow = '#05040a';
    this.ensureBestiaryVisible(BESTIARY_ORDER.length);

    ctx.fillStyle = 'rgba(10, 8, 22, 0.94)';
    ctx.fillRect(16, 38, 230, 284);
    ctx.strokeStyle = '#3e3556';
    ctx.strokeRect(16.5, 38.5, 229, 283);

    for (let i = 0; i < 10; i++) {
      const idx = this.bestiaryScroll + i;
      if (idx >= BESTIARY_ORDER.length) break;
      const key = BESTIARY_ORDER[idx];
      const meta = BESTIARY_META[key] || { name: key.toUpperCase(), stars: 2 };
      const seen = g.bestiarySeen && g.bestiarySeen.has(key);
      const kills = (g.bestiaryKills && g.bestiaryKills[key]) || 0;
      const ry = 41 + i * 27;
      if (idx === this.bestiaryCursor) {
        ctx.fillStyle = 'rgba(64, 46, 88, 0.88)';
        ctx.fillRect(18, ry, 226, 25);
        ctx.strokeStyle = '#ffd27a';
        ctx.strokeRect(18.5, ry + 0.5, 225, 24);
      }
      const num = String(idx + 1).padStart(2, '0');
      f.draw(ctx, `${num}. ${seen ? meta.name.slice(0, 21) : '????????????'}`, 24, ry + 4, {
        color: seen ? (meta.isBoss ? '#ffd27a' : '#f6f0de') : '#545c74', shadow, gothic: false,
      });
      f.draw(ctx, kills > 0 ? `SLAIN ${kills}` : (seen ? 'SIGHTED' : 'UNSEEN'), 24, ry + 14, {
        color: kills > 0 ? '#7ef5c8' : '#68728c', shadow, gothic: false,
      });
    }

    const selKey = BESTIARY_ORDER[this.bestiaryCursor] || BESTIARY_ORDER[0];
    const seen = g.bestiarySeen && g.bestiarySeen.has(selKey);
    const kills = (g.bestiaryKills && g.bestiaryKills[selKey]) || 0;
    const info = getEnemyDisplayInfo({ resistKey: selKey });

    const ix = 254, iy = 38, iw = 370, ih = 284;
    ctx.fillStyle = 'rgba(12, 10, 26, 0.96)';
    ctx.fillRect(ix, iy, iw, ih);
    ctx.strokeStyle = '#6e5838';
    ctx.strokeRect(ix + 0.5, iy + 0.5, iw - 1, ih - 1);

    f.draw(ctx, seen ? info.name : 'UNKNOWN CASTLE ENTITY', ix + 16, iy + 14, {
      scale: 2, gothic: false, color: '#ffd27a', shadow,
    });
    const stars = '*'.repeat(info.stars || 2);
    f.draw(ctx, `RARITY ${stars}  ·  VANQUISHED: ${kills}`, ix + 16, iy + 36, {
      color: '#9ef5dc', shadow, gothic: false,
    });

    const loreLines = f.wrap(seen ? info.lore : 'ENCOUNTER THIS FIEND IN CASTLE NOCTURNE TO RECORD ITS ANATOMY, WEAKNESSES & DROPS.', iw - 32, 1, 1, false);
    loreLines.forEach((ln, li) => f.draw(ctx, ln, ix + 16, iy + 56 + li * 13, { color: '#dce4f5', shadow, gothic: false }));

    const weakStr = kills > 0
      ? (info.weakList.length ? info.weakList.map((w) => `${w.label} (${w.mult.toFixed(1)}X)`).join(' · ') : 'NONE')
      : 'VANQUISH ONCE TO REVEAL';
    const resStr = kills > 0
      ? (info.resistList.length ? info.resistList.map((w) => `${w.label} (${w.mult.toFixed(1)}X)`).join(' · ') : 'NONE')
      : 'VANQUISH ONCE TO REVEAL';

    f.draw(ctx, `WEAKNESSES: ${weakStr}`, ix + 16, iy + 108, { color: '#7ef7d4', shadow, gothic: false });
    f.draw(ctx, `RESISTANCES: ${resStr}`, ix + 16, iy + 124, { color: '#ff9aa8', shadow, gothic: false });

    const dropNames = info.drops.length
      ? info.drops.map((w) => (g.hasWeapon(w.id) ? w.name : '??? ARSENAL')).join(' · ')
      : 'NONE';
    f.draw(ctx, `ARSENAL DROPS: ${dropNames.slice(0, 44)}`, ix + 16, iy + 150, { color: '#ffd27a', shadow, gothic: false });

    const soulStr = info.soul
      ? ((g.soulRanks[info.soul.id] || 0) > 0 ? `${info.soul.name} (LV.${g.soulRanks[info.soul.id]})` : '??? TACTICAL SOUL')
      : 'NONE';
    f.draw(ctx, `SOUL GLYPH: ${soulStr}`, ix + 16, iy + 168, { color: '#c8a8ff', shadow, gothic: false });

    const isPad = !!(g.input && g.input.isGamepad);
    const catalogued = BESTIARY_ORDER.filter((k) => g.bestiarySeen && g.bestiarySeen.has(k)).length;
    f.draw(
      ctx,
      isPad
        ? `CATALOGUED ${catalogued}/${BESTIARY_ORDER.length} FIENDS · ←/→ TABS · ↑↓ BROWSE · START / B CLOSE`
        : `CATALOGUED ${catalogued}/${BESTIARY_ORDER.length} FIENDS · ←/→ TABS · ↑↓ BROWSE · B / E / START CLOSE`,
      W / 2,
      336,
      { align: 'center', color: '#9aa8c4', shadow, gothic: false },
    );
  }

  _drawSaveTab(ctx) {
    const g = this.game;
    const f = g.font;
    const shadow = '#05040a';
    const isPad = !!(g.input && g.input.isGamepad);

    // Left panel: 4 Chronicle Save Slots (`SLOT 1` .. `SLOT 4`)
    ctx.fillStyle = 'rgba(10, 8, 22, 0.94)';
    ctx.fillRect(16, 38, 230, 284);
    ctx.strokeStyle = '#3e3556';
    ctx.strokeRect(16.5, 38.5, 229, 283);

    for (let i = 0; i < SAVE_SLOTS_N; i++) {
      const sum = g.getSlotSummary
        ? g.getSlotSummary(i)
        : { slotIdx: i, slotNum: i + 1, label: `SLOT ${i + 1}`, empty: true, isActive: i === 0 };
      const selected = i === this.saveCursor;
      const ry = 42 + i * 69;
      const rh = 65;

      ctx.fillStyle = selected
        ? (this.confirmClearSlot ? 'rgba(84, 24, 34, 0.92)' : 'rgba(64, 46, 88, 0.92)')
        : (i % 2 === 1 ? 'rgba(20, 16, 36, 0.65)' : 'rgba(14, 11, 28, 0.78)');
      ctx.fillRect(18, ry, 226, rh);
      ctx.strokeStyle = selected
        ? (this.confirmClearSlot ? '#ff5a6e' : '#ffd27a')
        : (sum.empty ? '#322b46' : '#524678');
      ctx.strokeRect(18.5, ry + 0.5, 225, rh - 1);

      f.draw(ctx, `${selected ? '→ ' : ''}${sum.label}`, 24, ry + 6, {
        color: selected ? '#ffd27a' : '#e8e2c8', shadow, gothic: false,
      });

      const badge = sum.empty
        ? (sum.isActive ? 'TARGET' : 'EMPTY')
        : (sum.isActive ? 'ACTIVE' : 'SAVED');
      const bCol = sum.empty
        ? (sum.isActive ? '#ffd27a' : '#58627a')
        : (sum.isActive ? '#62f2c2' : '#9eb0d0');
      const bw = 48, bx = 240 - bw;
      ctx.fillStyle = '#120e22';
      ctx.fillRect(bx, ry + 4, bw, 13);
      ctx.strokeStyle = bCol;
      ctx.strokeRect(bx + 0.5, ry + 4.5, bw - 1, 12);
      f.draw(ctx, badge, bx + Math.round(bw / 2), ry + 7, {
        align: 'center', color: bCol, shadow, gothic: false,
      });

      if (sum.empty) {
        f.draw(ctx, '- EMPTY SAVE SLOT -', 24, ry + 24, { color: '#6e7894', shadow, gothic: false });
        f.draw(ctx, selected ? 'PRESS SAVE TO RECORD HUNT' : 'SELECT TO RECORD HUNT', 24, ry + 40, {
          color: selected ? '#9ef5dc' : '#505870', shadow, gothic: false,
        });
      } else {
        f.draw(ctx, sum.shortStage.slice(0, 22), 24, ry + 22, { color: '#f6f0de', shadow, gothic: false });
        f.draw(ctx, `LV ${String(sum.level).padStart(2, '0')}`, 238, ry + 22, {
          align: 'right', color: '#ffd27a', shadow, gothic: false,
        });
        f.draw(ctx, `CASTLE ${sum.castleLabel} · BOSSES ${sum.felled}/${sum.totalGuardians}`, 24, ry + 36, {
          color: '#9ef5dc', shadow, gothic: false,
        });
        f.draw(ctx, `${sum.diffName} · ${sum.spawnLabel}`, 24, ry + 49, {
          color: sum.diffColor || '#9aa8c4', shadow, gothic: false,
        });
      }
    }

    // Right panel: Selected Slot Chronicle Inspector + 4 Action Buttons
    const selIdx = Math.max(0, Math.min(SAVE_SLOTS_N - 1, this.saveCursor));
    const selSum = g.getSlotSummary
      ? g.getSlotSummary(selIdx)
      : { slotIdx: selIdx, slotNum: selIdx + 1, label: `SLOT ${selIdx + 1}`, empty: true };
    const ix = 254, iy = 38, iw = 370, ih = 284;
    ctx.fillStyle = 'rgba(12, 10, 26, 0.96)';
    ctx.fillRect(ix, iy, iw, ih);
    ctx.strokeStyle = this.confirmClearSlot ? '#ff5a6e' : '#6e5838';
    ctx.strokeRect(ix + 0.5, iy + 0.5, iw - 1, ih - 1);

    f.draw(ctx, `CHRONICLE ${selSum.label}`, ix + 12, iy + 10, {
      scale: 2, gothic: false, color: '#ffd27a', shadow,
    });
    const statusLine = selSum.empty
      ? 'EMPTY SLOT · READY TO RECORD INDEPENDENT HUNT'
      : `OCCUPIED · ${selSum.fullStage} · ${selSum.savedTimeStr}`;
    f.draw(ctx, statusLine, ix + 12, iy + 31, {
      color: selSum.empty ? '#8a9ab5' : '#9ef5dc', shadow, gothic: false,
    });

    // Saved Slot Data Box
    const bx = ix + 12, by = iy + 48, bw = iw - 24, bh = 100;
    ctx.fillStyle = 'rgba(18, 15, 36, 0.90)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#524678';
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);

    if (selSum.empty) {
      f.draw(ctx, `NO SAVE RECORDED IN ${selSum.label}`, bx + 10, by + 12, {
        color: '#ffb088', shadow, gothic: false,
      });
      f.draw(ctx, 'EACH OF THE 4 SLOTS STORES ITS OWN STAGE, SAFE', bx + 10, by + 30, {
        color: '#dce4f5', shadow, gothic: false,
      });
      f.draw(ctx, 'POSITION, LEVEL, CASTLE MAP %, CLEARED BOSSES,', bx + 10, by + 44, {
        color: '#dce4f5', shadow, gothic: false,
      });
      f.draw(ctx, 'WEAPONS, TACTICAL SOULS, VESSELS & BESTIARY.', bx + 10, by + 58, {
        color: '#dce4f5', shadow, gothic: false,
      });
      f.draw(ctx, 'SAVING HERE ALSO MAKES THIS YOUR AUTO-SAVE SLOT.', bx + 10, by + 76, {
        color: '#9ef5dc', shadow, gothic: false,
      });
    } else {
      const rows = [
        ['LEVEL & FATE', `LV ${String(selSum.level).padStart(2, '0')} · ${selSum.diffName}`],
        ['CHECKPOINT', `${selSum.spawnLabel} (${selSum.save.reason})`],
        ['CASTLE & BOSSES', `${selSum.castleLabel} · ${selSum.felled}/${selSum.totalGuardians} GUARDIANS`],
        ['ARSENAL & SOULS', `${selSum.weaponCount} WEAPONS · ${selSum.soulCount} SOULS · ${selSum.vessels} VESSELS`],
      ];
      rows.forEach(([k, v], ri) => {
        const rowY = by + 6 + ri * 22;
        if (ri % 2 === 0) {
          ctx.fillStyle = 'rgba(26, 22, 48, 0.72)';
          ctx.fillRect(bx + 4, rowY, bw - 8, 19);
        }
        f.draw(ctx, k, bx + 10, rowY + 6, { color: '#9aa8c4', shadow, gothic: false });
        f.draw(ctx, v, bx + bw - 10, rowY + 6, { align: 'right', color: '#f6f0de', shadow, gothic: false });
      });
    }

    // Current Live Hunt Strip
    const curStage = (g.world && g.world.stage) || STAGES[g.stageIndex] || STAGES[0];
    const curStageShort = curStage.name.replace(/^THE\s+/, '');
    const curDisc = g.getCastleDiscoveryStats ? g.getCastleDiscoveryStats().label : '0.0%';
    const curLv = String(g.charLevel || 1).padStart(2, '0');
    const lx = ix + 12, ly = iy + 154, lw = iw - 24, lh = 44;
    ctx.fillStyle = 'rgba(16, 24, 34, 0.90)';
    ctx.fillRect(lx, ly, lw, lh);
    ctx.strokeStyle = '#3c5a68';
    ctx.strokeRect(lx + 0.5, ly + 0.5, lw - 1, lh - 1);
    f.draw(
      ctx,
      `LIVE HUNT: ${curStageShort} · LV ${curLv} · CASTLE ${curDisc}`,
      lx + 10,
      ly + 9,
      { color: '#62f2c2', shadow, gothic: false },
    );
    f.draw(
      ctx,
      `ACTIVE AUTO-SAVE: SLOT ${(g.activeSaveSlot || 0) + 1} · SAVE CAPTURES SAFE POSITION`,
      lx + 10,
      ly + 24,
      { color: '#9eb0d0', shadow, gothic: false },
    );

    // 4 Action Buttons (`SAVE`, `LOAD`, `CLEAR`, `SAVE & MAIN MENU`)
    this._drawActionBtn(
      ctx,
      ix + 12,
      244,
      168,
      28,
      `${isPad ? '[A/X]' : '[ENT]'} SAVE SLOT ${selSum.slotNum}`,
      '#ffd27a',
      true,
    );
    this._drawActionBtn(
      ctx,
      ix + 190,
      244,
      168,
      28,
      `${isPad ? '[Y]' : '[C]'} LOAD SLOT ${selSum.slotNum}`,
      selSum.empty ? '#505870' : '#62f2c2',
      false,
    );
    this._drawActionBtn(
      ctx,
      ix + 12,
      278,
      168,
      28,
      this.confirmClearSlot
        ? 'CONFIRM CLEAR?'
        : `${isPad ? '[LB]' : '[Q]'} CLEAR SLOT ${selSum.slotNum}`,
      selSum.empty ? '#505870' : (this.confirmClearSlot ? '#ff5a6e' : '#ffb0a0'),
      this.confirmClearSlot,
    );
    this._drawActionBtn(
      ctx,
      ix + 190,
      278,
      168,
      28,
      'SAVE & MAIN MENU',
      '#9ef5dc',
      false,
    );

    const foot = this.flashT > 0
      ? this.flashMsg
      : (isPad
        ? '4 SAVE SLOTS · ←/→ TABS · ↑↓ SLOT 1-4 · A/X SAVE · Y LOAD · LB CLEAR'
        : '4 SAVE SLOTS · ←/→ TABS · ↑↓ SLOT 1-4 · ENTER/X SAVE · C LOAD · Q CLEAR');
    f.draw(ctx, foot, W / 2, 336, {
      align: 'center', color: this.flashT > 0 ? '#ffd27a' : '#9aa8c4', shadow, gothic: false,
    });
  }

  _drawExitTab(ctx) {
    const g = this.game;
    const f = g.font;
    const shadow = '#05040a';
    const isPad = !!(g.input && g.input.isGamepad);
    const activeNum = (g.activeSaveSlot || 0) + 1;

    const px = 110, py = 54, pw = 420, ph = 256;
    ctx.fillStyle = 'rgba(12, 10, 26, 0.96)';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = '#8a4252';
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
    ctx.strokeStyle = '#6e5838';
    ctx.strokeRect(px + 2.5, py + 2.5, pw - 5, ph - 5);

    f.draw(ctx, 'RETURN TO MAIN MENU?', W / 2, py + 16, {
      scale: 2, align: 'center', color: '#ffd27a', shadow, gothic: false,
    });
    f.draw(ctx, 'LEAVE THE CURRENT HUNT OR SAVE TO YOUR ACTIVE SLOT FIRST', W / 2, py + 39, {
      align: 'center', color: '#9eb0d0', shadow, gothic: false,
    });

    const opts = [
      {
        label: 'EXIT TO MAIN MENU',
        sub: 'RETURN TO THE START SCREEN IMMEDIATELY',
        accent: '#ffd27a',
      },
      {
        label: `SAVE TO SLOT ${activeNum} & MAIN MENU`,
        sub: `RECORDS CURRENT HUNT IN SLOT ${activeNum}, THEN EXITS`,
        accent: '#62f2c2',
      },
      {
        label: 'RESUME HUNT',
        sub: 'STAY IN THE CASTLE AND CONTINUE PLAYING',
        accent: '#9ef5dc',
      },
    ];

    opts.forEach((opt, i) => {
      const sel = i === this.exitCursor;
      const cy = 112 + i * 56;
      ctx.fillStyle = sel ? 'rgba(72, 36, 62, 0.94)' : 'rgba(18, 15, 34, 0.92)';
      ctx.fillRect(140, cy, 360, 46);
      ctx.strokeStyle = sel ? opt.accent : '#463c62';
      ctx.strokeRect(140.5, cy + 0.5, 359, 45);
      f.draw(ctx, `${sel ? '→ ' : ''}${opt.label}`, W / 2, cy + 10, {
        align: 'center', color: sel ? opt.accent : '#e8e2c8', shadow, gothic: false,
      });
      f.draw(ctx, opt.sub, W / 2, cy + 26, {
        align: 'center', color: sel ? '#dce4f5' : '#7e8aa8', shadow, gothic: false,
      });
    });

    const foot = isPad
      ? 'MAIN MENU · ↑↓ SELECT · A/X CONFIRM · START/B RESUME HUNT'
      : 'MAIN MENU · ↑↓ SELECT · ENTER/SPACE CONFIRM · ESC/E RESUME HUNT';
    f.draw(ctx, foot, W / 2, 336, {
      align: 'center', color: '#9aa8c4', shadow, gothic: false,
    });
  }

  _getSettingsRowState(row) {
    const g = this.game;
    switch (row.id) {
      case 'exitHome':
        return { badge: 'MENU', color: '#ffd27a', status: 'ACTION · RETURN TO MAIN MENU START SCREEN' };
      case 'openSave': {
        const occ = g.getOccupiedSlotCount ? g.getOccupiedSlotCount() : 0;
        return {
          badge: `${occ}/4`,
          color: '#62f2c2',
          status: `ACTIVE SLOT ${(g.activeSaveSlot || 0) + 1} · ${occ}/4 SAVE SLOTS OCCUPIED`,
        };
      }
      case 'mute': {
        const on = !(g.audio && g.audio.muted);
        return {
          badge: on ? 'ON' : 'MUTED',
          color: on ? '#62f2c2' : '#ff8a98',
          status: on ? 'AUDIO ACTIVE · MUSIC, VOICE & SFX ON' : 'AUDIO MUTED · PRESS TO RESTORE SOUND',
        };
      }
      case 'postfx': {
        const on = !!(g.postfx && g.postfx.enabled);
        return {
          badge: on ? 'ON' : 'OFF',
          color: on ? '#62f2c2' : '#8a9ab5',
          status: on ? 'SHADERS ACTIVE · TORCHLIGHT & BLOOM ON' : 'SHADERS OFF · RAW PIXEL CANVAS',
        };
      }
      case 'callsign': {
        const name = (g.net && g.net.name) ? g.net.name : 'HUNTER';
        return {
          badge: 'EDIT',
          color: '#9ef5dc',
          status: `CURRENT CALLSIGN: ${name}`,
        };
      }
      case 'unlockAreas': {
        const on = !!(g.debug && g.debug.unlockAreas);
        return {
          badge: on ? 'ON' : 'OFF',
          color: on ? '#62f2c2' : '#8a9ab5',
          status: on ? 'DEBUG ACTIVE · ALL AREAS & WAYSTONES OPEN' : 'STANDARD PROGRESSION · RELICS OPEN GATES',
        };
      }
      case 'unlockBosses': {
        const on = !!(g.debug && g.debug.unlockBosses);
        return {
          badge: on ? 'ON' : 'OFF',
          color: on ? '#62f2c2' : '#8a9ab5',
          status: on ? 'DEBUG ACTIVE · ALL BOSS DOORS UNSEALED' : 'STANDARD PROGRESSION · GUARDIANS SEAL KEEP',
        };
      }
      case 'resetProgress':
        return this.confirmReset
          ? { badge: 'CONFIRM', color: '#ff5a6e', status: '! CONFIRM RESET: ACTIVATE AGAIN TO ERASE ALL PROGRESS !' }
          : { badge: 'RESET', color: '#ffb0a0', status: '2-STEP SAFETY · ERASES SAVE, ARSENAL, SOULS & LEVEL' };
      default:
        return { badge: 'OK', color: '#ffd27a', status: '' };
    }
  }

  _drawSettingsTab(ctx) {
    const g = this.game;
    const f = g.font;
    const shadow = '#05040a';
    const isPad = !!(g.input && g.input.isGamepad);

    // Left panel: Settings & Session Options list
    ctx.fillStyle = 'rgba(10, 8, 22, 0.94)';
    ctx.fillRect(16, 38, 230, 284);
    ctx.strokeStyle = '#3e3556';
    ctx.strokeRect(16.5, 38.5, 229, 283);

    for (let i = 0; i < ARMORY_SETTINGS_ROWS.length; i++) {
      const row = ARMORY_SETTINGS_ROWS[i];
      const st = this._getSettingsRowState(row);
      const selected = i === this.settingsCursor;
      const confirming = row.id === 'resetProgress' && this.confirmReset;
      const ry = 42 + i * 34;

      if (selected) {
        ctx.fillStyle = confirming ? 'rgba(84, 24, 34, 0.90)' : 'rgba(64, 46, 88, 0.88)';
        ctx.fillRect(18, ry, 226, 31);
        ctx.strokeStyle = confirming ? '#ff5a6e' : '#ffd27a';
        ctx.strokeRect(18.5, ry + 0.5, 225, 30);
      } else if (i % 2 === 1) {
        ctx.fillStyle = 'rgba(20, 16, 36, 0.55)';
        ctx.fillRect(18, ry, 226, 31);
      }

      const labelCol = confirming
        ? '#ff8a98'
        : (selected ? '#ffffff' : (row.id === 'exitHome' ? '#ffd27a' : (row.id === 'openSave' ? '#9ef5dc' : '#e8e2c8')));
      f.draw(ctx, row.label, 24, ry + 5, { color: labelCol, shadow, gothic: false });
      const subText = confirming ? 'PRESS AGAIN TO CONFIRM!' : row.sub;
      f.draw(ctx, subText, 24, ry + 17, {
        color: confirming ? '#ffb0a0' : '#7e8aa8', shadow, gothic: false,
      });

      const bx = 180, bw = 58, bh = 14, by = ry + 8;
      ctx.fillStyle = '#120e22';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = st.color;
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      f.draw(ctx, st.badge, bx + Math.round(bw / 2), by + 3, {
        align: 'center', color: st.color, shadow, gothic: false,
      });
    }

    // Right panel: Selected Option Inspector + Hunt Checkpoint Summary + Quick Action Buttons
    const selRow = ARMORY_SETTINGS_ROWS[this.settingsCursor] || ARMORY_SETTINGS_ROWS[0];
    const selState = this._getSettingsRowState(selRow);
    const ix = 254, iy = 38, iw = 370, ih = 284;
    ctx.fillStyle = 'rgba(12, 10, 26, 0.96)';
    ctx.fillRect(ix, iy, iw, ih);
    ctx.strokeStyle = selRow.id === 'resetProgress' && this.confirmReset ? '#ff5a6e' : '#6e5838';
    ctx.strokeRect(ix + 0.5, iy + 0.5, iw - 1, ih - 1);

    f.draw(ctx, selRow.title, ix + 14, iy + 12, {
      scale: 2, gothic: false, color: selState.color, shadow,
    });
    f.draw(ctx, selState.status, ix + 14, iy + 34, {
      color: '#9ef5dc', shadow, gothic: false,
    });

    const descText = selRow.id === 'resetProgress' && this.confirmReset
      ? 'WARNING: THIS CANNOT BE UNDONE! YOUR CALLSIGN AND SHARED CASTLE FORGE WINGS ARE KEPT, ALL OTHER PROGRESS WILL BE ERASED.'
      : selRow.desc;
    const descLines = f.wrap(descText, iw - 28, 1, 1, false).slice(0, 4);
    descLines.forEach((ln, li) => {
      f.draw(ctx, ln, ix + 14, iy + 52 + li * 13, { color: '#dce4f5', shadow, gothic: false });
    });

    // Hunt & Save Checkpoint summary card
    const bx = ix + 12, by = iy + 110, bw = iw - 24, bh = 122;
    ctx.fillStyle = 'rgba(18, 15, 36, 0.90)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#524678';
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);

    const curStage = (g.world && g.world.stage) || STAGES[g.stageIndex] || STAGES[0];
    const diffName = (g.difficulty && g.difficulty.name) || 'NORMAL';
    const callsign = (g.net && g.net.name) || 'HUNTER';
    const disc = g.getCastleDiscoveryStats ? g.getCastleDiscoveryStats() : { label: '0.0%' };
    const gp = g.guardianProgress ? g.guardianProgress() : { felled: 0, total: 20 };
    const vessels = g.getVesselCount ? g.getVesselCount() : 0;

    f.draw(ctx, 'CURRENT HUNT & SANCTUM CHECKPOINT', bx + 8, by + 8, {
      color: '#ffd27a', shadow, gothic: false,
    });
    f.draw(ctx, `REGION: ${curStage.name}`, bx + 8, by + 24, {
      color: '#f6f0de', shadow, gothic: false,
    });
    f.draw(ctx, `FATE: ${diffName}  ·  CALLSIGN: ${callsign}`, bx + 8, by + 38, {
      color: '#9eb0d0', shadow, gothic: false,
    });
    f.draw(
      ctx,
      `CASTLE ${disc.label} · BOSSES ${gp.felled}/${gp.total} · VESSELS ${vessels}/${STAGES.length}`,
      bx + 8,
      by + 52,
      { color: '#9ef5dc', shadow, gothic: false },
    );

    ctx.fillStyle = '#362e52';
    ctx.fillRect(bx + 8, by + 67, bw - 16, 1);

    if (g.hasSaveGame && g.hasSaveGame() && g.saveData) {
      const sv = g.saveData;
      const slotNum = (Number.isFinite(sv.slot) ? sv.slot : (g.activeSaveSlot || 0)) + 1;
      const stLabel = String(sv.stageName || 'THE CASTLE').replace(/^THE\s+/, '');
      const kindLbl = sv.spawnKind === 'boss_clear'
        ? 'BOSS CLEAR'
        : sv.spawnKind === 'manual_pos'
          ? 'SAVED POS'
          : sv.spawnKind === 'stage_start'
            ? 'ENTRANCE'
            : 'SANCTUM';
      f.draw(ctx, `SLOT ${slotNum}: ${stLabel} (${kindLbl})`, bx + 8, by + 74, {
        color: '#7ef5c8', shadow, gothic: false,
      });
    } else {
      f.draw(ctx, `ACTIVE SLOT ${(g.activeSaveSlot || 0) + 1}: NONE RECORDED YET`, bx + 8, by + 74, {
        color: '#ffb088', shadow, gothic: false,
      });
    }
    f.draw(ctx, 'USE THE SAVE TAB FOR 4 INDEPENDENT SAVE SLOTS.', bx + 8, by + 90, {
      color: '#8a9ab5', shadow, gothic: false,
    });
    f.draw(ctx, 'CRIMSON SANCTUMS AUTO-SAVE INTO YOUR ACTIVE SLOT.', bx + 8, by + 103, {
      color: '#7e8aa8', shadow, gothic: false,
    });

    // Always-accessible Resume Hunt & Exit to Main Menu buttons
    const btnY = iy + 242;
    this._drawActionBtn(
      ctx,
      ix + 12,
      btnY,
      168,
      28,
      isPad ? '[START / B] RESUME HUNT' : '[ESC / E] RESUME HUNT',
      '#62f2c2',
      false,
    );
    this._drawActionBtn(
      ctx,
      ix + 190,
      btnY,
      168,
      28,
      'EXIT TO MAIN MENU',
      '#ffd27a',
      selRow.id === 'exitHome',
    );

    const foot = this.flashT > 0
      ? this.flashMsg
      : (isPad
        ? 'SETTINGS · ←/→ TABS · ↑↓ SELECT · A/X ACTIVATE · START/B RESUME HUNT'
        : 'SETTINGS · ←/→ TABS · ↑↓ SELECT · ENTER/SPACE ACTIVATE · ESC/E RESUME');
    f.draw(ctx, foot, W / 2, 336, {
      align: 'center', color: this.flashT > 0 ? '#ffd27a' : '#9aa8c4', shadow, gothic: false,
    });
  }

  _drawHandSocket(ctx, x, y, w, h, title, weapon, playerStr, locked2H) {
    const f = this.game.font;
    const shadow = '#05040a';
    ctx.fillStyle = locked2H ? 'rgba(18, 14, 24, 0.72)' : 'rgba(16, 14, 32, 0.96)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = locked2H ? '#4a3e38' : (weapon ? '#8a9ab5' : '#3a3452');
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

    f.draw(ctx, title, x + 34, y + 6, { color: '#8a9ab5', shadow, gothic: false });
    if (locked2H) {
      f.draw(ctx, 'LOCKED (2H WEAPON)', x + 34, y + 20, { color: '#7a6858', shadow, gothic: false });
      return;
    }
    if (!weapon) {
      f.draw(ctx, 'EMPTY SOCKET', x + 34, y + 20, { color: '#58627a', shadow, gothic: false });
      return;
    }
    const icon = getWeaponIconCanvas(weapon.id);
    if (icon) ctx.drawImage(icon, x + 8, y + 11);
    const deficit = playerStr < weapon.reqStr;
    f.draw(ctx, weapon.name.slice(0, deficit ? 22 : 27), x + 34, y + 19, {
      color: deficit ? '#ff9a88' : '#f6f0de', shadow, gothic: false,
    });
    if (deficit) {
      f.draw(ctx, '0.5X', x + w - 6, y + 6, { align: 'right', color: '#ff5a6e', shadow, gothic: false });
    }
  }

  _drawChip(ctx, x, y, text, color) {
    const f = this.game.font;
    const w = f.width(text, 1, 1, false) + 10;
    ctx.fillStyle = 'rgba(8, 6, 18, 0.92)';
    ctx.fillRect(x, y, w, 14);
    ctx.strokeStyle = color;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 13);
    f.draw(ctx, text, x + 5, y + 3, { color, shadow: '#05040a', gothic: false });
    return x + w + 5;
  }

  _drawActionBtn(ctx, x, y, w, h, label, accent, active) {
    ctx.fillStyle = active ? 'rgba(42, 34, 62, 0.96)' : 'rgba(18, 15, 34, 0.94)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = active ? accent : '#4e4668';
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    this.game.font.draw(ctx, label, x + Math.round(w / 2), y + Math.round((h - 8) / 2), {
      align: 'center', color: accent, shadow: '#05040a', gothic: false,
    });
  }
}
