import { Tab, Tabs } from '@mui/material'
import { palette } from '../../shared/theme/palette'
import { useViewerStore } from '../../app/store/viewerSlice'

export default function H5FileTabs() {
    const { h5Files, activeH5Index, selectH5 } = useViewerStore()

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
            {h5Files.map((f) => (
                <Tab key={f.name} label={f.name} />
            ))}
        </Tabs>
    )
}
