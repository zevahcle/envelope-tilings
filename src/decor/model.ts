/**
 * Decorations drawn inside a tile, in the tile's own coordinates.
 *
 * Every copy of the tile in a tiling shows the decoration through its own
 * isometry, so reflected copies show it mirrored. Points on the boundary
 * ("ports") are where connecting curves cross from one tile into the next:
 * a port p of one copy coincides with a point q of the neighbouring copy, and
 * q (in tile coordinates) is computed from the tiling itself. The set of
 * ports is closed under this matching ("orbit"), so a curve that ends at a
 * port always has a partner point in the neighbour where a curve can continue.
 */
import { type Vec, add, sub, scale, dist, normalize, len } from '../geom/vec';
import { type Polygon, signedArea, bounds, pointInPolygon } from '../geom/polygon';
import { type Iso, apply, invert } from '../geom/isometry';

export interface DecorCurve {
  /** boundary fractions of the two ends, in [0, 1) */
  a: number;
  b: number;
  color: string;
  /** stroke width in tile units */
  width: number;
  /** handle length as a fraction of the chord */
  bend: number;
}
export interface DecorStroke {
  pts: Vec[];
  color: string;
  width: number;
  opacity: number;
}
export interface DecorSwatch {
  pts: Vec[];
  color: string;
  opacity: number;
}
export interface Decor {
  /** user-placed ports, boundary fractions */
  ports: number[];
  curves: DecorCurve[];
  strokes: DecorStroke[];
  swatches: DecorSwatch[];
  /** tile fill colour, or null for the default */
  background: string | null;
}

export const emptyDecor = (): Decor => ({ ports: [], curves: [], strokes: [], swatches: [], background: null });

export const isEmptyDecor = (d: Decor): boolean =>
  !d.ports.length && !d.curves.length && !d.strokes.length && !d.swatches.length && !d.background;

const frac = (s: number): number => ((s % 1) + 1) % 1;

/** Arc-length parametrisation of a closed polygon by fractions in [0, 1). */
export class Boundary {
  readonly n: number;
  readonly cum: number[];
  readonly total: number;
  /** +1 for counter-clockwise, -1 for clockwise */
  readonly orient: number;
  constructor(readonly pts: Polygon) {
    this.n = pts.length;
    this.cum = [0];
    for (let i = 0; i < this.n; i++) this.cum.push(this.cum[i]! + dist(pts[i]!, pts[(i + 1) % this.n]!));
    this.total = this.cum[this.n]!;
    this.orient = signedArea(pts) >= 0 ? 1 : -1;
  }
  private seg(f: number): { i: number; t: number } {
    const s = frac(f) * this.total;
    let lo = 0;
    let hi = this.n;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid]! <= s) lo = mid;
      else hi = mid;
    }
    const L = this.cum[lo + 1]! - this.cum[lo]!;
    return { i: lo, t: L > 0 ? (s - this.cum[lo]!) / L : 0 };
  }
  at(f: number): Vec {
    const { i, t } = this.seg(f);
    const a = this.pts[i]!;
    const b = this.pts[(i + 1) % this.n]!;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  /** fraction of vertex i */
  vertexFrac(i: number): number {
    return this.cum[i]! / this.total;
  }
  /** unit normal pointing into the tile; averaged at vertices */
  inwardNormal(f: number): Vec {
    const { i, t } = this.seg(f);
    const dir = (k: number) => normalize(sub(this.pts[(k + 1) % this.n]!, this.pts[k % this.n]!));
    let d = dir(i);
    const L = this.cum[i + 1]! - this.cum[i]!;
    const near = (L * t < this.total * 1e-4) ? -1 : (L * (1 - t) < this.total * 1e-4 ? 1 : 0);
    if (near) d = normalize(add(d, dir((i + near + this.n) % this.n)));
    return scale({ x: -d.y, y: d.x }, this.orient);
  }
  /** nearest boundary point: fraction and distance */
  project(p: Vec): { f: number; d: number } {
    let best = { f: 0, d: Infinity };
    for (let i = 0; i < this.n; i++) {
      const a = this.pts[i]!;
      const b = this.pts[(i + 1) % this.n]!;
      const ab = sub(b, a);
      const L2 = ab.x * ab.x + ab.y * ab.y;
      const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / L2)) : 0;
      const q = { x: a.x + ab.x * t, y: a.y + ab.y * t };
      const d = dist(p, q);
      if (d < best.d) best = { f: (this.cum[i]! + t * Math.sqrt(L2)) / this.total, d };
    }
    return { f: frac(best.f), d: best.d };
  }
}

export interface Port {
  f: number;
  /** index of the orbit (ports that are images of each other) */
  orbit: number;
  /** placed by the user (or a curve end) rather than forced by the tiling */
  user: boolean;
}

const fracClose = (a: number, b: number, tol: number) => {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d) < tol;
};

/**
 * Close a set of boundary fractions under the matching given by a tiling.
 * `isos` place the tile in the plane; only contacts between copies count.
 */
export function portOrbits(tile: Polygon, isos: Iso[], seeds: number[], maxPorts = 160): Port[] {
  const B = new Boundary(tile);
  const bb = bounds(tile);
  const diam = Math.hypot(bb.maxX - bb.minX, bb.maxY - bb.minY);
  const eps = diam * 2e-5;
  const ftol = 2e-4;
  // spatial index of the copies' bounding boxes
  const cell = diam;
  const grid = new Map<string, number[]>();
  const inv = isos.map(invert);
  const boxes = isos.map((g) => bounds(tile.map((p) => apply(g, p))));
  boxes.forEach((b, k) => {
    for (let i = Math.floor(b.minX / cell); i <= Math.floor(b.maxX / cell); i++)
      for (let j = Math.floor(b.minY / cell); j <= Math.floor(b.maxY / cell); j++) {
        const key = `${i},${j}`;
        const list = grid.get(key);
        if (list) list.push(k);
        else grid.set(key, [k]);
      }
  });
  const ports: Port[] = [];
  const find = (f: number) => ports.find((p) => fracClose(p.f, f, ftol));
  let orbit = 0;
  for (const seed of seeds) {
    const s0 = frac(seed);
    const existing = find(s0);
    if (existing) {
      existing.user = true;
      continue;
    }
    ports.push({ f: s0, orbit, user: true });
    const queue = [s0];
    while (queue.length && ports.length < maxPorts) {
      const f = queue.shift()!;
      const p = B.at(f);
      for (let t = 0; t < isos.length; t++) {
        const w = apply(isos[t]!, p);
        const list = grid.get(`${Math.floor(w.x / cell)},${Math.floor(w.y / cell)}`) ?? [];
        for (const u of list) {
          if (u === t) continue;
          const b = boxes[u]!;
          if (w.x < b.minX - eps || w.x > b.maxX + eps || w.y < b.minY - eps || w.y > b.maxY + eps) continue;
          const q = B.project(apply(inv[u]!, w));
          if (q.d > eps) continue;
          if (find(q.f)) continue;
          ports.push({ f: q.f, orbit, user: false });
          queue.push(q.f);
        }
      }
    }
    orbit++;
  }
  return ports.sort((a, b) => a.f - b.f);
}

/** Sampled cubic Bézier leaving and entering perpendicular to the boundary, so curves continue smoothly into neighbours. */
export function curvePoints(B: Boundary, c: DecorCurve, samples = 40): Vec[] {
  const A = B.at(c.a);
  const Z = B.at(c.b);
  const k = Math.max(dist(A, Z), B.total * 0.02) * c.bend;
  const P1 = add(A, scale(B.inwardNormal(c.a), k));
  const P2 = add(Z, scale(B.inwardNormal(c.b), k));
  const out: Vec[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const u = 1 - t;
    out.push({
      x: u * u * u * A.x + 3 * u * u * t * P1.x + 3 * u * t * t * P2.x + t * t * t * Z.x,
      y: u * u * u * A.y + 3 * u * u * t * P1.y + 3 * u * t * t * P2.y + t * t * t * Z.y,
    });
  }
  return out;
}

/** Midpoints (by arc length) of the sides between consecutive corners. */
export function sideMidpoints(B: Boundary, corners: number[]): number[] {
  if (corners.length < 2) return [0, 0.25, 0.5, 0.75];
  const fs = corners.map((i) => B.vertexFrac(i)).sort((a, b) => a - b);
  return fs.map((f, k) => {
    const g = k + 1 < fs.length ? fs[k + 1]! : fs[0]! + 1;
    return frac((f + g) / 2);
  });
}

/** Line width in tile units for a brush setting given in percent. */
export function brushWidth(tile: Polygon, brush: number): number {
  const b = bounds(tile);
  return (brush / 100) * Math.hypot(b.maxX - b.minX, b.maxY - b.minY) * 0.25;
}

export function distToPolyline(p: Vec, pts: Vec[]): number {
  let d = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!;
    const ab = sub(pts[i + 1]!, a);
    const L2 = ab.x * ab.x + ab.y * ab.y;
    const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y) / L2)) : 0;
    d = Math.min(d, len(sub(p, { x: a.x + ab.x * t, y: a.y + ab.y * t })));
  }
  return d;
}

export type DecorHit = { kind: 'curve' | 'stroke' | 'swatch'; index: number };

/** Topmost decoration item under p (curves, then strokes, then swatches). */
export function hitTest(B: Boundary, d: Decor, p: Vec, tol: number): DecorHit | null {
  for (let i = d.curves.length - 1; i >= 0; i--) {
    const c = d.curves[i]!;
    if (distToPolyline(p, curvePoints(B, c)) <= tol + c.width / 2) return { kind: 'curve', index: i };
  }
  for (let i = d.strokes.length - 1; i >= 0; i--) {
    const s = d.strokes[i]!;
    if (distToPolyline(p, s.pts) <= tol + s.width / 2) return { kind: 'stroke', index: i };
  }
  for (let i = d.swatches.length - 1; i >= 0; i--) if (pointInPolygon(p, d.swatches[i]!.pts)) return { kind: 'swatch', index: i };
  return null;
}

export function circlePoints(c: Vec, r: number, n = 36): Vec[] {
  return Array.from({ length: n }, (_, i) => ({ x: c.x + r * Math.cos((2 * Math.PI * i) / n), y: c.y + r * Math.sin((2 * Math.PI * i) / n) }));
}

/** Small deterministic PRNG for presets. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
