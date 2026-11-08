/**
 * Design files: the editable document (tile, cuts, seam curves, decoration
 * layers, view options) as JSON, to reopen and keep editing later.
 */
import { type Snapshot } from './store';
import { toDoc } from '../decor/layers';

export const DESIGN_FORMAT = 'envelope-tilings-design';
export const DESIGN_VERSION = 1;

export function designJson(snap: Snapshot): string {
  return JSON.stringify({ format: DESIGN_FORMAT, version: DESIGN_VERSION, saved: new Date().toISOString(), app: 'https://zevahcle.github.io/envelope-tilings/', design: snap }, null, 1);
}

/** Bring a stored state up to date (decorations saved before layers existed become one layer). */
export function normaliseSnapshot(st: Partial<Snapshot>): Partial<Snapshot> {
  const out = { ...st };
  if ('decorEnv' in st) out.decorEnv = toDoc(st.decorEnv);
  if ('decorSeam' in st) out.decorSeam = toDoc(st.decorSeam);
  return out;
}

export function parseDesign(text: string): Partial<Snapshot> {
  let o: unknown;
  try {
    o = JSON.parse(text);
  } catch {
    throw new Error('This file is not a design (not JSON).');
  }
  const f = o as { format?: string; version?: number; design?: Partial<Snapshot> };
  if (f?.format !== DESIGN_FORMAT || !f.design || typeof f.design !== 'object') throw new Error('This file is not an Envelope Tilings design.');
  if ((f.version ?? 1) > DESIGN_VERSION) throw new Error('This design was saved by a newer version of the editor.');
  return normaliseSnapshot(f.design);
}
