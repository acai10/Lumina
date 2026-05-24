export const palette = {
    // Base backgrounds
    bgDeep: '#0a0f1e', // main canvas / toolbar base
    bgPaper: '#0d1320', // MUI paper surfaces
    bgDeepHex: 0x0a0f1e as const, // Three.js integer form — used by renderer.setClearColor

    // Primary cyan — buttons, slider, accents
    cyan: '#64c8ff', // full opacity
    cyanBorder: 'rgba(100,200,255,0.4)',
    cyanGlow: 'rgba(100,200,255,0.3)',
    cyanHoverRing: 'rgba(100,200,255,0.16)',
    cyanSubtle: 'rgba(100,200,255,0.12)', // disabled / inactive cyan border
    cyanLabel: '#a0d8ff', // STL button label (lighter cyan)

    // Secondary teal — H5 button
    tealBorder: 'rgba(100,255,200,0.4)',
    tealLabel: '#a0ffdc',

    // Text — light blue-white at various opacities
    textPrimary: 'rgba(200,220,255,0.7)',
    textSecondary: 'rgba(200,220,255,0.55)',
    textMuted: 'rgba(200,220,255,0.4)',
    textFaint: 'rgba(200,220,255,0.35)',
    textDim: 'rgba(200,220,255,0.5)',

    // Error
    errorText: 'rgba(255,120,120,0.85)',

    // Clear / destructive action
    clearBorder: 'rgba(255,100,100,0.35)',
    clearLabel: 'rgba(255,160,160,0.75)',
    clearGlow: 'rgba(255,80,80,0.2)',

    // Surfaces with blur
    toolbarBg: 'rgba(10,15,30,0.92)',
    toolbarBorder: 'rgba(100,200,255,0.1)',
    panelBg: 'rgba(10,15,30,0.75)',

    // Three.js mesh colors
    meshColorHex: 0x4477bb as const,
    edgeColorHex: 0x88ccff as const,
    tealBorderHex: 0x64ffc8 as const, // Three.js integer form of teal — used for bounding box helpers

    // Three.js STL lighting colors
    hemiSkyHex: 0x4466cc as const,
    hemiGroundHex: 0x001122 as const,
    fillLightHex: 0xaaccff as const,
    rimLightHex: 0xffc080 as const,

    // Axis helper colors
    axisX: '#ff4444',
    axisY: '#44ff88',
    axisZ: '#4488ff',
} as const
