import { create } from "zustand";
import { generateStoryboard } from "../services/api/llmDirector";
import { DEFAULT_MODELS } from "../services/api/providers";
import { listSfx, assembleProject } from "../services/tauriBridge";
import { loadSfxMappings, saveRun, setSfxMapping } from "../services/db";
import { defaultTimeline } from "../services/project";
import type { AudioAssignment, ProjectManifest, ProjectScript, SfxEntry, TimelineNode } from "../types";
import type { ExportReport } from "../types/capcut";
import { useConfigStore } from "./useConfigStore";
import { useGachaStore } from "./useGachaStore";

type Status = "idle" | "running" | "done" | "error";

/** Provider SDKs embed the API's JSON error body in the message; show just its text. */
function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  try {
    return JSON.parse(msg.slice(msg.indexOf("{"))).error?.message ?? msg;
  } catch {
    return msg;
  }
}

interface ProjectState {
  manifest?: ProjectManifest;
  recordingMs?: number;
  thumbSize?: { width: number; height: number };
  bank: Record<string, SfxEntry>;
  overrides: Record<string, string>;
  selectedBlockId?: string;
  llmStatus: Status;
  llmError?: string;
  extraInstructions: string;
  exportStatus: Status;
  exportError?: string;
  exportReport?: ExportReport;

  loadBank: () => Promise<void>;
  setOverride: (sfxId: string, path: string | null) => Promise<void>;
  startProject: (manifest: ProjectManifest, recordingMs: number, thumbSize?: { width: number; height: number }) => void;
  selectBlock: (blockId?: string) => void;
  updateBlock: (blockId: string, patch: Partial<TimelineNode>) => void;
  removeBlock: (blockId: string) => void;
  updateCue: (blockId: string, index: number, patch: Partial<AudioAssignment>) => void;
  addCue: (blockId: string, sfxId: string) => void;
  removeCue: (blockId: string, index: number) => void;
  updateScript: (patch: Partial<ProjectScript>) => void;
  setExtraInstructions: (text: string) => void;
  generate: () => Promise<void>;
  exportProject: () => Promise<void>;
}

export const useProjectStore = create<ProjectState>()((set, get) => {
  const editTimeline = (fn: (timeline: TimelineNode[]) => TimelineNode[]) =>
    set((s) => (s.manifest ? { manifest: { ...s.manifest, timeline: fn(s.manifest.timeline) } } : {}));
  const editBlock = (blockId: string, fn: (b: TimelineNode) => TimelineNode) =>
    editTimeline((t) => t.map((b) => (b.blockId === blockId ? fn(b) : b)));
  const sfxCue = (sfxId: string): Pick<AudioAssignment, "sfxId" | "assetPath" | "durationMicroseconds"> => {
    const { bank, overrides } = get();
    return { sfxId, assetPath: overrides[sfxId] ?? bank[sfxId]?.path ?? "", durationMicroseconds: bank[sfxId]?.durationMicroseconds ?? 0 };
  };

  return {
    bank: {},
    overrides: {},
    llmStatus: "idle",
    extraInstructions: "",
    exportStatus: "idle",

    loadBank: async () => {
      const [entries, overrides] = await Promise.all([listSfx(), loadSfxMappings()]);
      set({ bank: Object.fromEntries(entries.map((e) => [e.id, e])), overrides });
    },

    setOverride: async (sfxId, path) => {
      await setSfxMapping(sfxId, path);
      set((s) => {
        const overrides = { ...s.overrides };
        if (path) overrides[sfxId] = path;
        else delete overrides[sfxId];
        return { overrides };
      });
    },

    startProject: (manifest, recordingMs, thumbSize) => {
      set({
        manifest: { ...manifest, timeline: defaultTimeline(recordingMs, get().bank) },
        recordingMs,
        thumbSize,
        selectedBlockId: undefined,
        llmStatus: "idle",
        llmError: undefined,
        exportStatus: "idle",
        exportReport: undefined,
        exportError: undefined,
      });
      const { autoGenerate, provider, apiKeys } = useConfigStore.getState();
      if (autoGenerate && apiKeys[provider]) void get().generate();
    },

    selectBlock: (selectedBlockId) => set({ selectedBlockId }),
    updateBlock: (blockId, patch) => editBlock(blockId, (b) => ({ ...b, ...patch })),
    removeBlock: (blockId) => editTimeline((t) => t.filter((b) => b.blockId !== blockId)),
    updateCue: (blockId, index, patch) =>
      editBlock(blockId, (b) => ({
        ...b,
        audioCues: b.audioCues.map((c, i) => (i === index ? { ...c, ...patch, ...(patch.sfxId ? sfxCue(patch.sfxId) : {}) } : c)),
      })),
    addCue: (blockId, sfxId) =>
      editBlock(blockId, (b) => ({ ...b, audioCues: [...b.audioCues, { ...sfxCue(sfxId), startOffsetMicroseconds: 0, volume: 1 }] })),
    removeCue: (blockId, index) => editBlock(blockId, (b) => ({ ...b, audioCues: b.audioCues.filter((_, i) => i !== index) })),
    updateScript: (patch) => set((s) => (s.manifest ? { manifest: { ...s.manifest, script: { ...s.manifest.script, ...patch } } } : {})),
    setExtraInstructions: (extraInstructions) => set({ extraInstructions }),

    generate: async () => {
      const { manifest, recordingMs, bank, extraInstructions } = get();
      const { provider, apiKeys, models } = useConfigStore.getState();
      if (!manifest) return;
      if (!apiKeys[provider]) {
        set({ llmStatus: "error", llmError: `Add a ${provider} API key in Settings first.` });
        return;
      }
      set({ llmStatus: "running", llmError: undefined });
      try {
        const result = await generateStoryboard({
          provider,
          apiKey: apiKeys[provider],
          modelId: models[provider] || DEFAULT_MODELS[provider],
          model: manifest.model,
          category: useGachaStore.getState().category,
          hookMs: recordingMs ?? 3800,
          bank,
          extraInstructions,
        });
        // The project may have been replaced by a new spin while the LLM was thinking.
        if (get().manifest?.projectId !== manifest.projectId) return;
        set((s) => ({
          manifest: s.manifest && { ...s.manifest, timeline: result.timeline, script: result.script },
          selectedBlockId: undefined,
          llmStatus: "done",
        }));
      } catch (e) {
        set({ llmStatus: "error", llmError: errorText(e) });
      }
    },

    exportProject: async () => {
      const { manifest, recordingMs, thumbSize, overrides } = get();
      if (!manifest) return;
      const { installToCapcut, capcutDir } = useConfigStore.getState();
      set({ exportStatus: "running", exportError: undefined, exportReport: undefined });
      try {
        const exportReport = await assembleProject(manifest, {
          recordingDurationMs: recordingMs,
          thumbnailWidth: thumbSize?.width,
          thumbnailHeight: thumbSize?.height,
          capcutDraftsDir: installToCapcut && capcutDir ? capcutDir : undefined,
          sfxOverrides: overrides,
        });
        await saveRun(manifest);
        set({ exportStatus: "done", exportReport });
      } catch (e) {
        set({ exportStatus: "error", exportError: String(e) });
      }
    },
  };
});
