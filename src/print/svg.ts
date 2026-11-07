import { svgEl, pathOf } from '../render/svgcanvas';
import { toSvgTransform } from '../geom/isometry';
import { defineDecor } from '../decor/render';
import { alternateColor, toHex } from '../decor/palette';
import { PT_PER_MM, type PrintLayout } from './layout';

/** The printed page as standalone SVG (millimetre size, y down). `preview` adds the trim line. */
export function pageSvg(L: PrintLayout, preview = false): SVGSVGElement {
  const svg = svgEl('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    width: `${(L.pageW / PT_PER_MM).toFixed(2)}mm`,
    height: `${(L.pageH / PT_PER_MM).toFixed(2)}mm`,
    viewBox: `0 0 ${L.pageW.toFixed(3)} ${L.pageH.toFixed(3)}`,
  });
  const defs = svgEl('defs');
  defs.appendChild(svgEl('path', { id: 'pp-tile', d: pathOf(L.tile) }));
  const clip = svgEl('clipPath', { id: 'pp-art' });
  clip.appendChild(svgEl('rect', { x: L.art.x, y: L.art.y, width: L.art.w, height: L.art.h }));
  defs.appendChild(clip);
  const hasArt = L.fills.length + L.decor.swatches.length + L.decor.curves.length + L.decor.strokes.length > 0;
  const mirror = L.mirror && L.tiles.some((t) => t.reflected);
  if (hasArt) defineDecor(defs, L.tile, L.decor, 'pp-decor', { fills: L.fills, seam: 0.3 / L.scale });
  if (hasArt && mirror) defineDecor(defs, L.tile, L.decor, 'pp-decor-alt', { colorMap: alternateColor, fills: L.fills, seam: 0.3 / L.scale });
  svg.appendChild(defs);
  svg.appendChild(svgEl('rect', { x: 0, y: 0, width: L.pageW, height: L.pageH, fill: '#ffffff' }));
  const flip = svgEl('g', { transform: `matrix(1 0 0 -1 0 ${L.pageH})` });
  const g = svgEl('g', { 'clip-path': 'url(#pp-art)' });
  const seam = 0.3 / L.scale;
  for (const t of L.tiles) {
    const c = toHex(t.fill);
    g.appendChild(svgEl('use', { href: '#pp-tile', transform: toSvgTransform(t.m), fill: c, stroke: c, 'stroke-width': seam, 'stroke-linejoin': 'round' }));
  }
  if (hasArt) for (const t of L.tiles) g.appendChild(svgEl('use', { href: t.reflected && mirror ? '#pp-decor-alt' : '#pp-decor', transform: toSvgTransform(t.m) }));
  if (L.borders)
    for (const t of L.tiles)
      g.appendChild(
        svgEl('use', { href: '#pp-tile', transform: toSvgTransform(t.m), fill: 'none', stroke: '#2b2a27', 'stroke-width': L.borderPt / L.scale, 'stroke-linejoin': 'round' }),
      );
  flip.appendChild(g);
  svg.appendChild(flip);
  if (preview && L.trim)
    svg.appendChild(
      svgEl('rect', { x: L.trim.x, y: L.trim.y, width: L.trim.w, height: L.trim.h, fill: 'none', stroke: '#e0862b', 'stroke-width': 0.8, 'stroke-dasharray': '4 3' }),
    );
  return svg;
}
