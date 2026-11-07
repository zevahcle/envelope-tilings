import { Store, type AppState, type Tool, type DecorTool, type Snapshot, snapshot } from '../app/store';
import { encodeState, decodeState, readHash, writeHash } from '../app/url';
import { TILES, tileById, defaultParams } from '../tiles/library';
import { computeUnfolding, type Unfolding } from '../envelope/model';
import { tileNet, tileNetGeneral, type NetTiling } from '../envelope/tiling';
import { PRESETS } from '../envelope/presets';
import { SEAM_TILES, seamTileById, seamDefaultParams } from '../seam/library';
import { findContacts, gamma, edgeClasses, type EdgeClass, type ContactReport } from '../seam/contacts';
import { deformedTile, deformedPatch, curvePreset, normaliseCurve, type CurvePresetId, type DeformedPatch } from '../seam/deform';
import { type Placement } from '../tiles/hat';
import { EnvelopeEditor } from './editor';
import { TilingPreview, HUES } from './preview';
import { PrintDialog } from './printDialog';
import { type PrintSource, type SourceCopy } from '../print/layout';
import { DEFAULT_TILE_FILL } from '../decor/render';
import { alternateColor } from '../decor/palette';
import { isEmptyDecor } from '../decor/model';
import { SeamEditor, classColor } from './seamEditor';
import { SeamPreview } from './seamPreview';
import { download } from '../render/svgcanvas';
import { ensureCCW, isSimple, type Polygon } from '../geom/polygon';
import { type Vec, dist } from '../geom/vec';
import { cornerIndices } from '../envelope/conway';
import { type Decor, type Port, emptyDecor, portOrbits, Boundary, sideMidpoints, rng, brushWidth, Contacts } from '../decor/model';
import { Regions } from '../decor/regions';
import { PALETTES, type PaletteId } from '../decor/palette';
import { DecorEditor, type DecorContext } from './decorEditor';
import { type Iso } from '../geom/isometry';

const h = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) el.append(c);
  return el;
};

export function mountApp(root: HTMLElement): void {
  const first = TILES[0]!;
  const seamFirst = SEAM_TILES[0]!;
  const store = new Store({
    mode: 'envelope',
    tileId: first.id,
    params: defaultParams(first),
    cuts: [],
    hinges: [],
    open: 0,
    netOnly: false,
    tool: 'draw',
    message: 'Draw a cut on the front sheet of the envelope.',
    seamTileId: seamFirst.id,
    seamParams: seamDefaultParams(seamFirst),
    seamLevel: seamFirst.defaultLevel,
    curves: {},
    selectedClass: null,
    decorate: false,
    decorEnv: emptyDecor(),
    decorSeam: emptyDecor(),
    borders: true,
    mirrorPalette: false,
    decorTool: 'connect',
    color: '#2b3f8c',
    brush: 10,
    opacity: 1,
    bend: 0.5,
    palette: 'solid',
    linkFill: true,
  });
  const base0 = first.build(defaultParams(first));
  store.commit(PRESETS[0]!.make(base0), 'Draw a cut on the front sheet of the envelope.');

  /* ---------- header ---------- */
  const tileSelect = h('select', { class: 'select', 'aria-label': 'Base tile' });
  const levelSelect = h('select', { class: 'select', 'aria-label': 'Patch size' });
  const levelField = h('label', { class: 'field' }, ['Patch ', levelSelect]);
  const paramBox = h('div', { class: 'params' });
  const undoBtn = h('button', { class: 'btn', title: 'Undo (⌘Z)' }, ['↶']);
  const redoBtn = h('button', { class: 'btn', title: 'Redo (⇧⌘Z)' }, ['↷']);
  const exportEditor = h('button', { class: 'btn', title: 'Download the left pane as SVG' }, ['SVG tile']);
  const exportPreview = h('button', { class: 'btn', title: 'Download the tiling as SVG' }, ['SVG tiling']);
  const shareBtn = h('button', { class: 'btn', title: 'Copy a link to this state' }, ['Share']);
  const printBtn = h('button', { class: 'btn', title: 'Fill a sheet of paper and download a PDF' }, ['🖨 Print']);
  const tabEnvelope = h('button', { class: 'tab active', role: 'tab' }, ['Envelope']);
  const tabSeam = h('button', { class: 'tab', role: 'tab' }, ['Seam']);
  const decorateBtn = h('button', { class: 'btn toggle', title: 'Decorate the tile: curves, colours and swatches' }, ['🎨 Decorate']);
  const header = h('header', { class: 'topbar' }, [
    h('div', { class: 'brand' }, ['Envelope Tilings']),
    h('div', { class: 'tabs', role: 'tablist' }, [tabEnvelope, tabSeam]),
    decorateBtn,
    h('div', { class: 'spacer' }),
    h('label', { class: 'field' }, ['Tile ', tileSelect]),
    paramBox,
    levelField,
    h('div', { class: 'group' }, [undoBtn, redoBtn]),
    h('div', { class: 'group' }, [exportEditor, exportPreview, shareBtn, printBtn]),
  ]);

  /* ---------- sidebar: envelope ---------- */
  const toolButtons: Record<Tool, HTMLButtonElement> = {
    draw: h('button', { class: 'tool' }, ['✂ Draw cut']),
    hinge: h('button', { class: 'tool' }, ['⟲ Hinge']),
    erase: h('button', { class: 'tool' }, ['⌫ Erase cut']),
    pan: h('button', { class: 'tool' }, ['✥ Pan']),
  };
  const presetBox = h('div', { class: 'stack' });
  for (const p of PRESETS) {
    const b = h('button', { class: 'btn wide' }, [p.name]);
    b.onclick = () => store.commit(p.make(currentBase(store.get())), `preset: ${p.name}`);
    presetBox.append(b);
  }
  const clearBtn = h('button', { class: 'btn wide' }, ['Clear cuts']);
  clearBtn.onclick = () => store.commit({ cuts: [], hinges: [] }, 'cleared');
  const openSlider = h('input', { type: 'range', min: '0', max: '1', step: '0.005', value: '0', class: 'slider', 'aria-label': 'Open the envelope' });
  const playBtn = h('button', { class: 'btn' }, ['▶ Unfold']);
  const netOnlyBox = h('input', { type: 'checkbox', 'aria-label': 'Show the net only' });
  const netOnlyField = h('label', { class: 'field check' }, [netOnlyBox, ' Net only (hide the envelope)']);
  const envelopeSidebar = h('div', { class: 'stack' }, [
    h('h2', {}, ['Tools']),
    h('div', { class: 'stack' }, Object.values(toolButtons)),
    h('h2', {}, ['Presets']),
    presetBox,
    clearBtn,
    h('h2', {}, ['Unfold']),
    h('div', { class: 'row' }, [openSlider, playBtn]),
    netOnlyField,
    h('h2', {}, ['How it works']),
    h('div', { class: 'explain' }, [
      h('p', {}, ['1. The envelope is a doubly covered polygon: two sheets glued along the border.']),
      h('p', {}, ['2. Cut the front sheet. Each flap stays attached along one straight hinge (orange).']),
      h('p', {}, ['3. Open it flat. Flipping paper reflects it, so flaps are mirrored across their hinges.']),
      h('p', {}, ['4. For rectangles and the three Coxeter triangles the net always tiles (Akiyama’s tile-maker theorem). For other polygons it usually does not.']),
      h('p', {}, [h('a', { href: 'https://zevahcle.github.io/envelope-tilings/references.pdf', target: '_blank', rel: 'noopener' }, ['Notes and references (PDF)'])]),
    ]),
  ]);

  /* ---------- sidebar: seam ---------- */
  const seamTools: Record<'draw' | 'pan', HTMLButtonElement> = {
    draw: h('button', { class: 'tool' }, ['✎ Draw edge curve']),
    pan: h('button', { class: 'tool' }, ['✥ Pan']),
  };
  const classTable = h('div', { class: 'classes' });
  const ampSlider = h('input', { type: 'range', min: '0.02', max: '0.4', step: '0.01', value: '0.12', class: 'slider', 'aria-label': 'Amplitude' });
  const curvePresets: { id: CurvePresetId; name: string }[] = [
    { id: 'bump', name: 'Bump' },
    { id: 's', name: 'S-curve' },
    { id: 'tab', name: 'Puzzle tab' },
    { id: 'zigzag', name: 'Zigzag' },
    { id: 'random', name: 'Random' },
  ];
  const curvePresetBox = h('div', { class: 'wrap' });
  let randomSeed = 1;
  for (const p of curvePresets) {
    const b = h('button', { class: 'btn' }, [p.name]);
    b.onclick = () => applyCurvePreset(p.id);
    curvePresetBox.append(b);
  }
  const straightenBtn = h('button', { class: 'btn wide' }, ['Straighten all']);
  straightenBtn.onclick = () => store.commit({ curves: {} }, 'all edges straight');
  const seamSidebar = h('div', { class: 'stack' }, [
    h('h2', {}, ['Tools']),
    h('div', { class: 'stack' }, Object.values(seamTools)),
    h('h2', {}, ['Edge classes']),
    classTable,
    h('h2', {}, ['Curve for the selected class']),
    curvePresetBox,
    h('div', { class: 'row' }, [h('span', { class: 'muted' }, ['amplitude']), ampSlider]),
    straightenBtn,
    h('h2', {}, ['How it works']),
    h('div', { class: 'explain' }, [
      h('p', {}, ['In every tiling of the patch, edge i of one tile meets edge j of a neighbour either directly (related by a half-turn, R) or through a reflection (M).']),
      h('p', {}, ['Edges linked by contacts form classes: one drawn curve determines the whole class. A cycle of contacts can force the curve to be symmetric, or straight.']),
      h('p', {}, ['The hat is rigid: every class contains a mirror constraint. The Spectre has one free class. Lattice tiles have one free class per pair of opposite edges.']),
      h('p', {}, [h('a', { href: 'https://zevahcle.github.io/envelope-tilings/references.pdf', target: '_blank', rel: 'noopener' }, ['Notes and references (PDF)'])]),
    ]),
  ]);

  /* ---------- sidebar: decorate ---------- */
  const decorTools: Record<DecorTool, HTMLButtonElement> = {
    connect: h('button', { class: 'tool', title: 'C' }, ['⤳ Connect ports']),
    port: h('button', { class: 'tool', title: 'P' }, ['◉ Add / remove port']),
    brush: h('button', { class: 'tool', title: 'B' }, ['🖌 Brush']),
    swatch: h('button', { class: 'tool', title: 'S' }, ['⬤ Swatch (drag) / dot (click)']),
    fill: h('button', { class: 'tool', title: 'F' }, ['🪣 Fill region']),
    erase: h('button', { class: 'tool', title: 'E' }, ['⌫ Erase item']),
    pan: h('button', { class: 'tool', title: 'V' }, ['✥ Pan']),
  };
  const paletteTabs = h('div', { class: 'palette-tabs' });
  const paletteTabButtons = {} as Record<PaletteId, HTMLButtonElement>;
  for (const id of Object.keys(PALETTES) as PaletteId[]) {
    const b = h('button', { class: 'ptab' }, [PALETTES[id].name]);
    b.onclick = () => store.set({ palette: id });
    paletteTabButtons[id] = b;
    paletteTabs.append(b);
  }
  const paletteGrid = h('div', { class: 'palette-grid' });
  const customColor = h('input', { type: 'color', class: 'color-input', 'aria-label': 'Custom colour', value: '#2b3f8c' });
  customColor.oninput = () => store.set({ color: customColor.value });
  const currentSwatch = h('span', { class: 'current-color' });
  const widthSlider = h('input', { type: 'range', min: '1', max: '40', step: '1', value: '10', class: 'slider', 'aria-label': 'Width' });
  const opacitySlider = h('input', { type: 'range', min: '0.1', max: '1', step: '0.05', value: '1', class: 'slider', 'aria-label': 'Opacity' });
  const bendSlider = h('input', { type: 'range', min: '0.05', max: '1.4', step: '0.05', value: '0.5', class: 'slider', 'aria-label': 'Curve bend' });
  widthSlider.oninput = () => store.set({ brush: Number(widthSlider.value) });
  opacitySlider.oninput = () => store.set({ opacity: Number(opacitySlider.value) });
  bendSlider.oninput = () => store.set({ bend: Number(bendSlider.value) });
  const fillBtn = h('button', { class: 'btn' }, ['Fill tile']);
  const noFillBtn = h('button', { class: 'btn' }, ['No fill']);
  const recolorBtn = h('button', { class: 'btn wide' }, ['Recolour curves from palette']);
  const decorPresets: { id: 'mid' | 'arcs' | 'across' | 'random'; name: string }[] = [
    { id: 'mid', name: 'Ports at side midpoints' },
    { id: 'arcs', name: 'Arcs around corners' },
    { id: 'across', name: 'Lines across the tile' },
    { id: 'random', name: 'Random pairing' },
  ];
  const decorPresetBox = h('div', { class: 'stack' });
  for (const p of decorPresets) {
    const b = h('button', { class: 'btn wide' }, [p.name]);
    b.onclick = () => applyDecorPreset(p.id);
    decorPresetBox.append(b);
  }
  const clearDecorBtn = h('button', { class: 'btn wide' }, ['Clear decoration']);
  const bordersBox = h('input', { type: 'checkbox', 'aria-label': 'Show tile borders' });
  const mirrorBox = h('input', { type: 'checkbox', 'aria-label': 'Different palette on reflected tiles' });
  const linkFillBox = h('input', { type: 'checkbox', 'aria-label': 'Fill across seams' });
  linkFillBox.onchange = () => store.set({ linkFill: linkFillBox.checked });
  const mirrorField = h('label', { class: 'field check' }, [mirrorBox, ' Opposite colours on reflected tiles']);
  const decorSidebar = h('div', { class: 'stack' }, [
    h('h2', {}, ['Decorate']),
    h('div', { class: 'stack' }, Object.values(decorTools)),
    h('label', { class: 'field check', title: 'The fill also colours the pieces in neighbouring tiles that join this region across the tile borders' }, [linkFillBox, ' Fill across seams']),
    h('h2', {}, ['Colour']),
    paletteTabs,
    paletteGrid,
    h('div', { class: 'row' }, [currentSwatch, h('span', { class: 'muted' }, ['custom']), customColor]),
    h('div', { class: 'row' }, [h('span', { class: 'muted lbl' }, ['width']), widthSlider]),
    h('div', { class: 'row' }, [h('span', { class: 'muted lbl' }, ['opacity']), opacitySlider]),
    h('div', { class: 'row' }, [h('span', { class: 'muted lbl' }, ['bend']), bendSlider]),
    h('div', { class: 'row' }, [fillBtn, noFillBtn]),
    h('h2', {}, ['Pattern presets']),
    decorPresetBox,
    recolorBtn,
    clearDecorBtn,
    h('h2', {}, ['View']),
    h('label', { class: 'field check' }, [bordersBox, ' Show tile borders']),
    mirrorField,
    h('h2', {}, ['How it works']),
    h('div', { class: 'explain' }, [
      h('p', {}, ['Ports are points on the border where curves pass into the next tile. Adding one port adds its partners: the points where neighbouring tiles touch it (dashed rings).']),
      h('p', {}, ['Connect ports in pairs. Curves leave the border at a right angle, so they continue smoothly across tiles. Orange rings are open ends.']),
      h('p', {}, ['The fill tool colours a region bounded by curves, strokes and the border. “Fill across seams” also colours the pieces that continue it in neighbouring tiles, so a whole cell of the pattern takes the colour.']),
      h('p', {}, ['Everything drawn here repeats in every tile; reflected tiles (the hat) show it mirrored. Untick “Show tile borders” to see the pattern alone.']),
    ]),
  ]);

  const sidebar = h('aside', { class: 'sidebar' }, [envelopeSidebar, seamSidebar, decorSidebar]);
  const envelopeEditorBox = h('div', { class: 'fill' });
  const seamEditorBox = h('div', { class: 'fill' });
  const envelopePreviewBox = h('div', { class: 'fill' });
  const seamPreviewBox = h('div', { class: 'fill' });
  const editorTitle = h('div', { class: 'pane-title' }, ['Envelope']);
  const previewTitle = h('div', { class: 'pane-title' }, ['Tiling by the net']);
  const decorEditorBox = h('div', { class: 'fill' });
  const editorPane = h('section', { class: 'pane editor' }, [editorTitle, envelopeEditorBox, seamEditorBox, decorEditorBox]);
  const previewPane = h('section', { class: 'pane preview' }, [previewTitle, envelopePreviewBox, seamPreviewBox]);
  const status = h('footer', { class: 'status', 'aria-live': 'polite' });
  root.append(header, h('main', { class: 'main' }, [sidebar, editorPane, previewPane]), status);

  const editor = new EnvelopeEditor(envelopeEditorBox, store);
  const preview = new TilingPreview(envelopePreviewBox);
  const seamEditor = new SeamEditor(seamEditorBox, store);
  const seamPreview = new SeamPreview(seamPreviewBox);
  const decorKey = (s: AppState) => (s.mode === 'envelope' ? 'decorEnv' : 'decorSeam') as 'decorEnv' | 'decorSeam';
  const commitDecor = (d: Decor, message: string) => store.commit({ [decorKey(store.get())]: d } as Partial<Snapshot>, message);
  const decorEditor = new DecorEditor(decorEditorBox, store, commitDecor);

  /* ---------- derived: envelope ---------- */
  function currentBase(s: AppState): Polygon {
    return ensureCCW(tileById(s.tileId).build(s.params));
  }
  let envKey = '';
  let lastUnfolding: Unfolding | null = null;
  let lastTiling: NetTiling | null = null;
  function deriveEnvelope(s: AppState): { base: Polygon; u: Unfolding; t: NetTiling | null } {
    const base = currentBase(s);
    const key = JSON.stringify([s.tileId, s.params, s.cuts, s.hinges]);
    if (key !== envKey || !lastUnfolding) {
      const tile = tileById(s.tileId);
      lastUnfolding = computeUnfolding(base, s.cuts, s.hinges);
      lastTiling =
        lastUnfolding.outline && lastUnfolding.flattens
          ? tile.isCoxeter
            ? tileNet(base, lastUnfolding.outline)
            : tileNetGeneral(base, lastUnfolding.outline)
          : null;
      envKey = key;
    }
    return { base, u: lastUnfolding, t: lastTiling };
  }

  /* ---------- derived: seam ---------- */
  interface SeamAnalysis {
    base: Polygon;
    placements: Placement[];
    classes: EdgeClass[];
    report: ContactReport;
  }
  let seamKey = '';
  let seamAnalysis: SeamAnalysis | null = null;
  let seamDefKey = '';
  let seamDeformed: { tile: Polygon; patch: DeformedPatch; simple: boolean } | null = null;
  function deriveSeam(s: AppState) {
    const key = JSON.stringify([s.seamTileId, s.seamParams, s.seamLevel]);
    if (key !== seamKey || !seamAnalysis) {
      const def = seamTileById(s.seamTileId);
      const base = ensureCCW(def.build(s.seamParams));
      const placements = def.patch(s.seamParams, s.seamLevel);
      const { contacts, report } = findContacts(base, placements, placements.length <= 400);
      const classes = edgeClasses(gamma(contacts), base.length);
      seamAnalysis = { base, placements, classes, report };
      seamKey = key;
      seamDefKey = '';
    }
    const dkey = key + JSON.stringify(s.curves);
    if (dkey !== seamDefKey || !seamDeformed) {
      const tile = deformedTile(seamAnalysis.base, seamAnalysis.classes, s.curves);
      const simple = isSimple(tile);
      const patch = deformedPatch(tile, seamAnalysis.placements, simple ? 800 : 0);
      seamDeformed = { tile, patch, simple };
      seamDefKey = dkey;
    }
    return { ...seamAnalysis, ...seamDeformed, key };
  }

  function selectedClassOf(s: AppState, classes: EdgeClass[]): EdgeClass | null {
    const sel = classes.find((c) => c.rep === s.selectedClass);
    if (sel) return sel;
    return classes.find((c) => c.verdict !== 'straight') ?? classes[0] ?? null;
  }

  function applyCurvePreset(id: CurvePresetId): void {
    const s = store.get();
    const { classes } = deriveSeam(s);
    const cls = selectedClassOf(s, classes);
    if (!cls) return;
    if (cls.verdict === 'straight') {
      store.set({ message: 'This class is rigid; its edges must stay straight.' });
      return;
    }
    if (id === 'random') randomSeed++;
    const curve = normaliseCurve(curvePreset(id, Number(ampSlider.value), undefined, randomSeed), cls.H);
    store.commit({ curves: { ...s.curves, [cls.rep]: curve } }, `${id} on class ${cls.rep}`);
    store.set({ selectedClass: cls.rep });
  }

  /* ---------- derived: decoration ---------- */
  interface DecorFrame {
    tile: Polygon;
    isos: Iso[];
    corners: number[];
    key: string;
    problem: string | null;
  }
  function decorFrame(s: AppState): DecorFrame | null {
    if (s.mode === 'envelope') {
      const { u, t } = deriveEnvelope(s);
      if (!u.outline) return null;
      const isos = t ? t.copies.filter((k) => !k.overlapping).map((k) => k.iso) : [];
      const problem = !t ? 'This net does not flatten, so there is no tiling to decorate.' : !t.tiles ? 'No tiling was found for this net; ports have no partners.' : null;
      return { tile: u.outline, isos: t?.tiles ? isos : [], corners: cornerIndices(u.outline, 8), key: 'env' + envKey, problem };
    }
    const d = deriveSeam(s);
    const isos = d.placements.filter((_, k) => !d.patch.overlapping[k]).map((p) => p.iso);
    const corners = d.base.map((v) => {
      let bi = 0;
      let bd = Infinity;
      d.tile.forEach((q, i) => {
        const e = dist(q, v);
        if (e < bd) {
          bd = e;
          bi = i;
        }
      });
      return bi;
    });
    const problem = !d.simple ? 'The tile crosses itself.' : d.patch.anyOverlap ? 'Tiles overlap in the patch.' : null;
    return { tile: d.tile, isos, corners, key: 'seam' + d.key + JSON.stringify(s.curves), problem };
  }
  let portKey = '';
  let portCache: Port[] = [];
  function portsFor(frame: DecorFrame, decor: Decor): Port[] {
    const seeds = [...decor.ports, ...decor.curves.flatMap((c) => [c.a, c.b])];
    const key = frame.key + JSON.stringify(seeds);
    if (key !== portKey) {
      portCache = portOrbits(frame.tile, frame.isos, seeds);
      portKey = key;
    }
    return portCache;
  }
  let regionKey = '';
  let regionCache: Regions | null = null;
  function regionsFor(frame: DecorFrame, decor: Decor): Regions {
    const key = frame.key + JSON.stringify([decor.curves, decor.strokes]);
    if (key !== regionKey || !regionCache) {
      regionCache = new Regions(frame.tile, decor, frame.isos.length ? new Contacts(frame.tile, frame.isos) : null);
      regionKey = key;
    }
    return regionCache;
  }
  function applyDecorPreset(id: 'mid' | 'arcs' | 'across' | 'random'): void {
    const s = store.get();
    const frame = decorFrame(s);
    if (!frame) {
      store.set({ message: 'Unfold a net that tiles first.' });
      return;
    }
    const decor = s[decorKey(s)];
    const B = new Boundary(frame.tile);
    const mids = sideMidpoints(B, frame.corners);
    if (id === 'mid') {
      commitDecor({ ...decor, ports: mids }, 'ports at the side midpoints');
      return;
    }
    const ports = portOrbits(frame.tile, frame.isos, mids).map((p) => p.f);
    const n = ports.length;
    const order = [...ports];
    if (id === 'random') {
      const r = rng(Date.now() & 0xffff);
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [order[i], order[j]] = [order[j]!, order[i]!];
      }
    }
    const pairs: [number, number][] = [];
    if (id === 'across') for (let i = 0; i < Math.floor(n / 2); i++) pairs.push([order[i]!, order[i + Math.floor(n / 2)]!]);
    else for (let i = 0; i + 1 < n; i += 2) pairs.push([order[i]!, order[i + 1]!]);
    const width = brushWidth(frame.tile, s.brush);
    const curves = pairs.map(([a, b]) => ({ a, b, color: s.color, width, bend: id === 'across' ? Math.min(s.bend, 0.35) : s.bend }));
    commitDecor({ ...decor, ports: mids, curves }, `${n} ports, ${curves.length} curves`);
  }
  function recolorCurves(): void {
    const s = store.get();
    const decor = s[decorKey(s)];
    const cols = PALETTES[s.palette].colors.filter((c) => c !== '#ffffff');
    commitDecor({ ...decor, curves: decor.curves.map((c, i) => ({ ...c, color: cols[i % cols.length]! })) }, 'curves recoloured');
  }
  recolorBtn.onclick = recolorCurves;
  clearDecorBtn.onclick = () => commitDecor(emptyDecor(), 'decoration cleared');
  fillBtn.onclick = () => {
    const s = store.get();
    commitDecor({ ...s[decorKey(s)], background: s.color }, 'tile filled');
  };
  noFillBtn.onclick = () => {
    const s = store.get();
    commitDecor({ ...s[decorKey(s)], background: null }, 'tile fill removed');
  };
  bordersBox.onchange = () => store.commit({ borders: bordersBox.checked }, bordersBox.checked ? 'borders shown' : 'borders hidden');
  mirrorBox.onchange = () => store.commit({ mirrorPalette: mirrorBox.checked });
  decorateBtn.onclick = () => store.commit({ decorate: !store.get().decorate }, store.get().decorate ? '' : 'Decorate: add ports, connect them, paint.');
  for (const [name, b] of Object.entries(decorTools)) b.onclick = () => store.set({ decorTool: name as DecorTool });
  let paletteShown = '';
  function renderPalette(s: AppState): void {
    for (const [id, b] of Object.entries(paletteTabButtons)) b.classList.toggle('active', id === s.palette);
    const key = s.palette + s.color;
    if (key === paletteShown) return;
    paletteShown = key;
    paletteGrid.replaceChildren();
    for (const col of PALETTES[s.palette].colors) {
      const b = h('button', { class: `color-cell ${col === s.color ? 'active' : ''}`, style: `background:${col}`, title: col, 'aria-label': col });
      b.onclick = () => store.set({ color: col });
      paletteGrid.append(b);
    }
    currentSwatch.style.background = s.color;
    if (/^#[0-9a-f]{6}$/i.test(s.color)) customColor.value = s.color;
  }

  /* ---------- rendering ---------- */
  function renderTileSelect(s: AppState): void {
    tileSelect.replaceChildren();
    const defs = s.mode === 'envelope' ? TILES : SEAM_TILES;
    for (const t of defs) tileSelect.append(h('option', { value: t.id }, [t.name]));
    tileSelect.value = s.mode === 'envelope' ? s.tileId : s.seamTileId;
    paramBox.replaceChildren();
    const params = s.mode === 'envelope' ? tileById(s.tileId).params : seamTileById(s.seamTileId).params;
    const values = s.mode === 'envelope' ? s.params : s.seamParams;
    for (const p of params ?? []) {
      const input = h('input', { type: 'range', min: String(p.min), max: String(p.max), step: String(p.step), value: String(values[p.key] ?? p.value), class: 'slider small', title: p.label });
      input.oninput = () => {
        const cur = store.get();
        if (cur.mode === 'envelope') store.commit({ params: { ...cur.params, [p.key]: Number(input.value) } });
        else store.commit({ seamParams: { ...cur.seamParams, [p.key]: Number(input.value) } });
      };
      paramBox.append(h('label', { class: 'field' }, [p.label + ' ', input]));
    }
    levelField.style.display = s.mode === 'seam' ? '' : 'none';
    if (s.mode === 'seam') {
      const def = seamTileById(s.seamTileId);
      levelSelect.replaceChildren();
      for (let l = def.levels[0]; l <= def.levels[1]; l++) levelSelect.append(h('option', { value: String(l) }, [String(l)]));
      levelSelect.value = String(s.seamLevel);
    }
  }

  function renderClassTable(s: AppState, classes: EdgeClass[], selected: EdgeClass | null): void {
    classTable.replaceChildren();
    for (const c of classes) {
      const row = h('button', { class: `class-row ${selected?.rep === c.rep ? 'active' : ''}` }, [
        h('span', { class: 'swatch', style: `background:${classColor(classes, c.rep)}` }),
        h('span', { class: 'class-edges' }, [`edges ${c.edges.map((e) => e.edge).sort((a, b) => a - b).join(' ')}`]),
        h('span', { class: `class-verdict ${c.verdict === 'straight' ? 'bad' : ''}` }, [c.verdict]),
      ]);
      row.onclick = () => store.set({ selectedClass: c.rep });
      classTable.append(row);
    }
  }

  let hashTimer: number | null = null;
  let hashReady = false;
  let selectKey = '';
  store.subscribe((s) => {
    const sk = `${s.mode}|${s.tileId}|${s.seamTileId}`;
    if (sk !== selectKey) {
      renderTileSelect(s);
      selectKey = sk;
    }
    tabEnvelope.classList.toggle('active', s.mode === 'envelope');
    tabSeam.classList.toggle('active', s.mode === 'seam');
    envelopeSidebar.style.display = s.mode === 'envelope' && !s.decorate ? '' : 'none';
    seamSidebar.style.display = s.mode === 'seam' && !s.decorate ? '' : 'none';
    decorSidebar.style.display = s.decorate ? '' : 'none';
    envelopeEditorBox.style.display = s.mode === 'envelope' && !s.decorate ? '' : 'none';
    seamEditorBox.style.display = s.mode === 'seam' && !s.decorate ? '' : 'none';
    decorEditorBox.style.display = s.decorate ? '' : 'none';
    envelopePreviewBox.style.display = s.mode === 'envelope' ? '' : 'none';
    seamPreviewBox.style.display = s.mode === 'seam' ? '' : 'none';
    decorateBtn.classList.toggle('active', s.decorate);
    bordersBox.checked = s.borders;
    mirrorBox.checked = s.mirrorPalette;
    mirrorField.style.display = s.mode === 'seam' ? '' : 'none';
    for (const [name, b] of Object.entries(decorTools)) b.classList.toggle('active', name === s.decorTool);
    widthSlider.value = String(s.brush);
    opacitySlider.value = String(s.opacity);
    bendSlider.value = String(s.bend);
    renderPalette(s);
    const decor = s[decorKey(s)];
    const frame = decorFrame(s);
    const ports = frame ? portsFor(frame, decor) : [];
    const regions = frame ? regionsFor(frame, decor) : null;
    const fills = regions ? regions.resolve(decor.fills) : [];
    linkFillBox.checked = s.linkFill;
    if (s.decorate) {
      editorTitle.textContent = 'Decorate the tile';
      const ctx: DecorContext | null = frame && regions ? { tile: frame.tile, ports, decor, regions, fills, key: frame.key } : null;
      decorEditor.render(ctx);
    }
    undoBtn.disabled = !store.canUndo;
    redoBtn.disabled = !store.canRedo;

    if (s.mode === 'envelope') {
      if (!s.decorate) editorTitle.textContent = 'Envelope';
      for (const [name, b] of Object.entries(toolButtons)) b.classList.toggle('active', name === s.tool);
      if (Number(openSlider.value) !== s.open) openSlider.value = String(s.open);
      netOnlyBox.checked = s.netOnly;
      const { base, u, t } = deriveEnvelope(s);
      previewTitle.textContent = t && !t.tiles ? 'Development of the net (overlaps in red)' : 'Tiling by the net';
      const tileKey = s.tileId + JSON.stringify(s.params);
      if (!s.decorate) editor.render(base, u, s.open, tileKey, s.netOnly);
      preview.render(
        t,
        base,
        tileKey,
        u.flaps.map((f) => [f.hinge.a, f.hinge.b] as [Vec, Vec]),
        u.outline ? { tile: u.outline, decor, fills, borders: s.borders } : null,
      );
      const tile = tileById(s.tileId);
      const parts = [
        `${u.pieces.length} flap${u.pieces.length === 1 ? '' : 's'}`,
        `area ×${u.areaRatio.toFixed(2)}`,
        u.flattens ? 'flattens ✓' : 'flattens ✗',
        t ? (t.tiles ? (t.method === 'conway' ? 'tiles ✓ (Conway criterion, p2)' : 'tiles ✓') : 'no p2 tiling found ✗') : 'tiles —',
      ];
      const problem = u.problems.filter((p) => !p.startsWith('internal'))[0];
      status.replaceChildren(
        h('span', { class: 'status-main' }, [parts.join(' · ')]),
        h('span', { class: `status-note ${problem ? 'bad' : ''}` }, [problem ?? s.message ?? tile.note]),
      );
    } else {
      if (!s.decorate) editorTitle.textContent = 'Tile and edge classes';
      previewTitle.textContent = 'Patch of the tiling';
      for (const [name, b] of Object.entries(seamTools)) b.classList.toggle('active', name === s.tool);
      const d = deriveSeam(s);
      const sel = selectedClassOf(s, d.classes);
      renderClassTable(s, d.classes, sel);
      if (!s.decorate) seamEditor.render({ base: d.base, classes: d.classes, deformed: d.tile, curves: s.curves }, d.key, sel?.rep ?? null);
      seamPreview.render(d.tile, d.placements, d.patch, d.key, { decor, fills, borders: s.borders, mirrorPalette: s.mirrorPalette });
      const free = d.classes.filter((c) => c.verdict === 'free').length;
      const sym = d.classes.filter((c) => c.verdict === 'centrally symmetric' || c.verdict === 'mirror symmetric').length;
      const straight = d.classes.filter((c) => c.verdict === 'straight').length;
      const parts = [
        `${d.placements.length} tiles`,
        `${d.classes.length} class${d.classes.length === 1 ? '' : 'es'} (${free} free, ${sym} symmetric, ${straight} straight)`,
        d.simple ? (d.patch.anyOverlap ? 'overlaps ✗' : 'tiles ✓') : 'tile self-intersects ✗',
      ];
      const bad = d.report.badGroups + d.report.partial + d.report.crossings + d.report.angleBad;
      const note = bad ? `patch validation failed (${bad} problems)` : (s.message || seamTileById(s.seamTileId).note);
      status.replaceChildren(h('span', { class: 'status-main' }, [parts.join(' · ')]), h('span', { class: `status-note ${bad ? 'bad' : ''}` }, [note]));
    }
    if (s.decorate) {
      const close = (a: number, b: number) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b)) < 2e-4;
      const open = ports.filter((p) => !decor.curves.some((c) => close(c.a, p.f) || close(c.b, p.f))).length;
      const forced = ports.filter((p) => !p.user).length;
      const parts = [
        `${ports.length} port${ports.length === 1 ? '' : 's'} (${forced} forced)`,
        `${decor.curves.length} curve${decor.curves.length === 1 ? '' : 's'}`,
        `${open} open end${open === 1 ? '' : 's'}`,
        `${decor.strokes.length + decor.swatches.length + (decor.fills?.length ?? 0)} painted`,
      ];
      const problem = !frame ? 'Unfold a net first: the decoration lives on the net.' : frame.problem;
      status.replaceChildren(
        h('span', { class: 'status-main' }, [parts.join(' · ')]),
        h('span', { class: `status-note ${problem ? 'bad' : ''}` }, [problem ?? s.message ?? '']),
      );
    }
    scheduleHash();
  });

  /* ---------- print ---------- */
  function printSource(): PrintSource | null {
    const s = store.get();
    const decor = s[decorKey(s)];
    const frame = decorFrame(s);
    const fills = frame ? regionsFor(frame, decor).resolve(decor.fills) : [];
    const hasArt = !isEmptyDecor(decor);
    const plain = decor.background ?? (hasArt || !s.borders ? DEFAULT_TILE_FILL : null);
    if (s.mode === 'envelope') {
      const { u, t } = deriveEnvelope(s);
      if (!u.outline || !t || !t.tiles) return null;
      const copies: SourceCopy[] = t.copies
        .filter((k) => !k.overlapping)
        .map((k) => ({ iso: k.iso, reflected: false, fill: plain ?? `hsl(${HUES[k.cls % HUES.length]} 55% 82%)` }));
      return { tile: u.outline, copies, decor, fills, mirror: false, borders: s.borders, name: tileById(s.tileId).name };
    }
    const d = deriveSeam(s);
    if (!d.simple || d.patch.anyOverlap) return null;
    const def = seamTileById(s.seamTileId);
    const fill = (reflected: boolean) =>
      plain ? (reflected && s.mirrorPalette ? alternateColor(plain) : plain) : reflected ? 'hsl(30 60% 78%)' : 'hsl(210 55% 82%)';
    const toCopies = (ps: Placement[]): SourceCopy[] => ps.map((p) => ({ iso: p.iso, reflected: p.reflected, fill: fill(p.reflected) }));
    const aperiodic = def.id === 'hat' || def.id === 'spectre';
    const params = s.seamParams;
    return {
      tile: d.tile,
      copies: toCopies(d.placements),
      patch: aperiodic ? (level: number) => (level > 5 ? null : toCopies(def.patch(params, level))) : undefined,
      startLevel: s.seamLevel,
      decor,
      fills,
      mirror: s.mirrorPalette,
      borders: s.borders,
      name: def.name,
    };
  }
  const printDialog = new PrintDialog(printSource);
  printBtn.onclick = () => printDialog.open();

  /* ---------- share ---------- */
  function scheduleHash(): void {
    if (!hashReady) return;
    if (hashTimer) clearTimeout(hashTimer);
    hashTimer = window.setTimeout(async () => {
      writeHash(await encodeState(snapshot(store.get())));
    }, 400);
  }
  (async () => {
    const hash = readHash();
    if (hash) {
      const st = await decodeState<Partial<Snapshot>>(hash);
      if (st) store.commit(st, 'state loaded from link');
    }
    hashReady = true;
  })();
  shareBtn.onclick = async () => {
    writeHash(await encodeState(snapshot(store.get())));
    try {
      await navigator.clipboard.writeText(location.href);
      store.set({ message: 'Link copied to the clipboard.' });
    } catch {
      store.set({ message: 'Link is in the address bar.' });
    }
  };

  /* ---------- events ---------- */
  tabEnvelope.onclick = () => store.commit({ mode: 'envelope' });
  tabSeam.onclick = () => {
    store.commit({ mode: 'seam' });
    store.set({ tool: 'draw' });
  };
  tileSelect.onchange = () => {
    const s = store.get();
    if (s.mode === 'envelope') {
      const t = tileById(tileSelect.value);
      const base = ensureCCW(t.build(defaultParams(t)));
      store.commit({ tileId: t.id, params: defaultParams(t), ...PRESETS[0]!.make(base) }, t.note);
    } else {
      const t = seamTileById(tileSelect.value);
      store.commit({ seamTileId: t.id, seamParams: seamDefaultParams(t), seamLevel: t.defaultLevel, curves: {} }, t.note);
      store.set({ selectedClass: null });
    }
  };
  levelSelect.onchange = () => store.commit({ seamLevel: Number(levelSelect.value) });
  for (const [name, b] of Object.entries(toolButtons)) b.onclick = () => selectTool(name as Tool);
  for (const [name, b] of Object.entries(seamTools)) b.onclick = () => store.set({ tool: name as Tool });
  function selectTool(tool: Tool): void {
    if (tool !== 'pan' && store.get().open > 0) animateTo(0);
    store.set({ tool });
  }
  undoBtn.onclick = () => store.undo();
  redoBtn.onclick = () => store.redo();
  exportEditor.onclick = () => {
    const s = store.get();
    const src = s.decorate ? decorEditor : s.mode === 'envelope' ? editor : seamEditor;
    download(s.decorate ? 'decorated-tile.svg' : s.mode === 'envelope' ? 'envelope-net.svg' : 'seam-tile.svg', src.canvas.serialize());
  };
  exportPreview.onclick = () => download(store.get().mode === 'envelope' ? 'envelope-tiling.svg' : 'seam-tiling.svg', (store.get().mode === 'envelope' ? preview : seamPreview).canvas.serialize());
  openSlider.oninput = () => store.set({ open: Number(openSlider.value) });
  netOnlyBox.onchange = () => {
    store.set({ netOnly: netOnlyBox.checked });
    if (netOnlyBox.checked && store.get().open < 1) animateTo(1);
  };

  let anim: number | null = null;
  function animateTo(target: number): void {
    if (anim) cancelAnimationFrame(anim);
    const start = store.get().open;
    const t0 = performance.now();
    const dur = 900 * Math.abs(target - start) + 50;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      store.set({ open: start + (target - start) * e });
      anim = k < 1 ? requestAnimationFrame(step) : null;
    };
    anim = requestAnimationFrame(step);
  }
  playBtn.onclick = () => animateTo(store.get().open > 0.5 ? 0 : 1);

  window.addEventListener('keydown', (ev) => {
    const mod = ev.metaKey || ev.ctrlKey;
    if (mod && ev.key.toLowerCase() === 'z') {
      ev.preventDefault();
      if (ev.shiftKey) store.redo();
      else store.undo();
      return;
    }
    if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLSelectElement) return;
    const seam = store.get().mode === 'seam';
    if (store.get().decorate) {
      const map: Record<string, DecorTool> = { c: 'connect', p: 'port', b: 'brush', s: 'swatch', f: 'fill', e: 'erase', v: 'pan' };
      const t = mod ? undefined : map[ev.key.toLowerCase()];
      if (t) store.set({ decorTool: t });
      if (ev.key === ' ') {
        decorEditor.canvas.spaceHeld = true;
        ev.preventDefault();
      }
      return;
    }
    switch (ev.key.toLowerCase()) {
      case 'd': if (seam) store.set({ tool: 'draw' }); else selectTool('draw'); break;
      case 'h': if (!seam) selectTool('hinge'); break;
      case 'e': if (!seam) selectTool('erase'); break;
      case 'v': if (seam) store.set({ tool: 'pan' }); else selectTool('pan'); break;
      case ' ': editor.canvas.spaceHeld = seamEditor.canvas.spaceHeld = true; ev.preventDefault(); break;
      case 'enter': if (!seam) playBtn.click(); break;
    }
  });
  window.addEventListener('keyup', (ev) => {
    if (ev.key === ' ') editor.canvas.spaceHeld = seamEditor.canvas.spaceHeld = decorEditor.canvas.spaceHeld = false;
  });
}
