import { type Cut, type HingeSpec } from '../envelope/model';

export type Tool = 'draw' | 'hinge' | 'erase' | 'pan';

export interface AppState {
  mode: 'envelope' | 'seam';
  tileId: string;
  params: Record<string, number>;
  cuts: Cut[];
  hinges: HingeSpec[];
  /** 0 = closed envelope, 1 = fully open */
  open: number;
  tool: Tool;
  message: string;
}

type Snapshot = Pick<AppState, 'tileId' | 'params' | 'cuts' | 'hinges'>;

const snapshot = (s: AppState): Snapshot => ({
  tileId: s.tileId,
  params: { ...s.params },
  cuts: s.cuts.map((c) => ({ id: c.id, pts: c.pts.slice() })),
  hinges: s.hinges.slice(),
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
