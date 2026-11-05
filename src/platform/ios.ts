// iOS Safari hardening + platform glue. Everything is feature-detected and wrapped in try/catch.
import type { Insets } from '../render/layout';

export function hardenPage(root: HTMLElement): void {
  const opts: AddEventListenerOptions = { passive: false };
  const stop = (e: Event) => {
    // allow scrolling inside menu screens
    const t = e.target as HTMLElement | null;
    if (e.type === 'touchmove' && t?.closest?.('.screen:not(.clear)')) return;
    e.preventDefault();
  };
  try {
    document.addEventListener('touchmove', stop, opts);
    document.addEventListener('gesturestart', stop, opts);
    document.addEventListener('gesturechange', stop, opts);
    document.addEventListener('dblclick', (e) => e.preventDefault(), opts);
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  } catch {
    /* ignore */
  }
}

let probe: HTMLDivElement | null = null;
/** Safe-area insets in CSS px, read from env() through a hidden probe element. */
export function readInsets(): Insets {
  try {
    if (!probe) {
      probe = document.createElement('div');
      probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);';
      document.body.appendChild(probe);
    }
    const cs = getComputedStyle(probe);
    const v = (x: string) => parseFloat(x) || 0;
    const extra = parseFloat(document.documentElement.dataset.testInset ?? '0') || 0;
    return { top: v(cs.paddingTop) + extra, right: v(cs.paddingRight) + extra, bottom: v(cs.paddingBottom) + extra, left: v(cs.paddingLeft) + extra };
  } catch {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
}

export function viewportSize(): { w: number; h: number } {
  const vv = window.visualViewport;
  const w = Math.round(vv?.width ?? window.innerWidth);
  const h = Math.round(vv?.height ?? window.innerHeight);
  return { w: Math.max(200, w), h: Math.max(200, h) };
}

export function onResize(cb: () => void): void {
  let pending = 0;
  const run = () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(cb);
  };
  window.addEventListener('resize', run);
  window.addEventListener('orientationchange', run);
  try {
    window.visualViewport?.addEventListener('resize', run);
  } catch {
    /* ignore */
  }
}

export function onVisibility(hidden: () => void, visible: () => void): void {
  document.addEventListener('visibilitychange', () => (document.visibilityState === 'hidden' ? hidden() : visible()));
  window.addEventListener('pagehide', hidden);
  window.addEventListener('pageshow', (e) => {
    if ((e as PageTransitionEvent).persisted) visible();
  });
}

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function isStandalone(): boolean {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

export function requestPersist(): void {
  try {
    if (isStandalone()) void navigator.storage?.persist?.();
  } catch {
    /* ignore */
  }
}

export function toggleFullscreen(): void {
  try {
    const d = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => void };
    const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      if (d.exitFullscreen) void d.exitFullscreen();
      else d.webkitExitFullscreen?.();
    } else if (el.requestFullscreen) void el.requestFullscreen();
    else el.webkitRequestFullscreen?.();
  } catch {
    /* not supported (iPhone) */
  }
}

/**
 * Experimental haptics. Safari has no navigator.vibrate; toggling a hidden <input type=checkbox switch>
 * via its label inside a real touch handler produces a system tick on recent iOS. Off by default.
 */
export class Haptics {
  enabled = false;
  label: HTMLLabelElement | null = null;
  fired = 0;
  constructor(private doc: Document | null = typeof document !== 'undefined' ? document : null) {}
  private ensure(): void {
    if (this.label || !this.doc) return;
    const label = this.doc.createElement('label');
    label.className = 'haptic-host';
    label.setAttribute('aria-hidden', 'true');
    const input = this.doc.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    label.appendChild(input);
    this.doc.body.appendChild(label);
    this.label = label;
  }
  /** Must be called synchronously inside a user-gesture handler. */
  tap(): void {
    if (!this.enabled) return;
    try {
      const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { vibrate?: (p: number) => boolean }) : null;
      if (nav && typeof nav.vibrate === 'function') nav.vibrate(12);
      else {
        this.ensure();
        this.label?.click();
      }
      this.fired++;
    } catch {
      /* ignore */
    }
  }
}
