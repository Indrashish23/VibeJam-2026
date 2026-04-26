/**
 * Tiny ordered-ish noise after OutputPass to soften banding (sky gradients) without extra RTs.
 * One hash + one MAD per fragment; keep `amount` small so it reads as dither, not grain.
 */
export const LowEndDitherShader = {
  name: 'LowEndDitherShader',
  uniforms: {
    tDiffuse: { value: null },
    /** Strength in roughly display RGB units; ~1–2 / 255 is subtle. */
    amount: { value: 1.35 / 255 },
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
    uniform float amount;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 g = floor(gl_FragCoord.xy);
      float h = fract(sin(dot(g, vec2(12.9898, 78.233))) * 43758.5453);
      float n = h - 0.5;
      color.rgb += vec3(n) * amount;
      gl_FragColor = color;
    }
  `,
}
