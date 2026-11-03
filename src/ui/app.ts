import { Store, type AppState, type Tool, type Snapshot, snapshot } from '../app/store';
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
import { TilingPreview } from './preview';
import { SeamEditor, classColor } from './seamEditor';
import { SeamPreview } from './seamPreview';
import { download } from '../render/svgcanvas';
import { ensureCCW, isSimple, type Polygon } from '../geom/polygon';

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
  const tabEnvelope = h('button', { class: 'tab active', role: 'tab' }, ['Envelope']);
  const tabSeam = h('button', { class: 'tab', role: 'tab' }, ['Seam']);
  const header = h('header', { class: 'topbar' }, [
    h('div', { class: 'brand' }, ['Envelope Tilings']),
    h('div', { class: 'tabs', role: 'tablist' }, [tabEnvelope, tabSeam]),
    h('div', { class: 'spacer' }),
    h('label', { class: 'field' }, ['Tile ', tileSelect]),
    paramBox,
    levelField,
    h('div', { class: 'group' }, [undoBtn, redoBtn]),
    h('div', { class: 'group' }, [exportEditor, exportPreview, shareBtn]),
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

  const sidebar = h('aside', { class: 'sidebar' }, [envelopeSidebar, seamSidebar]);
  const envelopeEditorBox = h('div', { class: 'fill' });
  const seamEditorBox = h('div', { class: 'fill' });
  const envelopePreviewBox = h('div', { class: 'fill' });
  const seamPreviewBox = h('div', { class: 'fill' });
  const editorTitle = h('div', { class: 'pane-title' }, ['Envelope']);
  const previewTitle = h('div', { class: 'pane-title' }, ['Tiling by the net']);
  const editorPane = h('section', { class: 'pane editor' }, [editorTitle, envelopeEditorBox, seamEditorBox]);
  const previewPane = h('section', { class: 'pane preview' }, [previewTitle, envelopePreviewBox, seamPreviewBox]);
  const status = h('footer', { class: 'status', 'aria-live': 'polite' });
  root.append(header, h('main', { class: 'main' }, [sidebar, editorPane, previewPane]), status);

  const editor = new EnvelopeEditor(envelopeEditorBox, store);
  const preview = new TilingPreview(envelopePreviewBox);
  const seamEditor = new SeamEditor(seamEditorBox, store);
  const seamPreview = new SeamPreview(seamPreviewBox);

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
    envelopeSidebar.style.display = s.mode === 'envelope' ? '' : 'none';
    seamSidebar.style.display = s.mode === 'seam' ? '' : 'none';
    envelopeEditorBox.style.display = envelopePreviewBox.style.display = s.mode === 'envelope' ? '' : 'none';
    seamEditorBox.style.display = seamPreviewBox.style.display = s.mode === 'seam' ? '' : 'none';
    undoBtn.disabled = !store.canUndo;
    redoBtn.disabled = !store.canRedo;

    if (s.mode === 'envelope') {
      editorTitle.textContent = 'Envelope';
      for (const [name, b] of Object.entries(toolButtons)) b.classList.toggle('active', name === s.tool);
      if (Number(openSlider.value) !== s.open) openSlider.value = String(s.open);
      netOnlyBox.checked = s.netOnly;
      const { base, u, t } = deriveEnvelope(s);
      previewTitle.textContent = t && !t.tiles ? 'Development of the net (overlaps in red)' : 'Tiling by the net';
      const tileKey = s.tileId + JSON.stringify(s.params);
      editor.render(base, u, s.open, tileKey, s.netOnly);
      preview.render(t, base, tileKey);
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
      editorTitle.textContent = 'Tile and edge classes';
      previewTitle.textContent = 'Patch of the tiling';
      for (const [name, b] of Object.entries(seamTools)) b.classList.toggle('active', name === s.tool);
      const d = deriveSeam(s);
      const sel = selectedClassOf(s, d.classes);
      renderClassTable(s, d.classes, sel);
      seamEditor.render({ base: d.base, classes: d.classes, deformed: d.tile, curves: s.curves }, d.key, sel?.rep ?? null);
      seamPreview.render(d.tile, d.placements, d.patch, d.key);
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
    scheduleHash();
  });

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
  exportEditor.onclick = () => download(store.get().mode === 'envelope' ? 'envelope-net.svg' : 'seam-tile.svg', (store.get().mode === 'envelope' ? editor : seamEditor).canvas.serialize());
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
    if (ev.key === ' ') editor.canvas.spaceHeld = seamEditor.canvas.spaceHeld = false;
  });
}
