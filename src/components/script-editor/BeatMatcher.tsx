import { convertFileSrc } from "@tauri-apps/api/core";
import { Play, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useProjectStore } from "../../store/useProjectStore";
import { TIMELINE_BLOCK_TYPES, type TimelineBlockType } from "../../types";

export const previewSfx = (path: string) => void new Audio(convertFileSrc(path)).play();

/** Editor for the selected block: one-click duration overrides and SFX remapping. */
export function BeatMatcher() {
  const block = useProjectStore((s) => s.manifest?.timeline.find((b) => b.blockId === s.selectedBlockId));
  const bank = useProjectStore((s) => s.bank);
  const overrides = useProjectStore((s) => s.overrides);
  const { updateBlock, removeBlock, updateCue, addCue, removeCue } = useProjectStore.getState();
  const [newSfx, setNewSfx] = useState("sfx_action_flick");

  if (!block) return <div className="card text-sm text-zinc-400">Select a block on the storyboard to edit its timing and sound.</div>;
  const id = block.blockId;
  const sfxIds = Object.keys(bank);

  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Block</h3>
        <button className="btn px-2" title="Remove block" onClick={() => removeBlock(id)}>
          <Trash2 className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="col-span-2">
          <span className="label">Label</span>
          <input className="input" value={block.label} onChange={(e) => updateBlock(id, { label: e.target.value })} />
        </label>
        <label>
          <span className="label">Duration (ms)</span>
          <input
            className="input tabular-nums"
            type="number"
            step={100}
            min={500}
            value={block.durationMs}
            onChange={(e) => updateBlock(id, { durationMs: Math.max(500, Number(e.target.value) || 500) })}
          />
        </label>
        <label className="col-span-3">
          <span className="label">Block type</span>
          <select className="input" value={block.type} onChange={(e) => updateBlock(id, { type: e.target.value as TimelineBlockType })}>
            {TIMELINE_BLOCK_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="col-span-3">
          <span className="label">Visual direction</span>
          <textarea className="input h-16 resize-y" value={block.visualDirection} onChange={(e) => updateBlock(id, { visualDirection: e.target.value })} />
        </label>
        <label className="col-span-3">
          <span className="label">On-screen text</span>
          <input className="input" value={block.onScreenText ?? ""} onChange={(e) => updateBlock(id, { onScreenText: e.target.value })} />
        </label>
      </div>

      <div>
        <span className="label">SFX cues</span>
        <div className="space-y-1.5">
          {block.audioCues.map((c, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <select className="input flex-1" value={c.sfxId} onChange={(e) => updateCue(id, i, { sfxId: e.target.value })}>
                {sfxIds.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <input
                className="input w-20 tabular-nums"
                type="number"
                step={50}
                title="Offset from block start (ms)"
                value={c.startOffsetMicroseconds / 1000}
                onChange={(e) =>
                  updateCue(id, i, { startOffsetMicroseconds: Math.min(block.durationMs, Math.max(0, Number(e.target.value) || 0)) * 1000 })
                }
              />
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                title={`Volume ${Math.round(c.volume * 100)}%`}
                className="w-16 accent-orange-500"
                value={c.volume}
                onChange={(e) => updateCue(id, i, { volume: Number(e.target.value) })}
              />
              <button className="btn px-1.5" title="Preview" onClick={() => previewSfx(overrides[c.sfxId] ?? bank[c.sfxId]?.path ?? c.assetPath)}>
                <Play className="size-3.5" />
              </button>
              <button className="btn px-1.5" title="Remove cue" onClick={() => removeCue(id, i)}>
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-1.5">
          <select className="input flex-1" value={newSfx} onChange={(e) => setNewSfx(e.target.value)}>
            {sfxIds.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <button className="btn" onClick={() => addCue(id, newSfx)}>
            <Plus className="size-4" /> Add SFX
          </button>
        </div>
      </div>
    </div>
  );
}
