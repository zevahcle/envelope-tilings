/**
 * Regions of the tile cut out by the decoration, for the fill tool.
 *
 * The tile boundary, the connecting curves and the brush strokes form a planar
 * graph (every crossing becomes a vertex); its bounded faces are the regions.
 * Where a region meets the tile boundary it continues into the neighbouring
 * tile, at the partner point given by the tiling. Since every tile carries the
 * same decoration, that continuation is again a region of this tile, so the
 * regions fall into classes: the pieces of one cell of the global pattern.
 */
import { type Vec, sub, angleOf, cross } from '../geom/vec';
import { type Polygon, bounds, pointInPolygon, signedArea, type Bounds } from '../geom/polygon';
import { type Decor, type DecorFill, Boundary, Contacts, curvePoints } from './model';

export interface Region {
  ring: Vec[];
  /** boundaries of islands (closed strokes not touching the rest) inside the region */
  holes: Vec[][];
  area: number;
  box: Bounds;
}

export interface ResolvedFill {
  /** outer rings and holes; fill with the even-odd rule */
  rings: Vec[][];
  color: string;
  opacity: number;
}

interface Seg {
  a: Vec;
  b: Vec;
  bnd: boolean;
  ts: number[];
}

const inBox = (p: Vec, b: Bounds) => p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;

export class Regions {
  readonly regions: Region[] = [];
  /** class representative of each region */
  readonly cls: number[] = [];
  private tile: Polygon;

  constructor(tile: Polygon, decor: Decor, contacts: Contacts | null) {
    this.tile = tile;
    const B = new Boundary(tile);
    const bb = bounds(tile);
    const diam = Math.hypot(bb.maxX - bb.minX, bb.maxY - bb.minY);
    const eps = diam * 1e-7;

    // 1. segments
    const segs: Seg[] = [];
    const addChain = (pts: Vec[], closed: boolean, bnd: boolean) => {
      const n = pts.length;
      for (let i = 0; i + (closed ? 0 : 1) < n; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % n]!;
        if (Math.hypot(b.x - a.x, b.y - a.y) > eps) segs.push({ a, b, bnd, ts: [0, 1] });
      }
    };
    addChain(tile, true, true);
    for (const c of decor.curves) addChain(curvePoints(B, c), false, false);
    for (const s of decor.strokes) addChain(s.pts, false, false);

    // 2. split at crossings (grid of segment boxes keeps this near-linear)
    const cell = diam / 24;
    const grid = new Map<string, number[]>();
    segs.forEach((s, k) => {
      for (let i = Math.floor(Math.min(s.a.x, s.b.x) / cell); i <= Math.floor(Math.max(s.a.x, s.b.x) / cell); i++)
        for (let j = Math.floor(Math.min(s.a.y, s.b.y) / cell); j <= Math.floor(Math.max(s.a.y, s.b.y) / cell); j++) {
          const key = `${i},${j}`;
          const l = grid.get(key);
          if (l) l.push(k);
          else grid.set(key, [k]);
        }
    });
    const tested = new Set<number>();
    for (const list of grid.values())
      for (let x = 0; x < list.length; x++)
        for (let y = x + 1; y < list.length; y++) {
          const i = Math.min(list[x]!, list[y]!);
          const j = Math.max(list[x]!, list[y]!);
          const key = i * segs.length + j;
          if (tested.has(key)) continue;
          tested.add(key);
          const s = segs[i]!;
          const t = segs[j]!;
          const r = sub(s.b, s.a);
          const q = sub(t.b, t.a);
          const den = cross(r, q);
          const lr = Math.hypot(r.x, r.y);
          const lq = Math.hypot(q.x, q.y);
          if (Math.abs(den) < 1e-12 * lr * lq) continue;
          const w = sub(t.a, s.a);
          const u = cross(w, q) / den;
          const v = cross(w, r) / den;
          const tu = eps / lr;
          const tv = eps / lq;
          if (u < -tu || u > 1 + tu || v < -tv || v > 1 + tv) continue;
          s.ts.push(Math.min(1, Math.max(0, u)));
          t.ts.push(Math.min(1, Math.max(0, v)));
        }

    // 3. vertices (snapped) and edges
    const verts: Vec[] = [];
    const vmap = new Map<string, number>();
    const vid = (p: Vec): number => {
      const gx = Math.round(p.x / (eps * 10));
      const gy = Math.round(p.y / (eps * 10));
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          const k = vmap.get(`${gx + dx},${gy + dy}`);
          if (k !== undefined && Math.hypot(verts[k]!.x - p.x, verts[k]!.y - p.y) <= eps * 10) return k;
        }
      verts.push(p);
      vmap.set(`${gx},${gy}`, verts.length - 1);
      return verts.length - 1;
    };
    const edgeMap = new Map<string, { u: number; w: number; bnd: boolean }>();
    for (const s of segs) {
      const ts = [...new Set(s.ts)].sort((p, q) => p - q);
      let prev = vid(s.a);
      for (let k = 1; k < ts.length; k++) {
        const t = ts[k]!;
        const cur = vid(t === 1 ? s.b : { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t });
        if (cur !== prev) {
          const key = prev < cur ? `${prev}-${cur}` : `${cur}-${prev}`;
          const e = edgeMap.get(key);
          if (!e) edgeMap.set(key, { u: prev, w: cur, bnd: s.bnd });
          else if (s.bnd) Object.assign(e, { u: prev, w: cur, bnd: true });
        }
        prev = cur;
      }
    }

    // 4. half-edges and faces (same rule as geom/arrangement)
    const from: number[] = [];
    const to: number[] = [];
    const bndHe: boolean[] = [];
    const outgoing: number[][] = verts.map(() => []);
    for (const e of edgeMap.values()) {
      const h = from.length;
      from.push(e.u, e.w);
      to.push(e.w, e.u);
      bndHe.push(e.bnd, false);
      outgoing[e.u]!.push(h);
      outgoing[e.w]!.push(h + 1);
    }
    const ang = (h: number) => angleOf(sub(verts[to[h]!]!, verts[from[h]!]!));
    for (const l of outgoing) {
      const a = new Map(l.map((h) => [h, ang(h)]));
      l.sort((p, q) => a.get(p)! - a.get(q)!);
    }
    const H = from.length;
    const next = new Array<number>(H);
    for (let h = 0; h < H; h++) {
      const l = outgoing[to[h]!]!;
      const idx = l.indexOf(h ^ 1);
      next[h] = l[(idx - 1 + l.length) % l.length]!;
    }
    const faceOf = new Array<number>(H).fill(-1);
    const loops: { verts: number[]; area: number }[] = [];
    for (let h = 0; h < H; h++) {
      if (faceOf[h] !== -1) continue;
      const id = loops.length;
      const loop: number[] = [];
      let cur = h;
      while (faceOf[cur] === -1) {
        faceOf[cur] = id;
        loop.push(from[cur]!);
        cur = next[cur]!;
      }
      loops.push({ verts: loop, area: signedArea(loop.map((i) => verts[i]!)) });
    }
    // connected components of the graph
    const comp = verts.map((_, i) => i);
    const find = (i: number): number => (comp[i] === i ? i : (comp[i] = find(comp[i]!)));
    for (let h = 0; h < H; h += 2) comp[find(from[h]!)] = find(to[h]!);

    const tiny = diam * diam * 1e-12;
    const regionOfLoop = new Map<number, number>();
    loops.forEach((l, i) => {
      if (l.area <= tiny) return;
      const ring = l.verts.map((k) => verts[k]!);
      regionOfLoop.set(i, this.regions.length);
      this.regions.push({ ring, holes: [], area: l.area, box: bounds(ring) });
    });
    const regionComp = [...regionOfLoop].map(([loop]) => find(loops[loop]!.verts[0]!));
    // islands: an outer loop of another component lies inside the smallest region around it
    loops.forEach((l, i) => {
      if (l.area > tiny || Math.abs(l.area) <= tiny) return;
      const c = find(l.verts[0]!);
      const p = verts[l.verts[0]!]!;
      let best = -1;
      this.regions.forEach((r, k) => {
        if (regionComp[k] === c || !inBox(p, r.box) || !pointInPolygon(p, r.ring)) return;
        if (best < 0 || r.area < this.regions[best]!.area) best = k;
      });
      if (best >= 0) this.regions[best]!.holes.push(l.verts.map((k) => verts[k]!));
    });

    // 5. classes: regions meeting at a seam belong together
    const cls = this.regions.map((_, i) => i);
    const root = (i: number): number => (cls[i] === i ? i : (cls[i] = root(cls[i]!)));
    if (contacts) {
      // boundary pieces in boundary order, with the region on their inner side
      const pieces: { start: number; region: number }[] = [];
      for (let h = 0; h < H; h++) {
        if (!bndHe[h]) continue;
        const inner = B.orient > 0 ? h : h ^ 1;
        const region = regionOfLoop.get(faceOf[inner]!);
        if (region === undefined) continue;
        pieces.push({ start: B.project(verts[from[h]!]!).f, region });
      }
      pieces.sort((p, q) => p.start - q.start);
      const pieceAt = (f: number) => {
        let lo = 0;
        let hi = pieces.length - 1;
        if (!pieces.length) return null;
        if (f < pieces[0]!.start) return pieces[pieces.length - 1]!;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (pieces[mid]!.start <= f) lo = mid;
          else hi = mid - 1;
        }
        return pieces[lo]!;
      };
      pieces.forEach((p, k) => {
        const end = k + 1 < pieces.length ? pieces[k + 1]!.start : pieces[0]!.start + 1;
        const mid = (((p.start + end) / 2) % 1 + 1) % 1;
        for (const q of contacts.partners(mid)) {
          const other = pieceAt(q);
          if (other) cls[root(p.region)] = root(other.region);
        }
      });
    }
    this.cls = this.regions.map((_, i) => root(i));
  }

  /** the region containing p (inside the tile), or -1 */
  locate(p: Vec): number {
    if (!pointInPolygon(p, this.tile)) return -1;
    let best = -1;
    this.regions.forEach((r, k) => {
      if (!inBox(p, r.box) || !pointInPolygon(p, r.ring)) return;
      if (best < 0 || r.area < this.regions[best]!.area) best = k;
    });
    return best;
  }

  /** regions coloured by a fill seeded in region k */
  covered(k: number, linked: boolean): number[] {
    if (k < 0) return [];
    if (!linked) return [k];
    const c = this.cls[k];
    return this.regions.map((_, i) => i).filter((i) => this.cls[i] === c);
  }

  rings(ks: number[]): Vec[][] {
    return ks.flatMap((k) => [this.regions[k]!.ring, ...this.regions[k]!.holes]);
  }

  resolve(fills: DecorFill[] | undefined): ResolvedFill[] {
    const out: ResolvedFill[] = [];
    for (const f of fills ?? []) {
      const ks = this.covered(this.locate(f.p), f.linked);
      if (ks.length) out.push({ rings: this.rings(ks), color: f.color, opacity: f.opacity });
    }
    return out;
  }
}
