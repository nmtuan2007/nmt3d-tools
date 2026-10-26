import clsx from "clsx";
import { Clapperboard, Dices, Settings, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { listRuns, type RunRow } from "../../services/db";
import { useProjectStore } from "../../store/useProjectStore";

export type View = "gacha" | "storyboard" | "settings";

const NAV: Array<{ view: View; label: string; icon: LucideIcon }> = [
  { view: "gacha", label: "Gacha", icon: Dices },
  { view: "storyboard", label: "Storyboard", icon: Clapperboard },
  { view: "settings", label: "Settings", icon: Settings },
];

export function Sidebar({ view, onNavigate }: { view: View; onNavigate: (view: View) => void }) {
  const exportStatus = useProjectStore((s) => s.exportStatus);
  const [runs, setRuns] = useState<RunRow[]>([]);
  useEffect(() => {
    listRuns().then(setRuns, () => setRuns([]));
  }, [exportStatus]);

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-zinc-800 bg-zinc-950 p-3">
      <div className="mb-6 px-2 text-sm font-bold tracking-wide text-orange-400">nmt3d-tools</div>
      <nav className="space-y-1">
        {NAV.map(({ view: v, label, icon: Icon }) => (
          <button
            key={v}
            onClick={() => onNavigate(v)}
            className={clsx(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm",
              v === view ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200",
            )}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </nav>
      {runs.length > 0 && (
        <div className="mt-8 min-h-0 flex-1 overflow-y-auto">
          <p className="label px-2">Past runs</p>
          <ul className="space-y-1">
            {runs.map((r) => (
              <li key={r.project_id} className="rounded px-2 py-1 text-xs text-zinc-400" title={r.project_dir}>
                <p className="truncate text-zinc-300">{r.model_title}</p>
                <p>{new Date(r.exported_at).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
