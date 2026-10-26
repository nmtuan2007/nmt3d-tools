import { open } from "@tauri-apps/plugin-dialog";
import { FileAudio, Play, RotateCcw } from "lucide-react";
import { useProjectStore } from "../../store/useProjectStore";
import { previewSfx } from "../script-editor/BeatMatcher";

export function GlobalSFXTable() {
  const bank = useProjectStore((s) => s.bank);
  const overrides = useProjectStore((s) => s.overrides);
  const setOverride = useProjectStore((s) => s.setOverride);

  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">Global sound bank</h2>
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase text-zinc-500">
          <tr>
            <th className="py-1">ID</th>
            <th>Category</th>
            <th>Length</th>
            <th>Source</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {Object.values(bank).map((e) => {
            const custom = overrides[e.id];
            return (
              <tr key={e.id} className="border-t border-zinc-800">
                <td className="py-1.5 font-mono text-xs">{e.id}</td>
                <td className="text-zinc-400">{e.category}</td>
                <td className="tabular-nums text-zinc-400">{e.durationMicroseconds ? `${(e.durationMicroseconds / 1e6).toFixed(2)}s` : "—"}</td>
                <td className="max-w-64 truncate text-xs text-zinc-400" title={custom ?? e.path}>
                  {custom ? <span className="text-orange-300">custom: {custom}</span> : "bundled"}
                </td>
                <td className="flex justify-end gap-1 py-1">
                  <button className="btn px-1.5" title="Preview" onClick={() => previewSfx(custom ?? e.path)}>
                    <Play className="size-3.5" />
                  </button>
                  <button
                    className="btn px-1.5"
                    title="Use my own WAV for this id"
                    onClick={async () => {
                      // ponytail: WAV only, because the CapCut draft needs the duration and only WAV headers are parsed.
                      const file = await open({ filters: [{ name: "WAV audio", extensions: ["wav"] }] });
                      if (typeof file === "string") await setOverride(e.id, file);
                    }}
                  >
                    <FileAudio className="size-3.5" />
                  </button>
                  {custom && (
                    <button className="btn px-1.5" title="Back to bundled sound" onClick={() => void setOverride(e.id, null)}>
                      <RotateCcw className="size-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
