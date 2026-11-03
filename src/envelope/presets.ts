import { type Vec, lerp } from '../geom/vec';
import { type Polygon, pointInPolygon } from '../geom/polygon';
import { polylinesCross } from '../geom/intersect';
import { type Cut, type HingeSpec } from './model';

export interface Preset {
  id: string;
  name: string;
  /** polygon edge indices assumed: 0 bottom, 1 right, 2 top, 3 left for quadrilaterals */
  make: (base: Polygon) => { cuts: Cut[]; hinges: HingeSpec[] };
}

const edgePoint = (base: Polygon, k: number, t: number): Vec =>
  lerp(base[k]!, base[(k + 1) % base.length]!, t);

const inside = (base: Polygon, pts: Vec[]): boolean =>
  pts.slice(1, -1).every((p) => pointInPolygon(p, base)) && !polylinesCross(base, pts, true, false);

/** Pairs of edges (k, l) to try for a chord between edge midpoints, far apart first. */
function chordPairs(n: number): [number, number][] {
  const out: [number, number][] = [];
  const half = Math.floor(n / 2);
  for (let off = half; off >= 1; off--) for (let k = 0; k < n; k++) out.push([k, (k + off) % n]);
  return out;
}

function firstInside(base: Polygon, make: (from: Vec, to: Vec) => Vec[]): Vec[] | null {
  for (const [k, l] of chordPairs(base.length)) {
    const pts = make(edgePoint(base, k, 0.5), edgePoint(base, l, 0.5));
    if (inside(base, pts)) return pts;
  }
  return null;
}

function wave(from: Vec, to: Vec, amp: number, waves: number, n = 48): Vec[] {
  const out: Vec[] = [];
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const L = Math.hypot(dx, dy);
  const nx = -dy / L;
  const ny = dx / L;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const s = amp * Math.sin(Math.PI * waves * t) * Math.sin(Math.PI * t);
    out.push({ x: from.x + dx * t + nx * s, y: from.y + dy * t + ny * s });
  }
  return out;
}

export const PRESETS: Preset[] = [
  {
    id: 'wave',
    name: 'One wavy cut',
    make: (base) => {
      const n = base.length;
      const from = edgePoint(base, n - 1, 0.5);
      const to = edgePoint(base, n === 3 ? 0 : n % 2 === 0 ? n / 2 - 1 : 1, 0.5);
      const scaleAmp = Math.hypot(to.x - from.x, to.y - from.y) * 0.11;
      let pts = wave(from, to, scaleAmp, 2);
      if (!inside(base, pts)) pts = firstInside(base, (a, b) => wave(a, b, Math.hypot(b.x - a.x, b.y - a.y) * 0.06, 2)) ?? [];
      return { cuts: pts.length ? [{ id: 'p1', pts }] : [], hinges: [] };
    },
  },
  {
    id: 'diagonals',
    name: 'Mail envelope (diagonals)',
    make: (base) => {
      const n = base.length;
      const c = base.reduce((s, p) => ({ x: s.x + p.x / n, y: s.y + p.y / n }), { x: 0, y: 0 });
      const cuts = base.map((p, i) => ({ id: `d${i}`, pts: [p, c] }));
      if (!cuts.every((k) => inside(base, [k.pts[0]!, lerp(k.pts[0]!, c, 0.5), c]))) return { cuts: [], hinges: [] };
      return { cuts, hinges: [] };
    },
  },
  {
    id: 'zigzag',
    name: 'Zigzag cut',
    make: (base) => {
      const zig = (from: Vec, to: Vec, amp: number): Vec[] => {
        const pts: Vec[] = [];
        const k = 7;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const L = Math.hypot(dx, dy);
        const nx = -dy / L;
        const ny = dx / L;
        for (let i = 0; i <= k; i++) {
          const t = i / k;
          const p = lerp(from, to, t);
          const off = amp * L * Math.sin(Math.PI * t) * (i % 2 ? 1 : -1);
          pts.push({ x: p.x + nx * off, y: p.y + ny * off });
        }
        return pts;
      };
      const n = base.length;
      let pts = zig(edgePoint(base, n - 1, 0.4), edgePoint(base, n === 3 ? 0 : 1, 0.6), 0.16);
      if (!inside(base, pts)) pts = firstInside(base, (a, b) => zig(a, b, 0.07)) ?? [];
      return { cuts: pts.length ? [{ id: 'z', pts }] : [], hinges: [] };
    },
  },
  {
    id: 'none',
    name: 'No cut (whole front flap)',
    make: () => ({ cuts: [], hinges: [] }),
  },
];
