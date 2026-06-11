import { useViewerStore } from './viewerSlice'
import type { H5TabEntry, TabEntry } from '../../shared/types/viewer.types'

/**
 * Narrow store selectors.
 *
 * Components must NOT subscribe to the whole `tabs` array or `h5PerFileStates`
 * map to derive one value: both change identity on every render-control slider
 * tick / hydration cycle, which re-renders every subscriber (previously the
 * entire app tree at drag frequency). These hooks subscribe to exactly the
 * derived value so Zustand's Object.is check suppresses unrelated updates —
 * and consumers stop hand-rolling the store's internal shape.
 */

export const useActiveTab = (): TabEntry | undefined =>
    useViewerStore((s) => s.tabs[s.activeTabIndex])

/** The active tab if it is an H5 tab, else null. */
export const useActiveH5Tab = (): H5TabEntry | null =>
    useViewerStore((s) => {
        const t = s.tabs[s.activeTabIndex]
        return t?.type === 'h5' ? t : null
    })

export const useActiveViewMode = (): 'pointcloud' | 'slice' =>
    useViewerStore((s) => {
        const t = s.tabs[s.activeTabIndex]
        return t?.type === 'h5'
            ? (s.h5PerFileStates[t.name]?.viewMode ?? 'pointcloud')
            : 'pointcloud'
    })

export const useHasTabs = (): boolean => useViewerStore((s) => s.tabs.length > 0)

export const useActiveTabName = (): string =>
    useViewerStore((s) => s.tabs[s.activeTabIndex]?.name ?? '')

/** The STL tab referenced by `stlOverlayIndex`, or null. */
export const useStlOverlayTab = () =>
    useViewerStore((s) => {
        const t = s.stlOverlayIndex !== null ? s.tabs[s.stlOverlayIndex] : undefined
        return t?.type === 'stl' ? t : null
    })
