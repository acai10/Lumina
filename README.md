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
    ├── requirements.txt
    ├── requirements-dev.txt
    ├── pyproject.toml
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

Setzt voraus, dass die Images einmal gebaut wurden (`docker compose build`).

---

## Option B — Lokal ohne Docker

### Voraussetzungen

#### macOS (Homebrew)

```bash
# Homebrew installieren (falls noch nicht vorhanden)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Node.js + npm installieren
brew install node

# Python 3.11+ prüfen (3.13 funktioniert ebenfalls)
python3 --version
```

#### Windows / Linux

- [Node.js 20+](https://nodejs.org/) herunterladen und installieren
- [Python 3.11+](https://www.python.org/downloads/) herunterladen und installieren

---

### Backend einrichten

```bash
cd backend

# Virtuelle Umgebung erstellen
python3 -m venv .venv

# Aktivieren
source .venv/bin/activate          # macOS / Linux
# .venv\Scripts\activate           # Windows

# Abhängigkeiten installieren (Runtime + Dev-Tools)
pip install -r requirements.txt -r requirements-dev.txt
```

#### Backend starten

```bash
# Venv muss aktiv sein
cd backend
source .venv/bin/activate

uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend läuft unter http://localhost:8000  
API-Dokumentation: http://localhost:8000/docs

#### Backend formatieren

```bash
cd backend
source .venv/bin/activate

black . && isort .
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

### IDE-Einrichtung (VS Code)

Die Datei `.vscode/settings.json` ist bereits im Repository enthalten und zeigt automatisch auf die Backend-venv.  
Pylance löst alle Python-Imports korrekt auf, sobald der Workspace-Root `Lumina/` geöffnet ist.

Empfohlene Extensions:
- [Pylance](https://marketplace.visualstudio.com/items?itemName=ms-python.vscode-pylance) — Python-Sprachserver
- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) — TypeScript-Linting
- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) — TypeScript-Formatierung

---

## Abhängigkeiten im Überblick

### Backend (`requirements.txt`)

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

### Backend Dev (`requirements-dev.txt`)

| Paket | Zweck |
|-------|-------|
| `black` | Python-Formatter |
| `isort` | Import-Sortierung |

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
