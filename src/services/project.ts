import type { ModelSource, ProjectManifest, SfxEntry, TimelineNode } from "../types";
import { cue } from "./api/llmDirector";

export function slugify(s: string): string {
  const slug = s
    .replace(/đ/gi, "d") // stroke letter, NFKD leaves it whole
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return slug || "model";
}

const pad = (n: number) => String(n).padStart(2, "0");

export function newProject(model: ModelSource, outputDir: string, now = new Date()): ProjectManifest {
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const projectId = `PROJECT_${date}_${slugify(model.title)}`;
  const sep = outputDir.includes("\\") ? "\\" : "/";
  const root = `${outputDir.replace(/[\\/]+$/, "")}${sep}${projectId}`;
  return {
    projectId,
    projectName: model.title,
    createdAt: now.toISOString(),
    model,
    timeline: [],
    script: {
      hookNarrative: "",
      captionText: "",
      hashtags: [],
      affiliateSlots: [],
      hookTitles: [],
      contingency: { pass: "", fail: "" },
    },
    exportPaths: {
      rootDirectory: root,
      screenRecordFile: `${root}${sep}01_screen_record${sep}gacha_intro.mp4`,
      capcutDraftDirectory: `${root}${sep}capcut_draft`,
    },
  };
}

/** Starter storyboard used until (or instead of) an LLM pass; ~24s like the director's target. */
export function defaultTimeline(hookMs: number, bank: Record<string, SfxEntry>): TimelineNode[] {
  const block = (type: TimelineNode["type"], label: string, durationMs: number, visualDirection: string, cues: TimelineNode["audioCues"], onScreenText?: string): TimelineNode => ({
    blockId: crypto.randomUUID(),
    type,
    label,
    durationMs,
    visualDirection,
    audioCues: cues,
    onScreenText,
  });
  return [
    block("hook_gacha", "Gacha spin", hookMs, "Recorded roulette spin revealing today's print.", [], "The wheel picked THIS"),
    block("slicer_preview", "Slicer preview", 3000, "Screen capture of the slicer layer preview scrubbing up.", [cue("sfx_slicer_pass", 200, bank)]),
    block("timelapse_print", "Timelapse", 5000, "Nozzle-cam or front timelapse of the full print.", [cue("sfx_stepper_loop", 0, bank, 0.6)]),
    block("plate_snap_asmr", "Plate snap", 3000, "Close-up: flex the build plate until the part pops off.", [cue("sfx_plate_snap_sharp", 1200, bank)]),
    block("support_peel_asmr", "Support peel", 3000, "Macro shot peeling tree supports in one pull.", [cue("sfx_tree_support_crush", 600, bank)]),
    block("mechanical_test", "Function test", 4000, "Show the mechanism working: flick, spin, or snap it.", [cue("sfx_action_flick", 800, bank)]),
    block("verdict_outro", "Verdict", 3000, "Hold the part to camera and give the verdict.", [cue("sfx_verdict_boost", 300, bank)], "Worth the filament?"),
  ];
}

export const totalMs = (timeline: TimelineNode[]) => timeline.reduce((s, b) => s + b.durationMs, 0);

/** Absolute start time of each block, in ms. */
export function blockStarts(timeline: TimelineNode[]): number[] {
  let t = 0;
  return timeline.map((b) => {
    const start = t;
    t += b.durationMs;
    return start;
  });
}
