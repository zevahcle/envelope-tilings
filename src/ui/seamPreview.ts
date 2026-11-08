import { type Polygon, bounds } from '../geom/polygon';
import { type Placement } from '../tiles/hat';
import { type DeformedPatch } from '../seam/deform';
import { SvgCanvas, svgEl, pathOf } from '../render/svgcanvas';
import { toSvgTransform } from '../geom/isometry';
import { defineLayers, useLayer, DEFAULT_TILE_FILL, type LayerArt } from '../decor/render';
import { alternateColor } from '../decor/palette';

export interface SeamPreviewDecor {
  layers: LayerArt[];
  background: string | null;
  borders: boolean;
  mirrorPalette: boolean;
}

export class SeamPreview {
  readonly canvas: SvgCanvas;
  private fittedFor = '';

  constructor(parent: HTMLElement) {
    this.canvas = new SvgCanvas(parent, ['defs', 'tiles', 'art', 'lines']);
    this.canvas.panPredicate = () => true;
  }

  render(deformed: Polygon, placements: Placement[], patch: DeformedPatch, fitKey: string, deco: SeamPreviewDecor | null = null): void {
    const c = this.canvas;
    for (const l of ['defs', 'tiles', 'art', 'lines']) c.clear(l);
    const d = svgEl('defs');
    d.appendChild(svgEl('path', { id: 'seam-shape', d: pathOf(deformed) }));
    const borders = deco ? deco.borders : true;
    const layers = deco?.layers ?? [];
    const hasArt = layers.length > 0;
    const mirror = !!deco?.mirrorPalette;
    defineLayers(d, deformed, layers, 'seam-layer', { alt: mirror, seam: c.px(0.8) });
    c.layer('defs').appendChild(d);
    if (this.fittedFor !== fitKey) {
      const n = Math.min(placements.length, 60);
      const pts = patch.polys.slice(0, n).flatMap((p) => p);
      c.fit(bounds(pts.length ? pts : deformed), 20);
      this.fittedFor = fitKey;
    }
    const bg = deco?.background ?? (hasArt || !borders ? DEFAULT_TILE_FILL : null);
    placements.forEach((p, k) => {
      const over = patch.overlapping[k];
      const transform = toSvgTransform(p.iso);
      const fill = over
        ? 'var(--bad-fill)'
        : bg
          ? p.reflected && mirror
            ? alternateColor(bg)
            : bg
          : p.reflected
            ? 'hsl(30 60% 78%)'
            : k === 0
              ? 'hsl(210 55% 62%)'
              : 'hsl(210 55% 82%)';
      c.layer('tiles').appendChild(
        svgEl('use', {
          href: '#seam-shape',
          transform,
          fill,
          stroke: borders || over ? 'none' : fill,
          'stroke-width': c.px(0.8),
        }),
      );
      if (!over) layers.forEach((l, i) => c.layer('art').appendChild(useLayer('seam-layer', i, l, transform, p.reflected && mirror)));
      if (borders || over)
        c.layer('lines').appendChild(
          svgEl('use', {
            href: '#seam-shape',
            transform,
            fill: 'none',
            stroke: over ? 'var(--bad)' : 'var(--ink)',
            'stroke-width': c.px(1),
            'stroke-linejoin': 'round',
          }),
        );
    });
  }
}
