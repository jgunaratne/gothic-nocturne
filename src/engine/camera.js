// Camera with horizontal look-ahead dead zone, vertical easing, clamping,
// and screen shake.

import { W, H } from './constants.js';

export class Camera {
  constructor(levelW, levelH) {
    this.x = 0; this.y = 0;
    this.levelW = levelW; this.levelH = levelH;
    this.minX = 0; this.maxX = Math.max(0, levelW - W);
    this.shakeT = 0; this.shakeMag = 0;
    this.sx = 0; this.sy = 0;   // shake offsets applied this frame
    this.lookAhead = 0;
    this.pan = null;            // {fromX, fromY, t, dur} smooth bounds transition
  }

  setBounds(minX, maxX) { this.minX = minX; this.maxX = Math.max(minX, maxX); }
  /** Locks the vertical scroll (boss arenas: keep the whole arena + ceiling in frame). */
  setBoundsY(minY, maxY) { this.minY = minY; this.maxY = Math.max(minY, maxY); }
  resetBounds() {
    this.minX = 0;
    this.maxX = Math.max(0, this.levelW - W);
    this.minY = null;
    this.maxY = null;
    this.pan = null;
  }
  get yMin() { return this.minY == null ? 0 : this.minY; }
  get yMax() { return this.maxY == null ? Math.max(0, this.levelH - H) : this.maxY; }

  /**
   * Smoothly glides the camera from its current `(x, y)` into newly locked bounds
   * (e.g. entering a boss sanctum) instead of hard-clamping in a single frame.
   */
  panToBounds(minX, maxX, minY = null, maxY = null, dur = 0.88) {
    const fromX = this.x;
    const fromY = this.y;
    this.setBounds(minX, maxX);
    if (minY != null) this.setBoundsY(minY, maxY == null ? minY : maxY);
    const toX = clamp(fromX, this.minX, this.maxX);
    const toY = clamp(fromY, this.yMin, this.yMax);
    if (dur <= 0 || (Math.abs(toX - fromX) < 1 && Math.abs(toY - fromY) < 1)) {
      this.x = toX;
      this.y = toY;
      this.pan = null;
      return;
    }
    this.pan = { fromX, fromY, t: 0, dur };
  }

  snapTo(x, y) {
    this.pan = null;
    this.x = clamp(x - W * 0.42, this.minX, this.maxX);
    this.y = clamp(y - H * 0.62, this.yMin, this.yMax);
  }

  shake(mag = 4, t = 0.25) { this.shakeMag = Math.max(this.shakeMag, mag); this.shakeT = Math.max(this.shakeT, t); }

  update(dt, target, facing) {
    const desiredLook = facing * 70;
    this.lookAhead += (desiredLook - this.lookAhead) * Math.min(1, dt * 2.2);
    if (this.pan) {
      this.pan.t += dt;
      const u = Math.min(1, this.pan.t / this.pan.dur);
      const ease = u * u * (3 - 2 * u);
      const goalX = clamp(target.x + this.lookAhead - W / 2, this.minX, this.maxX);
      const goalY = clamp(target.y - H * 0.62, this.yMin, this.yMax);
      this.x = lerp(this.pan.fromX, goalX, ease);
      this.y = lerp(this.pan.fromY, goalY, ease);
      if (u >= 1) this.pan = null;
    } else {
      // Horizontal: ease toward a look-ahead point in front of the player.
      const tx = target.x + this.lookAhead - W / 2;
      this.x += (tx - this.x) * Math.min(1, dt * 6);
      this.x = clamp(this.x, this.minX, this.maxX);
      // Vertical: keep feet around 62% of the screen, eased.
      const ty = target.y - H * 0.62;
      this.y += (ty - this.y) * Math.min(1, dt * 4);
      this.y = clamp(this.y, this.yMin, this.yMax);
    }
    // Shake
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = this.shakeMag * Math.max(0, this.shakeT) * 4;
      this.sx = (Math.random() - 0.5) * 2 * k;
      this.sy = (Math.random() - 0.5) * 2 * k;
      if (this.shakeT <= 0) { this.shakeMag = 0; this.sx = this.sy = 0; }
    }
  }

  /** Integer render offsets (pixel-perfect). */
  get rx() { return Math.round(this.x + this.sx); }
  get ry() { return Math.round(this.y + this.sy); }
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
