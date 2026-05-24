import type { CSSProperties } from 'react'
import { palette } from '../../shared/theme/palette'

export const sliderSx = {
    color: palette.tealBorder,
    py: 0,
    '& .MuiSlider-thumb': { width: 12, height: 12 },
    '& .MuiSlider-track': { opacity: 0.8 },
    '& .MuiSlider-rail': { opacity: 0.3 },
}

export const labelSx = {
    fontSize: '0.7rem',
    color: palette.textDim,
    letterSpacing: '0.05em',
    userSelect: 'none' as const,
}

export const inputStyle: CSSProperties = {
    width: 48,
    background: 'transparent',
    border: `1px solid ${palette.tealBorder}`,
    color: palette.textDim,
    fontSize: '0.7rem',
    textAlign: 'right',
    borderRadius: 3,
    padding: '1px 4px',
    outline: 'none',
}

export const panelSx = {
    position: 'absolute',
    left: 20,
    top: 8,
    zIndex: 20,
    background: palette.panelBg,
    backdropFilter: 'blur(8px)',
    border: `1px solid ${palette.tealBorder}`,
    borderRadius: 1,
    px: 1.5,
    py: 1.5,
}

export const sliderStackSx = { width: 210 }

export const separatorSx = {
    fontSize: '0.7rem',
    color: palette.textDim,
    letterSpacing: '0.05em',
    userSelect: 'none' as const,
    opacity: 0.4,
}

export const resetButtonSx = {
    alignSelf: 'center',
    color: palette.textDim,
    opacity: 0.6,
    '&:hover': { opacity: 1 },
}
