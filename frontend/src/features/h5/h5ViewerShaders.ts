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
// 0 = gray, 1 = jet, 2 = hot
uniform int uColormap;
uniform float uColormapMin;
uniform float uColormapMax;
// 0 = color by intensity, 1 = color by depth (slice position)
uniform int uColorByDepth;

vec3 applyColormap(float t) {
    if (uColormap == 1) {
        // JET
        float r = clamp(1.5 - abs(4.0 * t - 3.0), 0.0, 1.0);
        float g = clamp(1.5 - abs(4.0 * t - 2.0), 0.0, 1.0);
        float b = clamp(1.5 - abs(4.0 * t - 1.0), 0.0, 1.0);
        return vec3(r, g, b);
    }
    if (uColormap == 2) {
        // HOT
        return vec3(
            clamp(t * 3.0,       0.0, 1.0),
            clamp(t * 3.0 - 1.0, 0.0, 1.0),
            clamp(t * 3.0 - 2.0, 0.0, 1.0)
        );
    }
    // GRAY (default)
    return vec3(t, t, t);
}

void main() {
    if (fIntensity < uThreshold) discard;
    if (fS < uSliceMin || fS >= uSliceMax) discard;
    if (fW < uWidthMin || fW >= uWidthMax) discard;
    if (fH < uHeightMin || fH >= uHeightMax) discard;
    float t;
    if (uColorByDepth == 1) {
        // Map slice position within the visible clip range → full colormap gradient.
        float depthSpan = max(uSliceMax - uSliceMin, 1.0);
        t = clamp((fS - uSliceMin) / depthSpan, 0.0, 1.0);
        // Still apply the intensity range so the user can compress/expand depth bands.
        float span = max(uColormapMax - uColormapMin, 0.001);
        t = clamp((t - uColormapMin) / span, 0.0, 1.0);
    } else {
        // Remap [uThreshold, 1.0] → [0, 1] so the full colormap gradient covers
        // the visible intensity range, not just the narrow band above threshold.
        float visible = clamp((fIntensity - uThreshold) / max(1.0 - uThreshold, 0.001), 0.0, 1.0);
        float c = clamp(visible * uBrightness, 0.0, 1.0);
        if (c < 0.5) c = 0.5 * pow(2.0 * c, uContrast);
        else         c = 1.0 - 0.5 * pow(2.0 * (1.0 - c), uContrast);
        float span = max(uColormapMax - uColormapMin, 0.001);
        t = clamp((c - uColormapMin) / span, 0.0, 1.0);
    }
    fragColor = vec4(applyColormap(t), uOpacity);
}
`
