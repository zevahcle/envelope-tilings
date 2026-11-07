import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { layoutPage, findLattice, type PrintSource, type SourceCopy, PT_PER_MM } from '../src/print/layout';
import { buildPdf } from '../src/print/pdf';
import { translation, apply } from '../src/geom/isometry';
import { ensureCCW, bounds } from '../src/geom/polygon';
import { emptyDecor, type Decor } from '../src/decor/model';
import { SEAM_TILES } from '../src/seam/library';
import { findContacts, gamma, edgeClasses } from '../src/seam/contacts';
import { deformedTile, curvePreset, normaliseCurve } from '../src/seam/deform';

const OUT = process.env.PRINT_OUT;
const square = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
const latticeCopies = (): SourceCopy[] => {
  const out: SourceCopy[] = [];
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) out.push({ iso: translation({ x: i, y: j }), reflected: false, fill: '#ccddee' });
  return out;
};
const decor: Decor = {
  ...emptyDecor(),
  ports: [0.125, 0.375, 0.625, 0.875],
  curves: [
    { a: 0.125, b: 0.375, color: '#0072b2', width: 0.05, bend: 0.5 },
    { a: 0.625, b: 0.875, color: '#d55e00', width: 0.05, bend: 0.5 },
  ],
  swatches: [{ pts: [{ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.4 }, { x: 0.5, y: 0.6 }], color: '#009e73', opacity: 0.6 }],
};

function save(name: string, bytes: Uint8Array) {
  if (!OUT) return;
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${name}.pdf`, bytes);
}

describe('print layout', () => {
  it('finds the square lattice', () => {
    const l = findLattice(latticeCopies())!;
    expect(Math.hypot(l[0].x, l[0].y)).toBeCloseTo(1);
    expect(Math.hypot(l[1].x, l[1].y)).toBeCloseTo(1);
  });

  it('fills a letter page with a square tiling, 8 across', async () => {
    const src: PrintSource = { tile: square, copies: latticeCopies(), decor, mirror: false, borders: true, name: 'Square' };
    const L = layoutPage(src, { paper: 'letter', landscape: false, output: 'home', marginMM: 10, tilesAcross: 8, borderPt: 0.5 });
    expect(L.covered).toBe(true);
    expect(L.sizeMM).toBeCloseTo((215.9 - 20) / 8, 3);
    // every point of the art area is inside some tile
    for (const p of [{ x: L.art.x + 1, y: L.art.y + 1 }, { x: L.art.x + L.art.w - 1, y: L.art.y + L.art.h - 1 }]) {
      expect(L.tiles.some((t) => { const b = bounds(square.map((q) => apply(t.m, q))); return p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY; })).toBe(true);
    }
    const pdf = await buildPdf(L);
    const head = new TextDecoder().decode(pdf.slice(0, 8));
    expect(head).toBe('%PDF-1.4');
    // xref offsets point at "n 0 obj"
    const txt = new TextDecoder('latin1').decode(pdf);
    const start = Number(/startxref\n(\d+)/.exec(txt)![1]);
    const entries = txt.slice(start).split('\n').slice(3).filter((l) => / n $/.test(l));
    entries.forEach((e, i) => expect(txt.slice(Number(e.slice(0, 10)), Number(e.slice(0, 10)) + 10)).toMatch(new RegExp(`^${i + 1} 0 obj`)));
    save('square-letter', pdf);
  });

  it('pro output adds 3 mm bleed and a trim box', async () => {
    const src: PrintSource = { tile: square, copies: latticeCopies(), decor: emptyDecor(), mirror: false, borders: false, name: 'Square' };
    const L = layoutPage(src, { paper: 'a4', landscape: true, output: 'pro', marginMM: 10, tilesAcross: 10, borderPt: 0.5 });
    expect(L.pageW / PT_PER_MM).toBeCloseTo(297 + 6, 3);
    expect(L.pageH / PT_PER_MM).toBeCloseTo(210 + 6, 3);
    const txt = new TextDecoder('latin1').decode(await buildPdf(L));
    expect(txt).toContain('/TrimBox');
    expect(txt).toContain('/BleedBox');
  });

  for (const [id, across, paper] of [['hat', 14, 'a3'], ['spectre', 10, 'a4']] as const) {
    it(`${id}: a larger substitution patch fills the page`, async () => {
      const def = SEAM_TILES.find((t) => t.id === id)!;
      const params = Object.fromEntries((def.params ?? []).map((p) => [p.key, p.value]));
      const base = ensureCCW(def.build(params));
      const placements = def.patch(params, def.defaultLevel);
      const classes = edgeClasses(gamma(findContacts(base, placements, false).contacts), base.length);
      const free = classes.find((c) => c.verdict !== 'straight');
      const curves = free ? { [free.rep]: normaliseCurve(curvePreset('s', 0.12), free.H) } : {};
      const tile = deformedTile(base, classes, curves);
      const fill = (r: boolean) => (r ? '#f2c79b' : '#b9d0ea');
      const src: PrintSource = {
        tile,
        copies: placements.map((p) => ({ iso: p.iso, reflected: p.reflected, fill: fill(p.reflected) })),
        patch: (l) => (l > 5 ? null : def.patch(params, l).map((p) => ({ iso: p.iso, reflected: p.reflected, fill: fill(p.reflected) }))),
        startLevel: def.defaultLevel,
        decor: emptyDecor(),
        mirror: false,
        borders: true,
        name: def.name,
      };
      const L = layoutPage(src, { paper, landscape: false, output: 'home', marginMM: 10, tilesAcross: across, borderPt: 0.5 });
      expect(L.covered).toBe(true);
      expect(L.tiles.length).toBeGreaterThan(across * across);
      const pdf = await buildPdf(L);
      expect(pdf.length).toBeLessThan(2_000_000);
      save(`${id}-${paper}`, pdf);
    });
  }
});
