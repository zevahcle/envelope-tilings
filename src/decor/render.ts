import { type Polygon } from '../geom/polygon';
import { svgEl, pathOf } from '../render/svgcanvas';
import { type Decor, Boundary, curvePoints } from './model';

export const DEFAULT_TILE_FILL = '#fbf8f1';

/**
 * Append to `defs` a clip path and a group with the decoration, both in tile
 * coordinates, so that each tile can show it with <use href="#id">.
 */
export function defineDecor(
  defs: SVGElement,
  tile: Polygon,
  decor: Decor,
  id: string,
  opts: { colorMap?: (c: string) => string; background?: boolean } = {},
): void {
  const map = opts.colorMap ?? ((c: string) => c);
  const clip = svgEl('clipPath', { id: `${id}-clip`, clipPathUnits: 'userSpaceOnUse' });
  clip.appendChild(svgEl('path', { d: pathOf(tile) }));
  defs.appendChild(clip);
  const g = svgEl('g', { id, 'clip-path': `url(#${id}-clip)` });
  if (opts.background && decor.background) g.appendChild(svgEl('path', { d: pathOf(tile), fill: map(decor.background) }));
  for (const s of decor.swatches) g.appendChild(svgEl('path', { d: pathOf(s.pts), fill: map(s.color), 'fill-opacity': s.opacity }));
  const B = new Boundary(tile);
  for (const c of decor.curves)
    g.appendChild(
      svgEl('path', {
        d: pathOf(curvePoints(B, c), false),
        fill: 'none',
        stroke: map(c.color),
        'stroke-width': c.width,
        'stroke-linecap': 'round',
      }),
    );
  for (const s of decor.strokes)
    g.appendChild(
      svgEl('path', {
        d: pathOf(s.pts, false),
        fill: 'none',
        stroke: map(s.color),
        'stroke-opacity': s.opacity,
        'stroke-width': s.width,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      }),
    );
  defs.appendChild(g);
}
