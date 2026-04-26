import {
  BackSide,
  Color,
  Mesh,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  type Vector3,
} from 'three'
import { gameConfig } from './gameConfig'

type SkyDomeController = {
  syncFromConfig: () => void
  update: (delta: number, cameraPos: Vector3) => void
  dispose: () => void
}

const SKY_VERT = `
varying vec3 vWorldPos;

void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`

const SKY_FRAG = `
varying vec3 vWorldPos;

uniform vec3 uSkyColor;
uniform float uCloudCoverage;
uniform float uCloudSoftness;
uniform float uCloudScale;
uniform float uCloudSpeed;
uniform float uCloudOpacity;
uniform float uTime;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  float a = hash(i + vec2(0.0, 0.0));
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amp * noise(p);
    p = p * 2.01 + vec2(17.1, 9.2);
    amp *= 0.5;
  }
  return value;
}

void main() {
  vec3 dir = normalize(vWorldPos);
  float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);

  vec3 horizon = uSkyColor * 0.75;
  vec3 zenith = min(vec3(1.0), uSkyColor * 1.25 + vec3(0.02, 0.03, 0.05));
  vec3 skyBase = mix(horizon, zenith, pow(h, 1.2));

  float lon = atan(dir.z, dir.x);
  vec2 uv = vec2(
    lon / 6.2831853 + uTime * uCloudSpeed,
    dir.y * 0.65 + 0.5 + uTime * uCloudSpeed * 0.08
  );
  uv *= max(0.01, uCloudScale) * 3.4;

  float cloud = fbm(uv);
  float cloudMask = smoothstep(
    uCloudCoverage - uCloudSoftness,
    uCloudCoverage + uCloudSoftness,
    cloud
  );
  cloudMask *= smoothstep(0.1, 0.95, h);

  vec3 cloudTint = vec3(0.93, 0.95, 1.0);
  vec3 col = mix(skyBase, cloudTint, cloudMask * uCloudOpacity);
  gl_FragColor = vec4(col, 1.0);
}
`

export function createProceduralSky(scene: Scene): SkyDomeController {
  const material = new ShaderMaterial({
    uniforms: {
      uSkyColor: { value: new Color() },
      uCloudCoverage: { value: 0.5 },
      uCloudSoftness: { value: 0.16 },
      uCloudScale: { value: 1.35 },
      uCloudSpeed: { value: 0.022 },
      uCloudOpacity: { value: 0.4 },
      uTime: { value: 0 },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: BackSide,
    depthWrite: false,
    fog: false,
  })
  const mesh = new Mesh(new SphereGeometry(380, 48, 28), material)
  mesh.frustumCulled = false
  scene.add(mesh)

  function syncFromConfig(): void {
    material.uniforms.uSkyColor.value.setRGB(
      gameConfig.skyboxColorR,
      gameConfig.skyboxColorG,
      gameConfig.skyboxColorB,
    )
    material.uniforms.uCloudCoverage.value = gameConfig.skyCloudCoverage
    material.uniforms.uCloudSoftness.value = gameConfig.skyCloudSoftness
    material.uniforms.uCloudScale.value = gameConfig.skyCloudScale
    material.uniforms.uCloudSpeed.value = gameConfig.skyCloudSpeed
    material.uniforms.uCloudOpacity.value = gameConfig.skyCloudOpacity
    if (scene.background instanceof Color) {
      scene.background.setRGB(
        gameConfig.skyboxColorR,
        gameConfig.skyboxColorG,
        gameConfig.skyboxColorB,
      )
    }
  }

  function update(delta: number, cameraPos: Vector3): void {
    material.uniforms.uTime.value += delta
    mesh.position.copy(cameraPos)
  }

  function dispose(): void {
    scene.remove(mesh)
    mesh.geometry.dispose()
    material.dispose()
  }

  syncFromConfig()
  return { syncFromConfig, update, dispose }
}
