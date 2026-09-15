# Simplify: one column on a slope (15 Sep 2026, afternoon)

Rob looked at v1 and found the interactions janky. Direction change, in his words: "lets focus on
just getting the column right", "lets just do load in, see 1 column".

## Removed
- The white-screen intro with four shovel cuts and the camera fly-in.
- The shovel, the side push, the top tap, the slab release animation (`src/scene/slide.js`,
  `src/scene/shovel.js`, `src/ui/gestures.js` deleted). `src/snow/mechanics.js` and its tests stay:
  the failure logic is sound and may return later.
- The soft-layer recess. Every layer has the same footprint; only height varies.

## The column now
- **Square footprint** (0.4 m) standing on a **32° slope**. Walls vertical, every layer boundary
  tilted with the slope: layers are boxes sheared in y by −tan(slope)·x (`src/scene/geometry.js`).
  Gotcha: `Matrix4.makeShear` sheared the wrong axis in practice; the shear is applied to the
  vertices directly.
- **Snow looks like snow**: whites and greys, not IACS colour codes (`LOOK` table in
  `src/scene/column.js`). New snow brightest, old rounded snow a little grey, facets/hoar cooler,
  wet snow darker, refrozen crusts and ice a greyer see-through blue (transparent materials).
  Adjacent layers get a small deterministic tone shift so a stack of similar layers still reads.
- **Thin red seam** (LineLoop) around the column at every layer boundary, following the tilt.
- Ground: a large flat inclined plane with per-face green (and occasional grey rock) facets for a
  low-poly look, fog to the sky colour so it reads as endless.
- Camera looks across the slope so the tilt shows in profile; orbit with the mouse.
- UI unchanged: time bar, tiny season picker, hover label per layer.

## Still open
- Screenshots via the chrome-devtools MCP are stale for this canvas; capture with
  `renderer.render(); canvas.toDataURL()` (see doc 01).
- Model calibration and the wet-pack question are unchanged (doc 01).
