/**
 * Lightweight cel + outline post-pass.
 * - Quantizes lit colors into toon-like bands.
 * - Detects local contrast and darkens edges to black.
 */
export const CelOutlineShader = {
  uniforms: {
    tDiffuse: { value: null },
    resolution: { value: [1, 1] as [number, number] },
    levels: { value: 5.0 },
    edgeThreshold: { value: 0.19 },
    edgeSoftness: { value: 0.1 },
    outlineStrength: { value: 1.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float levels;
    uniform float edgeThreshold;
    uniform float edgeSoftness;
    uniform float outlineStrength;
    varying vec2 vUv;

    float lum(vec3 c) {
      return dot(c, vec3(0.299, 0.587, 0.114));
    }

    void main() {
      vec2 texel = 1.0 / max(resolution, vec2(1.0));
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = lum(c);

      float lL = lum(texture2D(tDiffuse, vUv + vec2(-texel.x, 0.0)).rgb);
      float lR = lum(texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).rgb);
      float lU = lum(texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).rgb);
      float lD = lum(texture2D(tDiffuse, vUv + vec2(0.0, -texel.y)).rgb);

      float edge = max(max(abs(l - lL), abs(l - lR)), max(abs(l - lU), abs(l - lD)));
      float edgeMask = smoothstep(edgeThreshold, edgeThreshold + edgeSoftness, edge) * outlineStrength;

      vec3 toon = floor(c * levels) / max(levels - 1.0, 1.0);
      vec3 outColor = mix(toon, vec3(0.0), clamp(edgeMask, 0.0, 1.0));
      gl_FragColor = vec4(outColor, 1.0);
    }
  `,
}
