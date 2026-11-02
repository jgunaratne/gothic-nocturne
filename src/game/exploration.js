// Interconnected Castle Exploration: physical in-stage Passage Gateways
// between connected regions, ability-gated shortcut seals, Sanctuary Waystones
// (healing + fast-travel attunement), and 13 persistent Ancient Life Vessels
// hidden on Night-Wings high balconies and sunken vaults.

import { W, H, TILE, isMaterialTile } from '../engine/constants.js';
import { getFxLayers } from '../engine/fxlayers.js';
import { STAGES } from './stages.js';
import { THEMES } from './builder.js';
import { BOSS_RELICS } from './relics.js';
import { stageDoorsFor, stageIndexOf, canTraverseDoor } from './castlemap.js';
import { rectsOverlap } from './objects.js';
import { getGlowCanvas } from './tex3d.js';
import { WeaponPedestal } from './armory_ui.js';
import { STAGE_PEDESTAL_WEAPONS } from './weapons.js';

const ROYAL_HALL_STAGES = new Set([
  'arcade', 'library', 'cathedral', 'clocktower', 'throne', 'ballroom', 'alchemy',
]);

const HIGH_BALCONY_STAGES = new Set([
  'graveyard', 'jack', 'ramparts', 'ossuary', 'arcade', 'cathedral', 'ballroom', 'skykeep',
]);

/**
 * Returns true if a monumental portal centered on tile column `col` with
 * threshold row `gateRow` (`[wx - 44, wx + 44] × [wy - 128, wy + 4]`) intersects
 * any moving platform's sweep volume or hub gear.
 */
function overlapsMoverSweep(level, col, gateRow) {
  if (!level.movers || !level.movers.length) return false;
  const wx0 = col * TILE - 28, wx1 = (col + 1) * TILE + 28;
  const wy0 = gateRow * TILE - 128, wy1 = gateRow * TILE + 8;
  for (const m of level.movers) {
    const mx0 = m.kind === 'orbit' ? (m.cx - m.r - m.w * 0.5) : (Math.min(m.x0, m.x1) - m.w * 0.5);
    const mx1 = m.kind === 'orbit' ? (m.cx + m.r + m.w * 0.5) : (Math.max(m.x0, m.x1) + m.w * 0.5);
    const my0 = m.kind === 'orbit' ? (m.cy - m.r - 8) : (Math.min(m.y0, m.y1) - 4);
    const my1 = m.kind === 'orbit' ? (m.cy + m.r + 22) : (Math.max(m.y0, m.y1) + 22);
    if (mx1 >= wx0 && mx0 <= wx1 && my1 >= wy0 && my0 <= wy1) return true;
  }
  return false;
}

/**
 * Finds a safe, flat 3-tile solid material floor span near `targetCol` inside
 * `[minCol, maxCol]` that does not crowd any column in `usedCols` or overlap
 * spikes, lava, or boss arenas. Prefers columns outside moving-platform sweeps
 * first, falling back gracefully if the whole span is mechanical.
 */
function findSafeFloor(level, targetCol, minCol, maxCol, usedCols, needBalcony = false) {
  const lo = Math.max(4, minCol);
  const hi = Math.min(level.cols - 6, maxCol);
  const clamped = Math.max(lo, Math.min(hi, Math.round(targetCol)));

  for (const minSep of [6, 4]) {
    for (const avoidMovers of [true, false]) {
      for (let d = 0; d <= hi - lo; d++) {
        for (const sign of (d === 0 ? [1] : [1, -1])) {
          const c = clamped + sign * d;
          if (c < lo || c > hi) continue;
          if (usedCols.some((u) => Math.abs(u - c) < minSep)) continue;

          const row = level.surfaceRow(c);
          if (row < (needBalcony ? 7 : 4) || row >= level.rows - 1) continue;

          // Require 3 contiguous material floor tiles at the exact same elevation
          let ok = true;
          for (let tc = c - 1; tc <= c + 1; tc++) {
            if (!isMaterialTile(level.tile(tc, row))) { ok = false; break; }
            if (level.surfaceRow(tc) !== row) { ok = false; break; }
          }
          if (!ok) continue;

          // Require 4 full tiles (128px) of clear headroom for 124px monumental arches
          const topClear = needBalcony ? row - 8 : row - 4;
          if (topClear < 1) continue;
          for (let ty = topClear; ty <= row - 1; ty++) {
            for (let tc = c - 1; tc <= c + 1; tc++) {
              if (level.isSolid(tc, ty) || level.isSpike(tc, ty) || level.isLava(tc, ty)) {
                ok = false;
                break;
              }
            }
            if (!ok) break;
          }
          if (!ok) continue;

          const gateRow = (needBalcony && row >= 7) ? row - 5 : row;
          if (avoidMovers && overlapsMoverSweep(level, c, gateRow)) continue;

          return { col: c, row };
        }
      }
    }
  }
  return null;
}

/**
 * Finds the deepest safe sunken vault/alcove floor in `[minCol, maxCol]` (e.g.
 * `hiddenVault` or `descent` chambers) for hiding an Ancient Life Vessel.
 */
function findVaultFloor(level, minCol, maxCol, usedCols) {
  let best = null;
  const lo = Math.max(8, minCol);
  const hi = Math.min(level.cols - 10, maxCol);
  for (let c = lo; c <= hi; c++) {
    if (usedCols.some((u) => Math.abs(u - c) < 6)) continue;
    const row = level.surfaceRow(c);
    if (row < 5 || row >= level.rows - 1) continue;
    if (!isMaterialTile(level.tile(c - 1, row)) || !isMaterialTile(level.tile(c, row)) || !isMaterialTile(level.tile(c + 1, row))) continue;
    if (level.surfaceRow(c - 1) !== row || level.surfaceRow(c + 1) !== row) continue;
    if (level.isSolid(c, row - 1) || level.isSolid(c, row - 2) || level.isSpike(c, row - 1) || level.isLava(c, row - 1)) continue;
    // Prefer sunken vaults (larger `row`) or enclosed chambers (ceiling overhead)
    let hasRoof = false;
    for (let ty = Math.max(0, row - 6); ty <= row - 3; ty++) {
      if (level.isSolid(c, ty)) { hasRoof = true; break; }
    }
    const score = row * 3 + (hasRoof ? 8 : 0);
    if (!best || score > best.score) best = { col: c, row, score };
  }
  return best || findSafeFloor(level, Math.round((lo + hi) * 0.55), lo, hi, usedCols, false);
}

/**
 * Ornate Sanctuary Waystone: heals +4 HP once per visit and attunes the area
 * for Fast Travel on the `M` Castle Exploration Map.
 */
export class SanctuaryStone {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.usedThisVisit = false;
    this.near = false;
  }

  get box() { return { x: this.x - 18, y: this.y - 72, w: 36, h: 72 }; }

  update(player, world) {
    const dx = Math.abs(player.x - this.x);
    const dy = Math.abs(player.y - this.y);
    this.near = dx < 36 && dy < 44;
    if (dx < 24 && dy < 32 && !this.usedThisVisit) {
      this.usedThisVisit = true;
      world.onSanctuaryAttuned(this);
    }
  }

  draw(ctx, cam, font, time, world = null) {
    const sx = Math.round(this.x - cam.rx);
    const sy = Math.round(this.y - cam.ry);
    if (sx < -56 || sx > W + 56 || sy < -32 || sy > H + 84) return;
    const pulse = 0.5 + 0.5 * Math.sin(time * 4.2);
    const assets = world && world.assets;
    const sIdx = world && world.stage ? Math.max(0, (world.stage.id || 1) - 1) : 0;
    const disc = world && world.game ? ((world.game.discovered >>> sIdx) & 1) : 1;
    const lit = !!(this.usedThisVisit || disc);
    const frameName = lit ? 'sanctuary_lit' : 'sanctuary_idle';

    ctx.save();
    // Soft teal-cyan sanctuary aura
    const g = ctx.createRadialGradient(sx, sy - 38, 3, sx, sy - 38, lit ? 44 : 28);
    g.addColorStop(0, `rgba(98, 242, 194, ${((lit ? 0.30 : 0.12) + 0.14 * pulse).toFixed(3)})`);
    g.addColorStop(1, 'rgba(98, 242, 194, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(sx - 46, sy - 84, 92, 90);

    if (assets && assets.frame('shrines', frameName)) {
      assets.draw(ctx, 'shrines', frameName, sx, sy);
      if (lit) {
        const fxl = getFxLayers();
        if (fxl && fxl.enabled) {
          fxl.addAttack({
            x: sx, y: sy - 42 + Math.sin(time * 3.4) * 1.5,
            rx: 13, ry: 18, dirX: 0, dirY: -1, mode: 0, seed: this.x * 0.017,
            core: [0.85, 1.0, 0.96], rim: [0.18, 0.88, 0.78], alpha: 0.55 + 0.18 * pulse,
          });
        }
      }
      ctx.restore();
      return;
    }

    // Fallback geometry for headless unit tests without full sprite sheets
    ctx.fillStyle = '#2c334a';
    ctx.fillRect(sx - 6, sy - 36, 12, 36);
    ctx.fillStyle = '#62f2c2';
    ctx.fillRect(sx - 2, sy - 26, 4, 8);
    ctx.restore();
  }

  drawPrompt(ctx, cam, font) {
    if (!this.near) return;
    const sx = Math.round(this.x - cam.rx);
    const sy = Math.round(this.y - cam.ry);
    const lbl = 'SANCTUARY · M FOR MAP';
    const lw = font.width(lbl, 1, 1, false) + 10;
    const lx = Math.max(6, Math.min(W - lw - 6, Math.round(sx - lw / 2)));
    const ly = Math.max(48, sy - 86);
    ctx.save();
    ctx.fillStyle = 'rgba(6, 10, 20, 0.92)';
    ctx.fillRect(lx, ly, lw, 12);
    ctx.strokeStyle = '#62f2c2';
    ctx.strokeRect(lx + 0.5, ly + 0.5, lw - 1, 11);
    font.draw(ctx, lbl, lx + Math.round(lw / 2), ly + 2, {
      align: 'center',
      color: '#b8fff0',
      shadow: '#05040a',
      gothic: false,
    });
    ctx.restore();
  }
}

/**
 * Physical Passage Gateway linking two adjacent regions on the Castle Grid.
 * Press `↑` in front of an unsealed archway to travel directly into the
 * connected region (emerging at the matching archway on the other side!).
 */
export class PassageGate {
  constructor(desc, x, y) {
    this.id = desc.id;
    this.targetKey = desc.targetKey;
    this.gateRelic = desc.gateRelic || null;
    this.highLedge = !!desc.highLedge;
    this.cell = desc.cell;
    this.destCell = desc.destCell;
    this.x = x;
    this.y = y;
    this.near = false;
  }

  isOpen(world) {
    return canTraverseDoor(this, world.relics);
  }

  update(player, input, world) {
    if (world.bossActive || (world.boss && world.boss.introPose)) {
      this.near = false;
      return;
    }
    const dx = Math.abs(player.x - this.x);
    const dy = Math.abs(player.y - this.y);
    this.near = dx < 42 && dy < 34;
    if (this.near && player.onGround && player.hurtT <= 0 && input.pressed.up && !input.down.attack) {
      if (this.isOpen(world)) {
        world.traversePassage(this);
      } else {
        const relic = BOSS_RELICS[this.gateRelic];
        world.sfx('block');
        world.particles.sparks(this.x, this.y - 30, 10, relic ? relic.color : '#ff6a88');
        if (relic) {
          world.showMessage('SEALED PASSAGE', `NEEDS ${relic.name} (${relic.short})`, 2.2);
        }
      }
    }
  }

  draw(ctx, cam, font, world, time) {
    const sx = Math.round(this.x - cam.rx);
    const sy = Math.round(this.y - cam.ry);
    if (sx < -80 || sx > W + 80 || sy < -20 || sy > H + 150) return;

    const destIdx = stageIndexOf(this.targetKey);
    const destStage = STAGES[destIdx];
    const destTheme = destStage ? (THEMES[destStage.theme] || THEMES.graveyard) : THEMES.graveyard;
    const open = this.isOpen(world);
    const relic = this.gateRelic ? BOSS_RELICS[this.gateRelic] : null;
    const accent = open ? (destTheme.accent || '#8ab4ff') : (relic ? relic.color : '#ff5a78');
    const pulse = 0.5 + 0.5 * Math.sin(time * 4.4 + this.x * 0.03);
    const isRoyal = open && (ROYAL_HALL_STAGES.has(world.stage.key) || ROYAL_HALL_STAGES.has(this.targetKey));
    const frameName = !open ? 'sealed' : (isRoyal ? 'royal' : 'open');
    const assets = world.assets;
    const doorFrame = assets && assets.frame ? assets.frame('grand_doors', frameName) : null;

    ctx.save();

    // 1. Atmospheric backlight halo behind the monumental portal
    const archH = doorFrame ? doorFrame.h : 118;
    const g = ctx.createRadialGradient(sx, sy - 54, 8, sx, sy - 54, 62);
    g.addColorStop(
      0,
      open
        ? (isRoyal ? `rgba(255, 196, 108, ${(0.24 + 0.10 * pulse).toFixed(3)})` : `rgba(116, 162, 255, ${(0.24 + 0.10 * pulse).toFixed(3)})`)
        : `rgba(218, 72, 148, ${(0.28 + 0.12 * pulse).toFixed(3)})`,
    );
    g.addColorStop(1, 'rgba(12, 10, 28, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(sx - 66, sy - archH - 12, 132, archH + 22);

    // 2. Monumental Nano Banana Gothic Portal Doorway sprite (`open`, `sealed`, or `royal`)
    if (doorFrame && assets.img && assets.img('grand_doors')) {
      // Grounding plinth shadow
      ctx.fillStyle = 'rgba(4, 3, 10, 0.52)';
      ctx.fillRect(sx - 38, sy - 2, 76, 5);

      assets.draw(ctx, 'grand_doors', frameName, sx, sy + 2);

      // Warm candle/lantern light pools & living WebGL shader flames on the twin pier sconces
      const glow = getGlowCanvas(open ? 'amber' : 'crimson');
      if (glow) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.22 + 0.06 * pulse;
        ctx.drawImage(glow, sx - 48, sy - 76, 40, 40);
        ctx.drawImage(glow, sx + 8, sy - 76, 40, 40);
        if (!open) {
          ctx.globalAlpha = 0.28 + 0.14 * pulse;
          ctx.drawImage(glow, sx - 26, sy - 64, 52, 52);
        }
        ctx.restore();
      }
      const fxl = getFxLayers();
      if (fxl) {
        const sconceX = isRoyal ? 23 : 28;
        const sconceY = isRoyal ? 56 : 49;
        fxl.addFlame(sx - sconceX, sy - sconceY, 6, 10, [1.0, 0.62, 0.18], this.x * 0.07);
        fxl.addFlame(sx + sconceX, sy - sconceY, 6, 10, [1.0, 0.62, 0.18], this.x * 0.07 + 2.1);
      }

      // Subtle animated portal motes / arcane lock pulse inside the doorway opening
      if (open) {
        for (let i = 0; i < 5; i++) {
          const wy = sy - 14 - ((Math.round(time * 19 + i * 13)) % 56);
          const wx = sx - 8 + Math.round(Math.sin(time * 2.6 + i * 1.6) * 6);
          ctx.fillStyle = i % 2 === 0 ? accent : '#eef4ff';
          ctx.globalAlpha = 0.55 + 0.35 * pulse;
          ctx.fillRect(wx, wy, 2, 2);
        }
        ctx.globalAlpha = 1;
        if (this.near) {
          ctx.fillStyle = `rgba(255, 224, 140, ${(0.12 + 0.10 * pulse).toFixed(3)})`;
          ctx.fillRect(sx - 12, sy - 74, 24, 66);
        }
      } else {
        // Pulsing relic-colored arcane core on the central chain medallion
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.55 + 0.35 * pulse;
        ctx.fillRect(sx - 3, sy - 42, 6, 6);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sx - 1, sy - 40, 2, 2);
        ctx.globalAlpha = 1;
      }
    } else {
      // Fallback geometry for headless unit tests without loaded raster sheets
      ctx.fillStyle = '#24283d';
      ctx.fillRect(sx - 28, sy - 96, 56, 96);
      ctx.fillStyle = open ? '#0a1026' : accent;
      ctx.fillRect(sx - 16, sy - 78, 32, 74);
    }

    ctx.restore();
  }

  drawPrompt(ctx, cam, font, world) {
    if (!this.near) return;
    const destIdx = stageIndexOf(this.targetKey);
    const destStage = STAGES[destIdx];
    if (!destStage) return;
    const destTheme = THEMES[destStage.theme] || THEMES.graveyard;
    const open = this.isOpen(world);
    const relic = this.gateRelic ? BOSS_RELICS[this.gateRelic] : null;
    const accent = open ? (destTheme.accent || '#8ab4ff') : (relic ? relic.color : '#ff5a78');
    const isRoyal = open && (ROYAL_HALL_STAGES.has(world.stage.key) || ROYAL_HALL_STAGES.has(this.targetKey));
    const doorH = !open ? 124 : (isRoyal ? 110 : 124);
    const sx = Math.round(this.x - cam.rx);
    const sy = Math.round(this.y - cam.ry);
    const shortDest = destStage.name.replace(/^THE /, '');
    const topLine = open
      ? `↑ ENTER ${shortDest}`
      : `SEALED · NEEDS ${relic ? relic.name : 'RELIC'}`;
    const lw = font.width(topLine, 1, 1, false) + 12;
    const lx = Math.max(6, Math.min(W - lw - 6, Math.round(sx - lw / 2)));
    const ly = Math.max(46, sy - doorH - 14);
    ctx.save();
    ctx.fillStyle = 'rgba(6, 5, 16, 0.94)';
    ctx.fillRect(lx, ly, lw, 13);
    ctx.strokeStyle = accent;
    ctx.strokeRect(lx + 0.5, ly + 0.5, lw - 1, 12);
    font.draw(ctx, topLine, lx + Math.round(lw / 2), ly + 3, {
      align: 'center',
      color: open ? '#ffd27a' : accent,
      shadow: '#05040a',
      gothic: false,
    });
    ctx.restore();
  }
}

/**
 * Hidden Ancient Life Vessel: 1 per stage. Permanently grants +1 Max HP and
 * +2 Starting Hearts across the entire hunt and marks the area's golden
 * Vessel pip on the Castle Exploration Map.
 */
export class AncientVessel {
  constructor(stageIndex, x, y, highBalcony = false) {
    this.stageIndex = stageIndex;
    this.x = x;
    this.y = y;
    this.highBalcony = highBalcony;
  }

  isCollected(world) {
    const v = world.game && world.game.vessels ? world.game.vessels : 0;
    return !!((v >>> this.stageIndex) & 1);
  }

  get box() { return { x: this.x - 16, y: this.y - 60, w: 32, h: 60 }; }

  update(player, world) {
    const dist = Math.hypot(player.x - this.x, player.y - this.y);
    if (dist < 64) world.inSecretArea = true;
    if (!this.isCollected(world) && rectsOverlap(this.box, player.box())) {
      world.onVesselCollected(this);
    }
  }

  draw(ctx, cam, font, world, time) {
    const sx = Math.round(this.x - cam.rx);
    const sy = Math.round(this.y - cam.ry);
    if (sx < -48 || sx > W + 48 || sy < -30 || sy > H + 70) return;

    const taken = this.isCollected(world);
    const pulse = 0.5 + 0.5 * Math.sin(time * 4.8);
    const assets = world && world.assets;
    const frameName = taken ? 'vessel_empty' : 'vessel_full';
    ctx.save();

    if (assets && assets.frame('shrines', frameName)) {
      if (!taken) {
        const cy = sy - 50;
        const g = ctx.createRadialGradient(sx, cy, 2, sx, cy, 32);
        g.addColorStop(0, `rgba(255, 222, 110, ${(0.40 + 0.18 * pulse).toFixed(3)})`);
        g.addColorStop(1, 'rgba(255, 180, 60, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(sx - 34, cy - 34, 68, 68);
        const fxl = getFxLayers();
        if (fxl && fxl.enabled) {
          fxl.addAttack({
            x: sx, y: sy - 52, rx: 14, ry: 18, dirX: 0, dirY: -1, mode: 0, seed: this.stageIndex * 3.1,
            core: [1.0, 0.96, 0.72], rim: [1.0, 0.62, 0.16], alpha: 0.58 + 0.18 * pulse,
          });
        }
      } else {
        const fxl = getFxLayers();
        if (fxl && fxl.enabled) fxl.addFlame(sx, sy - 45, 8, 11, [1.0, 0.75, 0.3], this.stageIndex + 0.5);
      }
      assets.draw(ctx, 'shrines', frameName, sx, sy);
      ctx.restore();
      return;
    }

    // Fallback geometry for headless tests
    ctx.fillStyle = '#201d2e';
    ctx.fillRect(sx - 10, sy - 10, 20, 10);
    if (!taken) {
      ctx.fillStyle = '#ffd25a';
      ctx.fillRect(sx - 6, sy - 26, 12, 10);
    }
    ctx.restore();
  }
}

/**
 * Enforces Section 3.2 Mandatory Doorway & Sanctuary Safe Buffers (`[col - 4, col + 4] × 3 tiles`)
 * plus calm `SAVE_ROOM` zones (`0` enemies, `0` active spawners within `100px` trigger range).
 */
export function enforceSafeBuffers(world, safeWindows) {
  if (!world || !safeWindows || !safeWindows.length) return;

  for (const win of safeWindows) {
    const bufX0 = win.x0Px;
    const bufX1 = win.x1Px;

    if (Array.isArray(world.enemies)) {
      world.enemies = world.enemies.filter((e) => {
        if (!e || e === world.boss) return true;
        if (e.x >= bufX0 - 16 && e.x <= bufX1 + 16) return false;
        if (e.x < bufX0 - 16 && typeof e.maxX === 'number' && e.maxX > bufX0 - 16) {
          e.maxX = Math.max(typeof e.minX === 'number' ? e.minX : 0, bufX0 - 16);
        }
        if (e.x > bufX1 + 16 && typeof e.minX === 'number' && e.minX < bufX1 + 16) {
          e.minX = Math.min(typeof e.maxX === 'number' ? e.maxX : Infinity, bufX1 + 16);
        }
        return true;
      });
    }

    if (Array.isArray(world.spawners)) {
      const cut0 = bufX0 - 104;
      const cut1 = bufX1 + 104;
      const nextSpawners = [];
      for (const sp of world.spawners) {
        if (sp.x1 <= cut0 || sp.x0 >= cut1) {
          nextSpawners.push(sp);
          continue;
        }
        if (sp.x0 < cut0 && cut0 - sp.x0 >= 64) {
          const leftSp = Object.assign(Object.create(Object.getPrototypeOf(sp)), sp, {
            x0: sp.x0,
            x1: cut0,
            alive: [],
          });
          nextSpawners.push(leftSp);
        }
        if (sp.x1 > cut1 && sp.x1 - cut1 >= 64) {
          const rightSp = Object.assign(Object.create(Object.getPrototypeOf(sp)), sp, {
            x0: cut1,
            x1: sp.x1,
            alive: [],
          });
          nextSpawners.push(rightSp);
        }
      }
      world.spawners = nextSpawners;
    }
  }
}

/**
 * Populates `world` with its Sanctuary Waystone, connected Passage Gateways,
 * ability-gated high balconies, hidden Ancient Life Vessel, and Weapon Pedestal,
 * honoring authored Section-5 anchors (`sanctuaryAnchor`, `doorAnchors`, `vesselAnchor`)
 * and enforcing Section 3.2 `4x3` Doorway Safe Buffers.
 */
export function populateExploration(world) {
  const level = world.level;
  const stage = world.stage;
  const stageIdx = Math.max(0, (stage.id || 1) - 1);
  const bossTriggerCol = stage.boss
    ? Math.floor(stage.boss.triggerX / TILE) - 6
    : level.cols - 12;
  const usedCols = [Math.floor(stage.start.x / TILE)];
  const safeWindows = [];
  let addedPlatforms = false;

  // 1. Sanctuary Waystone (1 per biome near the biome's geometric center, never adjacent to SAVE_ROOM)
  let sanctuary = null;
  if (stage.sanctuaryAnchor && stage.sanctuaryAnchor.col != null) {
    const sc = stage.sanctuaryAnchor.col;
    const sr = stage.sanctuaryAnchor.row != null ? stage.sanctuaryAnchor.row : level.surfaceRow(sc);
    sanctuary = new SanctuaryStone(sc * TILE + 16, sr * TILE);
    usedCols.push(sc);
    safeWindows.push({ x0Px: (sc - 4) * TILE, x1Px: (sc + 5) * TILE });
  } else {
    const midTarget = Math.max(10, Math.round(bossTriggerCol * 0.44));
    const sancSpot = findSafeFloor(level, midTarget, 8, Math.max(12, bossTriggerCol - 24), usedCols, false);
    if (sancSpot) {
      sanctuary = new SanctuaryStone(sancSpot.col * TILE + 16, sancSpot.row * TILE);
      usedCols.push(sancSpot.col);
      safeWindows.push({ x0Px: (sancSpot.col - 4) * TILE, x1Px: (sancSpot.col + 5) * TILE });
    }
  }

  // 2. Connected Area Passage Gateways (matching MAP_DOORS & authored doorAnchors)
  const passages = [];
  const doorDescs = stageDoorsFor(stage.key);
  for (const desc of doorDescs) {
    const authored = stage.doorAnchors && stage.doorAnchors[desc.id];
    if (authored) {
      const col = authored.col;
      const floorRow = authored.floorRow != null ? authored.floorRow : level.surfaceRow(col);
      const needBalcony = !!(desc.highLedge || authored.highLedge);
      let gateRow = authored.gateRow != null ? authored.gateRow : floorRow;
      if (needBalcony) {
        if (authored.gateRow == null && floorRow >= 7) gateRow = floorRow - 5;
        if (!isMaterialTile(level.tile(col, gateRow))) {
          level.platform(Math.max(2, col - 4), Math.min(level.cols - 3, col + 4), gateRow);
          addedPlatforms = true;
        }
      }
      usedCols.push(col);
      passages.push(new PassageGate(desc, col * TILE + 16, gateRow * TILE));
      safeWindows.push({ x0Px: (col - 4) * TILE, x1Px: (col + 5) * TILE });
      continue;
    }

    const targetCol = Math.round(4 + desc.atFrac * (bossTriggerCol - 6));
    const needBalcony = !!desc.highLedge;
    const spot = findSafeFloor(level, targetCol, 4, bossTriggerCol, usedCols, needBalcony)
      || (needBalcony ? findSafeFloor(level, targetCol, 4, bossTriggerCol, usedCols, false) : null);
    if (!spot) continue;
    usedCols.push(spot.col);
    let gateRow = spot.row;
    if (needBalcony && spot.row >= 7 && !level.isSolid(spot.col, spot.row - 5)) {
      gateRow = spot.row - 5;
      const p0 = !level.isSolid(spot.col - 2, gateRow) ? spot.col - 2 : spot.col - 1;
      const p1 = !level.isSolid(spot.col + 2, gateRow) ? spot.col + 2 : spot.col + 1;
      level.platform(p0, p1, gateRow);
      addedPlatforms = true;
    }
    passages.push(new PassageGate(desc, spot.col * TILE + 16, gateRow * TILE));
    safeWindows.push({ x0Px: (spot.col - 4) * TILE, x1Px: (spot.col + 5) * TILE });
  }

  // 3. Hidden Ancient Life Vessel (either 5-tile Night-Wings high balcony or sunken vault)
  let vessel = null;
  if (stage.vesselAnchor && stage.vesselAnchor.col != null) {
    const vc = stage.vesselAnchor.col;
    const vr = stage.vesselAnchor.row;
    const highB = !!stage.vesselAnchor.highBalcony;
    if (highB) {
      level.platform(vc - 2, vc + 2, vr);
      addedPlatforms = true;
    }
    usedCols.push(vc);
    vessel = new AncientVessel(stageIdx, vc * TILE + 16, vr * TILE, highB);
  } else {
    const wantHigh = HIGH_BALCONY_STAGES.has(stage.key);
    if (wantHigh) {
      const midCol = Math.round(bossTriggerCol * 0.52);
      const spot = findSafeFloor(level, midCol, 16, bossTriggerCol - 6, usedCols, true);
      if (spot) {
        usedCols.push(spot.col);
        const bRow = spot.row - 5;
        level.platform(spot.col - 1, spot.col + 1, bRow);
        addedPlatforms = true;
        vessel = new AncientVessel(stageIdx, spot.col * TILE + 16, bRow * TILE, true);
      }
    }
    if (!vessel) {
      const spot = findVaultFloor(level, Math.round(bossTriggerCol * 0.32), bossTriggerCol - 6, usedCols);
      if (spot) {
        usedCols.push(spot.col);
        vessel = new AncientVessel(stageIdx, spot.col * TILE + 16, spot.row * TILE, false);
      }
    }
  }

  // 4. Signature Arsenal Pedestal (1 per castle region, placed on an authored Armory Dais or safe plinth)
  let pedestal = null;
  const pedestalWeaponId = STAGE_PEDESTAL_WEAPONS[stage.key] || null;
  if (pedestalWeaponId) {
    if (stage.pedestalAnchor && stage.pedestalAnchor.col != null) {
      const pc = stage.pedestalAnchor.col;
      const pr = stage.pedestalAnchor.row != null ? stage.pedestalAnchor.row : level.surfaceRow(pc);
      usedCols.push(pc);
      pedestal = new WeaponPedestal(pedestalWeaponId, pc * TILE + 16, pr * TILE);
      safeWindows.push({ x0Px: (pc - 3) * TILE, x1Px: (pc + 4) * TILE });
    } else {
      const pedSpot = findSafeFloor(level, Math.round(bossTriggerCol * 0.34), 12, Math.max(18, bossTriggerCol - 24), usedCols, false);
      if (pedSpot) {
        usedCols.push(pedSpot.col);
        pedestal = new WeaponPedestal(pedestalWeaponId, pedSpot.col * TILE + 16, pedSpot.row * TILE);
        safeWindows.push({ x0Px: (pedSpot.col - 3) * TILE, x1Px: (pedSpot.col + 4) * TILE });
      }
    }
  }

  // 5. Also include any authored SAVE_ROOMs in safeWindows (`0` enemies, `0` spawners)
  if (Array.isArray(stage.roomSchema)) {
    for (const rm of stage.roomSchema) {
      if (rm.save_room) {
        safeWindows.push({
          x0Px: rm.bounds.x0 * TILE,
          x1Px: (rm.bounds.x1 + 1) * TILE,
        });
      }
    }
  }

  enforceSafeBuffers(world, safeWindows);

  if (addedPlatforms) level.recompute();

  return { sanctuary, passages, vessel, pedestal };
}
