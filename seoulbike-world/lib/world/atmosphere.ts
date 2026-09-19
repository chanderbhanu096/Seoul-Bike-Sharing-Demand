import * as THREE from 'three';
import type { Scenario } from '@/lib/scenario';
import { hash } from './simulation';

const clamp = THREE.MathUtils.clamp;

/** Visual interpretation of the applied inputs, independent of rental demand. */
export function atmosphereFor(s: Scenario) {
  const elevation = Math.sin(((s.hour - 6) / 24) * Math.PI * 2);
  const daylight = THREE.MathUtils.smoothstep(elevation, -0.12, 0.22);
  const rain = clamp(s.rainfall / 8, 0, 1);
  const snow = s.snowfall > 0 ? clamp(0.3 + s.snowfall / 5, 0, 1) : 0;
  const cloud = clamp(
    0.12 +
      s.humidity / 180 +
      rain * 0.55 +
      snow * 0.45 -
      s.solarRadiation * 0.12,
    0.08,
    1,
  );
  return {
    elevation,
    daylight,
    rain,
    snow,
    cloud,
    wet: s.rainfall > 0 ? clamp(0.35 + rain, 0, 1) : 0,
  };
}

const noiseGLSL = `
float weatherHash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float weatherNoise(vec2 p) {
  vec2 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(weatherHash(i),weatherHash(i+vec2(1,0)),f.x),
             mix(weatherHash(i+vec2(0,1)),weatherHash(i+vec2(1,1)),f.x),f.y);
}
float weatherFbm(vec2 p) {
  return .55*weatherNoise(p)+.28*weatherNoise(p*2.03)+.12*weatherNoise(p*4.07)+.05*weatherNoise(p*8.1);
}`;

export function createAtmosphere(
  scene: THREE.Scene,
  initial: Scenario,
  compact: boolean,
) {
  const state = atmosphereFor(initial);
  const surface = {
    snow: { value: state.snow },
    wet: { value: state.wet },
    night: { value: 1 - state.daylight },
  };
  const skyUniforms = {
    topColor: { value: new THREE.Color('#528fc0') },
    horizonColor: { value: new THREE.Color('#dae5e4') },
    sunDirection: { value: new THREE.Vector3() },
    daylight: { value: state.daylight },
    clouds: { value: state.cloud },
    time: { value: 0 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1200, 24, 16),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 skyDirection; void main(){skyDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `${noiseGLSL}
      varying vec3 skyDirection; uniform vec3 topColor,horizonColor,sunDirection;
      uniform float daylight,clouds,time;
      void main(){
        vec3 d=normalize(skyDirection);
        vec3 color=mix(horizonColor,topColor,pow(max(d.y,0.),.55));
        float sunlight=max(dot(d,sunDirection),0.);
        color+=vec3(1.,.66,.31)*pow(sunlight,32.)*.2*daylight*(1.-clouds*.7);
        color+=vec3(1.,.91,.69)*smoothstep(.9993,.9997,sunlight)*daylight;
        float moon=max(dot(d,-sunDirection),0.);
        color+=vec3(.65,.77,.94)*smoothstep(.9994,.9998,moon)*(1.-daylight);
        vec2 starCell=floor(d.xz*420./max(.3,d.y+.7));
        float stars=step(.9985,weatherHash(starCell))*pow(max(d.y,0.),.6);
        color+=vec3(stars)*(1.-daylight)*(1.-clouds)*.7;
        vec2 cloudUv=d.xz/max(.18,d.y+.2)*2.4+vec2(time*.002,0.);
        float cover=smoothstep(.73-clouds*.29,.87-clouds*.26,weatherFbm(cloudUv));
        cover*=smoothstep(-.02,.15,d.y)*.72;
        color=mix(color,mix(vec3(.10,.15,.24),vec3(.87,.91,.93),daylight),cover);
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    }),
  );
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  // Soft cloud banks have depth in district views; overhead views keep the map legible.
  const cloudGeometry = new THREE.PlaneGeometry(1, 1);
  const cloudMeshes: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[] =
    [];
  for (let i = 0; i < 14; i++) {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        cloudColor: { value: new THREE.Color() },
        opacity: { value: 0 },
        seed: { value: i * 7.1 },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      vertexShader: `varying vec2 cloudUv; void main(){cloudUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader: `${noiseGLSL}
        varying vec2 cloudUv; uniform vec3 cloudColor; uniform float opacity,seed;
        void main(){
          vec2 p=(cloudUv-.5)*2.;
          float shape=1.-smoothstep(.32,1.,length(p*vec2(.9,1.)));
          float wisps=weatherFbm(cloudUv*5.+seed);
          float a=shape*smoothstep(.18,.65,wisps)*opacity;
          if(a<.008)discard;
          gl_FragColor=vec4(cloudColor*(.8+.2*cloudUv.y),a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const cloud = new THREE.Mesh(cloudGeometry, material);
    cloud.position.set(
      -136 + hash(905, i) * 272,
      42 + hash(906, i) * 23,
      (i % 2 ? -1 : 1) * (55 + hash(907, i) * 48),
    );
    cloud.scale.set(30 + hash(908, i) * 20, 12 + hash(909, i) * 7, 1);
    cloud.userData.originX = cloud.position.x;
    scene.add(cloud);
    cloudMeshes.push(cloud);
  }

  const maxParticles = compact ? 1100 : 2200;
  const snowPositions = new Float32Array(maxParticles * 3);
  const rainPositions = new Float32Array(maxParticles * 6);
  const seeds = Array.from({ length: maxParticles }, (_, i) => [
    (hash(551, i) - 0.5) * 270,
    hash(552, i) * 67 + 1,
    (hash(553, i) - 0.5) * 220,
  ]);
  const snowGeometry = new THREE.BufferGeometry();
  snowGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(snowPositions, 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  const snowMaterial = new THREE.ShaderMaterial({
    uniforms: {
      night: surface.night,
      pixelRatio: { value: Math.min(devicePixelRatio, 1.75) },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: `uniform float pixelRatio; void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(650./max(1.,-p.z),1.8,6.)*pixelRatio;}`,
    fragmentShader: `uniform float night; void main(){float a=1.-smoothstep(.18,.5,length(gl_PointCoord-.5));if(a<.02)discard;gl_FragColor=vec4(mix(vec3(1.),vec3(.8,.9,1.),night),a*.9);}`,
  });
  const snowflakes = new THREE.Points(snowGeometry, snowMaterial);
  snowflakes.frustumCulled = false;
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute(
    'position',
    new THREE.BufferAttribute(rainPositions, 3).setUsage(
      THREE.DynamicDrawUsage,
    ),
  );
  const rainMaterial = new THREE.LineBasicMaterial({
    color: '#bedbea',
    transparent: true,
    opacity: 0.54,
    depthWrite: false,
  });
  const rain = new THREE.LineSegments(rainGeometry, rainMaterial);
  rain.frustumCulled = false;
  scene.add(snowflakes, rain);

  const dayTop = new THREE.Color('#508fc2'),
    nightTop = new THREE.Color('#09152e'),
    overcastTop = new THREE.Color('#667e92');
  const dayHorizon = new THREE.Color('#b4d1e8'),
    nightHorizon = new THREE.Color('#253957'),
    duskHorizon = new THREE.Color('#e4a587');
  const dayCloud = new THREE.Color('#f4f6f6'),
    nightCloud = new THREE.Color('#71829d');
  const fogColor = new THREE.Color();
  let elapsed = 0;
  let applied = initial;
  let target = state;

  /** Adds directional snow cover to upward surfaces; walls and cleared roads stay readable. */
  const coat = (
    material: THREE.MeshStandardMaterial,
    snowAmount = 1,
    wetAmount = 0.12,
  ) => {
    const previousKey = material.onBeforeCompile.toString();
    const previous = material.onBeforeCompile.bind(material);
    material.onBeforeCompile = (shader, renderer) => {
      previous(shader, renderer);
      shader.uniforms.weatherSnow = surface.snow;
      shader.uniforms.weatherWet = surface.wet;
      shader.vertexShader =
        'varying vec3 weatherPosition; varying float weatherUp;\n' +
        shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n weatherPosition=position; weatherUp=normal.y;',
      );
      shader.fragmentShader =
        `varying vec3 weatherPosition; varying float weatherUp; uniform float weatherSnow,weatherWet; ${noiseGLSL}\n` +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float snowCover=0.;
        if(weatherSnow>.001){
          float snowNoise=weatherFbm(weatherPosition.xz*1.5);
          snowCover=smoothstep(.38,.78,weatherUp)*smoothstep(.08,.55,snowNoise+weatherSnow*.65)*weatherSnow*${snowAmount.toFixed(2)};
        }
        diffuseColor.rgb*=1.-weatherWet*${wetAmount.toFixed(2)};
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.89,.94,.98),snowCover);`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>\n roughnessFactor=mix(roughnessFactor,.95,snowCover);`,
      );
    };
    material.customProgramCacheKey = () =>
      `weather-surface-${snowAmount}-${wetAmount}-${previousKey}`;
  };

  return {
    surface,
    coat,
    update(s: Scenario, camera: THREE.Camera, dt: number, reduced: boolean) {
      if (applied !== s) {
        applied = s;
        target = atmosphereFor(s);
      }
      const blend = 1 - Math.exp(-dt * 2.5);
      for (const key of [
        'elevation',
        'daylight',
        'rain',
        'snow',
        'cloud',
        'wet',
      ] as const)
        state[key] = THREE.MathUtils.lerp(state[key], target[key], blend);
      surface.snow.value = state.snow;
      surface.wet.value = state.wet;
      surface.night.value = 1 - state.daylight;
      if (!reduced) elapsed += dt;
      sky.position.copy(camera.position);
      skyUniforms.time.value = elapsed * (1 + s.windSpeed * 0.2);
      skyUniforms.daylight.value = state.daylight;
      skyUniforms.clouds.value = state.cloud;
      const angle = ((s.hour - 6) / 24) * Math.PI * 2;
      skyUniforms.sunDirection.value
        .set(-Math.cos(angle), Math.sin(angle), -0.3)
        .normalize();
      skyUniforms.topColor.value
        .copy(nightTop)
        .lerp(dayTop, state.daylight)
        .lerp(overcastTop, state.cloud * state.daylight * 0.6);
      const dusk =
        (1 - Math.min(1, Math.abs(state.elevation) * 3.5)) *
        (1 - state.cloud * 0.7);
      skyUniforms.horizonColor.value
        .copy(nightHorizon)
        .lerp(dayHorizon, state.daylight)
        .lerp(duskHorizon, dusk * 0.7);
      fogColor.copy(skyUniforms.horizonColor.value);
      const fog = scene.fog as THREE.Fog;
      fog.color.copy(fogColor);
      const haze = 1 - clamp(s.visibility / 2000, 0, 1);
      // Frame-dependent fog distance preserves the complete miniature even in the phone overview.
      const distance = camera.position.length();
      fog.near = Math.max(110, distance * 0.75) + (1 - haze) * 110;
      fog.far = fog.near + 240 + (1 - haze) * 850;
      for (const cloud of cloudMeshes) {
        cloud.quaternion.copy(camera.quaternion);
        cloud.position.x =
          ((cloud.userData.originX +
            elapsed * (0.35 + s.windSpeed * 0.13) +
            160) %
            320) -
          160;
        cloud.material.uniforms.cloudColor.value
          .copy(nightCloud)
          .lerp(dayCloud, state.daylight);
        cloud.material.uniforms.opacity.value =
          (0.35 + state.cloud * 0.52) *
          (camera.position.y > 120 ? 0.5 : 0.9) *
          THREE.MathUtils.smoothstep(
            camera.position.distanceTo(cloud.position),
            distance * 0.65,
            distance * 0.95,
          );
      }
      snowflakes.visible = !reduced && s.snowfall > 0;
      rain.visible = !reduced && s.rainfall > 0;
      const snowCount = Math.round(maxParticles * state.snow);
      const rainCount = Math.round(maxParticles * (0.25 + state.rain * 0.75));
      snowGeometry.setDrawRange(0, snowCount);
      rainGeometry.setDrawRange(0, rainCount * 2);
      const wind = Math.min(s.windSpeed, 9) * 0.24;
      for (
        let i = 0;
        i <
        Math.max(
          snowflakes.visible ? snowCount : 0,
          rain.visible ? rainCount : 0,
        );
        i++
      ) {
        const [x, y, z] = seeds[i];
        if (snowflakes.visible && i < snowCount) {
          snowPositions[i * 3] =
            ((x + elapsed * wind + 150) % 300) -
            150 +
            Math.sin(elapsed * 0.9 + i) * 0.8;
          snowPositions[i * 3 + 1] =
            (y - ((elapsed * (2 + hash(554, i))) % 68) + 68) % 68;
          snowPositions[i * 3 + 2] = z + Math.cos(elapsed * 0.7 + i) * 0.6;
        }
        if (rain.visible && i < rainCount) {
          const py = (y - ((elapsed * 32) % 68) + 68) % 68;
          rainPositions.set(
            [x, py, z, x + wind * 0.32 + 0.22, py - 2.1 - state.rain, z],
            i * 6,
          );
        }
      }
      if (snowflakes.visible)
        snowGeometry.attributes.position.needsUpdate = true;
      if (rain.visible) rainGeometry.attributes.position.needsUpdate = true;
      return state;
    },
  };
}
