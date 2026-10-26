import clsx from "clsx";
import { totalMs } from "../../services/project";
import { useProjectStore } from "../../store/useProjectStore";
import type { TimelineNode } from "../../types";
import { AudioSyncViewer } from "./AudioSyncViewer";
import { MarkerNode } from "./MarkerNode";

const EMPTY: TimelineNode[] = [];

export function StoryboardTrack() {
  const timeline = useProjectStore((s) => s.manifest?.timeline ?? EMPTY);
  const selected = useProjectStore((s) => s.selectedBlockId);
  const { selectBlock, updateBlock } = useProjectStore.getState();
  const total = totalMs(timeline);
  const inRange = total >= 22000 && total <= 26000;

  return (
    <section className="card space-y-3">
      <header className="flex items-baseline justify-between">
        <h2 className="font-semibold">Storyboard</h2>
        <span className={clsx("text-sm tabular-nums", inRange ? "text-emerald-400" : "text-amber-400")}>
          {(total / 1000).toFixed(1)}s · target 22–26s
        </span>
      </header>
      <div className="flex h-20 gap-1">
        {timeline.map((b) => (
          <MarkerNode
            key={b.blockId}
            block={b}
            widthPct={(b.durationMs / total) * 100}
            selected={b.blockId === selected}
            onSelect={() => selectBlock(b.blockId)}
            onNudge={(d) => updateBlock(b.blockId, { durationMs: Math.max(500, b.durationMs + d) })}
          />
        ))}
      </div>
      <AudioSyncViewer />
    </section>
  );
}
