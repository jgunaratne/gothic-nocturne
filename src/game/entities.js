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
    this.onStair = null;             // Active inclined staircase (`level.stairs[i]`)
    this.wantStairCatch = false;     // True when holding Up to catch pass-through stairs mid-air
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

  /** Integrates gravity and resolves collisions against the level grid & walkable stairs. */
  physics(level, dt, { collide = true, oneWay = true } = {}) {
    this.time += dt;
    this.hitWall = false;
    if (!collide) {
      this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * this.gravityScale * dt);
      this.riding = null;
      this.onStair = null;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      return;
    }

    const prevX = this.x;
    const prevY = this.y;
    const wasGround = this.onGround;

    // 1. Smooth diagonal traversal while latched onto `this.onStair`
    if (this.onStair && this.vy >= 0 && !this.dropThrough) {
      const s = this.onStair;
      this.riding = null;
      this.moveXOnStair(level, this.vx * dt, s);

      if ((s.ascDir > 0 && this.x >= s.topX) || (s.ascDir < 0 && this.x <= s.topX)) {
        this.y = s.topY;
        this.vy = 0;
        this.onGround = true;
        this.onStair = null;
        return;
      }
      if ((s.ascDir > 0 && this.x <= s.botX) || (s.ascDir < 0 && this.x >= s.botX)) {
        this.y = s.botY;
        this.vy = 0;
        this.onGround = true;
        this.onStair = null;
        return;
      }

      const targetY = level.stairY(s, this.x);
      const maxClimbStep = Math.max(380, Math.abs(this.vx) * (s.slope || 1) + 180) * dt;
      const nextY = (prevY - targetY > 5) ? Math.max(targetY, prevY - maxClimbStep) : targetY;
      if (nextY < prevY) {
        const tyHead = Math.floor((nextY - this.h) / TILE);
        const tx0 = Math.floor(this.left / TILE), tx1 = Math.floor((this.right - 0.01) / TILE);
        for (let tx = tx0; tx <= tx1; tx++) {
          if (level.isSolid(tx, tyHead)) {
            this.x = prevX;
            this.vx = 0;
            this.y = Math.max(targetY, prevY);
            this.vy = 0;
            this.onGround = true;
            return;
          }
        }
      }
      this.y = nextY;
      this.vy = 0;
      this.onGround = true;
      return;
    }

    if (this.vy < 0 || this.dropThrough) this.onStair = null;

    // 2. Grounded auto-entry onto solid (`!passThrough`) stairs from either landing
    if (wasGround && !this.riding && !this.dropThrough && this.vy >= 0 && this.vx !== 0 && level.stairs && level.stairs.length) {
      const probeX = this.x + this.vx * dt;
      for (let i = 0; i < level.stairs.length; i++) {
        const s = level.stairs[i];
        if (s.passThrough) continue;
        const inSpan = probeX > s.minX && probeX < s.maxX;
        const crossed = (prevX <= s.minX && probeX > s.minX) || (prevX >= s.maxX && probeX < s.maxX) || inSpan;
        if (!crossed) continue;
        if (Math.abs(prevY - level.stairY(s, prevX)) <= 12) {
          this.onStair = s;
          this.moveXOnStair(level, this.vx * dt, s);
          if ((s.ascDir > 0 && this.x >= s.topX) || (s.ascDir < 0 && this.x <= s.topX)) {
            this.y = s.topY;
            this.onStair = null;
          } else if ((s.ascDir > 0 && this.x <= s.botX) || (s.ascDir < 0 && this.x >= s.botX)) {
            this.y = s.botY;
            this.onStair = null;
          } else {
            this.y = level.stairY(s, this.x);
          }
          this.vy = 0;
          this.onGround = true;
          return;
        }
      }
    }

    this.vy = Math.min(MAX_FALL, this.vy + GRAVITY * this.gravityScale * dt);
    const wasRiding = this.riding;
    this.moveX(level, this.vx * dt);
    this.onGround = false;
    this.riding = null;
    this.moveY(level, this.vy * dt, oneWay, wasRiding, prevX);
  }

  /** Horizontal sweep while on `stair`, clearing the top landing's floor lip under the uphill foot. */
  moveXOnStair(level, dx, stair) {
    if (dx === 0) return;
    this.x += dx;
    const stairBottom = Math.min(this.bottom, level.stairY(stair, this.x));
    const lipClear = Math.ceil((this.w * 0.65 + Math.abs(dx)) * stair.slope) + 10;
    const ty0 = Math.floor((stairBottom - this.h) / TILE), ty1 = Math.floor((stairBottom - 0.01) / TILE);
    if (dx > 0) {
      const tx = Math.floor((this.right - 0.01) / TILE);
      for (let ty = ty0; ty <= ty1; ty++) {
        if (ty * TILE >= stair.topY && ty * TILE >= stairBottom - lipClear) continue;
        if (level.isSolid(tx, ty)) { this.x = tx * TILE - this.w / 2; this.vx = 0; this.hitWall = true; return; }
      }
    } else {
      const tx = Math.floor(this.left / TILE);
      for (let ty = ty0; ty <= ty1; ty++) {
        if (ty * TILE >= stair.topY && ty * TILE >= stairBottom - lipClear) continue;
        if (level.isSolid(tx, ty)) { this.x = (tx + 1) * TILE + this.w / 2; this.vx = 0; this.hitWall = true; return; }
      }
    }
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

  moveY(level, dy, oneWay = true, wasRiding = null, prevX = this.x) {
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
      // Catch solid staircases (or Up-engaged pass-through staircases) cleanly during descent
      if (level.stairs && level.stairs.length) {
        let bestS = null;
        let bestSy = Infinity;
        for (let i = 0; i < level.stairs.length; i++) {
          const s = level.stairs[i];
          if (s.passThrough && !(oneWay && this.wantStairCatch && !this.dropThrough)) continue;
          if (this.x <= s.minX || this.x >= s.maxX) continue;
          const sy = level.stairY(s, this.x);
          const syPrev = level.stairY(s, prevX);
          if (prevBottom <= Math.max(sy, syPrev) + 6 && this.bottom >= sy - 1 && sy < bestSy) {
            bestSy = sy;
            bestS = s;
          }
        }
        if (bestS) {
          this.y = bestSy;
          this.vy = 0;
          this.onGround = true;
          this.onStair = bestS;
          return;
        }
      }

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
        if (level.isSolid(tx, ty)) {
          const pushedY = (ty + 1) * TILE + this.h;
          const floorTy = Math.floor((pushedY - 0.01) / TILE);
          let hitsFloor = false;
          for (let ftx = tx0; ftx <= tx1; ftx++) {
            if (level.isSolid(ftx, floorTy)) { hitsFloor = true; break; }
          }
          this.y = hitsFloor ? Math.min(pushedY, floorTy * TILE) : pushedY;
          this.vy = 0;
          return;
        }
      }
    }
  }

  /** Nudges `x` out of one-sided horizontal wall overlap so low-ceiling transitions never pin inside a tile. */
  depenetrateX(level) {
    if (!level) return;
    const ty0 = Math.floor(this.top / TILE), ty1 = Math.floor((this.bottom - 0.01) / TILE);
    const tx0 = Math.floor(this.left / TILE), tx1 = Math.floor((this.right - 0.01) / TILE);
    if (tx0 === tx1) return;
    let leftSolid = false, rightSolid = false;
    for (let ty = ty0; ty <= ty1; ty++) {
      if (level.isSolid(tx0, ty)) leftSolid = true;
      if (level.isSolid(tx1, ty)) rightSolid = true;
    }
    if (leftSolid && !rightSolid) {
      this.x = (tx0 + 1) * TILE + this.w / 2;
    } else if (rightSolid && !leftSolid) {
      this.x = tx1 * TILE - this.w / 2;
    }
  }

  groundBelow(level, oneWay = true) {
    if (this.onStair && !this.dropThrough) return true;
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
    if (level.solidStairNear) {
      const st = level.solidStairNear(this.x, this.bottom, 2.0);
      if (st && this.x > st.minX && this.x < st.maxX) {
        this.onStair = st;
        return true;
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
    const tyBody = Math.floor((this.bottom - this.h / 2) / TILE);
    const activeStair = this.onStair || (level.solidStairNear && level.solidStairNear(aheadX, this.bottom, 18));
    if (activeStair) {
      if (level.isSolid(tx, tyBody) && tyBody * TILE < activeStair.topY) return true;
      if (aheadX > activeStair.minX && aheadX < activeStair.maxX) return false;
      const landRow = Math.round(level.stairY(activeStair, aheadX) / TILE);
      return !level.isStandable(tx, landRow);
    }
    const tyFeet = Math.floor((this.bottom + 2) / TILE);
    if (level.isSolid(tx, tyBody)) return true;
    return !level.isStandable(tx, tyFeet);
  }
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
