# Simulated 3D buses

`src/domain/busSimulation.ts` produces the deterministic demo fleet positions, bearings and per-direction spacing. `src/ui/busLayer.ts` renders those buses in a MapLibre custom layer using the map's existing WebGL context. Three.js and `GLTFLoader` are dynamically imported only when the bus layer is added, so the main application bundle does not include them.

## Model

- File: `public/models/bus.glb`, copied unchanged from `glb/bus.glb` in the Low-poly Vehicles Kit 1.0 archive.
- Source: [Low-poly Vehicles Kit](https://toolbenchdev.com/gamedev/cc0-game-assets/low-poly-vehicles-kit/) by Toolbench.
- Licence: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). The archive's `LICENSE.txt` contains the CC0 1.0 legal code and its `manifest.json` declares `"licence": "CC0 1.0"`. Credit is not required; this note records the source.
- Geometry: 744 triangles, 11.16 × 2.8 × 3.1 m, nose along glTF +Z, with separate `Wheel_FL/FR/RL/RR` objects. The `Paint` material controls the bus body colour; each rendered bus receives cloned materials so recolouring one bus does not affect another.

## Rendering and fallback

The renderer follows the MapLibre Three.js example: it passes `options.defaultProjectionData.mainMatrix` to the Three camera, shares the map canvas and GL context, sets `autoClear = false`, and calls `renderer.resetState()` before each Three draw so MapLibre's GL state is restored. Buses keep a minimum on-screen length at city zoom, and the selected journey bus is 22% larger.

If `three`, `GLTFLoader`, or `bus.glb` fails to load, the layer retains its original shader-based box mesh as a visible fallback with identical movement. A WebGL context loss and the reduced-motion setting keep the existing DOM-marker and static-position behaviour.
