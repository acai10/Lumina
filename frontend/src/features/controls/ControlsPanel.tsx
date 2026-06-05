import Divider from '@mui/material/Divider'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import { useShallow } from 'zustand/react/shallow'
import {
    useViewerStore,
    defaultRenderControls,
    DEFAULT_STL_OPACITY,
} from '../../app/store/viewerSlice'
import { panelSx, resetButtonSx, labelSx, controlFontSx } from './ControlsPanel.styles'
import { RENDER_CONTROL_LIMITS, getRenderControlLimits } from './renderControlLimits'
import { PreprocessingSection } from './PreprocessingSection'
import { SliderRow, RangeSliderRow } from './SliderRow'
import type { H5RenderControls } from '../../shared/types/viewer.types'

// MUI Select cannot hold null as a value, so -1 is the sentinel for "no overlay selected"
const NO_OVERLAY_SENTINEL = -1

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
    } = useViewerStore(
        useShallow((s) => ({
            tabs: s.tabs,
            activeTabIndex: s.activeTabIndex,
            h5PerFileStates: s.h5PerFileStates,
            updateActiveRenderState: s.updateActiveRenderState,
            stlOpacity: s.stlOpacity,
            setStlOpacity: s.setStlOpacity,
            setH5ViewMode: s.setH5ViewMode,
            resetSlicePanelControls: s.resetSlicePanelControls,
            stlOverlayIndex: s.stlOverlayIndex,
            setStlOverlayIndex: s.setStlOverlayIndex,
        })),
    )

    const activeTab = tabs[activeTabIndex]
    const activeH5 = activeTab?.type === 'h5' ? activeTab : null
    const activeStl = activeTab?.type === 'stl' ? activeTab : null
    const activeKey = activeH5?.name

    const renderControls: H5RenderControls =
        (activeKey ? h5PerFileStates[activeKey]?.renderControls : undefined) ??
        defaultRenderControls
    const viewMode = (activeKey ? h5PerFileStates[activeKey]?.viewMode : undefined) ?? 'pointcloud'
    const limits = getRenderControlLimits(activeH5?.meta)
    const hasSliceView = !!activeH5?.hasSlices

    const stlTabs = tabs.flatMap((t, i) => (t.type === 'stl' ? [{ tab: t, index: i }] : []))

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
                                        value={stlOverlayIndex ?? NO_OVERLAY_SENTINEL}
                                        onChange={(e) => {
                                            const v = Number(e.target.value)
                                            setStlOverlayIndex(v === NO_OVERLAY_SENTINEL ? null : v)
                                        }}
                                        sx={controlFontSx}
                                    >
                                        <MenuItem value={NO_OVERLAY_SENTINEL} sx={controlFontSx}>
                                            None
                                        </MenuItem>
                                        {stlTabs.map(({ tab, index }) => (
                                            <MenuItem
                                                key={tab.name}
                                                value={index}
                                                sx={controlFontSx}
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
