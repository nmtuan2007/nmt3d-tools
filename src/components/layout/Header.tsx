import { CheckCircle2, Loader2, PackageOpen } from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";

export function Header() {
  const manifest = useProjectStore((s) => s.manifest);
  const { exportStatus, exportError, exportReport, exportProject } = useProjectStore();

  return (
    <header className="space-y-2 border-b border-zinc-800 px-6 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold">{manifest?.projectName ?? "No project yet"}</h1>
          <p className="truncate text-xs text-zinc-500">{manifest?.exportPaths.rootDirectory ?? "Spin the gacha wheel to start a project."}</p>
        </div>
        <button className="btn btn-primary shrink-0" disabled={!manifest || exportStatus === "running"} onClick={() => void exportProject()}>
          {exportStatus === "running" ? <Loader2 className="size-4 animate-spin" /> : <PackageOpen className="size-4" />}
          Assemble & Export Project
        </button>
      </div>
      {exportError && <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-300">{exportError}</p>}
      {exportReport && (
        <div className="rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          <p className="flex items-center gap-1 font-medium">
            <CheckCircle2 className="size-3.5" /> Exported {exportReport.sfxFiles.length} SFX and a CapCut draft to:
          </p>
          <ul className="ml-5 list-disc select-all">
            {exportReport.draftDirectories.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
          {exportReport.warnings.map((w) => (
            <p key={w} className="text-amber-300">
              {w}
            </p>
          ))}
        </div>
      )}
    </header>
  );
}
