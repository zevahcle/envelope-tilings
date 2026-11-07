import { describe, it, expect } from 'vitest';
import { portOrbits, Boundary, sideMidpoints, curvePoints } from '../src/decor/model';
import { alternateColor } from '../src/decor/palette';
import { translation, apply, invert } from '../src/geom/isometry';
import { ensureCCW, transformPolygon } from '../src/geom/polygon';
import { findContacts, gamma, edgeClasses } from '../src/seam/contacts';
import { SEAM_TILES } from '../src/seam/library';
import { deformedTile, deformedPatch } from '../src/seam/deform';
import { cornerIndices } from '../src/envelope/conway';

const square = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
const lattice = () => {
  const out = [];
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) out.push(translation({ x: i, y: j }));
  return out;
};

describe('ports', () => {
  it('square lattice: a port on the bottom edge forces its translate on the top edge', () => {
    const ports = portOrbits(square, lattice(), [0.3 / 4]);
    expect(ports.length).toBe(2);
    const B = new Boundary(square);
    const pts = ports.map((p) => B.at(p.f));
    expect(pts.some((p) => Math.abs(p.x - 0.3) < 1e-6 && Math.abs(p.y) < 1e-6)).toBe(true);
    expect(pts.some((p) => Math.abs(p.x - 0.3) < 1e-6 && Math.abs(p.y - 1) < 1e-6)).toBe(true);
    expect(ports.filter((p) => p.user).length).toBe(1);
  });

  it('side midpoints of a square are four ports in two orbits', () => {
    const B = new Boundary(square);
    const mids = sideMidpoints(B, cornerIndices(square));
    expect(mids.length).toBe(4);
    const ports = portOrbits(square, lattice(), mids);
    expect(ports.length).toBe(4);
    expect(new Set(ports.map((p) => p.orbit)).size).toBe(2);
  });

  it('curves leave the border perpendicularly', () => {
    const B = new Boundary(square);
    const pts = curvePoints(B, { a: 0.125, b: 0.375, color: '#000', width: 0.01, bend: 0.5 });
    const d = { x: pts[1]!.x - pts[0]!.x, y: pts[1]!.y - pts[0]!.y };
    expect(Math.abs(d.x)).toBeLessThan(0.1 * Math.abs(d.y));
    expect(d.y).toBeGreaterThan(0);
  });

  for (const id of ['hat', 'spectre']) {
    it(`${id}: every port's partner in a neighbouring tile is in the orbit`, () => {
      const def = SEAM_TILES.find((t) => t.id === id)!;
      const params = Object.fromEntries((def.params ?? []).map((p) => [p.key, p.value]));
      const base = ensureCCW(def.build(params));
      const placements = def.patch(params, def.defaultLevel);
      const { contacts } = findContacts(base, placements, false);
      const classes = edgeClasses(gamma(contacts), base.length);
      const tile = deformedTile(base, classes, {});
      const patch = deformedPatch(tile, placements, 0);
      const isos = placements.filter((_, k) => !patch.overlapping[k]).map((p) => p.iso);
      const ports = portOrbits(tile, isos, [0.013]);
      expect(ports.length).toBeGreaterThan(1);
      // check closure on a few tile pairs
      const B = new Boundary(tile);
      let checked = 0;
      for (const p of ports) {
        const q = B.at(p.f);
        for (let a = 0; a < isos.length && checked < 400; a++) {
          const w = apply(isos[a]!, q);
          for (let b = 0; b < isos.length; b++) {
            if (a === b) continue;
            const r = B.project(apply(invert(isos[b]!), w));
            if (r.d > 1e-6) continue;
            checked++;
            expect(ports.some((x) => Math.min(Math.abs(x.f - r.f), 1 - Math.abs(x.f - r.f)) < 2e-4)).toBe(true);
          }
        }
      }
      expect(checked).toBeGreaterThan(0);
      void transformPolygon;
    });
  }
});

describe('palette', () => {
  it('alternate colour flips hue and inverts greys', () => {
    expect(alternateColor('#000000')).toBe('#ffffff');
    expect(alternateColor('#ff0000').toLowerCase()).toBe('#00ffff');
  });
});
