import type { H5VolumeData } from '../types/viewer.types'

/**
 * IndexedDB-backed off-heap store for the heavy per-volume buffers
 * (`vIndices`, `vIntensities`, `normalizedVolume`).
 *
 * Each loaded `.h5` volume is ~150–210 MB. Keeping every open tab's buffers on
 * the JS heap is what crashes the tab when several files (or a whole folder) are
 * loaded. This module moves inactive volumes to IndexedDB — i.e. onto disk —
 * so only the few hydrated tabs occupy the heap. The store (viewerSlice) decides
 * *which* volumes stay hydrated; this module only persists and restores them.
 *
 * Typed arrays survive the structured-clone algorithm intact, so we store the
 * `H5VolumeData` buffers directly and read them back without any (de)serialisation.
 */

const DB_NAME = 'lumina-volumes'
const STORE_NAME = 'volumes'
const DB_VERSION = 1

interface CachedVolume {
    nSlices: number
    height: number
    width: number
    vIndices: Uint32Array
    vIntensities: Float32Array
    normalizedVolume: Uint8Array | null
}

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise
    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION)
        req.onupgradeneeded = () => {
            const db = req.result
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME)
            }
        }
        req.onsuccess = () => {
            const db = req.result
            // The browser can force-close the connection at any time (storage
            // pressure, devtools "clear site data", another tab upgrading the
            // schema). Drop the cached promise so the next call reopens instead
            // of failing forever on a dead connection.
            db.onclose = () => {
                if (dbPromise) dbPromise = null
            }
            db.onversionchange = () => {
                db.close()
                if (dbPromise) dbPromise = null
            }
            resolve(db)
        }
        req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    })
    // If the open itself fails, allow a fresh attempt on the next call.
    dbPromise.catch(() => {
        dbPromise = null
    })
    return dbPromise
}

/**
 * Run one readwrite/readonly transaction and settle when it COMMITS.
 *
 * Resolving on the request's `onsuccess` would be premature: that event only
 * means the operation was applied inside the still-open transaction — the
 * commit can abort afterwards (e.g. QuotaExceededError while writing a
 * ~200 MB volume), silently losing data the caller believed persisted. The
 * store evicts heap buffers only after this promise resolves, so correctness
 * depends on waiting for `oncomplete`.
 */
function runTx<T>(
    db: IDBDatabase,
    mode: IDBTransactionMode,
    op: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode)
        const req = op(transaction.objectStore(STORE_NAME))
        transaction.oncomplete = () => resolve(req.result)
        transaction.onabort = () =>
            reject(transaction.error ?? new Error('IndexedDB transaction aborted'))
        transaction.onerror = () =>
            reject(transaction.error ?? new Error('IndexedDB transaction failed'))
    })
}

/** Persist a volume's buffers under `key`, overwriting any existing entry. */
export async function putVolume(key: string, data: H5VolumeData): Promise<void> {
    const db = await openDB()
    const record: CachedVolume = {
        nSlices: data.nSlices,
        height: data.height,
        width: data.width,
        vIndices: data.vIndices,
        vIntensities: data.vIntensities,
        normalizedVolume: data.normalizedVolume,
    }
    await runTx(db, 'readwrite', (store) => store.put(record, key))
}

function isCachedVolume(v: unknown): v is CachedVolume {
    return (
        v !== null &&
        typeof v === 'object' &&
        typeof (v as CachedVolume).nSlices === 'number' &&
        (v as CachedVolume).vIndices instanceof Uint32Array &&
        (v as CachedVolume).vIntensities instanceof Float32Array
    )
}

/** Restore a volume's buffers, or `null` if no entry exists for `key`. */
export async function getVolume(key: string): Promise<H5VolumeData | null> {
    const db = await openDB()
    const raw = await runTx(db, 'readonly', (store) => store.get(key))
    const record = isCachedVolume(raw) ? raw : undefined
    if (!record) return null
    return {
        nSlices: record.nSlices,
        height: record.height,
        width: record.width,
        vIndices: record.vIndices,
        vIntensities: record.vIntensities,
        normalizedVolume: record.normalizedVolume,
    }
}

/** Remove a single volume's buffers. */
export async function deleteVolume(key: string): Promise<void> {
    const db = await openDB()
    await runTx(db, 'readwrite', (store) => store.delete(key))
}

/** Drop every cached volume (used on a full reset). */
export async function clearVolumes(): Promise<void> {
    const db = await openDB()
    await runTx(db, 'readwrite', (store) => store.clear())
}
