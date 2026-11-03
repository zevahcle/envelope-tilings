import { describe, it, expect } from 'vitest';
import { vec, lerp } from '../src/geom/vec';
import { area, isSimple } from '../src/geom/polygon';
import { computeUnfolding } from '../src/envelope/model';
import { tileNet } from '../src/envelope/tiling';
import { PRESETS } from '../src/envelope/presets';
import { TILES, tileById, defaultParams } from '../src/tiles/library';

const rect = tileById('rectangle').build({ aspect: 1.6 });
const preset = (id: string) => PRESETS.find((p) => p.id === id)!;

describe('envelope unfolding on the rectangle', () => {
  it('wavy cut: two flaps, flattens, doubles the area, tiles by p2', () => {
    const { cuts, hinges } = preset('wave').make(rect);
    const u = computeUnfolding(rect, cuts, hinges);
    expect(u.problems).toEqual([]);
    expect(u.pieces.length).toBe(2);
    expect(u.flattens).toBe(true);
    expect(u.areaRatio).toBeCloseTo(2);
    expect(u.outline && isSimple(u.outline)).toBe(true);
    expect(area(u.outline!)).toBeCloseTo(2 * area(rect));
    const t = tileNet(rect, u.outline!);
    expect(t.copies.length).toBeGreaterThan(10);
    expect(t.tiles).toBe(true);
  });
  it('mail envelope diagonals give a rhombus', () => {
    const { cuts, hinges } = preset('diagonals').make(rect);
    const u = computeUnfolding(rect, cuts, hinges);
    expect(u.problems).toEqual([]);
    expect(u.pieces.length).toBe(4);
    expect(u.flattens).toBe(true);
    expect(u.outline!.length).toBe(4);
    expect(area(u.outline!)).toBeCloseTo(2 * area(rect));
    expect(tileNet(rect, u.outline!).tiles).toBe(true);
  });
  it('no cut: the whole front sheet hinged on one edge', () => {
    const u = computeUnfolding(rect, [], []);
    expect(u.pieces.length).toBe(1);
    expect(u.flattens).toBe(true);
    expect(u.areaRatio).toBeCloseTo(2);
    expect(tileNet(rect, u.outline!).tiles).toBe(true);
  });
  it('a cut ending on another cut (tree) still works', () => {
    const a = lerp(rect[3]!, rect[0]!, 0.5);
    const b = lerp(rect[1]!, rect[2]!, 0.5);
    const mid = lerp(a, b, 0.5);
    const top = lerp(rect[2]!, rect[3]!, 0.5);
    const u = computeUnfolding(rect, [{ id: 'h', pts: [a, mid, b] }, { id: 'v', pts: [mid, top] }], []);
    expect(u.problems).toEqual([]);
    expect(u.pieces.length).toBe(3);
    expect(u.flattens).toBe(true);
    expect(tileNet(rect, u.outline!).tiles).toBe(true);
  });
});

describe('every Coxeter tile in the library tiles with every preset', () => {
  for (const t of TILES.filter((t) => t.isCoxeter)) {
    for (const p of PRESETS) {
      it(`${t.id} / ${p.id}`, () => {
        const base = t.build(defaultParams(t));
        const { cuts, hinges } = p.make(base);
        const u = computeUnfolding(base, cuts, hinges);
        expect(u.problems).toEqual([]);
        expect(u.flattens).toBe(true);
        expect(u.areaRatio).toBeCloseTo(2);
        expect(tileNet(base, u.outline!).tiles).toBe(true);
      });
    }
  }
});

describe('non-Coxeter tiles', () => {
  it('hexagon: flattens, but its development overlaps (not a tile-maker)', () => {
    const hex = tileById('hexagon').build({});
    const u = computeUnfolding(hex, [], []);
    expect(u.flattens).toBe(true);
    expect(tileNet(hex, u.outline!).tiles).toBe(false);
  });
  it('a non-convex tile can fail to flatten', () => {
    const L = [vec(0, 0), vec(2, 0), vec(2, 1), vec(1, 1), vec(1, 2), vec(0, 2)];
    const u = computeUnfolding(L, [], [{ edgeIndex: 3, t: 0.5 }]);
    expect(u.pieces.length).toBe(1);
    expect(u.flaps[0]!.hinge.edgeIndex).toBe(3);
    expect(u.flattens).toBe(false);
    const ok = computeUnfolding(L, [], [{ edgeIndex: 0, t: 0.5 }]);
    expect(ok.flattens).toBe(true);
  });
});
