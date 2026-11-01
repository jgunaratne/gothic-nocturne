// Generic animation-clip layer for enemies, bosses and the ally.
//
// Every sprite keeps its original state machine and names a legacy frame
// ('walk2', 'fly0', 'windup', ...). At draw time, if a generated clip sheet
// `<sheet>_<family>` exists (tools/animate_sprites.py, `clip` entries in the
// manifest), the legacy frame is swapped for a clip frame: loops advance on the
// world clock (or on distance travelled for walkers, so feet never slide) and
// one-shots play from the moment their family first appears, then hold the
// last frame. Gameplay timing never changes, and any sheet without a clip
// draws exactly as before.

/**
 * Legacy frame name -> clip family, when stripping the trailing digits is not
 * enough. A function receives the entity (the Brass Automaton alternates
 * 'idle' / 'walk' as its two stride poses; while it moves both mean "walking").
 */
const FAMILY_ALIASES = {
  medusa: { a: 'wave', b: 'wave' },
  gorgon: { a: 'idle', b: 'idle' },
  vampire: { lunge0: 'lunge', lunge1: 'lunge' },
  pumpkin: { flame0: 'flame', flame1: 'flame' },      // hop0 / hop1 are poses, not a cycle
  greatjack: { flame0: 'flame', flame1: 'flame' },
  ice: { golem0: 'golem', golem1: 'golem' },
  automaton: { idle: (e) => (Math.abs(e.vx || 0) > 1 ? 'walk' : 'idle'), walk: 'walk' },
};

/** Loop playback: px per frame for distance-driven walkers, fps for the rest. */
const LOOP_DEFAULTS = {
  walk: { px: 8 }, walkb: { px: 8 }, prowl: { px: 7 }, crawl: { px: 6 },
  fly: { fps: 12 }, flap: { fps: 10 }, float: { fps: 7 }, wave: { fps: 7 }, idle: { fps: 6 },
  flame: { fps: 10 }, wisp: { fps: 9 }, golem: { fps: 6 }, snowman: { fps: 6 }, shell: { fps: 12 },
};
const LOOP_MIN_FPS = 6;
const ONESHOT_FPS = 12;

let clock = 0;                   // world time, advanced only while entities update
const familyCache = new Map();   // "sheet|frame" -> family
const clipCache = new Map();     // "sheet_family" -> {sheet, frames[], loop, px, fps} | null

/** Called by the world each simulated tick (frozen during hit-stop and death). */
export function setClipClock(t) { clock = t; }

/** Forget cached lookups (Castle Forge registers sheets at runtime). */
export function resetClipCache() { familyCache.clear(); clipCache.clear(); }

function familyOf(sheet, frame, entity) {
  const alias = FAMILY_ALIASES[sheet];
  const a = alias && alias[frame];
  if (typeof a === 'function') return a(entity);
  const key = sheet + '|' + frame;
  let fam = familyCache.get(key);
  if (fam === undefined) {
    fam = a || frame.replace(/\d+$/, '');
    familyCache.set(key, fam);
  }
  return fam;
}

function clipFor(assets, sheet, family) {
  const key = sheet + '_' + family;
  let clip = clipCache.get(key);
  if (clip !== undefined) return clip;
  const info = assets.info(key);
  if (!info || !info.frames) { clipCache.set(key, null); return null; }
  const frames = Object.keys(info.frames)
    .filter((n) => n.startsWith(family) && /^\d+$/.test(n.slice(family.length)))
    .sort((a, b) => parseInt(a.slice(family.length), 10) - parseInt(b.slice(family.length), 10));
  if (!frames.length) { clipCache.set(key, null); return null; }
  const def = LOOP_DEFAULTS[family] || {};
  const loop = info.loop != null ? !!info.loop : !!(def.px || def.fps);
  clip = { sheet: key, frames, loop, px: def.px || 0, fps: info.fps || def.fps || ONESHOT_FPS };
  clipCache.set(key, clip);
  return clip;
}

/**
 * Sheet + frame to draw for an entity that names `entity.sheet` / `entity.frame`.
 * Keeps a small per-entity record (`entity._clip`) for the loop clock, so the
 * two draws of a hit flash in the same tick return the same frame.
 */
export function clipFrame(assets, entity, sheet = entity.sheet, frame = entity.frame) {
  if (!frame || !sheet) return { sheet, name: frame };
  const family = familyOf(sheet, frame, entity);
  const clip = clipFor(assets, sheet, family);
  if (!clip) return { sheet, name: frame };
  let rec = entity._clip;
  if (!rec || rec.family !== family || rec.sheet !== sheet) {
    rec = entity._clip = {
      sheet, family, start: clock, lastT: clock, dist: 0, lastX: entity.x,
      phase: clip.loop && !clip.px ? Math.floor(Math.random() * clip.frames.length) : 0,
    };
  }
  let index;
  if (!clip.loop) {
    index = Math.min(clip.frames.length - 1, Math.floor((clock - rec.start) * clip.fps));
  } else if (clip.px) {
    // Distance-driven stride with a floor so slow movers still step; a standing
    // walker snaps back to the contact pose like the classic sheets do.
    const dx = Math.abs(entity.x - rec.lastX);
    const dt = Math.max(0, clock - rec.lastT);
    rec.lastX = entity.x; rec.lastT = clock;
    if (dx < 0.05 && Math.abs(entity.vx || 0) < 2) {
      rec.dist = 0;
    } else {
      rec.dist += Math.max(dx, LOOP_MIN_FPS * clip.px * dt);
    }
    index = Math.floor(rec.dist / clip.px) % clip.frames.length;
  } else {
    index = (Math.floor((clock - rec.start) * clip.fps) + rec.phase) % clip.frames.length;
  }
  return { sheet: clip.sheet, name: clip.frames[index] };
}
