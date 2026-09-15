// The column's shape. A pit column has vertical walls cut with a shovel, but the snow it holds fell
// on a slope, so every layer boundary is tilted at the slope angle. We model that as sheared boxes:
// vertical thickness t/cos(slope), then y shifted by -x·tan(slope) so the slope descends toward +x.
import * as THREE from 'three';

export const SLOPE_DEG = 32;
export const SLOPE = (SLOPE_DEG * Math.PI) / 180;
export const TAN = Math.tan(SLOPE);
export const COS = Math.cos(SLOPE);

export const COLUMN_W = 0.4;   // m, square footprint
export const COLUMN_D = COLUMN_W;

/** Height of the slope surface (and of any layer boundary at base height 0) at across-slope position x. */
export function slopeY(x) { return -x * TAN; }

/** Vertical thickness of a layer whose slope-normal thickness is `thick`. */
export function vertical(thick) { return thick / COS; }

/** Downslope unit vector. */
export const DOWNSLOPE = new THREE.Vector3(COS, -Math.sin(SLOPE), 0);

/** A sheared box: footprint w × d, slope-normal thickness `thick`, boundaries parallel to the slope. */
export function layerGeometry(w, thick, d = w) {
  const g = new THREE.BoxGeometry(w, vertical(thick), d);
  // shear explicitly: y += -tan·x, walls stay vertical, top and bottom tilt with the slope
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) - TAN * pos.getX(i));
  pos.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** Height above the column base (measured vertically at that x) of a world point on the column. */
export function heightAt(point) { return point.y - slopeY(point.x); }
