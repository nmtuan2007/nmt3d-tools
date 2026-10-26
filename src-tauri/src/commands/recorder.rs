use std::path::{Path, PathBuf};

use tauri::ipc::{InvokeBody, Request};

use crate::utils::paths::percent_decode;

fn header(request: &Request<'_>, name: &str) -> Result<String, String> {
    request
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .map(percent_decode)
        .ok_or_else(|| format!("missing {name} header"))
}

/// Receives the raw MediaRecorder output (headers: x-project-dir, x-mime) and writes
/// `01_screen_record/gacha_intro.mp4`. Returns the path of the written clip.
#[tauri::command]
pub async fn save_recorded_clip(request: Request<'_>) -> Result<String, String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw video bytes".into());
    };
    let dir = Path::new(&header(&request, "x-project-dir")?).join("01_screen_record");
    let is_mp4 = header(&request, "x-mime")?.starts_with("video/mp4");
    tokio::fs::create_dir_all(&dir).await.map_err(|e| e.to_string())?;

    let raw = dir.join(if is_mp4 { "gacha_intro.raw.mp4" } else { "gacha_intro.webm" });
    let mp4 = dir.join("gacha_intro.mp4");
    tokio::fs::write(&raw, bytes).await.map_err(|e| e.to_string())?;

    // MediaRecorder writes fragmented MP4 without a duration in the header; a stream-copy
    // remux fixes that. WebM (older WebView2) needs a real transcode.
    if ffmpeg_to_mp4(&raw, &mp4, is_mp4).await {
        let _ = tokio::fs::remove_file(&raw).await;
        return Ok(mp4.to_string_lossy().into_owned());
    }
    // ponytail: without ffmpeg on PATH the recorder output is kept as-is; WebView2 records
    // H.264 MP4 natively, so only the WebM fallback ends up non-MP4.
    let kept: PathBuf = if is_mp4 {
        tokio::fs::rename(&raw, &mp4).await.map_err(|e| e.to_string())?;
        mp4
    } else {
        raw
    };
    Ok(kept.to_string_lossy().into_owned())
}

async fn ffmpeg_to_mp4(input: &Path, output: &Path, copy: bool) -> bool {
    let codec: &[&str] = if copy {
        &["-c", "copy"]
    } else {
        &["-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "aac"]
    };
    let mut cmd = tokio::process::Command::new("ffmpeg");
    cmd.args(["-y", "-loglevel", "error", "-i"])
        .arg(input)
        .args(codec)
        .args(["-movflags", "+faststart"])
        .arg(output);
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    matches!(cmd.status().await, Ok(s) if s.success())
}
