import { type Vec, cross, sub, add, scale, EPS, approxEq, closestOnSegment } from './vec';
import { type Iso, apply } from './isometry';
import { polylineSelfIntersects, polylinesCross } from './intersect';

export type Polygon = Vec[];

export function signedArea(poly: Polygon): number {
  let s = 0;
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % n]!;
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
}

export const area = (poly: Polygon): number => Math.abs(signedArea(poly));
export const isCCW = (poly: Polygon): boolean => signedArea(poly) > 0;
export const ensureCCW = (poly: Polygon): Polygon => (isCCW(poly) ? poly : [...poly].reverse());

export function centroid(poly: Polygon): Vec {
  const n = poly.length;
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % n]!;
    const w = p.x * q.y - q.x * p.y;
    a += w;
    cx += (p.x + q.x) * w;
    cy += (p.y + q.y) * w;
  }
  if (Math.abs(a) < EPS) {
    const s = poly.reduce((acc, p) => add(acc, p), { x: 0, y: 0 });
    return scale(s, 1 / Math.max(1, n));
  }
  return { x: cx / (3 * a), y: cy / (3 * a) };
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function bounds(pts: Vec[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export const boundsOverlap = (a: Bounds, b: Bounds, pad = 0): boolean =>
  a.minX <= b.maxX + pad && b.minX <= a.maxX + pad && a.minY <= b.maxY + pad && b.minY <= a.maxY + pad;

export function edges(poly: Polygon): [Vec, Vec][] {
  return poly.map((p, i) => [p, poly[(i + 1) % poly.length]!]);
}

/** Even-odd ray casting. Points on the boundary give an unspecified answer. */
export function pointInPolygon(p: Vec, poly: Polygon): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y) {
      const x = ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
      if (p.x < x) inside = !inside;
    }
  }
  return inside;
}

/** Distance from p to the boundary of the polygon. */
export function distanceToBoundary(p: Vec, poly: Polygon): number {
  let best = Infinity;
  for (const [a, b] of edges(poly)) best = Math.min(best, closestOnSegment(p, a, b).dist);
  return best;
}

export const isSimple = (poly: Polygon): boolean =>
  poly.length >= 3 && !polylineSelfIntersects(poly, true);

export const transformPolygon = (g: Iso, poly: Polygon): Polygon => poly.map((p) => apply(g, p));

/**
 * A point strictly inside a simple polygon: the centroid of an "ear"
 * (a convex corner whose triangle contains no other vertex).
 */
export function interiorPoint(poly: Polygon): Vec {
  const p = ensureCCW(poly);
  const n = p.length;
  for (let i = 0; i < n; i++) {
    const a = p[(i + n - 1) % n]!;
    const b = p[i]!;
    const c = p[(i + 1) % n]!;
    if (cross(sub(b, a), sub(c, b)) <= EPS) continue; // reflex or straight
    const tri = [a, b, c];
    let clean = true;
    for (let j = 0; j < n && clean; j++) {
      if (j === i || j === (i + n - 1) % n || j === (i + 1) % n) continue;
      const q = p[j]!;
      if (approxEq(q, a) || approxEq(q, b) || approxEq(q, c)) continue;
      if (pointInPolygon(q, tri)) clean = false;
    }
    if (clean) return centroid(tri);
  }
  return centroid(p);
}

/**
 * Do two simple polygons overlap in a region of positive area?
 * Shared edges and touching corners do not count.
 */
export function polygonsOverlap(a: Polygon, b: Polygon): boolean {
  if (!boundsOverlap(bounds(a), bounds(b))) return false;
  if (polylinesCross(a, b)) return true;
  if (pointInPolygon(interiorPoint(a), b)) return true;
  if (pointInPolygon(interiorPoint(b), a)) return true;
  return false;
}

export function regularPolygon(n: number, circumradius = 1, phase = 0): Polygon {
  const out: Polygon = [];
  for (let i = 0; i < n; i++) {
    const t = phase + (2 * Math.PI * i) / n;
    out.push({ x: circumradius * Math.cos(t), y: circumradius * Math.sin(t) });
  }
  return out;
}

export function interiorAngles(poly: Polygon): number[] {
  const p = ensureCCW(poly);
  const n = p.length;
  return p.map((b, i) => {
    const a = p[(i + n - 1) % n]!;
    const c = p[(i + 1) % n]!;
    const u = sub(a, b);
    const v = sub(c, b);
    let ang = Math.atan2(cross(v, u), u.x * v.x + u.y * v.y);
    if (ang < 0) ang += 2 * Math.PI;
    return ang;
  });
}
