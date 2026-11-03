/**
 * The hat polykite, the Tile(a,b) continuum and the H/T/P/F metatile
 * substitution. Ported from Craig S. Kaplan's hatviz
 * (https://github.com/isohedral/hatviz, BSD-3-Clause, © 2023 Craig S. Kaplan),
 * via the validated Python prototype in docs/CUT_CLASS.md.
 */
import { type Vec, dist, midpoint } from '../geom/vec';
import { type Polygon, ensureCCW } from '../geom/polygon';
import { type Iso, compose, scaling } from '../geom/isometry';

/** Row-major 2×3 matrix [a b e; c d f] as used by hatviz. */
export type M6 = [number, number, number, number, number, number];
export const IDENT6: M6 = [1, 0, 0, 0, 1, 0];
const hr3 = Math.sqrt(3) / 2;

export const toIso = (T: M6): Iso => ({ a: T[0], b: T[1], e: T[2], c: T[3], d: T[4], f: T[5] });

export const hexPt = (x: number, y: number): Vec => ({ x: x + 0.5 * y, y: hr3 * y });

export function inv6(T: M6): M6 {
  const det = T[0] * T[4] - T[1] * T[3];
  return [T[4] / det, -T[1] / det, (T[1] * T[5] - T[2] * T[4]) / det, -T[3] / det, T[0] / det, (T[2] * T[3] - T[0] * T[5]) / det];
}

export function mul6(A: M6, B: M6): M6 {
  return [
    A[0] * B[0] + A[1] * B[3], A[0] * B[1] + A[1] * B[4], A[0] * B[2] + A[1] * B[5] + A[2],
    A[3] * B[0] + A[4] * B[3], A[3] * B[1] + A[4] * B[4], A[3] * B[2] + A[4] * B[5] + A[5],
  ];
}

export const trot = (a: number): M6 => {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [c, -s, 0, s, c, 0];
};
export const ttrans = (tx: number, ty: number): M6 => [1, 0, tx, 0, 1, ty];
export const rotAbout = (p: Vec, a: number): M6 => mul6(ttrans(p.x, p.y), mul6(trot(a), ttrans(-p.x, -p.y)));
export const transPt = (M: M6, p: Vec): Vec => ({ x: M[0] * p.x + M[1] * p.y + M[2], y: M[3] * p.x + M[4] * p.y + M[5] });

const matchSeg = (p: Vec, q: Vec): M6 => [q.x - p.x, p.y - q.y, p.x, q.y - p.y, q.x - p.x, p.y];
export const matchTwo = (p1: Vec, q1: Vec, p2: Vec, q2: Vec): M6 => mul6(matchSeg(p2, q2), inv6(matchSeg(p1, q1)));

function intersectLines(p1: Vec, q1: Vec, p2: Vec, q2: Vec): Vec {
  const d = (q2.y - p2.y) * (q1.x - p1.x) - (q2.x - p2.x) * (q1.y - p1.y);
  const uA = ((q2.x - p2.x) * (p1.y - p2.y) - (q2.y - p2.y) * (p1.x - p2.x)) / d;
  return { x: p1.x + uA * (q1.x - p1.x), y: p1.y + uA * (q1.y - p1.y) };
}

const padd = (p: Vec, q: Vec): Vec => ({ x: p.x + q.x, y: p.y + q.y });
const psub = (p: Vec, q: Vec): Vec => ({ x: p.x - q.x, y: p.y - q.y });

/** The hat as a 13-gon in kite coordinates. */
export const HAT_OUTLINE: Vec[] = [
  hexPt(0, 0), hexPt(-1, -1), hexPt(0, -2), hexPt(2, -2), hexPt(2, -1), hexPt(4, -2), hexPt(5, -1),
  hexPt(4, 0), hexPt(3, 0), hexPt(2, 2), hexPt(0, 3), hexPt(0, 2), hexPt(-1, 2),
];

/** The hat as a counter-clockwise 14-gon: the side of length 2 is split at its midpoint. */
export function hat14(): Polygon {
  const pts = ensureCCW(HAT_OUTLINE);
  const out: Vec[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    out.push(p);
    if (Math.abs(dist(p, q) - 2) < 1e-9) out.push(midpoint(p, q));
  }
  return out;
}

/** Tile(a,b): unit sides of the 14-gon get length a, √3-sides get length b. */
export function tileAB(a: number, b: number, base: Polygon = hat14()): Polygon {
  const pts: Vec[] = [{ x: 0, y: 0 }];
  const n = base.length;
  for (let i = 0; i < n; i++) {
    const p = base[i]!;
    const q = base[(i + 1) % n]!;
    const L = dist(p, q);
    const s = Math.abs(L - 1) < 1e-9 ? a : b;
    const last = pts[pts.length - 1]!;
    pts.push({ x: last.x + (s * (q.x - p.x)) / L, y: last.y + (s * (q.y - p.y)) / L });
  }
  return pts.slice(0, n);
}

/* ------------------------- metatile substitution ------------------------- */

class HatLeaf {
  constructor(public label: 'H1' | 'H' | 'T' | 'P' | 'F') {}
}

class MetaTile {
  children: { T: M6; geom: MetaTile | HatLeaf }[] = [];
  constructor(
    public shape: Vec[],
    public width: number,
  ) {}
  addChild(T: M6, geom: MetaTile | HatLeaf): void {
    this.children.push({ T, geom });
  }
  evalChild(n: number, i: number): Vec {
    const ch = this.children[n]!;
    return transPt(ch.T, (ch.geom as MetaTile).shape[i]!);
  }
  recentre(): void {
    const cx = this.shape.reduce((s, p) => s + p.x, 0) / this.shape.length;
    const cy = this.shape.reduce((s, p) => s + p.y, 0) / this.shape.length;
    this.shape = this.shape.map((p) => ({ x: p.x - cx, y: p.y - cy }));
    const M = ttrans(-cx, -cy);
    for (const ch of this.children) ch.T = mul6(M, ch.T);
  }
}

const H1_hat = new HatLeaf('H1');
const H_hat = new HatLeaf('H');
const T_hat = new HatLeaf('T');
const P_hat = new HatLeaf('P');
const F_hat = new HatLeaf('F');

function makeInits(): MetaTile[] {
  const ho = HAT_OUTLINE;
  const H_outline: Vec[] = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4.5, y: hr3 }, { x: 2.5, y: 5 * hr3 }, { x: 1.5, y: 5 * hr3 }, { x: -0.5, y: hr3 }];
  const H = new MetaTile(H_outline, 2);
  H.addChild(matchTwo(ho[5]!, ho[7]!, H_outline[5]!, H_outline[0]!), H_hat);
  H.addChild(matchTwo(ho[9]!, ho[11]!, H_outline[1]!, H_outline[2]!), H_hat);
  H.addChild(matchTwo(ho[5]!, ho[7]!, H_outline[3]!, H_outline[4]!), H_hat);
  H.addChild(mul6(ttrans(2.5, hr3), mul6([-0.5, -hr3, 0, hr3, -0.5, 0], [0.5, 0, 0, 0, -0.5, 0])), H1_hat);

  const T = new MetaTile([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 1.5, y: 3 * hr3 }], 2);
  T.addChild([0.5, 0, 0.5, 0, 0.5, hr3], T_hat);

  const P = new MetaTile([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 3, y: 2 * hr3 }, { x: -1, y: 2 * hr3 }], 2);
  P.addChild([0.5, 0, 1.5, 0, 0.5, hr3], P_hat);
  P.addChild(mul6(ttrans(0, 2 * hr3), mul6([0.5, hr3, 0, -hr3, 0.5, 0], [0.5, 0, 0, 0, 0.5, 0])), P_hat);

  const F = new MetaTile([{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3.5, y: hr3 }, { x: 3, y: 2 * hr3 }, { x: -1, y: 2 * hr3 }], 2);
  F.addChild([0.5, 0, 1.5, 0, 0.5, hr3], F_hat);
  F.addChild(mul6(ttrans(0, 2 * hr3), mul6([0.5, hr3, 0, -hr3, 0.5, 0], [0.5, 0, 0, 0, 0.5, 0])), F_hat);
  return [H, T, P, F];
}

type Rule = [string] | [number, number, string, number] | [number, number, number, number, string, number];
const RULES: Rule[] = [
  ['H'], [0, 0, 'P', 2], [1, 0, 'H', 2], [2, 0, 'P', 2], [3, 0, 'H', 2], [4, 4, 'P', 2],
  [0, 4, 'F', 3], [2, 4, 'F', 3], [4, 1, 3, 2, 'F', 0], [8, 3, 'H', 0], [9, 2, 'P', 0],
  [10, 2, 'H', 0], [11, 4, 'P', 2], [12, 0, 'H', 2], [13, 0, 'F', 3], [14, 2, 'F', 1],
  [15, 3, 'H', 4], [8, 2, 'F', 1], [17, 3, 'H', 0], [18, 2, 'P', 0], [19, 2, 'H', 2],
  [20, 4, 'F', 3], [20, 0, 'P', 2], [22, 0, 'H', 2], [23, 4, 'F', 3], [23, 0, 'F', 3],
  [16, 0, 'P', 2], [9, 4, 0, 2, 'T', 2], [4, 0, 'F', 3],
];

function constructPatch(H: MetaTile, T: MetaTile, P: MetaTile, F: MetaTile): MetaTile {
  const ret = new MetaTile([], H.width);
  const shapes: Record<string, MetaTile> = { H, T, P, F };
  for (const r of RULES) {
    if (r.length === 1) {
      ret.addChild(IDENT6, shapes[r[0]]!);
    } else if (r.length === 4) {
      const ch = ret.children[r[0]]!;
      const poly = (ch.geom as MetaTile).shape;
      const Pp = transPt(ch.T, poly[(r[1] + 1) % poly.length]!);
      const Qp = transPt(ch.T, poly[r[1]]!);
      const nshp = shapes[r[2]]!;
      const npoly = nshp.shape;
      ret.addChild(matchTwo(npoly[r[3]]!, npoly[(r[3] + 1) % npoly.length]!, Pp, Qp), nshp);
    } else {
      const chP = ret.children[r[0]]!;
      const chQ = ret.children[r[2]]!;
      const Pp = transPt(chQ.T, (chQ.geom as MetaTile).shape[r[3]]!);
      const Qp = transPt(chP.T, (chP.geom as MetaTile).shape[r[1]]!);
      const nshp = shapes[r[4]]!;
      const npoly = nshp.shape;
      ret.addChild(matchTwo(npoly[r[5]]!, npoly[(r[5] + 1) % npoly.length]!, Pp, Qp), nshp);
    }
  }
  return ret;
}

function constructMetatiles(patch: MetaTile): MetaTile[] {
  const bps1 = patch.evalChild(8, 2);
  const bps2 = patch.evalChild(21, 2);
  const rbps = transPt(rotAbout(bps1, (-2 * Math.PI) / 3), bps2);
  const p72 = patch.evalChild(7, 2);
  const p252 = patch.evalChild(25, 2);
  const llc = intersectLines(bps1, rbps, patch.evalChild(6, 2), p72);
  let w = psub(patch.evalChild(6, 2), llc);
  const newH: Vec[] = [llc, bps1];
  w = transPt(trot(-Math.PI / 3), w);
  newH.push(padd(newH[1]!, w));
  newH.push(patch.evalChild(14, 2));
  w = transPt(trot(-Math.PI / 3), w);
  newH.push(psub(newH[3]!, w));
  newH.push(patch.evalChild(6, 2));
  const H = new MetaTile(newH, patch.width * 2);
  for (const ch of [0, 9, 16, 27, 26, 6, 1, 8, 10, 15]) H.addChild(patch.children[ch]!.T, patch.children[ch]!.geom);
  const P = new MetaTile([p72, padd(p72, psub(bps1, llc)), bps1, llc], patch.width * 2);
  for (const ch of [7, 2, 3, 4, 28]) P.addChild(patch.children[ch]!.T, patch.children[ch]!.geom);
  const F = new MetaTile([bps2, patch.evalChild(24, 2), patch.evalChild(25, 0), p252, padd(p252, psub(llc, bps1))], patch.width * 2);
  for (const ch of [21, 20, 22, 23, 24, 25]) F.addChild(patch.children[ch]!.T, patch.children[ch]!.geom);
  const AAA = newH[2]!;
  const BBB = padd(newH[1]!, psub(newH[4]!, newH[5]!));
  const CCC = transPt(rotAbout(BBB, -Math.PI / 3), AAA);
  const T = new MetaTile([BBB, CCC, AAA], patch.width * 2);
  T.addChild(patch.children[11]!.T, patch.children[11]!.geom);
  for (const m of [H, P, F, T]) m.recentre();
  return [H, T, P, F];
}

export interface Placement {
  iso: Iso;
  reflected: boolean;
}

/** hatviz places the hat outline at half scale inside the metatiles; undo that so placements are isometries. */
const UNSCALE = scaling(2);

function collect(geom: MetaTile | HatLeaf, T: M6, out: Placement[]): void {
  if (geom instanceof HatLeaf) out.push({ iso: compose(UNSCALE, toIso(T)), reflected: geom.label === 'H1' });
  else for (const ch of geom.children) collect(ch.geom, mul6(T, ch.T), out);
}

const cache = new Map<string, Placement[]>();

/** All hats inside the level-`level` supertile of type `which`. Level 1 = the four basic metatiles. */
export function hatPatch(level: number, which: 'H' | 'T' | 'P' | 'F' = 'H'): Placement[] {
  const key = `${level}${which}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let tiles = makeInits();
  for (let i = 1; i < level; i++) tiles = constructMetatiles(constructPatch(tiles[0]!, tiles[1]!, tiles[2]!, tiles[3]!));
  const out: Placement[] = [];
  collect(tiles[{ H: 0, T: 1, P: 2, F: 3 }[which]]!, IDENT6, out);
  cache.set(key, out);
  return out;
}
