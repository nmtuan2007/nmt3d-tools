import { open } from "@tauri-apps/plugin-dialog";
import { exists } from "@tauri-apps/plugin-fs";
import { CheckCircle2, FolderOpen, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { defaultCapcutDir } from "../../services/tauriBridge";
import { useConfigStore } from "../../store/useConfigStore";

function DirField({ label, value, onChange, hint }: { label: string; value: string; onChange: (dir: string) => void; hint?: string }) {
  const [found, setFound] = useState<boolean>();
  useEffect(() => {
    if (value) exists(value).then(setFound, () => setFound(false));
  }, [value]);

  return (
    <label className="block">
      <span className="label">{label}</span>
      <div className="flex gap-2">
        <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
        <button
          className="btn"
          onClick={async (e) => {
            e.preventDefault();
            const dir = await open({ directory: true, defaultPath: value || undefined });
            if (typeof dir === "string") onChange(dir);
          }}
        >
          <FolderOpen className="size-4" /> Browse
        </button>
      </div>
      <span className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
        {found ? <CheckCircle2 className="size-3.5 text-emerald-400" /> : <XCircle className="size-3.5 text-amber-400" />}
        {found ? "Folder exists" : "Folder not found yet"}
        {hint && ` · ${hint}`}
      </span>
    </label>
  );
}

export function CapCutPathSelector() {
  const c = useConfigStore();
  return (
    <section className="card space-y-4">
      <h2 className="font-semibold">Export locations</h2>
      <DirField label="Project output folder" value={c.outputDir} onChange={(outputDir) => c.set({ outputDir })} hint="created on first spin" />
      <DirField
        label="CapCut drafts folder"
        value={c.capcutDir}
        onChange={(capcutDir) => c.set({ capcutDir })}
        hint="…/CapCut/User Data/Projects/com.lveditor.draft"
      />
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="accent-orange-500"
            checked={c.installToCapcut}
            onChange={(e) => c.set({ installToCapcut: e.target.checked })}
          />
          Also install each export into CapCut's drafts folder
        </label>
        <button className="btn" onClick={() => defaultCapcutDir().then((d) => d && c.set({ capcutDir: d }))}>
          Reset to default
        </button>
      </div>
      <p className="text-xs text-zinc-500">Restart CapCut Desktop after exporting so it rescans its drafts folder.</p>
    </section>
  );
}
