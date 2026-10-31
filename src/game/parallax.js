// Multi-layer parallax: sky, mountains, castle, dead forest, drifting fog,
// and a near foreground overlay. Keyed layers are 2x mirrored (seamless).

import { W, H } from '../engine/constants.js';

export class Parallax {
  constructor(assets, levelH) {
    this.assets = assets;
    this.levelH = levelH;
    this.time = 0;
    // worldY: where the 360px-tall layer image sits in world space; fy is the
    // vertical parallax factor relative to the camera.
    this.layers = [
      { img: 'mountains', fx: 0.12, fy: 0.08, worldY: levelH - H - 12 },
      { img: 'castle', fx: 0.26, fy: 0.14, worldY: levelH - H - 4 },
      { img: 'forest', fx: 0.52, fy: 0.3, worldY: levelH - H + 6 },
    ];
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
      const img = this.assets.img(L.img);
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
    if (!img || alpha <= 0.01) return;
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
