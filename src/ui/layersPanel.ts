import {
  type DecorDoc,
  type BlendMode,
  BLEND_MODES,
  blendLabel,
  activeLayer,
  addLayer,
  duplicateLayer,
  removeLayer,
  moveLayer,
  updateLayer,
} from '../decor/layers';
import { isEmptyDecor } from '../decor/model';

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) el.append(c);
  return el;
};

/**
 * Layer list (top of the stack first, as in paint programs) and the controls
 * for the active layer. `commit` records an undo step; `preview` does not
 * (used while a slider is being dragged, after its first step was committed).
 */
export class LayersPanel {
  readonly el: HTMLElement;
  private list = h('div', { class: 'layer-list', role: 'listbox', 'aria-label': 'Layers' });
  private name = h('input', { type: 'text', class: 'layer-name', 'aria-label': 'Layer name' });
  private opacity = h('input', { type: 'range', min: '0', max: '1', step: '0.05', class: 'slider', 'aria-label': 'Layer opacity' });
  private opacityOut = h('span', { class: 'muted num' });
  private blend = h('select', { class: 'select', 'aria-label': 'Blend mode' });
  private doc: DecorDoc | null = null;
  private sliding = false;

  constructor(
    private commit: (d: DecorDoc, message: string) => void,
    private preview: (d: DecorDoc) => void,
  ) {
    for (const m of BLEND_MODES) this.blend.append(h('option', { value: m }, [blendLabel(m)]));
    const btn = (label: string, title: string, fn: (d: DecorDoc) => [DecorDoc, string]) => {
      const b = h('button', { class: 'btn icon', title, 'aria-label': title }, [label]);
      b.onclick = () => {
        if (!this.doc) return;
        const [d, msg] = fn(this.doc);
        if (d !== this.doc) this.commit(d, msg);
      };
      return b;
    };
    const top = (d: DecorDoc) => d.layers.length - 1;
    this.el = h('div', { class: 'stack layers' }, [
      this.list,
      h('div', { class: 'row tight' }, [
        btn('＋', 'New layer above', (d) => [addLayer(d), 'new layer']),
        btn('⧉', 'Duplicate layer', (d) => [duplicateLayer(d), 'layer duplicated']),
        btn('🗑', 'Delete layer', (d) => [removeLayer(d), 'layer deleted']),
        h('span', { class: 'spacer' }),
        btn('⤒', 'Bring to front', (d) => [moveLayer(d, top(d)), 'layer brought to front']),
        btn('↑', 'Bring forward', (d) => [moveLayer(d, d.active + 1), 'layer moved up']),
        btn('↓', 'Send backward', (d) => [moveLayer(d, d.active - 1), 'layer moved down']),
        btn('⤓', 'Send to back', (d) => [moveLayer(d, 0), 'layer sent to back']),
      ]),
      h('div', { class: 'row' }, [h('span', { class: 'muted lbl' }, ['name']), this.name]),
      h('div', { class: 'row' }, [h('span', { class: 'muted lbl' }, ['opacity']), this.opacity, this.opacityOut]),
      h('div', { class: 'row' }, [h('span', { class: 'muted lbl' }, ['blend']), this.blend]),
    ]);
    this.name.onchange = () => {
      if (this.doc && this.name.value.trim()) this.commit(updateLayer(this.doc, this.doc.active, { name: this.name.value.trim() }), 'layer renamed');
    };
    this.opacity.oninput = () => {
      if (!this.doc) return;
      const d = updateLayer(this.doc, this.doc.active, { opacity: Number(this.opacity.value) });
      if (this.sliding) this.preview(d);
      else this.commit(d, 'layer opacity');
      this.sliding = true;
    };
    this.opacity.onchange = () => (this.sliding = false);
    this.blend.onchange = () => {
      if (this.doc) this.commit(updateLayer(this.doc, this.doc.active, { blend: this.blend.value as BlendMode }), `blend: ${blendLabel(this.blend.value as BlendMode)}`);
    };
  }

  render(doc: DecorDoc): void {
    this.doc = doc;
    const rows: HTMLElement[] = [];
    doc.layers.forEach((l, i) => {
      const eye = h('button', { class: `eye ${l.visible ? 'on' : ''}`, title: l.visible ? 'Hide layer' : 'Show layer', 'aria-label': l.visible ? 'Hide layer' : 'Show layer' }, [l.visible ? '👁' : '–']);
      eye.onclick = (ev) => {
        ev.stopPropagation();
        this.commit(updateLayer(doc, i, { visible: !l.visible }), l.visible ? `${l.name} hidden` : `${l.name} shown`);
      };
      const info = [l.blend !== 'normal' ? blendLabel(l.blend) : '', l.opacity < 1 ? `${Math.round(l.opacity * 100)}%` : '', isEmptyDecor(l.decor) ? 'empty' : '']
        .filter(Boolean)
        .join(' · ');
      const row = h('div', { class: `layer-row ${i === doc.active ? 'active' : ''}`, role: 'option', 'aria-selected': String(i === doc.active) }, [
        eye,
        h('span', { class: 'layer-title' }, [l.name]),
        h('span', { class: 'muted layer-info' }, [info]),
      ]);
      row.onclick = () => {
        if (i !== doc.active) this.preview({ ...doc, active: i });
      };
      rows.unshift(row);
    });
    this.list.replaceChildren(...rows);
    const a = activeLayer(doc);
    if (document.activeElement !== this.name) this.name.value = a.name;
    if (!this.sliding) this.opacity.value = String(a.opacity);
    this.opacityOut.textContent = `${Math.round(a.opacity * 100)}%`;
    this.blend.value = a.blend;
  }
}
