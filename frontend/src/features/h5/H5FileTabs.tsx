import { memo, useCallback, useRef } from 'react'
import type React from 'react'
import { IconButton, Stack, Tab } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { useShallow } from 'zustand/react/shallow'
import { useViewerStore } from '../../app/store/viewerSlice'
import { H5Tabs, closeIconButtonSx, dragTabSx, stlTabSx } from './H5FileTabs.styles'

interface TabLabelProps {
    name: string
    index: number
    onClose: (i: number) => void
}

const TabLabel = memo(function TabLabel({ name, index, onClose }: TabLabelProps) {
    const handleClose = useCallback(
        (e: React.MouseEvent) => {
            e.stopPropagation()
            // Only close this tab. Do NOT wipe the uploads folder here — that would
            // delete the backend volumes of every *other* open tab too, breaking their
            // filtering/measurement. Leftover upload files are cleaned by the app-level
            // cleanup (toolbar / stitcher reset).
            onClose(index)
        },
        [index, onClose],
    )
    return (
        <Stack direction="row" alignItems="center" spacing={0.5}>
            {name}
            <IconButton size="small" component="span" onClick={handleClose} sx={closeIconButtonSx}>
                <CloseIcon sx={{ fontSize: '0.7rem' }} />
            </IconButton>
        </Stack>
    )
})

/**
 * Tab bar for the loaded files, H5 and STL alike.
 *
 * Tabs are reorderable by drag; STL tabs are tinted to tell them apart at a glance.
 * Closing a tab also releases that volume's buffers from the heap and IndexedDB.
 */
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

    const handleClose = useCallback((i: number) => closeTab(i), [closeTab])

    return (
        <H5Tabs
            value={activeTabIndex}
            onChange={(_, v) => {
                if (typeof v === 'number') selectTab(v)
            }}
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
                    sx={t.type === 'stl' ? stlTabSx : dragTabSx}
                    label={<TabLabel name={t.name} index={i} onClose={handleClose} />}
                />
            ))}
        </H5Tabs>
    )
}
