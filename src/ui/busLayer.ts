import type { CustomLayerInterface, Map as MlMap, MercatorCoordinate } from 'maplibre-gl';
import type { LatLng } from '../data/types';
import { simulateBuses, type SimulatedBus } from '../domain/busSimulation';
import { busDisplayScale } from '../domain/busScale';
import { cumulativeLengths, distanceMeters } from '../domain/routeGeometry';

export interface BusLayerData {
  routes: LatLng[][];
  color: string;
  selected: { position: LatLng; bearing: number } | null;
}

type ThreeModule = typeof import('three');
type ThreeObject = import('three').Object3D;
type ThreeScene = import('three').Scene;
type ThreeCamera = import('three').Camera;
type ThreeRenderer = import('three').WebGLRenderer;
type GltfScene = import('three/addons/loaders/GLTFLoader.js').GLTF;

const MODEL_URL = '/models/bus.glb';
const BUS_LENGTH_METRES = 11.16;
/** The fallback box drawn by the local shader is 20 m long. */
const FALLBACK_BOX_LENGTH_METRES = 20;

/** Low-poly buses rendered in the map's shared WebGL context. */
export function createBusLayer(mercator: typeof MercatorCoordinate, reduceMotion: () => boolean, failed: () => void) {
  let data: BusLayerData = { routes: [], color: '#00788a', selected: null };
  const startedAt = Date.now();
  let frozenTime = 0;
  let startDistances: number[] = [];
  let vertexCount = 0;
  let dataKey = '';
  let suspended = false;
  let map: MlMap | null = null;
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastFrame = 0;
  let vehicles: SimulatedBus[] = [];

  let THREE: ThreeModule | null = null;
  let threeScene: ThreeScene | null = null;
  let threeCamera: ThreeCamera | null = null;
  let threeRenderer: ThreeRenderer | null = null;
  let modelTemplate: ThreeObject | null = null;
  let modelInstances: ThreeObject[] = [];
  let modelColor = '';
  let modelReady = false;
  let modelLoadFailed = false;

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const motionChange = () => { frozenTime = Date.now() - startedAt; lastFrame = 0; map?.triggerRepaint(); schedule(); };
  const clearTimer = () => { if (timer !== null) clearTimeout(timer); timer = null; };
  const schedule = () => {
    clearTimer();
    if (!suspended && !document.hidden && !reduceMotion() && data.routes.length && map) {
      timer = setTimeout(() => { timer = null; map?.triggerRepaint(); }, 34);
    }
  };
  const visibility = () => { clearTimer(); if (!document.hidden) { map?.triggerRepaint(); schedule(); } };
  const validColor = (value: string) => /^#[0-9a-f]{6}$/i.test(value) ? value : '#00788a';

  const disposeInstanceMaterials = (root: ThreeObject) => {
    root.traverse((object) => {
      const mesh = object as unknown as { isMesh?: boolean; material?: import('three').Material | import('three').Material[] };
      if (!mesh.isMesh || !mesh.material) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => material.dispose());
    });
  };

  const clearThreeInstances = () => {
    if (!threeScene) return;
    for (const instance of modelInstances) {
      threeScene.remove(instance);
      disposeInstanceMaterials(instance);
    }
    modelInstances = [];
    modelColor = '';
  };

  const buildThreeInstances = (color: string, count: number) => {
    if (!THREE || !threeScene || !modelTemplate) return;
    if (modelColor === color && modelInstances.length === count) return;
    clearThreeInstances();
    for (let i = 0; i < count; i++) {
      const instance = modelTemplate.clone(true);
      instance.traverse((object) => {
        const mesh = object as unknown as { isMesh?: boolean; material?: import('three').Material | import('three').Material[] };
        if (!mesh.isMesh || !mesh.material) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const recolored = materials.map((material) => {
          const copy = material.clone();
          if (copy.name === 'Paint' || copy.name.startsWith('Paint')) {
            const paint = copy as import('three').MeshStandardMaterial;
            paint.color.set(color);
            paint.needsUpdate = true;
          }
          return copy;
        });
        mesh.material = Array.isArray(mesh.material) ? recolored : recolored[0];
      });
      threeScene.add(instance);
      modelInstances.push(instance);
    }
    modelColor = color;
  };

  const initThree = async (gl: WebGLRenderingContext) => {
    try {
      const [threeModule, loaderModule] = await Promise.all([
        import('three'),
        import('three/addons/loaders/GLTFLoader.js'),
      ]);
      if (suspended || !map) return;
      THREE = threeModule;
      threeScene = new THREE.Scene();
      threeCamera = new THREE.Camera();
      const hemisphere = new THREE.HemisphereLight(0xffffff, 0x4d5660, 1.8);
      hemisphere.position.set(0, 1, 0);
      threeScene.add(hemisphere);
      const key = new THREE.DirectionalLight(0xffffff, 2.2);
      key.position.set(-3, 8, 5);
      threeScene.add(key);
      const fill = new THREE.DirectionalLight(0x9fc5e8, 0.7);
      fill.position.set(4, 3, -6);
      threeScene.add(fill);

      threeRenderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true, alpha: true });
      threeRenderer.autoClear = false;
      threeRenderer.setPixelRatio(1);
      if ('outputColorSpace' in threeRenderer && 'SRGBColorSpace' in THREE) {
        threeRenderer.outputColorSpace = THREE.SRGBColorSpace;
      }
      const loader = new loaderModule.GLTFLoader();
      loader.load(MODEL_URL, (gltf: GltfScene) => {
        if (suspended || !threeScene) return;
        modelTemplate = gltf.scene;
        modelReady = true;
        buildThreeInstances(validColor(data.color), vehicles.length);
        map?.triggerRepaint();
      }, undefined, (error: unknown) => {
        modelLoadFailed = true;
        console.warn('Bus glTF could not be loaded; using the box-mesh fallback.', error);
        map?.triggerRepaint();
      });
    } catch (error) {
      modelLoadFailed = true;
      console.warn('Three.js bus renderer unavailable; using the box-mesh fallback.', error);
      map?.triggerRepaint();
    }
  };

  const layer: CustomLayerInterface = {
    id: 'simulated-buses', type: 'custom', renderingMode: '3d',
    onAdd(m, gl) {
      map = m; suspended = false;
      try {
        const shader = (type: number, source: string) => {
          const s = gl.createShader(type);
          if (!s) throw new Error('shader allocation');
          gl.shaderSource(s, source); gl.compileShader(s);
          if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); throw new Error('shader compilation'); }
          return s;
        };
        const vs = shader(gl.VERTEX_SHADER, `attribute vec3 a_pos; attribute float a_shade;
          uniform mat4 u_matrix; uniform vec3 u_origin; uniform float u_scale; uniform float u_angle;
          varying float v_shade;
          void main() { float c=cos(u_angle), s=sin(u_angle); vec2 p=vec2(a_pos.x*c-a_pos.y*s,a_pos.x*s+a_pos.y*c);
            gl_Position=u_matrix*vec4(u_origin+vec3(p*u_scale,a_pos.z*u_scale),1.0); v_shade=a_shade; }`);
        const fs = shader(gl.FRAGMENT_SHADER, `precision mediump float; uniform vec3 u_color; varying float v_shade;
          void main() { vec3 color = v_shade > 1.0 ? mix(u_color, vec3(1.0), 0.72) : v_shade < 0.0 ? vec3(0.05, 0.10, 0.13) : u_color*v_shade;
            gl_FragColor=vec4(color,1.0); }`);
        program = gl.createProgram(); if (!program) throw new Error('program allocation');
        gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
        gl.deleteShader(vs); gl.deleteShader(fs);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('program linking');
        buffer = gl.createBuffer(); if (!buffer) throw new Error('buffer allocation');
        // Keep the original rectangular renderer as a local fallback for a missing model or Three.js import.
        const vertices: number[] = [];
        const quad = (a: number[], b: number[], c: number[], d: number[], shade: number) => {
          for (const p of [a,b,c,a,c,d]) vertices.push(...p, shade);
        };
        const box = (x: number, y: number, z0: number, z1: number) => {
          quad([-x,-y,z1],[x,-y,z1],[x,y,z1],[-x,y,z1],2.0);
          quad([-x,-y,z0],[-x,y,z0],[-x,y,z1],[-x,-y,z1],0.72);
          quad([x,y,z0],[x,-y,z0],[x,-y,z1],[x,y,z1],0.85);
          quad([x,-y,z0],[-x,-y,z0],[-x,-y,z1],[x,-y,z1],0.9);
          quad([-x,y,z0],[x,y,z0],[x,y,z1],[-x,y,z1],0.8);
        };
        box(3.5, 10, 0.5, 6);
        quad([-3.51,-9,3],[-3.51,9,3],[-3.51,9,5.1],[-3.51,-9,5.1],-1);
        quad([3.51,9,3],[3.51,-9,3],[3.51,-9,5.1],[3.51,9,5.1],-1);
        quad([-2.8,-10.03,3],[2.8,-10.03,3],[2.8,-10.03,5.1],[-2.8,-10.03,5.1],-1);
        quad([2.8,10.03,3],[-2.8,10.03,3],[-2.8,10.03,5.1],[2.8,10.03,5.1],-1);
        vertexCount = vertices.length / 4;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
        document.addEventListener('visibilitychange', visibility); motion.addEventListener('change', motionChange); schedule();
        void initThree(gl);
      } catch (error) { console.error('Bus layer initialization failed', error); failed(); }
    },
    render(gl, options) {
      if (suspended || !map || !program || !buffer || !data.routes.length || document.hidden) return;
      const now = performance.now();
      if (!vehicles.length || (!reduceMotion() && now - lastFrame >= 33)) {
        lastFrame = now;
        vehicles = simulateBuses(data.routes, reduceMotion() ? frozenTime : Date.now() - startedAt, data.selected ? 7 : 8, startDistances);
        if (data.selected) vehicles.push({ position: data.selected.position, bearing: data.selected.bearing, distance: 0, direction: -1 });
        if (modelReady) buildThreeInstances(validColor(data.color), vehicles.length);
      }
      const color = validColor(data.color);
      const zoom = map.getZoom();
      if (modelReady && !modelLoadFailed && threeRenderer && threeScene && threeCamera && THREE) {
        const projection = options.defaultProjectionData.mainMatrix;
        threeCamera.projectionMatrix.fromArray(projection);
        for (let i = 0; i < modelInstances.length; i++) {
          const bus = vehicles[i];
          if (!bus) { modelInstances[i]!.visible = false; continue; }
          const instance = modelInstances[i]!;
          const p = mercator.fromLngLat([bus.position.lng, bus.position.lat]);
          const angle = bus.bearing * Math.PI / 180;
          const metres = p.meterInMercatorCoordinateUnits();
          const selectedScale = data.selected && i === vehicles.length - 1 ? 1.22 : 1;
          const scale = busDisplayScale(BUS_LENGTH_METRES, bus.position.lat, zoom) * selectedScale;
          instance.visible = true;
          instance.position.set(p.x, p.y, p.z);
          // bus.glb is Y-up with its nose on +Z; mercator space here is Z-up with +Y pointing south.
          // 'ZXY' applies the heading about mercator up first, then +90° about X so the model stands
          // upright, which leaves the nose pointing along the direction of travel.
          instance.rotation.set(Math.PI / 2, 0, angle, 'ZXY');
          instance.scale.setScalar(metres * scale);
        }
        threeRenderer.resetState();
        threeRenderer.render(threeScene, threeCamera);
        schedule();
        return;
      }

      gl.useProgram(program); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const pos = gl.getAttribLocation(program, 'a_pos'); const shade = gl.getAttribLocation(program, 'a_shade');
      gl.enableVertexAttribArray(pos); gl.vertexAttribPointer(pos, 3, gl.FLOAT, false, 16, 0);
      gl.enableVertexAttribArray(shade); gl.vertexAttribPointer(shade, 1, gl.FLOAT, false, 16, 12);
      gl.uniform3f(gl.getUniformLocation(program, 'u_color'), parseInt(color.slice(1,3),16)/255, parseInt(color.slice(3,5),16)/255, parseInt(color.slice(5,7),16)/255);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
      for (const bus of vehicles) {
        const p = mercator.fromLngLat([bus.position.lng, bus.position.lat]);
        const angle = bus.bearing * Math.PI / 180;
        const metres = p.meterInMercatorCoordinateUnits();
        const scale = busDisplayScale(FALLBACK_BOX_LENGTH_METRES, bus.position.lat, zoom);
        const projection = options.defaultProjectionData.mainMatrix;
        const matrix = new Float32Array(16);
        for (let i = 0; i < 12; i++) matrix[i] = projection[i]! * metres * scale;
        for (let i = 0; i < 4; i++) matrix[12 + i] = projection[12 + i]! + projection[i]! * p.x + projection[4 + i]! * p.y + projection[8 + i]! * p.z;
        gl.uniformMatrix4fv(gl.getUniformLocation(program, 'u_matrix'), false, matrix);
        gl.uniform3f(gl.getUniformLocation(program, 'u_origin'), 0, 0, 0);
        gl.uniform1f(gl.getUniformLocation(program, 'u_scale'), 1);
        gl.uniform1f(gl.getUniformLocation(program, 'u_angle'), angle);
        gl.drawArrays(gl.TRIANGLES, 0, vertexCount);
      }
      schedule();
    },
    onRemove(_m, gl) {
      clearTimer(); document.removeEventListener('visibilitychange', visibility); motion.removeEventListener('change', motionChange);
      clearThreeInstances();
      threeRenderer?.dispose();
      if (buffer) gl.deleteBuffer(buffer); if (program) gl.deleteProgram(program);
      buffer = null; program = null; map = null; threeRenderer = null; threeScene = null; modelTemplate = null;
    },
  };
  return {
    layer,
    suspend() { suspended = true; clearTimer(); },
    update(next: BusLayerData) {
      const key = JSON.stringify(next);
      if (key !== dataKey) {
        const routesChanged = JSON.stringify(data.routes) !== JSON.stringify(next.routes);
        dataKey = key; data = next; frozenTime = Date.now() - startedAt; vehicles = [];
        if (routesChanged) {
          const norreport = { lat: 55.68357, lng: 12.57179 };
          startDistances = next.routes.map((route, direction) => {
            const lengths = cumulativeLengths(route);
            let nearest = 0;
            route.forEach((point, i) => { if (distanceMeters(point, norreport) < distanceMeters(route[nearest]!, norreport)) nearest = i; });
            return (lengths[nearest] ?? 0) + (direction === 0 ? -230 : -140) - (Date.now() - startedAt) / 1000 * 9;
          });
        }
      }
      map?.triggerRepaint(); schedule();
    },
  };
}
