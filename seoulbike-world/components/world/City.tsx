'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  toWorld,
  WORLD_WIDTH,
  WORLD_DEPTH,
  ROAD_END_X,
  ROAD_END_Z,
  CORE_XS,
  toPlan,
  BRIDGE_XS,
  dashCenters,
  curbIntervals,
  bridgeSurfaceHeight,
  CITY_VIEWS,
  type CityView,
} from '@/lib/world/geography';
import { timelineStepBudget } from '@/lib/timeline';
import { createViewportResizer } from '@/lib/world/viewport';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  Simulation,
  hash,
  nodes,
  stations,
  stationPositions,
  stationPlanPositions,
  XS,
  ZS,
} from '@/lib/world/simulation';
import type { Scenario } from '@/lib/scenario';
export type CityProps = {
  view?: CityView;
  activity?: boolean;
  trails?: boolean;
  emphasize?: boolean;
  waterMotion?: boolean;
  stopAtSeconds?: number;
  onTimeBoundary?: () => void;
  scenario: Scenario;
  prediction: number;
  playing: boolean;
  speed: number;
  reduced: boolean;
  quality: boolean;
  reset: number;
  overview: number;
  follow: boolean;
  labels: boolean;
  onStats: (s: {
    riders: number;
    departures: number;
    minutes: number;
    fps: number;
  }) => void;
  onFollow: (id: number | null) => void;
  onReady: () => void;
  onError: (message: string) => void;
};
export default function City(props: CityProps) {
  const mount = useRef<HTMLDivElement>(null),
    latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    if (!mount.current) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch {
      latest.current.onError(
        'The 3D world needs WebGL. Predictions and scenario controls are still available.',
      );
      return;
    }
    const el = mount.current,
      scene = new THREE.Scene();
    scene.background = new THREE.Color('#bbd2d2');
    scene.fog = new THREE.Fog('#bbd2d2', 500, 1350);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, 0.04);
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.32;
    room.dispose();
    pmrem.dispose();
    const textureLoader = new THREE.TextureLoader();
    const textures: Record<string, THREE.Texture> = {};
    for (const name of ['asphalt', 'brick', 'concrete']) {
      const texture = textureLoader.load(`/textures/${name}.png`);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(
        renderer.capabilities.getMaxAnisotropy(),
        8,
      );
      textures[name] = texture;
    }
    const signs: THREE.Mesh[] = [];
    const seasonalFoliage: THREE.Mesh[] = [];
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    el.appendChild(renderer.domElement);
    renderer.domElement.setAttribute(
      'aria-label',
      'Interactive miniature city. Drag to orbit, right-drag to pan, scroll to zoom. Select a cyclist to follow.',
    );
    const camera = new THREE.PerspectiveCamera(
      39,
      el.clientWidth / el.clientHeight,
      0.2,
      1800,
    );
    const overview = () => {
      const v = CITY_VIEWS.find(
        (v) => v.id === (latest.current.view || 'overview'),
      )!;
      camera.position.set(...v.position);
      if (v.id === 'overview' || v.id === 'map') {
        const target = new THREE.Vector3(...v.target),
          back = new THREE.Vector3(...v.position).sub(target).normalize();
        const right = new THREE.Vector3(0, 1, 0).cross(back).normalize(),
          up = back.clone().cross(right).normalize();
        const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2),
          tanH = tanV * camera.aspect;
        let distance = 0;
        for (let x = -WORLD_WIDTH / 2; x <= WORLD_WIDTH / 2; x += 6)
          for (const z of [-WORLD_DEPTH / 2, WORLD_DEPTH / 2])
            for (const h of [0, 42]) {
              const point = new THREE.Vector3(...toWorld(x, h, z)).sub(target);
              distance = Math.max(
                distance,
                point.dot(back) +
                  Math.max(
                    Math.abs(point.dot(right)) / tanH,
                    Math.abs(point.dot(up)) / tanV,
                  ) *
                    1.13,
              );
            }
        camera.position.copy(target.addScaledVector(back, distance));
      }
      controls.target.set(...v.target);
      controls.update();
    };
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.minDistance = 12;
    controls.maxDistance = 1400;
    controls.maxPolarAngle = Math.PI * 0.46;
    controls.minPolarAngle = 0.18;
    overview();
    const ambient = new THREE.HemisphereLight('#eafafa', '#626648', 2.5);
    scene.add(ambient);
    const sun = new THREE.DirectionalLight('#ffe0ad', 3.2);
    sun.position.set(-65, 100, 55);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, {
      left: -170,
      right: 170,
      top: 155,
      bottom: -155,
      near: 1,
      far: 450,
    });
    sun.shadow.bias = -0.0003;
    scene.add(sun);
    const batches = new Map<string, THREE.BufferGeometry[]>();
    const mats = new Map<string, THREE.MeshStandardMaterial>();
    const matrix = new THREE.Matrix4();
    const rot = new THREE.Quaternion();
    const geom = (
      g: THREE.BufferGeometry,
      color: string,
      x: number,
      y: number,
      z: number,
      sx = 1,
      sy = 1,
      sz = 1,
      rx = 0,
      ry = 0,
      rz = 0,
    ) => {
      rot.setFromEuler(new THREE.Euler(rx, ry, rz));
      matrix.compose(
        new THREE.Vector3(x, y, z),
        rot,
        new THREE.Vector3(sx, sy, sz),
      );
      g.applyMatrix4(matrix);
      const vertices = g.getAttribute('position');
      for (let i = 0; i < vertices.count; i++)
        vertices.setXYZ(
          i,
          ...toWorld(vertices.getX(i), vertices.getY(i), vertices.getZ(i)),
        );
      g.computeVertexNormals();
      // World-scale UVs make the same bricks and paving retain their size on every mesh.
      const pos = g.getAttribute('position'),
        normal = g.getAttribute('normal');
      const uv = new Float32Array(pos.count * 2);
      for (let i = 0; i < pos.count; i++) {
        const nx = Math.abs(normal.getX(i)),
          ny = Math.abs(normal.getY(i)),
          nz = Math.abs(normal.getZ(i));
        uv[i * 2] =
          (ny > nx && ny > nz
            ? pos.getX(i)
            : nx > nz
              ? pos.getZ(i)
              : pos.getX(i)) / 3;
        uv[i * 2 + 1] = (ny > nx && ny > nz ? pos.getZ(i) : pos.getY(i)) / 3;
      }
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      if (!batches.has(color)) batches.set(color, []);
      batches.get(color)!.push(g);
    };
    const box = (
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      c: string,
      ry = 0,
    ) =>
      geom(
        new THREE.BoxGeometry(
          w,
          h,
          d,
          Math.max(1, Math.ceil(w / 2)),
          1,
          Math.max(1, Math.ceil(d / 2)),
        ),
        c,
        x,
        y,
        z,
        1,
        1,
        1,
        0,
        ry,
      );
    const cyl = (
      x: number,
      y: number,
      z: number,
      top: number,
      bottom: number,
      h: number,
      c: string,
      n = 8,
    ) => geom(new THREE.CylinderGeometry(top, bottom, h, n), c, x, y, z);
    const sphere = (x: number, y: number, z: number, r: number, c: string) =>
      geom(new THREE.IcosahedronGeometry(r, 1), c, x, y, z);
    box(0, -2.4, 0, WORLD_WIDTH + 2, 4.5, WORLD_DEPTH + 1, '#708e83');
    box(0, -0.5, 0, WORLD_WIDTH + 1, 1, WORLD_DEPTH, '#b9b59a');
    for (const side of [-1, 1])
      box(
        0,
        -0.03,
        side * (WORLD_DEPTH / 4 + 3.25),
        WORLD_WIDTH,
        0.5,
        WORLD_DEPTH / 2 - 6.5,
        '#cfceba',
      );
    // River, embankments, continuous riverside greenways.
    const waterGeometry = new THREE.PlaneGeometry(WORLD_WIDTH, 13, 156, 32);
    waterGeometry.rotateX(-Math.PI / 2);
    const waterVertices = waterGeometry.getAttribute('position');
    for (let i = 0; i < waterVertices.count; i++)
      waterVertices.setXYZ(
        i,
        ...toWorld(waterVertices.getX(i), 0.12, waterVertices.getZ(i)),
      );
    waterGeometry.computeVertexNormals();
    const water = new THREE.Mesh(
      waterGeometry,
      new THREE.MeshStandardMaterial({
        color: '#397f89',
        roughness: 0.22,
        metalness: 0.48,
        envMapIntensity: 1.3,
      }),
    );
    scene.add(water);
    const waterBase = Float32Array.from(waterVertices.array);
    // Fine crossing wave normals, calculated in the material instead of a flat canal surface.
    water.material.roughness = 0.38;
    water.material.metalness = 0.18;
    water.material.envMapIntensity = 0.65;
    water.material.onBeforeCompile = (shader) => {
      shader.uniforms.riverTime = { value: 0 };
      shader.vertexShader = 'varying vec2 riverXZ;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n riverXZ = position.xz;',
      );
      shader.fragmentShader =
        `varying vec2 riverXZ; uniform float riverTime;
        float riverHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float riverNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(riverHash(i),riverHash(i+vec2(1,0)),f.x),mix(riverHash(i+vec2(0,1)),riverHash(i+vec2(1,1)),f.x),f.y);}
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <normal_fragment_maps>',
        '#include <normal_fragment_maps>\n float ripples=riverNoise(riverXZ*1.8+vec2(riverTime*.13,riverTime*.08))*.65 + riverNoise(riverXZ*3.7-vec2(riverTime*.11,0))*.35; normal = normalize(normal + vec3(dFdx(ripples),dFdy(ripples),0.0)*.36);',
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        '#include <color_fragment>\n diffuseColor.rgb *= .89 + .16 * riverNoise(riverXZ*.11+riverTime*.006);',
      );
      water.material.userData.shader = shader;
    };
    for (const z of [-8, 8]) {
      box(0, 0.1, z, WORLD_WIDTH, 0.7, 2.1, '#8eac9a');
      box(0, 0.46, z, WORLD_WIDTH, 0.1, 1.25, '#e3d8b9');
      for (let x = -ROAD_END_X; x < ROAD_END_X; x += 2) {
        box(x, 0.95, z + (z < 0 ? 0.85 : -0.85), 0.09, 0.9, 0.09, '#617d78');
      }
      box(
        0,
        1.15,
        z + (z < 0 ? 0.85 : -0.85),
        WORLD_WIDTH,
        0.07,
        0.08,
        '#72968b',
      );
    }
    for (const z of ZS) {
      box(0, 0.28, z, ROAD_END_X * 2, 0.15, 4.5, '#6f7d7b');
      for (const side of [-1, 1])
        for (const [a, b] of curbIntervals(-ROAD_END_X, ROAD_END_X, XS)) {
          box((a + b) / 2, 0.37, z + side * 2.5, b - a, 0.12, 0.5, '#eee7cf');
          box((a + b) / 2, 0.38, z + side * 1.55, b - a, 0.04, 0.5, '#729f91');
        }
      for (const x of dashCenters(-ROAD_END_X + 2, ROAD_END_X - 2, XS))
        box(x, 0.405, z, 1.3, 0.025, 0.1, '#f1e8bd');
    }
    for (const x of XS)
      for (const side of [-1, 1]) {
        box(
          x,
          0.3,
          (side * (ROAD_END_Z + 15)) / 2,
          4.5,
          0.16,
          ROAD_END_Z - 15,
          '#6f7d7b',
        );
        for (const edge of [-1, 1])
          for (const [a, b] of curbIntervals(
            15,
            ROAD_END_Z,
            ZS.filter((z) => z > 0),
          ))
            box(
              x + edge * 2.5,
              0.38,
              (side * (a + b)) / 2,
              0.5,
              0.12,
              b - a,
              '#eee7cf',
            );
        for (const z of dashCenters(
          16,
          ROAD_END_Z - 1,
          ZS.filter((z) => z > 0),
        ))
          box(x, 0.405, side * z, 0.1, 0.025, 1.3, '#f1e8bd');
      }
    // Five river crossings share exact centerlines with the cycling graph.
    for (const x of BRIDGE_XS) {
      box(x, 0.88, 0, 5.6, 1.1, 14.4, '#d0c9b5');
      box(x, 1.44, 0, 4.5, 0.1, 14.4, '#819b94');
      for (const sign of [-1, 1]) {
        geom(
          new THREE.BoxGeometry(5.5, 0.16, 7.9, 3, 1, 12),
          '#a7b2a2',
          x,
          0.88,
          sign * 11.1,
          1,
          1,
          1,
          sign * Math.atan2(1.12, 7.8),
        );
        for (let z = -10; z <= 10; z += 2) {
          box(x + sign * 2.5, 2.05, z, 0.1, 1.25, 0.1, '#e7e7d2');
        }
        box(x + sign * 2.5, 2.6, 0, 0.14, 0.15, 22, '#ebe9ce');
        cyl(x + sign * 1.65, -0.25, -5, 0.55, 0.7, 2.6, '#a1afa3');
        cyl(x + sign * 1.65, -0.25, 5, 0.55, 0.7, 2.6, '#a1afa3');
      }
      for (let z = -9; z <= 9; z += 3)
        box(
          x,
          Math.abs(z) > 7.2 ? 1.51 - ((Math.abs(z) - 7.2) / 7.8) * 1.12 : 1.51,
          z,
          0.1,
          0.02,
          1.2,
          '#e8dec2',
        );
    }
    const tree = (
      x: number,
      z: number,
      r = 1.3,
      kind: 'ginkgo' | 'cherry' | 'pine' | 'willow' = 'ginkgo',
      base = 0,
    ) => {
      if (
        (Math.abs(z) > 6.5 &&
          Math.abs(z) < 15 &&
          BRIDGE_XS.some((road) => Math.abs(x - road) < 3.6)) ||
        ZS.some((road) => Math.abs(z - road) < 3.1) ||
        (Math.abs(z) > 12 && XS.some((road) => Math.abs(x - road) < 3.1))
      )
        return;
      cyl(x, base + 1.4, z, 0.12, 0.22, 2.7, '#7b6f4c');
      if (kind === 'pine') {
        for (let layer = 0; layer < 3; layer++) {
          const y = base + 2 + layer * 0.9,
            rr = r * (1.25 - layer * 0.21);
          geom(
            new THREE.ConeGeometry(rr, 1.5, 7),
            '#345f4a',
            x + 0.2 * layer,
            y,
            z,
          );
          sphere(x - 0.35, y - 0.2, z + 0.2, rr * 0.6, '#487751');
        }
      } else if (kind === 'willow') {
        sphere(x, base + 3.6, z, r * 1.1, '#78965a');
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2;
          geom(
            new THREE.SphereGeometry(0.3, 6, 6),
            '#87a96c',
            x + Math.cos(a) * r * 0.8,
            base + 2.9,
            z + Math.sin(a) * r * 0.8,
            1,
            3.1,
            1,
          );
        }
      } else {
        const colors =
          kind === 'cherry' ? ['#89a66c', '#a4b580'] : ['#668d54', '#8ca969'];
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          sphere(
            x + Math.cos(a) * r * 0.5,
            base + 2.9 + (k % 2) * 0.4,
            z + Math.sin(a) * r * 0.45,
            r * 0.7,
            colors[k % 2],
          );
        }
        for (const dx of [-0.42, 0.4])
          box(x + dx, base + 2, z, 0.08, 1.5, 0.08, '#7b6f4c', dx);
      }
    };
    const bench = (x: number, z: number, ry = 0) => {
      box(x, 0.65, z, 1.8, 0.18, 0.62, '#ad8853', ry);
      box(x, 0.9, z + 0.3, 1.8, 0.58, 0.12, '#ad8853', ry);
      for (const dx of [-0.65, 0.65])
        box(x + dx, 0.3, z, 0.13, 0.6, 0.55, '#556d66');
    };
    const lamp = (x: number, z: number) => {
      cyl(x, 2.2, z, 0.065, 0.1, 4, '#536c65');
      box(x + 0.4, 4.2, z, 1, 0.12, 0.28, '#55675e');
      sphere(x + 0.74, 4.1, z, 0.14, '#fff0b4');
    };
    const sign = (
      text: string,
      x: number,
      y: number,
      z: number,
      w: number,
      bg = '#304f49',
    ) => {
      const c = document.createElement('canvas');
      c.width = 512;
      c.height = 112;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 512, 112);
      ctx.strokeStyle = '#f0e3b8';
      ctx.lineWidth = 4;
      ctx.strokeRect(10, 10, 492, 92);
      ctx.fillStyle = '#fff0cc';
      ctx.font = '600 36px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 256, 57);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(w, 0.75),
        new THREE.MeshStandardMaterial({
          map: new THREE.CanvasTexture(c),
          roughness: 0.6,
          emissive: '#cbbb89',
          emissiveIntensity: 0.08,
        }),
      );
      mesh.position.set(...toWorld(x, y, z));
      scene.add(mesh);
      signs.push(mesh);
    };
    const planter = (x: number, z: number, w = 1.3) => {
      box(x, 0.65, z, w, 0.65, 0.65, '#a97753');
      box(x, 1, z, w * 0.85, 0.08, 0.5, '#66563f');
      for (let k = 0; k < 5; k++) {
        sphere(
          x + (k - 2) * w * 0.17,
          1.16,
          z,
          0.23,
          k % 2 ? '#497850' : '#809657',
        );
        if (k % 2 === 0)
          sphere(x + (k - 2) * w * 0.17, 1.35, z, 0.09, '#d89982');
      }
    };
    let bi = 0;
    const building = (
      x: number,
      z: number,
      w: number,
      d: number,
      h: number,
      style: number,
    ) => {
      const palette = [
        '#d7cbb1',
        '#ebdfc4',
        '#c5c9bd',
        '#c7b79c',
        '#93a9a0',
        '#e6c7a8',
      ];
      const c = palette[style % palette.length];
      box(x, 0.45 + h / 2, z, w, h, d, c);
      box(
        x,
        h + 0.52,
        z,
        w + 0.22,
        0.28,
        d + 0.22,
        style % 3 === 0 ? '#cb865f' : '#e6dfc8',
      );
      box(x, h + 0.87, z, w * 0.6, 0.5, d * 0.55, '#a9aea0');
      box(x, h + 1.3, z, w * 0.21, 0.65, d * 0.24, '#b6bba9');
      // Parapets, roof vents, tanks, solar panels, cornices and balconies.
      for (const dz of [-d / 2, d / 2])
        box(x, h + 0.86, z + dz, w, 0.55, 0.16, '#c2b8a1');
      for (const dx of [-w / 2, w / 2])
        box(x + dx, h + 0.86, z, 0.16, 0.55, d, '#c2b8a1');
      cyl(
        x + w * 0.29,
        h + 1.35,
        z - d * 0.25,
        0.62,
        0.62,
        1.15,
        '#829792',
        12,
      );
      for (let fan = 0; fan < 2; fan++) {
        cyl(
          x - 0.8 + fan * 1.05,
          h + 1.2,
          z + 0.5,
          0.38,
          0.38,
          0.32,
          '#718681',
          12,
        );
        geom(
          new THREE.TorusGeometry(0.28, 0.045, 5, 14),
          '#3e5553',
          x - 0.8 + fan * 1.05,
          h + 1.39,
          z + 0.5,
          1,
          1,
          1,
          Math.PI / 2,
        );
      }
      if (style % 2 === 0)
        for (let a = 0; a < 3; a++) {
          box(
            x - 1 + a * 0.9,
            h + 0.92,
            z - d * 0.26,
            0.8,
            0.12,
            1.3,
            '#375c6a',
          );
          for (let line = 0; line < 3; line++)
            box(
              x - 1 + a * 0.9,
              h + 0.99,
              z - d * 0.26 + (line - 1) * 0.37,
              0.72,
              0.02,
              0.03,
              '#81a5ad',
            );
        }
      if (style % 3 === 1 && h < 12)
        geom(
          new THREE.ConeGeometry(w * 0.76, 2.2, 4),
          '#8d6552',
          x,
          h + 1.65,
          z,
          1,
          1,
          d / w,
          0,
          Math.PI / 4,
        );
      box(x, 0.8, z, w + 0.2, 0.3, d + 0.2, '#aea88f');

      for (let floor = 1; floor < h - 0.5; floor += 1.9) {
        box(x, floor + 0.96, z + d / 2 + 0.07, w, 0.09, 0.17, '#d6ccb4');
        if (style % 2 === 0 && floor > 2) {
          for (const dx of [-w * 0.25, w * 0.25]) {
            box(
              x + dx,
              floor - 0.12,
              z + d / 2 + 0.43,
              1.7,
              0.12,
              0.85,
              '#c1bba6',
            );
            box(
              x + dx,
              floor + 0.25,
              z + d / 2 + 0.83,
              1.7,
              0.08,
              0.08,
              '#485f5b',
            );
            for (let pole = 0; pole < 4; pole++)
              box(
                x + dx - 0.75 + pole * 0.5,
                floor + 0.1,
                z + d / 2 + 0.83,
                0.04,
                0.48,
                0.04,
                '#526d64',
              );
          }
        }
        for (let wx = -w / 2 + 0.7; wx < w / 2 - 0.35; wx += 1.5) {
          box(
            x + wx,
            floor + 0.45,
            z + d / 2 + 0.018,
            0.6,
            0.84,
            0.035,
            '#627e7b',
          );
          box(
            x + wx,
            floor + 0.45,
            z + d / 2 + 0.052,
            0.035,
            0.84,
            0.04,
            '#bdc9ba',
          );
          box(
            x + wx,
            floor + 0.45,
            z + d / 2 + 0.053,
            0.6,
            0.035,
            0.04,
            '#bdc9ba',
          );
          box(
            x + wx,
            floor + 0.45,
            z - d / 2 - 0.018,
            0.6,
            0.84,
            0.035,
            '#718b87',
          );
        }
        for (let dz = -d / 2 + 0.7; dz < d / 2 - 0.35; dz += 1.5)
          box(
            x + w / 2 + 0.018,
            floor + 0.45,
            z + dz,
            0.035,
            0.84,
            0.6,
            '#6e8881',
          );
      }
      if (style % 3 === 0) {
        box(x, 1.6, z + d / 2 + 0.45, w * 0.85, 0.17, 1.15, '#426f62');
        box(x, 1.05, z + d / 2 + 0.025, w * 0.76, 1.25, 0.055, '#819c91');
        for (let stripe = 0; stripe < 10; stripe++)
          box(
            x - w * 0.4 + stripe * w * 0.08,
            1.72,
            z + d / 2 + 0.45,
            w * 0.045,
            0.035,
            1.12,
            '#e6ddbe',
          );
        sign(
          [
            '한강 커피  CAFE',
            '서울 서점  BOOKS',
            'SEOUL MARKET',
            '자전거  CYCLE',
          ][bi % 4],
          x,
          2.35,
          z + d / 2 + 0.08,
          w * 0.82,
        );
        for (const dx of [-w * 0.35, w * 0.35])
          planter(x + dx, z + d / 2 + 1.15, 0.85);
        if (z > 0) {
          cyl(x, 1, z + d / 2 + 1.9, 0.65, 0.65, 0.12, '#ac8958', 16);
          cyl(x, 0.6, z + d / 2 + 1.9, 0.055, 0.1, 0.8, '#53645e');
          cyl(x, 1.9, z + d / 2 + 1.9, 0.045, 0.045, 2.2, '#b6a785');
          geom(
            new THREE.ConeGeometry(1.12, 0.45, 8),
            '#d5b175',
            x,
            3.05,
            z + d / 2 + 1.9,
          );
        }
      }
      bi++;
    };
    // Southern residential blocks: warm roofs, courtyards and local shops.
    for (let c = 0; c < 3; c++)
      for (let row = 0; row < 2; row++) {
        const cx = (CORE_XS[c] + CORE_XS[c + 1]) / 2,
          cz = row === 0 ? 25.5 : 45.4;
        if (c === 2 && row === 0) continue;
        for (let a = 0; a < 3; a++) {
          const x = cx + (a - 1) * 8.1;
          building(
            x,
            cz,
            6.1,
            row ? 7 : 8,
            c > 0
              ? 14 + hash(18, a + c * 9 + row * 30) * 19
              : 5 + hash(18, a + c * 9 + row * 30) * 7,
            a + c,
          );
          if (row === 0) tree(x, cz + 5.4, 0.9);
        }
      }
    // Northern commercial skyline, with a designed park on the west bank.
    for (let c = 2; c < 3; c++)
      for (let row = 0; row < 2; row++) {
        const cx = (CORE_XS[c] + CORE_XS[c + 1]) / 2,
          cz = row === 0 ? -25.5 : -45;
        for (let a = 0; a < 3; a++) {
          building(
            cx + (a - 1) * 8.2,
            cz,
            6.5,
            7.8,
            5 + hash(9, a + c * 8 + row * 29) * 7,
            a + row + 2,
          );
        }
      }
    for (const x of [-63, 62])
      for (const z of [-45, -25.5, 25.5]) {
        building(x, z, 6, 6, 4 + hash(310, Math.abs(x + z)) * 6, x < 0 ? 3 : 4);
        tree(x + 4, z + 4, 0.75, 'ginkgo');
      }
    for (let x = -112; x <= 112; x += 7) {
      tree(x, -11.1, 1.05, 'ginkgo');
      tree(x, 11.1, 0.95, 'cherry');
      if (BRIDGE_XS.every((b) => Math.abs(x - b) > 5)) {
        bench(x + 2, 10);
        lamp(x, -12.5);
      }
    }
    for (const x of [-58, -45, -33, -25, 8, 29, 41, 58])
      for (const z of [-40, 40]) tree(x, z, 1.15);
    // Park paths, pond, pavilion, beds and dense varied foliage.
    box(-36, 0.38, -25.5, 25, 0.2, 15, '#8ba773');
    box(-36, 0.52, -25.5, 24, 0.08, 1.6, '#ddd4b0');
    box(-36, 0.52, -25.5, 1.6, 0.08, 15, '#ddd4b0');
    cyl(-41, 0.58, -29, 2.5, 2.5, 0.1, '#639b9a', 28);
    for (let i = 0; i < 29; i++) {
      let x = -47 + hash(88, i, 1) * 22,
        z = -49 + hash(88, i, 2) * 29;
      if (Math.abs(x + 36) > 2 && Math.abs(z + 25.5) > 2)
        tree(x, z, 1 + hash(88, i, 3) * 0.9);
    }
    for (let x = -45; x < -28; x += 7) bench(x, -23);
    box(-33, 0.5, -43, 9, 0.6, 6, '#e3d7b8');
    for (const x of [-36, -30])
      for (const z of [-45, -41]) cyl(x, 2, z, 0.15, 0.15, 3, '#8d7560');
    geom(
      new THREE.ConeGeometry(5.7, 1.8, 4),
      '#537968',
      -33,
      4.3,
      -43,
      1,
      1,
      0.72,
      0,
      Math.PI / 4,
    );
    // Public square and circular fountain.
    box(34, 0.45, 25.5, 25, 0.3, 14, '#ddd1b3');
    cyl(34, 0.85, 25.5, 3.5, 3.65, 0.8, '#9fae9f', 32);
    cyl(34, 1.3, 25.5, 3.1, 3.1, 0.08, '#72adb0', 32);
    cyl(34, 2, 25.5, 0.38, 0.65, 1.7, '#b2c3b0', 12);
    sphere(34, 3, 25.5, 0.45, '#a5d1ce');
    for (let i = 0; i < 8; i++) {
      const t = (i / 8) * Math.PI * 2;
      tree(34 + Math.sin(t) * 10, 25.5 + Math.cos(t) * 5.8, 0.8);
    }
    // Namsan lies between the historic core and the northern riverbank.
    geom(
      new THREE.SphereGeometry(1, 24, 12),
      '#5d7f56',
      0,
      0,
      -25.5,
      11,
      6.5,
      8,
    );
    geom(new THREE.SphereGeometry(1, 18, 10), '#78945f', 2, 1, -26, 7, 5.7, 6);
    for (let i = 0; i < 44; i++) {
      const a = hash(821, i) * Math.PI * 2,
        r = Math.sqrt(hash(822, i)) * 8;
      const x = Math.cos(a) * r,
        z = -25.5 + Math.sin(a) * r * 0.7;
      const elevation =
        5.9 * Math.sqrt(Math.max(0, 1 - (x / 11) ** 2 - ((z + 25.5) / 8) ** 2));
      if (Math.hypot(x, z + 25.5) > 2)
        tree(
          x,
          z,
          0.65 + hash(823, i) * 0.35,
          i % 4 ? 'pine' : 'cherry',
          elevation,
        );
    }
    cyl(0, 11.3, -25.5, 0.48, 0.85, 10.7, '#ebe7d7');
    cyl(0, 16.8, -25.5, 2.2, 2.2, 1.5, '#8aa5a4', 20);
    cyl(0, 17.8, -25.5, 1.7, 2.65, 0.8, '#f0e7d1', 20);
    cyl(0, 21.5, -25.5, 0.1, 0.15, 6.8, '#f1e5cc');
    for (let k = 0; k < 25; k++) {
      const a = 0.4 + k * 0.095,
        x = Math.cos(a) * 8.6,
        z = -25.5 + Math.sin(a) * 6.3;
      const y =
        5.9 * Math.sqrt(Math.max(0, 1 - (x / 11) ** 2 - ((z + 25.5) / 8) ** 2));
      box(x, y + 0.65, z, 0.75, 1.1, 0.35, '#b6b19a', -a);
      box(x, y + 1.3, z, 0.35, 0.3, 0.4, '#d4cdb8', -a);
    }
    // Low palace courtyards and hanok roofs north of Namsan.
    const hanok = (x: number, z: number, w: number, d: number, h = 2) => {
      box(x, h / 2 + 0.4, z, w, h, d, '#e5d6b6');
      for (const dx of [-w * 0.4, 0, w * 0.4])
        box(x + dx, h / 2 + 0.4, z + d / 2 + 0.08, 0.18, h, 0.2, '#794e38');
      for (const side of [-1, 1])
        geom(
          new THREE.BoxGeometry(w + 1, 0.24, d * 0.65, 4, 1, 4),
          '#3e5253',
          x,
          h + 0.75,
          z + side * d * 0.22,
          1,
          1,
          1,
          side * 0.35,
        );
      box(x, h + 1.2, z, w + 1.3, 0.16, 0.3, '#516669');
      for (const dx of [-w * 0.55, w * 0.55])
        box(x + dx, h + 0.68, z, 0.15, 0.35, d + 1, '#536866');
    };
    box(-1, 0.35, -46.5, 28, 0.2, 13, '#c1b79b');
    for (const z of [-51.5, -42]) box(-1, 1, z, 27, 1.4, 0.35, '#a29d8e');
    for (const x of [-14, 12]) box(x, 1, -46, 0.35, 1.4, 11, '#a29d8e');
    hanok(-1, -47, 10, 4, 3);
    hanok(-1, -42.5, 5, 2, 2.5);
    for (const x of [-10, 8]) for (const z of [-48, -43.5]) hanok(x, z, 4, 2.5);
    for (const x of [-10, 8]) tree(x, -38.9, 0.8, 'ginkgo');
    // Yeouido is an island: broad main channel north, narrow Saetgang south.
    geom(
      new THREE.CylinderGeometry(1, 1, 1, 48),
      '#92a779',
      -46,
      0.6,
      3.1,
      17,
      1,
      2.7,
    );
    geom(
      new THREE.CylinderGeometry(1, 1, 1, 48),
      '#c5bda1',
      -46,
      0.96,
      3.1,
      16.3,
      0.1,
      2.5,
    );
    box(-46, 1.08, 3.2, 27, 0.08, 0.3, '#d9d2b9');
    box(-47, 1.07, 3.4, 5, 0.09, 3.5, '#7f9b68');
    // National Assembly-inspired pale colonnade and green dome.
    box(-55, 2, 2.9, 5.3, 2.1, 1.5, '#e9e2c7');
    for (let i = 0; i < 6; i++)
      cyl(-57 + i * 0.8, 2.2, 3.75, 0.1, 0.1, 2.4, '#f2e8cd');
    geom(
      new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      '#639889',
      -55,
      3.25,
      2.9,
      1.8,
      1.25,
      0.58,
    );
    box(-55, 3.28, 2.9, 5.8, 0.18, 1.85, '#ece4cc');
    building(-38, 3.3, 3, 1.3, 17, 4);
    building(-42, 3.3, 2.5, 1.1, 12, 2);
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      tree(
        -46 + Math.cos(a) * 14.5,
        3.1 + Math.sin(a) * 2.25,
        0.55,
        i % 3 ? 'cherry' : 'willow',
        1,
      );
    }
    // Small riverside reeds and gravel edges create a natural bank.
    for (let i = 0; i < 190; i++) {
      const x = -115 + hash(912, i) * 230,
        side = i % 2 ? 1 : -1,
        z = side * (6.65 + hash(914, i) * 0.35);
      if (BRIDGE_XS.some((b) => Math.abs(b - x) < 3.5)) continue;
      geom(
        new THREE.IcosahedronGeometry(0.3, 0),
        '#a4aaa0',
        x,
        0.3,
        z,
        1.5,
        0.5,
        0.6,
      );
      for (let k = 0; k < 3; k++)
        box(
          x + k * 0.16,
          0.7 + hash(916, i) * 0.2,
          z,
          0.035,
          0.9,
          0.035,
          '#9b9a64',
        );
    }
    // Banpo-inspired upper structure and bridge-side fountain jets.
    for (const x of BRIDGE_XS) {
      for (const side of [-1, 1]) {
        if (x === 18) {
          box(x + side * 2.5, 4, 0, 0.3, 0.35, 14, '#738f8e');
          for (let z = -6; z <= 6; z += 3)
            box(x + side * 2.5, 2.7, z, 0.25, 2.6, 0.18, '#bbd0c1');
        } else {
          const curve = new THREE.QuadraticBezierCurve3(
            new THREE.Vector3(x + side * 2.5, 2, -6),
            new THREE.Vector3(x + side * 2.5, 12, 0),
            new THREE.Vector3(x + side * 2.5, 2, 6),
          );
          geom(
            new THREE.TubeGeometry(curve, 30, 0.14, 6, false),
            '#d4ded2',
            0,
            0,
            0,
          );
          for (let z = -5; z <= 5; z += 1.5)
            box(
              x + side * 2.5,
              3.8 - (z * z) / 25,
              z,
              0.035,
              3.5 - (z * z) / 9,
              0.035,
              '#dbe4d4',
            );
        }
      }
    }
    for (const side of [-1, 1])
      for (let z = -5; z <= 5; z += 1.1) {
        const curve = new THREE.QuadraticBezierCurve3(
          new THREE.Vector3(18 + side * 2.6, 3.8, z),
          new THREE.Vector3(18 + side * 5, 5.3, z),
          new THREE.Vector3(18 + side * 7, 0.2, z),
        );
        geom(
          new THREE.TubeGeometry(curve, 18, 0.038, 4, false),
          '#91c4cc',
          0,
          0,
          0,
        );
      }
    // A small river cruise boat, separate from bicycle demand.
    box(35, 0.48, -2.3, 3.8, 0.45, 0.85, '#ede7d0');
    box(35, 1, -2.3, 2.5, 0.6, 0.7, '#c2d1c7');
    box(35, 1.35, -2.3, 2.8, 0.12, 0.85, '#fff0cc');
    for (let x = 34; x <= 36; x += 0.4)
      box(x, 1.03, -1.92, 0.25, 0.27, 0.03, '#426873');
    // A narrow stream through the old city and a contemporary tower in eastern Jamsil.
    box(-1, 0.45, -40, 25, 0.08, 0.65, '#78a6a3');
    for (const z of [-40.5, -39.5]) box(-1, 0.5, z, 25, 0.15, 0.28, '#c8c3a8');
    for (const x of [-9, 6]) box(x, 0.68, -40, 1.4, 0.18, 1.7, '#d8d0b6');
    geom(
      new THREE.CylinderGeometry(0.25, 3.2, 38, 8),
      '#a2bec2',
      62,
      19.7,
      43,
      1,
      1,
      1,
    );
    for (let h = 4; h < 37; h += 2)
      cyl(
        62,
        h + 0.7,
        43,
        3.2 * (1 - h / 40),
        3.2 * (1 - h / 40),
        0.08,
        '#d2ded5',
        8,
      );
    cyl(62, 41, 43, 0.06, 0.12, 5, '#ccdacf');
    // Western neighborhood extension: intimate blocks, shops and planted courtyards.
    for (const x of [-103, -78])
      for (const z of [-49, -25, 25, 49]) {
        building(x, z, 7, 8, 5 + hash(620, Math.round(x + z + 200)) * 7, 3);
        building(x + 9, z, 5, 6, 4 + hash(621, Math.round(x - z + 200)) * 5, 1);
        for (const dx of [-4, 5]) tree(x + dx, z + 6, 0.95, 'ginkgo');
        bench(x + 3, z - 6);
      }
    // Eastern mixed-use blocks, kept apart from the new riverside park.
    for (const x of [76, 103])
      for (const z of [-49, -25, 49, 73]) {
        if (z === 49) continue;
        building(x, z, 7, 8, 7 + hash(640, Math.round(x + z)) * 13, 4);
        tree(x - 5, z - 5, 1.1, 'ginkgo');
        if (z < 0)
          building(
            x === 76 ? x - 8 : x + 8,
            z,
            5,
            7,
            5 + hash(641, Math.round(x - z)) * 8,
            2,
          );
      }
    // New southern neighborhoods extend beyond the former edge of the city.
    for (const x of [-72, -38, 0, 34]) {
      for (const dx of [-7, 5])
        building(
          x + dx,
          73,
          7,
          8,
          6 + hash(657, x + dx + 100) * 15,
          dx < 0 ? 2 : 3,
        );
      tree(x, 68, 1.05, 'ginkgo');
      bench(x, 79);
    }
    for (const x of [-38, -1, 34]) {
      for (const dx of [-8, 0, 8])
        building(x + dx, 54, 5.5, 5.5, 5 + hash(663, x + dx + 100) * 10, 1);
      tree(x + 11, 54, 0.85, 'ginkgo');
    }
    // Northern residential edge and wooded hills in the spaces between streets.
    for (const x of [34, 69, 103]) {
      for (const dx of [-7, 5]) hanok(x + dx, -73, 6, 5, 2.5);
      tree(x, -80, 1, 'cherry');
    }
    for (const [x, z, rx, rz, h] of [
      [-72, -75, 10, 7, 10],
      [-37, -75, 10, 7, 13],
      [-1, -75, 9, 7, 9],
    ]) {
      const height = (u: number, v: number) =>
        h *
        Math.max(0, 1 - u * u - v * v) ** 1.35 *
        (1 + 0.12 * Math.sin(u * 5 + x) * Math.cos(v * 4));
      const terrain = new THREE.PlaneGeometry(rx * 2, rz * 2, 28, 22);
      terrain.rotateX(-Math.PI / 2);
      const positions = terrain.getAttribute('position'),
        colors = new Float32Array(positions.count * 3);
      for (let i = 0; i < positions.count; i++) {
        const u = positions.getX(i) / rx,
          v = positions.getZ(i) / rz;
        positions.setY(i, height(u, v));
        const shade = 0.8 + 0.2 * hash(72491, i + x + 100);
        colors.set([shade, shade, shade * 0.9], i * 3);
      }
      terrain.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geom(terrain, '#718f58', x, 0.4, z);
      for (let i = 0; i < 48; i++) {
        const a = i * 2.399963 + x,
          r = Math.sqrt((i + 0.5) / 48) * 0.97,
          u = Math.cos(a) * r,
          v = Math.sin(a) * r;
        if (Math.abs(r - 0.82) < 0.065) continue;
        tree(
          x + u * rx,
          z + v * rz,
          0.7 + hash(704, i) * 0.4,
          'pine',
          0.4 + height(u, v),
        );
      }
      const path = Array.from({ length: 65 }, (_, i) => {
        const a = (i / 64) * Math.PI * 2,
          u = Math.cos(a) * 0.82,
          v = Math.sin(a) * 0.82;
        return new THREE.Vector3(x + u * rx, 0.52 + height(u, v), z + v * rz);
      });
      geom(
        new THREE.TubeGeometry(
          new THREE.CatmullRomCurve3(path),
          96,
          0.23,
          5,
          false,
        ),
        '#c2b8a1',
        0,
        0,
        0,
      );
      for (let i = 0; i < 9; i++) {
        const a = i * 2.399963,
          u = Math.cos(a) * 0.94,
          v = Math.sin(a) * 0.94;
        geom(
          new THREE.IcosahedronGeometry(0.65, 0),
          '#8a9180',
          x + u * rx,
          0.6 + height(u, v),
          z + v * rz,
          1.3,
          0.7,
          1,
        );
      }
    }
    // Eastern river park: broad lawns, winding paths, wetland planting and pavilions.
    box(103, 0.36, 25.5, 22, 0.2, 14, '#8ba773');
    box(103, 0.48, 25.5, 21, 0.08, 1.4, '#ddd4b0');
    box(103, 0.48, 25.5, 1.4, 0.08, 14, '#ddd4b0');
    for (let i = 0; i < 25; i++) {
      const x = 94 + hash(711, i) * 18,
        z = 19 + hash(712, i) * 13;
      if (Math.abs(x - 103) < 2 || Math.abs(z - 25.5) < 1.8) continue;
      tree(x, z, 0.8 + hash(713, i) * 0.45, i % 4 ? 'cherry' : 'willow');
    }
    for (const x of [96, 109]) {
      bench(x, 24);
      planter(x, 29, 2);
    }
    hanok(104, 43, 8, 5, 2.4);
    box(104, 0.5, 41, 17, 0.14, 1.5, '#ddd4b0');
    for (const x of [94, 111]) tree(x, 45, 1.4, 'willow');
    // Twenty-four bike stations, including the new outer neighborhoods.
    for (const [i, n] of stations.entries()) {
      const [dockX, , dockZ] = stationPlanPositions[i];
      const x = dockX - 6.2,
        z = dockZ - (nodes[n][2] > 0 ? 3.9 : -3.9);
      const offset = z > 0 ? 3.9 : -3.9;
      box(x + 4, 0.52, z + offset, 5, 0.15, 1.5, '#dedcc1');
      for (let j = 0; j < 6; j++) {
        box(x + 2 + j * 0.65, 0.9, z + offset, 0.1, 0.65, 0.4, '#466e64');
        if (j % 3 !== i % 3) {
          geom(
            new THREE.TorusGeometry(0.24, 0.045, 5, 10),
            '#416155',
            x + 2 + j * 0.65,
            0.85,
            z + offset - 0.22,
            1,
            1,
            1,
            0,
            Math.PI / 2,
          );
          geom(
            new THREE.TorusGeometry(0.24, 0.045, 5, 10),
            '#416155',
            x + 2 + j * 0.65,
            0.85,
            z + offset + 0.36,
            1,
            1,
            1,
            0,
            Math.PI / 2,
          );
        }
      }
      box(x + 1, 1.7, z + offset, 0.1, 2.5, 0.1, '#466e64');
      box(x + 1, 2.8, z + offset, 0.7, 0.75, 0.18, '#bfe69d');
    }
    // Street furniture and pocket gardens leave the cycling corridors clear.
    for (let x = -112; x < 113; x += 11) {
      if (XS.some((road) => Math.abs(road - x) < 5)) continue;
      planter(x, 12.1, 2.1);
      planter(x, -12.1, 1.8);
      cyl(x + 1.6, 0.78, 11.8, 0.26, 0.28, 0.9, '#526e5d', 10);
      cyl(x + 1.6, 1.27, 11.8, 0.3, 0.3, 0.12, '#40594f', 10);
    }
    for (let i = 0; i < 18; i++) {
      const x = -45 + hash(315, i) * 16,
        z = -47 + hash(316, i) * 10;
      if (
        XS.some((v) => Math.abs(v - x) < 3) ||
        ZS.some((v) => Math.abs(v - z) < 3) ||
        Math.abs(x + 33) < 5
      )
        continue;
      planter(x, z, 1.1);
    }
    for (let i = 0; i < 30; i++) {
      const x = -46 + hash(408, i) * 19,
        z = -30 + hash(409, i) * 9;
      if (Math.abs(x + 36) < 1.8 || Math.abs(z + 25.5) < 1.8) continue;
      for (let k = 0; k < 3; k++)
        sphere(
          x + k * 0.12,
          0.8,
          z,
          0.12,
          ['#d99f8d', '#d8c16e', '#bb899c'][i % 3],
        );
    }
    for (const x of [25, 43])
      for (const z of [22, 29]) {
        bench(x, z);
        planter(x + 1.8, z, 0.9);
      }
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(34, 2.6, 25.5),
        new THREE.Vector3(
          34 + Math.cos(a) * 1.3,
          4.4,
          25.5 + Math.sin(a) * 1.3,
        ),
        new THREE.Vector3(
          34 + Math.cos(a) * 2.4,
          1.35,
          25.5 + Math.sin(a) * 2.4,
        ),
      );
      geom(
        new THREE.TubeGeometry(curve, 14, 0.025, 4, false),
        '#a6d4cc',
        0,
        0,
        0,
      );
    }
    for (let x = -115; x < 116; x += 4)
      for (const z of [-6.8, 6.8]) box(x, -0.1, z, 3.6, 0.6, 0.5, '#9a9e87');
    for (const [i, n] of stations.entries()) {
      const [x, , z] = nodes[n];
      sign(
        `SEOUL BIKE · ${String(i + 1).padStart(2, '0')}`,
        x + 3,
        2.25,
        z + (z > 0 ? 4.25 : -3.55),
        3.4,
      );
    }
    // Crosswalks are mirrored on every connected arm; all markings use the road transform.
    for (const x of XS)
      for (const z of ZS)
        for (const side of [-1, 1]) {
          for (let k = -3; k <= 3; k++)
            box(x + side * 3.65, 0.43, z + k * 0.5, 1.1, 0.02, 0.25, '#f1ebd3');
          if (
            ((z === -15 && side === 1) || (z === 15 && side === -1)) &&
            !BRIDGE_XS.includes(x)
          )
            continue;
          for (let k = -3; k <= 3; k++) {
            const cz = z + side * 3.65,
              onRamp = Math.abs(cz) < 15 && BRIDGE_XS.includes(x);
            geom(
              new THREE.BoxGeometry(0.25, 0.02, 1.1),
              '#f1ebd3',
              x + k * 0.5,
              (onRamp ? bridgeSurfaceHeight(cz) : 0.4) + 0.03,
              cz,
              1,
              1,
              1,
              onRamp ? Math.sign(cz) * Math.atan2(1.11, 7.8) : 0,
            );
          }
        }
    for (const [color, geometries] of batches) {
      const merged = mergeGeometries(geometries);
      if (!merged) continue;
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
      if (color === '#718f58') m.vertexColors = true;
      const materialType =
        color === '#6f7d7b'
          ? 'asphalt'
          : ['#d7cbb1', '#c7b79c', '#e6c7a8', '#a97753', '#708e83'].includes(
                color,
              )
            ? 'brick'
            : [
                  '#cfceba',
                  '#ddd1b3',
                  '#ddd4b0',
                  '#dedcc1',
                  '#c2b8a1',
                  '#d0c9b5',
                  '#b9b59a',
                ].includes(color)
              ? 'concrete'
              : null;
      if (materialType) {
        m.map = textures[materialType];
        m.bumpMap = textures[materialType];
        m.bumpScale = materialType === 'brick' ? 0.11 : 0.055;
        if (materialType === 'asphalt') m.color.set('#b0bdb8');
        else if (materialType === 'brick')
          m.color.lerp(new THREE.Color('#f3e6d0'), 0.45);
      }
      if (
        ['#627e7b', '#718b87', '#6e8881', '#819c91', '#375c6a'].includes(color)
      ) {
        m.roughness = 0.22;
        m.metalness = 0.28;
        m.envMapIntensity = 0.7;
      }

      if (
        [
          '#668d54',
          '#8ca969',
          '#89a66c',
          '#a4b580',
          '#345f4a',
          '#487751',
          '#78965a',
          '#87a96c',
        ].includes(color)
      ) {
        m.onBeforeCompile = (shader) => {
          shader.uniforms.windTime = { value: 0 };
          shader.vertexShader =
            'uniform float windTime;\n' + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace(
            '#include <begin_vertex>',
            '#include <begin_vertex>\n transformed.x += sin(windTime + position.x * .7) * .045;',
          );
          m.userData.shader = shader;
        };
      }
      if (color === '#91c4cc') {
        m.transparent = true;
        m.opacity = 0.6;
        m.emissive.set('#80b9c3');
        m.emissiveIntensity = 0.4;
      }
      mats.set(color, m);
      const mesh = new THREE.Mesh(merged, m);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (
        [
          '#668d54',
          '#8ca969',
          '#89a66c',
          '#a4b580',
          '#78965a',
          '#87a96c',
        ].includes(color)
      )
        seasonalFoliage.push(mesh);
      scene.add(mesh);
      for (const g of geometries) g.dispose();
    }
    // Labels are wayfinding, not geographic forecasts.
    const labels = new THREE.Group();
    const label = (text: string, x: number, z: number) => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 96;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = 'rgba(241,248,232,.92)';
      ctx.beginPath();
      ctx.roundRect(0, 0, 512, 96, 30);
      ctx.fill();
      ctx.fillStyle = '#345249';
      ctx.font = '600 32px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 256, 48);
      const s = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: new THREE.CanvasTexture(canvas),
          depthTest: false,
          transparent: true,
          opacity: 0.92,
        }),
      );
      s.position.set(...toWorld(x, 3.4, z));
      s.scale.set(15, 2.8, 1);
      labels.add(s);
    };
    label('NAMSAN · 남산', 0, -22);
    label('JONGNO · 종로', -1, -49);
    label('YEOUIDO · 여의도', -46, 3);
    label('HAN RIVER · 한강', -4, 1);
    label('GANGNAM · 강남', 15, 42);
    label('JAMSIL · 잠실', 62, 45);
    label('WEST NEIGHBORHOODS', -99, -28);
    label('EAST RIVER PARK', 103, 25);
    label('NORTHERN HILLS', -37, -76);
    scene.add(labels);
    const bikeMat = new THREE.MeshStandardMaterial({
        color: '#ddfa8f',
        roughness: 0.5,
        emissive: '#9dbd5c',
        emissiveIntensity: 0.2,
      }),
      dark = new THREE.MeshStandardMaterial({ color: '#304c48' }),
      skin = new THREE.MeshStandardMaterial({ color: '#e5ba91' });
    const bike = (id: number) => {
      const g = new THREE.Group();
      const add = (
        geo: THREE.BufferGeometry,
        mat: THREE.Material,
        x: number,
        y: number,
        z: number,
      ) => {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(x, y, z);
        m.castShadow = true;
        g.add(m);
        return m;
      };
      for (const z of [-0.44, 0.44]) {
        const wheel = add(
          new THREE.TorusGeometry(0.32, 0.05, 5, 12),
          dark,
          0,
          0.34,
          z,
        );
        wheel.rotation.y = Math.PI / 2;
        const spoke = add(
          new THREE.BoxGeometry(0.045, 0.56, 0.035),
          bikeMat,
          0,
          0.34,
          z,
        );
        spoke.userData.spoke = true;
        add(new THREE.BoxGeometry(0.06, 0.7, 0.06), bikeMat, 0, 0.6, z + 0.04);
      }
      add(new THREE.BoxGeometry(0.09, 0.09, 0.87), bikeMat, 0, 0.7, 0);
      add(new THREE.BoxGeometry(0.48, 0.05, 0.08), dark, 0, 1.02, 0.42);
      add(new THREE.BoxGeometry(0.19, 0.1, 0.24), dark, 0, 0.98, -0.23);
      const shirt = new THREE.MeshStandardMaterial({
        color: ['#ef946a', '#f7d778', '#edf1da', '#86b2c0', '#8cc4a0'][id % 5],
      });
      add(
        new THREE.CylinderGeometry(0.14, 0.2, 0.56, 6),
        shirt,
        0,
        1.36,
        -0.1,
      ).rotation.x = 0.22;
      add(new THREE.SphereGeometry(0.19, 8, 6), skin, 0, 1.84, 0);
      add(new THREE.SphereGeometry(0.21, 8, 6), bikeMat, 0, 1.93, 0);
      add(
        new THREE.BoxGeometry(0.12, 0.58, 0.13),
        dark,
        0.12,
        0.84,
        -0.13,
      ).rotation.x = -0.45;
      add(
        new THREE.BoxGeometry(0.12, 0.58, 0.13),
        dark,
        -0.12,
        0.84,
        0.04,
      ).rotation.x = 0.45;
      g.userData = { id };
      g.scale.setScalar(1.2);
      return g;
    };
    // Visual aids expose the current departure rate without adding or removing journeys.
    const activityGroup = new THREE.Group();
    const columnMaterial = new THREE.MeshStandardMaterial({
      color: '#5adcca',
      emissive: '#29aa98',
      emissiveIntensity: 0.65,
      transparent: true,
      opacity: 0.8,
    });
    const columnGeometry = new THREE.CylinderGeometry(0.5, 0.68, 1, 12);
    const activityMarkers = stationPositions.map(([x, y, z]) => {
      const column = new THREE.Mesh(columnGeometry, columnMaterial);
      column.position.set(x + 1.7, y, z);
      activityGroup.add(column);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.85, 1.2, 32),
        new THREE.MeshBasicMaterial({
          color: '#bcffad',
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, y + 0.06, z);
      activityGroup.add(ring);
      return { column, ring, base: y, pulseAt: -Infinity };
    });
    scene.add(activityGroup);
    const haloGeometry = new THREE.CircleGeometry(0.7, 20);
    haloGeometry.rotateX(-Math.PI / 2);
    const halos = new THREE.InstancedMesh(
      haloGeometry,
      new THREE.MeshBasicMaterial({
        color: '#bcffc0',
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      }),
      512,
    );
    halos.count = 0;
    halos.frustumCulled = false;
    scene.add(halos);
    const trailPositions = new Float32Array(512 * 4 * 6),
      trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(trailPositions, 3),
    );
    const trailLines = new THREE.LineSegments(
      trailGeometry,
      new THREE.LineBasicMaterial({
        color: '#b7ffb0',
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    trailLines.frustumCulled = false;
    scene.add(trailLines);
    const overlayTransform = new THREE.Object3D();
    const sim = new Simulation(),
      riders = new Map<number, THREE.Group>();
    let followId: number | null = null,
      lastReset = latest.current.reset,
      lastNotifiedBoundary: number | undefined,
      lastOverview = latest.current.overview,
      lastView = latest.current.view,
      lastSeason = '',
      lastFps = performance.now(),
      measuredFps = 60,
      raf = 0,
      last = performance.now(),
      lastStats = last,
      frames = 0,
      ready = false;
    const rainGeo = new THREE.BufferGeometry(),
      rainPositions = new Float32Array(2400);
    for (let i = 0; i < 800; i++) {
      rainPositions[i * 3] = (hash(55, i, 1) - 0.5) * (WORLD_WIDTH + 8);
      rainPositions[i * 3 + 1] = hash(55, i, 2) * 60;
      rainPositions[i * 3 + 2] = (hash(55, i, 3) - 0.5) * (WORLD_DEPTH + 38);
    }
    rainGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(rainPositions, 3),
    );
    const rain = new THREE.Points(
      rainGeo,
      new THREE.PointsMaterial({
        color: '#d3eced',
        size: 0.23,
        transparent: true,
        opacity: 0.6,
      }),
    );
    scene.add(rain);
    const streakPositions = new Float32Array(4800),
      streakGeo = new THREE.BufferGeometry();
    streakGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(streakPositions, 3),
    );
    const streaks = new THREE.LineSegments(
      streakGeo,
      new THREE.LineBasicMaterial({
        color: '#d7e9e9',
        transparent: true,
        opacity: 0.45,
      }),
    );
    scene.add(streaks);
    const raycaster = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    let downX = 0,
      downY = 0;
    const pointerDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };
    const click = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 5) return;
      const r = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects([...riders.values()], true)[0];
      if (hit) {
        let target: THREE.Object3D = hit.object;
        while (target.parent && target.userData.id === undefined)
          target = target.parent;
        followId = target.userData.id;
        latest.current.onFollow(followId);
      }
    };
    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointerup', click);
    const resizeViewport = createViewportResizer(
      camera,
      renderer,
      el.clientWidth,
      el.clientHeight,
    );
    const resize = () => resizeViewport.queue(el.clientWidth, el.clientHeight);
    const sizeObserver = new ResizeObserver(resize);
    sizeObserver.observe(el);
    window.addEventListener('resize', resize);
    const animate = (now: number) => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const p = latest.current;
      if (p.reset !== lastReset) {
        sim.reset();
        lastReset = p.reset;
        lastNotifiedBoundary = undefined;
        activityMarkers.forEach((m) => (m.pulseAt = -Infinity));
      }
      if (p.overview !== lastOverview || p.view !== lastView) {
        overview();
        followId = null;
        latest.current.onFollow(null);
        lastOverview = p.overview;
        lastView = p.view;
      }
      if (!p.follow) followId = null;
      if (p.follow && followId === null && sim.journeys.length) {
        followId = sim.journeys[0].id;
        latest.current.onFollow(followId);
      }
      if (p.playing && !document.hidden)
        sim.step(
          timelineStepBudget(sim.time, dt * p.speed * 60, p.stopAtSeconds),
          p.prediction,
          p.scenario.functioning,
        );
      if (
        p.playing &&
        p.stopAtSeconds !== undefined &&
        sim.time >= p.stopAtSeconds - 1e-7 &&
        lastNotifiedBoundary !== p.stopAtSeconds
      ) {
        lastNotifiedBoundary = p.stopAtSeconds;
        p.onTimeBoundary?.();
      }
      const living = new Set(sim.journeys.map((j) => j.id));
      for (const [id, g] of riders)
        if (!living.has(id)) {
          scene.remove(g);
          g.traverse((o) => {
            if (o instanceof THREE.Mesh) {
              o.geometry.dispose();
              if (
                o.material !== bikeMat &&
                o.material !== dark &&
                o.material !== skin
              )
                (o.material as THREE.Material).dispose();
            }
          });
          riders.delete(id);
          if (id === followId) {
            followId = null;
            latest.current.onFollow(null);
          }
        }
      let overlayCount = 0,
        trailCount = 0;
      for (const j of sim.journeys) {
        let g = riders.get(j.id);
        if (!g) {
          g = bike(j.id);
          riders.set(j.id, g);
          scene.add(g);
          const index = stationPositions.findIndex(
            (point) =>
              Math.hypot(point[0] - j.points[0][0], point[2] - j.points[0][2]) <
              0.05,
          );
          if (index >= 0) activityMarkers[index].pulseAt = j.departure;
        }
        const pos = sim.position(j);
        g.position.set(...pos.position);
        g.rotation.y = pos.angle;
        g.scale.setScalar(p.emphasize !== false ? 1.75 : 1.2);
        if (overlayCount < 512) {
          overlayTransform.position.set(
            pos.position[0],
            pos.position[1] + 0.12,
            pos.position[2],
          );
          overlayTransform.scale.setScalar(1);
          overlayTransform.updateMatrix();
          halos.setMatrixAt(overlayCount++, overlayTransform.matrix);
          if (p.trails !== false)
            for (let k = 0; k < 4; k++) {
              const a = sim.position(
                  j,
                  Math.max(j.departure, sim.time - k * 14),
                ).position,
                b = sim.position(
                  j,
                  Math.max(j.departure, sim.time - (k + 1) * 14),
                ).position;
              trailPositions.set(
                [a[0], a[1] + 0.1, a[2], b[0], b[1] + 0.1, b[2]],
                trailCount++ * 6,
              );
            }
        }
        g.children.forEach((part) => {
          if (part.userData.spoke)
            part.rotation.x = (sim.time * j.speed) / 0.32;
        });
        g.children
          .slice(-2)
          .forEach(
            (leg, k) =>
              (leg.rotation.x =
                Math.sin(sim.time * 0.045 + k * Math.PI) * 0.45),
          );
        if (followId === j.id && !p.reduced) {
          const desired = g.position.clone().add(new THREE.Vector3(9, 7, 10));
          camera.position.lerp(desired, 0.04);
          controls.target.lerp(g.position, 0.08);
        }
      }
      halos.count = overlayCount;
      halos.instanceMatrix.needsUpdate = true;
      halos.visible = p.emphasize !== false;
      trailGeometry.setDrawRange(0, trailCount * 2);
      trailGeometry.attributes.position.needsUpdate = true;
      trailLines.visible = p.trails !== false;
      activityGroup.visible = p.activity !== false;
      for (const marker of activityMarkers) {
        const h = Math.min(13, (Math.max(0, p.prediction) / 3000) * 13);
        marker.column.scale.y = Math.max(0.001, h);
        marker.column.position.y = marker.base + h / 2;
        marker.column.visible = h > 0;
        const age = (sim.time - marker.pulseAt) / 45;
        marker.ring.scale.setScalar(1 + Math.max(0, Math.min(1, age)) * 0.8);
        marker.ring.material.opacity =
          age >= 0 && age < 1 ? 0.85 * (1 - age) : 0;
      }
      if (lastSeason !== p.scenario.season) {
        lastSeason = p.scenario.season;
        const autumn = lastSeason === 'Autumn',
          spring = lastSeason === 'Spring',
          winter = lastSeason === 'Winter';
        seasonalFoliage.forEach((mesh) => (mesh.visible = !winter));
        for (const [key, normal, fall, blossom] of [
          ['#668d54', '#6d994c', '#d9ab40', '#9abf64'],
          ['#8ca969', '#9ab865', '#efd56b', '#b8cc80'],
          ['#89a66c', '#7ea16a', '#b18050', '#ebc3cb'],
          ['#a4b580', '#a6b880', '#cea05c', '#f9e7e7'],
          ['#78965a', '#78965a', '#9e9860', '#92ad72'],
          ['#87a96c', '#87a96c', '#bdaf73', '#b0c58d'],
        ]) {
          const m = mats.get(key);
          if (m) {
            m.color.set(autumn ? fall : spring ? blossom : normal);
            m.transparent = winter;
            m.opacity = winter ? 0 : 1;
            m.depthWrite = !winter;
          }
        }
      }
      for (const m of mats.values())
        if (m.userData.shader)
          m.userData.shader.uniforms.windTime.value = p.reduced
            ? 0
            : now * 0.0006;
      labels.visible = p.labels;
      renderer.shadowMap.enabled = p.quality;
      const daylight = p.scenario.hour >= 6 && p.scenario.hour <= 19,
        twilight = p.scenario.hour < 8 || p.scenario.hour > 17;
      scene.background = new THREE.Color(
        daylight ? (twilight ? '#bac9c1' : '#bbd2d2') : '#263e50',
      );
      (scene.fog as THREE.Fog).color.copy(scene.background);
      ambient.intensity = daylight ? 1.65 : 0.65;
      sun.intensity = daylight ? (p.scenario.rainfall > 0 ? 1.0 : 2.4) : 0.25;
      sun.position.set(
        -Math.cos(((p.scenario.hour - 6) / 12) * Math.PI) * 65,
        40 + Math.max(0, Math.sin(((p.scenario.hour - 6) / 12) * Math.PI)) * 60,
        55,
      );
      const roadMaterial = mats.get('#6f7d7b');
      if (roadMaterial)
        roadMaterial.roughness = p.scenario.rainfall > 0 ? 0.3 : 0.85;
      sun.color.set(twilight ? '#ffd39b' : '#fff0d1');
      for (const [color, m] of mats) {
        if (['#627e7b', '#6e8881'].includes(color)) {
          m.emissive.set('#edbc79');
          m.emissiveIntensity = daylight ? 0 : 0.72;
        }
        if (color === '#fff0b4') {
          m.emissive.set('#ffce82');
          m.emissiveIntensity = daylight ? 0.1 : 2;
        }
      }
      for (const signMesh of signs)
        (signMesh.material as THREE.MeshStandardMaterial).emissiveIntensity =
          daylight ? 0.08 : 0.65;

      water.material.color.set(daylight ? '#388f96' : '#21465c');
      const verts = water.geometry.attributes.position;
      const movingWater = !p.reduced && p.waterMotion !== false;
      for (let i = 0; i < verts.count; i++)
        verts.setY(
          i,
          0.12 +
            (movingWater
              ? Math.sin(
                  waterBase[i * 3] * 0.4 +
                    waterBase[i * 3 + 2] * 0.8 +
                    now * 0.001,
                ) * 0.055
              : 0),
        );
      verts.needsUpdate = true;
      if (water.material.userData.shader)
        water.material.userData.shader.uniforms.riverTime.value = movingWater
          ? now * 0.001
          : 0;
      rain.visible = !p.reduced && p.scenario.snowfall > 0;
      streaks.visible = !p.reduced && p.scenario.rainfall > 0;
      if (rain.visible || streaks.visible) {
        rain.material.size = p.scenario.snowfall > 0 ? 0.4 : 0.2;
        for (let i = 0; i < 800; i++) {
          rainPositions[i * 3 + 1] -= dt * (p.scenario.snowfall > 0 ? 3 : 30);
          if (rainPositions[i * 3 + 1] < 0) rainPositions[i * 3 + 1] = 60;
        }
        rainGeo.attributes.position.needsUpdate = true;
        for (let i = 0; i < 800; i++) {
          const x = rainPositions[i * 3],
            y = rainPositions[i * 3 + 1],
            z = rainPositions[i * 3 + 2];
          streakPositions.set([x, y, z, x + 0.15, y - 1.2, z], i * 6);
        }
        streakGeo.attributes.position.needsUpdate = true;
      }
      controls.enableDamping = !p.reduced;
      controls.update();
      resizeViewport.flush();
      renderer.render(scene, camera);
      frames++;
      if (now - lastFps > 1000) {
        measuredFps = Math.round((frames * 1000) / (now - lastFps));
        lastFps = now;
        frames = 0;
      }
      if (now - lastStats > 200) {
        p.onStats({
          riders: riders.size,
          departures: sim.departures,
          minutes: sim.time / 60,
          fps: measuredFps,
        });
        lastStats = now;
      }
      if (!ready) {
        ready = true;
        p.onReady();
      }
    };
    raf = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(raf);
      sizeObserver.disconnect();
      window.removeEventListener('resize', resize);
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointerup', click);
      controls.dispose();
      scene.traverse((o) => {
        if (
          o instanceof THREE.Mesh ||
          o instanceof THREE.Points ||
          o instanceof THREE.LineSegments
        ) {
          o.geometry.dispose();
          const materials = Array.isArray(o.material)
            ? o.material
            : [o.material];
          materials.forEach((m) => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        }
        if (o instanceof THREE.Sprite) {
          o.material.map?.dispose();
          o.material.dispose();
        }
      });
      Object.values(textures).forEach((t) => t.dispose());
      environment.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return <div className="city-canvas" ref={mount} />;
}
