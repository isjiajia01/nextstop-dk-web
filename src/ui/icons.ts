/** Stand-ins for SF Symbols (prototype icons). Decorative: always aria-hidden. */
const s = (body: string, vb = '0 0 24 24'): string =>
  `<svg viewBox="${vb}" aria-hidden="true" focusable="false" class="ico">${body}</svg>`;

const ICONS: Record<string, string> = {
    'bus.fill': s('<path fill="currentColor" d="M6 3h12a3 3 0 0 1 3 3v10a2 2 0 0 1-1 1.7V20a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1.5h-9V20a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2.3A2 2 0 0 1 3 16V6a3 3 0 0 1 3-3Zm0 3.2V11h12V6.2H6Zm1.3 7.3a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Zm9.4 0a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Z"/>'),
    'magnifyingglass': s('<circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="m15.5 15.5 5 5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>'),
    'location.fill': s('<path fill="currentColor" d="M20.6 3.4 3.9 10.6c-.8.4-.7 1.6.2 1.8l6.6 1.2 1.2 6.6c.2.9 1.4 1 1.8.2L20.6 3.4Z"/>'),
    'location.slash': s('<path fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M19.5 4.5 4.6 10.9l6.2 1.3 1.3 6.2 6.4-13.9Z"/><path d="M3 3l18 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
    'chevron.right': s('<path d="m9 5 7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'),
    'chevron.left': s('<path d="m15 5-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'),
    'chevron.down': s('<path d="m5 9 7 7 7-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'),
    'xmark.circle.fill': s('<circle cx="12" cy="12" r="10" fill="currentColor"/><path d="m8.5 8.5 7 7m0-7-7 7" stroke="var(--c-neutral)" stroke-width="2" stroke-linecap="round"/>'),
    'exclamationmark.triangle.fill': s('<path fill="currentColor" d="M10.3 3.6a2 2 0 0 1 3.4 0l8.2 14.3A2 2 0 0 1 20.2 21H3.8a2 2 0 0 1-1.7-3.1l8.2-14.3Z"/><path d="M12 9v5" stroke="var(--tri-mark, #fff)" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17.3" r="1.3" fill="var(--tri-mark, #fff)"/>'),
    'wifi.slash': s('<path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.3a9.5 9.5 0 0 1 13 0M8.6 15.5a5 5 0 0 1 6.8 0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="19" r="1.6" fill="currentColor"/><path d="M3 3l18 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
    'icloud.slash': s('<path d="M7 18h10a4 4 0 0 0 .7-7.9A6 6 0 0 0 6.3 9.2 4.5 4.5 0 0 0 7 18Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 3l18 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
    'arrow.clockwise': s('<path d="M19 12a7 7 0 1 1-2.1-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path fill="currentColor" d="M20.5 3.5v6h-6z"/>'),
    'arrow.forward.circle': s('<path d="M5 12h12m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'),
    'dot.radiowaves.right': s('<circle cx="6" cy="12" r="2.6" fill="currentColor"/><path d="M11 7.5a6.5 6.5 0 0 1 0 9M15 4.5a11 11 0 0 1 0 15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
    'clock': s('<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 7v5l3.5 2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
    'gearshape': s('<circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
    'figure.walk': s('<circle cx="13" cy="4" r="2" fill="currentColor"/><path d="m10 21 2.2-6.5 3 2.5V21M8 12l1.5-4.5 4-1 2.5 4 2.5 1.2M12.2 14.5l1.3-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
    'info.circle': s('<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 11v6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><circle cx="12" cy="7.6" r="1.4" fill="currentColor"/>'),
    'mappin.slash': s('<path d="M12 21s-6-5.6-6-11a6 6 0 0 1 10.6-3.9M18 10c0 2.3-1.1 4.6-2.5 6.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M3 3l18 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
    'clock.arrow.circlepath': s('<path d="M4 12a8 8 0 1 0 2.3-5.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path fill="currentColor" d="M3 3.5v5.5h5.5z"/><path d="M12 8v4.5l3 1.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'),
    'xmark': s('<path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'),
    'tram.fill.tunnel': s('<path fill="currentColor" d="M7 4h10a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3l1.5 2.5h-2L14 18h-4l-1.5 2.5h-2L8 18a3 3 0 0 1-3-3V6a2 2 0 0 1 2-2Zm0 3v4h10V7H7Zm1.5 6.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Zm7 0a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z"/>'),
    'train.side.front.car': s('<path fill="currentColor" d="M3 7h13l4.5 5v4a1 1 0 0 1-1 1H3V7Zm2 2v3h4V9H5Zm6 0v3h4V9h-4Zm6 .4V12h2.3L17 9.4ZM6 18.5a1.5 1.5 0 1 0 0 .01Zm10 0a1.5 1.5 0 1 0 0 .01Z"/>'),
};

export type IconName = keyof typeof ICONS;

export function icon(name: string, cls = ''): string {
  const svg = ICONS[name] ?? '';
  return cls ? svg.replace('class="ico"', `class="ico ${cls}"`) : svg;
}

export const esc = (v: unknown): string =>
  String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
