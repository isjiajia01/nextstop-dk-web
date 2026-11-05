# Næste (web demo)

Bus-arrivals demo for Denmark, web version of the iOS prototype in `nextstop-dk`. Arrivals use synthetic demo data by default; a configured backend can provide live data. The map uses generated Rejseplanen 5C geometry when available and falls back to the fixture.

## Commands
- `npm install`
- `npm run dev` / `npm run build` / `npm run preview`
- `npm test` (Vitest: domain tests plus backend cache, budget, coalescing, stale-fallback, adapter, and HTTP tests)
- `npm run typecheck`
- `npm run server` (live backend; requires `REJSEPLANEN_ACCESS_ID` only when a request is made)

## Data seam
The UI only talks to `TransitRepository` (`src/data/types.ts`). `FixtureRepository` is the demo implementation. A real implementation must run behind your own server or proxy: **a browser must never hold the Rejseplanen key.** The repository now includes a credential-free-to-the-browser Node adapter and local HTTP server in `server/`; see [docs/backend.md](docs/backend.md) for configuration, durability guarantees, and the documented API assumptions.

## Map choice
MapLibre GL JS with OpenFreeMap vector tiles (positron/dark): no API key, open licence, WebGL with a fallback notice if tiles or WebGL fail.
Attribution shown on the map: OpenFreeMap, © OpenMapTiles, data © OpenStreetMap contributors, MapLibre; generated 5C geometry adds Rejseplanen CC BY 4.0 credit when used.

## Layout
- <768px: bottom sheet (peek/half/full), as the iOS prototype.
- ≥768px: floating left panel (compact/expanded, toggle in header); ≥1280px: journey opens as a second card.
- Search opens with `/`. Esc closes demo panel, then journey, then search.
- Focus ring: 3px ink with 2px surface halo (light on the dark band).
- Demo panel (top right) switches scenarios, network, disruption, theme, text size, motion. Hash deep links, e.g. `#scenario=issues&theme=dark&detent=peek`.

## Design status
Approved: iOS prototype (phone) and the designer's web prototype in `docs/prototype/` (open `index.html`; differences list in `NOTES.md`). Journey fits the stops around the bus and your stop; "Vis hele ruten" shows the whole route.
Experimental (not approved design): palette "Fjord" (coral accent, blue-grey neutrals), opt-in via the demo panel or `#palette=fjord`.

## Verified / not verified
Verified: unit tests, typecheck, production build, headless-browser screenshots (phone, iPad portrait, 1024, 1440 with journey card, dark mode).
Not verified: real devices, screen readers, a full keyboard pass, measured contrast of the final build, Safari/Firefox.

## 3D bus model
The simulated 5C buses render the low-poly `bus.glb` from the [Low-poly Vehicles Kit](https://toolbenchdev.com/gamedev/cc0-game-assets/low-poly-vehicles-kit/) by Toolbench. The model has 744 triangles and is oriented with its nose along local +Z; each bus clone recolours only its own `Paint` material in the line colour. The GLB is copied unchanged to `public/models/bus.glb` (44 KB).

The kit is released under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) (public domain dedication); attribution is not required, but the source is recorded here. The downloaded archive's `LICENSE.txt` and `manifest.json` confirm the licence and the bus dimensions (11.16 × 2.8 × 3.1 m). If Three.js or the GLB cannot load, the bus layer falls back to the built-in box mesh.
