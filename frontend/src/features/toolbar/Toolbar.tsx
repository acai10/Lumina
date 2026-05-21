import { useState } from 'react'
import { Button, CircularProgress, Menu, MenuItem, Stack } from '@mui/material'
import { useViewerStore } from '../../app/store/viewerSlice'
import { useFileUpload } from './useFileUpload'
import {
    ToolbarRoot,
    FileNameText,
    LoadingText,
    stlButtonSx,
    h5ButtonSx,
    clearButtonSx,
    menuPaperSx,
    menuItemSx,
    loadingSpinnerSx,
} from './Toolbar.styles'

export default function Toolbar() {
    const { mode, isLoading, stlFile, h5Files, activeH5Index, reset } = useViewerStore()
    const {
        stlInputRef,
        h5InputRef,
        h5FolderInputRef,
        handleSTLUpload,
        handleH5Upload,
        handleH5FolderUpload,
    } = useFileUpload()

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
                onChange={handleSTLUpload}
            />
            <input
                ref={h5InputRef}
                type="file"
                accept=".h5"
                multiple
                style={{ display: 'none' }}
                onChange={handleH5Upload}
            />
            <input
                ref={h5FolderInputRef}
                type="file"
                {...{ webkitdirectory: '' }}
                style={{ display: 'none' }}
                onChange={handleH5FolderUpload}
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
