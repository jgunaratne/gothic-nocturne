// Procedural shader layers (WebGL) composited into the 2D draw order:
//   clouds  - drifting FBM cloud banks behind the parallax (moonlit, per theme)
//   water   - flowing / frozen water surface overlaid on the 3D ground planes
//   fire    - living flame quads for torches, candelabra, chandeliers & fire pools
//   fog     - low rolling foreground mist in front of the action
// Each layer renders into a shared transparent WebGL canvas (premultiplied
// alpha) and is blitted into the 2D canvas with drawImage, so it lands exactly
// where the scene's draw order asks for it. Disabled automatically without WebGL.

import { W, H } from './constants.js';

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

const NOISE = `
float hash(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + vec2(17.0, 9.0); a *= 0.5; }
  return v;
}
`;

const CLOUD_FRAG = `
${SHADER_PREC}
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
${SHADER_PREC}
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uScroll;
uniform float uScrollY;
uniform vec3 uColor;
uniform float uAmount;
uniform float uFloor;    // screen y of the world ground the fog hugs
${NOISE}
void main() {
  vec2 px = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);
  float h = uFloor - px.y;                 // height above the world floor line
  if (h < -40.0 || h > 120.0) discard;
  float wy = px.y + uScrollY;              // world-anchored Y so camera bob never shifts mist wisps
  vec2 p = vec2((px.x + uScroll * 1.15 + uTime * 14.0) / 120.0, wy / 70.0 + uTime * 0.05);
  float n = fbm(p) * 0.7 + fbm(p * 2.2 + vec2(uTime * 0.08, 0.0)) * 0.3;
  float body = (1.0 - smoothstep(0.0, 110.0, h)) * smoothstep(-40.0, 10.0, h);
  float a = smoothstep(0.38, 0.75, n) * body * uAmount;
  a = floor(a * 6.0) / 6.0;
  gl_FragColor = vec4(uColor * a, a);
}
`;

// 3D perspective cistern / moat / marsh / frozen-lake water shader with real-time
// planar scene reflections, Gerstner capillary wave normals, Schlick Fresnel,
// Beer-Lambert depth absorption, subsurface caustics, and specular glints.
const WATER_FRAG = `
${SHADER_PREC}
varying vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uRes;
uniform float uTime;
uniform float uScroll;
uniform float uHorizon;  // screen y of the far water horizon
uniform vec3 uTint;      // shallow / mid water body tint
uniform vec3 uSpec;      // sky / torch / moon highlight colour
uniform float uFrozen;   // 1 = crystalline ice sheet, 0 = flowing water
uniform float uAlpha;
${NOISE}

float waveField(vec2 w, float t) {
  float h = 0.0;
  h += sin(w.x * 0.075 + w.y * 0.130 + t * 2.15) * 0.36;
  h += sin(-w.x * 0.115 + w.y * 0.195 - t * 1.72) * 0.24;
  h += (fbm(vec2(w.x / 34.0 + t * 0.22, (w.y + t * 18.0) / 28.0)) - 0.5) * 0.85;
  h += (vnoise(vec2(w.x / 11.0 - t * 0.55, (w.y + t * 26.0) / 9.5)) - 0.5) * 0.32;
  return h;
}

float causticNet(vec2 p, float t) {
  vec2 a = p * 0.11 + vec2(t * 0.38, -t * 0.29);
  vec2 b = p * 0.14 - vec2(t * 0.31, t * 0.42);
  float v1 = abs(vnoise(a) - 0.5);
  float v2 = abs(vnoise(b + vec2(4.7, 2.3)) - 0.5);
  return pow(clamp(1.0 - min(v1, v2) * 4.2, 0.0, 1.0), 2.4);
}

void main() {
  vec2 px = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);
  float dy = px.y - uHorizon;
  if (dy < 0.0) discard;

  float persp = 96.0 / max(1.5, dy + 3.0);
  float wx = (px.x - uRes.x * 0.5) * persp * 0.92 + uScroll * 0.92;
  float wz = 175.0 / max(0.18, persp);
  float depthFrac = clamp(dy / max(24.0, uRes.y - uHorizon), 0.0, 1.0);

  if (uFrozen > 0.5) {
    // Glacial mirror-ice sheet: crisp planar reflection + fractured frost veins + star sparkle
    float crackA = abs(fbm(vec2(wx / 42.0, wz / 38.0)) - 0.5);
    float crackB = abs(vnoise(vec2(wx / 16.0 + 3.1, wz / 15.0)) - 0.5);
    float vein = pow(clamp(1.0 - min(crackA, crackB) * 5.5, 0.0, 1.0), 2.2);
    vec2 iceShift = vec2((crackA - 0.25) * 6.0, (crackB - 0.25) * 4.0);
    vec2 reflPx = vec2(px.x + iceShift.x, uHorizon - dy * 0.92 + iceShift.y);
    vec3 refl = texture2D(uScene, clamp(reflPx / uRes, vec2(0.003), vec2(0.997))).rgb;
    vec3 under = texture2D(uScene, clamp(px / uRes, vec2(0.003), vec2(0.997))).rgb;
    float sparkle = smoothstep(0.86, 0.97, vnoise(vec2(wx * 0.22 + uTime * 0.8, wz * 0.22)));
    vec3 iceBody = mix(uTint * 0.55 + under * 0.42, refl, 0.46 * (1.0 - depthFrac * 0.35));
    vec3 col = iceBody + uSpec * (vein * 0.36 + sparkle * 0.65);
    float a = clamp((0.68 + 0.22 * vein) * uAlpha * smoothstep(0.0, 6.0, dy), 0.0, 0.95);
    col = floor(col * 16.0) / 16.0;
    gl_FragColor = vec4(col * a, a);
    return;
  }

  // Finite-difference 3D wave normal in world-water coordinates
  float eps = 1.6;
  float hC = waveField(vec2(wx, wz), uTime);
  float hX = waveField(vec2(wx + eps, wz), uTime);
  float hZ = waveField(vec2(wx, wz + eps), uTime);
  vec2 grad = vec2(hX - hC, hZ - hC) / eps;
  vec3 norm = normalize(vec3(-grad.x * 2.3, 1.0, -grad.y * 2.1));

  // View vector from camera down onto the water plane -> Schlick Fresnel
  vec3 viewDir = normalize(vec3((px.x - uRes.x * 0.5) / uRes.x * 0.55, 0.22 + depthFrac * 0.72, 1.0));
  float ndotv = clamp(dot(norm, viewDir), 0.0, 1.0);
  float fresnel = clamp(0.20 + 0.76 * pow(1.0 - ndotv, 3.0), 0.0, 0.96);

  // Real-time planar reflection of 3D masonry, arches, viaducts, torches & sky above uHorizon
  vec2 rippleDistort = vec2(norm.x * (9.0 + dy * 0.16), norm.z * (4.0 + dy * 0.08));
  vec2 reflPx = vec2(px.x + rippleDistort.x, uHorizon - dy * 0.94 + rippleDistort.y);
  vec2 reflUv = clamp(reflPx / uRes, vec2(0.003), vec2(0.997));
  vec3 reflCol = texture2D(uScene, reflUv).rgb;
  // Slightly soften & cool distant reflected masonry
  reflCol = mix(reflCol, uTint * 0.85 + uSpec * 0.18, 0.18);

  // Refracted submerged floor & Beer-Lambert water volume absorption + subsurface caustics
  vec2 refrUv = clamp((px + rippleDistort * 0.38) / uRes, vec2(0.003), vec2(0.997));
  vec3 refrCol = texture2D(uScene, refrUv).rgb;
  vec3 deepAbsorb = uTint * vec3(0.24, 0.34, 0.44);
  vec3 waterBody = mix(refrCol * (uTint * 1.35 + vec3(0.18)), deepAbsorb, clamp(0.38 + depthFrac * 0.48, 0.0, 0.92));
  float caust = causticNet(vec2(wx, wz), uTime) * (1.0 - depthFrac * 0.45);
  waterBody += (uTint * 0.55 + uSpec * 0.45) * caust * 0.42;

  // Specular highlights along wave crests & moon/lantern reflection column
  vec3 lightDir = normalize(vec3(0.16, 0.64, 0.75));
  vec3 halfV = normalize(lightDir + viewDir);
  float specPow = pow(clamp(dot(norm, halfV), 0.0, 1.0), 26.0);
  float crest = smoothstep(0.16, 0.44, hC) * (0.35 + 0.65 * smoothstep(0.0, 48.0, dy));
  float horizonShimmer = exp(-dy / 16.0) * (0.35 + 0.35 * sin(wx * 0.18 + uTime * 3.5));

  vec3 col = mix(waterBody, reflCol, fresnel * 0.82);
  col += uSpec * (specPow * 1.15 + crest * 0.28 + horizonShimmer * 0.22);

  // Subtle horizon shoreline meniscus
  float edgeLine = 1.0 - smoothstep(0.0, 2.2, dy);
  col = mix(col, mix(uTint, uSpec, 0.65), edgeLine * 0.55);

  float a = clamp((0.80 + 0.16 * fresnel) * uAlpha * smoothstep(0.0, 3.0, dy), 0.0, 0.96);
  col = floor(col * 20.0) / 20.0;
  gl_FragColor = vec4(col * a, a);
}
`;

// Play-plane flooded canal, cistern pool & sanctuary reflecting basin shader:
// animated wave meniscus, live interactive wake ripples (`uRipples[6]`),
// underwater `uScene` refraction + Beer-Lambert tint + floor caustics,
// and real-time planar reflections of the hunter, enemies, bosses & torches!
const WATER_POOL_FRAG = `
${SHADER_PREC}
varying vec2 vUv;
uniform sampler2D uScene;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uCam;       // camX, camY in world px
uniform vec4 uPool;      // x, y, w, h in screen px
uniform vec3 uTint;      // shallow turquoise / emerald / indigo tint
uniform vec3 uDeep;      // deep cistern absorption colour
uniform vec3 uFoam;      // crest foam & specular colour
uniform float uAlpha;
uniform vec4 uRipples[6]; // (worldX, worldY, ageSec, amplitude), amp<=0 inactive
${NOISE}

void main() {
  vec2 px = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);
  if (px.x < uPool.x || px.x > uPool.x + uPool.z || px.y < uPool.y - 4.0 || px.y > uPool.y + uPool.w) discard;

  float wx = px.x + uCam.x;
  float wy = px.y + uCam.y;

  // Travelling surface wave + interactive hunter/enemy wake rings
  float surfWave = sin(wx * 0.085 + uTime * 2.9) * 1.15
                 + sin(wx * 0.19 - uTime * 4.1) * 0.65
                 + (vnoise(vec2(wx * 0.06 + uTime * 0.45, uTime * 0.6)) - 0.5) * 1.2;

  float ripSlope = 0.0;
  float ripFoam = 0.0;
  for (int i = 0; i < 6; i++) {
    vec4 rp = uRipples[i];
    if (rp.w > 0.005) {
      float dx = wx - rp.x;
      float dist = abs(dx);
      float rad = rp.z * 74.0;
      float decay = exp(-rp.z * 2.35) * exp(-abs(dist - rad) / (10.0 + rp.z * 14.0));
      float phase = (dist - rad) * 0.42;
      float w = cos(phase) * decay * rp.w;
      surfWave -= w * 2.8;
      ripSlope += -sin(phase) * sign(dx + 0.001) * decay * rp.w * 1.8;
      ripFoam += decay * rp.w * 0.65;
    }
  }

  float surfY = uPool.y + surfWave;
  float dy = px.y - surfY;
  if (dy < 0.0) discard;

  float poolH = max(6.0, uPool.w);
  float depth = clamp(dy / poolH, 0.0, 1.0);

  // Internal 2D wave normal for underwater refraction & planar surface reflection
  float n1 = vnoise(vec2(wx * 0.075 + uTime * 1.15, dy * 0.095 - uTime * 0.65)) - 0.5;
  float n2 = vnoise(vec2(wx * 0.16 - uTime * 1.65, dy * 0.17 + uTime * 0.90)) - 0.5;
  float nx = (n1 * 0.7 + n2 * 0.45) * 2.2 + ripSlope;
  float ny = (vnoise(vec2(wx * 0.11, dy * 0.13 + uTime * 1.2)) - 0.5) * 1.8;

  // 1. Underwater refraction of submerged stone tiles, pillars & wading legs
  vec2 refrPx = px + vec2(nx * (2.2 + depth * 2.6), ny * 1.6 + 1.0);
  vec3 underCol = texture2D(uScene, clamp(refrPx / uRes, vec2(0.002), vec2(0.998))).rgb;

  // Dancing underwater caustic ribbons brighter near shallow masonry & pool floor
  float cA = abs(vnoise(vec2(wx * 0.09 + dy * 0.04 + uTime * 0.85, wy * 0.08 - uTime * 0.55)) - 0.5);
  float cB = abs(vnoise(vec2(wx * 0.13 - dy * 0.05 - uTime * 0.72, wy * 0.11 + uTime * 0.62)) - 0.5);
  float caust = pow(clamp(1.0 - min(cA, cB) * 4.4, 0.0, 1.0), 2.2);

  // Beer-Lambert absorption: clear turquoise/emerald near meniscus, rich deep cistern hue below
  vec3 tintedUnder = mix(underCol * (uTint * 1.15 + vec3(0.32)), uDeep, clamp(0.26 + depth * 0.62, 0.0, 0.88));
  tintedUnder += uFoam * caust * (0.28 * (1.0 - depth * 0.35));

  // 2. Real-time planar reflection of everything above surfY (hunter, bosses, torches, ferries, arches)
  float reflY = surfY - dy * 0.96 - abs(ny) * 1.5;
  vec2 reflPx = vec2(px.x + nx * (3.2 + dy * 0.12), reflY);
  vec3 reflCol = texture2D(uScene, clamp(reflPx / uRes, vec2(0.002), vec2(0.998))).rgb;
  // Fresnel stronger near the water surface & at grazing ripples, fading gently with depth
  float fresnel = clamp((0.52 - depth * 0.30) + abs(nx) * 0.12, 0.14, 0.68);
  // Don't dim underwater visibility with pure-black sky voids
  float reflLuma = dot(reflCol, vec3(0.299, 0.587, 0.114));
  fresnel *= mix(0.45, 1.0, smoothstep(0.03, 0.25, reflLuma));

  vec3 col = mix(tintedUnder, reflCol, fresnel);

  // 3. Crisp animated surface meniscus, side-wall lapping foam & specular glints
  float meniscus = 1.0 - smoothstep(0.0, 2.2, dy);
  float subCrest = (1.0 - smoothstep(1.8, 5.2, dy)) * smoothstep(0.12, 0.42, n1 + ripFoam * 0.5);
  float wallDist = min(px.x - uPool.x, (uPool.x + uPool.z) - px.x);
  float shoreFoam = (1.0 - smoothstep(0.0, 5.0, wallDist)) * (1.0 - smoothstep(0.0, 10.0, dy)) * 0.55;
  float glint = smoothstep(0.40, 0.49, n1 * 0.6 + n2 * 0.5) * (1.0 - depth * 0.65);

  float foamAmt = clamp(meniscus * (0.72 + ripFoam * 0.35) + subCrest * 0.45 + shoreFoam + glint * 0.55, 0.0, 1.0);
  col = mix(col, uFoam, foamAmt * 0.82);

  float a = clamp(mix(0.68, 0.90, depth) * uAlpha + meniscus * 0.22, 0.0, 0.96);
  col = floor(col * 20.0) / 20.0;
  gl_FragColor = vec4(col * a, a);
}
`;

// Vertical cascading waterfall & sluice-veil shader with accelerating water ribbons,
// aerated white-water streaks, wet sheen, and churning plunge-pool mist at the base.
const WATERFALL_FRAG = `
${SHADER_PREC}
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uCam;
uniform vec4 uRect;      // x, y, w, h in screen px
uniform vec3 uTint;
uniform vec3 uFoam;
uniform float uSpeed;
uniform float uAlpha;
${NOISE}

void main() {
  vec2 px = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);
  if (px.x < uRect.x || px.x > uRect.x + uRect.z || px.y < uRect.y || px.y > uRect.y + uRect.w) discard;

  float u = (px.x - uRect.x) / max(1.0, uRect.z);
  float v = (px.y - uRect.y) / max(1.0, uRect.w);
  float wx = px.x + uCam.x;
  float wy = px.y + uCam.y;
  float t = uTime * uSpeed;

  // Accelerating downward water-sheet streaks at two frequencies
  float fallA = fbm(vec2(wx * 0.22, wy * 0.045 - t * 4.4));
  float fallB = vnoise(vec2(wx * 0.46 + 5.2, wy * 0.085 - t * 6.8));
  float sheet = fallA * 0.62 + fallB * 0.38;

  // Soft feathered side edges + spillover crest at top + churning plunge foam at bottom
  float edgeMask = smoothstep(0.0, 0.14, u) * (1.0 - smoothstep(0.86, 1.0, u));
  float lip = (1.0 - smoothstep(0.0, 0.09, v)) * (0.65 + 0.35 * sin(wx * 0.4 + t * 5.0));
  float boilN = fbm(vec2(wx * 0.16 + t * 0.9, (v - 0.82) * 9.0 - t * 2.2));
  float plunge = smoothstep(0.76, 0.98, v) * smoothstep(0.28, 0.78, boilN);

  float streak = smoothstep(0.46, 0.80, sheet);
  vec3 col = mix(uTint * 0.72, uTint * 1.18, sheet);
  col = mix(col, uFoam, clamp(streak * 0.72 + lip * 0.68 + plunge * 0.88, 0.0, 1.0));

  float a = clamp((0.46 + 0.42 * streak + plunge * 0.35 + lip * 0.25) * edgeMask * uAlpha, 0.0, 0.95);
  if (a <= 0.02) discard;
  col = floor(col * 16.0) / 16.0;
  a = floor(a * 10.0) / 10.0;
  gl_FragColor = vec4(col * a, a);
}
`;

// Upward-projected shimmering water caustics dancing across lower vaulted masonry.
const CAUSTICS_FRAG = `
${SHADER_PREC}
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform vec2 uCam;
uniform vec4 uRect;      // x, y, w, h in screen px
uniform vec3 uColor;
uniform float uAlpha;
${NOISE}

void main() {
  vec2 px = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);
  if (px.x < uRect.x || px.x > uRect.x + uRect.z || px.y < uRect.y || px.y > uRect.y + uRect.w) discard;

  float v = (px.y - uRect.y) / max(1.0, uRect.w); // 0 top .. 1 bottom (strongest near water below)
  float wx = px.x + uCam.x;
  float wy = px.y + uCam.y;

  vec2 p1 = vec2(wx * 0.055 + uTime * 0.42, wy * 0.065 - uTime * 0.34);
  vec2 p2 = vec2(wx * 0.072 - uTime * 0.36, wy * 0.058 + uTime * 0.29);
  float c1 = abs(vnoise(p1) - 0.5);
  float c2 = abs(vnoise(p2 + vec2(3.7, 8.1)) - 0.5);
  float net = pow(clamp(1.0 - min(c1, c2) * 4.6, 0.0, 1.0), 2.5);

  float vertMask = smoothstep(0.0, 0.55, v) * (1.0 - smoothstep(0.88, 1.0, v) * 0.35);
  float a = net * vertMask * uAlpha;
  if (a <= 0.012) discard;
  a = floor(a * 10.0) / 10.0;
  gl_FragColor = vec4(uColor * a, a);
}
`;

const FIRE_FRAG = `
${SHADER_PREC}
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform vec4 uFlame;     // x, y(base), w, h (scene px)
uniform vec4 uFlameCol;  // r,g,b, seed
${NOISE}
void main() {
  vec2 px = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);
  vec4 f = uFlame;
  vec2 d = vec2((px.x - f.x) / (f.z * 0.5), (f.y - px.y) / f.w);
  if (abs(d.x) > 1.2 || d.y < -0.05 || d.y > 1.2) discard;
  float seed = uFlameCol.w;
  float n = fbm(vec2(d.x * 1.6 + seed, d.y * 2.2 - uTime * (2.4 + fract(seed) * 1.5) + seed * 3.0));
  float width = mix(1.0, 0.18, d.y) * (0.75 + 0.5 * n);
  float body = 1.0 - smoothstep(width * 0.55, width, abs(d.x + (n - 0.5) * 0.5 * d.y));
  float tip = 1.0 - smoothstep(0.65 + 0.3 * n, 1.05, d.y);
  float a = body * tip * smoothstep(-0.05, 0.1, d.y);
  if (a <= 0.02) discard;
  float core = smoothstep(0.35, 0.95, a) * (1.0 - d.y * 0.7);
  vec3 col = mix(uFlameCol.rgb * 0.8, vec3(1.0, 0.96, 0.78), core);
  a = floor(a * 4.0) / 4.0 * 0.95;
  gl_FragColor = vec4(col * a, a);
}
`;

// Forked storm lightning bolt + electric cloud-bank sheet illumination for outdoor stages
const LIGHTNING_FRAG = `
${SHADER_PREC}
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uBoltX;     // strike x in scene px
uniform float uSeed;      // per-strike seed
uniform float uFlash;     // 0..1 intensity
uniform float uHorizon;   // max y of bolt reach
${NOISE}
float boltBranch(vec2 px, float x0, float y0, float y1, float slope, float seed, float amp, float coreW) {
  if (px.y < y0 || px.y > y1) return 0.0;
  float t = (px.y - y0) / max(1.0, y1 - y0);
  float jag = (fbm(vec2(px.y * 0.042 + seed * 11.3, seed * 3.7)) - 0.5) * amp;
  jag += (vnoise(vec2(px.y * 0.13 + seed * 29.1, seed * 7.1)) - 0.5) * (amp * 0.38);
  float cx = x0 + slope * (px.y - y0) + jag;
  float d = abs(px.x - cx);
  float taper = 1.0 - smoothstep(0.72, 1.0, t);
  float core = (1.0 - smoothstep(0.0, coreW, d)) * taper;
  float glow = exp(-d / (11.0 + 18.0 * (1.0 - t))) * 0.62 * taper;
  return core + glow;
}
void main() {
  vec2 px = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);
  if (px.y > uHorizon + 24.0) discard;
  // Main jagged trunk + two forked offshoots
  float m = boltBranch(px, uBoltX, 0.0, uHorizon, (hash(vec2(uSeed, 1.0)) - 0.5) * 0.28, uSeed, 54.0, 2.2);
  float forkY1 = uHorizon * 0.24;
  float forkX1 = uBoltX + (fbm(vec2(forkY1 * 0.042 + uSeed * 11.3, uSeed * 3.7)) - 0.5) * 54.0;
  m += boltBranch(px, forkX1, forkY1, uHorizon * 0.76, 0.52, uSeed + 4.3, 32.0, 1.4) * 0.8;
  float forkY2 = uHorizon * 0.42;
  float forkX2 = uBoltX + (fbm(vec2(forkY2 * 0.042 + uSeed * 11.3, uSeed * 3.7)) - 0.5) * 54.0;
  m += boltBranch(px, forkX2, forkY2, uHorizon * 0.90, -0.46, uSeed + 8.9, 28.0, 1.3) * 0.75;
  // Sheet-lightning cloud glow around the upper storm bank
  float cloudN = fbm(vec2((px.x - uBoltX) / 140.0 + uSeed, px.y / 68.0));
  float sheet = exp(-abs(px.x - uBoltX) / 190.0) * (1.0 - smoothstep(10.0, uHorizon * 0.85, px.y)) * (0.45 + 0.55 * cloudN) * 0.55;
  float v = clamp((m + sheet) * uFlash, 0.0, 1.35);
  if (v <= 0.015) discard;
  vec3 haloCol = vec3(0.56, 0.68, 1.0);
  vec3 coreCol = vec3(0.98, 0.99, 1.0);
  vec3 col = mix(haloCol, coreCol, clamp(m * 0.85, 0.0, 1.0));
  float a = clamp(floor(v * 8.0) / 8.0, 0.0, 1.0);
  gl_FragColor = vec4(col * a, a);
}
`;

// Convective molten lava shader for sunken lava basins and subterranean magma seas
const LAVA_FRAG = `
${SHADER_PREC}
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uScroll;
uniform vec4 uPool;      // x, y, w, h in scene px
${NOISE}
void main() {
  vec2 px = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);
  if (px.x < uPool.x || px.x > uPool.x + uPool.z || px.y < uPool.y || px.y > uPool.y + uPool.w) discard;
  float depth = clamp((px.y - uPool.y) / max(1.0, uPool.w), 0.0, 1.0);
  float wx = px.x + uScroll;
  vec2 p1 = vec2(wx / 26.0 + uTime * 0.32, (px.y - uPool.y) / 14.0 - uTime * 0.18);
  vec2 p2 = vec2(wx / 13.0 - uTime * 0.48, (px.y - uPool.y) / 9.0 + uTime * 0.25);
  float n = fbm(p1) * 0.62 + fbm(p2) * 0.38;
  // Bright yellow-white surface meniscus + glowing convective magma fissures between dark basalt crust
  float surface = 1.0 - smoothstep(0.0, 5.0, px.y - uPool.y);
  float hot = smoothstep(0.42, 0.76, n);
  vec3 crust = vec3(0.18, 0.04, 0.03);
  vec3 magma = vec3(0.96, 0.30, 0.05);
  vec3 whiteHot = vec3(1.0, 0.88, 0.36);
  vec3 col = mix(crust, magma, smoothstep(0.28, 0.58, n));
  col = mix(col, whiteHot, clamp(hot * 0.85 + surface * 0.72, 0.0, 1.0));
  col *= (1.05 - depth * 0.28);
  col = floor(col * 8.0) / 8.0;
  float a = 0.92;
  gl_FragColor = vec4(col * a, a);
}
`;

// Flowing Arctic Aurora Borealis curtains for Frozen Yule sky
const AURORA_FRAG = `
${SHADER_PREC}
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uScroll;
${NOISE}
void main() {
  vec2 px = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);
  if (px.y > 156.0) discard;
  float wx = px.x + uScroll * 0.05;
  // Swaying curtain baseline across the sky
  float wave = sin(wx * 0.011 + uTime * 0.35) * 18.0
             + cos(wx * 0.023 - uTime * 0.24) * 11.0;
  float baseLine = 98.0 + wave;
  float h = baseLine - px.y; // positive upward along curtainfolds
  if (h < -26.0 || h > 92.0) discard;
  // Vertical pleated folds + slow upward shimmer
  float fold = vnoise(vec2(wx * 0.048 + sin(uTime * 0.22 + wx * 0.006) * 1.4, uTime * 0.14));
  float fine = vnoise(vec2(wx * 0.13 - uTime * 0.31, px.y * 0.025 - uTime * 0.45));
  float streak = smoothstep(0.28, 0.86, fold * 0.72 + fine * 0.38);
  float vert = smoothstep(-22.0, 6.0, h) * (1.0 - smoothstep(14.0, 88.0, h));
  float a = streak * vert * 0.52;
  if (a <= 0.015) discard;
  float hNorm = clamp((h + 12.0) / 76.0, 0.0, 1.0);
  vec3 lowCol = vec3(0.22, 0.96, 0.72);   // emerald curtain skirt
  vec3 midCol = vec3(0.32, 0.78, 1.00);   // glacial cyan body
  vec3 topCol = vec3(0.68, 0.36, 0.96);   // twilight violet crown
  vec3 col = hNorm < 0.48
    ? mix(lowCol, midCol, hNorm / 0.48)
    : mix(midCol, topCol, (hNorm - 0.48) / 0.52);
  a = floor(a * 6.0) / 6.0;
  col = floor(col * 8.0) / 8.0;
  gl_FragColor = vec4(col * a, a);
}
`;

// Volumetric diagonal light shafts & stained-glass god-rays with drifting motes
const GODRAYS_FRAG = `
${SHADER_PREC}
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform float uScroll;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
uniform float uMulti;    // 1 = stained-glass tri-colour cycling, 0 = blend ColA..ColB
uniform float uLean;     // horizontal slant top-to-bottom (px)
uniform float uAlpha;
${NOISE}
void main() {
  vec2 px = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);
  float yFrac = px.y / uRes.y;
  if (yFrac > 0.96) discard;
  // Project pixel back to top-of-hall coordinate along the diagonal ray angle
  float rx = px.x - yFrac * uLean + uScroll * 0.36;
  float cellW = 148.0;
  float cid = floor(rx / cellW);
  float local = fract(rx / cellW);
  float jitter = hash(vec2(cid, 7.3)) * 0.26;
  float center = 0.36 + jitter;
  float halfW = (0.11 + 0.06 * hash(vec2(cid, 19.1))) * (1.0 + yFrac * 0.55);
  float dist = abs(local - center);
  float beam = 1.0 - smoothstep(halfW * 0.32, halfW, dist);
  if (beam <= 0.01) discard;
  // Subtle internal mullion streaks + slow breathing
  float streak = 0.65 + 0.35 * vnoise(vec2(rx * 0.09, yFrac * 1.6 - uTime * 0.12));
  float fadeY = smoothstep(0.0, 0.09, yFrac) * (1.0 - smoothstep(0.52, 0.95, yFrac));
  // Tiny luminous dust motes drifting inside the lit shaft
  vec2 mp = vec2(px.x * 0.075 + uScroll * 0.04, px.y * 0.075 - uTime * 0.35);
  float mote = smoothstep(0.84, 0.95, vnoise(mp)) * beam * 0.55;
  float a = (beam * streak * fadeY * 0.22 + mote * fadeY * 0.18) * uAlpha;
  if (a <= 0.008) discard;
  float mIdx = mod(abs(cid), 3.0);
  vec3 col = uMulti > 0.5
    ? (mIdx < 0.9 ? uColA : (mIdx < 1.9 ? uColB : uColC))
    : mix(uColA, uColB, hash(vec2(cid, 3.1)));
  a = floor(a * 10.0) / 10.0;
  gl_FragColor = vec4(col * a, a);
}
`;

// Scissored enemy & boss attack shader:
//   uMode 0 = swirling plasma orb + directional comet wake
//   uMode 1 = serpentine petrifying gaze beam
//   uMode 2 = billowing FBM petrifying miasma cloud
//   uMode 3 = blazing crescent slash wave
const ATTACK_FRAG = `
${SHADER_PREC}
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform vec4 uCenter;    // cx, cy, rx, ry in scene px
uniform vec4 uDirSeed;   // dirX, dirY (unit or velocity dir), mode, seed
uniform vec3 uCoreCol;
uniform vec3 uRimCol;
uniform float uAlpha;
${NOISE}
void main() {
  vec2 px = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);
  vec2 rel = px - uCenter.xy;
  vec2 dir = uDirSeed.xy;
  float dLen = length(dir);
  vec2 fwd = dLen > 0.001 ? dir / dLen : vec2(1.0, 0.0);
  vec2 perp = vec2(-fwd.y, fwd.x);
  // Local coordinates aligned with projectile travel: lx > 0 ahead, lx < 0 in wake
  float lx = dot(rel, fwd);
  float ly = dot(rel, perp);
  float mode = uDirSeed.z;
  float seed = uDirSeed.w;

  if (mode < 0.5) {
    // Mode 0: Plasma orb + comet tail
    float r = uCenter.z;
    float headR = length(rel) / max(1.0, r);
    // Elongated wake behind the orb (lx < 0)
    float tailLen = max(1.0, uCenter.w);
    float tailT = clamp(-lx / tailLen, 0.0, 1.0);
    float tailW = r * mix(0.82, 0.08, tailT);
    float n = fbm(vec2(lx * 0.11 - uTime * 7.5 + seed, ly * 0.14 + seed * 2.1));
    float orb = 1.0 - smoothstep(0.25, 1.05, headR - (n - 0.5) * 0.28);
    float wake = (lx < r * 0.25)
      ? (1.0 - smoothstep(tailW * 0.25, max(1.0, tailW), abs(ly + (n - 0.5) * r * 0.55 * tailT))) * (1.0 - tailT) * 0.85
      : 0.0;
    float e = max(orb, wake);
    if (e <= 0.03) discard;
    vec3 col = mix(uRimCol, uCoreCol, smoothstep(0.32, 0.88, e));
    float a = floor(clamp(e * uAlpha, 0.0, 1.0) * 5.0) / 5.0;
    gl_FragColor = vec4(col * a, a);
  } else if (mode < 1.5) {
    // Mode 1: Serpentine petrifying gaze beam
    float halfL = max(1.0, uCenter.z);
    float halfH = max(1.0, uCenter.w);
    if (abs(lx) > halfL || abs(ly) > halfH * 1.35) discard;
    float along = lx / halfL; // -1..1
    float wave1 = sin(lx * 0.26 - uTime * 22.0 + seed) * (halfH * 0.34);
    float wave2 = -sin(lx * 0.26 - uTime * 22.0 + seed + 1.5) * (halfH * 0.34);
    float s1 = exp(-abs(ly - wave1) / (halfH * 0.28));
    float s2 = exp(-abs(ly - wave2) / (halfH * 0.28)) * 0.8;
    float spine = exp(-abs(ly) / (halfH * 0.32));
    float tip = 1.0 - smoothstep(0.65, 1.0, abs(along));
    float pulse = 0.78 + 0.22 * sin(lx * 0.45 - uTime * 30.0);
    float e = clamp((max(s1, s2) * 0.85 + spine * 0.75) * tip * pulse, 0.0, 1.2);
    if (e <= 0.04) discard;
    vec3 col = mix(uRimCol, uCoreCol, smoothstep(0.38, 0.92, e));
    float a = floor(clamp(e * uAlpha, 0.0, 1.0) * 5.0) / 5.0;
    gl_FragColor = vec4(col * a, a);
  } else if (mode < 2.5) {
    // Mode 2: Billowing FBM petrifying miasma cloud
    float r = max(1.0, uCenter.z);
    float d = length(rel) / r;
    if (d > 1.15) discard;
    vec2 p = rel / max(8.0, r * 0.48);
    float swirl = fbm(p + vec2(uTime * 0.9 + seed, -uTime * 0.65)) * 0.65
                + fbm(p * 2.1 - vec2(uTime * 1.4, seed)) * 0.35;
    float body = (1.0 - smoothstep(0.35, 1.05, d)) * smoothstep(0.24, 0.76, swirl);
    float spark = smoothstep(0.76, 0.90, vnoise(p * 3.4 + uTime * 2.0)) * (1.0 - d);
    float a = clamp((body * 0.78 + spark * 0.55) * uAlpha, 0.0, 0.95);
    if (a <= 0.02) discard;
    vec3 col = mix(uRimCol, uCoreCol, clamp(swirl * 0.8 + spark * 0.9, 0.0, 1.0));
    a = floor(a * 5.0) / 5.0;
    gl_FragColor = vec4(col * a, a);
  } else {
    // Mode 3: Blazing crescent slash / spinning scythe arc
    float r = max(1.0, uCenter.z);
    vec2 q = vec2(lx, ly);
    // Curved crescent centered slightly behind origin so the convex blade leads forward
    vec2 arcC = vec2(-r * 0.32, 0.0);
    float rad = length(q - arcC);
    float ang = atan(q.y, q.x - arcC.x);
    float arcMask = 1.0 - smoothstep(0.82, 1.28, abs(ang));
    float ring = exp(-abs(rad - r * 0.82) / max(1.5, r * 0.16));
    float wisp = fbm(vec2(q.x * 0.16 - uTime * 9.0 + seed, q.y * 0.16));
    float trail = (lx < r * 0.45 && abs(ly) < r * 0.95)
      ? exp(-abs(rad - r * 0.66) / max(2.0, r * 0.34)) * wisp * 0.65 * arcMask
      : 0.0;
    float e = clamp(ring * arcMask + trail, 0.0, 1.2);
    if (e <= 0.04) discard;
    vec3 col = mix(uRimCol, uCoreCol, smoothstep(0.4, 0.92, e));
    float a = floor(clamp(e * uAlpha, 0.0, 1.0) * 5.0) / 5.0;
    gl_FragColor = vec4(col * a, a);
  }
}
`;

// Expanding pixel-quantized energy shockwave ring for boss slams, roars & shrine attunements
const SHOCKRING_FRAG = `
${SHADER_PREC}
varying vec2 vUv;
uniform vec2 uRes;
uniform float uTime;
uniform vec4 uRing;      // cx, cy, currentRadius, thickness (scene px)
uniform vec3 uColor;
uniform float uAlpha;
${NOISE}
void main() {
  vec2 px = vec2(vUv.x * uRes.x, (1.0 - vUv.y) * uRes.y);
  vec2 d = px - uRing.xy;
  // Perspective foreshortening so arena shockwaves hug the castle floor plane
  d.y *= 1.45;
  float dist = length(d);
  float band = max(2.5, uRing.w);
  float crest = exp(-pow((dist - uRing.z) / band, 2.0));
  // Subtle trailing inner plasma wake behind the leading wave
  float wake = (dist < uRing.z)
    ? exp(-max(0.0, uRing.z - dist) / max(6.0, band * 2.4)) * 0.32
    : 0.0;
  float energy = max(crest, wake);
  if (energy <= 0.04) discard;
  float ang = atan(d.y, d.x);
  float jag = 0.68 + 0.32 * vnoise(vec2(ang * 6.0 + uTime * 7.0, uRing.z * 0.09));
  float q = floor(clamp(energy * jag, 0.0, 1.0) * 5.0) / 5.0;
  float a = q * uAlpha;
  if (a <= 0.015) discard;
  vec3 hot = min(vec3(1.0), uColor * 1.35 + vec3(0.28, 0.24, 0.20));
  vec3 col = mix(uColor, hot, smoothstep(0.68, 0.98, crest) * uAlpha);
  gl_FragColor = vec4(col * a, a);
}
`;

// Batched combat spark, hit-slash burst, ember, faceted shard & vapour shader
const SPARK_VERT = `
${SHADER_PREC}
attribute vec2 aPos;
attribute vec2 aLocal;
attribute vec4 aColor;
attribute vec4 aMeta;    // x=kind, y=lifeFrac(0..1), z=seed, w=aspect(halfL/halfW)
uniform vec2 uRes;
varying vec2 vLocal;
varying vec4 vColor;
varying vec4 vMeta;
void main() {
  vLocal = aLocal;
  vColor = aColor;
  vMeta = aMeta;
  gl_Position = vec4((aPos.x / uRes.x) * 2.0 - 1.0, 1.0 - (aPos.y / uRes.y) * 2.0, 0.0, 1.0);
}
`;

const SPARK_FRAG = `
${SHADER_PREC}
varying vec2 vLocal;
varying vec4 vColor;
varying vec4 vMeta;
uniform float uTime;
${NOISE}
void main() {
  float kind = vMeta.x;
  float life = vMeta.y;
  float seed = vMeta.z;
  float aspect = max(1.0, vMeta.w);
  vec2 q = vLocal; // -1..1 along oriented quad (+x = forward along velocity/slash)

  if (kind < 0.5) {
    // Kind 0: Velocity-aligned combat comet-spark + twinkling 4-point star glint
    float headX = aspect > 1.15 ? 0.42 : 0.0;
    vec2 hp = vec2((q.x - headX) * aspect, q.y);
    float dHead = length(hp);
    float core = exp(-dHead * 3.2);
    float twinkle = 0.72 + 0.28 * sin(uTime * 30.0 + seed * 19.0);
    float star = (exp(-abs(hp.x) * 5.0) * exp(-abs(hp.y) * 1.35)
                + exp(-abs(hp.y) * 5.0) * exp(-abs(hp.x) * 1.35)) * twinkle;
    float streak = 0.0;
    if (aspect > 1.08 && q.x <= headX + 0.08) {
      float tailT = clamp((headX - q.x) / (headX + 1.0), 0.0, 1.0);
      float w = mix(0.28, 0.025, tailT);
      streak = exp(-abs(q.y) / max(0.02, w)) * pow(1.0 - tailT, 1.35);
    }
    float e = max(core * 1.25, max(streak * 0.95, star * 0.72));
    if (e <= 0.04) discard;
    float qE = floor(clamp(e, 0.0, 1.0) * 6.0) / 6.0;
    float a = qE * vColor.a;
    if (a <= 0.015) discard;
    vec3 warm = min(vec3(1.0), vColor.rgb * 1.3 + vec3(0.16, 0.12, 0.06));
    vec3 col = mix(vColor.rgb, warm, smoothstep(0.25, 0.65, e));
    col = mix(col, vec3(1.0, 0.98, 0.92), smoothstep(0.68, 1.08, e));
    gl_FragColor = vec4(col * a, a);
  } else if (kind < 1.5) {
    // Kind 1: Directional whip-slash X-flare + expanding shock-spark corona
    float t = clamp(1.0 - life, 0.0, 1.0);
    float reach = 0.32 + 0.68 * sin(min(1.0, t * 1.65) * 1.5708);
    float slashMain = exp(-abs(q.y) * 9.5) * (1.0 - smoothstep(0.12, reach, abs(q.x)));
    float slashCross = exp(-abs(q.x) * 10.5) * (1.0 - smoothstep(0.08, reach * 0.68, abs(q.y))) * (1.0 - t * 0.6);
    // Secondary diagonal glint at 45 deg
    vec2 dg = vec2((q.x + q.y) * 0.7071, (q.y - q.x) * 0.7071);
    float diag = (exp(-abs(dg.y) * 13.0) * (1.0 - smoothstep(0.05, reach * 0.52, abs(dg.x)))) * (1.0 - t * 0.75);
    float r = length(q);
    float ringR = 0.14 + 0.76 * (1.0 - (1.0 - t) * (1.0 - t));
    float ang = atan(q.y, q.x);
    float spokes = smoothstep(0.35, 0.90, 0.5 + 0.5 * cos(ang * 8.0 + seed * 6.283));
    float corona = exp(-abs(r - ringR) * 11.5) * spokes * (1.0 - t * 0.75);
    float core = exp(-r * 5.2) * (1.0 - t * 0.85);
    float e = max(max(slashMain, slashCross * 0.88), max(diag * 0.65 + corona * 0.92, core * 1.3));
    if (e <= 0.04) discard;
    float a = (floor(clamp(e, 0.0, 1.0) * 6.0) / 6.0) * vColor.a;
    if (a <= 0.015) discard;
    vec3 col = mix(vColor.rgb, vec3(1.0, 0.98, 0.90), smoothstep(0.42, 0.95, e));
    gl_FragColor = vec4(col * a, a);
  } else if (kind < 2.5) {
    // Kind 2: Flickering incandescent teardrop ember / bioluminescent firefly
    float headX = aspect > 1.12 ? 0.28 : 0.0;
    vec2 ep = vec2((q.x - headX) * aspect, q.y * (q.x < headX ? 1.18 : 1.0));
    float d = length(ep);
    float flick = 0.74 + 0.26 * sin(uTime * 20.0 + seed * 23.0);
    float halo = exp(-d * 2.55) * flick;
    float core = smoothstep(0.46, 0.04, d);
    float e = max(halo * 0.82, core * 1.15);
    if (e <= 0.04) discard;
    float a = (floor(clamp(e, 0.0, 1.0) * 5.0) / 5.0) * vColor.a;
    if (a <= 0.015) discard;
    vec3 hot = min(vec3(1.0), vColor.rgb * 1.45 + vec3(0.28, 0.22, 0.12));
    vec3 col = mix(vColor.rgb * (0.7 + 0.3 * life), hot, smoothstep(0.45, 0.95, e));
    gl_FragColor = vec4(col * a, a);
  } else if (kind < 3.5) {
    // Kind 3: Spinning faceted bone / stone splinter (beveled diamond)
    float spin = (seed > 0.5 ? 1.0 : -1.0) * (5.5 + seed * 7.5);
    float ang = uTime * spin + seed * 6.283;
    float ca = cos(ang), sa = sin(ang);
    vec2 rq = vec2(q.x * ca - q.y * sa, q.x * sa + q.y * ca);
    float d = abs(rq.x) * 0.88 + abs(rq.y) * 1.55;
    if (d > 0.95) discard;
    float edge = 1.0 - smoothstep(0.72, 0.95, d);
    float facet = rq.y > 0.0 ? 1.16 : 0.76;
    float rim = smoothstep(0.55, 0.82, d) * (rq.x > 0.0 ? 0.18 : -0.10);
    vec3 col = clamp(vColor.rgb * facet + rim, 0.0, 1.0);
    float a = edge * vColor.a;
    gl_FragColor = vec4(col * a, a);
  } else {
    // Kind 4: Soft noise-eroded wispy dust & smoke puff
    float r = length(q);
    if (r > 1.0) discard;
    float n = vnoise(q * 2.3 + vec2(seed * 7.1, -uTime * 1.15));
    float body = smoothstep(0.96, 0.18, r + (n - 0.5) * 0.38);
    float a = (floor(body * 5.0) / 5.0) * vColor.a;
    if (a <= 0.015) discard;
    vec3 col = vColor.rgb * (0.82 + 0.28 * n);
    gl_FragColor = vec4(col * a, a);
  }
}
`;

const GODRAY_THEMES = {
  graveyard: { a: [0.68, 0.74, 1.00], b: [0.52, 0.62, 0.95], c: [0.75, 0.80, 1.00], multi: 0, lean: 96, alpha: 0.72 },
  ramparts:  { a: [0.66, 0.74, 1.00], b: [0.54, 0.64, 0.96], c: [0.78, 0.84, 1.00], multi: 0, lean: 104, alpha: 0.70 },
  darkwood:  { a: [0.34, 0.96, 0.76], b: [0.24, 0.80, 0.72], c: [0.58, 1.00, 0.84], multi: 0, lean: 82, alpha: 0.85 },
  forest:    { a: [1.00, 0.74, 0.42], b: [0.92, 0.56, 0.34], c: [1.00, 0.84, 0.52], multi: 0, lean: 92, alpha: 0.78 },
  yule:      { a: [0.64, 0.86, 1.00], b: [0.46, 0.94, 0.84], c: [0.78, 0.90, 1.00], multi: 0, lean: 88, alpha: 0.74 },
  cathedral: { a: [0.98, 0.32, 0.46], b: [1.00, 0.80, 0.36], c: [0.44, 0.64, 1.00], multi: 1, lean: 86, alpha: 1.05 },
  throne:    { a: [0.98, 0.28, 0.38], b: [1.00, 0.72, 0.34], c: [0.76, 0.34, 0.92], multi: 1, lean: 90, alpha: 0.88 },
  library:   { a: [1.00, 0.82, 0.48], b: [0.70, 0.62, 1.00], c: [1.00, 0.88, 0.62], multi: 0, lean: 74, alpha: 0.76 },
  arcade:    { a: [1.00, 0.78, 0.44], b: [0.94, 0.58, 0.40], c: [1.00, 0.86, 0.56], multi: 0, lean: 70, alpha: 0.68 },
  ossuary:   { a: [0.42, 0.92, 0.78], b: [0.34, 0.72, 0.78], c: [0.56, 0.96, 0.84], multi: 0, lean: 64, alpha: 0.62 },
  ballroom:  { a: [0.86, 0.82, 1.00], b: [0.98, 0.78, 0.92], c: [0.74, 0.88, 1.00], multi: 0, lean: 80, alpha: 0.74 },
  coliseum:  { a: [1.00, 0.64, 0.42], b: [0.96, 0.44, 0.34], c: [1.00, 0.80, 0.52], multi: 0, lean: 94, alpha: 0.72 },
  aqueduct:  { a: [0.38, 0.88, 0.98], b: [0.28, 0.74, 0.88], c: [0.64, 0.96, 1.00], multi: 0, lean: 72, alpha: 0.78 },
  skykeep:   { a: [0.80, 0.90, 1.00], b: [1.00, 0.90, 0.68], c: [0.68, 0.84, 1.00], multi: 0, lean: 98, alpha: 0.82 },
};

const CLOUD_THEMES = {
  graveyard: { color: [0.62, 0.66, 0.82], shade: [0.16, 0.15, 0.28], density: 0.55, top: 0, bottom: 150 },
  ramparts: { color: [0.60, 0.65, 0.84], shade: [0.15, 0.15, 0.28], density: 0.6, top: 0, bottom: 150 },
  darkwood: { color: [0.36, 0.60, 0.58], shade: [0.06, 0.14, 0.14], density: 0.5, top: 0, bottom: 120 },
  forest: { color: [0.72, 0.52, 0.40], shade: [0.18, 0.11, 0.14], density: 0.5, top: 0, bottom: 140 },
  yule: { color: [0.72, 0.80, 0.95], shade: [0.14, 0.18, 0.34], density: 0.7, top: 0, bottom: 150 },
  coliseum: { color: [0.74, 0.46, 0.44], shade: [0.20, 0.10, 0.14], density: 0.58, top: 0, bottom: 145 },
  skykeep: { color: [0.78, 0.86, 0.98], shade: [0.20, 0.26, 0.44], density: 0.65, top: 0, bottom: 165 },
};

export class FxLayers {
  constructor() {
    this.ok = false; this.enabled = false; this.time = 0;
    this.flames = [];
    this.attacks = [];
    this.rings = [];
    try { this.init(); } catch (e) { console.warn('FxLayers disabled:', e); this.ok = false; }
  }

  init() {
    if (typeof document === 'undefined') throw new Error('no document');
    // Native 1:1 640x360 render target so scissored shaders match exact 1px sprite crispness.
    this.scale = 1.0;
    const c = document.createElement('canvas');
    c.width = Math.round(W * this.scale); c.height = Math.round(H * this.scale);
    c.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.ok = false;
      this.enabled = false;
    });
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
    this.pWaterPool = this.program(VERT, WATER_POOL_FRAG);
    this.pWaterfall = this.program(VERT, WATERFALL_FRAG);
    this.pCaustics = this.program(VERT, CAUSTICS_FRAG);
    this.pFire = this.program(VERT, FIRE_FRAG);
    this.pLightning = this.program(VERT, LIGHTNING_FRAG);
    this.pLava = this.program(VERT, LAVA_FRAG);
    this.pAurora = this.program(VERT, AURORA_FRAG);
    this.pGodRays = this.program(VERT, GODRAYS_FRAG);
    this.pAttack = this.program(VERT, ATTACK_FRAG);
    this.pShockRing = this.program(VERT, SHOCKRING_FRAG);
    this.pSpark = this.program(SPARK_VERT, SPARK_FRAG);
    this.pSpark.aLocal = gl.getAttribLocation(this.pSpark.p, 'aLocal');
    this.pSpark.aColor = gl.getAttribLocation(this.pSpark.p, 'aColor');
    this.pSpark.aMeta = gl.getAttribLocation(this.pSpark.p, 'aMeta');
    // Snapshot texture of the 2D scene canvas for real-time water reflection & refraction
    const snapTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, snapTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.sceneSnapTex = snapTex;
    this._rippleUniformBuf = new Float32Array(24);
    this.sparkCap = 720;
    this.sparkFloats = new Float32Array(this.sparkCap * 6 * 12);
    this.sparkVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sparkVbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.sparkFloats.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad);
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
  update(dt) { this.time = (this.time + dt) % 3600; }

  /** Runs a program over the canvas (scissored to a scene-px rect) and blits that rect into ctx. */
  run(ctx, prog, rect, setUniforms, composite = 'source-over') {
    if (!this.enabled) return;
    const gl = this.gl;
    if (gl.isContextLost && gl.isContextLost()) { this.ok = false; this.enabled = false; return; }
    const k = this.scale, cw = this.canvas.width, ch = this.canvas.height;
    const x = Math.max(0, Math.floor(rect.x)), y = Math.max(0, Math.floor(rect.y));
    const w = Math.min(W - x, Math.ceil(rect.w)), h = Math.min(H - y, Math.ceil(rect.h));
    if (w <= 0 || h <= 0) return;
    const sx = Math.floor(x * k), sy = Math.floor(y * k), sw = Math.ceil(w * k) + 1, sh = Math.ceil(h * k) + 1;
    gl.viewport(0, 0, cw, ch);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(sx, ch - sy - sh, sw, sh);
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
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.canvas, sx, sy, sw, sh, Math.round(sx / k), Math.round(sy / k), Math.round(sw / k), Math.round(sh / k));
    ctx.restore();
  }

  clouds(ctx, camX, theme, flash = 0) {
    const T = CLOUD_THEMES[theme] || CLOUD_THEMES.graveyard;
    const f = Math.max(0, Math.min(1, flash));
    const c0 = T.color[0] + (0.94 - T.color[0]) * f;
    const c1 = T.color[1] + (0.96 - T.color[1]) * f;
    const c2 = T.color[2] + (1.00 - T.color[2]) * f;
    const s0 = T.shade[0] + (0.42 - T.shade[0]) * f;
    const s1 = T.shade[1] + (0.48 - T.shade[1]) * f;
    const s2 = T.shade[2] + (0.68 - T.shade[2]) * f;
    this.run(ctx, this.pCloud, { x: 0, y: 0, w: W, h: T.bottom }, (gl, u) => {
      gl.uniform1f(u.uScroll, camX * 0.06);
      gl.uniform3f(u.uColor, c0, c1, c2);
      gl.uniform3f(u.uShade, s0, s1, s2);
      gl.uniform1f(u.uDensity, T.density + f * 0.18);
      gl.uniform1f(u.uTop, T.top);
      gl.uniform1f(u.uBottom, T.bottom);
    });
  }

  lightning(ctx, boltX, seed, flash, horizonY = 230) {
    if (flash <= 0.02) return;
    this.run(ctx, this.pLightning, { x: 0, y: 0, w: W, h: Math.min(H, horizonY + 24) }, (gl, u) => {
      gl.uniform1f(u.uBoltX, boltX);
      gl.uniform1f(u.uSeed, seed);
      gl.uniform1f(u.uFlash, flash);
      gl.uniform1f(u.uHorizon, horizonY);
    }, 'lighter');
  }

  lava(ctx, rect, camX) {
    this.run(ctx, this.pLava, rect, (gl, u) => {
      gl.uniform1f(u.uScroll, camX);
      gl.uniform4f(u.uPool, rect.x, rect.y, rect.w, rect.h);
    });
  }

  fog(ctx, camX, floorY, color = [0.62, 0.66, 0.82], amount = 0.42, camY = 0) {
    const y0 = Math.max(0, floorY - 120);
    this.run(ctx, this.pFog, { x: 0, y: y0, w: W, h: Math.min(H, floorY + 40) - y0 }, (gl, u) => {
      gl.uniform1f(u.uScroll, camX);
      gl.uniform1f(u.uScrollY, camY);
      gl.uniform3f(u.uColor, color[0], color[1], color[2]);
      gl.uniform1f(u.uAmount, amount);
      gl.uniform1f(u.uFloor, floorY);
    });
  }

  /** Snapshots the current 2D frame (`ctx.canvas`) into `this.sceneSnapTex` (top-left UV space). */
  uploadScene(ctx) {
    if (!this.enabled || !ctx || !ctx.canvas) return false;
    const gl = this.gl;
    if (gl.isContextLost && gl.isContextLost()) return false;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneSnapTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, ctx.canvas);
    return true;
  }

  water(ctx, rect, { horizon, camX, tint, spec, frozen = 0, alpha = 1 }) {
    if (!this.enabled) return;
    this.uploadScene(ctx);
    this.run(ctx, this.pWater, rect, (gl, u) => {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneSnapTex);
      gl.uniform1i(u.uScene, 0);
      gl.uniform1f(u.uScroll, camX);
      gl.uniform1f(u.uHorizon, horizon);
      gl.uniform3f(u.uTint, tint[0], tint[1], tint[2]);
      gl.uniform3f(u.uSpec, spec[0], spec[1], spec[2]);
      gl.uniform1f(u.uFrozen, frozen);
      gl.uniform1f(u.uAlpha, alpha);
    }, 'source-over');
  }

  /**
   * Renders a realistic play-plane flooded water channel or reflecting basin
   * with underwater refraction, Beer-Lambert depth absorption, subsurface caustics,
   * live planar reflections of sprites/torches/arches, and interactive wake ripples.
   */
  waterPool(ctx, rect, {
    camX = 0, camY = 0,
    tint = [0.24, 0.72, 0.84],
    deep = [0.04, 0.14, 0.24],
    foam = [0.86, 0.97, 1.00],
    ripples = null,
    alpha = 0.92,
    upload = true,
  } = {}) {
    if (!this.enabled) return;
    if (upload) this.uploadScene(ctx);
    const rb = this._rippleUniformBuf;
    rb.fill(0);
    if (Array.isArray(ripples) && ripples.length > 0) {
      const worldLeft = rect.x + camX - 96;
      const worldRight = rect.x + rect.w + camX + 96;
      let count = 0;
      for (let i = ripples.length - 1; i >= 0 && count < 6; i--) {
        const rp = ripples[i];
        if (!rp || rp.amp <= 0.01 || rp.x < worldLeft || rp.x > worldRight) continue;
        const base = count * 4;
        rb[base] = rp.x;
        rb[base + 1] = rp.y;
        rb[base + 2] = rp.t;
        rb[base + 3] = rp.amp;
        count++;
      }
    }
    const padRect = { x: rect.x, y: rect.y - 4, w: rect.w, h: rect.h + 4 };
    this.run(ctx, this.pWaterPool, padRect, (gl, u) => {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneSnapTex);
      gl.uniform1i(u.uScene, 0);
      gl.uniform2f(u.uCam, camX, camY);
      gl.uniform4f(u.uPool, rect.x, rect.y, rect.w, rect.h);
      gl.uniform3f(u.uTint, tint[0], tint[1], tint[2]);
      gl.uniform3f(u.uDeep, deep[0], deep[1], deep[2]);
      gl.uniform3f(u.uFoam, foam[0], foam[1], foam[2]);
      gl.uniform1f(u.uAlpha, alpha);
      if (u.uRipples) gl.uniform4fv(u.uRipples, rb);
    }, 'source-over');
  }

  /** Renders an accelerating vertical waterfall curtain & churning plunge foam. */
  waterfall(ctx, rect, {
    camX = 0, camY = 0,
    tint = [0.28, 0.76, 0.90],
    foam = [0.90, 0.98, 1.00],
    speed = 1.0,
    alpha = 0.88,
  } = {}) {
    if (!this.enabled) return;
    this.run(ctx, this.pWaterfall, rect, (gl, u) => {
      gl.uniform2f(u.uCam, camX, camY);
      gl.uniform4f(u.uRect, rect.x, rect.y, rect.w, rect.h);
      gl.uniform3f(u.uTint, tint[0], tint[1], tint[2]);
      gl.uniform3f(u.uFoam, foam[0], foam[1], foam[2]);
      gl.uniform1f(u.uSpeed, speed);
      gl.uniform1f(u.uAlpha, alpha);
    }, 'source-over');
  }

  /** Projects shimmering upward water-caustic light onto lower vaulted stone halls. */
  caustics(ctx, rect, {
    camX = 0, camY = 0,
    color = [0.34, 0.88, 0.96],
    alpha = 0.30,
  } = {}) {
    if (!this.enabled || alpha <= 0.01) return;
    this.run(ctx, this.pCaustics, rect, (gl, u) => {
      gl.uniform2f(u.uCam, camX, camY);
      gl.uniform4f(u.uRect, rect.x, rect.y, rect.w, rect.h);
      gl.uniform3f(u.uColor, color[0], color[1], color[2]);
      gl.uniform1f(u.uAlpha, alpha);
    }, 'lighter');
  }

  /** Queue a flame (scene px): base centre (x, y), width, height, colour, seed. */
  addFlame(x, y, w, h, color = [1.0, 0.55, 0.15], seed = 0) {
    if (!this.enabled || this.flames.length >= 24) return;
    if (x < -20 || x > W + 20 || y < -20 || y > H + 60) return;
    this.flames.push({ x, y, w, h, color, seed });
  }

  /** Draws every queued flame as its own small quad (cost ~ flame area) and clears the queue. */
  flushFlames(ctx) {
    const list = this.flames;
    this.flames = [];
    if (!this.enabled || !list.length) return;
    for (const f of list) {
      this.run(ctx, this.pFire, { x: f.x - f.w * 0.7, y: f.y - f.h * 1.25, w: f.w * 1.4, h: f.h * 1.3 + 4 }, (gl, u) => {
        gl.uniform4f(u.uFlame, f.x, f.y, f.w, f.h);
        gl.uniform4f(u.uFlameCol, f.color[0], f.color[1], f.color[2], f.seed);
      }, 'lighter');
    }
  }

  /** Rippling Arctic Aurora Borealis curtain across upper sky (Stage 4: Frozen Yule). */
  aurora(ctx, camX) {
    this.run(ctx, this.pAurora, { x: 0, y: 0, w: W, h: 160 }, (gl, u) => {
      gl.uniform1f(u.uScroll, camX);
    }, 'lighter');
  }

  /** Volumetric diagonal stained-glass or moonlight shafts with drifting dust motes. */
  godRays(ctx, camX, theme, alpha = 1) {
    const T = GODRAY_THEMES[theme];
    if (!T || alpha <= 0.01) return;
    this.run(ctx, this.pGodRays, { x: 0, y: 0, w: W, h: H - 12 }, (gl, u) => {
      gl.uniform1f(u.uScroll, camX);
      gl.uniform3f(u.uColA, T.a[0], T.a[1], T.a[2]);
      gl.uniform3f(u.uColB, T.b[0], T.b[1], T.b[2]);
      gl.uniform3f(u.uColC, T.c[0], T.c[1], T.c[2]);
      gl.uniform1f(u.uMulti, T.multi);
      gl.uniform1f(u.uLean, T.lean);
      gl.uniform1f(u.uAlpha, T.alpha * alpha);
    }, 'lighter');
  }

  /** Queue an enemy/boss/relic shader attack effect in scene px. */
  addAttack({
    x, y, rx = 14, ry = 22, dirX = 1, dirY = 0, mode = 0, seed = 0,
    core = [1, 0.95, 0.8], rim = [1, 0.4, 0.1], alpha = 0.9, composite = 'lighter',
  }) {
    if (!this.enabled || this.attacks.length >= 32) return;
    const pad = Math.max(rx, ry) + 8;
    if (x < -pad || x > W + pad || y < -pad || y > H + pad) return;
    this.attacks.push({ x, y, rx, ry, dirX, dirY, mode, seed, core, rim, alpha, composite, pad });
  }

  /** Queue an expanding world-space shockwave energy ring (screen coords). */
  addShockRing(x, y, radius, thickness = 7, color = [1.0, 0.65, 0.25], alpha = 0.85) {
    if (!this.enabled || this.rings.length >= 10 || alpha <= 0.02) return;
    const pad = radius + thickness * 2 + 4;
    if (x + pad < 0 || x - pad > W || y + pad < 0 || y - pad > H) return;
    this.rings.push({ x, y, radius, thickness, color, alpha, pad });
  }

  /** Flushes all queued enemy/boss shader attacks and shockwave rings. */
  flushAttacks(ctx) {
    const atk = this.attacks;
    const rng = this.rings;
    this.attacks = [];
    this.rings = [];
    if (!this.enabled) return;
    for (const a of atk) {
      const box = { x: a.x - a.pad, y: a.y - a.pad, w: a.pad * 2, h: a.pad * 2 };
      this.run(ctx, this.pAttack, box, (gl, u) => {
        gl.uniform4f(u.uCenter, a.x, a.y, a.rx, a.ry);
        gl.uniform4f(u.uDirSeed, a.dirX, a.dirY, a.mode, a.seed);
        gl.uniform3f(u.uCoreCol, a.core[0], a.core[1], a.core[2]);
        gl.uniform3f(u.uRimCol, a.rim[0], a.rim[1], a.rim[2]);
        gl.uniform1f(u.uAlpha, a.alpha);
      }, a.composite);
    }
    for (const r of rng) {
      const box = { x: r.x - r.pad, y: r.y - r.pad * 0.85, w: r.pad * 2, h: r.pad * 1.7 };
      this.run(ctx, this.pShockRing, box, (gl, u) => {
        gl.uniform4f(u.uRing, r.x, r.y, r.radius, r.thickness);
        gl.uniform3f(u.uColor, r.color[0], r.color[1], r.color[2]);
        gl.uniform1f(u.uAlpha, r.alpha);
      }, 'lighter');
    }
  }

  /**
   * Renders an array of oriented particle quads in a single scissored WebGL draw call.
   * Each quad: `{ x, y, halfL, halfW, dirX, dirY, r, g, b, a, kind, life, seed }`.
   */
  drawSparkBatch(ctx, quads, composite = 'lighter') {
    if (!this.enabled || !quads || !quads.length) return;
    const gl = this.gl, k = this.scale, cw = this.canvas.width, ch = this.canvas.height;
    const prog = this.pSpark;
    const buf = this.sparkFloats;
    const count = Math.min(quads.length, this.sparkCap);
    let minX = W, minY = H, maxX = 0, maxY = 0;
    let vi = 0;

    for (let i = 0; i < count; i++) {
      const q = quads[i];
      const fx = q.dirX, fy = q.dirY;
      const px = -fy, py = fx;
      const hl = q.halfL, hw = q.halfW;
      const aspect = hw > 0.001 ? hl / hw : 1.0;
      const reach = Math.max(hl, hw) + 2;
      if (q.x - reach < minX) minX = q.x - reach;
      if (q.y - reach < minY) minY = q.y - reach;
      if (q.x + reach > maxX) maxX = q.x + reach;
      if (q.y + reach > maxY) maxY = q.y + reach;

      // 4 oriented quad corners: (-1,-1), (1,-1), (-1,1), (1,1)
      const x0 = q.x - fx * hl - px * hw, y0 = q.y - fy * hl - py * hw;
      const x1 = q.x + fx * hl - px * hw, y1 = q.y + fy * hl - py * hw;
      const x2 = q.x - fx * hl + px * hw, y2 = q.y - fy * hl + py * hw;
      const x3 = q.x + fx * hl + px * hw, y3 = q.y + fy * hl + py * hw;

      const writeV = (vx, vy, lu, lv) => {
        buf[vi] = vx; buf[vi + 1] = vy;
        buf[vi + 2] = lu; buf[vi + 3] = lv;
        buf[vi + 4] = q.r; buf[vi + 5] = q.g; buf[vi + 6] = q.b; buf[vi + 7] = q.a;
        buf[vi + 8] = q.kind; buf[vi + 9] = q.life; buf[vi + 10] = q.seed; buf[vi + 11] = aspect;
        vi += 12;
      };
      writeV(x0, y0, -1, -1);
      writeV(x1, y1,  1, -1);
      writeV(x2, y2, -1,  1);
      writeV(x2, y2, -1,  1);
      writeV(x1, y1,  1, -1);
      writeV(x3, y3,  1,  1);
    }

    const bx = Math.max(0, Math.floor(minX)), by = Math.max(0, Math.floor(minY));
    const bw = Math.min(W - bx, Math.ceil(maxX - bx)), bh = Math.min(H - by, Math.ceil(maxY - by));
    if (bw <= 0 || bh <= 0) return;

    const sx = Math.floor(bx * k), sy = Math.floor(by * k);
    const sw = Math.min(cw - sx, Math.ceil(bw * k) + 1);
    const sh = Math.min(ch - sy, Math.ceil(bh * k) + 1);

    gl.viewport(0, 0, cw, ch);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(sx, ch - sy - sh, sw, sh);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    gl.useProgram(prog.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.sparkVbo);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf.subarray(0, vi));

    const stride = 12 * 4;
    gl.enableVertexAttribArray(prog.aPos);
    gl.vertexAttribPointer(prog.aPos, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(prog.aLocal);
    gl.vertexAttribPointer(prog.aLocal, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(prog.aColor);
    gl.vertexAttribPointer(prog.aColor, 4, gl.FLOAT, false, stride, 16);
    gl.enableVertexAttribArray(prog.aMeta);
    gl.vertexAttribPointer(prog.aMeta, 4, gl.FLOAT, false, stride, 32);

    gl.uniform2f(prog.u.uRes, W, H);
    gl.uniform1f(prog.u.uTime, this.time);
    gl.drawArrays(gl.TRIANGLES, 0, count * 6);

    gl.disableVertexAttribArray(prog.aLocal);
    gl.disableVertexAttribArray(prog.aColor);
    gl.disableVertexAttribArray(prog.aMeta);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);

    ctx.save();
    ctx.globalCompositeOperation = composite;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.canvas, sx, sy, sw, sh, Math.round(sx / k), Math.round(sy / k), Math.round(sw / k), Math.round(sh / k));
    ctx.restore();
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
