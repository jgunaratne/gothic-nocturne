// 32-bit style affine polygon texture mapper & pixel-art 3D material bank.
// Maps crisp nearest-neighbor pixel-art textures (built from the game's PNG
// sheets and matching procedural pixel materials) onto projected 3D triangles
// and perspective-subdivided quads with quantized Lambert lighting & depth fog.

import {
  W, H, TILE,
  T_GROUND, T_STONE, T_CATACOMB, T_CLOCK, T_FOREST, T_SNOW, T_DARKWOOD, T_CAVERN,
} from '../engine/constants.js';

export const LIGHT = norm3(-0.52, -0.61, -0.60); // cold moonlight from upper-left-front

const _domMat = typeof DOMMatrix !== 'undefined'
  ? new DOMMatrix()
  : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

const _bankCache = new WeakMap();
const _shadeCache = new Map();
const _glowCache = new Map();
const NO_SHADE = Object.freeze({ dark: null, spec: null });

/** Forged (Castle Forge) terrain materials: tile id -> { strip, overhang, sideBg }. */
const FORGED_MATERIALS = new Map();
const _banks = new Set();

/**
 * Registers a generated terrain strip as a 3D material so forged wings get
 * matching top decks and step side-returns. Safe to call before or after any
 * texture bank exists.
 */
export function registerForgedMaterial(tileId, stripName, { overhang = 4, sideBg = '#100e1c' } = {}) {
  FORGED_MATERIALS.set(tileId, { strip: stripName, overhang, sideBg });
  for (const bank of _banks) bank.buildForgedMaterial(tileId);
}

const GLOW_STOPS = {
  flame: ['rgba(255, 195, 95, 0.85)', 'rgba(255, 140, 50, 0.30)', 'rgba(255, 110, 35, 0)'],
  emerald: ['rgba(110, 255, 195, 0.85)', 'rgba(38, 190, 140, 0.32)', 'rgba(18, 110, 90, 0)'],
  amber: ['rgba(255, 175, 70, 0.85)', 'rgba(225, 105, 30, 0.30)', 'rgba(160, 60, 15, 0)'],
  crimson: ['rgba(245, 70, 92, 0.82)', 'rgba(155, 35, 95, 0.30)', 'rgba(40, 10, 35, 0)'],
  ice: ['rgba(185, 232, 255, 0.82)', 'rgba(105, 175, 245, 0.30)', 'rgba(40, 90, 170, 0)'],
  violet: ['rgba(195, 140, 255, 0.82)', 'rgba(120, 70, 210, 0.30)', 'rgba(45, 20, 95, 0)'],
};

/** Returns a cached 64x64 radial glow canvas for fast additive `drawImage` blits. */
export function getGlowCanvas(kind = 'flame') {
  if (typeof document === 'undefined') return null;
  let c = _glowCache.get(kind);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const stops = GLOW_STOPS[kind] || GLOW_STOPS.flame;
  const gr = g.createRadialGradient(32, 32, 1.5, 32, 32, 31);
  gr.addColorStop(0, stops[0]);
  gr.addColorStop(0.48, stops[1]);
  gr.addColorStop(1, stops[2]);
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  _glowCache.set(kind, c);
  return c;
}

/** Returns (and lazily builds once per Assets instance) the 3D texture bank. */
export function getTexBank(assets) {
  if (!assets || typeof document === 'undefined') return null;
  let bank = _bankCache.get(assets);
  if (!bank) {
    bank = new TextureBank3D(assets);
    _bankCache.set(assets, bank);
  }
  return bank;
}

/**
 * Computes a single-pass lighting + atmospheric fog overlay for a textured 3D
 * polygon so `C_out = (1 - fogAmt) * k * C_tex + fogAmt * C_fog` without extra
 * offscreen buffers or blend-mode state thrashing. Cached by quantized inputs.
 */
export function shadeOverlay32(n, fogRgb, fogAmt = 0, brightnessScale = 1) {
  const dot = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
  const bandIdx = Math.min(5, Math.floor(dot * 5.99));
  const fq = Math.max(0, Math.min(64, Math.round(fogAmt * 64)));
  const bq = Math.max(0, Math.min(128, Math.round(brightnessScale * 64)));
  const key = `${bandIdx}|${fogRgb[0]},${fogRgb[1]},${fogRgb[2]}|${fq}|${bq}`;
  const hit = _shadeCache.get(key);
  if (hit) return hit;

  const bands = [0.46, 0.58, 0.72, 0.86, 1.00, 1.15];
  const k = bands[bandIdx] * (bq / 64);
  const f = fq / 64;

  let res;
  if (k <= 1) {
    const alpha = clamp01(1 - (1 - f) * k);
    if (alpha < 0.015) {
      res = NO_SHADE;
    } else {
      const wFog = f;
      const wShad = (1 - f) * (1 - k);
      const r = clampByte(Math.round((wFog * fogRgb[0] + wShad * 5) / alpha));
      const g = clampByte(Math.round((wFog * fogRgb[1] + wShad * 4) / alpha));
      const b = clampByte(Math.round((wFog * fogRgb[2] + wShad * 14) / alpha));
      res = { dark: `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`, spec: null };
    }
  } else {
    const dark = f > 0.015
      ? `rgba(${fogRgb[0]}, ${fogRgb[1]}, ${fogRgb[2]}, ${f.toFixed(3)})`
      : null;
    const specA = clamp01((k - 1) * (1 - f) * 0.52);
    const spec = specA > 0.015 ? `rgba(215, 228, 255, ${specA.toFixed(3)})` : null;
    res = (!dark && !spec) ? NO_SHADE : { dark, spec };
  }
  if (_shadeCache.size < 4096) _shadeCache.set(key, res);
  return res;
}

/** Sets `tex.pattern`'s affine transform mapping `(u0,v0..u2,v2)` -> `(p0..p2)`. */
function applyTriTransform(tex, p0, p1, p2, u0, v0, u1, v1, u2, v2) {
  const dx1 = p1.x - p0.x, dy1 = p1.y - p0.y;
  const dx2 = p2.x - p0.x, dy2 = p2.y - p0.y;
  if (Math.abs(dx1 * dy2 - dx2 * dy1) < 0.30) return false;

  const du1 = u1 - u0, dv1 = v1 - v0;
  const du2 = u2 - u0, dv2 = v2 - v0;
  const det = du1 * dv2 - du2 * dv1;
  if (Math.abs(det) < 1e-4) return false;
  const inv = 1 / det;

  const a = (dx1 * dv2 - dx2 * dv1) * inv;
  const c = (du1 * dx2 - du2 * dx1) * inv;
  const b = (dy1 * dv2 - dy2 * dv1) * inv;
  const d = (du1 * dy2 - du2 * dy1) * inv;
  const wu0 = mod(u0, tex.w);
  const wv0 = mod(v0, tex.h);
  _domMat.a = a; _domMat.b = b; _domMat.c = c;
  _domMat.d = d;
  _domMat.e = p0.x - a * wu0 - c * wv0;
  _domMat.f = p0.y - b * wu0 - d * wv0;
  tex.pattern.setTransform(_domMat);
  return true;
}

/**
 * Renders an affine texture-mapped 3D triangle with crisp nearest-neighbor
 * texels and optional Lambert/fog overlay.
 */
export function texTri(ctx, tex, p0, p1, p2, u0, v0, u1, v1, u2, v2, shade = null, pad = 0.42) {
  if (!tex || !tex.pattern) return;
  const minX = Math.min(p0.x, p1.x, p2.x), maxX = Math.max(p0.x, p1.x, p2.x);
  if (maxX < -8 || minX > W + 8) return;
  const minY = Math.min(p0.y, p1.y, p2.y), maxY = Math.max(p0.y, p1.y, p2.y);
  if (maxY < -8 || minY > H + 8) return;

  if (!applyTriTransform(tex, p0, p1, p2, u0, v0, u1, v1, u2, v2)) return;

  let x0 = p0.x, y0 = p0.y, x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
  if (pad > 0) {
    const cx = (x0 + x1 + x2) / 3, cy = (y0 + y1 + y2) / 3;
    const d0 = Math.hypot(x0 - cx, y0 - cy) || 1;
    const d1 = Math.hypot(x1 - cx, y1 - cy) || 1;
    const d2 = Math.hypot(x2 - cx, y2 - cy) || 1;
    x0 += ((x0 - cx) / d0) * pad; y0 += ((y0 - cy) / d0) * pad;
    x1 += ((x1 - cx) / d1) * pad; y1 += ((y1 - cy) / d1) * pad;
    x2 += ((x2 - cx) / d2) * pad; y2 += ((y2 - cy) / d2) * pad;
  }

  ctx.fillStyle = tex.pattern;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.closePath();
  ctx.fill();

  if (shade && (shade.dark || shade.spec)) {
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.closePath();
    if (shade.dark) { ctx.fillStyle = shade.dark; ctx.fill(); }
    if (shade.spec) { ctx.fillStyle = shade.spec; ctx.fill(); }
  }
}

/**
 * Renders a texture-mapped 3D quad `(p0, p1, p2, p3)` with UVs `(u0,v0..u3,v3)`:
 * - Uses a single-draw fast path when the screen quad is a parallelogram.
 * - Otherwise splits into two triangles with an inner-diagonal overlap (zero
 *   seam) followed by a single 4-vertex lighting/fog pass (zero double-alpha).
 */
export function texQuad(ctx, tex, p0, p1, p2, p3, u0, v0, u1, v1, u2, v2, u3, v3, shade = null) {
  if (!tex || !tex.pattern) return;
  const minX = Math.min(p0.x, p1.x, p2.x, p3.x), maxX = Math.max(p0.x, p1.x, p2.x, p3.x);
  if (maxX < -8 || minX > W + 8 || maxX - minX < 0.45) return;
  const minY = Math.min(p0.y, p1.y, p2.y, p3.y), maxY = Math.max(p0.y, p1.y, p2.y, p3.y);
  if (maxY < -8 || minY > H + 8 || maxY - minY < 0.45) return;

  const isParallelogram =
    Math.abs((p1.x - p0.x) - (p2.x - p3.x)) < 0.65 &&
    Math.abs((p1.y - p0.y) - (p2.y - p3.y)) < 0.65 &&
    Math.abs((u1 - u0) - (u2 - u3)) < 0.1 &&
    Math.abs((v1 - v0) - (v2 - v3)) < 0.1;

  if (isParallelogram) {
    if (!applyTriTransform(tex, p0, p1, p3, u0, v0, u1, v1, u3, v3)) return;
    ctx.fillStyle = tex.pattern;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.closePath();
    ctx.fill();
    if (shade) {
      if (shade.dark) { ctx.fillStyle = shade.dark; ctx.fill(); }
      if (shade.spec) { ctx.fillStyle = shade.spec; ctx.fill(); }
    }
    return;
  }

  // Nudge shared diagonal (p0 -> p2) slightly toward p3 on Triangle 1 so the
  // opaque texture pass has zero anti-aliased gap along the interior diagonal.
  const ex = p2.x - p0.x, ey = p2.y - p0.y;
  const el = Math.hypot(ex, ey) || 1;
  let nx = -ey / el, ny = ex / el;
  if (nx * (p3.x - p0.x) + ny * (p3.y - p0.y) < 0) { nx = -nx; ny = -ny; }

  let drew = false;
  if (applyTriTransform(tex, p0, p1, p2, u0, v0, u1, v1, u2, v2)) {
    ctx.fillStyle = tex.pattern;
    ctx.beginPath();
    ctx.moveTo(p0.x + nx * 0.72, p0.y + ny * 0.72);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x + nx * 0.72, p2.y + ny * 0.72);
    ctx.closePath();
    ctx.fill();
    drew = true;
  }
  if (applyTriTransform(tex, p0, p2, p3, u0, v0, u2, v2, u3, v3)) {
    ctx.fillStyle = tex.pattern;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.closePath();
    ctx.fill();
    drew = true;
  }
  if (drew && shade && (shade.dark || shade.spec)) {
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.closePath();
    if (shade.dark) { ctx.fillStyle = shade.dark; ctx.fill(); }
    if (shade.spec) { ctx.fillStyle = shade.spec; ctx.fill(); }
  }
}

/**
 * Perspective-subdivided 3D quad for surfaces receding across depth (`v0..v3` in
 * 3D world space). Subdivides along the `0->3` / `1->2` axis into `steps`
 * strips (overlapping opaque inner seams by 0.55px) and applies `shade` once
 * over the full outer quad.
 */
export function texQuadSubZ(
  ctx, tex, projFn,
  v0, v1, v2, v3,
  u0, tv0, u1, tv1, u2, tv2, u3, tv3,
  shade = null, steps = 2,
) {
  if (!tex || !tex.pattern) return;
  const p0 = projFn(v0.x, v0.y, v0.z);
  const p1 = projFn(v1.x, v1.y, v1.z);
  const p2 = projFn(v2.x, v2.y, v2.z);
  const p3 = projFn(v3.x, v3.y, v3.z);
  const minX = Math.min(p0.x, p1.x, p2.x, p3.x), maxX = Math.max(p0.x, p1.x, p2.x, p3.x);
  if (maxX < -8 || minX > W + 8 || maxX - minX < 0.45) return;
  const minY = Math.min(p0.y, p1.y, p2.y, p3.y), maxY = Math.max(p0.y, p1.y, p2.y, p3.y);
  if (maxY < -8 || minY > H + 8 || maxY - minY < 0.45) return;

  if (steps <= 1) {
    texQuad(ctx, tex, p0, p1, p2, p3, u0, tv0, u1, tv1, u2, tv2, u3, tv3, shade);
    return;
  }

  let aL = p0, aR = p1;
  let au0 = u0, av0 = tv0, au1 = u1, av1 = tv1;
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const bL = s === steps ? p3 : projFn(
      v0.x + (v3.x - v0.x) * t, v0.y + (v3.y - v0.y) * t, v0.z + (v3.z - v0.z) * t,
    );
    const bR = s === steps ? p2 : projFn(
      v1.x + (v2.x - v1.x) * t, v1.y + (v2.y - v1.y) * t, v1.z + (v2.z - v1.z) * t,
    );
    const bu0 = u0 + (u3 - u0) * t, bv0 = tv0 + (tv3 - tv0) * t;
    const bu1 = u1 + (u2 - u1) * t, bv1 = tv1 + (tv2 - tv1) * t;

    // Slight overlap toward next strip so adjacent perspective strips never crack
    let cL = bL, cR = bR;
    if (s < steps) {
      const dxL = bL.x - aL.x, dyL = bL.y - aL.y, lL = Math.hypot(dxL, dyL) || 1;
      const dxR = bR.x - aR.x, dyR = bR.y - aR.y, lR = Math.hypot(dxR, dyR) || 1;
      cL = { x: bL.x + (dxL / lL) * 0.55, y: bL.y + (dyL / lL) * 0.55 };
      cR = { x: bR.x + (dxR / lR) * 0.55, y: bR.y + (dyR / lR) * 0.55 };
    }
    texQuad(ctx, tex, aL, aR, cR, cL, au0, av0, au1, av1, bu1, bv1, bu0, bv0, null);
    aL = bL; aR = bR;
    au0 = bu0; av0 = bv0; au1 = bu1; av1 = bv1;
  }

  if (shade && (shade.dark || shade.spec)) {
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.closePath();
    if (shade.dark) { ctx.fillStyle = shade.dark; ctx.fill(); }
    if (shade.spec) { ctx.fillStyle = shade.spec; ctx.fill(); }
  }
}

/**
 * Renders a horizontal receding plane (`y = wy`, spanning world `x0..x1` across
 * depth `z0 -> z1` with texture `v0 -> v1` and `u = wx`) using `strips` thin
 * horizontal perspective bands. Because screen `y` and horizontal scale `s(z)`
 * are constant along every horizontal scanline of a level plane, each band sets
 * `b = 0, c = 0, a = s(zMid)` — eliminating diagonal affine triangle swimming
 * completely while filling the entire `[x0, x1]` width in 1 quad per band!
 */
export function texStripZ(
  ctx, tex, camX, camY,
  x0, x1, wy, z0, z1, v0, v1,
  shade = null, strips = 3,
  focal = 380, eyeX = W * 0.5, eyeY = 144,
) {
  if (!tex || !tex.pattern || x1 <= x0) return;
  const s0 = focal / Math.max(40, focal + z0);
  const s1 = focal / Math.max(40, focal + z1);
  const o0L = eyeX + (x0 - camX - eyeX) * s0, o0R = eyeX + (x1 - camX - eyeX) * s0;
  const o1L = eyeX + (x0 - camX - eyeX) * s1, o1R = eyeX + (x1 - camX - eyeX) * s1;
  const minX = Math.min(o0L, o1L), maxX = Math.max(o0R, o1R);
  if (maxX < -8 || minX > W + 8) return;
  const oy0 = eyeY + (wy - camY - eyeY) * s0;
  const oy1 = eyeY + (wy - camY - eyeY) * s1;
  const minY = Math.min(oy0, oy1), maxY = Math.max(oy0, oy1);
  if (maxY < -8 || minY > H + 8 || maxY - minY < 0.45) return;

  const n = Math.max(1, strips);
  const uCenter = mod(camX + eyeX, tex.w);
  let prevZa = z0, prevSa = s0, prevYa = oy0, prevVa = v0;
  let prevLa = o0L, prevRa = o0R;

  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const zb = z0 + (z1 - z0) * t;
    const sb = focal / Math.max(40, focal + zb);
    const yb = eyeY + (wy - camY - eyeY) * sb;
    const vb = v0 + (v1 - v0) * t;
    const lb = eyeX + (x0 - camX - eyeX) * sb;
    const rb = eyeX + (x1 - camX - eyeX) * sb;

    const dy = yb - prevYa;
    const dv = vb - prevVa;
    if (Math.abs(dy) >= 0.25 && Math.abs(dv) >= 1e-4) {
      const zMid = (prevZa + zb) * 0.5;
      const a = focal / Math.max(40, focal + zMid);
      const d = dy / dv;
      const wv0 = mod(prevVa, tex.h);
      _domMat.a = a; _domMat.b = 0; _domMat.c = 0; _domMat.d = d;
      _domMat.e = eyeX - a * uCenter;
      _domMat.f = prevYa - d * wv0;
      tex.pattern.setTransform(_domMat);

      const padY = i < n ? (dy >= 0 ? 0.55 : -0.55) : 0;
      ctx.fillStyle = tex.pattern;
      ctx.beginPath();
      ctx.moveTo(prevLa, prevYa);
      ctx.lineTo(prevRa, prevYa);
      ctx.lineTo(rb, yb + padY);
      ctx.lineTo(lb, yb + padY);
      ctx.closePath();
      ctx.fill();
    }
    prevZa = zb; prevSa = sb; prevYa = yb; prevVa = vb;
    prevLa = lb; prevRa = rb;
  }

  if (shade && (shade.dark || shade.spec)) {
    ctx.beginPath();
    ctx.moveTo(o0L, oy0);
    ctx.lineTo(o0R, oy0);
    ctx.lineTo(o1R, oy1);
    ctx.lineTo(o1L, oy1);
    ctx.closePath();
    if (shade.dark) { ctx.fillStyle = shade.dark; ctx.fill(); }
    if (shade.spec) { ctx.fillStyle = shade.spec; ctx.fill(); }
  }
}

// ================================================== 3D PIXEL-ART TEXTURE BANK
class TextureBank3D {
  constructor(assets) {
    this.assets = assets;
    this.map = new Map();
    this.wheelCache = new Map();
    const patCtx = makeCanvas(4, 4).g;
    this._patCtx = patCtx;
    this.buildAll();
    for (const id of FORGED_MATERIALS.keys()) this.buildForgedMaterial(id);
    _banks.add(this);
  }

  /** Builds (or rebuilds) the top/side textures for a forged material tile id. */
  buildForgedMaterial(tileId) {
    const m = FORGED_MATERIALS.get(tileId);
    if (!m || !this.assets.img(m.strip)) return;
    this.buildStripPair(m.strip, `top_forge${tileId}`, `side_forge${tileId}`, m.overhang, 18, 0.2, m.sideBg);
  }

  reg(name, canvas) {
    const pattern = this._patCtx.createPattern(canvas, 'repeat');
    const entry = { name, canvas, pattern, w: canvas.width, h: canvas.height };
    this.map.set(name, entry);
    return entry;
  }

  get(name) {
    return this.map.get(name) || this.map.get('wall');
  }

  matTop(t) {
    switch (t) {
      case T_GROUND: return this.get('top_ground');
      case T_STONE: return this.get('top_stone');
      case T_CATACOMB: return this.get('top_catacomb');
      case T_CLOCK: return this.get('top_clock');
      case T_FOREST: return this.get('top_forest');
      case T_SNOW: return this.get('top_snow');
      case T_DARKWOOD: return this.get('top_darkwood');
      case T_CAVERN: return this.get('top_cavern');
      default: return this.map.get(`top_forge${t}`) || this.get('top_stone');
    }
  }

  matSide(t) {
    switch (t) {
      case T_GROUND: return this.get('side_ground');
      case T_STONE: return this.get('side_stone');
      case T_CATACOMB: return this.get('side_catacomb');
      case T_CLOCK: return this.get('side_clock');
      case T_FOREST: return this.get('side_forest');
      case T_SNOW: return this.get('side_snow');
      case T_DARKWOOD: return this.get('side_darkwood');
      case T_CAVERN: return this.get('side_cavern');
      default: return this.map.get(`side_forge${t}`) || this.get('side_stone');
    }
  }

  buildAll() {
    const A = this.assets;

    // 1. Direct seamless wall textures from game assets
    for (const k of ['wall', 'wall_b', 'catacombwall', 'clockwall', 'arcadewall', 'librarywall', 'cathedralwall', 'cavernwall']) {
      const im = A.img(k);
      if (im) this.reg(k, im);
    }

    // 2. Crypt ashlar stone (built from catacombwall's solid stone lintel bands)
    {
      const src = A.img('catacombwall');
      const { c, g } = makeCanvas(192, 128);
      g.fillStyle = '#0c0a14';
      g.fillRect(0, 0, 192, 128);
      if (src) {
        for (let row = 0; row < 4; row++) {
          const off = (row & 1) * 48;
          const dy = row * 32;
          g.drawImage(src, 0, 0, 192 - off, 30, off, dy, 192 - off, 31);
          if (off > 0) g.drawImage(src, 192 - off, 0, off, 30, 0, dy, off, 31);
        }
      }
      this.reg('crypt_stone', c);
    }

    // 3. Carved stone trim / voussoirs & polished Gothic marble
    this.reg('stone_trim', buildAshlarCanvas(128, 64, {
      mortar: '#151728', base: '#6e7e9e', alt: '#637392',
      hi: '#9eb0d0', lo: '#45506a', crack: '#293048', blockW: 32, blockH: 16,
    }));
    this.reg('marble', buildAshlarCanvas(128, 64, {
      mortar: '#22263c', base: '#8c99ba', alt: '#808dae',
      hi: '#bac6e4', lo: '#5c6786', crack: '#46506c', blockW: 32, blockH: 16, veins: true,
    }));

    // 4. Distant Keep miniature ashlar masonry & conical slate shingle roof
    this.reg('keep_stone', buildAshlarCanvas(64, 64, {
      mortar: '#181b32', base: '#5a6890', alt: '#4e5b82',
      hi: '#7c8db8', lo: '#394364', crack: '#252b46', blockW: 16, blockH: 8,
    }));
    {
      const { c, g } = makeCanvas(64, 64);
      g.fillStyle = '#17142e';
      g.fillRect(0, 0, 64, 64);
      for (let y = 0; y < 64; y += 8) {
        const off = ((y >> 3) & 1) * 4;
        for (let x = -8; x < 64; x += 8) {
          const sx = x + off;
          const v = hash2(x, y) & 3;
          g.fillStyle = ['#2d2854', '#383266', '#262148', '#423b74'][v];
          g.fillRect(sx + 1, y + 1, 7, 6);
          g.fillStyle = '#585092';
          g.fillRect(sx + 1, y + 1, 6, 1);
          g.fillStyle = '#1d1938';
          g.fillRect(sx + 2, y + 6, 5, 1);
        }
      }
      this.reg('slate_roof', c);
    }

    // 5. Fluted Gothic column shaft (extracted from arch.png `column`)
    {
      const arch = A.img('arch');
      const cf = A.frame('arch', 'column');
      const { c, g } = makeCanvas(32, 128);
      g.fillStyle = '#4c5874';
      g.fillRect(0, 0, 32, 128);
      if (arch && cf) {
        // Shaft sits at local y = 26..96 inside the 31x128 column frame
        g.drawImage(arch, cf.x, cf.y + 26, cf.w, 64, 0, 0, 32, 64);
        g.drawImage(arch, cf.x, cf.y + 26, cf.w, 64, 0, 64, 32, 64);
        // Subtle gothic night tone balance so column harmonizes with wall stone
        g.fillStyle = 'rgba(18, 22, 42, 0.24)';
        g.fillRect(0, 0, 32, 128);
      }
      this.reg('pillar_shaft', c);
    }

    // 6. Interior 3D Hall Flagstones & Royal Crimson Carpet Runner
    {
      const fl = A.img('floor');
      const { c, g } = makeCanvas(256, 96);
      g.fillStyle = '#141728';
      g.fillRect(0, 0, 256, 96);
      if (fl) {
        g.drawImage(fl, 0, 35, 256, 96, 0, 0, 256, 96);
        liftBrightness(g, fl, 0, 35, 256, 96, 0, 0, 256, 96, 0.34);
      }
      this.reg('hall_floor', c);
    }
    {
      const cat = A.img('catacomb');
      const { c, g } = makeCanvas(256, 64);
      g.fillStyle = '#120e16';
      g.fillRect(0, 0, 256, 64);
      if (cat) {
        for (let r = 0; r < 4; r++) {
          const off = (r & 1) * 32;
          g.drawImage(cat, off, 4, 256 - off, 16, 0, r * 16, 256 - off, 16);
          if (off > 0) g.drawImage(cat, 0, 4, off, 16, 256 - off, r * 16, off, 16);
        }
        liftBrightness(g, c, 0, 0, 256, 64, 0, 0, 256, 64, 0.20);
      }
      this.reg('crypt_floor', c);
    }
    {
      // Directly extract the hand-pixelled crimson & gold filigree carpet from floor_b.png!
      const flb = A.img('floor_b');
      const { c, g } = makeCanvas(256, 32);
      g.fillStyle = '#68182c';
      g.fillRect(0, 0, 256, 32);
      if (flb) {
        g.drawImage(flb, 0, 4, 256, 28, 0, 2, 256, 28);
        // Repeat gold borders cleanly at y = 0..4 and y = 28..32
        g.drawImage(flb, 0, 4, 256, 4, 0, 0, 256, 4);
        g.drawImage(flb, 0, 28, 256, 4, 0, 28, 256, 4);
      }
      // Subtle woven crimson damask diamonds down the runner center
      for (let x = 0; x < 256; x += 16) {
        g.fillStyle = 'rgba(155, 42, 62, 0.36)';
        g.fillRect(x + 7, 13, 2, 6);
        g.fillRect(x + 5, 15, 6, 2);
        g.fillStyle = 'rgba(42, 6, 16, 0.30)';
        g.fillRect(x + 15, 14, 2, 4);
      }
      this.reg('carpet', c);
    }

    // 7. Gnarled Ancient Tree Bark & Harvest Rune-Stone Monolith
    {
      const { c, g } = makeCanvas(64, 128);
      g.fillStyle = '#241714';
      g.fillRect(0, 0, 64, 128);
      for (let x = 0; x < 64; x += 4) {
        const ridge = hash2(x, 3) % 3;
        g.fillStyle = ['#3a251d', '#4c3125', '#2e1d18'][ridge];
        g.fillRect(x, 0, 3, 128);
        g.fillStyle = '#5e3e2e';
        g.fillRect(x, 0, 1, 128);
        g.fillStyle = '#160d0e';
        g.fillRect(x + 3, 0, 1, 128);
      }
      // Cross fissures, bark knots & lichen flecks
      for (let i = 0; i < 44; i++) {
        const x = (i * 19) % 60, y = (i * 31) % 124;
        g.fillStyle = i % 5 === 0 ? '#3a4b34' : '#180f10';
        g.fillRect(x, y, 4 + (i % 3), 2);
      }
      this.reg('bark', c);
    }
    {
      // Horizontal gnarled bark for tree boughs, root flares & lantern arms
      const { c, g } = makeCanvas(128, 64);
      g.fillStyle = '#241714';
      g.fillRect(0, 0, 128, 64);
      for (let y = 0; y < 64; y += 4) {
        const ridge = hash2(y, 5) % 3;
        g.fillStyle = ['#3a251d', '#4c3125', '#2e1d18'][ridge];
        g.fillRect(0, y, 128, 3);
        g.fillStyle = '#5e3e2e';
        g.fillRect(0, y, 128, 1);
        g.fillStyle = '#160d0e';
        g.fillRect(0, y + 3, 128, 1);
      }
      for (let i = 0; i < 44; i++) {
        const x = (i * 31) % 124, y = (i * 19) % 60;
        g.fillStyle = i % 4 === 0 ? '#3a4b34' : '#180f10';
        g.fillRect(x, y, 2, 4 + (i % 3));
      }
      this.reg('bark_h', c);
    }
    this.reg('rune_stone', buildAshlarCanvas(64, 128, {
      mortar: '#1b1720', base: '#584e56', alt: '#4b424a',
      hi: '#7a6d76', lo: '#352e36', crack: '#241e26', blockW: 32, blockH: 32,
    }));

    // 8. Clockwork Brass & Forged Iron Gear Plates (256x256 radial + riveted!)
    this.reg('brass_gear', buildGearPlateCanvas(true));
    this.reg('iron_gear', buildGearPlateCanvas(false));
    this.reg('brass_rim', buildMetalPlateCanvas(64, 32, {
      base: '#9c7030', hi: '#cfa052', lo: '#583b16', seam: '#2e1d0b', rivet: '#eed08a',
    }));
    this.reg('iron_rivet', buildMetalPlateCanvas(128, 64, {
      base: '#4b576e', hi: '#7383a0', lo: '#2d3546', seam: '#171b26', rivet: '#9eb0ce',
    }));
    {
      const cf = A.img('clockfloor');
      const { c, g } = makeCanvas(128, 64);
      g.fillStyle = '#171b28';
      g.fillRect(0, 0, 128, 64);
      if (cf) {
        g.drawImage(cf, 0, 35, 128, 64, 0, 0, 128, 64);
        liftBrightness(g, cf, 0, 35, 128, 64, 0, 0, 128, 64, 0.25);
      }
      this.reg('iron_truss', c);
    }

    // 9. Cathedral Pipe Organ Case, Gilded Pipes & Crimson Throne Velvet
    {
      const { c, g } = makeCanvas(64, 64);
      g.fillStyle = '#281718';
      g.fillRect(0, 0, 64, 64);
      for (let py = 0; py < 64; py += 32) {
        for (let px = 0; px < 64; px += 16) {
          g.fillStyle = '#482c28';
          g.fillRect(px + 1, py + 1, 14, 30);
          g.fillStyle = '#643f36';
          g.fillRect(px + 2, py + 2, 12, 2);
          g.fillRect(px + 4, py + 5, 2, 22);
          g.fillRect(px + 9, py + 5, 2, 22);
          g.fillStyle = '#1b0e10';
          g.fillRect(px + 3, py + 4, 10, 24);
          g.fillStyle = '#52332c';
          g.fillRect(px + 5, py + 5, 2, 22);
          g.fillRect(px + 10, py + 5, 2, 22);
        }
      }
      this.reg('wood_carved', c);
    }
    {
      // 8px-wide cylindrical brass organ pipes side by side
      const { c, g } = makeCanvas(64, 64);
      const cols = ['#241a10', '#5c4322', '#9c763c', '#d8b466', '#f6df9c', '#b48a48', '#684c26', '#2e2012'];
      for (let x = 0; x < 64; x++) {
        g.fillStyle = cols[x & 7];
        g.fillRect(x, 0, 1, 64);
      }
      // Horizontal pipe collar ring & dark labium mouth
      g.fillStyle = '#382612';
      g.fillRect(0, 52, 64, 3);
      g.fillStyle = '#f2d488';
      g.fillRect(0, 51, 64, 1);
      for (let px = 0; px < 64; px += 8) {
        g.fillStyle = '#18100c';
        g.fillRect(px + 2, 46, 4, 5);
      }
      this.reg('organ_pipe', c);
    }
    {
      const { c, g } = makeCanvas(32, 32);
      g.fillStyle = '#581324';
      g.fillRect(0, 0, 32, 32);
      for (let y = 0; y < 32; y += 8) {
        const off = ((y >> 3) & 1) * 4;
        for (let x = 0; x < 32; x += 8) {
          const tx = (x + off) & 31;
          g.fillStyle = '#7c1c32';
          g.fillRect(tx + 1, y + 1, 5, 5);
          g.fillStyle = '#360914';
          g.fillRect(tx, y + 7, 7, 1);
          g.fillStyle = '#d8ae58';
          g.fillRect(tx, y, 1, 1);
        }
      }
      this.reg('velvet', c);
    }

    // 10. Stage Terrain Top-Deck & Step Side-Return Textures (from actual PNG strips!)
    this.buildStripPair('ground', 'top_ground', 'side_ground', 8, 14, 0.24);
    this.buildStripPair('floor', 'top_stone', 'side_stone', 3, 30, 0.30);
    this.buildStripPair('catacomb', 'top_catacomb', 'side_catacomb', 4, 20, 0.20);
    this.buildStripPair('clockfloor', 'top_clock', 'side_clock', 3, 28, 0.24, '#131724');
    this.buildStripPair('forestfloor', 'top_forest', 'side_forest', 6, 18, 0.18);
    this.buildStripPair('snowfloor', 'top_snow', 'side_snow', 6, 30, 0.10);
    this.buildStripPair('darkwoodfloor', 'top_darkwood', 'side_darkwood', 6, 18, 0.22, '#091314');
    this.buildStripPair('cavernfloor', 'top_cavern', 'side_cavern', 4, 18, 0.22, '#140808');
    {
      const { c, g } = makeCanvas(128, 32);
      g.fillStyle = '#380906';
      g.fillRect(0, 0, 128, 32);
      for (let i = 0; i < 42; i++) {
        const x = (i * 37) % 128, y = (i * 19) % 28, w = 10 + (i % 4) * 8;
        g.fillStyle = ['#ff6a18', '#ffad28', '#8a1c08', '#ffe46c'][i & 3];
        g.fillRect(x, y, w, 3);
        if (x + w > 128) g.fillRect(x - 128, y, w, 3);
      }
      this.reg('top_lava', c);
    }

    // Elder Darkwood Bark & Bioluminescent Mossy Stone
    {
      const { c, g } = makeCanvas(64, 128);
      g.fillStyle = '#151e1e';
      g.fillRect(0, 0, 64, 128);
      for (let x = 0; x < 64; x += 4) {
        const ridge = hash2(x, 11) % 3;
        g.fillStyle = ['#223030', '#2b3b38', '#1b2628'][ridge];
        g.fillRect(x, 0, 3, 128);
        g.fillStyle = '#3d544c';
        g.fillRect(x, 0, 1, 128);
        g.fillStyle = '#0b1114';
        g.fillRect(x + 3, 0, 1, 128);
      }
      for (let i = 0; i < 48; i++) {
        const x = (i * 17) % 58, y = (i * 29) % 122;
        g.fillStyle = i % 4 === 0 ? '#2f8a68' : (i % 9 === 0 ? '#5ce0b2' : '#0f161a');
        g.fillRect(x, y, 4 + (i % 3), 2);
      }
      this.reg('elder_bark', c);
    }
    {
      const { c, g } = makeCanvas(128, 64);
      g.fillStyle = '#151e1e';
      g.fillRect(0, 0, 128, 64);
      for (let y = 0; y < 64; y += 4) {
        const ridge = hash2(y, 13) % 3;
        g.fillStyle = ['#223030', '#2b3b38', '#1b2628'][ridge];
        g.fillRect(0, y, 128, 3);
        g.fillStyle = '#3d544c';
        g.fillRect(0, y, 128, 1);
        g.fillStyle = '#0b1114';
        g.fillRect(0, y + 3, 128, 1);
      }
      for (let i = 0; i < 44; i++) {
        const x = (i * 31) % 122, y = (i * 19) % 58;
        g.fillStyle = i % 3 === 0 ? '#2f8a68' : '#0f161a';
        g.fillRect(x, y, 3, 4);
      }
      this.reg('elder_bark_h', c);
    }
    this.reg('moss_stone', buildAshlarCanvas(64, 128, {
      mortar: '#0d1718', base: '#344c4a', alt: '#2a3e3e',
      hi: '#568074', lo: '#1d2c2e', crack: '#247a5e', blockW: 32, blockH: 32,
    }));

    // 11. Platform stone, platform timber, breakable block & crumble slabs
    {
      const p = A.img('platform');
      const { c, g } = makeCanvas(256, 32);
      g.fillStyle = '#484e68';
      g.fillRect(0, 0, 256, 32);
      if (p) g.drawImage(p, 32, 2, 256, 32, 0, 0, 256, 32);
      this.reg('plat_stone', c);
    }
    {
      const pw = A.img('platform_wood');
      const { c, g } = makeCanvas(256, 32);
      g.fillStyle = '#4e3322';
      g.fillRect(0, 0, 256, 32);
      if (pw) g.drawImage(pw, 32, 4, 256, 32, 0, 0, 256, 32);
      this.reg('plat_wood', c);
      this.reg('wood_plank', c);
    }
    {
      const pr = A.img('props');
      const bf = A.frame('props', 'block');
      const { c, g } = makeCanvas(32, 32);
      g.fillStyle = '#5c6684';
      g.fillRect(0, 0, 32, 32);
      if (pr && bf) g.drawImage(pr, bf.x, bf.y, bf.w, bf.h, 0, 0, 32, 32);
      this.reg('block_stone', c);
    }
    this.reg('crumble_stone', buildCrumbleCanvas(false));
    this.reg('crumble_shake', buildCrumbleCanvas(true));
  }

  buildStripPair(assetName, topKey, sideKey, yTop, hTop, sideLift = 0.2, sideBg = '#100e1c') {
    const src = this.assets.img(assetName);
    const info = this.assets.info(assetName);
    const { c: ct, g: gt } = makeCanvas(256, 32);
    gt.fillStyle = '#2a2e42';
    gt.fillRect(0, 0, 256, 32);
    if (src) {
      for (let y = 0; y < 32; y += hTop) {
        const take = Math.min(hTop, 32 - y);
        gt.drawImage(src, 0, yTop, 256, take, 0, y, 256, take);
      }
    }
    this.reg(topKey, ct);

    const { c: cs, g: gs } = makeCanvas(256, 96);
    gs.fillStyle = sideBg;
    gs.fillRect(0, 0, 256, 96);
    if (src && info) {
      const sy = info.overhang + TILE;
      const sh = Math.min(96, src.height - sy);
      gs.drawImage(src, 0, sy, 256, sh, 0, 0, 256, 96);
      if (sideLift > 0) liftBrightness(gs, src, 0, sy, 256, sh, 0, 0, 256, 96, sideLift);
    }
    this.reg(sideKey, cs);
  }

  /** Cached tinted stained-glass lancet window canvas from `arch.window`. */
  stainedWindow(tintCss) {
    const key = `win|${tintCss}`;
    if (this.map.has(key)) return this.map.get(key);
    const arch = this.assets.img('arch');
    const wf = this.assets.frame('arch', 'window');
    const { c, g } = makeCanvas(64, 128);
    if (arch && wf) {
      g.drawImage(arch, wf.x, wf.y, wf.w, wf.h, 0, 0, 64, 128);
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = tintCss;
      g.fillRect(0, 0, 64, 128);
      g.globalCompositeOperation = 'source-over';
    }
    return this.reg(key, c);
  }

  /**
   * Pre-baked 192x192 pixel-art spoked & toothed gear wheel canvas (with open
   * cutout windows between the 4 spokes, riveted lathe rings & bevelled teeth)
   * so un-tilted 3D cogwheels render their front/back caps in 1 `drawImage` each!
   */
  gearWheel(brass, teeth, isBack = false) {
    const key = `${brass ? 'b' : 'i'}|${teeth}|${isBack ? 'bk' : 'fr'}`;
    let c = this.wheelCache.get(key);
    if (c) return c;
    const S = 192, cx = 96, cy = 96;
    const out = makeCanvas(S, S);
    c = out.c;
    const g = out.g;
    const plate = this.get(brass ? 'brass_gear' : 'iron_gear').canvas;

    const rTip = 88, rRoot = 71, rInner = 48, rHub = 22;
    const step = (Math.PI * 2) / teeth;

    // Build closed silhouette path: outer toothed rim + 4 cutout windows!
    g.save();
    g.beginPath();
    for (let i = 0; i < teeth; i++) {
      const a = i * step;
      const pts = [
        [Math.cos(a) * rRoot, Math.sin(a) * rRoot],
        [Math.cos(a + step * 0.16) * rTip, Math.sin(a + step * 0.16) * rTip],
        [Math.cos(a + step * 0.50) * rTip, Math.sin(a + step * 0.50) * rTip],
        [Math.cos(a + step * 0.66) * rRoot, Math.sin(a + step * 0.66) * rRoot],
      ];
      for (let p = 0; p < 4; p++) {
        const px = cx + pts[p][0], py = cy + pts[p][1];
        if (i === 0 && p === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
    }
    g.closePath();
    g.clip();
    g.drawImage(plate, 0, 0, 256, 256, 0, 0, S, S);
    g.restore();

    // Punch 4 open cutout windows between the 4 radial spokes
    g.save();
    g.globalCompositeOperation = 'destination-out';
    for (let s = 0; s < 4; s++) {
      const a0 = (s / 4) * Math.PI * 2 + 0.19;
      const a1 = ((s + 1) / 4) * Math.PI * 2 - 0.19;
      g.beginPath();
      g.arc(cx, cy, rInner, a0, a1, false);
      g.arc(cx, cy, rHub, a1, a0, true);
      g.closePath();
      g.fill();
    }
    g.restore();

    // Crisp rim bevels & darkening for back cap
    g.strokeStyle = brass ? '#3d280e' : '#1b202c';
    g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, rInner, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(cx, cy, rHub, 0, Math.PI * 2); g.stroke();

    if (isBack) {
      g.save();
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = 'rgba(8, 7, 18, 0.44)';
      g.fillRect(0, 0, S, S);
      g.restore();
    }
    this.wheelCache.set(key, c);
    return c;
  }
}

// ================================================== PROCEDURAL PIXEL BUILDERS
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return { c, g };
}

function liftBrightness(g, src, sx, sy, sw, sh, dx, dy, dw, dh, amount) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = amount;
  g.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh);
  g.restore();
}

function buildAshlarCanvas(w, h, cfg) {
  const { c, g } = makeCanvas(w, h);
  g.fillStyle = cfg.mortar;
  g.fillRect(0, 0, w, h);
  const bw = cfg.blockW, bh = cfg.blockH;
  for (let y = 0; y < h; y += bh) {
    const off = ((y / bh) & 1) * (bw >> 1);
    for (let x = -bw; x < w + bw; x += bw) {
      const bx = x + off;
      const hv = hash2(bx, y);
      g.fillStyle = (hv & 1) ? cfg.base : cfg.alt;
      g.fillRect(bx + 1, y + 1, bw - 2, bh - 2);
      g.fillStyle = cfg.hi;
      g.fillRect(bx + 1, y + 1, bw - 3, 1);
      g.fillRect(bx + 1, y + 1, 1, bh - 3);
      g.fillStyle = cfg.lo;
      g.fillRect(bx + 2, y + bh - 2, bw - 3, 1);
      g.fillRect(bx + bw - 2, y + 2, 1, bh - 3);
      if ((hv % 5) === 0 && bw >= 16) {
        g.fillStyle = cfg.crack;
        g.fillRect(bx + 4 + (hv % (bw - 8)), y + 3, 2, Math.max(2, bh >> 2));
      }
      if (cfg.veins) {
        g.fillStyle = 'rgba(220, 230, 255, 0.18)';
        const vx = bx + 3 + (hv % Math.max(1, bw - 10));
        g.fillRect(vx, y + 3, 4, 1);
        g.fillRect(vx + 3, y + 4, 4, 1);
      }
    }
  }
  return c;
}

function buildMetalPlateCanvas(w, h, cfg) {
  const { c, g } = makeCanvas(w, h);
  g.fillStyle = cfg.base;
  g.fillRect(0, 0, w, h);
  // Subtle horizontal brushed-metal pixel grain
  for (let y = 0; y < h; y += 2) {
    g.fillStyle = (y & 2) ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)';
    g.fillRect(0, y, w, 1);
  }
  const pw = w >> 1, ph = h >> 1;
  for (let py = 0; py < h; py += ph) {
    for (let px = 0; px < w; px += pw) {
      g.fillStyle = cfg.seam;
      g.fillRect(px, py, pw, 1);
      g.fillRect(px, py, 1, ph);
      g.fillStyle = cfg.hi;
      g.fillRect(px + 1, py + 1, pw - 2, 1);
      g.fillRect(px + 1, py + 1, 1, ph - 2);
      g.fillStyle = cfg.lo;
      g.fillRect(px + 1, py + ph - 1, pw - 1, 1);
      // Corner pixel rivets
      for (const [rx, ry] of [[px + 3, py + 3], [px + pw - 4, py + 3], [px + 3, py + ph - 4], [px + pw - 4, py + ph - 4]]) {
        g.fillStyle = cfg.seam;
        g.fillRect(rx, ry + 1, 2, 2);
        g.fillStyle = cfg.rivet;
        g.fillRect(rx, ry, 2, 1);
      }
    }
  }
  return c;
}

/** 256x256 concentric lathe-turned & riveted clockwork plate centered at (128,128). */
function buildGearPlateCanvas(brass) {
  const { c, g } = makeCanvas(256, 256);
  const cx = 128, cy = 128;
  const pal = brass
    ? { bg: '#9e7230', ringA: '#b8883e', ringB: '#865e24', hi: '#e0b668', dark: '#4c3312', rivet: '#f6dc96' }
    : { bg: '#5a6882', ringA: '#6c7c9a', ringB: '#48546b', hi: '#9cb0d0', dark: '#262d3c', rivet: '#c6d6f0' };

  g.fillStyle = pal.bg;
  g.fillRect(0, 0, 256, 256);

  // Concentric lathe-turned pixel bands
  for (let r = 124; r >= 8; r -= 6) {
    g.fillStyle = ((r / 6) & 1) ? pal.ringA : pal.ringB;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  }
  for (const r of [112, 86, 62, 38, 20]) {
    g.strokeStyle = pal.dark; g.lineWidth = 2;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = pal.hi; g.lineWidth = 1;
    g.beginPath(); g.arc(cx, cy, r - 1.5, 0, Math.PI * 2); g.stroke();
  }

  // 8 radial plate seams + bolt rivets so rotation is unmistakably legible!
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    g.strokeStyle = pal.dark; g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx + ca * 16, cy + sa * 16);
    g.lineTo(cx + ca * 124, cy + sa * 124);
    g.stroke();
    for (const rr of [28, 50, 74, 98]) {
      const rx = Math.round(cx + ca * rr + sa * 5);
      const ry = Math.round(cy + sa * rr - ca * 5);
      g.fillStyle = pal.dark;
      g.fillRect(rx - 1, ry, 3, 3);
      g.fillStyle = pal.rivet;
      g.fillRect(rx - 1, ry - 1, 2, 2);
    }
  }
  return c;
}

function buildCrumbleCanvas(shake) {
  const { c, g } = makeCanvas(64, 32);
  g.fillStyle = shake ? '#6c544e' : '#58607a';
  g.fillRect(0, 0, 64, 32);
  // Bevelled stone blocks
  for (let x = 0; x < 64; x += 32) {
    g.fillStyle = shake ? '#9e7c6e' : '#8e9ab8';
    g.fillRect(x + 1, 1, 30, 3);
    g.fillStyle = '#252338';
    g.fillRect(x, 28, 32, 4);
    g.fillRect(x + 31, 0, 1, 32);
    // Jagged pixel fissures
    const crk = shake ? '#ffb258' : '#1d1a2c';
    g.fillStyle = crk;
    for (const [ox, oy] of [[9, 2], [11, 5], [13, 8], [12, 12], [10, 16], [11, 21], [23, 3], [21, 7], [19, 11], [22, 15], [24, 20]]) {
      g.fillRect(x + ox, oy, 2, 4);
    }
  }
  return c;
}

function norm3(x, y, z) {
  const m = Math.hypot(x, y, z) || 1;
  return [x / m, y / m, z / m];
}
function clampByte(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function mod(a, n) { return ((a % n) + n) % n; }
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return (h ^ (h >>> 16)) >>> 0;
}
