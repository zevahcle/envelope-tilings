import { type Polygon, regularPolygon } from '../geom/polygon';

export type TileFamily = 'coxeter' | 'lattice' | 'aperiodic';

export interface TileDef {
  id: string;
  name: string;
  family: TileFamily;
  /** reflections in the edges generate a discrete group with the tile as fundamental domain */
  isCoxeter: boolean;
  /** short note shown in the UI */
  note: string;
  build: (params: Record<string, number>) => Polygon;
  params?: { key: string; label: string; min: number; max: number; step: number; value: number }[];
}

const S3 = Math.sqrt(3);

export const TILES: TileDef[] = [
  {
    id: 'rectangle',
    name: 'Rectangle (envelope)',
    family: 'coxeter',
    isCoxeter: true,
    note: 'Every unfolding tiles (Akiyama). Symmetry group p2.',
    params: [{ key: 'aspect', label: 'Aspect w : h', min: 1, max: 3, step: 0.05, value: 1.6 }],
    build: ({ aspect = 1.6 }) => [
      { x: 0, y: 0 },
      { x: aspect, y: 0 },
      { x: aspect, y: 1 },
      { x: 0, y: 1 },
    ],
  },
  {
    id: 'square',
    name: 'Square',
    family: 'coxeter',
    isCoxeter: true,
    note: 'Every unfolding tiles. Symmetry group p2 (p4 when the cut allows).',
    build: () => [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ],
  },
  {
    id: 'tri-right-isosceles',
    name: 'Triangle 90°-45°-45°',
    family: 'coxeter',
    isCoxeter: true,
    note: 'Every unfolding tiles. Symmetry group p4.',
    build: () => [
      { x: 0, y: 0 },
      { x: 1.4, y: 0 },
      { x: 0, y: 1.4 },
    ],
  },
  {
    id: 'tri-half-equilateral',
    name: 'Triangle 90°-60°-30°',
    family: 'coxeter',
    isCoxeter: true,
    note: 'Every unfolding tiles. Symmetry group p6.',
    build: () => [
      { x: 0, y: 0 },
      { x: S3, y: 0 },
      { x: 0, y: 1 },
    ],
  },
  {
    id: 'tri-equilateral',
    name: 'Equilateral triangle',
    family: 'coxeter',
    isCoxeter: true,
    note: 'Every unfolding tiles. Symmetry group p3.',
    build: () => [
      { x: 0, y: 0 },
      { x: 1.5, y: 0 },
      { x: 0.75, y: (1.5 * S3) / 2 },
    ],
  },
  {
    id: 'hexagon',
    name: 'Regular hexagon',
    family: 'lattice',
    isCoxeter: false,
    note: 'Not a tile-maker: cone angles 240°. Some unfoldings tile, most do not.',
    build: () => regularPolygon(6, 0.9, 0),
  },
  {
    id: 'parallelogram',
    name: 'Parallelogram',
    family: 'lattice',
    isCoxeter: false,
    note: 'Not a tile-maker (angles ≠ 90°): reflected flaps overlap.',
    build: () => [
      { x: 0, y: 0 },
      { x: 1.6, y: 0 },
      { x: 2.1, y: 1 },
      { x: 0.5, y: 1 },
    ],
  },
];

export const tileById = (id: string): TileDef => TILES.find((t) => t.id === id) ?? TILES[0]!;

export function defaultParams(t: TileDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of t.params ?? []) out[p.key] = p.value;
  return out;
}
