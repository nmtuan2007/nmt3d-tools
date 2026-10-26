import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_MODELS } from "../services/api/providers";
import type { LlmProvider } from "../types";

interface ConfigState {
  provider: LlmProvider;
  apiKeys: Record<LlmProvider, string>;
  models: Record<LlmProvider, string>;
  outputDir: string;
  capcutDir: string;
  installToCapcut: boolean;
  autoGenerate: boolean;
  set: (patch: Partial<Omit<ConfigState, "set" | "setApiKey" | "setModel">>) => void;
  setApiKey: (provider: LlmProvider, key: string) => void;
  setModel: (provider: LlmProvider, model: string) => void;
}

// ponytail: API keys sit in the webview's localStorage; fine for a single-user desktop
// tool, move them to the OS keychain if the app is ever shared across accounts.
export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      provider: "anthropic",
      apiKeys: { anthropic: "", openai: "", gemini: "" },
      models: { ...DEFAULT_MODELS },
      outputDir: "",
      capcutDir: "",
      installToCapcut: true,
      autoGenerate: true,
      set: (patch) => set(patch),
      setApiKey: (provider, key) => set((s) => ({ apiKeys: { ...s.apiKeys, [provider]: key } })),
      setModel: (provider, model) => set((s) => ({ models: { ...s.models, [provider]: model } })),
    }),
    { name: "nmt3d-config" },
  ),
);
