import { type Vec, approxEq, angleOf, sub, closestOnSegment, projectParam } from './vec';
import { signedArea } from './polygon';

/**
 * Planar straight-line graph built from polylines whose only intersections are
 * at endpoints (T-junctions allowed: an endpoint of one chain may lie on a
 * segment of another; the segment is split there). Faces are traced from the
 * half-edge structure.
 */
export interface Arrangement {
  verts: Vec[];
  /** undirected edges as vertex index pairs (i < j) */
  edges: [number, number][];
  /** interior faces as counter-clockwise vertex loops */
  faces: number[][];
  /** loops with negative area (the unbounded face, one per component) */
  outer: number[][];
}

interface HalfEdge {
  from: number;
  to: number;
  twin: number;
  next: number;
}

export function buildArrangement(chains: Vec[][], eps = 1e-7): Arrangement {
  // 1. Split segments at endpoints of other chains lying on them (T-junctions).
  const endpoints: Vec[] = [];
  for (const c of chains) {
    if (c.length === 0) continue;
    endpoints.push(c[0]!, c[c.length - 1]!);
  }
  const split: Vec[][] = chains.map((chain) => {
    const out: Vec[] = [];
    for (let i = 0; i < chain.length; i++) {
      const a = chain[i]!;
      out.push(a);
      if (i + 1 >= chain.length) break;
      const b = chain[i + 1]!;
      const inserts: { t: number; p: Vec }[] = [];
      for (const e of endpoints) {
        if (approxEq(e, a, eps) || approxEq(e, b, eps)) continue;
        const c = closestOnSegment(e, a, b);
        if (c.dist <= eps) {
          const t = projectParam(e, a, b);
          if (t > 0 && t < 1) inserts.push({ t, p: e });
        }
      }
      inserts.sort((p, q) => p.t - q.t);
      for (const ins of inserts) if (!approxEq(ins.p, out[out.length - 1]!, eps)) out.push(ins.p);
    }
    return out;
  });

  // 2. Vertices (deduplicated) and undirected edges.
  const verts: Vec[] = [];
  const vid = (p: Vec): number => {
    for (let i = 0; i < verts.length; i++) if (approxEq(verts[i]!, p, eps)) return i;
    verts.push(p);
    return verts.length - 1;
  };
  const edgeSet = new Map<string, [number, number]>();
  for (const chain of split) {
    for (let i = 0; i + 1 < chain.length; i++) {
      const u = vid(chain[i]!);
      const w = vid(chain[i + 1]!);
      if (u === w) continue;
      const key = u < w ? `${u}-${w}` : `${w}-${u}`;
      if (!edgeSet.has(key)) edgeSet.set(key, u < w ? [u, w] : [w, u]);
    }
  }
  const edges = [...edgeSet.values()];

  // 3. Half-edges, sorted around each vertex.
  const hes: HalfEdge[] = [];
  const outgoing: number[][] = verts.map(() => []);
  for (const [u, w] of edges) {
    const i = hes.length;
    hes.push({ from: u, to: w, twin: i + 1, next: -1 });
    hes.push({ from: w, to: u, twin: i, next: -1 });
    outgoing[u]!.push(i);
    outgoing[w]!.push(i + 1);
  }
  const angle = (h: number): number => angleOf(sub(verts[hes[h]!.to]!, verts[hes[h]!.from]!));
  for (const list of outgoing) list.sort((p, q) => angle(p) - angle(q));
  for (let h = 0; h < hes.length; h++) {
    const twin = hes[h]!.twin;
    const list = outgoing[hes[h]!.to]!;
    const idx = list.indexOf(twin);
    // face on the left of h continues with the outgoing edge clockwise-next from twin(h)
    hes[h]!.next = list[(idx - 1 + list.length) % list.length]!;
  }

  // 4. Trace faces.
  const visited = new Array<boolean>(hes.length).fill(false);
  const faces: number[][] = [];
  const outer: number[][] = [];
  for (let h = 0; h < hes.length; h++) {
    if (visited[h]) continue;
    const loop: number[] = [];
    let cur = h;
    let guard = 0;
    while (!visited[cur] && guard++ < hes.length + 1) {
      visited[cur] = true;
      loop.push(hes[cur]!.from);
      cur = hes[cur]!.next;
    }
    const a = signedArea(loop.map((i) => verts[i]!));
    if (a > eps) faces.push(loop);
    else outer.push(loop);
  }
  return { verts, edges, faces, outer };
}
