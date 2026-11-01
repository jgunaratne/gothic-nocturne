// Loads assets/atlas.json plus every referenced image, and the music tracks.

import { ASSET_VERSION } from './constants.js';
import { registerDarkwoodAssets } from '../game/forest_assets.js';

export class Assets {
  constructor() {
    this.atlas = null;
    this.images = {};
    this.music = {};
    this.tintCache = new Map();
  }

  async load(onProgress) {
    const res = await fetch('assets/atlas.json?v=' + ASSET_VERSION, { cache: 'no-cache' });
    this.atlas = await res.json();
    const names = Object.keys(this.atlas);
    let done = 0;
    const total = names.length;
    await Promise.all(names.map(async (name) => {
      this.images[name] = await loadImage('assets/' + this.atlas[name].file + '?v=' + ASSET_VERSION);
      done++;
      onProgress && onProgress(done / total);
    }));
    registerDarkwoodAssets(this);
  }

  /** Frame record {x,y,w,h,ax,ay} for a sheet, or null. */
  frame(sheet, name) {
    const s = this.atlas[sheet];
    return s && s.frames ? s.frames[name] || null : null;
  }

  /**
   * Registers an extra asset at runtime (Castle Forge wings): `info` follows the
   * atlas.json record shape and `image` may be an Image or a canvas.
   */
  register(name, info, image) {
    this.atlas[name] = info;
    this.images[name] = image;
    for (const k of [...this.tintCache.keys()]) if (k.startsWith(name + '|')) this.tintCache.delete(k);
  }

  /** Loads and registers an image under `name` (resolves false on failure). */
  async registerFromUrl(name, info, url) {
    try {
      const img = await loadImage(url);
      this.register(name, Object.assign({ w: img.width, h: img.height }, info), img);
      return true;
    } catch (e) {
      console.warn('forge asset failed', name, url, e);
      return false;
    }
  }

  img(name) { return this.images[name]; }
  info(name) { return this.atlas[name]; }

  /**
   * Draws a sheet frame with its anchor at (x, y). `flip` mirrors around the
   * anchor so a right-facing source can face left. Optional uniform `scale`,
   * a `tint` colour (multiplied over the sprite, cached per frame) and `xf`
   * {sx, sy, skew}: squash/stretch about the anchor and a shear in world
   * direction (positive skew leans the top toward +x), both about the feet.
   */
  draw(ctx, sheet, name, x, y, flip = false, alpha = 1, scale = 1, tint = null, xf = null) {
    const f = this.frame(sheet, name);
    if (!f) return;
    let img = this.images[sheet];
    let sx = f.x, sy = f.y;
    if (tint) { img = this.tinted(sheet, name, tint); sx = 0; sy = 0; }
    if (alpha !== 1) { ctx.save(); ctx.globalAlpha = alpha; }
    if (!flip && scale === 1 && !xf) {
      ctx.drawImage(img, sx, sy, f.w, f.h, Math.round(x - f.ax), Math.round(y - f.ay), f.w, f.h);
    } else {
      const kx = scale * (xf && xf.sx ? xf.sx : 1);
      const ky = scale * (xf && xf.sy ? xf.sy : 1);
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y));
      if (xf && xf.skew) ctx.transform(1, 0, -xf.skew, 1, 0, 0);
      ctx.scale(flip ? -kx : kx, ky);
      ctx.drawImage(img, sx, sy, f.w, f.h, Math.round(-f.ax), Math.round(-f.ay), f.w, f.h);
      ctx.restore();
    }
    if (alpha !== 1) ctx.restore();
  }

  /** Cached copy of a whole image multiplied toward black (far parallax). */
  darkened(name, amount) {
    const key = `${name}|dark|${amount}`;
    let c = this.tintCache.get(key);
    if (c) return c;
    const img = this.images[name];
    c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = `rgba(6, 5, 16, ${amount})`;
    g.fillRect(0, 0, c.width, c.height);
    this.tintCache.set(key, c);
    return c;
  }

  /** Cached tinted copy of a frame (colour multiplied where opaque). */
  tinted(sheet, name, color) {
    const key = `${sheet}|${name}|${color}`;
    let c = this.tintCache.get(key);
    if (c) return c;
    const f = this.frame(sheet, name);
    c = document.createElement('canvas');
    c.width = f.w; c.height = f.h;
    const g = c.getContext('2d');
    g.drawImage(this.images[sheet], f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = color;
    g.fillRect(0, 0, f.w, f.h);
    this.tintCache.set(key, c);
    return c;
  }
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('failed to load ' + src));
    im.src = src;
  });
}
