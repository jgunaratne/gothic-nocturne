// Procedural shader layers (WebGL) composited into the 2D draw order:
//   clouds  - drifting FBM cloud banks behind the parallax (moonlit, per theme)
//   water   - flowing / frozen water surface overlaid on the 3D ground planes
//   fire    - living flame quads for torches, candelabra, chandeliers & fire pools
//   fog     - low rolling foreground mist in front of the action
// Each layer renders into a shared transparent WebGL canvas (premultiplied
// alpha) and is blitted into the 2D canvas with drawImage, so it lands exactly
// where the scene's draw order asks for it. Disabled automatically without WebGL.

import { W, H } from './constants.js';

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const NOISE = `
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + vec2(17.0, 9.0); a *= 0.5; }
  return v;
}
`;

const CLOUD_FRAG = `
precision mediump float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uScroll;
uniform vec3 uColor;
uniform vec3 uShade;
uniform float uDensity;
uniform float uTop;      // y (px) where cloud band starts fading in
uniform float uBottom;   // y (px) horizon where it fades out
${NOISE}
void main() {
  vec2 px = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);
  if (px.y > uBottom) discard;
  // Two drifting layers at different depths, stretched horizontally like cloud banks
  vec2 p1 = vec2((px.x + uScroll * 0.5 + uTime * 6.0) / 260.0, px.y / 90.0);
  vec2 p2 = vec2((px.x + uScroll * 0.9 + uTime * 11.0) / 150.0, px.y / 60.0 + 3.0);
  float n = fbm(p1) * 0.65 + fbm(p2) * 0.45;
  float band = smoothstep(uTop, uTop + 40.0, px.y) * (1.0 - smoothstep(uBottom - 60.0, uBottom, px.y));
  float d = smoothstep(0.52 - uDensity * 0.2, 0.78, n) * band;
  // Silver-lit tops, darker bellies
  float lit = smoothstep(0.55, 0.9, fbm(p1 + vec2(0.0, -0.25)));
  vec3 col = mix(uShade, uColor, lit);
  // Quantise to keep the pixel-art feel
  d = floor(d * 5.0) / 5.0 * 0.55;
  gl_FragColor = vec4(col * d, d);
}
`;

const FOG_FRAG = `
precision mediump float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uScroll;
uniform vec3 uColor;
uniform float uAmount;
uniform float uFloor;    // screen y of the ground the fog hugs
${NOISE}
void main() {
  vec2 px = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);
  float h = uFloor - px.y;                 // height above the floor line
  if (h < -40.0 || h > 120.0) discard;
  vec2 p = vec2((px.x + uScroll * 1.15 + uTime * 14.0) / 120.0, px.y / 70.0 + uTime * 0.05);
  float n = fbm(p) * 0.7 + fbm(p * 2.2 + vec2(uTime * 0.08, 0.0)) * 0.3;
  float body = (1.0 - smoothstep(0.0, 110.0, h)) * smoothstep(-40.0, 10.0, h);
  float a = smoothstep(0.38, 0.75, n) * body * uAmount;
  a = floor(a * 6.0) / 6.0;
  gl_FragColor = vec4(uColor * a, a);
}
`;

const WATER_FRAG = `
precision mediump float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uScroll;
uniform float uHorizon;  // screen y of the far edge
uniform vec3 uTint;      // water body tint
uniform vec3 uSpec;      // highlight colour
uniform float uFrozen;   // 1 = ice (slow sparkle), 0 = flowing
uniform float uAlpha;
${NOISE}
void main() {
  vec2 px = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);
  float dy = px.y - uHorizon;
  if (dy < 0.0) discard;
  // Perspective: rows nearer the camera cover less world depth
  float z = 110.0 / max(1.0, dy);
  float wx = (px.x - uRes.x * 0.5) * z * 0.9 + uScroll * 0.9;
  float wz = 180.0 / max(0.2, z);
  float flow = uTime * mix(26.0, 3.0, uFrozen);
  float n1 = fbm(vec2(wx / 48.0, (wz + flow) / 40.0));
  float n2 = fbm(vec2(wx / 22.0 + 7.0, (wz + flow * 1.6) / 18.0));
  float ripple = n1 * 0.6 + n2 * 0.4;
  // Specular streaks where ripples crest, broader near the horizon (moon path)
  float crest = smoothstep(0.58, 0.72, ripple) * (0.35 + 0.65 * smoothstep(0.0, 60.0, dy));
  float moon = exp(-abs(px.x - uRes.x * 0.56) / (40.0 + dy * 0.9)) * (1.0 - smoothstep(0.0, 160.0, dy)) * 0.5;
  float depthFade = smoothstep(0.0, 22.0, dy);
  vec3 col = uTint * (0.35 + 0.35 * ripple) + uSpec * (crest * 0.8 + moon);
  float a = (0.18 + 0.4 * crest + moon * 0.6) * uAlpha * depthFade;
  // Banded like painted pixel water
  col = floor(col * 10.0) / 10.0;
  a = floor(a * 8.0) / 8.0;
  gl_FragColor = vec4(col * a, a);
}
`;

const FIRE_FRAG = `
precision mediump float;
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
const int MAXF = 40;
uniform vec4 uFlames[MAXF];   // x, y(base), w, h  (screen px)
uniform vec4 uFlameCol[MAXF]; // r,g,b, seed
uniform int uCount;
${NOISE}
void main() {
  vec2 px = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);
  vec3 acc = vec3(0.0);
  float aacc = 0.0;
  for (int i = 0; i < MAXF; i++) {
    if (i >= uCount) break;
    vec4 f = uFlames[i];
    vec2 d = vec2((px.x - f.x) / (f.z * 0.5), (f.y - px.y) / f.w);  // d.y: 0 base .. 1 tip
    if (abs(d.x) > 1.2 || d.y < -0.05 || d.y > 1.2) continue;
    float seed = uFlameCol[i].w;
    // Rising turbulence, narrower toward the tip
    float n = fbm(vec2(d.x * 1.6 + seed, d.y * 2.2 - uTime * (2.4 + fract(seed) * 1.5) + seed * 3.0));
    float width = mix(1.0, 0.18, d.y) * (0.75 + 0.5 * n);
    float body = 1.0 - smoothstep(width * 0.55, width, abs(d.x + (n - 0.5) * 0.5 * d.y));
    float tip = 1.0 - smoothstep(0.65 + 0.3 * n, 1.05, d.y);
    float a = body * tip * smoothstep(-0.05, 0.1, d.y);
    if (a <= 0.02) continue;
    float core = smoothstep(0.35, 0.95, a) * (1.0 - d.y * 0.7);
    vec3 base = uFlameCol[i].rgb;
    vec3 col = mix(base * 0.8, vec3(1.0, 0.96, 0.78), core);
    a = floor(a * 4.0) / 4.0 * 0.95;
    acc = max(acc, col * a);
    aacc = max(aacc, a);
  }
  if (aacc <= 0.0) discard;
  gl_FragColor = vec4(acc, aacc);
}
`;

const CLOUD_THEMES = {
  graveyard: { color: [0.62, 0.66, 0.82], shade: [0.16, 0.15, 0.28], density: 0.55, top: 0, bottom: 150 },
  ramparts: { color: [0.60, 0.65, 0.84], shade: [0.15, 0.15, 0.28], density: 0.6, top: 0, bottom: 150 },
  darkwood: { color: [0.36, 0.60, 0.58], shade: [0.06, 0.14, 0.14], density: 0.5, top: 0, bottom: 120 },
  forest: { color: [0.72, 0.52, 0.40], shade: [0.18, 0.11, 0.14], density: 0.5, top: 0, bottom: 140 },
  yule: { color: [0.72, 0.80, 0.95], shade: [0.14, 0.18, 0.34], density: 0.7, top: 0, bottom: 150 },
};

export class FxLayers {
  constructor() {
    this.ok = false; this.enabled = false; this.time = 0;
    this.flames = [];
    try { this.init(); } catch (e) { console.warn('FxLayers disabled:', e); this.ok = false; }
  }

  init() {
    if (typeof document === 'undefined') throw new Error('no document');
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const gl = c.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('no webgl');
    this.canvas = c; this.gl = gl;
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.quad = quad;
    this.pCloud = this.program(VERT, CLOUD_FRAG);
    this.pFog = this.program(VERT, FOG_FRAG);
    this.pWater = this.program(VERT, WATER_FRAG);
    this.pFire = this.program(VERT, FIRE_FRAG);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    this.ok = true; this.enabled = true;
  }

  program(vs, fs) {
    const gl = this.gl;
    const mk = (type, src) => {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
      return sh;
    };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name); }
    return { p, u, aPos: gl.getAttribLocation(p, 'aPos') };
  }

  setEnabled(on) { this.enabled = !!on && this.ok; }
  update(dt) { this.time += dt; }

  /** Runs a program over the full canvas (scissored to rect) and blits that rect into ctx. */
  run(ctx, prog, rect, setUniforms, composite = 'source-over') {
    if (!this.enabled) return;
    const gl = this.gl;
    const x = Math.max(0, Math.floor(rect.x)), y = Math.max(0, Math.floor(rect.y));
    const w = Math.min(W - x, Math.ceil(rect.w)), h = Math.min(H - y, Math.ceil(rect.h));
    if (w <= 0 || h <= 0) return;
    gl.viewport(0, 0, W, H);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(x, H - y - h, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(prog.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    gl.enableVertexAttribArray(prog.aPos);
    gl.vertexAttribPointer(prog.aPos, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(prog.u.uRes, W, H);
    gl.uniform1f(prog.u.uTime, this.time);
    setUniforms(gl, prog.u);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.SCISSOR_TEST);
    ctx.save();
    ctx.globalCompositeOperation = composite;
    ctx.drawImage(this.canvas, x, y, w, h, x, y, w, h);
    ctx.restore();
  }

  clouds(ctx, camX, theme) {
    const T = CLOUD_THEMES[theme] || CLOUD_THEMES.graveyard;
    this.run(ctx, this.pCloud, { x: 0, y: 0, w: W, h: T.bottom }, (gl, u) => {
      gl.uniform1f(u.uScroll, camX * 0.06);
      gl.uniform3f(u.uColor, T.color[0], T.color[1], T.color[2]);
      gl.uniform3f(u.uShade, T.shade[0], T.shade[1], T.shade[2]);
      gl.uniform1f(u.uDensity, T.density);
      gl.uniform1f(u.uTop, T.top);
      gl.uniform1f(u.uBottom, T.bottom);
    });
  }

  fog(ctx, camX, floorY, color = [0.62, 0.66, 0.82], amount = 0.42) {
    const y0 = Math.max(0, floorY - 120);
    this.run(ctx, this.pFog, { x: 0, y: y0, w: W, h: Math.min(H, floorY + 40) - y0 }, (gl, u) => {
      gl.uniform1f(u.uScroll, camX);
      gl.uniform3f(u.uColor, color[0], color[1], color[2]);
      gl.uniform1f(u.uAmount, amount);
      gl.uniform1f(u.uFloor, floorY);
    });
  }

  water(ctx, rect, { horizon, camX, tint, spec, frozen = 0, alpha = 1 }) {
    this.run(ctx, this.pWater, rect, (gl, u) => {
      gl.uniform1f(u.uScroll, camX);
      gl.uniform1f(u.uHorizon, horizon);
      gl.uniform3f(u.uTint, tint[0], tint[1], tint[2]);
      gl.uniform3f(u.uSpec, spec[0], spec[1], spec[2]);
      gl.uniform1f(u.uFrozen, frozen);
      gl.uniform1f(u.uAlpha, alpha);
    }, 'lighter');
  }

  /** Queue a flame (screen px): base centre (x, y), width, height, colour, seed. */
  addFlame(x, y, w, h, color = [1.0, 0.55, 0.15], seed = 0) {
    if (!this.enabled || this.flames.length >= 40) return;
    if (x < -20 || x > W + 20 || y < -20 || y > H + 60) return;
    this.flames.push({ x, y, w, h, color, seed });
  }

  /** Draws every queued flame in one pass and clears the queue. */
  flushFlames(ctx) {
    const list = this.flames;
    this.flames = [];
    if (!this.enabled || !list.length) return;
    let minX = W, minY = H, maxX = 0, maxY = 0;
    const fl = new Float32Array(40 * 4), fc = new Float32Array(40 * 4);
    list.forEach((f, i) => {
      fl[i * 4] = f.x; fl[i * 4 + 1] = f.y; fl[i * 4 + 2] = f.w; fl[i * 4 + 3] = f.h;
      fc[i * 4] = f.color[0]; fc[i * 4 + 1] = f.color[1]; fc[i * 4 + 2] = f.color[2]; fc[i * 4 + 3] = f.seed;
      minX = Math.min(minX, f.x - f.w); maxX = Math.max(maxX, f.x + f.w);
      minY = Math.min(minY, f.y - f.h * 1.25); maxY = Math.max(maxY, f.y + 4);
    });
    this.run(ctx, this.pFire, { x: minX, y: minY, w: maxX - minX, h: maxY - minY }, (gl, u) => {
      gl.uniform4fv(u.uFlames, fl);
      gl.uniform4fv(u.uFlameCol, fc);
      gl.uniform1i(u.uCount, list.length);
    }, 'lighter');
  }
}

let _fx = null;
/** Shared instance (null when WebGL is unavailable or in headless/Node). */
export function getFxLayers() {
  if (_fx === null) {
    try { _fx = new FxLayers(); if (!_fx.ok) _fx = false; } catch (e) { _fx = false; }
  }
  return _fx || null;
}
