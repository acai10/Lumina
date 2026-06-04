import { useRef } from 'react'
import type React from 'react'
import { IconButton, Stack, Tab } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { useShallow } from 'zustand/react/shallow'
import { useViewerStore } from '../../app/store/viewerSlice'
import { cleanupUploads } from '../../shared/api'
import { H5Tabs, closeIconButtonSx } from './H5FileTabs.styles'

export default function H5FileTabs() {
    const { tabs, activeTabIndex, selectTab, closeTab, reorderTab } = useViewerStore(
        useShallow((s) => ({
            tabs: s.tabs,
            activeTabIndex: s.activeTabIndex,
            selectTab: s.selectTab,
            closeTab: s.closeTab,
            reorderTab: s.reorderTab,
        })),
    )

    // Single numeric sentinel — same pattern as the original H5-only implementation.
    // All tabs use MUI's implicit position value (no explicit `value` prop) so the
    // drag-and-drop index always matches the MUI position index exactly.
    const dragIndexRef = useRef(-1)

    return (
        <H5Tabs
            value={activeTabIndex}
            onChange={(_, v) => selectTab(v as number)}
            variant="scrollable"
            scrollButtons="auto"
        >
            {tabs.map((t, i) => (
                <Tab
                    key={`${t.type}-${t.name}`}
                    draggable
                    onDragStart={() => {
                        dragIndexRef.current = i
                    }}
                    onDragOver={(e: React.DragEvent) => e.preventDefault()}
                    onDrop={() => {
                        const from = dragIndexRef.current
                        if (from !== -1 && from !== i) reorderTab(from, i)
                        dragIndexRef.current = -1
                    }}
                    sx={{
                        cursor: 'grab',
                        ...(t.type === 'stl'
                            ? {
                                  color: 'rgba(100,200,255,0.6)',
                                  '&.Mui-selected': { color: 'rgba(100,200,255,0.9)' },
                              }
                            : {}),
                    }}
                    label={
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                            {t.name}
                            <IconButton
                                size="small"
                                component="span"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    closeTab(i)
                                    cleanupUploads().catch(() => {})
                                }}
                                sx={closeIconButtonSx}
                            >
                                <CloseIcon sx={{ fontSize: '0.7rem' }} />
                            </IconButton>
                        </Stack>
                    }
                />
            ))}
        </H5Tabs>
    )
}
