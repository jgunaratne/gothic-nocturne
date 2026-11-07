// Interconnected Castle Exploration: physical in-stage Passage Gateways
// between connected regions, ability-gated shortcut seals, Sanctuary Waystones
// (healing + fast-travel attunement), and 13 persistent Ancient Life Vessels
// hidden on Night-Wings high balconies and sunken vaults.

import { W, H, TILE, T_EMPTY, T_BLOCK, T_GATE, isMaterialTile } from '../engine/constants.js';
import { getFxLayers } from '../engine/fxlayers.js';
import { STAGES } from './stages.js';
import { THEMES } from './builder.js';
import { BOSS_RELICS } from './relics.js';
import { MAP_ROOMS, stageDoorsFor, stageIndexOf, canTraverseDoor, isCleared, nextAdjacentStageKey } from './castlemap.js';
import { bossGateStatus, stageEntryLock, canEnterStage, DEFAULT_DEBUG_FLAGS } from './gates.js';
import { rectsOverlap } from './objects.js';
import { getGlowCanvas } from './tex3d.js';
import { WeaponPedestal } from './armory_ui.js';
import { STAGE_PEDESTAL_WEAPONS } from './weapons.js';
import { SOUL_GLYPHS, SOUL_TYPES, SoulOrb } from './souls.js';

const ROYAL_HALL_STAGES = new Set([
  'arcade', 'library', 'cathedral', 'clocktower', 'throne', 'ballroom', 'alchemy', 'observatory',
]);

const HIGH_BALCONY_STAGES = new Set([
  'graveyard', 'jack', 'ramparts', 'ossuary', 'arcade', 'cathedral', 'ballroom', 'skykeep', 'conservatory', 'observatory',
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
    // Crimson Save Sanctum aura & sacred polyhedron light rays
    const g = ctx.createRadialGradient(sx, sy - 40, 3, sx, sy - 40, lit ? 48 : 30);
    g.addColorStop(0, `rgba(232, 46, 86, ${((lit ? 0.34 : 0.14) + 0.14 * pulse).toFixed(3)})`);
    g.addColorStop(0.55, `rgba(176, 22, 64, ${(lit ? 0.16 : 0.06).toFixed(3)})`);
    g.addColorStop(1, 'rgba(176, 22, 64, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(sx - 50, sy - 90, 100, 96);

    if (assets && assets.frame('shrines', frameName)) {
      assets.draw(ctx, 'shrines', frameName, sx, sy);
      // Floating crimson save polyhedron above the shrine
      const pyPoly = Math.round(sy - 56 + Math.sin(time * 3.2) * 3);
      ctx.fillStyle = lit ? '#ff3c64' : '#8a2442';
      ctx.beginPath();
      ctx.moveTo(sx, pyPoly - 9);
      ctx.lineTo(sx + 6, pyPoly);
      ctx.lineTo(sx, pyPoly + 9);
      ctx.lineTo(sx - 6, pyPoly);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffe6ee';
      ctx.fillRect(sx - 2, pyPoly - 3, 4, 6);
      if (lit) {
        const fxl = getFxLayers();
        if (fxl && fxl.enabled) {
          fxl.addAttack({
            x: sx, y: pyPoly,
            rx: 14, ry: 20, dirX: 0, dirY: -1, mode: 0, seed: this.x * 0.017,
            core: [1.0, 0.88, 0.92], rim: [0.96, 0.16, 0.34], alpha: 0.58 + 0.18 * pulse,
          });
        }
      }
      ctx.restore();
      return;
    }

    // Fallback geometry for headless unit tests without full sprite sheets
    ctx.fillStyle = '#361c28';
    ctx.fillRect(sx - 6, sy - 36, 12, 36);
    ctx.fillStyle = '#ff3c64';
    ctx.fillRect(sx - 2, sy - 26, 4, 8);
    ctx.restore();
  }

  drawPrompt(ctx, cam, font) {
    if (!this.near) return;
    const sx = Math.round(this.x - cam.rx);
    const sy = Math.round(this.y - cam.ry);
    const lbl = 'CRIMSON SAVE SANCTUM · HP RESTORED';
    const lw = font.width(lbl, 1, 1, false) + 10;
    const lx = Math.max(6, Math.min(W - lw - 6, Math.round(sx - lw / 2)));
    const ly = Math.max(48, sy - 86);
    ctx.save();
    ctx.fillStyle = 'rgba(18, 6, 12, 0.92)';
    ctx.fillRect(lx, ly, lw, 12);
    ctx.strokeStyle = '#ff4a6e';
    ctx.strokeRect(lx + 0.5, ly + 0.5, lw - 1, 11);
    font.draw(ctx, lbl, lx + Math.round(lw / 2), ly + 2, {
      align: 'center',
      color: '#ffd6e0',
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

  /**
   * Resolves the destination stage for this doorway so that if its static link
   * points back to an already-completed or already-visited stage (such as
   * returning from Darkwood/Jack back to Graveyard), the doorway progresses
   * forward to a nearby uncompleted stage instead.
   */
  effectiveTargetKey(world) {
    if (!world || !world.stage) return this.targetKey;
    if (this.targetKey === 'throne') return 'throne';
    const game = world.game;
    const cleared = game ? (game.cleared || 0) : 0;
    const visited = game && game.visitedStages ? game.visitedStages : null;
    const debug = game && game.debug ? game.debug : DEFAULT_DEBUG_FLAGS;
    const targetCleared = isCleared(this.targetKey, cleared);
    const targetVisited = this.targetKey === 'graveyard' || !!(visited && visited.has(this.targetKey));
    if (!targetCleared && !targetVisited) {
      return this.targetKey;
    }
    const canEnter = (key) => canEnterStage(key, cleared, debug);
    const next = nextAdjacentStageKey(world.stage.key, cleared, world.relics, canEnter, visited);
    return next || this.targetKey;
  }

  /** Relic seal lifted (or debug `UNLOCK ALL AREAS` on)? */
  relicOpen(world) {
    if (world.allAreasUnlocked) return true;
    const eff = this.effectiveTargetKey(world);
    if (eff !== this.targetKey) return true;
    return canTraverseDoor(this, world.relics);
  }

  /** The Count's hall stays barred until every other guardian has fallen. */
  entryLock(world) {
    const game = world.game;
    const cleared = game ? (game.cleared || 0) : 0;
    const debug = game && game.debug ? game.debug : DEFAULT_DEBUG_FLAGS;
    return stageEntryLock(this.effectiveTargetKey(world), cleared, debug);
  }

  isOpen(world) {
    return this.relicOpen(world) && !this.entryLock(world);
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
      } else if (!this.relicOpen(world)) {
        const relic = BOSS_RELICS[this.gateRelic];
        world.sfx('block');
        world.particles.sparks(this.x, this.y - 30, 10, relic ? relic.color : '#ff6a88');
        if (relic) {
          world.showMessage('SEALED PASSAGE', `NEEDS ${relic.name} (${relic.short})`, 2.2);
        }
      } else {
        const lock = this.entryLock(world);
        world.sfx('block');
        world.particles.sparks(this.x, this.y - 30, 12, '#c23b4a');
        if (lock) world.showMessage(lock.title, lock.sub, 2.4);
      }
    }
  }

  draw(ctx, cam, font, world, time) {
    const sx = Math.round(this.x - cam.rx);
    const sy = Math.round(this.y - cam.ry);
    if (sx < -80 || sx > W + 80 || sy < -20 || sy > H + 150) return;

    const effTarget = this.effectiveTargetKey(world);
    const destIdx = stageIndexOf(effTarget);
    const destStage = STAGES[destIdx];
    const destTheme = destStage ? (THEMES[destStage.theme] || THEMES.graveyard) : THEMES.graveyard;
    const open = this.isOpen(world);
    const relic = this.gateRelic ? BOSS_RELICS[this.gateRelic] : null;
    const accent = open ? (destTheme.accent || '#8ab4ff') : (relic ? relic.color : '#ff5a78');
    const pulse = 0.5 + 0.5 * Math.sin(time * 4.4 + this.x * 0.03);
    const isRoyal = open && (ROYAL_HALL_STAGES.has(world.stage.key) || ROYAL_HALL_STAGES.has(effTarget));
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
    const effTarget = this.effectiveTargetKey(world);
    const destIdx = stageIndexOf(effTarget);
    const destStage = STAGES[destIdx];
    if (!destStage) return;
    const destTheme = THEMES[destStage.theme] || THEMES.graveyard;
    const open = this.isOpen(world);
    const relic = this.gateRelic ? BOSS_RELICS[this.gateRelic] : null;
    const countSealed = !open && this.relicOpen(world);   // relic seal lifted, but the Count's hall is still barred
    const accent = open ? (destTheme.accent || '#8ab4ff') : (countSealed ? '#c23b4a' : (relic ? relic.color : '#ff5a78'));
    const isRoyal = open && (ROYAL_HALL_STAGES.has(world.stage.key) || ROYAL_HALL_STAGES.has(effTarget));
    const doorH = !open ? 124 : (isRoyal ? 110 : 124);
    const sx = Math.round(this.x - cam.rx);
    const sy = Math.round(this.y - cam.ry);
    const shortDest = destStage.name.replace(/^THE /, '');
    const lock = countSealed ? this.entryLock(world) : null;
    const topLine = open
      ? `↑ ENTER ${shortDest}`
      : (lock ? `SEALED · ${lock.sub}` : `SEALED · NEEDS ${relic ? relic.name : 'RELIC'}`);
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

const GOLD_SECRET_WEAPONS = [
  'nebula_whipsword',
  'herald_shield_rod',
  'meteor_gauntlets',
  'prism_codex',
  'astral_rune_sword',
  'crimson_bloodblade',
  'helios_rod',
  'zephyr_galeblade',
  'solais_greatsword',
  'thanatos_scythe',
];

const STAGE_SIGNATURE_SOULS = {
  graveyard:    'phantom_axes',
  darkwood:     'flea_agility',
  jack:         'hellfire_triad',
  yule:         'glacial_spear',
  skykeep:      'sovereign_ring',
  ramparts:     'severed_helm',
  coliseum:     'golem_might',
  ballroom:     'blood_feast',
  alchemy:      'nova_ray',
  aqueduct:     'aegis_familiar',
  arcade:       'scholar_fortune',
  cathedral:    'talisman_bolt',
  throne:       'sovereign_ring',
  library:      'wraith_shroud',
  clocktower:   'bat_echo',
  catacombs:    'bone_pyre',
  ossuary:      'petrify_gaze',
  darkcave:     'bone_pyre',
  conservatory: 'petrify_gaze',
  dungeon:      'severed_helm',
  observatory:  'nova_ray',
};

/**
 * Golden Astral Warp Chamber (`WarpMirror`): dedicated fast-travel portal ring
 * decoupled from Crimson Save Sanctums. Stepping nearby attunes the stage's
 * Golden Warp cell on the map; pressing `↑` opens the Castle Map for fast travel.
 */
export class WarpMirror {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.near = false;
    this.attunedThisVisit = false;
  }

  update(player, input, world) {
    if (world.bossActive) { this.near = false; return; }
    const dx = Math.abs(player.x - this.x);
    const dy = Math.abs(player.y - this.y);
    this.near = dx < 38 && dy < 40;
    if (dx < 30 && dy < 34 && !this.attunedThisVisit) {
      this.attunedThisVisit = true;
      const sIdx = Math.max(0, (world.stage.id || 1) - 1);
      const wasNew = world.game && world.game.discoverStage ? world.game.discoverStage(sIdx) : false;
      const rm = MAP_ROOMS[world.stage.key];
      if (rm && rm.warpKey && world.game && world.game.markCellsExplored) {
        world.game.markCellsExplored([rm.warpKey]);
      }
      if (wasNew) {
        world.sfx('pickup');
        world.particles.sparks(this.x, this.y - 42, 14, '#ffd84d');
        world.emitShockwave(this.x, this.y - 42, { maxR: 104, dur: 0.42, strength: 0.5, color: [1.0, 0.84, 0.28] });
      }
    }
    if (this.near && player.onGround && player.hurtT <= 0 && input && input.pressed && input.pressed.up && !(input.down && input.down.attack)) {
      if (world.game && world.game.openMap) {
        world.sfx('select');
        world.game.openMap();
      }
    }
  }

  draw(ctx, cam, font, time, world = null) {
    const sx = Math.round(this.x - cam.rx);
    const sy = Math.round(this.y - cam.ry);
    if (sx < -64 || sx > W + 64 || sy < -20 || sy > H + 110) return;
    const pulse = 0.5 + 0.5 * Math.sin(time * 4.6);
    const assets = world && world.assets;
    const fxl = getFxLayers();
    const cy = sy - 46;

    ctx.save();
    // Ambient golden-cyan portal halo
    const g = ctx.createRadialGradient(sx, cy, 4, sx, cy, 52);
    g.addColorStop(0, `rgba(255, 214, 92, ${(0.34 + 0.14 * pulse).toFixed(3)})`);
    g.addColorStop(0.55, `rgba(92, 224, 255, ${(0.16 + 0.08 * pulse).toFixed(3)})`);
    g.addColorStop(1, 'rgba(12, 10, 28, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(sx - 54, sy - 98, 108, 104);

    // Swirling dimensional vortex shader inside the gilded astral mirror aperture
    if (fxl && fxl.enabled && fxl.vortex) {
      fxl.vortex(ctx, {
        x: sx, y: cy + 2, rx: 16, ry: 27, open: 1.0, seed: (this.x * 0.013) % 6.28,
        core: [0.88, 0.99, 1.0], rim: [1.0, 0.78, 0.22], alpha: 0.90,
      });
    }

    const mirrorFr = assets && assets.frame && assets.frame('exploration_props', 'warp_mirror_arch');
    if (mirrorFr && assets.img('exploration_props')) {
      ctx.fillStyle = 'rgba(4, 3, 10, 0.52)';
      ctx.fillRect(sx - 26, sy - 2, 52, 4);
      assets.draw(ctx, 'exploration_props', 'warp_mirror_arch', sx, sy + 2);
      for (let i = 0; i < 4; i++) {
        const my = sy - 14 - ((Math.round(time * 22 + i * 16)) % 58);
        const mx = sx - 8 + ((i * 5 + Math.round(Math.sin(time * 3 + i) * 4)));
        ctx.fillStyle = i % 2 === 0 ? '#ffe88a' : '#8ef5ff';
        ctx.fillRect(mx, my, 2, 2);
      }
      if (fxl && fxl.enabled) {
        fxl.addAttack({
          x: sx, y: cy, rx: 15, ry: 24, dirX: 0, dirY: -1, mode: 0, seed: this.x * 0.013,
          core: [0.86, 0.98, 1.0], rim: [1.0, 0.78, 0.18], alpha: 0.44 + 0.16 * pulse,
        });
      }
      void font;
      ctx.restore();
      return;
    }

    // Fallback geometry for headless tests without raster sheets
    ctx.fillStyle = '#241e30';
    ctx.fillRect(sx - 24, sy - 6, 48, 6);
    ctx.strokeStyle = '#d49b28';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(sx, cy, 18, 30, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#58d8ff';
    ctx.fillRect(sx - 4, cy - 8, 8, 16);
    void font;
    ctx.restore();
  }

  drawPrompt(ctx, cam, font) {
    if (!this.near) return;
    const sx = Math.round(this.x - cam.rx);
    const sy = Math.round(this.y - cam.ry);
    drawDoorPrompt(ctx, font, sx, Math.max(46, sy - 98), '↑ ASTRAL WARP PORTAL · FAST TRAVEL', {
      color: '#fff2b2',
      border: '#e0a428',
    });
  }
}

/**
 * Suspended Iron-and-Cobalt Lodestone Ring (`MagnetNode`): allows aerial magnetic
 * tether & high-velocity directional slingshot (`Q` / `LB` or `↑` while airborne).
 */
export class MagnetNode {
  constructor(x, y, level = null) {
    this.x = x;
    this.y = y;
    this.inRange = false;
    this.active = false;
    this.ceilY = y - 84;
    if (level) {
      const tx = Math.max(0, Math.min(level.cols - 1, Math.floor(x / TILE)));
      const startR = Math.floor(y / TILE) - 1;
      let hitCeil = -1;
      for (let r = startR; r >= 0; r--) {
        if (level.isSolid(tx, r)) { hitCeil = (r + 1) * TILE; break; }
      }
      if (hitCeil >= 0) {
        this.ceilY = hitCeil;
      } else {
        let matchRoom = null;
        for (const rm of (level.rooms || [])) {
          if (tx >= rm.x0 && tx <= rm.x1) { matchRoom = rm; break; }
        }
        if (matchRoom && matchRoom._hallBounds && matchRoom._hallBounds.ceilY != null) {
          this.ceilY = Math.max(y - 148, matchRoom._hallBounds.ceilY + 18);
        } else {
          this.ceilY = y - 104;
        }
      }
    }
  }

  update(player) {
    const d = Math.hypot(player.x - this.x, (player.y - 28) - this.y);
    this.inRange = d <= 238;
    this.active = player.tetherNode === this || player.magnetNode === this;
    this._playerX = player.x;
    this._playerY = player.y - 28;
  }

  draw(ctx, cam, time, assets = null) {
    const sx = Math.round(this.x - cam.rx);
    const sy = Math.round(this.y - cam.ry);
    const ceilSy = Math.round(this.ceilY - cam.ry);
    if (sx < -80 || sx > W + 80 || sy < -100 || ceilSy > H + 80) return;
    const pulse = 0.5 + 0.5 * Math.sin(time * 6.4 + this.x * 0.02);

    ctx.save();
    // Active magnetic lightning tether to the hunter!
    if (this.active && this._playerX != null) {
      const px = Math.round(this._playerX - cam.rx);
      const py = Math.round(this._playerY - cam.ry);
      ctx.strokeStyle = '#7ce8ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      const mx = (sx + px) * 0.5 + Math.sin(time * 28) * 5;
      const my = (sy + py) * 0.5 + Math.cos(time * 28) * 5;
      ctx.quadraticCurveTo(mx, my, px, py);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(px, py);
      ctx.stroke();
    }

    const expImg = assets && assets.img && assets.img('exploration_props');
    const mountFr = assets && assets.frame && assets.frame('exploration_props', 'lodestone_mount');
    const orbName = (this.active || (this.inRange && pulse > 0.45)) ? 'lodestone_active' : 'lodestone_idle';
    const orbFr = assets && assets.frame && assets.frame('exploration_props', orbName);
    const chainFr = assets && assets.frame && assets.frame('arch', 'chain');
    const archImg = assets && assets.img && assets.img('arch');

    if (expImg && orbFr) {
      // 1. Pixel-art vertical iron suspension chain from ceiling mount down to the lodestone orb
      const topY = Math.max(-48, ceilSy + (mountFr ? mountFr.h - 4 : 8));
      const botY = sy - Math.round(orbFr.h * 0.48);
      if (archImg && chainFr && botY > topY + 4) {
        const step = Math.max(8, chainFr.h - 4);
        for (let cy = botY; cy > topY; cy -= step) {
          assets.draw(ctx, 'arch', 'chain', sx, Math.round(cy));
        }
      }
      // 2. Ceiling iron boss mount bracket bolted to the vault overhead
      if (mountFr && ceilSy > -40) {
        assets.draw(ctx, 'exploration_props', 'lodestone_mount', sx, ceilSy + mountFr.h);
      }
      // 3. Soft cobalt-cyan glow + pixel-art forged lodestone ring sprite
      const glow = getGlowCanvas('cyan');
      if (glow) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = this.active ? 0.65 : (this.inRange ? 0.36 + 0.18 * pulse : 0.22 + 0.08 * pulse);
        ctx.drawImage(glow, sx - 28, sy - 28, 56, 56);
        ctx.restore();
      }
      assets.draw(ctx, 'exploration_props', orbName, sx, Math.round(sy + orbFr.h * 0.5));
      ctx.restore();
      return;
    }

    // Fallback geometry for headless tests without raster sheets
    ctx.fillStyle = '#3d4860';
    for (let cy = sy - 14; cy > ceilSy; cy -= 6) {
      ctx.fillRect(sx - 1, cy, 3, 4);
    }
    ctx.fillStyle = '#1c2234';
    ctx.beginPath();
    ctx.arc(sx, sy, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = this.active ? '#ffffff' : '#58d8ff';
    ctx.fillRect(sx - 4, sy - 4, 8, 8);
    ctx.restore();
  }

  drawPrompt(ctx, cam, font, player) {
    if (!this.inRange || this.active || (player && player.onGround && Math.abs(player.y - this.y) > 215)) return;
    const sx = Math.round(this.x - cam.rx);
    const sy = Math.round(this.y - cam.ry);
    if (sx < 20 || sx > W - 20 || sy < 36 || sy > H - 16) return;
    font.draw(ctx, '[Q / ↑] GRAPPLE', sx, Math.max(46, sy - 24), {
      align: 'center',
      color: '#8ef5ff',
      shadow: '#05040a',
      gothic: false,
    });
  }
}

/**
 * One-Way Mechanical Shortcut Portcullis (`SwitchGate`): bars a lower corridor
 * until the hunter loops over the upper gallery and strikes the brass gear lever
 * on the far side (`leverSide`), permanently opening the shortcut across visits.
 */
export class SwitchGate {
  constructor(spec, level, alreadyOpen = false) {
    this.id = spec.id;
    this.gateCol = spec.gateCol;
    this.topRow = spec.topRow;
    this.floorRow = spec.floorRow;
    this.leverSide = spec.leverSide || 1;
    this.leverCol = spec.leverCol != null ? spec.leverCol : (this.gateCol + this.leverSide * 3);
    this.x = this.gateCol * TILE + 16;
    this.y = this.floorRow * TILE;
    this.leverX = this.leverCol * TILE + 16;
    this.leverY = this.floorRow * TILE;
    this.open = !!alreadyOpen;
    this.rise = this.open ? 1 : 0;
    this.solid = false;
    this.nearLever = false;
    this.nearBlockedSide = false;
    this.lastHintT = -9;
    this.setSolid(level, !this.open);
  }

  setSolid(level, solid) {
    if (this.solid === solid) return;
    this.solid = solid;
    for (let r = this.topRow; r < this.floorRow; r++) {
      const t = level.tile(this.gateCol, r);
      if (solid && t === T_EMPTY) level.set(this.gateCol, r, T_GATE);
      else if (!solid && t === T_GATE) level.set(this.gateCol, r, T_EMPTY);
    }
  }

  get leverBox() {
    return { x: this.leverX - 14, y: this.leverY - 34, w: 28, h: 34 };
  }

  triggerOpen(world) {
    if (this.open) return false;
    this.open = true;
    if (world && world.game && world.game.markSwitchOpened) {
      world.game.markSwitchOpened(this.id);
    }
    if (world) {
      world.sfx('gate');
      world.camera.shake(2.4, 0.20);
      world.particles.sparks(this.leverX, this.leverY - 20, 14, '#ffd27a');
      world.particles.dust(this.x, this.y, 10, '#d8c59e');
      world.spawnPopup(this.x, this.y - 54, '✦ SHORTCUT GATE UNSEALED! ✦', {
        color: '#62f2c2',
        dur: 1.5,
        vy: -18,
        banner: true,
      });
    }
    return true;
  }

  tryStrikeLever(box, world) {
    if (this.open || !box) return false;
    if (rectsOverlap(box, this.leverBox)) {
      return this.triggerOpen(world);
    }
    return false;
  }

  update(dt, player, world) {
    if (this.open && this.rise < 1) {
      this.rise = Math.min(1, this.rise + dt * 2.2);
      if (this.rise >= 0.45 && this.solid) this.setSolid(world.level, false);
    }
    const dy = Math.abs(player.y - this.y);
    this.nearLever = !this.open && Math.abs(player.x - this.leverX) < 30 && dy < 36;
    if (this.nearLever && world.game && world.game.input && world.game.input.pressed.up) {
      this.triggerOpen(world);
    }
    const dxGate = player.x - this.x;
    this.nearBlockedSide = !this.open && dy < 38 && (this.leverSide > 0 ? (dxGate < 0 && dxGate > -42) : (dxGate > 0 && dxGate < 42));
    if (this.nearBlockedSide && world.time - this.lastHintT > 3.2 && Math.abs(dxGate) < 26) {
      this.lastHintT = world.time;
      world.sfx('block');
      world.spawnPopup(this.x, this.y - 48, 'LOCKED FROM OTHER SIDE', { color: '#ff8aa0', dur: 1.1, vy: -14 });
    }
  }

  draw(ctx, cam, font, time, assets = null) {
    const sx = Math.round(this.x - cam.rx);
    const sy = Math.round(this.y - cam.ry);
    const lx = Math.round(this.leverX - cam.rx);
    const ly = Math.round(this.leverY - cam.ry);
    if (Math.min(sx, lx) > W + 64 || Math.max(sx, lx) < -64) return;

    const fullH = Math.max(64, (this.floorRow - this.topRow) * TILE);
    const lift = Math.round(this.rise * (fullH - 10));
    const gatesImg = assets && assets.img && assets.img('boss_gates');
    const jambBase = assets && assets.frame && assets.frame('boss_gates', 'jamb_base');
    const jambShaft = assets && assets.frame && assets.frame('boss_gates', 'jamb_shaft');
    const botFrame = assets && assets.frame && assets.frame('boss_gates', 'entry_bottom');
    const spanFrame = assets && assets.frame && assets.frame('boss_gates', 'entry_span');
    const expImg = assets && assets.img && assets.img('exploration_props');
    const leverName = this.open ? 'lever_open' : 'lever_locked';
    const leverFr = assets && assets.frame && assets.frame('exploration_props', leverName);

    ctx.save();
    // 1. Pixel-art Gothic stone gate-channel column + side-profile iron portcullis clipped strictly to story height
    const topSy = sy - fullH;
    if (gatesImg && jambBase && jambShaft && botFrame && spanFrame) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx - 30, topSy, 60, fullH + 3);
      ctx.clip();
      const shaftX = Math.round(sx - jambShaft.w * 0.5);
      for (let y = sy - jambBase.h + 4 - jambShaft.h; y + jambShaft.h > topSy - 2; y -= jambShaft.h) {
        ctx.drawImage(gatesImg, jambShaft.x, jambShaft.y, jambShaft.w, jambShaft.h, shaftX, Math.round(y), jambShaft.w, jambShaft.h);
      }
      ctx.drawImage(gatesImg, jambBase.x, jambBase.y, jambBase.w, jambBase.h, Math.round(sx - jambBase.w * 0.5), Math.round(sy - jambBase.h + 2), jambBase.w, jambBase.h);

      const barBottom = sy - lift;
      if (barBottom > topSy + 2) {
        ctx.save();
        ctx.translate(sx, 0);
        if (this.leverSide > 0) ctx.scale(-1, 1);
        const botTop = Math.round(barBottom - botFrame.h);
        ctx.drawImage(gatesImg, botFrame.x, botFrame.y, botFrame.w, botFrame.h, -6, botTop, botFrame.w, botFrame.h);
        for (let y = botTop - spanFrame.h; y + spanFrame.h > topSy - 2; y -= spanFrame.h) {
          ctx.drawImage(gatesImg, spanFrame.x, spanFrame.y, spanFrame.w, spanFrame.h, -6, Math.round(y), spanFrame.w, spanFrame.h);
        }
        ctx.restore();
      }
      ctx.restore();
    } else {
      ctx.fillStyle = '#242034';
      ctx.fillRect(sx - 9, topSy, 18, fullH);
      const barBottom = sy - lift;
      if (barBottom > topSy) {
        ctx.fillStyle = '#4c5670';
        ctx.fillRect(sx - 5, topSy, 10, barBottom - topSy);
      }
    }

    // 2. Pixel-art geared brass floor lever on the far side
    if (expImg && leverFr) {
      assets.draw(ctx, 'exploration_props', leverName, lx, ly + 1);
    } else {
      ctx.fillStyle = '#282238';
      ctx.fillRect(lx - 10, ly - 6, 20, 6);
      const tilt = this.open ? 8 : -8;
      ctx.strokeStyle = '#dce6ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(lx, ly - 8);
      ctx.lineTo(lx + tilt, ly - 26);
      ctx.stroke();
    }

    if (this.nearLever && !this.open) {
      font.draw(ctx, 'STRIKE LEVER', lx, ly - 42, { align: 'center', color: '#ffd27a', shadow: '#05040a', gothic: false });
    }
    void time;
    ctx.restore();
  }
}

/**
 * Tiered Gothic Reliquary Chest (`wooden`, `emerald`, `gold`): opens permanently
 * when struck with a weapon or pressing `↑`, granting coins, wall-roasts, rare
 * forged weapons, or Soul Orbs!
 */
export class TreasureChest {
  constructor(spec, stageIndex, alreadyOpen = false) {
    this.id = spec.id;
    this.x = spec.col * TILE + 16;
    this.y = spec.row * TILE;
    this.tier = spec.tier || 'wooden';
    this.stageIndex = stageIndex;
    this.opened = !!alreadyOpen;
    this.openAnim = this.opened ? 1 : 0;
    this.near = false;
  }

  get box() {
    return { x: this.x - 16, y: this.y - 24, w: 32, h: 24 };
  }

  openChest(world) {
    if (this.opened) return false;
    this.opened = true;
    if (world && world.game && world.game.markChestOpened) {
      world.game.markChestOpened(this.id);
    }
    if (!world) return true;
    world.sfx('orb');
    const sparkCol = this.tier === 'gold' ? '#ffd84d' : (this.tier === 'emerald' ? '#62f2c2' : '#e8cfa0');
    world.particles.sparks(this.x, this.y - 18, 18, sparkCol);

    if (this.tier === 'gold') {
      const wId = GOLD_SECRET_WEAPONS[this.stageIndex % GOLD_SECRET_WEAPONS.length];
      if (world.onWeaponCollected) {
        world.onWeaponCollected(wId, this.x, this.y - 24, true);
      }
      world.spawnItem('meat', this.x - 14, this.y - 22);
      world.addScore(1500);
    } else if (this.tier === 'emerald') {
      const altId = GOLD_SECRET_WEAPONS[(this.stageIndex + 5) % GOLD_SECRET_WEAPONS.length];
      if (world.game && world.game.hasWeapon && !world.game.hasWeapon(altId) && world.onWeaponCollected) {
        world.onWeaponCollected(altId, this.x, this.y - 22, false);
      } else {
        const soulKeys = Object.keys(SOUL_GLYPHS);
        const sId = soulKeys[(this.stageIndex * 3 + 1) % soulKeys.length];
        if (world.soulOrbs) world.soulOrbs.push(new SoulOrb(sId, this.x, this.y - 22));
      }
      world.spawnItem('money', this.x - 10, this.y - 20);
      world.spawnItem('heart_big', this.x + 10, this.y - 20);
      world.addScore(800);
    } else {
      world.spawnItem('money', this.x - 8, this.y - 20);
      world.spawnItem('heart_big', this.x + 8, this.y - 20);
      world.addScore(400);
      world.spawnPopup(this.x, this.y - 34, 'RELIQUARY OPENED!', { color: '#ffd27a', dur: 1.0, vy: -18 });
    }
    return true;
  }

  tryStrikeOpen(box, world) {
    if (this.opened || !box) return false;
    if (rectsOverlap(box, this.box)) return this.openChest(world);
    return false;
  }

  update(dt, player, input, world) {
    if (this.opened && this.openAnim < 1) {
      this.openAnim = Math.min(1, this.openAnim + dt * 4.5);
    }
    const dx = Math.abs(player.x - this.x);
    const dy = Math.abs(player.y - this.y);
    this.near = !this.opened && dx < 28 && dy < 30;
    if (this.near && player.onGround && input && input.pressed && input.pressed.up && !(input.down && input.down.attack)) {
      this.openChest(world);
    }
  }

  draw(ctx, cam, time, assets = null) {
    const sx = Math.round(this.x - cam.rx);
    const sy = Math.round(this.y - cam.ry);
    if (sx < -44 || sx > W + 44 || sy < -20 || sy > H + 44) return;

    const tierKey = this.tier === 'gold' ? 'gold' : (this.tier === 'emerald' ? 'emerald' : 'wood');
    const frameName = `chest_${tierKey}_${this.opened ? 'open' : 'closed'}`;
    const chestFr = assets && assets.frame && assets.frame('exploration_props', frameName);

    ctx.save();
    ctx.fillStyle = 'rgba(4, 3, 10, 0.55)';
    ctx.fillRect(sx - 16, sy - 2, 32, 4);

    if (chestFr && assets.img('exploration_props')) {
      if (!this.opened) {
        const glowKind = this.tier === 'gold' ? 'amber' : (this.tier === 'emerald' ? 'emerald' : null);
        const glow = glowKind ? getGlowCanvas(glowKind) : null;
        if (glow) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.22 + 0.08 * Math.sin(time * 4.2 + this.x);
          ctx.drawImage(glow, sx - 24, sy - 34, 48, 38);
          ctx.restore();
        }
      }
      assets.draw(ctx, 'exploration_props', frameName, sx, sy + 1);
      if (!this.opened && Math.sin(time * 5 + this.x) > 0.35) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sx - 9 + (Math.floor(time * 4) % 18), sy - 24, 2, 2);
      }
      ctx.restore();
      return;
    }

    // Fallback geometry for headless tests without raster sheets
    ctx.fillStyle = this.tier === 'gold' ? '#6e4c14' : (this.tier === 'emerald' ? '#184e44' : '#4a2e1e');
    ctx.fillRect(sx - 13, sy - 18, 26, 18);
    ctx.restore();
  }

  drawPrompt(ctx, cam, font) {
    if (!this.near || this.opened) return;
    const sx = Math.round(this.x - cam.rx);
    const sy = Math.round(this.y - cam.ry);
    const tierLbl = this.tier === 'gold' ? 'GOLD RELIQUARY' : (this.tier === 'emerald' ? 'EMERALD CHEST' : 'WOODEN CHEST');
    font.draw(ctx, `↑ ${tierLbl}`, sx, Math.max(48, sy - 34), {
      align: 'center',
      color: this.tier === 'gold' ? '#ffd84d' : '#b8fff0',
      shadow: '#05040a',
      gothic: false,
    });
  }
}

/**
 * Floating Arcane Glyph Sigil (`GlyphSigil`): pressing/holding `↑` channels and
 * absorbs a regional Soul Glyph (`SoulOrb`) directly into the Hunter's Grimoire!
 */
export class GlyphSigil {
  constructor(spec, stageKey) {
    this.id = spec.id;
    this.x = spec.col * TILE + 16;
    this.y = spec.row * TILE;
    this.soulId = STAGE_SIGNATURE_SOULS[stageKey] || 'phantom_axes';
    this.usedThisVisit = false;
    this.near = false;
    this.channelT = 0;
  }

  update(dt, player, input, world) {
    if (this.usedThisVisit) { this.near = false; return; }
    const dx = Math.abs(player.x - this.x);
    const dy = Math.abs(player.y - this.y);
    this.near = dx < 34 && dy < 38;
    if (this.near && input && input.down && input.down.up && !(input.down.attack)) {
      this.channelT += dt;
      if (Math.random() < 0.6 && world.particles) {
        const g = SOUL_GLYPHS[this.soulId];
        const col = (g && SOUL_TYPES[g.type]?.color) || '#ffd25a';
        world.particles.sparks(this.x + (Math.random() - 0.5) * 20, this.y - 36, 1, col);
      }
      if (this.channelT >= 0.28 || input.pressed.up) {
        this.usedThisVisit = true;
        world.sfx('orb');
        if (world.soulOrbs) {
          world.soulOrbs.push(new SoulOrb(this.soulId, this.x, this.y - 42));
        }
      }
    } else {
      this.channelT = Math.max(0, this.channelT - dt * 2);
    }
  }

  draw(ctx, cam, time, assets = null) {
    const sx = Math.round(this.x - cam.rx);
    const sy = Math.round(this.y - cam.ry);
    if (sx < -48 || sx > W + 48 || sy < -20 || sy > H + 80) return;

    const g = SOUL_GLYPHS[this.soulId] || SOUL_GLYPHS.phantom_axes;
    const meta = SOUL_TYPES[g.type] || SOUL_TYPES.bullet;
    const pulse = 0.5 + 0.5 * Math.sin(time * 5.0);
    const pedFr = assets && assets.frame && assets.frame('exploration_props', 'glyph_pedestal');
    const tabFr = assets && assets.frame && assets.frame('exploration_props', 'glyph_tablet');
    const expImg = assets && assets.img && assets.img('exploration_props');

    ctx.save();
    if (expImg && pedFr) {
      ctx.fillStyle = 'rgba(4, 3, 10, 0.50)';
      ctx.fillRect(sx - 16, sy - 2, 32, 4);
      assets.draw(ctx, 'exploration_props', 'glyph_pedestal', sx, sy + 1);
    } else {
      ctx.fillStyle = '#1e1a2c';
      ctx.fillRect(sx - 14, sy - 8, 28, 8);
    }

    if (!this.usedThisVisit) {
      const cy = Math.round(sy - 44 + Math.sin(time * 3.4) * 3);
      const halo = ctx.createRadialGradient(sx, cy, 2, sx, cy, 28);
      halo.addColorStop(0, meta.color);
      halo.addColorStop(1, 'rgba(10, 8, 22, 0)');
      ctx.globalAlpha = 0.48 + 0.24 * pulse;
      ctx.fillStyle = halo;
      ctx.fillRect(sx - 28, cy - 28, 56, 56);
      ctx.globalAlpha = 1;

      if (expImg && tabFr) {
        assets.draw(ctx, 'exploration_props', 'glyph_tablet', sx, Math.round(cy + tabFr.h * 0.5));
      } else {
        ctx.strokeStyle = meta.color;
        ctx.strokeRect(sx - 8, cy - 8, 16, 16);
      }
      const fxl = getFxLayers();
      if (fxl && fxl.enabled) {
        fxl.addAttack({
          x: sx, y: cy, rx: 14, ry: 18, dirX: 0, dirY: -1, mode: 0, seed: this.x * 0.02,
          core: meta.core, rim: meta.rim, alpha: 0.52 + 0.18 * pulse,
        });
      }
    }
    ctx.restore();
  }

  drawPrompt(ctx, cam, font) {
    if (!this.near || this.usedThisVisit) return;
    const sx = Math.round(this.x - cam.rx);
    const sy = Math.round(this.y - cam.ry);
    const g = SOUL_GLYPHS[this.soulId];
    const meta = g ? SOUL_TYPES[g.type] : SOUL_TYPES.bullet;
    drawDoorPrompt(ctx, font, sx, Math.max(46, sy - 74), `↑ ABSORB GLYPH · ${g ? g.short : 'SOUL'}`, {
      color: '#ffffff',
      border: meta ? meta.color : '#ffd27a',
    });
  }
}

/**
 * Breakable Secret Perimeter Wall (`SecretWall`): renders subtle fissured mortar
 * cracks & drifting dust motes over `T_BLOCK` wall seams, and triggers a secret
 * discovery chime + map reveal when shattered or entered!
 */
export class SecretWall {
  constructor(spec, level, alreadyDiscovered = false) {
    this.id = spec.id;
    this.col = spec.col;
    this.topRow = spec.topRow;
    this.botRow = spec.botRow;
    this.floorRow = spec.floorRow;
    this.revealCellKey = spec.revealCellKey || null;
    this.x = this.col * TILE + 16;
    this.y = this.floorRow * TILE;
    this.shattered = !!alreadyDiscovered;
    if (this.shattered && level) {
      for (let r = this.topRow; r <= this.botRow; r++) {
        if (level.tile(this.col, r) === T_BLOCK) level.set(this.col, r, T_EMPTY);
      }
    }
  }

  onDiscovered(world) {
    if (this.shattered) return;
    this.shattered = true;
    if (!world) return;
    // Clear any remaining seam blocks in the doorway
    if (world.level) {
      for (let r = this.topRow; r <= this.botRow; r++) {
        if (world.level.tile(this.col, r) === T_BLOCK) world.level.breakBlock(this.col, r);
      }
    }
    if (this.revealCellKey && world.game && world.game.markCellsExplored) {
      world.game.markCellsExplored([this.revealCellKey]);
    }
    world.sfx('orb');
    world.emitShockwave(this.x, this.y - 48, { maxR: 112, dur: 0.45, strength: 0.6, color: [0.38, 0.96, 0.76] });
    world.particles.sparks(this.x, this.y - 48, 16, '#ffd84d');
    world.spawnPopup(this.x, this.y - 68, '✦ SECRET CHAMBER DISCOVERED! ✦', {
      color: '#ffd84d',
      dur: 1.8,
      vy: -16,
      banner: true,
    });
  }

  checkShattered(world) {
    if (this.shattered || !world || !world.level) return false;
    for (let r = this.topRow; r <= this.botRow; r++) {
      if (world.level.tile(this.col, r) !== T_BLOCK) {
        this.onDiscovered(world);
        return true;
      }
    }
    return false;
  }

  update(player, world) {
    if (!this.shattered) {
      this.checkShattered(world);
    }
  }

  draw(ctx, cam, time, assets = null) {
    if (this.shattered) return;
    const sx = Math.round(this.col * TILE - cam.rx);
    const syTop = Math.round(this.topRow * TILE - cam.ry);
    const hPx = (this.botRow - this.topRow + 1) * TILE;
    if (sx < -40 || sx > W + 40 || syTop > H + 20 || syTop + hPx < -20) return;

    const fallImg = assets && assets.img && assets.img('falling_tiles');
    const crackFr = assets && assets.frame && assets.frame('falling_tiles', 'breaking');

    ctx.save();
    if (fallImg && crackFr) {
      ctx.globalAlpha = 0.58;
      for (let r = 0; r <= this.botRow - this.topRow; r++) {
        ctx.drawImage(
          fallImg,
          crackFr.x, crackFr.y, crackFr.w, crackFr.h,
          sx, syTop + r * TILE, TILE, TILE,
        );
      }
      ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = 'rgba(18, 14, 28, 0.85)';
      ctx.lineWidth = 1;
      for (let r = 0; r <= this.botRow - this.topRow; r++) {
        const ry = syTop + r * TILE;
        ctx.beginPath();
        ctx.moveTo(sx + 6, ry + 7);
        ctx.lineTo(sx + 15, ry + 15);
        ctx.lineTo(sx + 23, ry + 28);
        ctx.stroke();
      }
    }
    const glint = 0.28 + 0.36 * (0.5 + 0.5 * Math.sin(time * 3.6 + this.col));
    ctx.fillStyle = `rgba(255, 224, 132, ${glint.toFixed(3)})`;
    ctx.fillRect(sx + 14, syTop + Math.round(hPx * 0.48), 3, 3);
    ctx.restore();
  }
}

/**
 * Shared renderer for the castle's tall **vertical boss doors**: a crisp,
 * non-stretched side-profile iron portcullis (`boss_gates`: `entry_bottom` +
 * vertically repeating `entry_span`) sliding inside a carved Gothic stone
 * gate-channel column (`jamb_base` + vertically repeating `jamb_shaft` +
 * gargoyle lintel `jamb_cap`) at exact 1:1 native pixel resolution, flanked on
 * the floor beside the door by gothic guardian statues, wrought-iron braziers,
 * and carved ward steles (`boss_door_props`).
 */
export function drawVerticalDoor(ctx, assets, sx, floorSy, {
  rise = 0,
  height = 360,
  time = 0,
  sealed = false,
  lockColor = '#ff5a78',
  glowColor = '#ffd27a',
  open = false,
  fxSeed = 0,
  kind = 'entry',
} = {}) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 4.4 + fxSeed);
  const spanH = Math.max(height, floorSy + 4, 320);
  const topSy = Math.min(0, floorSy - spanH);
  const fullH = Math.max(120, floorSy - topSy);
  if (floorSy < -8 || topSy > H + 8) return;

  const isExit = kind === 'exit';
  const gatesImg = assets && assets.img ? assets.img('boss_gates') : null;
  const botFrame = assets && assets.frame ? assets.frame('boss_gates', 'entry_bottom') : null;
  const spanFrame = assets && assets.frame ? assets.frame('boss_gates', 'entry_span') : null;
  const jambBase = assets && assets.frame ? assets.frame('boss_gates', 'jamb_base') : null;
  const jambShaft = assets && assets.frame ? assets.frame('boss_gates', 'jamb_shaft') : null;
  const jambCap = assets && assets.frame ? assets.frame('boss_gates', 'jamb_cap') : null;
  const propsImg = assets && assets.img ? assets.img('boss_door_props') : null;

  ctx.save();

  // 1. Atmospheric threshold backlight (narrow side-corridor beam)
  const g = ctx.createRadialGradient(sx, floorSy - 68, 4, sx, floorSy - 68, 64);
  if (sealed) {
    g.addColorStop(0, `rgba(198, 48, 96, ${(0.20 + 0.08 * pulse).toFixed(3)})`);
  } else if (open || rise > 0.05) {
    g.addColorStop(0, `rgba(255, 212, 118, ${(0.18 + 0.22 * Math.min(1, rise) + 0.08 * pulse).toFixed(3)})`);
  } else {
    g.addColorStop(0, `rgba(150, 170, 220, ${(0.12 + 0.06 * pulse).toFixed(3)})`);
  }
  g.addColorStop(1, 'rgba(12, 10, 28, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(sx - 68, floorSy - 144, 136, 150);

  // 2. Flanking graphic sprite assets BESIDE the iron door (`boss_door_props`):
  //    - Guardian statue (`entry_guardian` or `exit_guardian`) standing on the approach side
  //    - Wrought-iron brazier (`iron_brazier`) with live coals & flame right beside the gate
  //    - Carved stone ward stele (`ward_stele`) on the opposite threshold side
  const statueName = isExit ? 'exit_guardian' : 'entry_guardian';
  const statueX = sx - 44;
  const brazierX = sx - 20;
  const steleX = sx + 24;
  if (propsImg && assets.frame('boss_door_props', statueName)) {
    ctx.fillStyle = 'rgba(4, 3, 10, 0.52)';
    ctx.fillRect(statueX - 18, floorSy - 2, 36, 4);
    ctx.fillRect(brazierX - 12, floorSy - 2, 24, 4);
    ctx.fillRect(steleX - 16, floorSy - 2, 32, 4);
    assets.draw(ctx, 'boss_door_props', statueName, statueX, floorSy + 1);
    assets.draw(ctx, 'boss_door_props', 'ward_stele', steleX, floorSy + 1);
    assets.draw(ctx, 'boss_door_props', 'iron_brazier', brazierX, floorSy + 1);
  } else {
    // Fallback flanking silhouettes for headless tests without raster sheets
    ctx.fillStyle = '#252236';
    ctx.fillRect(statueX - 10, floorSy - 68, 20, 68);
    ctx.fillRect(steleX - 8, floorSy - 64, 16, 64);
    ctx.fillStyle = '#382a2e';
    ctx.fillRect(brazierX - 7, floorSy - 36, 14, 36);
  }

  // 3. Modular Gothic stone gate-channel column rendered at exact 1:1 native pixels (zero stretch!)
  if (gatesImg && jambShaft && jambBase) {
    ctx.save();
    ctx.globalAlpha = 0.96;
    ctx.beginPath();
    ctx.rect(sx - 44, topSy - 2, 88, floorSy - topSy + 5);
    ctx.clip();
    const shaftX = Math.round(sx - jambShaft.w * 0.5);
    const shaftStopY = floorSy - jambBase.h + 6;
    for (let y = shaftStopY - jambShaft.h; y + jambShaft.h > topSy - 2; y -= jambShaft.h) {
      ctx.drawImage(
        gatesImg,
        jambShaft.x, jambShaft.y, jambShaft.w, jambShaft.h,
        shaftX, Math.round(y), jambShaft.w, jambShaft.h,
      );
    }
    ctx.drawImage(
      gatesImg,
      jambBase.x, jambBase.y, jambBase.w, jambBase.h,
      Math.round(sx - jambBase.w * 0.5), Math.round(floorSy - jambBase.h + 2), jambBase.w, jambBase.h,
    );
    if (jambCap) {
      const capY = Math.max(topSy + 8, floorSy - 188);
      // Anchor the carved stone gargoyle corbel (left 19px of jamb_cap) flush against jamb_shaft's left face
      const gargW = Math.min(19, jambCap.w);
      ctx.drawImage(
        gatesImg,
        jambCap.x, jambCap.y, gargW, jambCap.h,
        Math.round(sx - jambShaft.w * 0.5 - gargW + 3), Math.round(capY), gargW, jambCap.h,
      );
    }
    ctx.restore();
  } else {
    const jambW = 22;
    const slotX = Math.round(sx - jambW * 0.5);
    const pierGrad = ctx.createLinearGradient(0, topSy, 0, floorSy);
    pierGrad.addColorStop(0, '#1b1826');
    pierGrad.addColorStop(0.55, '#302b40');
    pierGrad.addColorStop(1, '#1d1a28');
    ctx.fillStyle = pierGrad;
    ctx.fillRect(slotX, topSy, jambW, fullH);
    ctx.fillStyle = '#090811';
    ctx.fillRect(sx - 4, topSy, 8, fullH);
  }

  // 4. Modular side-profile forged iron portcullis rendered at exact 1:1 native pixel aspect ratio!
  //    `entry_bottom` forms the tapered iron spearhead shoe & lower spikes, and `entry_span` tiles
  //    seamlessly upward into the ceiling slot without any vertical or horizontal stretching.
  const lift = Math.round(rise * fullH);
  const bottom = floorSy - lift;
  ctx.save();
  ctx.beginPath();
  ctx.rect(sx - 28, topSy - 2, 48, fullH + 4);
  ctx.clip();
  if (bottom > topSy) {
    if (gatesImg && botFrame && spanFrame) {
      ctx.save();
      ctx.translate(Math.round(sx), 0);
      ctx.scale(-1, 1); // spikes & bronze skulls face LEFT toward the approaching hunter
      const beamOffset = -6; // centers the 11px vertical iron beam inside the stone guide slot at sx
      const botTop = Math.round(bottom - botFrame.h);
      ctx.drawImage(
        gatesImg,
        botFrame.x, botFrame.y, botFrame.w, botFrame.h,
        beamOffset, botTop, botFrame.w, botFrame.h,
      );
      for (let y = botTop - spanFrame.h; y + spanFrame.h > topSy - 4; y -= spanFrame.h) {
        ctx.drawImage(
          gatesImg,
          spanFrame.x, spanFrame.y, spanFrame.w, spanFrame.h,
          beamOffset, Math.round(y), spanFrame.w, spanFrame.h,
        );
      }
      ctx.restore();
    } else {
      ctx.fillStyle = isExit ? '#6a5332' : '#3a3448';
      ctx.fillRect(sx - 6, bottom - fullH, 12, fullH);
      ctx.fillStyle = isExit ? '#d8b25c' : '#8a3246';
      for (let y = bottom - 24; y > topSy; y -= 44) {
        ctx.fillRect(sx - 9, y, 16, 6);
      }
    }
  }
  ctx.restore();

  // 5. Arcane seal rune on the side-profile gate & ward stele when barred
  if (sealed && lift < fullH * 0.5) {
    const cy = floorSy - 60 - lift;
    ctx.fillStyle = '#140c18';
    ctx.fillRect(sx - 5, cy - 5, 10, 10);
    ctx.fillStyle = lockColor;
    ctx.globalAlpha = 0.6 + 0.38 * pulse;
    ctx.fillRect(sx - 3, cy - 3, 6, 6);
    ctx.fillRect(steleX - 2, floorSy - 52, 5, 5);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sx - 1, cy - 1, 2, 2);
    ctx.globalAlpha = 1;
  }

  // 6. Brazier & sconce light pools + living shader flames beside the door
  const glow = getGlowCanvas(sealed ? 'crimson' : 'amber');
  if (glow) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.26 + 0.09 * pulse;
    ctx.drawImage(glow, brazierX - 22, floorSy - 76, 44, 44);
    ctx.drawImage(glow, steleX - 18, floorSy - 72, 36, 36);
    if (!sealed && rise > 0.2) {
      ctx.globalAlpha = (0.32 + 0.14 * pulse) * Math.min(1, rise);
      ctx.drawImage(glow, sx - 24, floorSy - 88, 48, 76);
    }
    ctx.restore();
  }
  const fxl = getFxLayers();
  if (fxl) {
    const flameCol = sealed ? [0.95, 0.28, 0.42] : [1.0, 0.68, 0.22];
    fxl.addFlame(brazierX, floorSy - 54, 8, 13, flameCol, fxSeed);
    fxl.addFlame(steleX, floorSy - 52, 5, 9, flameCol, fxSeed + 1.9);
  }

  // 7. Golden threshold motes rising through an open doorway
  if (!sealed && rise > 0.3) {
    const k = Math.min(1, rise);
    for (let i = 0; i < 6; i++) {
      const wy = floorSy - 8 - ((Math.round(time * 22 + i * 12)) % 76);
      const wx = sx - 6 + Math.round(Math.sin(time * 2.8 + i * 1.4) * 5);
      ctx.fillStyle = i % 2 === 0 ? '#ffe8a4' : glowColor;
      ctx.globalAlpha = (0.52 + 0.34 * pulse) * k;
      ctx.fillRect(wx, wy, 2, 2);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawDoorPrompt(ctx, font, sx, ly, text, { color = '#ffd27a', border = '#ffd27a', alpha = 1 } = {}) {
  const lw = font.width(text, 1, 1, false) + 12;
  const lx = Math.max(6, Math.min(W - lw - 6, Math.round(sx - lw / 2)));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(6, 5, 16, 0.94)';
  ctx.fillRect(lx, ly, lw, 13);
  ctx.strokeStyle = border;
  ctx.strokeRect(lx + 0.5, ly + 0.5, lw - 1, 12);
  font.draw(ctx, text, lx + Math.round(lw / 2), ly + 3, { align: 'center', color, shadow: '#05040a', gothic: false });
  ctx.restore();
}

/**
 * Left-side **Boss Gate Door**: a floor-to-ceiling vertical portcullis barring
 * every Boss Sanctum. It stays sealed until the castle's progression rules
 * (`gates.js`) unlock it, rises when the hunter approaches, slams shut behind
 * them once the battle begins, and rises again for good when the guardian falls.
 * While closed its tile column is solid, so it cannot be jumped or flown over.
 */
export class BossGateDoor {
  constructor(bossData, level) {
    this.col = bossData.gateCol;
    this.floorRow = bossData.gateRows[1] + 1;
    this.x = this.col * TILE + TILE * 0.5;
    this.y = this.floorRow * TILE;
    // Solid rows: from the floor all the way up to row 0 (top of the screen/stage)
    let top = this.floorRow - 1;
    while (top > 0 && !isMaterialTile(level.tile(this.col, top - 1))) top--;
    this.topRow = 0;
    this.height = Math.max(360, (this.floorRow - Math.max(0, top)) * TILE);
    this.rise = 0;            // 0 closed .. 1 fully raised
    this.target = 0;          // where `rise` is heading
    this.speed = 1 / 0.55;    // rise per second (opening)
    this.slamSpeed = 1 / 0.32;
    this.solid = false;
    this.near = false;
    this.status = { open: false, title: 'SEALED BOSS GATE', sub: '' };
    this.lastBlockT = -9;
    this.sealedBehind = false;   // shut behind the hunter for the battle
    this.setSolid(level, true);
  }

  setSolid(level, solid) {
    if (this.solid === solid) return;
    this.solid = solid;
    for (let r = this.topRow; r < this.floorRow; r++) {
      const t = level.tile(this.col, r);
      if (solid && t === T_EMPTY) level.set(this.col, r, T_GATE);
      else if (!solid && t === T_GATE) level.set(this.col, r, T_EMPTY);
    }
  }

  get isOpen() { return this.rise >= 0.999; }
  get isClosed() { return this.rise <= 0.001; }

  refreshStatus(world) {
    const game = world.game;
    const cleared = game ? (game.cleared || 0) : 0;
    const debug = game && game.debug ? game.debug : DEFAULT_DEBUG_FLAGS;
    this.status = bossGateStatus(world.stage.key, cleared, debug);
    return this.status;
  }

  /** Raises the door (sfx + dust); `instant` snaps it fully open without fanfare. */
  openNow(world, instant = false) {
    if (instant) {
      this.rise = 1;
      this.target = 1;
      this.sealedBehind = false;
      if (world && world.level) this.setSolid(world.level, false);
      return;
    }
    if (this.target === 1) return;
    this.target = 1;
    this.sealedBehind = false;
    if (world) {
      world.sfx('gate');
      world.particles.dust(this.x, this.y, 10, '#d8c59e');
      world.particles.sparks(this.x, this.y - 60, 14, '#ffd27a');
    }
  }

  /** Drops the portcullis behind the hunter for the battle. */
  closeNow(world) {
    this.target = 0;
    this.sealedBehind = true;
    if (world && world.level) this.setSolid(world.level, true);
  }

  update(dt, player, input, world) {
    if (!this.sealedBehind && !world.bossActive && !(world.boss && world.boss.introPose)) {
      this.refreshStatus(world);
    }
    const dx = player.x - this.x;
    const dy = Math.abs(player.y - this.y);
    this.near = dx < 0 && dx > -104 && dy < 60;

    // Approach from the vestibule: an unsealed door rises; a sealed one rebuffs the hunter.
    if (!this.sealedBehind && this.target === 0 && this.near && player.alive) {
      if (this.status.open) {
        this.openNow(world);
      } else if (dx > -30 && input && input.down && input.down.right && world.time - this.lastBlockT > 1.6) {
        this.lastBlockT = world.time;
        world.sfx('block');
        world.particles.sparks(this.x - 12, this.y - 48, 10, '#c23b4a');
        world.showMessage(this.status.title || 'SEALED BOSS GATE', this.status.sub || '', 2.4);
      }
    }

    // Animate: opening glides, closing slams (quadratic) and shakes the arena on impact
    if (this.rise !== this.target) {
      if (this.target > this.rise) {
        this.rise = Math.min(1, this.rise + dt * this.speed);
      } else {
        const next = this.rise - dt * this.slamSpeed * (0.35 + 0.65 * (1 - this.rise));
        this.rise = Math.max(0, next);
        if (this.rise === 0) {
          world.sfx('gate');
          world.camera.shake(2.2, 0.24);
          world.particles.dust(this.x, this.y, 8);
        }
      }
    }
    // Tiles clear once the sill is above the hunter's head; re-solidify as soon as it drops
    if (this.target === 1 && this.solid && this.rise * this.height >= 64) this.setSolid(world.level, false);
    if (this.target === 0 && !this.solid) this.setSolid(world.level, true);
  }

  draw(ctx, cam, font, world, time) {
    const sx = Math.round(this.x - cam.rx);
    const sy = Math.round(this.y - cam.ry);
    if (sx < -100 || sx > W + 100) return;
    const sealed = !this.status.open && !this.sealedBehind && this.target === 0;
    drawVerticalDoor(ctx, world.assets, sx, sy, {
      rise: this.rise,
      height: this.height,
      time,
      sealed,
      lockColor: this.status.final ? '#c23b4a' : '#ff5a78',
      glowColor: '#ffd27a',
      open: this.target === 1,
      fxSeed: this.x * 0.05,
      kind: 'entry',
    });
  }

  drawPrompt(ctx, cam, font, world) {
    if (!this.near || this.sealedBehind) return;
    const sx = Math.round(this.x - cam.rx);
    const sy = Math.round(this.y - cam.ry);
    const ly = Math.max(46, sy - 150);
    if (this.status.open) {
      if (this.rise < 0.98) {
        const name = (world.data.boss && world.data.boss.name) || 'THE GUARDIAN';
        drawDoorPrompt(ctx, font, sx, ly, `BOSS GATE RISING · ${name}`, { color: '#fff4cc', border: '#ffd27a' });
      }
      return;
    }
    drawDoorPrompt(ctx, font, sx, ly, `${this.status.title} · ${this.status.sub}`, {
      color: this.status.final ? '#ffb0a0' : '#ff8aa0',
      border: this.status.final ? '#c23b4a' : '#ff5a78',
    });
  }
}

function hexToRgb01(hex, fallback = [0.68, 0.42, 0.98]) {
  if (!hex || typeof hex !== 'string') return fallback;
  const h = hex.replace('#', '').trim();
  if (h.length === 6) {
    const n = parseInt(h, 16);
    if (!Number.isNaN(n)) return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  return fallback;
}

/**
 * Right-side **Boss Exit Vortex (`BossExitDoor`)**: an otherworldly animated
 * WebGL shader vortex that materializes above an arcane floor dais once the
 * stage's guardian is defeated. Walking into (or pressing `↑` inside) the
 * swirling rift transports the hunter directly to the next adjacent uncompleted
 * castle area.
 */
export class BossExitDoor {
  constructor(x, y, bossData = null, level = null) {
    this.x = x;
    this.y = y;
    this.open = false;
    this.openT = 0;
    this.rise = 0;
    this.near = false;
    this.openedWithPlayerInside = false;
    this.lastBlockT = -9;
    this.height = 360;
    void bossData;
    void level;
  }

  openNow(world) {
    if (this.open) return;
    this.open = true;
    this.openT = 0;
    this.openedWithPlayerInside = !!(world && world.player && Math.abs(world.player.x - this.x) < 28);
    if (world) {
      world.sfx('orb');
      world.particles.sparks(this.x, this.y - 54, 28, '#ffd27a');
      world.particles.dust(this.x, this.y, 10, '#d8c59e');
      world.emitShockwave(this.x, this.y - 56, {
        maxR: 152,
        dur: 0.58,
        strength: 0.85,
        color: [0.74, 0.52, 1.0],
      });
    }
  }

  resolveNextKey(world) {
    if (!world || !world.stage) return null;
    const sIdx = Math.max(0, (world.stage.id || 1) - 1);
    const game = world.game;
    const clearedMask = ((game && game.cleared) || 0) | (1 << sIdx);
    const visited = game && game.visitedStages ? game.visitedStages : null;
    const debug = game && game.debug ? game.debug : DEFAULT_DEBUG_FLAGS;
    const canEnter = (key) => canEnterStage(key, clearedMask, debug);
    return nextAdjacentStageKey(world.stage.key, clearedMask, world.relics, canEnter, visited);
  }

  update(dt, player, input, world) {
    if (this.open) {
      this.openT += dt;
      this.rise = Math.min(1, this.rise + dt / 0.65);
      // Emit inward-spiraling dimensional motes toward the vortex singularity
      if (world && world.particles && Math.random() < 0.45) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 28 + Math.random() * 22;
        const px = this.x + Math.cos(ang) * dist * 0.72;
        const py = (this.y - 56) + Math.sin(ang) * dist;
        world.particles.emit({
          x: px,
          y: py,
          vx: (this.x - px) * 1.9 - Math.sin(ang) * 28,
          vy: ((this.y - 56) - py) * 1.9 + Math.cos(ang) * 28,
          life: 0.42 + Math.random() * 0.25,
          color: Math.random() < 0.5 ? '#ffd27a' : '#b98cff',
          size: Math.random() < 0.35 ? 2 : 1,
          gravity: 0,
          fade: true,
        });
      }
    }
    const dx = Math.abs(player.x - this.x);
    const dy = Math.abs(player.y - this.y);
    this.near = this.open && dx < 48 && dy < 48;
    if (this.openedWithPlayerInside && player.x < this.x - 26) {
      this.openedWithPlayerInside = false;
    }
    // While boss is alive, keep the hunter inside the right edge of the arena
    if (!this.open && player.x > this.x + 8) {
      player.x = this.x + 8;
      if (player.vx > 0) player.vx = 0;
      return;
    }
    if (!this.open || this.rise < 0.55 || player.hurtT > 0 || dy >= 48) return;

    const walkedIntoPortal = dx <= 16
      && (!this.openedWithPlayerInside || (input && input.down && (input.down.right || input.down.left)) || Math.abs(player.vx) > 8);
    const pressedEnterDoor = dx < 42
      && player.onGround
      && input && input.pressed && input.pressed.up
      && !(input.down && input.down.attack);

    if (walkedIntoPortal || pressedEnterDoor) {
      world.enterBossExitDoor(this);
    }
  }

  draw(ctx, cam, font, world, time) {
    const sx = Math.round(this.x - cam.rx);
    const sy = Math.round(this.y - cam.ry);
    if (sx < -120 || sx > W + 120) return;

    const assets = world && world.assets;
    const propsImg = assets && assets.img ? assets.img('boss_door_props') : null;
    const guardFr = assets && assets.frame ? assets.frame('boss_door_props', 'exit_guardian') : null;
    const steleFr = assets && assets.frame ? assets.frame('boss_door_props', 'ward_stele') : null;
    const brazFr = assets && assets.frame ? assets.frame('boss_door_props', 'iron_brazier') : null;
    const gatesImg = assets && assets.img ? assets.img('boss_gates') : null;
    const baseFr = assets && assets.frame ? assets.frame('boss_gates', 'jamb_base') : null;

    ctx.save();
    // 1. Pixel-art carved stone ritual dais (`jamb_base` plinth) + flanking guardian statues & braziers
    if (gatesImg && baseFr) {
      ctx.drawImage(gatesImg, baseFr.x, baseFr.y, baseFr.w, Math.min(14, baseFr.h), sx - 28, sy - 8, 56, 10);
    } else {
      ctx.fillStyle = '#1b1726';
      ctx.fillRect(sx - 34, sy - 4, 68, 5);
    }
    if (propsImg && guardFr && steleFr) {
      ctx.globalAlpha = this.open ? 0.96 : 0.72;
      assets.draw(ctx, 'boss_door_props', 'exit_guardian', sx - 44, sy + 1);
      assets.draw(ctx, 'boss_door_props', 'ward_stele', sx + 44, sy + 1);
      if (brazFr) {
        assets.draw(ctx, 'boss_door_props', 'iron_brazier', sx - 26, sy + 1);
        assets.draw(ctx, 'boss_door_props', 'iron_brazier', sx + 26, sy + 1);
      }
      ctx.globalAlpha = 1;
    }

    if (!this.open || this.rise <= 0.01) {
      ctx.restore();
      return;
    }

    const nextKey = this.resolveNextKey(world);
    const destIdx = nextKey ? stageIndexOf(nextKey) : -1;
    const destStage = destIdx >= 0 ? STAGES[destIdx] : null;
    const destTheme = destStage ? (THEMES[destStage.theme] || THEMES.graveyard) : THEMES.throne;
    const rimRgb = hexToRgb01(destTheme.accent || '#9c6bff', [0.62, 0.38, 0.98]);
    const coreRgb = [1.0, 0.91, 0.64];
    const openEase = 1 - Math.pow(1 - Math.min(1, this.rise), 3);
    const bob = Math.sin(time * 2.6) * 2.5;
    const vx = sx;
    const vy = Math.round(sy - 56 + bob);
    const rx = 34;
    const ry = 50;

    // 3. Soft additive halo behind the dimensional rift
    const glow = getGlowCanvas('violet') || getGlowCanvas('amber');
    if (glow) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (0.34 + 0.10 * Math.sin(time * 4.2)) * openEase;
      ctx.drawImage(glow, vx - 56, vy - 72, 112, 144);
      ctx.restore();
    }

    // 4. Primary Animated WebGL Shader Vortex (with 2D multi-spiral fallback when shaders are off)
    const fxl = getFxLayers();
    if (fxl && fxl.enabled && fxl.vortex) {
      fxl.vortex(ctx, {
        x: vx,
        y: vy,
        rx,
        ry,
        open: openEase,
        seed: (this.x * 0.017) % 6.28,
        core: coreRgb,
        rim: rimRgb,
        alpha: 0.96,
      });
      fxl.addFlame(sx - 38, sy - 50, 7, 12, rimRgb, this.x * 0.03);
      fxl.addFlame(sx + 38, sy - 50, 7, 12, rimRgb, this.x * 0.03 + 1.7);
    } else {
      // 2D Canvas Swirling Vortex Fallback
      for (let ring = 5; ring >= 0; ring--) {
        const frac = (ring + 1) / 6;
        const rrx = rx * openEase * frac;
        const rry = ry * openEase * frac;
        ctx.fillStyle = ring === 0
          ? '#090414'
          : ring === 1
            ? '#fff4cc'
            : ring % 2 === 0
              ? (destTheme.accent || '#9c6bff')
              : '#562898';
        ctx.globalAlpha = ring === 0 ? 0.95 : (0.35 + 0.12 * (5 - ring)) * openEase;
        ctx.beginPath();
        ctx.ellipse(vx, vy, Math.max(2, rrx), Math.max(3, rry), Math.sin(time * 2 + ring) * 0.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // 5. Orbiting pixel-art energy runes & event-horizon sparkles around the vortex
    for (let i = 0; i < 8; i++) {
      const ang = time * 2.4 + i * (Math.PI / 4);
      const orbitR = (0.78 + 0.14 * Math.sin(time * 3.1 + i * 1.7)) * openEase;
      const mx = Math.round(vx + Math.cos(ang) * rx * orbitR);
      const my = Math.round(vy + Math.sin(ang) * ry * orbitR);
      ctx.fillStyle = i % 2 === 0 ? '#fff6d6' : (destTheme.accent || '#b98cff');
      ctx.globalAlpha = (0.65 + 0.35 * Math.sin(time * 6 + i)) * openEase;
      ctx.fillRect(mx - 1, my - 1, 2, 2);
    }
    ctx.restore();
  }

  drawPrompt(ctx, cam, font, world) {
    if (!this.open) return;
    const nextKey = this.resolveNextKey(world);
    const destIdx = nextKey ? stageIndexOf(nextKey) : -1;
    const destStage = destIdx >= 0 ? STAGES[destIdx] : null;
    const shortDest = destStage ? destStage.name.replace(/^THE\s+/, '') : 'DAWN FINALE';
    const sx = Math.round(this.x - cam.rx);
    const sy = Math.round(this.y - cam.ry);
    if (sx < -60 || sx > W + 60) return;
    const topLine = this.near ? `→ ENTER VORTEX: ${shortDest}` : `VORTEX → ${shortDest}`;
    drawDoorPrompt(ctx, font, sx, Math.max(46, sy - 132), topLine, {
      color: this.near ? '#fff4cc' : '#ffd27a',
      border: this.near ? '#ffe8a4' : '#b98cff',
      alpha: Math.min(1, this.openT / 0.35),
    });
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

  // 1b. Golden Astral Warp Chamber (`WarpMirror`, decoupled from Save Sanctum)
  let warpMirror = null;
  if (stage.warpAnchor && stage.warpAnchor.col != null) {
    const wc = stage.warpAnchor.col;
    const wr = stage.warpAnchor.row != null ? stage.warpAnchor.row : level.surfaceRow(wc);
    warpMirror = new WarpMirror(wc * TILE + 16, wr * TILE);
    usedCols.push(wc);
    safeWindows.push({ x0Px: (wc - 4) * TILE, x1Px: (wc + 5) * TILE });
  } else {
    const warpTarget = Math.max(14, Math.round(bossTriggerCol * 0.68));
    const warpSpot = findSafeFloor(level, warpTarget, 10, Math.max(16, bossTriggerCol - 18), usedCols, false);
    if (warpSpot) {
      warpMirror = new WarpMirror(warpSpot.col * TILE + 16, warpSpot.row * TILE);
      usedCols.push(warpSpot.col);
      safeWindows.push({ x0Px: (warpSpot.col - 4) * TILE, x1Px: (warpSpot.col + 5) * TILE });
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

  // 5. Authored Exploration Mechanics: Lodestone Rings, Shortcut Switch Gates, Tiered Chests, Glyph Sigils & Secret Walls
  const magnetNodes = [];
  if (Array.isArray(stage.magnetAnchors)) {
    for (const ma of stage.magnetAnchors) {
      magnetNodes.push(new MagnetNode(ma.col * TILE + 16, ma.row * TILE, level));
    }
  }

  const openedSwitches = (world.game && world.game.openedSwitches) ? world.game.openedSwitches : null;
  const switchGates = [];
  if (Array.isArray(stage.switchGatesData)) {
    for (const sg of stage.switchGatesData) {
      const isOpen = !!(openedSwitches && openedSwitches.has(sg.id));
      switchGates.push(new SwitchGate(sg, level, isOpen));
      safeWindows.push({ x0Px: (sg.leverCol - 2) * TILE, x1Px: (sg.leverCol + 3) * TILE });
    }
  }

  const openedChests = (world.game && world.game.openedChests) ? world.game.openedChests : null;
  const chests = [];
  if (Array.isArray(stage.chestAnchors)) {
    for (const ch of stage.chestAnchors) {
      const isOpen = !!(openedChests && openedChests.has(ch.id));
      chests.push(new TreasureChest(ch, stageIdx, isOpen));
    }
  }

  const glyphSigils = [];
  if (Array.isArray(stage.glyphAnchors)) {
    for (const gl of stage.glyphAnchors) {
      glyphSigils.push(new GlyphSigil(gl, stage.key));
      safeWindows.push({ x0Px: (gl.col - 2) * TILE, x1Px: (gl.col + 3) * TILE });
    }
  }

  const expCells = (world.game && world.game.exploredCells) ? world.game.exploredCells : null;
  const secretWalls = [];
  if (Array.isArray(stage.secretWallAnchors)) {
    for (const sw of stage.secretWallAnchors) {
      const alreadyDisc = !!(sw.revealCellKey && expCells && expCells.has(sw.revealCellKey));
      secretWalls.push(new SecretWall(sw, level, alreadyDisc));
    }
  }

  // 5b. Also include any authored SAVE_ROOMs in safeWindows (`0` enemies, `0` spawners)
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

  // 6. Vertical Boss Doors: the left-side Boss Gate Door (sealed by castle progression)
  //    and the right-side Boss Exit Door (opens after defeating the stage boss)
  let bossExitDoor = null;
  let bossGateDoor = null;
  if (stage.boss) {
    const exitX = stage.boss.exitX != null ? stage.boss.exitX : (stage.boss.camX + 580);
    const exitY = stage.boss.exitY != null ? stage.boss.exitY : stage.boss.arena.floorY;
    bossExitDoor = new BossExitDoor(exitX, exitY, stage.boss, level);
    if (stage.boss.gateCol != null && Array.isArray(stage.boss.gateRows)) {
      bossGateDoor = new BossGateDoor(stage.boss, level);
    }
  }

  if (addedPlatforms) level.recompute();

  return {
    sanctuary,
    warpMirror,
    passages,
    vessel,
    pedestal,
    magnetNodes,
    switchGates,
    chests,
    glyphSigils,
    secretWalls,
    bossExitDoor,
    bossGateDoor,
  };
}
