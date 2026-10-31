// Loads assets/atlas.json plus every referenced image, and the music tracks.

export class Assets {
  constructor() {
    this.atlas = null;
    this.images = {};
    this.music = {};
  }

  async load(onProgress) {
    const res = await fetch('assets/atlas.json');
    this.atlas = await res.json();
    const names = Object.keys(this.atlas);
    let done = 0;
    const total = names.length;
    await Promise.all(names.map(async (name) => {
      this.images[name] = await loadImage('assets/' + this.atlas[name].file);
      done++;
      onProgress && onProgress(done / total);
    }));
  }

  /** Frame record {x,y,w,h,ax,ay} for a sheet, or null. */
  frame(sheet, name) {
    const s = this.atlas[sheet];
    return s && s.frames ? s.frames[name] || null : null;
  }

  img(name) { return this.images[name]; }
  info(name) { return this.atlas[name]; }

  /**
   * Draws a sheet frame with its anchor at (x, y). `flip` mirrors around the
   * anchor so a right-facing source can face left.
   */
  draw(ctx, sheet, name, x, y, flip = false, alpha = 1) {
    const f = this.frame(sheet, name);
    if (!f) return;
    const img = this.images[sheet];
    if (alpha !== 1) { ctx.save(); ctx.globalAlpha = alpha; }
    if (!flip) {
      ctx.drawImage(img, f.x, f.y, f.w, f.h,
        Math.round(x - f.ax), Math.round(y - f.ay), f.w, f.h);
    } else {
      ctx.save();
      ctx.translate(Math.round(x), Math.round(y - f.ay));
      ctx.scale(-1, 1);
      ctx.drawImage(img, f.x, f.y, f.w, f.h, Math.round(-f.ax), 0, f.w, f.h);
      ctx.restore();
    }
    if (alpha !== 1) ctx.restore();
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
