# Slice: default stop and timeline (proposal, not yet approved)

**Prototype:** `index.html` in this folder. It is static and makes no network calls. It loads the approved base files unmodified from `../assets/` (tokens, ios-app.css, web.css, band.js, data.js, icons.js). This slice adds only `slice.css` (no new colour values) and `slice.js`, a fork of `web.js` in which every change is marked `SLICE`. Each state has a deep link, for example `#loc=prompt|asking|granted|denied|unavailable`, `&nb=true` (notice dismissed), `&variant=issues`, `&panel=compact|expanded`, `&theme=dark`, `&rm=true`, `&annot=true` (shows a box with what a screen reader would announce). The same states are in the "Demodata · tilstande" menu under Placering. Shots are in `shots/` (15 PNG: 01–07 at 390×844, 08–15 at 1280×800).

## What changes vs the current build
| | Current build | Proposal |
|---|---|---|
| First load without position | A blocking empty state ("Vi kan ikke se, hvor du er", "Åbn indstillinger"). In live mode `boot()` also asks for geolocation before it shows anything. | A real stop straight away: **Nørreport St. (Nørre Voldgade)** with band, list and map centred on it. The meta line reads "Nørre Voldgade · Stop 10845" (stop code instead of distance), and "I nærheden" becomes "Nær Nørreport St. · Uden din placering". |
| Asking for location | On page load. | Only after a click on "Tillad placering" or the map's locate button. If the Permissions API already reports `granted`, go straight to the nearest stop with no notice. |
| Location message | A full-sheet card. | An inline banner (same family as the offline and disruption banners), placed between the header and the band, with a 44 px dismiss ×. Variants: **prompt** "Vis stoppesteder nær dig" / "Indtil da viser vi Nørreport St." + **Tillad placering**. **asking** "Vælg «Tillad» i browserens dialog …" (shown with a disabled spinner). **denied**: desktop "Placering er blokeret for siden. Klik på ikonet til venstre for adressen, vælg Tillad ved Placering, og prøv igen."; phone "Placering er slået fra. Tillad placering for browseren i telefonens indstillinger, og prøv igen." **unavailable** "Vi kunne ikke finde din placering". Both of these offer "Prøv igen". "Åbn indstillinger" is gone. |
| Granted | – | The nearest stop replaces the default one (in the prototype the position is by Ørstedsparken, 75 m). The meta shows the distance, the blue dot appears, the camera glides 0.45 s while the pins cross-fade, the banner disappears, focus moves to the stop title, a polite live region says "Viser stoppesteder nær dig. Nærmeste: …", and a toast confirms. With Reduce Motion it all happens instantly and the spinner stops. |
| Dismissed | – | The notice stays hidden (proposal: remembered in localStorage). Focus goes to the stop title. A toast points to the locate button, whose label is "Vis stoppesteder nær dig" until a position is known. |
| Band (timeline) | One tab stop per chip. | **Visuals unchanged** (approved band: compressed 0–20 scale, ≤3 lanes with the first free lane taking the chip and a 4th lane only for departures ≤10 min, overflow counted in "+N senere i listen", delayed = bar from the ghost planned pin, cancelled = struck through at the planned minute, planned = outlined and italic). New: the band is **one tab stop** (roving tabindex). ←/→ (also ↑/↓) step through departures in time order, Home/End jump to the first or last, and Enter opens the trip. The group is named "Tidslinje, 6 afgange de næste 20 minutter" and has a hint ("Piletaster skifter afgang. Alle 7 afgange står også i listen Afgange."). Each chip ends with "3 af 6". |
| List (text alternative) | `div.rows` of buttons. | `h3 "Afgange"` + `<ol>` in the same order as the band, so it carries every departure, including the ones that overflow the band. Row names add the clock time, the data quality and the next departures, e.g. "Linje 150S mod Kokkedal St., aflyst, planlagt kl. 08.18. Næste afgang om 14 min". A second skip link is added: "Gå til afgangslisten". (The build's large-text swap from band to rows stays as it is.) |
| Phone first load | Half sheet. | Peek: header, notice and band, about 49 % of 844 px. After the grant, peek is about 34 %. |

Contrast was computed with token values. New text is secondary on surface, 6.55 (light) / 6.47 (dark). The location icon on surface is 4.0 in both themes (≥3 required). The "Prøv igen" pill is 15.1 / 11.8. Everything else is approved pairs.
Checked by script: tab order, roving arrows, focus after grant and after dismiss, live-region text, hash round-trip, no spinner animation with reduced motion, no page errors.

## Open questions for the owner
1. **Default stop:** fixed at Nørreport St. (Nørre Voldgade), or the last stop viewed (localStorage) once one exists? Nørreport is only the first-ever fallback.
2. **Tick labels:** the brief says Nu/5/10/15/20, but the approved band uses Nu/2/5/10/20 min on its compressed scale. I kept the approved labels. Should 15 replace 2?
3. **Shuffle** (the reference's random-stop button) is not added; the existing "1/4 ›" cycle covers browsing. Do you want it?
4. **Auto-prompt:** OK to stop asking for location on load (the current build asks in `boot()`) and ask only when the user acts?
5. **Denied help text** is deliberately generic. Should we link to per-browser help pages (Chrome, Safari, Firefox) instead?
6. Nørreport has two stops with the same name in the nearby list (Nørre Voldgade / Frederiksborggade). This is existing data, but the default state makes it more visible.

## Not verified / risks
The map is the illustrative SVG, so MapLibre camera easing, real tiles and label collision are not represented. Not tested: real permission prompts, screen readers (the announcements are modelled, not heard), 200 % zoom, and widths other than 390 and 1280. The prompt notice adds about 115 px to the phone peek.

## Owner decisions (2026-11-05) — APPROVED for implementation
1. Default stop is fixed: Nørreport St.
2. Timeline labels become Nu / 5 / 10 / 15 / 20 min (15 replaces 2).
3. No shuffle (random stop) button; keep the existing "1/4 ›" stepper.
4. Do not ask for location on page load; ask only when the user taps "Tillad placering".
5. Blocked-location text stays generic, no per-browser help links.
6. Duplicate "Nørreport" stops in the nearby list are known data behaviour; out of scope.
