// Procedural 32-bit pixel-art assets for Stage 2: The Darkwood.
// Registers crisp nearest-neighbor terrain strips, seamless parallax canopy,
// the Guardian Turtle companion, woodland enemies, The Briar King boss, and props.

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0);
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

class PixelBuf {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  px(x, y, r, g, b, a = 255) {
    x |= 0; y |= 0;
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    if (a >= 255 || this.data[i + 3] === 0) {
      this.data[i] = r; this.data[i + 1] = g; this.data[i + 2] = b; this.data[i + 3] = a;
    } else {
      const k = a / 255, ik = 1 - k;
      this.data[i] = (this.data[i] * ik + r * k) | 0;
      this.data[i + 1] = (this.data[i + 1] * ik + g * k) | 0;
      this.data[i + 2] = (this.data[i + 2] * ik + b * k) | 0;
      this.data[i + 3] = Math.min(255, this.data[i + 3] + a);
    }
  }

  rect(x, y, w, h, r, g, b, a = 255) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) this.px(xx, yy, r, g, b, a);
    }
  }

  disc(cx, cy, rx, ry, r, g, b, a = 255) {
    const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx);
    const y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x - cx) / rx, dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y, r, g, b, a);
      }
    }
  }

  line(x0, y0, x1, y1, thick, r, g, b, a = 255) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5));
    const rad = thick * 0.5;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      if (rad <= 0.7) this.px(Math.round(x), Math.round(y), r, g, b, a);
      else this.disc(x, y, rad, rad, r, g, b, a);
    }
  }

  /** Crisp 1px dark pixel-art outline around all opaque pixels in a sub-box. */
  outline(x0, y0, w, h, r = 8, g = 12, b = 18) {
    const copy = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const xx = x0 + x, yy = y0 + y;
        if (xx >= 0 && xx < this.w && yy >= 0 && yy < this.h) {
          copy[y * w + x] = this.data[(yy * this.w + xx) * 4 + 3] > 128 ? 1 : 0;
        }
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (copy[y * w + x]) continue;
        const n = (x > 0 && copy[y * w + x - 1]) || (x + 1 < w && copy[y * w + x + 1]) ||
                  (y > 0 && copy[(y - 1) * w + x]) || (y + 1 < h && copy[(y + 1) * w + x]);
        if (n) this.px(x0 + x, y0 + y, r, g, b, 255);
      }
    }
  }

  toCanvas() {
    const c = makeCanvas(this.w, this.h);
    const ctx = c.getContext('2d');
    ctx.putImageData(new ImageData(this.data, this.w, this.h), 0, 0);
    return c;
  }
}

// --------------------------------------------------------- Terrain Strips
function buildDarkwoodFloorStrip(seedShift = 0) {
  const W = 512, H = 134, OVER = 6;
  const pb = new PixelBuf(W, H);
  for (let x = 0; x < W; x++) {
    const h1 = hash2(x + seedShift, 11);
    const bladeTop = (h1 % 3 === 0) ? 0 : (h1 % 3 === 1 ? 1 : 2);
    const mossDepth = OVER + 7 + Math.round(Math.sin((x + seedShift) * 0.19) * 2.5 + Math.cos((x + seedShift) * 0.47) * 1.5);
    for (let y = bladeTop; y < H; y++) {
      const n = ((hash2(x + seedShift, y + 31) % 23) - 11);
      if (y < mossDepth) {
        // Lush emerald/teal moss & clover turf cap
        const k = (y - bladeTop) / Math.max(1, mossDepth - bladeTop);
        let r = (24 + (1 - k) * 26 + n * 0.7) | 0;
        let g = (76 + (1 - k) * 68 + n * 1.2) | 0;
        let b = (62 + (1 - k) * 44 + n * 0.9) | 0;
        if (y === mossDepth - 1) { r = 12; g = 34; b = 30; }
        else if ((hash2(x * 3 + seedShift, y * 5) % 41) === 0 && y < OVER + 5) {
          r = 98; g = 232; b = 186; // tiny bioluminescent dewdrop
        }
        pb.px(x, y, Math.max(0, r), Math.max(0, g), Math.max(0, b), 255);
      } else {
        // Stratified darkwood loam, root veins & embedded fieldstones
        const depthK = Math.min(1, (y - mossDepth) / 96);
        let r = (34 - depthK * 14 + n * 0.7) | 0;
        let g = (27 - depthK * 11 + n * 0.6) | 0;
        let b = (32 - depthK * 10 + n * 0.7) | 0;
        // Gnarled root bands winding horizontally
        const rootWave = Math.sin((x + seedShift) * 0.08 + y * 0.14) + Math.cos((x - seedShift) * 0.05 - y * 0.21);
        if (Math.abs(rootWave) < 0.24) {
          r += 18; g += 13; b += 7;
          if (Math.abs(rootWave) < 0.05 && ((x + y + seedShift) % 7 === 0)) {
            // Subtle glowing cyan mycelia filament along root bark
            r = 46; g = 168; b = 152;
          }
        }
        pb.px(x, y, Math.max(6, r), Math.max(6, g), Math.max(10, b), 255);
      }
    }
  }
  // Embedded mossy stones across the loam
  for (let i = 0; i < 36; i++) {
    const h = hash2(i + seedShift, 97);
    const cx = (h % (W - 24)) + 12;
    const cy = 22 + ((h >>> 8) % 98);
    const rx = 5 + (h % 6), ry = 3 + ((h >>> 4) % 4);
    pb.disc(cx, cy + 1, rx, ry, 14, 16, 24);
    pb.disc(cx, cy, rx, ry, 46, 56, 68);
    pb.disc(cx - 1, cy - 1, rx * 0.65, ry * 0.55, 68, 84, 96);
  }
  return pb.toCanvas();
}

// --------------------------------------------------- Seamless Canopy Layer
function buildDarkwoodCanopy() {
  const W = 640, H = 360;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  // Distant ancient trunk silhouettes (wrapped horizontally across W for seamless tiling)
  const drawWrapRect = (x, y, w, h, fill) => {
    g.fillStyle = fill;
    const xm = ((x % W) + W) % W;
    g.fillRect(xm, y, w, h);
    if (xm + w > W) g.fillRect(xm - W, y, w, h);
  };
  const drawWrapDisc = (x, y, rx, ry, fill) => {
    g.fillStyle = fill;
    const xm = ((x % W) + W) % W;
    for (const ox of [0, -W, W]) {
      if (xm + ox + rx < 0 || xm + ox - rx > W) continue;
      g.beginPath();
      g.ellipse(xm + ox, y, rx, ry, 0, 0, Math.PI * 2);
      g.fill();
    }
  };

  // Far cathedral trunks
  for (let i = 0; i < 14; i++) {
    const h = hash2(i, 303);
    const tx = Math.floor((i / 14) * W + (h % 22));
    const tw = 16 + (h % 18);
    drawWrapRect(tx, 18, tw, H - 18, '#0c1a22');
    drawWrapRect(tx + 2, 18, 3, H - 18, '#162d38');
    // Buttress roots at base
    drawWrapDisc(tx + tw * 0.5, H - 12, tw * 1.15, 22, '#0c1a22');
  }
  // Upper vaulted canopy foliage masses
  for (let i = 0; i < 38; i++) {
    const h = hash2(i, 509);
    const cx = (h % W);
    const cy = 8 + ((h >>> 7) % 108);
    const rx = 34 + (h % 36), ry = 18 + ((h >>> 4) % 20);
    drawWrapDisc(cx, cy + 4, rx, ry, '#08131a');
    drawWrapDisc(cx, cy, rx * 0.9, ry * 0.85, (i % 2 === 0) ? '#10272e' : '#143339');
  }
  // Hanging Spanish-moss curtains & glowing spore clusters
  for (let i = 0; i < 46; i++) {
    const h = hash2(i, 719);
    const vx = h % W;
    const vy = 32 + ((h >>> 5) % 86);
    const vlen = 24 + ((h >>> 10) % 52);
    drawWrapRect(vx, vy, 2, vlen, '#173c3c');
    drawWrapRect(vx + 1, vy + 6, 1, vlen - 8, '#28645c');
    if (i % 3 === 0) {
      drawWrapRect(vx, vy + vlen, 2, 2, '#62f2c2');
    }
  }
  return c;
}

// ----------------------------------------------- Guardian Turtle Companion
function buildTurtleSheet(frames) {
  const pb = new PixelBuf(184, 64);
  // Row 0: walk0..walk3 (each 42x30, right-facing!)
  for (let f = 0; f < 4; f++) {
    const ox = f * 44, oy = 2;
    const stepA = (f === 0 ? -2 : f === 1 ? 0 : f === 2 ? 2 : 0);
    const stepB = -stepA;
    const bob = (f % 2 === 1) ? -1 : 0;

    // Back legs (darker sage-green)
    pb.rect(ox + 9 + stepB, oy + 21, 5, 7, 36, 82, 66);
    pb.rect(ox + 23 + stepA, oy + 21, 5, 7, 36, 82, 66);
    // Stubby tail on left
    pb.line(ox + 3, oy + 19 + bob, ox + 7, oy + 18 + bob, 2.4, 54, 118, 88);
    // Domed ancient mossy rune-carapace
    pb.disc(ox + 18, oy + 15 + bob, 13, 9.5, 22, 68, 58);
    pb.disc(ox + 18, oy + 14 + bob, 11.5, 8, 36, 108, 84);
    pb.disc(ox + 17, oy + 11 + bob, 8.5, 5, 58, 148, 110);
    // Scute seams
    pb.line(ox + 13, oy + 8 + bob, ox + 12, oy + 19 + bob, 1, 18, 48, 42);
    pb.line(ox + 23, oy + 8 + bob, ox + 24, oy + 19 + bob, 1, 18, 48, 42);
    pb.line(ox + 8, oy + 14 + bob, ox + 28, oy + 14 + bob, 1, 18, 48, 42);
    // Glowing emerald/cyan guardian rune on central scute
    pb.rect(ox + 16, oy + 11 + bob, 4, 5, 102, 248, 204);
    pb.px(ox + 17, oy + 10 + bob, 188, 255, 236);
    pb.px(ox + 18, oy + 16 + bob, 188, 255, 236);
    // Warm golden-ivory shell rim & plastron
    pb.rect(ox + 6, oy + 19 + bob, 24, 3, 198, 168, 98);
    pb.rect(ox + 7, oy + 20 + bob, 22, 2, 232, 206, 136);
    // Front legs (closer to viewer)
    pb.rect(ox + 11 + stepA, oy + 21, 5, 8, 58, 132, 98);
    pb.rect(ox + 14 + stepA, oy + 27, 3, 2, 224, 210, 164); // claws
    pb.rect(ox + 24 + stepB, oy + 21, 5, 8, 58, 132, 98);
    pb.rect(ox + 27 + stepB, oy + 27, 3, 2, 224, 210, 164);
    // Sturdy expressive turtle head on RIGHT (+x)
    pb.line(ox + 28, oy + 17 + bob, ox + 33, oy + 15 + bob, 5, 52, 126, 94);
    pb.disc(ox + 35, oy + 14 + bob, 5.2, 4.4, 68, 152, 112);
    pb.disc(ox + 34, oy + 12 + bob, 3.5, 2.2, 98, 188, 138);
    // Determined brow + bright golden eye facing right
    pb.rect(ox + 35, oy + 12 + bob, 3, 3, 255, 214, 92);
    pb.px(ox + 37, oy + 13 + bob, 18, 20, 28);
    pb.px(ox + 36, oy + 12 + bob, 255, 255, 255);
    pb.line(ox + 35, oy + 16 + bob, ox + 39, oy + 16 + bob, 1, 26, 62, 48);

    pb.outline(ox, oy, 42, 30);
    frames[`walk${f}`] = { x: ox, y: oy, w: 42, h: 30, ax: 21, ay: 30 };
  }

  // Row 1: shell0..shell3 (each 38x26, spinning armored emerald rune-shell!)
  for (let f = 0; f < 4; f++) {
    const ox = f * 44, oy = 35;
    pb.disc(ox + 19, oy + 13, 14, 10, 24, 78, 66);
    pb.disc(ox + 19, oy + 12, 12, 8.2, 42, 128, 98);
    pb.disc(ox + 19, oy + 10, 8.5, 5.2, 74, 178, 134);
    // Spinning scute ribs + rune glow shifting phase across f=0..3
    const phase = (f / 4) * Math.PI * 2;
    for (let k = 0; k < 3; k++) {
      const sx = ox + 19 + Math.round(Math.cos(phase + k * 2.09) * 8);
      pb.line(sx, oy + 5, sx, oy + 18, 1.4, 18, 52, 44);
      pb.rect(sx - 1, oy + 10, 3, 4, 112, 255, 212);
    }
    // Golden shell belt spinning blur
    pb.rect(ox + 5, oy + 15, 28, 3, 224, 192, 114);
    pb.rect(ox + 6 + (f * 4) % 14, oy + 15, 8, 2, 255, 242, 184);
    // Cyan kinetic energy rim highlights
    pb.px(ox + 4, oy + 13, 120, 255, 220);
    pb.px(ox + 33, oy + 13, 120, 255, 220);

    pb.outline(ox, oy, 38, 26);
    frames[`shell${f}`] = { x: ox, y: oy, w: 38, h: 26, ax: 19, ay: 26 };
  }
  return pb.toCanvas();
}

// --------------------------------------------------- Darkwood Forest Foes
function buildDarkwoodFoesSheet(frames) {
  const pb = new PixelBuf(208, 118);

  // 1. BriarWolf: wolf_walk0..2, wolf_lunge (each 48x34, right-facing!)
  for (let f = 0; f < 4; f++) {
    const ox = f * 50, oy = 2;
    const lunge = f === 3;
    const stride = lunge ? 5 : (f === 0 ? -3 : f === 1 ? 0 : 3);
    const bodyY = oy + (lunge ? 13 : 16);

    // Bushy briar-tufted tail on left
    pb.line(ox + 3, bodyY - 2, ox + 11, bodyY + 2, 4, 34, 38, 58);
    pb.line(ox + 2, bodyY - 4, ox + 8, bodyY, 2, 58, 72, 92);
    // Hind & fore legs
    pb.line(ox + 13, bodyY + 5, ox + 10 - stride, oy + (lunge ? 25 : 32), 4, 28, 32, 48);
    pb.line(ox + 17, bodyY + 5, ox + 16 + stride, oy + (lunge ? 27 : 32), 4, 42, 48, 70);
    pb.line(ox + 29, bodyY + 5, ox + 31 - stride, oy + (lunge ? 26 : 32), 4, 28, 32, 48);
    pb.line(ox + 32, bodyY + 4, ox + (lunge ? 42 : 34 + stride), oy + (lunge ? 22 : 32), 4, 46, 54, 78);
    // Lean torso & muscular shoulders
    pb.disc(ox + 21, bodyY + 2, 11, 6, 36, 42, 64);
    pb.disc(ox + 29, bodyY, 8.5, 6.8, 46, 54, 80);
    // Mossy briar-thorn ridge along spine
    for (let s = 0; s < 5; s++) {
      const sx = ox + 13 + s * 4;
      pb.line(sx, bodyY - 4, sx - 2, bodyY - 8, 1.6, 46, 118, 86);
      pb.px(sx - 2, bodyY - 8, 122, 214, 158);
    }
    // Snarling wolf head on RIGHT (+x)
    const hx = ox + (lunge ? 38 : 36), hy = bodyY - 4;
    pb.disc(hx, hy, 6, 5, 52, 60, 88);
    // Pointed ears
    pb.line(hx - 3, hy - 3, hx - 5, hy - 9, 2.2, 42, 48, 72);
    pb.line(hx, hy - 3, hx - 1, hy - 9, 2.2, 58, 66, 94);
    // Snout & open jaws with white fangs
    pb.rect(hx + 2, hy - 2, 8, 4, 60, 68, 98);
    pb.rect(hx + 2, hy + 2, 7, 2, 34, 24, 38);
    pb.px(hx + 5, hy + 1, 245, 242, 230);
    pb.px(hx + 8, hy + 1, 245, 242, 230);
    // Glowing amber-gold predator eye
    pb.rect(hx + 1, hy - 2, 3, 2, 255, 196, 62);
    pb.px(hx + 2, hy - 2, 255, 248, 190);

    pb.outline(ox, oy, 48, 34);
    frames[lunge ? 'wolf_lunge' : `wolf_walk${f}`] = { x: ox, y: oy, w: 48, h: 34, ax: 24, ay: 34 };
  }

  // 2. Sporecap Myconid: shroom_walk0, shroom_walk1, shroom_puff (each 34x38, right-facing!)
  for (let f = 0; f < 3; f++) {
    const ox = f * 40, oy = 40;
    const puff = f === 2;
    const squat = puff ? 3 : (f === 1 ? 1 : 0);
    const legShift = f === 0 ? -2 : (f === 1 ? 2 : 0);

    // Stubby root feet
    pb.rect(ox + 11 + legShift, oy + 31, 4, 6, 152, 142, 126);
    pb.rect(ox + 19 - legShift, oy + 31, 4, 6, 178, 166, 148);
    // Pale fibrous stalk torso
    pb.disc(ox + 17, oy + 25 + squat * 0.5, puff ? 8.5 : 7, 8 - squat * 0.4, 206, 196, 178);
    pb.disc(ox + 16, oy + 25 + squat * 0.5, 5, 6, 228, 220, 204);
    // Glowing amber eyes on right side of stalk
    pb.rect(ox + 17, oy + 22 + squat, 2, 3, 24, 18, 36);
    pb.rect(ox + 21, oy + 22 + squat, 2, 3, 24, 18, 36);
    pb.px(ox + 18, oy + 23 + squat, 255, 206, 82);
    pb.px(ox + 22, oy + 23 + squat, 255, 206, 82);
    // Gills under mushroom cap
    pb.disc(ox + 17, oy + 17 + squat, puff ? 14.5 : 13, 4, 56, 42, 78);
    // Scalloped teal-violet bioluminescent mushroom cap
    pb.disc(ox + 17, oy + 12 + squat, puff ? 15 : 13.5, puff ? 8.5 : 9.5, 44, 78, 112);
    pb.disc(ox + 17, oy + 10 + squat, puff ? 12.5 : 11, 7, 54, 124, 138);
    pb.disc(ox + 15, oy + 8 + squat, 7.5, 4.2, 76, 174, 168);
    // Glowing cyan/emerald spots on cap
    for (const [sx, sy, sr] of [[-7, 2, 2], [-1, -2, 2.4], [6, 1, 2], [2, 4, 1.6]]) {
      pb.disc(ox + 17 + sx, oy + 10 + squat + sy, sr, sr * 0.8, 132, 252, 214);
    }
    if (puff) {
      // Spore burst cloud pixels around cap rim
      for (const [sx, sy] of [[-13, -3], [13, -2], [-10, -8], [10, -7]]) {
        pb.disc(ox + 17 + sx, oy + 12 + sy, 2, 2, 152, 255, 224);
      }
    }

    pb.outline(ox, oy, 34, 38);
    frames[puff ? 'shroom_puff' : `shroom_walk${f}`] = { x: ox, y: oy, w: 34, h: 38, ax: 17, ay: 38 };
  }

  // 3. NightOwl: owl_fly0..2 (each 44x32, right-facing!)
  for (let f = 0; f < 3; f++) {
    const ox = f * 48, oy = 82;
    // Far wing & near wing sweep (f=0 up, f=1 level, f=2 down)
    const wingY = f === 0 ? -9 : (f === 1 ? -1 : 7);
    pb.line(ox + 18, oy + 15, ox + 6, oy + 14 + wingY, 6, 44, 48, 68);
    pb.line(ox + 22, oy + 16, ox + 11, oy + 16 + wingY, 7, 68, 62, 86);
    pb.line(ox + 18, oy + 16, ox + 7, oy + 18 + wingY, 3, 108, 96, 126);
    // Tail feathers on left
    pb.line(ox + 5, oy + 19, ox + 14, oy + 18, 4.5, 52, 48, 68);
    // Owl plump feathered body & talons
    pb.disc(ox + 22, oy + 18, 9, 6.5, 76, 68, 92);
    pb.disc(ox + 23, oy + 19, 6.5, 4.5, 138, 128, 148);
    pb.rect(ox + 21, oy + 24, 3, 3, 218, 178, 86);
    pb.rect(ox + 25, oy + 24, 3, 3, 218, 178, 86);
    // Horned owl head on RIGHT (+x)
    pb.disc(ox + 31, oy + 14, 6, 5.5, 84, 76, 104);
    pb.line(ox + 28, oy + 10, ox + 25, oy + 5, 2, 58, 52, 76); // horn tuft
    pb.line(ox + 33, oy + 10, ox + 35, oy + 5, 2, 58, 52, 76);
    // Glowing golden owl eyes & hooked beak
    pb.disc(ox + 33, oy + 14, 2.2, 2.2, 255, 214, 74);
    pb.px(ox + 34, oy + 14, 20, 18, 28);
    pb.line(ox + 36, oy + 15, ox + 39, oy + 17, 2, 212, 174, 86);

    pb.outline(ox, oy, 44, 32);
    frames[`owl_fly${f}`] = { x: ox, y: oy, w: 44, h: 32, ax: 22, ay: 26 };
  }

  return pb.toCanvas();
}

// ----------------------------------------- The Briar King (ElderTreant Boss)
function buildTreantSheet(frames) {
  const pb = new PixelBuf(384, 138);
  const names = ['idle0', 'idle1', 'slam', 'roar'];
  for (let f = 0; f < 4; f++) {
    const ox = f * 96, oy = 1;
    const sway = f === 1 ? 2 : 0;
    const slam = f === 2;
    const roar = f === 3;
    const bodyDrop = slam ? 6 : 0;

    // Gnarled root-pillar legs anchoring into the forest floor
    pb.line(ox + 32, oy + 96 + bodyDrop, ox + 18, oy + 133, 11, 38, 30, 34);
    pb.line(ox + 48, oy + 98 + bodyDrop, ox + 46, oy + 134, 12, 48, 38, 40);
    pb.line(ox + 62, oy + 96 + bodyDrop, ox + 78, oy + 133, 11, 56, 44, 44);
    // Root highlights
    pb.line(ox + 29, oy + 98 + bodyDrop, ox + 18, oy + 131, 3, 76, 62, 56);
    pb.line(ox + 64, oy + 98 + bodyDrop, ox + 76, oy + 131, 3, 86, 70, 62);

    // Massive furrowed ancient hollow trunk
    pb.disc(ox + 48 + sway, oy + 72 + bodyDrop, 23, 34, 44, 34, 38);
    pb.disc(ox + 49 + sway, oy + 70 + bodyDrop, 19, 30, 64, 50, 48);
    // Vertical bark ridges
    for (let bx = -14; bx <= 14; bx += 7) {
      pb.line(ox + 48 + sway + bx, oy + 40 + bodyDrop, ox + 48 + bx * 1.15, oy + 102 + bodyDrop, 2, 30, 22, 28);
      pb.line(ox + 50 + sway + bx, oy + 42 + bodyDrop, ox + 50 + bx * 1.15, oy + 100 + bodyDrop, 1.4, 88, 72, 62);
    }

    // Twisted antler-bough crown & emerald moss canopy
    const crownY = oy + 34 + bodyDrop;
    pb.line(ox + 40 + sway, crownY, ox + 16, crownY - (roar ? 28 : 22), 7, 54, 42, 42);
    pb.line(ox + 16, crownY - 22, ox + 8, crownY - 30, 4, 68, 54, 48);
    pb.line(ox + 56 + sway, crownY, ox + 80, crownY - (roar ? 28 : 22), 7, 62, 48, 46);
    pb.line(ox + 80, crownY - 22, ox + 88, crownY - 30, 4, 78, 62, 54);
    pb.disc(ox + 30 + sway, crownY - 12, 16, 10, 24, 72, 58);
    pb.disc(ox + 64 + sway, crownY - 12, 16, 10, 28, 86, 68);
    pb.disc(ox + 48 + sway, crownY - 16, 20, 11, 38, 112, 86);
    pb.disc(ox + 48 + sway, crownY - 19, 14, 7, 64, 158, 116);
    // Glowing cyan/emerald spore clusters in crown
    for (const dx of [-18, -4, 10, 22]) {
      pb.disc(ox + 48 + sway + dx, crownY - 15, 2.5, 2.5, 118, 255, 212);
    }

    // Hollow heartwood face (shifted slightly RIGHT for clear right-facing silhouette!)
    const fx = ox + 53 + sway, fy = oy + 58 + bodyDrop;
    // Blazing emerald/amber eyes
    pb.disc(fx - 6, fy - 5, 4, 3, 18, 12, 20);
    pb.disc(fx + 6, fy - 5, 4.5, 3, 18, 12, 20);
    const eyeR = roar ? 255 : 112, eyeG = 252, eyeB = roar ? 104 : 196;
    pb.disc(fx - 5, fy - 5, 2.5, 1.8, eyeR, eyeG, eyeB);
    pb.disc(fx + 7, fy - 5, 2.8, 1.8, eyeR, eyeG, eyeB);
    // Jagged hollow bark maw
    pb.disc(fx + 1, fy + 8, 10, roar ? 9 : 6, 16, 10, 18);
    pb.disc(fx + 2, fy + 8, 6.5, roar ? 6 : 3.5, 62, 186, 146);
    // Bark fangs lining maw
    for (const tx of [-6, -1, 4, 8]) {
      pb.line(fx + tx, fy + 2, fx + tx, fy + 5, 2, 92, 74, 62);
      pb.line(fx + tx, fy + (roar ? 15 : 12), fx + tx, fy + (roar ? 12 : 9), 2, 92, 74, 62);
    }

    // Heavy clawed briar-branch arms
    const armY = slam ? oy + 124 : (roar ? oy + 46 : oy + 82 + sway);
    pb.line(ox + 28 + sway, oy + 56 + bodyDrop, ox + 10, armY, 9, 52, 40, 42);
    pb.line(ox + 68 + sway, oy + 56 + bodyDrop, ox + 86, armY, 9, 68, 54, 50);
    // Mossy shoulder pads & thorny claws
    pb.disc(ox + 26 + sway, oy + 52 + bodyDrop, 9, 6, 36, 104, 78);
    pb.disc(ox + 70 + sway, oy + 52 + bodyDrop, 9, 6, 44, 122, 90);
    for (const c of [-4, 0, 4]) {
      pb.line(ox + 10 + c, armY, ox + 8 + c * 1.4, armY + 9, 2.4, 118, 98, 78);
      pb.line(ox + 86 + c, armY, ox + 88 + c * 1.4, armY + 9, 2.4, 134, 112, 88);
    }

    pb.outline(ox, oy, 96, 136);
    frames[names[f]] = { x: ox, y: oy, w: 96, h: 136, ax: 48, ay: 136 };
  }
  return pb.toCanvas();
}

// ------------------------------------------------------ Darkwood Stage Props
function buildDarkwoodPropsSheet(frames) {
  const pb = new PixelBuf(140, 68);

  // 1. moss_lantern (24x64)
  {
    const ox = 2, oy = 2;
    pb.line(ox + 10, oy + 62, ox + 10, oy + 10, 3.5, 58, 46, 42);
    pb.line(ox + 10, oy + 10, ox + 18, oy + 14, 3, 58, 46, 42);
    pb.disc(ox + 10, oy + 60, 6, 3, 36, 96, 72); // mossy base
    // Hanging emerald lantern cage
    pb.line(ox + 17, oy + 14, ox + 17, oy + 20, 1.4, 92, 104, 118);
    pb.rect(ox + 13, oy + 20, 9, 11, 34, 42, 54);
    pb.rect(ox + 15, oy + 22, 5, 7, 104, 252, 204);
    pb.rect(ox + 16, oy + 24, 3, 4, 224, 255, 242);
    pb.outline(ox, oy, 24, 64);
    frames.moss_lantern = { x: ox, y: oy, w: 24, h: 64, ax: 12, ay: 64 };
  }

  // 2. glow_shrooms (30x26)
  {
    const ox = 30, oy = 40;
    const caps = [[8, 15, 5, 4], [16, 10, 7, 5], [23, 17, 4.5, 3.5]];
    for (const [cx, cy, rx, ry] of caps) {
      pb.line(ox + cx, oy + cy + 2, ox + cx, oy + 24, 2.5, 188, 182, 168);
      pb.disc(ox + cx, oy + cy, rx, ry, 42, 118, 126);
      pb.disc(ox + cx - 1, oy + cy - 1, rx * 0.65, ry * 0.6, 106, 248, 208);
    }
    pb.disc(ox + 15, oy + 24, 11, 2.5, 32, 88, 68);
    pb.outline(ox, oy, 30, 26);
    frames.glow_shrooms = { x: ox, y: oy, w: 30, h: 26, ax: 15, ay: 26 };
  }

  // 3. elder_stump (40x28)
  {
    const ox = 64, oy = 38;
    pb.line(ox + 10, oy + 10, ox + 4, oy + 26, 6, 56, 44, 42);
    pb.line(ox + 20, oy + 10, ox + 20, oy + 26, 10, 68, 54, 48);
    pb.line(ox + 30, oy + 10, ox + 36, oy + 26, 6, 52, 40, 40);
    pb.disc(ox + 20, oy + 9, 13, 4.5, 126, 102, 78);
    pb.disc(ox + 20, oy + 9, 9, 3, 94, 74, 58);
    pb.disc(ox + 12, oy + 14, 6, 3, 44, 122, 88); // moss patch
    pb.disc(ox + 31, oy + 18, 3.5, 2.5, 96, 242, 198); // shelf fungus
    pb.outline(ox, oy, 40, 28);
    frames.elder_stump = { x: ox, y: oy, w: 40, h: 28, ax: 20, ay: 28 };
  }

  // 4. ancient_totem (28x58)
  {
    const ox = 108, oy = 8;
    pb.rect(ox + 7, oy + 8, 14, 48, 58, 68, 82);
    pb.disc(ox + 14, oy + 8, 7, 5, 76, 88, 104);
    pb.rect(ox + 9, oy + 10, 4, 44, 82, 96, 112);
    // Moss cap & glowing carved woodland runes
    pb.disc(ox + 12, oy + 7, 6, 3.5, 42, 118, 86);
    pb.disc(ox + 14, oy + 54, 9, 3, 34, 96, 70);
    for (let ry = 18; ry <= 40; ry += 7) {
      pb.rect(ox + 12, oy + ry, 4, 3, 98, 248, 202);
    }
    pb.outline(ox, oy, 28, 58);
    frames.ancient_totem = { x: ox, y: oy, w: 28, h: 58, ax: 14, ay: 58 };
  }

  return pb.toCanvas();
}

export function registerDarkwoodAssets(assets) {
  if (!assets) return;
  if (!assets.atlas) assets.atlas = {};
  if (!assets.images) assets.images = {};
  // Generated pixel art (assets/atlas.json via tools/generate_darkwood.sh +
  // tools/process_assets.py) takes precedence; the procedural sheets below are
  // only a fallback for any Darkwood asset missing from the atlas.
  const missing = (n) => !assets.atlas[n];
  const canDraw = typeof document !== 'undefined';

  const turtleFrames = {};
  for (let f = 0; f < 4; f++) {
    turtleFrames[`walk${f}`] = { x: f * 44, y: 2, w: 42, h: 30, ax: 21, ay: 30 };
    turtleFrames[`shell${f}`] = { x: f * 44, y: 35, w: 38, h: 26, ax: 19, ay: 26 };
  }
  const wolfFrames = {
    walk0: { x: 0, y: 2, w: 48, h: 34, ax: 24, ay: 34 },
    walk1: { x: 50, y: 2, w: 48, h: 34, ax: 24, ay: 34 },
    walk2: { x: 100, y: 2, w: 48, h: 34, ax: 24, ay: 34 },
    lunge: { x: 150, y: 2, w: 48, h: 34, ax: 24, ay: 34 },
  };
  const shroomFrames = {
    walk0: { x: 0, y: 40, w: 34, h: 38, ax: 17, ay: 38 },
    walk1: { x: 40, y: 40, w: 34, h: 38, ax: 17, ay: 38 },
    puff: { x: 80, y: 40, w: 34, h: 38, ax: 17, ay: 38 },
  };
  const owlFrames = {
    fly0: { x: 0, y: 82, w: 44, h: 32, ax: 22, ay: 26 },
    fly1: { x: 48, y: 82, w: 44, h: 32, ax: 22, ay: 26 },
    fly2: { x: 96, y: 82, w: 44, h: 32, ax: 22, ay: 26 },
  };
  const treantFrames = {
    idle0: { x: 0, y: 1, w: 96, h: 136, ax: 48, ay: 136 },
    idle1: { x: 96, y: 1, w: 96, h: 136, ax: 48, ay: 136 },
    slam: { x: 192, y: 1, w: 96, h: 136, ax: 48, ay: 136 },
    roar: { x: 288, y: 1, w: 96, h: 136, ax: 48, ay: 136 },
  };
  const propFrames = {
    moss_lantern: { x: 2, y: 2, w: 24, h: 64, ax: 12, ay: 64 },
    glow_shrooms: { x: 30, y: 40, w: 30, h: 26, ax: 15, ay: 26 },
    elder_stump: { x: 64, y: 38, w: 40, h: 28, ax: 20, ay: 28 },
    ancient_totem: { x: 108, y: 8, w: 28, h: 58, ax: 14, ay: 58 },
  };

  if (missing('darkwoodfloor')) {
    assets.atlas.darkwoodfloor = { file: '__proc_darkwoodfloor', type: 'strip', w: 512, h: 134, tile: 32, overhang: 6 };
    if (canDraw) assets.images.darkwoodfloor = buildDarkwoodFloorStrip(0);
  }
  if (missing('darkwoodfloor_b')) {
    assets.atlas.darkwoodfloor_b = { file: '__proc_darkwoodfloor_b', type: 'strip', w: 512, h: 134, tile: 32, overhang: 6 };
    if (canDraw) assets.images.darkwoodfloor_b = buildDarkwoodFloorStrip(137);
  }
  if (missing('darkwood_canopy')) {
    assets.atlas.darkwood_canopy = { file: '__proc_darkwood_canopy', type: 'texture', w: 640, h: 360 };
    if (canDraw) assets.images.darkwood_canopy = buildDarkwoodCanopy();
  }
  if (missing('turtle')) {
    assets.atlas.turtle = { file: '__proc_turtle', type: 'sheet', w: 184, h: 64, frames: turtleFrames };
    if (canDraw) assets.images.turtle = buildTurtleSheet(turtleFrames);
  }
  if (missing('wolf') || missing('sporecap') || missing('owl')) {
    const merged = {};
    const foes = canDraw ? buildDarkwoodFoesSheet(merged) : null;
    if (missing('wolf')) {
      assets.atlas.wolf = { file: '__proc_wolf', type: 'sheet', w: 208, h: 118, frames: wolfFrames };
      if (foes) assets.images.wolf = foes;
    }
    if (missing('sporecap')) {
      assets.atlas.sporecap = { file: '__proc_sporecap', type: 'sheet', w: 208, h: 118, frames: shroomFrames };
      if (foes) assets.images.sporecap = foes;
    }
    if (missing('owl')) {
      assets.atlas.owl = { file: '__proc_owl', type: 'sheet', w: 208, h: 118, frames: owlFrames };
      if (foes) assets.images.owl = foes;
    }
  }
  if (missing('treant')) {
    assets.atlas.treant = { file: '__proc_treant', type: 'sheet', w: 384, h: 138, frames: treantFrames };
    if (canDraw) assets.images.treant = buildTreantSheet(treantFrames);
  }
  if (missing('darkwood_props')) {
    assets.atlas.darkwood_props = { file: '__proc_darkwood_props', type: 'sheet', w: 140, h: 68, frames: propFrames };
    if (canDraw) assets.images.darkwood_props = buildDarkwoodPropsSheet(propFrames);
  }
}
