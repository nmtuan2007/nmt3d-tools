import { Loader2, Sparkles } from "lucide-react";
import { DEFAULT_MODELS } from "../../services/api/providers";
import { useConfigStore } from "../../store/useConfigStore";
import { useProjectStore } from "../../store/useProjectStore";

export function LlmPromptDrawer() {
  const provider = useConfigStore((s) => s.provider);
  const model = useConfigStore((s) => s.models[s.provider] || DEFAULT_MODELS[s.provider]);
  const hasKey = useConfigStore((s) => !!s.apiKeys[s.provider]);
  const { llmStatus, llmError, extraInstructions, setExtraInstructions, generate } = useProjectStore();
  const running = llmStatus === "running";

  return (
    <details className="card group" open>
      <summary className="flex cursor-pointer items-center justify-between font-semibold">
        <span className="flex items-center gap-2">
          <Sparkles className="size-4 text-orange-400" /> LLM production director
        </span>
        <span className="text-xs font-normal text-zinc-400">
          {provider} · {model}
        </span>
      </summary>
      <div className="mt-3 space-y-3">
        <label className="block">
          <span className="label">Creator notes (optional)</span>
          <textarea
            className="input h-16 resize-y"
            placeholder="e.g. printed in silk PLA on a Bambu A1, the hinge failed once"
            value={extraInstructions}
            onChange={(e) => setExtraInstructions(e.target.value)}
          />
        </label>
        <div className="flex items-center gap-3">
          <button className="btn btn-primary" disabled={running || !hasKey} onClick={() => void generate()}>
            {running ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {llmStatus === "done" ? "Regenerate storyboard" : "Generate storyboard"}
          </button>
          {!hasKey && <span className="text-xs text-amber-300">Add a {provider} API key in Settings.</span>}
          {llmStatus === "done" && <span className="text-xs text-emerald-400">Storyboard replaced with the director's cut.</span>}
        </div>
        {llmError && <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-300">{llmError}</p>}
      </div>
    </details>
  );
}
