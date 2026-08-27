/**
 * Application entry point: mounts <App /> inside the MUI theme provider.
 *
 * The only routing-free part of the app — Lumina switches views from Zustand
 * state (active tab type and view mode), not from the URL.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'

import App from './App'
import { medicalTheme } from './shared/theme/theme'

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
