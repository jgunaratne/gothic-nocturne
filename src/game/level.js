// Tile grid, collision queries, dynamic 2.5D stage mechanics (moving lifts,
// orbiting gear gondolas, crumbling masonry) and 3D-extruded tile rendering.

import {
  TILE, T_EMPTY, T_GROUND, T_STONE, T_CATACOMB, T_CLOCK, T_FOREST, T_SNOW, T_DARKWOOD,
  T_PLATFORM, T_CRUMBLE, T_SPIKES, T_BLOCK, T_GATE, T_BOUND,
  MATERIAL_STRIP, isMaterialTile, isSolidTile, W, H,
} from '../engine/constants.js';
import { project3D, FOCAL, EYE_X, EYE_Y } from './stage3d.js';
import { getTexBank, getGlowCanvas, shadeOverlay32, texQuad, texStripZ } from './tex3d.js';
import { getFxLayers } from '../engine/fxlayers.js';

const DECK_Z = 38;     // z-depth of receding walkable top surfaces
const SIDE_Z = 42;     // z-depth of exposed vertical step/cliff side returns
const DECK_FOG = [10, 10, 22];

export class Level {
  constructor(data) {
    this.cols = data.cols;
    this.rows = data.rows;
    this.width = this.cols * TILE;
    this.height = this.rows * TILE;
    this.tiles = new Uint8Array(this.cols * this.rows);
    this.depth = new Uint8Array(this.cols * this.rows);
    this.decor = data.decor || [];
    this.rooms = data.rooms || [];
    this.blockDrops = data.blockDrops || {};
    this.checkpoints = data.checkpoints || [];
    this.platformImg = data.platform || 'platform';
    this.platformRuns = [];
    this.bridgeRuns = [];
    this.crumbles = [];
    this.crumbleMap = new Map();
    this.movers = (data.movers || []).map((m) => makeMover(m));
    data.build(this);
    this.recompute();
  }

  // ------------------------------------------------------------ building
  fill(x0, x1, y0, y1, t) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, t);
  }
  /** Solid terrain from `surfaceRow` down to the bottom row. */
  ground(x0, x1, surfaceRow, t = T_GROUND) { this.fill(x0, x1, surfaceRow, this.rows - 1, t); }
  /**
   * 1-tile-thick elevated stone/timber viaduct deck with open space below so
   * 3D background courtyards, frozen lakes and subterranean chasms remain visible.
   */
  bridge(x0, x1, row, t = T_GROUND) {
    this.clear(x0, x1, row + 1, this.rows - 1);
    this.fill(x0, x1, row, row, t);
  }
  /** Fissured stone slabs that tremble and collapse shortly after being stepped on. */
  crumble(x0, x1, row) {
    for (let tx = x0; tx <= x1; tx++) {
      this.set(tx, row, T_CRUMBLE);
      const key = `${tx},${row}`;
      if (!this.crumbleMap.has(key)) {
        const rec = { tx, ty: row, state: 'idle', timer: 0 };
        this.crumbles.push(rec);
        this.crumbleMap.set(key, rec);
      }
    }
  }
  clear(x0, x1, y0 = 0, y1 = this.rows - 1) { this.fill(x0, x1, y0, y1, T_EMPTY); }
  platform(x0, x1, row) { this.fill(x0, x1, row, row, T_PLATFORM); }
  set(x, y, t) { if (x >= 0 && y >= 0 && x < this.cols && y < this.rows) this.tiles[y * this.cols + x] = t; }

  recompute() {
    // Depth below the surface for same-material solid tiles (texture rows).
    for (let x = 0; x < this.cols; x++) {
      let run = 0, prev = T_EMPTY;
      for (let y = 0; y < this.rows; y++) {
        const t = this.tiles[y * this.cols + x];
        if (isMaterialTile(t)) {
          if (t === prev) run++;
          else run = y === 0 ? 2 : 0; // ceiling blocks starting at row 0 use interior fill, not floor overhang
        } else run = 0;
        this.depth[y * this.cols + x] = Math.min(run, 3);
        prev = t;
      }
    }
    // Platform runs for cap rendering.
    this.platformRuns = [];
    for (let y = 0; y < this.rows; y++) {
      let x = 0;
      while (x < this.cols) {
        if (this.tile(x, y) === T_PLATFORM) {
          const x0 = x;
          while (x < this.cols && this.tile(x, y) === T_PLATFORM) x++;
          this.platformRuns.push({ x0, x1: x - 1, y });
        } else x++;
      }
    }
    // Elevated 1-tile-thick viaduct spans (solid material tile with open air above & below).
    this.bridgeRuns = [];
    for (let y = 4; y < this.rows - 1; y++) {
      let x = 0;
      while (x < this.cols) {
        const t = this.tile(x, y);
        const isSpan = (col) => isMaterialTile(this.tile(col, y)) && !this.isSolid(col, y - 1) && !this.isSolid(col, y + 1);
        if (isSpan(x)) {
          const x0 = x;
          while (x < this.cols && isSpan(x)) x++;
          this.bridgeRuns.push({ x0, x1: x - 1, y, mat: t });
        } else x++;
      }
    }
  }

  // ------------------------------------------------------------- queries
  tile(tx, ty) {
    if (tx < 0 || tx >= this.cols) return T_BOUND;
    if (ty < 0) return T_EMPTY;
    if (ty >= this.rows) return T_EMPTY;
    return this.tiles[ty * this.cols + tx];
  }
  isSolid(tx, ty) { return isSolidTile(this.tile(tx, ty)); }
  isOneWay(tx, ty) { const t = this.tile(tx, ty); return t === T_PLATFORM || t === T_CRUMBLE; }
  isSpike(tx, ty) { return this.tile(tx, ty) === T_SPIKES; }
  isStandable(tx, ty) { const t = this.tile(tx, ty); return isSolidTile(t) || t === T_PLATFORM || t === T_CRUMBLE; }

  /** First standable row at column tx (from the top), or -1. */
  surfaceRow(tx, fromRow = 0) {
    for (let y = fromRow; y < this.rows; y++) if (this.isStandable(tx, y)) return y;
    return -1;
  }

  /** Breaks a block tile; returns the drop item type (or null). */
  breakBlock(tx, ty) {
    if (this.tile(tx, ty) !== T_BLOCK) return null;
    this.set(tx, ty, T_EMPTY);
    const key = `${tx},${ty}`;
    return this.blockDrops[key] || null;
  }

  // ---------------------------------------------------- stage mechanics
  updateMechanics(dt, time, player, world) {
    // 1. Moving lifts & orbiting gear gondolas
    for (const m of this.movers) {
      m.prevX = m.x;
      m.prevY = m.y;
      if (m.kind === 'orbit') {
        const ang = time * m.speed + m.phase;
        m.angle = ang;
        m.x = m.cx + Math.cos(ang) * m.r;
        m.y = m.cy + Math.sin(ang) * m.r;
      } else {
        const pos = evalLinearMover(m.x0, m.y0, m.x1, m.y1, m.period, m.phase, m.dwell, time);
        m.x = pos.x;
        m.y = pos.y;
      }
      if (dt === 0) {
        m.prevX = m.x;
        m.prevY = m.y;
      }
      m.dx = m.x - m.prevX;
      m.dy = m.y - m.prevY;
      m.left = m.x - m.w * 0.5;
      m.right = m.x + m.w * 0.5;
    }

    // 2. Crumbling stone slabs
    if (!this.crumbles.length) return;
    const pStand = player && player.alive && player.onGround && !player.dropThrough;
    const ptx0 = pStand ? Math.floor(player.left / TILE) : -99;
    const ptx1 = pStand ? Math.floor((player.right - 0.01) / TILE) : -99;
    const pty = pStand ? Math.floor((player.bottom + 1) / TILE) : -99;

    for (const c of this.crumbles) {
      if (c.state === 'idle') {
        if (pStand && c.ty === pty && c.tx >= ptx0 && c.tx <= ptx1) {
          c.state = 'shake';
          c.timer = 0.52;
          if (world) world.particles.dust(c.tx * TILE + 16, c.ty * TILE + 6, 4, '#b8b0a0');
        }
      } else if (c.state === 'shake') {
        c.timer -= dt;
        if (world && Math.random() < 0.35) {
          world.particles.dust(c.tx * TILE + 8 + Math.random() * 16, c.ty * TILE + 14, 1, '#9c9488');
        }
        if (c.timer <= 0) {
          c.state = 'gone';
          c.timer = 2.8;
          this.set(c.tx, c.ty, T_EMPTY);
          if (world) {
            world.sfx('block');
            world.particles.shards(c.tx * TILE + 16, c.ty * TILE + 12, 7, '#8a92a8', c.ty * TILE + 48);
          }
        }
      } else if (c.state === 'gone') {
        c.timer -= dt;
        if (c.timer <= 0) {
          c.state = 'idle';
          c.timer = 0;
          this.set(c.tx, c.ty, T_CRUMBLE);
          if (world) world.particles.dust(c.tx * TILE + 16, c.ty * TILE + 8, 3, '#c8d0e0');
        }
      }
    }
  }

  /** Carries a grounded entity along with the MovingPlatform under its feet. */
  carryEntity(ent) {
    const m = ent && ent.riding;
    if (!m || !ent.onGround || ent.dropThrough) return;
    if (m.dx !== 0) ent.moveX(this, m.dx);
    if (m.dy !== 0) {
      ent.y += m.dy;
      // Prevent rising lift from pushing head into an overhead solid ceiling
      // (ignore vertical side walls where ty + 1 is also solid).
      if (m.dy < 0) {
        const ty = Math.floor(ent.top / TILE);
        const tx0 = Math.floor(ent.left / TILE), tx1 = Math.floor((ent.right - 0.01) / TILE);
        for (let tx = tx0; tx <= tx1; tx++) {
          if (this.isSolid(tx, ty) && !this.isSolid(tx, ty + 1)) {
            ent.y = (ty + 1) * TILE + ent.h;
            break;
          }
        }
      }
    }
  }

  // ------------------------------------------------------------ drawing
  drawDecor(ctx, cam, assets, time, stage3d = null) {
    this._assets = assets;
    const camX = cam.rx, camY = cam.ry;
    const room = this.rooms[0];
    for (const d of this.decor) {
      if (d.type === 'gear') {
        if (stage3d) stage3d.drawGear3D(ctx, camX, camY, d.x, d.y, d.z == null ? 52 : d.z, d, time);
        continue;
      }
      // Wall-mounted pieces inside a vaulted hall sit directly on the far 3D masonry
      // wall (z = 200) at matching perspective scale so they stay 100% locked to the bricks.
      const inRoom = room && !room.cylinder && d.x >= room.x0 * TILE && d.x <= (room.x1 + 1) * TILE;
      const onWall = WALL_DECOR.has(d.frame) && inRoom;
      let x, y, sc = 1;
      if (onWall) {
        const p = project3D(d.x, d.y, 200, camX, camY);
        x = p.x; y = p.y; sc = p.s;
      } else {
        x = d.x - camX; y = d.y - camY;
      }
      if (x < -220 || x > W + 220 || y < -260 || y > H + 300) continue;
      if (d.type === 'pendulum') { this.drawPendulum(ctx, x, y, d, time); continue; }
      if (d.type === 'chandelier') { this.drawChandelier(ctx, x, y, d, time); continue; }
      if (d.type === 'cage') { this.drawCage(ctx, x, y, d, time); continue; }
      assets.draw(ctx, d.sheet, d.frame, x, y, false, 1, sc);
      if (d.sheet === 'stained_glass') {
        const f = assets.frame('stained_glass', d.frame);
        const glow = getGlowCanvas(d.frame === 'rose' ? 'amber' : d.frame === 'hunter' ? 'crimson' : 'violet');
        if (f && glow) {
          const gw = f.w * sc * 1.6, gh = f.h * sc * 1.3;
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.22 + 0.06 * Math.sin(time * 0.7 + d.x);
          ctx.drawImage(glow, x - gw / 2, y - f.ay * sc + f.h * sc / 2 - gh / 2, gw, gh);
          ctx.restore();
        }
      }
      if (d.frame === 'window') {
        const f = assets.frame('arch', 'window');
        const fw = f.w * sc, fh = f.h * sc;
        ctx.save();
        ctx.globalAlpha = 0.10 + 0.04 * Math.sin(time * 0.8 + d.x);
        ctx.fillStyle = '#b08cff';
        ctx.fillRect(Math.round(x - f.ax * sc + 3 * sc), Math.round(y - f.ay * sc + 3 * sc), fw - 6 * sc, fh - 6 * sc);
        ctx.restore();
      }
      if (d.frame === 'torch') { drawFlameGlow(ctx, x, y - 36 * sc, time + d.x, 22 * sc, 0.55); const fx = getFxLayers(); if (fx) fx.addFlame(x, y - 30 * sc, 9 * sc, 16 * sc, [1.0, 0.58, 0.18], d.x * 0.013); }
      else if (d.frame === 'jack_big') drawFlameGlow(ctx, x, y - 20, time + d.x, 30, 0.7);
      else if (d.frame === 'jack_small') drawFlameGlow(ctx, x, y - 12, time + d.x, 20, 0.6);
      else if (d.frame === 'scarecrow') drawFlameGlow(ctx, x, y - 64, time + d.x, 18, 0.6);
      else if (d.frame === 'lamppost') drawFlameGlow(ctx, x, y - 66, time + d.x, 26, 0.6);
      else if (d.frame === 'moss_lantern') drawFlameGlow(ctx, x, y - 48, time + d.x, 28, 0.68, 'emerald');
      else if (d.frame === 'glow_shrooms') drawFlameGlow(ctx, x, y - 12, time + d.x, 22, 0.55, 'emerald');
      else if (d.frame === 'ancient_totem') drawFlameGlow(ctx, x, y - 44, time + d.x, 20, 0.50, 'emerald');
      else if (d.frame === 'tree') {
        const f = assets.frame('xmasprops', 'tree');
        if (f) {
          for (let i = 0; i < 7; i++) {
            const k = (Math.sin(time * 3 + i * 1.7 + d.x) + 1) / 2;
            if (k < 0.35) continue;
            const lx = x - f.w / 2 + 6 + ((i * 37) % Math.max(1, f.w - 12)), ly = y - 12 - ((i * 23) % Math.max(1, f.h - 24));
            ctx.fillStyle = i % 2 ? `rgba(255, 90, 90, ${k})` : `rgba(255, 220, 120, ${k})`;
            ctx.fillRect(Math.round(lx), Math.round(ly), 2, 2);
          }
        }
      }
    }
  }

  /**
   * Clock-tower pendulum: a rod on a pivot swinging in a 3D arc that comes
   * toward the viewer, foreshortening the brass bob into an ellipse.
   */
  drawPendulum(ctx, x, y, d, time) {
    const len = d.len || 150, period = d.period || 2.6;
    const a = Math.sin(time * (Math.PI * 2) / period + (d.phase || 0)) * 0.55;
    const depth = Math.cos(a);
    const bx = x + Math.sin(a) * len, by = y + Math.cos(a) * len * (0.85 + 0.15 * depth);
    ctx.save();
    ctx.fillStyle = '#2a2218'; ctx.fillRect(Math.round(x) - 6, Math.round(y) - 6, 12, 8);
    ctx.fillStyle = '#8a7444'; ctx.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
    ctx.strokeStyle = '#3a2f22'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(bx, by); ctx.stroke();
    ctx.strokeStyle = '#8a7444'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - 1, y); ctx.lineTo(bx - 1, by); ctx.stroke();
    const r = d.r || 22;
    ctx.translate(bx, by);
    ctx.scale(1, 0.7 + 0.3 * depth);
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r);
    g.addColorStop(0, '#c9a96a'); g.addColorStop(0.6, '#8a6a34'); g.addColorStop(1, '#3a2a14');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#2a2218'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, r - 1, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#2a2218';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /** Hanging wrought-iron chandelier: bitmap sprite swinging on a textured chain,
   *  with flickering candle frames, an additive glow and dripping ember motes. */
  drawChandelier(ctx, x, y, d, time) {
    const assets = this._assets;
    const sway = Math.sin(time * 1.1 + (d.phase || 0)) * 0.08;
    const chainLen = d.len || 90;
    const cx = x + Math.sin(sway) * chainLen, cy = y + Math.cos(sway) * chainLen;
    const f = assets && assets.frame('chandelier', 'a');
    if (!f) return;
    const sc = Math.max(0.7, Math.min(1.15, ((d.r || 30) * 2.7) / f.w));
    // Chain: repeated arch 'chain' link sprite along the swing, falling back to lines
    ctx.save();
    const link = assets.frame('arch', 'chain');
    const linkImg = assets.img('arch');
    const ang = Math.atan2(cx - x, cy - y);
    if (link && linkImg) {
      ctx.translate(x, y); ctx.rotate(-ang);
      const step = 10;
      for (let k = 0; k < chainLen - 4; k += step) {
        ctx.drawImage(linkImg, link.x, link.y, link.w, Math.min(step, link.h), -3, k, 6, step);
      }
      ctx.rotate(ang); ctx.translate(-x, -y);
    } else {
      ctx.strokeStyle = '#2b2740'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(cx, cy); ctx.stroke();
    }
    // Body: pivot at the top of the sprite's own chain stub
    const flick = Math.sin(time * 9 + (d.phase || 0) * 3) + Math.sin(time * 13.7 + (d.phase || 0));
    const name = flick > 0.2 ? 'b' : 'a';
    ctx.translate(cx, cy);
    ctx.rotate(sway * 0.6);
    ctx.scale(sc, sc);
    const fr = assets.frame('chandelier', name);
    ctx.drawImage(assets.img('chandelier'), fr.x, fr.y, fr.w, fr.h, Math.round(-fr.ax), 0, fr.w, fr.h);
    ctx.restore();
    // Candle glow sits at the ring (upper third of the sprite), swaying with it
    const ringY = cy + f.h * sc * 0.52;
    drawFlameGlow(ctx, cx, ringY, time + (d.phase || 0), 30 + 22 * sc, 0.6);
    drawFlameGlow(ctx, cx, ringY - 6, time * 1.3 + (d.phase || 0), 16 * sc, 0.5);
    const fxl = getFxLayers();
    if (fxl) for (let k = -2; k <= 2; k++) fxl.addFlame(cx + k * 14 * sc, ringY - 8 * sc + Math.abs(k) * 2, 5 * sc, 11 * sc, [1.0, 0.62, 0.2], (d.phase || 0) + k * 0.37);
  }

  /** Crypt gibbet cage swinging gently on its chain. */
  drawCage(ctx, x, y, d, time) {
    const sway = Math.sin(time * 0.8 + (d.phase || 0)) * 0.12;
    const len = d.len || 70, w = 22, h = 40;
    const cx = x + Math.sin(sway) * len, cy = y + Math.cos(sway) * len;
    ctx.save();
    ctx.strokeStyle = '#2b2740'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(cx, cy); ctx.stroke();
    ctx.translate(cx, cy); ctx.rotate(sway);
    const squeeze = 0.8 + 0.2 * Math.cos(sway * 4);
    ctx.scale(squeeze, 1);
    ctx.strokeStyle = '#3a3424'; ctx.lineWidth = 2;
    ctx.strokeRect(-w / 2, 0, w, h);
    for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(-w / 2 + (i * w) / 4, 0); ctx.lineTo(-w / 2 + (i * w) / 4, h); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-w / 2, h / 2); ctx.lineTo(w / 2, h / 2); ctx.stroke();
    ctx.fillStyle = '#c9c3b0'; ctx.fillRect(-4, 14, 8, 7);
    ctx.fillStyle = '#1a1626'; ctx.fillRect(-3, 16, 2, 2); ctx.fillRect(1, 16, 2, 2);
    ctx.restore();
  }

  drawTiles(ctx, cam, assets, time = 0, stage3d = null) {
    const camX = cam.rx, camY = cam.ry;
    const tx0 = Math.max(0, Math.floor(camX / TILE) - 1);
    const tx1 = Math.min(this.cols - 1, Math.ceil((camX + W) / TILE) + 1);
    const ty0 = Math.max(0, Math.floor(camY / TILE) - 1);
    const ty1 = Math.min(this.rows - 1, Math.ceil((camY + H) / TILE) + 1);
    const spikes = assets.frame('props', 'spikes'), propsImg = assets.img('props');
    const bank = getTexBank(assets);

    // 1. Texture-mapped 3D Viaduct Arches & Piers underneath open bridge spans.
    for (const br of this.bridgeRuns) {
      if (br.x1 < tx0 - 2 || br.x0 > tx1 + 2) continue;
      this.drawBridgeUnderstructure3D(ctx, camX, camY, br, bank);
    }

    // 2a. Merged, perspective-subdivided & texture-mapped 3D Walkable Top Decks & Ceiling Soffits (z = 0 -> DECK_Z).
    const blockTex = bank ? bank.get('block_stone') : null;
    for (let ty = ty0; ty <= ty1; ty++) {
      const wy = ty * TILE;
      if (wy > camY + EYE_Y + 4) {
        let tx = tx0;
        while (tx <= tx1) {
          const t = this.tiles[ty * this.cols + tx];
          const openAbove = isMaterialTile(t) && this.depth[ty * this.cols + tx] === 0 && (ty === 0 || !this.isSolid(tx, ty - 1));
          if (!openAbove) {
            if (t === T_BLOCK && (ty === 0 || !this.isSolid(tx, ty - 1))) {
              this.drawTopDeck3D(ctx, camX, camY, tx * TILE, wy, TILE, SIDE_Z, blockTex, 0.72);
            }
            tx++;
            continue;
          }
          const startTx = tx;
          while (
            tx <= tx1 &&
            this.tiles[ty * this.cols + tx] === t &&
            this.depth[ty * this.cols + tx] === 0 &&
            (ty === 0 || !this.isSolid(tx, ty - 1))
          ) tx++;
          const topTex = bank ? bank.matTop(t) : null;
          const darkScale = t === T_SNOW ? 0.54 : 0.68;
          this.drawTopDeck3D(ctx, camX, camY, startTx * TILE, wy, (tx - startTx) * TILE, DECK_Z, topTex, darkScale);
        }
      }
      if (wy + TILE < camY + EYE_Y - 8) {
        let tx = tx0;
        while (tx <= tx1) {
          const t = this.tiles[ty * this.cols + tx];
          const openBelow = isMaterialTile(t) && !this.isSolid(tx, ty + 1);
          if (!openBelow) {
            if (t === T_BLOCK && !this.isSolid(tx, ty + 1)) {
              this.drawCeilingSoffit3D(ctx, camX, camY, tx * TILE, (ty + 1) * TILE, TILE, SIDE_Z, blockTex);
            }
            tx++;
            continue;
          }
          const startTx = tx;
          while (
            tx <= tx1 &&
            this.tiles[ty * this.cols + tx] === t &&
            !this.isSolid(tx, ty + 1)
          ) tx++;
          const sideTex = bank ? bank.matSide(t) : null;
          this.drawCeilingSoffit3D(ctx, camX, camY, startTx * TILE, (ty + 1) * TILE, (tx - startTx) * TILE, DECK_Z, sideTex);
        }
      }
    }

    // 2b. Texture-mapped 3D vertical step & cliff side-returns (drawn after decks, strictly behind z = 0 tiles).
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = this.tiles[ty * this.cols + tx];
        if (isMaterialTile(t)) {
          const leftOpen = !this.isSolid(tx - 1, ty), rightOpen = !this.isSolid(tx + 1, ty);
          if (!leftOpen && !rightOpen) continue;
          const sideTex = bank ? bank.matSide(t) : null;
          const isSurf = this.depth[ty * this.cols + tx] === 0;
          if (leftOpen) {
            const joinBelow = ty + 1 <= ty1 && isMaterialTile(this.tile(tx, ty + 1)) && !this.isSolid(tx - 1, ty + 1);
            this.sideFace3D(ctx, camX, camY, tx * TILE, ty * TILE, -1, sideTex, isSurf, t === T_SNOW, joinBelow);
          }
          if (rightOpen) {
            const joinBelow = ty + 1 <= ty1 && isMaterialTile(this.tile(tx, ty + 1)) && !this.isSolid(tx + 1, ty + 1);
            this.sideFace3D(ctx, camX, camY, (tx + 1) * TILE, ty * TILE, 1, sideTex, isSurf, t === T_SNOW, joinBelow);
          }
        } else if (t === T_BLOCK) {
          if (!this.isSolid(tx - 1, ty)) this.sideFace3D(ctx, camX, camY, tx * TILE, ty * TILE, -1, blockTex, true, false, false);
          if (!this.isSolid(tx + 1, ty)) this.sideFace3D(ctx, camX, camY, (tx + 1) * TILE, ty * TILE, 1, blockTex, true, false, false);
        }
      }
    }

    // 3. Crisp z = 0 front 2D terrain faces, overhangs, breakable blocks & spikes.
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = this.tiles[ty * this.cols + tx];
        if (t === T_EMPTY || t === T_PLATFORM || t === T_CRUMBLE || t === T_GATE || t === T_BOUND) continue;
        const x = tx * TILE - camX, y = ty * TILE - camY;
        if (isMaterialTile(t)) {
          let name = MATERIAL_STRIP[t];
          if (assets.info(name + '_b') && hash2(tx >> 3, 7) % 100 < 45) name += '_b';
          const info = assets.info(name), img = assets.img(name);
          if (!info) continue;
          const d = this.depth[ty * this.cols + tx];
          const sx = (tx * TILE) % info.w;
          if (d === 0) {
            ctx.drawImage(img, sx, 0, TILE, info.overhang + TILE, x, y - info.overhang, TILE, info.overhang + TILE);
          } else {
            ctx.drawImage(img, sx, info.overhang + TILE * d, TILE, TILE, x, y, TILE, TILE);
            const j = hash2(tx, ty) % 100;
            const jmax = t === T_SNOW ? 0.025 : 0.07;
            if (j < 55) { ctx.fillStyle = `rgba(4, 3, 10, ${(0.3 + (j % 7) / 7 * 0.7) * jmax})`; ctx.fillRect(x, y, TILE, TILE); }
          }
        } else if (t === T_BLOCK) {
          assets.draw(ctx, 'props', 'block', x + 16, y + 32);
        } else if (t === T_SPIKES) {
          ctx.drawImage(propsImg, spikes.x + (tx % 2) * 32, spikes.y, 32, spikes.h, x, y + TILE - spikes.h, 32, spikes.h);
        }
      }
    }

    // 4. One-way platforms with textured 3D support trestles, receding top deck & 3D end caps.
    const platName = assets.info(this.platformImg) ? this.platformImg : 'platform';
    const plat = assets.info(platName), pImg = assets.img(platName);
    const wood = platName === 'platform_wood';
    const platTex = bank ? bank.get(wood ? 'plat_wood' : 'plat_stone') : null;
    const postTex = bank ? bank.get(wood ? 'wood_plank' : 'iron_rivet') : null;
    for (const r of this.platformRuns) {
      if (r.x1 < tx0 || r.x0 > tx1 || r.y < ty0 - 1 || r.y > ty1) continue;
      for (let tx = r.x0; tx <= r.x1; tx++) {
        if (tx !== r.x0 && tx !== r.x1 && (tx - r.x0) % 4 !== 2) continue;
        let gy = -1;
        for (let k = 1; k <= 6; k++) if (this.isSolid(tx, r.y + k)) { gy = r.y + k; break; }
        if (gy < 0) continue;
        const wx = tx * TILE + 12, wy0 = r.y * TILE + 16, wy1 = gy * TILE;
        if (wy1 <= wy0) continue;
        const f0 = project3D(wx, wy0, 24, camX, camY), f1 = project3D(wx, wy1, 24, camX, camY);
        const px0 = wx - camX, py0 = wy0 - camY, ph = wy1 - wy0;
        if (postTex) {
          texQuad(ctx, postTex,
            { x: f0.x, y: f0.y }, { x: f0.x + 6, y: f0.y },
            { x: f0.x + 6, y: f1.y }, { x: f0.x, y: f1.y },
            0, wy0, 8, wy0, 8, wy1, 0, wy1,
            shadeOverlay32([0, 0, -1], DECK_FOG, 0.48, 0.55));
          texQuad(ctx, postTex,
            { x: px0, y: py0 }, { x: px0 + 8, y: py0 },
            { x: px0 + 8, y: py0 + ph }, { x: px0, y: py0 + ph },
            0, wy0, 8, wy0, 8, wy1, 0, wy1,
            shadeOverlay32([-0.3, 0, -0.9], DECK_FOG, 0.28, 0.78));
        }
      }
    }
    for (const r of this.platformRuns) {
      if (r.x1 < tx0 || r.x0 > tx1 || r.y < ty0 - 1 || r.y > ty1) continue;
      const wy = r.y * TILE, y = wy - camY - 2;
      const spanW = (r.x1 - r.x0 + 1) * TILE;
      if (wy > camY + EYE_Y + 4) {
        this.drawTopDeck3D(ctx, camX, camY, r.x0 * TILE, wy, spanW, 28, platTex, 0.68);
      } else if (wy + 18 < camY + EYE_Y - 4) {
        this.drawCeilingSoffit3D(ctx, camX, camY, r.x0 * TILE, wy + 18, spanW, 28, platTex);
      }
      const slabH = Math.min(20, plat.h);
      this.drawSlabSide3D(ctx, camX, camY, r.x0 * TILE, wy, slabH, 28, -1, platTex);
      this.drawSlabSide3D(ctx, camX, camY, (r.x1 + 1) * TILE, wy, slabH, 28, 1, platTex);
      for (let tx = r.x0; tx <= r.x1; tx++) {
        const x = tx * TILE - camX;
        let sx;
        if (tx === r.x0) sx = 0;
        else if (tx === r.x1) sx = plat.w - TILE;
        else sx = TILE + ((tx - r.x0 - 1) % ((plat.w - 2 * TILE) / TILE)) * TILE;
        ctx.drawImage(pImg, sx, 0, TILE, plat.h, x, y, TILE, plat.h);
      }
    }

    // 5. Texture-mapped crumbling 3D stone slabs (fissured blocks + reform shimmer).
    if (this.crumbles.length) this.drawCrumbles3D(ctx, camX, camY, tx0, tx1, time, bank);

    // 6. Moving platforms & orbiting clockwork gear gondolas.
    if (this.movers.length) this.drawMovers3D(ctx, camX, camY, pImg, plat, platTex, time, stage3d);
  }

  /** Extruded & texture-mapped 3D viaduct arches, soffits & bridge piers beneath open spans. */
  drawBridgeUnderstructure3D(ctx, camX, camY, br, bank) {
    if (!bank) return;
    const x0 = br.x0 * TILE, x1 = (br.x1 + 1) * TILE;
    const wyTop = (br.y + 1) * TILE - 4;
    const isElder = br.mat === T_DARKWOOD;
    const isWood = br.mat === T_FOREST || br.mat === T_SNOW;
    const isClock = br.mat === T_CLOCK;
    const bodyTex = bank.get(
      isElder ? 'elder_bark' : isClock ? 'iron_truss' : isWood ? 'wood_plank' : (br.mat === T_CATACOMB ? 'crypt_stone' : 'wall'),
    );
    const soffitTex = bank.get(
      isElder ? 'elder_bark_h' : isClock ? 'iron_rivet' : isWood ? 'wood_plank' : (br.mat === T_CATACOMB ? 'crypt_stone' : 'stone_trim'),
    );
    const trimTex = bank.get(isElder ? 'moss_stone' : isClock ? 'brass_rim' : isWood ? 'iron_rivet' : 'stone_trim');

    // Underside cornice soffit running along z = 2..38 (subdivided per 96px bay)
    const soffitShade = shadeOverlay32([0, 0.8, -0.5], DECK_FOG, 0.36, 0.85);
    for (let sx = x0; sx < x1; sx += 96) {
      const ex = Math.min(x1, sx + 96);
      const fL = project3D(sx, wyTop, 2, camX, camY);
      const fR = project3D(ex + (ex < x1 ? 0.5 : 0), wyTop, 2, camX, camY);
      const bR = project3D(ex + (ex < x1 ? 0.5 : 0), wyTop + 8, 38, camX, camY);
      const bL = project3D(sx, wyTop + 8, 38, camX, camY);
      texQuad(ctx, soffitTex, fL, fR, bR, bL, sx, 0, ex, 0, ex, 32, sx, 32, soffitShade);
    }

    // Repeat 4-tile (128px) vaulted viaduct bays with texture-mapped 3D arches & piers
    const totalTiles = br.x1 - br.x0 + 1;
    const bayTiles = totalTiles >= 4 ? 4 : Math.max(2, totalTiles);
    for (let tx = br.x0; tx <= br.x1; tx += bayTiles) {
      const bx0 = tx * TILE;
      const bx1 = Math.min((br.x1 + 1) * TILE, (tx + bayTiles) * TILE);
      const span = bx1 - bx0;
      if (bx1 - camX < -64 || bx0 - camX > W + 64) continue;

      if (totalTiles >= 5 && tx > br.x0) {
        const pw = 20, px0 = bx0 - pw / 2, ph = (this.rows - br.y) * TILE + 40;
        const pfTL = project3D(px0, wyTop, 10, camX, camY);
        const pfTR = project3D(px0 + pw, wyTop, 10, camX, camY);
        const pfBL = project3D(px0 - 4, wyTop + ph, 10, camX, camY);
        const pfBR = project3D(px0 + pw + 4, wyTop + ph, 10, camX, camY);
        const pbTL = project3D(px0, wyTop, 42, camX, camY);
        const pbTR = project3D(px0 + pw, wyTop, 42, camX, camY);
        const pbBL = project3D(px0 - 4, wyTop + ph, 42, camX, camY);
        const pbBR = project3D(px0 + pw + 4, wyTop + ph, 42, camX, camY);

        if (pbTL.x < pfTL.x - 0.4) {
          texQuad(ctx, bodyTex, pbTL, pfTL, pfBL, pbBL,
            0, wyTop, 32, wyTop, 32, wyTop + ph, 0, wyTop + ph,
            shadeOverlay32([-1, 0, -0.2], DECK_FOG, 0.42));
        } else if (pbTR.x > pfTR.x + 0.4) {
          texQuad(ctx, bodyTex, pfTR, pbTR, pbBR, pfBR,
            0, wyTop, 32, wyTop, 32, wyTop + ph, 0, wyTop + ph,
            shadeOverlay32([1, 0, -0.2], DECK_FOG, 0.42));
        }
        texQuad(ctx, bodyTex, pfTL, pfTR, pfBR, pfBL,
          px0, wyTop, px0 + pw, wyTop, px0 + pw + 4, wyTop + ph, px0 - 4, wyTop + ph,
          shadeOverlay32([0, -0.1, -1], DECK_FOG, 0.28));

        // Texture-mapped pier capital collar
        const capW = pfTR.x - pfTL.x + 6;
        texQuad(ctx, trimTex,
          { x: pfTL.x - 3, y: pfTL.y }, { x: pfTL.x - 3 + capW, y: pfTL.y },
          { x: pfTL.x - 3 + capW, y: pfTL.y + 6 }, { x: pfTL.x - 3, y: pfTL.y + 6 },
          0, 0, 32, 0, 32, 8, 0, 8,
          shadeOverlay32([0, -0.3, -0.9], DECK_FOG, 0.20));
      }

      if (span >= 64) {
        const segs = 6;
        const archRise = Math.min(34, span * 0.26);
        const ySpring = wyTop + archRise + 4;
        const spandrelShade = shadeOverlay32([0, -0.1, -1], DECK_FOG, 0.26);
        let arcU = 0;
        for (let i = 0; i < segs; i++) {
          const t0 = i / segs, t1 = (i + 1) / segs;
          const ax0 = bx0 + span * t0, ax1 = bx0 + span * t1;
          const ay0 = ySpring - Math.sin(t0 * Math.PI) * archRise;
          const ay1 = ySpring - Math.sin(t1 * Math.PI) * archRise;
          const segLen = Math.hypot(ax1 - ax0, ay1 - ay0);

          const af0 = project3D(ax0, ay0, 6, camX, camY);
          const af1 = project3D(ax1, ay1, 6, camX, camY);
          const ab1 = project3D(ax1, ay1, 40, camX, camY);
          const ab0 = project3D(ax0, ay0, 40, camX, camY);
          const nx = Math.cos(((t0 + t1) * 0.5) * Math.PI) * 0.65;
          texQuad(ctx, soffitTex, af0, af1, ab1, ab0,
            arcU, 0, arcU + segLen, 0, arcU + segLen, 34, arcU, 34,
            shadeOverlay32([nx, 0.75, -0.2], DECK_FOG, 0.44));
          arcU += segLen;
        }
        for (let i = 0; i < segs; i++) {
          const t0 = i / segs, t1 = (i + 1) / segs;
          const ax0 = bx0 + span * t0, ax1 = bx0 + span * t1;
          const ay0 = ySpring - Math.sin(t0 * Math.PI) * archRise;
          const ay1 = ySpring - Math.sin(t1 * Math.PI) * archRise;
          const padX = i < segs - 1 ? 0.5 : 0;
          const af0 = project3D(ax0, ay0, 6, camX, camY);
          const st0 = project3D(ax0, wyTop, 6, camX, camY);
          const st1 = project3D(ax1 + padX, wyTop, 6, camX, camY);
          const sf1 = project3D(ax1 + padX, ay1, 6, camX, camY);
          texQuad(ctx, bodyTex, st0, st1, sf1, af0,
            ax0, wyTop, ax1, wyTop, ax1, ay1, ax0, ay0, spandrelShade);
        }
      }
    }
  }

  /** Receding texture-mapped 3D walkable deck behind the crisp `z = 0` front lip. */
  drawTopDeck3D(ctx, camX, camY, wx, wy, w, zBack, topTex, darkScale = 0.68) {
    if (!topTex) return;
    const fY = wy - camY;
    const bRef = project3D(wx, wy, zBack, camX, camY);
    if (fY <= bRef.y + 0.8) return;

    const shade = shadeOverlay32([0, -0.85, -0.35], DECK_FOG, 0.34, darkScale);
    texStripZ(ctx, topTex, camX, camY, wx, wx + w, wy, zBack, 0, 0, 32, shade, 2, FOCAL, EYE_X, EYE_Y);

    const bL = project3D(wx, wy, zBack, camX, camY);
    const bR = project3D(wx + w, wy, zBack, camX, camY);
    ctx.fillStyle = 'rgba(220, 225, 245, 0.10)';
    ctx.fillRect(Math.round(bL.x), Math.round(bL.y), Math.max(1, Math.round(bR.x - bL.x)), 1);
  }

  /** Texture-mapped 3D ceiling soffit on the underside of elevated slabs. */
  drawCeilingSoffit3D(ctx, camX, camY, wx, wyBot, w, zBack, soffitTex) {
    if (!soffitTex) return;
    const fY = wyBot - camY;
    const bL = project3D(wx, wyBot, zBack, camX, camY);
    if (bL.y <= fY + 0.8) return;
    const shade = shadeOverlay32([0, 1, -0.2], [8, 7, 18], 0.52, 0.60);
    texStripZ(ctx, soffitTex, camX, camY, wx, wx + w, wyBot, 0, zBack, 0, 32, shade, 1, FOCAL, EYE_X, EYE_Y);
  }

  /** Texture-mapped 3D perspective vertical side return on exposed step/pit walls. */
  sideFace3D(ctx, camX, camY, wxEdge, wy, dir, sideTex, isSurface, isSnow = false, joinBelow = false) {
    if (!sideTex) return;
    const h = TILE + (joinBelow ? 0.6 : 0);
    const fTop = { x: wxEdge - camX, y: wy - camY };
    const fBot = { x: wxEdge - camX, y: wy + h - camY };
    const bTop = project3D(wxEdge, wy, SIDE_Z, camX, camY);
    const bBot = project3D(wxEdge, wy + h, SIDE_Z, camX, camY);

    const visible = dir < 0 ? (bTop.x < fTop.x - 0.6) : (bTop.x > fTop.x + 0.6);
    if (!visible) return;

    const nrm = dir < 0 ? [-0.92, -0.1, -0.35] : [0.92, -0.1, -0.35];
    const shade = shadeOverlay32(nrm, DECK_FOG, 0.30, isSnow ? 0.86 : 0.92);
    if (dir < 0) {
      texQuad(ctx, sideTex, bTop, fTop, fBot, bBot, 0, wy, SIDE_Z, wy, SIDE_Z, wy + TILE, 0, wy + TILE, shade);
    } else {
      texQuad(ctx, sideTex, fTop, bTop, bBot, fBot, 0, wy, SIDE_Z, wy, SIDE_Z, wy + TILE, 0, wy + TILE, shade);
    }

    if (isSurface) {
      ctx.strokeStyle = isSnow ? 'rgba(215, 232, 255, 0.36)' : 'rgba(232, 226, 200, 0.22)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(fTop.x, fTop.y); ctx.lineTo(bTop.x, bTop.y);
      ctx.stroke();
    }
  }

  /** Texture-mapped 3D side return for thin platforms, crumbling slabs & moving lifts. */
  drawSlabSide3D(ctx, camX, camY, wxEdge, wy, h, zBack, dir, slabTex) {
    if (!slabTex) return;
    const fTop = { x: wxEdge - camX, y: wy - camY - 2 };
    const fBot = { x: wxEdge - camX, y: wy + h - camY - 2 };
    const bTop = project3D(wxEdge, wy - 2, zBack, camX, camY);
    const bBot = project3D(wxEdge, wy + h - 2, zBack, camX, camY);
    const visible = dir < 0 ? (bTop.x < fTop.x - 0.6) : (bTop.x > fTop.x + 0.6);
    if (!visible) return;
    const shade = shadeOverlay32([dir, 0, -0.3], DECK_FOG, 0.34, 0.88);
    if (dir < 0) {
      texQuad(ctx, slabTex, bTop, fTop, fBot, bBot, 0, 0, zBack, 0, zBack, h, 0, h, shade);
    } else {
      texQuad(ctx, slabTex, fTop, bTop, bBot, fBot, 0, 0, zBack, 0, zBack, h, 0, h, shade);
    }
  }

  /** Renders texture-mapped crumbling 3D stone slabs (intact, trembling, or reforming). */
  drawCrumbles3D(ctx, camX, camY, tx0, tx1, time, bank) {
    const idleTex = bank ? bank.get('crumble_stone') : null;
    const shakeTex = bank ? bank.get('crumble_shake') : null;
    for (const c of this.crumbles) {
      if (c.tx < tx0 - 1 || c.tx > tx1 + 1) continue;
      const wx = c.tx * TILE, wy = c.ty * TILE;
      if (c.state === 'gone') {
        if (c.timer < 0.65) {
          const a = (1 - c.timer / 0.65) * 0.45;
          ctx.strokeStyle = `rgba(180, 205, 255, ${a.toFixed(2)})`;
          ctx.lineWidth = 1;
          ctx.strokeRect(Math.round(wx - camX + 2), Math.round(wy - camY + 1), TILE - 4, 14);
        }
        continue;
      }
      const shaking = c.state === 'shake';
      const jx = shaking ? Math.round(Math.sin(time * 58 + c.tx * 3) * 2) : 0;
      const jy = shaking ? Math.round(Math.cos(time * 47 + c.tx) * 1) : 0;
      const slabTex = shaking ? shakeTex : idleTex;
      if (wy > camY + EYE_Y + 4) {
        this.drawTopDeck3D(ctx, camX, camY, wx + jx, wy + jy, TILE, 30, slabTex, 0.72);
      }
      this.drawSlabSide3D(ctx, camX, camY, wx + jx, wy + jy, 18, 30, -1, slabTex);
      this.drawSlabSide3D(ctx, camX, camY, wx + TILE + jx, wy + jy, 18, 30, 1, slabTex);

      const x = Math.round(wx - camX + jx), y = Math.round(wy - camY + jy);
      if (slabTex) {
        texQuad(
          ctx, slabTex,
          { x, y }, { x: x + TILE, y }, { x: x + TILE, y: y + 18 }, { x, y: y + 18 },
          wx, 0, wx + TILE, 0, wx + TILE, 32, wx, 32, null,
        );
      }
    }
  }

  /** Renders moving 2.5D ferries (with 3D guide chains) & orbiting gear gondolas. */
  drawMovers3D(ctx, camX, camY, pImg, plat, platTex, time, stage3d) {
    const drawnHubs = new Set();
    for (const m of this.movers) {
      if (m.kind === 'orbit') {
        const hubKey = `${m.cx},${m.cy}`;
        if (!drawnHubs.has(hubKey)) {
          drawnHubs.add(hubKey);
          if (stage3d && !m.hideHubGear) {
            stage3d.drawGear3D(ctx, camX, camY, m.cx, m.cy, 34, {
              r: Math.max(36, m.r * 0.78), teeth: 14, thick: 16, speed: m.speed, brass: true,
            }, time);
          }
        }
        const pHub = project3D(m.cx, m.cy, 26, camX, camY);
        const pGond = project3D(m.x, m.y + 8, 10, camX, camY);
        if (Math.max(pHub.x, pGond.x) >= -40 && Math.min(pHub.x, pGond.x) <= W + 40) {
          ctx.strokeStyle = '#1f2336'; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.moveTo(pHub.x, pHub.y); ctx.lineTo(pGond.x, pGond.y); ctx.stroke();
          ctx.strokeStyle = '#7e8ba8'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(pHub.x, pHub.y - 1); ctx.lineTo(pGond.x, pGond.y - 1); ctx.stroke();
        }
      } else {
        const a = project3D(m.x0, m.y0 + 9, 22, camX, camY);
        const b = project3D(m.x1, m.y1 + 9, 22, camX, camY);
        if (Math.max(a.x, b.x) >= -40 && Math.min(a.x, b.x) <= W + 40) {
          ctx.save();
          ctx.strokeStyle = '#1d2032'; ctx.lineWidth = 4;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          ctx.strokeStyle = '#626d8a'; ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          ctx.restore();
          for (const ep of [a, b]) {
            ctx.fillStyle = '#25293e';
            ctx.beginPath(); ctx.arc(ep.x, ep.y, 5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#9aa8c7';
            ctx.beginPath(); ctx.arc(ep.x, ep.y, 2, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
    }

    for (const m of this.movers) {
      const wx0 = m.left, wy = m.y;
      if (wx0 + m.w - camX < -48 || wx0 - camX > W + 48) continue;
      if (wy > camY + EYE_Y + 4) {
        this.drawTopDeck3D(ctx, camX, camY, wx0, wy, m.w, 28, platTex, 0.72);
      } else if (wy + 18 < camY + EYE_Y - 4) {
        this.drawCeilingSoffit3D(ctx, camX, camY, wx0, wy + 18, m.w, 28, platTex);
      }
      this.drawSlabSide3D(ctx, camX, camY, wx0, wy, 18, 28, -1, platTex);
      this.drawSlabSide3D(ctx, camX, camY, wx0 + m.w, wy, 18, 28, 1, platTex);

      const tiles = Math.max(2, Math.round(m.w / TILE));
      const y = Math.round(wy - camY - 2);
      for (let i = 0; i < tiles; i++) {
        const x = Math.round(wx0 - camX + i * TILE);
        const sx = i === 0 ? 0 : (i === tiles - 1 ? plat.w - TILE : TILE);
        ctx.drawImage(pImg, sx, 0, TILE, plat.h, x, y, TILE, plat.h);
      }
      const cx = Math.round(m.x - camX), cy = Math.round(wy - camY);
      ctx.fillStyle = '#d8b46a';
      ctx.fillRect(Math.round(wx0 - camX + 3), cy + 2, 3, 3);
      ctx.fillRect(Math.round(wx0 + m.w - camX - 6), cy + 2, 3, 3);
      ctx.fillStyle = '#25283c';
      ctx.fillRect(cx - 8, cy + 14, 16, 5);
    }
  }

  /**
   * Grounds 2D sprites onto the 3D floor by casting soft dark contact ellipses
   * on the nearest standable surface directly below (also aids jump accuracy!).
   */
  drawContactShadows(ctx, cam, player, enemies, candles, ally = null) {
    const camX = cam.rx, camY = cam.ry;
    const cast = (wx, wy, baseRx, alpha = 0.42) => {
      if (wx - camX < -40 || wx - camX > W + 40) return;
      const groundY = this.findDropSurfaceY(wx, wy, 108);
      if (groundY == null) return;
      const drop = Math.max(0, groundY - wy);
      const k = 1 - drop / 112;
      if (k <= 0.05) return;
      const rx = Math.max(4, baseRx * (0.55 + 0.45 * k));
      const ry = Math.max(2, rx * 0.26);
      ctx.fillStyle = `rgba(3, 2, 10, ${(alpha * k).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(Math.round(wx - camX), Math.round(groundY - camY + 1), rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    };

    ctx.save();
    if (player && player.alive) cast(player.x, player.y, 13, 0.48);
    if (ally && ally.alive) cast(ally.x, ally.y, 13, 0.44);
    for (const e of enemies) {
      if (!e.alive || e.flies) continue;
      cast(e.x, e.y, Math.min(22, Math.max(10, e.w * 0.55)), 0.40);
    }
    for (const c of candles) {
      if (!c.dead) cast(c.x, c.y, 8, 0.30);
    }
    ctx.restore();
  }

  findDropSurfaceY(wx, wy, maxDrop) {
    let best = Infinity;
    for (const m of this.movers) {
      if (wx >= m.left && wx <= m.right && m.y >= wy - 2 && m.y - wy <= maxDrop) {
        if (m.y < best) best = m.y;
      }
    }
    const tx = Math.floor(wx / TILE);
    const tyStart = Math.max(0, Math.floor((wy - 2) / TILE));
    const tyEnd = Math.min(this.rows - 1, Math.floor((wy + maxDrop) / TILE));
    for (let ty = tyStart; ty <= tyEnd; ty++) {
      if (this.isSpike(tx, ty)) break;
      if (this.isStandable(tx, ty) && !this.isSpike(tx, ty - 1)) {
        const sy = ty * TILE;
        if (sy >= wy - 2 && sy < best) { best = sy; break; }
      }
    }
    return best < Infinity ? best : null;
  }
}

function evalLinearMover(x0, y0, x1, y1, period, phase, dwell, time) {
  const u = mod(time + phase, period) / period; // 0..1
  const half = u < 0.5 ? u * 2 : (1 - u) * 2;   // 0..1..0
  const t = Math.max(0, Math.min(1, (half - dwell) / Math.max(0.01, 1 - dwell * 2)));
  const eased = 0.5 - 0.5 * Math.cos(t * Math.PI);
  return { x: x0 + (x1 - x0) * eased, y: y0 + (y1 - y0) * eased };
}

function makeMover(cfg) {
  const w = (cfg.tiles || 3) * TILE;
  if (cfg.kind === 'orbit') {
    const cx = cfg.cx, cy = cfg.cy, r = cfg.r || 72;
    const phase = cfg.phase || 0;
    const x = cx + Math.cos(phase) * r, y = cy + Math.sin(phase) * r;
    return {
      kind: 'orbit', cx, cy, r, speed: cfg.speed || 0.65, phase, angle: phase,
      hideHubGear: !!cfg.hideHubGear,
      w, x, y, prevX: x, prevY: y, dx: 0, dy: 0, left: x - w / 2, right: x + w / 2,
    };
  }
  const x0 = cfg.x0, y0 = cfg.y0, x1 = cfg.x1, y1 = cfg.y1;
  const period = cfg.period || 4.8, phase = cfg.phase || 0, dwell = cfg.dwell == null ? 0.08 : cfg.dwell;
  const init = evalLinearMover(x0, y0, x1, y1, period, phase, dwell, 0);
  return {
    kind: 'linear', x0, y0, x1, y1, cx: (x0 + x1) * 0.5,
    period, phase, dwell,
    w, x: init.x, y: init.y, prevX: init.x, prevY: init.y, dx: 0, dy: 0,
    left: init.x - w / 2, right: init.x + w / 2,
  };
}

/** Decor frames that hang on the far wall rather than standing on the floor. */
const WALL_DECOR = new Set(['window', 'banner', 'chain', 'torch', 'wreath', 'rose', 'hunter', 'moon']);

function hash2(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

function mod(a, n) { return ((a % n) + n) % n; }

/** Additive flickering glow using a cached radial-gradient offscreen sprite. */
export function drawFlameGlow(ctx, x, y, t, radius = 24, strength = 0.6, kind = 'flame') {
  const glow = getGlowCanvas(kind);
  const flick = 0.85 + 0.15 * Math.sin(t * 17.3) * Math.sin(t * 7.1 + 1.3);
  const r = radius * flick;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (glow) {
    ctx.globalAlpha = Math.min(1, 0.68 * strength);
    ctx.drawImage(glow, x - r, y - r, r * 2, r * 2);
  }
  ctx.restore();
}
