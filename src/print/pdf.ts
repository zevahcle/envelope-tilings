/**
 * Minimal vector PDF writer for a printed tiling (no dependencies).
 *
 * The tile shape, its outline and its decoration are Form XObjects in tile
 * coordinates; every tile is one `cm` + `Do`. Content streams are
 * Flate-compressed when CompressionStream is available.
 */
import { type Vec } from '../geom/vec';
import { type Polygon, bounds } from '../geom/polygon';
import { toRgb, alternateColor } from '../decor/palette';
import { Boundary, curvePoints, type Decor } from '../decor/model';
import { type PrintLayout } from './layout';

const num = (x: number): string => {
  const s = x.toFixed(4);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') || '0' : s;
};
const rgb = (css: string) => toRgb(css).map(num).join(' ');
const pathOps = (pts: Vec[], closed: boolean): string =>
  pts.map((p, i) => `${num(p.x)} ${num(p.y)} ${i ? 'l' : 'm'}`).join('\n') + (closed ? '\nh' : '');

class Alpha {
  readonly map = new Map<string, string>();
  gs(a: number): string {
    const k = num(Math.max(0, Math.min(1, a)));
    if (!this.map.has(k)) this.map.set(k, `GA${this.map.size}`);
    return `/${this.map.get(k)} gs`;
  }
  dict(): string {
    return [...this.map].map(([a, n]) => `/${n} << /Type /ExtGState /ca ${a} /CA ${a} >>`).join(' ');
  }
}

function decorOps(tile: Polygon, d: Decor, map: (c: string) => string, alpha: Alpha): string {
  const out: string[] = ['q', pathOps(tile, true), 'W n', '1 J 1 j'];
  for (const s of d.swatches) out.push('q', alpha.gs(s.opacity), `${rgb(map(s.color))} rg`, pathOps(s.pts, true), 'f', 'Q');
  const B = new Boundary(tile);
  for (const c of d.curves) out.push(`${rgb(map(c.color))} RG`, `${num(c.width)} w`, pathOps(curvePoints(B, c), false), 'S');
  for (const s of d.strokes) out.push('q', alpha.gs(s.opacity), `${rgb(map(s.color))} RG`, `${num(s.width)} w`, pathOps(s.pts, false), 'S', 'Q');
  out.push('Q');
  return out.join('\n');
}

async function deflate(data: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  const cs = new CompressionStream('deflate');
  const w = cs.writable.getWriter();
  void w.write(new Uint8Array(data));
  void w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

export async function buildPdf(L: PrintLayout): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const alpha = new Alpha();
  const tb = bounds(L.tile);
  const bbox = [tb.minX, tb.minY, tb.maxX, tb.maxY].map(num).join(' ');
  const hasArt = L.decor.swatches.length + L.decor.curves.length + L.decor.strokes.length > 0;
  const mirror = L.mirror && L.tiles.some((t) => t.reflected);
  // hairline of the fill colour hides anti-aliasing seams between tiles
  const seam = 0.3 / L.scale;
  const forms: { name: string; ops: string }[] = [
    { name: 'Ft', ops: `${num(seam)} w 1 j\n${pathOps(L.tile, true)}\nB` },
    { name: 'Fo', ops: `0.169 0.165 0.153 RG ${num(L.borderPt / L.scale)} w 1 j\n${pathOps(L.tile, true)}\nS` },
  ];
  if (hasArt) forms.push({ name: 'Fd', ops: decorOps(L.tile, L.decor, (c) => c, alpha) });
  if (hasArt && mirror) forms.push({ name: 'Fa', ops: decorOps(L.tile, L.decor, alternateColor, alpha) });

  const cm = (m: PrintLayout['tiles'][number]['m']) => `${num(m.a)} ${num(m.c)} ${num(m.b)} ${num(m.d)} ${num(m.e)} ${num(m.f)} cm`;
  const page: string[] = ['q', `${num(L.art.x)} ${num(L.art.y)} ${num(L.art.w)} ${num(L.art.h)} re W n`];
  for (const t of L.tiles) {
    const c = rgb(t.fill);
    page.push(`q ${c} rg ${c} RG ${cm(t.m)} /Ft Do Q`);
  }
  if (hasArt) for (const t of L.tiles) page.push(`q ${cm(t.m)} /${t.reflected && mirror ? 'Fa' : 'Fd'} Do Q`);
  if (L.borders) for (const t of L.tiles) page.push(`q ${cm(t.m)} /Fo Do Q`);
  page.push('Q');

  // objects: 1 catalog, 2 pages, 3 page, 4 content, 5.. forms, last info
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let pos = 0;
  const push = (b: Uint8Array) => {
    chunks.push(b);
    pos += b.length;
  };
  const text = (s: string) => push(enc.encode(s));
  const obj = (id: number, body: string) => {
    offsets[id] = pos;
    text(`${id} 0 obj\n${body}\nendobj\n`);
  };
  const stream = async (id: number, dict: string, content: string) => {
    const raw = enc.encode(content);
    const z = await deflate(raw);
    const data = z ?? raw;
    offsets[id] = pos;
    text(`${id} 0 obj\n<< ${dict} /Length ${data.length}${z ? ' /Filter /FlateDecode' : ''} >>\nstream\n`);
    push(data);
    text('\nendstream\nendobj\n');
  };

  text('%PDF-1.4\n%âãÏÓ\n');
  const formIds = forms.map((_, i) => 5 + i);
  const infoId = 5 + forms.length;
  const xobj = forms.map((f, i) => `/${f.name} ${formIds[i]} 0 R`).join(' ');
  const r = (x: number, y: number, w: number, h: number) => `[${num(x)} ${num(y)} ${num(x + w)} ${num(y + h)}]`;
  const boxes = L.trim ? ` /TrimBox ${r(L.trim.x, L.trim.y, L.trim.w, L.trim.h)} /BleedBox ${r(0, 0, L.pageW, L.pageH)}` : '';
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  // forms reference alpha states, so build them before writing resources
  const formBodies = forms.map((f) => f.ops);
  const gsDict = alpha.dict();
  const res = `<< /XObject << ${xobj} >>${gsDict ? ` /ExtGState << ${gsDict} >>` : ''} >>`;
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox ${r(0, 0, L.pageW, L.pageH)}${boxes} /Resources ${res} /Contents 4 0 R >>`);
  await stream(4, '', page.join('\n'));
  for (let i = 0; i < forms.length; i++)
    await stream(formIds[i]!, `/Type /XObject /Subtype /Form /BBox [${bbox}]${gsDict ? ` /Resources << /ExtGState << ${gsDict} >> >>` : ''}`, formBodies[i]!);
  const title = L.name.replace(/[()\\]/g, '');
  obj(infoId, `<< /Title (Envelope Tilings - ${title}) /Creator (Envelope Tilings, zevahcle.github.io/envelope-tilings) /Producer (Envelope Tilings) >>`);

  const xref = pos;
  const n = infoId + 1;
  let x = `xref\n0 ${n}\n0000000000 65535 f \n`;
  for (let i = 1; i < n; i++) x += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  text(x + `trailer\n<< /Size ${n} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(pos);
  let k = 0;
  for (const c of chunks) {
    out.set(c, k);
    k += c.length;
  }
  return out;
}
