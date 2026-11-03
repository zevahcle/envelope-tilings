import { type Polygon, regularPolygon, ensureCCW } from '../geom/polygon';
import { translation } from '../geom/isometry';
import { type Placement, hat14, tileAB, hatPatch } from '../tiles/hat';
import { spectreBase, spectrePatch } from '../tiles/spectre';
import { findContacts, replaceTiles } from './contacts';

export interface SeamParam {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
}

export interface SeamTileDef {
  id: string;
  name: string;
  note: string;
  params?: SeamParam[];
  levels: [number, number];
  defaultLevel: number;
  build: (params: Record<string, number>) => Polygon;
  /** placements of `build(params)` forming a patch of a tiling */
  patch: (params: Record<string, number>, level: number) => Placement[];
}

function lattice(u: { x: number; y: number }, v: { x: number; y: number }, r: number): Placement[] {
  const out: Placement[] = [];
  for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) out.push({ iso: translation({ x: i * u.x + j * v.x, y: i * u.y + j * v.y }), reflected: false });
  return out;
}

const S3 = Math.sqrt(3);

export const SEAM_TILES: SeamTileDef[] = [
  {
    id: 'parallelogram',
    name: 'Parallelogram (translations)',
    note: 'Two free classes: opposite edges carry the same curve, half-turned (Escher’s give-and-take).',
    params: [{ key: 'shear', label: 'Shear', min: 0, max: 1, step: 0.05, value: 0.4 }],
    levels: [2, 6],
    defaultLevel: 4,
    build: ({ shear = 0.4 }) => [{ x: 0, y: 0 }, { x: 1.6, y: 0 }, { x: 1.6 + shear, y: 1 }, { x: shear, y: 1 }],
    patch: ({ shear = 0.4 }, level) => lattice({ x: 1.6, y: 0 }, { x: shear, y: 1 }, level),
  },
  {
    id: 'hexagon',
    name: 'Regular hexagon (translations)',
    note: 'Three free classes, one per pair of opposite edges.',
    levels: [2, 6],
    defaultLevel: 4,
    build: () => regularPolygon(6, 1, 0),
    patch: (_p, level) => lattice({ x: 1.5, y: S3 / 2 }, { x: 0, y: S3 }, level),
  },
  {
    id: 'spectre',
    name: 'Spectre, Tile(1,1) chiral',
    note: 'One free class: a single curve, placed alternately on the 14 edges, reproduces the published Spectres.',
    levels: [1, 3],
    defaultLevel: 2,
    build: () => spectreBase(),
    patch: (_p, level) => spectrePatch(level),
  },
  {
    id: 'hat',
    name: 'Hat family Tile(a,b)',
    note: 'Rigid: reflected tiles force every edge to coincide with its mirror image, so no edge can be curved. Only the lengths a, b are free.',
    params: [
      { key: 'a', label: 'a', min: 0, max: 2, step: 0.05, value: 1 },
      { key: 'b', label: 'b', min: 0, max: 2, step: 0.05, value: S3 },
    ],
    levels: [1, 3],
    defaultLevel: 2,
    build: ({ a = 1, b = S3 }) => ensureCCW(tileAB(Math.max(a, 1e-6), Math.max(b, 1e-6))),
    patch: ({ a = 1, b = S3 }, level) => {
      const base = hat14();
      const hats = hatPatch(level);
      if (Math.abs(a - 1) < 1e-9 && Math.abs(b - S3) < 1e-9) return hats;
      const { polys, contacts } = findContacts(base, hats, false);
      return replaceTiles(hats, polys, contacts, tileAB(Math.max(a, 1e-6), Math.max(b, 1e-6)));
    },
  },
];

export const seamTileById = (id: string): SeamTileDef => SEAM_TILES.find((t) => t.id === id) ?? SEAM_TILES[0]!;

export function seamDefaultParams(t: SeamTileDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of t.params ?? []) out[p.key] = p.value;
  return out;
}
