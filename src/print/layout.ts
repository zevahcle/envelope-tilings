/**
 * Lay a tiling out on a sheet of paper.
 *
 * Periodic tilings are extended with their translation lattice, found from the
 * copies on screen. Aperiodic ones (hat, Spectre) use larger substitution
 * patches until the page is covered.
 */
import { type Vec } from '../geom/vec';
import { type Polygon, bounds, pointInPolygon, area, type Bounds } from '../geom/polygon';
import { type Iso, apply, compose, translation } from '../geom/isometry';
import { type Decor } from '../decor/model';
import { type ResolvedFill } from '../decor/regions';

export interface SourceCopy {
  iso: Iso;
  reflected: boolean;
  fill: string;
}
export interface PrintSource {
  /** tile in its own coordinates */
  tile: Polygon;
  /** copies currently on screen, in world coordinates */
  copies: SourceCopy[];
  /** for aperiodic tilings: copies of a patch of the given level, or null past the maximum */
  patch?: (level: number) => SourceCopy[] | null;
  startLevel?: number;
  decor: Decor;
  fills: ResolvedFill[];
  mirror: boolean;
  borders: boolean;
  name: string;
}

export type PaperId = 'letter' | 'legal' | 'tabloid' | 'a5' | 'a4' | 'a3' | 'a2';
export const PAPERS: Record<PaperId, { name: string; w: number; h: number }> = {
  letter: { name: 'US Letter (8.5 × 11 in)', w: 215.9, h: 279.4 },
  legal: { name: 'US Legal (8.5 × 14 in)', w: 215.9, h: 355.6 },
  tabloid: { name: 'Tabloid / double letter (11 × 17 in)', w: 279.4, h: 431.8 },
  a5: { name: 'A5 (148 × 210 mm)', w: 148, h: 210 },
  a4: { name: 'A4 (210 × 297 mm)', w: 210, h: 297 },
  a3: { name: 'A3 (297 × 420 mm)', w: 297, h: 420 },
  a2: { name: 'A2 (420 × 594 mm)', w: 420, h: 594 },
};

export interface PrintOptions {
  paper: PaperId;
  landscape: boolean;
  /** home: white margin around the art; pro: art bleeds 3 mm past the trim edge */
  output: 'home' | 'pro';
  marginMM: number;
  tilesAcross: number;
  /** border line width in points */
  borderPt: number;
}

export const PT_PER_MM = 72 / 25.4;
export const BLEED_MM = 3;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface PlacedTile {
  /** tile coordinates → page points (y up) */
  m: Iso;
  reflected: boolean;
  fill: string;
}
export interface PrintLayout {
  pageW: number;
  pageH: number;
  /** trim box when printing with bleed */
  trim: Rect | null;
  /** area filled with the tiling */
  art: Rect;
  tile: Polygon;
  tiles: PlacedTile[];
  /** page points per tile unit */
  scale: number;
  /** printed width of one tile, mm */
  tileMM: number;
  /** side of a square with the tile's area, mm */
  sizeMM: number;
  covered: boolean;
  decor: Decor;
  fills: ResolvedFill[];
  mirror: boolean;
  borders: boolean;
  borderPt: number;
  name: string;
}

const sameLinear = (g: Iso, h: Iso, tol: number) =>
  Math.abs(g.a - h.a) < tol && Math.abs(g.b - h.b) < tol && Math.abs(g.c - h.c) < tol && Math.abs(g.d - h.d) < tol;

/** Two shortest independent translations among differences of copies with the same linear part. */
export function findLattice(copies: SourceCopy[], tol = 1e-6): [Vec, Vec] | null {
  const vecs: Vec[] = [];
  const n = Math.min(copies.length, 220);
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const g = copies[i]!.iso;
      const h = copies[j]!.iso;
      if (!sameLinear(g, h, 1e-6)) continue;
      vecs.push({ x: h.e - g.e, y: h.f - g.f });
    }
  vecs.sort((u, v) => Math.hypot(u.x, u.y) - Math.hypot(v.x, v.y));
  const t1 = vecs.find((v) => Math.hypot(v.x, v.y) > tol);
  if (!t1) return null;
  const L1 = Math.hypot(t1.x, t1.y);
  const t2 = vecs.find((v) => Math.abs(t1.x * v.y - t1.y * v.x) > 1e-6 * L1 * Math.max(1, Math.hypot(v.x, v.y)));
  return t2 ? [t1, t2] : null;
}

/** Copies modulo the lattice: one representative per orbit. */
export function motif(copies: SourceCopy[], [t1, t2]: [Vec, Vec]): SourceCopy[] {
  const det = t1.x * t2.y - t1.y * t2.x;
  const out: SourceCopy[] = [];
  const keys = new Set<string>();
  for (const c of copies) {
    const { e, f } = c.iso;
    const u = (e * t2.y - f * t2.x) / det;
    const v = (t1.x * f - t1.y * e) / det;
    const fu = u - Math.floor(u + 1e-7);
    const fv = v - Math.floor(v + 1e-7);
    const key = [c.iso.a, c.iso.b, c.iso.c, c.iso.d, fu, fv].map((x) => Math.round(x * 1e5)).join(',');
    if (keys.has(key)) continue;
    keys.add(key);
    const shift = { x: -(u - fu) * t1.x - (v - fv) * t2.x, y: -(u - fu) * t1.y - (v - fv) * t2.y };
    out.push({ ...c, iso: compose(translation(shift), c.iso) });
  }
  return out;
}

const tileBox = (tile: Polygon, g: Iso): Bounds => bounds(tile.map((p) => apply(g, p)));
const meets = (a: Bounds, b: Bounds) => a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;

/** Do the copies cover the rectangle? Sampled on a grid. */
function covers(tile: Polygon, copies: SourceCopy[], r: Bounds): boolean {
  const polys = copies.map((c) => tile.map((p) => apply(c.iso, p)));
  const boxes = polys.map(bounds);
  const N = 28;
  for (let i = 0; i <= N; i++)
    for (let j = 0; j <= N; j++) {
      const p = { x: r.minX + ((r.maxX - r.minX) * (i + 0.013)) / (N + 0.026), y: r.minY + ((r.maxY - r.minY) * (j + 0.017)) / (N + 0.034) };
      let ok = false;
      for (let k = 0; k < polys.length && !ok; k++) {
        const b = boxes[k]!;
        if (p.x < b.minX || p.x > b.maxX || p.y < b.minY || p.y > b.maxY) continue;
        ok = pointInPolygon(p, polys[k]!);
      }
      if (!ok) return false;
    }
  return true;
}

export function layoutPage(src: PrintSource, o: PrintOptions): PrintLayout {
  const paper = PAPERS[o.paper];
  const pw = (o.landscape ? paper.h : paper.w) * PT_PER_MM;
  const ph = (o.landscape ? paper.w : paper.h) * PT_PER_MM;
  const bleed = o.output === 'pro' ? BLEED_MM * PT_PER_MM : 0;
  const pageW = pw + 2 * bleed;
  const pageH = ph + 2 * bleed;
  const trim = bleed ? { x: bleed, y: bleed, w: pw, h: ph } : null;
  const m = o.output === 'home' ? o.marginMM * PT_PER_MM : 0;
  const art = o.output === 'home' ? { x: m, y: m, w: pw - 2 * m, h: ph - 2 * m } : { x: 0, y: 0, w: pageW, h: pageH };
  const tb = bounds(src.tile);
  const tileW = tb.maxX - tb.minX;
  const widthForCount = o.output === 'home' ? art.w : pw;
  // "tiles across" counts tiles of typical size: the side of a square of equal area
  const size = Math.sqrt(area(src.tile));
  const scale = widthForCount / (Math.max(1, o.tilesAcross) * size);
  const halfW = art.w / (2 * scale);
  const halfH = art.h / (2 * scale);

  let copies: SourceCopy[];
  let centre: Vec;
  let covered = true;
  const lat = src.patch ? null : findLattice(src.copies);
  if (lat) {
    const home = src.copies[0]!;
    const hb = tileBox(src.tile, home.iso);
    centre = { x: (hb.minX + hb.maxX) / 2, y: (hb.minY + hb.maxY) / 2 };
    const rect = { minX: centre.x - halfW, maxX: centre.x + halfW, minY: centre.y - halfH, maxY: centre.y + halfH };
    const mot = motif(src.copies, lat);
    const [t1, t2] = lat;
    const det = t1.x * t2.y - t1.y * t2.x;
    // lattice coordinates of the rectangle corners, padded by the motif's extent
    const pad = Math.max(...mot.map((c) => { const b = tileBox(src.tile, c.iso); return Math.max(Math.abs(b.minX), Math.abs(b.maxX), Math.abs(b.minY), Math.abs(b.maxY)); })) + Math.hypot(t1.x, t1.y) + Math.hypot(t2.x, t2.y);
    const corners = [
      { x: rect.minX - pad, y: rect.minY - pad },
      { x: rect.maxX + pad, y: rect.minY - pad },
      { x: rect.minX - pad, y: rect.maxY + pad },
      { x: rect.maxX + pad, y: rect.maxY + pad },
    ].map((p) => ({ u: (p.x * t2.y - p.y * t2.x) / det, v: (t1.x * p.y - t1.y * p.x) / det }));
    const u0 = Math.floor(Math.min(...corners.map((c) => c.u)));
    const u1 = Math.ceil(Math.max(...corners.map((c) => c.u)));
    const v0 = Math.floor(Math.min(...corners.map((c) => c.v)));
    const v1 = Math.ceil(Math.max(...corners.map((c) => c.v)));
    copies = [];
    for (let i = u0; i <= u1; i++)
      for (let j = v0; j <= v1; j++) {
        const sh = translation({ x: i * t1.x + j * t2.x, y: i * t1.y + j * t2.y });
        for (const c of mot) {
          const iso = compose(sh, c.iso);
          if (meets(tileBox(src.tile, iso), rect)) copies.push({ ...c, iso });
        }
        if (copies.length > 60000) break;
      }
  } else {
    let level = src.startLevel ?? 1;
    let cur = src.patch?.(level) ?? src.copies;
    for (;;) {
      const all = bounds(cur.flatMap((c) => tileBox(src.tile, c.iso)).flatMap((b) => [{ x: b.minX, y: b.minY }, { x: b.maxX, y: b.maxY }]));
      centre = { x: (all.minX + all.maxX) / 2, y: (all.minY + all.maxY) / 2 };
      const rect = { minX: centre.x - halfW, maxX: centre.x + halfW, minY: centre.y - halfH, maxY: centre.y + halfH };
      const inside = cur.filter((c) => meets(tileBox(src.tile, c.iso), rect));
      covered = covers(src.tile, inside, rect);
      copies = inside;
      if (covered || !src.patch) break;
      const next = src.patch(level + 1);
      if (!next) break;
      level++;
      cur = next;
    }
  }
  // world → page: scale about the centre, centre on the art area
  const W: Iso = { a: scale, b: 0, c: 0, d: scale, e: art.x + art.w / 2 - scale * centre!.x, f: art.y + art.h / 2 - scale * centre!.y };
  return {
    pageW,
    pageH,
    trim,
    art,
    tile: src.tile,
    tiles: copies!.map((c) => ({ m: compose(W, c.iso), reflected: c.reflected, fill: c.fill })),
    scale,
    tileMM: (tileW * scale) / PT_PER_MM,
    sizeMM: (size * scale) / PT_PER_MM,
    covered,
    decor: src.decor,
    fills: src.fills,
    mirror: src.mirror,
    borders: src.borders,
    borderPt: o.borderPt,
    name: src.name,
  };
}
