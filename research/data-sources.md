# Live and historical data sources for the Australian Alps (verified 2026-09-15)

Research summary (Claude subagent). All curl tests run from an Australian IP plus one off-shore check.

## Headline findings
- Thredbo Top Station (BOM 071032, 1957 m): WMO id **95909**. Thredbo Village 95908, Perisher Valley AWS 94915, Cabramurra SMHEA AWS 95916. Charlotte Pass has no live AWS.
- BOM live-obs JSON works: `https://www.bom.gov.au/fwo/IDN60801/IDN60801.95909.json` → 200 with a browser User-Agent. Blocking is by **User-Agent (Akamai bot rule)**: default curl/python/wget UAs → 403. Empty UA also → 200.
- **`reg.bom.gov.au` is the permissive mirror**: same files, 200 with any UA, and the only host that answered from off-shore (www → 403 off-shore; api.weather.bom.gov.au timed out off-shore). Use `reg.bom.gov.au` from GitHub Actions.
- Anonymous FTP (`ftp://ftp.bom.gov.au/anon/gen/fwo/`) works and includes Thredbo Top.

## 1. BOM 72-hour latest observations
- `https://reg.bom.gov.au/fwo/IDN60910/IDN60910.95909.json` — richest variant (adds `rain_ten`, `rain_hour`, `wind_dir_deg`, `aifstime_local`). Also `IDN60801/IDN60801.95909.json|.axf`, `.shtml`.
- `observations.data[]` newest-first; ~209 rows / 72 h (30-min cadence + METAR extras). Fields: `aifstime_utc`, `local_date_time_full`, `air_temp`, `apparent_t`, `dewpt`, `rel_hum`, `delta_t`, `wind_dir`, `wind_spd_kmh`, `gust_kmh`, `press*`, `rain_trace` (since 9 am, string), `vis_km`, `weather`, `cloud*` (null at this AWS).
- Refresh ≈ every 10 min. **72 h rolling only** → poll at least every ~2 days to build a record. Gotchas: literal tabs in JSON; `rain_trace` resets at 9 am local; times in AEST/AEDT.
- Newer API: `https://api.weather.bom.gov.au/v1/locations?search=thredbo` → geohash `r392qkf` "Thredbo Top Station"; observations need the 6-char geohash `…/locations/r392qk/observations` → latest single reading only. Timed out off-shore. Low value.

## 2. Daily climate history
- Climate Data Online (`jsp/ncc/cdio/weatherData/av?…p_stn_num=071032`) → 403 on www in every variant; "temporarily unavailable" on reg. **Dead for automation.**
- **Working substitute: Daily Weather Observations CSVs**, product IDCJDW2132 (Thredbo Top) / IDCJDW2133 (Thredbo Village): `https://reg.bom.gov.au/climate/dwo/202609/text/IDCJDW2132.202609.csv` → 200 (Jun–Sep 2026 all 200; ≈14-month rolling window). Columns: Date, Min/Max temp, Rainfall (24 h to 9 am), Evaporation, Sunshine, max gust dir/speed/time, 9 am & 3 pm temp/RH/cloud/wind/MSL pressure. Latin-1 encoded. Updated daily ~00:36 UTC. Sept 2026: 3 Sep 22.0 mm, 5 Sep 27.0 mm, 6 Sep 56.8 mm, gust 115 km/h on 5 Sep.

## 3. Anonymous FTP / bulk
- `IDN60920.xml` (NSW all-stations latest obs, one period per station, ~10-min refresh). HTTP: `https://reg.bom.gov.au/fwo/IDN60920.xml`.
- `IDN60910.tgz` (4.4 MB, all stations' 72-h products). HTTP: `https://reg.bom.gov.au/fwo/IDN60910.tgz`.

## 4. Reachability from GitHub Actions / non-AU IPs
Off-shore: www → 403; reg → 200 for obs JSON, IDN60920.xml, DWO CSVs; api.weather → timeout; Snowy Hydro getData.php → 200. Community reports (Whirlpool, bomrang #137, HA integrations): Akamai bot detection on UA/request pattern; workarounds are browser UA, `reg.bom.gov.au`, FTP. Recommendation for CI: `reg.bom.gov.au` + browser UA, retry on 403, FTP fallback.

## 5. Snowy Hydro snow depths
- Chart data: **`https://www.snowyhydro.com.au/wp-content/themes/snowyhydro/inc/getData.php?yearA=2026&yearB=2025`** → JSON, any UA, works off-shore, any two years back to ≥1990.
- Format: `{"2026":{"snowyhydro":{"level":[{"-date":"2026-09-10","lake":[…],"snow":{"-name":"Spencers Creek","-dataTimestamp":"…","-quality":"G","#text":"21.8"}}, …]}}, "2025":{…}}`. `snow` absent on days without a reading, a dict for one site, a list for several. Depth in cm.
- 2026 Spencers Creek (1830 m): 15 Jul 70.8, 21 Jul 68.0, 5 Aug 87.1, **13 Aug 94.5 (peak)**, 19 Aug 90.2, 28 Aug 55.9, 3 Sep 31.2, 10 Sep 21.8. Deep Creek max 8.3 (6 Aug); Three Mile Dam max 5.5 (11 Aug). Roughly weekly.

## 6. Other alpine sources
- Thredbo resort feed: `https://www.thredbo.com.au/feeds/snow-report/` → XML (snow24/48/72Hours, season, base, text forecasts). Live only; zeros out of season.
- Perisher / Charlotte Pass: HTML only, no feeds. Perisher quotes Snowy Hydro Spencers Creek for natural depth.
- **Mountain Safety Collective**: `POST https://api.mountainsafetycollective.org/embedd/get_view_data_by_date` with `{"date":"2026-08-13"}`, no auth → `reports[]` (Dividing Range, Main Range) with `snowpack_summary`, `weather_summary`, `hazard_summary`, `alpine_hazards[]` ratings. Daily qualitative context; last 2026 report 2026-08-31.
- theweatherchaser (paywalled CSV), weatherzone (HTML daily summaries).

## Ranking for an hourly Jun–Sep record at Thredbo Top
1. `reg.bom.gov.au/fwo/IDN60910/IDN60910.95909.json` — sub-hourly, full met fields, only 72 h → archive from now (poll ≤ daily).
2. DWO CSVs — whole season at daily resolution.
3. Snowy Hydro getData — weekly Spencers Creek depth, best ground truth, back to 1990.
4. MSC daily summaries — qualitative snowpack/weather by date.
5. IDN60920.xml / api.weather — latest reading only.
6. Thredbo feed — resort snowfall, live only.
