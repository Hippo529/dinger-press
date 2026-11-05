// Settings screen: Play, Comfort, Sound, Save. Persisted immediately via host.settingsChanged().
import type { Aggression } from '../sim/types';
import { btn, el, field, seg, slider, toggle } from './dom';
import type { UiHost } from './menus';

export function settingsScreen(host: UiHost, screen: (cls: string, ...c: (Node | null)[]) => HTMLElement): HTMLElement {
  const st = host.save.data.settings;
  const ch = () => host.settingsChanged();
  const code = el('textarea', { 'aria-label': 'Save code', placeholder: 'Paste a save code here' });
  const status = el('p', { class: 'note' });
  return screen('dim',
    el('h2', {}, 'Settings'),
    el('div', { class: 'col' },
      el('div', { class: 'panel' },
        el('h3', {}, 'PLAY'),
        field('HEAT', slider(0, 99, st.heat, (v) => { st.heat = v; ch(); }, 'set-heat')),
        field('Baserunning', seg<Aggression>([{ v: 'conservative', label: 'SAFE' }, { v: 'aggressive', label: 'BOLD' }], st.aggression, (v) => { st.aggression = v; ch(); }, 'set-aggr')),
        field('Pitch assist (tap)', toggle(st.assistPitch, (v) => { st.assistPitch = v; ch(); }, 'set-assist')),
        field('Pitch locator', toggle(st.showLocator, (v) => { st.showLocator = v; ch(); }, 'set-locator')),
        field('Expert: hide locator (×1.25)', toggle(st.hideLocatorExpert, (v) => { st.hideLocatorExpert = v; ch(); }, 'set-hide')),
        field('Timing ms readout', toggle(st.showTimingMs, (v) => { st.showTimingMs = v; ch(); }, 'set-ms')),
        field('Left-handed controls', toggle(st.lefty, (v) => { st.lefty = v; ch(); }, 'set-lefty')),
      ),
      el('div', { class: 'panel' },
        el('h3', {}, 'COMFORT'),
        field('Reduce motion', seg<string>([{ v: 'auto', label: 'AUTO' }, { v: 'on', label: 'ON' }, { v: 'off', label: 'OFF' }], st.reduceMotion === null ? 'auto' : st.reduceMotion ? 'on' : 'off', (v) => { st.reduceMotion = v === 'auto' ? null : v === 'on'; ch(); }, 'set-rm')),
        field('Screen shake', seg<number>([{ v: 0, label: '0%' }, { v: 50, label: '50%' }, { v: 100, label: '100%' }], st.shakePct, (v) => { st.shakePct = v as 0 | 50 | 100; ch(); }, 'set-shake')),
        field('Flashes', toggle(st.flashes, (v) => { st.flashes = v; ch(); }, 'set-flash')),
        field('Slow-mo', toggle(st.slowmo, (v) => { st.slowmo = v; ch(); }, 'set-slowmo')),
      ),
      el('div', { class: 'panel' },
        el('h3', {}, 'SOUND'),
        field('Mute (M)', toggle(st.muted, (v) => { st.muted = v; ch(); }, 'set-mute')),
        field('Volume', slider(0, 100, Math.round(st.volume * 100), (v) => { st.volume = v / 100; ch(); }, 'set-vol', 'Volume')),
        field('Play sound in silent mode', toggle(st.silentModeAudio, (v) => { st.silentModeAudio = v; ch(); }, 'set-silent')),
        field('Haptics (experimental)', toggle(st.haptics, (v) => { st.haptics = v; ch(); }, 'set-haptics')),
      ),
      el('div', { class: 'panel' },
        el('h3', {}, 'SAVE'),
        el('div', { class: 'row' },
          btn('Copy save code', () => {
            const c = host.save.exportCode();
            code.value = c;
            try {
              void navigator.clipboard?.writeText(c).then(() => (status.textContent = 'Copied.'), () => (status.textContent = 'Select the code above to copy it.'));
            } catch {
              status.textContent = 'Select the code above to copy it.';
            }
          }, 'small teal', true, 'save-copy'),
          btn('Load pasted code', () => {
            status.textContent = host.save.importCode(code.value) ? 'Save loaded.' : 'That code did not work.';
            ch();
          }, 'small', true, 'save-paste'),
          btn('Reset all', () => {
            if (status.dataset.confirm !== '1') {
              status.dataset.confirm = '1';
              status.textContent = 'Tap Reset again to erase everything.';
              return;
            }
            host.save.reset();
            host.save.save();
            status.dataset.confirm = '';
            status.textContent = 'Save reset.';
            ch();
          }, 'small', true, 'save-reset'),
        ),
        code,
        status,
      ),
      btn('Done', () => host.back(), 'primary', false, 'done'),
    ),
  );
}
