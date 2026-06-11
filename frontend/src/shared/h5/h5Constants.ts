// Pure constants — deliberately free of any h5wasm import so main-thread
// consumers (store, control limits) don't pull the h5wasm chunk into the
// eager startup bundle. h5wasm itself only ever runs inside h5.worker.ts.
export const VOLUME_DIMS: [number, number, number] = [512, 250, 250]
export const PRE_FILTER_THRESHOLD = 0.05
