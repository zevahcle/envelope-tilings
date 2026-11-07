import { type Cut, type HingeSpec } from '../envelope/model';
import { type SeamCurves } from '../seam/deform';
import { type Decor } from '../decor/model';
import { type PaletteId } from '../decor/palette';

export type Tool = 'draw' | 'hinge' | 'erase' | 'pan';
export type DecorTool = 'port' | 'connect' | 'brush' | 'swatch' | 'erase' | 'pan';

export interface AppState {
  mode: 'envelope' | 'seam';
  tileId: string;
  params: Record<string, number>;
  cuts: Cut[];
  hinges: HingeSpec[];
  /** 0 = closed envelope, 1 = fully open */
  open: number;
  /** draw only the unfolded net, without the envelope underneath */
  netOnly: boolean;
  tool: Tool;
  message: string;
  /* seam mode */
  seamTileId: string;
  seamParams: Record<string, number>;
  seamLevel: number;
  curves: SeamCurves;
  /** class representative selected for presets */
  selectedClass: number | null;
  /* decoration (both modes) */
  decorate: boolean;
  decorEnv: Decor;
  decorSeam: Decor;
  /** draw tile outlines in the tiling */
  borders: boolean;
  /** reflected tiles use the opposite-hue palette */
  mirrorPalette: boolean;
  decorTool: DecorTool;
  color: string;
  /** brush width in percent of the tile size */
  brush: number;
  opacity: number;
  bend: number;
  palette: PaletteId;
}

export type Snapshot = Pick<
  AppState,
  'tileId' | 'params' | 'cuts' | 'hinges' | 'seamTileId' | 'seamParams' | 'seamLevel' | 'curves' | 'mode' | 'decorate' | 'decorEnv' | 'decorSeam' | 'borders' | 'mirrorPalette'
>;

export const snapshot = (s: AppState): Snapshot => ({
  mode: s.mode,
  tileId: s.tileId,
  params: { ...s.params },
  cuts: s.cuts.map((c) => ({ id: c.id, pts: c.pts.slice() })),
  hinges: s.hinges.slice(),
  seamTileId: s.seamTileId,
  seamParams: { ...s.seamParams },
  seamLevel: s.seamLevel,
  curves: Object.fromEntries(Object.entries(s.curves).map(([k, v]) => [k, v.slice()])),
  decorate: s.decorate,
  decorEnv: structuredClone(s.decorEnv),
  decorSeam: structuredClone(s.decorSeam),
  borders: s.borders,
  mirrorPalette: s.mirrorPalette,
});

export class Store {
  private state: AppState;
  private listeners = new Set<(s: AppState) => void>();
  private past: Snapshot[] = [];
  private future: Snapshot[] = [];

  constructor(initial: AppState) {
    this.state = initial;
  }

  get(): AppState {
    return this.state;
  }

  subscribe(fn: (s: AppState) => void): () => void {
    this.listeners.add(fn);
    fn(this.state);
    return () => this.listeners.delete(fn);
  }

  /** Change transient fields (tool, open, message) without touching history. */
  set(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  /** Change document fields and record an undo step. */
  commit(patch: Partial<Snapshot>, message = ''): void {
    this.past.push(snapshot(this.state));
    if (this.past.length > 200) this.past.shift();
    this.future = [];
    this.state = { ...this.state, ...patch, message };
    this.emit();
  }

  undo(): void {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(snapshot(this.state));
    this.state = { ...this.state, ...prev, message: 'undo' };
    this.emit();
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(snapshot(this.state));
    this.state = { ...this.state, ...next, message: 'redo' };
    this.emit();
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.state);
  }
}
