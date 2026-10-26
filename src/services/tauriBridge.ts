import { invoke } from "@tauri-apps/api/core";
import type { ModelSource, PlatformType, ProjectManifest, SfxEntry } from "../types";
import type { CapCutExportOptions, ExportReport } from "../types/capcut";

export const fetchCuratedModels = (platform: PlatformType, category: string) =>
  invoke<ModelSource[]>("fetch_curated_models", { platform, category });

/** Thumbnail bytes proxied through Rust so the roulette canvas stays origin-clean. */
export const fetchImage = (url: string) => invoke<ArrayBuffer>("fetch_image", { url });

/** Returns the path actually written (gacha_intro.mp4, or .webm when it can't be converted). */
export const saveRecordedClip = (projectDir: string, clip: Blob) =>
  clip.arrayBuffer().then((buf) =>
    invoke<string>("save_recorded_clip", new Uint8Array(buf), {
      headers: { "x-project-dir": encodeURIComponent(projectDir), "x-mime": clip.type },
    }),
  );

export const listSfx = () => invoke<SfxEntry[]>("list_sfx");

export const assembleProject = (manifest: ProjectManifest, options: CapCutExportOptions) =>
  invoke<ExportReport>("assemble_project", { manifest, options });

export const defaultCapcutDir = () => invoke<string | null>("default_capcut_dir");
