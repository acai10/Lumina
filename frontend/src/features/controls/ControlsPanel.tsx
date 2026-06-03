import {
    Divider,
    IconButton,
    MenuItem,
    Select,
    Stack,
    ToggleButton,
    ToggleButtonGroup,
    Tooltip,
    Typography,
} from '@mui/material'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import {
    useViewerStore,
    defaultRenderControls,
    DEFAULT_STL_OPACITY,
} from '../../app/store/viewerSlice'
import { panelSx, resetButtonSx, labelSx } from './ControlsPanel.styles'
import { RENDER_CONTROL_LIMITS, getRenderControlLimits } from './renderControlLimits'
import { PreprocessingSection } from './PreprocessingSection'
import { SliderRow, RangeSliderRow } from './SliderRow'
import type { H5RenderControls } from '../../shared/types/viewer.types'

export default function ControlsPanel() {
    const {
        tabs,
        activeTabIndex,
        h5PerFileStates,
        updateActiveRenderState,
        stlOpacity,
        setStlOpacity,
        setH5ViewMode,
        resetSlicePanelControls,
        stlOverlayIndex,
        setStlOverlayIndex,
    } = useViewerStore()

    const activeTab = tabs[activeTabIndex]
    const activeH5 = activeTab?.type === 'h5' ? activeTab : null
    const activeStl = activeTab?.type === 'stl' ? activeTab : null
    const activeKey = activeH5?.name

    const renderControls: H5RenderControls =
        (activeKey ? h5PerFileStates[activeKey]?.renderControls : undefined) ??
        defaultRenderControls
    const viewMode = (activeKey ? h5PerFileStates[activeKey]?.viewMode : undefined) ?? 'pointcloud'
    const limits = getRenderControlLimits(activeH5?.data)
    const hasSliceView = !!activeH5?.data.normalizedVolume

    const stlTabs = tabs
        .map((t, i) => ({ tab: t, index: i }))
        .filter(({ tab }) => tab.type === 'stl')

    const updateControls = (patch: Partial<H5RenderControls>) => updateActiveRenderState(patch)

    if (tabs.length === 0) return null

    return (
        <Stack spacing={4} sx={panelSx}>
            {activeH5 && (
                <>
                    <ToggleButtonGroup
                        value={viewMode}
                        exclusive
                        size="small"
                        onChange={(_, v) => {
                            if (v && activeKey) setH5ViewMode(activeKey, v)
                        }}
                        sx={{ alignSelf: 'flex-start' }}
                    >
                        <ToggleButton value="pointcloud">3D</ToggleButton>
                        {hasSliceView && <ToggleButton value="slice">Slices</ToggleButton>}
                    </ToggleButtonGroup>
                    <PreprocessingSection />
                    <Divider sx={{ opacity: 0.2 }} />
                    {viewMode === 'pointcloud' && (
                        <>
                            <SliderRow
                                label="Volume spacing"
                                value={renderControls.volumeSpacing}
                                {...RENDER_CONTROL_LIMITS.volumeSpacing}
                                onChange={(v) => updateControls({ volumeSpacing: v })}
                            />
                            <SliderRow
                                label="H5 threshold"
                                value={renderControls.h5Threshold}
                                {...RENDER_CONTROL_LIMITS.h5Threshold}
                                onChange={(v) => updateControls({ h5Threshold: v })}
                            />
                            <SliderRow
                                label="H5 opacity"
                                value={renderControls.h5Opacity}
                                {...RENDER_CONTROL_LIMITS.h5Opacity}
                                onChange={(v) => updateControls({ h5Opacity: v })}
                            />
                            <SliderRow
                                label="H5 brightness"
                                value={renderControls.h5Brightness}
                                {...RENDER_CONTROL_LIMITS.h5Brightness}
                                onChange={(v) => updateControls({ h5Brightness: v })}
                            />
                            <SliderRow
                                label="H5 contrast"
                                value={renderControls.h5Contrast}
                                {...RENDER_CONTROL_LIMITS.h5Contrast}
                                onChange={(v) => updateControls({ h5Contrast: v })}
                            />
                            <SliderRow
                                label="H5 point size"
                                value={renderControls.h5PointSize}
                                {...RENDER_CONTROL_LIMITS.h5PointSize}
                                onChange={(v) => updateControls({ h5PointSize: v })}
                            />
                            <RangeSliderRow
                                label="Slices (Y)"
                                value={renderControls.h5SliceRange}
                                {...limits.h5SliceRange}
                                onChange={(v) => updateControls({ h5SliceRange: v })}
                            />
                            <RangeSliderRow
                                label="Width (X)"
                                value={renderControls.h5WidthRange}
                                {...limits.h5WidthRange}
                                onChange={(v) => updateControls({ h5WidthRange: v })}
                            />
                            <RangeSliderRow
                                label="Height (Z)"
                                value={renderControls.h5HeightRange}
                                {...limits.h5HeightRange}
                                onChange={(v) => updateControls({ h5HeightRange: v })}
                            />
                            {stlTabs.length > 0 && (
                                <>
                                    <Divider sx={{ opacity: 0.2 }} />
                                    <Typography sx={{ ...labelSx, opacity: 0.7 }}>
                                        STL OVERLAY
                                    </Typography>
                                    <Select
                                        size="small"
                                        value={stlOverlayIndex ?? -1}
                                        onChange={(e) => {
                                            const v = e.target.value as number
                                            setStlOverlayIndex(v === -1 ? null : v)
                                        }}
                                        sx={{ fontSize: '0.7rem' }}
                                    >
                                        <MenuItem value={-1} sx={{ fontSize: '0.7rem' }}>
                                            None
                                        </MenuItem>
                                        {stlTabs.map(({ tab, index }) => (
                                            <MenuItem
                                                key={tab.name}
                                                value={index}
                                                sx={{ fontSize: '0.7rem' }}
                                            >
                                                {tab.name}
                                            </MenuItem>
                                        ))}
                                    </Select>
                                    {stlOverlayIndex !== null && (
                                        <SliderRow
                                            label="STL opacity"
                                            value={stlOpacity}
                                            {...RENDER_CONTROL_LIMITS.stlOpacity}
                                            onChange={setStlOpacity}
                                        />
                                    )}
                                </>
                            )}
                        </>
                    )}
                </>
            )}
            {activeStl && (
                <SliderRow
                    label="STL opacity"
                    value={stlOpacity}
                    {...RENDER_CONTROL_LIMITS.stlOpacity}
                    onChange={setStlOpacity}
                />
            )}
            <Tooltip title="Reset" placement="right">
                <IconButton
                    size="small"
                    onClick={() => {
                        if (activeH5) {
                            if (viewMode === 'slice' && activeKey)
                                resetSlicePanelControls(activeKey)
                            else updateActiveRenderState({ ...defaultRenderControls })
                        } else {
                            setStlOpacity(DEFAULT_STL_OPACITY)
                        }
                    }}
                    sx={resetButtonSx}
                >
                    <RestartAltIcon fontSize="small" />
                </IconButton>
            </Tooltip>
        </Stack>
    )
}
