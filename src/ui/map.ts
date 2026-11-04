import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import type { Map as MlMap, Marker as MlMarker, StyleSpecification } from 'maplibre-gl';
import { lineCategory } from '../domain/line';
import type { LatLng, Stop } from '../data/types';
import { esc, icon } from './icons';

/**
 * MapLibre GL JS with OpenFreeMap vector tiles (no API key, no account). Attribution is rendered by
 * #mapLegal in index.html (OpenFreeMap, OpenMapTiles, OpenStreetMap contributors, MapLibre).
 * If WebGL or the tile service is unavailable the app keeps working: the map area shows a notice.
 */
const STYLE_LIGHT = 'https://tiles.openfreemap.org/styles/positron';
const STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark';

export interface MapView {
  stops: Stop[];
  selectedId: string | null;
  showPins: boolean;
  dimOthers: boolean;
  user: LatLng | null;
  radius?: LatLng | null;
  route: { color: string; coords: LatLng[]; stops: LatLng[]; bus: LatLng | null } | null;
  lineColors: Record<string, string>;
}

export interface MapApi {
  update(v: MapView): void;
  focus(p: LatLng, padding: { top: number; right: number; bottom: number; left: number }, zoom?: number): void;
  fit(points: LatLng[], padding: { top: number; right: number; bottom: number; left: number }): void;
  setTheme(dark: boolean): void;
  togglePitch(): boolean;
  resize(): void;
  panBy(x: number, y: number): void;
  available: boolean;
}

const lineChipSm = (line: string) => `<span class="lchip sm cat-${lineCategory(line)}">${esc(line)}</span>`;

export async function createMap(
  container: HTMLElement, opts: { dark: boolean; center: LatLng; reduceMotion: () => boolean; onPick(id: string): void },
): Promise<MapApi> {
  let ml: typeof import('maplibre-gl');
  let map: MlMap;
  try {
    ml = await import('maplibre-gl');
    ml.setWorkerUrl(workerUrl);
    map = new ml.Map({
      container, style: opts.dark ? STYLE_DARK : STYLE_LIGHT, center: [opts.center.lng, opts.center.lat], zoom: 15.3,
      pitch: 38, attributionControl: false, dragRotate: true, cooperativeGestures: false,
    });
  } catch {
    container.innerHTML = '<p class="map-fallback" role="status">Kortet kunne ikke indlæses (WebGL mangler). Afgangene virker stadig.</p>';
    return { update() {}, focus() {}, fit() {}, setTheme() {}, togglePitch: () => false, resize() {}, panBy() {}, available: false };
  }
  map.touchZoomRotate.disableRotation();
  map.keyboard.enable();

  let tileError = false;
  map.on('error', () => {
    if (tileError) return;
    tileError = true;
    const n = document.getElementById('mapNotice');
    if (n) n.hidden = false;
  });
  map.on('load', () => { const n = document.getElementById('mapNotice'); if (n) n.hidden = true; tileError = false; });

  const markers = new Map<string, { m: MlMarker; el: HTMLElement }>();
  let userMarker: MlMarker | null = null;
  let busMarker: MlMarker | null = null;
  let last: MapView | null = null;
  let pitched = true;
  let dark = opts.dark;

  const addBuildings = () => {
    if (!map.getSource('openmaptiles') || map.getLayer('building-3d')) return;
    const layers = map.getStyle().layers;
    const buildingIndex = layers.findIndex((layer) => layer.id === 'building');
    const before = buildingIndex >= 0 ? layers[buildingIndex + 1]?.id : layers.find((layer) => layer.type === 'symbol')?.id;
    map.addLayer({
      id: 'building-3d', type: 'fill-extrusion', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14,
      filter: ['!=', ['get', 'hide_3d'], true],
      paint: {
        'fill-extrusion-color': dark ? '#35383c' : '#d9d9d3',
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 0],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 1,
      },
    }, before);
  };

  const applyRoute = () => {
    const v = last;
    if (!map.isStyleLoaded() && !map.getStyle()) return;
    for (const id of ['route-stops', 'route-line', 'route-casing', 'radius']) if (map.getLayer(id)) map.removeLayer(id);
    for (const id of ['route', 'route-pts', 'radius']) if (map.getSource(id)) map.removeSource(id);
    if (v?.route) {
      map.addSource('route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: v.route.coords.map((c) => [c.lng, c.lat]) } } });
      map.addSource('route-pts', { type: 'geojson', data: { type: 'FeatureCollection', features: v.route.stops.map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [c.lng, c.lat] } })) } });
      map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ffffff', 'line-width': 12 } });
      map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': v.route.color, 'line-width': 7 } });
      map.addLayer({ id: 'route-stops', type: 'circle', source: 'route-pts', paint: { 'circle-radius': 5, 'circle-color': '#ffffff', 'circle-stroke-color': v.route.color, 'circle-stroke-width': 3 } });
    }
    if (v?.radius) {
      const c = v.radius; const pts: number[][] = [];
      for (let i = 0; i <= 64; i++) {
        const a = (i / 64) * 2 * Math.PI;
        pts.push([c.lng + (1000 / (111_320 * Math.cos((c.lat * Math.PI) / 180))) * Math.cos(a), c.lat + (1000 / 110_540) * Math.sin(a)]);
      }
      map.addSource('radius', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pts } } });
      map.addLayer({ id: 'radius', type: 'line', source: 'radius', paint: { 'line-color': '#007AFF', 'line-width': 3, 'line-dasharray': [3, 2] } });
    }
  };
  map.on('style.load', () => { addBuildings(); applyRoute(); });

  const hideCollidingLabels = () => requestAnimationFrame(() => {
    const sel = [...markers.values()].find((m) => m.el.classList.contains('is-selected'));
    const labels = [...markers.values()].filter((m) => m !== sel);
    labels.forEach((m) => m.el.classList.remove('label-hidden'));
    if (last?.dimOthers) labels.forEach((m) => m.el.classList.add('label-hidden'));
    const blockers = ['#sheet', '#detail:not([hidden])', '#mapControls', '#demoBtn'].map((q) => document.querySelector(q)?.getBoundingClientRect()).filter((r): r is DOMRect => !!r && r.width > 0);
    for (const m of labels) {
      const b = m.el.querySelector('.pin-label')?.getBoundingClientRect();
      if (b && blockers.some((r) => !(b.right < r.left || b.left > r.right || b.bottom < r.top || b.top > r.bottom))) m.el.classList.add('label-hidden');
    }
    const selLab = sel?.el.querySelector('.pin-label');
    if (!selLab) return;
    const a = selLab.getBoundingClientRect();
    for (const m of labels) {
      const lab = m.el.querySelector('.pin-label');
      if (!lab) continue;
      const b = lab.getBoundingClientRect();
      if (!(b.right < a.left || b.left > a.right || b.bottom < a.top || b.top > a.bottom)) m.el.classList.add('label-hidden');
    }
  });
  map.on('moveend', hideCollidingLabels);

  const api: MapApi = {
    available: true,
    update(v) {
      last = v;
      const want = new Set(v.showPins ? v.stops.map((s) => s.id) : []);
      for (const [id, o] of markers) if (!want.has(id)) { o.m.remove(); markers.delete(id); }
      if (v.showPins) for (const s of v.stops) {
        const sel = s.id === v.selectedId;
        const lines = s.lines.slice(0, 5);
        const label = sel
          ? `<span class="pin-label"><span>${esc(s.name)}</span><span class="chips">${lines.map(lineChipSm).join('')}</span></span>`
          : `<span class="pin-label">${esc(s.name)}</span>`;
        const html = `<button class="pin ${sel ? 'is-selected' : ''} ${v.dimOthers && !sel ? 'is-dim' : ''}" data-fk="pin:${esc(s.id)}"
          aria-label="${esc(s.name)}, ${esc(s.road)}${sel ? ', valgt' : ''}" ${sel ? 'aria-pressed="true"' : ''}>${label}<span class="pin-head">${icon('bus.fill')}</span><span class="pin-pole"></span></button>`;
        let o = markers.get(s.id);
        if (!o) {
          const el = document.createElement('div');
          el.className = 'marker';
          const m = new ml.Marker({ element: el, anchor: 'bottom' }).setLngLat([s.lng, s.lat]).addTo(map);
          el.addEventListener('click', () => opts.onPick(s.id));
          o = { m, el };
          markers.set(s.id, o);
        }
        o.el.innerHTML = html;
        o.el.classList.toggle('is-selected', sel);
        o.el.style.zIndex = sel ? '5' : '2';
      }
      if (v.user) {
        if (!userMarker) {
          const el = document.createElement('div');
          el.className = 'user-dot';
          el.setAttribute('role', 'img');
          el.setAttribute('aria-label', 'Din placering (demo)');
          el.innerHTML = '<span class="halo"></span><span class="pulse"></span><span class="core"></span>';
          userMarker = new ml.Marker({ element: el, anchor: 'center' }).setLngLat([v.user.lng, v.user.lat]).addTo(map);
        } else userMarker.setLngLat([v.user.lng, v.user.lat]);
      } else if (userMarker) { userMarker.remove(); userMarker = null; }
      busMarker?.remove(); busMarker = null;
      if (v.route?.bus) {
        const el = document.createElement('div');
        el.innerHTML = `<span class="j-bus" role="img" aria-label="Bussens placering (demo)" style="--line:${esc(v.route.color)};display:grid">${icon('bus.fill')}</span>`;
        busMarker = new ml.Marker({ element: el, anchor: 'center' }).setLngLat([v.route.bus.lng, v.route.bus.lat]).addTo(map);
      }
      if (map.isStyleLoaded()) applyRoute();
      hideCollidingLabels();
    },
    focus(p, padding, zoom) {
      map.easeTo({ center: [p.lng, p.lat], padding, zoom: zoom ?? Math.max(map.getZoom(), 15), duration: opts.reduceMotion() ? 0 : 600 });
    },
    fit(points, padding) {
      if (!points.length) return;
      const b = new ml.LngLatBounds();
      points.forEach((p) => b.extend([p.lng, p.lat]));
      map.setPadding(padding); // camera padding keeps the fit inside the free map area
      map.fitBounds(b, { padding: 0, duration: opts.reduceMotion() ? 0 : 700, maxZoom: 15.5 });
    },
    setTheme(isDark) { dark = isDark; map.setStyle((dark ? STYLE_DARK : STYLE_LIGHT) as unknown as StyleSpecification | string); },
    togglePitch() {
      pitched = !pitched;
      map.easeTo({ pitch: pitched ? 38 : 0, duration: opts.reduceMotion() ? 0 : 400 });
      return pitched;
    },
    resize() { map.resize(); },
    panBy(x, y) { map.panBy([x, y], { duration: opts.reduceMotion() ? 0 : 300 }); },
  };
  return api;
}
