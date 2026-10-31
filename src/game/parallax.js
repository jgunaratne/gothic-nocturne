// Multi-layer parallax: sky, mountains, castle, dead forest, drifting fog,
// and a near foreground overlay. Keyed layers are 2x mirrored (seamless).

import { W, H } from '../engine/constants.js';

const LAYER_SETS = {
  // Graveyard road: full depth stack.
  outdoor: {
    layers: [
      { img: 'mountains', fx: 0.12, fy: 0.08, dy: -12 },
      { img: 'castle', fx: 0.26, fy: 0.14, dy: -4 },
      { img: 'forest', fx: 0.52, fy: 0.3, dy: 6 },
    ],
    front: true,
  },
  // Castle ramparts: the keep looms closer, no graveyard trees.
  ramparts: {
    layers: [
      { img: 'mountains', fx: 0.1, fy: 0.08, dy: 10 },
      { img: 'castle', fx: 0.34, fy: 0.18, dy: 28 },
    ],
    front: false,
  },
  // Pumpkin woods: two copies of the deep forest, the far one darkened.
  forest: {
    layers: [
      { img: 'mountains', fx: 0.08, fy: 0.06, dy: 16 },
      { img: 'deepforest', fx: 0.22, fy: 0.12, dy: -30, dark: 0.55 },
      { img: 'deepforest', fx: 0.48, fy: 0.28, dy: 6 },
    ],
    front: true,
  },
  // Frozen village: distant peaks, then the snowbound village twice.
  winter: {
    layers: [
      { img: 'mountains', fx: 0.08, fy: 0.06, dy: 0 },
      { img: 'winter', fx: 0.2, fy: 0.1, dy: -36, dark: 0.5 },
      { img: 'winter', fx: 0.46, fy: 0.26, dy: 6 },
    ],
    front: false,
  },
};

export class Parallax {
  constructor(assets, levelH, setName = 'outdoor') {
    this.assets = assets;
    this.levelH = levelH;
    this.time = 0;
    const set = LAYER_SETS[setName] || LAYER_SETS.outdoor;
    // worldY: where the 360px-tall layer image sits in world space; fy is the
    // vertical parallax factor relative to the camera.
    this.layers = set.layers
      .filter((L) => assets.img(L.img))
      .map((L) => ({ img: L.img, dark: L.dark || 0, fx: L.fx, fy: L.fy, worldY: levelH - H + L.dy }));
    this.hasFront = set.front;
    this.fog = makeFogStrip();
  }

  update(dt) { this.time += dt; }

  drawSky(ctx, cam, flash) {
    const sky = this.assets.img('sky');
    const off = mod(-(cam.x * 0.04) - this.time * 1.5, sky.width);
    // Sky is drawn at a fixed screen position; repeat horizontally.
    for (let x = off - sky.width; x < W; x += sky.width) ctx.drawImage(sky, Math.round(x), 0);
    if (flash > 0) {
      ctx.fillStyle = `rgba(220, 225, 255, ${0.55 * flash})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  drawBack(ctx, cam, flash) {
    for (const L of this.layers) {
      const img = L.dark ? this.assets.darkened(L.img, L.dark) : this.assets.img(L.img);
      const off = mod(-(cam.x * L.fx), img.width);
      const base = this.levelH - H;                     // camera y at the level bottom
      const y = Math.round(L.worldY - base - (cam.y - base) * L.fy);
      for (let x = off - img.width; x < W; x += img.width) ctx.drawImage(img, Math.round(x), y);
      if (L.img === 'castle') {
        // Lightning silhouettes the castle: brighten the layer briefly.
        if (flash > 0.05) {
          ctx.save();
          ctx.globalAlpha = 0.35 * flash;
          ctx.globalCompositeOperation = 'lighter';
          for (let x = off - img.width; x < W; x += img.width) ctx.drawImage(img, Math.round(x), y);
          ctx.restore();
        }
      }
    }
    this.drawFog(ctx, cam, 0.62, 0.22, 36, 22);
  }

  drawFog(ctx, cam, fx, alpha, speed, yOff) {
    const fog = this.fog;
    const base = this.levelH - H;
    const y = Math.round(H - fog.height - yOff - (cam.y - base) * 0.5 + (this.levelH - H - cam.y) * 0.0);
    ctx.save();
    ctx.globalAlpha = alpha;
    let off = mod(-(cam.x * fx) + this.time * speed, fog.width);
    for (let x = off - fog.width; x < W; x += fog.width) ctx.drawImage(fog, Math.round(x), y + Math.round(Math.sin(this.time * 0.4) * 3));
    off = mod(-(cam.x * (fx + 0.15)) - this.time * speed * 0.6, fog.width);
    ctx.globalAlpha = alpha * 0.7;
    for (let x = off - fog.width; x < W; x += fog.width) ctx.drawImage(fog, Math.round(x), y + 18 + Math.round(Math.cos(this.time * 0.3) * 3));
    ctx.restore();
  }

  drawFront(ctx, cam, alpha = 0.9) {
    const img = this.assets.img('fg');
    if (!img || !this.hasFront || alpha <= 0.01) return;
    const off = mod(-(cam.x * 1.3), img.width);
    const base = this.levelH - H;
    const y = Math.round(-(cam.y - base) * 1.0 + 0);
    ctx.save();
    ctx.globalAlpha = alpha;
    for (let x = off - img.width; x < W; x += img.width) ctx.drawImage(img, Math.round(x), y);
    ctx.restore();
  }
}

function mod(a, n) { return ((a % n) + n) % n; }

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
