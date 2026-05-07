# Lumina — OCT & STL Viewer

Browser-based medical imaging viewer. Supports loading OCT volumetric data (`.h5`) and 3D surface meshes (`.stl`) directly in the browser — no installation required.

## Supported File Formats

| Format | Description               | Display                                                               |
|--------|---------------------------|-----------------------------------------------------------------------|
| `.h5`  | OCT C-scan volume (HDF5)  | Holographic stack of semi-transparent B-scan planes with slice slider |
| `.stl` | 3D surface mesh           | Lit 3D model with edge overlay, OrbitControls                         |

---

## Architecture

```
Lumina/
├── docker-compose.yml
├── Makefile
├── .gitignore
├── README.md
├── frontend/               # React + TypeScript + Vite + MUI + Three.js
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── app/store/      # Zustand state (viewerSlice)
│       ├── features/
│       │   ├── stl/        # STLViewer
│       │   └── h5/         # H5Viewer, SliceSlider
│       └── shared/         # API client, types
└── backend/                # Python FastAPI
    ├── Dockerfile
    ├── pyproject.toml      # Abhängigkeiten + Tool-Konfiguration
    ├── uv.lock             # Eingefrorener Dependency-Graph (committen!)
    ├── main.py
    └── src/
        ├── routers/        # h5 (upload + slice)
        └── imaging/        # h5_reader (HDF5 → numpy → PNG/base64)
```

Frontend and backend share no code. All communication is via HTTP REST.

---

## Option A — Docker (empfohlen)

### Voraussetzungen

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installiert und gestartet

### Starten

```bash
docker compose up --build
```

Beim ersten Start werden alle Images gebaut und Abhängigkeiten installiert. Danach reicht `docker compose up`.

| Service  | URL                        |
|----------|----------------------------|
| Frontend | http://localhost:5173      |
| Backend  | http://localhost:8000      |
| API Docs | http://localhost:8000/docs |

### Stoppen

```bash
docker compose down
```

### Formatierung (beide Services gleichzeitig)

```bash
make format
```

---

## Option B — Lokal ohne Docker

### Voraussetzungen

#### macOS (Homebrew)

```bash
# Homebrew installieren (falls noch nicht vorhanden)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Node.js + npm installieren
brew install node

# uv installieren (Python-Paketmanager)
brew install uv
```

#### Windows / Linux

```bash
# Node.js 20+ von https://nodejs.org/ installieren

# uv installieren
curl -LsSf https://astral.sh/uv/install.sh | sh
```

---

### Backend einrichten

Das Backend verwendet [uv](https://docs.astral.sh/uv/) als Paketmanager.  
`uv.lock` ist im Repository eingecheckt und stellt sicher, dass alle Entwickler exakt dieselben Paketversionen verwenden.

```bash
cd backend

# Virtuelle Umgebung erstellen und alle Abhängigkeiten aus uv.lock installieren
uv sync
```

`uv sync` erledigt automatisch:
1. `.venv/` erstellen (falls nicht vorhanden)
2. Alle Pakete aus `uv.lock` installieren — keine Versionsunterschiede zwischen Entwicklern

#### Backend starten

```bash
cd backend
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

`uv run` führt den Befehl automatisch in der projekteigenen venv aus — kein manuelles `source .venv/bin/activate` nötig.

Backend läuft unter http://localhost:8000  
API-Dokumentation: http://localhost:8000/docs

#### Backend formatieren

```bash
cd backend
uv run black . && uv run isort .
```

#### Abhängigkeit hinzufügen

```bash
# Runtime-Abhängigkeit
cd backend
uv add <paket>

# Nur für Entwicklung (dev-Gruppe)
uv add --dev <paket>
```

`uv add` aktualisiert `pyproject.toml` und `uv.lock` automatisch.  
Die aktualisierte `uv.lock` danach committen, damit alle Entwickler dieselbe Version erhalten.

#### Lockfile aktualisieren (ohne neue Pakete hinzuzufügen)

```bash
cd backend
uv lock --upgrade
uv sync
```

---

### Frontend einrichten

```bash
cd frontend

# Abhängigkeiten installieren
npm install
```

#### Frontend starten

```bash
cd frontend
npm run dev
```

Frontend läuft unter http://localhost:5173

#### Frontend formatieren

```bash
cd frontend
npm run format
```

#### Frontend für Produktion bauen

```bash
cd frontend
npm run build
```

---

### Beides gleichzeitig formatieren

```bash
make format
```

Ruft `uv run black . && uv run isort .` im Backend und `npm run format` im Frontend auf.

---

### IDE-Einrichtung (VS Code)

Die Datei `.vscode/settings.json` ist bereits im Repository enthalten und zeigt automatisch auf die Backend-venv unter `backend/.venv`.  
Pylance löst alle Python-Imports korrekt auf, sobald der Workspace-Root `Lumina/` geöffnet ist.

Empfohlene Extensions:
- [Pylance](https://marketplace.visualstudio.com/items?itemName=ms-python.vscode-pylance) — Python-Sprachserver
- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) — TypeScript-Linting
- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) — TypeScript-Formatierung

---

## Abhängigkeiten im Überblick

### Backend (`pyproject.toml` — verwaltet mit uv)

| Paket                | Zweck                                    |
|----------------------|------------------------------------------|
| `fastapi`            | REST-API-Framework                       |
| `uvicorn[standard]`  | ASGI-Server                              |
| `python-multipart`   | Datei-Upload                             |
| `h5py`               | HDF5-Dateien lesen                       |
| `numpy`              | Array-Verarbeitung                       |
| `Pillow`             | PNG-Encoding für Base64-Antworten        |
| `black` *(dev)*      | Python-Formatter                         |
| `isort` *(dev)*      | Import-Sortierung                        |

### Frontend (`package.json`)

| Paket                                | Zweck                          |
|--------------------------------------|--------------------------------|
| `react` + `react-dom`                | UI-Framework                   |
| `three`                              | 3D-Rendering (STL + H5 Viewer) |
| `@mui/material`                      | Komponenten-Bibliothek         |
| `@emotion/react` + `@emotion/styled` | MUI-Styling-Engine             |
| `zustand`                            | State Management               |
| `vite`                               | Build-Tool + Dev-Server        |
| `typescript`                         | Typsicherheit                  |
| `prettier`                           | Formatierung                   |
