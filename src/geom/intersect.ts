import { type Vec, cross, sub, EPS, closestOnSegment } from './vec';

const orient = (a: Vec, b: Vec, c: Vec): number => cross(sub(b, a), sub(c, a));

/**
 * True when the open segments (p1,p2) and (p3,p4) cross at a single interior
 * point of both. Touching at endpoints, T-junctions and collinear overlaps
 * are NOT counted (they are legitimate in tilings).
 */
export function segmentsCrossProperly(p1: Vec, p2: Vec, p3: Vec, p4: Vec, eps = 1e-9): boolean {
  const d1 = orient(p3, p4, p1);
  const d2 = orient(p3, p4, p2);
  const d3 = orient(p1, p2, p3);
  const d4 = orient(p1, p2, p4);
  return (
    ((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) &&
    ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))
  );
}

/** Intersection point of the closed segments, or null if they do not meet (collinear overlaps return null). */
export function segmentIntersection(p1: Vec, p2: Vec, p3: Vec, p4: Vec, eps = 1e-9): Vec | null {
  const r = sub(p2, p1);
  const s = sub(p4, p3);
  const denom = cross(r, s);
  if (Math.abs(denom) < eps) return null;
  const qp = sub(p3, p1);
  const t = cross(qp, s) / denom;
  const u = cross(qp, r) / denom;
  if (t < -eps || t > 1 + eps || u < -eps || u > 1 + eps) return null;
  return { x: p1.x + t * r.x, y: p1.y + t * r.y };
}

/** Uniform grid broad phase over segments of one or more polylines. */
class SegmentGrid {
  private cells = new Map<string, number[]>();
  private cell: number;
  constructor(
    private segs: [Vec, Vec][],
    cellSize?: number,
  ) {
    let total = 0;
    for (const [a, b] of segs) total += Math.hypot(b.x - a.x, b.y - a.y);
    this.cell = cellSize ?? Math.max((total / Math.max(1, segs.length)) * 2, 1e-6);
    segs.forEach((s, i) => this.forCells(s, (k) => {
      const arr = this.cells.get(k);
      if (arr) arr.push(i);
      else this.cells.set(k, [i]);
    }));
  }
  private forCells([a, b]: [Vec, Vec], fn: (k: string) => void): void {
    const x0 = Math.floor(Math.min(a.x, b.x) / this.cell);
    const x1 = Math.floor(Math.max(a.x, b.x) / this.cell);
    const y0 = Math.floor(Math.min(a.y, b.y) / this.cell);
    const y1 = Math.floor(Math.max(a.y, b.y) / this.cell);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) fn(`${x},${y}`);
  }
  candidates(seg: [Vec, Vec]): Set<number> {
    const out = new Set<number>();
    this.forCells(seg, (k) => {
      const arr = this.cells.get(k);
      if (arr) for (const i of arr) out.add(i);
    });
    return out;
  }
  get segments(): [Vec, Vec][] {
    return this.segs;
  }
}

export function polylineSegments(pts: Vec[], closed: boolean): [Vec, Vec][] {
  const out: [Vec, Vec][] = [];
  const n = pts.length;
  for (let i = 0; i + 1 < n; i++) out.push([pts[i]!, pts[i + 1]!]);
  if (closed && n > 2) out.push([pts[n - 1]!, pts[0]!]);
  return out;
}

/** Does the polyline (closed or open) cross itself properly? */
export function polylineSelfIntersects(pts: Vec[], closed: boolean, eps = 1e-9): boolean {
  const segs = polylineSegments(pts, closed);
  const n = segs.length;
  if (n < 3) return false;
  const grid = new SegmentGrid(segs);
  for (let i = 0; i < n; i++) {
    const si = segs[i]!;
    for (const j of grid.candidates(si)) {
      if (j <= i) continue;
      const adjacent = j === i + 1 || (closed && i === 0 && j === n - 1);
      if (adjacent) continue;
      if (segmentsCrossProperly(si[0], si[1], segs[j]![0], segs[j]![1], eps)) return true;
    }
  }
  return false;
}

/** Any proper crossing between segments of A and segments of B. */
export function polylinesCross(a: Vec[], b: Vec[], closedA = true, closedB = true, eps = 1e-9): boolean {
  const sa = polylineSegments(a, closedA);
  const sb = polylineSegments(b, closedB);
  if (sa.length === 0 || sb.length === 0) return false;
  const grid = new SegmentGrid(sa);
  for (const s of sb) {
    for (const i of grid.candidates(s)) {
      const t = sa[i]!;
      if (segmentsCrossProperly(t[0], t[1], s[0], s[1], eps)) return true;
    }
  }
  return false;
}

/** Index of the polyline segment closest to p (within maxDist), with the closest point. */
export function nearestSegment(
  pts: Vec[],
  closed: boolean,
  p: Vec,
  maxDist = Infinity,
): { index: number; point: Vec; t: number; dist: number } | null {
  let best: { index: number; point: Vec; t: number; dist: number } | null = null;
  polylineSegments(pts, closed).forEach(([a, b], index) => {
    const c = closestOnSegment(p, a, b);
    if (c.dist <= maxDist && (!best || c.dist < best.dist)) best = { index, ...c };
  });
  return best;
}

export { EPS };
