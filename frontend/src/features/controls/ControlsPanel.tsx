import { useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import TuneIcon from '@mui/icons-material/Tune'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import { useShallow } from 'zustand/react/shallow'
import {
    useViewerStore,
    defaultRenderControls,
    DEFAULT_STL_OPACITY,
} from '../../app/store/viewerSlice'
import {
    panelSx,
    railSx,
    headerSx,
    headerTitleSx,
    iconButtonSx,
    controlFontSx,
    accordionSx,
    accordionTitleSx,
} from './ControlsPanel.styles'
import { RENDER_CONTROL_LIMITS, getRenderControlLimits } from './renderControlLimits'
import { PreprocessingSection } from './PreprocessingSection'
import { SliderRow, RangeSliderRow } from './SliderRow'
import type { H5RenderControls } from '../../shared/types/viewer.types'

// MUI Select cannot hold null as a value, so -1 is the sentinel for "no overlay selected"
const NO_OVERLAY_SENTINEL = -1

/** Compact, collapsible section grouping a set of controls. */
function Section({
    title,
    defaultExpanded = true,
    children,
}: {
    title: string
    defaultExpanded?: boolean
    children: ReactNode
}) {
    return (
        <Accordion disableGutters defaultExpanded={defaultExpanded} sx={accordionSx}>
            <AccordionSummary expandIcon={<ExpandMoreIcon fontSize="small" sx={iconButtonSx} />}>
                <Typography sx={accordionTitleSx}>{title}</Typography>
            </AccordionSummary>
            <AccordionDetails>
                <Stack spacing={2.5}>{children}</Stack>
            </AccordionDetails>
        </Accordion>
    )
}

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
        controlsPanelOpen,
        toggleControlsPanel,
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
            controlsPanelOpen: s.controlsPanelOpen,
            toggleControlsPanel: s.toggleControlsPanel,
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

    const stlTabs = useMemo(
        () => tabs.flatMap((t, i) => (t.type === 'stl' ? [{ tab: t, index: i }] : [])),
        [tabs],
    )

    const updateControls = useCallback(
        (patch: Partial<H5RenderControls>) => updateActiveRenderState(patch),
        [updateActiveRenderState],
    )

    const handleReset = useCallback(() => {
        if (activeH5) {
            if (viewMode === 'slice' && activeKey) resetSlicePanelControls(activeKey)
            else updateActiveRenderState({ ...defaultRenderControls })
        } else {
            setStlOpacity(DEFAULT_STL_OPACITY)
        }
    }, [
        activeH5,
        viewMode,
        activeKey,
        resetSlicePanelControls,
        updateActiveRenderState,
        setStlOpacity,
    ])

    if (tabs.length === 0) return null

    // Collapsed: thin rail with an expand affordance, hands the width back to the scene.
    if (!controlsPanelOpen) {
        return (
            <Box sx={railSx}>
                <Tooltip title="Show controls" placement="right">
                    <IconButton
                        size="small"
                        aria-label="Show controls"
                        onClick={toggleControlsPanel}
                        sx={iconButtonSx}
                    >
                        <TuneIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            </Box>
        )
    }

    return (
        <Stack spacing={1.5} sx={panelSx}>
            <Box sx={headerSx}>
                <Typography sx={headerTitleSx}>CONTROLS</Typography>
                <Stack direction="row" spacing={0.25}>
                    <Tooltip title="Reset">
                        <IconButton
                            size="small"
                            aria-label="Reset controls"
                            onClick={handleReset}
                            sx={iconButtonSx}
                        >
                            <RestartAltIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Collapse">
                        <IconButton
                            size="small"
                            aria-label="Collapse controls"
                            onClick={toggleControlsPanel}
                            sx={iconButtonSx}
                        >
                            <ChevronLeftIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Stack>
            </Box>

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
                    {viewMode === 'pointcloud' && (
                        <>
                            <Section title="APPEARANCE">
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
                            </Section>
                            <Section title="CLIPPING">
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
                            </Section>
                            {stlTabs.length > 0 && (
                                <Section title="STL OVERLAY" defaultExpanded={false}>
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
                                </Section>
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
        </Stack>
    )
}
