/// <reference types="vite/client" />

interface ImportMetaEnv {
    // Optional: unset in plain local dev — client.ts falls back to localhost:8000.
    readonly VITE_API_URL?: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
