import { useRef } from 'react'
import { IconButton, Stack, Tab } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { useViewerStore } from '../../app/store/viewerSlice'
import { H5Tabs, closeIconButtonSx } from './H5FileTabs.styles'

export default function H5FileTabs() {
    const { h5Files, activeH5Index, selectH5, closeH5, reorderH5 } = useViewerStore()
    const dragIndexRef = useRef(-1)

    return (
        <H5Tabs
            value={activeH5Index}
            onChange={(_, i) => selectH5(i)}
            variant="scrollable"
            scrollButtons="auto"
        >
            {h5Files.map((f, i) => (
                <Tab
                    key={f.name}
                    draggable
                    onDragStart={() => {
                        dragIndexRef.current = i
                    }}
                    onDragOver={(e: React.DragEvent) => e.preventDefault()}
                    onDrop={() => {
                        const from = dragIndexRef.current
                        if (from !== -1 && from !== i) reorderH5(from, i)
                        dragIndexRef.current = -1
                    }}
                    sx={{ cursor: 'grab' }}
                    label={
                        <Stack direction="row" alignItems="center" spacing={0.5}>
                            {f.name}
                            <IconButton
                                size="small"
                                component="span"
                                onClick={(e) => {
                                    e.stopPropagation()
                                    closeH5(i)
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
