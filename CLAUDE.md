# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install
npm run dev      # start dev server (port 5173)
npm run build    # tsc + vite build (TypeScript errors fail the build)
npm run lint     # eslint src/
npm run format   # prettier --write
```

No test suite exists yet.

---

## Architecture

Pure frontend SPA — no backend, no Docker. All HDF5 parsing and image encoding run locally in the browser via WebAssembly (`h5wasm`).

**Stack**: React + TypeScript SPA. View switching is **state-based** (`mode: 'none' | 'stl' | 'h5'` in Zustand) — there is no URL routing. MUI is the sole styling system; no CSS files. All color tokens are in `shared/theme/palette.ts`; the MUI theme is in `shared/theme/theme.ts` (consumed by `main.tsx`). Complex component styles with pseudo-selectors are extracted to co-located `.styles.ts` files; simple 1–3 property overrides stay inline as `sx` props.

---

## Key Architectural Details

**H5 load flow**: User selects a `.h5` file → `loadH5File()` in `src/shared/h5/h5Reader.ts` reads the file via h5wasm (WebAssembly HDF5 library), extracts the 3D volume as a `Float32Array`, normalizes and encodes each slice as a base64 PNG via the Canvas API. All slices are stored in Zustand state as `string[]`.

**HDF5 parsing** (`src/shared/h5/h5Reader.ts`): `loadH5File()` tries multiple strategies to find a 3D dataset — named keys (`volume`, `data`, `oct`), attribute-based reshape, sibling scalar datasets, and a heuristic OCT depth guesser. This is intentionally broad to support diverse vendor file layouts.

**H5Viewer rendering**: Stacked `THREE.PlaneGeometry` meshes, one per B-scan, with `transparent: true` / `depthWrite: false`. Camera is positioned mostly overhead `(0, maxDim×1.8, maxDim×0.4)` to minimise perspective shadow accumulation from transparent plane blending. Slice selection hides earlier planes and raises selected plane opacity to 0.9.

**Normalization**: `encodeSlice()` normalises **per slice** (local min/max). Do not switch to global normalisation — boundary slices have lower OCT signal and would appear artificially dark.

**h5wasm + Vite**: `optimizeDeps.exclude: ['h5wasm']` in `vite.config.ts` prevents Vite from pre-bundling the WASM package, which would break its asset loading.

**`palette.bgDeepHex`** (`0x0a0f1e`) is the Three.js integer form of `palette.bgDeep` (`#0a0f1e`). Both viewers use it for `renderer.setClearColor()`. Add new Three.js background colors here if needed — don't hardcode hex integers in viewer files.
