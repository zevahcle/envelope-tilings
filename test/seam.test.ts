import { describe, it, expect } from 'vitest';
import { hat14, tileAB, hatPatch } from '../src/tiles/hat';
import { spectreBase, spectrePatch } from '../src/tiles/spectre';
import { findContacts, gamma, gammaEquals, edgeClasses, replaceTiles } from '../src/seam/contacts';
import { deformedTile, deformedPatch, curvePreset, normaliseCurve } from '../src/seam/deform';
import { area, isSimple } from '../src/geom/polygon';
import { translation } from '../src/geom/isometry';

describe('hat substitution and contacts', () => {
  const base = hat14();
  it('hat 14-gon has the right size and angles', () => {
    expect(base.length).toBe(14);
    expect(area(base)).toBeCloseTo(8 * Math.sqrt(3), 6); // 8 kites of area √3
  });
  const l2 = hatPatch(2);
  const l3 = hatPatch(3);
  it('patches are edge-to-edge and overlap-free', () => {
    expect(Math.abs(Math.abs(l2[0]!.iso.a * l2[0]!.iso.d - l2[0]!.iso.b * l2[0]!.iso.c) - 1)).toBeLessThan(1e-9);
    for (const pl of [l2, l3]) {
      const { report } = findContacts(base, pl);
      expect(report.badGroups).toBe(0);
      expect(report.partial).toBe(0);
      expect(report.angleBad).toBe(0);
      expect(report.crossings).toBe(0);
      expect(report.interiorVertices).toBeGreaterThan(0);
    }
    expect(l3.length).toBeGreaterThan(l2.length);
    expect(l2.filter((p) => p.reflected).length).toBeGreaterThan(0);
  });
  it('Γ is stable between levels and forces every class straight', () => {
    const g2 = gamma(findContacts(base, l2).contacts);
    const g3 = gamma(findContacts(base, l3).contacts);
    expect(gammaEquals(g2, g3)).toBe(true);
    const classes = edgeClasses(g3, 14);
    expect(classes.length).toBe(2);
    for (const c of classes) {
      expect(c.verdict).toBe('straight');
      expect(c.H).toContain('M');
    }
    expect(classes.map((c) => c.edges.length).sort()).toEqual([6, 8]);
  });
  it('Tile(a,b) re-placed along hat contacts is a valid tiling with the same Γ', () => {
    const { polys, contacts } = findContacts(base, l2);
    const g = gamma(contacts);
    for (const [a, b] of [[Math.sqrt(3), 1], [1, 1], [1, 2]]) {
      const nb = tileAB(a!, b!, base);
      expect(isSimple(nb)).toBe(true);
      const pl = replaceTiles(l2, polys, contacts, nb);
      const r = findContacts(nb, pl);
      expect(r.report.badGroups + r.report.partial + r.report.angleBad + r.report.crossings).toBe(0);
      expect(gammaEquals(gamma(r.contacts), g)).toBe(true);
    }
  });
});

describe('Spectre', () => {
  const base = spectreBase();
  it('patches are homochiral, edge-to-edge and have one free class', () => {
    const l2 = spectrePatch(2);
    const l3 = spectrePatch(3);
    expect(l2.every((p) => !p.reflected)).toBe(true);
    const r2 = findContacts(base, l2);
    const r3 = findContacts(base, l3);
    for (const r of [r2, r3]) expect(r.report.badGroups + r.report.partial + r.report.angleBad + r.report.crossings).toBe(0);
    const g2 = gamma(r2.contacts);
    const g3 = gamma(r3.contacts);
    expect(gammaEquals(g2, g3)).toBe(true);
    expect(g3.every((e) => !e.mirrored)).toBe(true);
    const classes = edgeClasses(g3, 14);
    expect(classes.length).toBe(1);
    expect(classes[0]!.verdict).toBe('free');
    const labels = classes[0]!.edges.sort((a, b) => a.edge - b.edge).map((e) => e.label);
    for (let i = 0; i < 14; i++) expect(labels[i]).toBe(i % 2 === 0 ? labels[0] : labels[1]);
    expect(labels[0]).not.toBe(labels[1]);
  });
  it('a curved Spectre tiles without overlaps', () => {
    const l2 = spectrePatch(2);
    const classes = edgeClasses(gamma(findContacts(base, l2).contacts), 14);
    const curve = normaliseCurve(curvePreset('bump', 0.12), classes[0]!.H);
    const tile = deformedTile(base, classes, { [classes[0]!.rep]: curve });
    expect(isSimple(tile)).toBe(true);
    expect(area(tile)).toBeCloseTo(area(base), 6); // bumps in and out cancel
    const dp = deformedPatch(tile, l2);
    expect(dp.anyOverlap).toBe(false);
    const big = deformedTile(base, classes, { [classes[0]!.rep]: normaliseCurve(curvePreset('bump', 2.5), classes[0]!.H) });
    expect(deformedPatch(big, l2).anyOverlap || !isSimple(big)).toBe(true);
  });
});

describe('lattice tiles', () => {
  it('parallelogram translations: two free classes with half-turn labels', () => {
    const base = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2.5, y: 1 }, { x: 0.5, y: 1 }];
    const pl = [];
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) pl.push({ iso: translation({ x: 2 * i + 0.5 * j, y: j }), reflected: false });
    const r = findContacts(base, pl);
    expect(r.report.badGroups + r.report.partial + r.report.crossings).toBe(0);
    const classes = edgeClasses(gamma(r.contacts), 4);
    expect(classes.length).toBe(2);
    expect(classes.every((c) => c.verdict === 'free')).toBe(true);
    const c0 = classes[0]!;
    expect(c0.edges.find((e) => e.edge !== c0.rep)!.label).toBe('R');
  });
});
