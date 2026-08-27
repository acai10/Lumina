import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Box, Divider, IconButton, Slider, Stack, Tooltip, Typography } from '@mui/material'
import BrushIcon from '@mui/icons-material/Brush'
import CleaningServicesIcon from '@mui/icons-material/CleaningServices'
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import EditIcon from '@mui/icons-material/Edit'
import { useShallow } from 'zustand/react/shallow'
import { useViewerStore } from '../../app/store/viewerSlice'
import { ANNOTATION_PALETTE } from './annotationPalette'
import { annotatedCount } from './annotationMask'
import type { AnnotationTool, H5TabEntry } from '../../shared/types/viewer.types'
import { palette } from '../../shared/theme/palette'

interface ToolDef {
    tool: Extract<AnnotationTool, 'brush' | 'eraser'>
    icon: ReactNode
    label: string
}

// Painting tools only — crop shapes live in the sidebar ("CROP").
const TOOLS: ToolDef[] = [
    { tool: 'brush', icon: <BrushIcon fontSize="small" />, label: 'Brush' },
    { tool: 'eraser', icon: <CleaningServicesIcon fontSize="small" />, label: 'Eraser' },
]

/** Brush/eraser radius bounds (voxels) for the radius slider. */
const MIN_BRUSH_RADIUS = 1
const MAX_BRUSH_RADIUS = 40

interface AnnotationToolbarProps {
    activeH5: H5TabEntry
}

/**
 * Foldable brush/eraser toolbar for painting annotations over the 2-D slice view.
 *
 * Painting is non-destructive: strokes go into the per-tab voxel mask in the store,
 * never into the underlying HDF5 data, and are mirrored into the 3-D voxel overlay.
 */

/**
 * Foldable annotation toolbar shown over the 2D slice view. Holds the painting tools
 * (brush / eraser) plus the colour palette (always shown while the brush is active)
 * and a clear button. Crop tools live in the control sidebar. Tool state is in Zustand;
 * tools are mutually exclusive.
 */
export default function AnnotationToolbar({ activeH5 }: AnnotationToolbarProps) {
    const fileKey = activeH5.name
    const [expanded, setExpanded] = useState(true)

    const {
        activeTool,
        brushRadius,
        activeColorLabel,
        annotationVersion,
        setActiveTool,
        setBrushRadius,
        setActiveColorLabel,
        setCropMode,
        clearAnnotations,
    } = useViewerStore(
        useShallow((s) => ({
            activeTool: s.activeTool,
            brushRadius: s.brushRadius,
            activeColorLabel: s.activeColorLabel,
            annotationVersion: s.h5PerFileStates[fileKey]?.annotationVersion ?? 0,
            setActiveTool: s.setActiveTool,
            setBrushRadius: s.setBrushRadius,
            setActiveColorLabel: s.setActiveColorLabel,
            setCropMode: s.setCropMode,
            clearAnnotations: s.clearAnnotations,
        })),
    )

    const annoCount = useMemo(() => {
        const mask = useViewerStore.getState().h5PerFileStates[fileKey]?.annotationMask
        return mask ? annotatedCount(fileKey, mask) : 0
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fileKey, annotationVersion])

    const selectTool = (tool: Extract<AnnotationTool, 'brush' | 'eraser'>) => {
        setActiveTool(activeTool === tool ? null : tool)
        // Painting and cropping are mutually exclusive — leave crop mode when painting.
        setCropMode(fileKey, false)
    }

    const iconBtnSx = (selected: boolean) => ({
        p: 0.6,
        borderRadius: 0.5,
        color: selected ? palette.accentBlue : palette.sceneTextMuted,
        background: selected ? palette.accentBlueHoverBg : 'transparent',
        '&:hover': { background: palette.accentBlueHoverBg },
    })

    return (
        <Box
            sx={{
                position: 'absolute',
                top: 8,
                left: 8,
                zIndex: 4,
                p: 0.5,
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 0.5,
                background: palette.controlsScrim,
                backdropFilter: 'blur(6px)',
                border: `1px solid ${palette.sceneHairline}`,
                borderRadius: 1,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
        >
            {/* Fold toggle — kept leftmost so the tool icons stay pinned to the left. */}
            <Tooltip title={expanded ? 'Collapse' : 'Annotation tools'} placement="bottom">
                <IconButton
                    size="small"
                    onClick={() => setExpanded((v) => !v)}
                    sx={iconBtnSx(false)}
                >
                    {expanded ? (
                        <ChevronRightIcon fontSize="small" />
                    ) : (
                        <EditIcon fontSize="small" />
                    )}
                </IconButton>
            </Tooltip>

            {expanded && (
                <>
                    {TOOLS.map(({ tool, icon, label }) => (
                        <Tooltip key={tool} title={label} placement="bottom">
                            <IconButton
                                size="small"
                                onClick={() => selectTool(tool)}
                                sx={iconBtnSx(activeTool === tool)}
                            >
                                {icon}
                            </IconButton>
                        </Tooltip>
                    ))}
                    <Tooltip title="Clear annotations" placement="bottom">
                        <span>
                            <IconButton
                                size="small"
                                disabled={annoCount === 0}
                                onClick={() => clearAnnotations(fileKey)}
                                sx={iconBtnSx(false)}
                            >
                                <DeleteSweepIcon fontSize="small" />
                            </IconButton>
                        </span>
                    </Tooltip>

                    {/* Palette + radius appear to the RIGHT of the icons while the brush
                        is active, so the tool icons never shift from the far left. */}
                    {activeTool === 'brush' && (
                        <>
                            <Divider orientation="vertical" flexItem sx={{ mx: 0.25 }} />
                            <Stack direction="row" spacing={0.5} alignItems="center">
                                {ANNOTATION_PALETTE.map((c) => (
                                    <Tooltip key={c.label} title={c.name} placement="bottom">
                                        <Box
                                            onClick={() => setActiveColorLabel(c.label)}
                                            sx={{
                                                width: 18,
                                                height: 18,
                                                borderRadius: '3px',
                                                cursor: 'pointer',
                                                backgroundColor: c.hex,
                                                border:
                                                    activeColorLabel === c.label
                                                        ? `2px solid ${palette.accentBlue}`
                                                        : '2px solid transparent',
                                            }}
                                        />
                                    </Tooltip>
                                ))}
                            </Stack>
                        </>
                    )}

                    {(activeTool === 'brush' || activeTool === 'eraser') && (
                        <Stack
                            direction="row"
                            alignItems="center"
                            spacing={1}
                            sx={{ px: 0.5, minWidth: 130 }}
                        >
                            <Typography
                                sx={{ fontSize: '0.625rem', color: palette.sceneTextMuted }}
                            >
                                Radius
                            </Typography>
                            <Slider
                                size="small"
                                value={brushRadius}
                                min={MIN_BRUSH_RADIUS}
                                max={MAX_BRUSH_RADIUS}
                                step={1}
                                onChange={(_, v) =>
                                    setBrushRadius(typeof v === 'number' ? v : v[0])
                                }
                                sx={{ flex: 1 }}
                            />
                            <Typography
                                sx={{
                                    fontSize: '0.625rem',
                                    color: palette.sceneTextMuted,
                                    minWidth: 18,
                                    textAlign: 'right',
                                }}
                            >
                                {brushRadius}
                            </Typography>
                        </Stack>
                    )}
                </>
            )}
        </Box>
    )
}
