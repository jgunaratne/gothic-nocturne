// Post-processing shaders (WebGL): the crisp 640x360 2D frame is uploaded as a
// texture every frame and composited through
//   1. bright-pass + separable Gaussian bloom at quarter resolution (torches,
//      glows, spells and bioluminescence bleed softly),
//   2. per-theme colour grading (lift/gamma/tint) and a gentle filmic curve,
//   3. a soft phosphor scanline/aperture mask at the display's native scale,
//   4. animated film grain, a lightning/roar heat-shimmer, and a crimson
//      damage pulse,
// then displayed on a second canvas layered over the 2D one. Toggle with F.
// If WebGL is unavailable the 2D canvas is simply shown as before.

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const BRIGHT_FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uScene;
uniform float uThreshold;
void main() {
  vec3 c = texture2D(uScene, vUv).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  float k = smoothstep(uThreshold, uThreshold + 0.35, l);
  // Saturated glows (amber flame, emerald spore, violet magic) bloom a little more than grey highlights.
  float sat = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
  gl_FragColor = vec4(c * k * (0.7 + 0.6 * sat), 1.0);
}
`;

const BLUR_FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;      // (1/w, 0) or (0, 1/h)
void main() {
  vec3 s = texture2D(uTex, vUv).rgb * 0.227027;
  s += texture2D(uTex, vUv + uDir * 1.384615).rgb * 0.316216;
  s += texture2D(uTex, vUv - uDir * 1.384615).rgb * 0.316216;
  s += texture2D(uTex, vUv + uDir * 3.230769).rgb * 0.070270;
  s += texture2D(uTex, vUv - uDir * 3.230769).rgb * 0.070270;
  gl_FragColor = vec4(s, 1.0);
}
`;

const COMPOSITE_FRAG = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uRes;        // output pixels
uniform vec2 uSceneRes;   // 640, 360
uniform float uTime;
uniform float uBloomAmt;  // bloom strength
uniform float uScan;      // scanline strength
uniform float uGrain;
uniform float uShimmer;   // heat shimmer amount (lightning, roars)
uniform float uHurt;      // crimson damage pulse
uniform vec3 uTint;       // colour grade tint (multiplied)
uniform vec3 uLift;       // shadow lift (added)
uniform float uGamma;
uniform float uSat;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  vec2 uv = vUv;
  // Heat shimmer: tiny horizontal wobble by scanline, fades with uShimmer
  if (uShimmer > 0.001) {
    float w = sin(uv.y * uSceneRes.y * 0.9 + uTime * 28.0) * sin(uv.y * 13.0 + uTime * 7.0);
    uv.x += w * uShimmer * (1.6 / uSceneRes.x);
  }
  // Snap to source texels so the pixel art stays razor sharp
  vec2 texel = 1.0 / uSceneRes;
  vec2 suv = (floor(uv * uSceneRes) + 0.5) * texel;
  vec3 col = texture2D(uScene, suv).rgb;
  vec3 bloom = texture2D(uBloom, uv).rgb;

  // Bloom (screen blend keeps whites from clipping)
  col = 1.0 - (1.0 - col) * (1.0 - bloom * uBloomAmt);

  // Colour grade: lift shadows, tint, gamma, saturation
  col = col + uLift * (1.0 - col);
  col *= uTint;
  col = pow(max(col, 0.0), vec3(uGamma));
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSat);

  // Damage pulse: crimson wash strongest at the edges
  if (uHurt > 0.001) {
    vec2 d = vUv - 0.5;
    float edge = smoothstep(0.15, 0.7, dot(d, d) * 2.0);
    col = mix(col, vec3(0.75, 0.08, 0.1), uHurt * (0.25 + 0.6 * edge));
  }

  // Phosphor scanlines at display scale (soft, never fully dark) + faint aperture mask
  float scale = uRes.y / uSceneRes.y;
  if (uScan > 0.001 && scale >= 2.0) {
    float sy = fract(vUv.y * uSceneRes.y);
    float line = 0.5 + 0.5 * cos(sy * 6.2831853);
    col *= 1.0 - uScan * (1.0 - line) * 0.55;
    float px = mod(floor(vUv.x * uRes.x), 3.0);
    vec3 mask = px < 1.0 ? vec3(1.0, 0.94, 0.94) : px < 2.0 ? vec3(0.94, 1.0, 0.94) : vec3(0.94, 0.94, 1.0);
    col *= mix(vec3(1.0), mask, uScan * 0.5);
  }

  // Film grain
  float g = hash(floor(vUv * uSceneRes) + floor(uTime * 24.0)) - 0.5;
  col += g * uGrain;

  // Gentle filmic toe/shoulder
  col = col * (1.0 + 0.12 * col) / (1.0 + 0.12);
  gl_FragColor = vec4(col, 1.0);
}
`;

/** Per-theme grading presets: tint (multiply), lift (shadow colour), gamma, saturation, bloom. */
const GRADES = {
  graveyard: { tint: [0.96, 0.99, 1.08], lift: [0.012, 0.010, 0.030], gamma: 1.0, sat: 1.02, bloom: 0.55 },
  darkwood: { tint: [0.90, 1.04, 1.02], lift: [0.006, 0.024, 0.020], gamma: 0.98, sat: 1.08, bloom: 0.75 },
  forest: { tint: [1.08, 0.98, 0.90], lift: [0.022, 0.012, 0.010], gamma: 1.0, sat: 1.06, bloom: 0.62 },
  yule: { tint: [0.94, 0.99, 1.10], lift: [0.012, 0.018, 0.036], gamma: 0.98, sat: 1.0, bloom: 0.58 },
  ramparts: { tint: [0.97, 0.99, 1.06], lift: [0.010, 0.010, 0.026], gamma: 1.0, sat: 1.0, bloom: 0.5 },
  catacombs: { tint: [1.04, 0.98, 0.92], lift: [0.016, 0.012, 0.008], gamma: 1.03, sat: 0.96, bloom: 0.5 },
  ossuary: { tint: [0.94, 1.02, 1.02], lift: [0.008, 0.020, 0.022], gamma: 1.02, sat: 1.0, bloom: 0.68 },
  arcade: { tint: [1.06, 0.98, 0.94], lift: [0.020, 0.010, 0.012], gamma: 0.98, sat: 1.08, bloom: 0.7 },
  clocktower: { tint: [1.06, 1.00, 0.92], lift: [0.018, 0.012, 0.006], gamma: 1.0, sat: 1.02, bloom: 0.6 },
  throne: { tint: [1.06, 0.96, 0.98], lift: [0.022, 0.008, 0.014], gamma: 1.0, sat: 1.06, bloom: 0.62 },
  menu: { tint: [0.98, 0.98, 1.04], lift: [0.010, 0.010, 0.022], gamma: 1.0, sat: 1.0, bloom: 0.5 },
};

export class PostFX {
  constructor(sourceCanvas) {
    this.src = sourceCanvas;
    this.enabled = false;
    this.ok = false;
    this.time = 0;
    this.shimmer = 0;
    this.hurt = 0;
    this.scan = 0.35;
    this.grain = 0.035;
    this.theme = 'menu';
    try { this.init(); } catch (e) { console.warn('PostFX disabled:', e); this.ok = false; }
  }

  init() {
    const out = document.createElement('canvas');
    out.id = 'fx';
    out.setAttribute('aria-hidden', 'true');
    out.style.cssText = 'position:absolute; left:0; top:0; pointer-events:none; image-rendering:auto;';
    this.src.parentElement.style.position = 'relative';
    this.src.parentElement.appendChild(out);
    const gl = out.getContext('webgl', { alpha: false, antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('no webgl');
    this.out = out; this.gl = gl;

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.quad = quad;

    this.pBright = this.program(VERT, BRIGHT_FRAG);
    this.pBlur = this.program(VERT, BLUR_FRAG);
    this.pComp = this.program(VERT, COMPOSITE_FRAG);

    this.sceneTex = this.texture(gl.NEAREST);
    this.bw = 160; this.bh = 90;   // quarter-res bloom buffers
    this.fbA = this.framebuffer(this.bw, this.bh);
    this.fbB = this.framebuffer(this.bw, this.bh);
    this.ok = true;
    this.setEnabled(true);
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
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p, u, aPos: gl.getAttribLocation(p, 'aPos') };
  }

  texture(filter) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  framebuffer(w, h) {
    const gl = this.gl;
    const tex = this.texture(gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fb, tex, w, h };
  }

  setEnabled(on) {
    this.enabled = !!on && this.ok;
    if (!this.ok) return;
    this.out.style.display = this.enabled ? 'block' : 'none';
    // Keep the 2D canvas in the layout (focus + sizing) but hide its pixels under the FX canvas.
    this.src.style.opacity = this.enabled ? '0' : '1';
  }

  toggle() { this.setEnabled(!this.enabled); return this.enabled; }

  /** Matches the FX canvas to the 2D canvas' CSS size (device pixels). */
  fit() {
    if (!this.ok) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = parseFloat(this.src.style.width) || this.src.width;
    const chh = parseFloat(this.src.style.height) || this.src.height;
    this.out.style.width = cw + 'px';
    this.out.style.height = chh + 'px';
    const w = Math.max(1, Math.round(cw * dpr)), h = Math.max(1, Math.round(chh * dpr));
    if (this.out.width !== w || this.out.height !== h) { this.out.width = w; this.out.height = h; }
  }

  /** Per-frame event hooks from the game. */
  flash(amount) { this.shimmer = Math.max(this.shimmer, amount); }
  damage(amount = 1) { this.hurt = Math.max(this.hurt, amount); }

  draw(dt, theme) {
    if (!this.enabled) return;
    const gl = this.gl;
    this.time += dt;
    this.shimmer = Math.max(0, this.shimmer - dt * 2.2);
    this.hurt = Math.max(0, this.hurt - dt * 2.6);
    this.theme = theme || this.theme;
    const g = GRADES[this.theme] || GRADES.menu;
    this.fit();

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    const bind = (prog) => {
      gl.useProgram(prog.p);
      gl.enableVertexAttribArray(prog.aPos);
      gl.vertexAttribPointer(prog.aPos, 2, gl.FLOAT, false, 0, 0);
    };

    // Upload the 2D frame
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.src);

    // 1. Bright pass -> A
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbA.fb);
    gl.viewport(0, 0, this.bw, this.bh);
    bind(this.pBright);
    gl.uniform1i(this.pBright.u.uScene, 0);
    gl.uniform1f(this.pBright.u.uThreshold, 0.52);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 2. Blur A -> B (horizontal), B -> A (vertical), twice for a wide soft halo
    bind(this.pBlur);
    gl.uniform1i(this.pBlur.u.uTex, 0);
    for (let i = 0; i < 2; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbB.fb);
      gl.bindTexture(gl.TEXTURE_2D, this.fbA.tex);
      gl.uniform2f(this.pBlur.u.uDir, 1 / this.bw, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbA.fb);
      gl.bindTexture(gl.TEXTURE_2D, this.fbB.tex);
      gl.uniform2f(this.pBlur.u.uDir, 0, 1 / this.bh);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // 3. Composite to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.out.width, this.out.height);
    bind(this.pComp);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.fbA.tex);
    const u = this.pComp.u;
    gl.uniform1i(u.uScene, 0);
    gl.uniform1i(u.uBloom, 1);
    gl.uniform2f(u.uRes, this.out.width, this.out.height);
    gl.uniform2f(u.uSceneRes, this.src.width, this.src.height);
    gl.uniform1f(u.uTime, this.time);
    gl.uniform1f(u.uBloomAmt, g.bloom);
    gl.uniform1f(u.uScan, this.scan);
    gl.uniform1f(u.uGrain, this.grain);
    gl.uniform1f(u.uShimmer, this.shimmer);
    gl.uniform1f(u.uHurt, this.hurt);
    gl.uniform3f(u.uTint, g.tint[0], g.tint[1], g.tint[2]);
    gl.uniform3f(u.uLift, g.lift[0], g.lift[1], g.lift[2]);
    gl.uniform1f(u.uGamma, g.gamma);
    gl.uniform1f(u.uSat, g.sat);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE0);
  }
}
