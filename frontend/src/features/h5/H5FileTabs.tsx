import { Tab, Tabs } from '@mui/material'
import { palette } from '../../shared/theme/palette'
import type { H5FileEntry } from '../toolbar/useFileUpload'

interface H5FileTabsProps {
    files: H5FileEntry[]
    activeIndex: number
    onChange: (index: number) => void
}

export default function H5FileTabs({ files, activeIndex, onChange }: H5FileTabsProps) {
    return (
        <Tabs
            value={activeIndex}
            onChange={(_, i) => onChange(i)}
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
            {files.map((f) => (
                <Tab key={f.name} label={f.name} />
            ))}
        </Tabs>
    )
}
