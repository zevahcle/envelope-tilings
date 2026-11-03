import { type Polygon, bounds } from '../geom/polygon';
import { type Placement } from '../tiles/hat';
import { type DeformedPatch } from '../seam/deform';
import { SvgCanvas, svgEl, pathOf } from '../render/svgcanvas';
import { toSvgTransform } from '../geom/isometry';

export class SeamPreview {
  readonly canvas: SvgCanvas;
  private fittedFor = '';

  constructor(parent: HTMLElement) {
    this.canvas = new SvgCanvas(parent, ['defs', 'tiles']);
    this.canvas.panPredicate = () => true;
  }

  render(deformed: Polygon, placements: Placement[], patch: DeformedPatch, fitKey: string): void {
    const c = this.canvas;
    const defs = c.clear('defs');
    const d = svgEl('defs');
    d.appendChild(svgEl('path', { id: 'seam-shape', d: pathOf(deformed) }));
    defs.appendChild(d);
    if (this.fittedFor !== fitKey) {
      const n = Math.min(placements.length, 60);
      const pts = patch.polys.slice(0, n).flatMap((p) => p);
      c.fit(bounds(pts.length ? pts : deformed), 20);
      this.fittedFor = fitKey;
    }
    const g = c.clear('tiles');
    placements.forEach((p, k) => {
      const over = patch.overlapping[k];
      g.appendChild(
        svgEl('use', {
          href: '#seam-shape',
          transform: toSvgTransform(p.iso),
          fill: over ? 'var(--bad-fill)' : p.reflected ? 'hsl(30 60% 78%)' : k === 0 ? 'hsl(210 55% 62%)' : 'hsl(210 55% 82%)',
          stroke: over ? 'var(--bad)' : 'var(--ink)',
          'stroke-width': c.px(1),
          'stroke-linejoin': 'round',
          'vector-effect': 'non-scaling-stroke',
        }),
      );
    });
  }
}
