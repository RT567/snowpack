// Grain types per the International Classification for Seasonal Snow on the Ground (IACS 2009),
// their standard colours, and the hand hardness scale.
export const GRAIN = {
  PP: { name: 'new snow', colour: '#00ff00' },          // precipitation particles
  DF: { name: 'decomposing new snow', colour: '#228b22' },
  RG: { name: 'rounded grains', colour: '#ffb6c1' },
  FC: { name: 'facets', colour: '#add8e6' },
  DH: { name: 'depth hoar', colour: '#0000ff' },
  SH: { name: 'surface hoar', colour: '#ff00ff' },
  MF: { name: 'melt-freeze', colour: '#ff0000' },
  IF: { name: 'ice', colour: '#00ffff' },
};

export const PERSISTENT = new Set(['SH', 'FC', 'DH']);

// Hand hardness index: 1 F (fist), 2 4F, 3 1F, 4 P (pencil), 5 K (knife), 6 I (ice).
export const HARDNESS_NAMES = ['', 'F', '4F', '1F', 'P', 'K', 'I'];

/** Continuous hand hardness (1..6) from density and grain type (after Geldsetzer & Jamieson 2000). */
export function hardness(layer) {
  const { grain } = layer;
  const rho = layer.thick > 0 ? layer.swe / layer.thick : (layer.rho ?? 0);
  if (grain === 'IF') return 6;
  if (grain === 'SH') return 1;
  // density → index, piecewise linear through class midpoints
  const pts = [[60, 1], [150, 1.5], [200, 2], [270, 3], [350, 4], [450, 5], [700, 6]];
  let h = 1;
  if (rho >= pts[pts.length - 1][0]) h = 6;
  else for (let i = 1; i < pts.length; i++) {
    if (rho < pts[i][0]) { const [r0, h0] = pts[i - 1], [r1, h1] = pts[i]; h = h0 + (h1 - h0) * (rho - r0) / (r1 - r0); break; }
  }
  if (grain === 'PP') h = Math.min(h, 1.3);
  if (grain === 'FC' || grain === 'DH') h = Math.min(h, 2.5);
  if (grain === 'MF') h = layer.lwc > 0 ? Math.max(1, h - 1) : Math.min(6, h + 1); // wet MF is soft, refrozen crust is hard
  return Math.max(1, Math.min(6, h));
}

export function hardnessName(h) {
  return HARDNESS_NAMES[Math.max(1, Math.min(6, Math.round(h)))];
}
