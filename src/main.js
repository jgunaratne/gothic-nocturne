// Gothic Nocturne — entry point: boot, scaling, game loop and menu states.

import { W, H, DT, DIFFICULTIES, DIFFICULTY_ORDER, DEFAULT_DIFFICULTY } from './engine/constants.js';
import { Input } from './engine/input.js';
import { Assets } from './engine/assets.js';
import { AudioSys } from './engine/audio.js';
import { Font } from './engine/font.js';
import { World } from './game/world.js';
import { STAGE1 } from './game/level_data.js';
import { drawHud, drawBanner } from './game/hud.js';

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.assets = new Assets();
    this.audio = new AudioSys();
    this.font = new Font();
    this.input = new Input(canvas);
    this.state = 'loading';          // loading | title | difficulty | play | pause | clear | gameover
    this.stateT = 0;
    this.world = null;
    this.titleWorld = null;
    this.acc = 0;
    this.last = performance.now();
    this.params = new URLSearchParams(location.search);
    // Difficulty: URL override > last choice (localStorage) > default.
    const stored = safeStorageGet('gothic.difficulty');
    const urlDiff = this.params.get('difficulty');
    this.difficultyKey = DIFFICULTIES[urlDiff] ? urlDiff : DIFFICULTIES[stored] ? stored : DEFAULT_DIFFICULTY;
    this.difficulty = DIFFICULTIES[this.difficultyKey];
    this.menuIndex = DIFFICULTY_ORDER.indexOf(this.difficultyKey);
    this.input.onFirstInteraction = () => this.audio.unlock();
    window.addEventListener('resize', () => this.fit());
    this.fit();
  }

  fit() {
    const scale = Math.max(1, Math.floor(Math.min(window.innerWidth / W, window.innerHeight / H)));
    const fits = W * scale <= window.innerWidth && H * scale <= window.innerHeight;
    const s = fits ? scale : Math.min(window.innerWidth / W, window.innerHeight / H);
    this.canvas.style.width = Math.floor(W * s) + 'px';
    this.canvas.style.height = Math.floor(H * s) + 'px';
  }

  async boot() {
    await this.assets.load();
    const bootEl = document.getElementById('boot');
    if (bootEl) bootEl.remove();
    this.titleWorld = new World(this, STAGE1);
    this.titleWorld.messages = [];
    this.titleWorld.camera.snapTo(8 * 32, 12 * 32);
    this.titleWorld.camera.x = 2 * 32;
    this.setState('title');
    if (this.params.get('screen') === 'difficulty') this.setState('difficulty');   // testing aid
    if (this.params.has('demo')) this.startDemo();
    // Testing aids: ?skip=N pre-simulates N fixed steps before the first draw.
    const skip = parseInt(this.params.get('skip') || '0', 10);
    for (let i = 0; i < skip; i++) { this.input.update(DT); this.update(DT); }
    this.canvas.focus();
    requestAnimationFrame((t) => this.frame(t));
  }

  setState(s) { this.state = s; this.stateT = 0; }

  /** Locks in a difficulty preset and remembers it for next time. */
  chooseDifficulty(key) {
    this.difficultyKey = DIFFICULTIES[key] ? key : DEFAULT_DIFFICULTY;
    this.difficulty = DIFFICULTIES[this.difficultyKey];
    this.menuIndex = DIFFICULTY_ORDER.indexOf(this.difficultyKey);
    safeStorageSet('gothic.difficulty', this.difficultyKey);
  }

  startGame() {
    this.world = new World(this, STAGE1);
    // ?at=<tile column> teleports the hunter for testing.
    const at = parseInt(this.params.get('at') || '-1', 10);
    if (at >= 0) {
      const lvl = this.world.level;
      const row = lvl.surfaceRow(at);
      this.world.player.x = at * 32 + 16;
      this.world.player.y = (row >= 0 ? row : 12) * 32;
      this.world.camera.snapTo(this.world.player.x, this.world.player.y);
    }
    this.setState('play');
    this.audio.playMusic('stage');
    this.audio.sfx('select');
  }

  // Hooks from World
  onRespawn() { this.audio.playMusic('stage'); }
  onGameOver() { this.setState('gameover'); this.audio.playMusic('gameover', false); }
  onStageClear() { this.setState('clear'); }

  banner(lines, y, opts) { drawBanner(this.ctx, this.font, lines, y, opts); }

  /** Scripted attract/testing driver (?demo=1): walk, jump and whip. */
  startDemo() {
    this.startGame();
    this.audio.muted = true;
    this.input.setScript((t) => {
      if (t > 40) return null;
      const seg = t % 6;
      return {
        right: seg < 4.2,
        jump: (seg > 1.0 && seg < 1.25) || (seg > 2.6 && seg < 2.85),
        attack: (seg > 1.9 && seg < 2.0) || (seg > 4.4 && seg < 4.5) || (seg > 5.2 && seg < 5.3),
        down: seg > 4.6 && seg < 5.1,
      };
    });
  }

  frame(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= DT && steps < 5) {
      this.input.update(DT);
      this.update(DT);
      this.acc -= DT;
      steps++;
    }
    this.draw();
    requestAnimationFrame((t) => this.frame(t));
  }

  update(dt) {
    this.stateT += dt;
    const inp = this.input;
    if (inp.pressed.mute) { const m = this.audio.toggleMute(); this.muteFlash = m ? 'SOUND OFF' : 'SOUND ON'; this.muteT = 1.2; }
    this.muteT = Math.max(0, (this.muteT || 0) - dt);

    switch (this.state) {
      case 'title':
        this.updateTitleBackdrop(dt);
        this.audio.playMusic('title');
        if (inp.pressed.start || inp.pressed.jump || inp.pressed.attack) { this.setState('difficulty'); this.audio.sfx('select'); }
        break;
      case 'difficulty': {
        this.updateTitleBackdrop(dt);
        const n = DIFFICULTY_ORDER.length;
        if (inp.pressed.up || inp.pressed.left) { this.menuIndex = (this.menuIndex + n - 1) % n; this.audio.sfx('bone'); }
        if (inp.pressed.down || inp.pressed.right) { this.menuIndex = (this.menuIndex + 1) % n; this.audio.sfx('bone'); }
        if (this.stateT > 0.25 && (inp.pressed.start || inp.pressed.jump || inp.pressed.attack)) {
          this.chooseDifficulty(DIFFICULTY_ORDER[this.menuIndex]);
          this.startGame();
        }
        break;
      }
      case 'play':
        if (inp.pressed.start && this.world.phase === 'play') { this.setState('pause'); this.audio.sfx('pause'); break; }
        this.world.update(dt, inp);
        break;
      case 'pause':
        if (inp.pressed.start) { this.setState('play'); this.audio.sfx('pause'); }
        break;
      case 'clear':
        this.world.update(dt, inp);
        if (this.stateT > 2 && inp.pressed.start) { this.setState('title'); this.audio.stopMusic(); }
        break;
      case 'gameover':
        if (this.stateT > 1.5 && (inp.pressed.start || inp.pressed.jump)) { this.setState('title'); this.audio.stopMusic(); }
        break;
      default: break;
    }
  }

  updateTitleBackdrop(dt) {
    const tw = this.titleWorld;
    tw.parallax.update(dt);
    tw.particles.update(dt);
    tw.updateLightning(dt);
    tw.time += dt;
    tw.camera.x += dt * 14;
    if (tw.camera.x > 92 * 32) tw.camera.x = 4 * 32;
  }

  draw() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    switch (this.state) {
      case 'title': this.drawTitle(ctx); break;
      case 'difficulty': this.drawDifficulty(ctx); break;
      case 'play': case 'pause':
        this.world.draw(ctx);
        drawHud(ctx, this.font, this.assets, this.world);
        if (this.state === 'pause') {
          ctx.fillStyle = 'rgba(4, 3, 10, 0.55)'; ctx.fillRect(0, 0, W, H);
          this.banner(['PAUSED'], 150, { scale: 3, sub: 'ENTER TO RESUME  ·  M TO MUTE' });
        }
        break;
      case 'clear':
        this.world.draw(ctx);
        drawHud(ctx, this.font, this.assets, this.world);
        this.drawClear(ctx);
        break;
      case 'gameover':
        this.world.draw(ctx, { hud: false });
        ctx.fillStyle = 'rgba(4, 3, 10, 0.6)'; ctx.fillRect(0, 0, W, H);
        this.banner(['GAME OVER'], 140, { scale: 4, color: '#e23c3c', sub: this.stateT > 1.5 ? 'PRESS ENTER' : ' ' });
        this.font.draw(ctx, `SCORE ${String(this.world.score).padStart(7, '0')}`, W / 2, 215, { align: 'center', scale: 2, shadow: '#120f1c' });
        break;
      default: break;
    }
    if (this.muteT > 0) this.font.draw(ctx, this.muteFlash, W - 10, H - 14, { align: 'right', color: '#8a9ab5', shadow: '#120f1c' });
  }

  drawTitle(ctx) {
    const tw = this.titleWorld;
    tw.draw(ctx, { hud: false });
    ctx.fillStyle = 'rgba(4, 3, 10, 0.42)';
    ctx.fillRect(0, 0, W, H);
    const f = this.font;
    const pulse = 0.5 + 0.5 * Math.sin(this.stateT * 2.2);
    // Title
    f.draw(ctx, 'GOTHIC', W / 2, 62, { scale: 6, align: 'center', color: '#2a1f3d', spacing: 2 });
    f.draw(ctx, 'GOTHIC', W / 2 - 3, 59, { scale: 6, align: 'center', color: '#e8e2c8', spacing: 2, shadow: '#5b2a3a' });
    f.draw(ctx, 'NOCTURNE', W / 2, 118, { scale: 4, align: 'center', color: '#c23b4a', spacing: 2, shadow: '#120f1c' });
    ctx.fillStyle = '#8a9ab5';
    ctx.fillRect(W / 2 - 150, 156, 300, 1);
    f.draw(ctx, 'A 32-BIT WHIP-CRACKING ACTION PLATFORMER', W / 2, 164, { align: 'center', color: '#8a9ab5', shadow: '#120f1c' });
    if (pulse > 0.25) f.draw(ctx, 'PRESS ENTER OR START', W / 2, 204, { scale: 2, align: 'center', color: '#ffd27a', shadow: '#120f1c' });
    // Controls
    const cy = 258;
    const lines = [
      '←→ MOVE    ↓ CROUCH    Z/J/SPACE JUMP    X/K WHIP',
      '↑ + WHIP THROWS YOUR SUB-WEAPON (COSTS A HEART)',
      'ENTER PAUSE    M MUTE    GAMEPAD SUPPORTED',
    ];
    lines.forEach((l, i) => f.draw(ctx, l, W / 2, cy + i * 12, { align: 'center', color: i === 1 ? '#ffb0a0' : '#c9c3b0', shadow: '#120f1c' }));
    f.draw(ctx, 'ART · GEMINI IMAGE MODEL     MUSIC · LYRIA 3', W / 2, H - 22, { align: 'center', color: '#5b6b86' });
    f.draw(ctx, '2026', W / 2, H - 12, { align: 'center', color: '#5b6b86' });
  }

  drawDifficulty(ctx) {
    const tw = this.titleWorld;
    tw.draw(ctx, { hud: false });
    ctx.fillStyle = 'rgba(4, 3, 10, 0.6)';
    ctx.fillRect(0, 0, W, H);
    const f = this.font;
    f.draw(ctx, 'GOTHIC NOCTURNE', W / 2, 30, { scale: 2, align: 'center', color: '#8a9ab5', spacing: 2, shadow: '#120f1c' });
    f.draw(ctx, 'CHOOSE YOUR FATE', W / 2, 66, { scale: 3, align: 'center', color: '#e8e2c8', shadow: '#5b2a3a' });
    ctx.fillStyle = '#5b6b86';
    ctx.fillRect(W / 2 - 170, 100, 340, 1);

    const colors = { easy: '#9ad17a', normal: '#ffd27a', hard: '#e23c3c' };
    const top = 122, rowH = 54;
    DIFFICULTY_ORDER.forEach((key, i) => {
      const d = DIFFICULTIES[key];
      const y = top + i * rowH;
      const selected = i === this.menuIndex;
      if (selected) {
        ctx.fillStyle = 'rgba(232, 226, 200, 0.07)';
        ctx.fillRect(W / 2 - 230, y - 8, 460, rowH - 10);
        ctx.fillStyle = colors[key];
        ctx.fillRect(W / 2 - 230, y - 8, 3, rowH - 10);
        const bob = Math.round(Math.sin(this.stateT * 6) * 2);
        this.assets.draw(ctx, 'items', 'heart_small', W / 2 - 205 + bob, y + 16);
      }
      f.draw(ctx, d.name, W / 2 - 185, y, { scale: 3, color: selected ? colors[key] : '#6f6a80', shadow: '#120f1c' });
      f.draw(ctx, d.tagline, W / 2 - 185 + f.width(d.name, 3) + 18, y + 12, { color: selected ? '#e8e2c8' : '#5b5670', shadow: '#120f1c' });
      f.draw(ctx, d.desc, W / 2 - 185, y + 28, { color: selected ? '#c9c3b0' : '#4e4a5e', shadow: '#120f1c' });
    });

    const pulse = 0.5 + 0.5 * Math.sin(this.stateT * 2.2);
    if (pulse > 0.25) f.draw(ctx, '↑↓ SELECT     ENTER / JUMP / WHIP CONFIRM', W / 2, 300, { align: 'center', color: '#ffd27a', shadow: '#120f1c' });
    f.draw(ctx, 'YOUR CHOICE IS REMEMBERED FOR NEXT TIME', W / 2, 322, { align: 'center', color: '#5b6b86' });
  }

  drawClear(ctx) {
    const w = this.world;
    const k = Math.min(1, this.stateT / 0.6);
    ctx.save();
    ctx.globalAlpha = k;
    ctx.fillStyle = 'rgba(4, 3, 10, 0.55)'; ctx.fillRect(0, 0, W, H);
    this.banner(['STAGE CLEAR'], 96, { scale: 4, color: '#ffd27a', sub: `${w.difficulty.name} · SCORE X${w.difficulty.scoreMult}` });
    const lines = [
      ['TIME BONUS', w.timeBonus],
      ['HEART BONUS', w.heartBonus],
      ['SCORE', w.score],
    ];
    lines.forEach(([label, val], i) => {
      if (this.stateT < 0.8 + i * 0.5) return;
      this.font.draw(ctx, label, W / 2 - 110, 180 + i * 18, { scale: 2, color: '#c9c3b0', shadow: '#120f1c' });
      this.font.draw(ctx, String(val).padStart(7, '0'), W / 2 + 110, 180 + i * 18, { scale: 2, align: 'right', shadow: '#120f1c' });
    });
    if (this.stateT > 2.6 && Math.floor(this.stateT * 2) % 2 === 0) this.font.draw(ctx, 'PRESS ENTER', W / 2, 262, { scale: 2, align: 'center', color: '#ffd27a', shadow: '#120f1c' });
    ctx.restore();
  }
}

const game = new Game(document.getElementById('game'));
window.__gothic = game;
game.boot().catch((e) => {
  console.error(e);
  const el = document.getElementById('boot');
  el.textContent = 'Failed to load: ' + e.message;
});

function safeStorageGet(key) {
  try { return window.localStorage.getItem(key); } catch (e) { return null; }
}
function safeStorageSet(key, value) {
  try { window.localStorage.setItem(key, value); } catch (e) { /* private mode */ }
}
