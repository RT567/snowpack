# snowpack — architecture and decisions (15 Sep 2026)

## The idea

A toy, not a tool. A browser page that reconstructs the snowpack of the Thredbo / Main Range
backcountry (Kosciuszko, NSW) from the hourly weather record and shows it as a 3D snow column, the
way you would see layers in an extended column test cut. You scrub through the season and watch
storms pile up, rain darken and crust the surface, hoar grow on clear nights and get buried. You push
the column from the side, or tap the top with a shovel, and the weakest layer below your load lets go
and the slab slides off. In the vein of curlysim (rt567.github.io/curlysim): one thing, no HUD,
"would you look at that".

Rob's interaction spec (verbatim intent):
- Open on a white screen. Four clicks each cut one wall of the column (shovel cuts). The camera zooms
  in on the freed column.
- Push the column from the side at some height → the weakest interface below the push fails, the slab
  above it slides away.
- Hover the top → a shovel appears. Click = quick light tap. Click and hold winds the arm up (to ~90°),
  release slaps harder. Compression-test style loading from the top.
- Only UI: a time bar (first snowfall of the season → now, or the season end for past seasons, never
  the future) and a tiny season picker top-left.
- Bare stage.

## Architecture (designed for this app, not copied)

A strict pipeline of plain data, each stage a pure module testable in Node:

1. `src/weather/record.js` — **the record schema**: hourly `{t, temp, rh, dew, precip, wind, gust,
   dir, sw, cloud}`. Sources are adapters producing this and nothing else. `stitch()` merges sources
   (later wins) and drops the future. Rain/snow split is *not* in the record; the model decides.
2. `src/weather/openMeteo.js` — adapters for the Open-Meteo archive (ERA5, 1940→~5 days ago, immutable)
   and forecast API (`past_days`, higher-res NWP). Both requested at the station elevation (1957 m) so
   temperature is lapse-rate corrected. Browser fetches directly (CORS is open). No server.
3. `src/snow/model.js` — **pure hourly step**: `(stack, hour) → stack`. Layers bottom→top with swe,
   lwc, thickness, temp, grain (IACS), wetCount, facetHours, windPacked, storm metadata. Processes:
   wet-bulb phase partition; Hedstrom–Pomeroy new-snow density + wind bonus; storm accretion; surface
   hoar growth/destruction; wind packing; **implicit surface energy balance** (SW, LW with cloud
   emissivity, bulk sensible/latent) → warm/melt/refreeze/cool; rain; percolation with 3 % irreducible
   water; conduction downward and refreeze by cold content; Anderson densification; grain ageing
   PP→DF→RG, faceting under gradient (>10 °C/m, cold, near surface or thin pack) → FC → DH; tidy/merge.
   `simulate(record)` returns one snapshot per hour; scrubbing is array indexing.
4. `src/snow/mechanics.js` — pure failure logic. Each interface has a bond strength (kPa) from grain
   types, sintering age, wetness and hardness contrast. Loads are transmitted through the slab (hard
   snow passes force on, soft snow soaks it up), plus overburden friction and slope shear. `sidePush`,
   `topTap`, `tilt` return the failing interface (highest load/strength ≥ 1) and all candidates.
5. `src/snow/season.js` — season bounds (1 May–31 Oct, Australia/Sydney), first-snow index, picker years.
6. `src/scene/*` — Three.js column from a snapshot (one box per layer; colour by IACS grain colour;
   soft layers recessed like a brushed pit wall), stage, slide animation (scripted kinematics, no
   physics engine). Knows nothing about weather.
7. `src/ui/*` — pointer gestures → intents (set hour, push at height, tap with force), time bar,
   season picker.

Tooling: Vite + Three.js from npm, `node --test` for model/mechanics/season, GitHub Actions builds
`dist/` to Pages on push to `main` (`.github/workflows/deploy.yml`). Dev: `npm run dev`;
`node scripts/run-fixture.mjs` prints the 2026 season through the model.

Decisions and why:
- **No server.** Open-Meteo already persists the weather and allows browser fetches; the model runs in
  well under a second. A later optional "collector" (GitHub Action cron or a local systemd timer) could
  append Bureau observations / Spencers Creek depths / a Claude caption as static JSON under `data/`;
  the page must work identically without it. Rob chose no server for v1.
- **Model in the browser** so time scrubbing, season switching and parameter tweaks are free.
- **Energy balance, not degree-day.** Degree-day melted the pack out in days on clear dry winter days.
  The bulk energy balance sees that low humidity and clear skies cool the surface. Explicit stepping
  overshot the air temperature and caused spurious melt; the solve is implicit in Ts.
- **One snapshot per hour, fully copied.** ~3300 hours × ~10 layers is small. Simplicity wins.

## Data findings

- Bureau of Meteorology old JSON feeds (`reg.bom.gov.au/fwo/IDN60801/...`) return 404. Live station
  access is still being researched (see `research/`). Not needed for v1.
- Open-Meteo archive with `elevation=1957` gives plausible temperatures (monthly means within ~1–2 °C
  of Thredbo Top climatology) but its own snow/rain split treats the range as lowland: near-zero snow
  depth all winter. We partition by wet-bulb ourselves.
- **Precipitation is under-caught.** With `precipFactor: 1.0` modelled 2026 snowfall ≈ 300 mm w.e. and
  the pack peaks at 42 cm on 12 Aug; Spencers Creek (1830 m) peaked at 94.5 cm on 13 Aug 2026 (3rd
  lowest on record) and read 31.2 cm on 3 Sep (record low). Calibration runs (`node
  scripts/run-fixture.mjs --year=Y --precip=F`):

  | season | factor | modelled peak | observed Spencers Creek |
  |---|---|---|---|
  | 2026 | 1.8 | 106 cm (10 Aug); 18 cm on 5 Sep | 94.5 cm (13 Aug); 31 cm on 3 Sep |
  | 2026 | 2.0 | 119 cm; 28 cm on 5 Sep | same |
  | 2022 | 2.0 | 237 cm (23 Aug) | ~232 cm (early Sep) |

  Thredbo Top is ~130 m higher than the snow course, so a slight excess is expected. **Set 1.9.**

  Full-series calibration (`node scripts/calibrate.mjs --year=Y`, Snowy Hydro weekly readings in
  `test/fixtures/snowyhydro-*.json`, parsed by `src/weather/snowyHydro.js`), bias / RMSE in cm:

  | season | f1.6 | f1.8 | f1.9 | f2.0 |
  |---|---|---|---|---|
  | 2026 (lean) | −7 / 16 | +1 / 12 | +4 / 12 | +7 / 14 |
  | 2025 | −19 / 28 | −2 / 17 | +6 / 17 | +17 / 24 |
  | 2024 | −22 / 29 | −13 / 20 | −9 / 15 | −2 / 10 |
  | 2022 (big) | −48 / 52 | −29 / 33 | −19 / 25 | −3 / 19 |

  1.9 is the compromise. Big seasons are under-predicted at any single factor, which hints the deep
  pack melts or settles a little too fast rather than a precipitation problem. Early-season remnants
  (June) are over-predicted: the real pack at the lower snow course melts out and ours keeps ~20 cm.
- **Wet pack.** The modelled Australian pack is melt-freeze dominated: rain events and surface melt
  soak it and, once isothermal, deep layers hold water at the 3 % irreducible capacity until a long
  cold spell refreezes them from the top. Percolating water refreezes against cold content on the way
  down, so a cold pack stays dry at depth. Grains only become MF once liquid exceeds 3 % of layer mass.
  Whether this is too wet for mid-winter is an open question; compare with MSC observations.
- Snowy Hydro snow depths page has chart data behind WordPress `admin-ajax.php` (to be confirmed).

## Current state (15 Sep 2026)

Done and working in the browser (`npm run dev`, tested with headless Chrome): record schema, Open-Meteo
adapters with localStorage cache, model, mechanics, season, 21 tests, Pages workflow, research reports,
white-screen intro with four shovel cuts and camera fly-in, brushed column (soft layers recessed),
hover labels, time bar with month ticks, season picker (1990→now, ~3 s to load a past season), shovel
tap with wind-up, side push with growing ring, slab release animation, precipFactor 1.9.

Open / next:
- Refine calibration with the Snowy Hydro curve; sanity-check the wet-pack behaviour against MSC reports.
- Mechanics feel: wet spring packs fail on any push almost instantly (bond ~0.35 kPa). Consider a
  minimum hold or a stronger wet-MF bond so "hold to push harder" is felt.
- Visual polish: layer colours are IACS tints; consider subtle texture/edge wear. Intro blocks are
  plain boxes.
- Slide animation direction is camera-relative (push: away from viewer; tap: toward viewer). Chunks
  tip over the far edge, land, topple flat, rest 2.5 s, fade. The landing camera sits high and to the
  right so debris behind the column stays visible.
- **Testing gotcha:** the chrome-devtools MCP `take_screenshot` returns stale compositor frames for this
  WebGL canvas (identical images across changes). To see the real frame, run in the page:
  `S.renderer.render(S.scene, S.camera); return S.renderer.domElement.toDataURL('image/jpeg', 0.8)` via
  `evaluate_script` with `filePath`, then base64-decode (see scratchpad `decode.py` pattern).
- Repo not yet pushed (Rob to confirm creating `RT567/snowpack`); Pages needs `build_type: workflow`.
- Debug handle: `window.__snowpack` exposes state, column, camera, shovel, timebar, setIndex.
