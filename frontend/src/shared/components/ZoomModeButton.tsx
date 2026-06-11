import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import FilterCenterFocusIcon from '@mui/icons-material/FilterCenterFocus'
import CenterFocusWeakIcon from '@mui/icons-material/CenterFocusWeak'
import { palette } from '../theme/palette'

interface ZoomModeButtonProps {
    active: boolean
    onToggle: () => void
}

export function ZoomModeButton({ active, onToggle }: ZoomModeButtonProps) {
    return (
        <Tooltip title={active ? 'Zoom: zum Cursor' : 'Zoom: zum Zentrum'} placement="left">
            <IconButton
                size="small"
                onClick={onToggle}
                sx={{
                    position: 'absolute',
                    bottom: 8,
                    right: 8,
                    p: 0.4,
                    color: active ? palette.accentBlue : palette.sceneTextMuted,
                    background: palette.overlayScrim,
                    borderRadius: 0.5,
                    '&:hover': { background: palette.accentBlueHoverBg },
                }}
            >
                {active ? (
                    <FilterCenterFocusIcon sx={{ fontSize: 16 }} />
                ) : (
                    <CenterFocusWeakIcon sx={{ fontSize: 16 }} />
                )}
            </IconButton>
        </Tooltip>
    )
}
