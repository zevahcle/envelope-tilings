import { type Vec } from '../geom/vec';
import { type Bounds } from '../geom/polygon';

const NS = 'http://www.w3.org/2000/svg';

export const svgEl = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number> = {},
): SVGElementTagNameMap[K] => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

export const pathOf = (pts: Vec[], closed = true): string =>
  pts.length === 0 ? '' : pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(5)} ${p.y.toFixed(5)}`).join('') + (closed ? 'Z' : '');

/**
 * An SVG viewport with world coordinates (y up), pan and zoom, and named layers.
 */
export class SvgCanvas {
  readonly svg: SVGSVGElement;
  readonly world: SVGGElement;
  private layers = new Map<string, SVGGElement>();
  private view = { cx: 0, cy: 0, scale: 100 };
  private dragging: { x: number; y: number; cx: number; cy: number } | null = null;
  spaceHeld = false;
  /** returns true when the canvas should pan on pointer drag */
  panPredicate: (ev: PointerEvent) => boolean = () => false;
  onViewChange: (() => void) | null = null;

  constructor(parent: HTMLElement, layerNames: string[]) {
    this.svg = svgEl('svg', { class: 'canvas', xmlns: NS });
    this.world = svgEl('g');
    this.svg.appendChild(this.world);
    for (const name of layerNames) {
      const g = svgEl('g', { 'data-layer': name });
      this.world.appendChild(g);
      this.layers.set(name, g);
    }
    parent.appendChild(this.svg);
    new ResizeObserver(() => this.applyView()).observe(this.svg);
    this.svg.addEventListener('wheel', (ev) => this.onWheel(ev), { passive: false });
    this.svg.addEventListener('pointerdown', (ev) => {
      if (ev.button === 1 || this.spaceHeld || this.panPredicate(ev)) {
        this.dragging = { x: ev.clientX, y: ev.clientY, cx: this.view.cx, cy: this.view.cy };
        this.svg.setPointerCapture(ev.pointerId);
        ev.preventDefault();
        ev.stopImmediatePropagation();
      }
    }, { capture: true });
    this.svg.addEventListener('pointermove', (ev) => {
      if (!this.dragging) return;
      const s = this.pixelsPerUnit();
      this.view.cx = this.dragging.cx - (ev.clientX - this.dragging.x) / s;
      this.view.cy = this.dragging.cy + (ev.clientY - this.dragging.y) / s;
      this.applyView();
      ev.stopImmediatePropagation();
    }, { capture: true });
    const end = (ev: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = null;
      ev.stopImmediatePropagation();
    };
    this.svg.addEventListener('pointerup', end, { capture: true });
    this.svg.addEventListener('pointercancel', end, { capture: true });
    this.applyView();
  }

  layer(name: string): SVGGElement {
    return this.layers.get(name)!;
  }

  clear(name: string): SVGGElement {
    const g = this.layer(name);
    while (g.firstChild) g.removeChild(g.firstChild);
    return g;
  }

  get isPanning(): boolean {
    return this.dragging !== null;
  }

  pixelsPerUnit(): number {
    return this.view.scale;
  }

  /** world length of one screen pixel */
  px(n = 1): number {
    return n / this.view.scale;
  }

  toWorld(clientX: number, clientY: number): Vec {
    const r = this.svg.getBoundingClientRect();
    const s = this.view.scale;
    return {
      x: this.view.cx + (clientX - r.left - r.width / 2) / s,
      y: this.view.cy - (clientY - r.top - r.height / 2) / s,
    };
  }

  fit(b: Bounds, paddingPx = 40): void {
    const r = this.svg.getBoundingClientRect();
    const w = Math.max(1e-9, b.maxX - b.minX);
    const h = Math.max(1e-9, b.maxY - b.minY);
    const sx = (r.width - 2 * paddingPx) / w;
    const sy = (r.height - 2 * paddingPx) / h;
    this.view = { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, scale: Math.max(1e-6, Math.min(sx, sy)) };
    this.applyView();
  }

  private onWheel(ev: WheelEvent): void {
    ev.preventDefault();
    const before = this.toWorld(ev.clientX, ev.clientY);
    const factor = Math.exp(-ev.deltaY * 0.0015);
    this.view.scale = Math.min(5000, Math.max(5, this.view.scale * factor));
    const after = this.toWorld(ev.clientX, ev.clientY);
    this.view.cx += before.x - after.x;
    this.view.cy += before.y - after.y;
    this.applyView();
  }

  private applyView(): void {
    const r = this.svg.getBoundingClientRect();
    const s = this.view.scale;
    // y up: flip, then translate so that (cx,cy) is the centre
    this.world.setAttribute(
      'transform',
      `translate(${r.width / 2} ${r.height / 2}) scale(${s} ${-s}) translate(${-this.view.cx} ${-this.view.cy})`,
    );
    this.svg.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
    this.onViewChange?.();
  }

  serialize(): string {
    const clone = this.svg.cloneNode(true) as SVGSVGElement;
    const r = this.svg.getBoundingClientRect();
    clone.setAttribute('width', String(r.width));
    clone.setAttribute('height', String(r.height));
    clone.setAttribute('xmlns', NS);
    return new XMLSerializer().serializeToString(clone);
  }
}

export function download(filename: string, content: string, type = 'image/svg+xml'): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
