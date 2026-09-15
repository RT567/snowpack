# Weather → snowpack layer builder: practical reference

Research summary (Claude subagent, 2026-09-15). Equations, thresholds and sources used to write `src/snow/model.js`.

## 1. Empirical rules for an hourly layer builder

### 1.1 New-snow density
- Hedstrom & Pomeroy 1998 (T = air temp °C, valid roughly −20…0 °C): **ρ_new = 67.92 + 51.25·exp(T/2.59)** kg/m³ → ~68 at −20 °C, ~119 at 0 °C. (As reprinted in Helfricht et al. 2018, HESS 22:2655, eq. 3: https://hess.copernicus.org/articles/22/2655/2018/hess-22-2655-2018.pdf ; original: https://research-groups.usask.ca/hydrology/documents/pubs/papers/hedstrom_pomeroy_1998.pdf)
- Alternatives: Diamond & Lowry ρ = 119 + 6.48·T; LaChapelle ρ = 50 + 1.7·(T+15)^1.5. Observed mean sub-daily new-snow density in the Alps ≈ 68 ± 9 kg/m³; wind and warmth push it up.
- SNOWPACK (Lehning et al. 2002) wind/RH-aware regression: ρ_new = 70 + 6.5·T2m + 7.5·Ts + 0.26·RH + 13·U10 − 4.5·T2m·Ts − 0.65·T2m·U10 − 0.17·RH·U10 + 0.06·T2m·Ts·RH (clamp to [30,250]). https://tc.copernicus.org/articles/15/1065/2021/
- FSM2 wind rule: new snow deposited while wind is above the transport threshold gets rhow = 300 kg/m³ instead of rhof = 100. https://github.com/RichardEssery/FSM2 (src/FSM2_PARAMS.F90)
- For Australian maritime snow, bias upward: Hedstrom-Pomeroy + wind bonus (+2·U kg/m³ per m/s above 3 m/s), floor 80.

### 1.2 Settlement / densification (per layer, per hour)
FSM2 (https://github.com/RichardEssery/FSM2/blob/master/src/SNOW.F90):
- DENSTY=1 (relaxation): ρ ← ρ_max + (ρ − ρ_max)·exp(−dt/τ), ρ_max = 300 kg/m³ if layer T < 0 °C, 500 if melting; τ = 7.2e5 s (200 h). (Essery 2015: https://gmd.copernicus.org/articles/8/3867/2015/)
- DENSTY=2 (Anderson 1976 overburden + metamorphism): dρ/dt = ρ·g·M/(η0·exp(−(T−Tm)/12.4 + ρ/55.6)) + ρ·snda·exp((T−Tm)/23.8 − max(ρ−150,0)/21.7), M = overlying mass (kg/m²), η0 = 3.7e7 Pa·s, snda = 2.8e-6 s⁻¹, T in K.
- Caps: dry snow ≤ ~550, wet/melt-forms ≤ ~600 kg/m³. Wet layers densify ~2× faster.

### 1.3 Melt, refreeze, crusts
- Degree-day: M = DDF·max(T_air − T0, 0), DDF 2–6 mm w.e. °C⁻¹ d⁻¹ (3–5 for deep packs), hourly: /24. https://hess.copernicus.org/articles/30/2613/2026/ ; https://tc.copernicus.org/articles/17/211/2023/
- Radiation term (Hock-style): a_SW·(1−α)·SW, a_SW ≈ 0.01–0.03 mm h⁻¹ per W/m² absorbed; albedo decays 0.85 (fresh) → 0.5 (melting), time scales 1e6 s cold / 3.6e5 s melting, refreshed by 10 kg/m² of new snow (FSM2).
- Liquid water holding: 3 % of pore volume (Wirr); excess percolates down. Refreeze: cold content = c_ice·ρ·dz·(0 − T_layer); refreeze min(liquid, coldcontent/Lf).
- Crust: a layer that held liquid then refroze → MF → MFcr. Repeat cycles raise density; ρ > ~700 kg/m³ → IF (ice lens). IACS: https://unesdoc.unesco.org/ark:/48223/pf0000186462 ; https://tc.copernicus.org/articles/14/3449/2020/tc-14-3449-2020.html
- Rain-on-snow: rain enters top layer as liquid; if pack sub-freezing, refreezes where cold content allows → thin ice layer/rain crust at first cold interface. Isothermal pack: water passes through (preferential flow columns). https://avalanche.org/avalanche-encyclopedia/snowpack/snow-metamorphism/melt-freeze-processes/rain-crust/ ; https://tc.copernicus.org/articles/18/2783/2024/

### 1.4 Wind slab
- Transport threshold (Li & Pomeroy 1997): fresh dry snow moves at U10 ≈ 4–5 m/s; typical 8 m/s dry, 10 m/s wet/aged. https://journals.ametsoc.org/view/journals/apme/36/3/1520-0450_1997_036_0205_eotwsf_2.0.co_2.xml
- Rule: U10 ≥ 6 m/s (gust ≥ 10) and surface layer PP/DF with ρ < 200 → RG wind-packed, ρ = max(ρ, 300) rising +10 kg/m³ per hour to ~400, hardness 1F–P. Lee (E–SE for NW–W winds) ×1.5–2, windward ×0.3. https://arc.lib.montana.edu/snow-science/objects/ISSW2023_O11.04.pdf

### 1.5 Surface hoar
- Conditions: clear (cloud < 0.3), RH > 90 %, wind 1–3 m/s (never > ~4 m/s), net LW loss > ~60 W/m², surface 5–10 °C colder than air. A night of these = 1–3 mm SH. https://www.sciencedirect.com/science/article/pii/S0165232X13001006 ; https://arc.lib.montana.edu/snow-science/item/1947 ; https://www.eoas.ubc.ca/courses/atsc113/snow/met_concepts/07-met_concepts/07i-surface-hoar/
- Destroyed by wind > ~5 m/s, rain, or melt; persists once buried by ≥ 20–30 cm, weak for weeks. Model: SH layer 0.5–1 cm, ρ ~100, hardness F, magenta.

### 1.6 Faceting / temperature gradient
- Kinetic metamorphism when |dT/dz| > 10 °C/m. Near-surface facets within ~36 h on clear nights; near-crust facets above a wet crust under a cold clear night. https://www.mtavalanche.com/articles/media/20/near-surface-faceted-crystals-conditions-necessary-growth-and-contribution ; https://agupubs.onlinelibrary.wiley.com/doi/full/10.1029/2009gl039618
- Hourly rule: surface T ≈ min(T_air, T_air − 5 K on clear nights), basal T = 0 °C; gradient > 10 °C/m for > 24 h → RG→FC in coldest layers; > 20 °C/m for > 5 days and depth < 1 m → basal FC→DH. Reset when layer wets.

### 1.7 Sun crust
- Sunny aspects (N/NE/NW in Southern Hemisphere), absorbed SW ≥ ~150 W/m² with T_air < 0 then refreeze: thin MFcr 0.5–2 cm. https://avalanche.org/avalanche-encyclopedia/snowpack/snow-metamorphism/melt-freeze-processes/sun-crust/

### 1.8 Hardness & grain colours
- Hand hardness ↔ density (Geldsetzer & Jamieson 2000): F < ~150 kg/m³, 4F 150–250, 1F 250–330, P 330–450, K > 450, I = ice. HHI 1–6. https://www.researchgate.net/publication/233719917_Quantification_of_the_hand_hardness_test
- IACS 2009 grain colours: PP #00FF00; DF #228B22; RG #FFB6C1; FC #ADD8E6; DH #0000FF; SH #FF00FF; MF #FF0000; IF #00FFFF; MFcr red with crust hatch; MM #FFD700. https://unesdoc.unesco.org/ark:/48223/pf0000186462

## 2. Profile graphic conventions (CAA OGRS / niViz)
Height above ground in cm; layers as horizontal bars; bar width = hand hardness (F narrowest → I widest); fill = grain colour; temperature profile overlaid. Ice lenses as thin full-width lines. https://cdn.ymaws.com/www.avalancheassociation.ca/resource/resmgr/standards_docs/ogrs2016web.pdf ; https://niviz.org/ ; https://www.sais.gov.uk/wp-content/uploads/2014/11/interpreting_snow_profiles.pdf

## 3. Australian / Main Range character
- Maritime pack: fast metamorphism, dense, near-isothermal; prevailing NW–W winds → loading and cornices on E/SE lee slopes; depths typically 1–2 m; avalanches mostly size 1–2. https://www.tandfonline.com/doi/full/10.1657/1523-0430(2006)38[429:TCACOA]2.0.CO;2 ; https://media.bom.gov.au/social/blog/2392/explainer-avalanches/
- Typical problems: wind slab on lee aspects (primary), new snow on icy/rain crust, surface hoar, spring melt-freeze / wet loose, persistent slab, cornice fall. https://www.nationalparks.nsw.gov.au/things-to-do/guided-tours/avalanche-safety-training-in-kosciuszko/learn-more ; https://mountainsafetycollective.org/ ; https://reports.mountainsafetycollective.org/main-range (JS app)
- **2026 season: Spencers Creek (1830 m) peak 94.5 cm on 13 Aug (3rd-lowest on record), 31.2 cm on 3 Sep (record low for date)**; El Niño, warm SSTs, repeated rain (50 mm+ on 5 Sep), strong winds; MSC in "Spring Conditions Mode" early Sept. https://www.weatherzone.com.au/news/historically-low-early-september-snow-depth-as-more-resorts-announce-closure/1891539 ; https://www.mountainwatch.com/Snow-news/mountain-safety-collective-backcountry-conditions-report-friday-4-september-2026/
- Typical Aus mid-season sequence: storm (PP/DF) → wind slab on E/SE → rain → MFcr/IF → cold clear nights → SH or near-crust FC → next storm buries it = persistent slab.

## 4. Open-source models to borrow from
- FSM2 (Essery): max 3 layers (0.1, 0.2 m, remainder); rhof=100 / rhow=300; Wirr=0.03; albedo 0.85→0.5. https://github.com/RichardEssery/FSM2 ; https://gmd.copernicus.org/articles/18/3583/2025/
- SNOWPACK: https://github.com/snowpack-model/snowpack ; openAMUNDSEN; COSIPY; SWE2HS https://gmd.copernicus.org/articles/16/4063/2023/ ; niViz https://code.wsl.ch/snow-models/niviz
