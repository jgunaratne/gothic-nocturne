// Heads-up display in the classic top-bar layout.

import { W, PLAYER } from '../engine/constants.js';

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
  font.draw(ctx, 'STAGE 01', 300, 7, { color: ivory, shadow });
  font.draw(ctx, `P-${String(world.lives).padStart(2, '0')}`, 392, 7, { color: ivory, shadow });

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
