import * as THREE from 'three';
import { hash } from './simulation';
import { ROAD_XS, ROAD_ZS, toWorld } from './geography';

/** Decorative pedestrians never contribute to the model-driven cyclist count. */
export function createStreetLife(
  scene: THREE.Scene,
  lamps: THREE.Vector3[],
  compact: boolean,
) {
  const count = compact ? 64 : 120;
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const make = (
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    n = count,
  ) => {
    const mesh = new THREE.InstancedMesh(geometry, material, n);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  };
  const coats = make(
    new THREE.CylinderGeometry(0.16, 0.21, 0.58, 6),
    new THREE.MeshStandardMaterial({ roughness: 0.9 }),
  );
  const heads = make(
    new THREE.SphereGeometry(0.16, 8, 6),
    new THREE.MeshStandardMaterial({ color: '#dcb893' }),
  );
  const legs = make(
    new THREE.BoxGeometry(0.11, 0.48, 0.13),
    new THREE.MeshStandardMaterial({ color: '#364558' }),
    count * 2,
  );
  const umbrellas = make(
    new THREE.SphereGeometry(0.65, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.75 }),
  );
  const handles = make(
    new THREE.CylinderGeometry(0.02, 0.02, 0.85, 5),
    new THREE.MeshStandardMaterial({ color: '#53606a' }),
  );
  const walkers = Array.from({ length: count }, (_, i) => {
    const section = i % (ROAD_XS.length - 1);
    const left = ROAD_XS[section] + 6;
    const right = ROAD_XS[section + 1] - 6;
    const palette = [
      '#b6534c',
      '#e6c796',
      '#436b8a',
      '#ddded1',
      '#557567',
      '#a687bb',
    ];
    coats.setColorAt(i, color.set(palette[i % palette.length]));
    umbrellas.setColorAt(i, color.set(palette[(i + 2) % palette.length]));
    return {
      x: (left + right) / 2,
      span: (right - left) / 2,
      z: ROAD_ZS[Math.floor(i / 5) % ROAD_ZS.length] + (i % 2 ? -3.25 : 3.25),
      phase: hash(995, i) * Math.PI * 2,
      speed: 0.045 + hash(997, i) * 0.045,
    };
  });

  const poolMaterial = new THREE.ShaderMaterial({
    uniforms: { opacity: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `varying vec2 poolUv;void main(){poolUv=uv;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 poolUv;uniform float opacity;void main(){float d=length(poolUv-.5)*2.;float a=pow(max(0.,1.-d),2.);gl_FragColor=vec4(1.,.66,.28,a*opacity);}`,
  });
  const poolGeometry = new THREE.PlaneGeometry(6, 6);
  poolGeometry.rotateX(-Math.PI / 2);
  const pools = make(poolGeometry, poolMaterial, lamps.length);
  lamps.forEach((p, i) => {
    dummy.position.copy(p);
    dummy.updateMatrix();
    pools.setMatrixAt(i, dummy.matrix);
  });

  // Parked cars sit in lay-bys beside the outer boulevards, clear of the cycling lanes.
  const carPositions = Array.from({ length: 26 }, (_, i) => [
    -108 + (i % 13) * 17,
    i < 13 ? -66.3 : 66.3,
  ]).filter(([x]) => ROAD_XS.every((road) => Math.abs(x - road) > 5.5));
  const carCount = carPositions.length;
  const carBody = make(
    new THREE.BoxGeometry(2.3, 0.6, 1.05),
    new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0.22 }),
    carCount,
  );
  const carRoof = make(
    new THREE.BoxGeometry(1.25, 0.46, 0.88),
    new THREE.MeshStandardMaterial({
      color: '#324d60',
      roughness: 0.18,
      metalness: 0.3,
    }),
    carCount,
  );
  const tyres = make(
    new THREE.CylinderGeometry(0.24, 0.24, 0.13, 8).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#283238' }),
    carCount * 4,
  );
  for (let i = 0; i < carCount; i++) {
    const [x, z] = carPositions[i];
    dummy.position.set(...toWorld(x, 0.91, z));
    dummy.rotation.y = Math.atan2(
      toWorld(x + 0.1, 0, z)[2] - toWorld(x, 0, z)[2],
      -0.1,
    );
    dummy.updateMatrix();
    carBody.setMatrixAt(i, dummy.matrix);
    carBody.setColorAt(
      i,
      color.set(['#e9e6dd', '#426b87', '#ad5c50', '#758789'][i % 4]),
    );
    dummy.position.y = 1.42;
    dummy.updateMatrix();
    carRoof.setMatrixAt(i, dummy.matrix);
    for (let k = 0; k < 4; k++) {
      dummy.position.set(
        ...toWorld(
          x + (k % 2 ? -0.75 : 0.75),
          0.64,
          z + (k < 2 ? -0.52 : 0.52),
        ),
      );
      dummy.updateMatrix();
      tyres.setMatrixAt(i * 4 + k, dummy.matrix);
    }
  }
  let elapsed = 0;
  return {
    update(
      dt: number,
      weather: { daylight: number; wet: number },
      paused: boolean,
    ) {
      if (!paused) elapsed += dt;
      poolMaterial.uniforms.opacity.value =
        (1 - weather.daylight) * (0.75 + weather.wet * 0.25);
      pools.visible = weather.daylight < 0.99;
      const hasUmbrellas = weather.wet > 0.15;
      umbrellas.visible = handles.visible = hasUmbrellas;
      for (let i = 0; i < count; i++) {
        const w = walkers[i],
          angle = elapsed * w.speed + w.phase;
        const x = w.x + Math.sin(angle) * w.span;
        const direction = Math.cos(angle) > 0 ? 1 : -1;
        const [px, , pz] = toWorld(x, 0, w.z);
        const bend = toWorld(x + 0.1, 0, w.z)[2] - pz;
        dummy.rotation.set(
          0,
          Math.atan2(0.1, bend) + (direction < 0 ? Math.PI : 0),
          0,
        );
        dummy.position.set(px, 1.2, pz);
        dummy.updateMatrix();
        coats.setMatrixAt(i, dummy.matrix);
        dummy.position.y = 1.72;
        dummy.updateMatrix();
        heads.setMatrixAt(i, dummy.matrix);
        for (let leg = 0; leg < 2; leg++) {
          dummy.position.set(
            px + (leg ? -0.105 : 0.105) * Math.cos(dummy.rotation.y),
            0.73,
            pz - (leg ? -0.105 : 0.105) * Math.sin(dummy.rotation.y),
          );
          dummy.rotation.x = paused
            ? 0
            : Math.sin(elapsed * 4.4 + w.phase + leg * Math.PI) * 0.32;
          dummy.updateMatrix();
          legs.setMatrixAt(i * 2 + leg, dummy.matrix);
        }
        dummy.rotation.x = 0;
        if (hasUmbrellas) {
          dummy.position.set(px + 0.17, 2.12, pz);
          dummy.updateMatrix();
          umbrellas.setMatrixAt(i, dummy.matrix);
          dummy.position.y = 1.71;
          dummy.updateMatrix();
          handles.setMatrixAt(i, dummy.matrix);
        }
      }
      for (const mesh of [coats, heads, legs, umbrellas, handles])
        mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
