use std::path::{Path, PathBuf};

/// IPC header values must be ASCII, so the frontend sends paths through `encodeURIComponent`.
pub fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 3 <= bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).ok();
            if let Some(b) = hex.and_then(|h| u8::from_str_radix(h, 16).ok()) {
                out.push(b);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// CapCut stores media paths with forward slashes on every OS.
pub fn capcut_path(p: &Path) -> String {
    p.to_string_lossy().replace('\\', "/")
}

pub fn default_capcut_drafts_dir() -> Option<PathBuf> {
    if cfg!(target_os = "windows") {
        std::env::var_os("LOCALAPPDATA")
            .map(|d| PathBuf::from(d).join(r"CapCut\User Data\Projects\com.lveditor.draft"))
    } else if cfg!(target_os = "macos") {
        std::env::var_os("HOME")
            .map(|h| PathBuf::from(h).join("Movies/CapCut/User Data/Projects/com.lveditor.draft"))
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_utf8_paths_and_leaves_bad_escapes() {
        assert_eq!(percent_decode("D%3A%5CD%E1%BB%B1%20%C3%A1n"), "D:\\Dự án");
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("%zz"), "%zz");
    }
}
