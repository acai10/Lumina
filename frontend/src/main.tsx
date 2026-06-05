// CHANGED: extract theme config to shared/theme/theme.ts
import React from 'react'
import ReactDOM from 'react-dom/client'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'

import App from './App'
import { darkTheme } from './shared/theme/theme'

const root = document.getElementById('root')
if (!root) throw new Error('Root element #root not found in index.html')

ReactDOM.createRoot(root).render(
    <React.StrictMode>
        <ThemeProvider theme={darkTheme}>
            <CssBaseline />
            <App />
        </ThemeProvider>
    </React.StrictMode>,
)
