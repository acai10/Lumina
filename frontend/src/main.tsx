import React from 'react'
import ReactDOM from 'react-dom/client'
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'

import App from './App'
import { palette } from './shared/theme/palette'

const darkTheme = createTheme({
    palette: {
        mode: 'dark',
        background: {
            default: palette.bgDeep,
            paper: palette.bgPaper,
        },
    },
})

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
