/**
 * A decoration document: a stack of layers over the tile background.
 *
 * Each layer is a complete decoration (ports, curves, strokes, swatches,
 * fills) composited over the layers below with its own opacity and blend
 * mode, like layers in a paint program. Fills are bounded by the lines of
 * their own layer. Layer 0 is the bottom of the stack.
 */
import { type Decor, emptyDecor, isEmptyDecor } from './model';

/** CSS mix-blend-mode names; PDF uses the same set (ColorDodge for color-dodge, …). */
export const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

export const blendLabel = (m: BlendMode): string => (m === 'color-dodge' ? 'dodge' : m === 'color-burn' ? 'burn' : m.replace('-', ' '));
export const pdfBlend = (m: BlendMode): string => m.split('-').map((w) => w[0]!.toUpperCase() + w.slice(1)).join('');

export interface DecorLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  blend: BlendMode;
  decor: Decor;
}

export interface DecorDoc {
  layers: DecorLayer[];
  /** index of the layer being edited */
  active: number;
  /** tile colour under all layers, or null for the default */
  background: string | null;
}

const newId = (): string => Math.random().toString(36).slice(2, 9);

export const makeLayer = (name: string, decor: Decor = emptyDecor()): DecorLayer => ({
  id: newId(),
  name,
  visible: true,
  opacity: 1,
  blend: 'normal',
  decor: { ...decor, background: null },
});

export const emptyDoc = (): DecorDoc => ({ layers: [makeLayer('Layer 1')], active: 0, background: null });

export const isEmptyDoc = (d: DecorDoc): boolean => !d.background && d.layers.every((l) => isEmptyDecor(l.decor));

/** layers that contribute to the picture, bottom first */
export const shownLayers = (d: DecorDoc): DecorLayer[] => d.layers.filter((l) => l.visible && l.opacity > 0 && !isEmptyDecor(l.decor));

export const activeLayer = (d: DecorDoc): DecorLayer => d.layers[Math.min(d.active, d.layers.length - 1)]!;

/** Accept a document, or a single decoration saved before layers existed. */
export function toDoc(x: unknown): DecorDoc {
  if (!x || typeof x !== 'object') return emptyDoc();
  const o = x as Partial<DecorDoc> & Partial<Decor>;
  if (Array.isArray(o.layers) && o.layers.length) {
    const layers = o.layers.map((l, i) => ({
      id: l.id || newId(),
      name: l.name || `Layer ${i + 1}`,
      visible: l.visible !== false,
      opacity: typeof l.opacity === 'number' ? l.opacity : 1,
      blend: (BLEND_MODES as readonly string[]).includes(l.blend) ? l.blend : 'normal',
      decor: { ...emptyDecor(), ...l.decor, background: null },
    }));
    return { layers, active: Math.max(0, Math.min(o.active ?? 0, layers.length - 1)), background: o.background ?? null };
  }
  const legacy = { ...emptyDecor(), ...(o as Partial<Decor>) };
  return { layers: [makeLayer('Layer 1', legacy)], active: 0, background: legacy.background ?? null };
}

const nextName = (d: DecorDoc): string => {
  let n = d.layers.length + 1;
  while (d.layers.some((l) => l.name === `Layer ${n}`)) n++;
  return `Layer ${n}`;
};

export function setActiveDecor(d: DecorDoc, decor: Decor): DecorDoc {
  const layers = d.layers.slice();
  layers[d.active] = { ...layers[d.active]!, decor: { ...decor, background: null } };
  return { ...d, layers };
}

export function updateLayer(d: DecorDoc, i: number, patch: Partial<Omit<DecorLayer, 'id' | 'decor'>>): DecorDoc {
  const layers = d.layers.slice();
  layers[i] = { ...layers[i]!, ...patch };
  return { ...d, layers };
}

/** new empty layer just above the active one */
export function addLayer(d: DecorDoc): DecorDoc {
  const layers = d.layers.slice();
  layers.splice(d.active + 1, 0, makeLayer(nextName(d)));
  return { ...d, layers, active: d.active + 1 };
}

export function duplicateLayer(d: DecorDoc): DecorDoc {
  const src = activeLayer(d);
  const copy: DecorLayer = { ...structuredClone(src), id: newId(), name: `${src.name} copy` };
  const layers = d.layers.slice();
  layers.splice(d.active + 1, 0, copy);
  return { ...d, layers, active: d.active + 1 };
}

export function removeLayer(d: DecorDoc): DecorDoc {
  if (d.layers.length <= 1) return { ...d, layers: [makeLayer(d.layers[0]?.name ?? 'Layer 1')], active: 0 };
  const layers = d.layers.filter((_, i) => i !== d.active);
  return { ...d, layers, active: Math.max(0, d.active - 1) };
}

/** Move the active layer to position `to` (clamped); it stays active. */
export function moveLayer(d: DecorDoc, to: number): DecorDoc {
  const j = Math.max(0, Math.min(d.layers.length - 1, to));
  if (j === d.active) return d;
  const layers = d.layers.slice();
  const [l] = layers.splice(d.active, 1);
  layers.splice(j, 0, l!);
  return { ...d, layers, active: j };
}
