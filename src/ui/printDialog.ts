import { download } from '../render/svgcanvas';
import { PAPERS, BLEED_MM, PT_PER_MM, layoutPage, type PaperId, type PrintOptions, type PrintSource, type PrintLayout } from '../print/layout';
import { buildPdf } from '../print/pdf';
import { pageSvg } from '../print/svg';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) el.append(c);
  return el;
};

const STORE_KEY = 'envelope-tilings.print';
const DEFAULTS: PrintOptions & { borders: boolean | null } = {
  paper: 'letter',
  landscape: false,
  output: 'home',
  marginMM: 10,
  tilesAcross: 8,
  borderPt: 0.5,
  borders: null,
};

function loadOptions(): typeof DEFAULTS {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<typeof DEFAULTS>), borders: null };
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULTS };
}

export class PrintDialog {
  private root: HTMLDivElement;
  private opts = loadOptions();
  private source: PrintSource | null = null;
  private layout: PrintLayout | null = null;
  private timer: number | null = null;
  private previewBox: HTMLDivElement;
  private info: HTMLDivElement;
  private pdfBtn: HTMLButtonElement;
  private svgBtn: HTMLButtonElement;
  private controls: Record<string, HTMLElement> = {};

  constructor(private getSource: () => PrintSource | null) {
    const o = this.opts;
    const paper = h('select', { class: 'select' });
    for (const [id, p] of Object.entries(PAPERS)) paper.append(h('option', { value: id }, [p.name]));
    paper.value = o.paper;
    paper.onchange = () => this.update({ paper: paper.value as PaperId });
    const seg = (name: string, items: [string, string][], current: () => string, set: (v: string) => void) => {
      const box = h('div', { class: 'seg' });
      for (const [v, label] of items) {
        const b = h('button', { class: 'seg-btn', 'data-v': v }, [label]);
        b.onclick = () => set(v);
        box.append(b);
      }
      this.controls[name] = box;
      (box as HTMLElement & { sync?: () => void }).sync = () => box.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.v === current()));
      return box;
    };
    const orient = seg('orient', [['p', 'Portrait'], ['l', 'Landscape']], () => (this.opts.landscape ? 'l' : 'p'), (v) => this.update({ landscape: v === 'l' }));
    const output = seg('output', [['home', 'Home printer'], ['pro', 'Print shop']], () => this.opts.output, (v) => this.update({ output: v as 'home' | 'pro' }));
    const margin = h('select', { class: 'select' });
    for (const m of [5, 8, 10, 15, 20]) margin.append(h('option', { value: String(m) }, [`${m} mm`]));
    margin.value = String(o.marginMM);
    margin.onchange = () => this.update({ marginMM: Number(margin.value) });
    const marginRow = h('label', { class: 'prow' }, [h('span', {}, ['White margin']), margin]);
    this.controls.marginRow = marginRow;
    const tiles = h('input', { type: 'range', min: '2', max: '40', step: '1', value: String(o.tilesAcross), class: 'slider' });
    const tilesVal = h('span', { class: 'pval' }, [String(o.tilesAcross)]);
    tiles.oninput = () => {
      tilesVal.textContent = tiles.value;
      this.update({ tilesAcross: Number(tiles.value) });
    };
    const borders = h('input', { type: 'checkbox' });
    borders.onchange = () => this.update({ borders: borders.checked });
    this.controls.borders = borders;
    const bw = h('select', { class: 'select' });
    for (const [v, label] of [['0.25', 'Hairline'], ['0.5', 'Fine'], ['1', 'Medium'], ['2', 'Bold']] as const) bw.append(h('option', { value: v }, [label]));
    bw.value = String(o.borderPt);
    bw.onchange = () => this.update({ borderPt: Number(bw.value) });
    this.info = h('div', { class: 'pinfo' });
    this.pdfBtn = h('button', { class: 'btn primary' }, ['Download PDF']);
    this.svgBtn = h('button', { class: 'btn' }, ['Download SVG']);
    const close = h('button', { class: 'btn' }, ['Close']);
    this.pdfBtn.onclick = () => void this.savePdf();
    this.svgBtn.onclick = () => this.saveSvg();
    close.onclick = () => this.close();
    this.previewBox = h('div', { class: 'ppreview' });
    const panel = h('div', { class: 'pdialog', role: 'dialog', 'aria-label': 'Print a page' }, [
      h('div', { class: 'pside' }, [
        h('h3', {}, ['Print a page']),
        h('label', { class: 'prow' }, [h('span', {}, ['Paper']), paper]),
        h('div', { class: 'prow' }, [h('span', {}, ['Orientation']), orient]),
        h('div', { class: 'prow' }, [h('span', {}, ['For']), output]),
        marginRow,
        h('div', { class: 'prow' }, [h('span', {}, ['Tiles across']), h('div', { class: 'row' }, [tiles, tilesVal])]),
        h('label', { class: 'prow' }, [h('span', {}, ['Tile borders']), h('div', { class: 'row' }, [borders, bw])]),
        this.info,
        h('div', { class: 'pbuttons' }, [this.pdfBtn, this.svgBtn, close]),
      ]),
      this.previewBox,
    ]);
    this.root = h('div', { class: 'pmodal' }, [panel]);
    this.root.addEventListener('pointerdown', (ev) => {
      if (ev.target === this.root) this.close();
    });
    window.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && this.root.isConnected) this.close();
    });
  }

  open(): void {
    this.source = this.getSource();
    if (!this.source) {
      alertLike('There is no tiling to print yet: unfold a net that tiles, or pick a seam tile whose patch has no overlaps.');
      return;
    }
    this.opts.borders = this.source.borders;
    document.body.append(this.root);
    this.refresh();
  }

  close(): void {
    this.root.remove();
  }

  private update(p: Partial<typeof DEFAULTS>): void {
    Object.assign(this.opts, p);
    try {
      const { borders: _b, ...keep } = this.opts;
      localStorage.setItem(STORE_KEY, JSON.stringify(keep));
    } catch {
      /* storage unavailable */
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.refresh(), 60);
  }

  private refresh(): void {
    const o = this.opts;
    for (const c of Object.values(this.controls)) (c as HTMLElement & { sync?: () => void }).sync?.();
    (this.controls.borders as HTMLInputElement).checked = !!o.borders;
    this.controls.marginRow!.style.display = o.output === 'home' ? '' : 'none';
    if (!this.source) return;
    const src = { ...this.source, borders: !!o.borders };
    this.layout = layoutPage(src, o);
    const L = this.layout;
    const svg = pageSvg(L, true);
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.setAttribute('class', 'ppage');
    this.previewBox.replaceChildren(svg);
    const paper = PAPERS[o.paper];
    const pw = o.landscape ? paper.h : paper.w;
    const ph = o.landscape ? paper.w : paper.h;
    const lines = [
      `${L.tiles.length} tiles; each covers about ${L.sizeMM.toFixed(1)} × ${L.sizeMM.toFixed(1)} mm (${L.tileMM.toFixed(1)} mm wide).`,
      o.output === 'home'
        ? `Page ${pw.toFixed(0)} × ${ph.toFixed(0)} mm with a ${o.marginMM} mm white margin. Print at 100% (“actual size”).`
        : `Trim ${pw.toFixed(0)} × ${ph.toFixed(0)} mm; the file is ${(pw + 2 * BLEED_MM).toFixed(0)} × ${(ph + 2 * BLEED_MM).toFixed(0)} mm with ${BLEED_MM} mm bleed (dashed line = trim).`,
    ];
    this.info.replaceChildren(...lines.map((t) => h('p', {}, [t])));
    if (!L.covered) this.info.append(h('p', { class: 'bad' }, ['The largest patch available does not fill the page; use fewer tiles across.']));
    void PT_PER_MM;
  }

  private fileBase(): string {
    const o = this.opts;
    return `envelope-tilings-${(this.layout?.name ?? 'tiling').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${o.paper}${o.landscape ? '-landscape' : ''}${o.output === 'pro' ? '-bleed' : ''}`;
  }

  private async savePdf(): Promise<void> {
    if (!this.layout) return;
    this.pdfBtn.disabled = true;
    this.pdfBtn.textContent = 'Building…';
    try {
      const bytes = await buildPdf(this.layout);
      const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = this.fileBase() + '.pdf';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } finally {
      this.pdfBtn.disabled = false;
      this.pdfBtn.textContent = 'Download PDF';
    }
  }

  private saveSvg(): void {
    if (!this.layout) return;
    const svg = pageSvg(this.layout, false);
    download(this.fileBase() + '.svg', new XMLSerializer().serializeToString(svg));
  }
}

function alertLike(msg: string): void {
  const el = h('div', { class: 'toast' }, [msg]);
  document.body.append(el);
  setTimeout(() => el.remove(), 4000);
}
