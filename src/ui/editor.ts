import { type Vec, dist, normalize, sub, lerp } from '../geom/vec';
import { type Iso } from '../geom/isometry';
import { type Polygon, pointInPolygon, bounds } from '../geom/polygon';
import { nearestSegment, polylinesCross, polylineSelfIntersects } from '../geom/intersect';
import { smoothStroke } from '../geom/curve';
import { type Unfolding, type BoundaryRun, hingeSpecFor, type HingeSpec, type Piece } from '../envelope/model';
import { SvgCanvas, svgEl, pathOf } from '../render/svgcanvas';
import { type Store } from '../app/store';

/** Affine map folding a flap about its hinge: s = 0 closed (identity), s = 1 open (reflection). */
export function foldMatrix(a: Vec, b: Vec, s: number): Iso {
  const u = normalize(sub(b, a));
  const n = { x: -u.y, y: u.x };
  const k = Math.cos(Math.PI * s);
  const A = u.x * u.x + k * n.x * n.x;
  const B = u.x * u.y + k * n.x * n.y;
  const D = u.y * u.y + k * n.y * n.y;
  return { a: A, b: B, c: B, d: D, e: a.x - (A * a.x + B * a.y), f: a.y - (B * a.x + D * a.y) };
}

const matrixAttr = (g: Iso) => `matrix(${g.a} ${g.c} ${g.b} ${g.d} ${g.e} ${g.f})`;

export class EnvelopeEditor {
  readonly canvas: SvgCanvas;
  private stroke: Vec[] | null = null;
  private strokeEl: SVGPathElement | null = null;
  private current: Unfolding | null = null;
  private base: Polygon = [];
  private fittedFor = '';

  constructor(parent: HTMLElement, private store: Store) {
    this.canvas = new SvgCanvas(parent, ['back', 'flaps', 'hinges', 'outline', 'stroke', 'hover']);
    this.canvas.panPredicate = () => this.store.get().tool === 'pan';
    const svg = this.canvas.svg;
    svg.addEventListener('pointerdown', (ev) => this.onDown(ev));
    svg.addEventListener('pointermove', (ev) => this.onMove(ev));
    svg.addEventListener('pointerup', (ev) => this.onUp(ev));
    svg.addEventListener('pointercancel', () => this.cancelStroke());
    svg.addEventListener('pointerleave', () => this.canvas.clear('hover'));
  }

  render(base: Polygon, u: Unfolding, open: number, tileKey: string, netOnly = false): void {
    this.base = base;
    this.current = u;
    const c = this.canvas;
    if (this.fittedFor !== tileKey) {
      const all = [...base, ...u.flaps.flatMap((f) => f.poly)];
      c.fit(bounds(all), 60);
      this.fittedFor = tileKey;
    }
    const flat = open > 0.999;
    // Net-only view: once fully open, the net is one tile (back sheet + mirrored flaps) drawn as a
    // single filled shape with its outline; no envelope border, hinges or cut lines on top of it.
    const clean = netOnly && flat && !!u.outline;
    const back = c.clear('back');
    if (clean) {
      back.appendChild(
        svgEl('path', { d: pathOf(u.outline!), fill: 'var(--paper-front)', stroke: 'var(--ink)', 'stroke-width': c.px(1.8), 'stroke-linejoin': 'round' }),
      );
    } else {
      back.appendChild(
        svgEl('path', {
          d: pathOf(base),
          fill: netOnly ? 'var(--paper-front)' : 'var(--paper-back)',
          stroke: netOnly ? 'none' : 'var(--ink)',
          'stroke-width': c.px(1.5),
          'stroke-linejoin': 'round',
        }),
      );
    }
    const flaps = c.clear('flaps');
    for (const f of u.flaps) {
      if (clean && !f.conflict) continue;
      const g = svgEl('g', { transform: matrixAttr(foldMatrix(f.hinge.a, f.hinge.b, open)) });
      const shade = Math.abs(Math.cos(Math.PI * open));
      g.appendChild(
        svgEl('path', {
          d: pathOf(f.piece.poly),
          fill: f.conflict ? 'var(--bad-fill)' : 'var(--paper-front)',
          'fill-opacity': netOnly ? 1 : 0.55 + 0.45 * shade,
          stroke: f.conflict ? 'var(--bad)' : clean ? 'none' : 'var(--ink)',
          'stroke-width': 1.5,
          'stroke-linejoin': 'round',
          'vector-effect': 'non-scaling-stroke',
        }),
      );
      flaps.appendChild(g);
    }
    for (const p of u.pieces) {
      if (p.hinge) continue;
      flaps.appendChild(svgEl('path', { d: pathOf(p.poly), fill: 'var(--bad-fill)', stroke: 'var(--bad)', 'stroke-width': c.px(1.5) }));
    }
    const hinges = c.clear('hinges');
    if (!clean) {
      for (const f of u.flaps) {
        hinges.appendChild(
          svgEl('path', {
            d: pathOf([f.hinge.a, f.hinge.b], false),
            stroke: 'var(--accent)',
            'stroke-width': c.px(5),
            'stroke-linecap': 'round',
            'stroke-dasharray': `${c.px(8)} ${c.px(6)}`,
            fill: 'none',
            opacity: 0.9,
          }),
        );
      }
    }
    const outline = c.clear('outline');
    if (u.outline && flat && !clean) {
      outline.appendChild(
        svgEl('path', { d: pathOf(u.outline), fill: 'none', stroke: 'var(--accent-2)', 'stroke-width': c.px(2.5), 'stroke-linejoin': 'round' }),
      );
    }
  }

  private snapRadius(): number {
    return this.canvas.px(14);
  }

  private onDown(ev: PointerEvent): void {
    if (ev.button !== 0 || this.canvas.isPanning) return;
    const tool = this.store.get().tool;
    const p = this.canvas.toWorld(ev.clientX, ev.clientY);
    if (tool === 'draw') {
      this.stroke = [p];
      this.strokeEl = svgEl('path', { d: '', fill: 'none', stroke: 'var(--accent-2)', 'stroke-width': this.canvas.px(2), 'stroke-linecap': 'round' });
      this.canvas.clear('stroke').appendChild(this.strokeEl);
      this.canvas.svg.setPointerCapture(ev.pointerId);
    } else if (tool === 'hinge') {
      this.setHingeAt(p);
    } else if (tool === 'erase') {
      this.eraseAt(p);
    }
  }

  private onMove(ev: PointerEvent): void {
    const p = this.canvas.toWorld(ev.clientX, ev.clientY);
    if (this.stroke && this.strokeEl) {
      const last = this.stroke[this.stroke.length - 1]!;
      if (dist(last, p) > this.canvas.px(1.5)) {
        this.stroke.push(p);
        this.strokeEl.setAttribute('d', pathOf(this.stroke, false));
      }
      return;
    }
    const tool = this.store.get().tool;
    const hover = this.canvas.clear('hover');
    if (tool === 'hinge') {
      const run = this.nearestRun(p);
      if (run) hover.appendChild(svgEl('path', { d: pathOf([run.a, run.b], false), stroke: 'var(--accent)', 'stroke-width': this.canvas.px(9), opacity: 0.35, 'stroke-linecap': 'round' }));
    } else if (tool === 'erase') {
      const hit = this.nearestCut(p);
      if (hit) hover.appendChild(svgEl('path', { d: pathOf(hit.pts, false), stroke: 'var(--bad)', 'stroke-width': this.canvas.px(8), opacity: 0.35, fill: 'none', 'stroke-linecap': 'round' }));
    }
  }

  private onUp(ev: PointerEvent): void {
    if (!this.stroke) return;
    const pts = this.stroke;
    this.cancelStroke();
    this.finishCut(pts, ev);
  }

  private cancelStroke(): void {
    this.stroke = null;
    this.strokeEl = null;
    this.canvas.clear('stroke');
  }

  private snapEnd(p: Vec): Vec | null {
    const r = this.snapRadius();
    // prefer a base vertex
    let best: { d: number; p: Vec } | null = null;
    for (const v of this.base) {
      const d = dist(v, p);
      if (d <= r && (!best || d < best.d)) best = { d, p: v };
    }
    if (best) return best.p;
    const onBase = nearestSegment(this.base, true, p, r);
    if (onBase) best = { d: onBase.dist, p: onBase.point };
    for (const c of this.store.get().cuts) {
      const hit = nearestSegment(c.pts, false, p, r);
      if (hit && (!best || hit.dist < best.d)) best = { d: hit.dist, p: hit.point };
    }
    return best ? best.p : null;
  }

  private finishCut(raw: Vec[], _ev: PointerEvent): void {
    const store = this.store;
    if (raw.length < 2 || dist(raw[0]!, raw[raw.length - 1]!) < this.canvas.px(6)) return;
    const tol = this.canvas.px(2.5);
    const smooth = smoothStroke(raw, tol, 96);
    const a = this.snapEnd(smooth[0]!);
    const b = this.snapEnd(smooth[smooth.length - 1]!);
    if (!a || !b) {
      store.set({ message: 'Start and end the cut on the border or on another cut.' });
      return;
    }
    const pts = [a, ...smooth.slice(1, -1), b];
    if (dist(a, b) < this.canvas.px(6)) {
      store.set({ message: 'The cut is too short.' });
      return;
    }
    if (polylineSelfIntersects(pts, false)) {
      store.set({ message: 'A cut cannot cross itself.' });
      return;
    }
    const inner = pts.slice(1, -1);
    if (inner.some((p) => !pointInPolygon(p, this.base))) {
      store.set({ message: 'Keep the cut inside the front sheet.' });
      return;
    }
    if (polylinesCross(this.base, pts, true, false)) {
      store.set({ message: 'The cut leaves the sheet.' });
      return;
    }
    for (const c of store.get().cuts) {
      if (polylinesCross(c.pts, pts, false, false)) {
        store.set({ message: 'Cuts may meet at their ends but must not cross.' });
        return;
      }
    }
    const id = `c${Date.now().toString(36)}`;
    store.commit({ cuts: [...store.get().cuts, { id, pts }] }, 'cut added');
  }

  private nearestRun(p: Vec): BoundaryRun | null {
    if (!this.current) return null;
    let best: { d: number; run: BoundaryRun } | null = null;
    for (const piece of this.current.pieces)
      for (const run of piece.runs) {
        const hit = nearestSegment([run.a, run.b], false, p, this.snapRadius());
        if (hit && (!best || hit.dist < best.d)) best = { d: hit.dist, run };
      }
    return best?.run ?? null;
  }

  private pieceOfRun(run: BoundaryRun): Piece | undefined {
    return this.current?.pieces.find((p) => p.runs.includes(run));
  }

  private setHingeAt(p: Vec): void {
    const run = this.nearestRun(p);
    if (!run || !this.current) return;
    const piece = this.pieceOfRun(run);
    if (!piece) return;
    // drop any spec currently resolving to this piece, then add the new one
    const keep: HingeSpec[] = this.store.get().hinges.filter((spec) => {
      const e0 = this.base[spec.edgeIndex]!;
      const e1 = this.base[(spec.edgeIndex + 1) % this.base.length]!;
      const q = lerp(e0, e1, spec.t);
      return !piece.runs.some((r) => r.edgeIndex === spec.edgeIndex && nearestSegment([r.a, r.b], false, q, 1e-6));
    });
    this.store.commit({ hinges: [...keep, hingeSpecFor(this.base, run)] }, 'hinge moved');
  }

  private nearestCut(p: Vec) {
    let best: { d: number; cut: { id: string; pts: Vec[] } } | null = null;
    for (const c of this.store.get().cuts) {
      const hit = nearestSegment(c.pts, false, p, this.snapRadius());
      if (hit && (!best || hit.dist < best.d)) best = { d: hit.dist, cut: c };
    }
    return best?.cut ?? null;
  }

  private eraseAt(p: Vec): void {
    const cut = this.nearestCut(p);
    if (!cut) return;
    this.store.commit({ cuts: this.store.get().cuts.filter((c) => c.id !== cut.id) }, 'cut removed');
  }
}
