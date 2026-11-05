/* Slice proposal "default stop + timeline". Fork of ../assets/web.js (approved web layout prototype).
   Every change against web.js is marked SLICE. Everything else is the approved layout, unchanged.
   Deep links: #loc=prompt|asking|granted|denied|unavailable  &nb=true (notice dismissed)  &panel=compact|expanded
               &variant=normal|now|issues  &theme=light|dark  &rm=true  &annot=true (screen-reader annotation)  &demo=true */
(() => {
  const D = window.DATA;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const desk = () => innerWidth >= 768;
  const wide = () => innerWidth >= 1280;

  const S = {
    scene: 'main', panel: 'expanded', stop: 0, variant: 'normal', net: 'ok', disruption: false, discOpen: false,
    theme: 'light', rm: false, demo: false, q: '', jKey: null, showEarlier: false,
    loc: 'prompt', nb: false, annot: false, // SLICE
  };
  const KEYS = ['scene', 'panel', 'stop', 'variant', 'net', 'disruption', 'theme', 'rm', 'demo', 'q', 'loc', 'nb', 'annot'];
  let prevPanel = 'expanded';
  let returnTo = null;           // focus target after journey/search closes

  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    KEYS.forEach((k) => {
      if (!p.has(k)) return;
      let v = p.get(k);
      if (v === 'true') v = true; else if (v === 'false') v = false;
      else if (k === 'stop' && v !== 'rp') v = Number(v);
      S[k] = v;
    });
  }
  function writeHash() {
    const p = new URLSearchParams();
    KEYS.forEach((k) => { if (S[k] !== null && S[k] !== '' && S[k] !== false) p.set(k, S[k]); });
    history.replaceState(null, '', '#' + p.toString());
  }
  if (matchMedia('(prefers-color-scheme: dark)').matches) S.theme = 'dark';
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) S.rm = true;

  // ---------- data ----------
  const stopObj = () => (S.stop === 'rp' ? D.remote : D.stops[S.stop]);
  function departures() {
    const st = stopObj();
    return (st.deps[S.variant] || st.deps.normal).map((dp) => ({ ...dp, disrupted: S.disruption && D.disruption.lines.includes(dp.line) }))
      .sort((a, b) => (a.status === 'cancelled' ? a.planned : a.m) - (b.status === 'cancelled' ? b.planned : b.m));
  }
  const stale = () => S.net !== 'ok';
  const jDep = () => departures().find((x) => `${x.line}|${x.dest}` === S.jKey) || departures()[0];

  // ---------- renderers (ported from iOS app.js) ----------
  const chip = (line, cat, cls = '') => `<span class="lchip cat-${cat} ${cls}">${line}</span>`;
  const mins = (m) => (m === 0 ? '<span class="pill now">Nu</span>' : `<span class="t-minutes">${m}<small>min</small></span>`);

  function depRow(dp, isSource) {
    const t = D.fmt(dp.m), tp = D.fmt(dp.planned);
    let sub = '', end = '';
    const next = dp.next.filter((n) => n > dp.m).slice(0, 2);
    const nextTxt = next.length ? `<span class="r-next t-body-sm">${next.join(', ')} min</span>` : '';
    if (dp.status === 'cancelled') {
      sub = `<span class="cancel">Aflyst</span><span>· planlagt ${tp}</span>`;
      end = `<span class="pill cancel">Aflyst</span>${next.length ? `<span class="r-next t-body-sm">næste ${next[0]} min</span>` : ''}`;
    } else if (dp.status === 'delayed') {
      sub = `<span class="delay">+${dp.m - dp.planned} min</span><span>· <s>${tp}</s> ${t}</span>`;
      end = `<span class="t-minutes delay">${dp.m}<small>min</small></span>${nextTxt}`;
    } else if (dp.status === 'planned') {
      sub = `${icon('clock')}<span>Køreplan ${t} · ingen realtid</span>`;
      end = `${mins(dp.m)}${nextTxt}`;
    } else {
      sub = stale()
        ? `${icon('clock.arrow.circlepath')}<span>ca. ${t}${dp.via ? ` · ${dp.via}` : ''}</span>`
        : `<span class="live">${icon('dot.radiowaves.right')}</span><span>${t}${dp.via ? ` · ${dp.via}` : ''}</span>`;
      end = `${mins(dp.m)}${nextTxt}`;
    }
    const warn = dp.disrupted ? `<span style="color:var(--c-warning-icon);--tri-mark:var(--c-surface)">${icon('exclamationmark.triangle.fill')}</span>` : '';
    return `<button class="row ${dp.status === 'cancelled' ? 'is-cancelled' : ''} ${isSource ? 'is-source' : ''}" data-dep="${dp.line}|${dp.dest}" ${isSource ? 'aria-current="true"' : ''} aria-label="${Band.label(dp)}">
      ${chip(dp.line, dp.cat)}
      <span class="r-main"><span class="r-title t-body-strong">${warn} ${dp.dest}</span><span class="r-sub t-body-sm">${sub}</span></span>
      <span class="r-end">${end}</span></button>`;
  }

  // SLICE: without a position the header shows the stop code instead of a distance, and "nearby" is relative to the default stop
  function header(st) {
    const n = D.stops.length;
    const ord = order();
    const idx = S.stop === 'rp' ? null : ord.indexOf(S.stop) + 1;
    const rel = located() ? 'i nærheden' : `nær ${DEFAULT_NAME}`;
    const cycle = idx
      ? `<button class="cycle" data-act="cycle" aria-label="Næste stoppested ${rel}, ${idx} af ${n}">${idx}/${n}${icon('chevron.right')}</button>`
      : `<button class="cycle" data-act="nearby" aria-label="Tilbage til stoppesteder ${rel}">${icon('location.fill')}</button>`;
    const exp = S.panel === 'expanded';
    const meta = located() && S.stop !== 'rp'
      ? `<span>${st.road}</span><span class="sep"></span><span>${D.dist(distOf(S.stop))}</span>`
      : `<span>${st.road}</span><span class="sep"></span><span>Stop ${st.id}</span>`;
    return `<div class="s-head">
      <div class="titles"><h2 class="t-stop-title" id="stopTitle" tabindex="-1">${st.name}</h2>
        <div class="meta t-stop-meta">${meta}</div></div>
      <div class="actions">
        <button class="ibtn" data-act="search" aria-label="Søg efter stoppested" aria-keyshortcuts="/" title="Søg ( / )">${icon('magnifyingglass')}</button>
        ${cycle}
        <button class="ibtn only-desk" data-act="toggle" aria-expanded="${exp}" aria-controls="sheetBody" aria-label="${exp ? 'Skjul afgangslisten' : 'Vis alle afgange'}" title="${exp ? 'Skjul afgangslisten' : 'Vis alle afgange'}"><span class="rot">${icon('chevron.down')}</span></button>
      </div></div>`;
  }

  function banners() {
    let h = '';
    if (S.net !== 'ok') {
      h += `<div class="banner offline" role="status"><span class="b-ico">${icon('wifi.slash')}</span>
        <span class="b-txt"><b class="b-title t-label-md">Ingen forbindelse</b>
        <span class="b-sub t-body-sm">Viser afgange fra 08.10. Tiderne kan have ændret sig.</span></span>
        <button class="b-action" data-act="retry">${icon('arrow.clockwise')}Prøv igen</button></div>`;
    }
    if (S.disruption) {
      const x = D.disruption;
      h += `<button class="banner disruption ${S.discOpen ? '' : 'is-collapsed'}" data-act="disc" aria-expanded="${S.discOpen}">
        <span class="b-ico">${icon('exclamationmark.triangle.fill')}</span>
        <span class="b-txt"><b class="b-title t-label-md">${x.title}</b><span class="b-sub t-body-sm">${x.short}</span>
        <span class="b-body b-sub t-body-sm">${x.body}<br><span class="c-2">${x.source}</span></span></span>
        <span class="b-chev">${icon(S.discOpen ? 'chevron.down' : 'chevron.right')}</span></button>`;
    }
    return h;
  }

  const cardOpen = () => S.scene === 'journey' && wide();

  // ---------- SLICE: location model ----------
  // prompt = never asked (first load) · asking = browser dialog open · granted · denied = blocked (browser will not ask again)
  // unavailable = asked, but no fix (timeout / position error / no geolocation API)
  const DEFAULT_STOP = 0, DEFAULT_NAME = 'Nørreport St.';
  const USER_AT = [1130, 1080];          // simulated position once granted: by Ørstedsparken, so the stop visibly changes
  const located = () => S.loc === 'granted';
  const originXY = () => (located() ? USER_AT : D.stops[DEFAULT_STOP].xy2);
  const distOf = (i) => Math.round(Math.hypot(D.stops[i].xy2[0] - originXY()[0], D.stops[i].xy2[1] - originXY()[1]) / 5) * 5 || 0;
  const order = () => D.stops.map((_, i) => i).sort((a, b) => distOf(a) - distOf(b));
  const nearest = () => order()[0];
  const end = (t) => (t.endsWith('.') ? t : t + '.');   // "Nørreport St." already ends the sentence

  function locNotice() {
    if (S.nb || located()) return '';
    const phone = !desk();
    const V = {
      prompt: { ico: 'location.fill', tone: 'ask', title: 'Vis stoppesteder nær dig',
        sub: phone ? `Indtil da viser vi ${end(DEFAULT_NAME)}` : `Indtil da viser vi ${end(DEFAULT_NAME)} Browseren spørger dig, før siden får din placering.`,
        act: `<button class="b-action is-primary" data-act="locate">${icon('location.fill')}Tillad placering</button>` },
      asking: { ico: 'location.fill', tone: 'ask', title: 'Vis stoppesteder nær dig',
        sub: phone ? 'Vælg «Tillad» i dialogen.' : 'Vælg «Tillad» i browserens dialog ved adresselinjen.',
        act: `<button class="b-action is-primary" aria-disabled="true" data-act="noop"><span class="spin" aria-hidden="true"></span>Venter på svar …</button>` },
      denied: { ico: 'location.slash', tone: 'muted', title: phone ? 'Placering er slået fra' : 'Placering er blokeret for siden',
        sub: phone ? 'Tillad placering for browseren i telefonens indstillinger, og prøv igen.'
          : 'Klik på ikonet til venstre for adressen, vælg Tillad ved Placering, og prøv igen.',
        act: `<button class="b-action" data-act="locate">${icon('arrow.clockwise')}Prøv igen</button>` },
      unavailable: { ico: 'location.slash', tone: 'muted', title: 'Vi kunne ikke finde din placering',
        sub: 'Browseren svarede ikke i tide. Prøv igen, eller søg efter et stop.',
        act: `<button class="b-action" data-act="locate">${icon('arrow.clockwise')}Prøv igen</button>` },
    }[S.loc];
    if (!V) return '';
    return `<section class="banner locate is-${V.tone}" aria-labelledby="locT">
      <span class="b-ico">${icon(V.ico)}</span>
      <span class="b-txt"><b class="b-title t-label-md" id="locT">${V.title}</b><span class="b-sub t-body-sm">${V.sub}</span>
        <span class="b-row">${V.act}</span></span>
      <button class="b-close" data-act="dismissloc" aria-label="Skjul beskeden om placering" title="Skjul">${icon('xmark')}</button></section>`;
  }

  // SLICE: accessible name for a list row: line, destination, minutes, clock time, data quality, next departures
  function rowLabel(dp) {
    const next = dp.next.filter((n) => n > dp.m).slice(0, 2);
    let s = Band.label(dp);
    s += dp.status === 'cancelled' ? `, planlagt kl. ${D.fmt(dp.planned)}` : `, kl. ${D.fmt(dp.m)}`;
    if (dp.status === 'rt') s += stale() ? ', sidst kendte tid' : ', demodata';
    if (next.length) s += dp.status === 'cancelled' ? `. Næste afgang om ${next[0]} min` : `. Derefter om ${next.join(' og ')} min`;
    return s;
  }

  function sceneMain() {
    const st = stopObj();
    const deps = departures();
    const src = cardOpen() ? S.jKey : null;
    // SLICE: the location notice sits where banners already sit (between header and band)
    let h = header(st) + locNotice() + banners() + `<div class="band-host" id="bandHost"></div><div class="peek-end"></div>`;
    // SLICE: the list is the text alternative to the band: a real heading + ordered list, same order as the band
    h += `<div class="sec-h"><h3 class="t-label-md" id="depsH">Afgange</h3><span class="t-body-sm">Næste 60 min</span></div>`;
    h += `<ol class="rows deps" id="depList" aria-labelledby="depsH">${deps.map((dp) => `<li>${depRow(dp, `${dp.line}|${dp.dest}` === src).replace(/aria-label="[^"]*"/, `aria-label="${rowLabel(dp)}"`)}</li>`).join('')}</ol>`;
    if (S.stop !== 'rp') {
      const near = located() ? ['I nærheden', `${D.stops.length} stop inden for 1000&nbsp;m`] : [`Nær ${DEFAULT_NAME}`, 'Uden din placering'];
      h += `<div class="sec-h"><h3 class="t-label-md">${near[0]}</h3><span class="t-body-sm">${near[1]}</span></div><div class="rows">`;
      order().forEach((i) => {
        const o = D.stops[i];
        const lines = [...new Set(o.deps.normal.map((x) => x.line))];
        const where = located() ? D.dist(distOf(i)) : (i === DEFAULT_STOP ? 'Standardstop' : `${D.dist(distOf(i))} herfra`);
        h += `<button class="row ${i === S.stop ? 'is-current' : ''}" data-stop="${i}" aria-current="${i === S.stop}">
          <span class="stander-ico">${icon('bus.fill')}</span>
          <span class="r-main"><span class="r-title t-body-strong">${o.name}</span><span class="r-sub t-body-sm">${o.road} · ${where}</span>
          <span class="chips">${lines.map((l) => chip(l, D.cat(l), 'sm')).join('')}</span></span>
          <span class="r-chev">${icon('chevron.right')}</span></button>`;
      });
      h += `</div>`;
    }
    h += `<p class="footer-note t-body-sm"><span class="demo-tag">DEMO</span>Syntetiske afgange · Stop-ID ${st.id}<br>${stale() ? 'Sidst opdateret 08.10' : 'Opdateret 08.14.05'}</p>`;
    return h;
  }

  function sceneSearch() {
    return `<div class="search-bar">
      <label class="field">${icon('magnifyingglass')}<span class="vh">Søg stoppested</span>
      <input id="q" type="search" placeholder="Søg stoppested eller vej" value="${S.q.replace(/"/g, '&quot;')}" autocomplete="off" aria-controls="searchResults">
      <span class="kbd" aria-hidden="true">Esc</span></label>
      <button class="textbtn" data-act="cancelsearch">Annuller</button></div><div id="searchResults">${searchResults()}</div>`;
  }
  function searchResults() {
    const q = S.q.trim(), fq = D.foldLoose(q);
    const hl = (name) => {
      if (!q) return name;
      const i = D.foldLoose(name).indexOf(fq);
      return i < 0 ? name : `${name.slice(0, i)}<mark>${name.slice(i, i + q.length)}</mark>${name.slice(i + q.length)}`;
    };
    let body = '';
    if (!q) {
      body += `<div class="sec-h"><span class="t-label-md">Seneste</span></div><div class="rows">`;
      D.recent.forEach((n) => { const it = D.index.find((x) => x.name === n); if (it) body += resultRow(it, n); });
      body += `</div><div class="sec-h"><span class="t-label-md">I nærheden</span></div><div class="rows">`;
      D.index.slice(0, 4).forEach((it) => (body += resultRow(it, it.name)));
      return body + `</div>`;
    }
    const res = D.index.filter((it) => D.foldLoose(`${it.name} ${it.road}`).includes(fq)).sort((a, b) => a.dist - b.dist);
    if (!res.length) {
      return `<div class="empty" style="margin-top:24px"><div class="e-ico">${icon('magnifyingglass')}</div>
        <h2 class="t-headline">Intet stoppested hedder “${q}”</h2>
        <p class="t-body">Tjek stavningen, eller søg på vejnavnet. Du kan skrive “oe” for ø og “aa” for å.</p></div>`;
    }
    return `<div class="sec-h"><span class="t-label-md">Stoppesteder</span><span class="t-body-sm" role="status">${res.length} ${res.length === 1 ? 'resultat' : 'resultater'}</span></div><div class="rows results">${res.map((it) => resultRow(it, hl(it.name))).join('')}</div>`;
  }
  function resultRow(it, nameHtml) {
    return `<button class="row" data-pick="${it.key}" data-name="${it.name}">
      <span class="stander-ico">${icon('bus.fill')}</span>
      <span class="r-main"><span class="r-title t-body-strong">${nameHtml}</span><span class="r-sub t-body-sm">${it.road} · ${D.dist(it.dist)}</span>
      <span class="chips">${it.lines.map((l) => chip(l, D.cat(l), 'sm')).join('')}</span></span>
      <span class="r-chev">${icon('chevron.right')}</span></button>`;
  }

  // journey geometry on the illustrative map plane (2400×1800 px; route may run off the plane)
  const C5 = [[-600, -500], [-420, -380], [-200, -240], [60, -70], [300, 120], [470, 270], [650, 430], [860, 590], [1200, 840],
    [1080, 1420], [1700, 1950], [2300, 2150], [2500, 2250], [2400, 2500], [2700, 2850], [3000, 3200]];
  const C5_VIA = { 7: [[1110, 760]], 8: [[1160, 1000], [1140, 1120]], 9: [[1500, 1650]] }; // waypoints after stop i
  const GEN = [[1900, -700], [1750, -400], [1640, -120], [1560, 100], [1480, 260], [1420, 380], [1330, 600], null,
    [1140, 1120], [1060, 1420], [1000, 1700], [930, 2000], [860, 2300], [780, 2600]];

  function journeyFor(dp) {
    if (dp.line === '5C' && dp.dest === 'Lufthavnen') {
      return { ...D.journey, cat: dp.cat, stops: D.journey.stops.map((s, i) => ({ ...s, xy: C5[i] })), via: C5_VIA };
    }
    const names = ['Emdrup Torv', 'Tagensvej', 'Nørre Campus', 'Fredensgade', 'Sølvtorvet', 'Kronprinsessegade', 'Rosenborggade',
      stopObj().name, 'Kultorvet', 'Rådhuspladsen', 'Vesterport St.', 'Vesterbros Torv', 'Enghave Plads', dp.dest];
    const mine = 7, step = 2;
    const delay = dp.status === 'delayed' ? dp.m - dp.planned : 0;
    const busIdx = Math.max(0, mine - Math.max(1, Math.round(dp.m / step)));
    return {
      line: dp.line, cat: dp.cat, dest: dp.dest, via: {},
      stops: names.map((n, i) => ({ n, t: dp.planned + (i - mine) * step, passed: i < busIdx, bus: i === busIdx ? 'at' : null, mine: i === mine, last: i === names.length - 1, xy: GEN[i] || stopObj().xy }))
        .map((s, i) => (i < busIdx ? { ...s, t: Math.min(s.t + delay, -1 - (busIdx - i) * step) } : s)),
    };
  }

  function sceneJourney(asCard) {
    const dp = jDep();
    const j = journeyFor(dp);
    const delay = dp.status === 'delayed' ? dp.m - dp.planned : 0;
    const passed = j.stops.filter((s) => s.passed);
    const shownPassed = S.showEarlier ? passed : passed.slice(-2);
    const hidden = passed.length - shownPassed.length;
    const rows = [...shownPassed, ...j.stops.filter((s) => !s.passed)];
    let list = '';
    rows.forEach((s, i) => {
      const cls = [s.passed ? 'passed' : '', s.bus ? 'at' : '', s.mine ? 'mine' : '', i === 0 && !hidden ? 'first' : '', s.last ? 'last' : ''].join(' ');
      const rt = s.t + (s.passed ? 0 : delay);
      const time = dp.status === 'cancelled' ? `<s>${D.fmt(s.t)}</s>`
        : (delay && !s.passed ? `<span class="rt delay">${D.fmt(rt)}</span><s>${D.fmt(s.t)}</s>` : `<span class="rt">${D.fmt(rt)}</span>`);
      const marker = s.bus ? `<span class="j-bus" aria-label="Bussen er her">${icon('bus.fill')}</span>` : `<span class="j-dot"></span>`;
      list += `<div class="j-stop ${cls}" role="listitem"><span class="j-rail"></span>${marker}
        <span class="j-name t-body">${s.n}${s.mine ? '<span class="j-tag">Dit stop</span>' : ''}${s.bus ? '<span class="c-2 t-body-sm"> · bussen er her</span>' : ''}</span>
        <span class="j-time t-body">${time}</span></div>`;
    });
    const more = hidden ? `<button class="j-more t-body-sm" data-act="earlier"><span class="j-rail"></span>${icon('chevron.down')} Vis ${hidden} tidligere stop</button>` : '';
    const statusTxt = dp.status === 'cancelled' ? `<span class="pill cancel">Aflyst</span>`
      : dp.status === 'delayed' ? `<span style="color:var(--c-delay-text);font-weight:600">Forsinket ${delay} min</span>`
        : dp.status === 'planned' ? `<span>${icon('clock')} Køreplan, ingen realtid</span>`
          : `<span class="live">${icon('dot.radiowaves.right')}Demodata</span>`;
    const id = asCard ? 'jTitleCard' : 'jTitle';
    const head = asCard
      ? `<div class="j-cardhead">${chip(dp.line, dp.cat)}<h2 id="${id}" class="t-stop-title" tabindex="-1">mod ${dp.dest}</h2>
         <button class="ibtn" data-act="closej" aria-label="Luk tur" title="Luk tur (Esc)">${icon('xmark')}</button></div>`
      : `<button class="textbtn t-body" data-act="back" style="margin-left:-6px">${icon('chevron.left')} ${stopObj().name}</button>
         <div class="j-head">${chip(dp.line, dp.cat)}<h2 id="${id}" class="t-stop-title" tabindex="-1" style="margin:0">mod ${dp.dest}</h2></div>`;
    return `${head}
      <div class="j-meta t-stop-meta">${dp.status === 'cancelled' ? '' : `<span>${dp.m === 0 ? 'Ved stoppestedet nu' : `Om ${dp.m} min ved ${stopObj().name}`}</span><span>·</span>`}${statusTxt}</div>
      <div class="j-list" role="list" style="--line:var(--color-line-${dp.cat})">${more}${list}</div>
      <p class="footer-note t-body-sm"><span class="demo-tag">DEMO</span>Bussens position er syntetisk.</p>`;
  }

  // ---------- illustrative map ----------
  const SEGD = (p, a, b) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  const lineD = (p, pts) => Math.min(...pts.slice(1).map((b, i) => SEGD(p, pts[i], b)));
  const inPoly = (x, y, pts) => {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  const pl = (pts) => 'M' + pts.map((p) => p.join(',')).join(' L');
  const LAKES = [[[820, 525], [1074, 73]], [[780, 595], [594, 925]], [[575, 960], [398, 1273]]];
  const PARKS = [
    { pts: [[960, 930], [1100, 900], [1125, 1100], [990, 1140]], lake: [1040, 1030, 24, 38], name: 'Ørstedsparken', at: [985, 1175] },
    { pts: [[1380, 560], [1560, 520], [1590, 720], [1420, 760]], lake: [1490, 640, 40, 22], name: 'Botanisk Have', at: [1420, 545] },
    { pts: [[1620, 760], [1800, 740], [1820, 900], [1640, 905]], name: 'Kongens Have', at: [1650, 735] },
    { pts: [[290, 560], [520, 500], [580, 760], [350, 820]], name: 'Assistens Kirkegård', at: [310, 850] },
  ];
  const HARBOUR = [[2020, -400], [2900, -400], [2900, 1000], [2180, 1100], [2150, 1600], [2100, 2600], [1900, 2600], [1880, 2000], [1930, 1700], [1960, 1400], [1920, 1150], [1960, 900], [2040, 600], [2060, 300]];
  const MAJOR = [
    [[1500, 180], [1420, 380], [1330, 600], [1250, 760], [1205, 840], [1160, 1000], [1140, 1120], [1080, 1420], [1000, 1700], [930, 2000]],
    [[1205, 840], [1110, 760], [860, 590], [700, 470], [300, 120], [60, -70], [-200, -240], [-420, -380]],
    [[1205, 840], [1500, 900], [1900, 980]],
    [[1215, 860], [1340, 1100], [1460, 1320], [1700, 1520], [1880, 1600]],
    [[600, 1210], [1080, 1420], [1500, 1650], [1700, 1950], [2300, 2150], [2700, 2300]],
  ];
  const MINOR = [
    [[1168, 80], [458, 1342]], [[1020, -4], [310, 1258]],
    [[1250, 760], [1500, 640], [1900, 520]], [[1340, 1100], [1700, 1050], [1900, 1100]], [[1160, 1000], [880, 1260]],
    [[380, 880], [700, 1220]], [[1500, 180], [1960, 320]], [[1460, 1320], [1300, 1640]], [[420, 220], [120, 560]],
    [[700, 470], [980, 120]], [[1500, 900], [1560, 1240]], [[1700, 1050], [1760, 1520]], [[200, 900], [520, 1500]],
  ];
  function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }
  function mapSvg() {
    const r = rng(42);
    let tile = '';
    for (let y = 0; y < 150; y += 30) for (let x = 0; x < 160; x += 32) {
      if (r() < 0.1) continue;
      tile += `<rect class="m-bld" x="${x + 2}" y="${y + 2}" width="${(16 + r() * 10).toFixed(0)}" height="${(14 + r() * 10).toFixed(0)}" rx="2"/>`;
    }
    let s = `<svg viewBox="0 0 2400 1800" aria-hidden="true"><defs><pattern id="blds" width="160" height="150" patternUnits="userSpaceOnUse">${tile}</pattern></defs>
      <rect class="m-land" x="-4000" y="-4000" width="10000" height="10000"/><rect fill="url(#blds)" x="-4000" y="-4000" width="10000" height="10000"/>`;
    s += `<path class="m-water" d="${pl(HARBOUR)} Z"/>`;
    LAKES.forEach(([a, b]) => (s += `<path class="m-lake" stroke-width="110" d="${pl([a, b])}"/>`));
    PARKS.forEach((p) => {
      s += `<path class="m-park" d="${pl(p.pts)} Z"/>`;
      if (p.lake) s += `<ellipse class="m-water" cx="${p.lake[0]}" cy="${p.lake[1]}" rx="${p.lake[2]}" ry="${p.lake[3]}"/>`;
    });
    MINOR.forEach((m) => (s += `<path class="m-road-minor" d="${pl(m)}"/>`));
    MAJOR.forEach((m) => (s += `<path class="m-road m-road-minor" d="${pl(m)}"/>`));
    const lab = (t, x, y, rot, cls = '') => `<text class="m-label ${cls}" transform="translate(${x} ${y}) rotate(${rot})">${t}</text>`;
    s += lab('Sortedams Sø', 900, 360, -61, 'water') + lab('Peblinge Sø', 660, 820, -61, 'water') + lab('Sankt Jørgens Sø', 455, 1210, -61, 'water');
    s += lab('Nørrebrogade', 380, 175, 41) + lab('Nørre Voldgade', 1185, 1080, -76) + lab('Gothersgade', 1560, 896, 11) + lab('Købmagergade', 1330, 1135, 62) + lab('Havnen', 2010, 1450, -80, 'water');
    PARKS.forEach((p) => (s += `<text class="m-label" x="${p.at[0]}" y="${p.at[1]}">${p.name}</text>`));
    s += `<text class="m-district" x="420" y="380">NØRREBRO</text><text class="m-district" x="1600" y="1240">INDRE BY</text><text class="m-district" x="1560" y="330">ØSTERBRO</text><text class="m-district" x="2300" y="1500">CHRISTIANSHAVN</text>`;
    s += `<g id="routeLayer"></g></svg>`;
    return s;
  }

  // camera: plane point (x,y) → screen (x*s+tx, y*s+ty). Visible rect = window minus panel/card/controls.
  const cam = { s: 1, tx: 0, ty: 0 };
  const P = (xy) => [xy[0] * cam.s + cam.tx, xy[1] * cam.s + cam.ty];
  const RP_XY = [1080, 1420];
  const xyOf = (i) => (i === 'rp' ? RP_XY : D.stops[i].xy2);
  D.stops[0].xy2 = [1200, 840]; D.stops[1].xy2 = [1060, 726]; D.stops[2].xy2 = [1150, 1010]; D.stops[3].xy2 = [860, 590];
  D.stops.forEach((s) => (s.xy = s.xy2));
  const USER = [1240, 880];

  function visibleRect() {
    const W = innerWidth, H = innerHeight;
    if (!desk()) {
      const top = $('#sheet').getBoundingClientRect().top;
      return { x0: 24, x1: W - 64, y0: 72, y1: Math.max(140, top - 24) };
    }
    let left = $('#sheet').getBoundingClientRect().right + 12;
    const d = $('#detail');
    if (!d.hidden && wide()) left = d.getBoundingClientRect().right + 12;
    return { x0: left + 48, x1: W - 72, y0: 72, y1: H - 48 };
  }
  function frame(points, minS = 0.35, maxS = 1) {
    const r = visibleRect();
    // inset by the selected callout's size (≈190×110 px) so "Dit stop" and its chips never clip
    const v = { x0: r.x0 + 60, x1: r.x1 - 96, y0: r.y0 + 110, y1: r.y1 - 24 };
    const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
    const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
    const s = Math.max(minS, Math.min(maxS, (v.x1 - v.x0) / Math.max(1, bx1 - bx0), (v.y1 - v.y0) / Math.max(1, by1 - by0)));
    cam.s = s;
    cam.tx = (v.x0 + v.x1) / 2 - ((bx0 + bx1) / 2) * s;
    cam.ty = (v.y0 + v.y1) / 2 - ((by0 + by1) / 2) * s;
  }
  function focusStop(xy) {
    const v = visibleRect();
    cam.s = desk() ? 1 : 0.9;
    cam.tx = (v.x0 + v.x1) / 2 - xy[0] * cam.s;
    cam.ty = (v.y0 + v.y1) / 2 + 50 - xy[1] * cam.s;   // +50: leave room for the callout above the pin
  }

  let currentRoute = null;
  function renderMap() {
    const journey = S.scene === 'journey';
    const search = S.scene === 'search';
    currentRoute = null;
    if (journey) {
      const dp = jDep(), j = journeyFor(dp);
      const pts = [];
      j.stops.forEach((st, i) => { pts.push(st.xy); (j.via[i] || []).forEach((w) => pts.push(w)); });
      const busI = j.stops.findIndex((x) => x.bus), mineI = j.stops.findIndex((x) => x.mine);
      currentRoute = { dp, j, pts, busI, mineI };
      // fit the part that matters: one stop before the bus → your stop → one stop after
      frame(j.stops.slice(Math.max(0, busI - 1), mineI + 2).map((x) => x.xy), 0.35, 1);
    } else if (S.stop === 'rp') focusStop(RP_XY);
    else focusStop(xyOf(S.stop));

    const plane = $('#mapPlane');
    plane.style.transform = `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.s})`;
    const rl = $('#routeLayer');
    if (currentRoute) {
      const { dp, j, pts } = currentRoute;
      const col = `var(--color-line-${dp.cat})`;
      const busXY = j.stops[currentRoute.busI]?.xy;
      const cut = pts.findIndex((p) => p === busXY);
      rl.innerHTML = `<path class="m-route past" stroke="${col}" style="stroke:${col}" d="${pl(pts.slice(0, cut + 1))}"/>
        <path class="m-route" style="stroke:${col}" d="${pl(pts.slice(cut))}"/>
        ${j.stops.map((s) => `<circle class="m-route-stop" style="stroke:${col}" cx="${s.xy[0]}" cy="${s.xy[1]}" r="${7 / cam.s}"/>`).join('')}`;
    } else rl.innerHTML = '';

    let h = '';
    if (S.stop !== 'rp') {
      D.stops.forEach((st, i) => {
        const sel = i === S.stop && !search;
        const lines = [...new Set(st.deps.normal.map((x) => x.line))].slice(0, 5);
        const lab = sel
          ? `<span class="pin-label"><span>${st.name}</span><span class="chips">${lines.map((l) => chip(l, D.cat(l), 'sm')).join('')}</span></span>`
          : `<span class="pin-label">${st.name}</span>`;
        const [x, y] = P(st.xy);
        h += `<button class="mpin pin ${sel ? 'is-selected' : ''} ${journey && !sel ? 'is-dim label-hidden' : ''}" style="left:${x}px;top:${y}px;z-index:${sel ? 5 : 2}" data-pin="${i}" aria-label="${st.name}, ${st.road}${sel ? ', valgt' : ''}">${lab}<span class="pin-head">${icon('bus.fill')}</span><span class="pin-pole"></span></button>`;
      });
      // SLICE: no blue dot until the position is known
      if (located()) {
        const [ux, uy] = P(USER_AT);
        h += `<div class="user-dot" style="left:${ux}px;top:${uy}px"><span class="halo"></span><span class="pulse"></span><span class="core"></span></div>`;
      }
    } else {
      const [x, y] = P(RP_XY);
      h += `<button class="mpin pin is-selected" style="left:${x}px;top:${y}px" aria-label="${D.remote.name}, valgt"><span class="pin-label"><span>${D.remote.name}</span></span><span class="pin-head">${icon('bus.fill')}</span><span class="pin-pole"></span></button>`;
    }
    if (currentRoute && currentRoute.busI >= 0) {
      const [bx, by] = P(currentRoute.j.stops[currentRoute.busI].xy);
      h += `<span class="j-bus" style="left:${bx}px;top:${by}px;--line:var(--color-line-${currentRoute.dp.cat})" aria-hidden="true">${icon('bus.fill')}</span>`;
    }
    $('#mapPins').innerHTML = h;
    collide();
  }
  // MapKit-like label collision: hide a label covered by the selected callout, a panel/card, or an earlier label
  function collide() {
    const hit = (a, b) => !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
    const blockers = [$('#sheet'), $('#detail'), $('#demoPanel'), $('#mapControls'), $('#demoBtn')].filter((e) => e && !e.hidden && e.offsetParent !== null).map((e) => e.getBoundingClientRect());
    const sel = $('#mapPins .pin.is-selected .pin-label');
    if (sel) blockers.push(sel.getBoundingClientRect());
    $$('#mapPins .pin:not(.is-selected)').forEach((p) => {
      if (p.classList.contains('label-hidden')) return;
      const b = p.querySelector('.pin-label').getBoundingClientRect();
      if (blockers.some((a) => hit(a, b))) p.classList.add('label-hidden'); else blockers.push(b);
    });
  }

  // ---------- panel sizing ----------
  function applyPanel() {
    const sh = $('#sheet'), body = $('#sheetBody');
    const compact = S.panel === 'compact' && S.scene === 'main';
    sh.classList.toggle('is-compact', compact);
    if (desk()) {
      const end = $('.peek-end', body);
      sh.style.height = compact && end ? `${end.offsetTop + 16}px` : '';
      if (compact) body.scrollTop = 0;
      $('#mapLegal').style.bottom = '';
    } else {
      const end = $('.peek-end', body);
      const peek = end ? end.offsetTop + 20 : 300;
      const hpx = compact ? peek : Math.round(innerHeight * 0.61);
      sh.style.height = hpx + 'px';
      $('#mapLegal').style.bottom = hpx + 16 + 'px';   // HIG/attribution: legal stays above the sheet
      $('#grabber').setAttribute('aria-label', `Arkhåndtag, ${compact ? 'lille' : 'halv'} højde. Tryk for at ændre.`);
    }
  }

  // ---------- render ----------
  function render(focusSel) {
    const root = document.documentElement;
    root.dataset.theme = S.theme;
    root.classList.toggle('rm', !!S.rm);
    if (S.scene === 'journey' && !wide() && desk()) S.panel = 'expanded';
    const body = $('#sheetBody');
    const panelScene = cardOpen() ? 'main' : S.scene;
    const st = body.scrollTop;
    body.innerHTML = ({ main: sceneMain, search: sceneSearch, journey: () => sceneJourney(false) })[panelScene]();
    if (panelScene === 'main' && focusSel !== 'keep-scroll') body.scrollTop = 0; else body.scrollTop = st;
    const host = $('#bandHost');
    if (host) {
      Band.render(host, departures(), { mode: stale() ? 'stale' : 'live', staleSince: '08.10', onTap: (dp) => openJourney(dp, 'chip') });
      const status = $('.band-status:not(.is-stale)', host);
      if (status) status.innerHTML = '<span class="band-dot"></span>Demodata · 08.14';   // web demo never claims realtime
      if (cardOpen()) $$('.bchip', host).forEach((c) => { if (c.dataset.key === S.jKey) { c.classList.add('is-source'); c.setAttribute('aria-current', 'true'); } });
      roving(host);
    }
    const det = $('#detail');
    det.hidden = !cardOpen();
    det.innerHTML = cardOpen() ? sceneJourney(true) : '';
    applyPanel();
    renderMap();
    syncDemo();
    writeHash();
    if (focusSel && focusSel !== 'keep-scroll') { const f = $(focusSel); if (f) f.focus({ preventScroll: false }); }
  }

  // ---------- SLICE: band keyboard + screen-reader model ----------
  // The band is ONE tab stop (roving tabindex). ←/→ step through departures in time order (not lane order),
  // Home/End jump to first/last, Enter/Space opens the trip. Each chip says "…, 2 af 7".
  // The group names itself and points (aria-describedby) to the key hint and to the list below.
  let bandIdx = 0;
  function roving(host) {
    const band = $('.band', host), chips = $$('.bchip', host);
    if (!band) return;
    const later = departures().length - chips.length;
    band.setAttribute('aria-label', `Tidslinje, ${chips.length} ${chips.length === 1 ? 'afgang' : 'afgange'} de næste 20 minutter`);
    band.setAttribute('aria-describedby', 'bandHint');
    band.insertAdjacentHTML('beforeend', `<span class="vh" id="bandHint">Piletaster skifter afgang. Alle ${chips.length + later} afgange står også i listen Afgange.</span>`);
    bandIdx = Math.min(bandIdx, Math.max(0, chips.length - 1));
    chips.forEach((c, i) => {
      c.tabIndex = i === bandIdx ? 0 : -1;
      c.setAttribute('aria-label', `${c.getAttribute('aria-label')}. ${i + 1} af ${chips.length}`);
    });
  }
  document.addEventListener('keydown', (e) => {
    const c = e.target.closest && e.target.closest('.bchip');
    if (!c) return;
    const chips = $$('#bandHost .bchip');
    const i = chips.indexOf(c);
    const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: chips.length - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    const j = Math.max(0, Math.min(chips.length - 1, to));
    chips[i].tabIndex = -1; chips[j].tabIndex = 0; bandIdx = j; chips[j].focus();
  });

  // ---------- SLICE: location actions ----------
  let askT;
  function announce(msg) { const r = $('#srStatus'); r.textContent = ''; setTimeout(() => (r.textContent = msg), 30); }
  function requestLocation() {
    if (S.loc === 'asking') return;
    S.loc = 'asking'; S.nb = false; render('[data-act="noop"]');
    announce('Venter på svar fra browseren');
    clearTimeout(askT);
    askT = setTimeout(() => {          // the prototype always "allows"; use the demo menu for the blocked/unavailable variants
      S.loc = 'granted'; S.stop = nearest(); S.panel = desk() ? S.panel : 'compact';
      glide();
      render('#stopTitle');
      const st = D.stops[S.stop];
      toast('Viser stoppesteder nær dig');
      announce(`Viser stoppesteder nær dig. Nærmeste: ${st.name}, ${st.road}, ${D.dist(distOf(S.stop))}`);
    }, 1400);
  }
  // camera move after the position arrives: the plane glides, pins cross-fade (both instant with Reduce Motion)
  function glide() {
    if (S.rm) return;
    const plane = $('#mapPlane'), pins = $('#mapPins');
    plane.classList.add('glide'); pins.classList.add('fading');
    setTimeout(() => { plane.classList.remove('glide'); pins.classList.remove('fading'); }, 520);
  }
  function syncLocBtn() {
    const b = $('#locBtn');
    b.classList.toggle('is-on', located());
    b.innerHTML = icon(S.loc === 'denied' || S.loc === 'unavailable' ? 'location.slash' : 'location.fill');
    b.setAttribute('aria-label', located() ? 'Centrér på min placering' : 'Vis stoppesteder nær dig');
    b.title = b.getAttribute('aria-label');
  }

  // ---------- SLICE: annotation (prototype only): what a screen reader would announce for the focused element ----------
  function annotate(el) {
    const box = $('#annot');
    box.hidden = !S.annot;
    if (!S.annot || !el || el === document.body) return;
    const role = el.matches('button') ? 'knap' : el.matches('h2,h3') ? `overskrift niveau ${el.tagName[1]}` : el.matches('a') ? 'link' : '';
    let name = el.getAttribute('aria-label') || el.textContent.replace(/\s+/g, ' ').trim();
    const ctx = [];
    const band = el.closest('.band'); if (band) ctx.push(`gruppe «${band.getAttribute('aria-label')}»`);
    const ol = el.closest('ol'); if (ol) { const li = el.closest('li'); ctx.push(`liste «Afgange», ${[...ol.children].indexOf(li) + 1} af ${ol.children.length}`); }
    const hint = band ? $('#bandHint').textContent : '';
    $('#annotTxt').innerHTML = `${ctx.length ? `<span class="a-ctx">${ctx.join(' › ')}</span>` : ''}<span class="a-name">${name}${role ? `, ${role}` : ''}</span>${hint ? `<span class="a-ctx">${hint}</span>` : ''}`;
  }
  document.addEventListener('focusin', (e) => annotate(e.target));

  // ---------- actions ----------
  function openJourney(dp, from) {
    // SLICE: the trip view is out of scope for this slice and unchanged; the prototype only confirms the target
    toast(`Turen for ${dp.line} mod ${dp.dest} åbner (uændret)`);
    return;
    returnTo = from === 'chip' ? `.bchip[data-key="${dp.line}|${dp.dest}"]` : `.row[data-dep="${dp.line}|${dp.dest}"]`;
    if (S.scene !== 'journey') prevPanel = S.panel;
    S.jKey = `${dp.line}|${dp.dest}`; S.scene = 'journey'; S.showEarlier = false;
    if (!wide()) S.panel = 'expanded';
    render(wide() ? '#jTitleCard' : '#jTitle');
  }
  function closeJourney() {
    S.scene = 'main'; S.panel = prevPanel; S.jKey = null;
    render(returnTo || '[data-act="search"]');
  }
  function openSearch() {
    if (S.scene !== 'search') prevPanel = S.scene === 'journey' ? prevPanel : S.panel;
    S.scene = 'search'; S.panel = 'expanded'; S.jKey = null;
    render('#q');
    const q = $('#q'); if (q) q.setSelectionRange(q.value.length, q.value.length);
  }
  function cancelSearch() { S.scene = 'main'; S.q = ''; S.panel = prevPanel; render('[data-act="search"]'); }
  function toggleDemo(open, returnFocus) {
    S.demo = open; syncDemo(); writeHash(); collide();
    if (open) $('#demoClose').focus(); else if (returnFocus) $('#demoBtn').focus();
  }
  let toastT;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 1800);
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act],[data-dep],[data-stop],[data-pick],[data-pin],[data-k]');
    if (!el) return;
    if (el.dataset.k) {
      S[el.dataset.k] = el.dataset.v === 'true' ? true : el.dataset.v === 'false' ? false : el.dataset.v;
      if (el.dataset.k === 'loc') { clearTimeout(askT); S.stop = located() ? nearest() : DEFAULT_STOP; S.nb = false; }  // SLICE
      render(); return;
    }
    if (el.dataset.dep) { const dp = departures().find((x) => `${x.line}|${x.dest}` === el.dataset.dep); openJourney(dp, 'row'); return; }
    if (el.dataset.stop) { S.stop = Number(el.dataset.stop); S.scene = 'main'; render(`[data-stop="${S.stop}"]`); return; }
    if (el.dataset.pin) { S.stop = Number(el.dataset.pin); S.scene = 'main'; S.jKey = null; render(`[data-pin="${S.stop}"]`); return; }
    if (el.dataset.pick) {
      const i = D.stops.findIndex((s) => s.key === el.dataset.pick);
      S.stop = i >= 0 ? i : 'rp'; if (S.stop === 'rp') D.remote.name = el.dataset.name;
      S.scene = 'main'; S.q = ''; S.panel = prevPanel; render('#sheetBody'); return;
    }
    const a = el.dataset.act;
    if (a === 'toggle') { S.panel = S.panel === 'expanded' ? 'compact' : 'expanded'; render(desk() ? '[data-act="toggle"]' : '#grabber'); }
    if (a === 'cycle') { const o = order(); S.stop = o[(o.indexOf(S.stop) + 1) % o.length]; render('[data-act="cycle"]'); }
    if (a === 'nearby') { S.stop = order()[0]; render('[data-act="cycle"]'); }
    // SLICE
    if (a === 'locate') requestLocation();
    if (a === 'dismissloc') { S.nb = true; render('#stopTitle'); toast('Du kan altid bruge placeringsknappen på kortet'); }
    if (a === 'search') openSearch();
    if (a === 'cancelsearch') cancelSearch();
    if (a === 'back' || a === 'closej') closeJourney();
    if (a === 'earlier') { S.showEarlier = true; render(); }
    if (a === 'disc') { S.discOpen = !S.discOpen; render('[data-act="disc"]'); }
    if (a === 'retry') { toast('Prøver igen …'); setTimeout(() => { S.net = 'ok'; render(); toast('Opdateret 08.14'); }, 700); }
  });
  document.addEventListener('input', (e) => {
    if (e.target.id !== 'q') return;
    S.q = e.target.value; $('#searchResults').innerHTML = searchResults(); writeHash();
  });
  document.addEventListener('keydown', (e) => {
    const inField = e.target.matches('input, textarea, [contenteditable]');
    if (e.key === '/' && !inField && !e.metaKey && !e.ctrlKey) { e.preventDefault(); openSearch(); return; }
    if (e.key === 'Escape') {
      if (S.demo) { e.preventDefault(); toggleDemo(false, true); return; }
      if (S.scene === 'journey') { e.preventDefault(); closeJourney(); return; }
      if (S.scene === 'search') { e.preventDefault(); cancelSearch(); return; }
    }
    if (S.scene === 'search' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      const rows = $$('#searchResults .row'); if (!rows.length) return;
      const i = rows.indexOf(document.activeElement);
      if (e.target.id === 'q' && e.key === 'ArrowDown') { e.preventDefault(); rows[0].focus(); return; }
      if (i >= 0) { e.preventDefault(); if (e.key === 'ArrowUp' && i === 0) $('#q').focus(); else rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))].focus(); }
    }
  });
  // a pin hidden behind the panel pans into view when it takes keyboard focus (WCAG 2.4.11)
  document.addEventListener('focusin', (e) => {
    const p = e.target.closest && e.target.closest('.mpin'); if (!p || !desk()) return;
    const edge = visibleRect().x0 - 48 + 8, r = p.getBoundingClientRect();
    if (r.left < edge) {
      const dx = edge + 40 - r.left; cam.tx += dx;
      $('#mapPlane').style.transform = `translate(${cam.tx}px, ${cam.ty}px) scale(${cam.s})`;
      $$('#mapPins > *').forEach((n) => { n.style.left = (parseFloat(n.style.left) + dx) + 'px'; });
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (S.demo && !e.target.closest('#demoPanel, #demoBtn')) toggleDemo(false, false);
  });

  // ---------- demo popover ----------
  const GROUPS = [
    ['Scenarie', 'variant', [['normal', 'Normal'], ['now', 'Bus ved stoppestedet'], ['issues', 'Forsinket og aflyst']]],
    ['Netværk', 'net', [['ok', 'Online'], ['offline', 'Offline']]],
    ['Driftsinformation', 'disruption', [['false', 'Ingen'], ['true', 'Omkørsel 5C']]],
    ['Udseende', 'theme', [['light', 'Lys'], ['dark', 'Mørk']]],
    ['Bevægelse', 'rm', [['false', 'Normal'], ['true', 'Reduceret']]],
    // SLICE
    ['Placering', 'loc', [['prompt', 'Ikke spurgt'], ['asking', 'Venter på svar'], ['granted', 'Tilladt'], ['denied', 'Blokeret'], ['unavailable', 'Ikke fundet']]],
    ['Skærmlæsernote', 'annot', [['false', 'Skjul'], ['true', 'Vis']]],
  ];
  function buildDemo() {
    $('#demoPanel').innerHTML = `<div class="dp-head"><b>Demodata · tilstande</b><button id="demoClose" class="ibtn" aria-label="Luk">${icon('xmark')}</button></div>
      <p>Alle afgange er syntetiske. Ingen kald til Rejseplanen.</p>
      ${GROUPS.map(([t, k, opts]) => `<h3 id="g-${k}">${t}</h3><div class="opts" role="group" aria-labelledby="g-${k}">${opts.map(([v, l]) => `<button class="opt" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`).join('')}`;
    $('#demoClose').addEventListener('click', () => toggleDemo(false, true));
    $('#demoBtn').addEventListener('click', () => toggleDemo(!S.demo, false));
    $('#locBtn').addEventListener('click', () => { if (located()) { render(); toast('Viser din placering (demo)'); } else requestLocation(); }); // SLICE
    $('#pitchBtn').addEventListener('click', (e) => { const on = e.currentTarget.getAttribute('aria-pressed') !== 'true'; e.currentTarget.setAttribute('aria-pressed', on); e.currentTarget.textContent = on ? '2D' : '3D'; toast('Prototypekortet er fladt; 3D findes i appen'); });
  }
  function syncDemo() {
    $('#demoPanel').hidden = !S.demo;
    $('#demoBtn').setAttribute('aria-expanded', !!S.demo);
    $$('#demoPanel .opt').forEach((b) => b.setAttribute('aria-pressed', String(S[b.dataset.k]) === b.dataset.v));
    syncLocBtn(); annotate(document.activeElement); // SLICE
  }

  let rz;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => render('keep-scroll'), 80); });
  if (!desk()) S.panel = 'compact';   // SLICE: phones open at the peek detent, like the build
  readHash();
  { const p = new URLSearchParams(location.hash.slice(1)); if (!p.has('stop')) S.stop = located() ? nearest() : DEFAULT_STOP; } // SLICE
  $('#mapPlane').innerHTML = mapSvg();
  buildDemo();
  render();
  if (S.scene === 'search') $('#q')?.focus();
})();
