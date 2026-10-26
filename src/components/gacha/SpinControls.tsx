import { Dices, Loader2, RefreshCw } from "lucide-react";
import { useGachaStore } from "../../store/useGachaStore";
import type { PlatformType } from "../../types";

const PLATFORMS: PlatformType[] = ["printables", "makerworld", "thingiverse"];
const CATEGORIES = ["print in place", "articulated", "fidget", "flexi", "desk organizer", "cable management", "planter"];

export function SpinControls() {
  const g = useGachaStore();
  return (
    <div className="card space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label>
          <span className="label">Platform</span>
          <select className="input" value={g.platform} onChange={(e) => g.setPlatform(e.target.value as PlatformType)}>
            {PLATFORMS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Category / search</span>
          <input className="input" list="gacha-categories" value={g.category} onChange={(e) => g.setCategory(e.target.value)} />
          <datalist id="gacha-categories">
            {CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button className="btn" disabled={g.loading || g.spinning} onClick={() => void g.loadPool()}>
          {g.loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          Load model pool
        </button>
        <span className="text-xs text-zinc-400">
          {g.pool.length ? `${g.pool.length} models · ${g.source === "cache" ? "offline cache" : "live"}` : "No pool loaded"}
        </span>
      </div>
      {g.notice && <p className="rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-300">Live fetch failed, spinning the cache: {g.notice}</p>}
      {g.error && <p className="rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-300">{g.error}</p>}
      <button className="btn btn-primary w-full justify-center py-3 text-lg" disabled={!g.pool.length || g.spinning} onClick={g.requestSpin}>
        {g.spinning ? <Loader2 className="size-5 animate-spin" /> : <Dices className="size-5" />}
        {g.spinning ? "Spinning & recording…" : "SPIN"}
      </button>
    </div>
  );
}
