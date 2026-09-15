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
- **Precipitation is under-caught.** Modelled season snowfall ≈ 300 mm w.e.; Spencers Creek (1830 m)
  peaked at 94.5 cm on 13 Aug 2026 (3rd lowest on record) and read 31.2 cm on 3 Sep (record low). The
  model peaks on 12 Aug at ~42 cm with `precipFactor: 1.0`. Calibrate `precipFactor` against the
  Snowy Hydro 2026 curve (expected ~1.6–2.0). Timing of peak and melt-out already matches.
- Snowy Hydro snow depths page has chart data behind WordPress `admin-ajax.php` (to be confirmed).

## Current state (15 Sep 2026)

Done: record schema, Open-Meteo adapters, model, mechanics, season, tests (21 passing), Pages
workflow, research reports in `research/`. Next: calibrate precipFactor; build scene + UI (intro cuts,
column, time bar, season picker, shovel tap, side push, slide); local cache of season records;
first deploy. Repo not yet pushed (Rob to confirm creating `RT567/snowpack`).
