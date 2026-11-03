import { type Polygon, bounds } from '../geom/polygon';
import { type NetTiling } from '../envelope/tiling';
import { SvgCanvas, svgEl, pathOf } from '../render/svgcanvas';

const HUES = [210, 30, 150, 270, 60, 330, 180, 90, 240, 0, 120, 300];

export class TilingPreview {
  readonly canvas: SvgCanvas;
  private fittedFor = '';

  constructor(parent: HTMLElement) {
    this.canvas = new SvgCanvas(parent, ['tiles', 'labels']);
    this.canvas.panPredicate = () => true;
    const defs = svgEl('defs');
    const pat = svgEl('pattern', { id: 'hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
    pat.appendChild(svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: 'var(--bad)', 'stroke-width': 2 }));
    defs.appendChild(pat);
    this.canvas.svg.insertBefore(defs, this.canvas.svg.firstChild);
  }

  render(tiling: NetTiling | null, base: Polygon, fitKey: string): void {
    const c = this.canvas;
    const g = c.clear('tiles');
    if (!tiling) return;
    if (this.fittedFor !== fitKey) {
      const near = tiling.copies.filter((k) => k.poly.length).slice(0, 40).flatMap((k) => k.poly);
      c.fit(bounds(near.length ? near : base), 20);
      this.fittedFor = fitKey;
    }
    for (const k of tiling.copies) {
      const hue = HUES[k.cls % HUES.length]!;
      const isHome = k.iso.a === 1 && k.iso.d === 1 && k.iso.e === 0 && k.iso.f === 0;
      g.appendChild(
        svgEl('path', {
          d: pathOf(k.poly),
          fill: k.overlapping ? 'var(--bad-fill)' : `hsl(${hue} 55% ${isHome ? 62 : 82}%)`,
          stroke: k.overlapping ? 'var(--bad)' : 'var(--ink)',
          'stroke-width': c.px(1),
          'stroke-linejoin': 'round',
          'fill-opacity': k.overlapping ? 0.5 : 1,
        }),
      );
    }
  }
}
