import clsx from "clsx";
import { DEFAULT_MODELS } from "../../services/api/providers";
import { useConfigStore } from "../../store/useConfigStore";
import type { LlmProvider } from "../../types";

const LABELS: Record<LlmProvider, string> = { anthropic: "Anthropic Claude", openai: "OpenAI", gemini: "Google Gemini" };

export function APIConfig() {
  const c = useConfigStore();
  return (
    <section className="card space-y-3">
      <h2 className="font-semibold">LLM provider</h2>
      <div className="space-y-2">
        {(Object.keys(LABELS) as LlmProvider[]).map((p) => (
          <div key={p} className={clsx("grid grid-cols-[10rem_1fr_14rem] items-center gap-2 rounded-lg p-2", c.provider === p && "bg-zinc-800/60")}>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="provider" className="accent-orange-500" checked={c.provider === p} onChange={() => c.set({ provider: p })} />
              {LABELS[p]}
            </label>
            <input
              className="input"
              type="password"
              placeholder="API key"
              autoComplete="off"
              value={c.apiKeys[p]}
              onChange={(e) => c.setApiKey(p, e.target.value.trim())}
            />
            <input className="input" placeholder={DEFAULT_MODELS[p]} value={c.models[p]} onChange={(e) => c.setModel(p, e.target.value.trim())} />
          </div>
        ))}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-orange-500" checked={c.autoGenerate} onChange={(e) => c.set({ autoGenerate: e.target.checked })} />
        Generate the storyboard automatically after each spin
      </label>
      <p className="text-xs text-zinc-500">Keys are stored locally on this machine and sent only to the selected provider.</p>
    </section>
  );
}
