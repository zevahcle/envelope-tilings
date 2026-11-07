import { describe, it, expect } from 'vitest';
import { Contacts, emptyDecor, circlePoints, type Decor } from '../src/decor/model';
import { Regions } from '../src/decor/regions';
import { translation } from '../src/geom/isometry';
import { ensureCCW, area } from '../src/geom/polygon';
import { findContacts, gamma, edgeClasses } from '../src/seam/contacts';
import { SEAM_TILES } from '../src/seam/library';
import { deformedTile, deformedPatch } from '../src/seam/deform';

const square = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
const lattice = () => {
  const out = [];
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) out.push(translation({ x: i, y: j }));
  return out;
};
const curve = (a: number, b: number) => ({ a, b, color: '#000', width: 0.01, bend: 0.3 });
const withCurves = (...cs: [number, number][]): Decor => ({ ...emptyDecor(), curves: cs.map(([a, b]) => curve(a, b)) });
const total = (r: Regions) => r.regions.reduce((s, x) => s + x.area, 0);

describe('fill regions', () => {
  it('a plain tile is one region', () => {
    const r = new Regions(square, emptyDecor(), null);
    expect(r.regions.length).toBe(1);
    expect(r.locate({ x: 0.5, y: 0.5 })).toBe(0);
    expect(r.locate({ x: 1.5, y: 0.5 })).toBe(-1);
  });

  it('two crossing curves cut the square into four regions', () => {
    // bottom-mid to top-mid, right-mid to left-mid
    const d = withCurves([0.125, 0.625], [0.375, 0.875]);
    const r = new Regions(square, d, null);
    expect(r.regions.length).toBe(4);
    expect(total(r)).toBeCloseTo(1, 6);
    const q = [r.locate({ x: 0.1, y: 0.1 }), r.locate({ x: 0.9, y: 0.1 }), r.locate({ x: 0.9, y: 0.9 }), r.locate({ x: 0.1, y: 0.9 })];
    expect(new Set(q).size).toBe(4);
    expect(new Set(r.cls).size).toBe(4);
  });

  it('across seams, the four quadrants form one cell around each corner', () => {
    const d = withCurves([0.125, 0.625], [0.375, 0.875]);
    const r = new Regions(square, d, new Contacts(square, lattice()));
    expect(new Set(r.cls).size).toBe(1);
    expect(r.covered(r.locate({ x: 0.1, y: 0.1 }), true).length).toBe(4);
    expect(r.covered(r.locate({ x: 0.1, y: 0.1 }), false).length).toBe(1);
  });

  it('an arc around a corner separates the corner from the rest', () => {
    // bottom at x=0.2 to left at y=0.2: cuts off the corner at the origin
    const d = withCurves([0.05, 0.95]);
    const r = new Regions(square, d, new Contacts(square, lattice()));
    expect(r.regions.length).toBe(2);
    const corner = r.locate({ x: 0.02, y: 0.02 });
    const rest = r.locate({ x: 0.6, y: 0.6 });
    expect(corner).not.toBe(rest);
    // the corner piece's sides meet the neighbours' "rest" region across the seams
    expect(r.cls[corner]).toBe(r.cls[rest]);
  });

  it('a closed stroke is an island: its inside is a region and a hole of the outside', () => {
    const d: Decor = { ...emptyDecor(), strokes: [{ pts: [...circlePoints({ x: 0.5, y: 0.5 }, 0.2, 48), { x: 0.7, y: 0.5 }], color: '#000', width: 0.01, opacity: 1 }] };
    const r = new Regions(square, d, null);
    expect(r.regions.length).toBe(2);
    const inside = r.locate({ x: 0.5, y: 0.5 });
    const outside = r.locate({ x: 0.05, y: 0.05 });
    expect(inside).not.toBe(outside);
    expect(r.regions[outside]!.holes.length).toBe(1);
    expect(r.regions[inside]!.holes.length).toBe(0);
    const fills = r.resolve([{ p: { x: 0.05, y: 0.05 }, color: '#f00', opacity: 1, linked: false }]);
    expect(fills[0]!.rings.length).toBe(2);
  });

  it('hat: regions tile the hat and the classes are found', () => {
    const def = SEAM_TILES.find((t) => t.id === 'hat')!;
    const params = Object.fromEntries((def.params ?? []).map((p) => [p.key, p.value]));
    const base = ensureCCW(def.build(params));
    const placements = def.patch(params, def.defaultLevel);
    const { contacts } = findContacts(base, placements, false);
    const tile = deformedTile(base, edgeClasses(gamma(contacts), base.length), {});
    const patch = deformedPatch(tile, placements, 0);
    const isos = placements.filter((_, k) => !patch.overlapping[k]).map((p) => p.iso);
    const d = withCurves([0.02, 0.4], [0.2, 0.7], [0.55, 0.9]);
    const r = new Regions(tile, d, new Contacts(tile, isos));
    expect(r.regions.length).toBeGreaterThan(3);
    expect(total(r)).toBeGreaterThan(area(tile) * 0.999);
    expect(new Set(r.cls).size).toBeLessThan(r.regions.length);
  });
});
