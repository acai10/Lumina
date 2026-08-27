/**
 * GLSL3 vertex and fragment shaders for the point-cloud viewer.
 *
 * Kept as strings rather than files so Vite needs no GLSL plugin. The shaders do the
 * per-voxel work the CPU cannot afford at this scale: decoding the packed voxel
 * index into coordinates, tone mapping, and the colormap.
 */
export const vertexShader = /* glsl */ `
// vIndex is an *integer* attribute: a full volume has 512·250·250 = 32M voxels,
// beyond float32's exact-integer range (2^24 ≈ 16.7M), so decoding it as a float
// would land deep voxels on the wrong slice. Integer division/modulo are exact.
in uint vIndex;
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
    uint width = uint(uWidth);
    uint sliceSize = uint(uHeight) * width;
    uint s = vIndex / sliceSize;
    uint rem = vIndex % sliceSize;
    uint h = rem / width;
    uint w = rem % width;

    float sf = float(s);
    float hf = float(h);
    float wf = float(w);

    float x = wf - uWidth * 0.5;
    float y = (sf - uNSlices * 0.5) * (uVolumeSpacing / uNSlices);
    float z = hf - uHeight * 0.5;

    fIntensity = vIntensity;
    fS = sf;
    fW = wf;
    fH = hf;
    gl_PointSize = uPointSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(x, y, z, 1.0);
}
`

// ── Object-overlay shaders ────────────────────────────────────────────────────
// Colour the individual voxels of counted objects, applying the SAME clip-range and
// threshold discards as the main cloud so only currently-visible voxels are tinted.
// position.y carries the slice offset (s - nSlices/2); the object's scale.y maps it
// into world units, matching the main vertex transform.
export const objectOverlayVertexShader = /* glsl */ `
in vec3 aColor;
in float aIntensity;
out vec3 fColor;
out float fIntensity;
out float fS;
out float fW;
out float fH;

uniform float uNSlices;
uniform float uHeight;
uniform float uWidth;
uniform float uPointSize;

void main() {
    fW = position.x + uWidth * 0.5;
    fS = position.y + uNSlices * 0.5;
    fH = position.z + uHeight * 0.5;
    fColor = aColor;
    fIntensity = aIntensity;
    gl_PointSize = uPointSize;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

export const objectOverlayFragmentShader = /* glsl */ `
precision highp float;
in vec3 fColor;
in float fIntensity;
in float fS;
in float fW;
in float fH;
out vec4 fragColor;

uniform float uThreshold;
uniform float uSliceMin;
uniform float uSliceMax;
uniform float uWidthMin;
uniform float uWidthMax;
uniform float uHeightMin;
uniform float uHeightMax;

void main() {
    // Mirror the main cloud's visibility tests so only displayed voxels are coloured.
    if (fIntensity < uThreshold) discard;
    if (fS < uSliceMin || fS >= uSliceMax) discard;
    if (fW < uWidthMin || fW >= uWidthMax) discard;
    if (fH < uHeightMin || fH >= uHeightMax) discard;
    fragColor = vec4(fColor, 1.0);
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
// Auto-fit colour window: min/max intensity among the currently visible
// (above-threshold) voxels. The full colormap is mapped across [floor, ceil].
uniform float uIntensityFloor;
uniform float uIntensityCeil;

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
    // GRAY (default) — pure white; intensity drives alpha (see main below)
    return vec3(1.0, 1.0, 1.0);
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
        // Brightness heatmap with auto-fit. The 3D view only renders voxels above
        // uThreshold, so the displayed intensities live in [uIntensityFloor,
        // uIntensityCeil] — the actual min/max of the visible voxels. Stretch that
        // exact band across the full colormap so brighter voxels always get visibly
        // hotter colors, no matter where the threshold sits. Without this every
        // visible point would collapse into the top colormap sliver and look uniform.
        float visible = clamp((fIntensity - uIntensityFloor) / max(uIntensityCeil - uIntensityFloor, 0.001), 0.0, 1.0);
        float c = clamp(visible * uBrightness, 0.0, 1.0);
        if (c < 0.5) c = 0.5 * pow(2.0 * c, uContrast);
        else         c = 1.0 - 0.5 * pow(2.0 * (1.0 - c), uContrast);
        float span = max(uColormapMax - uColormapMin, 0.001);
        t = clamp((c - uColormapMin) / span, 0.0, 1.0);
    }
    if (uColormap == 0) {
        // Gray: pure white cloud — intensity drives alpha so brightness/contrast
        // still control the apparent density and brightness of the point cloud.
        fragColor = vec4(1.0, 1.0, 1.0, t * uOpacity);
    } else {
        fragColor = vec4(applyColormap(t), uOpacity);
    }
}
`
