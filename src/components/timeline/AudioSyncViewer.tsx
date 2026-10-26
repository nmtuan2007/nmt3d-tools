import { blockStarts, totalMs } from "../../services/project";
import { useProjectStore } from "../../store/useProjectStore";
import type { TimelineNode } from "../../types";

const EMPTY: TimelineNode[] = [];

/** Where every SFX cue lands on the absolute timeline, as it will in the CapCut draft. */
export function AudioSyncViewer() {
  const timeline = useProjectStore((s) => s.manifest?.timeline ?? EMPTY);
  const selectBlock = useProjectStore((s) => s.selectBlock);
  const total = totalMs(timeline);
  if (!total) return null;
  const starts = blockStarts(timeline);
  const pct = (ms: number) => `${(ms / total) * 100}%`;

  return (
    <div className="relative h-20 rounded-md border border-zinc-800 bg-zinc-950">
      {Array.from({ length: Math.floor(total / 1000) + 1 }, (_, s) => (
        <div key={s} className="absolute top-0 h-full border-l border-zinc-800" style={{ left: pct(s * 1000) }}>
          {s % 2 === 0 && <span className="ml-0.5 text-[10px] text-zinc-500">{s}s</span>}
        </div>
      ))}
      {timeline.flatMap((b, i) =>
        b.audioCues.map((c, j) => {
          const at = starts[i] + c.startOffsetMicroseconds / 1000;
          return (
            <button
              key={`${b.blockId}-${j}`}
              title={`${c.sfxId} @ ${(at / 1000).toFixed(2)}s`}
              onClick={() => selectBlock(b.blockId)}
              className="absolute h-6 truncate rounded bg-emerald-500/70 px-1 text-left text-[10px] text-black hover:bg-emerald-400"
              style={{ left: pct(at), width: `max(${pct(c.durationMicroseconds / 1000)}, 1.5rem)`, top: j % 2 ? 46 : 18 }}
            >
              {c.sfxId.replace(/^sfx_/, "")}
            </button>
          );
        }),
      )}
    </div>
  );
}
