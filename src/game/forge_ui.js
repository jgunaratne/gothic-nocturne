// Castle Forge screens: the proposal form ("name the new wing"), the forging
// progress view where the wing's ghost rooms materialise on the Castle
// Exploration Map step by step, the reveal once it is raised, and the small
// background ticker shown on the title / map while a forge is still running.

import { W, H } from '../engine/constants.js';
import {
  drawCastleMap, MAP_ROOMS, MAP_X, MAP_Y, CELL_SIZE, GRID_COLS, GRID_ROWS, stageIndexOf,
} from './castlemap.js';
import { STAGES } from './stages.js';
import { THEMES } from './builder.js';
import { BOSS_RELICS, FORGED_RELIC_EFFECTS } from './relics.js';
import { designBlueprint, BASE_THEMES, SUGGESTIONS, MAX_FORGED_WINGS } from './forge.js';

const NAME_MAX = 28;
const DESC_MAX = 110;
const PRINTABLE = /^[A-Za-z0-9 '&.,!?:-]$/;

export class ForgeScreens {
  constructor(game) {
    this.game = game;
    this.name = '';
    this.desc = '';
    this.focus = 0;            // 0 = name, 1 = description
    this.t = 0;
    this.preview = null;       // { bp, placement } for the typed proposal
    this.previewKey = '';
    this.error = null;
    this.submitting = false;
    this.revealT = -1;         // >= 0 while the raised wing's cells pop in
    this.revealSfxAt = 0;
    this.returnState = 'title';
  }

  // ---------------------------------------------------------------- proposal

  openProposal(returnState = 'title') {
    this.returnState = returnState;
    this.t = 0;
    this.error = null;
    this.submitting = false;
    this.focus = 0;
    this.game.input.setTyping((e) => this.onKey(e));
    this.refreshPreview();
  }

  closeProposal() {
    this.game.input.setTyping(null);
  }

  onKey(e) {
    const g = this.game;
    if (e.code === 'Escape') { this.cancel(); return; }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') { this.submit(); return; }
    if (e.code === 'Tab') {
      const [n, d] = SUGGESTIONS[Math.floor(Math.random() * SUGGESTIONS.length)];
      this.name = n; this.desc = d.toUpperCase().slice(0, DESC_MAX);
      g.audio.sfx('pickup');
      this.refreshPreview();
      return;
    }
    if (e.code === 'ArrowUp' || e.code === 'ArrowDown') { this.focus = this.focus ? 0 : 1; g.audio.sfx('bone'); return; }
    if (e.code === 'Backspace') {
      if (this.focus === 0) this.name = this.name.slice(0, -1); else this.desc = this.desc.slice(0, -1);
      this.refreshPreview();
      return;
    }
    if (e.key && e.key.length === 1 && PRINTABLE.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const ch = e.key.toUpperCase();
      if (this.focus === 0) { if (this.name.length < NAME_MAX) this.name += ch; } else if (this.desc.length < DESC_MAX) this.desc += ch;
      if (ch !== ' ') g.audio.sfx('bone');
      this.refreshPreview();
    }
  }

  refreshPreview() {
    const key = `${this.name}|${this.desc}`;
    if (key === this.previewKey) return;
    this.previewKey = key;
    if (this.name.trim().length < 3) { this.preview = null; return; }
    try {
      const bp = designBlueprint({ name: this.name, description: this.desc });
      this.preview = { bp, placement: this.game.forge.previewFor(bp) };
    } catch (e) { this.preview = null; }
  }

  cancel() {
    this.closeProposal();
    this.game.audio.sfx('pause');
    this.game.setState(this.returnState);
  }

  async submit() {
    const g = this.game;
    if (this.submitting) return;
    if (this.name.trim().length < 3) { this.error = 'GIVE THE WING A NAME (3+ LETTERS)'; g.audio.sfx('block'); return; }
    if (g.forge.forgedCount >= MAX_FORGED_WINGS) { this.error = 'THE CASTLE CAN HOLD NO MORE WINGS'; g.audio.sfx('block'); return; }
    this.submitting = true;
    this.error = null;
    try {
      await g.forge.propose({ name: this.name.trim(), description: this.desc.trim() });
      this.closeProposal();
      this.revealT = -1;
      this.t = 0;
      g.audio.sfx('orb');
      g.setState('forging');
    } catch (e) {
      this.error = String(e.message || e).toUpperCase().slice(0, 60);
      g.audio.sfx('block');
    } finally {
      this.submitting = false;
    }
  }

  updateProposal(dt, inp) {
    this.t += dt;
    this.game.updateTitleBackdrop(dt);
    // Gamepad-only shortcuts (keyboard keys are captured by the text fields): A/B surprise me, Start forges, Back cancels.
    if (inp) {
      if (inp.pressed.jump) this.onKey({ code: 'Tab' });
      else if (inp.pressed.attack) this.focus = this.focus ? 0 : 1;
      else if (inp.pressed.start) this.submit();
      else if (inp.pressed.map) this.cancel();
    }
  }

  drawProposal(ctx) {
    const g = this.game;
    const f = g.font;
    g.titleWorld.draw(ctx, { hud: false });
    ctx.fillStyle = 'rgba(4, 3, 10, 0.72)';
    ctx.fillRect(0, 0, W, H);
    f.draw(ctx, 'GOTHIC NOCTURNE', W / 2, 14, { scale: 2, align: 'center', color: '#8a9ab5', spacing: 2, shadow: '#120f1c' });
    f.draw(ctx, 'EXPAND THE CASTLE', W / 2, 36, { scale: 3, align: 'center', color: '#e8e2c8', shadow: '#5b2a3a' });
    ctx.fillStyle = '#5b6b86';
    ctx.fillRect(W / 2 - 190, 70, 380, 1);
    f.draw(ctx, 'PROPOSE A NEW WING AND THE CASTLE WILL RAISE IT: LEVEL, ART, MUSIC AND GUARDIAN', W / 2, 76, { align: 'center', color: '#a89a74', shadow: '#120f1c', gothic: false });

    const caret = Math.floor(this.t * 2.4) % 2 === 0;
    const lx = 36, fw = 372;
    // Name field
    this.drawField(ctx, lx, 96, fw, 26, 'NAME THE NEW WING', this.name || '', this.focus === 0, caret, 2, this.name ? null : 'E.G. ABANDONED VILLAGE');
    // Description field
    this.drawField(ctx, lx, 142, fw, 40, 'DESCRIBE IT (OPTIONAL)', this.desc, this.focus === 1, caret, 1, this.desc ? null : 'SHUTTERED COTTAGES, A DRY WELL, A BELL THAT TOLLS AT MIDNIGHT...');

    // Mini castle grid: where the wing will rise
    const gx = 428, gy = 108, cs = 5;
    f.draw(ctx, 'WHERE IT WILL RISE', gx, 96, { color: '#c9c3b0', shadow: '#120f1c', gothic: false });
    this.drawMiniGrid(ctx, gx, gy, cs, this.preview ? this.preview.placement : null, this.preview ? this.preview.bp.palette.accent : '#ffd27a');

    // Blueprint preview
    const py = 196;
    ctx.fillStyle = 'rgba(8, 6, 18, 0.8)';
    ctx.fillRect(lx, py, W - lx * 2, 44);
    ctx.fillStyle = '#3a2e4c';
    ctx.fillRect(lx, py, W - lx * 2, 1); ctx.fillRect(lx, py + 43, W - lx * 2, 1);
    if (this.preview) {
      const bp = this.preview.bp;
      const bt = BASE_THEMES[bp.base];
      const from = this.preview.placement ? STAGES[stageIndexOf(this.preview.placement.anchorKey)] : null;
      const eff = FORGED_RELIC_EFFECTS[bp.relic.effect];
      ctx.fillStyle = bp.palette.accent;
      ctx.fillRect(lx + 1, py + 1, 3, 42);
      f.draw(ctx, `${bp.name}  ·  ${bp.subtitle}`, lx + 12, py + 6, { color: bp.palette.accent, shadow: '#05040a', gothic: false });
      f.draw(ctx, `STYLE · ${bt.label}      GUARDIAN · ${bp.boss.name}      ${bp.weather !== 'none' ? `WEATHER · ${bp.weather.toUpperCase()}` : bp.outdoor ? 'OPEN SKY' : 'INDOORS'}`, lx + 12, py + 18, { color: '#c9c3b0', shadow: '#05040a', gothic: false });
      f.draw(ctx, `GROWS FROM · ${from ? from.name : 'THE GROUNDS'}      RELIC · ${bp.relic.name} (${eff ? eff.short : 'VITALITY'})`, lx + 12, py + 30, { color: '#8a9ab5', shadow: '#05040a', gothic: false });
    } else {
      f.draw(ctx, 'THE BLUEPRINT PREVIEW APPEARS AS YOU TYPE A NAME', W / 2, py + 18, { align: 'center', color: '#5b5670', shadow: '#05040a', gothic: false });
    }

    // What the forge does + status
    const online = g.forge.online;
    const caps = g.forge.capabilities || {};
    const parts = ['LEVEL DESIGN'];
    parts.push(online && caps.generate ? 'GEMINI PIXEL ART' : 'INHERITED ART');
    parts.push(online && caps.generate ? 'LYRIA 3 SCORE' : 'BASE THEME MUSIC');
    parts.push(online && caps.generate ? 'DAIKON BOSS VOICE' : 'SUBTITLED BOSS');
    if (online && caps.elevenlabs) parts.push('ELEVENLABS AMBIENCE');
    parts.push('NEW ROOMS ON THE MAP');
    f.wrap(`THE FORGE WILL CREATE · ${parts.join(' · ')}`, W - 90, 1, 1, false).slice(0, 2)
      .forEach((ln, i) => f.draw(ctx, ln, W / 2, 246 + i * 11, { align: 'center', color: '#c9c3b0', shadow: '#120f1c', gothic: false }));
    const statusY = 270;
    const status = online === null ? 'CHECKING THE FORGE...'
      : online ? `FORGE ONLINE · ${caps.generate ? 'GEMINI + LYRIA 3 + DAIKON' : 'ASSET PIPELINE ONLY'}${caps.elevenlabs ? ' + ELEVENLABS' : ''} · ${g.forge.forgedCount}/${MAX_FORGED_WINGS} WINGS RAISED`
        : `FORGE OFFLINE · LOCAL PROCEDURAL MODE · ${g.forge.forgedCount}/${MAX_FORGED_WINGS} WINGS RAISED`;
    f.draw(ctx, status, W / 2, statusY, { align: 'center', color: online ? '#9ad17a' : online === null ? '#8a9ab5' : '#ffb347', shadow: '#120f1c', gothic: false });
    if (online && !caps.generate) f.draw(ctx, 'RUN tools/forge_server.py WHERE THE GENERATE CLI IS AVAILABLE FOR AI ART, MUSIC AND VOICE', W / 2, statusY + 12, { align: 'center', color: '#7c8498', shadow: '#120f1c', gothic: false });

    const pulse = 0.5 + 0.5 * Math.sin(this.t * 2.2);
    if (this.submitting) f.draw(ctx, 'SENDING THE PROPOSAL TO THE FORGE...', W / 2, 300, { scale: 2, align: 'center', color: '#ffd27a', shadow: '#5b2a3a', gothic: false });
    else f.draw(ctx, 'ENTER FORGE IT  ·  TAB SURPRISE ME  ·  ESC BACK', W / 2, 300, { scale: 2, align: 'center', color: pulse > 0.3 ? '#ffd27a' : '#c9a24a', shadow: '#5b2a3a', gothic: false });
    f.draw(ctx, '↑↓ SWITCH FIELD     GAMEPAD · A SURPRISE ME · X/Y FIELD · START FORGE · BACK CANCEL', W / 2, 316, { align: 'center', color: '#5b6b86', gothic: false });
    if (this.error) f.draw(ctx, this.error, W / 2, 330, { align: 'center', color: '#e23c3c', shadow: '#120f1c', gothic: false });
    else f.draw(ctx, 'FORGED WINGS ARE REMEMBERED AND APPEAR ON THE CASTLE MAP FOR EVERYONE WHO PLAYS HERE', W / 2, 330, { align: 'center', color: '#5b6b86', gothic: false });
  }

  drawField(ctx, x, y, w, h, label, text, focused, caret, scale, placeholder) {
    const f = this.game.font;
    f.draw(ctx, label, x, y - 12, { color: focused ? '#ffd27a' : '#c9c3b0', shadow: '#120f1c', gothic: false });
    ctx.fillStyle = focused ? 'rgba(232, 226, 200, 0.10)' : 'rgba(8, 6, 18, 0.72)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = focused ? '#ffd27a' : '#5b6b86';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    if (!text && placeholder) {
      f.draw(ctx, placeholder, x + 8, y + (scale === 2 ? 6 : 5), { scale: 1, color: '#4e4a5e', gothic: false });
    }
    if (scale === 2) {
      const shown = text.slice(-Math.floor((w - 20) / 12));
      f.draw(ctx, shown, x + 8, y + 6, { scale: 2, color: '#f6f0de', shadow: '#120f1c', gothic: false });
      if (focused && caret) { ctx.fillStyle = '#ffd27a'; ctx.fillRect(x + 8 + f.width(shown, 2, 1, false) + 2, y + 5, 3, 16); }
    } else {
      const lines = f.wrap(text, w - 16, 1, 1, false).slice(-3);
      lines.forEach((ln, i) => f.draw(ctx, ln, x + 8, y + 5 + i * 11, { color: '#f6f0de', shadow: '#120f1c', gothic: false }));
      if (focused && caret) {
        const last = lines[lines.length - 1] || '';
        ctx.fillStyle = '#ffd27a';
        ctx.fillRect(x + 8 + f.width(last, 1, 1, false) + 1, y + 4 + Math.max(0, lines.length - 1) * 11, 2, 9);
      }
    }
  }

  /** Tiny 34x14 castle grid with existing wings dimmed and the proposed wing pulsing. */
  drawMiniGrid(ctx, gx, gy, cs, placement, accent) {
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 4);
    ctx.fillStyle = 'rgba(8, 11, 24, 0.9)';
    ctx.fillRect(gx - 3, gy - 3, GRID_COLS * cs + 6, GRID_ROWS * cs + 6);
    ctx.strokeStyle = '#3a4a6a';
    ctx.strokeRect(gx - 2.5, gy - 2.5, GRID_COLS * cs + 5, GRID_ROWS * cs + 5);
    for (const [key, rm] of Object.entries(MAP_ROOMS)) {
      const st = STAGES[stageIndexOf(key)];
      const theme = st ? (THEMES[st.theme] || THEMES.graveyard) : THEMES.graveyard;
      for (const [c, r] of rm.allCells) {
        ctx.fillStyle = rm.bossSet.has(`${c},${r}`) ? 'rgba(150, 34, 56, 0.7)' : rm.forged ? 'rgba(90, 70, 130, 0.75)' : 'rgba(30, 78, 168, 0.55)';
        ctx.fillRect(gx + c * cs, gy + r * cs, cs - 1, cs - 1);
      }
      const [sc, sr] = rm.spine[0];
      ctx.fillStyle = theme.accent;
      ctx.fillRect(gx + sc * cs, gy + sr * cs + cs - 2, cs - 1, 1);
    }
    if (placement) {
      const cells = [...placement.room.spine, ...placement.room.extra];
      cells.forEach(([c, r], i) => {
        const on = (Math.floor(this.t * 6) + i) % 7 !== 0;
        ctx.fillStyle = on ? accent : '#ffffff';
        ctx.globalAlpha = 0.55 + 0.45 * pulse;
        ctx.fillRect(gx + c * cs, gy + r * cs, cs - 1, cs - 1);
        ctx.globalAlpha = 1;
      });
      const [bc, br] = placement.room.boss[0];
      ctx.fillStyle = '#ff6a88';
      ctx.fillRect(gx + bc * cs + 1, gy + br * cs + 1, cs - 3, cs - 3);
      const [ac, ar] = placement.door.cellA;
      ctx.fillStyle = '#9ef5dc';
      ctx.fillRect(gx + ac * cs + 1, gy + ar * cs + 1, cs - 3, cs - 3);
    }
  }

  // ----------------------------------------------------------------- forging

  updateForging(dt, inp) {
    const g = this.game;
    this.t += dt;
    g.updateTitleBackdrop(dt);
    const job = g.forge.activeJob;
    if (!job) { g.setState(this.returnState); return; }
    if (job.status === 'done') {
      if (this.revealT < 0) { this.revealT = 0; this.revealSfxAt = 0; }
      this.revealT += dt;
      const cells = this.revealCells(job);
      const shown = Math.min(cells.length, Math.floor(this.revealT / 0.16));
      if (shown > this.revealSfxAt) { this.revealSfxAt = shown; g.audio.sfx(shown === cells.length ? 'gate' : 'block'); }
      if (this.revealT > cells.length * 0.16 + 0.4 && !this.revealDone) { this.revealDone = true; g.audio.sfx('orb'); }
      if (this.revealT > 0.8 && (inp.pressed.start || inp.pressed.jump || inp.pressed.attack)) {
        const idx = stageIndexOf(job.stageKey);
        g.forge.pendingReveal = null;
        g.forge.dismissJob();
        this.revealDone = false;
        if (idx >= 0) { g.carryState = null; g.startGame(idx); } else g.setState(this.returnState);
      } else if (inp.pressed.escape || inp.pressed.map) {
        g.forge.pendingReveal = null;
        g.forge.dismissJob();
        this.revealDone = false;
        if (job.stageKey) g.mapCursor = job.stageKey;
        g.setState(this.returnState === 'title' ? 'title' : 'stageselect');
        g.audio.sfx('pause');
      }
      return;
    }
    if (job.status === 'error') {
      if (inp.pressed.start || inp.pressed.escape || inp.pressed.jump) { g.forge.dismissJob(); g.setState(this.returnState); g.audio.sfx('pause'); }
      return;
    }
    // Still running: Esc / Enter keeps forging in the background.
    if (this.t > 0.4 && (inp.pressed.start || inp.pressed.escape || inp.pressed.map)) {
      g.setState(this.returnState);
      g.audio.sfx('pause');
    }
  }

  revealCells(job) {
    const rm = job.stageKey ? MAP_ROOMS[job.stageKey] : null;
    if (rm) return rm.allCells;
    return job.preview ? [...job.preview.room.spine, ...job.preview.room.extra] : [];
  }

  drawForging(ctx) {
    const g = this.game;
    const f = g.font;
    const job = g.forge.activeJob;
    if (!job) return;
    const bp = job.blueprint;
    const accent = (bp && bp.palette && bp.palette.accent) || '#ffd27a';
    const anchor = job.preview ? job.preview.anchorKey : (bp && bp.connectsTo && bp.connectsTo[0]) || 'graveyard';
    const done = job.status === 'done';
    const cursor = done && job.stageKey ? job.stageKey : (MAP_ROOMS[anchor] ? anchor : 'graveyard');
    g.titleWorld.draw(ctx, { hud: false });
    drawCastleMap(ctx, f, g.assets, {
      cursor, cleared: g.cleared, discovered: g.discovered, vessels: g.vessels, explored: g.exploredCells,
      relics: g.getActiveRelics(), time: this.t, difficultyName: g.difficulty.name, mode: 'select',
    });

    // Ghost rooms rising cell by cell as the forge works (fully solid once raised).
    const cells = this.revealCells(job);
    const steps = job.steps || [];
    const doneSteps = steps.filter((s) => s.state === 'done' || s.state === 'skipped' || s.state === 'failed').length;
    const progress = done ? 1 : Math.min(0.92, (doneSteps + (steps.some((s) => s.state === 'running') ? 0.5 : 0)) / Math.max(1, steps.length));
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 5);
    const shownReveal = done ? Math.min(cells.length, Math.floor(Math.max(0, this.revealT) / 0.16)) : -1;
    cells.forEach(([c, r], i) => {
      const cx = MAP_X + c * CELL_SIZE, cy = MAP_Y + r * CELL_SIZE;
      const laid = done ? i < shownReveal : i < Math.floor(progress * cells.length);
      if (done && i >= shownReveal) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.25 + 0.3 * pulse})`;
        ctx.strokeRect(cx + 1.5, cy + 1.5, CELL_SIZE - 2, CELL_SIZE - 2);
        return;
      }
      if (laid) {
        ctx.fillStyle = accent;
        ctx.globalAlpha = done ? 0.55 : 0.42 + 0.18 * pulse;
        ctx.fillRect(cx + 1, cy + 1, CELL_SIZE - 1, CELL_SIZE - 1);
        ctx.globalAlpha = 1;
        if (done && i === shownReveal - 1 && this.revealT < cells.length * 0.16 + 0.2) {
          // Fresh stone: a burst of mortar dust
          const k = (this.revealT - (i * 0.16)) / 0.16;
          ctx.fillStyle = `rgba(255, 240, 200, ${Math.max(0, 1 - k)})`;
          for (let p = 0; p < 6; p++) {
            const a = (p / 6) * Math.PI * 2;
            ctx.fillRect(Math.round(cx + 7 + Math.cos(a) * (4 + k * 10)), Math.round(cy + 7 + Math.sin(a) * (4 + k * 10)), 2, 2);
          }
        }
      } else {
        ctx.strokeStyle = `rgba(255, 214, 122, ${0.35 + 0.4 * pulse})`;
        ctx.setLineDash([2, 2]);
        ctx.strokeRect(cx + 1.5, cy + 1.5, CELL_SIZE - 2, CELL_SIZE - 2);
        ctx.setLineDash([]);
      }
    });
    if (job.preview && !done) {
      const [ac, ar] = job.preview.door.cellA;
      const [bc, br] = job.preview.door.cellB;
      const dx = MAP_X + ((ac + bc + 1) * 0.5) * CELL_SIZE, dy = MAP_Y + ((ar + br + 1) * 0.5) * CELL_SIZE;
      ctx.fillStyle = `rgba(158, 245, 220, ${0.5 + 0.5 * pulse})`;
      ctx.fillRect(Math.round(dx) - 3, Math.round(dy) - 3, 6, 6);
    }

    // Progress panel over the inspector plate
    const px = MAP_X - 8, py = 256, pw = GRID_COLS * CELL_SIZE + 16, ph = 98;
    ctx.fillStyle = '#080612';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
    ctx.fillStyle = accent;
    ctx.fillRect(px + 1, py + 1, 3, ph - 2);
    const wingName = bp ? bp.name : (job.proposal && job.proposal.name ? titleOf(job.proposal.name) : 'THE NEW WING');
    const title = done ? `A NEW WING HAS RISEN · ${wingName}` : job.status === 'error' ? `THE FORGE FAILED · ${wingName}` : `FORGING · ${wingName}`;
    const maxTitle = Math.floor((pw - 28) / 12);
    f.draw(ctx, title.length > maxTitle ? title.slice(0, maxTitle) : title, px + 14, py + 6, { scale: 2, gothic: false, color: done ? '#ffd27a' : '#efe3bf', shadow: '#05040a' });
    const elapsed = Math.max(0, Math.round(((job.startedAt ? Date.now() - job.startedAt : this.t * 1000)) / 1000));

    // Step list (one line per step, detail after the label)
    const maxChars = Math.floor((pw - 28) / 6);
    steps.forEach((s, i) => {
      const sy = py + 25 + i * 10;
      const glyph = s.state === 'done' ? '*' : s.state === 'running' ? (Math.floor(this.t * 4) % 2 ? '→' : '-') : s.state === 'skipped' ? '-' : s.state === 'failed' ? 'X' : '.';
      const color = s.state === 'done' ? '#9ad17a' : s.state === 'running' ? '#ffd27a' : s.state === 'failed' ? '#e23c3c' : s.state === 'skipped' ? '#b89448' : '#5b6b86';
      const detail = s.detail ? `  ·  ${s.detail}` : '';
      f.draw(ctx, `${glyph} ${s.label}${detail}`.slice(0, maxChars), px + 14, sy, { color, shadow: '#05040a', gothic: false });
    });
    if (job.status === 'error') {
      f.draw(ctx, (job.error || g.forge.lastError || 'UNKNOWN ERROR').slice(0, maxChars), px + 14, py + 25 + steps.length * 10, { color: '#e23c3c', shadow: '#05040a', gothic: false });
    }

    // Footer: elapsed time + prompt
    const blink = Math.floor(this.t * 2.2) % 2 === 0;
    let foot;
    if (done) foot = this.revealT > 0.8 ? 'ENTER / JUMP / WHIP  EXPLORE THE NEW WING     ESC  CASTLE MAP' : 'THE WALLS RISE...';
    else if (job.status === 'error') foot = 'ENTER / ESC  BACK';
    else foot = job.local ? 'LOCAL FORGE (NO AI SERVER)     ESC  CONTINUE IN THE BACKGROUND' : 'GEMINI · GEMPIX · LYRIA 3 · DAIKON AT WORK     ESC  CONTINUE IN THE BACKGROUND';
    f.draw(ctx, done ? `RAISED IN ${elapsed}S` : `${elapsed}S`, px + 14, py + ph - 12, { color: '#8a9ab5', shadow: '#05040a', gothic: false });
    if (blink || !done) f.draw(ctx, foot, px + pw - 10, py + ph - 12, { align: 'right', color: done ? '#ffd27a' : '#9aa8c4', shadow: '#05040a', gothic: false });
  }

  // ------------------------------------------------------------------ ticker

  /** Small plate on the title / map while a forge runs (or just finished) in the background. */
  drawTicker(ctx, y = H - 30, anchorX = W / 2, align = 'center') {
    const g = this.game;
    const job = g.forge.activeJob;
    if (!job) return;
    const f = g.font;
    const bp = job.blueprint;
    const name = bp ? bp.name : (job.proposal && job.proposal.name ? titleOf(job.proposal.name) : 'THE NEW WING');
    const steps = job.steps || [];
    const doneSteps = steps.filter((s) => s.state === 'done' || s.state === 'skipped' || s.state === 'failed').length;
    const running = steps.find((s) => s.state === 'running');
    let text, color;
    if (job.status === 'done') { text = `A NEW WING HAS RISEN · ${name} · PRESS P TO SEE IT`; color = '#ffd27a'; }
    else if (job.status === 'error') { text = `THE FORGE FAILED · ${(job.error || '').slice(0, 40)} · PRESS P`; color = '#e23c3c'; }
    else { text = `FORGING ${name} · ${doneSteps}/${steps.length || 6}${running ? ` · ${running.label}` : ''}`; color = '#9ef5dc'; }
    const w = f.width(text, 1, 1, false) + 20;
    const x = Math.round(align === 'right' ? anchorX - w : align === 'left' ? anchorX : anchorX - w / 2);
    ctx.fillStyle = 'rgba(5, 4, 12, 0.88)';
    ctx.fillRect(x, y, w, 16);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, 1);
    if (job.status !== 'done' && job.status !== 'error') {
      const frac = Math.min(1, (doneSteps + (running ? 0.5 : 0)) / Math.max(1, steps.length || 6));
      ctx.fillStyle = 'rgba(158, 245, 220, 0.35)';
      ctx.fillRect(x, y + 15, Math.round(w * frac), 1);
    }
    f.draw(ctx, text, x + 10, y + 4, { color, shadow: '#05040a', gothic: false });
  }
}

function titleOf(raw) {
  let s = String(raw || '').toUpperCase().trim();
  if (s && !/^(THE|A|AN) /.test(s)) s = 'THE ' + s;
  return s || 'THE NEW WING';
}
