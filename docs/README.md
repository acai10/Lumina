# Lumina Documentation

Lumina is a browser-based tool for loading, filtering, measuring, and stitching
**OCT volumes** (Optical Coherence Tomography — a 3-D imaging technique that
produces stacks of cross-sectional "slice" images, similar to how a CT scan
images the body but at micrometre resolution). A Python backend does all the
heavy number-crunching; a React/Three.js frontend renders the data in the
browser as both 3-D point clouds and 2-D slice views.

This folder contains the detailed reference documentation. Each file covers one
domain and explains the features, the functions behind them, and every formula
in plain language — with worked examples — so both developers and non-technical
readers can follow along.

## Contents

| # | Document | What it covers |
|---|----------|----------------|
| 1 | [Architecture Overview](01-architecture-overview.md) | The big picture: how the frontend and backend fit together, the tech stack, the shared "packed binary" data format, and the end-to-end data flow. |
| 2 | [Volume Ingestion & Storage](02-volume-ingestion-storage.md) | How volumes get into Lumina: file upload, zero-copy "register by path", local file discovery, the HDF5 file format, and how volumes are cached in memory (server) and on the JS heap / IndexedDB (browser). |
| 3 | [Normalization, Point-Cloud Rendering & Shaders](03-normalization-rendering.md) | How raw intensities become a render-ready image: backend normalization, the radix-sort point-cloud builder, GPU shaders, colormaps, and tone mapping. |
| 4 | [Preprocessing Filters](04-preprocessing-filters.md) | The six image filters — Gaussian, Median, Mean, Normalize, Edge highlight, Muscle/fat segmentation — their math, and how filter chains are applied. |
| 5 | [2-D Slice Viewer & Geometric Measurements](05-slice-viewer-measurements.md) | The 2-D slice panels, coordinate transforms, the distance and area measurement tools, and the backend's volumetric measurements (volume, surface area, thickness, diameter). |
| 6 | [Cropping & Object Analysis](06-cropping-object-analysis.md) | Extracting sub-volumes (rectangle / cylinder / sphere), and counting distinct 3-D structures with connected-component analysis. |
| 7 | [Annotation](07-annotation.md) | The non-destructive brush/eraser painting tools and how labels are stored and displayed. |
| 8 | [Multi-Volume Stitching & Registration](08-stitching-registration.md) | Aligning and merging multiple overlapping volumes into one: registration algorithms, global offset solving, max-intensity merging, and quality metrics. |
| 9 | [Jobs, Sessions & the Async Processing Lifecycle](09-jobs-sessions-lifecycle.md) | How long-running work is queued, executed in the background, polled, and downloaded — plus the memory-management strategy. |
| 10 | [STL Viewer & 3-D Overlay](10-stl-viewer-overlay.md) | Viewing 3-D mesh (STL) files and overlaying them on an OCT volume with an interactive alignment gizmo. |
| 11 | [Frontend Shell, State & Theming](11-frontend-shell-state.md) | The application layout, the central Zustand state store, tab management, memory eviction, and the MUI theme. |
| 12 | [API Reference](12-api-reference.md) | Every backend endpoint, its request/response shape, status codes, and headers, in one place. |

## How to read this

- **New to the project?** Start with [Architecture Overview](01-architecture-overview.md).
- **Looking for a specific calculation?** Each formula appears in the document
  for its domain, written out symbolically, with every variable explained and a
  concrete numeric example.
- **Code references** are given as `path/to/file.py:line` so you can jump
  straight to the source.

For setup and run instructions, see the [root README](../README.md).
