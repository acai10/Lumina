import { ready, File as H5File } from 'h5wasm'
import type { H5VolumeData } from '../types/viewer.types'

// Attribute key names used by various OCT vendors to encode volume dimensions
const TUPLE_KEYS = ['Sizes', 'sizes', 'shape', 'dims', 'dimensions', 'image_shape', 'Volume_Size']
const SLICE_KEYS = [
    'NumBScans',
    'num_b_scans',
    'Bscans',
    'n_slices',
    'SizeB',
    'frames',
    'NumberOfFrames',
    'num_frames',
]
const HEIGHT_KEYS = ['SizeZ', 'SizeY', 'height', 'Depth', 'depth', 'ALines', 'alines', 'axial_size']
const WIDTH_KEYS = [
    'SizeX',
    'width',
    'Width',
    'x_size',
    'NumAScans',
    'lateral_size',
    'alines_per_bscan',
]

// Common OCT depth resolution — used as last-resort factorization hint
const OCT_DEPTH = 512

type AttrsMap = Record<string, { value: unknown }>

// Extracts a finite number from an h5wasm attribute value (scalar, array, or TypedArray)
function attrNumeric(val: unknown): number | undefined {
    if (typeof val === 'number' && isFinite(val)) return val
    if (Array.isArray(val) && val.length > 0) {
        const v = Number(val[0])
        return isFinite(v) ? v : undefined
    }
    if (ArrayBuffer.isView(val)) {
        const typed = val as unknown as ArrayLike<number>
        if (typed.length > 0) {
            const v = Number(typed[0])
            return isFinite(v) ? v : undefined
        }
    }
    return undefined
}

function attrToNumberArray(val: unknown): number[] | undefined {
    if (Array.isArray(val)) return val.map(Number)
    if (ArrayBuffer.isView(val)) return Array.from(val as unknown as ArrayLike<number>).map(Number)
    return undefined
}

function squeezeShape(shape: number[]): number[] {
    const s = shape.filter((d) => d !== 1)
    return s.length > 0 ? s : shape
}

function extractDims(attrs: AttrsMap): [number, number, number] | null {
    // Tuple/array attributes that encode all three dims at once
    for (const key of TUPLE_KEYS) {
        const attr = attrs[key]
        if (!attr) continue
        const arr = attrToNumberArray(attr.value)
        if (arr && arr.length >= 3) {
            const [n, h, w] = [Math.round(arr[0]), Math.round(arr[1]), Math.round(arr[2])]
            if (n > 0 && h > 0 && w > 0) return [n, h, w]
        }
    }

    // Individual dimension attributes (case-insensitive lookup)
    const lowerMap: Record<string, string> = {}
    for (const k of Object.keys(attrs)) lowerMap[k.toLowerCase()] = k

    let slices: number | undefined, height: number | undefined, width: number | undefined

    for (const key of SLICE_KEYS) {
        const orig = lowerMap[key.toLowerCase()]
        if (orig) {
            const v = attrNumeric(attrs[orig].value)
            if (v !== undefined && v > 0) {
                slices = Math.round(v)
                break
            }
        }
    }
    for (const key of HEIGHT_KEYS) {
        const orig = lowerMap[key.toLowerCase()]
        if (orig) {
            const v = attrNumeric(attrs[orig].value)
            if (v !== undefined && v > 0) {
                height = Math.round(v)
                break
            }
        }
    }
    for (const key of WIDTH_KEYS) {
        const orig = lowerMap[key.toLowerCase()]
        if (orig) {
            const v = attrNumeric(attrs[orig].value)
            if (v !== undefined && v > 0) {
                width = Math.round(v)
                break
            }
        }
    }

    if (slices !== undefined && height !== undefined && width !== undefined) {
        return [slices, height, width]
    }
    return null
}

// Heuristic: assume depth is 512 and lateral plane is square
function guessShape(total: number): [number, number, number] | null {
    if (total % OCT_DEPTH !== 0) return null
    const lateral = total / OCT_DEPTH
    const w = Math.round(Math.sqrt(lateral))
    if (w >= 10 && w * w === lateral) return [OCT_DEPTH, w, w]
    return null
}

interface DatasetResult {
    data: Float32Array
    shape: number[]
}

function getDatasetFlat(dataset: unknown): DatasetResult | null {
    const ds = dataset as {
        shape?: number[]
        dtype?: string
        value?: unknown
        attrs?: AttrsMap
    }
    if (!Array.isArray(ds.shape) || ds.shape.length === 0) return null

    const shape = squeezeShape(ds.shape)
    const raw = ds.value

    let data: Float32Array
    if (raw instanceof Float32Array) {
        data = raw
    } else if (raw instanceof Float64Array) {
        data = Float32Array.from(raw)
    } else if (
        raw instanceof Int32Array ||
        raw instanceof Uint32Array ||
        raw instanceof Int16Array ||
        raw instanceof Uint16Array ||
        raw instanceof Uint8Array ||
        raw instanceof Int8Array
    ) {
        data = Float32Array.from(raw as ArrayLike<number>)
    } else if (Array.isArray(raw)) {
        data = Float32Array.from(raw as number[])
    } else {
        return null
    }

    return { data, shape }
}

function tryReshape(
    data: Float32Array,
    dims: [number, number, number] | null,
): DatasetResult | null {
    if (!dims) return null
    const [n, h, w] = dims
    if (n * h * w === data.length) return { data, shape: [n, h, w] }
    return null
}

interface SiblingDataset {
    name: string
    dataset: unknown
}

function reshapeFromAttrs(
    dataset: unknown,
    rootAttrs: AttrsMap,
    rootDatasets: SiblingDataset[],
): DatasetResult | null {
    const dv = getDatasetFlat(dataset)
    if (!dv) return null
    const { data, shape } = dv

    if (shape.length === 3) return { data, shape }
    if (shape.length !== 1) return null

    const ds = dataset as { attrs?: AttrsMap }
    const dsAttrs: AttrsMap = ds.attrs ?? {}

    // 1. Dataset's own attributes
    let result = tryReshape(data, extractDims(dsAttrs))
    if (result) return result

    // 2. Root group attributes
    result = tryReshape(data, extractDims(rootAttrs))
    if (result) return result

    // 3. Sibling scalar datasets at root level whose names suggest dimensions
    const dimVals: Partial<Record<'slices' | 'height' | 'width', number>> = {}
    for (const { name, dataset: sibling } of rootDatasets) {
        const sv = getDatasetFlat(sibling)
        if (!sv || sv.data.length !== 1) continue
        const val = Math.round(sv.data[0])
        if (val <= 0) continue
        const nl = name.toLowerCase()
        if (SLICE_KEYS.some((k) => nl.includes(k.toLowerCase()))) dimVals.slices = val
        else if (HEIGHT_KEYS.some((k) => nl.includes(k.toLowerCase()))) dimVals.height = val
        else if (WIDTH_KEYS.some((k) => nl.includes(k.toLowerCase()))) dimVals.width = val
    }
    if (
        dimVals.slices !== undefined &&
        dimVals.height !== undefined &&
        dimVals.width !== undefined
    ) {
        result = tryReshape(data, [dimVals.slices, dimVals.height, dimVals.width])
        if (result) return result
    }

    // 4. Last resort: assume OCT depth=512, square lateral
    return tryReshape(data, guessShape(data.length))
}

function isDataset(item: unknown): boolean {
    return item != null && Array.isArray((item as { shape?: unknown }).shape)
}

function isGroup(item: unknown): boolean {
    const it = item as { keys?: unknown; shape?: unknown }
    return item != null && typeof it.keys === 'function' && !Array.isArray(it.shape)
}

function findVolumeDataset(f: InstanceType<typeof H5File>): DatasetResult | null {
    const keys: string[] = f.keys()

    const rootAttrs: AttrsMap = (f.attrs as AttrsMap) ?? {}

    // Collect root-level scalar datasets for sibling attr strategy
    const rootDatasets: SiblingDataset[] = []
    for (const k of keys) {
        const item = f.get(k)
        if (isDataset(item)) rootDatasets.push({ name: k, dataset: item })
    }

    // Strategy 1: named keys (volume, data, oct) — case-insensitive
    const lowerKeys: Record<string, string> = {}
    for (const k of keys) lowerKeys[k.toLowerCase()] = k

    for (const target of ['volume', 'data', 'oct']) {
        const actual = lowerKeys[target]
        if (!actual) continue
        const item = f.get(actual)
        if (!isDataset(item)) continue

        const dv = getDatasetFlat(item)
        if (!dv) continue
        if (dv.shape.length === 3) return dv
        if (dv.shape.length === 1 && dv.data.length >= 1000) {
            const r = reshapeFromAttrs(item, rootAttrs, rootDatasets)
            if (r) return r
        }
    }

    // Strategy 2: full recursive scan for any 3D dataset
    function search(group: InstanceType<typeof H5File>): DatasetResult | null {
        const gkeys: string[] = group.keys()
        for (const name of gkeys) {
            const item = group.get(name)
            if (isDataset(item)) {
                const dv = getDatasetFlat(item)
                if (!dv) continue
                if (dv.shape.length === 3) return dv
                if (dv.shape.length === 1 && dv.data.length >= 1000) {
                    const r = reshapeFromAttrs(item, rootAttrs, rootDatasets)
                    if (r) return r
                }
            } else if (isGroup(item)) {
                const r = search(item as InstanceType<typeof H5File>)
                if (r) return r
            }
        }
        return null
    }

    return search(f)
}

// Per-slice local min/max normalization → RGBA Uint8Array (no PNG encoding)
function normalizeSlice(data: Float32Array, height: number, width: number): Uint8Array {
    let min = Infinity,
        max = -Infinity
    for (let i = 0; i < data.length; i++) {
        if (data[i] < min) min = data[i]
        if (data[i] > max) max = data[i]
    }
    const range = max > min ? max - min : 1
    const rgba = new Uint8Array(height * width * 4)
    for (let i = 0; i < height * width; i++) {
        const v = Math.round(((data[i] - min) / range) * 255)
        const off = i * 4
        rgba[off] = v
        rgba[off + 1] = v
        rgba[off + 2] = v
        rgba[off + 3] = 255
    }
    return rgba
}

export async function loadH5File(file: File): Promise<H5VolumeData> {
    const { FS } = await ready
    const buf = await file.arrayBuffer()
    const fname = `h5_${Date.now()}_${Math.random().toString(36).slice(2)}.h5`

    FS.writeFile(fname, new Uint8Array(buf))
    try {
        const f = new H5File(fname, 'r')
        try {
            const result = findVolumeDataset(f)
            if (!result) {
                throw new Error(`No suitable 3D dataset found in "${file.name}"`)
            }

            const [nSlices, height, width] = result.shape
            const sliceSize = height * width

            const slices = Array.from({ length: nSlices }, (_, i) =>
                normalizeSlice(
                    result.data.slice(i * sliceSize, (i + 1) * sliceSize) as Float32Array,
                    height,
                    width,
                ),
            )

            return { nSlices, height, width, slices }
        } finally {
            f.close()
        }
    } finally {
        try {
            FS.unlink(fname)
        } catch {
            // ignore cleanup errors
        }
    }
}
