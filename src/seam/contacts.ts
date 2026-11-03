/**
 * Edge contacts of a patch, the contact graph Γ, and edge classes under the
 * Klein four-group {I, R, M, RM} (see docs/DESIGN.md §1.4).
 */
import { type Vec, dist } from '../geom/vec';
import { type Polygon, interiorAngles, transformPolygon, pointInPolygon } from '../geom/polygon';
import { type Iso, isDirect, mapSegment, apply } from '../geom/isometry';
import { segmentsCrossProperly } from '../geom/intersect';
import { type KleinElement } from '../geom/curve';
import { type Placement } from '../tiles/hat';

export interface Contact {
  ta: number;
  ea: number;
  tb: number;
  eb: number;
  mirrored: boolean;
}

export interface ContactReport {
  tiles: number;
  contacts: number;
  boundaryEdges: number;
  /** an edge shared by more than two tiles */
  badGroups: number;
  /** boundary edge whose midpoint lies inside another tile (not edge-to-edge) */
  partial: number;
  interiorVertices: number;
  angleBad: number;
  crossings: number;
}

export interface GammaEdge {
  i: number;
  j: number;
  mirrored: boolean;
}

const r5 = (v: number) => Math.round(v * 1e5) / 1e5 || 0;
const key = (p: Vec) => `${r5(p.x)},${r5(p.y)}`;
const ekey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export interface ContactAnalysis {
  polys: Polygon[];
  contacts: Contact[];
  report: ContactReport;
}

export function findContacts(base: Polygon, placements: Placement[], checkCrossings = true): ContactAnalysis {
  const polys = placements.map((p) => transformPolygon(p.iso, base));
  const m = base.length;
  const angles = interiorAngles(base);
  const edges = new Map<string, [number, number][]>();
  polys.forEach((P, t) => {
    for (let i = 0; i < m; i++) {
      const k = ekey(key(P[i]!), key(P[(i + 1) % m]!));
      const arr = edges.get(k);
      if (arr) arr.push([t, i]);
      else edges.set(k, [[t, i]]);
    }
  });
  const report: ContactReport = { tiles: polys.length, contacts: 0, boundaryEdges: 0, badGroups: 0, partial: 0, interiorVertices: 0, angleBad: 0, crossings: 0 };
  const contacts: Contact[] = [];
  const boundary: [number, number][] = [];
  for (const lst of edges.values()) {
    if (lst.length === 2) {
      const [a, b] = lst as [[number, number], [number, number]];
      contacts.push({ ta: a[0], ea: a[1], tb: b[0], eb: b[1], mirrored: placements[a[0]]!.reflected !== placements[b[0]]!.reflected });
    } else if (lst.length === 1) boundary.push(lst[0]!);
    else report.badGroups++;
  }
  report.contacts = contacts.length;
  report.boundaryEdges = boundary.length;

  // spatial grid of tiles by centroid
  const cell = Math.max(...base.map((p) => dist(p, base[0]!))) * 1.5 + 1e-9;
  const grid = new Map<string, number[]>();
  const cen = polys.map((P) => ({ x: P.reduce((s, p) => s + p.x, 0) / m, y: P.reduce((s, p) => s + p.y, 0) / m }));
  cen.forEach((c, t) => {
    const k = `${Math.floor(c.x / cell)},${Math.floor(c.y / cell)}`;
    const arr = grid.get(k);
    if (arr) arr.push(t);
    else grid.set(k, [t]);
  });
  const near = (p: Vec): number[] => {
    const gx = Math.floor(p.x / cell);
    const gy = Math.floor(p.y / cell);
    const out: number[] = [];
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) out.push(...(grid.get(`${gx + dx},${gy + dy}`) ?? []));
    return out;
  };
  for (const [t, i] of boundary) {
    const P = polys[t]!;
    const a = P[i]!;
    const b = P[(i + 1) % m]!;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    for (const u of near(mid)) {
      if (u !== t && pointInPolygon(mid, polys[u]!)) {
        report.partial++;
        break;
      }
    }
  }
  // angle sums at vertices all of whose incident edges are matched
  const vertAngle = new Map<string, number>();
  const vertEdges = new Map<string, string[]>();
  polys.forEach((P) => {
    for (let i = 0; i < m; i++) {
      const kv = key(P[i]!);
      vertAngle.set(kv, (vertAngle.get(kv) ?? 0) + angles[i]!);
      const e1 = ekey(kv, key(P[(i + 1) % m]!));
      const e0 = ekey(key(P[(i + m - 1) % m]!), kv);
      const arr = vertEdges.get(kv) ?? [];
      arr.push(e0, e1);
      vertEdges.set(kv, arr);
    }
  });
  for (const [kv, es] of vertEdges) {
    if (es.every((e) => edges.get(e)!.length === 2)) {
      report.interiorVertices++;
      if (Math.abs(vertAngle.get(kv)! - 2 * Math.PI) > 1e-5) report.angleBad++;
    }
  }
  if (checkCrossings) {
    polys.forEach((P, t) => {
      for (const u of new Set(near(cen[t]!))) {
        if (u <= t) continue;
        const Q = polys[u]!;
        for (let i = 0; i < m; i++)
          for (let j = 0; j < m; j++)
            if (segmentsCrossProperly(P[i]!, P[(i + 1) % m]!, Q[j]!, Q[(j + 1) % m]!)) report.crossings++;
      }
    });
  }
  return { polys, contacts, report };
}

export function gamma(contacts: Contact[]): GammaEdge[] {
  const seen = new Map<string, GammaEdge>();
  for (const c of contacts) {
    const i = Math.min(c.ea, c.eb);
    const j = Math.max(c.ea, c.eb);
    const k = `${i}-${j}-${c.mirrored ? 'M' : 'D'}`;
    if (!seen.has(k)) seen.set(k, { i, j, mirrored: c.mirrored });
  }
  return [...seen.values()].sort((a, b) => a.i - b.i || a.j - b.j || Number(a.mirrored) - Number(b.mirrored));
}

export const gammaEquals = (a: GammaEdge[], b: GammaEdge[]): boolean =>
  a.length === b.length && a.every((e, k) => e.i === b[k]!.i && e.j === b[k]!.j && e.mirrored === b[k]!.mirrored);

/* ------------------------------- classes ------------------------------- */

const BIT: Record<KleinElement, number> = { I: 0, R: 1, M: 2, RM: 3 };
const NAME: KleinElement[] = ['I', 'R', 'M', 'RM'];

export type Verdict = 'free' | 'centrally symmetric' | 'mirror symmetric' | 'straight';

export interface EdgeClass {
  rep: number;
  /** label g with c_edge = g(c_rep) */
  edges: { edge: number; label: KleinElement }[];
  H: KleinElement[];
  verdict: Verdict;
}

export function edgeClasses(G: GammaEdge[], m: number): EdgeClass[] {
  const parent = Array.from({ length: m }, (_, i) => i);
  const pot = new Array<number>(m).fill(0);
  const gens = new Map<number, Set<number>>();
  const find = (x: number): [number, number] => {
    let acc = 0;
    while (parent[x] !== x) {
      acc ^= pot[x]!;
      x = parent[x]!;
    }
    return [x, acc];
  };
  for (const { i, j, mirrored } of G) {
    const X = mirrored ? BIT.M : BIT.R;
    const [ri, pi] = find(i);
    const [rj, pj] = find(j);
    if (ri === rj) {
      const hgen = pj ^ X ^ pi;
      if (hgen) (gens.get(ri) ?? gens.set(ri, new Set()).get(ri)!).add(hgen);
    } else {
      parent[rj] = ri;
      pot[rj] = pj ^ X ^ pi;
      const g = gens.get(rj);
      if (g) {
        const target = gens.get(ri) ?? gens.set(ri, new Set()).get(ri)!;
        for (const x of g) target.add(x);
        gens.delete(rj);
      }
    }
  }
  const byRoot = new Map<number, EdgeClass>();
  for (let e = 0; e < m; e++) {
    const [r, p] = find(e);
    let cls = byRoot.get(r);
    if (!cls) {
      cls = { rep: r, edges: [], H: ['I'], verdict: 'free' };
      byRoot.set(r, cls);
    }
    cls.edges.push({ edge: e, label: NAME[p]! });
  }
  for (const [r, cls] of byRoot) {
    const H = new Set<number>([0]);
    const gs = [...(gens.get(r) ?? [])];
    let changed = true;
    while (changed) {
      changed = false;
      for (const g of [...H]) for (const h of [...gs, ...H]) if (!H.has(g ^ h)) { H.add(g ^ h); changed = true; }
    }
    cls.H = [...H].sort().map((b) => NAME[b]!);
    cls.verdict = H.has(BIT.M) ? 'straight' : H.has(BIT.RM) ? 'mirror symmetric' : H.has(BIT.R) ? 'centrally symmetric' : 'free';
  }
  return [...byRoot.values()].sort((a, b) => a.rep - b.rep);
}

/* ------------------------- Tile(a,b) re-placement ------------------------ */

/**
 * Place copies of `baseNew` with the same combinatorics as a patch of `base`
 * (used for the Tile(a,b) continuum: same contacts, different edge lengths).
 */
export function replaceTiles(placements: Placement[], polys: Polygon[], contacts: Contact[], baseNew: Polygon): Placement[] {
  const n = placements.length;
  const m = baseNew.length;
  const adj: { u: number; i: number; j: number }[][] = Array.from({ length: n }, () => []);
  for (const c of contacts) {
    adj[c.ta]!.push({ u: c.tb, i: c.ea, j: c.eb });
    adj[c.tb]!.push({ u: c.ta, i: c.eb, j: c.ea });
  }
  const out: (Iso | null)[] = new Array(n).fill(null);
  out[0] = placements[0]!.iso;
  const queue = [0];
  while (queue.length) {
    const t = queue.shift()!;
    const Pt = transformPolygon(out[t]!, baseNew);
    for (const { u, i, j } of adj[t]!) {
      if (out[u]) continue;
      const A = polys[t]!;
      const B = polys[u]!;
      const sameStart = key(A[i]!) === key(B[j]!);
      // base vertices j, j+1 of tile u map to the points of tile t's edge i
      const q0 = sameStart ? Pt[i]! : Pt[(i + 1) % m]!;
      const q1 = sameStart ? Pt[(i + 1) % m]! : Pt[i]!;
      const g = mapSegment(baseNew[j]!, baseNew[(j + 1) % m]!, q0, q1, placements[u]!.reflected);
      out[u] = g;
      queue.push(u);
    }
  }
  return out.map((iso, k) => ({ iso: iso ?? placements[k]!.iso, reflected: placements[k]!.reflected }));
}

export const placementIsDirect = (p: Placement): boolean => isDirect(p.iso);
export { apply };
