import { SPAN_S } from '../domain/band';
import { buildViews, effectiveTime, type DepView } from '../domain/departure';
import { formatDistance, foldLoose, lineCategory } from '../domain/line';
import { formatTime, formatTimeSeconds } from '../domain/time';
import { FixtureRepository, type DemoMode } from '../data/fixtureRepository';
import { journeyRouteCoordinates, loadRouteShape, type RouteShapeCollection } from '../data/routeShape';
import { bearingAtDistance, cumulativeLengths, journeyProgress, pointAtDistance } from '../domain/routeGeometry';
import { HttpRepository } from '../data/httpRepository';
import { FALLBACK_CENTER, RECENT_IDS, USER_LOCATION, FAR_LOCATION } from '../data/fixtures';
import type { Board, Journey, LatLng, ServiceAlert, StopWithDistance, TransitRepository } from '../data/types';
import { depLabel, renderBand, skeletonHtml } from './bandView';
import { esc, icon } from './icons';
import { createMap, type MapApi, type MapView } from './map';

type Scene = 'main' | 'journey' | 'search' | 'denied' | 'nostops' | 'loading';
type Detent = 'peek' | 'half' | 'full';
type Scenario = 'normal' | 'now' | 'issues' | 'denied' | 'nostops' | 'loading';
type Net = 'ok' | 'offline' | 'error';

interface State {
  scene: Scene; detent: Detent; stopId: string; scenario: Scenario; net: Net; disruption: boolean;
  theme: 'system' | 'light' | 'dark'; palette: 'standard' | 'fjord'; text: number; rm: boolean; q: string; jId: string | null;
  showEarlier: boolean; discOpen: boolean; fullRoute: boolean;
}

const S: State = {
  scene: 'loading', detent: 'peek', stopId: 'nv', scenario: 'normal', net: 'ok', disruption: false,
  theme: 'system', palette: 'standard', text: 1, rm: false, q: '', jId: null, showEarlier: false, discOpen: false, fullRoute: false,
};

const $ = <T extends HTMLElement = HTMLElement>(sel: string): T => document.querySelector(sel) as T;
const repo = new FixtureRepository(350);
/** Live data when a backend URL is given: `?api=https://host` or build-time VITE_API_BASE. Otherwise the synthetic demo. */
const apiBase = new URLSearchParams(location.search).get('api') ?? (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
const api: TransitRepository = apiBase ? new HttpRepository(apiBase) : repo; // the UI only knows the interface

let board: Board | null = null;
let boardFailed = false;
let alerts: ServiceAlert[] = [];
let nearby: StopWithDistance[] = [];
let nearest: StopWithDistance | null = null;
let origin: LatLng = USER_LOCATION;
let journey: Journey | null = null;
let journeyDep: DepView | null = null;
let map: MapApi | null = null;
let routeShape: RouteShapeCollection | null = null;
let gen = 0;
let prevDetent: Detent = 'peek';
let lastFk = '';
let sig = '';

const isDesktop = () => matchMedia('(min-width: 768px)').matches;
const isWide = () => matchMedia('(min-width: 1280px)').matches;
/** The scene the left panel shows: on wide screens a journey lives in its own card and the panel stays on Main. */
const panelScene = (): Scene => (S.scene === 'journey' && isWide() ? 'main' : S.scene);
const sysDark = () => matchMedia('(prefers-color-scheme: dark)').matches;
const dark = () => (S.theme === 'system' ? sysDark() : S.theme === 'dark');
const reduceMotion = () => S.rm || matchMedia('(prefers-reduced-motion: reduce)').matches;
const stale = () => boardFailed;
const nowMs = () => Date.now();

// ---------- hash (deep links) ----------
const HK = ['scenario', 'net', 'disruption', 'theme', 'palette', 'text', 'rm', 'detent', 'scene', 'stop', 'q'] as const;
function readHash(): void {
  const p = new URLSearchParams(location.hash.slice(1));
  const g = (k: string) => p.get(k);
  const sc = g('scenario'); if (sc && ['normal', 'now', 'issues', 'denied', 'nostops', 'loading'].includes(sc)) S.scenario = sc as Scenario;
  const nt = g('net'); if (nt === 'offline' || nt === 'error') S.net = nt;
  S.disruption = g('disruption') === 'true';
  const th = g('theme'); if (th === 'light' || th === 'dark') S.theme = th;
  S.palette = g('palette') === 'fjord' ? 'fjord' : 'standard';
  const tx = Number(g('text')); if (tx === 1.35 || tx === 1.65) S.text = tx;
  S.rm = g('rm') === 'true';
  const dt = g('detent'); if (dt === 'peek' || dt === 'half' || dt === 'full') S.detent = dt; else if (isDesktop()) S.detent = 'half';
  const st = g('stop'); if (st) S.stopId = st;
  S.q = g('q') ?? '';
  const sc2 = g('scene'); if (sc2 === 'search') S.scene = 'search';
}
function writeHash(): void {
  const p = new URLSearchParams();
  const v: Record<(typeof HK)[number], string> = {
    scenario: S.scenario, net: S.net, disruption: String(S.disruption), theme: S.theme, palette: S.palette, text: String(S.text), rm: String(S.rm),
    detent: S.detent, scene: S.scene === 'search' ? 'search' : 'main', stop: S.stopId, q: S.q,
  };
  for (const k of HK) if (v[k] && v[k] !== 'system') p.set(k, v[k]);
  history.replaceState(null, '', `#${p.toString()}`);
}

// ---------- appearance ----------
function applyAppearance(): void {
  const root = document.documentElement;
  root.dataset.theme = dark() ? 'dark' : 'light';
  root.dataset.palette = S.palette;
  root.style.setProperty('--dt', String(S.text));
  root.classList.toggle('rm', S.rm);
  $('#app').classList.toggle('is-ax', S.text >= 1.65);
  $('#app').classList.toggle('is-lg', S.text >= 1.35);
  map?.setTheme(dark());
}

// ---------- data ----------
const repoMode = (): DemoMode => (S.net !== 'ok' ? S.net : S.scenario === 'now' || S.scenario === 'issues' ? S.scenario : 'normal');
const currentStop = (): StopWithDistance | null =>
  nearby.find((s) => s.id === S.stopId) ?? (board && board.stop.id === S.stopId ? { ...board.stop, distance: 0 } : null);

async function loadBoard(silent = false): Promise<void> {
  const my = ++gen;
  const id = S.stopId;
  try {
    const b = await api.board(id, nowMs());
    const al = await api.alerts(id);
    if (my !== gen) return;
    board = b; alerts = al; boardFailed = false;
    if (S.scene === 'journey' && S.jId) await refreshJourney();
  } catch {
    if (my !== gen) return;
    boardFailed = true;
    if (board && board.stop.id !== id) board = null;
  }
  if (!silent) announce(stale() ? 'Ingen friske afgangsdata, viser sidste kendte tider' : '');
  render();
}

async function refreshJourney(): Promise<void> {
  if (!S.jId) return;
  try { journey = await api.journey(S.jId, S.stopId, nowMs()); } catch { /* keep the last journey */ }
}

/** Live mode only: the browser position, or 'denied'. Asked once per page load. */
let located: LatLng | 'denied' | undefined;
const live = !!apiBase;
const home = (): LatLng => (located && located !== 'denied' ? located : USER_LOCATION);
function locate(): Promise<LatLng | 'denied'> {
  if (!navigator.geolocation) return Promise.resolve('denied');
  return new Promise((resolve) => navigator.geolocation.getCurrentPosition(
    (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
    () => resolve('denied'),
    { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
  ));
}

async function boot(): Promise<void> {
  repo.reseed(nowMs());
  nearby = []; nearest = null; board = null; journey = null; boardFailed = false;
  if (S.scenario === 'loading') { S.scene = 'loading'; render(); syncMap(true); return; }
  if (live && S.scenario === 'normal') {
    if (!located) { S.scene = 'loading'; render(); located = await locate(); }
    if (located === 'denied') S.scenario = 'denied';
  }
  if (S.scenario === 'denied') {
    origin = FALLBACK_CENTER; S.scene = 'denied'; if (S.detent === 'peek') S.detent = 'half';
    render(); syncMap(true); return;
  }
  if (S.scenario === 'nostops') {
    origin = FAR_LOCATION; S.scene = 'nostops'; S.detent = 'half';
    nearest = await api.nearestStop(origin);
    render(); syncMap(true); return;
  }
  origin = home();
  if (S.scene !== 'search') S.scene = 'loading';
  render();
  nearby = await api.nearbyStops(origin, 1000);
  if (live && nearby.length === 0) {
    S.scene = 'nostops'; S.detent = 'half'; nearest = await api.nearestStop(origin);
    render(); syncMap(true); return;
  }
  if (!nearby.some((s) => s.id === S.stopId)) S.stopId = nearby[0]?.id ?? 'nv';
  repo.mode = S.net !== 'ok' ? (S.scenario === 'issues' ? 'issues' : 'normal') : repoMode(); // seed one good board first
  await loadBoard(true);
  if (S.net !== 'ok') { repo.mode = repoMode(); await loadBoard(true); }
  if (S.scene === 'loading') S.scene = 'main';
  render(); syncMap(true);
}

async function selectStop(id: string, detent: Detent = 'peek'): Promise<void> {
  S.stopId = id; S.scene = 'main'; S.detent = detent; S.q = ''; S.jId = null; journey = null;
  if (board && board.stop.id !== id) board = null;
  if (!nearby.some((s) => s.id === id)) {
    const s = await api.stopById(id, origin);
    if (s) nearby = nearby; // remote stops are shown through the board only
  }
  render(); syncMap(true);
  announce(`Valgt stoppested ${currentStop()?.name ?? ''}`);
  await loadBoard(true);
  announce(`${currentStop()?.name ?? ''}: ${views().length} linjer`);
  syncMap(false);
}

const disruptedLines = () => (S.disruption ? alerts.flatMap((a) => a.lines) : []);
const views = (): DepView[] => (board ? buildViews(board.departures, nowMs(), disruptedLines()) : []);

// ---------- rendering helpers ----------
const lchip = (line: string, cls = ''): string => `<span class="lchip cat-${lineCategory(line)} ${cls}">${esc(line)}</span>`;
const dist = (m: number): string => formatDistance(m);

function depRow(v: DepView): string {
  const t = formatTime(effectiveTime(v.dep));
  const tp = formatTime(v.dep.scheduled);
  const next = v.next.slice(0, 2);
  const nextTxt = next.length ? `<span class="r-next t-body-sm">${next.join(', ')} min</span>` : '';
  const mins = v.m === 0 ? '<span class="pill now">Nu</span>' : `<span class="t-minutes">${v.m}<small>min</small></span>`;
  let sub = ''; let end = '';
  if (v.status === 'cancelled') {
    sub = `<span class="cancel">Aflyst</span><span>· planlagt ${tp}</span>`;
    end = `<span class="pill cancel">Aflyst</span>${next.length ? `<span class="r-next t-body-sm">næste ${next[0]} min</span>` : ''}`;
  } else if (v.status === 'delayed') {
    sub = `<span class="delay">+${v.delay} min</span><span>· <s>${tp}</s> ${t}</span>`;
    end = `<span class="t-minutes delay">${v.m}<small>min</small></span>${nextTxt}`;
  } else if (v.status === 'planned') {
    sub = `${icon('clock')}<span>Køreplan ${tp} · ingen realtid</span>`;
    end = `${mins}${nextTxt}`;
  } else {
    sub = stale()
      ? `${icon('clock.arrow.circlepath')}<span>ca. ${t} · ${esc(v.via)}</span>`
      : `<span class="live">${icon('dot.radiowaves.right')}</span><span>${t}${v.via ? ` · ${esc(v.via)}` : ''}</span>`;
    end = `${mins}${nextTxt}`;
  }
  const warn = v.disrupted ? `<span style="color:var(--c-warning-icon);--tri-mark:var(--c-surface)">${icon('exclamationmark.triangle.fill')}</span>` : '';
  const cur = isWide() && S.scene === 'journey' && S.jId === v.dep.journeyId;
  return `<button class="row ${v.status === 'cancelled' ? 'is-cancelled' : ''} ${cur ? 'is-source' : ''}" ${cur ? 'aria-current="true"' : ''} data-dep="${esc(v.dep.journeyId)}" data-fk="row:${esc(v.key)}"
    aria-label="${esc(depLabel(v, stale() ? board?.fetchedAt : undefined))}">${lchip(v.line)}
    <span class="r-main"><span class="r-title t-body-strong">${warn} ${esc(v.dest)}</span><span class="r-sub t-body-sm">${sub}</span></span>
    <span class="r-end">${end}</span></button>`;
}

function header(): string {
  const st = currentStop();
  const idx = nearby.findIndex((s) => s.id === S.stopId);
  const cycle = idx >= 0 && nearby.length > 1
    ? `<button class="cycle" data-act="cycle" aria-label="Næste stoppested i nærheden, ${idx + 1} af ${nearby.length}">${idx + 1}/${nearby.length}${icon('chevron.right')}</button>`
    : `<button class="cycle" data-act="nearby" aria-label="Tilbage til stoppesteder i nærheden">${icon('location.fill')}</button>`;
  return `<div class="s-head" data-drag>
    <div class="titles"><h2 class="t-stop-title">${esc(st?.name ?? '')}</h2>
    <div class="meta t-stop-meta"><span>${esc(st?.road ?? '')}</span>${st && st.distance ? `<span class="sep"></span><span>${dist(st.distance)}</span>` : ''}</div></div>
    <div class="actions"><button class="ibtn" data-act="search" data-fk="search" aria-label="Søg efter stoppested">${icon('magnifyingglass')}</button>${cycle}<button class="ibtn only-desk" data-act="toggle" aria-expanded="${S.detent !== 'peek'}" aria-controls="sheetBody" aria-label="${S.detent === 'peek' ? 'Vis alle afgange' : 'Skjul afgangslisten'}"><span style="display:inline-block;${S.detent === 'peek' ? 'transform:rotate(180deg)' : ''}">${icon('chevron.down')}</span></button></div></div>`;
}

function banners(): string {
  let h = '';
  if (stale()) {
    const off = S.net === 'offline';
    h += `<div class="banner offline" role="status"><span class="b-ico">${icon(off ? 'wifi.slash' : 'icloud.slash')}</span>
      <span class="b-txt"><b class="b-title t-label-md">${off ? 'Ingen forbindelse' : 'Rejseplanen svarer ikke'}</b>
      <span class="b-sub t-body-sm">Viser afgange fra ${formatTime(board?.fetchedAt ?? nowMs())}. Tiderne kan have ændret sig.</span></span>
      <button class="b-action" data-act="retry">${icon('arrow.clockwise')}Prøv igen</button></div>`;
  }
  const a = S.disruption ? alerts[0] : undefined;
  if (a) {
    h += `<button class="banner disruption ${S.discOpen ? '' : 'is-collapsed'}" data-act="disc" aria-expanded="${S.discOpen}">
      <span class="b-ico">${icon('exclamationmark.triangle.fill')}</span><span class="b-txt"><b class="b-title t-label-md">${esc(a.title)}</b>
      <span class="b-sub t-body-sm">${esc(a.short)}</span><span class="b-body b-sub t-body-sm">${esc(a.body)}<br><span class="c-2">${esc(a.source)}</span></span></span>
      <span class="b-chev">${icon(S.discOpen ? 'chevron.down' : 'chevron.right')}</span></button>`;
  }
  return h;
}

function sceneMain(): string {
  if (!board) {
    if (boardFailed) {
      return `${header()}<div class="empty"><div class="e-ico">${icon('icloud.slash')}</div><h2 class="t-headline">Kunne ikke hente afgange</h2>
        <p class="t-body">Der er ingen gemte afgange for dette stop endnu. Tjek forbindelsen og prøv igen.</p>
        <button class="btn primary t-body-strong" data-act="retry">${icon('arrow.clockwise')}Prøv igen</button><div class="peek-end"></div></div>`;
    }
    return sceneLoading();
  }
  const all = views().filter((v) => v.posSeconds <= 3600);
  const ax = S.text >= 1.65;
  let h = header() + banners();
  h += ax ? `<div class="rows" aria-label="Næste afgange">${all.slice(0, 3).map(depRow).join('')}</div>` : '<div class="band-host" id="bandHost"></div>';
  h += '<div class="peek-end"></div>';
  h += '<div class="sec-h"><h3 class="t-label-md" style="margin:0">Afgange</h3><span class="t-body-sm">Næste 60 min</span></div>';
  h += `<div class="rows">${all.slice(ax ? 3 : 0).map(depRow).join('') || '<p class="t-body c-2">Ingen afgange den næste time.</p>'}</div>`;
  if (nearby.length && nearby.some((s) => s.id === S.stopId)) {
    h += `<div class="sec-h"><h3 class="t-label-md" style="margin:0">I nærheden</h3><span class="t-body-sm">${nearby.length} stop inden for 1000&nbsp;m</span></div><div class="rows">`;
    for (const o of nearby) h += stopRow(o, `data-stop="${esc(o.id)}"`, esc(o.name), o.id === S.stopId);
    h += '</div>';
  }
  const demo = api.source === 'demo';
  h += `<p class="footer-note t-body-sm">${demo ? '<span class="demo-tag">DEMO</span> Syntetiske afgange, ikke fra Rejseplanen.' : 'Afgangsdata: Rejseplanen.'} Stop-ID ${esc(S.stopId)}<br>${
    stale() ? `Sidst opdateret ${formatTime(board.fetchedAt)}` : `Opdateret ${formatTimeSeconds(board.fetchedAt)}`}</p>`;
  return h;
}

function stopRow(o: StopWithDistance, attrs: string, name: string, current = false): string {
  return `<button class="row ${current ? 'is-current' : ''}" ${attrs} ${current ? 'aria-current="true"' : ''} data-fk="stop:${esc(o.id)}">
    <span class="stander-ico">${icon('bus.fill')}</span><span class="r-main"><span class="r-title t-body-strong">${name}</span>
    <span class="r-sub t-body-sm">${esc(o.road)} · ${dist(o.distance)}</span><span class="chips">${o.lines.map((l) => lchip(l, 'sm')).join('')}</span></span>
    <span class="r-chev">${icon('chevron.right')}</span></button>`;
}

function sceneLoading(): string {
  return `<div class="s-head"><div class="titles"><span class="skel" style="width:180px;height:26px;margin:2px 0 8px"></span><span class="skel" style="width:120px;height:16px"></span></div></div>
    <div class="band-host" id="bandHost">${skeletonHtml()}</div><div class="peek-end"></div>
    <p class="t-body-sm c-2" role="status" style="text-align:center;margin-top:16px">Finder stoppesteder i nærheden …</p>
    <p class="footer-note t-body-sm"><span class="demo-tag">DEMO</span> Indlæsningstilstand i demoen.</p>`;
}

function sceneDenied(): string {
  return `<div class="empty"><div class="e-ico">${icon('location.slash')}</div><h2 class="t-headline">Vi kan ikke se, hvor du er</h2>
    <p class="t-body">Giv adgang til din placering for at se stoppesteder og afgange i nærheden. Du kan også søge efter et stoppested.</p>
    <button class="btn primary t-body-strong" data-act="settings">${icon('gearshape')}Åbn indstillinger</button>
    <button class="btn secondary t-body-strong" data-act="search" data-fk="search">${icon('magnifyingglass')}Søg efter stoppested</button><div class="peek-end"></div></div>`;
}

function sceneNoStops(): string {
  const n = nearest;
  return `<div class="empty"><div class="e-ico">${icon('mappin.slash')}</div><h2 class="t-headline">Ingen stoppesteder inden for 1000&nbsp;m</h2>
    <p class="t-body">${n ? `Det nærmeste stoppested er ${esc(n.name)} (${esc(n.road)}), ${dist(n.distance).replace('\u00a0', '&nbsp;')} væk.` : 'Prøv at søge efter et stoppested.'}</p>
    ${n ? `<button class="btn primary t-body-strong" data-act="nearest">${icon('figure.walk')}Vis nærmeste stop · ${dist(n.distance)}</button>` : ''}
    <button class="btn secondary t-body-strong" data-act="search" data-fk="search">${icon('magnifyingglass')}Søg efter stoppested</button><div class="peek-end"></div></div>`;
}

function sceneSearch(): string {
  return `<div class="search-bar"><label class="field">${icon('magnifyingglass')}<span class="vh">Søg stoppested</span>
    <input id="q" type="search" placeholder="Søg stoppested eller vej" value="${esc(S.q)}" autocomplete="off" enterkeyhint="search">
    <button class="clear" data-act="clearq" aria-label="Ryd søgning" ${S.q ? '' : 'hidden'}>${icon('xmark.circle.fill')}</button></label>
    <button class="textbtn" data-act="cancelsearch">Annuller</button></div><div id="results"></div><div style="height:120px"></div>`;
}

let searchGen = 0;
async function renderResults(): Promise<void> {
  const my = ++searchGen;
  const q = S.q.trim();
  let html = '';
  if (!q) {
    const recent = (await Promise.all(RECENT_IDS.map((id) => api.stopById(id, origin)))).filter((x): x is StopWithDistance => !!x);
    const near = await api.nearbyStops(origin, 1000);
    html = `<div class="sec-h"><h3 class="t-label-md" style="margin:0">Seneste</h3></div><div class="rows">${recent.map((s) => stopRow(s, `data-pick="${esc(s.id)}"`, esc(s.name))).join('')}</div>
      <div class="sec-h"><h3 class="t-label-md" style="margin:0">I nærheden</h3></div><div class="rows">${near.slice(0, 4).map((s) => stopRow(s, `data-pick="${esc(s.id)}"`, esc(s.name))).join('')}</div>`;
  } else {
    const res = await api.searchStops(q, origin);
    const fq = foldLoose(q);
    const hl = (name: string): string => {
      const i = foldLoose(name).indexOf(fq);
      return i < 0 || foldLoose(name).length !== name.length ? esc(name) : `${esc(name.slice(0, i))}<mark>${esc(name.slice(i, i + q.length))}</mark>${esc(name.slice(i + q.length))}`;
    };
    html = res.length
      ? `<div class="sec-h"><h3 class="t-label-md" style="margin:0">Stoppesteder</h3><span class="t-body-sm">${res.length} ${res.length === 1 ? 'resultat' : 'resultater'}</span></div><div class="rows results">${res.map((s) => stopRow(s, `data-pick="${esc(s.id)}"`, hl(s.name))).join('')}</div>`
      : `<div class="empty" style="margin-top:24px" role="status"><div class="e-ico">${icon('magnifyingglass')}</div><h2 class="t-headline">Intet stoppested hedder “${esc(q)}”</h2>
         <p class="t-body">Tjek stavningen, eller søg på vejnavnet. Du kan skrive “oe” for ø og “aa” for å.</p></div>`;
  }
  if (my !== searchGen) return;
  const box = document.getElementById('results');
  if (box) box.innerHTML = html;
}

function sceneJourney(): string {
  const v = journeyDep;
  const j = journey;
  const st = currentStop();
  if (!v || !j) return `<button class="textbtn t-body" data-act="back">${icon('chevron.left')} ${esc(st?.name ?? '')}</button><div class="empty"><h2 class="t-headline">Turen kunne ikke hentes</h2></div>`;
  const now = nowMs();
  const delayed = v.status === 'delayed';
  const eff = (s: Journey['stops'][number]) => s.predicted ?? s.scheduled;
  const passedIdx = j.stops.reduce((acc, s, i) => (eff(s) < now ? i : acc), -1);
  const busIdx = passedIdx >= 0 && passedIdx < j.stops.length - 1 ? passedIdx : -1;
  const first = Math.max(0, passedIdx - 1);
  const start = S.showEarlier ? 0 : first;
  const hidden = start;
  let list = '';
  j.stops.slice(start).forEach((s, k) => {
    const i = start + k;
    const passed = i < passedIdx || (i === passedIdx && i === j.stops.length - 1);
    const cls = [passed ? 'passed' : '', i === busIdx ? 'at' : '', s.mine ? 'mine' : '', k === 0 && !hidden ? 'first' : '', s.last ? 'last' : ''].join(' ');
    const dm = s.predicted !== undefined ? Math.floor((s.predicted - s.scheduled) / 60_000) : 0;
    const time = j.cancelled ? `<s>${formatTime(s.scheduled)}</s>`
      : dm >= 2 && !passed ? `<span class="rt delay">${formatTime(eff(s))}</span><s>${formatTime(s.scheduled)}</s>` : `<span class="rt">${formatTime(eff(s))}</span>`;
    const marker = i === busIdx ? `<span class="j-bus" role="img" aria-label="Bussen er her (demo)">${icon('bus.fill')}</span>` : '<span class="j-dot"></span>';
    list += `<div class="j-stop ${cls}" role="listitem"><span class="j-rail"></span>${marker}
      <span class="j-name t-body">${esc(s.name)}${s.mine ? '<span class="j-tag">Dit stop</span>' : ''}${i === busIdx ? '<span class="c-2 t-body-sm"> · bussen er her</span>' : ''}</span>
      <span class="j-time t-body">${time}</span></div>`;
  });
  const more = hidden ? `<button class="j-more t-body-sm" data-act="earlier"><span class="j-rail"></span>${icon('chevron.down')} Vis ${hidden} tidligere stop</button>` : '';
  const statusTxt = v.status === 'cancelled' ? '<span class="pill cancel">Aflyst</span>'
    : delayed ? `<span style="color:var(--c-delay-text);font-weight:600">Forsinket ${v.delay} min</span>`
      : v.status === 'planned' ? `<span>${icon('clock')} Køreplan, ingen realtid</span>`
        : `<span class="live">${icon('dot.radiowaves.right')}${api.source === 'demo' ? 'Demodata' : 'Realtid'}</span>`;
  const wide = isWide();
  const closeBtn = `<button class="ibtn" data-act="back" aria-label="Luk tur">${icon('xmark')}</button>`;
  const head = wide
    ? `<div class="j-cardhead">${lchip(v.line)}<h2 class="t-stop-title" tabindex="-1">mod ${esc(v.dest)}</h2>${closeBtn}</div>`
    : `<button class="textbtn t-body" data-act="back" style="margin-left:-6px">${icon('chevron.left')} ${esc(st?.name ?? '')}</button>
    <div class="j-head">${lchip(v.line)}<h2 class="t-stop-title" tabindex="-1" style="margin:0">mod ${esc(v.dest)}</h2></div>`;
  return `<div data-drag>${head}
    <div class="j-meta t-stop-meta">${v.status === 'cancelled' ? '' : `<span>${v.m === 0 ? 'Ved stoppestedet nu' : `Om ${v.m} min ved ${esc(st?.name ?? '')}`}</span><span>·</span>`}${statusTxt}</div></div>
    <div class="j-route"><button class="textbtn t-body-sm" data-act="route" aria-pressed="${S.fullRoute}">${S.fullRoute ? 'Vis nærområdet' : 'Vis hele ruten'}</button></div>
    <div class="peek-end"></div>${S.disruption && alerts.some((a) => a.lines.includes(v.line)) ? banners().replace(/<div class="banner offline[\s\S]*?<\/div>/, '') : ''}
    <div class="j-list" role="list" aria-label="Stop på turen" style="--line:var(--color-line-${v.cat})">${more}${list}</div>
    <p class="footer-note t-body-sm"><span class="demo-tag">DEMO</span> Bussens position er syntetisk.</p>`;
}

// ---------- render ----------
function bandOpts(old?: Map<string, DOMRect>) {
  return {
    stale: stale(), fetchedAt: board?.fetchedAt ?? nowMs(), now: nowMs(), source: api.source, textScale: S.text, reduceMotion: reduceMotion(), old,
    onTap: (v: DepView) => { lastFk = `band:${v.key}`; void openJourney(v); },
  };
}

function paintBand(old?: Map<string, DOMRect>): void {
  const host = document.getElementById('bandHost');
  if (!host || !board || panelScene() !== 'main') return;
  const all = views();
  const later = all.filter((v) => v.posSeconds > SPAN_S && v.posSeconds <= 3600).length;
  renderBand(host, all, later, bandOpts(old));
}

function render(): void {
  const body = $('#sheetBody');
  const shown = panelScene();
  const sceneChanged = body.dataset.scene !== shown || body.dataset.stop !== S.stopId;
  const scroll = sceneChanged ? 0 : body.scrollTop;
  const hadFocus = body.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.fk : undefined;
  const scenes: Record<Scene, () => string> = { main: sceneMain, journey: sceneJourney, search: sceneSearch, denied: sceneDenied, nostops: sceneNoStops, loading: sceneLoading };
  const old = new Map<string, DOMRect>();
  body.querySelectorAll<HTMLElement>('.bchip').forEach((c) => old.set(c.dataset.key ?? '', c.getBoundingClientRect()));
  body.innerHTML = scenes[shown]();
  renderDetail();
  body.dataset.scene = shown; body.dataset.stop = S.stopId;
  body.scrollTop = scroll;
  if (shown === 'loading') { const h = document.getElementById('bandHost'); if (h) h.innerHTML = skeletonHtml(); }
  else paintBand(sceneChanged ? undefined : old);
  if (shown === 'search') void renderResults();
  if (S.scene === 'journey' && isWide() && journeyDep) body.querySelector(`.bchip[data-key="${CSS.escape(journeyDep.key)}"]`)?.classList.add('is-source');
  applyDetent();
  renderPanel();
  writeHash();
  sig = signature();
  const target = hadFocus && !sceneChanged ? hadFocus : '';
  if (target) body.querySelector<HTMLElement>(`[data-fk="${CSS.escape(target)}"]`)?.focus({ preventScroll: true });
}

function renderDetail(): void {
  const d = $('#detail');
  const open = S.scene === 'journey' && isWide();
  const was = !d.hidden;
  d.hidden = !open;
  if (!open) { d.innerHTML = ''; return; }
  const scroll = d.scrollTop;
  d.innerHTML = sceneJourney();
  d.scrollTop = was ? scroll : 0;
}

function signature(): string {
  return [S.scene, stale(), board?.fetchedAt, views().map((v) => `${v.key}${v.m}${v.status}`).join()].join('|');
}

function tick(): void {
  if (S.scene === 'journey' || S.scene === 'main') {
    const s = signature();
    if (s !== sig && !document.activeElement?.closest('#sheetBody')) render();
    else if (s !== sig) { const keep = body_hasFocusInput(); if (!keep) render(); }
    else if (panelScene() === 'main' && !document.activeElement?.closest('.band-host') && nowMs() % 10_000 < 1000) paintBand();
  }
}
const body_hasFocusInput = (): boolean => document.activeElement instanceof HTMLInputElement;

let toastT: number | undefined;
function toast(msg: string): void {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = window.setTimeout(() => { t.hidden = true; }, 2200);
}
function announce(msg: string): void { $('#announcer').textContent = msg; }

// ---------- sheet sizing and drag ----------
const H = () => window.innerHeight;
const detentPx = (d: Detent): number => {
  const half = Math.min(520, H() - 140);
  if (d === 'full') return H() - 60;
  if (d === 'half') return half;
  const end = document.querySelector<HTMLElement>('.peek-end');
  if (isDesktop()) return end ? end.offsetTop + 16 : 260;
  return end ? Math.min(Math.max(end.offsetTop + 28, 180), half - 40) : 260;
};
function applyDetent(): void {
  const sh = $('#sheet');
  const px = detentPx(S.detent);
  sh.style.height = isDesktop() ? (S.detent === 'peek' ? `${px}px` : '') : `${px}px`;
  document.documentElement.style.setProperty('--sheet-h', `${isDesktop() ? 0 : px + 8}px`);
  sh.classList.toggle('is-full', S.detent === 'full' && !isDesktop());
  sh.classList.toggle('is-peek', S.detent === 'peek');
  $('#mapControls').style.display = S.detent === 'full' && !isDesktop() ? 'none' : '';
  $('#grabber').setAttribute('aria-label', `Arkhåndtag, ${{ peek: 'lille', half: 'halv', full: 'fuld' }[S.detent]} højde. Pil op og ned ændrer højden.`);
  window.setTimeout(hideLegalIfCovered, 0);
}
function hideLegalIfCovered(): void { $('#mapLegal').style.display = S.detent === 'full' && !isDesktop() ? 'none' : ''; }
const ORDER: Detent[] = ['peek', 'half', 'full'];
function setDetent(d: Detent): void { S.detent = d; applyDetent(); writeHash(); syncMap(false); }

function setupDrag(): void {
  const sh = $('#sheet');
  let y0: number | null = null; let h0 = 0; let t0 = 0; let moved = false; let onGrab = false;
  sh.addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement;
    if (isDesktop() || !t.closest('#grabber, [data-drag]') || t.closest('button:not(#grabber)')) return;
    y0 = e.clientY; h0 = sh.getBoundingClientRect().height; t0 = performance.now(); moved = false; onGrab = !!t.closest('#grabber');
    sh.classList.add('dragging'); sh.setPointerCapture(e.pointerId);
  });
  sh.addEventListener('pointermove', (e) => {
    if (y0 === null) return;
    const dy = e.clientY - y0; if (Math.abs(dy) > 4) moved = true;
    sh.style.height = `${Math.max(120, Math.min(H() - 60, h0 - dy))}px`;
  });
  const end = (e: PointerEvent) => {
    if (y0 === null) return;
    sh.classList.remove('dragging');
    const h = sh.getBoundingClientRect().height; const v = (y0 - e.clientY) / Math.max(1, performance.now() - t0);
    y0 = null;
    if (!moved) { if (onGrab) setDetent(ORDER[(ORDER.indexOf(S.detent) + 1) % 3] as Detent); else applyDetent(); return; }
    let best = ORDER.reduce((a, d) => (Math.abs(detentPx(d) - h) < Math.abs(detentPx(a) - h) ? d : a), 'peek' as Detent);
    if (Math.abs(v) > 0.6) best = ORDER[Math.max(0, Math.min(2, ORDER.indexOf(S.detent) + (v > 0 ? 1 : -1)))] as Detent;
    setDetent(best);
  };
  sh.addEventListener('pointerup', end); sh.addEventListener('pointercancel', end);
  $('#grabber').addEventListener('keydown', (e) => {
    const i = ORDER.indexOf(S.detent);
    if (e.key === 'ArrowUp') { e.preventDefault(); setDetent(ORDER[Math.min(2, i + 1)] as Detent); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setDetent(ORDER[Math.max(0, i - 1)] as Detent); }
  });
}

// ---------- map ----------
function mapPadding() {
  if (isDesktop()) {
    const d = $('#detail');
    const left = 12 + $('#sheet').getBoundingClientRect().width + 12 + 48 + (d.hidden ? 0 : d.getBoundingClientRect().width + 12);
    return { top: 72, right: 72, bottom: 48, left };
  }
  return { top: 80, right: 40, bottom: Math.min(detentPx(S.detent), H() / 2) + 76, left: 40 };
}
function syncMap(refocus: boolean): void {
  if (!map) return;
  const showPins = S.scene === 'main' || S.scene === 'journey' || S.scene === 'search';
  const cur = currentStop();
  const stops = showPins ? (nearby.length ? nearby : cur ? [cur] : []) : [];
  const withCur = cur && !stops.some((s) => s.id === cur.id) ? [...stops, cur] : stops;
  let route: MapView['route'] = null;
  if (S.scene === 'journey' && journey && journeyDep) {
    const color = getComputedStyle(document.documentElement).getPropertyValue(`--color-line-${journeyDep.cat}`).trim() || '#16191C';
    const now = nowMs();
    const pass = journey.stops.reduce((a, s, i) => ((s.predicted ?? s.scheduled) < now ? i : a), -1);
    const { coords, realShape } = journeyRouteCoordinates(routeShape, journey);
    let bus: LatLng | null = pass >= 0 && pass < journey.stops.length - 1 ? journey.stops[pass] ?? null : null;
    let busBearing: number | null = null;
    if (realShape && bus) {
      const lengths = cumulativeLengths(coords);
      const total = lengths[lengths.length - 1] ?? 0;
      const distance = total * journeyProgress(journey.stops, now);
      bus = pointAtDistance(coords, distance);
      busBearing = bearingAtDistance(coords, distance);
    }
    route = { color, coords, stops: journey.stops, bus, busBearing, realShape };
  }
  map.update({
    stops: withCur, selectedId: S.scene === 'search' ? null : S.stopId, showPins, dimOthers: S.scene === 'journey',
    user: S.scene === 'denied' ? null : origin, radius: S.scene === 'nostops' ? origin : null, route, lineColors: {},
  });
  if (!refocus) return;
  if (route) {
    const p = mapPadding();
    const idx = journey ? journey.stops.findIndex((x) => x.mine) : -1;
    const now2 = nowMs();
    const passed = journey ? journey.stops.reduce((a, x, i) => ((x.predicted ?? x.scheduled) < now2 ? i : a), -1) : -1;
    const near = !S.fullRoute && journey && idx >= 0 ? journey.stops.slice(Math.max(0, Math.min(passed, idx) - 1), idx + 2) : route.coords;
    map.fit(near.length > 1 ? near : route.coords, { top: p.top + 96, right: p.right + 96, bottom: p.bottom + 24, left: p.left + (isDesktop() ? 0 : 0) });
  }
  else if (cur && showPins) map.focus(cur, mapPadding(), 15.5);
  else map.focus(origin, mapPadding(), S.scene === 'nostops' ? 13.5 : 14.5);
}

// ---------- actions ----------
async function openJourney(v: DepView): Promise<void> {
  S.jId = v.dep.journeyId; journeyDep = v; S.scene = 'journey'; S.showEarlier = false; S.fullRoute = false;
  if (S.detent === 'peek') S.detent = 'half';
  journey = null; render();
  await refreshJourney();
  render(); syncMap(true);
  ($('#detail h2') ?? document.querySelector<HTMLElement>('#sheetBody .j-head h2'))?.focus({ preventScroll: true });
}

function closeToMain(): void {
  S.scene = 'main'; S.jId = null; render(); syncMap(true);
  if (lastFk) $('#sheetBody').querySelector<HTMLElement>(`[data-fk="${CSS.escape(lastFk)}"]`)?.focus({ preventScroll: true });
}

function openSearch(): void {
  lastFk = 'search'; prevDetent = S.detent; S.scene = 'search'; S.detent = 'full'; render(); syncMap(false);
  const q = document.getElementById('q') as HTMLInputElement | null; q?.focus(); q?.setSelectionRange(q.value.length, q.value.length);
}

function cancelSearch(): void {
  S.q = ''; S.scene = S.scenario === 'denied' ? 'denied' : S.scenario === 'nostops' ? 'nostops' : 'main';
  S.detent = prevDetent === 'full' ? 'peek' : prevDetent; render(); syncMap(false);
  $('#sheetBody').querySelector<HTMLElement>('[data-fk="search"]')?.focus({ preventScroll: true });
}

async function onAct(a: string): Promise<void> {
  if (a === 'cycle' && nearby.length) {
    const i = nearby.findIndex((s) => s.id === S.stopId);
    await selectStop((nearby[(i + 1) % nearby.length] as StopWithDistance).id, S.detent);
  } else if (a === 'nearby') { const first = nearby[0]; if (first) await selectStop(first.id, S.detent); }
  else if (a === 'search') openSearch();
  else if (a === 'cancelsearch') cancelSearch();
  else if (a === 'clearq') { S.q = ''; const q = document.getElementById('q') as HTMLInputElement; q.value = ''; (document.querySelector('[data-act="clearq"]') as HTMLElement).hidden = true; q.focus(); void renderResults(); }
  else if (a === 'back') closeToMain();
  else if (a === 'toggle') setDetent(S.detent === 'peek' ? 'half' : 'peek');
  else if (a === 'route') { S.fullRoute = !S.fullRoute; render(); syncMap(true); }
  else if (a === 'earlier') { S.showEarlier = true; render(); }
  else if (a === 'disc') { S.discOpen = !S.discOpen; render(); }
  else if (a === 'retry') { toast('Prøver igen …'); await loadBoard(); toast(stale() ? 'Stadig ingen forbindelse (demo)' : 'Opdateret'); }
  else if (a === 'settings') toast('Demo: her åbnes indstillinger for placering');
  else if (a === 'nearest' && nearest) { origin = home(); nearby = []; S.scenario = 'normal'; await selectStop(nearest.id); }
}

function wire(): void {
  const body = $('#sheetBody');
  const onClick = (e: Event) => {
    const t = e.target as HTMLElement;
    const el = t.closest<HTMLElement>('[data-act],[data-dep],[data-stop],[data-pick]');
    if (!el) return;
    const fk = el.dataset.fk; if (fk) lastFk = fk;
    if (el.dataset.dep) {
      const v = views().find((x) => x.dep.journeyId === el.dataset.dep); if (v) void openJourney(v);
    } else if (el.dataset.stop) void selectStop(el.dataset.stop, 'peek');
    else if (el.dataset.pick) void pickFromSearch(el.dataset.pick);
    else if (el.dataset.act) void onAct(el.dataset.act);
  };
  body.addEventListener('click', onClick);
  $('#detail').addEventListener('click', onClick);
  body.addEventListener('input', (e) => {
    if ((e.target as HTMLElement).id !== 'q') return;
    S.q = (e.target as HTMLInputElement).value;
    (document.querySelector('[data-act="clearq"]') as HTMLElement).hidden = !S.q;
    writeHash(); void renderResults();
  });
}

async function pickFromSearch(id: string): Promise<void> {
  if (S.scenario === 'denied' || S.scenario === 'nostops') { origin = home(); S.scenario = 'normal'; nearby = await api.nearbyStops(origin, 1000); }
  await selectStop(id, 'peek');
}

// ---------- demo panel ----------
function opts(boxId: string, items: Array<[string, string, boolean, () => void]>): void {
  const box = document.getElementById(boxId); if (!box) return;
  box.innerHTML = '';
  for (const [label, , on, fn] of items) {
    const b = document.createElement('button'); b.className = 'opt'; b.textContent = label; b.setAttribute('aria-pressed', String(on));
    b.addEventListener('click', fn); box.appendChild(b);
  }
}
function renderPanel(): void {
  const sc = (label: string, v: Scenario): [string, string, boolean, () => void] =>
    [label, v, S.scenario === v, () => { S.scenario = v; S.scene = 'loading'; S.jId = null; S.detent = v === 'normal' || v === 'now' || v === 'issues' || v === 'loading' ? 'peek' : 'half'; void boot(); }];
  opts('optScenario', [sc('Normal', 'normal'), sc('«Nu»', 'now'), sc('Forsinket · aflyst · køreplan', 'issues'), sc('Indlæser', 'loading'), sc('Placering nægtet', 'denied'), sc('Ingen stop i nærheden', 'nostops')]);
  const net = (l: string, v: Net): [string, string, boolean, () => void] => [l, v, S.net === v, () => { S.net = v; repo.mode = repoMode(); void loadBoard(); }];
  opts('optNet', [net('Online', 'ok'), net('Offline', 'offline'), net('API-fejl', 'error')]);
  opts('optDisr', [['Fra', '', !S.disruption, () => { S.disruption = false; render(); }], ['Til (5C)', '', S.disruption, () => { S.disruption = true; render(); }]]);
  const th = (l: string, v: State['theme']): [string, string, boolean, () => void] => [l, v, S.theme === v, () => { S.theme = v; applyAppearance(); render(); }];
  opts('optTheme', [th('System', 'system'), th('Lys', 'light'), th('Mørk', 'dark')]);
  const pal = (l: string, v: State['palette']): [string, string, boolean, () => void] => [l, v, S.palette === v, () => { S.palette = v; applyAppearance(); writeHash(); render(); syncMap(false); }];
  opts('optPalette', [pal('Standard (godkendt)', 'standard'), pal('Fjord', 'fjord')]);
  const tx = (l: string, v: number): [string, string, boolean, () => void] => [l, '', S.text === v, () => { S.text = v; applyAppearance(); render(); syncMap(false); }];
  opts('optText', [tx('Normal', 1), tx('Stor', 1.35), tx('Meget stor', 1.65)]);
  opts('optMotion', [['Systemets valg', '', !S.rm, () => { S.rm = false; applyAppearance(); render(); }], ['Reducer bevægelse', '', S.rm, () => { S.rm = true; applyAppearance(); render(); }]]);
}

function setupPanel(): void {
  const btn = $('#demoBtn'); const panel = $('#demoPanel');
  const set = (open: boolean) => { panel.hidden = !open; btn.setAttribute('aria-expanded', String(open)); if (open) $('#demoClose').focus(); else btn.focus(); };
  btn.addEventListener('click', () => set(Boolean(panel.hidden)));
  $('#demoClose').addEventListener('click', () => set(false));
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    const typing = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
    if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && (S.scene === 'main' || S.scene === 'journey' || S.scene === 'denied' || S.scene === 'nostops')) {
      e.preventDefault(); if (S.scene === 'journey') { S.scene = 'main'; S.jId = null; } openSearch(); return;
    }
    if (e.key === 'ArrowDown' && t.id === 'q') { e.preventDefault(); document.querySelector<HTMLElement>('#results .row')?.focus(); return; }
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && S.scene === 'search' && t.closest('#results')) {
      e.preventDefault();
      const rows = [...document.querySelectorAll<HTMLElement>('#results .row')]; const i = rows.indexOf(t.closest('.row') as HTMLElement);
      const n = i + (e.key === 'ArrowDown' ? 1 : -1);
      if (n < 0) $('#q').focus(); else rows[n]?.focus();
      return;
    }
    if (e.key !== 'Escape') return;
    if (!panel.hidden) set(false);
    else if (S.scene === 'journey') closeToMain();
    else if (S.scene === 'search') cancelSearch();
  });
  document.addEventListener('pointerdown', (e) => {
    const t = e.target as HTMLElement;
    if (!panel.hidden && !t.closest('#demoPanel, #demoBtn')) { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
  });
}

// ---------- start ----------
export function start(): void {
  // Keep demo helpers available for local fixture development without exposing their controls in production.
  void opts; void renderPanel; void setupPanel;
  readHash();
  applyAppearance();
  wire(); setupDrag();
  $('#locBtn').addEventListener('click', () => {
    if (live) {
      void locate().then((p) => {
        if (p === 'denied') { toast('Placering er slået fra'); return; }
        const moved = !located || located === 'denied' || Math.abs(p.lat - located.lat) + Math.abs(p.lng - located.lng) > 0.001;
        located = p;
        if (moved) { S.scenario = 'normal'; void boot(); } else map?.focus(origin, mapPadding(), 15.5);
      });
      return;
    }
    if (S.scene === 'denied') { toast('Placering er slået fra (demo)'); return; }
    map?.focus(origin, mapPadding(), 15.5); toast('Viser din placering (demo)');
  });
  $('#pitchBtn').addEventListener('click', (e) => {
    const on = map?.togglePitch() ?? false; const b = e.currentTarget as HTMLElement;
    b.textContent = on ? '3D' : '2D'; b.setAttribute('aria-pressed', String(on));
  });
  window.addEventListener('resize', () => { render(); map?.resize(); syncMap(false); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (S.theme === 'system') { applyAppearance(); render(); } });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && board && nowMs() - board.fetchedAt > 30_000 && S.scene === 'main') void loadBoard(true);
  });
  document.addEventListener('focusin', (e) => {
    const pin = (e.target as HTMLElement).closest?.('.pin');
    if (!pin || !isDesktop() || !map) return;
    const d = $('#detail');
    const edge = (d.hidden ? $('#sheet') : d).getBoundingClientRect().right + 8;
    const r = pin.getBoundingClientRect();
    if (r.left < edge) map.panBy(-(edge - r.left), 0);
  });
  window.setInterval(tick, 1000);
  window.setInterval(() => { if (!document.hidden && (S.scene === 'main' || S.scene === 'journey')) void loadBoard(true); }, 30_000);
  void boot();
  void loadRouteShape().then((shape) => { routeShape = shape; syncMap(false); });
  void createMap($('#map'), {
    dark: dark(), center: USER_LOCATION, reduceMotion, onPick: (id) => { lastFk = `pin:${id}`; void selectStop(id, 'peek'); },
  }).then((m) => { map = m; syncMap(true); });
}
