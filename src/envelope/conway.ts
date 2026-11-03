/**
 * Conway criterion: a closed curve tiles the plane (by translations and
 * half-turns, group p2) if its boundary splits into six consecutive arcs
 * A B C D E F such that D is a translate of A (traversed backwards) and
 * B, C, E, F are each centrally symmetric; some arcs may be empty.
 * Akiyama–Matsunaga (2019): every unfolding of an envelope is such a tile.
 */
import { type Vec, dist, sub, add, scale, cross, dot } from '../geom/vec';
import { type Polygon, bounds, boundsOverlap, polygonsOverlap, transformPolygon, centroid } from '../geom/polygon';
import { type Iso, IDENTITY, compose, halfTurn, translation, isoKey, apply, invert, rotationAngle } from '../geom/isometry';

export interface ConwayDecomposition {
  /** indices into the outline of the break points p0..p5 (A = p0→p1, B = p1→p2, …) */
  breaks: [number, number, number, number, number, number];
  /** translation taking A onto D */
  t: Vec;
  /** half-turn centres of the non-empty arcs B, C, E, F */
  centres: Vec[];
}

class Boundary {
  readonly n: number;
  readonly cum: number[];
  readonly total: number;
  constructor(readonly pts: Vec[]) {
    this.n = pts.length;
    this.cum = [0];
    for (let i = 0; i < this.n; i++) this.cum.push(this.cum[i]! + dist(pts[i]!, pts[(i + 1) % this.n]!));
    this.total = this.cum[this.n]!;
  }
  /** arc length from vertex i forward to vertex j */
  len(i: number, j: number): number {
    const d = this.cum[j]! - this.cum[i]!;
    return i <= j ? d : d + this.total;
  }
  /** point at arc length s (mod total) */
  at(s: number): Vec {
    s = ((s % this.total) + this.total) % this.total;
    let lo = 0;
    let hi = this.n;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid]! <= s) lo = mid;
      else hi = mid;
    }
    const a = this.pts[lo]!;
    const b = this.pts[(lo + 1) % this.n]!;
    const L = this.cum[lo + 1]! - this.cum[lo]!;
    const t = L > 0 ? (s - this.cum[lo]!) / L : 0;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }
  /** point at fraction f of the arc i→j */
  arcPoint(i: number, j: number, f: number): Vec {
    return this.at(this.cum[i]! + this.len(i, j) * f);
  }
}

const SAMPLES = 24;

function centrallySymmetric(b: Boundary, i: number, j: number, tol: number): Vec | null {
  const L = b.len(i, j);
  if (L <= tol) return null; // empty
  const c = scale(add(b.pts[i]!, b.pts[j]!), 0.5);
  for (let k = 1; k < SAMPLES; k++) {
    const f = k / SAMPLES;
    const p = b.arcPoint(i, j, f);
    const q = b.arcPoint(i, j, 1 - f);
    if (dist(scale(add(p, q), 0.5), c) > tol) return null;
  }
  return c;
}

function reversedTranslate(b: Boundary, i: number, j: number, k: number, l: number, tol: number): Vec | null {
  const La = b.len(i, j);
  const Ld = b.len(k, l);
  if (Math.abs(La - Ld) > tol) return null;
  const t = sub(b.pts[k]!, b.pts[j]!);
  if (dist(sub(b.pts[l]!, b.pts[i]!), t) > tol) return null;
  for (let s = 1; s < SAMPLES; s++) {
    const f = s / SAMPLES;
    const p = b.arcPoint(i, j, 1 - f);
    const q = b.arcPoint(k, l, f);
    if (dist(sub(q, p), t) > tol) return null;
  }
  return t;
}

/** Corner vertices of a sampled outline (turning angle above the threshold). */
export function cornerIndices(poly: Polygon, minTurnDeg = 8): number[] {
  const n = poly.length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[(i + n - 1) % n]!;
    const b = poly[i]!;
    const c = poly[(i + 1) % n]!;
    const u = sub(b, a);
    const v = sub(c, b);
    const ang = Math.abs(Math.atan2(cross(u, v), dot(u, v)));
    if (ang > (minTurnDeg * Math.PI) / 180) out.push(i);
  }
  return out;
}

export function findConwayDecomposition(outline: Polygon): ConwayDecomposition | null {
  const b = new Boundary(outline);
  const tol = b.total * 1.5e-3;
  let C = cornerIndices(outline);
  if (C.length > 48) C = C.slice(0, 48);
  if (C.length < 2) return null;
  const m = C.length;
  // palindrome table on candidate pairs (cyclic order), empty arcs count
  const pal = new Map<string, Vec | null | 'empty'>();
  const palAt = (i: number, j: number): Vec | null | 'empty' => {
    if (i === j) return 'empty';
    const k = `${i},${j}`;
    if (!pal.has(k)) pal.set(k, centrallySymmetric(b, i, j, tol));
    return pal.get(k)!;
  };
  // can the arc i→j be split into two centrally symmetric arcs at a candidate?
  const splitTwo = (i: number, j: number): { centres: Vec[]; c: number } | null => {
    if (i === j) return { centres: [], c: i };
    const fromIdx = C.indexOf(i);
    const toIdx = C.indexOf(j);
    for (let s = 0; s <= m; s++) {
      const ci = C[(fromIdx + s) % m]!;
      const p1 = palAt(i, ci);
      if (p1 === null) {
        if ((fromIdx + s) % m === toIdx) break;
        continue;
      }
      const p2 = palAt(ci, j);
      if (p2 !== null) {
        const centres: Vec[] = [];
        if (p1 !== 'empty') centres.push(p1);
        if (p2 !== 'empty') centres.push(p2);
        return { centres, c: ci };
      }
      if ((fromIdx + s) % m === toIdx) break;
    }
    return null;
  };
  // enumerate A = a→b and D = d→e in cyclic order a ≤ b ≤ d ≤ e (≤ a)
  for (let ia = 0; ia < m; ia++) {
    for (let sb = 0; sb < m; sb++) {
      const ib = (ia + sb) % m;
      const a = C[ia]!;
      const bb = C[ib]!;
      for (let sd = sb; sd < m; sd++) {
        const id = (ia + sd) % m;
        const d = C[id]!;
        for (let se = sd; se <= m; se++) {
          const ie = (ia + se) % m;
          if (se === m && sd !== sb) continue;
          const e = C[ie]!;
          let t: Vec | null;
          if (a === bb && d === e) t = { x: 0, y: 0 };
          else if (a === bb || d === e) continue;
          else t = reversedTranslate(b, a, bb, d, e, tol);
          if (!t) continue;
          const bc = splitTwo(bb, d);
          if (!bc) continue;
          const ef = splitTwo(e, a);
          if (!ef) continue;
          const centres = [...bc.centres, ...ef.centres];
          if (a === bb && centres.length < 2) continue;
          return { breaks: [a, bb, bc.c, d, e, ef.c], t, centres };
        }
      }
    }
  }
  return null;
}

export interface ConwayCopy {
  iso: Iso;
  poly: Polygon;
  cls: number;
  overlapping: boolean;
}

/** Place the tile under the p2 group generated by the decomposition and check overlaps. */
export function conwayTiling(outline: Polygon, dec: ConwayDecomposition, radiusFactor = 3, maxCount = 260): { copies: ConwayCopy[]; tiles: boolean } {
  const c0 = centroid(outline);
  const diameter = Math.max(...outline.map((p) => dist(p, c0))) * 2;
  const radius = diameter * radiusFactor;
  const gens: Iso[] = dec.centres.map((c) => halfTurn(c));
  if (dist(dec.t, { x: 0, y: 0 }) > 1e-9) {
    gens.push(translation(dec.t));
    gens.push(translation(scale(dec.t, -1)));
  }
  const seen = new Map<string, Iso>([[isoKey(IDENTITY), IDENTITY]]);
  const queue: Iso[] = [IDENTITY];
  while (queue.length && seen.size < maxCount) {
    const g = queue.shift()!;
    for (const s of gens) {
      const h = compose(g, s);
      if (dist(apply(h, c0), c0) > radius) continue;
      const k = isoKey(h);
      if (seen.has(k)) continue;
      seen.set(k, h);
      queue.push(h);
    }
  }
  const copies: ConwayCopy[] = [...seen.values()].map((iso) => ({
    iso,
    poly: transformPolygon(iso, outline),
    cls: Math.abs(rotationAngle(iso)) > 1 ? 6 : 0,
    overlapping: false,
  }));
  const bbs = copies.map((k) => bounds(k.poly));
  for (let i = 0; i < copies.length; i++)
    for (let j = i + 1; j < copies.length; j++) {
      if (!boundsOverlap(bbs[i]!, bbs[j]!)) continue;
      if (polygonsOverlap(copies[i]!.poly, copies[j]!.poly)) {
        copies[i]!.overlapping = true;
        copies[j]!.overlapping = true;
      }
    }
  return { copies, tiles: copies.every((k) => !k.overlapping) };
}

export { invert };
