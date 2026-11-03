import { type Polygon, bounds, boundsOverlap, polygonsOverlap, transformPolygon, centroid } from '../geom/polygon';
import { type Iso, rotationAngle } from '../geom/isometry';
import { developmentGroup } from '../tiles/coxeter';
import { dist } from '../geom/vec';

export interface PlacedCopy {
  iso: Iso;
  poly: Polygon;
  /** index of the rotation class (0 = identity orientation) */
  cls: number;
  overlapping: boolean;
}

export interface NetTiling {
  copies: PlacedCopy[];
  tiles: boolean;
  truncated: boolean;
  /** how the copies were produced */
  method: 'development' | 'conway' | 'ring';
}

/**
 * Place the net under the orientation-preserving development group of the
 * base tile and check for overlaps. For Coxeter bases this is a tiling.
 */
export function tileNet(base: Polygon, outline: Polygon, radiusFactor = 3, maxCount = 300): NetTiling {
  const c = centroid(base);
  const diameter = Math.max(...base.map((p) => dist(p, c))) * 2;
  const group = developmentGroup(base, diameter * radiusFactor, maxCount);
  const copies: PlacedCopy[] = group.direct.map((iso) => {
    const ang = ((rotationAngle(iso) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    return { iso, poly: transformPolygon(iso, outline), cls: Math.round((ang / (2 * Math.PI)) * 12) % 12, overlapping: false };
  });
  const bbs = copies.map((k) => bounds(k.poly));
  for (let i = 0; i < copies.length; i++)
    for (let j = i + 1; j < copies.length; j++) {
      if (!boundsOverlap(bbs[i]!, bbs[j]!)) continue;
      if (polygonsOverlap(copies[i]!.poly, copies[j]!.poly)) {
        copies[i]!.overlapping = true;
        copies[j]!.overlapping = true;
      }
    }
  return { copies, tiles: copies.every((k) => !k.overlapping), truncated: group.truncated, method: radiusFactor < 2 ? 'ring' : 'development' };
}

import { findConwayDecomposition, conwayTiling } from './conway';

/**
 * For tiles that are not tile-makers: look for a Conway (p2) decomposition of
 * the net and tile with it; otherwise show the first ring of the development
 * so that the overlap is visible.
 */
export function tileNetGeneral(base: Polygon, outline: Polygon): NetTiling {
  const dec = findConwayDecomposition(outline);
  if (dec) {
    const r = conwayTiling(outline, dec);
    if (r.tiles) return { copies: r.copies, tiles: true, truncated: false, method: 'conway' };
  }
  const ring = tileNet(base, outline, 1.2, 40);
  return { ...ring, tiles: false, method: 'ring' };
}
