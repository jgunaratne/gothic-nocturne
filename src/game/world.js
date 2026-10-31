// World: owns the level, 3D stage renderer, player, enemies, objects, camera,
// scripting and draw order. The Game (main.js) drives it and layers menus.

import {
  W, H, TILE, T_GATE, T_BLOCK, SCORE, PLAYER,
} from '../engine/constants.js';
import { Camera } from '../engine/camera.js';
import { getFxLayers } from '../engine/fxlayers.js';
import { Particles } from '../engine/particles.js';
import { Level } from './level.js';
import { Parallax } from './parallax.js';
import { Stage3D, project3D } from './stage3d.js';
import { Player } from './player.js';
import { TurtleAlly } from './ally.js';
import { Spawner, createEnemy } from './enemies.js';
import { createBoss } from './bosses.js';
import { THEMES } from './builder.js';
import { Candle, Item, Projectile, Fire, rollDrop, rectsOverlap } from './objects.js';

/** Idle pose frame shown while a boss speaks (for sheets without a 'walk0'). */
const BOSS_POSE_FRAME = {
  giantbat: 'fly1', gorgon: 'a', greatjack: 'flame0', bonecaptain: 'walk0', treant: 'idle0',
  automaton: 'idle', archivist: 'idle', archon: 'idle', devilsanta: 'idle', count: 'idle', reaper: 'idle0', reaperlord: 'idle0',
};

export const BOSS_LINES = {
  giantbat: 'COWER BENEATH THE MOON, HUNTER... MY WINGS SHALL DRINK YOUR WARMTH!',
  treant: 'THE ANCIENT ROOTS AWAKEN, TRESPASSER... FEED YOUR BONES TO THE DARKWOOD!',
  greatjack: 'STEP INTO THE HARVEST FIRE! MY GRINNING FLAMES WILL HOLLOW YOUR BONES!',
  devilsanta: 'A NAUGHTY SOUL IN THE FROST! UNWRAP THE FROZEN GRAVE I MADE FOR YOU!',
  bonecaptain: 'HALT ON THE BATTLEMENTS! NONE BREACH THESE WALLS WHILE MY LEGION STANDS!',
  reaper: 'EVERY FOOTSTEP ECHOES CLOSER TO THE CRYPT... YIELD YOUR SOUL TO DEATH.',
  gorgon: 'LIFT YOUR EYES TO PERFECTION, INTRUDER - JOIN MY GALLERY OF STONE!',
  reaperlord: 'THE GEARS OF MIDNIGHT STRIKE YOUR FINAL HOUR! KNEEL BEFORE THE BELFRY!',
  count: 'WELCOME TO MY THRONE HALL, HUNTER. TONIGHT, DARKNESS DRINKS ITS FILL!',
  archon: 'A THOUSAND YEARS I HAVE WATCHED FROM THE RAFTERS, MORTAL. KNEEL BENEATH THE GLASS... OR BE GROUND TO DUST.',
  archivist: 'SILENCE IN THE STACKS, HUNTER... EVERY TOME HERE HUNGERS, AND YOUR STORY ENDS ON THIS PAGE.',
  automaton: 'INSERT YOUR SOUL, PLAYER. THE GALLERY DEMANDS ONE MORE GAME... THE HOUSE ALWAYS WINS.',
};

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
    this.stage3d = new Stage3D(this.assets, this.level, data.theme || 'graveyard', data);
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
    this.bossSpoken = false;
    this.voiceCue = null;
    this.ally = null;
    this.flakes = this.theme.weather === 'snow' ? makeFlakes(120, 'snow')
      : this.theme.weather === 'fireflies' ? makeFlakes(42, 'fireflies')
      : (data.theme === 'forest' ? makeFlakes(36, 'leaves') : null);
    this.spawnAll();
    if (this.audio.prefetch) this.audio.prefetch('boss');
    if (data.boss && this.audio.prefetchVoice) this.audio.prefetchVoice(data.boss.type);
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
    this.bossSpoken = false;
    this.voiceCue = null;
    this.bossIntro = null;
    this.bossHold = false;
    this.gateClosed = false;
    this.camera.resetBounds();
    this.level = new Level(d);     // restores breakable blocks & crumbling slabs
    this.stage3d = new Stage3D(this.assets, this.level, d.theme || 'graveyard', d);
    this.level.updateMechanics(0, this.time, null, null);
    for (const c of d.candles) {
      this.candles.push(new Candle(c[0] * TILE + TILE / 2, c[1] * TILE, c[2] || null));
    }
    for (const e of d.enemies) {
      const en = createEnemy(e);
      if (en) this.spawnEnemy(en);
    }
    const cx = d.checkpoints[this.checkpoint];
    const col = Math.floor(cx / TILE);
    const row = this.level.surfaceRow(col);
    this.player = new Player(cx, (row >= 0 ? row : 11) * TILE);
    this.player.facing = 1;
    this.player.subWeapon = this.subWeaponCarry;
    const hasTurtle = d.ally === 'turtle' || this.theme.ally === 'turtle';
    this.ally = hasTurtle ? new TurtleAlly(this.player.x + 28, this.player.y) : null;
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

  /** Post-FX hooks (consumed by main.js each frame). */
  onPlayerHurt(dmg) { this.fxHurt = Math.min(1, 0.45 + dmg * 0.12); }
  onBossRoar() { this.fxRoar = 0.8; }

  onPlayerDeath() {
    this.phase = 'dying'; this.phaseT = 0;
    this.sfx('die');
    this.audio.stopMusic(0.8);
  }

  onBossDefeated(boss) {
    this.bossActive = false;
    const a = (boss && boss.arena) || this.data.boss.arena;
    const minY = (a.ceilY != null ? a.ceilY : a.floorY - 220) + 48;
    const maxY = a.floorY - 48;
    const ox = Math.max(a.x0 + 48, Math.min(a.x1 - 48, boss.x));
    const oy = Math.max(minY, Math.min(maxY, boss.y - 36));
    const orb = new Item('orb', ox, oy);
    orb.arenaFloorY = a.floorY;
    orb.arenaX0 = a.x0 + 28;
    orb.arenaX1 = a.x1 - 28;
    this.items.push(orb);
    this.sfx('orb');
    this.enemies = this.enemies.filter((e) => e === boss);
    this.projectiles = this.projectiles.filter((p) => p.owner !== 'enemy');
    this.fires = [];
  }

  // ------------------------------------------------------------ update
  update(dt, input) {
    this.time += dt;
    { const fxl = getFxLayers(); if (fxl) fxl.update(dt); }
    this.phaseT += dt;
    this.parallax.update(dt);
    this.particles.update(dt);
    this.updateLightning(dt);
    this.updateWeather(dt);
    for (const m of this.messages) m.t += dt;
    this.messages = this.messages.filter((m) => m.t < m.dur);
    if (this.voiceCue) {
      this.voiceCue.t += dt;
      if (this.voiceCue.t >= this.voiceCue.dur) this.voiceCue = null;
    }

    if (this.phase === 'intro' && this.phaseT > 0.6) this.phase = 'play';
    if (this.phase === 'clear') { this.updateEntities(dt, input, false); return; }
    if (this.phase === 'dying') {
      this.level.updateMechanics(dt, this.time, null, null);
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

    if (!(this.boss && !this.boss.alive)) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0 && this.player.alive) { this.timeLeft = 0; this.player.hp = 0; this.player.die(this); }
    }
    this.updateEntities(dt, input, true);
  }

  updateEntities(dt, input, live) {
    const p = this.player;
    const lvl = this.level;

    // Advance 2.5D moving platforms, orbiting gears & crumbling slabs first,
    // carrying any grounded entities smoothly along their tracks.
    lvl.updateMechanics(dt, this.time, p, live ? this : null);
    lvl.carryEntity(p);
    if (this.ally) lvl.carryEntity(this.ally);
    for (const e of this.enemies) if (!e.flies) lvl.carryEntity(e);
    for (const it of this.items) lvl.carryEntity(it);

    if (live) p.update(dt, input, lvl, this);
    else { p.vx = 0; p.physics(lvl, dt); p.state = 'idle'; }

    // Checkpoints / boss intro sequence (gate + name banner -> voice line -> battle)
    for (let i = this.data.checkpoints.length - 1; i > this.checkpoint; i--) {
      if (p.x >= this.data.checkpoints[i]) { this.checkpoint = i; break; }
    }
    if (!this.bossActive && (!this.boss || this.boss.introPose) && live && this.data.boss && p.x >= this.data.boss.triggerX) {
      this.updateBossIntro(dt, p);
    }
    // Remember the last solid footing (for forgiving pit falls on Easy).
    if (p.onGround && p.alive && !p.riding) {
      const tx = Math.floor(p.x / TILE), ty = Math.floor((p.y + 1) / TILE);
      if (lvl.isSolid(tx, ty) && lvl.isSolid(tx - 1, ty) && lvl.isSolid(tx + 1, ty)) this.lastSafe = { x: p.x, y: p.y };
    }
    if (p.y > lvl.height + 80 && p.alive) {
      if (this.difficulty.pitForgiving && this.lastSafe) {
        p.x = this.lastSafe.x; p.y = this.lastSafe.y; p.vx = 0; p.vy = 0;
        p.invuln = 0; p.hurt(4, p.x + 1, this);
        p.vx = 0; p.vy = -120;
        this.camera.snapTo(p.x, p.y);
        this.particles.dust(p.x, p.y, 10);
      } else { p.hp = 0; p.die(this); }
    }

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
    if (this.ally) {
      if (live) this.ally.update(dt, lvl, this);
      else { this.ally.vx = 0; this.ally.physics(lvl, dt); }
    }

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
      const whipDmg = Math.round(PLAYER.whipDamage * (this.difficulty.playerDamage || 1));
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const died = rectsOverlap(whip, e.box()) || (e === this.boss && rectsOverlap(whip, e.box(10)));
        if (died) { e.takeHit(whipDmg, p.x, this); hitSomething = true; this.camera.shake(1.5, 0.08); }
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
          e.takeHit(Math.round(pr.damage * (this.difficulty.playerDamage || 1)), pr.x, this);
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
        const connected = p.hurt(pr.damage, pr.x, this);
        if (connected && pr.petrify) p.petrify(this);
        if (connected && !['sickle', 'skull', 'gas', 'gaze', 'hellfire'].includes(pr.type)) pr.dead = true;
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
  /** Frames the boss arena: lock X to the arena and Y so floor sits near the bottom with the ceiling in view. */
  frameArena(b) {
    this.camera.setBounds(b.camX, b.camX);
    const want = Math.max(0, Math.min(this.level.height - H, b.arena.floorY + 46 - H));
    this.camera.setBoundsY(want, want);
  }

  /** True while the boss approach voice line (and its subtitle) is still playing. */
  voiceSpeaking() {
    return !!(this.voiceCue && this.voiceCue.boss && this.voiceCue.t < this.voiceCue.dur);
  }

  /**
   * Boss intro, in order: (1) gate slams and the boss NAME banner appears,
   * (2) once the banner has been read the boss speaks its Daikon line with a
   * subtitle, (3) when the line ends the boss enters and the battle begins.
   * The hunter is held at the arena threshold throughout.
   */
  updateBossIntro(dt, p) {
    const b = this.data.boss;
    this.bossHold = true;
    if (p.x > b.triggerX) { p.x = b.triggerX; if (p.vx > 0) p.vx = 0; }
    if (!this.bossIntro) {
      this.bossIntro = { t: 0, stage: 'banner' };
      this.gateClosed = true;
      for (let r = b.gateRows[0]; r <= b.gateRows[1]; r++) this.level.set(b.gateCol, r, T_GATE);
      this.frameArena(b);
      this.enemies = this.enemies.filter((e) => e.x > b.camX - 100);
      this.sfx('gate');
      this.camera.shake(4, 0.5);
      this.audio.stopMusic(0.8);
      this.showMessage(b.name, 'DEFEAT IT TO CLAIM THE ORB', 3.2);
      // The boss materialises on its dais now, so it is on screen while it speaks.
      this.boss = createBoss(b.type || 'reaper', b.spawn.x, b.spawn.y, b.arena, this.difficulty);
      this.boss.alpha = 0;
      this.boss.introPose = true;
      this.boss.poseY = this.boss.y;
      if (!this.assets.frame(this.boss.sheet, this.boss.frame)) this.boss.frame = BOSS_POSE_FRAME[b.type] || this.boss.frame;
      return;
    }
    const intro = this.bossIntro;
    intro.t += dt;
    // Posed boss: fade in, breathe, never acts or takes hits until the battle starts.
    if (this.boss && this.boss.introPose) {
      const bs = this.boss;
      bs.alpha = Math.min(1, bs.alpha + dt / 1.1);
      bs.t += dt; bs.flash = 0;
      if (bs.flies) bs.y = bs.poseY + Math.sin(bs.t * 2.2) * 6;
      else { bs.vx = 0; bs.physics(this.level, dt); }
      bs.facing = p.x > bs.x ? 1 : -1;
      if (intro.stage === 'voice' && Math.floor(bs.t * 6) % 2 === 0) {
        // Faint talking shimmer while the line plays
        if (Math.random() < 0.25) this.particles.sparks(bs.x + (Math.random() - 0.5) * bs.w, bs.y - bs.h * 0.8, 1, '#ffd27a');
      }
    }
    if (intro.stage === 'banner' && intro.t >= 1.6) {
      // Banner has been on screen long enough to read: the boss speaks.
      intro.stage = 'voice';
      this.triggerBossVoice();
    } else if (intro.stage === 'voice' && !this.voiceSpeaking()) {
      intro.stage = 'done';
      this.bossHold = false;
      this.startBoss();
    }
  }

  triggerBossVoice() {
    const b = this.data.boss;
    if (!b || this.bossSpoken) return;
    this.bossSpoken = true;
    const key = b.type || 'reaper';
    const cue = {
      speaker: b.name || 'BOSS',
      text: BOSS_LINES[key] || 'NONE SHALL PASS BEYOND THIS THRESHOLD!',
      t: 0,
      dur: 8.5,
      boss: true,
    };
    this.voiceCue = cue;
    if (this.audio && this.audio.playVoice) {
      this.audio.playVoice(key, (dur) => {
        if (this.voiceCue === cue && dur > 1) cue.dur = Math.max(cue.t + 1.2, dur + 0.35);
      });
    }
  }

  startBoss() {
    const b = this.data.boss;
    const hadIntro = !!this.bossIntro;
    this.bossHold = false;
    this.bossActive = true;
    this.gateClosed = true;
    for (let r = b.gateRows[0]; r <= b.gateRows[1]; r++) this.level.set(b.gateCol, r, T_GATE);
    this.frameArena(b);
    if (this.boss && this.boss.introPose) {
      // Wake the posed boss: skip straight past its entrance fade (already visible).
      this.boss.introPose = false;
      this.boss.alpha = 1;
      this.boss.state = 'enter'; this.boss.stateT = 99; this.boss.fired = false;
    } else {
      this.boss = createBoss(b.type || 'reaper', b.spawn.x, b.spawn.y, b.arena, this.difficulty);
    }
    this.spawnEnemy(this.boss);
    const dbgHp = parseInt(this.game.params.get('bosshp') || '0', 10);
    if (dbgHp > 0) this.boss.hp = dbgHp;
    this.enemies = this.enemies.filter((e) => e === this.boss || e.x > b.camX - 100);
    if (!hadIntro) {
      // Direct start (tests / debug): still announce the boss.
      this.sfx('gate');
      this.camera.shake(4, 0.5);
      this.showMessage(b.name, 'DEFEAT IT TO CLAIM THE ORB', 3);
      this.bossSpoken = true;
    }
    this.audio.playMusic('boss');
    setTimeout(() => { this.sfx('boss_roar'); this.onBossRoar(); }, 900);
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

  updateWeather(dt) {
    // Indoors: slow dust motes drifting through the light give the air depth.
    if (!this.theme.outdoor && Math.random() < 0.5) {
      this.particles.emit({
        x: this.camera.x + Math.random() * W, y: this.camera.y + Math.random() * H,
        vx: (Math.random() - 0.5) * 8, vy: 3 + Math.random() * 5, life: 2.5 + Math.random() * 2,
        color: 'rgba(210, 200, 170, 0.22)', size: 1, gravity: 0, fade: true,
      });
    }
    if (!this.flakes) return;
    const camDx = this.camera.x - (this._lastCamX == null ? this.camera.x : this._lastCamX);
    this._lastCamX = this.camera.x;
    for (const f of this.flakes) {
      if (f.kind === 'fireflies') {
        f.y += (f.vy + Math.cos(this.time * 1.9 + f.phase) * 14) * dt;
        f.x += (f.vx + Math.sin(this.time * 1.5 + f.phase) * 18) * dt - camDx * f.depth;
        if (f.y < -8) f.y = H + 6;
        else if (f.y > H + 8) f.y = -6;
      } else {
        f.y += f.vy * dt;
        f.x += (f.vx + Math.sin(this.time * 1.4 + f.phase) * 16) * dt - camDx * f.depth;
        if (f.y > H + 6) { f.y = -6; f.x = Math.random() * W; }
      }
      if (f.x < -8) f.x += W + 16; else if (f.x > W + 8) f.x -= W + 16;
    }
  }

  drawWeather(ctx, nearOnly = false) {
    if (!this.flakes) return;
    ctx.save();
    for (const f of this.flakes) {
      if (nearOnly !== f.near) continue;
      const rx = Math.round(f.x), ry = Math.round(f.y);
      if (f.kind === 'fireflies') {
        const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(this.time * 4.2 + f.phase));
        ctx.globalAlpha = f.alpha * pulse;
        ctx.fillStyle = f.color;
        ctx.fillRect(rx - 1, ry - 1, f.size + 2, f.size + 2);
        ctx.fillStyle = '#eafff5';
        ctx.fillRect(rx, ry, Math.max(1, f.size), Math.max(1, f.size));
      } else if (f.kind === 'leaves') {
        ctx.globalAlpha = f.alpha;
        ctx.fillStyle = f.color;
        const w = Math.max(1, Math.round(f.size * (0.5 + 0.5 * Math.abs(Math.cos(this.time * 3 + f.phase)))));
        ctx.fillRect(rx, ry, w + 1, f.size);
      } else {
        ctx.globalAlpha = f.alpha;
        ctx.fillStyle = f.color;
        ctx.fillRect(rx, ry, f.size, f.size);
      }
    }
    ctx.restore();
  }

  updateLightning(dt) {
    if (!this.theme.outdoor) { this.flash = 0; return; }
    this.flash = Math.max(0, this.flash - dt * 2.2);
    this.nextLightning -= dt;
    if (this.nextLightning <= 0) {
      this.flash = 1;
      this.nextLightning = 9 + Math.random() * 14;
      this.thunderDelay = 0.4 + Math.random() * 0.8;
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

    // 1. Far sky, 2D parallax layers & 3D vistas / subterranean abysses
    // Skip outdoor sky/vista overdraw once camera has crossed inside an opaque castle hall!
    const showOutdoor = outdoor && (roomX === Infinity || project3D(roomX - 18, 144, 40, camX, camY).x > 0);
    if (showOutdoor) {
      this.parallax.drawSky(ctx, cam, flash);
      this.parallax.drawBack(ctx, cam, flash);
      this.stage3d.drawOutdoor3D(ctx, cam, t, flash);
      this.parallax.drawAtmosphere(ctx, cam);
    } else if (!outdoor) {
      ctx.fillStyle = this.theme.bg || '#05040a';
      ctx.fillRect(0, 0, W, H);
      this.stage3d.drawAbyss3D(ctx, cam, t);
    } else {
      ctx.fillStyle = '#06050c';
      ctx.fillRect(0, 0, W, H);
    }

    // 2. 3D Vaulted Interior Halls / Cylindrical Clock Shaft + 3D Boss Set-Pieces
    this.stage3d.drawInterior3D(ctx, cam, t);
    this.stage3d.drawBossCenterpiece3D(ctx, cam, t);

    // 3. Far/mid weather particles + stage decor (with extruded 3D cogwheels)
    this.drawWeather(ctx, false);
    this.level.drawDecor(ctx, cam, this.assets, t, this.stage3d);

    // 4. Boss gate + 2.5D extruded terrain, viaduct arches, crumble slabs & moving lifts
    if (this.gateClosed) {
      const b = this.data.boss;
      this.assets.draw(ctx, 'arch', 'gate', b.gateCol * TILE + 16 - camX, (b.gateRows[1] + 1) * TILE - camY);
    }
    this.level.drawTiles(ctx, cam, this.assets, t, this.stage3d);

    // 5. 3D Contact shadows grounding 2D sprites onto walkable decks
    this.level.drawContactShadows(ctx, cam, this.player, this.enemies, this.candles, this.ally);

    // 6. Crisp z = 0 sprite gameplay layer
    for (const c of this.candles) if (Math.abs(c.x - camX - W / 2) < W) c.draw(ctx, this.assets, camX, camY, t);
    for (const f of this.fires) f.draw(ctx, camX, camY, t);
    for (const it of this.items) it.draw(ctx, this.assets, camX, camY, t);
    for (const e of this.enemies) if (e !== this.boss && e.x > camX - 120 && e.x < camX + W + 120) e.draw(ctx, this.assets, camX, camY);
    if (this.boss) this.boss.draw(ctx, this.assets, camX, camY);
    if (this.ally) this.ally.draw(ctx, this.assets, camX, camY, t);
    this.player.draw(ctx, this.assets, camX, camY);
    for (const pr of this.projectiles) pr.draw(ctx, this.assets, camX, camY);
    const fxl = getFxLayers();
    if (fxl) fxl.flushFlames(ctx);
    this.particles.draw(ctx, camX, camY);

    // 7. Foreground z < 0 framing silhouettes (auto-fading near player/threats) & near weather
    if (showOutdoor) {
      const fgAlpha = Math.max(0, Math.min(1, (roomX - (camX + W * 0.5)) / 240)) * 0.85;
      this.parallax.drawFront(ctx, cam, fgAlpha);
    }
    this.stage3d.drawForeground3D(ctx, cam, this.player, this.enemies);
    // Shader ground mist hugging the hunter's footing (thicker outdoors and in the crypts)
    if (fxl) {
      const fogCol = outdoor ? (this.data.theme === 'darkwood' ? [0.4, 0.75, 0.68] : [0.62, 0.66, 0.82]) : [0.5, 0.48, 0.6];
      const amt = outdoor ? 0.42 : (this.data.theme === 'catacombs' || this.data.theme === 'ossuary' ? 0.34 : 0.16);
      fxl.fog(ctx, camX, Math.round(this.player.y - camY) + 6, fogCol, amt);
    }
    this.drawWeather(ctx, true);

    if (flash > 0) { ctx.fillStyle = `rgba(230, 235, 255, ${0.14 * flash})`; ctx.fillRect(0, 0, W, H); }
    this.drawVignette(ctx);
    if (hud) this.drawOverlays(ctx);
  }

  drawVignette(ctx) {
    if (!World._vigCanvas && typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const gctx = c.getContext('2d');
      const g = gctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 0.95);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(5, 3, 12, 0.55)');
      gctx.fillStyle = g;
      gctx.fillRect(0, 0, W, H);
      World._vigCanvas = c;
    }
    if (World._vigCanvas) ctx.drawImage(World._vigCanvas, 0, 0);
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

/** Multi-depth snowflakes or autumn leaves spanning background to near-camera plane. */
function makeFlakes(n, kind = 'snow') {
  const out = [];
  const leafCols = ['#d96b27', '#b8431e', '#e89b3c', '#8c2f24'];
  const flyCols = ['#62f2c2', '#8affd8', '#ffd97d', '#4ae0b0'];
  for (let i = 0; i < n; i++) {
    const r = Math.random();
    const near = r > 0.82;
    const depth = near ? 1.28 : (0.22 + r * 0.72);
    const isFly = kind === 'fireflies';
    out.push({
      kind,
      near,
      x: Math.random() * W,
      y: Math.random() * H,
      vx: isFly ? ((Math.random() - 0.5) * 14) : (kind === 'leaves' ? (-16 - depth * 18) : (-10 - depth * 22)),
      vy: isFly ? (-6 - Math.random() * 10) : (kind === 'leaves' ? (22 + depth * 26) : (26 + depth * 52)),
      size: near ? (isFly ? 2 : 3) : (r > 0.48 ? 2 : 1),
      depth,
      alpha: isFly ? 0.88 : (near ? 0.55 : (0.35 + r * 0.45)),
      color: isFly ? flyCols[i % flyCols.length] : (kind === 'leaves' ? leafCols[i % leafCols.length] : '#eef6ff'),
      phase: Math.random() * 6.28,
    });
  }
  return out;
}
