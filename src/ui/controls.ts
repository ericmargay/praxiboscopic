// Controles de interfaz sin dependencias: deslizadores con número, selectores, casillas, color, texto, botones,
// grupos plegables y filas de lectura. Devuelven elementos DOM listos para insertar y aceptan un `onChange`.
// Textos en español; identificadores en inglés (convención de OMEGA).

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | number | boolean | undefined> = {}, ...children: (Node | string | null | undefined)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') node.className = String(v);
    else if (k === 'text') node.textContent = String(v);
    else if (k === 'html') node.innerHTML = String(v);
    else if (k.startsWith('on') && typeof v === 'function') (node as unknown as Record<string, unknown>)[k] = v;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined) node.append(c);
  return node;
}

export interface NumberOptions {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** decimales a mostrar */
  decimals?: number;
  help?: string;
  onChange: (v: number) => void;
  /** sin deslizador (solo número) */
  noSlider?: boolean;
  disabled?: boolean;
}

export interface NumberControl {
  root: HTMLElement;
  set(v: number): void;
}

export function numberControl(o: NumberOptions): NumberControl {
  const decimals = o.decimals ?? (o.step && o.step < 1 ? Math.min(4, Math.ceil(-Math.log10(o.step))) : 0);
  const input = el('input', { type: 'number', value: fmt(o.value, decimals), step: o.step ?? 1, min: o.min, max: o.max, class: 'ctl-number', title: o.help }) as HTMLInputElement;
  const slider = o.noSlider || o.min === undefined || o.max === undefined ? null : (el('input', { type: 'range', value: o.value, min: o.min, max: o.max, step: o.step ?? 1, class: 'ctl-range' }) as HTMLInputElement);
  if (o.disabled) {
    input.disabled = true;
    if (slider) slider.disabled = true;
  }
  const emit = (v: number) => {
    if (!Number.isFinite(v)) return;
    let c = v;
    if (o.min !== undefined) c = Math.max(o.min, c);
    if (o.max !== undefined) c = Math.min(o.max, c);
    input.value = fmt(c, decimals);
    if (slider) slider.value = String(c);
    o.onChange(c);
  };
  input.addEventListener('change', () => emit(parseFloat(input.value)));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') emit(parseFloat(input.value));
  });
  slider?.addEventListener('input', () => emit(parseFloat(slider.value)));
  const root = el('label', { class: 'ctl ctl-num', title: o.help }, el('span', { class: 'ctl-label', text: o.label }), el('span', { class: 'ctl-field' }, slider, input, o.unit ? el('span', { class: 'ctl-unit', text: o.unit }) : null));
  return {
    root,
    set(v) {
      input.value = fmt(v, decimals);
      if (slider) slider.value = String(v);
    },
  };
}

function fmt(v: number, decimals: number): string {
  return Number.isFinite(v) ? (decimals > 0 ? v.toFixed(decimals).replace(/\.?0+$/, (m) => (m.startsWith('.') ? '' : m)) : String(Math.round(v))) : '';
}

export interface SelectOptions<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  help?: string;
}

export function selectControl<T extends string>(o: SelectOptions<T>): { root: HTMLElement; set(v: T): void } {
  const select = el('select', { class: 'ctl-select' }) as HTMLSelectElement;
  for (const opt of o.options) select.append(el('option', { value: opt.value, text: opt.label, selected: opt.value === o.value }));
  select.addEventListener('change', () => o.onChange(select.value as T));
  return { root: el('label', { class: 'ctl ctl-sel', title: o.help }, el('span', { class: 'ctl-label', text: o.label }), select), set: (v) => (select.value = v) };
}

export function checkbox(label: string, value: boolean, onChange: (v: boolean) => void, help?: string): { root: HTMLElement; set(v: boolean): void } {
  const input = el('input', { type: 'checkbox' }) as HTMLInputElement;
  input.checked = value;
  input.addEventListener('change', () => onChange(input.checked));
  return { root: el('label', { class: 'ctl ctl-check', title: help }, input, el('span', { class: 'ctl-label', text: label })), set: (v) => (input.checked = v) };
}

export function colorControl(label: string, value: string, onChange: (v: string) => void): { root: HTMLElement; set(v: string): void } {
  const input = el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffffff', class: 'ctl-color' }) as HTMLInputElement;
  const text = el('input', { type: 'text', value, class: 'ctl-text ctl-text-short' }) as HTMLInputElement;
  input.addEventListener('input', () => {
    text.value = input.value;
    onChange(input.value);
  });
  text.addEventListener('change', () => {
    if (/^#[0-9a-f]{6}$/i.test(text.value)) input.value = text.value;
    onChange(text.value);
  });
  return {
    root: el('label', { class: 'ctl ctl-color-row' }, el('span', { class: 'ctl-label', text: label }), el('span', { class: 'ctl-field' }, input, text)),
    set(v) {
      text.value = v;
      if (/^#[0-9a-f]{6}$/i.test(v)) input.value = v;
    },
  };
}

export function textControl(label: string, value: string, onChange: (v: string) => void, placeholder = ''): { root: HTMLElement; input: HTMLInputElement } {
  const input = el('input', { type: 'text', value, class: 'ctl-text', placeholder }) as HTMLInputElement;
  input.addEventListener('change', () => onChange(input.value));
  return { root: el('label', { class: 'ctl ctl-txt' }, el('span', { class: 'ctl-label', text: label }), input), input };
}

export function button(label: string, onClick: () => void, opts: { kind?: 'primary' | 'ghost' | 'danger' | 'default'; title?: string; icon?: string } = {}): HTMLButtonElement {
  const b = el('button', { class: `btn btn-${opts.kind ?? 'default'}`, title: opts.title, type: 'button' }, opts.icon ? el('span', { class: 'btn-icon', text: opts.icon }) : null, label) as HTMLButtonElement;
  b.addEventListener('click', onClick);
  return b;
}

export function group(title: string, children: (Node | null | undefined)[], opts: { open?: boolean; hint?: string } = {}): HTMLDetailsElement {
  const d = el('details', { class: 'group', open: opts.open ?? true }, el('summary', {}, el('span', { text: title }), opts.hint ? el('span', { class: 'group-hint', text: opts.hint }) : null)) as HTMLDetailsElement;
  const body = el('div', { class: 'group-body' });
  for (const c of children) if (c) body.append(c);
  d.append(body);
  return d;
}

/** fila de lectura: etiqueta y valor (se actualiza con set) */
export function readout(label: string, value = '', help?: string): { root: HTMLElement; set(v: string, cls?: string): void } {
  const val = el('span', { class: 'ro-value', text: value });
  const root = el('div', { class: 'ro', title: help }, el('span', { class: 'ro-label', text: label }), val);
  return {
    root,
    set(v, cls) {
      val.textContent = v;
      val.className = `ro-value${cls ? ` ${cls}` : ''}`;
    },
  };
}

/** lista de avisos con nivel */
export function warningsList(items: { level: 'error' | 'warning' | 'info'; message: string; source?: string }[]): HTMLElement {
  const ul = el('ul', { class: 'warnings' });
  if (!items.length) ul.append(el('li', { class: 'warn-ok', text: 'Sin avisos: todo coherente.' }));
  for (const w of items) ul.append(el('li', { class: `warn-${w.level}` }, w.source ? el('b', { text: `${w.source}: ` }) : null, w.message));
  return ul;
}

/** pestañas simples */
export function tabs<T extends string>(items: { id: T; label: string }[], active: T, onSelect: (id: T) => void, cls = 'tabs'): { root: HTMLElement; set(id: T): void } {
  const root = el('div', { class: cls, role: 'tablist' });
  const buttons = new Map<T, HTMLButtonElement>();
  for (const it of items) {
    const b = el('button', { class: `tab${it.id === active ? ' active' : ''}`, role: 'tab', type: 'button', text: it.label }) as HTMLButtonElement;
    b.addEventListener('click', () => {
      onSelect(it.id);
    });
    buttons.set(it.id, b);
    root.append(b);
  }
  return {
    root,
    set(id) {
      for (const [k, b] of buttons) b.classList.toggle('active', k === id);
    },
  };
}

export function fmtNum(v: number, decimals = 2, unit = ''): string {
  if (!Number.isFinite(v)) return v === Infinity ? '∞' : '—';
  return `${v.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: decimals })}${unit ? ` ${unit}` : ''}`;
}

/** descarga un blob/bytes como archivo */
export function download(name: string, data: Uint8Array | Blob | string, type = 'application/octet-stream'): void {
  const blob = data instanceof Blob ? data : new Blob([data as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
