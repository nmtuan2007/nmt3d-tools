import { create } from "zustand";
import { discoverModels } from "../services/scraper";
import type { ModelSource, PlatformType } from "../types";

interface GachaState {
  platform: PlatformType;
  category: string;
  pool: ModelSource[];
  source?: "live" | "cache";
  notice?: string;
  loading: boolean;
  error?: string;
  spinning: boolean;
  /** Bumped by SpinControls; RouletteCanvas runs one spin per change. */
  spinNonce: number;
  winner?: ModelSource;
  setPlatform: (platform: PlatformType) => void;
  setCategory: (category: string) => void;
  loadPool: () => Promise<void>;
  requestSpin: () => void;
  setSpinning: (spinning: boolean, error?: string) => void;
  setWinner: (winner: ModelSource) => void;
}

export const useGachaStore = create<GachaState>()((set, get) => ({
  platform: "printables",
  category: "print in place",
  pool: [],
  loading: false,
  spinning: false,
  spinNonce: 0,
  setPlatform: (platform) => set({ platform }),
  setCategory: (category) => set({ category }),
  loadPool: async () => {
    set({ loading: true, error: undefined, notice: undefined });
    try {
      const { models, source, notice } = await discoverModels(get().platform, get().category);
      set({ pool: models, source, notice, loading: false });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },
  requestSpin: () => set((s) => ({ spinNonce: s.spinNonce + 1, error: undefined })),
  setSpinning: (spinning, error) => set({ spinning, error }),
  setWinner: (winner) => set({ winner }),
}));
