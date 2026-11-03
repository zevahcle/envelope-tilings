import { type Vec, lerp } from '../geom/vec';
import { type Polygon } from '../geom/polygon';
import { type Cut, type HingeSpec } from './model';

export interface Preset {
  id: string;
  name: string;
  /** polygon edge indices assumed: 0 bottom, 1 right, 2 top, 3 left for quadrilaterals */
  make: (base: Polygon) => { cuts: Cut[]; hinges: HingeSpec[] };
}

const edgePoint = (base: Polygon, k: number, t: number): Vec =>
  lerp(base[k]!, base[(k + 1) % base.length]!, t);

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
      const to = edgePoint(base, n === 3 ? 0 : 1, 0.5);
      return { cuts: [{ id: 'p1', pts: wave(from, to, 0.18, 2) }], hinges: [] };
    },
  },
  {
    id: 'diagonals',
    name: 'Mail envelope (diagonals)',
    make: (base) => {
      const n = base.length;
      const c = base.reduce((s, p) => ({ x: s.x + p.x / n, y: s.y + p.y / n }), { x: 0, y: 0 });
      return { cuts: base.map((p, i) => ({ id: `d${i}`, pts: [p, c] })), hinges: [] };
    },
  },
  {
    id: 'zigzag',
    name: 'Zigzag cut',
    make: (base) => {
      const n = base.length;
      const from = edgePoint(base, n - 1, 0.4);
      const to = edgePoint(base, n === 3 ? 0 : 1, 0.6);
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
        const off = 0.16 * L * Math.sin(Math.PI * t) * (i % 2 ? 1 : -1);
        pts.push({ x: p.x + nx * off, y: p.y + ny * off });
      }
      return { cuts: [{ id: 'z', pts }], hinges: [] };
    },
  },
  {
    id: 'none',
    name: 'No cut (whole front flap)',
    make: () => ({ cuts: [], hinges: [] }),
  },
];
