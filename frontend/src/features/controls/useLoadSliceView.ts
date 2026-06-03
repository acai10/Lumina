// This hook is no longer needed — the backend now pre-normalises every volume
// response so normalizedVolume is always present without a separate load step.
// Kept as a no-op stub so any stale import doesn't break the build.

export function useLoadSliceView(_fileKey: string, _sessionId: string) {
    return { loading: false, load: async () => {} }
}
