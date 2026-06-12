/**
 * H5 volume constants — deliberately free of any `h5wasm` import so the main
 * thread can use them without pulling the ~4.4 MB h5wasm/WASM module into its
 * bundle. The actual h5wasm-backed reader (`h5Reader.ts`) is imported only by
 * the Web Worker; the main thread talks to it via `h5WorkerClient.ts`.
 */

export const VOLUME_DIMS: [number, number, number] = [512, 250, 250]
export const PRE_FILTER_THRESHOLD = 0.05

// Fixed H5 dataset name — the backend writes the OCT volume under this key, no guessing.
export const H5_DATASET_NAME = 'OCT'
