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

## Second audit (seed 101) and the Bureau window convention

- Found a convention error of ours: the Bureau's daily **maximum is for the 24 h from 9 am**, the
  minimum and rain for the 24 h to 9 am. We had clamped daytime temperatures against the wrong day's
  maximum, which suppressed warm afternoons (20 July: station 3 pm 6.9 °C, model held at 5.6) and made
  the depth fit look better than it was. Fixed; the four daily facts (9 am, 3 pm, min at Open-Meteo's
  coldest hour of its window, max at its warmest) are now anchors for a smooth offset, with a ±1 °C
  safety clamp.
- With honest temperatures the pack melted too thin at snow factor 1.9; refit gives **wind ×2, snow
  ×2.4** (bias 0, RMSE 8 cm over 16 Spencers Creek readings). 2.4 agrees with the 2.46× the gauge
  measured against Open-Meteo on rain days, so the reanalysis simply under-catches everything here
  by ~2.5×.
- Second ten-day sample after the fix: daily max/min and 9 am/3 pm within a degree of the station on
  every day; 3 June storm 46 mm at 0 °C handled as wet snow; 30 July "14 cm redistributed into wind
  slabs" appears as an 11 cm wind-packed RG slab at 400 kg/m³; 27 June clear calm night grows surface
  hoar. No further model defects found in this sample.
- Page check: 107 days corrected, peak 90 cm on 12 Aug (observed 94.5 on 13 Aug), 14 layers.

## Real observations incorporated (late evening)

- **SnowPilot** (snowpilot.org query feed, `STATE[]=528` Australia): 33 Australian pits 2019–2025, mostly
  Victorian resorts; one on the Main Range (11 Jul 2025, 235 cm, E 35°, CT12 at 78 cm, ECTX). Saved as
  `test/fixtures/snowpilot-australia.json`; `scripts/compare-pits.mjs` runs the raw model at each pit's
  location and prints observed vs modelled layers, tests and weakest boundaries. First comparison: the
  observer saw a pencil crust over dry rounded grains; the raw model had 54 cm of fresh snow on top and
  178 cm total (no station correction exists for 2025). One pit proves nothing; it is a hook for more.
- **Mountain Safety Collective** daily reports: `scripts/fetch-msc.mjs` snapshots a season into
  `public/data/msc-<year>.json` (61 published days in 2026: danger rating, problems with elevation and
  aspect, snowpack/weather/hazard text). The page shows the Main Range report for the selected day under
  the column and marks report days as dots on the time bar. Their API returns the latest report on or
  before a date; we keep only reports dated that day and Published.
- **Snowy Hydro daily sensor** ("Spencers (Research)" station 00003, 11:00 daily): published only as a
  HYPLOT chart PDF (`wp-content/uploads/pdfs/watrel/00003SD.pdf`). It is vector, so
  `scripts/digitise-snowyhydro-sensor.mjs` reads the polyline and axis gridlines from the SVG
  (`pdftocairo -svg`) and emits a daily series → `public/data/spencers-sensor-2026.json` (136 days;
  matches the manual course within a few cm on shared dates; peak 102.5 cm on 13 Aug). The calibration
  script reports daily bias/RMSE against it (currently +1 / 10 cm over 135 days); the page shows the
  measured depth next to the model's for the selected day.
- **Other sources checked and rejected for data**: resort snow reports (live only, no history), Perisher
  and Charlotte Pass pages (HTML only), MSC observation forms (public submissions, not published as
  data), ski.com.au forum threads and Facebook groups (anecdotal). The MSC narrative observation pages
  (e.g. 2019 incident reports) carry occasional test results but no structure.

## 16 Sep: observers' text as data; twenty-day comparison; model fixes

- `scripts/parse-msc.mjs` (Claude Sonnet via `claude -p`, as autotracklist) turns each MSC Main Range
  report into facts (`public/data/msc-2026-facts.json`, 61 days). First pass leaked forecast sentences
  ("heavy overnight rain will have…" on a day the station logged 84 mm of snow); the prompt now ignores
  future/expectation language. `scripts/compare-msc.mjs` scores the model at 9 am against the facts
  (`--detail --every=3` prints the side-by-side; `--msc` runs with nudges).
- **Twenty-day comparison findings and fixes:** rime ice reported on six days and absent from the model →
  rime process added (capped 2 cm crust, fog between storms only; an uncapped version sliced storms into
  slivers and inflated depth 20 cm); surface hoar destroyed too easily under the doubled wind → 7 m/s;
  facets reported beside crusts at ~35 cm → near-crust faceting at 5 °C/m below −3 °C. Scores (raw
  model vs forecast-aware facts): surface type 80 %, crust at surface 85 %, pack wetness 100 %, crust
  depths 57 %, weak-layer depths 58 %, new snow 67 %. With nudges: new snow 100 %, crust 90 %. Depth
  calibration: bias 3 / RMSE 7 cm weekly, 3 / 9 daily (5 / 8 and 6 / 9 with nudges).
- **Assimilation** (`ASSIMILATION`, `model.js › assimilate`): only new-snow-in-24 h and crust-at-surface
  are applied, at 9 am on report days; nudged layers carry `observed`.
- **UI:** report panel bottom-left; the extracted facts appear as chips; hovering a chip outlines the
  matching layers or boundary in the column (or reads dim when the model has nothing like it).
- autotracklist (other project): venv Python had vanished on 2 Sep; `uv sync` fixed it; running again.

## 16 Sep (later): chips made against the model column; hoar, wet bonds, storm totals

- **Chip pipeline redesigned** on Rob's direction ("mark-up should be done with the model's context;
  build the model with the MSC facts first, then tag"; "one chip, one thing"; "if a chip maps to several
  things, no chip"). Keyword rules in `main.js` are gone. `scripts/chip-msc.mjs` runs the season with
  the facts assimilated, prints the model's column at 9 am (layer ids, depths, kinds, bonds) next to each
  report, and Claude Sonnet returns exact substrings each naming ONE layer id or the boundary under one
  layer → `public/data/msc-2026-chips.json`. Each day carries a stamp of the layer ids at 9 am; the app
  (`chipsFor`) ignores a day's chips when its own run has different ids (model changed, chips stale).
  **Re-run `node scripts/chip-msc.mjs --year=2026 --redo=…` (or delete the file) after any model or
  input change; `--stamp` re-stamps and lists stale days without asking Claude.** Layer ids are now reset
  per `simulate()` call so they are reproducible. Rob's 13 Aug example ("storm snow overlies a melt freeze
  crust" highlighted a refrozen skin above the storm snow) now resolves to the crust beneath.
  Snow falling after the report simply sits on top with no chip.
- **Surface hoar** now forms on vapour excess (air vapour pressure at dew point minus saturation over ice
  at the skin temperature > 0.3 hPa, still air, night) and grows 0.3 mm/h per hPa; fog rime coats and
  removes it; thin hoar is judged by height in `tidy`, not by mass (a 1.6 mm hoar layer weighed less than
  `minSwe` and vanished the hour it formed). The 30–31 July night that observers reported as "surface
  hoar up to 2 mm" now grows 2.8 mm; it also forms on ~20 other nights in 2–5 mm amounts.
- **Wet bond factor** applies only above 3 % liquid mass fraction (full 0.5 at 10 %). Before, a moist
  basal layer kept the season's weakest boundary at S ≈ 2 ("marginal") for weeks while MSC rated Low;
  now Low days have median min-S 3.0, Moderate 3.2, Considerable 3.6 (still barely ordered — the S index
  does not track the regional rating; open question).
- **Storm totals tried as an assimilation input and removed**: "up to 22 cm", "over 35 cm in 72 h" and
  wind-slab depths get parsed as storm totals and repeat for days; scaling to them doubled depth RMSE
  and dropped weak-depth agreement to 9 %. Documented in `src/snow/README.md`.
- **3 July (Rob's question)**: MSC rated Low, "up to 22 cm storm total", damaging winds. Model had 59 cm
  at 9 am (Spencers sensor 11.6 that day, 36.8 the next) with the storm base on the rained-on 2 July
  surface as an "unstable" S 1.4 bond. With the wet-bond onset it is S 1.8 (marginal). The depth
  overshoot in this storm (~+35 % vs the sensor after settling) is the gauge ×2.4 snow factor applied to
  a storm where 130 km/h gusts probably blew much of it off the exposed station; no wind-erosion process
  exists yet.
- `compare-msc.mjs` reads the surface at 7 am (dawn, what observers describe) and looks past hoar < 5 mm;
  scores now: surface 68 %, crust at surface 79/81 %, pack 73 %, crust depths 63 %, weak depths 65 %,
  new snow 75 % (100 % nudged). Depth calibration unchanged: bias 3 / RMSE 7.
- Mark-up run done: 118 chips over 55 of 61 days, none stale after `--stamp`. Browser check: 13 Aug
  "melt freeze crust" is the 1 cm crust under the 6 cm storm slab; 24 Jul "may not be bonding well" is
  the boundary under the new snow; 3 Jul has no chips (the text is all pack-wide); 1 Aug "Surface hoar"
  shows in the morning and is plain text by noon because the sun has taken the hoar (by design).
- Open (bd snowpack-rh6): no wind-erosion process for the exposed station; the stability index barely
  orders the MSC danger ratings. Create the GitHub repo only when Rob says so.
