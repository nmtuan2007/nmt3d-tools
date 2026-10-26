import { useProjectStore } from "../../store/useProjectStore";

export function ScriptCard() {
  const script = useProjectStore((s) => s.manifest?.script);
  const updateScript = useProjectStore((s) => s.updateScript);
  if (!script) return null;

  return (
    <div className="card space-y-3">
      <h3 className="font-semibold">Script & social</h3>
      <div>
        <span className="label">Hook titles</span>
        <div className="space-y-1.5">
          {[0, 1, 2].map((i) => (
            <input
              key={i}
              className="input"
              placeholder={`Hook title ${i + 1}`}
              value={script.hookTitles[i] ?? ""}
              onChange={(e) => {
                const hookTitles = [...script.hookTitles];
                hookTitles[i] = e.target.value;
                updateScript({ hookTitles });
              }}
            />
          ))}
        </div>
      </div>
      <label className="block">
        <span className="label">Hook narrative</span>
        <textarea className="input h-16 resize-y" value={script.hookNarrative} onChange={(e) => updateScript({ hookNarrative: e.target.value })} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label>
          <span className="label text-emerald-400">If it prints clean (PASS)</span>
          <textarea
            className="input h-20 resize-y"
            value={script.contingency.pass}
            onChange={(e) => updateScript({ contingency: { ...script.contingency, pass: e.target.value } })}
          />
        </label>
        <label>
          <span className="label text-red-400">If it fails (FAIL)</span>
          <textarea
            className="input h-20 resize-y"
            value={script.contingency.fail}
            onChange={(e) => updateScript({ contingency: { ...script.contingency, fail: e.target.value } })}
          />
        </label>
      </div>
      <label className="block">
        <span className="label">Caption</span>
        <textarea className="input h-16 resize-y" value={script.captionText} onChange={(e) => updateScript({ captionText: e.target.value })} />
      </label>
      <label className="block">
        <span className="label">Hashtags (space separated)</span>
        <input
          key={script.hashtags.join(" ")}
          className="input"
          defaultValue={script.hashtags.join(" ")}
          onBlur={(e) => updateScript({ hashtags: e.target.value.split(/\s+/).filter(Boolean) })}
        />
      </label>
      {script.affiliateSlots.length > 0 && (
        <div>
          <span className="label">Affiliate slots</span>
          <ul className="space-y-0.5 text-sm text-zinc-300">
            {script.affiliateSlots.map((a, i) => (
              <li key={i}>
                <span className="text-zinc-500">{a.category}:</span> {a.suggestedSearch}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
