import { type Polygon, bounds } from '../geom/polygon';
import { svgEl, pathOf } from '../render/svgcanvas';
import { type Decor, Boundary, curvePoints } from './model';
import { type ResolvedFill } from './regions';
import { type BlendMode } from './layers';
import { alternateColor } from './palette';

export const DEFAULT_TILE_FILL = '#fbf8f1';

/**
 * Default hairline around opaque fills, in tile units. It hides anti-aliasing
 * seams between adjacent regions, also across tile edges: regions never cross
 * the tile edge, so fills are drawn unclipped and the hairline overlaps the
 * neighbour by half its width.
 */
export const fillSeam = (tile: Polygon): number => {
  const b = bounds(tile);
  return Math.hypot(b.maxX - b.minX, b.maxY - b.minY) * 0.002;
};

function fillAttrs(f: ResolvedFill, map: (c: string) => string, seam: number): Record<string, string | number> {
  const c = map(f.color);
  const opaque = f.opacity >= 0.999;
  return {
    d: f.rings.map((r) => pathOf(r)).join(' '),
    fill: c,
    'fill-rule': 'evenodd',
    'fill-opacity': f.opacity,
    stroke: opaque ? c : 'none',
    'stroke-width': seam,
    'stroke-linejoin': 'round',
  };
}

/**
 * Append to `defs` a clip path and a group with the decoration, both in tile
 * coordinates, so that each tile can show it with <use href="#id">.
 */
export function defineDecor(
  defs: SVGElement,
  tile: Polygon,
  decor: Decor,
  id: string,
  opts: { colorMap?: (c: string) => string; background?: boolean; fills?: ResolvedFill[]; seam?: number } = {},
): void {
  const map = opts.colorMap ?? ((c: string) => c);
  const clip = svgEl('clipPath', { id: `${id}-clip`, clipPathUnits: 'userSpaceOnUse' });
  clip.appendChild(svgEl('path', { d: pathOf(tile) }));
  defs.appendChild(clip);
  const outer = svgEl('g', { id });
  const g = svgEl('g', { 'clip-path': `url(#${id}-clip)` });
  if (opts.background && decor.background) g.appendChild(svgEl('path', { d: pathOf(tile), fill: map(decor.background) }));
  for (const f of opts.fills ?? []) outer.appendChild(svgEl('path', fillAttrs(f, map, opts.seam ?? fillSeam(tile))));
  outer.appendChild(g);
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
  defs.appendChild(outer);
}

/** One layer ready to draw: its decoration, resolved fills and compositing. */
export interface LayerArt {
  decor: Decor;
  fills: ResolvedFill[];
  opacity: number;
  blend: BlendMode;
}

/** Define every layer as `${prefix}-k` (and `${prefix}-k-alt` with the opposite palette when `alt`). */
export function defineLayers(defs: SVGElement, tile: Polygon, layers: LayerArt[], prefix: string, opts: { alt?: boolean; seam?: number } = {}): void {
  layers.forEach((l, k) => {
    defineDecor(defs, tile, l.decor, `${prefix}-${k}`, { fills: l.fills, seam: opts.seam });
    if (opts.alt) defineDecor(defs, tile, l.decor, `${prefix}-${k}-alt`, { colorMap: alternateColor, fills: l.fills, seam: opts.seam });
  });
}

/** A placed copy of layer k; opacity and blend mode apply to the layer as a whole. */
export function useLayer(prefix: string, k: number, l: LayerArt, transform: string | null, alt = false): SVGUseElement {
  const attrs: Record<string, string | number> = { href: `#${prefix}-${k}${alt ? '-alt' : ''}` };
  if (transform) attrs.transform = transform;
  if (l.opacity < 1) attrs.opacity = l.opacity;
  if (l.blend !== 'normal') attrs.style = `mix-blend-mode:${l.blend}`;
  return svgEl('use', attrs);
}
