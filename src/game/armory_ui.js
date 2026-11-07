// Dual-Hand Equipment Matrix, Tactical Soul Glyphs & Hunter's Bestiary Grimoire:
// - `WeaponPedestal`: physical gothic stone altar holding each stage's signature weapon
// - `ArmoryScreen`: 3-Tab Gothic Grimoire (`E` / `I` / `B` / Touch `GEAR`):
//     1. ARMORY: Ambidextrous Hand_L & Hand_R sockets, Dual Loadout A/B swap (`R`),
//        Stat Deficit Gate math, Shield Rod Sacred Call & Set Resonance
//     2. SOULS: Crimson Bullet, Cobalt Guardian & Amber Enchant Soul Glyphs (`Lv 1..9`)
//     3. BESTIARY: Monster Compendium with kill counts, weaknesses, weapon & soul drops.

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

const TABS = ['armory', 'souls', 'bestiary'];

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
    const tag = taken ? `${w.name} · PRESS E FOR ARMORY` : `CLAIM ${w.name}`;
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
    if (inp.pressed.armory || inp.pressed.escape || inp.pressed.start || (this.tab === 'bestiary' && inp.pressed.bestiary)) {
      this.game.setState(this.returnState || 'play');
      this.game.audio.sfx('pause');
      return;
    }
    if (inp.pressed.bestiary && this.tab !== 'bestiary') {
      this.tab = 'bestiary';
      this.game.audio.sfx('select');
      return;
    }
    if (inp.pressed.map && this.game.world) {
      this.game.openMap();
      return;
    }
    if (inp.pressed.swap && this.game.swapLoadout) {
      this.game.swapLoadout(this.game.world);
      this.toast(`SWITCHED TO ${this.game.activeLoadout === 0 ? 'LOADOUT SET A' : 'LOADOUT SET B'}`);
      return;
    }
    // Left / Right switch between ARMORY · SOULS · BESTIARY tabs
    if (inp.pressed.left) {
      const ti = (TABS.indexOf(this.tab) + TABS.length - 1) % TABS.length;
      this.tab = TABS[ti];
      this.game.audio.sfx('bone');
      return;
    }
    if (inp.pressed.right) {
      const ti = (TABS.indexOf(this.tab) + 1) % TABS.length;
      this.tab = TABS[ti];
      this.game.audio.sfx('bone');
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

  handlePoint(gx, gy) {
    // Top tab pills (`y < 32`)
    if (gy < 32) {
      if (gx >= 16 && gx < 118) { this.tab = 'armory'; this.game.audio.sfx('bone'); return true; }
      if (gx >= 120 && gx < 224) { this.tab = 'souls'; this.game.audio.sfx('bone'); return true; }
      if (gx >= 226 && gx < 330) { this.tab = 'bestiary'; this.game.audio.sfx('bone'); return true; }
      if (gx >= 334 && gx < 414 && this.game.swapLoadout) {
        this.game.swapLoadout(this.game.world);
        return true;
      }
      if (gx > 490) {
        this.game.setState(this.returnState || 'play');
        this.game.audio.sfx('pause');
        return true;
      }
    }
    if (gy > 328 && gx > 470) {
      this.game.setState(this.returnState || 'play');
      this.game.audio.sfx('pause');
      return true;
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

    // Header band + 3 Grimoire Tabs + Set A/B Toggle
    ctx.fillStyle = 'rgba(16, 12, 30, 0.96)';
    ctx.fillRect(0, 0, W, 30);
    ctx.fillStyle = '#6e5838';
    ctx.fillRect(0, 29, W, 1);

    const tabDefs = [
      ['armory', 'ARMORY', 16, 98],
      ['souls', 'SOULS', 118, 98],
      ['bestiary', 'BESTIARY', 220, 106],
    ];
    for (const [tk, lbl, tx, tw] of tabDefs) {
      const act = this.tab === tk;
      ctx.fillStyle = act ? 'rgba(66, 46, 94, 0.96)' : 'rgba(18, 14, 34, 0.92)';
      ctx.fillRect(tx, 5, tw, 20);
      ctx.strokeStyle = act ? '#ffd27a' : '#42385c';
      ctx.strokeRect(tx + 0.5, 5.5, tw - 1, 19);
      f.draw(ctx, lbl, tx + Math.round(tw / 2), 11, {
        align: 'center', color: act ? '#ffd27a' : '#8a9ab5', shadow, gothic: false,
      });
    }

    const setIdx = g.activeLoadout ? 1 : 0;
    ctx.fillStyle = 'rgba(20, 28, 38, 0.94)';
    ctx.fillRect(332, 5, 76, 20);
    ctx.strokeStyle = setIdx === 0 ? '#ffd27a' : '#62f2c2';
    ctx.strokeRect(332.5, 5.5, 75, 19);
    f.draw(ctx, `[R] SET ${setIdx === 0 ? 'A' : 'B'}`, 370, 11, {
      align: 'center', color: setIdx === 0 ? '#ffd27a' : '#62f2c2', shadow, gothic: false,
    });

    const strInfo = computeStrengthBreakdown(g);
    const nextXp = xpForNextLevel(strInfo.level);
    const curXp = g.charExp != null ? g.charExp : 0;
    const xpTxt = nextXp > 0 ? `${formatCompactExp(curXp)}/${formatCompactExp(nextXp)}` : 'MAX';
    f.draw(
      ctx,
      `LV ${String(strInfo.level).padStart(2, '0')} · EXP ${xpTxt} · STR ${String(strInfo.total).padStart(2, '0')}`,
      624,
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

    // -----------------------------------------------------------------
    // TAB 1: ARMORY (Ambidextrous Dual-Slot Sockets + Weapon Inspector)
    // -----------------------------------------------------------------
    const wL = WEAPONS[g.handL] || WEAPONS.hunters_lash;
    const locked2H = !!(wL && wL.isTwoHanded);
    const wR = locked2H ? null : (WEAPONS[g.handR] || null);
    const res = g.getActiveResonance();

    this._drawHandSocket(ctx, 16, 36, 212, 42, 'HAND L · [X / K]', wL, strInfo.total, false);
    this._drawHandSocket(ctx, 412, 36, 212, 42, 'HAND R · [C / V / L]', wR, strInfo.total, locked2H);

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
    this._drawActionBtn(ctx, ix + 12, btnY, 168, 24, '[X / K] EQUIP HAND L', '#ffd27a', g.handL === sw.id);
    const rLabel = sw.isTwoHanded
      ? '[C / V] EQUIP 2H GRIP'
      : (g.handR === sw.id ? '[C / V] UNEQUIP R' : '[C / V / L] EQUIP HAND R');
    this._drawActionBtn(ctx, ix + 190, btnY, 168, 24, rLabel, '#62f2c2', !sw.isTwoHanded && g.handR === sw.id);

    const footText = this.flashT > 0
      ? this.flashMsg
      : `ARSENAL ${list.length}/${WEAPON_ORDER.length} · ←/→ TABS · R SWAP SET · X HAND L · C/V HAND R · E CLOSE`;
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

    const ownedCount = SOUL_ORDER.filter((k) => (g.soulRanks[k] || 0) > 0).length;
    const foot = this.flashT > 0
      ? this.flashMsg
      : `SOULS ${ownedCount}/${SOUL_ORDER.length} · ←/→ TABS · ↑↓ SELECT · X/SPACE ATTUNE · E CLOSE`;
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

    const catalogued = BESTIARY_ORDER.filter((k) => g.bestiarySeen && g.bestiarySeen.has(k)).length;
    f.draw(
      ctx,
      `CATALOGUED ${catalogued}/${BESTIARY_ORDER.length} FIENDS · ←/→ TABS · ↑↓ BROWSE · B / E CLOSE`,
      W / 2,
      336,
      { align: 'center', color: '#9aa8c4', shadow, gothic: false },
    );
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
    this.game.font.draw(ctx, label, x + Math.round(w / 2), y + 8, {
      align: 'center', color: accent, shadow: '#05040a', gothic: false,
    });
  }
}
