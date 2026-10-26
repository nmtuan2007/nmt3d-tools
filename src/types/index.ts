export type PlatformType = "makerworld" | "printables" | "thingiverse";

export interface ModelSource {
  platform: PlatformType;
  modelId: string;
  title: string;
  designer: string;
  sourceUrl: string;
  thumbnailUrl: string;
  downloadUrl?: string;
  tags: string[];
}

export const TIMELINE_BLOCK_TYPES = [
  "hook_gacha",
  "slicer_preview",
  "timelapse_print",
  "plate_snap_asmr",
  "support_peel_asmr",
  "mechanical_test",
  "verdict_outro",
] as const;

export type TimelineBlockType = (typeof TIMELINE_BLOCK_TYPES)[number];

export interface AudioAssignment {
  sfxId: string;
  assetPath: string;
  /** Relative to the start of the owning block. */
  startOffsetMicroseconds: number;
  durationMicroseconds: number;
  volume: number; // 0.0 - 1.0
}

export interface TimelineNode {
  blockId: string;
  type: TimelineBlockType;
  label: string;
  durationMs: number;
  visualDirection: string;
  audioCues: AudioAssignment[];
  onScreenText?: string;
}

export interface ProjectScript {
  hookNarrative: string;
  captionText: string;
  hashtags: string[];
  affiliateSlots: Array<{ category: string; suggestedSearch: string }>;
  hookTitles: string[];
  contingency: { pass: string; fail: string };
}

export interface ProjectManifest {
  projectId: string;
  projectName: string;
  createdAt: string;
  model: ModelSource;
  timeline: TimelineNode[];
  script: ProjectScript;
  exportPaths: {
    rootDirectory: string;
    screenRecordFile: string;
    capcutDraftDirectory: string;
  };
}

export interface SfxEntry {
  id: string;
  category: string;
  path: string;
  durationMicroseconds: number | null;
}

export type LlmProvider = "anthropic" | "openai" | "gemini";
