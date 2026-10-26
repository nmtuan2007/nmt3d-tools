use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};

/// Bundled bank layout: `global_sfx/{category}/{sfx_id}.wav`.
pub fn sfx_root(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .resource_dir()
        .map(|d| d.join("assets").join("global_sfx"))
        .map_err(|e| e.to_string())
}

/// Ids double as file names, so anything outside `[a-z0-9_]` is rejected rather than joined into a path.
pub fn is_valid_sfx_id(id: &str) -> bool {
    !id.is_empty() && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
}

pub fn find_sfx(root: &Path, id: &str) -> Option<PathBuf> {
    if !is_valid_sfx_id(id) {
        return None;
    }
    std::fs::read_dir(root)
        .ok()?
        .flatten()
        .flat_map(|cat| ["wav", "mp3"].map(|ext| cat.path().join(format!("{id}.{ext}"))))
        .find(|p| p.is_file())
}

/// Reads the RIFF header only as far as the `data` chunk size.
pub fn wav_duration_us(path: &Path) -> Option<i64> {
    let data = std::fs::read(path).ok()?;
    if data.len() < 12 || &data[0..4] != b"RIFF" || &data[8..12] != b"WAVE" {
        return None;
    }
    let (mut pos, mut byte_rate) = (12usize, 0i64);
    while pos + 8 <= data.len() {
        let size = u32::from_le_bytes(data[pos + 4..pos + 8].try_into().ok()?) as usize;
        let body = pos + 8;
        match &data[pos..pos + 4] {
            b"fmt " if body + 12 <= data.len() => {
                byte_rate = u32::from_le_bytes(data[body + 8..body + 12].try_into().ok()?) as i64;
            }
            b"data" if byte_rate > 0 => return Some(size as i64 * 1_000_000 / byte_rate),
            _ => {}
        }
        pos = body + size + (size & 1);
    }
    None
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SfxEntry {
    pub id: String,
    pub category: String,
    pub path: String,
    pub duration_microseconds: Option<i64>,
}

pub fn scan_bank(root: &Path) -> Vec<SfxEntry> {
    let mut out: Vec<SfxEntry> = std::fs::read_dir(root)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|cat| cat.path().is_dir())
        .flat_map(|cat| {
            let category = cat.file_name().to_string_lossy().into_owned();
            std::fs::read_dir(cat.path())
                .into_iter()
                .flatten()
                .flatten()
                .map(move |f| (category.clone(), f.path()))
        })
        .filter(|(_, p)| matches!(p.extension().and_then(|e| e.to_str()), Some("wav" | "mp3")))
        .map(|(category, p)| SfxEntry {
            id: p.file_stem().unwrap_or_default().to_string_lossy().into_owned(),
            category,
            duration_microseconds: wav_duration_us(&p),
            path: p.to_string_lossy().into_owned(),
        })
        .collect();
    out.sort_by(|a, b| (&a.category, &a.id).cmp(&(&b.category, &b.id)));
    out
}

#[tauri::command]
pub fn list_sfx(app: AppHandle) -> Result<Vec<SfxEntry>, String> {
    Ok(scan_bank(&sfx_root(&app)?))
}

#[cfg(test)]
pub mod tests {
    use super::*;

    pub fn bank() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("assets/global_sfx")
    }

    #[test]
    fn bank_has_every_semantic_id_with_a_duration() {
        let entries = scan_bank(&bank());
        for id in [
            "sfx_gacha_spin",
            "sfx_gacha_win",
            "sfx_slicer_pass",
            "sfx_stepper_loop",
            "sfx_plate_snap_sharp",
            "sfx_tree_support_crush",
            "sfx_action_flick",
            "sfx_verdict_boost",
        ] {
            let e = entries.iter().find(|e| e.id == id).unwrap_or_else(|| panic!("{id} missing"));
            assert!(e.duration_microseconds.unwrap() > 100_000, "{id} too short");
        }
        assert!(find_sfx(&bank(), "../sfx_gacha_win").is_none());
    }
}
