import { type Vec, dist } from '../geom/vec';
import { type Polygon, bounds } from '../geom/polygon';
import { nearestSegment } from '../geom/intersect';
import { edgeFrame, toLocal, fromLocal, kleinApply } from '../geom/curve';
import { type EdgeClass } from '../seam/contacts';
import { type SeamCurves, edgeCurve, normaliseCurve, classOfEdge } from '../seam/deform';
import { SvgCanvas, svgEl, pathOf } from '../render/svgcanvas';
import { type Store } from '../app/store';

export const CLASS_COLORS = ['#2a7bd5', '#e0862b', '#2e8b57', '#8e44ad', '#c0392b', '#16a085', '#d35400', '#2c3e50'];
export const classColor = (classes: EdgeClass[], rep: number): string => CLASS_COLORS[Math.max(0, classes.findIndex((c) => c.rep === rep)) % CLASS_COLORS.length]!;

export interface SeamView {
  base: Polygon;
  classes: EdgeClass[];
  deformed: Polygon;
  curves: SeamCurves;
}

export class SeamEditor {
  readonly canvas: SvgCanvas;
  private stroke: Vec[] | null = null;
  private strokeEl: SVGPathElement | null = null;
  private view: SeamView | null = null;
  private fittedFor = '';

  constructor(parent: HTMLElement, private store: Store) {
    this.canvas = new SvgCanvas(parent, ['tile', 'edges', 'vertices', 'hover', 'stroke']);
    this.canvas.panPredicate = () => this.store.get().tool === 'pan';
    const svg = this.canvas.svg;
    svg.addEventListener('pointerdown', (ev) => this.onDown(ev));
    svg.addEventListener('pointermove', (ev) => this.onMove(ev));
    svg.addEventListener('pointerup', (ev) => this.onUp(ev));
    svg.addEventListener('pointercancel', () => this.cancel());
    svg.addEventListener('pointerleave', () => this.canvas.clear('hover'));
  }

  render(view: SeamView, fitKey: string, selected: number | null): void {
    this.view = view;
    const c = this.canvas;
    if (this.fittedFor !== fitKey) {
      c.fit(bounds(view.base), 70);
      this.fittedFor = fitKey;
    }
    const tile = c.clear('tile');
    tile.appendChild(svgEl('path', { d: pathOf(view.deformed), fill: 'var(--paper-back)', stroke: 'none' }));
    const edges = c.clear('edges');
    const m = view.base.length;
    for (let i = 0; i < m; i++) {
      const f = edgeFrame(view.base[i]!, view.base[(i + 1) % m]!);
      const curve = edgeCurve(view.classes, view.curves, i).map((q) => fromLocal(f, { x: q.x * f.L, y: q.y * f.L }));
      const hit = classOfEdge(view.classes, i);
      const straight = hit?.cls.verdict === 'straight';
      const isSel = hit && hit.cls.rep === selected;
      edges.appendChild(
        svgEl('path', {
          d: pathOf(curve, false),
          fill: 'none',
          stroke: hit ? classColor(view.classes, hit.cls.rep) : 'var(--muted)',
          'stroke-width': c.px(isSel ? 4.5 : 3),
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-dasharray': straight ? `${c.px(6)} ${c.px(5)}` : 'none',
          opacity: straight ? 0.6 : 1,
        }),
      );
    }
    const verts = c.clear('vertices');
    for (const v of view.base) verts.appendChild(svgEl('circle', { cx: v.x, cy: v.y, r: c.px(3), fill: 'var(--ink)' }));
  }

  private nearestEdge(p: Vec): { index: number; dist: number } | null {
    if (!this.view) return null;
    const hit = nearestSegment(this.view.base, true, p, this.canvas.px(40));
    return hit ? { index: hit.index, dist: hit.dist } : null;
  }

  private onDown(ev: PointerEvent): void {
    if (ev.button !== 0 || this.canvas.isPanning || this.store.get().tool === 'pan') return;
    const p = this.canvas.toWorld(ev.clientX, ev.clientY);
    this.stroke = [p];
    this.strokeEl = svgEl('path', { d: '', fill: 'none', stroke: 'var(--ink)', 'stroke-width': this.canvas.px(2), 'stroke-linecap': 'round', opacity: 0.7 });
    this.canvas.clear('stroke').appendChild(this.strokeEl);
    this.canvas.svg.setPointerCapture(ev.pointerId);
  }

  private onMove(ev: PointerEvent): void {
    const p = this.canvas.toWorld(ev.clientX, ev.clientY);
    if (this.stroke && this.strokeEl) {
      if (dist(this.stroke[this.stroke.length - 1]!, p) > this.canvas.px(1.5)) {
        this.stroke.push(p);
        this.strokeEl.setAttribute('d', pathOf(this.stroke, false));
      }
      return;
    }
    const hover = this.canvas.clear('hover');
    const e = this.nearestEdge(p);
    if (e && this.view) {
      const m = this.view.base.length;
      hover.appendChild(svgEl('path', { d: pathOf([this.view.base[e.index]!, this.view.base[(e.index + 1) % m]!], false), stroke: 'var(--accent-2)', 'stroke-width': this.canvas.px(12), opacity: 0.18, 'stroke-linecap': 'round' }));
    }
  }

  private onUp(ev: PointerEvent): void {
    if (!this.stroke) return;
    const pts = this.stroke;
    this.cancel();
    const p = this.canvas.toWorld(ev.clientX, ev.clientY);
    if (pts.length < 4 || dist(pts[0]!, p) < this.canvas.px(5)) {
      this.selectAt(p);
      return;
    }
    this.finishStroke(pts);
  }

  private cancel(): void {
    this.stroke = null;
    this.strokeEl = null;
    this.canvas.clear('stroke');
  }

  private selectAt(p: Vec): void {
    const e = this.nearestEdge(p);
    if (!e || !this.view) return;
    const hit = classOfEdge(this.view.classes, e.index);
    if (hit) this.store.set({ selectedClass: hit.cls.rep, message: `Class of edge ${e.index}: ${hit.cls.verdict}` });
  }

  private finishStroke(pts: Vec[]): void {
    if (!this.view) return;
    const mid = pts[Math.floor(pts.length / 2)]!;
    const e = this.nearestEdge(mid) ?? this.nearestEdge(pts[0]!);
    if (!e) {
      this.store.set({ message: 'Draw close to an edge of the tile.' });
      return;
    }
    const hit = classOfEdge(this.view.classes, e.index);
    if (!hit) return;
    if (hit.cls.verdict === 'straight') {
      this.store.set({ selectedClass: hit.cls.rep, message: `Edge ${e.index} is rigid: mirrored contacts force it to stay straight.` });
      return;
    }
    const m = this.view.base.length;
    const f = edgeFrame(this.view.base[e.index]!, this.view.base[(e.index + 1) % m]!);
    let local = pts.map((q) => {
      const l = toLocal(f, q);
      return { x: l.x / f.L, y: l.y / f.L };
    });
    if (local[0]!.x > local[local.length - 1]!.x) local = local.reverse();
    const curve = normaliseCurve(local, hit.cls.H);
    // the drawn edge carries label g relative to the representative: c_edge = g(c_rep) ⇒ c_rep = g(c_edge)
    const rep = kleinApply(hit.label, curve, 1);
    this.store.commit({ curves: { ...this.store.get().curves, [hit.cls.rep]: rep } }, `curve set on class of edge ${hit.cls.rep}`);
    this.store.set({ selectedClass: hit.cls.rep });
  }
}
