import { type Vec, sub, dist, dot, lerp, lineSide, scale, add } from './vec';

/** Ramer–Douglas–Peucker simplification. */
export function rdp(pts: Vec[], epsilon: number): Vec[] {
  if (pts.length < 3) return pts.slice();
  const first = pts[0]!;
  const last = pts[pts.length - 1]!;
  let maxD = -1;
  let idx = -1;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(lineSide(pts[i]!, first, last));
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD > epsilon) {
    const left = rdp(pts.slice(0, idx + 1), epsilon);
    const right = rdp(pts.slice(idx), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

/** Uniform Catmull-Rom spline through the points, `samples` points per span. */
export function catmullRom(pts: Vec[], samples = 8): Vec[] {
  if (pts.length < 3) return pts.slice();
  const out: Vec[] = [];
  const P = [pts[0]!, ...pts, pts[pts.length - 1]!];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1]!;
    const p1 = P[i]!;
    const p2 = P[i + 1]!;
    const p3 = P[i + 2]!;
    for (let k = 0; k < samples; k++) {
      const t = k / samples;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

export function polylineLength(pts: Vec[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1]!, pts[i]!);
  return s;
}

/** Resample by arc length to exactly n points, keeping both endpoints. */
export function resample(pts: Vec[], n: number): Vec[] {
  if (pts.length === 0) return [];
  if (pts.length === 1 || n <= 1) return [pts[0]!];
  const total = polylineLength(pts);
  if (total === 0) return Array.from({ length: n }, () => pts[0]!);
  const out: Vec[] = [pts[0]!];
  let seg = 0;
  let segStart = 0;
  let segLen = dist(pts[0]!, pts[1]!);
  for (let k = 1; k < n - 1; k++) {
    const target = (total * k) / (n - 1);
    while (segStart + segLen < target && seg < pts.length - 2) {
      segStart += segLen;
      seg++;
      segLen = dist(pts[seg]!, pts[seg + 1]!);
    }
    const t = segLen === 0 ? 0 : (target - segStart) / segLen;
    out.push(lerp(pts[seg]!, pts[seg + 1]!, t));
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

/** Freehand stroke → smooth polyline: simplify, spline, resample. */
export function smoothStroke(pts: Vec[], tolerance: number, samples = 64): Vec[] {
  const simplified = rdp(pts, tolerance);
  const spline = catmullRom(simplified, 6);
  const n = Math.max(8, Math.min(samples, Math.round(polylineLength(spline) / tolerance)));
  return resample(spline, n);
}

/* ------------------------------------------------------------------------ */
/* Edge-local coordinates (used by the seam mode and the fold animation).    */

export interface EdgeFrame {
  origin: Vec;
  /** unit tangent v0→v1 */
  u: Vec;
  /** outward normal for a counter-clockwise polygon (right of the tangent) */
  n: Vec;
  L: number;
}

export function edgeFrame(v0: Vec, v1: Vec): EdgeFrame {
  const d = sub(v1, v0);
  const L = Math.hypot(d.x, d.y);
  const u = L === 0 ? { x: 1, y: 0 } : scale(d, 1 / L);
  return { origin: v0, u, n: { x: u.y, y: -u.x }, L };
}

export const toLocal = (f: EdgeFrame, p: Vec): Vec => {
  const d = sub(p, f.origin);
  return { x: dot(d, f.u), y: dot(d, f.n) };
};

export const fromLocal = (f: EdgeFrame, q: Vec): Vec =>
  add(f.origin, add(scale(f.u, q.x), scale(f.n, q.y)));

/** Klein four-group acting on edge curves in local coordinates. */
export type KleinElement = 'I' | 'R' | 'M' | 'RM';

export function kleinApply(h: KleinElement, c: Vec[], L: number): Vec[] {
  switch (h) {
    case 'I':
      return c.slice();
    case 'R': // half-turn about the midpoint: (x,y)(t) ↦ (L − x(1−t), −y(1−t))
      return [...c].reverse().map((p) => ({ x: L - p.x, y: -p.y }));
    case 'M': // reflection in the edge line
      return c.map((p) => ({ x: p.x, y: -p.y }));
    case 'RM': // reflection in the perpendicular bisector
      return [...c].reverse().map((p) => ({ x: L - p.x, y: p.y }));
  }
}

export const kleinMul = (g: KleinElement, h: KleinElement): KleinElement => {
  if (g === 'I') return h;
  if (h === 'I') return g;
  if (g === h) return 'I';
  const s = new Set([g, h]);
  if (s.has('R') && s.has('M')) return 'RM';
  if (s.has('R') && s.has('RM')) return 'M';
  return 'R';
};

/** Average of h(c) over h in the subgroup H; makes c invariant under H. */
export function symmetrize(c: Vec[], L: number, H: KleinElement[]): Vec[] {
  const imgs = H.map((h) => kleinApply(h, c, L));
  return c.map((_, i) => {
    let x = 0;
    let y = 0;
    for (const img of imgs) {
      x += img[i]!.x;
      y += img[i]!.y;
    }
    return { x: x / imgs.length, y: y / imgs.length };
  });
}
