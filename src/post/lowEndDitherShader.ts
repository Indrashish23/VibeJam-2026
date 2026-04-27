/**
 * Screen-space dither after OutputPass: interleaved gradient + hash noise.
 * `strength` scales combined amplitude in linear RGB (0 = off).
 */
export const LowEndDitherShader = {
  name: 'LowEndDitherShader',
  uniforms: {
    tDiffuse: { value: null },
    /** Overall dither strength; typical useful range ~0.02–0.14. */
    strength: { value: 0.045 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float strength;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 fc = gl_FragCoord.xy;
      float ign = fract(52.9829189 * fract(dot(fc, vec2(0.06711056, 0.00583715))));
      float h = fract(sin(dot(fc, vec2(12.9898, 78.233))) * 43758.5453);
      float n = (ign - 0.5) * 0.62 + (h - 0.5) * 0.38;
      color.rgb += vec3(n) * strength;
      gl_FragColor = color;
    }
  `,
}
