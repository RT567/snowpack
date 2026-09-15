# src/snow — every physical assumption in one place

Everything the simulation believes about snow lives in this folder. The scene and UI only draw and
label what comes out of here; they carry no snow-science numbers. Review this folder to review the
physics.

| file | what it holds |
|---|---|
| `params.js` | **all constants**: `DEFAULT_PARAMS` (the hourly model), `STATION_CORRECTION` (turning reanalysis into the station record), `SLOPE_DEG` |
| `model.js` | the hourly step: precipitation phase, new-snow density, storms, surface hoar, wind packing, surface energy balance, rain, soaking and crusts, percolation, conduction, densification, grain metamorphism, tidy/merge |
| `mechanics.js` | layer strength from density and grain form, bond strength, loads on the slope, friction, stability index, `MECH` constants and colour/wording bands |
| `grains.js` | IACS grain codes, hand hardness from density and grain form |
| `season.js` | season bounds (1 May–31 Oct, Australia/Sydney), first snow, picker years |

The one piece of physics outside this folder is `src/weather/stationDaily.js`, which applies
`STATION_CORRECTION` to a record; its constants are here, its algorithm is documented below.

## Inputs and their correction (`STATION_CORRECTION`, `stationDaily.js`)

Open-Meteo gives an hourly reanalysis at the grid cell, lapse-rate corrected to 1957 m. Against the
Bureau's Thredbo Top daily observations for 2026 (106 days, `scripts/input-bias.mjs`): daytime
temperatures run 0.6–1.1 °C warm and nights 0.6 °C cold; on days warm enough to trust the gauge,
Open-Meteo has 45 % of the measured rain; ridge-top wind is 40 % of the station's 3 pm speed and gusts
63 %. Individual days can be hours out on frontal timing (up to 7 °C at a given hour).

Correction, where a daily file for the season exists (`public/data/thredbo-top-daily-YYYY.json`):
1. **Temperature anchors.** The station's 9 am and 3 pm readings are spot anchors; the hourly series
   is shifted by an offset interpolated linearly in time through every anchor. Dew point follows 80 %
   of the shift and never exceeds the temperature.
2. **Daily extremes.** Within each 24 h-to-9 am window the series is clamped to the observed min and
   max ± 0.3 °C.
3. **Precipitation.** Rainy windows (snow fraction ≤ 0.3 by wet-bulb) are scaled to the gauge. Snowy
   windows (≥ 0.7) keep Open-Meteo × 1.9, because an unshielded alpine gauge under-catches snow by an
   unknown, wind-dependent amount; the 1.9 is calibrated against Spencers Creek depths (bias +2 cm,
   RMSE 10 cm over 16 readings in 2026). Windows in between blend. When Open-Meteo has no
   precipitation but the gauge does, the gauge amount (boosted by the snow fraction) is spread over
   the most humid quarter of the window's hours.
4. **Wind** ×2.0, gusts ×1.5, everywhere (no hourly station wind is available to us).

Without a daily file the record is used raw with `precipFactor` 1.8 on all precipitation (RMSE 11 cm
for 2026; 2022 under-predicted by ~20 cm, see ai-notes/01).

## The hourly model (`DEFAULT_PARAMS`, `model.js`)

Sources: research/snowpack-model-reference.md unless noted.

- **Phase.** Wet-bulb temperature (Stull 2011). All snow below 0.5 °C wet-bulb, all rain above 1.5,
  linear between.
- **New-snow density.** Hedstrom & Pomeroy 1998: 67.9 + 51.25·e^(T/2.59) kg/m³, plus 3 kg/m³ per m/s of
  wind above 3 m/s, clamped 70–250.
- **Storms.** New snow accretes onto a dry new-snow (PP) top layer if the gap is ≤ 6 h and the
  temperature is within 4 °C of the storm mean; otherwise a new layer. Same-storm layers of the same
  grain (both wet or both dry, neither a crust, same wind-packed state) merge in `tidy`.
- **Surface energy balance** (bulk transfer, solved implicitly in surface temperature): absorbed
  shortwave with albedo 0.85 fresh decaying to 0.65 dry / 0.5 wet (e-folding 500 h / 100 h, refreshed
  by 10 mm of new snow); longwave with atmospheric emissivity 0.70 + 0.28 × cloud fraction and snow
  emissivity 0.98; sensible 2.0 W/m²/K per m/s; latent 1.6 W/m²/K per m/s on the dew-point deficit;
  wind floor 0.5 m/s; skin thermal mass ≥ 10 kg/m²; the skin may not drop more than 10 °C below the
  air. Surplus warms the skin to 0 °C then melts (334 kJ/kg); deficit refreezes held water then cools.
- **Rain and soaking.** Rain enters the top layer as liquid. If the wetted top layer is thick, a 3 cm
  skin is split off and takes the water first. A layer holding more than 3 % water by mass shows
  wetting (new snow, facets and hoar round to RG); more than 12 % is soaked: melt forms, and loose
  snow slumps to at least 200 kg/m³.
- **Refreezing.** When the wet top layer freezes solid, a 3 cm crust of at least 380 kg/m³ is split
  off; the snow beneath keeps its density and grains. A crust denser than 700 kg/m³ is ice.
- **Percolation.** Water entering a cold layer refreezes against its cold content first (raising its
  temperature and density); each layer then holds 3 % of its pore volume (FSM2 Wirr) and passes the
  rest down; the bottom drains to runoff.
- **Conduction.** Each layer relaxes toward the one above with an e-folding time of 6 h × (1 + depth /
  0.25 m); liquid refreezes against cold content; the base creeps toward 0 °C from a 2 W/m² ground flux.
- **Densification.** Anderson 1976 as in FSM2: viscous creep under overburden (η₀ = 3.7 × 10⁷ Pa·s)
  plus destructive metamorphism (2.8 × 10⁻⁶ s⁻¹, doubled when wet); caps 550 dry, 650 wet.
- **Wind.** Above 6 m/s (Li & Pomeroy 1997 transport threshold) the top 5 cm of dry new snow
  densifies by 12 kg/m³ per hour per m/s over the threshold, to at most 400; a thicker fresh layer is
  split so its bulk is untouched.
- **Surface hoar.** Grows after 6 consecutive night hours with cloud < 30 %, RH > 85 %, wind < 3.5
  m/s, air < −0.5 °C, on a dry surface: a 0.5 mm w.e. layer at 80 kg/m³ that keeps growing while
  conditions hold. Destroyed at the surface by wind > 5 m/s, air > 1.5 °C or strong sun; persists
  once buried.
- **Grain ageing.** PP → DF after 24 h once snowfall has stopped; DF → RG after 96 h or above 200
  kg/m³; wind-packed DF → RG.
- **Faceting.** Temperature gradient = surface temperature (air, 4 °C lower on clear calm nights) over
  depth, ground at 0 °C. When it exceeds 10 °C/m and the layer is colder than −1.5 °C, layers in the
  top 25 cm (or anywhere in a pack under 1 m) accumulate facet-hours (rate up to 2 per hour, ×1.5 next
  to a crust); 72 facet-hours make FC, 504 with a gradient over 20 °C/m in the bottom 30 cm of a thin
  pack make DH; warm gradient-free hours slowly undo it.
- **Tidy.** Layers under 0.2 mm w.e. are dropped; slivers under 4 mm merge into the layer below unless
  they are ice, hoar or a refrozen crust.

## Strength and stability (`MECH`, `mechanics.js`)

Sources: research/slab-mechanics-for-simulation.md.

- **Layer strength** Σ = A·(ρ/917)^B kPa from Jamieson & Johnston 2001 Table 8: PP 5.32^1.35,
  DF 12.4^1.68, RG 8.54^1.26, FC 9.7^1.58, DH (Group II) 18.5^2.11, MF and IF via the Group I form
  14.5^1.73; capped at 8 kPa. Buried surface hoar: 0.35 kPa + 0.12 kPa per day since burial, capped
  at 5 (their measured series).
- **Bond** = weaker of the two layers, × (1 − 0.5 × min(1, wetness/5 %)) where wetness is the larger
  liquid mass fraction of the two, × 0.8 when hand hardness differs by ≥ 1.7 steps (Schweizer &
  Jamieson 2003 discriminator; factor magnitude ours).
- **Loads** on the 32° slope: σᵥ = g·(mass above); shear σᵥ sinψ cosψ; normal σᵥ cos²ψ. Friction
  tanφ = 0.4 + 0.08·Σ (Roch 1966, as used by Jamieson & Johnston 1995).
- **Stability index** S = (Σ + tanφ·σₙ)/shear. Measured transitions: 1.56–1.78 without friction,
  2.7–3.0 with. Colour bands: red ≤ 1.5, yellow 2.5, green ≥ 4 (log scale between). Words:
  unstable < 1.5, marginal < 2.5, fair < 4, stable.
- **Material words**: weak < 0.8 kPa, moderate < 1.6, strong (unstable/stable medians 0.77/1.48).
- Not represented: grain size, temperature dependence of strength, skier stress, propagation propensity,
  bond to the ground.

## Hardness (`grains.js`)

Hand hardness 1–6 (F, 4F, 1F, P, K, I) by density: 60→1, 150→1.5, 200→2, 270→3, 350→4, 450→5, 700→6
(Geldsetzer & Jamieson 2000, simplified); new snow ≤ 1.3, facets and depth hoar ≤ 2.5, surface hoar 1,
ice 6; wet melt forms one step softer, refrozen one step harder.

## Known judgement calls (not from measurements)

The 0.5 wet factor and 0.8 contrast factor; melt-freeze and ice strength via the Group I regression;
albedo floors; the 3 cm crust and skin thicknesses; the 12 % soak threshold; the 200 kg/m³ slush
density; surface-hoar formation thresholds (from forecaster rules of thumb); faceting rates; the wind
transport threshold applied to 10 m grid wind; wind ×2 and gust ×1.5.
