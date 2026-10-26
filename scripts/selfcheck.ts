// Assertions for the frontend's pure logic. Run: npm run check
import assert from "node:assert/strict";
import { SPIN_MS, sliceAt, spinEase, targetRotation } from "../src/components/gacha/spinMath";
import { STORYBOARD_SCHEMA, normalizeDirectorOutput } from "../src/services/api/llmDirector";
import { defaultTimeline, newProject, slugify, totalMs } from "../src/services/project";
import type { ModelSource, SfxEntry } from "../src/types";

// Spin easing: CSS cubic-bezier(0.15, 0.9, 0.2, 1.0) is monotonic, front-loaded, and ends exactly.
assert.equal(spinEase(0), 0);
assert.equal(spinEase(1), 1);
assert.ok(spinEase(0.25) > 0.75, "most of the travel happens early");
for (let x = 0; x < 1; x += 0.01) assert.ok(spinEase(x + 0.01) >= spinEase(x), "easing must not run backwards");
assert.equal(SPIN_MS, 3200);

// The wheel always stops with the chosen slice under the pointer.
for (const count of [1, 5, 12]) for (let i = 0; i < count; i++) assert.equal(sliceAt(targetRotation(i, count, 8), count), i);

const bank: Record<string, SfxEntry> = Object.fromEntries(
  ["sfx_slicer_pass", "sfx_stepper_loop", "sfx_plate_snap_sharp", "sfx_tree_support_crush", "sfx_action_flick", "sfx_verdict_boost"].map((id) => [
    id,
    { id, category: "x", path: `/bank/${id}.wav`, durationMicroseconds: 500_000 },
  ]),
);

// A slightly-off LLM reply still becomes a valid storyboard.
const messy = "```json\n" + JSON.stringify({
  hookTitles: ["a", "b", "c", "d"],
  hookNarrative: "n",
  timeline: [
    { type: "slicer_preview", label: "Slice", durationMs: "4000", visualDirection: "v", onScreenText: "", sfx: [{ sfxId: "sfx_slicer_pass", startOffsetMs: 9999, volume: 3 }] },
    { type: "not_a_block", label: "x", durationMs: 1000, sfx: [] },
    { type: "plate_snap_asmr", label: "Snap", durationMs: 60000, sfx: [{ sfxId: "sfx_unknown", startOffsetMs: 0, volume: 1 }] },
    { type: "hook_gacha", label: "Spin", durationMs: 1, sfx: [] },
  ],
  contingency: { pass: "p", fail: "f" },
  captionText: "c",
  hashtags: ["3dprinting", "#fyp", "bad tag"],
  affiliateSlots: [{ category: "Filament", suggestedSearch: "silk pla" }, { category: "", suggestedSearch: "x" }],
}) + "\n```";
const r = normalizeDirectorOutput(messy, bank, 3800);
assert.deepEqual(r.timeline.map((b) => b.type), ["hook_gacha", "slicer_preview", "plate_snap_asmr"]);
assert.equal(r.timeline[0].durationMs, 3800, "hook keeps the recording length");
const total = totalMs(r.timeline);
assert.ok(total >= 22000 && total <= 26000, `total ${total} rescaled into 22-26s`);
const snap = r.timeline[1].audioCues[0];
assert.equal(snap.sfxId, "sfx_slicer_pass");
assert.ok(snap.startOffsetMicroseconds < r.timeline[1].durationMs * 1000, "cue clamped inside its block");
assert.equal(snap.volume, 1);
assert.equal(snap.assetPath, "/bank/sfx_slicer_pass.wav");
assert.equal(r.timeline[2].audioCues.length, 0, "unknown SFX dropped");
assert.deepEqual(r.script.hookTitles, ["a", "b", "c"]);
assert.deepEqual(r.script.hashtags, ["#3dprinting", "#fyp", "#badtag"]);
assert.equal(r.script.affiliateSlots.length, 1);
assert.throws(() => normalizeDirectorOutput({ timeline: [] }, bank, 3800));

// The schema stays OpenAI-strict: every object lists all its properties as required.
const walk = (s: Record<string, any>): void => {
  if (s.type === "object") {
    assert.equal(s.additionalProperties, false);
    assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort());
    Object.values(s.properties).forEach((p) => walk(p as Record<string, any>));
  }
  if (s.type === "array") walk(s.items);
};
walk(STORYBOARD_SCHEMA);

// Project naming follows PROJECT_{DATE}_{MODEL_SLUG}.
assert.equal(slugify("Đồ chơi: Fidget Cube v2!!"), "do-choi-fidget-cube-v2");
const model: ModelSource = { platform: "printables", modelId: "1", title: "Fidget Cube", designer: "d", sourceUrl: "", thumbnailUrl: "", tags: [] };
const p = newProject(model, "C:\\Users\\me\\Videos\\", new Date(2026, 9, 24));
assert.equal(p.projectId, "PROJECT_20261024_fidget-cube");
assert.equal(p.exportPaths.screenRecordFile, "C:\\Users\\me\\Videos\\PROJECT_20261024_fidget-cube\\01_screen_record\\gacha_intro.mp4");
const starter = totalMs(defaultTimeline(3800, bank));
assert.ok(starter >= 22000 && starter <= 26000);

console.log("selfcheck: all assertions passed");
