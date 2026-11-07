import { type Polygon, bounds } from '../geom/polygon';
import { type NetTiling } from '../envelope/tiling';
import { SvgCanvas, svgEl, pathOf } from '../render/svgcanvas';
import { type Vec } from '../geom/vec';
import { apply, toSvgTransform } from '../geom/isometry';
import { type Decor, isEmptyDecor } from '../decor/model';
import { defineDecor, DEFAULT_TILE_FILL } from '../decor/render';

export const HUES = [210, 30, 150, 270, 60, 330, 180, 90, 240, 0, 120, 300];

export interface PreviewDecor {
  tile: Polygon;
  decor: Decor;
  borders: boolean;
}

export class TilingPreview {
  readonly canvas: SvgCanvas;
  private fittedFor = '';

  constructor(parent: HTMLElement) {
    this.canvas = new SvgCanvas(parent, ['defs', 'tiles', 'art', 'folds', 'lines']);
    this.canvas.panPredicate = () => true;
    const defs = svgEl('defs');
    const pat = svgEl('pattern', { id: 'hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
    pat.appendChild(svgEl('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: 'var(--bad)', 'stroke-width': 2 }));
    defs.appendChild(pat);
    this.canvas.svg.insertBefore(defs, this.canvas.svg.firstChild);
  }

  /** `folds`: hinge segments in net coordinates, drawn inside every copy so the original polygon stays visible. */
  render(tiling: NetTiling | null, base: Polygon, fitKey: string, folds: [Vec, Vec][] = [], deco: PreviewDecor | null = null): void {
    const c = this.canvas;
    for (const l of ['defs', 'tiles', 'art', 'folds', 'lines']) c.clear(l);
    if (!tiling) return;
    if (this.fittedFor !== fitKey) {
      const near = tiling.copies.filter((k) => k.poly.length).slice(0, 40).flatMap((k) => k.poly);
      c.fit(bounds(near.length ? near : base), 20);
      this.fittedFor = fitKey;
    }
    const borders = deco ? deco.borders : true;
    const hasArt = !!deco && !isEmptyDecor(deco.decor);
    if (hasArt) {
      const defs = svgEl('defs');
      defineDecor(defs, deco.tile, deco.decor, 'env-decor');
      c.layer('defs').appendChild(defs);
    }
    const plain = deco?.decor.background ?? (hasArt || !borders ? DEFAULT_TILE_FILL : null);
    for (const k of tiling.copies) {
      const hue = HUES[k.cls % HUES.length]!;
      const isHome = k.iso.a === 1 && k.iso.d === 1 && k.iso.e === 0 && k.iso.f === 0;
      const fill = k.overlapping ? 'var(--bad-fill)' : plain ?? `hsl(${hue} 55% ${isHome ? 62 : 82}%)`;
      c.layer('tiles').appendChild(
        svgEl('path', {
          d: pathOf(k.poly),
          fill,
          'fill-opacity': k.overlapping ? 0.5 : 1,
          // without borders, a hairline of the fill colour hides anti-aliasing seams
          stroke: borders || k.overlapping ? 'none' : fill,
          'stroke-width': c.px(0.8),
          'stroke-linejoin': 'round',
        }),
      );
      if (k.overlapping) {
        c.layer('lines').appendChild(svgEl('path', { d: pathOf(k.poly), fill: 'none', stroke: 'var(--bad)', 'stroke-width': c.px(1) }));
        continue;
      }
      if (hasArt) c.layer('art').appendChild(svgEl('use', { href: '#env-decor', transform: toSvgTransform(k.iso) }));
      if (!borders) continue;
      c.layer('lines').appendChild(
        svgEl('path', { d: pathOf(k.poly), fill: 'none', stroke: 'var(--ink)', 'stroke-width': c.px(1), 'stroke-linejoin': 'round' }),
      );
      for (const [a, b] of folds) {
        c.layer('folds').appendChild(
          svgEl('path', {
            d: pathOf([apply(k.iso, a), apply(k.iso, b)], false),
            stroke: 'var(--ink)',
            'stroke-width': c.px(0.8),
            'stroke-dasharray': `${c.px(3)} ${c.px(3)}`,
            opacity: 0.45,
            fill: 'none',
          }),
        );
      }
    }
  }
}
