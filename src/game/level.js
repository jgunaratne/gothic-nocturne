// Tile grid, collision queries and level rendering.

import {
  TILE, T_EMPTY, T_GROUND, T_SNOW, T_PLATFORM, T_SPIKES, T_BLOCK, T_GATE, T_BOUND,
  MATERIAL_STRIP, isMaterialTile, isSolidTile, W, H,
} from '../engine/constants.js';

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
    this.gearCache = new Map();
    data.build(this);
    this.recompute();
  }

  // ------------------------------------------------------------ building
  fill(x0, x1, y0, y1, t) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, t);
  }
  /** Solid terrain from `surfaceRow` down to the bottom row. */
  ground(x0, x1, surfaceRow, t = T_GROUND) { this.fill(x0, x1, surfaceRow, this.rows - 1, t); }
  clear(x0, x1, y0 = 0, y1 = this.rows - 1) { this.fill(x0, x1, y0, y1, T_EMPTY); }
  platform(x0, x1, row) { this.fill(x0, x1, row, row, T_PLATFORM); }
  set(x, y, t) { if (x >= 0 && y >= 0 && x < this.cols && y < this.rows) this.tiles[y * this.cols + x] = t; }

  recompute() {
    // Depth below the surface for same-material solid tiles (texture rows).
    for (let x = 0; x < this.cols; x++) {
      let run = 0, prev = T_EMPTY;
      for (let y = 0; y < this.rows; y++) {
        const t = this.tiles[y * this.cols + x];
        if (isMaterialTile(t) && t === prev) run++; else run = 0;
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
  }

  // ------------------------------------------------------------- queries
  tile(tx, ty) {
    if (tx < 0 || tx >= this.cols) return T_BOUND;
    if (ty < 0) return T_EMPTY;
    if (ty >= this.rows) return T_EMPTY;
    return this.tiles[ty * this.cols + tx];
  }
  isSolid(tx, ty) { return isSolidTile(this.tile(tx, ty)); }
  isOneWay(tx, ty) { return this.tile(tx, ty) === T_PLATFORM; }
  isSpike(tx, ty) { return this.tile(tx, ty) === T_SPIKES; }
  isStandable(tx, ty) { const t = this.tile(tx, ty); return isSolidTile(t) || t === T_PLATFORM; }

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

  // ------------------------------------------------------------ drawing
  drawRooms(ctx, cam, assets) {
    const camX = cam.rx, camY = cam.ry;
    for (const r of this.rooms) {
      const key = r.wall || 'wall';
      const wall = assets.img(key);
      const f = r.parallax == null ? 1 : r.parallax;
      const x = r.x0 * TILE - camX, y = r.y0 * TILE - camY;
      const w = (r.x1 - r.x0 + 1) * TILE, h = (r.y1 - r.y0 + 1) * TILE;
      if (x > W || x + w < 0 || y > H || y + h < 0) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      if (!this._patterns) this._patterns = {};
      if (!this._patterns[key]) this._patterns[key] = ctx.createPattern(wall, 'repeat');
      const keyB = assets.img(key + '_b') ? key + '_b' : null;
      if (keyB && !this._patterns[keyB]) this._patterns[keyB] = ctx.createPattern(assets.img(keyB), 'repeat');
      // The wall scrolls at its own parallax factor (far wall of a big hall).
      const ox = mod(camX * f, wall.width), oy = mod(camY * f, wall.height);
      ctx.translate(-ox, -oy);
      ctx.fillStyle = this._patterns[key];
      ctx.fillRect(0, 0, W + wall.width * 2, H + wall.height * 2);
      ctx.restore();
      // Architectural rhythm: panels of the second texture, pilasters between
      // them, a moulding band and the odd arched alcove, all scrolling with
      // the wall.
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
      const panelW = 12 * TILE, scrollX = camX * f;
      const first = Math.floor(scrollX / panelW) - 1;
      for (let i = first; i <= first + Math.ceil(W / panelW) + 2; i++) {
        const sx = i * panelW - scrollX;
        if (keyB && mod(i, 3) === 1) {
          ctx.save();
          ctx.beginPath(); ctx.rect(Math.max(x, sx + 12), y, Math.min(x + w, sx + panelW - 12) - Math.max(x, sx + 12), h); ctx.clip();
          ctx.translate(-ox, -oy);
          ctx.fillStyle = this._patterns[keyB];
          ctx.fillRect(0, 0, W + wall.width * 2, H + wall.height * 2);
          ctx.restore();
        }
        if (mod(i, 3) === 2) {
          // Arched alcove recess at mid-height.
          const ax = sx + panelW / 2 - 28, ay = y + Math.round(h * 0.28), aw = 56, ah = Math.round(h * 0.34);
          ctx.fillStyle = 'rgba(3, 2, 10, 0.62)';
          ctx.beginPath(); ctx.moveTo(ax, ay + ah); ctx.lineTo(ax, ay + 20); ctx.arc(ax + aw / 2, ay + 20, aw / 2, Math.PI, 0); ctx.lineTo(ax + aw, ay + ah); ctx.closePath(); ctx.fill();
          ctx.fillStyle = 'rgba(232, 226, 200, 0.10)';
          ctx.fillRect(ax - 3, ay + 20, 3, ah - 20); ctx.fillRect(ax + aw, ay + 20, 3, ah - 20);
        }
        // Pilaster
        const g = ctx.createLinearGradient(sx - 14, 0, sx + 14, 0);
        g.addColorStop(0, 'rgba(3, 2, 10, 0)');
        g.addColorStop(0.5, 'rgba(3, 2, 10, 0.7)');
        g.addColorStop(1, 'rgba(3, 2, 10, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(sx - 14, y, 28, h);
        ctx.fillStyle = 'rgba(232, 226, 200, 0.12)';
        ctx.fillRect(sx - 3, y, 2, h);
      }
      // Moulding band
      const my = y + Math.round(h * 0.22) - Math.round(mod(camY * f, 1));
      ctx.fillStyle = 'rgba(232, 226, 200, 0.10)'; ctx.fillRect(x, my, w, 2);
      ctx.fillStyle = 'rgba(3, 2, 10, 0.45)'; ctx.fillRect(x, my + 2, w, 5);
      ctx.restore();
      // Interior gloom: darker toward the ceiling and overall desaturated.
      const dark = r.dark == null ? 0.42 : r.dark;
      ctx.fillStyle = `rgba(10, 8, 24, ${dark})`;
      ctx.fillRect(x, y, w, h);
      const gy0 = Math.max(y, -H), gy1 = Math.min(y + h, H * 2);
      const g = ctx.createLinearGradient(0, gy0, 0, gy1);
      g.addColorStop(0, 'rgba(4, 3, 12, 0.7)');
      g.addColorStop(0.45, 'rgba(4, 3, 12, 0.1)');
      g.addColorStop(1, 'rgba(4, 3, 12, 0.3)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      if (r.edge !== false && x > -40) {
        // Shadowed doorway edge where the outer wall begins.
        const e = ctx.createLinearGradient(x, 0, x + 40, 0);
        e.addColorStop(0, 'rgba(2, 2, 8, 0.85)');
        e.addColorStop(1, 'rgba(2, 2, 8, 0)');
        ctx.fillStyle = e;
        ctx.fillRect(x, y, 40, h);
      }
    }
  }

  drawDecor(ctx, cam, assets, time) {
    const camX = cam.rx, camY = cam.ry;
    for (const d of this.decor) {
      const x = d.x - camX, y = d.y - camY;
      if (x < -200 || x > W + 200 || y < -200 || y > H + 300) continue;
      if (d.type === 'gear') { this.drawGear(ctx, x, y, d, time); continue; }
      assets.draw(ctx, d.sheet, d.frame, x, y);
      if (d.frame === 'window') {
        // Soft moonlit glow through the glass.
        const f = assets.frame('arch', 'window');
        ctx.save();
        ctx.globalAlpha = 0.10 + 0.04 * Math.sin(time * 0.8 + d.x);
        ctx.fillStyle = '#b08cff';
        ctx.fillRect(Math.round(x - f.ax + 3), Math.round(y - f.ay + 3), f.w - 6, f.h - 6);
        ctx.restore();
      }
      if (d.frame === 'torch') drawFlameGlow(ctx, x, y - 36, time + d.x, 22, 0.55);
      else if (d.frame === 'jack_big') drawFlameGlow(ctx, x, y - 20, time + d.x, 30, 0.7);
      else if (d.frame === 'jack_small') drawFlameGlow(ctx, x, y - 12, time + d.x, 20, 0.6);
      else if (d.frame === 'scarecrow') drawFlameGlow(ctx, x, y - 64, time + d.x, 18, 0.6);
      else if (d.frame === 'lamppost') drawFlameGlow(ctx, x, y - 66, time + d.x, 26, 0.6);
      else if (d.frame === 'tree') {
        // Twinkling fairy lights on the fir.
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

  /** Procedural brass gear (cached sprite) rotating in place. */
  drawGear(ctx, x, y, d, time) {
    const r = d.r || 40;
    let c = this.gearCache.get(r);
    if (!c) {
      c = document.createElement('canvas');
      const teeth = Math.max(8, Math.round(r / 4));
      c.width = c.height = r * 2 + 12;
      const g = c.getContext('2d');
      g.translate(c.width / 2, c.height / 2);
      g.fillStyle = '#3a2f22';
      for (let i = 0; i < teeth; i++) {
        const a = (i / teeth) * Math.PI * 2;
        g.save(); g.rotate(a); g.fillRect(-r * 0.09, -r - 5, r * 0.18, 10); g.restore();
      }
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#5a4a30';
      g.beginPath(); g.arc(0, 0, r - 4, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#2a2218';
      g.beginPath(); g.arc(0, 0, r * 0.62, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#5a4a30';
      for (let i = 0; i < 5; i++) { g.save(); g.rotate((i / 5) * Math.PI * 2); g.fillRect(-r * 0.07, 0, r * 0.14, r * 0.62); g.restore(); }
      g.beginPath(); g.arc(0, 0, r * 0.2, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#8a7444';
      g.beginPath(); g.arc(0, 0, r * 0.1, 0, Math.PI * 2); g.fill();
      this.gearCache.set(r, c);
    }
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(time * (d.speed || 0.4));
    ctx.globalAlpha = d.alpha == null ? 0.9 : d.alpha;
    ctx.drawImage(c, -c.width / 2, -c.height / 2);
    ctx.restore();
  }

  drawTiles(ctx, cam, assets) {
    const camX = cam.rx, camY = cam.ry;
    const tx0 = Math.max(0, Math.floor(camX / TILE) - 1);
    const tx1 = Math.min(this.cols - 1, Math.ceil((camX + W) / TILE) + 1);
    const ty0 = Math.max(0, Math.floor(camY / TILE) - 1);
    const ty1 = Math.min(this.rows - 1, Math.ceil((camY + H) / TILE) + 1);
    const spikes = assets.frame('props', 'spikes'), propsImg = assets.img('props');
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = this.tiles[ty * this.cols + tx];
        if (t === T_EMPTY || t === T_PLATFORM || t === T_GATE || t === T_BOUND) continue;
        const x = tx * TILE - camX, y = ty * TILE - camY;
        if (isMaterialTile(t)) {
          // Alternate between the material's two strips per 8-tile chunk so
          // long runs read as patches of different ground.
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
            // Subtle per-tile value jitter breaks the repetition of fill rows
            // (kept faint on pale materials such as snow).
            const j = hash2(tx, ty) % 100;
            const jmax = t === T_SNOW ? 0.025 : 0.07;
            if (j < 55) { ctx.fillStyle = `rgba(4, 3, 10, ${(0.3 + (j % 7) / 7 * 0.7) * jmax})`; ctx.fillRect(x, y, TILE, TILE); }
          }
          // Exposed vertical faces (pits, steps, cliffs) get a shaded edge.
          const leftOpen = !this.isSolid(tx - 1, ty), rightOpen = !this.isSolid(tx + 1, ty);
          if (leftOpen) this.edgeShade(ctx, x, y, 1, d === 0);
          if (rightOpen) this.edgeShade(ctx, x + TILE, y, -1, d === 0);
        } else if (t === T_BLOCK) {
          assets.draw(ctx, 'props', 'block', x + 16, y + 32);
        } else if (t === T_SPIKES) {
          ctx.drawImage(propsImg, spikes.x + (tx % 2) * 32, spikes.y, 32, spikes.h, x, y + TILE - spikes.h, 32, spikes.h);
        }
      }
    }
    // Platforms: supports down to the ground, then caps + repeating middle.
    const platName = assets.info(this.platformImg) ? this.platformImg : 'platform';
    const plat = assets.info(platName), pImg = assets.img(platName);
    const wood = platName === 'platform_wood';
    for (const r of this.platformRuns) {
      if (r.x1 < tx0 || r.x0 > tx1 || r.y < ty0 - 1 || r.y > ty1) continue;
      for (let tx = r.x0; tx <= r.x1; tx++) {
        if (tx !== r.x0 && tx !== r.x1 && (tx - r.x0) % 4 !== 2) continue;
        // Find ground within 6 tiles below to anchor a post.
        let gy = -1;
        for (let k = 1; k <= 6; k++) if (this.isSolid(tx, r.y + k)) { gy = r.y + k; break; }
        if (gy < 0) continue;
        const px0 = tx * TILE - camX + 12, py0 = r.y * TILE - camY + 18, ph = gy * TILE - camY - py0;
        if (ph <= 0) continue;
        ctx.fillStyle = wood ? '#2a1c12' : '#232033';
        ctx.fillRect(px0, py0, 8, ph);
        ctx.fillStyle = wood ? '#4a3220' : '#3d3a52';
        ctx.fillRect(px0 + 1, py0, 2, ph);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(px0 + 6, py0, 2, ph);
      }
    }
    for (const r of this.platformRuns) {
      if (r.x1 < tx0 || r.x0 > tx1 || r.y < ty0 - 1 || r.y > ty1) continue;
      const y = r.y * TILE - camY - 2;
      for (let tx = r.x0; tx <= r.x1; tx++) {
        const x = tx * TILE - camX;
        let sx;
        if (tx === r.x0) sx = 0;
        else if (tx === r.x1) sx = plat.w - TILE;
        else sx = TILE + ((tx - r.x0 - 1) % ((plat.w - 2 * TILE) / TILE)) * TILE;
        ctx.drawImage(pImg, sx, 0, TILE, plat.h, x, y, TILE, plat.h);
      }
    }
  }

  /** Dark gradient along an exposed face; a pale lip where the surface ends. */
  edgeShade(ctx, x, y, dir, surface) {
    const g = ctx.createLinearGradient(x, 0, x + dir * 10, 0);
    g.addColorStop(0, 'rgba(3, 2, 8, 0.55)');
    g.addColorStop(1, 'rgba(3, 2, 8, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(dir > 0 ? x : x - 10, y, 10, TILE);
    if (surface) {
      ctx.fillStyle = 'rgba(232, 226, 200, 0.28)';
      ctx.fillRect(dir > 0 ? x : x - 1, y - 2, 1, 10);
    }
  }
}

function hash2(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return (h ^ (h >>> 16)) >>> 0;
}

function mod(a, n) { return ((a % n) + n) % n; }

/** Additive-ish flickering glow used by candles and torches. */
export function drawFlameGlow(ctx, x, y, t, radius = 24, strength = 0.6) {
  const flick = 0.85 + 0.15 * Math.sin(t * 17.3) * Math.sin(t * 7.1 + 1.3);
  const r = radius * flick;
  const g = ctx.createRadialGradient(x, y, 1, x, y, r);
  g.addColorStop(0, `rgba(255, 190, 90, ${0.55 * strength})`);
  g.addColorStop(0.5, `rgba(255, 140, 50, ${0.18 * strength})`);
  g.addColorStop(1, 'rgba(255, 120, 40, 0)');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}
