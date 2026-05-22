import { IconButton, Stack, Tab } from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import { useViewerStore } from '../../app/store/viewerSlice'
import { H5Tabs, closeIconButtonSx } from './H5FileTabs.styles'

export default function H5FileTabs() {
    const { h5Files, activeH5Index, selectH5, closeH5 } = useViewerStore()

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
