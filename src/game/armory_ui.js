// Dual-Hand Equipment Matrix UI & In-Stage Weapon Pedestals:
// - `WeaponPedestal`: physical gothic stone altar holding each stage's signature weapon
// - `ArmoryScreen`: interactive Ambidextrous Equipment Matrix (`E` / `I` / Touch `GEAR`)
//   for assigning Hand_L (Slot 0) & Hand_R (Slot 1), inspecting Stat Deficit Gate math,
//   Cut/Blunt + Elemental tags, 30-frame Command Skills, and Cross-Hand Set Resonance.

import { W, H } from '../engine/constants.js';
import { getFxLayers } from '../engine/fxlayers.js';
import { rectsOverlap } from './objects.js';
import {
  WEAPONS, WEAPON_ORDER, WEAPON_CATEGORIES, ELEMENT_META, PHYSICAL_META,
  SET_RESONANCES, computeStrengthBreakdown, computeWeaponHit, xpForNextLevel,
  getWeaponIconCanvas,
} from './weapons.js';
import { formatCompactExp } from './progression.js';

export class WeaponPedestal {
  constructor(weaponId, x, y) {
    this.weaponId = weaponId;
    this.x = x;
    this.y = y;
  }

  get weapon() { return WEAPONS[this.weaponId] || null; }
  get box() { return { x: this.x - 16, y: this.y - 54, w: 32, h: 54 }; }

  isCollected(world) {
    return !!(world && world.game && world.game.hasWeapon && world.game.hasWeapon(this.weaponId));
  }

  update(player, world) {
    if (!this.weapon || this.isCollected(world)) return;
    if (rectsOverlap(this.box, player.box())) {
      world.onWeaponCollected(this.weaponId, this.x, this.y - 28, true);
    }
  }

  draw(ctx, cam, font, world, time) {
    const w = this.weapon;
    if (!w) return;
    const sx = Math.round(this.x - cam.rx);
    const sy = Math.round(this.y - cam.ry);
    if (sx < -48 || sx > W + 48 || sy < -30 || sy > H + 70) return;

    const taken = this.isCollected(world);
    const pulse = 0.5 + 0.5 * Math.sin(time * 4.2 + this.x * 0.02);
    const elem = w.element ? ELEMENT_META[w.element] : null;
    const accent = elem ? elem.color : (w.trimColor || '#ffd27a');

    ctx.save();
    // Carved gothic reliquary plinth
    ctx.fillStyle = 'rgba(4, 3, 10, 0.5)';
    ctx.fillRect(sx - 16, sy - 2, 32, 4);
    ctx.fillStyle = '#242038';
    ctx.fillRect(sx - 13, sy - 14, 26, 14);
    ctx.fillStyle = '#3a3456';
    ctx.fillRect(sx - 15, sy - 16, 30, 4);
    ctx.fillRect(sx - 15, sy - 4, 30, 4);
    ctx.fillStyle = taken ? '#4e4868' : accent;
    ctx.fillRect(sx - 9, sy - 10, 18, 2);

    if (!taken) {
      const bob = Math.round(Math.sin(time * 3.6) * 3);
      const cy = sy - 32 + bob;
      const g = ctx.createRadialGradient(sx, cy, 2, sx, cy, 28);
      g.addColorStop(0, elem ? `${elem.color}66` : `rgba(255, 218, 128, ${(0.36 + 0.16 * pulse).toFixed(3)})`);
      g.addColorStop(1, 'rgba(12, 10, 24, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(sx - 30, cy - 30, 60, 60);

      const fxl = getFxLayers();
      if (fxl && fxl.enabled) {
        fxl.addAttack({
          x: sx, y: cy, rx: 13, ry: 16, dirX: 0, dirY: -1, mode: 0, seed: this.x * 0.013,
          core: elem ? elem.core : [1.0, 0.96, 0.80],
          rim: elem ? elem.rim : [0.92, 0.72, 0.30],
          alpha: 0.48 + 0.18 * pulse,
        });
      }

      const icon = getWeaponIconCanvas(w.id);
      if (icon) {
        ctx.drawImage(icon, sx - 10, cy - 10);
      } else {
        ctx.fillStyle = accent;
        ctx.fillRect(sx - 5, cy - 5, 10, 10);
      }

      // Subtle floating label when hunter approaches
      if (world && world.player && Math.abs(world.player.x - this.x) < 68 && Math.abs(world.player.y - this.y) < 58) {
        const tag = w.name;
        const lw = font.width(tag, 1, 1, false) + 10;
        const lx = Math.max(6, Math.min(W - lw - 6, Math.round(sx - lw * 0.5)));
        const ly = Math.max(48, cy - 26);
        ctx.fillStyle = 'rgba(6, 5, 16, 0.92)';
        ctx.fillRect(lx, ly, lw, 12);
        ctx.strokeStyle = accent;
        ctx.strokeRect(lx + 0.5, ly + 0.5, lw - 1, 11);
        font.draw(ctx, tag, lx + Math.round(lw * 0.5), ly + 2, {
          align: 'center', color: '#f6f0de', shadow: '#05040a', gothic: false,
        });
      }
    } else {
      const fxl = getFxLayers();
      if (fxl && fxl.enabled) {
        fxl.addFlame(sx, sy - 17, 6, 9, [0.55, 0.78, 1.0], this.x * 0.02);
      }
    }
    ctx.restore();
  }
}

export class ArmoryScreen {
  constructor(game) {
    this.game = game;
    this.cursor = 0;
    this.scroll = 0;
    this.returnState = 'play';
    this.flashMsg = '';
    this.flashT = 0;
  }

  open(returnState = 'play') {
    this.returnState = returnState === 'armory' ? 'play' : returnState;
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

  ensureVisible(total) {
    const rows = 9;
    if (this.cursor < this.scroll) this.scroll = this.cursor;
    if (this.cursor >= this.scroll + rows) this.scroll = this.cursor - rows + 1;
    this.scroll = Math.max(0, Math.min(Math.max(0, total - rows), this.scroll));
  }

  toast(msg) {
    this.flashMsg = msg;
    this.flashT = 1.8;
  }

  update(dt, inp) {
    this.flashT = Math.max(0, this.flashT - dt);
    const list = this.ownedList();
    const n = list.length;
    if (inp.pressed.armory || inp.pressed.escape || inp.pressed.start) {
      this.game.setState(this.returnState || 'play');
      this.game.audio.sfx('pause');
      return;
    }
    if (inp.pressed.map && this.game.world) {
      this.game.openMap();
      return;
    }
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

    // Hand_L assignment (`X` / `K`)
    if (inp.pressed.attack) {
      this.equipSlot(0, selId);
    } else if (inp.pressed.offhand || inp.pressed.jump) {
      // Hand_R assignment (`C` / `V` / `L` / `Shift` / `Z` / `Space`)
      this.equipSlot(1, selId);
    }
  }

  equipSlot(slot, weaponId) {
    const w = WEAPONS[weaponId];
    if (!w) return;
    if (slot === 1 && w.isTwoHanded) {
      // Two-handed weapons anchor in Hand_L and lock Hand_R automatically!
      this.game.equipWeapon(0, weaponId);
      this.toast(`${w.short} EQUIPPED (2H LOCKS R-HAND)`);
      this.game.audio.sfx('select');
      return;
    }
    if (slot === 1 && this.game.handR === weaponId && !w.isTwoHanded) {
      // Toggling the already-equipped Hand_R weapon clears Hand_R cleanly
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

  /** Handles direct canvas tap/click coordinates (`gx, gy` in 640×360 space). */
  handlePoint(gx, gy) {
    const list = this.ownedList();
    // Top-right close header (`y < 32, gx > 500`)
    if (gy < 34 && gx > 490) {
      this.game.setState(this.returnState || 'play');
      this.game.audio.sfx('pause');
      return true;
    }
    // Left weapon list (`x: 16..244, y: 86..312`, row height 25)
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
    // Top Hand_L / Hand_R slot cards (`y: 34..78`) — tap Hand_R when populated to clear, or equip selected
    const selId = list[this.cursor];
    if (gy >= 34 && gy <= 78 && selId) {
      if (gx >= 16 && gx <= 228) { this.equipSlot(0, selId); return true; }
      if (gx >= 412 && gx <= 624) { this.equipSlot(1, selId); return true; }
    }
    // Right card action buttons (`y: 288..318`)
    if (gy >= 286 && gy <= 322 && selId) {
      if (gx >= 262 && gx <= 434) { this.equipSlot(0, selId); return true; }
      if (gx >= 442 && gx <= 618) { this.equipSlot(1, selId); return true; }
    }
    // Bottom footer bar (`gy > 328`) -> Close
    if (gy > 328 && gx > 470) {
      this.game.setState(this.returnState || 'play');
      this.game.audio.sfx('pause');
      return true;
    }
    return false;
  }

  draw(ctx) {
    const g = this.game;
    const f = g.font;
    const shadow = '#05040a';

    // Backdrop: dim live castle world underneath if present
    if (g.world) {
      g.world.draw(ctx, { hud: false });
    }
    ctx.save();
    ctx.fillStyle = 'rgba(5, 4, 14, 0.90)';
    ctx.fillRect(0, 0, W, H);

    // Header band
    ctx.fillStyle = 'rgba(16, 12, 30, 0.96)';
    ctx.fillRect(0, 0, W, 30);
    ctx.fillStyle = '#6e5838';
    ctx.fillRect(0, 29, W, 1);

    f.draw(ctx, 'MODULAR DUAL-HAND ARMORY', 16, 8, {
      scale: 2, gothic: false, color: '#ffd27a', shadow,
    });

    const strInfo = computeStrengthBreakdown(g);
    const nextXp = xpForNextLevel(strInfo.level);
    const curXp = g.charExp != null ? g.charExp : (g.hunterXp || 0);
    const xpTxt = nextXp > 0 ? `${formatCompactExp(curXp)}/${formatCompactExp(nextXp)}` : 'MAX';
    f.draw(
      ctx,
      `LV ${String(strInfo.level).padStart(2, '0')} · EXP ${xpTxt} · STR ${String(strInfo.total).padStart(2, '0')}`,
      624,
      10,
      { align: 'right', color: '#9ef5dc', shadow, gothic: false },
    );

    // -----------------------------------------------------------------
    // Top Row: Ambidextrous Dual-Slot Sockets (`HAND L` <-> Resonance <-> `HAND R`)
    // -----------------------------------------------------------------
    const wL = WEAPONS[g.handL] || WEAPONS.hunters_lash;
    const locked2H = !!(wL && wL.isTwoHanded);
    const wR = locked2H ? null : (WEAPONS[g.handR] || null);
    const res = g.getActiveResonance();

    this._drawHandSocket(ctx, 16, 36, 212, 42, 'HAND L · [X / K]', wL, strInfo.total, false);
    this._drawHandSocket(ctx, 412, 36, 212, 42, 'HAND R · [C / V / L]', wR, strInfo.total, locked2H);

    // Center Cross-Hand Resonance / 2H Grip Bridge (`x: 234..406`)
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
      f.draw(ctx, 'MATCH SET TAGS FOR L+R SPELL', bx + bw / 2, by + 22, {
        align: 'center', color: '#58627a', shadow, gothic: false,
      });
    }

    // -----------------------------------------------------------------
    // Left Column: Discovered Arsenal List (`x: 16..246, y: 84..322`)
    // -----------------------------------------------------------------
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
      f.draw(ctx, w.name.slice(0, inL || inR ? 27 : 30), 46, ry + 4, { color: labelCol, shadow, gothic: false });
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

    // -----------------------------------------------------------------
    // Right Column: Weapon Classification, Stat Deficit & Combo Inspector
    // -----------------------------------------------------------------
    const selId = list[this.cursor] || 'hunters_lash';
    const sw = WEAPONS[selId] || WEAPONS.hunters_lash;
    const cat = WEAPON_CATEGORIES[sw.category] || WEAPON_CATEGORIES.standard_blade;
    const hitInfo = computeWeaponHit(sw, strInfo.total, null, {
      flatBonus: g.world ? ((g.world.hasRelic('jack') ? 1 : 0) + g.world.relicBonus('whip')) : 0,
      diffMult: g.difficulty ? (g.difficulty.playerDamage || 1) : 1,
    });

    const ix = 254, iy = 84, iw = 370, ih = 238;
    ctx.fillStyle = 'rgba(12, 10, 26, 0.96)';
    ctx.fillRect(ix, iy, iw, ih);
    ctx.strokeStyle = '#6e5838';
    ctx.strokeRect(ix + 0.5, iy + 0.5, iw - 1, ih - 1);

    // Big 2x pixel icon box
    ctx.fillStyle = '#080612';
    ctx.fillRect(ix + 12, iy + 10, 44, 44);
    ctx.strokeStyle = sw.element && ELEMENT_META[sw.element] ? ELEMENT_META[sw.element].color : '#8a9ab5';
    ctx.strokeRect(ix + 12.5, iy + 10.5, 43, 43);
    const bigIcon = getWeaponIconCanvas(sw.id);
    if (bigIcon) ctx.drawImage(bigIcon, ix + 14, iy + 12, 40, 40);

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
    f.draw(ctx, sw.desc, ix + 64, iy + 44, { color: '#c9c3b0', shadow, gothic: false });

    // Damage Matrix Badges (Physical + Elemental + Armor Piercing + Set Tag)
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
    if (sw.armorPiercing) {
      chipX = this._drawChip(ctx, chipX, chipY, 'PIERCES GUARD', '#ffd27a');
    }
    this._drawChip(ctx, chipX, chipY, `SET: ${(sw.setTag || 'NONE').toUpperCase()}`, '#b8a8ff');

    // Under the Hood: Stat Deficit Gate & Scaling Breakdown Box
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
      `STR SOURCES: BASE ${strInfo.base} + LV ${strInfo.levelBonus} + RELICS ${strInfo.relicStr} + VESSELS ${strInfo.vesselStr}`,
      sx0 + 8,
      sy0 + 35,
      { color: '#8a9ab5', shadow, gothic: false },
    );

    // Hidden Command Input (`[Down, Down-Right, Right] + Hand`) & Set Resonance
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
    const setRes = sw.setTag ? SET_RESONANCES[sw.setTag] : null;
    if (setRes && !sw.isTwoHanded) {
      f.draw(ctx, `L+R SET (${sw.setTag.toUpperCase()}): ${setRes.name}`, cx0 + 8, cy0 + 36, {
        color: setRes.hex, shadow, gothic: false,
      });
    } else if (sw.isTwoHanded) {
      f.draw(ctx, 'TWO-HANDED: MASSIVE 180° ARC · ROOTS FEET ON GROUND', cx0 + 8, cy0 + 36, {
        color: '#d9b36a', shadow, gothic: false,
      });
    }

    // Equip Action Buttons (`[X/K] EQUIP HAND L` and `[C/V/L] EQUIP HAND R`)
    const btnY = iy + 204;
    this._drawActionBtn(ctx, ix + 12, btnY, 168, 24, '[X / K] EQUIP HAND L', '#ffd27a', g.handL === sw.id);
    const rLabel = sw.isTwoHanded
      ? '[C / V] EQUIP 2H GRIP'
      : (g.handR === sw.id ? '[C / V] UNEQUIP R' : '[C / V / L] EQUIP HAND R');
    this._drawActionBtn(ctx, ix + 190, btnY, 168, 24, rLabel, '#62f2c2', !sw.isTwoHanded && g.handR === sw.id);

    // Bottom status / controls strip
    const footText = this.flashT > 0
      ? this.flashMsg
      : `FOUND ${list.length}/${WEAPON_ORDER.length} WEAPONS  ·  ↑↓ SELECT  ·  X HAND L  ·  C/V/L HAND R  ·  E / ESC CLOSE`;
    f.draw(ctx, footText, W / 2, 336, {
      align: 'center',
      color: this.flashT > 0 ? '#ffd27a' : '#9aa8c4',
      shadow,
      gothic: false,
    });

    ctx.restore();
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
