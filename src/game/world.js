// World: owns the level, player, enemies, objects, camera, scripting and the
// draw order. The Game (main.js) drives it and layers menus on top.

import {
  W, H, TILE, T_GATE, T_BLOCK, SCORE, PLAYER,
} from '../engine/constants.js';
import { Camera } from '../engine/camera.js';
import { Particles } from '../engine/particles.js';
import { Level } from './level.js';
import { Parallax } from './parallax.js';
import { Player } from './player.js';
import { Skeleton, Bat, Spawner } from './enemies.js';
import { createBoss } from './bosses.js';
import { THEMES } from './builder.js';
import { Candle, Item, Projectile, Fire, rollDrop, rectsOverlap } from './objects.js';

export class World {
  /** `carry` = {score, lives, hearts, subWeapon} when continuing from a stage. */
  constructor(game, data, carry = null) {
    this.game = game;
    this.assets = game.assets;
    this.audio = game.audio;
    this.font = game.font;
    this.data = data;
    this.stage = data;
    this.theme = THEMES[data.theme] || THEMES.graveyard;
    this.difficulty = game.difficulty;
    this.level = new Level(data);
    this.parallax = new Parallax(this.assets, this.level.height, this.theme.layers || 'outdoor');
    this.particles = new Particles();
    this.camera = new Camera(this.level.width, this.level.height);
    this.score = carry ? carry.score : 0;
    this.lives = carry ? carry.lives : this.difficulty.lives;
    this.hearts = carry ? carry.hearts : this.difficulty.hearts;
    this.subWeaponCarry = carry ? carry.subWeapon : null;
    this.timeLeft = this.difficulty.time;
    this.checkpoint = 0;
    this.time = 0;
    this.flash = 0;
    this.nextLightning = 6 + Math.random() * 10;
    this.thunderDelay = -1;
    this.messages = [];          // {text, sub, t, dur}
    this.phase = 'intro';        // intro | play | dying | respawn | clear | gameover
    this.phaseT = 0;
    this.bossActive = false;
    this.boss = null;
    this.spawnAll();
  }

  // ------------------------------------------------------------- setup

  /** (Re)creates all dynamic entities from the stage data. */
  spawnAll() {
    const d = this.data;
    this.enemies = [];
    this.candles = [];
    this.items = [];
    this.projectiles = [];
    this.fires = [];
    this.spawners = d.spawners.map((s) => new Spawner(s));
    this.boss = null;
    this.bossActive = false;
    this.gateClosed = false;
    this.camera.resetBounds();
    this.level = new Level(d);     // restores breakable blocks
    for (const c of d.candles) {
      this.candles.push(new Candle(c[0] * TILE + TILE / 2, c[1] * TILE, c[2] || null));
    }
    for (const e of d.enemies) {
      if (e.type === 'skeleton') this.spawnEnemy(new Skeleton(e.tx * TILE + TILE / 2, e.row * TILE, e.min * TILE, (e.max + 1) * TILE, e.variant));
      else if (e.type === 'bat') this.spawnEnemy(new Bat(e.tx * TILE + TILE / 2, e.ty * TILE + 16, e.variant));
    }
    const cx = d.checkpoints[this.checkpoint];
    const col = Math.floor(cx / TILE);
    const row = this.level.surfaceRow(col);
    this.player = new Player(cx, row * TILE);
    this.player.facing = 1;
    this.player.subWeapon = this.subWeaponCarry;
    this.camera.snapTo(this.player.x, this.player.y);
    this.phase = 'intro'; this.phaseT = 0;
    this.showMessage(`STAGE ${d.id || 1}`, d.name, 2.6);
  }

  // --------------------------------------------------------- utilities
  sfx(name) { this.audio.sfx(name); }
  addScore(n) { this.score += Math.round(n * this.difficulty.scoreMult); }
  showMessage(text, sub, dur = 2) { this.messages.push({ text, sub, t: 0, dur }); }
  /** Registers an enemy, scaling multi-hit health by the difficulty preset. */
  spawnEnemy(e) {
    if (e.hp > 1) {
      e.hp = Math.max(1, Math.round(e.hp * this.difficulty.enemyHp));
      if (e.maxHp) e.maxHp = e.hp;
    }
    this.enemies.push(e);
  }
  spawnProjectile(p) { this.projectiles.push(p); }
  spawnFire(x, y) { this.fires.push(new Fire(x, y)); this.sfx('fire'); }
  spawnItem(type, x, y) { if (type) this.items.push(new Item(type, x, y)); }

  throwSubWeapon(player) {
    this.hearts = Math.max(0, this.hearts - 1);
    const p = new Projectile(player.subWeapon, player.x + player.facing * 10, player.y - 44, player.facing, 'player');
    this.projectiles.push(p);
    this.sfx('throw');
  }

  onEnemyKilled() { /* hook for stats */ }

  onPlayerDeath() {
    this.phase = 'dying'; this.phaseT = 0;
    this.sfx('die');
    this.audio.stopMusic(0.8);
  }

  onBossDefeated(boss) {
    this.bossActive = false;
    this.spawnItem('orb', boss.x, boss.y - 40);
    this.sfx('orb');
    this.projectiles = this.projectiles.filter((p) => p.owner !== 'enemy');
  }

  // ------------------------------------------------------------ update
  update(dt, input) {
    this.time += dt;
    this.phaseT += dt;
    this.parallax.update(dt);
    this.particles.update(dt);
    this.updateLightning(dt);
    for (const m of this.messages) m.t += dt;
    this.messages = this.messages.filter((m) => m.t < m.dur);

    if (this.phase === 'intro' && this.phaseT > 0.6) this.phase = 'play';
    if (this.phase === 'clear') { this.updateEntities(dt, input, false); return; }
    if (this.phase === 'dying') {
      this.player.update(dt, input, this.level, this);
      for (const e of this.enemies) if (e.deathT >= 0) e.update(dt, this.level, this);
      this.camera.update(dt, this.player, this.player.facing);
      if (this.phaseT > 2.3) {
        this.lives -= 1;
        if (this.lives < 0) { this.phase = 'gameover'; this.phaseT = 0; this.game.onGameOver(); }
        else { this.timeLeft = this.difficulty.time; this.spawnAll(); this.game.onRespawn(); }
      }
      return;
    }
    if (this.phase === 'gameover') return;

    this.timeLeft -= dt;
    if (this.timeLeft <= 0 && this.player.alive) { this.timeLeft = 0; this.player.hp = 0; this.player.die(this); }
    this.updateEntities(dt, input, true);
  }

  updateEntities(dt, input, live) {
    const p = this.player;
    const lvl = this.level;
    if (live) p.update(dt, input, lvl, this);
    else { p.vx = 0; p.physics(lvl, dt); p.state = 'idle'; }

    // Checkpoints / boss trigger
    for (let i = this.data.checkpoints.length - 1; i > this.checkpoint; i--) {
      if (p.x >= this.data.checkpoints[i]) { this.checkpoint = i; break; }
    }
    if (!this.bossActive && !this.boss && p.x >= this.data.boss.triggerX && live) this.startBoss();
    if (p.y > lvl.height + 80 && p.alive) { p.hp = 0; p.die(this); }

    // Enemies
    for (const s of this.spawners) s.update(dt, this);
    const camL = this.camera.x - 160, camR = this.camera.x + W + 160;
    for (const e of this.enemies) {
      if (e === this.boss || e.flies || e.active || (e.x > camL && e.x < camR)) {
        e.active = true;
        e.update(dt, lvl, this);
      }
    }
    for (const pr of this.projectiles) pr.update(dt, lvl, this);
    for (const it of this.items) it.update(dt, lvl);
    for (const f of this.fires) f.update(dt);

    if (live && p.alive) this.resolveCombat(dt);

    this.enemies = this.enemies.filter((e) => !e.dead);
    this.projectiles = this.projectiles.filter((e) => !e.dead);
    this.items = this.items.filter((e) => !e.dead);
    this.fires = this.fires.filter((e) => !e.dead);
    this.candles = this.candles.filter((e) => !e.dead);

    this.camera.update(dt, p, p.facing);
  }

  resolveCombat() {
    const p = this.player;
    const lvl = this.level;
    const whip = p.whipBox();

    // Whip vs candles, blocks, enemies, enemy projectiles
    if (whip && !p.attackHit) {
      let hitSomething = false;
      for (const c of this.candles) {
        if (rectsOverlap(whip, c.box)) {
          c.dead = true; hitSomething = true;
          this.sfx('candle');
          this.particles.embers(c.x, c.y - 50, 10);
          this.particles.sparks(c.x, c.y - 40, 6, '#ffd27a');
          this.addScore(SCORE.candle);
          this.spawnItem(c.drop || rollDrop(), c.x, c.y - 40);
        }
      }
      const tx0 = Math.floor(whip.x / TILE), tx1 = Math.floor((whip.x + whip.w) / TILE);
      const ty0 = Math.floor(whip.y / TILE), ty1 = Math.floor((whip.y + whip.h) / TILE);
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        if (lvl.tile(tx, ty) !== T_BLOCK) continue;
        const drop = lvl.breakBlock(tx, ty);
        hitSomething = true;
        this.sfx('block');
        this.camera.shake(2, 0.12);
        this.particles.shards(tx * TILE + 16, ty * TILE + 30, 12, '#8a9ab5', ty * TILE + 32);
        if (drop) this.spawnItem(drop, tx * TILE + 16, ty * TILE + 20);
      }
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const died = rectsOverlap(whip, e.box()) || (e === this.boss && rectsOverlap(whip, e.box(10)));
        if (died) { e.takeHit(PLAYER.whipDamage, p.x, this); hitSomething = true; this.camera.shake(1.5, 0.08); }
      }
      for (const pr of this.projectiles) {
        if (pr.owner === 'enemy' && pr.type !== 'sickle' && rectsOverlap(whip, pr.box)) {
          pr.dead = true; hitSomething = true;
          this.particles.sparks(pr.x, pr.y, 5, '#ffffff');
          this.sfx('hit');
        }
      }
      if (hitSomething) p.attackHit = true;
    }

    // Player projectiles vs enemies / candles
    for (const pr of this.projectiles) {
      if (pr.dead || pr.owner !== 'player') continue;
      for (const e of this.enemies) {
        if (!e.alive || pr.hitSet.has(e)) continue;
        if (rectsOverlap(pr.box, e.box())) {
          pr.hitSet.add(e);
          e.takeHit(pr.damage, pr.x, this);
          if (pr.pierce > 0) pr.pierce--; else pr.dead = true;
          if (pr.type === 'holy_water') { this.spawnFire(pr.x, Math.floor((e.y) / TILE) * TILE); pr.dead = true; }
          if (pr.dead) break;
        }
      }
      for (const c of this.candles) {
        if (!pr.dead && rectsOverlap(pr.box, c.box)) {
          c.dead = true; this.sfx('candle'); this.particles.embers(c.x, c.y - 50, 8);
          this.addScore(SCORE.candle); this.spawnItem(c.drop || rollDrop(), c.x, c.y - 40);
          if (pr.pierce > 0) pr.pierce--; else pr.dead = true;
        }
      }
    }

    // Fire pools vs enemies
    for (const f of this.fires) {
      if (!f.shouldDamage()) continue;
      for (const e of this.enemies) if (e.alive && rectsOverlap(f.box, e.box())) e.takeHit(1, f.x, this);
    }

    // Enemy contact / projectiles / spikes vs player
    const pb = p.box();
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e === this.boss) {
        const sb = e.swingBox();
        if (sb && rectsOverlap(sb, pb)) { p.hurt(4, e.x, this); continue; }
        if (e.alpha > 0.7 && rectsOverlap(e.box(-6), pb)) p.hurt(e.touchDamage, e.x, this);
        continue;
      }
      if (rectsOverlap(e.box(-2), pb)) p.hurt(e.touchDamage, e.x, this);
    }
    for (const pr of this.projectiles) {
      if (pr.owner === 'enemy' && !pr.dead && rectsOverlap(pr.box, pb)) {
        if (p.hurt(pr.damage, pr.x, this) && pr.type !== 'sickle' && pr.type !== 'skull') pr.dead = true;
        if (pr.type === 'skull' && p.invuln > 0) pr.dead = true;
      }
    }
    // Spikes: feet region
    const ftx0 = Math.floor(pb.x / TILE), ftx1 = Math.floor((pb.x + pb.w - 1) / TILE);
    const fty = Math.floor((p.y - 2) / TILE);
    for (let tx = ftx0; tx <= ftx1; tx++) {
      if (lvl.isSpike(tx, fty) && p.y - 2 > fty * TILE + 10) { p.hurt(3, p.x - p.facing * 10, this); break; }
    }

    // Items
    for (const it of this.items) {
      if (it.dead) continue;
      if (rectsOverlap(it.box(2), pb)) { it.dead = true; this.collect(it.type); }
    }
  }

  collect(type) {
    const p = this.player;
    switch (type) {
      case 'heart_small': this.hearts = Math.min(99, this.hearts + 1); this.sfx('heart'); break;
      case 'heart_big': this.hearts = Math.min(99, this.hearts + 5); this.sfx('heart'); break;
      case 'money': this.addScore(SCORE.money); this.sfx('pickup'); break;
      case 'meat': p.hp = Math.min(PLAYER.maxHp, p.hp + 8); this.sfx('pickup'); break;
      case 'dagger': case 'axe': case 'holy_water':
        p.subWeapon = type; this.subWeaponCarry = type; this.sfx('pickup'); break;
      case 'orb': this.stageClear(); break;
      default: break;
    }
  }

  // ----------------------------------------------------------- scripting
  startBoss() {
    const b = this.data.boss;
    this.bossActive = true;
    this.gateClosed = true;
    for (let r = b.gateRows[0]; r <= b.gateRows[1]; r++) this.level.set(b.gateCol, r, T_GATE);
    this.camera.setBounds(b.camX, b.camX);
    this.boss = createBoss(b.type || 'reaper', b.spawn.x, b.spawn.y, b.arena, this.difficulty);
    this.spawnEnemy(this.boss);
    const dbgHp = parseInt(this.game.params.get('bosshp') || '0', 10);   // testing aid
    if (dbgHp > 0) this.boss.hp = dbgHp;
    this.enemies = this.enemies.filter((e) => e === this.boss || e.x > b.camX - 100);
    this.sfx('gate');
    this.camera.shake(4, 0.5);
    this.showMessage(b.name, 'DEFEAT IT TO CLAIM THE ORB', 3);
    this.audio.playMusic('boss');
    setTimeout(() => this.sfx('boss_roar'), 900);
  }

  /** Snapshot of what persists into the next stage. */
  carry() {
    return { score: this.score, lives: this.lives, hearts: this.hearts, subWeapon: this.player.subWeapon || this.subWeaponCarry };
  }

  stageClear() {
    this.phase = 'clear'; this.phaseT = 0;
    this.player.invuln = 999;
    this.audio.playMusic('clear', false);
    this.timeBonus = Math.ceil(this.timeLeft) * SCORE.timeBonus;
    this.heartBonus = this.hearts * 100;
    this.score += this.timeBonus + this.heartBonus;
    this.game.onStageClear();
  }

  updateLightning(dt) {
    if (!this.theme.outdoor) { this.flash = 0; return; }
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.nextLightning -= dt;
    if (this.nextLightning <= 0) {
      this.flash = 1;
      this.nextLightning = 9 + Math.random() * 14;
      this.thunderDelay = 0.4 + Math.random() * 0.8;
      // Double flash
      setTimeout(() => { this.flash = Math.max(this.flash, 0.7); }, 120 + Math.random() * 120);
    }
    if (this.thunderDelay >= 0) {
      this.thunderDelay -= dt;
      if (this.thunderDelay < 0) { this.sfx('thunder'); this.camera.shake(1.5, 0.3); }
    }
  }

  // -------------------------------------------------------------- draw
  draw(ctx, { hud = true } = {}) {
    const cam = this.camera;
    const camX = cam.rx, camY = cam.ry;
    const t = this.time;
    const outdoor = this.theme.outdoor;
    const roomX = this.level.rooms.length ? this.level.rooms[0].x0 * TILE : Infinity;
    const indoors = !outdoor || this.player.x > roomX + TILE;
    const flash = indoors ? this.flash * 0.35 : this.flash;

    if (outdoor) {
      this.parallax.drawSky(ctx, cam, flash);
      this.parallax.drawBack(ctx, cam, flash);
    } else {
      ctx.fillStyle = this.theme.bg || '#05040a';
      ctx.fillRect(0, 0, W, H);
    }
    this.level.drawRooms(ctx, cam, this.assets);
    this.level.drawDecor(ctx, cam, this.assets, t);
    if (this.gateClosed) {
      const b = this.data.boss;
      this.assets.draw(ctx, 'arch', 'gate', b.gateCol * TILE + 16 - camX, (b.gateRows[1] + 1) * TILE - camY);
    }
    this.level.drawTiles(ctx, cam, this.assets);
    for (const c of this.candles) if (Math.abs(c.x - camX - W / 2) < W) c.draw(ctx, this.assets, camX, camY, t);
    for (const f of this.fires) f.draw(ctx, camX, camY, t);
    for (const it of this.items) it.draw(ctx, this.assets, camX, camY, t);
    for (const e of this.enemies) if (e !== this.boss && e.x > camX - 120 && e.x < camX + W + 120) e.draw(ctx, this.assets, camX, camY);
    if (this.boss) this.boss.draw(ctx, this.assets, camX, camY);
    this.player.draw(ctx, this.assets, camX, camY);
    for (const pr of this.projectiles) pr.draw(ctx, this.assets, camX, camY);
    this.particles.draw(ctx, camX, camY);
    // Foreground branches/fence only exist outdoors: fade as the castle begins.
    if (outdoor) {
      const fgAlpha = Math.max(0, Math.min(1, (roomX - (camX + W * 0.5)) / 240)) * 0.9;
      this.parallax.drawFront(ctx, cam, fgAlpha);
    }
    if (flash > 0) { ctx.fillStyle = `rgba(230, 235, 255, ${0.14 * flash})`; ctx.fillRect(0, 0, W, H); }
    // Vignette
    ctx.fillStyle = this.vignette(ctx);
    ctx.fillRect(0, 0, W, H);
    if (hud) this.drawOverlays(ctx);
  }

  vignette(ctx) {
    if (!this._vig) {
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(5, 3, 12, 0.55)');
      this._vig = g;
    }
    return this._vig;
  }

  drawOverlays(ctx) {
    for (const m of this.messages) {
      const k = Math.min(1, m.t / 0.3, (m.dur - m.t) / 0.4);
      ctx.save();
      ctx.globalAlpha = Math.max(0, k);
      this.game.banner([m.text], 150, { scale: 3, sub: m.sub });
      ctx.restore();
    }
  }
}
