/* Afgangsbåndet (the departure band). It plots 0–20 min on a gently compressed scale (x = (m/20)^0.75) from the
   stander (stop pole) at "Nu". The first 5 minutes take 35% of the width instead of 25%, because crowding and
   the "can I make it?" decisions both happen there.
   Each line's next departure sits at its minute, and the chip's anchor edge marks the exact minute.
   Up to 3 lanes; anything left over is counted in the band header. Shared by index.html and components.html. */
window.Band = (() => {
  const SPAN = 20;            // minutes shown
  const PAD_L = 14;           // pole (6) + gap (8)
  const PAD_R = 4;
  const AXIS = 24;            // axis + tick labels height
  const GAP = 4;              // min horizontal gap between chips in a lane
  const MAX_LANES = 3;        // a 4th lane opens only to keep a departure due within 10 min on the band
  const SCALE = (m) => Math.pow(Math.max(0, Math.min(m, SPAN)) / SPAN, 0.75);
  const TICKS = [2, 5, 10, 15, 20];

  const label = (dp) => {
    const base = `Linje ${dp.line} mod ${dp.dest}`;
    if (dp.status === 'cancelled') return `${base}, aflyst`;
    const when = dp.m === 0 ? 'nu' : `om ${dp.m} ${dp.m === 1 ? 'minut' : 'minutter'}`;
    if (dp.status === 'delayed') return `${base}, ${when}, forsinket ${dp.m - dp.planned} minutter`;
    if (dp.status === 'planned') return `${base}, ${when} ifølge køreplanen`;
    return `${base}, ${when}`;
  };

  const chipInner = (dp) => {
    let min;
    if (dp.status === 'cancelled') min = 'Aflyst';
    else if (dp.m === 0) min = 'Nu';
    else min = String(dp.m);
    const warn = dp.disrupted ? `<span class="bchip-warn" aria-hidden="true">${icon('exclamationmark.triangle.fill')}</span>` : '';
    return `<span class="bchip-num">${dp.line}</span><span class="bchip-min">${min}</span>${warn}`;
  };

  function skeleton(el) {
    el.innerHTML = `
      <div class="band is-loading" aria-busy="true" aria-label="Henter afgange">
        <div class="band-head"><span class="band-status"><span class="band-dot"></span>Henter afgange …</span><span></span></div>
        <div class="band-field" style="height:${AXIS + 2 * 40 + 8}px">
          <div class="band-pole"></div>
          <span class="bskel" style="left:${PAD_L + 10}px;bottom:${AXIS + 10}px;width:58px"></span>
          <span class="bskel" style="left:${PAD_L + 90}px;bottom:${AXIS + 50}px;width:66px"></span>
          <span class="bskel" style="left:${PAD_L + 150}px;bottom:${AXIS + 10}px;width:54px"></span>
          <span class="bskel" style="left:${PAD_L + 240}px;bottom:${AXIS + 10}px;width:62px"></span>
          ${axisHtml(329)}
        </div>
      </div>`;
  }

  function axisHtml(W) {
    const X = (m) => PAD_L + SCALE(m) * (W - PAD_L - PAD_R);
    let h = `<div class="band-axis" style="left:${PAD_L}px;width:${W - PAD_L - PAD_R}px;bottom:${AXIS - 2}px"></div>`;
    for (let m = 1; m <= SPAN; m++) {
      const major = TICKS.includes(m);
      h += `<span class="band-tick ${major ? 'major' : ''}" style="left:${X(m) - 0.75}px;bottom:${AXIS - (major ? 7 : 5)}px"></span>`;
      if (major && m !== 15) {
        const txt = m === SPAN ? '20 min' : String(m);
        const anchor = m === SPAN ? 'right' : 'center';
        const style = anchor === 'right' ? `right:${PAD_R}px` : `left:${X(m)}px;transform:translateX(-50%)`;
        h += `<span class="band-tlabel" style="${style}">${txt}</span>`;
      }
    }
    h += `<span class="band-tlabel band-nu" style="left:-1px">Nu</span>`;
    return h;
  }

  /**
   * @param {HTMLElement} el container
   * @param {Array} deps departures (any order)
   * @param {Object} o { mode:'live'|'stale', updated:'08.14', staleSince:'08.10', onTap(dp), maxLanes }
   */
  function render(el, deps, o = {}) {
    const prev = el.querySelector('.band:not(.is-loading)');
    const W = Math.max(el.clientWidth || 0, 240) - 24; // band horizontal padding 12+12
    const X = (m) => PAD_L + SCALE(m) * (W - PAD_L - PAD_R);
    const inBand = deps.filter((dp) => (dp.status === 'cancelled' ? dp.planned : dp.m) <= SPAN)
      .sort((a, b) => (a.status === 'cancelled' ? a.planned : a.m) - (b.status === 'cancelled' ? b.planned : b.m));
    const later = deps.filter((dp) => dp.m > SPAN).length;
    const maxLanes = o.maxLanes || MAX_LANES;

    // measure
    const meas = document.createElement('div');
    meas.className = 'band-measure';
    meas.innerHTML = inBand.map((dp) => `<span class="bchip ${cls(dp)}">${chipInner(dp)}</span>`).join('');
    el.appendChild(meas);
    const widths = [...meas.children].map((c) => c.getBoundingClientRect().width || 60);
    const chipH = meas.children[0] ? meas.children[0].getBoundingClientRect().height || 32 : 32;
    meas.remove();
    const laneH = chipH + 8;

    const lanes = Array.from({ length: maxLanes }, () => []);
    const placed = []; let overflow = 0;
    inBand.forEach((dp, i) => {
      const w = widths[i];
      const m = dp.status === 'cancelled' ? dp.planned : dp.m;
      const x = X(m);
      let left = x, flip = false;
      if (x + w > W - PAD_R + 2) { left = x - w; flip = true; }
      const fits = (ivs) => ivs.every(([a, b]) => left + w + GAP <= a || left >= b + GAP);
      let lane = lanes.findIndex(fits);
      if (lane < 0 && m <= 10 && lanes.length < MAX_LANES + 1) { lanes.push([]); lane = lanes.length - 1; }
      if (lane < 0) { overflow++; return; }
      lanes[lane].push([left, left + w]);
      placed.push({ dp, x, left, flip, lane, w });
    });
    const used = Math.max(1, ...placed.map((p) => p.lane + 1));
    const fieldH = AXIS + (placed.length ? used : 1.3) * laneH + 6;

    const status = o.mode === 'stale'
      ? `<span class="band-status is-stale">${icon('wifi.slash')}Offline · tider fra ${o.staleSince || '08.10'}</span>`
      : `<span class="band-status"><span class="band-dot"></span>Realtid · ${o.updated || '08.14'}</span>`;
    const more = overflow + later;
    const right = more ? `<span class="band-more">+${more} senere i listen</span>` : '<span class="band-more">Næste 20 min</span>';

    let field = `<div class="band-pole"></div>`;
    placed.forEach((p) => {
      const bottom = AXIS + 8 + p.lane * laneH;
      const stemX = p.flip ? p.left + p.w - 1 : p.left;
      field += `<span class="band-stem" style="left:${stemX}px;bottom:${AXIS - 2}px;height:${bottom - AXIS + 4}px"></span>`;
      if (p.dp.status === 'delayed') {
        const px = X(p.dp.planned);
        field += `<span class="band-delaybar" style="left:${px}px;width:${p.x - px}px;bottom:${AXIS - 3.5}px"></span>`;
        field += `<span class="band-ghost" style="left:${px - 5}px;bottom:${AXIS - 7}px" title="Planlagt"></span>`;
      }
      field += `<span class="band-pin cat-${p.dp.cat}" style="left:${p.x - 5}px;bottom:${AXIS - 7}px"></span>`;
    });
    if (!placed.length) {
      const nx = deps.filter((d) => d.status !== 'cancelled').sort((a, b) => a.m - b.m)[0];
      field += `<span class="band-empty">Ingen afgange de næste 20 min${nx ? `<br><b>Næste: ${nx.line} om ${nx.m} min</b>` : ''}</span>`;
    }
    field += axisHtml(W);
    placed.forEach((p) => {
      const bottom = AXIS + 8 + p.lane * laneH;
      field += `<button class="bchip ${cls(p.dp)} ${p.flip ? 'flip' : ''}" data-key="${p.dp.line}|${p.dp.dest}"
        style="left:${p.left}px;bottom:${bottom}px" aria-label="${label(p.dp)}">${chipInner(p.dp)}</button>`;
    });

    const html = `
      <div class="band ${o.mode === 'stale' ? 'is-stale' : ''}" role="group" aria-label="Afgange de næste 20 minutter">
        <div class="band-head">${status}${right}</div>
        <div class="band-field" style="height:${fieldH}px">${field}</div>
      </div>`;

    // keyed position transition: remember old positions, then animate (skipped when Reduce Motion is on)
    const old = {};
    if (prev && !document.documentElement.classList.contains('rm')) {
      prev.querySelectorAll('.bchip').forEach((c) => { old[c.dataset.key] = c.getBoundingClientRect(); });
    }
    el.innerHTML = html;
    if (Object.keys(old).length) {
      el.querySelectorAll('.bchip').forEach((c) => {
        const r0 = old[c.dataset.key]; if (!r0) return;
        const r1 = c.getBoundingClientRect();
        const dx = r0.left - r1.left, dy = r0.top - r1.top;
        if (!dx && !dy) return;
        c.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }],
          { duration: 650, easing: 'cubic-bezier(.2,.8,.2,1)' });
      });
    }
    if (o.onTap) {
      el.querySelectorAll('.bchip').forEach((c, i) => {
        c.addEventListener('click', () => o.onTap(placed[i].dp));
      });
    }
    const nowChip = placed.find((p) => p.dp.m === 0 && p.dp.status !== 'cancelled');
    el.querySelector('.band').classList.toggle('has-now', !!nowChip);
  }

  function cls(dp) {
    return [`cat-${dp.cat}`, dp.m === 0 && dp.status !== 'cancelled' ? 'is-now' : '',
      dp.status !== 'rt' ? `is-${dp.status}` : ''].join(' ');
  }

  return { render, skeleton, label, SPAN, SCALE };
})();
