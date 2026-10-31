// Bitmap text: a blackletter (gothic textura) proportional font generated with
// the image model and baked into assets/font_gothic_<cap>.png by
// tools/build_font.py, with the original 5x7 pixel font kept as a fallback for
// glyphs the blackletter set lacks (arrows, heart, symbols) and for headless use.

const GLYPHS = {
  'A': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'B': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  'C': ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  'D': ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  'F': ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  'G': ['.####', '#....', '#....', '#.###', '#...#', '#...#', '.####'],
  'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  'I': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  'J': ['....#', '....#', '....#', '....#', '#...#', '#...#', '.###.'],
  'K': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  'M': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  'N': ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  'Q': ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  'S': ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  'V': ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  'W': ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  'X': ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  'Y': ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  'Z': ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  '3': ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '..#..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  '?': ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '_': ['.....', '.....', '.....', '.....', '.....', '.....', '#####'],
  "'": ['.##..', '.##..', '..#..', '.#...', '.....', '.....', '.....'],
  '"': ['.#.#.', '.#.#.', '.#.#.', '.....', '.....', '.....', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '=': ['.....', '.....', '#####', '.....', '#####', '.....', '.....'],
  '%': ['##...', '##..#', '...#.', '..#..', '.#...', '#..##', '...##'],
  '*': ['.....', '#.#.#', '.###.', '#####', '.###.', '#.#.#', '.....'],
  '©': ['.###.', '#...#', '#.##.', '#.#..', '#.##.', '#...#', '.###.'],
  '♥': ['.#.#.', '#####', '#####', '#####', '.###.', '..#..', '.....'],
  '←': ['.....', '..#..', '.#...', '#####', '.#...', '..#..', '.....'],
  '→': ['.....', '..#..', '...#.', '#####', '...#.', '..#..', '.....'],
  '↑': ['..#..', '.###.', '#.#.#', '..#..', '..#..', '..#..', '..#..'],
  '↓': ['..#..', '..#..', '..#..', '..#..', '#.#.#', '.###.', '..#..'],
  '·': ['.....', '.....', '.....', '..#..', '.....', '.....', '.....'],
  '~': ['.....', '.....', '.#...', '#.#.#', '...#.', '.....', '.....'],
};

export const GLYPH_W = 5;
export const GLYPH_H = 7;

/** Blackletter cap height per text scale (scales above 4 upscale the 40px atlas).
 *  Scales 1-2 (HUD, subtitles, menus, map labels, prompts) keep the crisp
 *  sans-serif pixel font for legibility; the blackletter is reserved for the
 *  title and other large display text (scale 3+). */
const CAP_FOR_SCALE = { 3: 30, 4: 40 };
const GOTHIC_MIN_SCALE = 3;
const SPACE_ADVANCE = 0.42;   // fraction of cap height
const LETTER_GAP = 1;         // px per scale between glyphs

export class Font {
  constructor() {
    this.cache = new Map();
    this.gothic = null;       // { caps: { '10': { img, glyphs } }, ... } once loaded
    this.tintCache = new Map();
  }

  /** Loads the blackletter atlases (no-op when unavailable, e.g. Node). */
  async load(version = '') {
    if (typeof document === 'undefined' || typeof fetch === 'undefined') return;
    try {
      const res = await fetch('assets/font_gothic.json?v=' + version, { cache: 'no-cache' });
      if (!res.ok) return;
      const meta = await res.json();
      const caps = {};
      await Promise.all(Object.entries(meta.caps).map(async ([cap, c]) => {
        const img = await new Promise((resolve, reject) => {
          const im = new Image(); im.onload = () => resolve(im); im.onerror = reject; im.src = 'assets/' + c.file + '?v=' + version;
        });
        caps[cap] = { img, glyphs: c.glyphs, cap: c.cap };
      }));
      this.gothic = { caps };
    } catch (e) { console.warn('gothic font unavailable, using pixel font', e); }
  }

  _set(scale, gothic = true) {
    if (!this.gothic || !gothic || scale < GOTHIC_MIN_SCALE) return null;
    const cap = CAP_FOR_SCALE[Math.min(4, Math.max(1, Math.round(scale)))];
    return this.gothic.caps[String(cap)] || null;
  }

  /** Upscale factor applied to the atlas glyphs for scales beyond the largest atlas. */
  _mul(scale) { return scale > 4 ? scale / 4 : 1; }

  _glyphCanvas(ch, color, scale) {
    const key = `${ch}|${color}|${scale}`;
    let c = this.cache.get(key);
    if (c) return c;
    const rows = GLYPHS[ch] || GLYPHS['?'];
    c = document.createElement('canvas');
    c.width = GLYPH_W * scale;
    c.height = GLYPH_H * scale;
    const g = c.getContext('2d');
    g.fillStyle = color;
    for (let y = 0; y < GLYPH_H; y++) {
      for (let x = 0; x < GLYPH_W; x++) {
        if (rows[y][x] === '#') g.fillRect(x * scale, y * scale, scale, scale);
      }
    }
    this.cache.set(key, c);
    return c;
  }

  /** Tinted copy of a blackletter atlas (colour multiplied over the ivory glyphs). */
  _tinted(set, color) {
    const key = `${set.cap}|${color}`;
    let c = this.tintCache.get(key);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = set.img.width; c.height = set.img.height;
    const g = c.getContext('2d');
    g.drawImage(set.img, 0, 0);
    if (color && color !== '#e8e2c8') {
      g.globalCompositeOperation = 'source-atop';
      g.fillStyle = color;
      g.fillRect(0, 0, c.width, c.height);
    }
    this.tintCache.set(key, c);
    return c;
  }

  /** Advance (px) of one character at a scale. */
  _advance(ch, scale, spacing, set) {
    if (set) {
      const m = this._mul(scale);
      if (ch === ' ') return Math.round(set.cap * SPACE_ADVANCE * m) + spacing;
      const gl = set.glyphs[ch];
      if (gl) return Math.round(gl.w * m) + LETTER_GAP * Math.max(1, Math.round(scale / 2)) + (spacing - 1);
    }
    return (GLYPH_W + spacing) * scale;
  }

  width(text, scale = 1, spacing = 1, gothic = true) {
    text = String(text).toUpperCase();
    const set = this._set(scale, gothic);
    let w = 0;
    for (const ch of text) w += this._advance(ch, scale, spacing, set);
    return Math.max(0, w - (set ? 0 : spacing * scale));
  }

  /** Cap height in px at a scale (for layout). */
  lineHeight(scale = 1, gothic = true) { const set = this._set(scale, gothic); return set ? Math.round(set.cap * this._mul(scale)) : GLYPH_H * scale; }

  /** Greedy word-wrap to a pixel width. */
  wrap(text, maxW, scale = 1, spacing = 1) {
    const words = String(text).split(' ');
    const lines = []; let cur = '';
    for (const wd of words) {
      const trial = cur ? cur + ' ' + wd : wd;
      if (cur && this.width(trial, scale, spacing) > maxW) { lines.push(cur); cur = wd; } else cur = trial;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  /** Draws text; align: 'left' | 'center' | 'right'. Optional shadow colour.
   *  gothic:false forces the plain pixel font even at large scales (menus). */
  draw(ctx, text, x, y, { color = '#e8e2c8', scale = 1, align = 'left', shadow = null, spacing = 1, gothic = true } = {}) {
    text = String(text).toUpperCase();
    const set = this._set(scale, gothic);
    const w = this.width(text, scale, spacing, gothic);
    let cx = align === 'center' ? x - Math.floor(w / 2) : align === 'right' ? x - w : x;
    cx = Math.round(cx);
    y = Math.round(y);
    const passes = shadow ? [[shadow, 1], [color, 0]] : [[color, 0]];
    for (const [col, off] of passes) {
      let px = cx;
      const dxy = off ? Math.max(1, Math.round(scale * 0.75)) : 0;
      for (const ch of text) {
        if (set && set.glyphs[ch]) {
          const gl = set.glyphs[ch];
          const m = this._mul(scale);
          const img = this._tinted(set, col);
          // Baseline sits one cap height below y; glyph tops are stored relative to the baseline.
          const gy = y + Math.round(set.cap * m) + Math.round(gl.dy * m);
          ctx.drawImage(img, gl.x, gl.y, gl.w, gl.h, px + dxy, gy + dxy, Math.round(gl.w * m), Math.round(gl.h * m));
        } else if (ch !== ' ') {
          // Fallback pixel glyph (arrows, heart, symbols), vertically centred on the cap height
          const gs = Math.max(1, Math.round(scale * (set ? set.cap / GLYPH_H * 0.85 : 1)));
          const g = this._glyphCanvas(ch, col, set ? Math.max(1, Math.round(scale * 1.2)) : scale);
          const gy = set ? y + Math.round((set.cap * this._mul(scale) - g.height) / 2) : y;
          ctx.drawImage(g, px + dxy, gy + dxy);
          void gs;
        }
        px += this._advance(ch, scale, spacing, set);
      }
    }
    return w;
  }
}
