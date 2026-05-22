# Lumina — OCT & STL Viewer

Browser-based medical imaging viewer. Supports loading OCT volumetric data (`.h5`) and 3D surface meshes (`.stl`) directly in the browser — no installation required, no server needed.

## Supported File Formats

| Format | Description               | Display                                                               |
|--------|---------------------------|-----------------------------------------------------------------------|
| `.h5`  | OCT C-scan volume (HDF5)  | Holographic stack of semi-transparent B-scan planes with slice slider |
| `.stl` | 3D surface mesh           | Lit 3D model with edge overlay, OrbitControls                         |

---

## Architecture

Pure frontend SPA — all HDF5 parsing and image encoding runs locally in the browser via WebAssembly. No backend, no server, no Docker required.

```text
Lumina/
├── .gitignore
├── .prettierrc.json
├── CLAUDE.md               # Claude Code project guide
├── README.md
├── eslint.config.js
├── index.html
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
└── src/
    ├── App.tsx
    ├── main.tsx
    ├── app/
    │   └── store/          # Zustand state (viewerSlice)
    ├── features/
    │   ├── stl/            # STLViewer
    │   ├── h5/             # H5Viewer, SliceSlider
    │   └── toolbar/        # Toolbar, useFileUpload
    └── shared/
        ├── h5/             # h5Reader (HDF5 → Float32Array → PNG/base64 via h5wasm)
        ├── theme/          # palette.ts, theme.ts
        └── types/          # viewer.types.ts
```

---

## Setup

### Voraussetzungen

Node.js 20+ — [nodejs.org](https://nodejs.org/)

```bash
# macOS (Homebrew)
brew install node
```

### Abhängigkeiten installieren & starten

```bash
npm install
npm run dev
```

App läuft unter **<http://localhost:5173>**

### Produktion-Build (statisch, deploybar)

```bash
npm run build
```

Erzeugt `dist/` — deploybar auf GitHub Pages, Netlify, Vercel oder jedem anderen statischen Hosting. Kein Server nötig.

---

## Entwicklung

```bash
npm run dev      # Dev-Server (port 5173, Hot Reload)
npm run build    # TypeScript-Check + Vite-Build
npm run lint     # ESLint
npm run format   # Prettier
```

---

## Abhängigkeiten

| Paket                                | Zweck                                   |
|--------------------------------------|-----------------------------------------|
| `react` + `react-dom`                | UI-Framework                            |
| `three`                              | 3D-Rendering (STL + H5 Viewer)          |
| `@mui/material`                      | Komponenten-Bibliothek                  |
| `@emotion/react` + `@emotion/styled` | MUI-Styling-Engine                      |
| `zustand`                            | State Management                        |
| `h5wasm`                             | HDF5-Parsing im Browser via WebAssembly |
| `vite`                               | Build-Tool + Dev-Server                 |
| `typescript`                         | Typsicherheit                           |
| `prettier`                           | Formatierung                            |

---

## Browser-Kompatibilität

Benötigt WebAssembly und OffscreenCanvas — unterstützt von allen modernen Browsern (Chrome 69+, Firefox 105+, Safari 16.4+).
