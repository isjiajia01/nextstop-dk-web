import { bandPosition, layoutBand, SPAN_MIN, SPAN_S, type Placed } from '../domain/band';
import type { DepView } from '../domain/departure';
import { formatTime } from '../domain/time';
import { esc, icon } from './icons';

const PAD_L = 14; // pole (6) + gap (8)
const PAD_R = 4;
const TICKS = [2, 5, 10, 15, 20];

/** Screen-reader label, e.g. "Linje 5C mod Lufthavnen, om 2 minutter". */
export function depLabel(v: DepView, staleSince?: number): string {
  const base = `Linje ${v.line} mod ${v.dest}`;
  if (v.status === 'cancelled') return `${base}, aflyst`;
  const when = v.m === 0 ? 'nu' : `om ${v.m} ${v.m === 1 ? 'minut' : 'minutter'}`;
  let s = `${base}, ${when}`;
  if (v.status === 'delayed') s += `, forsinket ${v.delay} minutter`;
  if (v.status === 'planned') s += ' ifølge køreplanen';
  if (v.disrupted) s += ', driftsforstyrrelse';
  if (staleSince) s += `, sidst opdateret ${formatTime(staleSince)}`;
  return s;
}

const cls = (v: DepView): string => [
  `cat-${v.cat}`, v.m === 0 && v.status !== 'cancelled' ? 'is-now' : '', v.status !== 'rt' ? `is-${v.status}` : '',
].join(' ');

function chipInner(v: DepView): string {
  const min = v.status === 'cancelled' ? 'Aflyst' : v.m === 0 ? 'Nu' : String(v.m);
  const warn = v.disrupted ? `<span class="bchip-warn" aria-hidden="true">${icon('exclamationmark.triangle.fill')}</span>` : '';
  return `<span class="bchip-num">${esc(v.line)}</span><span class="bchip-min">${min}</span>${warn}`;
}

function axisHtml(W: number, axisH: number): string {
  const X = (m: number) => PAD_L + bandPosition(m * 60, W - PAD_L - PAD_R);
  let h = `<div class="band-axis" style="left:${PAD_L}px;width:${W - PAD_L - PAD_R}px;bottom:${axisH - 2}px"></div>`;
  for (let m = 1; m <= SPAN_MIN; m++) {
    const major = TICKS.includes(m);
    h += `<span class="band-tick ${major ? 'major' : ''}" style="left:${X(m) - 0.75}px;bottom:${axisH - (major ? 7 : 5)}px"></span>`;
    if (major && m !== 15) {
      const right = m === SPAN_MIN;
      const style = right ? `right:${PAD_R}px` : `left:${X(m)}px;transform:translateX(-50%)`;
      h += `<span class="band-tlabel" style="${style}">${right ? '20 min' : m}</span>`;
    }
  }
  return h + '<span class="band-tlabel band-nu" style="left:-1px">Nu</span>';
}

export function skeletonHtml(): string {
  const axisH = 24;
  return `<div class="band is-loading" aria-busy="true" aria-label="Henter afgange">
    <div class="band-head"><span class="band-status"><span class="band-dot"></span>Henter afgange …</span><span></span></div>
    <div class="band-field" style="height:${axisH + 2 * 40 + 8}px"><div class="band-pole"></div>
      <span class="bskel" style="left:${PAD_L + 10}px;bottom:${axisH + 10}px;width:58px"></span>
      <span class="bskel" style="left:${PAD_L + 90}px;bottom:${axisH + 50}px;width:66px"></span>
      <span class="bskel" style="left:${PAD_L + 150}px;bottom:${axisH + 10}px;width:54px"></span>
      <span class="bskel" style="left:${PAD_L + 240}px;bottom:${axisH + 10}px;width:62px"></span>
      ${axisHtml(329, axisH)}</div></div>`;
}

export interface BandOptions {
  stale: boolean;
  /** When the data was fetched (stale header shows it). */
  fetchedAt: number;
  now: number;
  source: 'demo' | 'live';
  textScale: number;
  reduceMotion: boolean;
  old?: Map<string, DOMRect>;
  onTap(v: DepView): void;
}

export function renderBand(el: HTMLElement, views: DepView[], later: number, o: BandOptions): void {
  const W = Math.max(el.clientWidth || 0, 240) - 24;
  const axisH = Math.round(24 * Math.min(Math.max(o.textScale, 1), 1.2));
  const inBand = views.filter((v) => v.posSeconds <= SPAN_S);

  // measure real chip widths so lanes pack on actual sizes
  const meas = document.createElement('div');
  meas.className = 'band-measure';
  meas.innerHTML = inBand.map((v) => `<span class="bchip ${cls(v)} ${o.stale ? 'is-stale' : ''}">${chipInner(v)}</span>`).join('');
  el.appendChild(meas);
  const kids = [...meas.children] as HTMLElement[];
  const widths = kids.map((c) => c.getBoundingClientRect().width || 60);
  const chipH = kids[0]?.getBoundingClientRect().height || 32;
  meas.remove();
  const laneH = chipH + 8;

  const layout = layoutBand(inBand.map((v, i) => ({ id: v.key, seconds: v.posSeconds, width: widths[i] ?? 60 })), PAD_L, W - PAD_R);
  const byKey = new Map(inBand.map((v) => [v.key, v]));
  const used = Math.max(1, ...layout.placed.map((p) => p.lane + 1));
  const fieldH = axisH + (layout.placed.length ? used : 1.3) * laneH + 6;

  const hhmm = formatTime(o.stale ? o.fetchedAt : o.now);
  const status = o.stale
    ? `<span class="band-status is-stale">${icon('wifi.slash')}Offline · tider fra ${hhmm}</span>`
    : `<span class="band-status"><span class="band-dot"></span>${o.source === 'demo' ? 'Demodata' : 'Realtid'} · ${hhmm}</span>`;
  const more = layout.overflow.length + later;
  const right = more ? `<span class="band-more">+${more} senere i listen</span>` : '<span class="band-more">Næste 20 min</span>';

  const bottomOf = (p: Placed) => axisH + 8 + p.lane * laneH;
  let field = '<div class="band-pole"></div>';
  for (const p of layout.placed) {
    const v = byKey.get(p.id) as DepView;
    const stemX = p.flip ? p.left + p.width - 1 : p.left;
    field += `<span class="band-stem" style="left:${stemX}px;bottom:${axisH - 2}px;height:${bottomOf(p) - axisH + 4}px"></span>`;
    if (v.status === 'delayed') {
      const px = PAD_L + bandPosition(v.plannedSeconds, W - PAD_L - PAD_R);
      field += `<span class="band-delaybar" style="left:${px}px;width:${Math.max(0, p.x - px)}px;bottom:${axisH - 3.5}px"></span>`;
      field += `<span class="band-ghost" style="left:${px - 5}px;bottom:${axisH - 7}px" title="Planlagt"></span>`;
    }
    field += `<span class="band-pin cat-${v.cat}" style="left:${p.x - 5}px;bottom:${axisH - 7}px"></span>`;
  }
  if (!layout.placed.length) {
    const nx = views.filter((v) => v.status !== 'cancelled')[0];
    field += `<span class="band-empty">Ingen afgange de næste 20 min${nx ? `<br><b>Næste: ${esc(nx.line)} om ${nx.m} min</b>` : ''}</span>`;
  }
  field += axisHtml(W, axisH);
  for (const p of layout.placed) {
    const v = byKey.get(p.id) as DepView;
    field += `<button class="bchip ${cls(v)} ${p.flip ? 'flip' : ''}" data-key="${esc(v.key)}" data-fk="band:${esc(v.key)}"
      style="left:${p.left}px;bottom:${bottomOf(p)}px" aria-label="${esc(depLabel(v, o.stale ? o.fetchedAt : undefined))}">${chipInner(v)}</button>`;
  }

  el.innerHTML = `<div class="band ${o.stale ? 'is-stale' : ''}" role="group" aria-label="Afgange de næste 20 minutter">
    <div class="band-head">${status}${right}</div><div class="band-field" style="height:${fieldH}px">${field}</div></div>`;

  if (o.old && o.old.size && !o.reduceMotion) {
    el.querySelectorAll<HTMLElement>('.bchip').forEach((c) => {
      const r0 = o.old?.get(c.dataset.key ?? '');
      if (!r0) return;
      const r1 = c.getBoundingClientRect();
      const dx = r0.left - r1.left;
      const dy = r0.top - r1.top;
      if (!dx && !dy) return;
      c.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
  }
  el.querySelectorAll<HTMLElement>('.bchip').forEach((c) => {
    c.addEventListener('click', () => { const v = byKey.get(c.dataset.key ?? ''); if (v) o.onTap(v); });
  });
  el.querySelector('.band')?.classList.toggle('has-now', views.some((v) => v.m === 0 && v.status !== 'cancelled' && v.posSeconds <= SPAN_S));
}
