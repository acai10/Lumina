// CHANGED: extract theme config to shared/theme/theme.ts
import React from 'react'
import ReactDOM from 'react-dom/client'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'

import App from './App'
import { medicalTheme } from './shared/theme/theme'
import { clearVolumes } from './shared/h5'

// The IndexedDB volume cache is a session-scoped spill area: the store starts
// empty, so anything left from a previous session is unreachable (hundreds of
// MB per volume). Purge it once at startup.
clearVolumes().catch((err) => console.error('volumeCache: startup purge failed', err))

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found in index.html')

ReactDOM.createRoot(root).render(
    <React.StrictMode>
        <ThemeProvider theme={medicalTheme}>
            <CssBaseline />
            <App />
        </ThemeProvider>
    </React.StrictMode>,
)
