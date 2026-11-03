import { type Vec, approxEq, closestOnSegment, lerp, dist, dot, sub } from '../geom/vec';
import { type Polygon, area, ensureCCW, polygonsOverlap, transformPolygon, signedArea } from '../geom/polygon';
import { type Iso, reflection } from '../geom/isometry';
import { type Arrangement, buildArrangement } from '../geom/arrangement';

export interface Cut {
  id: string;
  pts: Vec[];
}

/** A hinge is remembered as a point on a base edge; it is re-resolved to a piece after every edit. */
export interface HingeSpec {
  edgeIndex: number;
  t: number;
}

export interface BoundaryRun {
  edgeIndex: number;
  a: Vec;
  b: Vec;
  /** arrangement vertex ids */
  ia: number;
  ib: number;
}

export interface Piece {
  index: number;
  poly: Polygon;
  runs: BoundaryRun[];
  hinge: BoundaryRun | null;
}

export interface Flap {
  piece: Piece;
  hinge: BoundaryRun;
  mirror: Iso;
  poly: Polygon;
  /** overlaps the back sheet or another flap */
  conflict: boolean;
}

export interface Unfolding {
  base: Polygon;
  arrangement: Arrangement;
  pieces: Piece[];
  flaps: Flap[];
  outline: Polygon | null;
  problems: string[];
  /** every piece has a hinge and the cut set is a connected tree */
  validCuts: boolean;
  flattens: boolean;
  areaRatio: number;
}

const EPS = 1e-7;

function runsOfFace(base: Polygon, loop: number[], verts: Vec[]): BoundaryRun[] {
  const runs: BoundaryRun[] = [];
  const n = base.length;
  for (let i = 0; i < loop.length; i++) {
    const ia = loop[i]!;
    const ib = loop[(i + 1) % loop.length]!;
    const a = verts[ia]!;
    const b = verts[ib]!;
    for (let k = 0; k < n; k++) {
      const e0 = base[k]!;
      const e1 = base[(k + 1) % n]!;
      if (closestOnSegment(a, e0, e1).dist > EPS || closestOnSegment(b, e0, e1).dist > EPS) continue;
      if (dot(sub(b, a), sub(e1, e0)) <= 0) continue; // must follow the base orientation
      runs.push({ edgeIndex: k, a, b, ia, ib });
      break;
    }
  }
  return runs;
}

function resolveHinge(base: Polygon, piece: Piece, specs: HingeSpec[]): BoundaryRun | null {
  for (const s of specs) {
    const e0 = base[s.edgeIndex];
    const e1 = base[(s.edgeIndex + 1) % base.length];
    if (!e0 || !e1) continue;
    const p = lerp(e0, e1, s.t);
    for (const r of piece.runs) {
      if (r.edgeIndex !== s.edgeIndex) continue;
      const c = closestOnSegment(p, r.a, r.b);
      if (c.dist <= 1e-6 && c.t > -1e-9 && c.t < 1 + 1e-9) return r;
    }
  }
  if (piece.runs.length === 0) return null;
  return piece.runs.reduce((best, r) => (dist(r.a, r.b) > dist(best.a, best.b) ? r : best));
}

/** Specification for the hinge of `piece` placed on run `run` (its midpoint). */
export function hingeSpecFor(base: Polygon, run: BoundaryRun): HingeSpec {
  const e0 = base[run.edgeIndex]!;
  const e1 = base[(run.edgeIndex + 1) % base.length]!;
  const m = lerp(run.a, run.b, 0.5);
  return { edgeIndex: run.edgeIndex, t: closestOnSegment(m, e0, e1).t };
}

function cutSetConnected(arr: Arrangement, hinges: BoundaryRun[]): boolean {
  const n = arr.verts.length;
  if (n === 0) return true;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const isHinge = (u: number, w: number) =>
    hinges.some((h) => (h.ia === u && h.ib === w) || (h.ia === w && h.ib === u));
  let edgeCount = 0;
  for (const [u, w] of arr.edges) {
    if (isHinge(u, w)) continue;
    edgeCount++;
    parent[find(u)] = find(w);
  }
  const root = find(0);
  for (let i = 1; i < n; i++) if (find(i) !== root) return false;
  // connected; it is a tree iff edges = vertices − 1 (no cycles ⇒ the net is a disk)
  return edgeCount === n - 1;
}

function netOutline(base: Polygon, pieces: Piece[], flaps: Flap[]): Polygon | null {
  const n = base.length;
  const byEdge: BoundaryRun[][] = base.map(() => []);
  for (const p of pieces) for (const r of p.runs) byEdge[r.edgeIndex]!.push(r);
  const out: Vec[] = [];
  for (let k = 0; k < n; k++) {
    const e0 = base[k]!;
    const e1 = base[(k + 1) % n]!;
    const runs = byEdge[k]!.slice().sort((r, s) => closestOnSegment(r.a, e0, e1).t - closestOnSegment(s.a, e0, e1).t);
    if (runs.length === 0) return null;
    if (out.length === 0) out.push(runs[0]!.a);
    for (const r of runs) {
      const flap = flaps.find((f) => f.hinge === r);
      if (!flap) {
        out.push(r.b);
        continue;
      }
      const poly = flap.piece.poly;
      const m = poly.length;
      let i = poly.findIndex((p, idx) => approxEq(p, r.a, 1e-7) && approxEq(poly[(idx + 1) % m]!, r.b, 1e-7));
      if (i < 0) return null;
      const rest: Vec[] = [];
      for (let s = 1; s <= m; s++) rest.push(poly[(i + s) % m]!); // b, …, a
      const reflected = transformPolygon(flap.mirror, rest).reverse(); // a, …, b
      for (let s = 1; s < reflected.length; s++) out.push(reflected[s]!);
    }
  }
  if (out.length > 1 && approxEq(out[0]!, out[out.length - 1]!, 1e-7)) out.pop();
  return removeCollinear(out);
}

/** Drop vertices that lie on the segment joining their neighbours (and duplicates). */
export function removeCollinear(poly: Polygon, eps = 1e-9): Polygon {
  const out: Vec[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[(i + n - 1) % n]!;
    const b = poly[i]!;
    const c = poly[(i + 1) % n]!;
    if (approxEq(a, b, eps)) continue;
    const abx = b.x - a.x, aby = b.y - a.y, bcx = c.x - b.x, bcy = c.y - b.y;
    const crossz = abx * bcy - aby * bcx;
    const straight = Math.abs(crossz) <= eps * (Math.hypot(abx, aby) * Math.hypot(bcx, bcy)) && abx * bcx + aby * bcy > 0;
    if (!straight) out.push(b);
  }
  return out;
}

export function computeUnfolding(baseIn: Polygon, cuts: Cut[], hingeSpecs: HingeSpec[]): Unfolding {
  const base = ensureCCW(baseIn);
  const chains: Vec[][] = [[...base, base[0]!], ...cuts.map((c) => c.pts)];
  const arrangement = buildArrangement(chains, EPS);
  const problems: string[] = [];

  const pieces: Piece[] = arrangement.faces.map((loop, index) => {
    const poly = loop.map((i) => arrangement.verts[i]!);
    const piece: Piece = { index, poly, runs: runsOfFace(base, loop, arrangement.verts), hinge: null };
    piece.hinge = resolveHinge(base, piece, hingeSpecs);
    return piece;
  });

  const flaps: Flap[] = [];
  for (const p of pieces) {
    if (!p.hinge) {
      problems.push(`piece ${p.index + 1} touches no border, it cannot be hinged`);
      continue;
    }
    const mirror = reflection(p.hinge.a, p.hinge.b);
    flaps.push({ piece: p, hinge: p.hinge, mirror, poly: transformPolygon(mirror, p.poly), conflict: false });
  }

  const hinges = flaps.map((f) => f.hinge);
  const connected = cutSetConnected(arrangement, hinges);
  if (!connected) problems.push('the cut set (cuts plus the unhinged border) is not a single tree');

  // flatness: flaps must not overlap the back sheet or each other
  for (const f of flaps) if (polygonsOverlap(f.poly, base)) f.conflict = true;
  for (let i = 0; i < flaps.length; i++)
    for (let j = i + 1; j < flaps.length; j++)
      if (polygonsOverlap(flaps[i]!.poly, flaps[j]!.poly)) {
        flaps[i]!.conflict = true;
        flaps[j]!.conflict = true;
      }
  const flattens = flaps.length > 0 && flaps.every((f) => !f.conflict);
  if (!flattens && flaps.length) problems.push('some flap lands on the back sheet or on another flap: the net does not flatten');

  const validCuts = problems.length === 0 || (connected && flaps.length === pieces.length);
  const outline = validCuts ? netOutline(base, pieces, flaps) : null;
  const flapArea = flaps.reduce((s, f) => s + area(f.poly), 0);
  const areaRatio = (area(base) + flapArea) / area(base);
  if (outline && Math.abs(Math.abs(signedArea(outline)) - area(base) - flapArea) > 1e-6 * area(base))
    problems.push('internal: outline area mismatch');

  return { base, arrangement, pieces, flaps, outline, problems, validCuts, flattens, areaRatio };
}
