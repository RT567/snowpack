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

## Later the same afternoon: look and meaning

- **Colour scheme (Rob):** snow is translucent white/grey (wet greyer; crusts and ice bluer and
  clearer). The *seams* between layers are thin bands coloured by bond strength: green (≥ 2.5 kPa,
  well bonded) → yellow → red (≤ 0.5 kPa, weak). Dark slate stage so green reads. Layer bodies no
  longer carry colour codes.
- **Height readings** are printed onto the +z wall along the uphill back edge as a sheared canvas
  texture strip (tick every 10 cm, number every 20 cm); the total depth is printed flat on the middle
  of the top face and turns to face the camera.
- **Hover** distinguishes a bit of snow from a boundary between two snows (generous band around each
  seam: up to 2.5 cm, capped at a third of a thin layer). A fixed panel top-right shows the same rows
  in the same places every time (height, thickness, hardness, density, condition, date, bond). The
  hovered layer's edges (or the boundary seam) are outlined in white.
- **Model: melt-freeze is a surface event.** Wetting a layer rounds its grains (RG); only a soaking
  (> 12 % liquid by mass) makes melt forms. When rain or melt wets a thick top layer, a 3 cm skin is
  split off and takes the water first; when the wet top refreezes, a 3 cm crust (≥ 380 kg/m³) is split
  off and the snow beneath keeps its grains (`soakTop`, `refreezeTop`). New snow only accretes onto
  dry new snow. Calibration unchanged (2026 bias 0–1 cm, RMSE 11).
- Open-Meteo fetches retry (the archive drops connections now and then; it shows up as a CORS error).
