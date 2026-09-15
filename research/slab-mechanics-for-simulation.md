# Bond strength and stability: numbers from the literature (read 2026-09-15)

Sources read directly (PDFs), not summarised second-hand:
- Jamieson, J.B. & Johnston, C.D. (2001). Evaluation of the shear frame test for weak snowpack layers. *Annals of Glaciology* 32, 59–68. https://www.cambridge.org/core/journals/annals-of-glaciology/article/evaluation-of-the-shear-frame-test-for-weak-snowpack-layers/4791931D28175E01ED68D28281308453
- Jamieson, J.B. & Johnston, C.D. (1995). Shear frame stability parameters for large-scale avalanche forecasting. *Annals of Glaciology* 18, 268–273. https://www.cambridge.org/core/journals/annals-of-glaciology/article/shear-frame-stability-parameters-for-largescale-avalanche-forecasting/27674933B969CB9B3859DD8BF1A2FD07
- Schweizer, J. & Jamieson, J.B. (2003). Snowpack properties for snow profile analysis. *Cold Regions Science and Technology* 37, 233–241. https://www.slf.ch/fileadmin/user_upload/WSL/Mitarbeitende/schweizj/Schweizer_Jamieson_Snow_profile_analysis_CRST_2003.pdf

## 1. Shear strength of a layer from its density and grain form (Jamieson & Johnston 2001, Table 8)

Σ∞ = A·(ρ/ρ_ice)^B, Σ∞ in kPa (size-corrected to a large specimen), ρ_ice = 917 kg/m³. From 809 sets of shear-frame tests, western Canada, 1989–95.

| grain form | N | density range | A | B | R² |
|---|---|---|---|---|---|
| precipitation particles (PP) | 12 | 50–110 | 5.32 | 1.35 | 0.42 |
| decomposed / fragmented (DF) | 79 | 51–270 | 12.4 | 1.68 | 0.56 |
| rounded grains (RG) | 16 | 105–270 | 8.54 | 1.26 | 0.45 |
| faceted crystals (FC) | 60 | 110–330 | 9.7 | 1.58 | 0.41 (log form: A 22.3, B 2.25, R² 0.58) |
| Group I (PP, DF, RG) | 107 | 50–270 | 14.5 | 1.73 | 0.63 |
| Group II (FC, DH) | 70 | 110–330 | 8.5 | 1.48 | 0.37 (log form: A 18.5, B 2.11, R² 0.54) |

Depth hoar alone and rounding facets did not correlate with density (too few data). Group II is 25–50 % weaker than Group I at the same density in the 125–250 kg/m³ range. Weak-layer strengths span 0.1 to at least 2 kPa (p. 67). Perla et al. (1982), cited on p. 67: strength decreases with grain size for RG, FC and melt-freeze grains, and decreases with temperature for FC and melt-freeze grains.

Worked values: PP at 100 kg/m³ → 0.27 kPa (Table 3 measured 0.18–0.35). RG at 250 → 1.66 kPa. FC at 250 → 1.24 kPa. Group I at 400 (a refrozen crust) → 3.5 kPa; at 500 → 5.1 kPa.

## 2. Buried surface hoar: measured strengths over time (Jamieson & Johnston 2001, Tables 3 and 6)

Surface hoar is too thin to sample for density, so no regression. Measured mean strengths (0.025 m² frame, uncorrected):
- Young layers, first days after burial: 0.30–0.65 kPa (e.g. 14 Feb 1992 0.386 → 17 Feb 0.645; 24 Feb 1993 0.476; 29 Jan 1995 1.20–1.29).
- Two to six weeks: 1.9–4.2 kPa (9 Feb 1995 3.71; 28 Feb 3.04; 7 Mar 4.19), 5.9 kPa by 29 Mar 1995.
- Facets: 0.61 (Apr 1992), 2.16–2.21 (Mar 1993). Decomposed/fragmented: 0.22–1.10. Graupel: 0.93–4.0.
Rate of gain for buried surface hoar from these series: roughly 0.1–0.2 kPa per day early on. Jamieson & Schweizer (2000, *J. Glaciol.* 46(152)) attribute the gain to the layer thinning and crystals penetrating the layers above and below. https://www.cambridge.org/core/journals/journal-of-glaciology/article/texture-and-strength-changes-of-buried-surfacehoar-layers-with-implications-for-dry-snowslab-avalanche-release/81EC2B3A4293814E15308A921C2F0AAC

## 3. Stress, friction and stability index (Jamieson & Johnston 1995)

- Overburden: σ_v = g·Σ(ρ_i h_i) (Eq. 2). Slope-parallel shear: σ_xz = σ_v·sinψ·cosψ; normal: σ_v·cos²ψ (Föhn 1987).
- Stability factor SF = Σ/σ_v (Eq. 1). Measured transition between unstable and stable days: **SF 1.56–1.78** (Table 1), close to the 1.5 used at Rogers Pass.
- Stability index with friction: S35 = (0.65·Σ_0.025 + σ_v·cos²35°·tanφ) / (σ_v·sin35°·cos35°) (Eq. 4), with Roch's (1966) internal friction **tanφ = 0.4 + 0.08·Σ∞** (Σ∞ in kPa). Transition values S35 = 2.71–3.00. Föhn's S for slopes that avalanched naturally averaged 2.3.
- Size correction: Σ∞ = 0.65·Σ_0.025 (Sommerfeld 1980).
- Case history (Feb 1991): a storm depositing 130 mm of water on a surface-hoar layer took the load to 1.2 kPa and produced numerous large dry slabs while SF sat below 1.6; strengths measured 0.07–4.03 kPa across the study.

## 4. What separates stable from unstable profiles (Schweizer & Jamieson 2003, 424 profiles)

Failure-layer shear strength (Canada, shear frame): **unstable median 0.77 kPa (N = 105), stable median 1.48 kPa (N = 82)**, p < 0.001. Load above the weak layer: medians 0.67–0.88 kPa. Slab density medians 130–200 kg/m³, slab thickness 45–47 cm, failure layer thickness 3 cm.

Critical ranges for an unstable profile (Table 3, combined data): rutschblock < 4; grain-size difference across the failure interface ≥ 0.75 mm; failure-layer grain size ≥ 1.25 mm; **hardness difference ≥ 1.7 steps; failure-layer hardness ≤ 1.3 (fist plus)**. Persistent grain types dominate failure layers.

## 5. How the simulation uses this (src/snow/mechanics.js)

- Layer strength Σ(ρ, grain) from Table 8: PP, DF, RG, FC by their own regressions; DH by the Group II log form; melt-freeze and ice by the Group I form (dense, well-bonded); surface hoar by age since burial, 0.35 kPa + 0.12 kPa/day, capped at 5 kPa (Table 3 series).
- Bond strength at an interface = the weaker of the two layers' strengths, ×0.5 if either holds liquid water (Brun & Rey 1987 report strength falling with liquid water; magnitude is our judgement), ×0.8 if the hand-hardness difference is ≥ 1.7 (Schweizer & Jamieson 2003 discriminator; the factor is our judgement).
- Shear load σ_xz and normal load from the overburden on the 32° slope; friction tanφ = 0.4 + 0.08·Σ (Roch).
- Stability index S = (Σ + σ_n·tanφ) / σ_xz. Colour: red at S ≤ 1.5, yellow near 2.5, green from 4 (transition bands 1.6–1.8 without friction, 2.7–3.0 with; we colour conservatively).
- Not represented: grain size, temperature dependence of strength, skier stress, propagation propensity.
