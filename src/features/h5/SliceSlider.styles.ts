import { styled } from '@mui/material/styles'
import Typography from '@mui/material/Typography'
import { palette } from '../../shared/theme/palette'

export const SliceLabel = styled(Typography)({
    color: palette.textDim,
    fontSize: '0.7rem',
    letterSpacing: '0.08em',
    textShadow: '0 1px 4px rgba(0,0,0,0.8)',
})

export const sliderSx = {
    flex: 1,
    color: palette.tealBorder,
    '& .MuiSlider-thumb': {
        width: 14,
        height: 14,
        '&:hover': { boxShadow: `0 0 0 8px ${palette.cyanHoverRing}` },
    },
    '& .MuiSlider-track': { width: 3, opacity: 0.8 },
    '& .MuiSlider-rail': { width: 3, opacity: 0.3 },
}

export const getResetButtonSx = (active: boolean) => ({
    width: 28,
    height: 28,
    border: `1px solid ${active ? palette.cyanBorder : palette.cyanSubtle}`,
    borderRadius: '6px',
    color: active ? palette.cyan : palette.textFaint,
    transition: 'color 0.2s, border-color 0.2s, box-shadow 0.2s',
    '&:hover:not(.Mui-disabled)': {
        boxShadow: `0 0 10px 2px ${palette.cyanGlow}`,
        borderColor: palette.cyan,
    },
})
