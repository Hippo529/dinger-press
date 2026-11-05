// Small DOM helpers. Buttons activate on pointerdown (never click) unless inside a scrolling list,
// where a short tap (pointerup within 10 px) is used so scrolling doesn't trigger them (SPEC D11).
import { TUNING } from '../config/tuning';

type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) e.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return e;
}

let onAnyPress: (() => void) | null = null;
export function setPressHook(fn: () => void): void {
  onAnyPress = fn;
}

/** Make an element activate on pointerdown / Enter / Space. `tap` = use tap-up semantics (scroll lists). */
export function activate<T extends HTMLElement>(e: T, fn: (ev: Event) => void, tap = false): T {
  let down: { x: number; y: number; t: number } | null = null;
  const fire = (ev: Event) => {
    if ((e as unknown as HTMLButtonElement).disabled) return;
    e.classList.add('pressed');
    setTimeout(() => e.classList.remove('pressed'), TUNING.button.pressMs + TUNING.button.springMs);
    onAnyPress?.();
    fn(ev);
  };
  e.addEventListener('pointerdown', (ev) => {
    ev.stopPropagation();
    if (tap) {
      down = { x: ev.clientX, y: ev.clientY, t: performance.now() };
      return;
    }
    ev.preventDefault();
    fire(ev);
  });
  if (tap) {
    e.addEventListener('pointerup', (ev) => {
      if (!down) return;
      const ok = Math.hypot(ev.clientX - down.x, ev.clientY - down.y) < 10 && performance.now() - down.t < 700;
      down = null;
      if (ok) fire(ev);
    });
  }
  e.addEventListener('keydown', (ev) => {
    const k = (ev as KeyboardEvent).key;
    if (k === 'Enter' || k === ' ') {
      ev.preventDefault();
      ev.stopPropagation();
      fire(ev);
    }
  });
  return e;
}

export function btn(label: string, fn: (ev: Event) => void, cls = '', tap = false, id?: string): HTMLButtonElement {
  const b = el('button', { class: `btn ${cls}`.trim(), type: 'button' }, label);
  if (id) b.dataset.id = id;
  return activate(b, fn, tap);
}

/** Segmented control. */
export function seg<T extends string | number>(opts: { v: T; label: string }[], value: T, onChange: (v: T) => void, id?: string): HTMLElement {
  const wrap = el('div', { class: 'seg', role: 'radiogroup' });
  if (id) wrap.dataset.id = id;
  const render = (cur: T) => {
    wrap.replaceChildren(
      ...opts.map((o) => {
        const b = el('button', { type: 'button', class: o.v === cur ? 'on' : '', role: 'radio', 'aria-checked': String(o.v === cur) }, o.label);
        b.dataset.id = `${id ?? 'seg'}-${o.v}`;
        activate(b, () => {
          render(o.v);
          onChange(o.v);
        }, true);
        return b;
      }),
    );
  };
  render(value);
  return wrap;
}

export function toggle(value: boolean, onChange: (v: boolean) => void, id?: string): HTMLElement {
  return seg<string>([{ v: 'off', label: 'OFF' }, { v: 'on', label: 'ON' }], value ? 'on' : 'off', (v) => onChange(v === 'on'), id);
}

export function field(label: string, control: HTMLElement): HTMLElement {
  return el('div', { class: 'field' }, el('span', {}, label), control);
}

export function slider(min: number, max: number, value: number, onChange: (v: number) => void, id?: string, label = 'HEAT'): HTMLElement {
  const out = el('span', { class: 'heat' }, String(value));
  const r = el('input', { type: 'range', min: String(min), max: String(max), value: String(value), 'aria-label': label });
  if (id) r.dataset.id = id;
  r.addEventListener('input', () => {
    out.textContent = r.value;
    onChange(Number(r.value));
  });
  r.addEventListener('pointerdown', (e) => e.stopPropagation());
  return el('span', { class: 'row' }, r, out);
}

/** Arrow-key focus movement between focusable controls inside a screen. */
export function arrowNav(root: HTMLElement): void {
  root.addEventListener('keydown', (ev) => {
    const k = ev.key;
    if (k !== 'ArrowDown' && k !== 'ArrowUp' && k !== 'ArrowRight' && k !== 'ArrowLeft') return;
    if ((ev.target as HTMLElement).tagName === 'INPUT') return;
    const items = [...root.querySelectorAll<HTMLElement>('button:not([disabled]), input, textarea, [tabindex="0"]')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    const d = k === 'ArrowDown' || k === 'ArrowRight' ? 1 : -1;
    const n = items[(i + d + items.length) % items.length];
    if (n) {
      n.focus();
      ev.preventDefault();
    }
  });
}
