import { useState } from 'react'
import { Button, CircularProgress, Menu, MenuItem, Stack } from '@mui/material'
import { useViewerStore } from '../../app/store/viewerSlice'
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
    const {
        mode,
        isLoading,
        stlFile,
        h5Files,
        activeH5Index,
        reset,
        stitchPanelOpen,
        toggleStitchPanel,
    } = useViewerStore()
    const {
        stlInputRef,
        h5InputRef,
        h5FolderInputRef,
        handleSTLLoad,
        handleH5Load,
        handleH5FolderLoad,
    } = useFileLoad()

    const [h5MenuAnchor, setH5MenuAnchor] = useState<HTMLElement | null>(null)

    const activeFileName =
        mode === 'stl' ? (stlFile?.name ?? '') : (h5Files[activeH5Index]?.name ?? '')

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
                    {mode !== 'none' && (
                        <Button variant="outlined" size="small" sx={clearButtonSx} onClick={reset}>
                            Clear
                        </Button>
                    )}
                </>
            )}

            {activeFileName && <FileNameText>{activeFileName}</FileNameText>}
        </ToolbarRoot>
    )
}
