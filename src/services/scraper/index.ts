import type { ModelSource, PlatformType } from "../../types";
import { cacheModels, loadCachedModels } from "../db";
import { fetchCuratedModels } from "../tauriBridge";

export interface ModelPool {
  models: ModelSource[];
  source: "live" | "cache";
  /** Why the live fetch failed when serving from cache. */
  notice?: string;
}

// Parsing and HTTP live in Rust (src-tauri/src/commands/scraper.rs); this layer only
// adds the SQLite cache so rate limits and Cloudflare blocks still leave a spinnable pool.
export async function discoverModels(platform: PlatformType, category: string): Promise<ModelPool> {
  try {
    const models = await fetchCuratedModels(platform, category);
    await cacheModels(category, models);
    return { models, source: "live" };
  } catch (e) {
    const models = await loadCachedModels(platform, category);
    if (!models.length) throw new Error(`${e} — and the local model cache is still empty.`);
    return { models, source: "cache", notice: String(e) };
  }
}
