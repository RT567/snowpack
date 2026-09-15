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

## Evening: bond model from the literature; subagents abandoned

- **Subagents.** Eight research subagents were spawned this session; only the first two (data
  sources, model reference) ever ran. The other six never consumed their start prompt (their inboxes
  still held it), with or without an explicit model pin, so they were stopped. The remaining research
  was done directly with WebSearch/WebFetch and by reading the PDFs. Do not assume spawned agents are
  working: check `~/.claude/teams/session-*/inboxes/<name>.json` is empty.
- **Bond model rebuilt on measured data** (`src/snow/mechanics.js`, sources in
  `research/slab-mechanics-for-simulation.md`): layer strength Σ = A·(ρ/917)^B by grain form from
  Jamieson & Johnston 2001 Table 8; buried surface hoar 0.35 kPa + 0.12 kPa/day (their measured
  series); bond = weaker side, ×0.5 wet, ×0.8 when hand hardness differs ≥ 1.7 steps (Schweizer &
  Jamieson 2003 discriminator); Roch friction tanφ = 0.4 + 0.08Σ; stability index
  S = (Σ + tanφ·σn)/σxz on the 32° slope. **Colours now encode S**, not raw strength: red ≤ 1.5,
  yellow ≈ 2.5, green ≥ 4 (measured transitions 1.6–1.8 without friction, 2.7–3.0 with). Layers near
  the surface carry little load, so they read green until buried: that is the physics, not a bug.
- Arithmetic checked by hand against the browser: 206 kg/m² above a boundary → σv 2.02 kPa → shear
  0.908 kPa at 32° → with Σ 1.58 kPa and tanφ 0.526 on σn 1.45 kPa, S = 2.58. Matches the card.
- Cards: snow card (top right) and boundary card (below it, fixed gap) are separate, one fact per row,
  one-line titles, only the hovered kind shown. Boundary card: stability, bond strength, shear load,
  buried, exposed-for, snow above (cm and kg/m²), above, below, notes.
- Still placeholder judgements: the 0.5 wet factor and 0.8 contrast factor magnitudes; melt-freeze
  and ice strength use the Group I regression at their density (no crust-specific data found); no
  grain-size or temperature dependence; no skier stress.

## Night: inputs audited against the station; physics consolidated

- **Audit** (`scripts/audit-days.mjs`, `scripts/input-bias.mjs`): ten random 2026 days compared hour by
  hour with the Bureau's Daily Weather Observations (`test/fixtures/dwo/`) and the Mountain Safety
  Collective's daily report text (their API returns the latest report on or before a date, so
  off-season dates repeat the last report). Found: Open-Meteo warm by day/cold by night, 45 % of
  measured rain on rainy days, 40 % of measured wind; fronts hours out on some days (1 July: station
  1.1 °C and 46 mm of rain at 9 am, model −0.4 °C and snow). Also found and fixed in the model: wind
  packing compressed a whole 51 cm storm layer in one hour (now a 5 cm skin, gradual); refreezing a
  soaked layer compacted all of it to 380 kg/m³ (now a 3 cm crust, bulk keeps its density); soaked
  fresh snow did not slump (now to ≥ 200 kg/m³).
- **Station correction** (`src/weather/stationDaily.js`, constants in `src/snow/params.js`): 9 am/3 pm
  anchors, daily min/max clamp, gauge for rain, ×1.9 Open-Meteo for snow, wind ×2. Depth error vs
  Spencers Creek 2026: RMSE 9–10 cm, bias +2. The page applies it when
  `public/data/thredbo-top-daily-<year>.json` exists (2026 shipped; refresh by re-fetching the DWO
  CSVs from reg.bom.gov.au and running the parse in `scripts/`). A corrected record is simulated with
  `precipFactor` 1 (main.js) so the reanalysis factor is not applied twice.
- **Physics in one place** (Rob's request): all constants in `src/snow/params.js` and `MECH`; the
  scene and UI import thresholds; `src/snow/README.md` is the register of every assumption with its
  source and a list of the judgement calls.
- Weak-boundary list on the left: every boundary ranked by stability index, rank/colour/height/buried/
  S/kPa, hover to locate; cards linger dimmed; time changes re-read the hover under the mouse.
