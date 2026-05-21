import { Box, IconButton, Tab, Tabs } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { palette } from '../../shared/theme/palette'
import { useViewerStore } from '../../app/store/viewerSlice'

export default function H5FileTabs() {
    const { h5Files, activeH5Index, selectH5, closeH5 } = useViewerStore()

    return (
        <Tabs
            value={activeH5Index}
            onChange={(_, i) => selectH5(i)}
            variant="scrollable"
            scrollButtons="auto"
            sx={{
                flexShrink: 0,
                background: palette.toolbarBg,
                borderBottom: `1px solid ${palette.toolbarBorder}`,
                minHeight: 36,
                '& .MuiTab-root': {
                    minHeight: 36,
                    fontSize: '0.75rem',
                    color: palette.textMuted,
                    textTransform: 'none',
                    letterSpacing: '0.03em',
                },
                '& .Mui-selected': { color: palette.tealLabel },
                '& .MuiTabs-indicator': { backgroundColor: palette.tealBorder },
            }}
        >
            {h5Files.map((f, i) => (
                <Tab
                    key={f.name}
                    label={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            {f.name}
                            <IconButton
                                size="small"
                                component="span"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    closeH5(i)
                                }}
                                sx={{
                                    p: 0.1,
                                    ml: 0.5,
                                    color: 'inherit',
                                    opacity: 0.6,
                                    '&:hover': { opacity: 1 },
                                }}
                            >
                                <CloseIcon sx={{ fontSize: '0.7rem' }} />
                            </IconButton>
                        </Box>
                    }
                />
            ))}
        </Tabs>
    )
}
