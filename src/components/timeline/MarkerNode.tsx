import clsx from "clsx";
import { Minus, Plus } from "lucide-react";
import type { TimelineBlockType, TimelineNode } from "../../types";

export const BLOCK_COLORS: Record<TimelineBlockType, string> = {
  hook_gacha: "bg-orange-600",
  slicer_preview: "bg-sky-600",
  timelapse_print: "bg-violet-600",
  plate_snap_asmr: "bg-emerald-600",
  support_peel_asmr: "bg-teal-600",
  mechanical_test: "bg-amber-600",
  verdict_outro: "bg-pink-600",
};

interface Props {
  block: TimelineNode;
  widthPct: number;
  selected: boolean;
  onSelect: () => void;
  onNudge: (deltaMs: number) => void;
}

export function MarkerNode({ block, widthPct, selected, onSelect, onNudge }: Props) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      style={{ width: `${widthPct}%` }}
      className={clsx(
        "group relative flex min-w-0 cursor-pointer flex-col justify-between overflow-hidden rounded-md p-1.5 text-left",
        BLOCK_COLORS[block.type],
        selected ? "ring-2 ring-white" : "opacity-80 hover:opacity-100",
      )}
    >
      <span className="truncate text-xs font-semibold">{block.label}</span>
      <div className="flex items-center justify-between gap-1">
        <span className="text-xs tabular-nums">{(block.durationMs / 1000).toFixed(1)}s</span>
        <span className="hidden gap-0.5 group-hover:flex">
          {[-500, 500].map((d) => (
            <button
              key={d}
              title={`${d > 0 ? "+" : ""}${d / 1000}s`}
              className="rounded bg-black/30 p-0.5 hover:bg-black/50"
              onClick={(e) => {
                e.stopPropagation();
                onNudge(d);
              }}
            >
              {d < 0 ? <Minus className="size-3" /> : <Plus className="size-3" />}
            </button>
          ))}
        </span>
      </div>
    </div>
  );
}
