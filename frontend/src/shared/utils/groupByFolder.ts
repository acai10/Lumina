import type { LocalVolume } from '../api'

export interface VolumeGroup {
    folder: string | null // null = root level
    files: LocalVolume[]
}

export function groupByFolder(volumes: LocalVolume[]): VolumeGroup[] {
    const map = new Map<string | null, LocalVolume[]>()
    for (const v of volumes) {
        // Split on both separators: a backend running directly on Windows
        // (no Docker) reports backslash paths.
        const parts = v.path.split(/[\\/]/)
        const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : null
        const list = map.get(folder) ?? []
        list.push(v)
        map.set(folder, list)
    }
    // Root files first, then folders sorted alphabetically
    const groups: VolumeGroup[] = []
    const root = map.get(null)
    if (root) groups.push({ folder: null, files: root })
    for (const [folder, files] of map) {
        if (folder !== null) groups.push({ folder, files })
    }
    groups.sort((a, b) => {
        if (a.folder === null) return -1
        if (b.folder === null) return 1
        return a.folder.localeCompare(b.folder)
    })
    return groups
}
