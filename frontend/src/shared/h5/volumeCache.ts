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
    vIndices: Float32Array
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
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    })
    // If the connection later errors out, allow a fresh open on the next call.
    dbPromise.catch(() => {
        dbPromise = null
    })
    return dbPromise
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
    return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME)
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
    await new Promise<void>((resolve, reject) => {
        const store = tx(db, 'readwrite')
        const req = store.put(record, key)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error ?? new Error('IndexedDB put failed'))
    })
}

/** Restore a volume's buffers, or `null` if no entry exists for `key`. */
export async function getVolume(key: string): Promise<H5VolumeData | null> {
    const db = await openDB()
    const record = await new Promise<CachedVolume | undefined>((resolve, reject) => {
        const store = tx(db, 'readonly')
        const req = store.get(key)
        req.onsuccess = () => resolve(req.result as CachedVolume | undefined)
        req.onerror = () => reject(req.error ?? new Error('IndexedDB get failed'))
    })
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
    await new Promise<void>((resolve, reject) => {
        const store = tx(db, 'readwrite')
        const req = store.delete(key)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error ?? new Error('IndexedDB delete failed'))
    })
}

/** Drop every cached volume (used on a full reset). */
export async function clearVolumes(): Promise<void> {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
        const store = tx(db, 'readwrite')
        const req = store.clear()
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error ?? new Error('IndexedDB clear failed'))
    })
}
