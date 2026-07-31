export const palette = {
    // ===================================================================
    // SCENE — the viewer canvases (3D point-cloud, 2D slices, STL).
    // Kept dark/black so rendered models read at maximum contrast.
    // These tokens must stay dark regardless of the light UI chrome.
    // ===================================================================
    sceneBg: '#000000', // central viewer-pane background (CSS form)
    sceneBgHex: 0x000000 as const, // Three.js renderer.setClearColor form (black)

    // Text that sits ON the dark scene (axis chips, slice control bars) — light.
    sceneText: 'rgba(236,243,252,0.92)',
    sceneTextMuted: 'rgba(236,243,252,0.6)',

    // Accent for sliders/controls overlaid on the dark scene (pops on black).
    sceneAccent: 'rgba(120,200,255,0.9)',

    // Scene scrims / hairlines (dark glass overlays inside the black pane).
    overlayScrim: 'rgba(0,0,0,0.55)', // axis-label chip background
    controlsScrim: 'rgba(8,14,24,0.72)', // slice-panel control bar
    sceneHairline: 'rgba(255,255,255,0.12)', // slice-panel border
    sceneHairlineDim: 'rgba(255,255,255,0.08)', // control-bar top border

    // Three.js mesh colors (tuned for the dark scene — unchanged).
    meshColorHex: 0x4477bb as const,
    edgeColorHex: 0x88ccff as const,
    tealBorderHex: 0x64ffc8 as const, // bounding-box helper

    // Three.js STL lighting colors.
    hemiSkyHex: 0x4466cc as const,
    hemiGroundHex: 0x001122 as const,
    fillLightHex: 0xaaccff as const,
    rimLightHex: 0xffc080 as const,

    // Axis helper colors.
    axisX: '#ff4444',
    axisY: '#44ff88',
    axisZ: '#4488ff',

    // ===================================================================
    // UI — light "medical / Vista Aero glass" application chrome.
    // Frosted translucent surfaces, soft blue gradients, clinical-blue accent.
    // ===================================================================

    // App shell background — soft Aero blue-grey gradient.
    bgApp: '#e9f0fa',
    bgAppGradient: 'linear-gradient(160deg, #eef4fc 0%, #dce7f5 100%)',

    // Surfaces.
    surfaceGlass: 'rgba(248,251,255,0.72)', // frosted panels/toolbar/menus (+ backdrop blur)
    surfaceGlassStrong: 'rgba(250,252,255,0.85)', // less-translucent variant (dialogs)
    surfaceSolid: '#f4f8fd', // opaque cards / table rows (MUI paper)
    surfaceSubtle: 'rgba(43,125,233,0.07)', // hover / selected tint

    // Borders & gloss.
    borderGlass: 'rgba(120,160,210,0.40)', // soft blue hairline
    borderStrong: 'rgba(90,130,180,0.55)', // emphasized border
    glassHighlight: 'rgba(255,255,255,0.65)', // inset top-edge Aero bevel
    glassShadow: '0 6px 20px rgba(40,70,120,0.18)', // panel drop shadow

    // Clinical-blue accent (primary action color).
    primary: '#2b7de9',
    primaryDeep: '#1565c0',
    primaryGradient: 'linear-gradient(180deg, #4a93f0 0%, #2b7de9 100%)',
    primaryGradientHover: 'linear-gradient(180deg, #5aa0f5 0%, #3a8af0 100%)',
    primarySoft: 'rgba(43,125,233,0.12)', // tinted backgrounds / focus ring base
    focusRing: 'rgba(43,125,233,0.55)', // keyboard :focus-visible outline

    // Teal secondary accent (H5-specific controls), darkened to read on white.
    secondary: '#0097a7',

    // Destructive / error.
    danger: '#d32f2f',
    dangerSoft: 'rgba(211,47,47,0.10)',

    // Text on light surfaces (all ≥ 4.5:1 on bgApp).
    textPrimary: 'rgba(18,32,54,0.92)',
    textSecondary: 'rgba(18,32,54,0.70)',
    textMuted: 'rgba(18,32,54,0.55)',

    // Light scrollbar thumb for the app chrome.
    scrollbarThumb: 'rgba(90,130,180,0.45)',

    // Accent blue used for interactive overlays on dark scenes (measurement tool,
    // zoom-to-cursor toggle). Shared across SlicePanel, H5Viewer, STLViewer.
    accentBlue: '#4fa3ff',
    accentBlueHoverBg: 'rgba(79,163,255,0.18)',
    accentBlueBorder: 'rgba(79,163,255,0.5)', // measurement-readout hairline

    // Scale-bar / colorbar accent on the dark slice canvas.
    scaleBar: '#a8caff',

    // Crop selection overlay (orange) — shared by the 2D rectangle and the 3D box.
    cropAccent: '#ff9800',
    cropAccentSoft: 'rgba(255,152,0,0.15)',

    // Strong dark scrim behind floating readouts over the scene (measurement chip).
    overlayScrimStrong: 'rgba(10,20,50,0.82)',
} as const
