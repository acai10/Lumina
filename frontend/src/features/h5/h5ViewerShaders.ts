export const vertexShader = /* glsl */ `
in float vIndex;
in float vIntensity;
out float fIntensity;
out float fS;
out float fW;
out float fH;

uniform float uNSlices;
uniform float uHeight;
uniform float uWidth;
uniform float uVolumeSpacing;
uniform float uPointSize;

void main() {
    float sliceSize = uHeight * uWidth;
    float s = floor(vIndex / sliceSize);
    float rem = mod(vIndex, sliceSize);
    float h = floor(rem / uWidth);
    float w = mod(rem, uWidth);

    float x = w - uWidth * 0.5;
    float y = (s - uNSlices * 0.5) * (uVolumeSpacing / uNSlices);
    float z = h - uHeight * 0.5;

    fIntensity = vIntensity;
    fS = s;
    fW = w;
    fH = h;
    gl_PointSize = uPointSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(x, y, z, 1.0);
}
`

export const fragmentShader = /* glsl */ `
precision highp float;
in float fIntensity;
in float fS;
in float fW;
in float fH;
out vec4 fragColor;

uniform float uThreshold;
uniform float uBrightness;
uniform float uContrast;
uniform float uOpacity;
uniform float uSliceMin;
uniform float uSliceMax;
uniform float uWidthMin;
uniform float uWidthMax;
uniform float uHeightMin;
uniform float uHeightMax;

void main() {
    if (fIntensity < uThreshold) discard;
    if (fS < uSliceMin || fS >= uSliceMax) discard;
    if (fW < uWidthMin || fW >= uWidthMax) discard;
    if (fH < uHeightMin || fH >= uHeightMax) discard;
    float c = clamp(fIntensity * uBrightness, 0.0, 1.0);
    if (c < 0.5) c = 0.5 * pow(2.0 * c, uContrast);
    else         c = 1.0 - 0.5 * pow(2.0 * (1.0 - c), uContrast);
    fragColor = vec4(c, c, c, uOpacity);
}
`
