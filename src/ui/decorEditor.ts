import { type Vec, dist } from '../geom/vec';
import { type Polygon, bounds } from '../geom/polygon';
import { smoothStroke, polylineLength } from '../geom/curve';
import { SvgCanvas, svgEl, pathOf } from '../render/svgcanvas';
import { type Store } from '../app/store';
import { type Decor, type Port, Boundary, hitTest, circlePoints, brushWidth } from '../decor/model';
import { defineDecor, DEFAULT_TILE_FILL } from '../decor/render';
import { type Regions, type ResolvedFill } from '../decor/regions';

export interface DecorContext {
  tile: Polygon;
  ports: Port[];
  decor: Decor;
  regions: Regions;
  fills: ResolvedFill[];
  /** changes when the tile geometry changes (refit the view) */
  key: string;
}

const close = (a: number, b: number) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b)) < 2e-4;

export class DecorEditor {
  readonly canvas: SvgCanvas;
  private ctx: DecorContext | null = null;
  private B: Boundary | null = null;
  private fittedFor = '';
  private stroke: Vec[] | null = null;
  private strokeEl: SVGPathElement | null = null;
  private pendingA: number | null = null;
  private hover: Vec | null = null;

  constructor(
    parent: HTMLElement,
    private store: Store,
    private onCommit: (d: Decor, message: string) => void,
  ) {
    this.canvas = new SvgCanvas(parent, ['defs', 'tile', 'art', 'outline', 'ports', 'overlay']);
    this.canvas.panPredicate = () => this.store.get().decorTool === 'pan';
    const svg = this.canvas.svg;
    svg.addEventListener('pointerdown', (ev) => this.onDown(ev));
    svg.addEventListener('pointermove', (ev) => this.onMove(ev));
    svg.addEventListener('pointerup', (ev) => this.onUp(ev));
    svg.addEventListener('pointerleave', () => {
      this.hover = null;
      this.drawOverlay();
    });
    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && this.pendingA !== null) {
        this.pendingA = null;
        this.drawOverlay();
      }
    });
  }

  private get diam(): number {
    if (!this.ctx) return 1;
    const b = bounds(this.ctx.tile);
    return Math.hypot(b.maxX - b.minX, b.maxY - b.minY);
  }

  /** brush width in tile units */
  width(): number {
    return this.ctx ? brushWidth(this.ctx.tile, this.store.get().brush) : 0.01;
  }

  render(ctx: DecorContext | null): void {
    this.ctx = ctx;
    const c = this.canvas;
    for (const l of ['defs', 'tile', 'art', 'outline', 'ports', 'overlay']) c.clear(l);
    if (!ctx) {
      this.B = null;
      return;
    }
    this.B = new Boundary(ctx.tile);
    if (this.fittedFor !== ctx.key) {
      c.fit(bounds(ctx.tile), 50);
      this.fittedFor = ctx.key;
      this.pendingA = null;
    }
    const defs = svgEl('defs');
    defineDecor(defs, ctx.tile, ctx.decor, 'decor-edit', { fills: ctx.fills, seam: c.px(0.8) });
    c.layer('defs').appendChild(defs);
    c.layer('tile').appendChild(svgEl('path', { d: pathOf(ctx.tile), fill: ctx.decor.background ?? DEFAULT_TILE_FILL }));
    c.layer('art').appendChild(svgEl('use', { href: '#decor-edit' }));
    c.layer('outline').appendChild(
      svgEl('path', { d: pathOf(ctx.tile), fill: 'none', stroke: 'var(--ink)', 'stroke-width': c.px(1.5), 'stroke-linejoin': 'round' }),
    );
    const ports = c.layer('ports');
    for (const p of ctx.ports) {
      const q = this.B.at(p.f);
      const used = ctx.decor.curves.some((k) => close(k.a, p.f) || close(k.b, p.f));
      ports.appendChild(
        svgEl('circle', {
          cx: q.x,
          cy: q.y,
          r: c.px(5),
          fill: used ? 'var(--ink)' : 'var(--panel)',
          stroke: used ? 'var(--panel)' : 'var(--accent)',
          'stroke-width': c.px(p.user ? 2 : 1.5),
          'stroke-dasharray': p.user ? '' : `${c.px(2)} ${c.px(1.5)}`,
        }),
      );
    }
    this.drawOverlay();
  }

  private nearPort(p: Vec): Port | null {
    if (!this.ctx || !this.B) return null;
    let best: Port | null = null;
    let bd = this.canvas.px(10);
    for (const q of this.ctx.ports) {
      const d = dist(this.B.at(q.f), p);
      if (d < bd) {
        bd = d;
        best = q;
      }
    }
    return best;
  }

  private drawOverlay(): void {
    const c = this.canvas;
    const o = c.clear('overlay');
    if (!this.B) return;
    const tool = this.store.get().decorTool;
    if (this.pendingA !== null) {
      const a = this.B.at(this.pendingA);
      o.appendChild(svgEl('circle', { cx: a.x, cy: a.y, r: c.px(8), fill: 'none', stroke: 'var(--accent-2)', 'stroke-width': c.px(2.5) }));
      if (this.hover)
        o.appendChild(
          svgEl('path', { d: pathOf([a, this.hover], false), stroke: 'var(--accent-2)', 'stroke-width': c.px(1.5), 'stroke-dasharray': `${c.px(5)} ${c.px(4)}`, fill: 'none' }),
        );
    }
    if (this.hover && (tool === 'port' || tool === 'connect')) {
      const port = this.nearPort(this.hover);
      const pr = this.B.project(this.hover);
      if (port || pr.d < c.px(14)) {
        const q = port ? this.B.at(port.f) : this.B.at(pr.f);
        o.appendChild(svgEl('circle', { cx: q.x, cy: q.y, r: c.px(7), fill: 'none', stroke: 'var(--accent-2)', 'stroke-width': c.px(1.5) }));
      }
    }
    if (tool === 'fill' && this.hover && this.ctx) {
      const r = this.ctx.regions;
      const ks = r.covered(r.locate(this.hover), this.store.get().linkFill);
      if (ks.length)
        o.appendChild(
          svgEl('path', {
            d: r.rings(ks).map((ring) => pathOf(ring)).join(' '),
            'fill-rule': 'evenodd',
            fill: this.store.get().color,
            'fill-opacity': 0.25,
            stroke: 'var(--accent-2)',
            'stroke-width': c.px(1.5),
            'stroke-dasharray': `${c.px(4)} ${c.px(3)}`,
          }),
        );
    }
    if ((tool === 'brush' || tool === 'swatch') && this.hover && !this.stroke) {
      const s = this.store.get();
      o.appendChild(svgEl('circle', { cx: this.hover.x, cy: this.hover.y, r: Math.max(this.width() / 2, c.px(1)), fill: s.color, 'fill-opacity': 0.5, stroke: 'var(--ink)', 'stroke-width': c.px(0.5) }));
    }
  }

  private onDown(ev: PointerEvent): void {
    if (ev.button !== 0 || this.canvas.isPanning || !this.ctx || !this.B) return;
    const s = this.store.get();
    const p = this.canvas.toWorld(ev.clientX, ev.clientY);
    const d = this.ctx.decor;
    const c = this.canvas;
    switch (s.decorTool) {
      case 'port': {
        const port = this.nearPort(p);
        if (port) {
          const orbit = this.ctx.ports.filter((q) => q.orbit === port.orbit).map((q) => q.f);
          const inOrbit = (f: number) => orbit.some((g) => close(g, f));
          this.onCommit(
            { ...d, ports: d.ports.filter((f) => !inOrbit(f)), curves: d.curves.filter((k) => !inOrbit(k.a) && !inOrbit(k.b)) },
            'port removed with its partners',
          );
          return;
        }
        const pr = this.B.project(p);
        if (pr.d > c.px(14)) {
          this.store.set({ message: 'Click on the tile border to place a port.' });
          return;
        }
        this.onCommit({ ...d, ports: [...d.ports, pr.f] }, 'port added; its partners were added where neighbouring tiles meet it');
        return;
      }
      case 'connect': {
        const port = this.nearPort(p);
        let f: number | null = port ? port.f : null;
        if (f === null) {
          const pr = this.B.project(p);
          if (pr.d <= c.px(14)) f = pr.f;
        }
        if (f === null) {
          this.store.set({ message: 'Click a port (or the border) to start a curve, then another to end it.' });
          return;
        }
        if (this.pendingA === null) {
          this.pendingA = f;
          this.drawOverlay();
          this.store.set({ message: 'Now click the port where the curve ends (Esc cancels).' });
          return;
        }
        if (close(this.pendingA, f)) {
          this.pendingA = null;
          this.drawOverlay();
          return;
        }
        const a = this.pendingA;
        this.pendingA = null;
        const ports = [...d.ports];
        for (const g of [a, f]) if (!this.ctx.ports.some((q) => close(q.f, g))) ports.push(g);
        this.onCommit({ ...d, ports, curves: [...d.curves, { a, b: f, color: s.color, width: this.width(), bend: s.bend }] }, 'curve added');
        return;
      }
      case 'brush':
      case 'swatch': {
        this.stroke = [p];
        this.strokeEl = svgEl('path', {
          d: '',
          fill: 'none',
          stroke: s.color,
          'stroke-opacity': s.opacity,
          'stroke-width': s.decorTool === 'brush' ? this.width() : c.px(1.5),
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round',
          'stroke-dasharray': s.decorTool === 'swatch' ? `${c.px(4)} ${c.px(3)}` : '',
        });
        c.clear('overlay').appendChild(this.strokeEl);
        c.svg.setPointerCapture(ev.pointerId);
        return;
      }
      case 'fill': {
        const r = this.ctx.regions;
        const k = r.locate(p);
        if (k < 0) {
          this.store.set({ message: 'Click inside the tile to fill a region.' });
          return;
        }
        const covered = new Set(r.covered(k, s.linkFill));
        // a fill that the new one covers completely is replaced
        const kept = (d.fills ?? []).filter((f) => !covered.has(r.locate(f.p)) || (f.linked && !s.linkFill));
        const fill = { p, color: s.color, opacity: s.opacity, linked: s.linkFill };
        this.onCommit({ ...d, fills: [...kept, fill] }, s.linkFill && covered.size > 1 ? `filled ${covered.size} pieces that join across the seams` : 'region filled');
        return;
      }
      case 'erase': {
        const hit = hitTest(this.B, d, p, c.px(6));
        if (!hit) {
          // topmost fill that colours the region under the pointer
          const r = this.ctx.regions;
          const k = r.locate(p);
          const fills = d.fills ?? [];
          for (let i = fills.length - 1; i >= 0 && k >= 0; i--)
            if (r.covered(r.locate(fills[i]!.p), fills[i]!.linked).includes(k)) {
              this.onCommit({ ...d, fills: fills.filter((_, j) => j !== i) }, 'fill erased');
              return;
            }
          return;
        }
        if (hit.kind === 'curve') this.onCommit({ ...d, curves: d.curves.filter((_, i) => i !== hit.index) }, 'curve erased');
        else if (hit.kind === 'stroke') this.onCommit({ ...d, strokes: d.strokes.filter((_, i) => i !== hit.index) }, 'stroke erased');
        else this.onCommit({ ...d, swatches: d.swatches.filter((_, i) => i !== hit.index) }, 'swatch erased');
        return;
      }
      default:
        return;
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
    this.hover = p;
    this.drawOverlay();
  }

  private onUp(_ev: PointerEvent): void {
    if (!this.stroke || !this.ctx) return;
    const s = this.store.get();
    const pts = this.stroke;
    this.stroke = null;
    this.strokeEl = null;
    this.canvas.clear('overlay');
    const d = this.ctx.decor;
    const c = this.canvas;
    const L = polylineLength(pts);
    if (s.decorTool === 'brush') {
      const line = L < c.px(3) ? [pts[0]!, { x: pts[0]!.x + c.px(0.5), y: pts[0]!.y }] : smoothStroke(pts, c.px(1.5), 160);
      this.onCommit({ ...d, strokes: [...d.strokes, { pts: line, color: s.color, width: this.width(), opacity: s.opacity }] }, 'brush stroke');
    } else {
      const shape = L < c.px(6) ? circlePoints(pts[0]!, Math.max(this.width(), this.diam * 0.01) * 1.5) : smoothStroke([...pts, pts[0]!], c.px(1.5), 160);
      this.onCommit({ ...d, swatches: [...d.swatches, { pts: shape, color: s.color, opacity: s.opacity }] }, L < c.px(6) ? 'dot' : 'swatch');
    }
  }
}
