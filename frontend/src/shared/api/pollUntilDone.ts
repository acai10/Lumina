import { JOB_STATUS } from './types'

export const POLL_INTERVAL_MS = 2_000
/** ~10 minutes at the default interval — a wedged backend job must not poll forever. */
export const MAX_POLL_ATTEMPTS = 300

/** Flipped by the owning hook's unmount cleanup so in-flight loops stop touching state. */
export interface CancelToken {
    cancelled: boolean
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Polls `poll` until the status leaves PENDING/RUNNING.
 * Returns null when `token.cancelled` flips — the caller must bail out without
 * writing to state. Throws after `maxAttempts`.
 */
export async function pollUntilDone<T extends { status: string }>(
    poll: () => Promise<T>,
    token: CancelToken,
    intervalMs: number = POLL_INTERVAL_MS,
    maxAttempts: number = MAX_POLL_ATTEMPTS,
): Promise<T | null> {
    let status = await poll()
    let attempts = 0
    while (status.status === JOB_STATUS.PENDING || status.status === JOB_STATUS.RUNNING) {
        if (token.cancelled) return null
        if (++attempts > maxAttempts) {
            throw new Error('Timed out waiting for the backend job to finish')
        }
        await sleep(intervalMs)
        if (token.cancelled) return null
        status = await poll()
    }
    return token.cancelled ? null : status
}
