import { describe, it, expect } from 'vitest';
import { vec, dist } from '../src/geom/vec';
import { reflection, apply, compose, invert, mapSegment, halfTurn, isDirect } from '../src/geom/isometry';
import { area, isCCW, interiorPoint, pointInPolygon, polygonsOverlap, isSimple, interiorAngles } from '../src/geom/polygon';
import { segmentsCrossProperly, polylineSelfIntersects } from '../src/geom/intersect';
import { kleinApply, kleinMul, symmetrize, resample, edgeFrame, toLocal, fromLocal } from '../src/geom/curve';
import { buildArrangement } from '../src/geom/arrangement';

const sq = [vec(0, 0), vec(1, 0), vec(1, 1), vec(0, 1)];

describe('isometry', () => {
  it('reflects across a line', () => {
    const r = reflection(vec(0, 0), vec(1, 0));
    expect(apply(r, vec(2, 3))).toEqual({ x: 2, y: -3 });
    expect(isDirect(r)).toBe(false);
    const rr = compose(r, r);
    expect(apply(rr, vec(2, 3)).y).toBeCloseTo(3);
  });
  it('inverts', () => {
    const g = compose(halfTurn(vec(1, 2)), reflection(vec(0, 0), vec(1, 1)));
    const p = vec(0.3, -0.7);
    const q = apply(invert(g), apply(g, p));
    expect(dist(p, q)).toBeLessThan(1e-12);
  });
  it('maps segments onto segments', () => {
    const g = mapSegment(vec(0, 0), vec(1, 0), vec(2, 2), vec(2, 3));
    expect(dist(apply(g, vec(0, 0)), vec(2, 2))).toBeLessThan(1e-12);
    expect(dist(apply(g, vec(1, 0)), vec(2, 3))).toBeLessThan(1e-12);
    expect(isDirect(g)).toBe(true);
    const m = mapSegment(vec(0, 0), vec(1, 0), vec(2, 2), vec(2, 3), true);
    expect(dist(apply(m, vec(1, 0)), vec(2, 3))).toBeLessThan(1e-12);
    expect(isDirect(m)).toBe(false);
  });
});

describe('polygon', () => {
  it('area and orientation', () => {
    expect(area(sq)).toBeCloseTo(1);
    expect(isCCW(sq)).toBe(true);
    expect(interiorAngles(sq).every((a) => Math.abs(a - Math.PI / 2) < 1e-12)).toBe(true);
  });
  it('interior point and containment', () => {
    const L = [vec(0, 0), vec(2, 0), vec(2, 1), vec(1, 1), vec(1, 2), vec(0, 2)];
    const p = interiorPoint(L);
    expect(pointInPolygon(p, L)).toBe(true);
    expect(pointInPolygon(vec(1.5, 1.5), L)).toBe(false);
  });
  it('overlap ignores shared edges', () => {
    const right = sq.map((p) => vec(p.x + 1, p.y));
    expect(polygonsOverlap(sq, right)).toBe(false);
    const shifted = sq.map((p) => vec(p.x + 0.5, p.y + 0.5));
    expect(polygonsOverlap(sq, shifted)).toBe(true);
    const inside = [vec(0.2, 0.2), vec(0.4, 0.2), vec(0.3, 0.4)];
    expect(polygonsOverlap(sq, inside)).toBe(true);
  });
  it('simplicity', () => {
    expect(isSimple(sq)).toBe(true);
    expect(isSimple([vec(0, 0), vec(1, 1), vec(1, 0), vec(0, 1)])).toBe(false);
  });
});

describe('intersect', () => {
  it('proper crossing', () => {
    expect(segmentsCrossProperly(vec(0, 0), vec(1, 1), vec(0, 1), vec(1, 0))).toBe(true);
    expect(segmentsCrossProperly(vec(0, 0), vec(1, 0), vec(1, 0), vec(2, 0))).toBe(false);
    expect(segmentsCrossProperly(vec(0, 0), vec(2, 0), vec(1, 0), vec(1, 1))).toBe(false); // T-junction
  });
  it('self intersection', () => {
    expect(polylineSelfIntersects([vec(0, 0), vec(1, 1), vec(1, 0), vec(0, 1)], false)).toBe(true);
    expect(polylineSelfIntersects(sq, true)).toBe(false);
  });
});

describe('curve algebra', () => {
  const L = 2;
  const c = resample([vec(0, 0), vec(0.5, 0.3), vec(1.2, -0.1), vec(2, 0)], 9);
  it('Klein group relations', () => {
    expect(kleinMul('R', 'M')).toBe('RM');
    expect(kleinMul('RM', 'M')).toBe('R');
    const back = kleinApply('R', kleinApply('R', c, L), L);
    back.forEach((p, i) => expect(dist(p, c[i]!)).toBeLessThan(1e-12));
    const rm = kleinApply('RM', c, L);
    const rm2 = kleinApply('M', kleinApply('R', c, L), L);
    rm.forEach((p, i) => expect(dist(p, rm2[i]!)).toBeLessThan(1e-12));
  });
  it('symmetrisation is idempotent and invariant', () => {
    const s = symmetrize(c, L, ['I', 'R']);
    const s2 = symmetrize(s, L, ['I', 'R']);
    s.forEach((p, i) => expect(dist(p, s2[i]!)).toBeLessThan(1e-12));
    const rs = kleinApply('R', s, L);
    s.forEach((p, i) => expect(dist(p, rs[i]!)).toBeLessThan(1e-12));
    const m = symmetrize(c, L, ['I', 'M']);
    m.forEach((p) => expect(Math.abs(p.y)).toBeLessThan(1e-12));
  });
  it('local frames round-trip', () => {
    const f = edgeFrame(vec(1, 1), vec(3, 2));
    const p = vec(2.2, 0.4);
    expect(dist(fromLocal(f, toLocal(f, p)), p)).toBeLessThan(1e-12);
    // outward normal of a ccw square's bottom edge points down
    const g = edgeFrame(vec(0, 0), vec(1, 0));
    expect(g.n.y).toBeLessThan(0);
  });
});

describe('arrangement', () => {
  it('splits a square by a diagonal and a T-junction cut', () => {
    const arr = buildArrangement([[...sq, sq[0]!], [vec(0, 0), vec(1, 1)], [vec(0.5, 0), vec(0.5, 0.5)]]);
    expect(arr.faces.length).toBe(3);
    const total = arr.faces.reduce((s, f) => s + area(f.map((i) => arr.verts[i]!)), 0);
    expect(total).toBeCloseTo(1);
    expect(arr.outer.length).toBe(1);
  });
});
