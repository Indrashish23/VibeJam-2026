import {
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three'

const ARENA_TRIPLANAR_TEX_URL = new URL('../../Assets/Maps/texture_08.png', import.meta.url).href

let cachedTriplanarTex: Promise<Texture> | null = null

export function loadArenaTriplanarTexture(): Promise<Texture> {
  if (!cachedTriplanarTex) {
    const loader = new TextureLoader()
    cachedTriplanarTex = new Promise((resolve, reject) => {
      loader.load(
        ARENA_TRIPLANAR_TEX_URL,
        (tex) => {
          tex.colorSpace = SRGBColorSpace
          tex.flipY = false
          tex.wrapS = tex.wrapT = RepeatWrapping
          tex.needsUpdate = true
          resolve(tex)
        },
        undefined,
        reject,
      )
    })
  }
  return cachedTriplanarTex
}

/**
 * World-space triplanar albedo on top of MeshStandard lighting (replaces UV-based `map` sampling).
 */
export function createArenaTriplanarMaterial(albedo: Texture, scale = 0.09): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({
    map: albedo,
    metalness: 0.22,
    roughness: 0.84,
    envMapIntensity: 0.85,
  })

  mat.userData.triplanarScale = scale

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.triplanarScale = { value: scale }
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
uniform float triplanarScale;`,
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>
varying vec3 vTriPlanarPos;
varying vec3 vTriPlanarN;`,
    )
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
{
  vec4 tpW = modelMatrix * vec4( transformed, 1.0 );
  vTriPlanarPos = tpW.xyz;
  vTriPlanarN = normalize( mat3( modelMatrix ) * objectNormal );
}`,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>
varying vec3 vTriPlanarPos;
varying vec3 vTriPlanarN;`,
    )
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
#ifdef USE_MAP
{
  vec3 n = normalize( vTriPlanarN );
  vec3 w = abs( n );
  w /= max( w.x + w.y + w.z, 1e-5 );
  float sc = triplanarScale;
  vec2 uxv = vTriPlanarPos.zy * sc;
  vec2 uyv = vTriPlanarPos.xz * sc;
  vec2 uzv = vTriPlanarPos.xy * sc;
  vec4 tx = texture2D( map, uxv );
  vec4 ty = texture2D( map, uyv );
  vec4 tz = texture2D( map, uzv );
  vec4 sampledDiffuseColor = tx * w.x + ty * w.y + tz * w.z;
  diffuseColor *= sampledDiffuseColor;
}
#endif
`,
    )
  }

  mat.customProgramCacheKey = () => `triplanar:${scale}:${albedo.uuid}`
  return mat
}
