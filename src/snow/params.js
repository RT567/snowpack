// Every tunable in the snowpack model, with the source of the default.
export const DEFAULT_PARAMS = {
  // reanalysis under-catches orographic precipitation on the Main Range; scale it. Calibrated against
  // Snowy Hydro Spencers Creek depth readings (see research/australian-alps-snowpack.md).
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
  crustRhoMin: 380,          // refreezing compacts the crust to at least this density
  // liquid water holding fraction of pore volume (FSM2 Wirr)
  wirr: 0.03,
  // conduction: each layer relaxes toward the one above with this e-folding time per metre of depth
  conductTauHours: 6,
  conductDepthScale: 0.25,  // m
  clearNightCooling: 4,     // °C the skin drops below air temp on clear calm nights (hoar/facet rules)
  // wind slab: wind works only a skin of the surface, densifying it a little each hour
  windPackSpeed: 6,         // m/s, transport threshold for fresh snow (Li & Pomeroy 1997: 4–8)
  windSkin: 0.05,           // m, depth of snow the wind reworks
  windPackRate: 12,         // kg/m³ per hour per m/s above the threshold
  windPackRhoMax: 400,
  // surface hoar
  shCloudMax: 30, shRhMin: 85, shWindMax: 3.5, shTempMax: -0.5,
  shHoursToForm: 6,
  shDestroyWind: 5,
  shSwe: 0.5,               // mm w.e. of a hoar layer
  shRho: 80,
  // faceting
  facetGradient: 10,        // °C/m
  facetTempMax: -1.5,       // °C, warmer snow rounds rather than facets
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
