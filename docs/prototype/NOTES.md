# Næste web: layout prototype notes (pre-approval)

**Prototype:** `~/.cache/agent-runtime/nextstop-dk-web/web-prototype/index.html`. It is static and needs no build or network. To view it, open the file directly. Every state has a deep link, e.g. `#scene=journey&jKey=5C|Lufthavnen&theme=dark`, `#panel=compact`, `#scene=search&q=norre`, `#demo=true`.

The assets `tokens.css`, `band.js`, `icons.js`, `data.js` and `ios-app.css` are unmodified copies from the iOS prototype. The web layer is `web.css` and `web.js`. It adds no new colour values, only token colours and `color-mix` of tokens. The map is an illustrative SVG and is labelled "Illustrativt kort".

**Rendered** with agent-browser (headless). Shots are in `web-prototype/shots/` (18 PNG). They cover:
- **1440×900:** expanded, compact, journey card (light, and dark with delayed/cancelled), demo popover (dark), row hover, chip hover, focus on the toggle, focus on a band chip.
- **1024×768:** expanded, compact (offline), search, keyboard focus in the search results, in-panel journey (dark).
- **820×1180:** expanded, in-panel journey, compact (dark, disruption).
- **390 px:** phone fallback, only a sanity check.

**Keyboard checks (scripted):**
- `/` opens search with the field focused. `↓` moves to the first result. `Esc` closes search and focus returns to the search button.
- Esc order: demo popover, then journey, then search.
- Focus returns to "Luk" → demo button, and to the source row or chip after the journey closes.
- Clicking outside closes the popover.
- Opening search closes the journey card.
- Resizing across 1280 px moves the journey between the card and the panel.
- No page errors.

**Contrast (WCAG formula, token values):**
- Ink ring on panel, surface, map and sunken: ≥11.8. On-band ring on the band: 15.5 / 17.0.
- Secondary text on hover/source rows (6%): 5.8 / 5.5. At 9%: 5.5 / 5.0.
- On-band text on the hovered minutes cell: 5.8. Source bar: 15.6 / 10.8.

## Differences from the current build (`src/styles`, `src/ui/app.ts`, shots v1280/v1024/v820/d-journey4, t-compact)

| Item | Current build | Prototype | Suggested change |
|---|---|---|---|
| Panel top inset | Grabber hidden, body `padding-top:0`. The title sits about 10 px under the 32 px corner. | 16 px, the same as the sides. | `@media(min-width:768px){.sheet-body{padding:16px 16px 24px}.s-head{padding-top:0}}` |
| Expanded height | Fixed `H−24` (JS). The in-panel journey and short search results leave up to about 450 px of empty card (v820). | The panel hugs its content, capped at the viewport. | `.sheet{height:auto;max-height:calc(100dvh - 24px)}` `.sheet-body{flex:1 1 auto;min-height:0}`. JS sets `height` only when compact. |
| Compact height | `peek-end.offsetTop+28` then `+16`. A clipped "Afgange" header sliver shows (t-compact). | It ends 16 px below the band. | `detentPx('peek')` = `end.offsetTop + 16` on desktop, with no extra +16. |
| Toggle position | First action (chevron before search). | Last action, after `1/4 ›`, as in the sketch. | Move `[data-act=toggle]` after the cycle button. |
| Journey card header | The close button sits alone on a row, using `xmark.circle.fill` inside a grey `.ibtn` (a double circle). Then `.j-head{margin-top:-8px}`. About 50 px is wasted. | One row: chip, title and a 44 px `.ibtn` with a plain `xmark`. | `.j-cardhead{display:flex;align-items:center;gap:10px}` `.j-cardhead h2{flex:1;min-width:0;margin:0}`. Remove the `-8px` hack. Card padding `16px 16px 24px` (now 12/16/20). |
| Journey source row | Reuses `.is-current`: 14% stander fill, which turns olive (#443E29) in dark and reads as "stop" yellow. | `.is-source`: ink 6% fill plus a 4 px inset ink bar (a shape, not only colour). The band chip keeps its stander outline. | `.row.is-source{background:color-mix(in srgb,var(--c-primary) 6%,var(--c-surface));box-shadow:inset 4px 0 0 var(--c-primary)}` |
| Route fit | `map.fit(all 16 stops)`, `maxZoom 15.5`. Bus → your stop is about 40 px wide, with pins stacked, and roughly 70% of the free map shows the irrelevant end of the route. | Fit stops from the one before the bus to one after your stop. The full route is still drawn. Extra inset so the "Dit stop" callout never clips. | `fit(stops.slice(max(0,bus-1), mine+2), {top:182,right:168,bottom:72,left:cardRight+12+108})` |
| Pin labels | Labels overlap the callout and each other (Kongens Nytorv / Rådhuspladsen in d-journey4). | Hide labels that sit under the selected callout, the panel, the card or the controls. In journey, dimmed pins have no labels. | After each camera move, set `.pin.label-hidden` (the rule exists in app.css) using rect intersection. |
| Row hover | 4% ink, hard to see. | 6% ink. Source row hover is 9%. | `.row:hover{background:color-mix(in srgb,var(--c-primary) 6%,var(--c-surface))}` |
| Band chip hover | `filter:brightness(1.12)` on the whole chip, invisible on red and blue. | The minutes cell lightens (22% on-band) and the number gets 1.12. | `.bchip:hover .bchip-min{background:color-mix(in srgb,var(--color-on-band) 22%,var(--color-band-cell))}` (not on Nu/delay/planned/cancelled) |
| Other hovers | None on `.ibtn`, `.cycle`, map controls, demo button or popover options. | A subtle fill on each. | `.ibtn:hover,.cycle:hover{background:color-mix(in srgb,var(--c-primary) 10%,var(--c-surface-sunken))}` and similar (see web.css "hover"). |
| Row focus ring | The outer ring is clipped by `.rows{overflow:hidden}` on the left and right (from CSS, not rendered). | An inset ring with a 2 px surface halo. | `.rows .row:focus-visible{outline-offset:-5px;box-shadow:inset 0 0 0 2px var(--c-surface)}` |
| Search field focus | `.field input{outline:none}` beats `:focus-visible`, so the field shows no ring (from CSS). | The ring sits on `.field`. The gap to "Annuller" is 12 px. | `.field:focus-within{outline:3px solid var(--c-primary);outline-offset:2px;box-shadow:0 0 0 2px var(--c-surface)}` `.search-bar{gap:12px}` |
| Copy | "1 resultater". | "1 resultat". | Pluralise in `app.ts:309`. |

Unchanged and matching the build: the panel at 400/440 px, the card at 380 px, the demo button `right:68px`, the popover `top:64px;width:340px`, legal at the bottom right, the band at the full panel width with its fixed scale and lanes, and the focus ring colours.

## Open questions / risks
1. **Route fit** ("bus → your stop → +1" instead of the whole route) is my call. Show the whole route only on demand, e.g. via a "Vis hele ruten" (Show the whole route) control? I did not add one.
2. **Source row** marking changes from yellow to ink, so the list no longer uses the "stop" colour for a departure. The band chip stays yellow-outlined (approved). Is the asymmetry OK?
3. **Fidelity:** the prototype map is flat and illustrative. MapLibre pitch, real tiles and real label collision are not represented.
4. **Not verified:** real-device input, screen readers, 200% zoom, the 768–819 range (only rendered at 820), and the current build itself. Two rows in the table are inferred from its CSS, not rendered.
