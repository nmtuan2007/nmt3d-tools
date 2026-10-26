import Database from "@tauri-apps/plugin-sql";
import type { ModelSource, PlatformType, ProjectManifest } from "../types";

// Schema lives in the Rust migrations (src-tauri/src/lib.rs).
let db: Promise<Database> | undefined;
const conn = () => (db ??= Database.load("sqlite:nmt3d.db"));

export async function cacheModels(category: string, models: ModelSource[]) {
  const d = await conn();
  const now = new Date().toISOString();
  for (const m of models) {
    await d.execute(
      `INSERT INTO model_cache (platform, model_id, category, data, fetched_at) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (platform, model_id) DO UPDATE SET category = $3, data = $4, fetched_at = $5`,
      [m.platform, m.modelId, category, JSON.stringify(m), now],
    );
  }
}

/** Same platform and category first, but any cached model beats an empty wheel (MakerWorld rarely gets past Cloudflare). */
export async function loadCachedModels(platform: PlatformType, category: string): Promise<ModelSource[]> {
  const rows = await (await conn()).select<{ data: string }[]>(
    `SELECT data FROM model_cache ORDER BY (platform = $1) DESC, (category = $2) DESC, fetched_at DESC LIMIT 40`,
    [platform, category],
  );
  return rows.map((r) => JSON.parse(r.data));
}

export async function saveRun(manifest: ProjectManifest) {
  await (await conn()).execute(
    `INSERT OR REPLACE INTO runs (project_id, project_dir, model_title, manifest, exported_at) VALUES ($1, $2, $3, $4, $5)`,
    [manifest.projectId, manifest.exportPaths.rootDirectory, manifest.model.title, JSON.stringify(manifest), new Date().toISOString()],
  );
}

export interface RunRow {
  project_id: string;
  project_dir: string;
  model_title: string;
  exported_at: string;
}

export async function listRuns(): Promise<RunRow[]> {
  return (await conn()).select<RunRow[]>(
    "SELECT project_id, project_dir, model_title, exported_at FROM runs ORDER BY exported_at DESC LIMIT 20",
  );
}

export async function loadSfxMappings(): Promise<Record<string, string>> {
  const rows = await (await conn()).select<{ sfx_id: string; asset_path: string }[]>("SELECT sfx_id, asset_path FROM sfx_mappings");
  return Object.fromEntries(rows.map((r) => [r.sfx_id, r.asset_path]));
}

export async function setSfxMapping(sfxId: string, assetPath: string | null) {
  const d = await conn();
  if (assetPath) await d.execute("INSERT OR REPLACE INTO sfx_mappings (sfx_id, asset_path) VALUES ($1, $2)", [sfxId, assetPath]);
  else await d.execute("DELETE FROM sfx_mappings WHERE sfx_id = $1", [sfxId]);
}
