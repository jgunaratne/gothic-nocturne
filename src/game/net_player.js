// Rendering & visual identity for remote network hunters sharing the castle:
// - Pixel-art garment colorizer (distinct cloak & tunic palettes per player slot)
// - Full 60 fps sprite, whip-strike, crouch-whip, and lantern-aura rendering
// - Passing-by Soul-Lantern resonance shimmer when hunters cross paths
// - Off-screen directional edge beacons for peers in the same castle region

import { W, H, TILE, PLAYER } from '../engine/constants.js';
import { getFxLayers } from '../engine/fxlayers.js';
import { heroFrame, drawWhipFrame } from './hero_anim.js';
import { WEAPONS, drawWeaponAction, drawCarriedShield } from './weapons.js';

export const HUNTER_PALETTES = [
  {
    name: 'JADE',
    hex: '#62f2c2',
    aura: 'rgba(98, 242, 194, 0.24)',
    cloak: [38, 158, 126],
    trim: [132, 248, 212],
    whip: '#62f2c2',
  },
  {
    name: 'AZURE',
    hex: '#7cc8ff',
    aura: 'rgba(124, 200, 255, 0.24)',
    cloak: [46, 118, 204],
    trim: [152, 218, 255],
    whip: '#8ed4ff',
  },
  {
    name: 'AMBER',
    hex: '#ffd27a',
    aura: 'rgba(255, 210, 122, 0.24)',
    cloak: [184, 122, 34],
    trim: [255, 224, 138],
    whip: '#ffd27a',
  },
  {
    name: 'CRIMSON',
    hex: '#ff6e88',
    aura: 'rgba(255, 110, 136, 0.24)',
    cloak: [176, 42, 72],
    trim: [255, 142, 164],
    whip: '#ff7a92',
  },
  {
    name: 'AMETHYST',
    hex: '#c89bff',
    aura: 'rgba(200, 155, 255, 0.24)',
    cloak: [122, 68, 196],
    trim: [216, 178, 255],
    whip: '#d2adff',
  },
  {
    name: 'COPPER',
    hex: '#ff9a52',
    aura: 'rgba(255, 154, 82, 0.24)',
    cloak: [188, 86, 32],
    trim: [255, 182, 118],
    whip: '#ffaa68',
  },
  {
    name: 'SILVER',
    hex: '#dce8ff',
    aura: 'rgba(220, 232, 255, 0.22)',
    cloak: [112, 130, 168],
    trim: [228, 238, 255],
    whip: '#e8f0ff',
  },
  {
    name: 'MOSS',
    hex: '#b5ef7a',
    aura: 'rgba(181, 239, 122, 0.22)',
    cloak: [98, 156, 48],
    trim: [198, 248, 140],
    whip: '#c4f48e',
  },
];

export function paletteForSlot(slot = 0) {
  return HUNTER_PALETTES[((slot | 0) % HUNTER_PALETTES.length + HUNTER_PALETTES.length) % HUNTER_PALETTES.length];
}

const CLOAK_CACHE = new Map();

/**
 * Returns an offscreen canvas of `(sheet, frameName)` with its tunic/leather
 * pixels shifted to the remote hunter's cloak palette while keeping dark
 * pixel outlines and warm skin tones intact.
 */
function getCloakSprite(assets, sheet, frameName, slot) {
  const f = assets.frame(sheet, frameName);
  const srcImg = assets.img(sheet);
  if (!f || !srcImg || typeof document === 'undefined') return null;

  const palIdx = ((slot | 0) % HUNTER_PALETTES.length + HUNTER_PALETTES.length) % HUNTER_PALETTES.length;
  const key = `${sheet}|${frameName}|${palIdx}`;
  const cached = CLOAK_CACHE.get(key);
  if (cached) return cached;

  const pal = HUNTER_PALETTES[palIdx];
  const c = document.createElement('canvas');
  c.width = f.w;
  c.height = f.h;
  const g = c.getContext('2d');
  g.drawImage(srcImg, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);

  try {
    const imgData = g.getImageData(0, 0, f.w, f.h);
    const d = imgData.data;
    const [cr, cg, cb] = pal.cloak;
    const [tr, tg, tb] = pal.trim;
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (a < 16) continue;
      const r = d[i], gr = d[i + 1], b = d[i + 2];
      const luma = r * 0.299 + gr * 0.587 + b * 0.114;
      // Preserve crisp dark pixel outlines
      if (luma < 22) continue;
      // Preserve warm skin/face highlights (flesh tones have high R, mid-high G, lower B)
      const isSkin = r > 138 && gr > 96 && r > gr + 12 && gr >= b + 8;
      if (isSkin) continue;

      // Blend garment luminance into cloak primary + trim highlight
      const t = Math.min(1, Math.max(0, (luma - 22) / 145));
      const hi = Math.max(0, (t - 0.55) / 0.45);
      const nr = cr * (0.42 + t * 0.78) * (1 - hi * 0.55) + tr * (hi * 0.55);
      const ng = cg * (0.42 + t * 0.78) * (1 - hi * 0.55) + tg * (hi * 0.55);
      const nb = cb * (0.42 + t * 0.78) * (1 - hi * 0.55) + tb * (hi * 0.55);
      d[i] = Math.min(255, Math.round(r * 0.22 + nr * 0.78));
      d[i + 1] = Math.min(255, Math.round(gr * 0.22 + ng * 0.78));
      d[i + 2] = Math.min(255, Math.round(b * 0.22 + nb * 0.78));
    }
    g.putImageData(imgData, 0, 0);
  } catch {
    // Fallback if canvas is tainted or mock context lacks pixel readback
  }

  if (CLOAK_CACHE.size > 320) CLOAK_CACHE.clear();
  CLOAK_CACHE.set(key, c);
  return c;
}

function drawCloakFrame(ctx, assets, sheet, frameName, slot, x, y, flip = false, alpha = 1) {
  const f = assets.frame(sheet, frameName);
  if (!f) return;
  const tinted = getCloakSprite(assets, sheet, frameName, slot);
  if (!tinted) {
    assets.draw(ctx, sheet, frameName, x, y, flip, alpha);
    return;
  }
  ctx.save();
  if (alpha !== 1) ctx.globalAlpha = alpha;
  if (!flip) {
    ctx.drawImage(tinted, 0, 0, f.w, f.h, Math.round(x - f.ax), Math.round(y - f.ay), f.w, f.h);
  } else {
    ctx.translate(Math.round(x), Math.round(y - f.ay));
    ctx.scale(-1, 1);
    ctx.drawImage(tinted, 0, 0, f.w, f.h, Math.round(-f.ax), 0, f.w, f.h);
  }
  ctx.restore();
}

function drawRemoteWhipStrike(ctx, assets, slot, reach, x, y, flip, alpha, sheet, name, lash) {
  const tinted = getCloakSprite(assets, sheet, name, slot);
  const pal = HUNTER_PALETTES[slot % HUNTER_PALETTES.length];
  drawWhipFrame(ctx, assets, sheet, name, x, y, flip, alpha, reach, lash,
    tinted || null, tinted ? 0 : null, tinted ? 0 : null, pal.whip, '#ffffff');
}

function remoteFrame(assets, p) {
  const whipScale = ((p.relicsMask >> 11) & 1) ? 0.75 : 1;
  const rw = p.wId && WEAPONS[p.wId] ? WEAPONS[p.wId] : null;
  const meleeAnim = (rw && rw.category !== 'whip' && p.wT != null && p.wT >= 0) ? {
    category: rw.category,
    k: Math.max(0, Math.min(1, p.wT / Math.max(0.05, p.wDur || rw.duration || 0.3))),
    crouch: !!(p.wCr || p.anim === 'crouch'),
    guarding: !!p.wGd,
    airborne: p.anim === 'jump',
  } : null;
  return heroFrame(assets, {
    state: p.anim,
    walkFrame: p.walkFrame,
    attackT: p.attackT,
    whipTime: PLAYER.whipTime * whipScale,
    whipActive: [PLAYER.whipActive[0] * whipScale, PLAYER.whipActive[1] * whipScale],
    throwing: p.throwing,
    attackCrouch: p.attackCrouch,
    vy: p.vy,
    idleT: p.idleT || 0,
    fidgetT: p.fidgetT == null ? -1 : p.fidgetT,
    deadT: p.deadT || 0,
    hurtT: p.hurtT || 0,
    landT: 0,
    dashK: p.dashK != null ? p.dashK : 0.5,
    runT: p.runT != null ? p.runT : 1,
    runFrame: p.runFrame || 0,
    meleeAnim,
  });
}

/**
 * Draws all remote network hunters currently inside `world.stage.key`,
 * including 3D contact shadows, cloak-tinted sprites, whip strikes,
 * passing-by lantern resonance, and floating nameplates.
 */
export function drawRemotePlayers(ctx, world, peersInStage, time = 0) {
  if (!peersInStage || peersInStage.length === 0) return;
  const camX = world.camera.rx;
  const camY = world.camera.ry;
  const assets = world.assets;
  const font = world.font;
  const localP = world.player;

  for (const p of peersInStage) {
    const sx = p.x - camX;
    const sy = p.y - camY;
    if (sx < -110 || sx > W + 110 || sy < -90 || sy > H + 90) continue;

    const pal = paletteForSlot(p.slot);
    const dist = Math.hypot(p.x - localP.x, p.y - localP.y);

    // 1. Passing-by Soul-Lantern resonance when two hunters cross paths (< 72px)
    if (dist < 72 && localP.alive && p.anim !== 'dead') {
      const prox = 1 - dist / 72;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = pal.hex;
      ctx.globalAlpha = 0.22 + prox * 0.28;
      ctx.lineWidth = 1;
      const mx = (sx + (localP.x - camX)) * 0.5;
      const my = (sy + (localP.y - camY)) * 0.5 - 28 - Math.sin(time * 7) * 4;
      ctx.beginPath();
      ctx.moveTo(Math.round(localP.x - camX), Math.round(localP.y - camY - 28));
      ctx.quadraticCurveTo(mx, my - 10, Math.round(sx), Math.round(sy - 28));
      ctx.stroke();
      ctx.restore();

      if (p.passResonanceCd <= 0 && world.particles) {
        p.passResonanceCd = 6.0;
        world.particles.sparks((p.x + localP.x) * 0.5, Math.min(p.y, localP.y) - 32, 6, pal.hex);
      }
    }

    // 2. Ground contact shadow on 2.5D deck below remote hunter
    const groundY = world.level.findDropSurfaceY(p.x, p.y, 108);
    if (groundY != null) {
      const drop = Math.max(0, groundY - p.y);
      const k = Math.max(0, 1 - drop / 112);
      if (k > 0.05) {
        const rx = Math.max(4, 11 * (0.55 + 0.45 * k));
        ctx.save();
        ctx.fillStyle = `rgba(3, 2, 10, ${(0.38 * k).toFixed(3)})`;
        ctx.beginPath();
        ctx.ellipse(Math.round(sx), Math.round(groundY - camY + 1), rx, Math.max(2, rx * 0.26), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // 3. Soft cloak-colored lantern aura behind the remote hunter
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const halo = ctx.createRadialGradient(sx, sy - 28, 3, sx, sy - 28, 34);
    halo.addColorStop(0, pal.aura);
    halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(Math.round(sx - 36), Math.round(sy - 64), 72, 72);
    ctx.restore();

    // 4. Cloak-tinted sprite & whip animation
    const blink = p.invuln > 0 && p.anim !== 'dead' && Math.floor(p.invuln * 18) % 2 === 0;
    const baseAlpha = p.screen === 'map' || p.screen === 'pause' ? 0.72 : 0.96;
    const alpha = blink ? baseAlpha * 0.35 : baseAlpha;
    const flip = p.facing < 0;
    const fr = remoteFrame(assets, p);

    if (p.petrified > 0) {
      const still = p.anim === 'attack' || p.anim === 'walk' ? { sheet: 'hero', name: 'idle' } : fr;
      assets.draw(ctx, still.sheet, still.name, sx, sy, flip, 0.9, 1, 'rgba(150, 150, 165, 0.82)');
    } else if (fr.lash) {
      drawRemoteWhipStrike(ctx, assets, p.slot, p.whipReach, sx, sy, flip, alpha, fr.sheet, fr.name, fr.lash);
      // Fiery whip embers if remote hunter holds Jack-o'-Lantern relic (index 2)
      if (((p.relicsMask >> 2) & 1) && world.particles && Math.random() < 0.45) {
        world.particles.embers(p.x + p.facing * (14 + Math.random() * p.whipReach), p.y - 42, 1);
      }
    } else {
      drawCloakFrame(ctx, assets, fr.sheet, fr.name, p.slot, sx, sy, flip, alpha);
      const rw = p.wId && WEAPONS[p.wId] ? WEAPONS[p.wId] : null;
      if (rw && rw.category !== 'whip' && p.wT != null && p.wT >= 0) {
        drawWeaponAction(ctx, {
          slot: 0,
          active: true,
          weapon: rw,
          timer: p.wT,
          duration: p.wDur || rw.duration || 0.3,
          reach: rw.reach,
          crouch: !!(p.wCr || p.anim === 'crouch'),
          guarding: !!p.wGd,
          isSkill: false,
        }, sx, sy, p.facing, !!(p.wCr || p.anim === 'crouch'), getFxLayers(), time, fr.name);
      } else if (rw && rw.category === 'shield') {
        drawCarriedShield(ctx, rw, sx, sy, p.facing, p.anim || 'idle', !!(p.wCr || p.anim === 'crouch'), time * 9, alpha, false);
      }
    }
  }
}

/**
 * Draws floating nameplates, micro HP bars, and salute callouts for remote
 * hunters in the UI overlay pass so 5x7 glyphs remain razor-sharp.
 */
export function drawRemotePlayerLabels(ctx, font, world, peersInStage) {
  if (!peersInStage || peersInStage.length === 0) return;
  const camX = world.camera.rx;
  const camY = world.camera.ry;

  for (const p of peersInStage) {
    const sx = p.x - camX;
    const sy = p.y - camY;
    if (sx < -110 || sx > W + 110 || sy < -90 || sy > H + 90) continue;

    const pal = paletteForSlot(p.slot);
    const lvTag = (p.level || 1) > 1 ? `LV${p.level} ` : '';
    const baseName = `${lvTag}${p.name}`;
    const label = p.screen === 'map' ? `${baseName} · MAP` : baseName;
    const tw = font.width(label, 1, 1, false);
    const pillW = tw + 12;
    const px = Math.round(sx - pillW * 0.5);
    const py = Math.round(sy - (p.anim === 'crouch' || p.anim === 'slide' ? 54 : 70));

    ctx.save();
    ctx.fillStyle = 'rgba(6, 5, 14, 0.84)';
    ctx.fillRect(px, py, pillW, 11);
    ctx.strokeStyle = pal.hex;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, pillW - 1, 10);
    ctx.globalAlpha = 1;
    ctx.fillStyle = pal.hex;
    ctx.fillRect(px + 3, py + 4, 3, 3);
    font.draw(ctx, label, px + 8, py + 2, { color: '#f4efe0', shadow: '#05040a', gothic: false });

    // Micro health bar right beneath nameplate
    const maxHp = Math.max(1, p.maxHp || PLAYER.maxHp);
    const hpFrac = Math.max(0, Math.min(1, (p.hp ?? maxHp) / maxHp));
    if (hpFrac < 1 || p.anim === 'attack' || p.anim === 'hurt') {
      const bw = Math.max(20, pillW - 6);
      const bx = Math.round(sx - bw * 0.5);
      const by = py + 12;
      ctx.fillStyle = 'rgba(8, 6, 16, 0.9)';
      ctx.fillRect(bx, by, bw, 3);
      ctx.fillStyle = hpFrac > 0.35 ? pal.hex : '#ff4a66';
      ctx.fillRect(bx + 1, by + 1, Math.round((bw - 2) * hpFrac), 1);
    }

    // Greeting / Salute callout (`G` key)
    if (p.saluteT > 0) {
      const floatY = py - 12 - Math.round((1 - p.saluteT / 1.8) * 8);
      ctx.globalAlpha = Math.min(1, p.saluteT * 1.6);
      font.draw(ctx, '* HAIL! *', Math.round(sx), floatY, {
        align: 'center',
        color: '#ffd27a',
        shadow: '#05040a',
        gothic: false,
      });
    }
    ctx.restore();
  }
}

/**
 * Draws sleek directional edge chevrons (`< VESPER 14M` / `CORVUS 22M >`)
 * when another hunter is in the SAME castle stage as you, but off-screen.
 */
export function drawRemoteEdgeIndicators(ctx, font, world, peersInStage) {
  if (!peersInStage || peersInStage.length === 0) return;
  const camX = world.camera.rx;
  const camY = world.camera.ry;

  let leftStack = 0;
  let rightStack = 0;
  for (const p of peersInStage) {
    const sx = p.x - camX;
    if (sx >= -12 && sx <= W + 12) continue;

    const pal = paletteForSlot(p.slot);
    const meters = Math.max(1, Math.round(Math.abs(p.x - world.player.x) / TILE));
    const isLeft = sx < -12;
    const text = isLeft ? `← ${p.name} ${meters}M` : `${p.name} ${meters}M →`;
    const tw = font.width(text, 1, 1, false);
    const pw = tw + 10;
    const baseY = Math.max(58, Math.min(H - 28, Math.round(p.y - camY - 34)));
    const stackOffset = (isLeft ? leftStack++ : rightStack++) * 14;
    const py = Math.min(H - 22, baseY + stackOffset);
    const px = isLeft ? 6 : W - pw - 6;

    ctx.save();
    ctx.fillStyle = 'rgba(6, 5, 16, 0.86)';
    ctx.fillRect(px, py, pw, 12);
    ctx.strokeStyle = pal.hex;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, 11);
    font.draw(ctx, text, px + 5, py + 2, { color: pal.hex, shadow: '#05040a', gothic: false });
    ctx.restore();
  }
}
