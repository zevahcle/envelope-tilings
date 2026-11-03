import { Store, type AppState, type Tool } from '../app/store';
import { TILES, tileById, defaultParams } from '../tiles/library';
import { computeUnfolding, type Unfolding } from '../envelope/model';
import { tileNet, type NetTiling } from '../envelope/tiling';
import { PRESETS } from '../envelope/presets';
import { EnvelopeEditor } from './editor';
import { TilingPreview } from './preview';
import { download } from '../render/svgcanvas';
import { ensureCCW, type Polygon } from '../geom/polygon';

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
  const store = new Store({
    mode: 'envelope',
    tileId: first.id,
    params: defaultParams(first),
    cuts: [],
    hinges: [],
    open: 0,
    tool: 'draw',
    message: 'Draw a cut on the front sheet of the envelope.',
  });
  // start with the wavy preset so the first screen is not empty
  const base0 = first.build(defaultParams(first));
  store.commit(PRESETS[0]!.make(base0), 'Draw a cut on the front sheet of the envelope.');

  /* ---------- layout ---------- */
  const tileSelect = h('select', { class: 'select', 'aria-label': 'Base tile' });
  for (const t of TILES) tileSelect.append(h('option', { value: t.id }, [t.name]));
  const paramBox = h('div', { class: 'params' });
  const undoBtn = h('button', { class: 'btn', title: 'Undo (⌘Z)' }, ['↶']);
  const redoBtn = h('button', { class: 'btn', title: 'Redo (⇧⌘Z)' }, ['↷']);
  const exportEditor = h('button', { class: 'btn' }, ['SVG net']);
  const exportPreview = h('button', { class: 'btn' }, ['SVG tiling']);
  const modeTabs = h('div', { class: 'tabs', role: 'tablist' }, [
    h('button', { class: 'tab active', role: 'tab', 'aria-selected': 'true' }, ['Envelope']),
    h('button', { class: 'tab', role: 'tab', disabled: 'true', title: 'Seam mode (matched-edge deformation) comes next' }, ['Seam']),
  ]);
  const header = h('header', { class: 'topbar' }, [
    h('div', { class: 'brand' }, ['Envelope Tilings']),
    modeTabs,
    h('div', { class: 'spacer' }),
    h('label', { class: 'field' }, ['Tile ', tileSelect]),
    paramBox,
    h('div', { class: 'group' }, [undoBtn, redoBtn]),
    h('div', { class: 'group' }, [exportEditor, exportPreview]),
  ]);

  const toolButtons: Record<Tool, HTMLButtonElement> = {
    draw: h('button', { class: 'tool', 'data-key': 'D' }, ['✂ Draw cut']),
    hinge: h('button', { class: 'tool', 'data-key': 'H' }, ['⟲ Hinge']),
    erase: h('button', { class: 'tool', 'data-key': 'E' }, ['⌫ Erase cut']),
    pan: h('button', { class: 'tool', 'data-key': 'V' }, ['✥ Pan']),
  };
  const presetBox = h('div', { class: 'stack' });
  for (const p of PRESETS) {
    const b = h('button', { class: 'btn wide' }, [p.name]);
    b.onclick = () => {
      const s = store.get();
      store.commit(p.make(currentBase(s)), `preset: ${p.name}`);
    };
    presetBox.append(b);
  }
  const clearBtn = h('button', { class: 'btn wide' }, ['Clear cuts']);
  clearBtn.onclick = () => store.commit({ cuts: [], hinges: [] }, 'cleared');

  const openSlider = h('input', { type: 'range', min: '0', max: '1', step: '0.005', value: '0', class: 'slider', 'aria-label': 'Open the envelope' });
  const playBtn = h('button', { class: 'btn' }, ['▶ Unfold']);

  const explain = h('div', { class: 'explain' }, [
    h('p', {}, ['1. The envelope is a doubly covered polygon: two sheets glued along the border.']),
    h('p', {}, ['2. Cut the front sheet. Each flap stays attached along one straight hinge (orange).']),
    h('p', {}, ['3. Open it flat. Flipping paper reflects it, so flaps are mirrored across their hinges.']),
    h('p', {}, ['4. For rectangles and the three Coxeter triangles the net always tiles (Akiyama). For other polygons it usually does not.']),
  ]);

  const sidebar = h('aside', { class: 'sidebar' }, [
    h('h2', {}, ['Tools']),
    h('div', { class: 'stack' }, Object.values(toolButtons)),
    h('h2', {}, ['Presets']),
    presetBox,
    clearBtn,
    h('h2', {}, ['Unfold']),
    h('div', { class: 'row' }, [openSlider, playBtn]),
    h('h2', {}, ['How it works']),
    explain,
  ]);

  const editorPane = h('section', { class: 'pane editor' }, [h('div', { class: 'pane-title' }, ['Envelope'])]);
  const previewPane = h('section', { class: 'pane preview' }, [h('div', { class: 'pane-title' }, ['Tiling by the net'])]);
  const status = h('footer', { class: 'status', 'aria-live': 'polite' });
  const main = h('main', { class: 'main' }, [sidebar, editorPane, previewPane]);
  root.append(header, main, status);

  const editor = new EnvelopeEditor(editorPane, store);
  const preview = new TilingPreview(previewPane);

  /* ---------- derived state ---------- */
  function currentBase(s: AppState): Polygon {
    return ensureCCW(tileById(s.tileId).build(s.params));
  }

  let lastKey = '';
  let lastUnfolding: Unfolding | null = null;
  let lastTiling: NetTiling | null = null;

  function derive(s: AppState): { base: Polygon; u: Unfolding; t: NetTiling | null; key: string } {
    const base = currentBase(s);
    const key = JSON.stringify([s.tileId, s.params, s.cuts, s.hinges]);
    if (key !== lastKey || !lastUnfolding) {
      lastUnfolding = computeUnfolding(base, s.cuts, s.hinges);
      lastTiling = lastUnfolding.outline && lastUnfolding.flattens ? tileNet(base, lastUnfolding.outline) : null;
      lastKey = key;
    }
    return { base, u: lastUnfolding, t: lastTiling, key };
  }

  /* ---------- rendering ---------- */
  function renderParams(s: AppState): void {
    paramBox.replaceChildren();
    const t = tileById(s.tileId);
    for (const p of t.params ?? []) {
      const input = h('input', { type: 'range', min: String(p.min), max: String(p.max), step: String(p.step), value: String(s.params[p.key] ?? p.value), class: 'slider small' });
      input.oninput = () => store.commit({ params: { ...store.get().params, [p.key]: Number(input.value) } });
      paramBox.append(h('label', { class: 'field' }, [p.label + ' ', input]));
    }
  }

  let paramsFor = '';
  store.subscribe((s) => {
    if (tileSelect.value !== s.tileId) tileSelect.value = s.tileId;
    if (paramsFor !== s.tileId) {
      renderParams(s);
      paramsFor = s.tileId;
    }
    for (const [name, b] of Object.entries(toolButtons)) b.classList.toggle('active', name === s.tool);
    undoBtn.disabled = !store.canUndo;
    redoBtn.disabled = !store.canRedo;
    if (Number(openSlider.value) !== s.open) openSlider.value = String(s.open);

    const { base, u, t, key } = derive(s);
    const tileKey = s.tileId + JSON.stringify(s.params);
    editor.render(base, u, s.open, tileKey);
    preview.render(t, base, tileKey);

    const tile = tileById(s.tileId);
    const parts: string[] = [];
    parts.push(`${u.pieces.length} flap${u.pieces.length === 1 ? '' : 's'}`);
    parts.push(`area ×${u.areaRatio.toFixed(2)}`);
    parts.push(u.flattens ? 'flattens ✓' : 'flattens ✗');
    if (t) parts.push(t.tiles ? 'tiles ✓' : 'development overlaps ✗');
    else parts.push('tiles —');
    const text = parts.join(' · ');
    const problem = u.problems.filter((p) => !p.startsWith('internal'))[0];
    status.replaceChildren(
      h('span', { class: 'status-main' }, [text]),
      h('span', { class: `status-note ${problem ? 'bad' : ''}` }, [problem ?? s.message ?? tile.note]),
    );
    void key;
  });

  /* ---------- events ---------- */
  tileSelect.onchange = () => {
    const t = tileById(tileSelect.value);
    const base = ensureCCW(t.build(defaultParams(t)));
    store.commit({ tileId: t.id, params: defaultParams(t), ...PRESETS[0]!.make(base) }, t.note);
  };
  for (const [name, b] of Object.entries(toolButtons)) {
    b.onclick = () => selectTool(name as Tool);
  }
  function selectTool(tool: Tool): void {
    const s = store.get();
    if (tool !== 'pan' && s.open > 0) animateTo(0);
    store.set({ tool });
  }
  undoBtn.onclick = () => store.undo();
  redoBtn.onclick = () => store.redo();
  exportEditor.onclick = () => download('envelope-net.svg', editor.canvas.serialize());
  exportPreview.onclick = () => download('envelope-tiling.svg', preview.canvas.serialize());
  openSlider.oninput = () => store.set({ open: Number(openSlider.value) });

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
      if (k < 1) anim = requestAnimationFrame(step);
      else anim = null;
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
    switch (ev.key.toLowerCase()) {
      case 'd': selectTool('draw'); break;
      case 'h': selectTool('hinge'); break;
      case 'e': selectTool('erase'); break;
      case 'v': selectTool('pan'); break;
      case ' ': editor.canvas.spaceHeld = true; ev.preventDefault(); break;
      case 'enter': playBtn.click(); break;
    }
  });
  window.addEventListener('keyup', (ev) => {
    if (ev.key === ' ') editor.canvas.spaceHeld = false;
  });
}
