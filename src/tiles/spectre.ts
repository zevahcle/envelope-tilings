/**
 * Spectre = Tile(1,1) in its chiral hull, with the authors' substitution
 * (Smith, Myers, Kaplan, Goodman-Strauss 2023), as re-implemented in the
 * validated Python prototype (docs/CUT_CLASS.md). Patches are homochiral.
 */
import { type Vec } from '../geom/vec';
import { type Polygon, ensureCCW, isCCW } from '../geom/polygon';
import { type M6, IDENT6, mul6, transPt, trot, toIso, type Placement } from './hat';
import { compose, det } from '../geom/isometry';

export const SPECTRE_NAMES = ['Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi', 'Psi'] as const;
type Name = (typeof SPECTRE_NAMES)[number];

export function spectrePoints(a = 1, b = 1): Vec[] {
  const s3 = Math.sqrt(3) / 2;
  const ah = a * s3;
  const bh = b * s3;
  const a2 = a / 2;
  const b2 = b / 2;
  return [
    { x: 0, y: 0 }, { x: a, y: 0 }, { x: a + a2, y: -ah }, { x: a + a2 + bh, y: -ah + b2 }, { x: a + a2 + bh, y: -ah + b + b2 },
    { x: 2 * a + a2 + bh, y: -ah + b + b2 }, { x: 3 * a + bh, y: b + b2 }, { x: 3 * a, y: 2 * b }, { x: 3 * a - bh, y: 2 * b - b2 },
    { x: 2 * a + a2 - bh, y: ah + 2 * b - b2 }, { x: a + a2 - bh, y: ah + 2 * b - b2 }, { x: a2 - bh, y: ah + 2 * b - b2 },
    { x: -bh, y: 2 * b - b2 }, { x: 0, y: b },
  ];
}

const SUBST: Record<Name, (Name | null)[]> = {
  Gamma: ['Pi', 'Delta', null, 'Theta', 'Sigma', 'Xi', 'Phi', 'Gamma'],
  Delta: ['Xi', 'Delta', 'Xi', 'Phi', 'Sigma', 'Pi', 'Phi', 'Gamma'],
  Theta: ['Psi', 'Delta', 'Pi', 'Phi', 'Sigma', 'Pi', 'Phi', 'Gamma'],
  Lambda: ['Psi', 'Delta', 'Xi', 'Phi', 'Sigma', 'Pi', 'Phi', 'Gamma'],
  Xi: ['Psi', 'Delta', 'Pi', 'Phi', 'Sigma', 'Psi', 'Phi', 'Gamma'],
  Pi: ['Psi', 'Delta', 'Xi', 'Phi', 'Sigma', 'Psi', 'Phi', 'Gamma'],
  Sigma: ['Xi', 'Delta', 'Xi', 'Phi', 'Sigma', 'Pi', 'Lambda', 'Gamma'],
  Phi: ['Psi', 'Delta', 'Psi', 'Phi', 'Sigma', 'Pi', 'Phi', 'Gamma'],
  Psi: ['Psi', 'Delta', 'Psi', 'Phi', 'Sigma', 'Psi', 'Phi', 'Gamma'],
};
const STEPS: [number, number, number][] = [[60, 3, 1], [0, 2, 0], [60, 3, 1], [60, 3, 1], [0, 2, 0], [60, 3, 1], [-120, 3, 3]];

class Leaf {
  quad: Vec[] = [];
  constructor(public label: string) {}
}
class Meta {
  constructor(
    public tiles: (Leaf | Meta)[],
    public trs: M6[],
    public quad: Vec[],
  ) {}
}

function baseTiles(a: number, b: number, rotationDeg = 30): Record<Name, Leaf | Meta> {
  const pts = spectrePoints(a, b);
  const quad = [3, 5, 7, 11].map((i) => pts[i]!);
  const tiles = {} as Record<Name, Leaf | Meta>;
  for (const n of SPECTRE_NAMES) if (n !== 'Gamma') tiles[n] = Object.assign(new Leaf(n), { quad });
  const p8 = pts[8]!;
  const T2 = mul6([1, 0, p8.x, 0, 1, p8.y], trot((rotationDeg * Math.PI) / 180));
  tiles.Gamma = new Meta([new Leaf('Gamma1'), new Leaf('Gamma2')], [IDENT6, T2], quad);
  return tiles;
}

function supertiles(inp: Record<Name, Leaf | Meta>): Record<Name, Leaf | Meta> {
  const quad = inp.Delta.quad;
  let total = 0;
  let rot = trot(0);
  const trs: M6[] = [rot];
  let tq = quad;
  for (const [ang, frm, to] of STEPS) {
    if (ang !== 0) {
      total += ang;
      rot = trot((total * Math.PI) / 180);
      tq = quad.map((q) => transPt(rot, q));
    }
    const src = transPt(trs[trs.length - 1]!, quad[frm]!);
    const tt: M6 = [1, 0, src.x - tq[to]!.x, 0, 1, src.y - tq[to]!.y];
    trs.push(mul6(tt, rot));
  }
  const R: M6 = [-1, 0, 0, 0, 1, 0];
  const rtrs = trs.map((t) => mul6(R, t));
  const superQuad = [transPt(rtrs[6]!, quad[2]!), transPt(rtrs[5]!, quad[1]!), transPt(rtrs[3]!, quad[2]!), transPt(rtrs[0]!, quad[1]!)];
  const out = {} as Record<Name, Leaf | Meta>;
  for (const label of SPECTRE_NAMES) {
    const subs = SUBST[label];
    const tiles: (Leaf | Meta)[] = [];
    const ts: M6[] = [];
    subs.forEach((s, i) => {
      if (s) {
        tiles.push(inp[s]);
        ts.push(rtrs[i]!);
      }
    });
    out[label] = new Meta(tiles, ts, superQuad);
  }
  return out;
}

function collect(t: Leaf | Meta, T: M6, out: Placement[]): void {
  if (t instanceof Leaf) out.push({ iso: toIso(T), reflected: false });
  else t.tiles.forEach((ch, i) => collect(ch, mul6(T, t.trs[i]!), out));
}

const cache = new Map<string, Placement[]>();

/** Spectres inside the level-`level` supertile `which`; all placements are direct isometries of the base polygon. */
export function spectrePatch(level: number, which: Name = 'Delta', a = 1, b = 1): Placement[] {
  const key = `${level}${which}${a}${b}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let tiles = baseTiles(a, b);
  for (let i = 0; i < level; i++) tiles = supertiles(tiles);
  const out: Placement[] = [];
  collect(tiles[which], IDENT6, out);
  // the construction alternates chirality by level; make every placement direct
  if (out.length && det(out[0]!.iso) < 0) {
    const flip = { a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    for (const p of out) p.iso = compose(flip, p.iso);
  }
  for (const p of out) p.reflected = det(p.iso) < 0;
  cache.set(key, out);
  return out;
}

export function spectreBase(a = 1, b = 1): Polygon {
  const pts = spectrePoints(a, b);
  return isCCW(pts) ? pts : ensureCCW(pts);
}
