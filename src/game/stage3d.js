// 32-bit era 2.5D background & stage renderer: perspective projection,
// texture-mapped low-poly architectural meshes, scanline perspective vistas,
// vaulted gothic halls, extruded 3D gear trains and boss arena centerpieces.

import { getFxLayers } from '../engine/fxlayers.js';
import { W, H, TILE } from '../engine/constants.js';
import {
  LIGHT, getTexBank, getGlowCanvas, shadeOverlay32, texTri, texQuad, texQuadSubZ, texStripZ,
} from './tex3d.js';

export const FOCAL = 380;
export const EYE_X = W * 0.5;
export const EYE_Y = 144;

const THEME_PALETTES = {
  graveyard: {
    fog: [11, 10, 22], stone: [78, 92, 118], trim: [132, 146, 174],
    carpet: true, glass: [148, 96, 220], arch: true,
  },
  darkwood: {
    fog: [7, 15, 19], stone: [48, 74, 68], trim: [96, 154, 136],
    carpet: false, glass: [95, 240, 185], arch: false,
  },
  forest: {
    fog: [14, 10, 20], stone: [76, 62, 52], trim: [122, 96, 72],
    carpet: false, glass: [255, 154, 60], arch: false,
  },
  yule: {
    fog: [10, 14, 28], stone: [92, 112, 142], trim: [168, 192, 220],
    carpet: false, glass: [140, 210, 255], arch: false,
  },
  ramparts: {
    fog: [13, 12, 26], stone: [84, 98, 126], trim: [142, 158, 186],
    carpet: false, glass: [140, 175, 235], arch: true,
  },
  catacombs: {
    fog: [8, 6, 14], stone: [88, 78, 70], trim: [138, 124, 106],
    carpet: false, glass: [201, 181, 138], arch: true, crypt: true,
  },
  darkcave: {
    fog: [18, 6, 6], stone: [72, 48, 48], trim: [156, 82, 54],
    carpet: false, glass: [255, 108, 38], arch: true, crypt: true,
  },
  ossuary: {
    fog: [7, 6, 15], stone: [82, 76, 96], trim: [136, 126, 156],
    carpet: false, glass: [130, 215, 190], arch: true, crypt: true,
  },
  clocktower: {
    fog: [9, 8, 16], stone: [66, 76, 94], trim: [186, 142, 72],
    carpet: false, glass: [235, 185, 95], arch: false,
  },
  throne: {
    fog: [12, 7, 18], stone: [86, 94, 120], trim: [158, 166, 194],
    carpet: true, glass: [226, 60, 78], arch: true,
  },
  arcade: {
    fog: [14, 9, 14], stone: [92, 70, 54], trim: [206, 164, 86],
    carpet: true, glass: [168, 110, 230], arch: true,
  },
  library: {
    fog: [11, 8, 18], stone: [74, 58, 48], trim: [150, 118, 84],
    carpet: true, glass: [180, 140, 255], arch: true,
  },
  cathedral: {
    fog: [10, 9, 20], stone: [120, 132, 156], trim: [182, 190, 210],
    carpet: true, glass: [255, 92, 122], arch: true,
  },
};

/**
 * Projects a world-space point (wx, wy, z) onto the 640x360 screen.
 * z = 0 is the 2D collision plane (1:1 pixel match); z > 0 recedes into depth;
 * z < 0 passes in front of the play plane.
 */
export function project3D(wx, wy, z, camX, camY) {
  const denom = Math.max(40, FOCAL + z);
  const s = FOCAL / denom;
  return {
    x: EYE_X + (wx - camX - EYE_X) * s,
    y: EYE_Y + (wy - camY - EYE_Y) * s,
    s,
  };
}

export class Stage3D {
  constructor(assets, level, themeKey, stageData) {
    this.assets = assets;
    this.bank = getTexBank(assets);
    this.level = level;
    this.themeKey = themeKey;
    this.pal = THEME_PALETTES[themeKey] || THEME_PALETTES.graveyard;
    this.data = stageData;
    this.planeCache = new Map();
    this.wallPatterns = {};
    this.fgFrames = this.buildForegroundFrames();
  }

  tex(name) {
    if (!this.bank) this.bank = getTexBank(this.assets);
    return this.bank ? this.bank.get(name) : null;
  }

  /** The stage's starting floor row: last-resort footing for scenery over map-wide gaps. */
  startRow() {
    const s = this.data && this.data.start;
    const r = s ? Math.round(s.y / TILE) : 11;
    return r > 0 && r < this.level.rows ? r : 11;
  }

  /**
   * Places foreground framing silhouettes strictly on calm, solid runs away
   * from pits, spikes, moving lifts and boss arenas so gameplay stays 100%
   * readable.
   */
  buildForegroundFrames() {
    const out = [];
    const lv = this.level;
    const bossCol = this.data.boss ? Math.max(0, Math.floor(this.data.boss.camX / TILE) - 6) : lv.cols;
    const portalX = lv.rooms && lv.rooms.length && lv.rooms[0].x0 > 0 ? lv.rooms[0].x0 * TILE : -9999;
    let last = 12;
    for (let tx = 18; tx < bossCol - 8; tx++) {
      if (tx - last < 28) continue;
      let safe = true;
      let surf = -1;
      for (let dx = -3; dx <= 3; dx++) {
        const r = lv.surfaceRow(tx + dx);
        if (r < 0 || !lv.isSolid(tx + dx, r) || (r > 0 && lv.isSpike(tx + dx, r - 1))) { safe = false; break; }
        if (dx === 0) surf = r;
      }
      if (!safe || surf < 5) continue;
      const wx = tx * TILE + 16;
      if (Math.abs(wx - portalX) < 200) continue;
      if ((lv.movers || []).some((m) => Math.abs(m.cx - wx) < 180)) continue;
      out.push({ wx, wy: surf * TILE });
      last = tx;
    }
    return out;
  }

  /**
   * Prunes foreground framing columns that would cross in front of monumental
   * passage doorways, sanctuary waystones, or ancient life vessels.
   */
  excludeLandmarks(landmarks) {
    if (!landmarks || !landmarks.length || !this.fgFrames) return;
    const pts = landmarks.filter((l) => l && Number.isFinite(l.x));
    if (!pts.length) return;
    this.fgFrames = this.fgFrames.filter((f) => pts.every((p) => Math.abs(p.x - f.wx) >= 132));
  }

  // ========================================================= OUTDOOR 3D
  drawOutdoor3D(ctx, cam, time, flash) {
    this.drawSky3D(ctx, cam, time);
    this.drawMidHorizon3D(ctx, cam, time, flash);
    this.drawOutdoorGround3D(ctx, cam, time);
  }

  /** Celestial 3D sky ribbons (drawn inside the sky dome BEHIND mountains & trees). */
  drawSky3D(ctx, cam, time) {
    if (this.themeKey === 'yule') {
      this.drawAurora3D(ctx, cam.rx, time);
    }
  }

  /**
   * Mid-far 3D horizon landmarks (`fx ≈ 0.25`, drawn AFTER far mountains/ridges
   * and BEFORE near scrolling cemetery trees & wheeling bat flocks).
   */
  drawMidHorizon3D(ctx, cam, time, flash) {
    const camX = cam.rx, camY = cam.ry;
    const k = this.themeKey;
    if (k !== 'graveyard' && k !== 'ramparts') return;
    let alpha = 1;
    if (k === 'graveyard' && this.level.rooms.length > 0) {
      const roomX = this.level.rooms[0].x0 * TILE;
      alpha = clamp01((roomX - (camX + W + 96)) / 360);
      if (alpha <= 0.01) return;
    }
    if (alpha < 0.999) {
      ctx.save();
      ctx.globalAlpha = alpha;
      this.drawDistantKeep3D(ctx, camX, camY, time, flash, k === 'ramparts' ? 0.88 : 0.65);
      ctx.restore();
    } else {
      this.drawDistantKeep3D(ctx, camX, camY, time, flash, k === 'ramparts' ? 0.88 : 0.65);
    }
  }

  /**
   * Outdoor 3D ground/water planes & colonnades, aligned right at the ground
   * baseline of the scrolling backdrop layers so trees, pumpkins, tombstones,
   * and snowbound cottages are never sliced in half by the horizon line.
   */
  drawOutdoorGround3D(ctx, cam, time) {
    const camX = cam.rx, camY = cam.ry;
    const k = this.themeKey;

    if (k === 'ramparts') {
      this.drawScanlinePlane(ctx, cam, time, {
        kind: 'courtyard', horizon: 186, fx: 0.42, focal: 120,
        fog: [16, 15, 32], torches: true,
      });
      this.drawHorizonWall(ctx, cam, 186);
      this.drawRampartParapets3D(ctx, camX, camY);
    } else if (k === 'yule') {
      this.drawScanlinePlane(ctx, cam, time, {
        kind: 'ice', horizon: 242, fx: 0.36, focal: 105,
        fog: [14, 22, 42], shimmer: true,
        water: { tint: [0.45, 0.62, 0.9], spec: [0.85, 0.95, 1.0], frozen: 1, alpha: 0.7 },
      });
    } else if (k === 'darkwood') {
      this.drawScanlinePlane(ctx, cam, time, {
        kind: 'darkwood', horizon: 266, fx: 0.44, focal: 96,
        fog: [8, 18, 22], shimmer: true, shimmerRgb: [95, 235, 185],
        water: { tint: [0.1, 0.45, 0.42], spec: [0.45, 1.0, 0.8], frozen: 0, alpha: 0.9 },
      });
      this.drawDarkwoodColonnade3D(ctx, camX, camY, time);
    } else if (k === 'forest') {
      this.drawScanlinePlane(ctx, cam, time, {
        kind: 'forest', horizon: 248, fx: 0.48, focal: 95,
        fog: [16, 11, 22],
      });
      this.drawForestColonnade3D(ctx, camX, camY, time);
    } else if (k === 'graveyard') {
      const hasRoom = this.level.rooms.length > 0;
      const roomX = hasRoom ? this.level.rooms[0].x0 * TILE : Infinity;
      if (!hasRoom) {
        // Forged moorland wings: open moor and fence all the way, no barbican set-piece.
        this.drawScanlinePlane(ctx, cam, time, { kind: 'moor', horizon: 238, fx: 0.44, focal: 96, fog: [13, 12, 26] });
        this.drawCemeteryFence3D(ctx, camX, camY, this.level.cols - 1);
      } else if (camX < roomX + 96) {
        const portalX = Math.round(project3D(roomX - 18, EYE_Y, 40, camX, camY).x);
        this.drawScanlinePlane(ctx, cam, time, {
          kind: 'moor', horizon: 238, fx: 0.44, focal: 96,
          fog: [13, 12, 26], clipRight: portalX + 8,
        });
        this.drawCemeteryFence3D(ctx, camX, camY, Math.min(this.level.cols - 1, Math.floor(roomX / TILE) - 8));
        this.drawGatehouseSetPiece3D(ctx, camX, camY, time, Math.floor(roomX / TILE));
      }
    }
  }

  /** Undulating 3D aurora ribbons high in the winter sky. */
  drawAurora3D(ctx, camX, time) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let band = 0; band < 2; band++) {
      const baseY = 44 + band * 18;
      const cols = 28;
      for (let i = 0; i < cols; i++) {
        const a0 = i / cols, a1 = (i + 1) / cols;
        const x0 = a0 * (W + 160) - 80, x1 = a1 * (W + 160) - 80;
        const w0 = Math.sin(a0 * 5.2 + time * 0.45 + band * 2.1 - camX * 0.0012);
        const w1 = Math.sin(a1 * 5.2 + time * 0.45 + band * 2.1 - camX * 0.0012);
        const y0 = baseY + w0 * 14, y1 = baseY + w1 * 14;
        const h = 38 + 14 * Math.sin(a0 * 9 + time * 0.7);
        const alpha = (0.045 + 0.03 * Math.max(0, w0)) * (band === 0 ? 1 : 0.75);
        ctx.fillStyle = band === 0
          ? `rgba(90, 230, 195, ${alpha.toFixed(3)})`
          : `rgba(140, 120, 255, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(x0, y0 + h);
        ctx.lineTo(x1, y1 + h);
        ctx.lineTo(x1 + 8, y1 - h * 0.5);
        ctx.lineTo(x0 + 8, y0 - h * 0.5);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /**
   * Texture-mapped 3D Gothic Keep perched in the background, turning in
   * perspective as the hunter advances across the stage.
   */
  drawDistantKeep3D(ctx, camX, camY, time, flash, scale = 0.7) {
    const progress = camX / Math.max(1, this.level.width);
    const keepScreenX = Math.round(W * (0.72 - progress * 0.34));
    const keepScreenY = Math.round(168 - (camY - (this.level.height - H)) * 0.09);
    if (keepScreenX < -140 || keepScreenX > W + 140) return;
    const yaw = -0.38 + progress * 0.76;
    const fog = this.pal.fog;
    const stoneTex = this.tex('keep_stone');
    const roofTex = this.tex('slate_roof');
    const flashBoost = flash > 0.05 ? 1.45 : 0.92;

    const drawPrism = (ox, oy, oz, rad, h, sides, coneH = 0) => {
      const ptsTop = [], ptsBot = [], tip = rotY(ox, oy - h - coneH, oz, yaw);
      for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        const px = ox + Math.cos(a) * rad, pz = oz + Math.sin(a) * rad;
        ptsBot.push(rotY(px, oy, pz, yaw));
        ptsTop.push(rotY(px, oy - h, pz, yaw));
      }
      const proj = (v) => {
        const s = (260 / (260 + v.z)) * scale;
        return { x: keepScreenX + v.x * s, y: keepScreenY + v.y * s };
      };
      const faceW = Math.max(12, Math.round((Math.PI * 2 * rad) / sides));
      const order = [];
      for (let i = 0; i < sides; i++) {
        const j = (i + 1) % sides;
        order.push({ i, j, z: (ptsBot[i].z + ptsBot[j].z) * 0.5 });
      }
      order.sort((a, b) => b.z - a.z);
      const centerRot = rotY(ox, 0, oz, yaw);
      for (const { i, j } of order) {
        const b0 = proj(ptsBot[i]), b1 = proj(ptsBot[j]);
        const t1 = proj(ptsTop[j]), t0 = proj(ptsTop[i]);
        if (b1.x <= b0.x + 0.3) continue; // backface
        const nx = (ptsBot[i].x + ptsBot[j].x) * 0.5 - centerRot.x;
        const nz = (ptsBot[i].z + ptsBot[j].z) * 0.5 - centerRot.z;
        const n = norm3(nx, -0.1, nz);
        const u0 = i * faceW, u1 = (i + 1) * faceW;
        const wallShade = shadeOverlay32(n, fog, 0.44, flashBoost);
        texQuad(ctx, stoneTex, t0, t1, b1, b0, u0, 0, u1, 0, u1, h, u0, h, wallShade);
        if (coneH > 0) {
          const tp = proj(tip);
          const cn = norm3(nx, -0.55, nz);
          const roofShade = shadeOverlay32(cn, fog, 0.38, flashBoost);
          texTri(ctx, roofTex, t0, t1, tp, u0, coneH, u1, coneH, (u0 + u1) * 0.5, 0, roofShade, 0.45);
        }
      }
    };

    ctx.save();
    const towers = [
      { ox: -54, oy: 24, oz: 28, r: 16, h: 78, sides: 6, cone: 34 },
      { ox: 52, oy: 20, oz: 24, r: 15, h: 86, sides: 6, cone: 38 },
      { ox: 0, oy: 26, oz: 0, r: 30, h: 112, sides: 8, cone: 46 },
      { ox: -34, oy: 30, oz: -24, r: 13, h: 62, sides: 6, cone: 28 },
      { ox: 36, oy: 30, oz: -20, r: 14, h: 68, sides: 6, cone: 30 },
    ].map((t) => Object.assign(t, { rz: rotY(t.ox, 0, t.oz, yaw).z }))
      .sort((a, b) => b.rz - a.rz);

    for (const t of towers) drawPrism(t.ox, t.oy, t.oz, t.r, t.h, t.sides, t.cone);

    // Warm lit lancet slits on the main keep face.
    const win = rotY(0, -48, -29, yaw);
    if (win.z < 12) {
      const s = (260 / (260 + win.z)) * scale;
      const wx = Math.round(keepScreenX + win.x * s), wy = Math.round(keepScreenY + win.y * s);
      const pulse = 0.65 + 0.25 * Math.sin(time * 3.1);
      ctx.fillStyle = `rgba(255, 185, 90, ${pulse.toFixed(2)})`;
      ctx.fillRect(wx - 4, wy, 2, 7);
      ctx.fillRect(wx + 2, wy, 2, 7);
    }
    ctx.restore();
  }

  /**
   * Scanline-projected horizontal ground/water/abyss plane receding toward
   * `cfg.horizon`. Pre-bakes a 512x128 tileable procedural texture once.
   */
  drawScanlinePlane(ctx, cam, time, cfg) {
    const base = this.level.height - H;
    const horizon = Math.round(cfg.horizon - (cam.ry - base) * 0.26);
    if (horizon >= H - 2) return;
    const tex = this.getPlaneTexture(cfg.kind);
    const clipW = cfg.clipRight == null ? W : Math.min(W, Math.max(0, Math.round(cfg.clipRight)));
    if (clipW <= 0) return;

    ctx.save();
    if (clipW < W) { ctx.beginPath(); ctx.rect(0, Math.max(0, horizon), clipW, H - Math.max(0, horizon)); ctx.clip(); }

    const scroll = cam.rx * cfg.fx;
    const focal = cfg.focal || 110;
    const yStart = Math.max(0, horizon + 1);
    for (let y = yStart; y < H;) {
      const dy = Math.max(1, y - horizon);
      const step = dy < 30 ? 2 : 3;
      const z = focal / dy;
      const ratio = Math.min(3.0, Math.max(0.45, z * 0.85));
      const shimmer = cfg.shimmer ? Math.sin(y * 0.35 + time * 3.2) * 3.5 : 0;
      const u = mod(scroll * 0.9 + shimmer - EYE_X * ratio, tex.width);
      const v = mod(Math.floor(180 / Math.max(0.18, z)) + (cfg.drift ? Math.floor(time * 12) : 0), tex.height - 1);
      let drawn = 0, tu = u;
      while (drawn < clipW) {
        const avail = tex.width - tu;
        const need = (clipW - drawn) * ratio;
        const take = Math.min(avail, need);
        const dw = Math.max(1, Math.ceil(take / ratio));
        ctx.drawImage(tex, Math.floor(tu), v, Math.max(1, Math.ceil(take)), 1, drawn, y, dw, step);
        drawn += dw;
        tu = 0;
      }
      y += step;
    }

    // Single vertical atmospheric depth-fog pass over the entire ground plane
    const fgGrad = ctx.createLinearGradient(0, Math.max(0, horizon), 0, H);
    fgGrad.addColorStop(0, rgbA(cfg.fog, 0.90));
    fgGrad.addColorStop(0.22, rgbA(cfg.fog, 0.62));
    fgGrad.addColorStop(0.55, rgbA(cfg.fog, 0.32));
    fgGrad.addColorStop(1, rgbA(cfg.fog, 0.14));
    ctx.fillStyle = fgGrad;
    ctx.fillRect(0, yStart, clipW, H - yStart);

    const hz = ctx.createLinearGradient(0, horizon - 10, 0, horizon + 24);
    hz.addColorStop(0, rgbA(cfg.fog, 0));
    hz.addColorStop(0.45, rgbA(cfg.fog, 0.92));
    hz.addColorStop(1, rgbA(cfg.fog, 0));
    ctx.fillStyle = hz;
    ctx.fillRect(0, horizon - 10, clipW, 34);

    if (cfg.torches) {
      const glow = getGlowCanvas('flame');
      const spacing = 180;
      const i0 = Math.floor((scroll - 400) / spacing);
      for (let i = i0; i <= i0 + 8; i++) {
        const rowIdx = ((i * 7) & 3) + 1;
        const dy = 14 + rowIdx * 28;
        const py = horizon + dy;
        if (py >= H - 4) continue;
        const scale = dy / focal;
        const worldOff = i * spacing - scroll;
        const px = Math.round(EYE_X + worldOff * scale * 1.1);
        if (px < -20 || px > clipW + 20) continue;
        const flick = 0.7 + 0.3 * Math.sin(time * 13 + i * 2.7);
        const r = Math.max(4, Math.round(14 * scale));
        if (glow) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.50 * flick;
          ctx.drawImage(glow, px - r * 2.2, py - r * 2.2, r * 4.4, r * 4.4);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.fillStyle = '#ffd88a';
        ctx.fillRect(px - 1, py - 2, Math.max(1, Math.round(2 * scale)), Math.max(1, Math.round(3 * scale)));
      }
    }

    if (cfg.shimmer) {
      const sr = cfg.shimmerRgb || [185, 220, 255];
      ctx.globalCompositeOperation = 'lighter';
      const moonX = Math.round(W * 0.72 - (cam.rx * 0.03) % 80);
      for (let y = Math.max(0, horizon + 4); y < H; y += 4) {
        const k = (y - horizon) / Math.max(1, H - horizon);
        const wob = Math.sin(y * 0.45 + time * 4.2) * (4 + k * 14);
        const rw = Math.round(10 + k * 42);
        ctx.fillStyle = `rgba(${sr[0]}, ${sr[1]}, ${sr[2]}, ${(0.05 + 0.08 * (1 - k)).toFixed(3)})`;
        ctx.fillRect(Math.round(moonX + wob - rw * 0.5), y, rw, 2);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // Shader water: flowing stream / frozen lake / spectral sea overlaid on the plane
    if (cfg.water) {
      const fx = getFxLayers();
      if (fx) {
        fx.water(ctx, { x: 0, y: Math.max(0, horizon), w: clipW, h: H - Math.max(0, horizon) }, {
          horizon, camX: cam.rx * cfg.fx, tint: cfg.water.tint, spec: cfg.water.spec,
          frozen: cfg.water.frozen || 0, alpha: cfg.water.alpha == null ? 1 : cfg.water.alpha,
        });
      }
    }
    ctx.restore();
  }

  /** Crenellated distant bailey wall along the ramparts horizon. */
  drawHorizonWall(ctx, cam, baseHorizon) {
    const base = this.level.height - H;
    const hy = Math.round(baseHorizon - (cam.ry - base) * 0.26);
    const scroll = Math.round(cam.rx * 0.22);
    const i0 = Math.floor((scroll - 24) / 24);
    const i1 = Math.ceil((scroll + W + 24) / 24);
    ctx.fillStyle = '#121126';
    ctx.fillRect(0, hy - 8, W, 10);
    for (let i = i0; i <= i1; i++) {
      const x = i * 24 - scroll;
      ctx.fillRect(x, hy - 14, 14, 6);
      if (mod(i, 9) === 0) {
        ctx.fillRect(x - 4, hy - 30, 22, 22);
        ctx.beginPath();
        ctx.moveTo(x - 6, hy - 30); ctx.lineTo(x + 7, hy - 44); ctx.lineTo(x + 20, hy - 30);
        ctx.closePath(); ctx.fill();
      }
    }
  }

  /** 3D texture-mapped stone merlons running behind the rampart walkway (`z = 44..64`). */
  drawRampartParapets3D(ctx, camX, camY) {
    const lv = this.level;
    // Snap the start column to the world grid (even columns) so merlons never re-seat as the camera scrolls.
    let tx0 = Math.max(0, Math.floor(camX / TILE) - 2);
    tx0 -= tx0 % 2;
    const tx1 = Math.min(lv.cols - 1, Math.ceil((camX + W) / TILE) + 2);
    for (let tx = tx0; tx <= tx1; tx += 2) {
      const r = lv.surfaceRow(tx);
      if (r < 0 || !lv.isSolid(tx, r) || !lv.isSolid(tx + 1, r)) continue;
      if (lv.isSpike(tx, r - 1)) continue;
      const wx0 = tx * TILE + 4;
      const wyBot = r * TILE;
      this.drawBox3D(ctx, camX, camY, wx0, wyBot - 19, 44, 28, 19, 20, 'wall', { topTex: 'stone_trim' });
      this.drawBox3D(ctx, camX, camY, wx0 - 1, wyBot - 23, 42, 30, 4, 24, 'stone_trim');
    }
  }

  /** Receding 3D wrought-iron cemetery fence behind Stage 1's graveyard road. */
  drawCemeteryFence3D(ctx, camX, camY, maxCol) {
    const lv = this.level;
    // Posts live on fixed world columns (multiples of 3); starting from a camera-relative
    // column made the whole fence jump a tile every time the camera crossed a tile edge.
    let tx0 = Math.max(0, Math.floor(camX / TILE) - 3);
    tx0 -= tx0 % 3;
    const tx1 = Math.min(maxCol, Math.ceil((camX + W) / TILE) + 3);
    const z = 54;
    for (let tx = tx0; tx <= tx1; tx += 3) {
      // Posts stand on true ground only (never on viaduct spans or ledges over a gap).
      const r = lv.groundRow(tx);
      if (r < 0) continue;
      const wx = tx * TILE + 16, wy = r * TILE;
      this.drawBox3D(ctx, camX, camY, wx - 5, wy - 36, z, 10, 36, 14, 'wall');
      this.drawBox3D(ctx, camX, camY, wx - 7, wy - 40, z - 2, 14, 4, 18, 'stone_trim');
      const nr = lv.groundRow(tx + 3);
      if (tx + 3 <= maxCol && nr === r) {
        const p0 = project3D(wx + 5, wy - 28, z + 4, camX, camY);
        const p1 = project3D((tx + 3) * TILE + 11, wy - 28, z + 4, camX, camY);
        const b0 = project3D(wx + 5, wy - 8, z + 4, camX, camY);
        const b1 = project3D((tx + 3) * TILE + 11, wy - 8, z + 4, camX, camY);
        ctx.strokeStyle = '#1c2034';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y);
        ctx.moveTo(b0.x, b0.y); ctx.lineTo(b1.x, b1.y);
        ctx.stroke();
        for (let k = 1; k <= 4; k++) {
          const t = k / 5;
          const sx = p0.x + (p1.x - p0.x) * t, sy0 = p0.y + (p1.y - p0.y) * t - 5;
          const sy1 = b0.y + (b1.y - b0.y) * t + 6;
          ctx.fillStyle = '#262b44';
          ctx.fillRect(Math.round(sx), Math.round(sy0), 2, Math.round(sy1 - sy0));
        }
      }
    }
  }

  /**
   * Stage 1 Castle Gatehouse Set-Piece (at tx 96..101 just before indoor hall x0=102):
   * twin texture-mapped 3D barbican towers, crenellated parapet, vaulted arch & chains.
   */
  drawGatehouseSetPiece3D(ctx, camX, camY, time, gateCol) {
    const gx = gateCol * TILE;
    if (gx - camX > W + 300 || gx - camX < -220) return;
    const r = this.level.surfaceRow(gateCol - 3);
    const floorY = (r > 0 ? r : 9) * TILE;
    // Recessed curtain wall & vaulted arch drawn first (`z = 48..90`), tucked behind proud flanking towers (`z = 40..94`)
    this.drawBox3D(ctx, camX, camY, gx - 132, floorY - 212, 48, 70, 54, 42, 'wall_b');
    this.drawArchSpan3D(ctx, camX, camY, gx - 132, gx - 62, floorY - 120, floorY - 158, 48, 42, 'stone_trim');
    this.drawBox3D(ctx, camX, camY, gx - 178, floorY - 216, 40, 46, 216, 54, 'wall');
    this.drawBox3D(ctx, camX, camY, gx - 62, floorY - 232, 40, 50, 232, 54, 'wall');
    for (let i = 0; i < 5; i++) {
      this.drawBox3D(ctx, camX, camY, gx - 176 + i * 38, floorY - 246, 38, 22, 16, 30, 'stone_trim');
    }

    const w0 = project3D(gx - 152, floorY - 118, 38, camX, camY);
    const d0 = project3D(gx - 310, floorY - 2, 8, camX, camY);
    const w1 = project3D(gx - 140, floorY - 118, 62, camX, camY);
    const d1 = project3D(gx - 294, floorY - 2, 34, camX, camY);
    ctx.save();
    ctx.strokeStyle = '#1e2235'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(w1.x, w1.y); ctx.lineTo(d1.x, d1.y); ctx.stroke();
    ctx.strokeStyle = '#68769a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(w0.x, w0.y); ctx.lineTo(d0.x, d0.y); ctx.stroke();
    ctx.restore();
  }

  /** Texture-mapped 3D gnarled tree colonnade & swaying iron lantern cages in Pumpkin Woods. */
  drawForestColonnade3D(ctx, camX, camY, time) {
    const spacing = 240;
    const i0 = Math.floor((camX - 240) / spacing);
    const i1 = Math.ceil((camX + W + 240) / spacing);
    const glowImg = getGlowCanvas('amber');
    for (let pass = 0; pass < 2; pass++) {
      const z = pass === 0 ? 155 : 78;
      const bright = pass === 0 ? 0.68 : 0.96;
      for (let i = i0; i <= i1; i++) {
        const wx = i * spacing + (pass ? 108 : 0);
        const col = Math.max(0, Math.min(this.level.cols - 1, Math.floor(wx / TILE)));
        // Plant trunks on the true ground (never on an upper gallery ledge, viaduct span or ferry gap).
        const r = this.level.nearestGroundRow(col, 14, this.startRow());
        const wy = r * TILE + 8;
        const w = pass === 0 ? 24 : 32;
        this.drawBox3D(ctx, camX, camY, wx - w / 2, wy - 380, z, w, 380, 26, 'bark', { bright });
        this.drawBox3D(ctx, camX, camY, wx - w * 0.95, wy - 22, z - 4, w * 1.9, 22, 32, 'bark_h', { bright, topTex: 'bark_h' });
        this.drawBox3D(ctx, camX, camY, wx - w * 1.4, wy - 286, z - 2, w * 2.8, 16, 22, 'bark_h', { bright, topTex: 'bark_h' });
        if (pass === 1 && (i & 1) === 0) {
          const bx = wx + 46, by = wy - 172;
          this.drawBox3D(ctx, camX, camY, wx, by - 8, z, 54, 10, 14, 'bark_h', { bright, topTex: 'bark_h' });
          const sway = Math.sin(time * 1.5 + i * 1.7) * 8;
          const top = project3D(bx, by + 2, z, camX, camY);
          const bot = project3D(bx + sway, by + 38, z, camX, camY);
          ctx.strokeStyle = '#2a201c'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(bot.x, bot.y); ctx.stroke();
          this.drawBox3D(ctx, camX, camY, bx + sway - 7, by + 38, z - 6, 14, 18, 14, 'iron_rivet');
          const glow = project3D(bx + sway, by + 47, z - 7, camX, camY);
          ctx.fillStyle = '#ffd074';
          ctx.fillRect(Math.round(glow.x - 3), Math.round(glow.y - 4), 6, 8);
          if (glowImg) {
            const gr = 28 * glow.s;
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = 0.62;
            ctx.drawImage(glowImg, glow.x - gr, glow.y - gr, gr * 2, gr * 2);
            ctx.restore();
          }
        }
      }
    }
  }

  /**
   * Darkwood 3D Cathedral of Ancient Elder Trees:
   * mossy buttress trunks at two depths (`z = 162` & `z = 74`), overhead root
   * arches, shelf mushrooms & swaying bioluminescent emerald moss-lanterns.
   */
  drawDarkwoodColonnade3D(ctx, camX, camY, time) {
    const A = this.assets;
    const sheet = A.info('darkwood_trees') ? 'darkwood_trees' : null;
    const glowImg = getGlowCanvas('emerald');
    const spacing = 256;
    const i0 = Math.floor((camX - 320) / spacing);
    const i1 = Math.ceil((camX + W + 320) / spacing);
    const trunks = ['trunk_a', 'trunk_b', 'trunk_c'];
    // Organic elder trunks at three depths (far -> near), bottom-anchored on the
    // forest floor and scaled by projected depth; far ranks are darkened.
    const passes = [
      { z: 240, dark: 0.55, dx: 64, scale: 1.25 },
      { z: 162, dark: 0.34, dx: 0, scale: 1.1 },
      { z: 74, dark: 0.0, dx: 118, scale: 1.0 },
    ];
    for (let pi = 0; pi < passes.length; pi++) {
      const P = passes[pi];
      for (let i = i0; i <= i1; i++) {
        const wx = i * spacing + P.dx;
        const col = Math.max(0, Math.min(this.level.cols - 1, Math.floor(wx / TILE)));
        const r = this.level.nearestGroundRow(col, 14, this.startRow());
        const wy = r * TILE + 10;
        const pr = project3D(wx, wy, P.z, camX, camY);
        if (pr.x < -260 || pr.x > W + 260) continue;
        if (sheet) {
          const name = trunks[Math.abs(i * 7 + pi * 3) % trunks.length];
          const f = A.frame(sheet, name);
          const img = P.dark > 0 ? A.darkened(sheet, P.dark) : A.img(sheet);
          const sc = pr.s * P.scale;
          const dw = f.w * sc, dh = f.h * sc;
          const flip = ((i + pi) & 1) === 1;
          ctx.save();
          ctx.translate(Math.round(pr.x), Math.round(pr.y));
          if (flip) ctx.scale(-1, 1);
          ctx.drawImage(img, f.x, f.y, f.w, f.h, Math.round(-f.ax * sc), Math.round(-dh), Math.round(dw), Math.round(dh));
          ctx.restore();
        } else {
          this.drawBox3D(ctx, camX, camY, wx - 16, wy - 390, P.z, 32, 390, 30, 'elder_bark');
        }
        if (pi === 2) {
          // Curved root arch between near trunks + a swaying hanging lantern
          if ((i & 1) === 0) {
            this.drawArchSpan3D(ctx, camX, camY, wx + 24, wx + spacing - 24, wy - 216, wy - 262, P.z + 6, 22, 'elder_bark_h');
          }
          if (mod(i, 2) === 1 && sheet) {
            const lf = A.frame(sheet, 'lantern');
            const bx = wx - 52, by = wy - 196;
            const sway = Math.sin(time * 1.35 + i * 1.9) * 0.09;
            const lp = project3D(bx, by, P.z - 4, camX, camY);
            const ls = lp.s;
            ctx.save();
            ctx.translate(Math.round(lp.x), Math.round(lp.y));
            ctx.rotate(sway);
            ctx.drawImage(A.img(sheet), lf.x, lf.y, lf.w, lf.h, Math.round(-lf.ax * ls), 0, Math.round(lf.w * ls), Math.round(lf.h * ls));
            ctx.restore();
            if (glowImg) {
              const pulse = 0.7 + 0.3 * Math.sin(time * 2.6 + i);
              const gr = 30 * ls;
              const gx = lp.x + Math.sin(sway) * lf.h * ls * 0.75, gy = lp.y + lf.h * ls * 0.72;
              ctx.save();
              ctx.globalCompositeOperation = 'lighter';
              ctx.globalAlpha = 0.55 * pulse;
              ctx.drawImage(glowImg, gx - gr, gy - gr, gr * 2, gr * 2);
              ctx.restore();
            }
          }
        }
      }
    }
    // Drifting spore motes between the ranks
    for (let i = i0 * 3; i <= i1 * 3; i++) {
      const wx = i * (spacing / 3) + 40 + Math.sin(time * 0.5 + i) * 18;
      const col = Math.max(0, Math.min(this.level.cols - 1, Math.floor(wx / TILE)));
      const r = this.level.nearestGroundRow(col, 14, this.startRow());
      const wy = r * TILE - 60 - (Math.abs(i * 53) % 150) + Math.sin(time * 0.9 + i * 1.3) * 10;
      const pm = project3D(wx, wy, 120, camX, camY);
      if (pm.x < -10 || pm.x > W + 10) continue;
      const a = 0.35 + 0.35 * Math.sin(time * 3 + i * 0.7);
      ctx.fillStyle = `rgba(120, 255, 210, ${a.toFixed(2)})`;
      ctx.fillRect(Math.round(pm.x), Math.round(pm.y), 2, 2);
    }
  }

  drawAbyss3D(ctx, cam, time) {
    // Only `ossuary` and `darkcave` have an open chasm beneath the hall brink; `catacombs` has an opaque 3D floor.
    if (this.themeKey === 'darkcave') {
      this.drawScanlinePlane(ctx, cam, time, {
        kind: 'magma',
        water: { tint: [0.85, 0.22, 0.04], spec: [1.0, 0.82, 0.28], frozen: 0, alpha: 0.85 },
        horizon: 214, fx: 0.36, focal: 92, drift: true,
        shimmer: true, shimmerRgb: [255, 120, 40],
        fog: [24, 7, 6],
      });
      return;
    }
    if (this.themeKey !== 'ossuary') return;
    this.drawScanlinePlane(ctx, cam, time, {
      kind: 'abyss',
      water: { tint: [0.12, 0.35, 0.4], spec: [0.5, 0.95, 0.9], frozen: 0, alpha: 0.6 },
      horizon: 212, fx: 0.38, focal: 92, drift: true,
      fog: [10, 18, 28],
    });
  }

  // ======================================================== INTERIOR 3D
  drawInterior3D(ctx, cam, time) {
    const camX = cam.rx, camY = cam.ry;
    for (const r of this.level.rooms) {
      const rx = r.x0 * TILE - camX, ry = r.y0 * TILE - camY;
      const rw = (r.x1 - r.x0 + 1) * TILE, rh = (r.y1 - r.y0 + 1) * TILE;
      if (rx > W || rx + rw < 0 || ry > H || ry + rh < 0) continue;
      if (r.cylinder) {
        this.drawClockShaft3D(ctx, r, camX, camY, rx, ry, rw, rh, time);
      } else {
        this.drawVaultedHall3D(ctx, r, camX, camY, rx, ry, rw, rh, time);
      }
    }
  }

  /**
   * Texture-Mapped 3D Gothic Vaulted Hall:
   * - Perspective-scaled far masonry wall at z = 200 (100% locked to world UVs)
   * - Recessed 3D arched stained-glass / crypt bays (z = 200..248)
   * - Non-swimming z-strip flagstone hall floor from z = 38 to z = 200 with carpet
   * - Fluted 3D stone colonnade & ashlar-textured pointed rib-vault ceiling overhead
   */
  _roomBounds(r, abyssHall) {
    if (r._hallBounds) return r._hallBounds;
    const lv = this.level;
    const rows = [];
    const c0 = Math.max(2, r.x0 + 1);
    const c1 = Math.min(lv.cols - 3, r.x1 - 1);
    for (let c = c0; c <= c1; c++) {
      const sr = lv.surfaceRow(c);
      if (sr > 0 && sr < lv.rows - 1) rows.push(sr);
    }
    rows.sort((a, b) => a - b);
    const minSurf = rows.length ? rows[0] : (r.floorRow || 11);
    const lowSurf = rows.length ? rows[Math.min(rows.length - 1, Math.floor(rows.length * 0.92))] : (r.floorRow || 11);
    const floorRow = abyssHall ? (r.floorRow || 11) : Math.max(r.floorRow || 11, lowSurf);
    const floorY = floorRow * TILE;
    const ceilY = Math.min(Math.max(r.y0 * TILE + 36, (minSurf - 6) * TILE), floorY - 268);
    r._hallBounds = { floorRow, floorY, ceilY };
    return r._hallBounds;
  }

  drawVaultedHall3D(ctx, r, camX, camY, rx, ry, rw, rh, time) {
    const key = r.wall || 'wall';
    const wallTex = this.tex(key);
    if (!wallTex) return;
    const Z_NEAR = 38, Z_WALL = 200, Z_NICHE = 248;
    const pal = this.pal;
    const abyssHall = this.themeKey === 'ossuary' || this.themeKey === 'darkcave';
    const { floorY, ceilY } = this._roomBounds(r, abyssHall);
    const farFloor = project3D(0, floorY, Z_WALL, camX, camY);

    // When entering Stage 1's indoor castle behind the 3D gatehouse (r.x0 > 0),
    // anchor the hall portal clip at the gatehouse tower's z = 40 pier so there is
    // zero parallax slip between the outdoor barbican tower and the indoor hall.
    const portalLeft = r.x0 > 0
      ? Math.round(project3D(r.x0 * TILE - 18, EYE_Y, 40, camX, camY).x)
      : Math.round(rx);
    const fullVert = r.y0 <= 0 && r.y1 >= this.level.rows - 1;
    const clipLeft = Math.max(0, portalLeft);
    const clipRight = r.x1 >= this.level.cols - 1 ? W : Math.min(W, Math.round(rx + rw));
    const clipTop = fullVert ? 0 : Math.max(0, Math.round(ry));
    const clipBot = fullVert ? H : Math.min(H, Math.round(ry + rh));
    if (clipRight <= clipLeft || clipBot <= clipTop) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(clipLeft, clipTop, clipRight - clipLeft, clipBot - clipTop);
    ctx.clip();

    if (!abyssHall) {
      ctx.fillStyle = rgbA(pal.fog, 1);
      ctx.fillRect(clipLeft, clipTop, clipRight - clipLeft, clipBot - clipTop);
    }

    const bayW = 8 * TILE;
    const minWorldX = r.x0 > 0 ? r.x0 * TILE - bayW : r.x0 * TILE;
    const bStart = Math.max(Math.floor(minWorldX / bayW), Math.floor((camX - 210) / bayW));
    const bEnd = Math.min(Math.floor(r.x1 * TILE / bayW), Math.ceil((camX + W + 210) / bayW));

    // True 3D projected masonry wall at Z_WALL = 200 (s = 0.6552): hits fast 1-draw
    // parallelogram path and locks every brick course to world (wx, wy, Z_WALL)!
    const wxWall0 = bStart * bayW;
    const wxWall1 = (bEnd + 1) * bayW;
    const yWallTop = r.y0 * TILE - 128;
    const yWallBot = abyssHall ? floorY : (r.y1 + 1) * TILE + 128;
    const dark = r.dark == null ? 0.42 : r.dark;
    const wallShade = shadeOverlay32([0, 0, -1], pal.fog, dark, 0.96);
    if (wxWall1 > wxWall0 && yWallBot > yWallTop) {
      const w0 = project3D(wxWall0, yWallTop, Z_WALL, camX, camY);
      const w1 = project3D(wxWall1, yWallTop, Z_WALL, camX, camY);
      const w2 = project3D(wxWall1, yWallBot, Z_WALL, camX, camY);
      const w3 = project3D(wxWall0, yWallBot, Z_WALL, camX, camY);
      texQuad(
        ctx, wallTex, w0, w1, w2, w3,
        wxWall0, yWallTop, wxWall1, yWallTop, wxWall1, yWallBot, wxWall0, yWallBot,
        wallShade,
      );
    }

    if (abyssHall && wxWall1 > wxWall0) {
      const brinkTex = this.tex('crypt_stone');
      const k0 = project3D(wxWall0, floorY - 5, Z_WALL, camX, camY);
      const k1 = project3D(wxWall1, floorY - 5, Z_WALL, camX, camY);
      const k2 = project3D(wxWall1, floorY + 5, Z_WALL, camX, camY);
      const k3 = project3D(wxWall0, floorY + 5, Z_WALL, camX, camY);
      texQuad(
        ctx, brinkTex, k0, k1, k2, k3,
        wxWall0, 0, wxWall1, 0, wxWall1, 10, wxWall0, 10,
        shadeOverlay32([0, -0.8, -0.5], pal.fog, 0.44),
      );
      ctx.fillStyle = 'rgba(4, 6, 12, 0.78)';
      ctx.fillRect(clipLeft, Math.round(farFloor.y) + 2, clipRight - clipLeft, 4);
    }

    const wallTexB = this.assets.img(key + '_b') ? this.tex(key + '_b') : null;
    const windowSpots = [];
    const hallH = floorY - ceilY;
    const tierStep = 224;
    const tierCount = Math.min(3, Math.max(1, Math.floor((hallH - 36) / tierStep)));
    for (let bi = bStart; bi <= bEnd; bi++) {
      const bx0 = bi * bayW, bx1 = bx0 + bayW;
      const midX = (bx0 + bx1) * 0.5;
      if (wallTexB && (bi & 1) === 1 && yWallBot > ceilY) {
        const p0 = project3D(bx0 + 18, ceilY, Z_WALL, camX, camY);
        const p1 = project3D(bx1 - 18, ceilY, Z_WALL, camX, camY);
        const p2 = project3D(bx1 - 18, yWallBot, Z_WALL, camX, camY);
        const p3 = project3D(bx0 + 18, yWallBot, Z_WALL, camX, camY);
        texQuad(
          ctx, wallTexB, p0, p1, p2, p3,
          bx0 + 18, ceilY, bx1 - 18, ceilY, bx1 - 18, yWallBot, bx0 + 18, yWallBot,
          wallShade,
        );
      }

      const nw0 = midX - 46, nw1 = midX + 46;
      for (let ti = 0; ti < tierCount; ti++) {
        const tierBaseY = floorY - ti * tierStep;
        const nyBot = pal.crypt ? tierBaseY - 12 : tierBaseY - 38;
        const nyTop = Math.max(ceilY + 34, tierBaseY - 168);
        if (nyBot - nyTop < 72) continue;
        this.drawRecessedBay3D(ctx, camX, camY, nw0, nw1, nyTop, nyBot, Z_WALL, Z_NICHE, bi + ti * 2, time);
        if (!pal.crypt && mod(bi, 2) === 0 && ti === 0) {
          windowSpots.push({ wx: midX, wyTop: nyTop, wyBot: nyBot });
        }
      }
    }

    if (!abyssHall) {
      this.drawHallFloor3D(
        ctx, camX, camY,
        Math.max(minWorldX, wxWall0),
        Math.min((r.x1 + 1) * TILE, wxWall1),
        floorY, Z_NEAR, Z_WALL, windowSpots, time,
      );
    }

    const bays = [];
    for (let bi = bStart; bi <= bEnd; bi++) {
      const midScreen = (bi + 0.5) * bayW - camX;
      bays.push({ bi, dist: Math.abs(midScreen - EYE_X) });
    }
    bays.sort((a, b) => b.dist - a.dist);

    for (const { bi } of bays) {
      const bx0 = bi * bayW, bx1 = bx0 + bayW;
      this.drawVaultCeilingBay3D(ctx, camX, camY, bx0, bx1, ceilY, Z_NEAR, Z_WALL);
    }

    const pilasterTex = pal.crypt ? 'crypt_stone' : 'wall';
    const pillars = [];
    for (let bi = bStart; bi <= bEnd + 1; bi++) {
      const px = bi * bayW;
      if (px < minWorldX + 8 || px > (r.x1 + 1) * TILE - 8) continue;
      pillars.push({ px, dist: Math.abs(px - camX - EYE_X) });
    }
    pillars.sort((a, b) => b.dist - a.dist);
    for (const { px } of pillars) {
      this.drawBox3D(ctx, camX, camY, px - 14, ceilY + 24, Z_WALL - 22, 28, floorY - ceilY - 24, 22, pilasterTex);
      this.drawPillar3D(ctx, camX, camY, px, ceilY + 22, floorY, 54, 22);
    }

    if (windowSpots.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const w of windowSpots) {
        const wt = project3D(w.wx - 22, w.wyTop + 20, Z_WALL, camX, camY);
        const wb = project3D(w.wx + 22, w.wyBot, Z_WALL, camX, camY);
        const fb0 = project3D(w.wx - 10, floorY, Z_NEAR + 10, camX, camY);
        const fb1 = project3D(w.wx + 68, floorY, Z_NEAR + 10, camX, camY);
        const pulse = 0.78 + 0.22 * Math.sin(time * 0.9 + w.wx * 0.01);
        const g = ctx.createLinearGradient(wt.x, wt.y, fb0.x, fb0.y);
        g.addColorStop(0, rgbA(pal.glass, 0.13 * pulse));
        g.addColorStop(1, rgbA(pal.glass, 0.01));
        ctx.fillStyle = g;
        fillQuad(ctx, wt, { x: wb.x, y: wt.y + 18 }, fb1, fb0);
      }
      ctx.restore();
    }

    if (r.edge !== false && portalLeft > -48) {
      const e = ctx.createLinearGradient(portalLeft, 0, portalLeft + 44, 0);
      e.addColorStop(0, 'rgba(2, 2, 8, 0.85)');
      e.addColorStop(1, 'rgba(2, 2, 8, 0)');
      ctx.fillStyle = e;
      ctx.fillRect(portalLeft, clipTop, 44, clipBot - clipTop);
    }
    ctx.restore();

    // Re-frame the Stage 1 barbican right pier in front of the portal edge so the
    // 3D stone gatehouse physically overlaps the indoor hall entrance cleanly.
    if (r.x0 > 0 && portalLeft > -64 && portalLeft < W + 64) {
      const gx = r.x0 * TILE;
      const gRow = this.level.surfaceRow(Math.max(0, r.x0 - 3));
      const gFloorY = (gRow > 0 ? gRow : 9) * TILE;
      this.drawBox3D(ctx, camX, camY, gx - 62, gFloorY - 232, 40, 50, 232, 54, 'wall');
      this.drawBox3D(ctx, camX, camY, gx - 24, gFloorY - 246, 38, 22, 16, 30, 'stone_trim');
    }
  }

  /** Texture-mapped 3D recessed arched alcove or stained-glass lancet bay. */
  drawRecessedBay3D(ctx, camX, camY, x0, x1, yTop, yBot, zFront, zBack, bayIndex, time) {
    const pal = this.pal;
    const fTL = project3D(x0, yTop + 26, zFront, camX, camY);
    const fTR = project3D(x1, yTop + 26, zFront, camX, camY);
    const fBL = project3D(x0, yBot, zFront, camX, camY);
    const fBR = project3D(x1, yBot, zFront, camX, camY);
    if (fTR.x < -20 || fTL.x > W + 20) return;

    const bTL = project3D(x0, yTop + 26, zBack, camX, camY);
    const bTR = project3D(x1, yTop + 26, zBack, camX, camY);
    const bBL = project3D(x0, yBot, zBack, camX, camY);
    const bBR = project3D(x1, yBot, zBack, camX, camY);
    const midX = (x0 + x1) * 0.5;
    const fApex = project3D(midX, yTop, zFront, camX, camY);
    const bApex = project3D(midX, yTop, zBack, camX, camY);

    const wallTex = this.tex(pal.crypt ? 'crypt_stone' : 'wall');
    const trimTex = this.tex(pal.crypt ? 'crypt_stone' : 'stone_trim');
    const backShade = shadeOverlay32([0, 0, -1], pal.fog, 0.66, 0.58);

    // 1. Textured masonry back wall of the recess (z = zBack)
    texQuad(ctx, wallTex, bTL, bTR, bBR, bBL, x0, yTop + 26, x1, yTop + 26, x1, yBot, x0, yBot, backShade);
    texTri(ctx, wallTex, bTL, bApex, bTR, x0, yTop + 26, midX, yTop, x1, yTop + 26, backShade, 0.45);

    // 2. Stained-glass lancet panes (using `arch.window` pixel art!) or 3D crypt shelves
    if (!pal.crypt && mod(bayIndex, 2) === 0 && this.bank) {
      const winTex = this.bank.stainedWindow(rgbA(pal.glass, 0.42));
      texQuad(ctx, winTex, bTL, bTR, bBR, bBL, 0, 26, 64, 26, 64, 128, 0, 128, null);
      texTri(ctx, winTex, bTL, bApex, bTR, 0, 26, 32, 0, 64, 26, null, 0.4);
      const pulse = 0.68 + 0.22 * Math.sin(time * 1.1 + bayIndex);
      ctx.fillStyle = rgbA(pal.glass, 0.20 * pulse);
      ctx.beginPath();
      ctx.moveTo(bBL.x + 2, bBL.y - 1); ctx.lineTo(bTL.x + 2, bTL.y);
      ctx.lineTo(bApex.x, bApex.y + 2); ctx.lineTo(bTR.x - 2, bTR.y); ctx.lineTo(bBR.x - 2, bBR.y - 1);
      ctx.closePath(); ctx.fill();
    } else if (pal.crypt) {
      for (let s = 1; s <= 2; s++) {
        const sy = yTop + 34 + s * 42;
        this.drawBox3D(ctx, camX, camY, x0 + 2, sy, zBack - 22, x1 - x0 - 4, 6, 22, 'crypt_stone', { bright: 0.8 });
        const sL = project3D(x0 + 6, sy, zBack - 16, camX, camY);
        const sR = project3D(x1 - 6, sy, zBack - 16, camX, camY);
        ctx.fillStyle = shade32([185, 174, 152], [-0.3, -0.5, -0.8], pal.fog, 0.60);
        for (let k = 0; k < 3; k++) {
          const kx = sL.x + 8 + k * ((sR.x - sL.x - 18) / 2);
          ctx.fillRect(Math.round(kx), Math.round(sL.y - 6), 5, 6);
          ctx.fillStyle = '#181422';
          ctx.fillRect(Math.round(kx + 1), Math.round(sL.y - 4), 1, 2);
          ctx.fillRect(Math.round(kx + 3), Math.round(sL.y - 4), 1, 2);
          ctx.fillStyle = shade32([185, 174, 152], [-0.3, -0.5, -0.8], pal.fog, 0.60);
        }
      }
    }

    // 3. Texture-mapped 3D Perspective Side Jambs
    const depth = zBack - zFront;
    if (bTL.x > fTL.x + 0.4) {
      const shL = shadeOverlay32([1, 0, -0.25], pal.fog, 0.50);
      texQuad(ctx, wallTex, fTL, bTL, bBL, fBL, 0, yTop + 26, depth, yTop + 26, depth, yBot, 0, yBot, shL);
      texQuad(ctx, wallTex, fApex, bApex, bTL, fTL, 0, yTop, depth, yTop, depth, yTop + 26, 0, yTop + 26, shL);
    }
    if (bTR.x < fTR.x - 0.4) {
      const shR = shadeOverlay32([-1, 0, -0.25], pal.fog, 0.50);
      texQuad(ctx, wallTex, bTR, fTR, fBR, bBR, 0, yTop + 26, depth, yTop + 26, depth, yBot, 0, yBot, shR);
      texQuad(ctx, wallTex, bApex, fApex, fTR, bTR, 0, yTop, depth, yTop, depth, yTop + 26, 0, yTop + 26, shR);
    }
    // 4. Texture-mapped 3D Sill Top
    if (fBL.y > bBL.y + 0.4) {
      const shSill = shadeOverlay32([0, -1, -0.3], pal.fog, 0.44);
      texQuad(ctx, trimTex, bBL, bBR, fBR, fBL, x0, 0, x1, 0, x1, depth, x0, depth, shSill);
    }
    // Moulded stone archivolts trim on zFront
    ctx.strokeStyle = shade32(pal.trim, [-0.3, -0.5, -0.8], pal.fog, 0.42);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fBL.x, fBL.y); ctx.lineTo(fTL.x, fTL.y);
    ctx.lineTo(fApex.x, fApex.y); ctx.lineTo(fTR.x, fTR.y); ctx.lineTo(fBR.x, fBR.y);
    ctx.stroke();
  }

  /** Texture-mapped 3D perspective flagstone hall floor + royal crimson carpet (zero diagonal swim). */
  drawHallFloor3D(ctx, camX, camY, x0, x1, floorY, zNear, zFar, windows, time) {
    const pal = this.pal;
    const fNearL = project3D(x0, floorY, zNear, camX, camY);
    const fNearR = project3D(x1, floorY, zNear, camX, camY);
    const fFarL = project3D(x0, floorY, zFar, camX, camY);
    const fFarR = project3D(x1, floorY, zFar, camX, camY);
    if (fNearL.y <= fFarL.y + 1) return;

    // Dark mortar undercoat prevents any sub-pixel gap between perspective strips
    ctx.fillStyle = rgbA(pal.fog, 0.96);
    fillQuad(ctx, fFarL, fFarR, fNearR, fNearL);

    const floorTex = this.tex(pal.crypt ? 'crypt_floor' : 'hall_floor');
    const zSteps = [zFar, 152, 108, 70, zNear];
    for (let zi = 0; zi < zSteps.length - 1; zi++) {
      const zA = zSteps[zi], zB = zSteps[zi + 1];
      const fogT = 0.24 + 0.46 * (zA / zFar);
      const shade = shadeOverlay32([0, -0.9, -0.4], pal.fog, fogT, 0.94);
      texStripZ(ctx, floorTex, camX, camY, x0, x1, floorY, zA, zB, zA, zB, shade, 1, FOCAL, EYE_X, EYE_Y);
    }

    // Texture-mapped Royal Crimson Runner Carpet (woven gold filigree borders at v=0 & v=32!)
    if (pal.carpet) {
      const carpetTex = this.tex('carpet');
      const cShade = shadeOverlay32([0, -0.85, -0.5], pal.fog, 0.34, 0.96);
      texStripZ(ctx, carpetTex, camX, camY, x0, x1, floorY, 148, 76, 0, 32, cShade, 2, FOCAL, EYE_X, EYE_Y);
    }

    if (windows.length) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const w of windows) {
        const pulse = 0.75 + 0.25 * Math.sin(time * 0.9 + w.wx * 0.01);
        const a0 = project3D(w.wx - 20, floorY, 172, camX, camY);
        const a1 = project3D(w.wx + 24, floorY, 172, camX, camY);
        const b1 = project3D(w.wx + 66, floorY, 56, camX, camY);
        const b0 = project3D(w.wx + 4, floorY, 56, camX, camY);
        ctx.fillStyle = rgbA(pal.glass, 0.18 * pulse);
        fillQuad(ctx, a0, a1, b1, b0);
      }
      ctx.restore();
    }

    const sb = ctx.createLinearGradient(0, fFarL.y, 0, fFarL.y + 8);
    sb.addColorStop(0, 'rgba(3, 2, 10, 0.72)');
    sb.addColorStop(1, 'rgba(3, 2, 10, 0)');
    ctx.fillStyle = sb;
    ctx.fillRect(Math.round(fFarL.x), Math.round(fFarL.y), Math.round(fFarR.x - fFarL.x), 8);
  }

  /** One bay of a texture-mapped 3D Gothic pointed rib-vault ceiling overhead. */
  drawVaultCeilingBay3D(ctx, camX, camY, x0, x1, ceilY, zNear, zFar) {
    const pal = this.pal;
    const midX = (x0 + x1) * 0.5, midZ = (zNear + zFar) * 0.5;
    const springY = ceilY + 46, crownY = ceilY;

    const nL = project3D(x0, springY, zNear, camX, camY);
    const nR = project3D(x1, springY, zNear, camX, camY);
    if (nR.x < -30 || nL.x > W + 30 || Math.max(nL.y, nR.y) < -10) return;

    const fL = project3D(x0, springY, zFar, camX, camY);
    const fR = project3D(x1, springY, zFar, camX, camY);
    const nApex = project3D(midX, crownY, zNear, camX, camY);
    const fApex = project3D(midX, crownY, zFar, camX, camY);
    const boss = project3D(midX, crownY - 6, midZ, camX, camY);

    const vTex = this.tex(pal.crypt ? 'crypt_stone' : 'wall');

    // 6 ashlar-textured vaulting web triangles anchored to world (x0..x1, crownY..springY, zNear..zFar)
    texTri(ctx, vTex, nL, fL, boss, zNear, springY, zFar, springY, midZ, crownY,
      shadeOverlay32([0.55, 0.7, -0.4], pal.fog, 0.52), 0.55);
    texTri(ctx, vTex, fR, nR, boss, zFar, springY, zNear, springY, midZ, crownY,
      shadeOverlay32([-0.55, 0.7, -0.4], pal.fog, 0.56), 0.55);

    const shFar = shadeOverlay32([0, 0.8, 0.5], pal.fog, 0.58);
    texTri(ctx, vTex, fL, fApex, boss, x0, springY, midX, crownY, midX, crownY - 32, shFar, 0.55);
    texTri(ctx, vTex, fApex, fR, boss, midX, crownY, x1, springY, midX, crownY - 32, shFar, 0.55);

    const shNear = shadeOverlay32([0, 0.8, -0.5], pal.fog, 0.44);
    texTri(ctx, vTex, nL, boss, nApex, x0, springY, midX, crownY - 32, midX, crownY, shNear, 0.55);
    texTri(ctx, vTex, nApex, boss, nR, midX, crownY, midX, crownY - 32, x1, springY, shNear, 0.55);

    // Moulded stone diagonal groin ribs & transverse arch ribs
    ctx.strokeStyle = shade32(pal.trim, [-0.2, 0.5, -0.8], pal.fog, 0.36);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(nL.x, nL.y); ctx.lineTo(nApex.x, nApex.y); ctx.lineTo(nR.x, nR.y);
    ctx.moveTo(fL.x, fL.y); ctx.lineTo(fApex.x, fApex.y); ctx.lineTo(fR.x, fR.y);
    ctx.lineWidth = 2;
    ctx.moveTo(nL.x, nL.y); ctx.lineTo(boss.x, boss.y); ctx.lineTo(fR.x, fR.y);
    ctx.moveTo(nR.x, nR.y); ctx.lineTo(boss.x, boss.y); ctx.lineTo(fL.x, fL.y);
    ctx.stroke();

    // Carved 3D keystone boss at the vault crown
    this.drawBox3D(ctx, camX, camY, midX - 7, crownY - 10, midZ - 6, 14, 9, 12,
      pal.crypt ? 'crypt_stone' : 'stone_trim');
  }

  /** Fluted 3D stone column with moulded plinth base, fluted shaft & carved capital. */
  drawPillar3D(ctx, camX, camY, wx, yTop, yBot, z, w) {
    const trimKey = this.pal.crypt ? 'crypt_stone' : 'stone_trim';
    this.drawBox3D(ctx, camX, camY, wx - w / 2, yTop + 14, z, w, yBot - yTop - 28, w,
      'pillar_shaft', { uFit: 32 });
    this.drawBox3D(ctx, camX, camY, wx - w * 0.72, yTop, z - 4, w * 1.44, 14, w + 8, trimKey);
    this.drawBox3D(ctx, camX, camY, wx - w * 0.72, yBot - 16, z - 4, w * 1.44, 16, w + 8, trimKey);
  }

  // ============================================ CLOCK TOWER 3D CYLINDER & GEARS
  drawClockShaft3D(ctx, r, camX, camY, rx, ry, rw, rh, time) {
    const key = (r.wall || 'clockwall') + '|cyl';
    const wall = this.assets.img(r.wall || 'clockwall');
    if (!wall) return;
    if (!this._cyl) this._cyl = {};
    if (!this._cyl[key]) {
      const c = document.createElement('canvas');
      c.width = wall.width; c.height = wall.height * 4;
      const g = c.getContext('2d');
      for (let i = 0; i < 4; i++) g.drawImage(wall, 0, i * wall.height);
      this._cyl[key] = c;
    }
    const tex = this._cyl[key];
    const radius = W * 0.68;
    const sCyl = FOCAL / (FOCAL + 160);
    // Bricks are stationary in world space (zero self-rotation!) and locked in both
    // horizontal and vertical scale/phase to the iron ring-girders at z = 160.
    const rot = (camX - EYE_X) * sCyl;
    const vy = mod(camY + EYE_Y * (1 - 1 / sCyl), wall.height);
    const srcH = Math.min(wall.height * 3, Math.ceil(H / sCyl));
    // 2px screen columns, each sampling the exact texel span it covers on the
    // cylinder (1:1 at the centre, compressing toward the rim) so the wall never
    // magnifies into chunky 4px stripes.
    const step = 2;

    ctx.save();
    ctx.beginPath(); ctx.rect(rx, ry, rw, rh); ctx.clip();
    ctx.fillStyle = '#05040a';
    ctx.fillRect(rx, ry, rw, rh);

    const texU = (sx) => {
      const nx = Math.max(-0.999, Math.min(0.999, (sx - EYE_X) / radius));
      return Math.asin(nx) * radius + rot;
    };
    for (let sx = 0; sx < W; sx += step) {
      const nx = (sx + step * 0.5 - EYE_X) / radius;
      if (Math.abs(nx) >= 1) continue;
      const u0 = texU(sx), u1 = texU(sx + step);
      const span = Math.max(1, Math.min(8, u1 - u0));
      const texX = mod(u0, tex.width);
      const sw = Math.min(span, tex.width - texX);
      ctx.drawImage(tex, texX, vy, sw, srcH, sx, 0, step, H);
    }

    // Single cached horizontal cylindrical lighting gradient instead of 320 fillRects
    if (!this._cylShade) {
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0.00, 'rgba(5, 4, 12, 0.94)');
      g.addColorStop(0.16, 'rgba(5, 4, 12, 0.58)');
      g.addColorStop(0.50, 'rgba(5, 4, 12, 0.22)');
      g.addColorStop(0.84, 'rgba(5, 4, 12, 0.58)');
      g.addColorStop(1.00, 'rgba(5, 4, 12, 0.94)');
      this._cylShade = g;
    }
    ctx.fillStyle = this._cylShade;
    ctx.fillRect(0, 0, W, H);

    // Texture-mapped 3D Curved Iron Ring-Girders locked to the exact same sCyl depth!
    const ironTex = this.tex('iron_rivet');
    const ringSpacing = 224;
    const wyMin = camY + EYE_Y - (EYE_Y + 90) / sCyl;
    const wyMax = camY + EYE_Y + (H - EYE_Y + 90) / sCyl;
    const wyStart = Math.floor(wyMin / ringSpacing) * ringSpacing;
    const segs = 9;
    for (let wy = wyStart; wy <= wyMax; wy += ringSpacing) {
      const sy = EYE_Y + (wy - camY - EYE_Y) * sCyl;
      const tilt = (sy - EYE_Y) * 0.14;
      for (let i = 0; i < segs; i++) {
        const a0 = -1.30 + (i / segs) * 2.60;
        const a1 = -1.30 + ((i + 1) / segs) * 2.60;
        const x0 = EYE_X + Math.sin(a0) * radius * 0.98;
        const x1 = EYE_X + Math.sin(a1) * radius * 0.98;
        const y0 = sy + Math.cos(a0) * tilt;
        const y1 = sy + Math.cos(a1) * tilt;
        const facing = Math.cos((a0 + a1) * 0.5);
        const u0 = a0 * radius + rot, u1 = a1 * radius + rot;
        const sh = shadeOverlay32([Math.sin((a0 + a1) * 0.5) * 0.6, -0.2, -facing], this.pal.fog, 0.55 - facing * 0.35);
        texQuad(
          ctx, ironTex,
          { x: x0, y: y0 - 5 }, { x: x1, y: y1 - 5 },
          { x: x1, y: y1 + 5 }, { x: x0, y: y0 + 5 },
          u0, 0, u1, 0, u1, 16, u0, 16, sh,
        );
      }
    }

    // Background 3D Structural Truss Beams & Tilted Texture-Mapped 3D Bevel Gears!
    const shaftBay = 280;
    const bi0 = Math.floor((camY - 220) / shaftBay);
    const bi1 = Math.ceil((camY + H + 220) / shaftBay);
    for (let bi = bi0; bi <= bi1; bi++) {
      const by = bi * shaftBay + 120;
      const cx = ((Math.abs(bi) * 193) % Math.max(320, this.level.width - 320)) + 160;
      this.drawBox3D(ctx, camX, camY, cx - 220, by - 8, 145, 440, 18, 24, 'iron_truss');
      this.drawGear3D(ctx, camX, camY, cx, by - 14, 130, {
        r: 58, teeth: 12, thick: 16, speed: (bi & 1) ? 0.65 : -0.65,
        tiltX: 1.18, tiltY: 0.15, brass: true,
      }, time);
      this.drawBox3D(ctx, camX, camY, cx - 6, by - 150, 126, 12, 280, 12, 'iron_rivet');
    }
    ctx.restore();
  }

  /**
   * True 3D extruded & texture-mapped polygonal cogwheel:
   * - Fast-paths front-on gears (`!tiltX && !tiltY`) using pre-baked pixel-art
   *   spoked/toothed wheel caps + backface-culled 3D extruded metal tooth flanks.
   * - Full 3D perspective polygon path with camera-space backface culling when tilted.
   */
  drawGear3D(ctx, camX, camY, wx, wy, z, opts, time) {
    const pCenter = project3D(wx, wy, z, camX, camY);
    const rad = opts.r || 42;
    if (pCenter.x < -rad * 2 || pCenter.x > W + rad * 2 || pCenter.y < -rad * 2 || pCenter.y > H + rad * 2) return;

    const teeth = opts.teeth || Math.max(8, Math.round(rad / 4.5));
    const thick = opts.thick || Math.max(12, Math.round(rad * 0.34));
    const ang0 = time * (opts.speed || 0.45) + (opts.phase || 0);
    const tiltX = opts.tiltX || 0;
    const tiltY = opts.tiltY || 0;
    const brass = opts.brass !== false;
    const rimTex = this.tex(brass ? 'brass_rim' : 'iron_rivet');
    const fog = this.pal.fog;
    const fogBase = clamp01(z / 380) * 0.62;
    const eyeWX = camX + EYE_X, eyeWY = camY + EYE_Y, eyeWZ = -FOCAL;

    const rRoot = rad * 0.84, rTip = rad * 1.04, rInner = rad * 0.56, rHub = rad * 0.25;
    const step = (Math.PI * 2) / teeth;

    const profile = [];
    for (let i = 0; i < teeth; i++) {
      const a = i * step;
      profile.push(
        [Math.cos(a) * rRoot, Math.sin(a) * rRoot],
        [Math.cos(a + step * 0.16) * rTip, Math.sin(a + step * 0.16) * rTip],
        [Math.cos(a + step * 0.50) * rTip, Math.sin(a + step * 0.50) * rTip],
        [Math.cos(a + step * 0.66) * rRoot, Math.sin(a + step * 0.66) * rRoot],
      );
    }

    const xform = (lx, ly, lz) => {
      const ca = Math.cos(ang0), sa = Math.sin(ang0);
      let x = lx * ca - ly * sa, y = lx * sa + ly * ca, zz = lz;
      if (tiltX) {
        const cx = Math.cos(tiltX), sx = Math.sin(tiltX);
        const ny = y * cx - zz * sx, nz = y * sx + zz * cx;
        y = ny; zz = nz;
      }
      if (tiltY) {
        const cy = Math.cos(tiltY), sy = Math.sin(tiltY);
        const nx = x * cy + zz * sy, nz = -x * sy + zz * cy;
        x = nx; zz = nz;
      }
      return { wx: wx + x, wy: wy + y, wz: z + zz };
    };
    const pr = (v) => project3D(v.wx, v.wy, v.wz, camX, camY);

    // Axle plunging into depth behind the gear
    this.drawBox3D(ctx, camX, camY, wx - 5, wy - 5, z + thick * 0.5, 10, 10, 64, 'iron_rivet');

    const front = profile.map(([px, py]) => xform(px, py, -thick * 0.5));
    const back = profile.map(([px, py]) => xform(px, py, thick * 0.5));

    // Build ONLY camera-visible extruded flank quads (camera-space backface culled!)
    const quads = [];
    const n = profile.length;
    let perim = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const segLen = Math.hypot(profile[j][0] - profile[i][0], profile[j][1] - profile[i][1]);
      const f0 = front[i], f1 = front[j], b1 = back[j], b0 = back[i];
      const nrm = quadNormal(f0, f1, b1);
      if (nrm[0] * (eyeWX - f0.wx) + nrm[1] * (eyeWY - f0.wy) + nrm[2] * (eyeWZ - f0.wz) > 0) {
        quads.push({ f0, f1, b1, b0, nrm, u0: perim, u1: perim + segLen, mz: (f0.wz + f1.wz + b1.wz + b0.wz) * 0.25 });
      }
      perim += segLen;
    }
    for (let i = 0; i < teeth; i++) {
      const a0 = i * step, a1 = (i + 1) * step;
      const ix0 = Math.cos(a0) * rInner, iy0 = Math.sin(a0) * rInner;
      const ix1 = Math.cos(a1) * rInner, iy1 = Math.sin(a1) * rInner;
      const f0 = xform(ix1, iy1, -thick * 0.5), f1 = xform(ix0, iy0, -thick * 0.5);
      const b1 = xform(ix0, iy0, thick * 0.5), b0 = xform(ix1, iy1, thick * 0.5);
      const nrm = quadNormal(f0, f1, b1);
      if (nrm[0] * (eyeWX - f0.wx) + nrm[1] * (eyeWY - f0.wy) + nrm[2] * (eyeWZ - f0.wz) > 0) {
        const segLen = Math.hypot(ix1 - ix0, iy1 - iy0);
        quads.push({ f0, f1, b1, b0, nrm, u0: i * segLen, u1: (i + 1) * segLen, mz: (f0.wz + f1.wz + b1.wz + b0.wz) * 0.25 });
      }
    }
    quads.sort((a, b) => b.mz - a.mz);

    // Fast path for front-on 3D cogwheels: pre-baked spoked/toothed 2D wheel caps + 3D extruded flanks!
    if (!tiltX && !tiltY && this.bank) {
      const backWheel = this.bank.gearWheel(brass, teeth, true);
      const frontWheel = this.bank.gearWheel(brass, teeth, false);
      const pBack = project3D(wx, wy, z + thick * 0.5, camX, camY);
      const pFront = project3D(wx, wy, z - thick * 0.5, camX, camY);
      const hb = (96 / 88) * rTip * pBack.s;
      const hf = (96 / 88) * rTip * pFront.s;

      ctx.save();
      ctx.translate(pBack.x, pBack.y);
      ctx.rotate(ang0);
      ctx.drawImage(backWheel, -hb, -hb, hb * 2, hb * 2);
      ctx.restore();

      for (const q of quads) {
        const sh = shadeOverlay32(q.nrm, fog, clamp01(q.mz / 380) * 0.65, 0.88);
        texQuad(ctx, rimTex, pr(q.f0), pr(q.f1), pr(q.b1), pr(q.b0), q.u0, 0, q.u1, 0, q.u1, thick, q.u0, thick, sh);
      }

      ctx.save();
      ctx.translate(pFront.x, pFront.y);
      ctx.rotate(ang0);
      ctx.drawImage(frontWheel, -hf, -hf, hf * 2, hf * 2);
      ctx.restore();
      return;
    }

    const capTex = this.tex(brass ? 'brass_gear' : 'iron_gear');
    const uvS = 116 / Math.max(12, rTip);
    const uvU = (lx) => 128 + lx * uvS;
    const uvV = (ly) => 128 + ly * uvS;
    const nrmFront = xform(0, 0, -1), org = xform(0, 0, 0);
    const frontFacing = (nrmFront.wz - org.wz) < 0;

    const drawRingCap = (capZ, isNear) => {
      const capNormal = norm3(
        (nrmFront.wx - org.wx) * (isNear === frontFacing ? 1 : -1),
        (nrmFront.wy - org.wy) * (isNear === frontFacing ? 1 : -1) - 0.25,
        (nrmFront.wz - org.wz) * (isNear === frontFacing ? 1 : -1),
      );
      const sh = shadeOverlay32(capNormal, fog, fogBase, isNear ? 1.0 : 0.62);
      const pt = (lx, ly, dz = 0) => pr(xform(lx, ly, capZ + dz));

      const wSp = rad * 0.10;
      for (let s = 0; s < 4; s++) {
        const a = (s / 4) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const nx = -sa * wSp, ny = ca * wSp;
        const lx0 = nx, ly0 = ny, lx1 = -nx, ly1 = -ny;
        const lx2 = ca * (rInner + 2) - nx, ly2 = sa * (rInner + 2) - ny;
        const lx3 = ca * (rInner + 2) + nx, ly3 = sa * (rInner + 2) + ny;
        texQuad(
          ctx, capTex,
          pt(lx0, ly0), pt(lx1, ly1), pt(lx2, ly2), pt(lx3, ly3),
          uvU(lx0), uvV(ly0), uvU(lx1), uvV(ly1), uvU(lx2), uvV(ly2), uvU(lx3), uvV(ly3), sh,
        );
      }

      for (let i = 0; i < teeth; i++) {
        const a0 = i * step, aMid = a0 + step * 0.50, a1 = (i + 1) * step;
        const base = i * 4;
        const [p0x, p0y] = profile[base], [p1x, p1y] = profile[base + 1];
        const [p2x, p2y] = profile[base + 2], [p3x, p3y] = profile[base + 3];
        const [p4x, p4y] = profile[(base + 4) % n];
        const ir0x = Math.cos(a0) * rInner, ir0y = Math.sin(a0) * rInner;
        const irMx = Math.cos(aMid) * rInner, irMy = Math.sin(aMid) * rInner;
        const ir1x = Math.cos(a1) * rInner, ir1y = Math.sin(a1) * rInner;

        const sp0 = pt(p0x, p0y), sp1 = pt(p1x, p1y), sp2 = pt(p2x, p2y), sp3 = pt(p3x, p3y), sp4 = pt(p4x, p4y);
        const si0 = pt(ir0x, ir0y), siM = pt(irMx, irMy), si1 = pt(ir1x, ir1y);

        texQuad(ctx, capTex, si0, sp0, sp3, siM,
          uvU(ir0x), uvV(ir0y), uvU(p0x), uvV(p0y), uvU(p3x), uvV(p3y), uvU(irMx), uvV(irMy), sh);
        texQuad(ctx, capTex, siM, sp3, sp4, si1,
          uvU(irMx), uvV(irMy), uvU(p3x), uvV(p3y), uvU(p4x), uvV(p4y), uvU(ir1x), uvV(ir1y), sh);
        texQuad(ctx, capTex, sp0, sp1, sp2, sp3,
          uvU(p0x), uvV(p0y), uvU(p1x), uvV(p1y), uvU(p2x), uvV(p2y), uvU(p3x), uvV(p3y), sh);
      }

      const hubDz = isNear ? (frontFacing ? -2 : 2) : 0;
      const hubSh = shadeOverlay32(capNormal, fog, fogBase * 0.9, isNear ? 1.1 : 0.7);
      const hc = pt(0, 0, hubDz);
      for (let h = 0; h < 8; h++) {
        const ha0 = (h / 8) * Math.PI * 2, ha1 = ((h + 1) / 8) * Math.PI * 2;
        const hx0 = Math.cos(ha0) * rHub, hy0 = Math.sin(ha0) * rHub;
        const hx1 = Math.cos(ha1) * rHub, hy1 = Math.sin(ha1) * rHub;
        texTri(ctx, capTex, hc, pt(hx0, hy0, hubDz), pt(hx1, hy1, hubDz),
          128, 128, uvU(hx0), uvV(hy0), uvU(hx1), uvV(hy1), hubSh, 0.45);
      }
    };

    // Tilted gears only need their camera-facing cap drawn once (back cap is occluded by solid hub/rim)
    drawRingCap(frontFacing ? -thick * 0.5 : thick * 0.5, true);
    for (const q of quads) {
      const sh = shadeOverlay32(q.nrm, fog, clamp01(q.mz / 380) * 0.65, 0.88);
      texQuad(ctx, rimTex, pr(q.f0), pr(q.f1), pr(q.b1), pr(q.b0), q.u0, 0, q.u1, 0, q.u1, thick, q.u0, thick, sh);
    }
  }

  // ============================================ BOSS ARENA 3D CENTERPIECES
  drawBossCenterpiece3D(ctx, cam, time) {
    const b = this.data.boss;
    if (!b || !b.arena) return;
    const camX = cam.rx, camY = cam.ry;
    const cx = (b.arena.x0 + b.arena.x1) * 0.5;
    const floorY = b.arena.floorY;
    if (cx - camX < -380 || cx - camX > W + 380) return;

    const type = b.type || 'reaper';
    if (type === 'reaperlord') {
      this.drawAstronomicalClock3D(ctx, camX, camY, cx, floorY - 134, 155, time);
    } else if (type === 'count') {
      this.drawCountThroneApse3D(ctx, camX, camY, cx, floorY, time);
    } else if (type === 'treant') {
      this.drawBriarShrine3D(ctx, camX, camY, cx, floorY, time);
    } else if (type === 'automaton') {
      this.drawAutomataStage3D(ctx, camX, camY, cx, floorY, time);
    } else if (type === 'archivist') {
      this.drawGrandReadingRoom3D(ctx, camX, camY, cx, floorY, time);
    } else if (type === 'archon') {
      this.drawCathedralApse3D(ctx, camX, camY, cx, floorY, time);
    } else if (type === 'greatjack') {
      this.drawMonolithCircle3D(ctx, camX, camY, cx, floorY, time);
    } else if (type === 'devilsanta') {
      this.drawYuleBellTower3D(ctx, camX, camY, cx, floorY, time);
    } else if (type === 'bonecaptain') {
      this.drawRampartBastion3D(ctx, camX, camY, cx, floorY);
    } else if (type === 'gorgon') {
      this.drawPetrifiedTemple3D(ctx, camX, camY, cx, floorY);
    } else if (type === 'cinderqueen') {
      this.drawVolcanicCaldera3D(ctx, camX, camY, cx, floorY, time);
    } else {
      const archTex = this.pal.crypt ? 'crypt_stone' : 'stone_trim';
      this.drawArchSpan3D(ctx, camX, camY, cx - 120, cx + 120, floorY - 150, floorY - 224, 96, 54, archTex);
      this.drawPillar3D(ctx, camX, camY, cx - 120, floorY - 160, floorY, 96, 26);
      this.drawPillar3D(ctx, camX, camY, cx + 120, floorY - 160, floorY, 96, 26);
    }
  }

  /** Cathedral Boss Centerpiece: a soaring apse of clustered piers, a high altar and the great rose window. */
  drawCathedralApse3D(ctx, camX, camY, cx, floorY, time) {
    this.drawArchSpan3D(ctx, camX, camY, cx - 180, cx + 180, floorY - 230, floorY - 300, 120, 54, 'stone_trim');
    for (const side of [-1, 1]) {
      for (let k = 0; k < 2; k++) {
        const tx = cx + side * (130 + k * 70);
        this.drawPillar3D(ctx, camX, camY, tx, floorY - 260 + k * 20, floorY, 110 + k * 30, 22);
      }
    }
    this.drawBox3D(ctx, camX, camY, cx - 110, floorY - 10, 130, 220, 10, 50, 'stone_trim');
    this.drawBox3D(ctx, camX, camY, cx - 70, floorY - 20, 136, 140, 10, 40, 'stone_trim');
    this.drawBox3D(ctx, camX, camY, cx - 28, floorY - 60, 150, 56, 40, 24, 'stone_trim', { topTex: 'wood_plank' });
    const gp = project3D(cx, floorY - 215, 200, camX, camY);
    const glow = getGlowCanvas('crimson');
    if (glow) {
      const pulse = 0.65 + 0.35 * Math.sin(time * 1.2);
      const r = 86 * gp.s;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45 * pulse;
      ctx.drawImage(glow, gp.x - r, gp.y - r, r * 2, r * 2);
      ctx.restore();
    }
  }

  /** Library Boss Centerpiece: a vaulted reading-room apse of towering shelves, a rose window and a spectral lectern dais. */
  drawGrandReadingRoom3D(ctx, camX, camY, cx, floorY, time) {
    this.drawArchSpan3D(ctx, camX, camY, cx - 160, cx + 160, floorY - 176, floorY - 244, 110, 50, 'stone_trim');
    for (const side of [-1, 1]) {
      const tx = cx + side * 170;
      this.drawBox3D(ctx, camX, camY, tx - 20, floorY - 206, 110, 40, 206, 42, 'wood_plank');
      this.drawBox3D(ctx, camX, camY, tx - 28, floorY - 216, 106, 56, 12, 50, 'stone_trim');
    }
    this.drawBox3D(ctx, camX, camY, cx - 92, floorY - 12, 130, 184, 12, 46, 'stone_trim', { topTex: 'wood_plank' });
    this.drawBox3D(ctx, camX, camY, cx - 52, floorY - 22, 138, 104, 10, 36, 'wood_plank', { topTex: 'wood_plank' });
    this.drawBox3D(ctx, camX, camY, cx - 10, floorY - 56, 150, 20, 34, 16, 'wood_plank');
    const gp = project3D(cx, floorY - 190, 190, camX, camY);
    const glow = getGlowCanvas('violet');
    if (glow) {
      const pulse = 0.6 + 0.4 * Math.sin(time * 1.6);
      const r = 70 * gp.s;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5 * pulse;
      ctx.drawImage(glow, gp.x - r, gp.y - r, r * 2, r * 2);
      ctx.restore();
    }
  }

  /** Arcade Boss Centerpiece: a brass proscenium stage with meshing cogwheels, pipes & a winding-key dais. */
  drawAutomataStage3D(ctx, camX, camY, cx, floorY, time) {
    this.drawArchSpan3D(ctx, camX, camY, cx - 150, cx + 150, floorY - 170, floorY - 236, 100, 48, 'brass_rim');
    for (const side of [-1, 1]) {
      const tx = cx + side * 160;
      this.drawBox3D(ctx, camX, camY, tx - 18, floorY - 200, 100, 36, 200, 40, 'iron_truss');
      this.drawBox3D(ctx, camX, camY, tx - 26, floorY - 212, 96, 52, 14, 48, 'brass_rim');
      this.drawBox3D(ctx, camX, camY, tx - 26, floorY - 18, 96, 52, 18, 48, 'brass_rim');
    }
    this.drawGear3D(ctx, camX, camY, cx - 92, floorY - 150, 150, { r: 44, speed: 0.5, teeth: 12 }, time);
    this.drawGear3D(ctx, camX, camY, cx + 2, floorY - 118, 150, { r: 56, speed: -0.39, teeth: 14, phase: 0.22 }, time);
    this.drawGear3D(ctx, camX, camY, cx + 102, floorY - 156, 150, { r: 40, speed: 0.55, teeth: 11, phase: 0.6 }, time);
    this.drawBox3D(ctx, camX, camY, cx - 96, floorY - 12, 126, 192, 12, 44, 'wood_plank', { topTex: 'brass_rim' });
    this.drawBox3D(ctx, camX, camY, cx - 60, floorY - 22, 134, 120, 10, 36, 'wood_plank', { topTex: 'brass_rim' });
    const gp = project3D(cx, floorY - 60, 140, camX, camY);
    const glow = getGlowCanvas('amber');
    if (glow) {
      const pulse = 0.65 + 0.35 * Math.sin(time * 3.4);
      const r = 58 * gp.s;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5 * pulse;
      ctx.drawImage(glow, gp.x - r, gp.y - r, r * 2, r * 2);
      ctx.restore();
    }
  }

  /** Darkwood Boss Centerpiece: Ancient Hollow Elder-Tree Shrine & Bioluminescent Rune Altar! */
  drawBriarShrine3D(ctx, camX, camY, cx, floorY, time) {
    // Twin massive mossy root-pillars + vaulted elder-bark canopy arch
    this.drawArchSpan3D(ctx, camX, camY, cx - 136, cx + 136, floorY - 156, floorY - 236, 118, 46, 'elder_bark_h');
    for (const side of [-1, 1]) {
      const tx = cx + side * 144;
      this.drawBox3D(ctx, camX, camY, tx - 22, floorY - 196, 114, 44, 196, 42, 'elder_bark');
      this.drawBox3D(ctx, camX, camY, tx - 34, floorY - 28, 108, 68, 28, 52, 'elder_bark_h', { topTex: 'elder_bark_h' });
    }
    // Stepped moss-stone druidic dais + glowing heartwood crystal
    this.drawBox3D(ctx, camX, camY, cx - 68, floorY - 14, 126, 136, 14, 38, 'moss_stone');
    this.drawBox3D(ctx, camX, camY, cx - 42, floorY - 26, 132, 84, 12, 34, 'moss_stone');
    const gp = project3D(cx, floorY - 118, 142, camX, camY);
    const glow = getGlowCanvas('emerald');
    if (glow) {
      const pulse = 0.72 + 0.28 * Math.sin(time * 2.1);
      const r = 64 * gp.s;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55 * pulse;
      ctx.drawImage(glow, gp.x - r, gp.y - r, r * 2, r * 2);
      ctx.restore();
    }
  }

  /** Stage 7 Boss Centerpiece: Giant Backlit Texture-Mapped 3D Astronomical Rose-Clock! */
  drawAstronomicalClock3D(ctx, camX, camY, wx, wy, z, time) {
    const c = project3D(wx, wy, z, camX, camY);
    const R = 132 * c.s;
    if (c.x + R < 0 || c.x - R > W) return;

    ctx.save();
    const bg = ctx.createRadialGradient(c.x, c.y, R * 0.1, c.x, c.y, R * 1.15);
    bg.addColorStop(0, 'rgba(220, 232, 255, 0.42)');
    bg.addColorStop(0.65, 'rgba(130, 155, 225, 0.24)');
    bg.addColorStop(0.92, 'rgba(70, 55, 120, 0.18)');
    bg.addColorStop(1, 'rgba(10, 8, 20, 0)');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(c.x, c.y, R * 1.15, 0, Math.PI * 2); ctx.fill();

    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * Math.PI * 2, a1 = ((i + 1) / 12) * Math.PI * 2;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(165, 195, 255, 0.18)' : 'rgba(215, 155, 95, 0.14)';
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.arc(c.x, c.y, R * 0.92, a0 + 0.03, a1 - 0.03);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    // Texture-mapped 12-segment 3D iron & brass outer bezel ring + chapter ring
    const ironTex = this.tex('iron_rivet');
    const brassTex = this.tex('brass_rim');
    for (let i = 0; i < 12; i++) {
      const a0 = (i / 12) * Math.PI * 2, a1 = ((i + 1) / 12) * Math.PI * 2;
      const ca0 = Math.cos(a0), sa0 = Math.sin(a0), ca1 = Math.cos(a1), sa1 = Math.sin(a1);
      const o0 = project3D(wx + ca0 * 130, wy + sa0 * 130, z - 6, camX, camY);
      const o1 = project3D(wx + ca1 * 130, wy + sa1 * 130, z - 6, camX, camY);
      const i0 = project3D(wx + ca0 * 116, wy + sa0 * 116, z - 6, camX, camY);
      const i1 = project3D(wx + ca1 * 116, wy + sa1 * 116, z - 6, camX, camY);
      const sh = shadeOverlay32([ca0 * 0.4, sa0 * 0.4, -0.85], this.pal.fog, 0.34);
      texQuad(ctx, ironTex, o0, o1, i1, i0, i * 32, 0, (i + 1) * 32, 0, (i + 1) * 32, 16, i * 32, 16, sh);

      const c0 = project3D(wx + ca0 * 92, wy + sa0 * 92, z - 4, camX, camY);
      const c1 = project3D(wx + ca1 * 92, wy + sa1 * 92, z - 4, camX, camY);
      const ci0 = project3D(wx + ca0 * 85, wy + sa0 * 85, z - 4, camX, camY);
      const ci1 = project3D(wx + ca1 * 85, wy + sa1 * 85, z - 4, camX, camY);
      texQuad(ctx, brassTex, c0, c1, ci1, ci0, i * 24, 0, (i + 1) * 24, 0, (i + 1) * 24, 8, i * 24, 8, sh);

      // Mullion spoke
      ctx.strokeStyle = '#24283c'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ci0.x, ci0.y); ctx.lineTo(i0.x, i0.y); ctx.stroke();
    }

    // Central texture-mapped 3D brass escapement gear
    this.drawGear3D(ctx, camX, camY, wx, wy, z - 12, { r: 44, teeth: 12, thick: 14, speed: -0.35, brass: true }, time);

    // Texture-mapped 3D brass & iron minute & hour hands
    const drawHand3D = (ang, len, halfW, tex) => {
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const nx = -sa * halfW, ny = ca * halfW;
      const p0 = project3D(wx - ca * 18 + nx, wy - sa * 18 + ny, z - 24, camX, camY);
      const p1 = project3D(wx - ca * 18 - nx, wy - sa * 18 - ny, z - 24, camX, camY);
      const p2 = project3D(wx + ca * len - nx * 0.4, wy + sa * len - ny * 0.4, z - 24, camX, camY);
      const p3 = project3D(wx + ca * len + nx * 0.4, wy + sa * len + ny * 0.4, z - 24, camX, camY);
      texQuad(ctx, tex, p0, p1, p2, p3, 0, 0, 0, 8, len, 8, len, 0,
        shadeOverlay32([-0.3, -0.4, -0.85], this.pal.fog, 0.22));
    };
    drawHand3D(-Math.PI * 0.5 + time * 0.08, 108, 3.2, brassTex);
    drawHand3D(-Math.PI * 0.2 + time * 0.015, 74, 4.2, ironTex);
  }

  /** Stage 8 Boss Centerpiece: Texture-Mapped 3D Marble Throne Dais, Organ & Velvet Throne! */
  drawCountThroneApse3D(ctx, camX, camY, cx, floorY, time) {
    const rw = project3D(cx, floorY - 186, 185, camX, camY);
    const rr = 62 * rw.s;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(rw.x, rw.y, 4, rw.x, rw.y, rr * 1.3);
    g.addColorStop(0, 'rgba(235, 65, 85, 0.42)');
    g.addColorStop(0.65, 'rgba(145, 40, 120, 0.22)');
    g.addColorStop(1, 'rgba(20, 8, 30, 0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(rw.x, rw.y, rr * 1.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // 8-segment 3D stone rose-window surround
    const trimTex = this.tex('stone_trim');
    for (let i = 0; i < 8; i++) {
      const a0 = (i / 8) * Math.PI * 2, a1 = ((i + 1) / 8) * Math.PI * 2;
      const o0 = { x: rw.x + Math.cos(a0) * (rr + 4), y: rw.y + Math.sin(a0) * (rr + 4) };
      const o1 = { x: rw.x + Math.cos(a1) * (rr + 4), y: rw.y + Math.sin(a1) * (rr + 4) };
      const i0 = { x: rw.x + Math.cos(a0) * (rr - 3), y: rw.y + Math.sin(a0) * (rr - 3) };
      const i1 = { x: rw.x + Math.cos(a1) * (rr - 3), y: rw.y + Math.sin(a1) * (rr - 3) };
      texQuad(ctx, trimTex, o0, o1, i1, i0, i * 24, 0, (i + 1) * 24, 0, (i + 1) * 24, 8, i * 24, 8,
        shadeOverlay32([0, -0.3, -0.9], this.pal.fog, 0.48));
      const sp = a0 + time * 0.03;
      ctx.strokeStyle = '#2a1c2e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(rw.x, rw.y); ctx.lineTo(rw.x + Math.cos(sp) * rr, rw.y + Math.sin(sp) * rr); ctx.stroke();
    }

    // Twin carved-oak cathedral pipe-organ cases & gilded cylindrical organ pipes!
    for (const side of [-1, 1]) {
      const ox = cx + side * 145;
      this.drawBox3D(ctx, camX, camY, ox - 34, floorY - 72, 136, 68, 72, 26, 'wood_carved');
      this.drawBox3D(ctx, camX, camY, ox - 36, floorY - 76, 134, 72, 5, 30, 'brass_rim');
      for (let p = 0; p < 7; p++) {
        const ph = 78 + (3 - Math.abs(p - 3)) * 22;
        const px = ox - 28 + p * 9;
        this.drawBox3D(ctx, camX, camY, px, floorY - 76 - ph, 138, 7, ph, 10,
          'organ_pipe', { uFit: 8, vOrigin: floorY - 76 - 56 });
      }
    }

    // The Count's throne: generated obsidian-and-crimson throne on its own carved dais,
    // flanked by iron candle pillars and great heraldic banners (projected at depth).
    const A = this.assets;
    const sheet = A.info('throne_props') ? 'throne_props' : null;
    if (sheet) {
      const drawProp = (name, wx, wy, z, flip = false) => {
        const f = A.frame(sheet, name);
        const pr = project3D(wx, wy, z, camX, camY);
        const dw = f.w * pr.s, dh = f.h * pr.s;
        ctx.save();
        ctx.translate(Math.round(pr.x), Math.round(pr.y));
        if (flip) ctx.scale(-1, 1);
        ctx.drawImage(A.img(sheet), f.x, f.y, f.w, f.h, Math.round(-f.ax * pr.s), Math.round(-dh), Math.round(dw), Math.round(dh));
        ctx.restore();
        return pr;
      };
      drawProp('great_banner', cx - 112, floorY - 150, 150);
      drawProp('great_banner', cx + 112, floorY - 150, 150, true);
      drawProp('candle_pillar', cx - 86, floorY, 104);
      drawProp('candle_pillar', cx + 86, floorY, 104, true);
      const tp = drawProp('throne', cx, floorY + 2, 96);
      // Candle glows on the pillars and a crimson aura behind the throne crown
      const glowA = getGlowCanvas('amber');
      const glowC = getGlowCanvas('crimson');
      if (glowA) {
        for (const side of [-1, 1]) {
          const gp = project3D(cx + side * 86, floorY - 150, 104, camX, camY);
          const r = 26 * gp.s;
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 + 0.1 * Math.sin(time * 9 + side);
          ctx.drawImage(glowA, gp.x - r, gp.y - r, r * 2, r * 2); ctx.restore();
        }
      }
      if (glowC) {
        const f = A.frame(sheet, 'throne');
        const r = 54 * tp.s;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.28 + 0.08 * Math.sin(time * 1.7);
        ctx.drawImage(glowC, tp.x - r, tp.y - f.h * tp.s * 0.8 - r, r * 2, r * 2); ctx.restore();
      }
    } else {
      for (let s2 = 0; s2 < 3; s2++) {
        const w = 156 - s2 * 32, h = 10, y = floorY - s2 * 10;
        this.drawBox3D(ctx, camX, camY, cx - w / 2, y - h, 78 + s2 * 14, w, h, 34, 'marble');
      }
    }
  }

  /** Stage 2 Boss Centerpiece: Ring of Texture-Mapped 3D Harvest Rune Monoliths! */
  drawMonolithCircle3D(ctx, camX, camY, cx, floorY, time) {
    const stones = [-170, -95, 0, 95, 170];
    const depths = [88, 148, 178, 148, 88];
    const order = [2, 1, 3, 0, 4];
    for (const idx of order) {
      const sx = cx + stones[idx], sz = depths[idx];
      const h = idx === 2 ? 148 : 112 + (idx % 2) * 16;
      this.drawBox3D(ctx, camX, camY, sx - 15, floorY - h, sz, 30, h, 24, 'rune_stone');
      const rp = project3D(sx, floorY - h * 0.58, sz - 2, camX, camY);
      const pulse = 0.5 + 0.5 * Math.sin(time * 2.5 + idx);
      ctx.fillStyle = `rgba(255, 145, 45, ${(0.35 + 0.4 * pulse).toFixed(2)})`;
      ctx.fillRect(Math.round(rp.x - 2), Math.round(rp.y - 8), 4, 16);
      ctx.fillRect(Math.round(rp.x - 5), Math.round(rp.y - 2), 10, 3);
    }
  }

  /** Stage 3 Boss Centerpiece: Texture-Mapped 3D Stone & Timber Bell-Tower! */
  drawYuleBellTower3D(ctx, camX, camY, cx, floorY, time) {
    this.drawBox3D(ctx, camX, camY, cx - 48, floorY - 196, 130, 96, 196, 52, 'wall');
    this.drawBox3D(ctx, camX, camY, cx - 54, floorY - 204, 126, 108, 10, 60, 'wood_plank');
    this.drawArchSpan3D(ctx, camX, camY, cx - 32, cx + 32, floorY - 138, floorY - 184, 126, 58, 'stone_trim');
    this.drawGear3D(ctx, camX, camY, cx, floorY - 160, 142, { r: 28, teeth: 8, thick: 10, speed: 0.9, brass: false }, time);
  }

  /** Stage 4 Boss Centerpiece: Twin Texture-Mapped 3D Crenellated Watchtowers! */
  drawRampartBastion3D(ctx, camX, camY, cx, floorY) {
    this.drawArchSpan3D(ctx, camX, camY, cx - 120, cx + 120, floorY - 124, floorY - 168, 118, 38, 'stone_trim');
    for (const side of [-1, 1]) {
      const tx = cx + side * 150;
      this.drawBox3D(ctx, camX, camY, tx - 30, floorY - 186, 110, 60, 186, 48, 'wall');
      this.drawBox3D(ctx, camX, camY, tx - 34, floorY - 202, 106, 20, 16, 54, 'stone_trim');
      this.drawBox3D(ctx, camX, camY, tx + 14, floorY - 202, 106, 20, 16, 54, 'stone_trim');
    }
  }

  /** Stage 6 Boss Centerpiece: Texture-Mapped 3D Shattered Classical Temple! */
  drawPetrifiedTemple3D(ctx, camX, camY, cx, floorY) {
    const cols = [-150, -78, 78, 150];
    for (let i = 0; i < cols.length; i++) {
      const px = cx + cols[i];
      const broken = i === 1 ? 44 : 0;
      this.drawPillar3D(ctx, camX, camY, px, floorY - 166 + broken, floorY, 112, 24);
    }
    this.drawBox3D(ctx, camX, camY, cx - 166, floorY - 184, 108, 76, 18, 32, 'marble');
    this.drawBox3D(ctx, camX, camY, cx + 64, floorY - 184, 108, 102, 18, 32, 'marble');
  }

  /** Dark Cave Boss Centerpiece: Obsidian Caldera Arch & Glowing Magma Cascades! */
  drawVolcanicCaldera3D(ctx, camX, camY, cx, floorY, time) {
    this.drawArchSpan3D(ctx, camX, camY, cx - 146, cx + 146, floorY - 148, floorY - 216, 114, 46, 'cavernwall');
    const glow = getGlowCanvas('amber');
    for (const side of [-1, 1]) {
      const px = cx + side * 146;
      this.drawBox3D(ctx, camX, camY, px - 22, floorY - 178, 108, 44, 178, 42, 'cavernwall');
      // Glowing vertical magma cascade channel behind the arena
      const mTop = project3D(cx + side * 88, floorY - 170, 146, camX, camY);
      const mBot = project3D(cx + side * 88, floorY + 24, 146, camX, camY);
      const mw = Math.max(4, Math.round(14 * mTop.s));
      ctx.fillStyle = '#a82608';
      ctx.fillRect(Math.round(mTop.x - mw / 2), Math.round(mTop.y), mw, Math.round(mBot.y - mTop.y));
      const pulse = Math.round(((time * 42) % 16) * mTop.s);
      ctx.fillStyle = '#ffb438';
      for (let y = Math.round(mTop.y) + pulse; y < mBot.y - 6; y += Math.max(6, Math.round(16 * mTop.s))) {
        ctx.fillRect(Math.round(mTop.x - mw * 0.28), y, Math.max(2, Math.round(mw * 0.56)), Math.max(3, Math.round(8 * mTop.s)));
      }
      if (glow) {
        const gr = 38 * mBot.s;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.52 + 0.14 * Math.sin(time * 4 + side);
        ctx.drawImage(glow, mBot.x - gr, mBot.y - gr, gr * 2, gr * 2);
        ctx.restore();
      }
    }
  }

  // ============================================ FOREGROUND 2.5D FRAMING
  /**
   * Draws dark texture-mapped foreground framing pillars & arch corbels (`z = -72`,
   * ~1.23x parallax) that automatically fade down whenever the player or an active
   * threat is near, preserving 100% combat & platforming clarity.
   */
  drawForeground3D(ctx, cam, player, enemies, landmarks = null) {
    const camX = cam.rx, camY = cam.ry;
    const z = -72;
    const fgTex = this.tex(
      this.themeKey === 'darkwood'
        ? 'elder_bark'
        : this.themeKey === 'forest'
          ? 'bark'
          : (this.pal.crypt ? 'crypt_stone' : 'wall'),
    );
    const fgShade = shadeOverlay32([-0.3, -0.2, -0.9], this.pal.fog, 0.22, 0.28);

    for (const f of this.fgFrames) {
      const pTop = project3D(f.wx, f.wy - 250, z, camX, camY);
      const pBot = project3D(f.wx, f.wy + 40, z, camX, camY);
      if (pBot.x < -90 || pBot.x > W + 90) continue;

      let minDist = Math.abs(player.x - f.wx);
      for (const e of enemies) {
        if (e.alive) minDist = Math.min(minDist, Math.abs(e.x - f.wx));
      }
      if (landmarks) {
        for (const l of landmarks) {
          if (l && Number.isFinite(l.x)) minDist = Math.min(minDist, Math.abs(l.x - f.wx));
        }
      }
      const clearFade = Math.max(0.14, Math.min(0.76, (minDist - 48) / 116));
      const w = Math.round(24 * pBot.s);
      const xL = Math.round(pBot.x - w / 2), xR = xL + w;
      const springY = Math.max(48, Math.round(pTop.y + 42));

      ctx.save();
      ctx.globalAlpha = clearFade;

      // Texture-mapped foreground column shaft
      texQuad(
        ctx, fgTex,
        { x: xL, y: 0 }, { x: xR, y: 0 }, { x: xR, y: H }, { x: xL, y: H },
        0, 0, w, 0, w, H, 0, H, fgShade,
      );

      // Texture-mapped overhead foreground arch corbels curving left & right
      for (const dir of [-1, 1]) {
        const baseX = dir < 0 ? xL : xR;
        const segs = 3;
        for (let s = 0; s < segs; s++) {
          const t0 = s / segs, t1 = (s + 1) / segs;
          const ax0 = baseX + dir * (t0 * t0) * w * 2.1;
          const ax1 = baseX + dir * (t1 * t1) * w * 2.1;
          const ay0 = springY * (1 - t0);
          const ay1 = springY * (1 - t1);
          const q0 = dir < 0 ? { x: ax1, y: 0 } : { x: ax0, y: 0 };
          const q1 = dir < 0 ? { x: ax0, y: 0 } : { x: ax1, y: 0 };
          const q2 = dir < 0 ? { x: ax0, y: ay0 } : { x: ax1, y: ay1 };
          const q3 = dir < 0 ? { x: ax1, y: ay1 } : { x: ax0, y: ay0 };
          texQuad(ctx, fgTex, q0, q1, q2, q3, q0.x, 0, q1.x, 0, q2.x, q2.y, q3.x, q3.y, fgShade);
        }
      }

      // Subtle cold moonlit rim along the left edge
      ctx.fillStyle = 'rgba(148, 166, 198, 0.16)';
      ctx.fillRect(xL + 1, 0, 2, H);
      ctx.restore();
    }
  }

  // ============================================ REUSABLE TEXTURED 3D PRIMITIVES
  /**
   * Axis-aligned 3D box `(wx, wy, z)` of size `(w, h, d)`, backface-culled,
   * perspective-subdivided on receding faces, texture-mapped & Lambert-shaded.
   */
  drawBox3D(ctx, camX, camY, wx, wy, z, w, h, d, texKey = 'wall', opts = null) {
    const fTL = project3D(wx, wy, z, camX, camY);
    const fTR = project3D(wx + w, wy, z, camX, camY);
    if (fTR.x < -40 || fTL.x > W + 40) return;
    const fBL = project3D(wx, wy + h, z, camX, camY);
    const fBR = project3D(wx + w, wy + h, z, camX, camY);
    if (fBL.y < -40 || fTL.y > H + 40) return;

    const tex = this.tex(typeof texKey === 'string' ? texKey : 'wall');
    const topTex = (opts && opts.topTex) ? this.tex(opts.topTex) : tex;
    const bright = (opts && opts.bright) || 1;
    const fog = this.pal.fog;
    const fogAmt = clamp01((z - 15) / 360) * 0.68;

    const u0 = (opts && opts.uFit) ? 0 : wx;
    const u1 = (opts && opts.uFit) ? opts.uFit : wx + w;
    const vBase = (opts && opts.vOrigin != null) ? (wy - opts.vOrigin) : wy;
    const v0 = (opts && opts.vFit) ? 0 : vBase;
    const v1 = (opts && opts.vFit) ? opts.vFit : vBase + h;
    const proj = (px, py, pz) => project3D(px, py, pz, camX, camY);

    const bTL = project3D(wx, wy, z + d, camX, camY);
    const bTR = project3D(wx + w, wy, z + d, camX, camY);
    const bBL = project3D(wx, wy + h, z + d, camX, camY);

    // 1. Top or bottom receding face
    if (bTL.y < fTL.y - 0.4) {
      const tv0 = (opts && opts.vFit) ? 0 : z + d;
      const tv1 = (opts && opts.vFit) ? opts.vFit : z;
      texQuadSubZ(
        ctx, topTex, proj,
        { x: wx, y: wy, z: z + d }, { x: wx + w, y: wy, z: z + d },
        { x: wx + w, y: wy, z }, { x: wx, y: wy, z },
        u0, tv0, u1, tv0, u1, tv1, u0, tv1,
        shadeOverlay32([0, -1, -0.2], fog, fogAmt, bright),
        d > 28 ? 2 : 1,
      );
    } else if (bBL.y > fBL.y + 0.4) {
      texQuadSubZ(
        ctx, topTex, proj,
        { x: wx, y: wy + h, z }, { x: wx + w, y: wy + h, z },
        { x: wx + w, y: wy + h, z: z + d }, { x: wx, y: wy + h, z: z + d },
        u0, z, u1, z, u1, z + d, u0, z + d,
        shadeOverlay32([0, 1, -0.2], fog, fogAmt, bright * 0.85),
        d > 28 ? 2 : 1,
      );
    }

    // 2. Left or right receding side face (vertical stone courses match front face!)
    const suSpan = (opts && opts.uFit) ? opts.uFit : d;
    const vSlices = (h > 130 && d > 18) ? Math.min(3, Math.ceil(h / 130)) : 1;
    if (bTL.x < fTL.x - 0.4) {
      const shL = shadeOverlay32([-1, 0, -0.2], fog, fogAmt, bright);
      for (let s = 0; s < vSlices; s++) {
        const t0 = s / vSlices, t1 = (s + 1) / vSlices;
        const sy0 = wy + h * t0, sy1 = wy + h * t1 + (s < vSlices - 1 ? 0.6 : 0);
        const sv0 = v0 + (v1 - v0) * t0, sv1 = v0 + (v1 - v0) * t1;
        texQuad(
          ctx, tex,
          proj(wx, sy0, z + d), proj(wx, sy0, z), proj(wx, sy1, z), proj(wx, sy1, z + d),
          u0 - suSpan, sv0, u0, sv0, u0, sv1, u0 - suSpan, sv1, shL,
        );
      }
    } else if (bTR.x > fTR.x + 0.4) {
      const shR = shadeOverlay32([1, 0, -0.2], fog, fogAmt, bright);
      for (let s = 0; s < vSlices; s++) {
        const t0 = s / vSlices, t1 = (s + 1) / vSlices;
        const sy0 = wy + h * t0, sy1 = wy + h * t1 + (s < vSlices - 1 ? 0.6 : 0);
        const sv0 = v0 + (v1 - v0) * t0, sv1 = v0 + (v1 - v0) * t1;
        texQuad(
          ctx, tex,
          proj(wx + w, sy0, z), proj(wx + w, sy0, z + d), proj(wx + w, sy1, z + d), proj(wx + w, sy1, z),
          u1, sv0, u1 + suSpan, sv0, u1 + suSpan, sv1, u1, sv1, shR,
        );
      }
    }

    // 3. Front face (exact screen-space rectangle -> hits fast 1-draw parallelogram path!)
    texQuad(
      ctx, tex, fTL, fTR, fBR, fBL,
      u0, v0, u1, v0, u1, v1, u0, v1,
      shadeOverlay32([0, -0.15, -1], fog, fogAmt, bright),
    );
  }

  /** Extruded & texture-mapped 3D stone arch lintel with curved intrados soffit! */
  drawArchSpan3D(ctx, camX, camY, x0, x1, ySpring, yTop, z, d, texKey = 'stone_trim') {
    const pL = project3D(x0, yTop, z, camX, camY);
    const pR = project3D(x1, yTop, z, camX, camY);
    if (pR.x < -40 || pL.x > W + 40) return;
    const segs = 8;
    const span = x1 - x0;
    const archH = (ySpring - yTop) * 0.68;
    const fog = this.pal.fog;
    const fogAmt = clamp01((z - 15) / 360) * 0.68;
    const tex = this.tex(typeof texKey === 'string' ? texKey : 'stone_trim');
    const frontShade = shadeOverlay32([0, -0.15, -1], fog, fogAmt);

    // Pass 1: Curved 3D intrados soffits (z -> z + d) drawn first so they never overlap z front spandrels
    let arcU = 0;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const ax0 = x0 + span * t0, ax1 = x0 + span * t1;
      const ay0 = ySpring - Math.sin(t0 * Math.PI) * archH;
      const ay1 = ySpring - Math.sin(t1 * Math.PI) * archH;
      const segLen = Math.hypot(ax1 - ax0, ay1 - ay0);

      const f0 = project3D(ax0, ay0, z, camX, camY);
      const f1 = project3D(ax1, ay1, z, camX, camY);
      const b1 = project3D(ax1, ay1, z + d, camX, camY);
      const b0 = project3D(ax0, ay0, z + d, camX, camY);
      const nx = Math.cos(((t0 + t1) * 0.5) * Math.PI) * 0.6;
      const soffitShade = shadeOverlay32([nx, 0.8, -0.2], fog, fogAmt + 0.08);
      texQuad(ctx, tex, f0, f1, b1, b0, arcU, 0, arcU + segLen, 0, arcU + segLen, d, arcU, d, soffitShade);
      arcU += segLen;
    }

    // Pass 2: Front spandrel masonry segments at z (continuous world-aligned UVs!)
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const ax0 = x0 + span * t0, ax1 = x0 + span * t1;
      const ay0 = ySpring - Math.sin(t0 * Math.PI) * archH;
      const ay1 = ySpring - Math.sin(t1 * Math.PI) * archH;
      const padX = i < segs - 1 ? 0.5 : 0;
      const f0 = project3D(ax0, ay0, z, camX, camY);
      const ft0 = project3D(ax0, yTop, z, camX, camY);
      const ft1 = project3D(ax1 + padX, yTop, z, camX, camY);
      const ff1 = project3D(ax1 + padX, ay1, z, camX, camY);
      texQuad(ctx, tex, ft0, ft1, ff1, f0, ax0, yTop, ax1, yTop, ax1, ay1, ax0, ay0, frontShade);
    }
  }

  // ============================================ PROCEDURAL PLANE TEXTURES
  getPlaneTexture(kind) {
    if (this.planeCache.has(kind)) return this.planeCache.get(kind);
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const g = c.getContext('2d');

    if (kind === 'courtyard') {
      g.fillStyle = '#1d2036'; g.fillRect(0, 0, 512, 128);
      for (let y = 0; y < 128; y += 16) {
        const off = ((y >> 4) & 1) * 16;
        for (let x = -16; x < 512; x += 32) {
          const v = ((x * 13 + y * 7) & 3);
          g.fillStyle = ['#252a44', '#2c3352', '#1f243b', '#31395a'][v];
          g.fillRect(x + off + 1, y + 1, 30, 14);
          g.fillStyle = '#3d476c';
          g.fillRect(x + off + 1, y + 1, 30, 2);
        }
      }
      g.fillStyle = '#101830'; g.fillRect(0, 48, 512, 20);
      g.fillStyle = '#29406c'; g.fillRect(0, 52, 512, 4);
    } else if (kind === 'ice') {
      g.fillStyle = '#1b2b4a'; g.fillRect(0, 0, 512, 128);
      for (let i = 0; i < 90; i++) {
        const x = (i * 73) % 512, y = (i * 29) % 128, w = 24 + (i % 5) * 18;
        g.fillStyle = i % 3 === 0 ? '#2b436e' : '#22365c';
        g.fillRect(x, y, w, 3);
        if (x + w > 512) g.fillRect(x - 512, y, w, 3);
      }
      for (let i = 0; i < 40; i++) {
        const x = (i * 97) % 512, y = (i * 41) % 128;
        g.fillStyle = '#6e94c8';
        g.fillRect(x, y, 14, 1);
      }
    } else if (kind === 'magma') {
      g.fillStyle = '#1c0505'; g.fillRect(0, 0, 512, 128);
      for (let i = 0; i < 96; i++) {
        const x = (i * 67) % 512, y = (i * 29) % 128, w = 18 + (i % 5) * 16;
        g.fillStyle = ['#4a0d08', '#8c2208', '#d94e14', '#2b0808'][i & 3];
        g.fillRect(x, y, w, 4);
        if (x + w > 512) g.fillRect(x - 512, y, w, 4);
      }
      for (let i = 0; i < 36; i++) {
        g.fillStyle = i % 2 === 0 ? '#ffd858' : '#ff8c24';
        g.fillRect((i * 107) % 512, (i * 43) % 128, 12, 2);
      }
    } else if (kind === 'abyss' || kind === 'crypt_pit') {
      const oss = kind === 'abyss';
      g.fillStyle = oss ? '#08131e' : '#0b0914'; g.fillRect(0, 0, 512, 128);
      for (let i = 0; i < 80; i++) {
        const x = (i * 67) % 512, y = (i * 31) % 128, w = 20 + (i % 4) * 16;
        g.fillStyle = oss
          ? (i % 3 === 0 ? '#1b4a56' : '#122c3c')
          : (i % 3 === 0 ? '#241c34' : '#171224');
        g.fillRect(x, y, w, 4);
        if (x + w > 512) g.fillRect(x - 512, y, w, 4);
      }
      if (oss) {
        for (let i = 0; i < 28; i++) {
          g.fillStyle = '#4ad2b4';
          g.fillRect((i * 113) % 512, (i * 47) % 128, 8, 2);
        }
      }
    } else if (kind === 'darkwood') {
      g.fillStyle = '#091519'; g.fillRect(0, 0, 512, 128);
      for (let i = 0; i < 110; i++) {
        const x = (i * 53) % 512, y = (i * 37) % 128, w = 14 + (i % 5) * 12;
        g.fillStyle = ['#112828', '#173832', '#0d2024', '#1f4a3e'][i & 3];
        g.fillRect(x, y, w, 3);
        if (x + w > 512) g.fillRect(x - 512, y, w, 3);
      }
      // Misty bioluminescent forest stream & glowing moss flecks
      g.fillStyle = '#0c2630'; g.fillRect(0, 44, 512, 26);
      for (let i = 0; i < 36; i++) {
        g.fillStyle = i % 3 === 0 ? '#6ef7c8' : '#2a8f78';
        g.fillRect((i * 89) % 512, 46 + (i * 19) % 22, 10, 2);
      }
    } else if (kind === 'forest') {
      g.fillStyle = '#1a131c'; g.fillRect(0, 0, 512, 128);
      for (let i = 0; i < 120; i++) {
        const x = (i * 59) % 512, y = (i * 37) % 128, w = 10 + (i % 4) * 8;
        g.fillStyle = ['#3a221c', '#58301e', '#2a1c24', '#743e22'][i & 3];
        g.fillRect(x, y, w, 3);
      }
    } else {
      g.fillStyle = '#151428'; g.fillRect(0, 0, 512, 128);
      for (let i = 0; i < 100; i++) {
        const x = (i * 61) % 512, y = (i * 43) % 128, w = 16 + (i % 4) * 12;
        g.fillStyle = ['#1f1e38', '#272646', '#191830', '#2f3154'][i & 3];
        g.fillRect(x, y, w, 4);
      }
    }
    this.planeCache.set(kind, c);
    return c;
  }
}

// =========================================================== HELPERS
function norm3(x, y, z) {
  const m = Math.hypot(x, y, z) || 1;
  return [x / m, y / m, z / m];
}

function rotY(x, y, z, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: x * c + z * s, y, z: -x * s + z * c };
}

function quadNormal(a, b, c) {
  const ux = b.wx - a.wx, uy = b.wy - a.wy, uz = b.wz - a.wz;
  const vx = c.wx - a.wx, vy = c.wy - a.wy, vz = c.wz - a.wz;
  return norm3(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
}

/**
 * Quantized 32-bit palette shader: directional Lambert dot product snapped to
 * 6 crisp value bands and blended toward atmospheric fog.
 */
export function shade32(rgb, n, fogRgb, fogAmt = 0) {
  const dot = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
  const bands = [0.34, 0.48, 0.64, 0.80, 0.96, 1.14];
  const k = bands[Math.min(5, Math.floor(dot * 5.99))];
  const r = Math.round((rgb[0] * k) * (1 - fogAmt) + fogRgb[0] * fogAmt);
  const g = Math.round((rgb[1] * k) * (1 - fogAmt) + fogRgb[1] * fogAmt);
  const b = Math.round((rgb[2] * k) * (1 - fogAmt) + fogRgb[2] * fogAmt);
  return `rgb(${clampByte(r)}, ${clampByte(g)}, ${clampByte(b)})`;
}

function clampByte(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function mod(a, n) { return ((a % n) + n) % n; }
function rgbA(rgb, a) { return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${clamp01(a).toFixed(3)})`; }

export function fillQuad(ctx, a, b, c, d) {
  ctx.beginPath();
  ctx.moveTo(Math.round(a.x), Math.round(a.y));
  ctx.lineTo(Math.round(b.x), Math.round(b.y));
  ctx.lineTo(Math.round(c.x), Math.round(c.y));
  ctx.lineTo(Math.round(d.x), Math.round(d.y));
  ctx.closePath();
  ctx.fill();
}

export function fillTri(ctx, a, b, c) {
  ctx.beginPath();
  ctx.moveTo(Math.round(a.x), Math.round(a.y));
  ctx.lineTo(Math.round(b.x), Math.round(b.y));
  ctx.lineTo(Math.round(c.x), Math.round(c.y));
  ctx.closePath();
  ctx.fill();
}
