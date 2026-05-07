import { create } from 'zustand';

import type { OCTScanType } from '../../shared/types/oct.types';

interface CScanMetadata {
    nSlices: number;
    width: number;
    height: number;
}

interface OCTState {
    scanType: OCTScanType | null;
    currentBScan: string | null;
    cScanMetadata: CScanMetadata | null;
    selectedSliceIndex: number;
    aScanSignal: number[];
    depthAxis: number[];
    overlayMask: string | null;
    isLoading: boolean;
    error: string | null;

    setScanType: (t: OCTScanType) => void;
    setCurrentBScan: (b: string) => void;
    setCScanMetadata: (m: CScanMetadata) => void;
    setSelectedSliceIndex: (i: number) => void;
    setAScanSignal: (signal: number[], depth: number[]) => void;
    setOverlayMask: (m: string | null) => void;
    setIsLoading: (v: boolean) => void;
    setError: (e: string | null) => void;
}

export const useOctStore = create<OCTState>((set) => ({
    scanType: null,
    currentBScan: null,
    cScanMetadata: null,
    selectedSliceIndex: 0,
    aScanSignal: [],
    depthAxis: [],
    overlayMask: null,
    isLoading: false,
    error: null,

    setScanType: (t) => set({ scanType: t }),
    setCurrentBScan: (b) => set({ currentBScan: b }),
    setCScanMetadata: (m) => set({ cScanMetadata: m }),
    setSelectedSliceIndex: (i) => set({ selectedSliceIndex: i }),
    setAScanSignal: (signal, depth) => set({ aScanSignal: signal, depthAxis: depth }),
    setOverlayMask: (m) => set({ overlayMask: m }),
    setIsLoading: (v) => set({ isLoading: v }),
    setError: (e) => set({ error: e }),
}));
