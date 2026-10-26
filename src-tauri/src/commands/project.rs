use std::collections::HashMap;
use std::fmt::Write as _;
use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use super::audio::{find_sfx, is_valid_sfx_id, sfx_root};
use super::capcut::{self, MediaRef};
use super::scraper::download_to;
use crate::models::project_manifest::ProjectManifest;

const PROJECT_DIRS: [&str; 5] = ["01_screen_record", "02_model_assets", "03_audio_sfx", "04_footage_raw", "capcut_draft"];

/// Copies each sound into `03_audio_sfx/{id}.{ext}`. A user override wins over the bank;
/// any id that resolves to nothing fails the whole call so no draft references a missing file.
pub fn copy_sfx(
    bank: &Path,
    target_project_dir: &Path,
    sfx_ids: &[String],
    overrides: &HashMap<String, String>,
) -> Result<HashMap<String, PathBuf>, String> {
    let dest_dir = target_project_dir.join("03_audio_sfx");
    fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;
    let mut copied = HashMap::new();
    let mut missing = Vec::new();
    for id in sfx_ids {
        if copied.contains_key(id) || missing.contains(id) {
            continue;
        }
        let src = overrides
            .get(id)
            .map(PathBuf::from)
            .filter(|p| p.is_file() && is_valid_sfx_id(id))
            .or_else(|| find_sfx(bank, id));
        let Some(src) = src else {
            missing.push(id.clone());
            continue;
        };
        let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("wav");
        let dest = dest_dir.join(format!("{id}.{ext}"));
        fs::copy(&src, &dest).map_err(|e| format!("copy {}: {e}", src.display()))?;
        copied.insert(id.clone(), dest);
    }
    if !missing.is_empty() {
        return Err(format!("Not in the sound bank: {}", missing.join(", ")));
    }
    Ok(copied)
}

#[tauri::command]
pub fn resolve_and_copy_sfx(
    app: AppHandle,
    target_project_dir: PathBuf,
    sfx_ids: Vec<String>,
    overrides: Option<HashMap<String, String>>,
) -> Result<HashMap<String, PathBuf>, String> {
    copy_sfx(&sfx_root(&app)?, &target_project_dir, &sfx_ids, &overrides.unwrap_or_default())
}

#[derive(Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptions {
    pub recording_duration_ms: Option<i64>,
    pub thumbnail_width: Option<u32>,
    pub thumbnail_height: Option<u32>,
    /// When set, the draft is also written into CapCut's own drafts folder.
    pub capcut_drafts_dir: Option<String>,
    #[serde(default)]
    pub sfx_overrides: HashMap<String, String>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ExportReport {
    pub root_directory: String,
    pub draft_directories: Vec<String>,
    pub sfx_files: Vec<String>,
    pub warnings: Vec<String>,
}

#[tauri::command]
pub async fn assemble_project(
    app: AppHandle,
    manifest: ProjectManifest,
    options: ExportOptions,
) -> Result<ExportReport, String> {
    let root = PathBuf::from(&manifest.export_paths.root_directory);
    for d in PROJECT_DIRS {
        fs::create_dir_all(root.join(d)).map_err(|e| format!("create {d}: {e}"))?;
    }
    let mut warnings = Vec::new();

    let assets = root.join("02_model_assets");
    let metadata = serde_json::to_string_pretty(&manifest.model).map_err(|e| e.to_string())?;
    fs::write(assets.join("model_metadata.json"), metadata).map_err(|e| e.to_string())?;
    let placeholder = match download_to(&manifest.model.thumbnail_url, &assets, "thumbnail").await {
        Ok(path) => match (options.thumbnail_width, options.thumbnail_height) {
            (Some(width), Some(height)) => Some(MediaRef { path, duration_us: capcut::PHOTO_DURATION_US, width, height }),
            _ => None,
        },
        Err(e) => {
            warnings.push(format!("Thumbnail download failed ({e:#}); timeline blocks get text markers only."));
            None
        }
    };

    let sfx_ids: Vec<String> = manifest
        .timeline
        .iter()
        .flat_map(|b| b.audio_cues.iter().map(|c| c.sfx_id.clone()))
        .collect();
    let sfx = copy_sfx(&sfx_root(&app)?, &root, &sfx_ids, &options.sfx_overrides)?;

    let clip = PathBuf::from(&manifest.export_paths.screen_record_file);
    let intro = match options.recording_duration_ms {
        Some(ms) if clip.is_file() && ms > 0 => Some(MediaRef { path: clip, duration_us: ms * 1_000, width: 1080, height: 1920 }),
        _ => {
            warnings.push("No gacha recording found; the hook block uses the thumbnail placeholder.".into());
            None
        }
    };

    fs::write(root.join("script_plan.md"), script_plan_markdown(&manifest)).map_err(|e| e.to_string())?;

    let draft = capcut::build_draft(&manifest, intro.as_ref(), placeholder.as_ref(), &sfx)?;
    let mut draft_dirs = vec![root.join("capcut_draft")];
    if let Some(dir) = options.capcut_drafts_dir.filter(|d| !d.trim().is_empty()) {
        draft_dirs.push(Path::new(&dir).join(&manifest.project_id));
    }
    for dir in &draft_dirs {
        capcut::write_draft(dir, &manifest.project_id, &draft)?;
    }

    Ok(ExportReport {
        root_directory: root.to_string_lossy().into_owned(),
        draft_directories: draft_dirs.iter().map(|d| d.to_string_lossy().into_owned()).collect(),
        sfx_files: sfx.values().map(|p| p.to_string_lossy().into_owned()).collect(),
        warnings,
    })
}

fn cell(s: &str) -> String {
    s.replace('|', "\\|").replace('\n', " ")
}

pub fn script_plan_markdown(m: &ProjectManifest) -> String {
    let mut md = String::new();
    let s = &m.script;
    let total_ms: i64 = m.timeline.iter().map(|b| b.duration_ms).sum();
    let _ = writeln!(md, "# {}\n", m.project_name);
    let _ = writeln!(
        md,
        "**Model:** [{}]({}) by {} · created {}\n",
        m.model.title,
        m.model.source_url,
        m.model.designer,
        m.created_at.format("%Y-%m-%d %H:%M UTC")
    );
    if !s.hook_titles.is_empty() {
        let _ = writeln!(md, "## Hook titles\n");
        for (i, t) in s.hook_titles.iter().enumerate() {
            let _ = writeln!(md, "{}. {t}", i + 1);
        }
        md.push('\n');
    }
    let _ = writeln!(md, "## Hook narrative\n\n{}\n", s.hook_narrative);
    let _ = writeln!(md, "## Storyboard ({:.1}s)\n", total_ms as f64 / 1000.0);
    let _ = writeln!(md, "| # | Start | Duration | Block | Visual direction | On-screen text | SFX |");
    let _ = writeln!(md, "|---|---|---|---|---|---|---|");
    let mut start = 0;
    for (i, b) in m.timeline.iter().enumerate() {
        let sfx: Vec<String> = b
            .audio_cues
            .iter()
            .map(|c| format!("{} @+{:.2}s", c.sfx_id, c.start_offset_microseconds as f64 / 1e6))
            .collect();
        let _ = writeln!(
            md,
            "| {} | {:.1}s | {:.1}s | {} | {} | {} | {} |",
            i + 1,
            start as f64 / 1000.0,
            b.duration_ms as f64 / 1000.0,
            cell(&b.label),
            cell(&b.visual_direction),
            cell(b.on_screen_text.as_deref().unwrap_or("")),
            sfx.join(", ")
        );
        start += b.duration_ms;
    }
    let _ = writeln!(md, "\n## Contingency\n\n- **PASS:** {}\n- **FAIL:** {}\n", s.contingency.pass, s.contingency.fail);
    let _ = writeln!(md, "## Caption\n\n{}\n\n{}\n", s.caption_text, s.hashtags.join(" "));
    if !s.affiliate_slots.is_empty() {
        let _ = writeln!(md, "## Affiliate slots\n");
        for a in &s.affiliate_slots {
            let _ = writeln!(md, "- **{}:** {}", a.category, a.suggested_search);
        }
        md.push('\n');
    }
    let _ = writeln!(
        md,
        "## Footage checklist\n\n- Drop camera and timelapse clips into `04_footage_raw/`.\n- In CapCut, replace the thumbnail placeholders on Track 1 with that footage; SFX are already placed."
    );
    md
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::audio::tests::bank;

    #[test]
    fn copies_bank_sfx_and_rejects_unknown_ids() {
        let dir = std::env::temp_dir().join(format!("nmt3d-test-{}", uuid::Uuid::new_v4()));
        let ids = vec!["sfx_plate_snap_sharp".to_string(), "sfx_gacha_win".into(), "sfx_plate_snap_sharp".into()];
        let copied = copy_sfx(&bank(), &dir, &ids, &HashMap::new()).unwrap();
        assert_eq!(copied.len(), 2);
        assert!(dir.join("03_audio_sfx/sfx_gacha_win.wav").is_file());

        let err = copy_sfx(&bank(), &dir, &["sfx_nope".into()], &HashMap::new()).unwrap_err();
        assert!(err.contains("sfx_nope"));
        fs::remove_dir_all(dir).unwrap();
    }
}
