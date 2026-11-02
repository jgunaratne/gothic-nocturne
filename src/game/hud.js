// Heads-up display in the classic top-bar layout.

import { W, H, PLAYER } from '../engine/constants.js';
import { BOSS_RELICS, RELIC_ORDER } from './relics.js';
import { drawMiniMap } from './castlemap.js';
import {
  START_LEVEL, LEVEL_CAP, expRequiredForNextLevel, formatCompactExp, levelBonuses, stageRankFor,
} from './progression.js';
import { WEAPONS, ELEMENT_META, computeStrengthBreakdown, getWeaponIconCanvas } from './weapons.js';

export function drawHud(ctx, font, assets, world) {
  const p = world.player;
  ctx.save();
  // Top band
  const grad = ctx.createLinearGradient(0, 0, 0, 52);
  grad.addColorStop(0, 'rgba(4, 3, 10, 0.78)');
  grad.addColorStop(1, 'rgba(4, 3, 10, 0.0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 52);

  const dim = '#8a9ab5', ivory = '#e8e2c8', shadow = '#120f1c';
  font.draw(ctx, `SCORE-${String(world.score).padStart(7, '0')}`, 12, 7, { color: ivory, shadow });
  font.draw(ctx, `TIME ${String(Math.max(0, Math.ceil(world.timeLeft))).padStart(4, '0')}`, 174, 7, { color: ivory, shadow });
  const stageLabel = (world.stage.name || '').replace(/^THE\s+/, '') || 'KEEP';
  font.draw(ctx, stageLabel, 310, 7, { align: 'center', color: ivory, shadow });
  font.draw(ctx, `P-${String(world.lives).padStart(2, '0')}`, 392, 7, { color: ivory, shadow });
  const diff = world.difficulty;
  font.draw(ctx, diff.name, 442, 7, { color: diff.key === 'hard' ? '#e23c3c' : diff.key === 'easy' ? '#9ad17a' : dim, shadow });
  const rightCol = 569;
  const relicCount = world.relics ? world.relics.size : 0;
  if (relicCount > 0) {
    font.draw(ctx, `RELICS ${String(relicCount).padStart(2, '0')}`, rightCol, 7, { align: 'right', color: '#ffd27a', shadow });
  }

  // Health bars
  font.draw(ctx, 'PLAYER', 12, 20, { color: dim, shadow });
  const pMaxHp = p.maxHp || PLAYER.maxHp;
  drawBar(ctx, 60, 19, p.hp, pMaxHp, '#e23c3c', '#ffb0a0', Math.max(16, pMaxHp));
  font.draw(ctx, 'ENEMY', 12, 32, { color: dim, shadow });
  const boss = world.boss;
  const bossHp = boss ? Math.max(0, boss.hp) : 16;
  const bossMax = boss ? boss.maxHp : 16;
  drawBar(ctx, 60, 31, bossHp, bossMax, '#8a6cff', '#d7c8ff');

  // Hearts (sub-weapon ammo)
  assets.draw(ctx, 'items', 'heart_small', 214, 36);
  font.draw(ctx, String(world.hearts).padStart(2, '0'), 224, 25, { color: ivory, shadow, scale: 1 });

  // Sub-weapon frame (`↑ + L-Hand`)
  const bx = 252, by = 18;
  ctx.fillStyle = 'rgba(20, 16, 36, 0.85)';
  ctx.fillRect(bx, by, 28, 26);
  ctx.strokeStyle = '#5b6b86'; ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, 27, 25);
  ctx.fillStyle = '#8a9ab5';
  ctx.fillRect(bx + 1, by + 1, 26, 1);
  if (p.subWeapon) assets.draw(ctx, 'items', p.subWeapon, bx + 14, by + 23);

  // Ambidextrous Dual-Hand Equipment Matrix Sockets (`L` = 284..308, `R` = 311..335)
  const game = world.game;
  const strTotal = computeStrengthBreakdown(world).total;
  const wL = (world.getHandWeapon ? world.getHandWeapon(0) : null) || WEAPONS.hunters_lash;
  const twoHandLocked = !!(wL && wL.isTwoHanded);
  const wR = twoHandLocked ? null : (world.getHandWeapon ? world.getHandWeapon(1) : null);
  const resonance = game && game.getActiveResonance ? game.getActiveResonance() : null;

  drawHandSocket(ctx, font, 284, 18, 'L', wL, false, strTotal, !!(p.slots && p.slots[0] && p.slots[0].active));
  drawHandSocket(ctx, font, 311, 18, 'R', wR, twoHandLocked, strTotal, !!(p.slots && p.slots[1] && p.slots[1].active));

  if (twoHandLocked) {
    ctx.fillStyle = '#d9a84e';
    ctx.fillRect(308, 29, 3, 4);
  } else if (resonance) {
    const rPulse = 0.55 + 0.45 * Math.sin((world.time || 0) * 6.2);
    ctx.save();
    ctx.globalAlpha = rPulse;
    ctx.fillStyle = resonance.hex || '#ffd27a';
    ctx.fillRect(308, 27, 3, 8);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(309, 30, 1, 2);
    ctx.restore();
  }

  // Hunter Character Level, STR & Adaptive EXP Bar (x = 341..433)
  const charLevel = (game && game.charLevel) || START_LEVEL;
  const charExp = (game && game.charExp) || 0;
  const expReq = expRequiredForNextLevel(charLevel);
  const expFrac = charLevel >= LEVEL_CAP ? 1 : (expReq > 0 ? Math.max(0, Math.min(1, charExp / expReq)) : 0);
  const bonuses = levelBonuses(charLevel);
  const lvFlash = (world.levelUpFlashT || 0) > 0;
  const expFlash = (world.expFlashT || 0) > 0;
  const ex = 341, ew = 92;
  font.draw(ctx, `LV ${String(charLevel).padStart(2, '0')}`, ex, 19, {
    color: lvFlash ? '#fff2c8' : '#ffd27a',
    shadow,
    gothic: false,
  });
  const expLabel = charLevel >= LEVEL_CAP
    ? 'MAX'
    : `${formatCompactExp(charExp)}/${formatCompactExp(expReq)}`;
  font.draw(ctx, expLabel, ex + ew, 19, {
    align: 'right',
    color: '#c9c3b0',
    shadow,
    gothic: false,
  });
  // Framed pixel-art EXP meter
  const barY = 28, barH = 6;
  ctx.fillStyle = '#141022';
  ctx.fillRect(ex, barY, ew, barH);
  ctx.strokeStyle = lvFlash ? '#d8b66a' : '#5b6b86';
  ctx.lineWidth = 1;
  ctx.strokeRect(ex + 0.5, barY + 0.5, ew - 1, barH - 1);
  const fillW = Math.round((ew - 2) * expFrac);
  if (fillW > 0) {
    ctx.fillStyle = lvFlash ? '#f4cf7a' : (expFlash ? '#ebb04a' : '#e09b32');
    ctx.fillRect(ex + 1, barY + 1, fillW, barH - 2);
    ctx.fillStyle = '#fff2b8';
    ctx.fillRect(ex + 1, barY + 1, fillW, 1);
  }
  // Subtle quarter-rank ticks along bottom edge of EXP bar
  ctx.fillStyle = 'rgba(10, 8, 20, 0.65)';
  for (let q = 1; q <= 3; q++) {
    ctx.fillRect(ex + Math.round((ew * q) / 4), barY + barH - 2, 1, 1);
  }
  const subStat = charLevel > START_LEVEL
    ? `STR ${String(strTotal).padStart(2, '0')} · ATK+${bonuses.attackPct}%`
    : `STR ${String(strTotal).padStart(2, '0')} · RK ${String(stageRankFor(world.stage)).padStart(2, '0')}`;
  font.draw(ctx, subStat, ex, 36, {
    color: lvFlash ? '#d8cca8' : '#8a9ab5',
    shadow,
    gothic: false,
  });

  // Active Boss Relics jewel pips + Double Jump wing readiness (wraps cleanly into 2 rows past 12 relics)
  let relicLeftX = rightCol;
  if (relicCount > 0) {
    const activeKeys = RELIC_ORDER.filter((k) => world.hasRelic(k));
    const twoRows = activeKeys.length > 12;
    const perRow = twoRows ? Math.min(15, Math.ceil(activeKeys.length / 2)) : activeKeys.length;
    const stride = twoRows ? 7 : 8;
    const gem = twoRows ? 5 : 6;
    for (let rIdx = 0; rIdx < (twoRows ? 2 : 1); rIdx++) {
      const slice = activeKeys.slice(rIdx * perRow, (rIdx + 1) * perRow);
      if (!slice.length) continue;
      const totalW = slice.length * stride - (stride - gem);
      let rx = rightCol - totalW;
      if (rx < relicLeftX) relicLeftX = rx;
      const ry = twoRows ? (18 + rIdx * 8) : 20;
      for (const k of slice) {
        const r = BOSS_RELICS[k];
        ctx.fillStyle = '#141022';
        ctx.fillRect(rx - 1, ry - 1, gem + 2, gem + 2);
        ctx.fillStyle = r.color;
        ctx.fillRect(rx, ry, gem, gem);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(rx + 1, ry + 1, twoRows ? 1 : 2, twoRows ? 1 : 2);
        rx += stride;
      }
    }
    if (world.hasRelic('graveyard')) {
      const wingReady = p.onGround || p.airJumpsLeft > 0;
      font.draw(ctx, wingReady ? '* 2X JUMP' : '· 2X JUMP', rightCol, twoRows ? 35 : 31, {
        align: 'right',
        color: wingReady ? '#c8a8ff' : '#5e5078',
        shadow,
      });
    }
  }

  // Live Castle Grid Mini-Map radar (top-right, M to expand)
  drawMiniMap(ctx, font, world, 577, 6);

  // Multiplayer online presence badge & fading castle activity feed
  const net = world.game && world.game.net;
  if (net && net.connected) {
    const othersTotal = net.peers.size;
    const hereCount = net.peersInStage(world.stage.key).length;
    let fy = 44;
    if (othersTotal > 0) {
      const tag = hereCount > 0
        ? `${othersTotal + 1} IN KEEP · ${hereCount} HERE`
        : `${othersTotal + 1} IN KEEP`;
      ctx.fillStyle = 'rgba(8, 18, 22, 0.78)';
      const bw = font.width(tag, 1, 1, false) + 14;
      ctx.fillRect(12, fy, bw, 11);
      ctx.fillStyle = hereCount > 0 ? '#62f2c2' : '#7cc8ff';
      ctx.fillRect(15, fy + 4, 3, 3);
      font.draw(ctx, tag, 21, fy + 2, {
        color: hereCount > 0 ? '#9ef5dc' : '#b8d8ff',
        shadow,
        gothic: false,
      });
      fy += 13;
    }
    for (const item of net.feed) {
      const alpha = Math.max(0, Math.min(1, (item.dur - item.t) / 0.5));
      if (alpha <= 0.02) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      font.draw(ctx, item.text, 12, fy, { color: item.color || '#9ef5dc', shadow, gothic: false });
      ctx.restore();
      fy += 10;
    }
  }

  // Companion status badge (Darkwood Guardian Turtle)
  if (world.ally && world.ally.alive) {
    const bw = 96;
    const fitsInline = relicLeftX >= 440 + bw + 4;
    const ax = fitsInline ? 440 : 284;
    const ay = fitsInline ? 21 : 46;
    const spinning = world.ally.state === 'spin' || world.ally.state === 'windup';
    const ready = world.ally.spinCd <= 0.05;
    ctx.fillStyle = 'rgba(12, 26, 26, 0.82)';
    ctx.fillRect(ax, ay, bw, 16);
    ctx.strokeStyle = spinning ? '#8affd8' : '#2e6b5e';
    ctx.strokeRect(ax + 0.5, ay + 0.5, bw - 1, 15);
    ctx.fillStyle = spinning ? '#ffd27a' : (ready ? '#62f2c2' : '#467a6e');
    ctx.fillRect(ax + 4, ay + 5, 4, 6);
    font.draw(ctx, spinning ? 'TURTLE · DASH!' : 'ALLY · TURTLE', ax + 11, ay + 4, {
      color: spinning ? '#8affd8' : '#c8f5e4',
      shadow,
    });
  }

  // Boss approach Daikon voice dialogue plate (anchored near bottom so it never overlaps center banners)
  if (world.voiceCue) {
    const cue = world.voiceCue;
    const k = Math.max(0, Math.min(1, cue.t / 0.22, (cue.dur - cue.t) / 0.38));
    if (k > 0.01) {
      ctx.save();
      ctx.globalAlpha = k;
      const px = 16, py = H - 50, pw = W - 32, ph = 42;
      ctx.fillStyle = 'rgba(6, 4, 14, 0.88)';
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = '#9e2f42';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
      ctx.strokeStyle = '#3a2848';
      ctx.strokeRect(px + 2.5, py + 2.5, pw - 5, ph - 5);
      // Golden corner rivets
      ctx.fillStyle = '#ffd27a';
      ctx.fillRect(px + 2, py + 2, 3, 3);
      ctx.fillRect(px + pw - 5, py + 2, 3, 3);
      ctx.fillRect(px + 2, py + ph - 5, 3, 3);
      ctx.fillRect(px + pw - 5, py + ph - 5, 3, 3);
      // Animated voice-meter bars on the left
      for (let i = 0; i < 4; i++) {
        const bh = 4 + Math.round(8 * (0.5 + 0.5 * Math.sin(world.time * 13 + i * 1.4)));
        ctx.fillStyle = i % 2 === 0 ? '#ffd27a' : '#e25566';
        ctx.fillRect(px + 10 + i * 4, py + 19 - (bh >> 1), 2, bh);
      }
      font.draw(ctx, cue.speaker, px + 32, py + 6, { color: '#ffd27a', shadow });
      const lines = font.wrap(cue.text, pw - 44, 1, 1, false);
      lines.slice(0, 2).forEach((ln, i) => font.draw(ctx, ln, px + 32, py + 18 + i * 11, { color: ivory, shadow }));
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawHandSocket(ctx, font, x, y, handTag, weapon, locked2H, strTotal, activeSwing) {
  const w = 24, h = 26;
  const elem = weapon && weapon.element ? ELEMENT_META[weapon.element] : null;
  const border = activeSwing
    ? '#ffd27a'
    : locked2H
      ? '#6e5834'
      : (elem ? elem.color : (weapon ? '#6a7d9c' : '#3d455c'));

  ctx.fillStyle = locked2H ? 'rgba(26, 20, 18, 0.82)' : 'rgba(18, 15, 32, 0.88)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);

  if (locked2H) {
    font.draw(ctx, '2H', x + 12, y + 9, { align: 'center', color: '#d9a84e', shadow: '#08060e', gothic: false });
    return;
  }

  if (weapon) {
    const icon = getWeaponIconCanvas(weapon.id);
    if (icon) {
      ctx.drawImage(icon, x + 2, y + 5);
    }
    if (strTotal < (weapon.reqStr || 0)) {
      // Stat Deficit Gate indicator (`0.5x` scaling active)
      font.draw(ctx, '!', x + w - 2, y + 2, { align: 'right', color: '#ff6a5e', shadow: '#08060e', gothic: false });
    }
  } else {
    ctx.fillStyle = '#3a4258';
    ctx.fillRect(x + 9, y + 14, 6, 1);
  }
  font.draw(ctx, handTag, x + 2, y + 2, {
    color: activeSwing ? '#ffd27a' : '#8a9ab5',
    shadow: '#08060e',
    gothic: false,
  });
}

function drawBar(ctx, x, y, value, max, color, hi, segs = 16) {
  const visSegs = Math.min(34, Math.max(1, segs));
  const step = visSegs > 16 ? Math.max(4, Math.floor(138 / visSegs)) : 7;
  const sw = step - 1;
  const filled = Math.round((Math.max(0, value) / Math.max(1, max)) * visSegs);
  for (let i = 0; i < visSegs; i++) {
    const sx = x + i * step;
    ctx.fillStyle = '#1a1626';
    ctx.fillRect(sx, y, sw, 9);
    if (i < filled) {
      ctx.fillStyle = color;
      ctx.fillRect(sx, y + 1, sw, 7);
      ctx.fillStyle = hi;
      ctx.fillRect(sx, y + 1, sw, 2);
    }
  }
}

/** Centered banner text with a dark backing band. */
export function drawBanner(ctx, font, lines, y, { scale = 2, color = '#e8e2c8', band = true, sub = null, gothic = true } = {}) {
  const wrapped = [];
  for (const line of lines) {
    if (font.width(line, scale, 1, gothic) > W - 32) {
      wrapped.push(...font.wrap(line, W - 32, scale, 1, gothic));
    } else {
      wrapped.push(line);
    }
  }
  const lh = font.lineHeight(scale, gothic);
  if (band) {
    ctx.fillStyle = 'rgba(4, 3, 10, 0.72)';
    const h = wrapped.length * (lh + 6) + 22 + (sub ? 16 : 0);
    ctx.fillRect(0, y - 12, W, h);
    ctx.fillStyle = '#5b6b86';
    ctx.fillRect(0, y - 12, W, 1); ctx.fillRect(0, y - 12 + h - 1, W, 1);
  }
  let yy = y;
  for (const line of wrapped) {
    font.draw(ctx, line, W / 2, yy, { scale, color, align: 'center', shadow: '#120f1c', gothic });
    yy += lh + 6;
  }
  if (sub) font.draw(ctx, sub, W / 2, yy + 2, { scale: 1, color: '#8a9ab5', align: 'center', shadow: '#120f1c' });
}
