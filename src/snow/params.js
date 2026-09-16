// Every physical assumption and tunable number in the simulation lives in this folder (src/snow).
// This file holds the constants; model.js, mechanics.js and grains.js hold the rules; README.md in
// this folder explains each one with its source. Nothing outside src/snow may carry a snow-science
// number: the scene and UI import what they need from here.

/** The slope the column stands on. Main Range avalanche terrain is 30–40°; 32° is a typical start zone. */
export const SLOPE_DEG = 32;

/**
 * Corrections that turn Open-Meteo reanalysis at the grid cell into something like the Thredbo Top
 * station record. Derived by scripts/input-bias.mjs against the Bureau's daily observations for 2026
 * and by scripts/calibrate.mjs against Snowy Hydro Spencers Creek depths (research/data-sources.md,
 * ai-notes/01 calibration tables).
 */
export const STATION_CORRECTION = {
  windFactor: 2.0,          // Open-Meteo 3 pm speed / BOM 3 pm speed, median 0.40 in 2026; kept conservative
  gustFactor: 1.5,          // gusts: median ratio 0.63
  // Rain: the gauge is trusted, so rainy windows are scaled to it. Snow: an unshielded alpine gauge
  // catches an unreliable fraction of snowfall, so snowy windows keep Open-Meteo scaled by the
  // depth-calibrated factor instead. Windows in between blend by snow fraction.
  snowPrecipFactor: 2.4,     // calibrated with wind ×2 against Spencers Creek 2026 (bias ≈ +2 cm, RMSE ≈ 9);
                             // independently, the gauge saw 2.46× Open-Meteo's rain on warm days
  rainBelowSnowFraction: 0.3,
  snowAboveSnowFraction: 0.7,
  minPrecipHours: 3,        // spread gauge rain the model missed over at least this many hours
  dewFollowsTemp: 0.8,      // fraction of a temperature correction also applied to the dew point
  extremeSlack: 1.0,        // °C the anchored series may still overshoot the observed daily min/max (safety net)
};

/**
 * Assimilation of human observations (Mountain Safety Collective daily reports, parsed into facts by
 * scripts/parse-msc.mjs). At the report hour the model is nudged toward the two quantitative facts a
 * report reliably carries: new snow in the last 24 h, and whether a crust sits at the surface. Nudged
 * layers are marked `observed` so the interface can say so. Nothing else in the text is applied.
 */
export const ASSIMILATION = {
  reportHour: 9,             // local hour the report describes
  newSnowTolerance: 0.5,     // apply when model and report disagree by more than this fraction …
  newSnowMinCm: 3,           // … and by more than this many cm
  crustThickness: 0.02,      // m, crust made when the report says "crust at the surface" and the model has none
  crustRho: 380,
  crustSearchDepth: 0.05,    // m, how deep "at the surface" reaches
};

export const DEFAULT_PARAMS = {
  // Reanalysis under-catches orographic precipitation on the Main Range; scale it. Calibrated against
  // Snowy Hydro Spencers Creek depth readings (ai-notes/01). Used only when no station correction
  // has been applied to the record (a corrected record already carries real precipitation).
  precipFactor: 1.8,
  // precipitation phase, wet-bulb °C: all snow below snowTw, all rain above rainTw, linear between
  snowTw: 0.5,
  rainTw: 1.5,
  // new snow: Hedstrom & Pomeroy 1998 plus wind bonus for maritime snow
  windBonusPerMs: 3,        // kg/m³ per m/s above windBonusFrom
  windBonusFrom: 3,
  newSnowRhoMin: 70,
  newSnowRhoMax: 250,
  // a new layer starts when snowfall resumes after this many dry hours or a large temperature change
  stormGapHours: 6,
  stormTempJump: 4,
  // densification (Anderson 1976 as used in FSM2)
  eta0: 3.7e7,              // Pa·s
  snda: 2.8e-6,             // 1/s
  rhoMaxDry: 550,
  rhoMaxWet: 650,
  // surface energy balance (bulk-transfer formulation)
  emissivitySnow: 0.98,
  clearSkyEmissivity: 0.70,   // atmospheric emissivity under clear sky
  cloudEmissivityGain: 0.28,  // added at full overcast
  ch: 2.0,                    // sensible heat, W/m² per K per m/s
  ce: 1.6,                    // latent heat (dew point − surface), W/m² per K per m/s
  windFloor: 0.5,             // m/s, free convection minimum
  groundFlux: 2,              // W/m² from the ground into the base
  skinMassMin: 10,            // kg/m², minimum thermal mass the surface flux acts on
  skinMaxBelowAir: 10,        // °C, how far a clear-night snow surface can drop below the air (observed 5–12)
  albedoFresh: 0.85,
  albedoOldCold: 0.65,       // floor for ageing dry snow
  albedoOldMelt: 0.5,        // floor for wet snow
  albedoDecayColdHours: 500, // e-folding for dry snow (FSM2 uses 280; alpine winter snow stays bright longer)
  albedoDecayMeltHours: 100, // FSM2 tmlt
  albedoRefreshMm: 10,       // new snow (mm w.e.) that fully refreshes albedo
  // liquid mass fraction at which wetting shows in the grains (traces of percolating water do not)
  wetGrainFraction: 0.03,
  // liquid mass fraction at which a layer is soaked through and its grains become melt forms
  soakFraction: 0.12,
  // a melt-freeze event leaves a crust this thick (m) at the top of the wetted layer when it refreezes
  crustThickness: 0.03,
  crustRhoMin: 380,          // refreezing compacts the crust to at least this density (crusts 350–500)
  crustDisplayRho: 350,      // a refrozen melt-freeze layer at least this dense reads as a crust
  slushRho: 200,             // snow soaked through slumps at least to this density within the hour
  // liquid water holding fraction of pore volume (FSM2 Wirr)
  wirr: 0.03,
  // conduction: each layer relaxes toward the one above with this e-folding time per metre of depth
  conductTauHours: 6,
  conductDepthScale: 0.25,  // m
  // wind slab: wind works only a skin of the surface, densifying it a little each hour
  windPackSpeed: 6,         // m/s, transport threshold for fresh snow (Li & Pomeroy 1997: 4–8), station wind
  windSkin: 0.05,           // m, depth of snow the wind reworks
  windPackRate: 12,         // kg/m³ per hour per m/s above the threshold
  windPackRhoMax: 400,
  // rime: supercooled cloud droplets freezing onto the surface in wind (the Main Range's default
  // weather); deposits an icy rime crust of a few cm over a day of fog. Rate in mm w.e. per hour per m/s.
  rimeRhMin: 96,
  rimeCloudMin: 90,
  rimeTempMax: -0.5,
  rimeWindMin: 6,           // m/s
  rimeRatePerMs: 0.03,      // mm w.e./h per m/s of wind: 8 m/s in fog ≈ 0.6 cm of rime a day
  rimeRho: 400,
  rimeMaxThick: 0.02,       // m: a rime crust is a few cm; beyond that riming is eroded as fast as it forms
  // surface hoar
  shWindMax: 3.5, shTempMax: -0.5,
  shVapourExcess: 0.3,      // hPa the air's vapour pressure (at its dew point) must exceed saturation at the snow skin
  shHoursToForm: 6,
  shDestroyWind: 7,         // m/s at the surface (station wind, already scaled)
  shGrowthPerHpa: 0.3,      // mm of hoar height per hour per hPa of vapour excess (Hachikubo & Akitaya 1997: a few mm a night)
  shMinThick: 0.001,        // m of hoar before it counts as a layer
  shRho: 80,
  // faceting
  facetGradient: 10,        // °C/m
  facetTempMax: -1.5,       // °C, warmer snow rounds rather than facets
  nearCrustGradient: 5,     // °C/m: next to a crust, kinetic growth needs less gradient (melt-layer recrystallisation)
  nearCrustTempMax: -3,     // °C, and cold snow
  nearCrustDistance: 0.05,  // m from a crust
  facetHoursToFC: 72,        // ~3 days of strong gradient makes near-surface facets
  facetHoursToDH: 24 * 21,   // ~3 weeks of very strong gradient in a thin pack makes depth hoar
  facetDepth: 0.25,         // m below the surface where near-surface faceting acts
  // grain ageing
  ppToDfHours: 24,
  dfToRgHours: 96,
  dfToRgRho: 200,
  // crusts
  iceRho: 700,
  // a layer thinner than this (m) is merged into the one below, unless it is a crust or hoar
  minThickness: 0.004,
  minSwe: 0.2,
};
