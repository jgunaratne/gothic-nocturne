// Multi-layer parallax: sky, mountains, distant silhouettes, wheeling bat
// flocks, diagonal moonlight shafts, drifting fog, and near foreground framing.

import { W, H } from '../engine/constants.js';
import { getFxLayers } from '../engine/fxlayers.js';

const LAYER_SETS = {
  // Graveyard road: mountains & distant keep ridge behind near cemetery trees.
  outdoor: {
    layers: [
      { img: 'mountains', fx: 0.12, fy: 0.06, dy: -26 },
      { img: 'castle', fx: 0.24, fy: 0.10, dy: -18 },
      { img: 'forest', fx: 0.50, fy: 0.20, dy: -28 },
    ],
    front: true,
    flock: { count: 7, cx: 0.7, cy: 0.22, rx: 200, ry: 60 },
    shafts: { count: 3, color: 'rgba(200, 210, 255, 0.05)' },
  },
  // Castle ramparts: high above the outer bailey, overlooking the 3D courtyard.
  ramparts: {
    layers: [
      { img: 'mountains', fx: 0.10, fy: 0.06, dy: -24 },
      { img: 'castle', fx: 0.24, fy: 0.12, dy: -22 },
    ],
    front: false,
    flock: { count: 9, cx: 0.55, cy: 0.26, rx: 230, ry: 64 },
    shafts: { count: 3, color: 'rgba(185, 205, 255, 0.05)' },
  },
  // Pumpkin woods: two copies of the deep forest, top-clamped so tree crowns never drop into sky.
  forest: {
    layers: [
      { img: 'mountains', fx: 0.08, fy: 0.05, dy: -18 },
      { img: 'deepforest', fx: 0.22, fy: 0.10, dy: -48, dark: 0.55, topCut: 0 },
      { img: 'deepforest', fx: 0.46, fy: 0.17, dy: -38, topCut: 0 },
    ],
    front: true,
    flock: { count: 6, cx: 0.4, cy: 0.18, rx: 180, ry: 50 },
    shafts: { count: 4, color: 'rgba(255, 200, 140, 0.06)' },
  },
  // Darkwood: midnight ancient canopy (topCut=33 keeps cropped crown edge above viewport).
  darkwood: {
    layers: [
      { img: 'mountains', fx: 0.07, fy: 0.05, dy: -34, dark: 0.35 },
      { img: 'darkwood_canopy', fx: 0.18, fy: 0.08, dy: -54, dark: 0.55, topCut: 33 },
      { img: 'darkwood_canopy', fx: 0.42, fy: 0.15, dy: -68, topCut: 33 },
    ],
    front: false,
    flock: { count: 5, cx: 0.52, cy: 0.20, rx: 190, ry: 46 },
    shafts: { count: 4, color: 'rgba(105, 240, 190, 0.06)' },
  },
  // Frozen village: distant peaks rising above the snowbound village & pine treeline.
  winter: {
    layers: [
      { img: 'mountains', fx: 0.08, fy: 0.05, dy: -68 },
      { img: 'winter', fx: 0.40, fy: 0.16, dy: -34 },
    ],
    front: false,
    shafts: { count: 3, color: 'rgba(180, 220, 255, 0.05)' },
  },
};

/**
 * Registers a parallax layer set for a forged wing: `backdropImg` (a generated
 * seamless 1280x360 mid-distance layer) is stacked twice behind the play plane,
 * the far copy darkened, over the shared mountain silhouettes.
 */
export function registerLayerSet(name, { backdropImg = null, baseSet = 'outdoor', accentRgb = [200, 210, 255] } = {}) {
  const base = LAYER_SETS[baseSet] || LAYER_SETS.outdoor;
  const layers = backdropImg
    ? [
      { img: 'mountains', fx: 0.08, fy: 0.05, dy: -36, dark: 0.3 },
      { img: backdropImg, fx: 0.20, fy: 0.09, dy: -46, dark: 0.52, topCut: 0 },
      { img: backdropImg, fx: 0.46, fy: 0.17, dy: -28, topCut: 0 },
    ]
    : base.layers.slice();
  LAYER_SETS[name] = {
    layers,
    front: false,
    flock: base.flock ? Object.assign({}, base.flock) : { count: 6, cx: 0.55, cy: 0.22, rx: 200, ry: 56 },
    shafts: { count: 3, color: `rgba(${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]}, 0.05)` },
  };
}

export class Parallax {
  constructor(assets, levelH, setName = 'outdoor') {
    this.assets = assets;
    this.levelH = levelH;
    this.time = 0;
    const set = LAYER_SETS[setName] || LAYER_SETS.outdoor;
    this.setName = set === LAYER_SETS.outdoor ? 'graveyard' : setName === 'winter' ? 'yule' : setName;
    this.layers = set.layers
      .filter((L) => assets.img(L.img))
      .map((L) => ({
        img: L.img,
        dark: L.dark || 0,
        fx: L.fx,
        fy: L.fy,
        topCut: L.topCut == null ? null : L.topCut,
        worldY: levelH - H + L.dy,
      }));
    this.hasFront = set.front;
    this.flock = set.flock ? makeFlock(set.flock) : null;
    this.shafts = set.shafts ? makeShafts(set.shafts) : null;
    this.fog = makeFogStrip();
  }

  /** Theme key used for shader cloud banks / god rays (forged sets inherit their base). */
  setFxTheme(key) { if (key) this.setName = key; }

  update(dt) { this.time += dt; }

  drawSky(ctx, cam, flash, boltX = 320, boltSeed = 1.0, extraSkyFn = null) {
    const sky = this.assets.img('sky');
    const off = mod(-(cam.rx * 0.04) - this.time * 1.5, sky.width);
    for (let x = off - sky.width; x < W; x += sky.width) ctx.drawImage(sky, Math.round(x), 0);
    // Shader & 3D aurora ribbons belong in the celestial sky dome behind mountains & trees.
    const fx = getFxLayers();
    if (fx && this.setName === 'yule') fx.aurora(ctx, cam.rx);
    if (extraSkyFn) extraSkyFn(ctx);
    if (fx) {
      fx.clouds(ctx, cam.rx, this.setName, flash);
      if (flash > 0.03) fx.lightning(ctx, boltX, boltSeed, flash, 232);
    }
    if (flash > 0) {
      ctx.fillStyle = `rgba(210, 224, 255, ${0.42 * flash})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  drawBack(ctx, cam, flash) {
    this.drawBackRange(ctx, cam, flash, 0, 1, true);
  }

  /**
   * Draws scrolling parallax layers whose horizontal depth factor `fx` falls in
   * `[fxMin, fxMax)` so 3D horizon landmarks (e.g. the distant castle keep at
   * `fx ≈ 0.26`) interleave at their true depth between far ridges and near trees.
   */
  drawBackRange(ctx, cam, flash, fxMin = 0, fxMax = 1, includeFlock = false) {
    const base = this.levelH - H;
    for (const L of this.layers) {
      if (L.fx < fxMin || L.fx >= fxMax) continue;
      const img = L.dark ? this.assets.darkened(L.img, L.dark) : this.assets.img(L.img);
      const off = mod(-(cam.rx * L.fx), img.width);
      let y = Math.round(L.worldY - base - (cam.ry - base) * L.fy);
      if (L.topCut != null) y = Math.min(-L.topCut, y);
      for (let x = off - img.width; x < W; x += img.width) {
        const dx = Math.round(x);
        ctx.drawImage(img, dx, y);
        if (y + img.height < H) {
          ctx.drawImage(img, 0, img.height - 1, img.width, 1, dx, y + img.height - 1, img.width, H - (y + img.height) + 1);
        }
      }
      if (L.img === 'castle' && flash > 0.05) {
        ctx.save();
        ctx.globalAlpha = 0.35 * flash;
        ctx.globalCompositeOperation = 'lighter';
        for (let x = off - img.width; x < W; x += img.width) ctx.drawImage(img, Math.round(x), y);
        ctx.restore();
      }
    }
    if (includeFlock && this.flock) this.drawFlock(ctx, cam);
  }

  /** Drawn after 3D outdoor vistas so moonlight beams & mist unify 2D and 3D depth. */
  drawAtmosphere(ctx, cam) {
    const fx = getFxLayers();
    if (fx && fx.enabled) fx.godRays(ctx, cam.rx, this.setName, 1.0);
    else if (this.shafts) this.drawShafts(ctx, cam);
    this.drawFog(ctx, cam, 0.62, 0.20, 36, 22);
  }

  /** A wheeling flock of bats at depth: scaled, darkened, on Lissajous paths. */
  drawFlock(ctx, cam) {
    const F = this.flock;
    if (!this.assets.frame('bat', 'fly0')) return;
    const cx = F.cx * W - cam.rx * 0.3, cy = F.cy * H - (cam.ry - (this.levelH - H)) * 0.15;
    for (const b of F.bats) {
      const t = this.time * b.speed + b.phase;
      const x = mod(cx + Math.cos(t) * F.rx + Math.cos(t * 2.3) * 20, W + 120) - 60;
      const y = cy + Math.sin(t * 1.4) * F.ry;
      const depth = 0.5 + 0.5 * Math.sin(t + b.phase * 2);
      const s = 0.25 + depth * 0.4;
      const flap = Math.floor(this.time * 10 + b.phase) % 2 ? 'fly0' : 'fly2';
      const fr = this.assets.frame('bat', flap);
      const im = this.assets.tinted('bat', flap, 'rgba(10, 8, 20, 0.85)');
      ctx.save();
      ctx.globalAlpha = 0.55 + depth * 0.35;
      ctx.translate(Math.round(x), Math.round(y));
      ctx.scale(Math.cos(t) >= 0 ? s : -s, s);
      ctx.drawImage(im, -fr.w / 2, -fr.h / 2);
      ctx.restore();
    }
  }

  /** Slow diagonal moonlight shafts (additive), drifting with the camera. */
  drawShafts(ctx, cam) {
    const S = this.shafts;
    if (!S.grad) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, S.color.replace(/[\d.]+\)$/, '0.14)'));
      g.addColorStop(1, S.color.replace(/[\d.]+\)$/, '0)'));
      S.grad = g;
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = S.grad;
    for (const s of S.beams) {
      const x0 = mod(s.x - cam.rx * 0.35 + Math.sin(this.time * 0.1 + s.phase) * 20, W + 300) - 150;
      const w = s.w, lean = s.lean;
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(this.time * 0.5 + s.phase);
      ctx.beginPath();
      ctx.moveTo(x0, 0); ctx.lineTo(x0 + w, 0); ctx.lineTo(x0 + w + lean, H); ctx.lineTo(x0 + lean - w * 0.6, H);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  drawFog(ctx, cam, fx, alpha, speed, yOff) {
    const fog = this.fog;
    const base = this.levelH - H;
    const y = Math.round(H - fog.height - yOff - (cam.ry - base) * 0.5);
    ctx.save();
    ctx.globalAlpha = alpha;
    let off = mod(-(cam.rx * fx) + this.time * speed, fog.width);
    for (let x = off - fog.width; x < W; x += fog.width) ctx.drawImage(fog, Math.round(x), y + Math.round(Math.sin(this.time * 0.4) * 3));
    off = mod(-(cam.rx * (fx + 0.15)) - this.time * speed * 0.6, fog.width);
    ctx.globalAlpha = alpha * 0.7;
    for (let x = off - fog.width; x < W; x += fog.width) ctx.drawImage(fog, Math.round(x), y + 18 + Math.round(Math.cos(this.time * 0.3) * 3));
    ctx.restore();
  }

  /**
   * Near-camera scrolling vignette framing (`fg.png`):
   * - Splits `fg.png` into its upper overhanging branch/chain valance (`srcY 0..146`,
   *   strictly top-anchored so `topY <= 0` and its top edge never floats mid-screen
   *   when climbing upper platforms!) and its lower wrought-iron fence tips (`srcY 224..310`,
   *   trimming the heavy 61px solid black footer down to a crisp 11px rim so floors,
   *   low platforms, and doorways stay unobstructed).
   * - Clips to `opts.clipRight` so outdoor cemetery framing never bleeds over indoor halls.
   */
  drawFront(ctx, cam, alpha = 0.82, opts = null) {
    const img = this.assets.img('fg');
    if (!img || !this.hasFront || alpha <= 0.01) return;
    const clipRight = opts && opts.clipRight != null ? Math.min(W, Math.round(opts.clipRight)) : W;
    if (clipRight <= 0) return;

    const off = mod(-(cam.rx * 1.28), img.width);
    const base = this.levelH - H;
    const elev = Math.max(0, base - cam.ry); // >= 0 as camera climbs above base floor

    // Top overhanging gnarled branches & chains: anchored to top border (`topY <= 0`).
    const topSrcH = Math.min(148, img.height);
    const topY = -Math.min(42, Math.round(elev * 0.16));
    const topAlpha = alpha * Math.max(0.38, 1 - elev / 340);

    // Bottom wrought-iron fence tips: trim heavy black footer (`y=299..359`) to a thin 11px rim.
    const botSrcY = 224;
    const botSrcH = Math.min(86, img.height - botSrcY); // rows 224..310 (spear tips + 11px dark sill)
    const botY = H - botSrcH + Math.min(26, Math.round(elev * 0.12));
    const py = opts && opts.playerScreenY != null ? opts.playerScreenY : 240;
    const playerLowFade = py > 292 ? Math.max(0.32, 1 - (py - 292) / 96) : 1;
    const botAlpha = alpha * 0.72 * playerLowFade * Math.max(0.25, 1 - elev / 260);

    ctx.save();
    if (clipRight < W) {
      ctx.beginPath();
      ctx.rect(0, 0, clipRight, H);
      ctx.clip();
    }
    if (topAlpha > 0.01) {
      ctx.globalAlpha = topAlpha;
      for (let x = off - img.width; x < clipRight; x += img.width) {
        ctx.drawImage(img, 0, 0, img.width, topSrcH, Math.round(x), topY, img.width, topSrcH);
      }
    }
    if (botAlpha > 0.01 && botSrcH > 0) {
      ctx.globalAlpha = botAlpha;
      for (let x = off - img.width; x < clipRight; x += img.width) {
        const dx = Math.round(x);
        ctx.drawImage(img, 0, botSrcY, img.width, botSrcH, dx, botY, img.width, botSrcH);
      }
    }
    ctx.restore();
  }
}

function mod(a, n) { return ((a % n) + n) % n; }

function makeFlock(cfg) {
  const bats = [];
  for (let i = 0; i < cfg.count; i++) bats.push({ speed: 0.35 + (i % 4) * 0.08, phase: i * 1.9 });
  return Object.assign({ bats }, cfg);
}

function makeShafts(cfg) {
  const beams = [];
  for (let i = 0; i < cfg.count; i++) beams.push({ x: (i + 0.5) * (W / cfg.count) + (i % 2) * 60, w: 26 + (i % 3) * 14, lean: 90 + (i % 2) * 40, phase: i * 2.1 });
  return Object.assign({ beams }, cfg);
}

/** Procedural tileable fog strip (soft blobs), 640x72. */
function makeFogStrip() {
  const c = document.createElement('canvas');
  c.width = 640; c.height = 72;
  const g = c.getContext('2d');
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < 46; i++) {
    const x = rnd() * 640, y = 20 + rnd() * 40, rx = 40 + rnd() * 90, ry = 10 + rnd() * 16;
    for (const dx of [-640, 0, 640]) {
      const grad = g.createRadialGradient(x + dx, y, 1, x + dx, y, rx);
      grad.addColorStop(0, 'rgba(120, 110, 160, 0.16)');
      grad.addColorStop(1, 'rgba(120, 110, 160, 0)');
      g.fillStyle = grad;
      g.save();
      g.translate(x + dx, y);
      g.scale(1, ry / rx);
      g.translate(-(x + dx), -y);
      g.fillRect(x + dx - rx, y - rx, rx * 2, rx * 2);
      g.restore();
    }
  }
  return c;
}
