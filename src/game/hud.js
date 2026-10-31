// Heads-up display in the classic top-bar layout.

import { W, H, PLAYER } from '../engine/constants.js';

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
  font.draw(ctx, `TIME ${String(Math.max(0, Math.ceil(world.timeLeft))).padStart(4, '0')}`, 190, 7, { color: ivory, shadow });
  font.draw(ctx, `STAGE ${String(world.stage.id || 1).padStart(2, '0')}`, 300, 7, { color: ivory, shadow });
  font.draw(ctx, `P-${String(world.lives).padStart(2, '0')}`, 392, 7, { color: ivory, shadow });
  const diff = world.difficulty;
  font.draw(ctx, diff.name, 450, 7, { color: diff.key === 'hard' ? '#e23c3c' : diff.key === 'easy' ? '#9ad17a' : dim, shadow });

  // Health bars
  font.draw(ctx, 'PLAYER', 12, 20, { color: dim, shadow });
  drawBar(ctx, 60, 19, p.hp, PLAYER.maxHp, '#e23c3c', '#ffb0a0');
  font.draw(ctx, 'ENEMY', 12, 32, { color: dim, shadow });
  const boss = world.boss;
  const bossHp = boss ? Math.max(0, boss.hp) : 16;
  const bossMax = boss ? boss.maxHp : 16;
  drawBar(ctx, 60, 31, bossHp, bossMax, '#8a6cff', '#d7c8ff');

  // Hearts (sub-weapon ammo)
  assets.draw(ctx, 'items', 'heart_small', 214, 36);
  font.draw(ctx, String(world.hearts).padStart(2, '0'), 224, 25, { color: ivory, shadow, scale: 1 });

  // Sub-weapon frame
  const bx = 262, by = 18;
  ctx.fillStyle = 'rgba(20, 16, 36, 0.85)';
  ctx.fillRect(bx, by, 30, 26);
  ctx.strokeStyle = '#5b6b86'; ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, 29, 25);
  ctx.fillStyle = '#8a9ab5';
  ctx.fillRect(bx + 1, by + 1, 28, 1);
  if (p.subWeapon) assets.draw(ctx, 'items', p.subWeapon, bx + 15, by + 23);

  // Companion status badge (Darkwood Guardian Turtle)
  if (world.ally && world.ally.alive) {
    const ax = 302, ay = 23;
    const spinning = world.ally.state === 'spin' || world.ally.state === 'windup';
    const ready = world.ally.spinCd <= 0.05;
    ctx.fillStyle = 'rgba(12, 26, 26, 0.82)';
    ctx.fillRect(ax, ay, 110, 16);
    ctx.strokeStyle = spinning ? '#8affd8' : '#2e6b5e';
    ctx.strokeRect(ax + 0.5, ay + 0.5, 109, 15);
    ctx.fillStyle = spinning ? '#ffd27a' : (ready ? '#62f2c2' : '#467a6e');
    ctx.fillRect(ax + 5, ay + 5, 5, 6);
    font.draw(ctx, spinning ? 'TURTLE · DASH!' : 'ALLY · TURTLE', ax + 14, ay + 4, {
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
      const px = 16, py = H - 46, pw = W - 32, ph = 38;
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
      font.draw(ctx, cue.speaker, px + 32, py + 7, { color: '#ffd27a', shadow });
      font.draw(ctx, `"${cue.text}"`, px + 32, py + 21, { color: ivory, shadow });
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawBar(ctx, x, y, value, max, color, hi) {
  const segs = 16;
  const filled = Math.round((value / max) * segs);
  for (let i = 0; i < segs; i++) {
    const sx = x + i * 7;
    ctx.fillStyle = '#1a1626';
    ctx.fillRect(sx, y, 6, 9);
    if (i < filled) {
      ctx.fillStyle = color;
      ctx.fillRect(sx, y + 1, 6, 7);
      ctx.fillStyle = hi;
      ctx.fillRect(sx, y + 1, 6, 2);
    }
  }
}

/** Centered banner text with a dark backing band. */
export function drawBanner(ctx, font, lines, y, { scale = 2, color = '#e8e2c8', band = true, sub = null } = {}) {
  if (band) {
    ctx.fillStyle = 'rgba(4, 3, 10, 0.72)';
    const h = lines.length * (9 * scale + 6) + 22 + (sub ? 16 : 0);
    ctx.fillRect(0, y - 12, W, h);
    ctx.fillStyle = '#5b6b86';
    ctx.fillRect(0, y - 12, W, 1); ctx.fillRect(0, y - 12 + h - 1, W, 1);
  }
  let yy = y;
  for (const line of lines) {
    font.draw(ctx, line, W / 2, yy, { scale, color, align: 'center', shadow: '#120f1c' });
    yy += 9 * scale + 6;
  }
  if (sub) font.draw(ctx, sub, W / 2, yy + 2, { scale: 1, color: '#8a9ab5', align: 'center', shadow: '#120f1c' });
}
