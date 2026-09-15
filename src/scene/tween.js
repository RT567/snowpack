// Minimal time-based tweens for the few scripted motions we have.
const active = new Set();

export const ease = {
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  out: (t) => 1 - (1 - t) ** 3,
  in: (t) => t * t * t,
  linear: (t) => t,
};

/** Run fn(progress 0..1) over `ms`; resolves when done. */
export function tween(ms, fn, easing = ease.inOut, delay = 0) {
  return new Promise((resolve) => {
    const tw = { start: performance.now() + delay, ms, fn, easing, resolve };
    active.add(tw);
  });
}

export function updateTweens(now) {
  for (const tw of active) {
    if (now < tw.start) continue;
    const p = Math.min(1, (now - tw.start) / tw.ms);
    tw.fn(tw.easing(p), p);
    if (p >= 1) { active.delete(tw); tw.resolve(); }
  }
}
