import { describe, it, expect } from 'vitest';
import { emptyDecor } from '../src/decor/model';
import { emptyDoc, toDoc, addLayer, duplicateLayer, removeLayer, moveLayer, updateLayer, setActiveDecor, shownLayers, pdfBlend, isEmptyDoc } from '../src/decor/layers';
import { designJson, parseDesign, normaliseSnapshot } from '../src/app/designFile';
import { type Snapshot } from '../src/app/store';

const curve = { a: 0.1, b: 0.6, color: '#000', width: 0.01, bend: 0.5 };

describe('layers', () => {
  it('a decoration saved before layers becomes one layer, keeping the tile colour', () => {
    const legacy = { ...emptyDecor(), curves: [curve], background: '#ff0000' };
    const d = toDoc(legacy);
    expect(d.layers.length).toBe(1);
    expect(d.layers[0]!.decor.curves.length).toBe(1);
    expect(d.background).toBe('#ff0000');
    expect(d.layers[0]!.decor.background).toBeNull();
    // older still: no fills field
    const { fills: _f, ...old } = emptyDecor();
    expect(toDoc(old).layers[0]!.decor.fills).toEqual([]);
  });

  it('new layers go above the active one and become active', () => {
    let d = emptyDoc();
    d = setActiveDecor(d, { ...emptyDecor(), curves: [curve] });
    d = addLayer(d);
    expect(d.layers.length).toBe(2);
    expect(d.active).toBe(1);
    expect(d.layers[1]!.name).toBe('Layer 2');
    d = setActiveDecor(d, { ...emptyDecor(), ports: [0.3] });
    expect(d.layers[0]!.decor.curves.length).toBe(1);
    expect(d.layers[1]!.decor.ports).toEqual([0.3]);
  });

  it('reorders: to back, forward, to front', () => {
    let d = addLayer(addLayer(emptyDoc()));
    const names = () => d.layers.map((l) => l.name).join(',');
    expect(names()).toBe('Layer 1,Layer 2,Layer 3');
    d = moveLayer(d, 0);
    expect(names()).toBe('Layer 3,Layer 1,Layer 2');
    expect(d.active).toBe(0);
    d = moveLayer(d, d.active + 1);
    expect(names()).toBe('Layer 1,Layer 3,Layer 2');
    d = moveLayer(d, d.layers.length - 1);
    expect(names()).toBe('Layer 1,Layer 2,Layer 3');
    expect(moveLayer(d, 99)).toBe(d);
  });

  it('duplicates deeply and deletes down to one empty layer', () => {
    let d = setActiveDecor(emptyDoc(), { ...emptyDecor(), curves: [curve] });
    d = duplicateLayer(d);
    expect(d.layers[1]!.name).toBe('Layer 1 copy');
    expect(d.layers[1]!.id).not.toBe(d.layers[0]!.id);
    expect(d.layers[1]!.decor.curves[0]).not.toBe(d.layers[0]!.decor.curves[0]);
    d = removeLayer(d);
    expect(d.layers.length).toBe(1);
    d = removeLayer(d);
    expect(d.layers.length).toBe(1);
    expect(isEmptyDoc(d)).toBe(true);
  });

  it('hidden, transparent and empty layers are not drawn', () => {
    let d = setActiveDecor(emptyDoc(), { ...emptyDecor(), curves: [curve] });
    d = setActiveDecor(addLayer(d), { ...emptyDecor(), curves: [curve] });
    d = addLayer(d);
    expect(shownLayers(d).length).toBe(2);
    expect(shownLayers(updateLayer(d, 0, { visible: false })).length).toBe(1);
    expect(shownLayers(updateLayer(d, 1, { opacity: 0 })).length).toBe(1);
  });

  it('blend modes map to PDF names', () => {
    expect(pdfBlend('color-dodge')).toBe('ColorDodge');
    expect(pdfBlend('soft-light')).toBe('SoftLight');
    expect(pdfBlend('multiply')).toBe('Multiply');
  });
});

describe('design files', () => {
  it('round-trip the document', () => {
    let doc = setActiveDecor(emptyDoc(), { ...emptyDecor(), curves: [curve], fills: [{ p: { x: 0.2, y: 0.3 }, color: '#00f', opacity: 0.5, linked: true }] });
    doc = updateLayer(addLayer(doc), 1, { blend: 'difference', opacity: 0.7, name: 'top' });
    const snap = { mode: 'seam', seamTileId: 'hat', decorEnv: emptyDoc(), decorSeam: doc, borders: false } as unknown as Snapshot;
    const back = parseDesign(designJson(snap));
    expect(back.seamTileId).toBe('hat');
    expect(back.decorSeam).toEqual(doc);
  });

  it('rejects other files and upgrades old states', () => {
    expect(() => parseDesign('{"a":1}')).toThrow(/not an Envelope Tilings design/);
    expect(() => parseDesign('nope')).toThrow(/not JSON/);
    const old = normaliseSnapshot({ decorEnv: { ...emptyDecor(), curves: [curve] } } as unknown as Partial<Snapshot>);
    expect(old.decorEnv!.layers[0]!.decor.curves.length).toBe(1);
  });
});
