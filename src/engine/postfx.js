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

const SHADER_PREC = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;

const VERT = `
${SHADER_PREC}
attribute vec2 aPos;
varying vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const BRIGHT_FRAG = `
${SHADER_PREC}
varying vec2 vUv;
uniform sampler2D uScene;
uniform float uThreshold;
void main() {
  vec3 c = texture2D(uScene, vec2(vUv.x, 1.0 - vUv.y)).rgb;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  float k = smoothstep(uThreshold, uThreshold + 0.35, l);
  // Saturated glows (amber flame, emerald spore, violet magic) bloom a little more than grey highlights.
  float sat = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
  gl_FragColor = vec4(c * k * (0.7 + 0.6 * sat), 1.0);
}
`;

const BLUR_FRAG = `
${SHADER_PREC}
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
${SHADER_PREC}
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
uniform float uHeat;      // convective lower-screen heat haze (volcanic caverns)
uniform vec4 uShock;      // (cx, cy in vUv, radius, amplitude)
uniform float uHurt;      // crimson damage pulse
uniform float uLightning; // electric storm exposure & blue-violet shadow lift
uniform float uChrono;    // Chrono Pocketwatch temporal stasis wave (0..1)
uniform float uLightCount;
uniform vec4 uLights[6];     // (nx, ny in bottom-up vUv, radiusUv, intensity)
uniform vec3 uLightCols[6];  // RGB point-light tint
uniform vec3 uTint;       // colour grade tint (multiplied)
uniform vec3 uLift;       // shadow lift (added)
uniform float uGamma;
uniform float uSat;

// Overflow-free small-constant hash (safe even on fp16 mobile GPUs where sin(dot)*43758 overflows to NaN).
float hash(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}

// Band-limited sharp pixel-art sampler: exact texel centers at integer scales,
// and strictly 1-device-pixel anti-aliased seams at fractional / HiDPI scales.
vec3 sampleSharp(vec2 uv) {
  vec2 pix = clamp(uv, vec2(0.0), vec2(1.0)) * uSceneRes;
  vec2 seam = floor(pix + 0.5);
  vec2 dudv = uSceneRes / max(uRes, vec2(1.0));
  vec2 f = clamp((pix - seam) / dudv + 0.5, 0.0, 1.0);
  vec2 suv = (seam - 0.5 + f) / uSceneRes;
  return texture2D(uScene, vec2(suv.x, 1.0 - suv.y)).rgb;
}

void main() {
  vec2 uv = vUv;
  // Heat shimmer: tiny horizontal wobble by scanline, fades with uShimmer
  if (uShimmer > 0.001) {
    float w = sin(uv.y * uSceneRes.y * 0.9 + uTime * 28.0) * sin(uv.y * 13.0 + uTime * 7.0);
    uv.x += w * uShimmer * (1.6 / uSceneRes.x);
  }
  // Convective heat haze rising off molten lava pools in lower third of frame
  if (uHeat > 0.001) {
    float low = smoothstep(0.46, 0.02, uv.y);
    float hw = sin(uv.y * 42.0 - uTime * 5.2 + uv.x * 11.0)
             + 0.5 * cos(uv.y * 74.0 - uTime * 8.4 - uv.x * 17.0);
    uv.x += hw * low * uHeat * (0.85 / uSceneRes.x);
    uv.y += cos(uv.x * 29.0 + uTime * 4.6) * low * uHeat * (0.45 / uSceneRes.y);
  }

  // Radial shockwave ring distortion + subtle chromatic dispersion along the wave crest
  float chroma = 0.0;
  vec2 shockDir = vec2(0.0);
  if (uShock.w > 0.001) {
    vec2 aspect = vec2(uSceneRes.x / uSceneRes.y, 1.0);
    vec2 delta = (uv - uShock.xy) * aspect;
    float dist = length(delta);
    float band = 0.075;
    float ring = exp(-pow((dist - uShock.z) / band, 2.0));
    float deriv = -(dist - uShock.z) / band;
    shockDir = dist > 0.0001 ? (delta / dist) / aspect : vec2(0.0);
    float push = ring * deriv * uShock.w * 0.022;
    uv += shockDir * push;
    chroma = ring * uShock.w * 0.0045;
  }

  vec3 col;
  if (chroma > 0.0002) {
    col.r = sampleSharp(uv + shockDir * chroma).r;
    col.g = sampleSharp(uv).g;
    col.b = sampleSharp(uv - shockDir * chroma).b;
  } else {
    col = sampleSharp(uv);
  }
  vec3 bloom = texture2D(uBloom, clamp(uv, vec2(0.0), vec2(1.0))).rgb;

  // Bloom (screen blend keeps whites from clipping); storm lightning boosts halo bloom
  float bloomAmt = uBloomAmt + uLightning * 0.65;
  col = 1.0 - (1.0 - col) * (1.0 - bloom * bloomAmt);

  // Screen-space pixel-art normal-mapped dynamic point-light rim & specular illumination:
  // early-culls pixels outside all active point-light radii before sampling 4 Sobel neighbor texels!
  if (uLightCount > 0.5) {
    vec2 aspectL = vec2(uSceneRes.x / uSceneRes.y, 1.0);
    bool inReach = false;
    for (int i = 0; i < 6; i++) {
      vec4 lp = uLights[i];
      if (lp.w > 0.005) {
        vec2 toL = (lp.xy - uv) * aspectL;
        if (dot(toL, toL) < lp.z * lp.z) {
          inReach = true;
          break;
        }
      }
    }
    if (inReach) {
      vec2 tx = 1.0 / uSceneRes;
      vec2 centerUv = (floor(clamp(uv, vec2(0.001), vec2(0.999)) * uSceneRes) + 0.5) * tx;
      vec2 sceneUv = vec2(centerUv.x, 1.0 - centerUv.y);
      float lL = dot(texture2D(uScene, sceneUv - vec2(tx.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
      float lR = dot(texture2D(uScene, sceneUv + vec2(tx.x, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
      float lD = dot(texture2D(uScene, sceneUv + vec2(0.0, tx.y)).rgb, vec3(0.299, 0.587, 0.114));
      float lU = dot(texture2D(uScene, sceneUv - vec2(0.0, tx.y)).rgb, vec3(0.299, 0.587, 0.114));
      vec2 grad = vec2(lL - lR, lD - lU);
      vec3 surfN = normalize(vec3(grad * 3.4, 1.0));
      float bevel = clamp(length(grad) * 2.8, 0.0, 1.0);
      vec3 dynLight = vec3(0.0);
      for (int i = 0; i < 6; i++) {
        vec4 lp = uLights[i];
        if (lp.w > 0.005) {
          vec2 toL = (lp.xy - uv) * aspectL;
          float d2 = dot(toL, toL);
          if (d2 < lp.z * lp.z) {
            float dL = sqrt(d2);
            float att = pow(1.0 - dL / max(0.01, lp.z), 2.0) * lp.w;
            vec3 Ldir = normalize(vec3(toL, 0.22));
            float ndl = max(0.0, dot(surfN, Ldir));
            vec3 Hdir = normalize(Ldir + vec3(0.0, 0.0, 1.0));
            float spec = pow(max(0.0, dot(surfN, Hdir)), 14.0) * bevel;
            dynLight += uLightCols[i] * att * (0.12 + ndl * (0.30 + 0.52 * bevel) + spec * 0.52);
          }
        }
      }
      col += dynLight * (0.26 + 0.74 * col);
    }
  }

  // Chrono Pocketwatch temporal stasis wave: crystalline cyan-gold clockwork ripple
  if (uChrono > 0.001) {
    vec2 cd = (uv - vec2(0.5)) * vec2(uSceneRes.x / uSceneRes.y, 1.0);
    float cr = length(cd);
    float tickWave = 0.5 + 0.5 * sin(cr * 26.0 - uTime * 7.5);
    float lumaC = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 chronoTint = mix(vec3(lumaC) * vec3(0.76, 0.94, 1.14), col, 0.35);
    chronoTint += vec3(0.10, 0.22, 0.30) * tickWave * smoothstep(0.12, 0.85, cr) * 0.35;
    col = mix(col, chronoTint, clamp(uChrono * 0.78, 0.0, 0.82));
  }

  // Colour grade: lift shadows, tint, gamma, saturation
  vec3 lift = uLift + vec3(0.08, 0.11, 0.22) * uLightning;
  col = col + lift * (1.0 - col);
  col *= mix(uTint, vec3(1.12, 1.16, 1.28), uLightning * 0.55);
  col = pow(max(col, 0.0), vec3(max(0.72, uGamma - uLightning * 0.18)));
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSat);

  // Damage pulse: crimson wash strongest at the edges
  if (uHurt > 0.001) {
    vec2 d = vUv - 0.5;
    float edge = smoothstep(0.15, 0.7, dot(d, d) * 2.0);
    col = mix(col, vec3(0.75, 0.08, 0.1), uHurt * (0.25 + 0.6 * edge));
  }

  // Phosphor scanlines at display scale (soft, never fully dark) + faint aperture mask.
  // Attenuate on non-integer scales below 3.5x so fractional browser viewports never
  // beat 360-row scanlines or a 3-px aperture grill against physical monitor pixels.
  float scale = uRes.y / uSceneRes.y;
  float fracErr = abs(scale - floor(scale + 0.5));
  float intAlign = scale >= 3.5 ? 1.0 : (1.0 - smoothstep(0.02, 0.12, fracErr));
  if (uScan > 0.001 && scale >= 1.98 && intAlign > 0.001) {
    float fade = clamp((scale - 1.75) * 0.8, 0.0, 1.0) * intAlign;
    float sy = fract(vUv.y * uSceneRes.y);
    float line = 0.5 + 0.5 * cos((sy - 0.5) * 6.2831853);
    col *= 1.0 - uScan * fade * (1.0 - line) * 0.44;
    if (scale >= 2.95) {
      float px = mod(floor(vUv.x * uRes.x), 3.0);
      vec3 mask = px < 1.0 ? vec3(1.0, 0.95, 0.95) : px < 2.0 ? vec3(0.95, 1.0, 0.95) : vec3(0.95, 0.95, 1.0);
      col *= mix(vec3(1.0), mask, uScan * fade * 0.36);
    }
  }

  // Film grain
  float g = hash(floor(vUv * uSceneRes) + mod(floor(uTime * 24.0), 256.0)) - 0.5;
  col += g * uGrain;

  // Gentle filmic toe/shoulder
  col = col * (1.0 + 0.12 * col) / (1.0 + 0.12);
  gl_FragColor = vec4(col, 1.0);
}
`;

/** Per-theme grading presets: tint (multiply), lift (shadow colour), gamma, saturation, bloom. */
export const GRADES = {
  graveyard: { tint: [0.96, 0.99, 1.08], lift: [0.012, 0.010, 0.030], gamma: 1.0, sat: 1.02, bloom: 0.58 },
  darkwood: { tint: [0.90, 1.04, 1.02], lift: [0.006, 0.024, 0.020], gamma: 0.98, sat: 1.08, bloom: 0.76 },
  forest: { tint: [1.08, 0.98, 0.90], lift: [0.022, 0.012, 0.010], gamma: 1.0, sat: 1.06, bloom: 0.64 },
  yule: { tint: [0.94, 0.99, 1.10], lift: [0.012, 0.018, 0.036], gamma: 0.98, sat: 1.02, bloom: 0.62 },
  ramparts: { tint: [0.97, 0.99, 1.06], lift: [0.010, 0.010, 0.026], gamma: 1.0, sat: 1.0, bloom: 0.54 },
  catacombs: { tint: [1.04, 0.98, 0.92], lift: [0.016, 0.012, 0.008], gamma: 1.03, sat: 0.96, bloom: 0.52 },
  darkcave: { tint: [1.10, 0.95, 0.88], lift: [0.028, 0.009, 0.006], gamma: 0.98, sat: 1.10, bloom: 0.80, heat: 1.0 },
  ossuary: { tint: [0.94, 1.02, 1.02], lift: [0.008, 0.020, 0.022], gamma: 1.02, sat: 1.0, bloom: 0.68 },
  arcade: { tint: [1.06, 0.98, 0.94], lift: [0.020, 0.010, 0.012], gamma: 0.98, sat: 1.08, bloom: 0.70 },
  library: { tint: [1.05, 0.99, 1.04], lift: [0.018, 0.010, 0.024], gamma: 0.99, sat: 1.05, bloom: 0.66 },
  cathedral: { tint: [1.02, 0.98, 1.08], lift: [0.016, 0.010, 0.028], gamma: 0.98, sat: 1.08, bloom: 0.74 },
  clocktower: { tint: [1.06, 1.00, 0.92], lift: [0.018, 0.012, 0.006], gamma: 1.0, sat: 1.02, bloom: 0.62 },
  throne: { tint: [1.06, 0.96, 0.98], lift: [0.022, 0.008, 0.014], gamma: 1.0, sat: 1.06, bloom: 0.66 },
  alchemy: { tint: [0.96, 1.04, 0.98], lift: [0.010, 0.020, 0.014], gamma: 0.99, sat: 1.08, bloom: 0.72 },
  ballroom: { tint: [1.03, 0.99, 1.06], lift: [0.016, 0.012, 0.026], gamma: 0.98, sat: 1.06, bloom: 0.70 },
  coliseum: { tint: [1.07, 0.97, 0.92], lift: [0.022, 0.010, 0.010], gamma: 0.99, sat: 1.06, bloom: 0.64 },
  aqueduct: { tint: [0.92, 1.03, 1.07], lift: [0.006, 0.018, 0.028], gamma: 0.97, sat: 1.10, bloom: 0.74 },
  skykeep: { tint: [0.98, 1.01, 1.08], lift: [0.012, 0.016, 0.030], gamma: 0.98, sat: 1.06, bloom: 0.70 },
  conservatory: { tint: [0.92, 1.05, 0.99], lift: [0.008, 0.024, 0.018], gamma: 0.97, sat: 1.10, bloom: 0.78 },
  dungeon: { tint: [1.08, 0.94, 0.90], lift: [0.024, 0.008, 0.010], gamma: 1.01, sat: 1.04, bloom: 0.68, heat: 0.35 },
  observatory: { tint: [0.95, 1.01, 1.10], lift: [0.010, 0.016, 0.034], gamma: 0.97, sat: 1.10, bloom: 0.80 },
  menu: { tint: [0.98, 0.98, 1.04], lift: [0.010, 0.010, 0.022], gamma: 1.0, sat: 1.0, bloom: 0.52 },
};

export class PostFX {
  constructor(sourceCanvas) {
    this.src = sourceCanvas;
    this.enabled = false;
    this.ok = false;
    this.time = 0;
    this.shimmer = 0;
    this.hurt = 0;
    this.lightning = 0;
    this.chrono = 0;
    this.lightCount = 0;
    this.lightPosBuf = new Float32Array(24);
    this.lightColBuf = new Float32Array(18);
    this.shock = { x: 0.5, y: 0.5, r: 0, amp: 0 };
    this.scan = 0.32;
    this.grain = 0.032;
    this.theme = 'menu';
    this.mobileDprCap = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(pointer: coarse)').matches
      : false;
    try { this.init(); } catch (e) { console.warn('PostFX disabled:', e); this.ok = false; }
  }

  init() {
    const out = document.createElement('canvas');
    out.id = 'fx';
    out.setAttribute('aria-hidden', 'true');
    out.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; pointer-events:none; image-rendering:auto; z-index:2;';
    this.src.parentElement.style.position = 'relative';
    this.src.parentElement.appendChild(out);
    out.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.ok = false;
      this.enabled = false;
      out.style.display = 'none';
      this.src.style.opacity = '1';
    });
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

    this.sceneTex = this.texture(gl.LINEAR);
    // Try half-res 320x180 bloom buffers first; fall back to power-of-two 256x128 if strict ES2 rejects NPOT FBOs.
    try {
      this.bw = 320; this.bh = 180;
      this.fbA = this.framebuffer(this.bw, this.bh);
      this.fbB = this.framebuffer(this.bw, this.bh);
    } catch (e) {
      this.bw = 256; this.bh = 128;
      this.fbA = this.framebuffer(this.bw, this.bh);
      this.fbB = this.framebuffer(this.bw, this.bh);
    }
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
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name.replace('[0]', '')] = gl.getUniformLocation(p, info.name);
    }
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
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(fb);
      gl.deleteTexture(tex);
      throw new Error('Framebuffer incomplete: ' + status);
    }
    return { fb, tex, w, h };
  }

  setEnabled(on) {
    this.enabled = !!on && this.ok;
    if (!this.ok) return;
    this.out.style.display = this.enabled ? 'block' : 'none';
    // Keep the 2D source canvas opaque underneath #fx so mobile compositors never
    // throttle an `opacity: 0` canvas and fallback to 2D is instantaneous.
    this.src.style.opacity = '1';
  }

  toggle() { this.setEnabled(!this.enabled); return this.enabled; }

  /** Matches the FX canvas to the 2D canvas' CSS size (device pixels; capped at 2x on mobile/large displays). */
  fit() {
    if (!this.ok) return;
    const cw = parseFloat(this.src.style.width) || this.src.width;
    const chh = parseFloat(this.src.style.height) || this.src.height;
    const maxDpr = (this.mobileDprCap || cw >= 1200) ? 2 : 3;
    const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
    if (cw === this._lastCssW && chh === this._lastCssH && dpr === this._lastDpr) return;
    this._lastCssW = cw;
    this._lastCssH = chh;
    this._lastDpr = dpr;
    this.out.style.width = cw + 'px';
    this.out.style.height = chh + 'px';
    const w = Math.max(1, Math.round(cw * dpr)), h = Math.max(1, Math.round(chh * dpr));
    if (this.out.width !== w || this.out.height !== h) { this.out.width = w; this.out.height = h; }
  }

  /** Per-frame event hooks from the game. */
  flash(amount) { this.shimmer = Math.max(this.shimmer, amount); }
  damage(amount = 1) { this.hurt = Math.max(this.hurt, amount); }
  strike(amount) {
    this.lightning = Math.max(this.lightning, amount);
    if (amount > 0.35) this.shimmer = Math.max(this.shimmer, amount * 0.65);
  }
  /** Radial distortion wave centered at normalized screen coords (0..1, top-left origin). */
  shockwave(nx = 0.5, ny = 0.5, strength = 1.0) {
    this.shock.x = Math.max(0.05, Math.min(0.95, nx));
    this.shock.y = Math.max(0.05, Math.min(0.95, 1.0 - ny));
    this.shock.r = 0.025;
    this.shock.amp = Math.min(1.6, Math.max(0.25, strength));
  }

  /** Sets up to 6 screen-space dynamic point lights (top-left normalized coords `nx, ny`). */
  setDynamicLights(lights, chronoAmt = 0) {
    this.chrono = Math.max(0, Math.min(1, chronoAmt || 0));
    this.lightPosBuf.fill(0);
    this.lightColBuf.fill(0);
    if (!lights || !lights.length) {
      this.lightCount = 0;
      return;
    }
    const count = Math.min(6, lights.length);
    for (let i = 0; i < count; i++) {
      const L = lights[i];
      const p4 = i * 4, c3 = i * 3;
      this.lightPosBuf[p4] = L.nx;
      this.lightPosBuf[p4 + 1] = 1.0 - L.ny;
      this.lightPosBuf[p4 + 2] = L.radius;
      this.lightPosBuf[p4 + 3] = L.intensity;
      this.lightColBuf[c3] = L.r;
      this.lightColBuf[c3 + 1] = L.g;
      this.lightColBuf[c3 + 2] = L.b;
    }
    this.lightCount = count;
  }

  draw(dt, theme) {
    if (!this.enabled) return;
    const gl = this.gl;
    if (gl.isContextLost && gl.isContextLost()) {
      this.ok = false;
      this.enabled = false;
      this.out.style.display = 'none';
      return;
    }
    this.time = (this.time + dt) % 628.3185307;
    this.shimmer = Math.max(0, this.shimmer - dt * 2.2);
    this.hurt = Math.max(0, this.hurt - dt * 2.6);
    this.lightning = Math.max(0, this.lightning - dt * 3.8);
    if (this.shock.amp > 0.001) {
      this.shock.r += dt * 1.45;
      this.shock.amp = Math.max(0, this.shock.amp - dt * 2.15);
    }
    this.theme = theme || this.theme;
    const g = GRADES[this.theme] || GRADES.menu;
    this.fit();

    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
    const bind = (prog) => {
      gl.useProgram(prog.p);
      gl.enableVertexAttribArray(prog.aPos);
      gl.vertexAttribPointer(prog.aPos, 2, gl.FLOAT, false, 0, 0);
    };

    // Upload the 2D frame with UNPACK_FLIP_Y_WEBGL = false so Chromium/ANGLE keeps the zero-copy GPU fast path
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.src);

    // 1. Bright pass -> A
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbA.fb);
    gl.viewport(0, 0, this.bw, this.bh);
    bind(this.pBright);
    gl.uniform1i(this.pBright.u.uScene, 0);
    gl.uniform1f(this.pBright.u.uThreshold, 0.52);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 2. Single-iteration wide separable hardware-bilinear Gaussian blur: A -> B (H), B -> A (V)
    bind(this.pBlur);
    gl.uniform1i(this.pBlur.u.uTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbB.fb);
    gl.bindTexture(gl.TEXTURE_2D, this.fbA.tex);
    gl.uniform2f(this.pBlur.u.uDir, 1.38 / this.bw, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbA.fb);
    gl.bindTexture(gl.TEXTURE_2D, this.fbB.tex);
    gl.uniform2f(this.pBlur.u.uDir, 0, 1.38 / this.bh);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

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
    gl.uniform1f(u.uHeat, g.heat || 0);
    gl.uniform4f(u.uShock, this.shock.x, this.shock.y, this.shock.r, this.shock.amp);
    gl.uniform1f(u.uHurt, this.hurt);
    gl.uniform1f(u.uLightning, this.lightning);
    if (u.uChrono) gl.uniform1f(u.uChrono, this.chrono);
    if (u.uLightCount) gl.uniform1f(u.uLightCount, this.lightCount);
    if (u.uLights) gl.uniform4fv(u.uLights, this.lightPosBuf);
    if (u.uLightCols) gl.uniform3fv(u.uLightCols, this.lightColBuf);
    gl.uniform3f(u.uTint, g.tint[0], g.tint[1], g.tint[2]);
    gl.uniform3f(u.uLift, g.lift[0], g.lift[1], g.lift[2]);
    gl.uniform1f(u.uGamma, g.gamma);
    gl.uniform1f(u.uSat, g.sat);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE0);
  }
}
