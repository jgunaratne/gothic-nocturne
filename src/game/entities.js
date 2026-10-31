// Entity base class with tile collision (axis-separated AABB sweep).

import { TILE, GRAVITY, MAX_FALL } from '../engine/constants.js';

export class Entity {
  constructor(x, y) {
    this.x = x; this.y = y;          // anchor: bottom-centre (feet)
    this.vx = 0; this.vy = 0;
    this.w = 20; this.h = 56;        // collision box (centred on x, above y)
    this.facing = 1;
    this.onGround = false;
    this.riding = null;              // MovingPlatform currently supporting feet
    this.hitWall = false;
    this.dead = false;
    this.gravityScale = 1;
    this.dropThrough = false;
    this.dropFromY = null;           // y of one-way ledge being dropped through
    this.hp = 1;
    this.flash = 0;                  // hit flash timer
    this.time = 0;
  }

  get left() { return this.x - this.w / 2; }
  get right() { return this.x + this.w / 2; }
  get top() { return this.y - this.h; }
  get bottom() { return this.y; }

  box(pad = 0) { return { x: this.left - pad, y: this.top - pad, w: this.w + pad * 2, h: this.h + pad * 2 }; }

  overlaps(o) {
    return this.left < o.right && this.right > o.left && this.top < o.bottom && this.bottom > o.top;
  }

  /** Integrates gravity and resolves collisions against the level grid. */
  physics(level, dt, { collide = true, oneWay = true } = {}) {
    this.time += dt;
    this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * this.gravityScale * dt);
    this.hitWall = false;
    if (!collide) { this.riding = null; this.x += this.vx * dt; this.y += this.vy * dt; return; }
    const wasRiding = this.riding;
    this.moveX(level, this.vx * dt);
    this.onGround = false;
    this.riding = null;
    this.moveY(level, this.vy * dt, oneWay, wasRiding);
  }

  moveX(level, dx) {
    if (dx === 0) return;
    this.x += dx;
    const ty0 = Math.floor(this.top / TILE), ty1 = Math.floor((this.bottom - 0.01) / TILE);
    if (dx > 0) {
      const tx = Math.floor((this.right - 0.01) / TILE);
      for (let ty = ty0; ty <= ty1; ty++) {
        if (level.isSolid(tx, ty)) { this.x = tx * TILE - this.w / 2; this.vx = 0; this.hitWall = true; return; }
      }
    } else {
      const tx = Math.floor(this.left / TILE);
      for (let ty = ty0; ty <= ty1; ty++) {
        if (level.isSolid(tx, ty)) { this.x = (tx + 1) * TILE + this.w / 2; this.vx = 0; this.hitWall = true; return; }
      }
    }
  }

  moveY(level, dy, oneWay = true, wasRiding = null) {
    if (dy === 0) {
      // Resting check so onGround stays true while standing still (including rising movers).
      this.onGround = this.groundBelow(level, oneWay);
      if (this.riding) this.y = this.riding.y;
      return;
    }
    const prevBottom = this.bottom;
    this.y += dy;
    const tx0 = Math.floor(this.left / TILE), tx1 = Math.floor((this.right - 0.01) / TILE);

    // Check moving platforms:
    // - If `wasRiding === m`, `carryEntity` already applied `m.dy` to `prevBottom`, so `dy` is already relative to `m`.
    // - Otherwise, compare world-space `dy` against `m.dy` so rising lifts catch near jump apex (`dy <= 0`).
    if (oneWay && level.movers && level.movers.length) {
      let bestM = null;
      for (const m of level.movers) {
        if (this.dropThrough && (this.dropFromY == null || Math.abs(m.y - this.dropFromY) <= 12)) continue;
        if (this.right <= m.left || this.left >= m.right) continue;
        if (wasRiding === m) {
          if (dy >= -0.5 && Math.abs(prevBottom - m.y) <= 3) {
            if (!bestM || m.y < bestM.y) bestM = m;
          }
          continue;
        }
        if (dy >= m.dy - 0.5) {
          const topSweep = Math.max(m.prevY, m.y) + 9;
          const botCatch = m.y - Math.max(1.5, m.dy + 1.2);
          if (prevBottom <= topSweep && this.bottom >= botCatch) {
            if (!bestM || m.y < bestM.y) bestM = m;
          }
        }
      }
      if (bestM) {
        this.y = bestM.y;
        this.vy = 0;
        this.onGround = true;
        this.riding = bestM;
        return;
      }
    }

    if (dy > 0) {
      const ty = Math.floor((this.bottom - 0.01) / TILE);
      for (let tx = tx0; tx <= tx1; tx++) {
        const solid = level.isSolid(tx, ty);
        const dropSkip = this.dropThrough && (this.dropFromY == null || Math.abs(ty * TILE - this.dropFromY) <= 12);
        const plat = oneWay && !dropSkip && level.isOneWay(tx, ty) && prevBottom <= ty * TILE + 0.5;
        if (solid || plat) { this.y = ty * TILE; this.vy = 0; this.onGround = true; return; }
      }
    } else {
      const ty = Math.floor(this.top / TILE);
      for (let tx = tx0; tx <= tx1; tx++) {
        if (level.isSolid(tx, ty)) { this.y = (ty + 1) * TILE + this.h; this.vy = 0; return; }
      }
    }
  }

  groundBelow(level, oneWay = true) {
    if (oneWay && level.movers) {
      for (const m of level.movers) {
        if (this.dropThrough && (this.dropFromY == null || Math.abs(m.y - this.dropFromY) <= 12)) continue;
        const tol = Math.max(2.0, Math.abs(m.dy) + 1.5);
        if (this.right > m.left && this.left < m.right && Math.abs(this.bottom - m.y) <= tol) {
          this.riding = m;
          return true;
        }
      }
    }
    const ty = Math.floor((this.bottom + 0.5) / TILE);
    if (Math.abs(this.bottom - ty * TILE) > 0.6) return false;
    const tx0 = Math.floor(this.left / TILE), tx1 = Math.floor((this.right - 0.01) / TILE);
    for (let tx = tx0; tx <= tx1; tx++) {
      if (level.isSolid(tx, ty) || (oneWay && !this.dropThrough && level.isOneWay(tx, ty))) return true;
    }
    return false;
  }

  /** True when there is no floor ahead (ledge) or a wall ahead. */
  blockedAhead(level) {
    const aheadX = this.x + this.facing * (this.w / 2 + 2);
    const tx = Math.floor(aheadX / TILE);
    const tyFeet = Math.floor((this.bottom + 2) / TILE);
    const tyBody = Math.floor((this.bottom - this.h / 2) / TILE);
    if (level.isSolid(tx, tyBody)) return true;
    return !level.isStandable(tx, tyFeet);
  }
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
