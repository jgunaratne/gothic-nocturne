// Gothic Nocturne — entry point: boot, scaling, game loop and menu states.

import { W, H, DT, DIFFICULTIES, DIFFICULTY_ORDER, DEFAULT_DIFFICULTY, ASSET_VERSION } from './engine/constants.js';
import { Input } from './engine/input.js';
import { Assets } from './engine/assets.js';
import { AudioSys } from './engine/audio.js';
import { Font } from './engine/font.js';
import { PostFX } from './engine/postfx.js';
import { getFxLayers } from './engine/fxlayers.js';
import { World } from './game/world.js';
import { STAGES } from './game/stages.js';
import { THEMES } from './game/builder.js';
import { drawHud, drawBanner } from './game/hud.js';
import { drawCastleMap, moveCursor, nextRoomAfter, stageIndexOf } from './game/castlemap.js';
import { BOSS_RELICS, resolveActiveRelics } from './game/relics.js';

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.ctx.imageSmoothingEnabled = false;
    this.assets = new Assets();
    this.audio = new AudioSys();
    this.font = new Font();
    this.input = new Input(canvas);
    this.postfx = new PostFX(canvas);
    if (new URLSearchParams(location.search).has('nofx')) { this.postfx.setEnabled(false); const fl = getFxLayers(); if (fl) fl.setEnabled(false); }
    this.state = 'loading';          // loading | title | difficulty | stageselect | play | pause | clear | ending | gameover
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
    // Stage progress: bitmask of cleared stages, last played stage.
    this.cleared = parseInt(safeStorageGet('gothic.cleared.v3') || '0', 10) || 0;
    const urlStage = parseInt(this.params.get('stage') || '0', 10);
    this.stageIndex = urlStage >= 1 && urlStage <= STAGES.length ? urlStage - 1
      : Math.min(STAGES.length - 1, parseInt(safeStorageGet('gothic.stage') || '0', 10) || 0);
    this.stageCursor = this.stageIndex;
    this.mapCursor = STAGES[this.stageIndex].key;
    this.carryState = null;          // score/lives/hearts carried between connected stages
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
    if (this.postfx) this.postfx.fit();
  }

  async boot() {
    await Promise.all([this.assets.load(), this.font.load(ASSET_VERSION)]);
    const bootEl = document.getElementById('boot');
    if (bootEl) bootEl.remove();
    this.titleWorld = new World(this, STAGES[0]);
    this.titleWorld.messages = [];
    this.titleWorld.camera.snapTo(8 * 32, 12 * 32);
    this.titleWorld.camera.x = 2 * 32;
    this.setState('title');
    const screen = this.params.get('screen');   // testing aid
    if (this.params.has('ending') || screen === 'ending') {
      if (!this.world) {
        this.world = new World(this, STAGES[STAGES.length - 1]);
        this.world.score = 148500;
      }
      this.beginEnding();
      if (this.params.has('ending')) this.stateT = Math.max(0, parseFloat(this.params.get('ending')) || 0);
    } else if (screen === 'difficulty' || screen === 'stageselect') {
      this.setState(screen);
    } else if (screen === 'play') {
      this.startGame();
    } else if (screen === 'clear') {
      this.startGame();
      this.world.timeBonus = 1234;
      this.world.heartBonus = 500;
      this.onStageClear();
      this.stateT = 3.0;
    }
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

  /** Resolves all currently unlocked Boss Relic power-ups. */
  getActiveRelics() {
    return resolveActiveRelics(this.cleared, STAGES, this.params);
  }

  /** Starts a stage; `carry` continues score/lives/hearts from the previous one. */
  startGame(stageIndex = this.stageIndex, carry = this.carryState) {
    this.stageIndex = Math.max(0, Math.min(STAGES.length - 1, stageIndex));
    this.mapCursor = STAGES[this.stageIndex].key;
    safeStorageSet('gothic.stage', String(this.stageIndex));
    const stage = STAGES[this.stageIndex];
    this.world = new World(this, stage, carry);
    // ?boss=1 teleports directly to the boss vestibule for testing.
    if (this.params.has('boss') && stage.boss && !carry) {
      this.world.phase = 'play';
      this.world.phaseT = 0;
      this.world.messages = [];
      this.world.player.x = stage.boss.triggerX + 4;
      this.world.player.y = stage.boss.arena.floorY;
      this.world.camera.snapTo(this.world.player.x, this.world.player.y);
    }
    // ?at=<tile column> teleports the hunter for testing.
    let at = parseInt(this.params.get('at') || '-1', 10);
    if (at >= 0 && !carry) {
      at = Math.min(at, Math.floor(stage.boss.triggerX / 32) + 1);
      const lvl = this.world.level;
      let row = lvl.surfaceRow(at);
      if (row < 0) {
        for (let d = 1; d <= 6 && row < 0; d++) {
          row = lvl.surfaceRow(at - d);
          if (row < 0) row = lvl.surfaceRow(at + d);
        }
      }
      this.world.player.x = at * 32 + 16;
      this.world.player.y = (row >= 0 ? row : 12) * 32;
      this.world.camera.snapTo(this.world.player.x, this.world.player.y);
    }
    this.setState('play');
    this.audio.playMusic(this.world.theme.music);
    this.audio.sfx('select');
  }

  // Hooks from World
  onRespawn() { this.audio.playMusic(this.world.theme.music); }
  onGameOver() { this.setState('gameover'); this.audio.playMusic('gameover', false); }
  onStageClear() {
    this.cleared |= 1 << this.stageIndex;
    safeStorageSet('gothic.cleared.v3', String(this.cleared));
    if (this.world) this.world.relics = this.getActiveRelics();
    this.setState('clear');
  }

  /** After the clear screen: next stage, or the ending after the last one. */
  advance() {
    const key = STAGES[this.stageIndex].key;
    if (key === 'throne') { this.beginEnding(); return; }
    // Back to the castle map: carry the run forward and point at the passage just opened.
    this.carryState = this.world.carry();
    this.mapCursor = nextRoomAfter(key, this.cleared) || key;
    this.setState('stageselect');
    this.audio.playMusic('title');
  }

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
    const fxWorld = (this.state === 'play' || this.state === 'pause' || this.state === 'clear' || this.state === 'gameover') ? this.world : null;
    if (fxWorld) {
      if (fxWorld.flash > 0.02) this.postfx.strike(fxWorld.flash);
      if (fxWorld.fxHurt) { this.postfx.damage(fxWorld.fxHurt); fxWorld.fxHurt = 0; }
      if (fxWorld.fxRoar) { this.postfx.flash(fxWorld.fxRoar); fxWorld.fxRoar = 0; }
    } else if ((this.state === 'title' || this.state === 'difficulty' || this.state === 'stageselect') && this.titleWorld && this.titleWorld.flash > 0.02) {
      this.postfx.strike(this.titleWorld.flash);
    }
    this.postfx.draw(dt, fxWorld ? fxWorld.data.theme : 'menu');
    requestAnimationFrame((t) => this.frame(t));
  }

  update(dt) {
    this.stateT += dt;
    const inp = this.input;
    if (inp.pressed.mute) { const m = this.audio.toggleMute(); this.muteFlash = m ? 'SOUND OFF' : 'SOUND ON'; this.muteT = 1.2; }
    if (inp.pressed.fx) { const on = this.postfx.toggle(); const fl = getFxLayers(); if (fl) fl.setEnabled(on); this.muteFlash = on ? 'SHADERS ON' : 'SHADERS OFF'; this.muteT = 1.2; }
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
          this.carryState = null;
          this.setState('stageselect'); this.audio.sfx('select');
        }
        break;
      }
      case 'stageselect': {
        this.updateTitleBackdrop(dt);
        let c = this.mapCursor;
        if (inp.pressed.left) c = moveCursor(c, -1, 0);
        else if (inp.pressed.right) c = moveCursor(c, 1, 0);
        else if (inp.pressed.up) c = moveCursor(c, 0, -1);
        else if (inp.pressed.down) c = moveCursor(c, 0, 1);
        if (c !== this.mapCursor) { this.mapCursor = c; this.audio.sfx('bone'); }
        if (this.stateT > 0.25 && (inp.pressed.start || inp.pressed.jump || inp.pressed.attack)) {
          this.startGame(stageIndexOf(this.mapCursor));
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
        if (this.stateT > 2 && inp.pressed.start) this.advance();
        break;
      case 'ending':
        if (this.stateT > 6 && (inp.pressed.start || inp.pressed.jump)) { this.setState('title'); this.audio.stopMusic(); this.endingNarrated = false; }
        if (this.state === 'ending' && !this.endingNarrated && this.stateT > 2.4) { this.endingNarrated = true; this.audio.playVoice('narrator_ending'); }
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
    { const fl = getFxLayers(); if (fl) fl.update(dt); }
    tw.updateLightning(dt);
    tw.time += dt;
    tw.level.updateMechanics(dt, tw.time, null, null);
    tw.camera.x += dt * 14;
    if (tw.camera.x > 96 * 32) tw.camera.x = 4 * 32;
  }

  draw() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    switch (this.state) {
      case 'title': this.drawTitle(ctx); break;
      case 'difficulty': this.drawDifficulty(ctx); break;
      case 'stageselect': this.drawStageSelect(ctx); break;
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
      case 'ending': this.drawEnding(ctx); break;
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
    const t = this.stateT;
    tw.draw(ctx, { hud: false });
    // Deepen the night and let the moon-blue light pool toward the centre
    const g = ctx.createRadialGradient(W * 0.5, 120, 40, W * 0.5, 160, 420);
    g.addColorStop(0, 'rgba(4, 3, 10, 0.28)');
    g.addColorStop(1, 'rgba(4, 3, 10, 0.78)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Drifting fog bands across the lower third
    ctx.save();
    ctx.globalAlpha = 0.16;
    for (let i = 0; i < 3; i++) {
      const y = 232 + i * 26 + Math.sin(t * 0.5 + i) * 4;
      const x = ((t * (9 + i * 6)) % (W + 240)) - 240;
      const fg = ctx.createLinearGradient(x, 0, x + 240, 0);
      fg.addColorStop(0, 'rgba(160, 170, 210, 0)'); fg.addColorStop(0.5, 'rgba(160, 170, 210, 1)'); fg.addColorStop(1, 'rgba(160, 170, 210, 0)');
      ctx.fillStyle = fg;
      ctx.fillRect(x, y, 240, 18);
    }
    ctx.restore();

    const f = this.font;
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);
    const logo = this.assets.img('title_logo');
    const reveal = Math.min(1, Math.max(0, (t - 0.3) / 1.4));
    if (logo) {
      // Blackletter logo: rises and fades in, then breathes gently with a crimson under-glow
      const lw = 340, lh = Math.round(logo.height * (lw / logo.width));
      const lx = Math.round((W - lw) / 2), ly = Math.round(18 + (1 - reveal) * 16 + Math.sin(t * 1.3) * 2);
      ctx.save();
      ctx.globalAlpha = reveal;
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(W / 2, ly + lh * 0.5, 20, W / 2, ly + lh * 0.5, 230);
      glow.addColorStop(0, `rgba(170, 40, 60, ${0.22 + 0.1 * pulse})`); glow.addColorStop(1, 'rgba(170, 40, 60, 0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(logo, lx, ly, lw, lh);
      // Lightning: the logo flashes bone-white
      if (tw.flash > 0.5) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = reveal * (tw.flash - 0.5) * 0.9;
        ctx.drawImage(logo, lx, ly, lw, lh);
      }
      ctx.restore();
    } else {
      f.draw(ctx, 'GOTHIC', W / 2, 62, { scale: 6, align: 'center', color: '#e8e2c8', spacing: 2, shadow: '#5b2a3a' });
      f.draw(ctx, 'NOCTURNE', W / 2, 118, { scale: 4, align: 'center', color: '#c23b4a', spacing: 2, shadow: '#120f1c' });
    }
    if (reveal >= 1) {
      // Ornamental rule and tagline
      ctx.fillStyle = '#8a6a3a'; ctx.fillRect(W / 2 - 150, 226, 300, 1);
      ctx.fillStyle = '#d9b36a'; ctx.fillRect(W / 2 - 2, 224, 4, 4); ctx.fillRect(W / 2 - 150, 225, 3, 3); ctx.fillRect(W / 2 + 147, 225, 3, 3);
      f.draw(ctx, 'A 32-BIT WHIP-CRACKING ACTION PLATFORMER', W / 2, 234, { align: 'center', color: '#a89a74', shadow: '#120f1c' });
      if (pulse > 0.25) f.draw(ctx, 'PRESS ENTER OR START', W / 2, 256, { scale: 2, align: 'center', color: '#ffd27a', shadow: '#5b2a3a' });
      // Controls plate
      ctx.fillStyle = 'rgba(4, 3, 10, 0.55)';
      ctx.fillRect(W / 2 - 236, 284, 472, 44);
      ctx.fillStyle = '#3a2e22'; ctx.fillRect(W / 2 - 236, 284, 472, 1); ctx.fillRect(W / 2 - 236, 327, 472, 1);
      const lines = [
        '←→ MOVE    ↓ CROUCH    Z/J/SPACE JUMP    X/K WHIP',
        '↑ + WHIP THROWS YOUR SUB-WEAPON (COSTS A HEART)',
        'ENTER PAUSE    M MUTE    F SHADERS    GAMEPAD SUPPORTED',
      ];
      lines.forEach((l, i) => f.draw(ctx, l, W / 2, 290 + i * 12, { align: 'center', color: i === 1 ? '#ffb0a0' : '#c9c3b0', shadow: '#120f1c' }));
      f.draw(ctx, 'ART · GEMINI     MUSIC · LYRIA 3     VOICE · DAIKON     2026', W / 2, H - 16, { align: 'center', color: '#5b6b86' });
    }
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
      f.draw(ctx, d.name, W / 2 - 185, y, { scale: 3, gothic: false, color: selected ? colors[key] : '#6f6a80', shadow: '#120f1c' });
      f.draw(ctx, d.tagline, W / 2 - 185 + f.width(d.name, 3, 1, false) + 18, y + 12, { color: selected ? '#e8e2c8' : '#5b5670', shadow: '#120f1c' });
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
    ctx.fillStyle = 'rgba(4, 3, 10, 0.58)'; ctx.fillRect(0, 0, W, H);
    this.banner(['STAGE CLEAR'], 68, { scale: 3, gothic: false, color: '#ffd27a', sub: `${w.difficulty.name} · SCORE X${w.difficulty.scoreMult}` });
    const lines = [
      ['TIME BONUS', w.timeBonus],
      ['HEART BONUS', w.heartBonus],
      ['SCORE', w.score],
    ];
    // Dark plate behind the tally so the figures read over busy scenery
    ctx.fillStyle = 'rgba(4, 3, 10, 0.84)';
    ctx.fillRect(W / 2 - 140, 130, 280, 68);
    ctx.fillStyle = '#5b6b86';
    ctx.fillRect(W / 2 - 140, 130, 280, 1); ctx.fillRect(W / 2 - 140, 197, 280, 1);
    lines.forEach(([label, val], i) => {
      if (this.stateT < 0.7 + i * 0.4) return;
      this.font.draw(ctx, label, W / 2 - 122, 139 + i * 18, { scale: 2, gothic: false, color: '#c9c3b0', shadow: '#120f1c' });
      this.font.draw(ctx, String(val).padStart(7, '0'), W / 2 + 122, 139 + i * 18, { scale: 2, gothic: false, align: 'right', shadow: '#120f1c' });
    });

    // Boss Relic Power-Up unlocked card
    const relic = BOSS_RELICS[STAGES[this.stageIndex].key];
    if (relic && this.stateT >= 1.9) {
      const rk = Math.min(1, (this.stateT - 1.9) / 0.35);
      ctx.save();
      ctx.globalAlpha = k * rk;
      const rx = W / 2 - 216, ry = 206, rw = 432, rh = 62;
      ctx.fillStyle = 'rgba(8, 6, 18, 0.90)';
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeStyle = relic.color;
      ctx.lineWidth = 1;
      ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, rh - 1);
      ctx.strokeStyle = '#3a2e4c';
      ctx.strokeRect(rx + 2.5, ry + 2.5, rw - 5, rh - 5);
      ctx.fillStyle = relic.color;
      ctx.fillRect(rx + 2, ry + 2, 3, 3);
      ctx.fillRect(rx + rw - 5, ry + 2, 3, 3);
      ctx.fillRect(rx + 2, ry + rh - 5, 3, 3);
      ctx.fillRect(rx + rw - 5, ry + rh - 5, 3, 3);
      this.font.draw(ctx, '* BOSS POWER-UP UNLOCKED *', W / 2, ry + 8, { align: 'center', color: '#ffd27a', shadow: '#120f1c', gothic: false });
      this.font.draw(ctx, `${relic.name} - ${relic.short}`, W / 2, ry + 22, { scale: 2, align: 'center', color: relic.color, shadow: '#120f1c', gothic: false });
      this.font.draw(ctx, relic.desc, W / 2, ry + 44, { align: 'center', color: '#e8e2c8', shadow: '#120f1c', gothic: false });
      ctx.restore();
    }

    if (this.stateT > 2.4 && Math.floor(this.stateT * 2.2) % 2 === 0) {
      const last = STAGES[this.stageIndex].key === 'throne';
      this.font.draw(ctx, last ? 'PRESS ENTER' : 'PRESS ENTER FOR THE CASTLE MAP', W / 2, 286, { scale: 2, gothic: false, align: 'center', color: '#ffd27a', shadow: '#120f1c' });
    }
    ctx.restore();
  }

  drawStageSelect(ctx) {
    const tw = this.titleWorld;
    tw.draw(ctx, { hud: false });
    drawCastleMap(ctx, this.font, this.assets, {
      cursor: this.mapCursor, cleared: this.cleared, time: this.stateT, difficultyName: this.difficulty.name,
    });
  }

  /** Starts the finale: collapse, three illustrated panels with the narrator, dawn, logo. */
  beginEnding() {
    this.setState('ending');
    this.endingNarrated = false;
    this.audio.playMusic('ending', false);
    if (this.audio.prefetchVoice) this.audio.prefetchVoice('narrator_ending');
  }

  drawEnding(ctx) {
    const t = this.stateT;
    const f = this.font;
    const w = this.world;
    const A = this.assets;
    const p1 = A.img('ending_1'), p2 = A.img('ending_2'), p3 = A.img('ending_3');
    // Timeline (seconds): 0-7 collapse panel with quake & crimson cracks, 7-20 road panel,
    // 20-33 dawn panel, 33+ logo/credits. Slow drifts (Ken Burns) on every panel.
    const drawPanel = (img, from, to, zoomFrom, zoomTo, panX) => {
      if (!img) return;
      const k = Math.max(0, Math.min(1, (t - from) / Math.max(0.01, to - from)));
      const z = zoomFrom + (zoomTo - zoomFrom) * k;
      const dw = W * z, dh = H * z;
      const dx = (W - dw) / 2 + panX * k, dy = (H - dh) / 2;
      ctx.drawImage(img, Math.round(dx), Math.round(dy), Math.round(dw), Math.round(dh));
    };
    const fadeBetween = (a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));

    ctx.fillStyle = '#05040a'; ctx.fillRect(0, 0, W, H);
    if (t < 8.2) {
      // 1. The keep comes down: slow push-in, quake shake, crimson flashes, falling embers
      const quake = t < 6 ? Math.max(0, 1 - t / 6) * 5 : 0;
      ctx.save();
      ctx.translate(Math.round((Math.random() - 0.5) * quake), Math.round((Math.random() - 0.5) * quake));
      drawPanel(p1, 0, 8, 1.0, 1.12, -18);
      ctx.restore();
      const flash = Math.max(0, Math.sin(t * 7.3) * Math.sin(t * 3.1)) * Math.max(0, 1 - t / 6);
      if (flash > 0.55) { ctx.fillStyle = `rgba(255, 80, 60, ${(flash - 0.55) * 0.5})`; ctx.fillRect(0, 0, W, H); }
      if (!this._embers) this._embers = Array.from({ length: 70 }, (_, i) => ({ x: Math.random() * W, y: Math.random() * H, s: 0.4 + Math.random(), p: i }));
      for (const e of this._embers) {
        const ex = (e.x + Math.sin(t * 0.8 + e.p) * 12 + t * 9 * e.s) % (W + 20) - 10;
        const ey = (e.y - t * 26 * e.s) % H; const yy = ey < 0 ? ey + H : ey;
        ctx.fillStyle = e.p % 3 ? '#ff9a3c' : '#ffd27a';
        ctx.fillRect(Math.round(ex), Math.round(yy), e.s > 1.1 ? 2 : 1, e.s > 1.1 ? 2 : 1);
      }
      if (t > 0.6) this.banner(['THE NIGHT IS OVER'], 38, { scale: 3, gothic: false, color: '#ffd27a', band: true });
    } else if (t < 21) {
      drawPanel(p2, 8, 21, 1.1, 1.0, 14);
    } else if (t < 34) {
      drawPanel(p3, 21, 34, 1.0, 1.1, -10);
      // Dawn: warm light swelling over the valley
      const kd = fadeBetween(21, 30);
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, `rgba(255, 190, 110, ${0.05 + 0.12 * kd})`); g.addColorStop(1, 'rgba(255, 190, 110, 0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } else {
      // Final card: logo over the dawn panel, framed score & credits plate
      drawPanel(p3, 34, 60, 1.1, 1.18, -6);
      ctx.fillStyle = 'rgba(6, 4, 14, 0.74)'; ctx.fillRect(0, 0, W, H);
      const logo = A.img('title_logo');
      if (logo) {
        const lw = 276, lh = Math.round(logo.height * (lw / logo.width));
        const lx = Math.round((W - lw) / 2), ly = 10;
        const lg = ctx.createRadialGradient(W / 2, ly + lh * 0.5, 24, W / 2, ly + lh * 0.5, 210);
        lg.addColorStop(0, 'rgba(4, 3, 10, 0.72)');
        lg.addColorStop(1, 'rgba(4, 3, 10, 0)');
        ctx.fillStyle = lg;
        ctx.fillRect(0, 0, W, ly + lh + 24);
        ctx.drawImage(logo, lx, ly, lw, lh);
      }
      const cx = W / 2 - 228, cy = 186, cw = 456, ch = 156;
      ctx.fillStyle = 'rgba(5, 4, 12, 0.90)';
      ctx.fillRect(cx, cy, cw, ch);
      ctx.strokeStyle = '#8a6a3a';
      ctx.lineWidth = 1;
      ctx.strokeRect(cx + 0.5, cy + 0.5, cw - 1, ch - 1);
      ctx.strokeStyle = '#2e243d';
      ctx.strokeRect(cx + 2.5, cy + 2.5, cw - 5, ch - 5);
      if (w) {
        f.draw(ctx, `FINAL SCORE ${String(w.score).padStart(7, '0')}`, W / 2, 198, { scale: 2, gothic: false, align: 'center', color: '#ffd27a', shadow: '#05040a' });
        f.draw(ctx, `${w.difficulty.name} · ${w.lives} LIVES REMAINING · ${w.hearts} HEARTS`, W / 2, 222, { gothic: false, align: 'center', color: '#e8e2c8', shadow: '#05040a' });
      }
      ctx.fillStyle = '#5a462c';
      ctx.fillRect(W / 2 - 150, 240, 300, 1);
      f.draw(ctx, 'THANK YOU FOR PLAYING', W / 2, 250, { scale: 2, gothic: false, align: 'center', color: '#f6f0de', shadow: '#05040a' });
      f.draw(ctx, 'ART · GEMINI     MUSIC · LYRIA 3     VOICE · DAIKON', W / 2, 278, { gothic: false, align: 'center', color: '#b8c4dc', shadow: '#05040a' });
      const pulse = 0.72 + 0.28 * Math.sin(t * 4.2);
      ctx.save();
      ctx.globalAlpha = pulse;
      f.draw(ctx, 'PRESS ENTER', W / 2, 306, { scale: 2, gothic: false, align: 'center', color: '#ffd27a', shadow: '#05040a' });
      ctx.restore();
    }
    // Crossfades between panels
    for (const [a, b] of [[7.4, 8.6], [20.4, 21.6], [33.4, 34.6]]) {
      if (t > a && t < b) { const k = 1 - Math.abs((t - (a + b) / 2) / ((b - a) / 2)); ctx.fillStyle = `rgba(5, 4, 10, ${k})`; ctx.fillRect(0, 0, W, H); }
    }
    // Letterbox + high-legibility timed captions during the narrated panels (0..34s)
    if (t < 34) {
      ctx.fillStyle = '#05040a';
      ctx.fillRect(0, 0, W, 22);
      ctx.fillStyle = '#5a462c';
      ctx.fillRect(0, 22, W, 1);
      const barH = 58, barY = H - barH;
      ctx.fillStyle = 'rgba(5, 4, 12, 0.94)';
      ctx.fillRect(0, barY, W, barH);
      ctx.fillStyle = '#7a603a';
      ctx.fillRect(0, barY, W, 1);
      const caps = [
        [2.4, 8.0, 'AND SO THE COUNT WAS DUST, AND HIS KEEP FELL SILENT.'],
        [8.6, 14.5, 'THE BELLS OF MIDNIGHT CRACKED AND TUMBLED FROM THE BELFRY,'],
        [14.5, 20.3, 'AND THE DARKNESS THAT FED ON THE VALLEY DRAINED AWAY.'],
        [21.6, 27.5, 'THE HUNTER DID NOT LOOK BACK. HE WALKED THE GRAVEYARD ROAD AS THE MIST LIFTED,'],
        [27.5, 33.3, 'AND FOR THE FIRST TIME IN HIS LIFE... HE WALKED IT TOWARD THE SUNRISE.'],
      ];
      for (const [a, b, text] of caps) {
        if (t < a || t > b) continue;
        const k = Math.min(1, (t - a) / 0.35, (b - t) / 0.35);
        ctx.save();
        ctx.globalAlpha = Math.max(0, k);
        const lines = f.wrap(text, W - 32, 2, 1, false);
        const step = 20;
        const blockH = lines.length * step - 6;
        const startY = barY + Math.round((barH - blockH) / 2);
        lines.forEach((ln, i) => {
          f.draw(ctx, ln, W / 2, startY + i * step, {
            scale: 2,
            gothic: false,
            align: 'center',
            color: '#f6f0de',
            shadow: '#05040a',
          });
        });
        ctx.restore();
      }
    }
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
