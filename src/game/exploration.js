// Interconnected Castle Exploration: physical in-stage Passage Gateways
// between connected regions, ability-gated shortcut seals, Sanctuary Waystones
// (healing + fast-travel attunement), and 13 persistent Ancient Life Vessels
// hidden on Night-Wings high balconies and sunken vaults.

import { W, H, TILE, T_EMPTY, T_GATE, isMaterialTile } from '../engine/constants.js';
import { getFxLayers } from '../engine/fxlayers.js';
import { STAGES } from './stages.js';
import { THEMES } from './builder.js';
import { BOSS_RELICS } from './relics.js';
import { stageDoorsFor, stageIndexOf, canTraverseDoor, isCleared, nextAdjacentStageKey } from './castlemap.js';
import { bossGateStatus, stageEntryLock, canEnterStage, DEFAULT_DEBUG_FLAGS } from './gates.js';
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

/**
 * Shared renderer for the castle's tall **vertical boss doors**: an iron
 * Shared renderer for the castle's tall **vertical boss doors**: a narrow
 * side-profile iron portcullis (`boss_gates` `entry_gate` or `exit_gate`)
 * spanning continuously from the top of the screen (`y = 0`) down to `floorSy`
 * as a single top-to-bottom sprite (never stacked), sliding straight up into
 * the ceiling channel (`side_jamb`) when it opens and slamming down when it
 * seals, flanked on the floor beside the door by gothic guardian statues,
 * wrought-iron braziers, and carved ward steles (`boss_door_props`).
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
  const gateFrameName = isExit ? 'exit_gate' : 'entry_gate';
  const gateFrame = assets && assets.frame ? assets.frame('boss_gates', gateFrameName) : null;
  const jambFrame = assets && assets.frame ? assets.frame('boss_gates', 'side_jamb') : null;
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
  const statueX = sx - 42;
  const brazierX = sx - 18;
  const steleX = sx + 22;
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

  // 3. Narrow side-cutaway stone gate slot column (`side_jamb` spanning top-to-bottom)
  const jambW = 22;
  const slotX = Math.round(sx - jambW * 0.5);
  if (gatesImg && jambFrame) {
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.drawImage(
      gatesImg,
      jambFrame.x, jambFrame.y, jambFrame.w, jambFrame.h,
      slotX - 4, topSy, jambW + 8, fullH,
    );
    ctx.restore();
  } else {
    const pierGrad = ctx.createLinearGradient(0, topSy, 0, floorSy);
    pierGrad.addColorStop(0, '#1b1826');
    pierGrad.addColorStop(0.55, '#302b40');
    pierGrad.addColorStop(1, '#1d1a28');
    ctx.fillStyle = pierGrad;
    ctx.fillRect(slotX, topSy, jambW, fullH);
    ctx.fillStyle = '#090811';
    ctx.fillRect(sx - 4, topSy, 8, fullH);
  }

  // 4. Single continuous top-to-bottom side-profile iron gate (`entry_gate` or `exit_gate`),
  //    narrow (`18 px` wide) and viewed from the side edge so spikes/crests face the hunter!
  const lift = Math.round(rise * fullH);
  const bottom = floorSy - lift;
  const gateDrawW = 18;
  ctx.save();
  ctx.beginPath();
  ctx.rect(sx - 16, topSy - 2, 32, fullH + 4);
  ctx.clip();
  if (bottom > topSy) {
    if (gatesImg && gateFrame) {
      // Flip horizontally so the side-profile spikes/skulls (entry) or sun-crests/scrolls (exit)
      // face LEFT toward the approaching hunter in 2D side view, drawn as ONE single top-to-bottom sprite!
      ctx.save();
      ctx.translate(sx, bottom);
      ctx.scale(-1, 1);
      ctx.drawImage(
        gatesImg,
        gateFrame.x, gateFrame.y, gateFrame.w, gateFrame.h,
        -Math.round(gateDrawW * 0.5), -fullH, gateDrawW, fullH,
      );
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

/**
 * Right-side **Boss Exit Door**: a matching vertical portcullis sealing the far
 * wall of every boss arena during combat. It rises with a golden-amber
 * shockwave once the guardian falls, and walking (or pressing `↑`) into the
 * open doorway steps directly into the next adjacent connected castle level
 * without returning to the Castle Map.
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
    // Full top-to-bottom screen height, matching the Boss Gate Door on the other side of the arena
    let height = 360;
    if (bossData && level) {
      const col = Math.floor(x / TILE);
      const floorRow = bossData.gateRows[1] + 1;
      let top = floorRow - 1;
      while (top > 0 && !isMaterialTile(level.tile(col, top - 1))) top--;
      height = Math.max(360, (floorRow - top) * TILE);
    }
    this.height = height;
  }

  openNow(world) {
    if (this.open) return;
    this.open = true;
    this.openT = 0;
    this.openedWithPlayerInside = !!(world && world.player && Math.abs(world.player.x - this.x) < 22);
    if (world) {
      world.sfx('gate');
      world.particles.sparks(this.x, this.y - 48, 24, '#ffd27a');
      world.particles.dust(this.x, this.y, 10, '#d8c59e');
      world.emitShockwave(this.x, this.y - 52, {
        maxR: 142,
        dur: 0.54,
        strength: 0.78,
        color: [1.0, 0.84, 0.38],
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
      this.rise = Math.min(1, this.rise + dt / 0.6);
    }
    const dx = Math.abs(player.x - this.x);
    const dy = Math.abs(player.y - this.y);
    this.near = this.open && dx < 46 && dy < 44;
    if (this.openedWithPlayerInside && player.x < this.x - 22) {
      this.openedWithPlayerInside = false;
    }
    // Closed: the iron sill bars the hunter (player-only, so the boss AI is never snagged)
    if (!this.open && player.x > this.x - 18) {
      player.x = this.x - 18;
      if (player.vx > 0) player.vx = 0;
      if (player.alive && world.time - this.lastBlockT > 1.8 && input && input.down && input.down.right) {
        this.lastBlockT = world.time;
        world.sfx('block');
        world.particles.sparks(this.x - 14, this.y - 48, 8, '#ff5a78');
      }
      return;
    }
    if (!this.open || this.rise < 0.6 || player.hurtT > 0 || dy >= 44) return;

    const walkedIntoPortal = player.x >= this.x - 10
      && (!this.openedWithPlayerInside || (input && input.down && input.down.right) || player.vx > 8);
    const pressedEnterDoor = dx < 40
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
    if (sx < -100 || sx > W + 100) return;
    const nextKey = this.open ? this.resolveNextKey(world) : null;
    const destIdx = nextKey ? stageIndexOf(nextKey) : -1;
    const destStage = destIdx >= 0 ? STAGES[destIdx] : null;
    const destTheme = destStage ? (THEMES[destStage.theme] || THEMES.graveyard) : THEMES.throne;
    drawVerticalDoor(ctx, world.assets, sx, sy, {
      rise: this.rise,
      height: this.height,
      time,
      sealed: !this.open,
      lockColor: '#ff5a78',
      glowColor: destTheme.accent || '#ffd27a',
      open: this.open,
      fxSeed: this.x * 0.05 + 0.7,
      kind: 'exit',
    });
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
    const topLine = this.near ? `→ ENTER ${shortDest}` : `→ ${shortDest}`;
    drawDoorPrompt(ctx, font, sx, Math.max(46, sy - 150), topLine, {
      color: this.near ? '#fff4cc' : '#ffd27a',
      border: this.near ? '#ffe8a4' : '#ffd27a',
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

  return { sanctuary, passages, vessel, pedestal, bossExitDoor, bossGateDoor };
}
