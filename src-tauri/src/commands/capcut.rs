use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{Map, Value, json};

use super::audio::wav_duration_us;
use crate::models::capcut_draft::{CapCutDraftContent, CapCutSegment, CapCutTimerange, CapCutTrack, DraftMaterials};
use crate::models::project_manifest::ProjectManifest;
use crate::models::timeline::TimelineBlockType;
use crate::utils::paths::{capcut_path, default_capcut_drafts_dir};

const DRAFT_TEMPLATE: &str = include_str!("../../../templates/capcut_draft_template.json");
const META_TEMPLATE: &str = include_str!("../../../templates/capcut_meta_template.json");

/// CapCut gives stills a 3h source duration so a segment can stretch them freely.
pub const PHOTO_DURATION_US: i64 = 10_800_000_000;

pub struct MediaRef {
    pub path: PathBuf,
    pub duration_us: i64,
    pub width: u32,
    pub height: u32,
}

fn new_id() -> String {
    uuid::Uuid::new_v4().to_string().to_uppercase()
}

fn obj(v: Value) -> Map<String, Value> {
    match v {
        Value::Object(m) => m,
        _ => Map::new(),
    }
}

fn file_name(p: &Path) -> String {
    p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
}

fn track(kind: &str) -> CapCutTrack {
    CapCutTrack {
        id: new_id(),
        r#type: kind.into(),
        segments: Vec::new(),
        extra: obj(json!({ "attribute": 0, "flag": 0, "is_default_name": true, "name": "" })),
    }
}

fn video_material(id: &str, m: &MediaRef, kind: &str) -> Value {
    json!({
        "id": id, "type": kind, "path": capcut_path(&m.path), "material_name": file_name(&m.path),
        "duration": m.duration_us, "width": m.width, "height": m.height, "has_audio": kind == "video",
        "category_name": "local", "check_flag": 63487, "crop_ratio": "free", "crop_scale": 1.0,
        "crop": {
            "upper_left_x": 0.0, "upper_left_y": 0.0, "upper_right_x": 1.0, "upper_right_y": 0.0,
            "lower_left_x": 0.0, "lower_left_y": 1.0, "lower_right_x": 1.0, "lower_right_y": 1.0
        },
        "media_path": "", "local_material_id": "", "material_id": "", "extra_type_option": 0,
        "source": 0, "source_platform": 0
    })
}

fn audio_material(id: &str, path: &Path, duration_us: i64) -> Value {
    json!({
        "id": id, "type": "extract_music", "name": file_name(path), "path": capcut_path(path),
        "duration": duration_us, "category_name": "local", "check_flag": 1, "music_id": id,
        "local_material_id": "", "app_id": 0, "copyright_limit_type": "none", "effect_id": "",
        "formula_id": "", "intensifies_path": "", "is_ai_clone_tone": false, "is_text_edit_overdub": false,
        "is_ugc": false, "query": "", "request_id": "", "resource_id": "", "search_id": "",
        "source_from": "", "source_platform": 0, "team_id": "", "text_id": "", "tone_type": "",
        "video_id": "", "wave_points": []
    })
}

fn text_material(id: &str, text: &str) -> Value {
    let content = json!({
        "text": text,
        "styles": [{
            "fill": { "alpha": 1.0, "content": { "render_type": "solid", "solid": { "alpha": 1.0, "color": [1.0, 1.0, 1.0] } } },
            "strokes": [{ "content": { "solid": { "alpha": 1.0, "color": [0.0, 0.0, 0.0] } }, "width": 0.08 }],
            "range": [0, text.encode_utf16().count()],
            "size": 9.0, "bold": true, "italic": false, "underline": false
        }]
    });
    json!({
        "id": id, "type": "text", "content": content.to_string(), "typesetting": 0, "alignment": 1,
        "letter_spacing": 0.0, "line_spacing": 0.02, "line_feed": 1, "line_max_width": 0.82,
        "force_apply_line_max_width": false, "check_flag": 7, "global_alpha": 1.0, "text_size": 30,
        "font_size": 9.0, "text_color": "#FFFFFF", "border_color": "#000000", "border_width": 0.08
    })
}

fn segment_extra(render_index: i64, refs: Vec<String>, clip_y: Option<f64>) -> Map<String, Value> {
    let mut extra = obj(json!({
        "extra_material_refs": refs, "render_index": render_index, "track_render_index": 0,
        "track_attribute": 0, "visible": true, "reverse": false, "is_tone_modify": false,
        "last_nonzero_volume": 1.0, "common_keyframes": [], "keyframe_refs": [],
        "enable_adjust": true, "enable_color_curves": true, "enable_color_wheels": true, "enable_lut": true,
        "enable_color_correct_adjust": false, "enable_color_match_adjust": false, "enable_smart_color_adjust": false
    }));
    extra.extend(obj(match clip_y {
        Some(y) => json!({
            "clip": {
                "alpha": 1.0, "rotation": 0.0, "flip": { "horizontal": false, "vertical": false },
                "scale": { "x": 1.0, "y": 1.0 }, "transform": { "x": 0.0, "y": y }
            },
            "uniform_scale": { "on": true, "value": 1.0 },
            "hdr_settings": { "intensity": 1.0, "mode": 1, "nits": 1000 }
        }),
        None => json!({ "clip": null, "hdr_settings": null }),
    }));
    extra
}

/// Every media segment gets its own speed material, as CapCut itself does.
fn media_segment(m: &mut DraftMaterials, material_id: &str, start: i64, duration: i64, volume: f64, visual: bool) -> CapCutSegment {
    let speed_id = new_id();
    m.speeds.push(json!({ "id": speed_id, "type": "speed", "mode": 0, "speed": 1.0, "curve_speed": null }));
    CapCutSegment {
        id: new_id(),
        material_id: material_id.into(),
        target_timerange: CapCutTimerange { start, duration },
        source_timerange: Some(CapCutTimerange { start: 0, duration }),
        speed: 1.0,
        volume,
        extra: segment_extra(0, vec![speed_id], visual.then_some(0.0)),
    }
}

fn text_segment(material_id: &str, start: i64, duration: i64) -> CapCutSegment {
    CapCutSegment {
        id: new_id(),
        material_id: material_id.into(),
        target_timerange: CapCutTimerange { start, duration },
        source_timerange: None,
        speed: 1.0,
        volume: 1.0,
        extra: segment_extra(14000, Vec::new(), Some(0.6)),
    }
}

/// Track 1 holds the gacha intro under the hook block and thumbnail placeholders under
/// every other block; a text track marks each block; SFX land at block start + cue offset.
pub fn build_draft(
    manifest: &ProjectManifest,
    intro: Option<&MediaRef>,
    placeholder: Option<&MediaRef>,
    sfx: &HashMap<String, PathBuf>,
) -> Result<CapCutDraftContent, String> {
    let mut draft: CapCutDraftContent =
        serde_json::from_str(DRAFT_TEMPLATE).map_err(|e| format!("bad CapCut template: {e}"))?;
    draft.id = new_id();
    let m = &mut draft.materials;

    let intro_id = intro.map(|v| {
        let id = new_id();
        m.videos.push(video_material(&id, v, "video"));
        id
    });
    let photo_id = placeholder.map(|p| {
        let id = new_id();
        m.videos.push(video_material(&id, p, "photo"));
        id
    });

    let mut video = track("video");
    let mut text = track("text");
    let mut audio_materials: HashMap<&str, (String, i64)> = HashMap::new();
    let mut cues: Vec<(i64, i64, String, f64)> = Vec::new();
    let mut cursor = 0i64;

    for block in &manifest.timeline {
        let (start, dur) = (cursor, block.duration_ms.max(1) * 1_000);
        cursor += dur;

        let mut filled = 0;
        if let (TimelineBlockType::HookGacha, Some(v), Some(id)) = (block.r#type, intro, &intro_id) {
            filled = dur.min(v.duration_us);
            video.segments.push(media_segment(m, id, start, filled, 1.0, true));
        }
        if let (true, Some(id)) = (filled < dur, &photo_id) {
            video.segments.push(media_segment(m, id, start + filled, dur - filled, 1.0, true));
        }

        let caption = block
            .on_screen_text
            .as_deref()
            .map(str::trim)
            .filter(|t| !t.is_empty())
            .unwrap_or(&block.label);
        let text_id = new_id();
        m.texts.push(text_material(&text_id, caption));
        text.segments.push(text_segment(&text_id, start, dur));

        for cue in &block.audio_cues {
            let path = sfx
                .get(&cue.sfx_id)
                .ok_or_else(|| format!("{} was not copied into 03_audio_sfx", cue.sfx_id))?;
            let (material_id, src_dur) = audio_materials
                .entry(cue.sfx_id.as_str())
                .or_insert_with(|| {
                    let id = new_id();
                    let d = wav_duration_us(path).unwrap_or(cue.duration_microseconds);
                    m.audios.push(audio_material(&id, path, d));
                    (id, d)
                })
                .clone();
            let d = match cue.duration_microseconds {
                n if n > 0 => n.min(src_dur),
                _ => src_dur,
            };
            cues.push((start + cue.start_offset_microseconds.max(0), d, material_id, cue.volume));
        }
    }

    // A CapCut track can't hold overlapping segments, so overlapping cues spill onto extra audio tracks.
    cues.sort_by_key(|c| c.0);
    let mut lanes: Vec<(CapCutTrack, i64)> = Vec::new();
    for (start, dur, material_id, volume) in cues {
        let seg = media_segment(m, &material_id, start, dur, volume, false);
        match lanes.iter_mut().find(|(_, end)| *end <= start) {
            Some((t, end)) => {
                t.segments.push(seg);
                *end = start + dur;
            }
            None => {
                let mut t = track("audio");
                t.segments.push(seg);
                lanes.push((t, start + dur));
            }
        }
    }

    let total = lanes.iter().map(|(_, end)| *end).chain([cursor]).max().unwrap_or(0);
    draft.tracks = std::iter::once(video)
        .chain(lanes.into_iter().map(|(t, _)| t))
        .chain([text])
        .filter(|t| !t.segments.is_empty())
        .collect();
    draft.extra.insert("duration".into(), json!(total));
    Ok(draft)
}

pub fn write_draft(dir: &Path, name: &str, draft: &CapCutDraftContent) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| format!("create {}: {e}", dir.display()))?;
    let content = serde_json::to_string(draft).map_err(|e| e.to_string())?;
    fs::write(dir.join("draft_content.json"), content).map_err(|e| e.to_string())?;

    let mut meta: Value = serde_json::from_str(META_TEMPLATE).map_err(|e| format!("bad meta template: {e}"))?;
    let now = chrono::Utc::now().timestamp_micros();
    meta["draft_fold_path"] = json!(capcut_path(dir));
    meta["draft_root_path"] = json!(dir.parent().map(|p| p.to_string_lossy().into_owned()).unwrap_or_default());
    meta["draft_id"] = json!(new_id());
    meta["draft_name"] = json!(name);
    meta["tm_draft_create"] = json!(now);
    meta["tm_draft_modified"] = json!(now);
    meta["tm_duration"] = draft.extra.get("duration").cloned().unwrap_or(json!(0));
    fs::write(dir.join("draft_meta_info.json"), meta.to_string()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn default_capcut_dir() -> Option<String> {
    default_capcut_drafts_dir().map(|p| p.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::commands::audio::find_sfx;
    use crate::commands::audio::tests::bank;

    fn manifest() -> ProjectManifest {
        let cue = |id: &str, offset: i64, dur: i64, volume: f64| {
            json!({ "sfxId": id, "assetPath": "", "startOffsetMicroseconds": offset, "durationMicroseconds": dur, "volume": volume })
        };
        serde_json::from_value(json!({
            "projectId": "PROJECT_20261024_benchy", "projectName": "Benchy", "createdAt": "2026-10-24T00:00:00Z",
            "model": { "platform": "printables", "modelId": "1", "title": "Benchy", "designer": "x",
                       "sourceUrl": "https://example.com", "thumbnailUrl": "https://example.com/t.jpg", "tags": [] },
            "timeline": [
                { "blockId": "a", "type": "hook_gacha", "label": "Spin", "durationMs": 4000, "visualDirection": "",
                  "audioCues": [cue("sfx_gacha_win", 1_000_000, 0, 1.0)] },
                { "blockId": "b", "type": "plate_snap_asmr", "label": "Snap", "durationMs": 3000, "visualDirection": "",
                  "onScreenText": "SNAP!",
                  "audioCues": [cue("sfx_plate_snap_sharp", 500_000, 0, 0.8), cue("sfx_stepper_loop", 500_000, 1_000_000, 0.5)] }
            ],
            "script": { "hookNarrative": "", "captionText": "", "hashtags": [], "affiliateSlots": [] },
            "exportPaths": { "rootDirectory": "", "screenRecordFile": "", "capcutDraftDirectory": "" }
        }))
        .unwrap()
    }

    #[test]
    fn lays_out_intro_placeholders_and_sfx_in_microseconds() {
        let sfx: HashMap<String, PathBuf> = ["sfx_gacha_win", "sfx_plate_snap_sharp", "sfx_stepper_loop"]
            .iter()
            .map(|id| (id.to_string(), find_sfx(&bank(), id).unwrap()))
            .collect();
        let intro = MediaRef { path: r"C:\p\01_screen_record\gacha_intro.mp4".into(), duration_us: 3_800_000, width: 1080, height: 1920 };
        let thumb = MediaRef { path: r"C:\p\02_model_assets\thumbnail.jpg".into(), duration_us: PHOTO_DURATION_US, width: 800, height: 600 };
        let d = build_draft(&manifest(), Some(&intro), Some(&thumb), &sfx).unwrap();

        assert_eq!((d.canvas_config.width, d.canvas_config.height, d.canvas_config.ratio.as_str()), (1080, 1920, "9:16"));
        let kinds: Vec<&str> = d.tracks.iter().map(|t| t.r#type.as_str()).collect();
        assert_eq!(kinds, ["video", "audio", "audio", "text"]);

        let video = &d.tracks[0].segments;
        assert_eq!(video[0].material_id, d.materials.videos[0]["id"].as_str().unwrap());
        assert_eq!(d.materials.videos[0]["path"], "C:/p/01_screen_record/gacha_intro.mp4");
        let ranges: Vec<(i64, i64)> = video.iter().map(|s| (s.target_timerange.start, s.target_timerange.duration)).collect();
        assert_eq!(ranges, [(0, 3_800_000), (3_800_000, 200_000), (4_000_000, 3_000_000)]);

        let audio: Vec<(i64, i64)> = d.tracks[1..3]
            .iter()
            .flat_map(|t| t.segments.iter().map(|s| (s.target_timerange.start, s.target_timerange.duration)))
            .collect();
        assert_eq!(audio[0].0, 1_000_000);
        assert_eq!(audio[1].0, 4_500_000);
        assert_eq!(audio[2], (4_500_000, 1_000_000));
        assert_eq!(d.materials.audios.len(), 3);

        let json = serde_json::to_value(&d).unwrap();
        assert_eq!(json["duration"], 7_000_000);
        assert_eq!(json["materials"]["speeds"].as_array().unwrap().len(), 6);
        assert!(json["materials"]["canvases"].is_array(), "template fields must pass through");
    }
}
