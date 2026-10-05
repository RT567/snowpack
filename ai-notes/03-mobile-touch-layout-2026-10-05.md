# Phone/tablet layout: tap to select, one thing open at a time — 2026-10-05

## Rob's brief
Desktop is good; leave it exactly as it was. On phones nothing hovers, and every panel was open at once on
top of the column. Wanted: tap a layer or boundary to select it (and it stays selected); tap empty space to
clear it, so the screen can be completely clear; layer and boundary info in one spot, one at a time, small,
along the bottom, never over the snowpack; weak layers ranked and the avalanche report as optional
pop-outs behind two small buttons ("weak layers", "av report"); a better time bar on mobile. Drop shear
load from the boundary card (phone only); keep "fell at".

## How it's switched
`touch = matchMedia('(hover: none) and (pointer: coarse)')` in `src/main.js` sets `body.touch`. Every
phone rule in `index.html` is scoped to `body.touch`, and every phone code path checks `touch` or
`e.pointerType === 'touch'`, so a mouse/desktop session runs the old code unchanged. The only shared change
is `row()` in `src/scene/column.js` now writes `data-k="<label>"` on each `<tr>` (no visual effect) so the
phone CSS can hide rows.

## Phone behaviour
- Tap = pointerdown→up on the canvas, one finger, < 10 px, < 500 ms. It runs the same `hoverAt()` as the
  mouse, so a hit selects and a miss clears. `lastPointer` keeps the tapped point so scrubbing time re-reads
  what is under it (like the desktop's arrow keys). Selections made from a list or report chip are dropped
  on a time change (they point at the old hour's column). Drags/pinches stay with OrbitControls.
- Hover-only events (`pointerenter/leave/over/out`) ignore `pointerType === 'touch'`; list rows and chips
  get `click` handlers on touch instead.
- Seam pick band widens to 5 cm on touch (`probe(..., 0.05)`; desktop keeps 2.5 cm).
- `openPanel('weak' | 'report' | null)`: one pop-out at a time, opening one clears the selection; choosing
  a row/chip closes it and shows that thing's card; a tap on the scene with a pop-out open only closes it.
  The av report button hides on days with nothing to report (`syncButtons()`).
- Cards (`#tip` layer, `#tip2` boundary): one visible (the other `display:none`, not dimmed), bottom of the
  screen above the time bar, 11.5 px, rows in two columns, max 28vh. Hidden on phone: shear load,
  above/below (the title already says "X over Y"), density.
- The scene is drawn shifted up (`camera.setViewOffset`, `TOUCH_SHIFT` = 17% of the height) and framed
  1.2× further out (`TOUCH_ZOOM_OUT`) so the column sits clear of the card. Raycasts use the same
  projection, so taps line up. At 390×844 the column spans roughly y 75–490 and the card starts ≥ 540.
- Time bar: full width less 22 px, bigger knob, invisible ±14 px finger margin, safe-area insets.

## Desktop change (requested the same day)
The weak list's max-height is set in `fitWeakList()` so it stops 16 px above the report (bottom left),
whatever that day's report length; thin dark scrollbar. Checked all 61 report days: gap ≥ 16 px.
