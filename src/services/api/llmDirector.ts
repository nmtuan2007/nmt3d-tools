import {
  TIMELINE_BLOCK_TYPES,
  type AudioAssignment,
  type LlmProvider,
  type ModelSource,
  type ProjectScript,
  type SfxEntry,
  type TimelineBlockType,
  type TimelineNode,
} from "../../types";
import { PROVIDERS } from "./providers";

export const LLM_SFX_KEYS = [
  "sfx_slicer_pass",
  "sfx_stepper_loop",
  "sfx_plate_snap_sharp",
  "sfx_tree_support_crush",
  "sfx_action_flick",
  "sfx_verdict_boost",
] as const;

export const SYSTEM_PROMPT = `You are an elite short-form 3D printing content producer.
Analyze the provided 3D model metadata (title, tags, category).
Generate a dynamic 22-26 second video storyboard structured for a high-retention video.
You MUST return a JSON payload with:
1. 3 Viral Hook Titles (High curiosity/controversy).
2. Timeline Array: Ordered sequence of segments with exact durations in milliseconds.
3. Mapped SFX Keys matching: [${LLM_SFX_KEYS.join(", ")}].
4. Dual contingency instructions: Actions for PASS (perfect print) vs FAIL (spaghetti / print detachment).
5. Optimized viral social metadata (caption, hashtags).

Timeline rules:
- The first block is always "hook_gacha": the recorded roulette spin that reveals the model. Keep its durationMs as given.
- Allowed block types: ${TIMELINE_BLOCK_TYPES.join(", ")}.
- All durationMs values together sum to 22000-26000.
- Each sfx startOffsetMs is relative to the start of its own block and falls inside it.
- onScreenText is a punchy overlay of at most 6 words, or "" for none.
- visualDirection tells the creator exactly what to film for that block.
- affiliateSlots: 2-3 products a viewer of this print might buy (filament, tools, printer parts), each with a marketplace search phrase.`;

const str = { type: "string" } as const;
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

// Every field required + no extra properties keeps this valid for OpenAI strict mode as well.
export const STORYBOARD_SCHEMA = obj({
  hookTitles: { type: "array", items: str },
  hookNarrative: str,
  timeline: {
    type: "array",
    items: obj({
      type: { type: "string", enum: [...TIMELINE_BLOCK_TYPES] },
      label: str,
      durationMs: { type: "integer" },
      visualDirection: str,
      onScreenText: str,
      sfx: {
        type: "array",
        items: obj({
          sfxId: { type: "string", enum: [...LLM_SFX_KEYS] },
          startOffsetMs: { type: "integer" },
          volume: { type: "number" },
        }),
      },
    }),
  },
  contingency: obj({ pass: str, fail: str }),
  captionText: str,
  hashtags: { type: "array", items: str },
  affiliateSlots: { type: "array", items: obj({ category: str, suggestedSearch: str }) },
});

export interface DirectorResult {
  timeline: TimelineNode[];
  script: ProjectScript;
}

const TARGET_MS = 24000;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (v: unknown, fallback: number) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

export function cue(sfxId: string, offsetMs: number, bank: Record<string, SfxEntry>, volume = 1): AudioAssignment {
  return {
    sfxId,
    assetPath: bank[sfxId]?.path ?? "",
    startOffsetMicroseconds: Math.round(offsetMs * 1000),
    durationMicroseconds: bank[sfxId]?.durationMicroseconds ?? 0,
    volume,
  };
}

/**
 * Turns provider output into a valid storyboard: unknown block types and SFX are
 * dropped, numbers are clamped, the hook is pinned first at `hookMs`, and the total is
 * rescaled into the 22-26s window. Throws only when there is no usable timeline at all.
 */
export function normalizeDirectorOutput(raw: unknown, bank: Record<string, SfxEntry>, hookMs: number): DirectorResult {
  const data = rec(typeof raw === "string" ? JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, "")) : raw);

  let blocks = list(data.timeline)
    .map(rec)
    .filter((b) => TIMELINE_BLOCK_TYPES.includes(b.type as TimelineBlockType))
    .map((b) => ({
      type: b.type as TimelineBlockType,
      label: text(b.label) || String(b.type).replace(/_/g, " "),
      durationMs: Math.round(clamp(num(b.durationMs, 3000), 500, 15000)),
      visualDirection: text(b.visualDirection),
      onScreenText: text(b.onScreenText) || undefined,
      sfx: list(b.sfx)
        .map(rec)
        .filter((s) => typeof s.sfxId === "string" && s.sfxId in bank)
        .map((s) => ({ sfxId: s.sfxId as string, offsetMs: num(s.startOffsetMs, 0), volume: clamp(num(s.volume, 1), 0, 1) })),
    }));
  if (!blocks.some((b) => b.type !== "hook_gacha")) throw new Error("The LLM returned no usable timeline blocks.");

  const hook = blocks.find((b) => b.type === "hook_gacha") ?? {
    type: "hook_gacha" as const,
    label: "Gacha spin",
    visualDirection: "Recorded roulette spin revealing today's print.",
    onScreenText: undefined,
    sfx: [],
    durationMs: hookMs,
  };
  hook.durationMs = hookMs;
  blocks = [hook, ...blocks.filter((b) => b.type !== "hook_gacha")];

  const total = blocks.reduce((s, b) => s + b.durationMs, 0);
  if (total < 22000 || total > 26000) {
    const scale = (TARGET_MS - hookMs) / (total - hookMs);
    for (const b of blocks.slice(1)) b.durationMs = Math.max(500, Math.round(b.durationMs * scale));
  }

  const timeline: TimelineNode[] = blocks.map((b) => ({
    blockId: crypto.randomUUID(),
    type: b.type,
    label: b.label,
    durationMs: b.durationMs,
    visualDirection: b.visualDirection,
    onScreenText: b.onScreenText,
    audioCues: b.sfx.map((s) => cue(s.sfxId, clamp(s.offsetMs, 0, b.durationMs - 1), bank, s.volume)),
  }));

  const contingency = rec(data.contingency);
  return {
    timeline,
    script: {
      hookTitles: list(data.hookTitles).map(text).filter(Boolean).slice(0, 3),
      hookNarrative: text(data.hookNarrative),
      captionText: text(data.captionText),
      hashtags: list(data.hashtags)
        .map((h) => text(h).replace(/\s+/g, ""))
        .filter(Boolean)
        .map((h) => (h.startsWith("#") ? h : `#${h}`)),
      affiliateSlots: list(data.affiliateSlots)
        .map(rec)
        .map((a) => ({ category: text(a.category), suggestedSearch: text(a.suggestedSearch) }))
        .filter((a) => a.category && a.suggestedSearch),
      contingency: { pass: text(contingency.pass), fail: text(contingency.fail) },
    },
  };
}

export interface DirectorRequest {
  provider: LlmProvider;
  apiKey: string;
  modelId: string;
  model: ModelSource;
  category: string;
  hookMs: number;
  bank: Record<string, SfxEntry>;
  extraInstructions?: string;
}

export async function generateStoryboard(r: DirectorRequest): Promise<DirectorResult> {
  const metadata = {
    title: r.model.title,
    designer: r.model.designer,
    platform: r.model.platform,
    tags: r.model.tags,
    category: r.category,
    hookGachaDurationMs: r.hookMs,
  };
  const user = [`3D model metadata:\n${JSON.stringify(metadata, null, 2)}`, r.extraInstructions?.trim()]
    .filter(Boolean)
    .join("\n\nCreator notes:\n");
  const raw = await PROVIDERS[r.provider]({
    system: SYSTEM_PROMPT,
    user,
    schema: STORYBOARD_SCHEMA,
    apiKey: r.apiKey,
    model: r.modelId,
  });
  return normalizeDirectorOutput(raw, r.bank, r.hookMs);
}
