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

**H5 load flow**: User selects a `.h5` file → `loadH5FileInWorker()` in `src/shared/h5/h5Reader.ts` spawns a Web Worker (`src/shared/h5/h5.worker.ts`) that runs h5wasm parsing off the main thread. The worker normalizes each voxel **per slice** (local min/max) to `[0, 1]`, pre-filters voxels below `PRE_FILTER_THRESHOLD`, and transfers two zero-copy `Float32Array`s — `vIndices` (flat voxel indices) and `vIntensities` (normalized values) — back to the main thread.

**HDF5 parsing** (`src/shared/h5/h5Reader.ts`): `loadH5File()` tries multiple strategies to find a 3D dataset — named keys (`volume`, `data`, `oct`), attribute-based reshape, sibling scalar datasets, and a heuristic OCT depth guesser. This is intentionally broad to support diverse vendor file layouts.

**H5Viewer rendering**: A single `THREE.Points` object with a custom GLSL3 `ShaderMaterial`. The vertex shader reconstructs 3D position from a flat voxel index using slice/row/column arithmetic and the `uVolumeSpacing` uniform. The fragment shader applies threshold, per-axis range clipping, brightness, and S-curve contrast before writing `vec4(c, c, c, uOpacity)`. Rendering is **on-demand**: the animate loop calls `controls.update()` (returns `true` when the camera is still moving) and only calls `renderer.render()` when the camera moved or `needsRenderRef` is set. Uniform changes (slider interactions) set `needsRenderRef.current = true` to trigger one additional frame.

**Normalization**: Done **per slice** (local min/max) in the worker — do not switch to global normalization. Boundary slices have lower OCT signal and would appear artificially dark with global normalization.

**h5wasm + Vite**: `optimizeDeps.exclude: ['h5wasm']` in `vite.config.ts` prevents Vite from pre-bundling the WASM package, which would break its asset loading.

**`palette.bgDeepHex`** (`0x0a0f1e`) is the Three.js integer form of `palette.bgDeep` (`#0a0f1e`). Both viewers use it for `renderer.setClearColor()`. Add new Three.js background colors here if needed — don't hardcode hex integers in viewer files.
