# OCT Medical Imaging

Browser-based OCT scan viewer and processing tool for medical professionals (ophthalmologists, researchers).

## Supported Scan Types

| Type | Description | Display |
|------|-------------|---------|
| A-Scan | Single 1D depth signal (amplitude vs depth) | Waveform / line plot |
| B-Scan | 2D cross-sectional slice (stack of A-scans) | Grayscale image |
| C-Scan | 3D volumetric scan (stack of B-scans) | Scrollable B-scan slices |

---

## Architecture

```
Lumina/
├── docker-compose.yml
├── Makefile
├── .gitignore
├── README.md
├── frontend/               # React + TypeScript + Vite + MUI
│   ├── Dockerfile
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── app/store/      # Zustand state (octSlice, uiSlice)
│       ├── features/       # viewport, toolpanel, workspace
│       └── shared/         # API client, types, components
└── backend/                # Python FastAPI
    ├── Dockerfile
    ├── pyproject.toml      # Abhängigkeiten + Tool-Konfiguration
    ├── uv.lock             # Eingefrorener Dependency-Graph (committen!)
    ├── main.py
    └── src/
        ├── routers/        # oct, filters, segmentation
        ├── imaging/        # oct_reader, filters, segmentation
        └── schemas/        # Pydantic response models
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

| Paket | Zweck |
|-------|-------|
| `fastapi` | REST-API-Framework |
| `uvicorn[standard]` | ASGI-Server |
| `python-multipart` | Datei-Upload |
| `pydicom` | DICOM-Dateien lesen |
| `SimpleITK` | MHA / NRRD / weitere Bildformate |
| `numpy` | Array-Verarbeitung |
| `opencv-python-headless` | Bildverarbeitung (Filter, Threshold) |
| `scikit-image` | Segmentierung (random_walker) |
| `Pillow` | PNG-Encoding für Base64-Antworten |
| `scipy` | Lee-Speckle-Filter |
| `black` *(dev)* | Python-Formatter |
| `isort` *(dev)* | Import-Sortierung |

### Frontend (`package.json`)

| Paket | Zweck |
|-------|-------|
| `react` + `react-dom` | UI-Framework |
| `@mui/material` | Komponenten-Bibliothek (dark theme) |
| `@emotion/react` + `@emotion/styled` | MUI-Styling-Engine |
| `zustand` | State Management |
| `recharts` | A-Scan Liniendiagramm |
| `vite` | Build-Tool + Dev-Server |
| `typescript` | Typsicherheit |
| `prettier` | Formatierung |
