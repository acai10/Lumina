import { useState } from 'react'
import { Button, CircularProgress, Menu, MenuItem, Stack } from '@mui/material'
import { useShallow } from 'zustand/react/shallow'
import { useViewerStore } from '../../app/store/viewerSlice'
import { cleanupUploads } from '../../shared/api'
import { useFileLoad } from './useFileLoad'
import {
    ToolbarRoot,
    FileNameText,
    LoadingText,
    stlButtonSx,
    h5ButtonSx,
    clearButtonSx,
    stitchButtonSx,
    menuPaperSx,
    menuItemSx,
    loadingSpinnerSx,
} from './Toolbar.styles'

export default function Toolbar() {
    const { isLoading, tabs, activeTabIndex, reset, stitchPanelOpen, toggleStitchPanel } =
        useViewerStore(
            useShallow((s) => ({
                isLoading: s.isLoading,
                tabs: s.tabs,
                activeTabIndex: s.activeTabIndex,
                reset: s.reset,
                stitchPanelOpen: s.stitchPanelOpen,
                toggleStitchPanel: s.toggleStitchPanel,
            })),
        )
    const {
        stlInputRef,
        h5InputRef,
        h5FolderInputRef,
        handleSTLLoad,
        handleH5Load,
        handleH5FolderLoad,
    } = useFileLoad()

    const [h5MenuAnchor, setH5MenuAnchor] = useState<HTMLElement | null>(null)

    const activeFileName = tabs[activeTabIndex]?.name ?? ''
    const hasFiles = tabs.length > 0

    const handleFileLoad = () => {
        setH5MenuAnchor(null)
        h5InputRef.current?.click()
    }
    const handleFolderLoad = () => {
        setH5MenuAnchor(null)
        h5FolderInputRef.current?.click()
    }

    return (
        <ToolbarRoot direction="row" alignItems="center" spacing={2}>
            <input
                ref={stlInputRef}
                type="file"
                accept=".stl"
                multiple
                style={{ display: 'none' }}
                onChange={handleSTLLoad}
            />
            <input
                ref={h5InputRef}
                type="file"
                accept=".h5"
                multiple
                style={{ display: 'none' }}
                onChange={handleH5Load}
            />
            <input
                ref={h5FolderInputRef}
                type="file"
                {...{ webkitdirectory: '' }}
                style={{ display: 'none' }}
                onChange={handleH5FolderLoad}
            />

            {isLoading ? (
                <Stack direction="row" alignItems="center" spacing={1.5}>
                    <CircularProgress size={18} sx={loadingSpinnerSx} />
                    <LoadingText>Loading volume…</LoadingText>
                </Stack>
            ) : (
                <>
                    <Button
                        variant="outlined"
                        size="small"
                        sx={stlButtonSx}
                        onClick={() => stlInputRef.current?.click()}
                    >
                        Load STL
                    </Button>
                    <Button
                        variant="outlined"
                        size="small"
                        sx={h5ButtonSx}
                        onClick={(e) => setH5MenuAnchor(e.currentTarget)}
                    >
                        Load H5
                    </Button>
                    <Button
                        variant="outlined"
                        size="small"
                        sx={{
                            ...stitchButtonSx,
                            ...(stitchPanelOpen ? { opacity: 1 } : { opacity: 0.7 }),
                        }}
                        onClick={toggleStitchPanel}
                    >
                        Stitch
                    </Button>
                    <Menu
                        anchorEl={h5MenuAnchor}
                        open={Boolean(h5MenuAnchor)}
                        onClose={() => setH5MenuAnchor(null)}
                        slotProps={{ paper: { sx: menuPaperSx } }}
                    >
                        <MenuItem onClick={handleFileLoad} sx={menuItemSx}>
                            File
                        </MenuItem>
                        <MenuItem onClick={handleFolderLoad} sx={menuItemSx}>
                            Folder
                        </MenuItem>
                    </Menu>
                    {hasFiles && (
                        <Button
                            variant="outlined"
                            size="small"
                            sx={clearButtonSx}
                            onClick={() => {
                                reset()
                                cleanupUploads().catch(() => {})
                            }}
                        >
                            Clear
                        </Button>
                    )}
                </>
            )}

            {activeFileName && <FileNameText>{activeFileName}</FileNameText>}
        </ToolbarRoot>
    )
}
