import { Box, Button, CircularProgress, Typography } from '@mui/material'
import { palette } from '../../shared/theme/palette'
import { glowSx } from '../../app/App.styles'

interface ToolbarProps {
    onLoadSTL: () => void
    onLoadH5: () => void
    onClear: () => void
    activeFileName: string | null
    mode: 'none' | 'stl' | 'h5'
    isLoading: boolean
    errorMsg: string | null
}

export default function Toolbar({
    onLoadSTL,
    onLoadH5,
    onClear,
    activeFileName,
    mode,
    isLoading,
    errorMsg,
}: ToolbarProps) {
    return (
        <Box
            sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                px: 3,
                py: 1,
                flexShrink: 0,
                background: palette.toolbarBg,
                backdropFilter: 'blur(10px)',
                borderBottom: `1px solid ${palette.toolbarBorder}`,
            }}
        >
            {isLoading ? (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <CircularProgress size={18} sx={{ color: palette.cyan }} />
                    <Typography sx={{ color: palette.textSecondary, fontSize: '0.85rem' }}>
                        Loading volume…
                    </Typography>
                </Box>
            ) : (
                <>
                    <Button
                        variant="outlined"
                        size="small"
                        sx={{
                            ...glowSx,
                            borderColor: palette.cyanBorder,
                            color: palette.cyanLabel,
                        }}
                        onClick={onLoadSTL}
                    >
                        Load STL
                    </Button>
                    <Button
                        variant="outlined"
                        size="small"
                        sx={{
                            ...glowSx,
                            borderColor: palette.tealBorder,
                            color: palette.tealLabel,
                        }}
                        onClick={onLoadH5}
                    >
                        Load H5 Volume
                    </Button>
                    {mode !== 'none' && (
                        <Button
                            variant="outlined"
                            size="small"
                            sx={{
                                ...glowSx,
                                borderColor: palette.clearBorder,
                                color: palette.clearLabel,
                                '&:hover': { boxShadow: `0 0 18px 3px ${palette.clearGlow}` },
                            }}
                            onClick={onClear}
                        >
                            Clear
                        </Button>
                    )}
                </>
            )}

            {errorMsg && (
                <Typography
                    sx={{
                        ml: 1,
                        color: palette.errorText,
                        fontSize: '0.8rem',
                        maxWidth: 400,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {errorMsg}
                </Typography>
            )}

            {!errorMsg && activeFileName && (
                <Typography
                    sx={{
                        ml: 'auto',
                        color: palette.textMuted,
                        fontSize: '0.8rem',
                        letterSpacing: '0.04em',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        maxWidth: 320,
                    }}
                >
                    {activeFileName}
                </Typography>
            )}
        </Box>
    )
}
