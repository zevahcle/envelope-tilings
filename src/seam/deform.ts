import { type Vec, dist } from '../geom/vec';
import { type Polygon, bounds, boundsOverlap, transformPolygon } from '../geom/polygon';
import { edgeFrame, fromLocal, kleinApply, symmetrize, resample, type KleinElement } from '../geom/curve';
import { polylinesCross } from '../geom/intersect';
import { type EdgeClass } from './contacts';
import { type Placement } from '../tiles/hat';

/** Curves per class representative, in the edge's local frame scaled to unit length: from (0,0) to (1,0). */
export type SeamCurves = Record<number, Vec[]>;

export const SAMPLES = 40;

export const straightCurve = (n = SAMPLES): Vec[] => Array.from({ length: n }, (_, i) => ({ x: i / (n - 1), y: 0 }));

export function classOfEdge(classes: EdgeClass[], edge: number): { cls: EdgeClass; label: KleinElement } | null {
  for (const cls of classes) {
    const e = cls.edges.find((x) => x.edge === edge);
    if (e) return { cls, label: e.label };
  }
  return null;
}

/** The curve of edge `edge` in its own local frame (unit length). */
export function edgeCurve(classes: EdgeClass[], curves: SeamCurves, edge: number): Vec[] {
  const hit = classOfEdge(classes, edge);
  if (!hit) return straightCurve();
  const rep = curves[hit.cls.rep];
  if (!rep) return straightCurve();
  return kleinApply(hit.label, rep, 1);
}

/** Normalise a drawn local curve: pin endpoints to (0,0),(1,0), resample, symmetrise. */
export function normaliseCurve(raw: Vec[], H: KleinElement[], n = SAMPLES): Vec[] {
  if (raw.length < 2) return straightCurve(n);
  const pts = resample(raw, n);
  const p0 = pts[0]!;
  const p1 = pts[n - 1]!;
  const pinned = pts.map((p, i) => {
    const t = i / (n - 1);
    return { x: p.x - (1 - t) * p0.x - t * (p1.x - 1), y: p.y - (1 - t) * p0.y - t * p1.y };
  });
  return symmetrize(pinned, 1, H);
}

export function deformedTile(base: Polygon, classes: EdgeClass[], curves: SeamCurves): Polygon {
  const out: Vec[] = [];
  const m = base.length;
  for (let i = 0; i < m; i++) {
    const f = edgeFrame(base[i]!, base[(i + 1) % m]!);
    const c = edgeCurve(classes, curves, i);
    for (let k = 0; k < c.length - 1; k++) out.push(fromLocal(f, { x: c[k]!.x * f.L, y: c[k]!.y * f.L }));
  }
  return out;
}

export const tileIsSimple = (poly: Polygon): boolean => {
  // reuse the polyline self-intersection test via polylinesCross on halves is awkward; use the direct test
  return !polylineSelfIntersectsClosed(poly);
};

import { polylineSelfIntersects } from '../geom/intersect';
const polylineSelfIntersectsClosed = (p: Polygon) => polylineSelfIntersects(p, true);

export interface DeformedPatch {
  polys: Polygon[];
  overlapping: boolean[];
  anyOverlap: boolean;
}

/** Place the deformed tile and detect boundary crossings between nearby tiles. */
export function deformedPatch(deformed: Polygon, placements: Placement[], maxCheck = 800): DeformedPatch {
  const polys = placements.map((p) => transformPolygon(p.iso, deformed));
  const overlapping = new Array<boolean>(polys.length).fill(false);
  if (polys.length > maxCheck) return { polys, overlapping, anyOverlap: false };
  const bbs = polys.map((P) => bounds(P));
  const cell = Math.max(...bbs.map((b) => Math.max(b.maxX - b.minX, b.maxY - b.minY)));
  const grid = new Map<string, number[]>();
  bbs.forEach((b, t) => {
    const k = `${Math.floor((b.minX + b.maxX) / 2 / cell)},${Math.floor((b.minY + b.maxY) / 2 / cell)}`;
    (grid.get(k) ?? grid.set(k, []).get(k)!).push(t);
  });
  bbs.forEach((b, t) => {
    const gx = Math.floor((b.minX + b.maxX) / 2 / cell);
    const gy = Math.floor((b.minY + b.maxY) / 2 / cell);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const u of grid.get(`${gx + dx},${gy + dy}`) ?? []) {
          if (u <= t || !boundsOverlap(b, bbs[u]!)) continue;
          if (polylinesCross(polys[t]!, polys[u]!)) {
            overlapping[t] = true;
            overlapping[u] = true;
          }
        }
  });
  return { polys, overlapping, anyOverlap: overlapping.some(Boolean) };
}

/* ------------------------------ presets ------------------------------- */

export type CurvePresetId = 'bump' | 's' | 'tab' | 'zigzag' | 'random';

export function curvePreset(id: CurvePresetId, amplitude = 0.12, n = SAMPLES, seed = 1): Vec[] {
  const t = (i: number) => i / (n - 1);
  switch (id) {
    case 'bump':
      return Array.from({ length: n }, (_, i) => ({ x: t(i), y: amplitude * Math.sin(Math.PI * t(i)) }));
    case 's':
      return Array.from({ length: n }, (_, i) => ({ x: t(i), y: amplitude * Math.sin(2 * Math.PI * t(i)) }));
    case 'tab': {
      // a jigsaw knob: narrow neck, round head, centred on the edge
      return Array.from({ length: n }, (_, i) => {
        const s = t(i);
        const u = (s - 0.5) / 0.22; // -1..1 across the knob
        const inside = Math.abs(u) < 1;
        const w = inside ? Math.sqrt(Math.max(0, 1 - u * u)) : 0;
        const neck = inside ? 0.35 * Math.exp(-((u * 2.4) ** 2)) : 0;
        const x = s + (inside ? 0.06 * Math.sign(u) * (1 - Math.abs(u)) * Math.abs(u) : 0) - (inside ? 0.08 * u * (1 - w) : 0);
        return { x, y: amplitude * 2.2 * Math.max(w * 0.8, neck) };
      });
    }
    case 'zigzag':
      return Array.from({ length: n }, (_, i) => {
        const s = t(i);
        const tri = Math.abs(((s * 3) % 1) - 0.5) * 2 - 0.5; // triangle wave
        return { x: s, y: amplitude * Math.sin(Math.PI * s) * tri * 2 };
      });
    case 'random': {
      let st = seed * 9301 + 49297;
      const rnd = () => ((st = (st * 9301 + 49297) % 233280) / 233280) * 2 - 1;
      const k = [rnd(), rnd(), rnd()];
      return Array.from({ length: n }, (_, i) => {
        const s = t(i);
        const y = amplitude * (k[0]! * Math.sin(Math.PI * s) + 0.6 * k[1]! * Math.sin(2 * Math.PI * s) + 0.4 * k[2]! * Math.sin(3 * Math.PI * s));
        return { x: s, y };
      });
    }
  }
}

export const curveLength = (c: Vec[]): number => c.reduce((s, p, i) => (i ? s + dist(c[i - 1]!, p) : 0), 0);
