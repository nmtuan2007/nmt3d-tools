use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::Duration;

use anyhow::{Context, anyhow, bail};
use reqwest::header::{ACCEPT, CONTENT_TYPE, USER_AGENT};
use serde_json::{Value, json};

use crate::models::model_source::{ModelSource, PlatformType};

const USER_AGENTS: [&str; 4] = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
];

static NEXT_UA: AtomicUsize = AtomicUsize::new(0);

pub fn user_agent() -> &'static str {
    USER_AGENTS[NEXT_UA.fetch_add(1, Ordering::Relaxed) % USER_AGENTS.len()]
}

pub fn http() -> &'static reqwest::Client {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .timeout(Duration::from_secs(20))
            .build()
            .expect("failed to build HTTP client")
    })
}

/// Errors bubble to the frontend, which then serves the SQLite cache instead.
#[tauri::command]
pub async fn fetch_curated_models(platform: String, category: String) -> Result<Vec<ModelSource>, String> {
    let query = match category.trim() {
        "" => "print in place",
        q => q,
    };
    let models = match platform.as_str() {
        "printables" => printables(query).await,
        "makerworld" => makerworld(query).await,
        other => Err(anyhow!("{other} has no public API without a token")),
    }
    .map_err(|e| format!("{e:#}"))?;
    if models.is_empty() {
        return Err(format!("No {platform} models found for \"{query}\""));
    }
    Ok(models)
}

async fn printables(query: &str) -> anyhow::Result<Vec<ModelSource>> {
    const GQL: &str = "query($q: String!, $limit: Int) { searchPrints2(query: $q, limit: $limit) { items { id name slug image { filePath } user { publicUsername } tags { name } } } }";
    let res = http()
        .post("https://api.printables.com/graphql/")
        .header(USER_AGENT, user_agent())
        .json(&json!({ "query": GQL, "variables": { "q": query, "limit": 40 } }))
        .send()
        .await?;
    let status = res.status();
    let body = res.text().await?;
    if status.as_u16() == 429 || body.starts_with("Request was throttled") {
        bail!("Printables rate-limited the request");
    }
    if !status.is_success() {
        bail!("Printables returned HTTP {status}");
    }
    let v: Value = serde_json::from_str(&body).context("Printables returned non-JSON")?;
    let items = v["data"]["searchPrints2"]["items"]
        .as_array()
        .ok_or_else(|| anyhow!("Unexpected Printables response: {}", v["errors"]))?;
    Ok(items
        .iter()
        .filter_map(|it| {
            let id = it["id"].as_str()?;
            Some(ModelSource {
                platform: PlatformType::Printables,
                model_id: id.to_string(),
                title: it["name"].as_str()?.to_string(),
                designer: it["user"]["publicUsername"].as_str().unwrap_or("unknown").to_string(),
                source_url: format!("https://www.printables.com/model/{id}-{}", it["slug"].as_str().unwrap_or("")),
                thumbnail_url: format!("https://media.printables.com/{}", it["image"]["filePath"].as_str()?),
                download_url: None,
                tags: strings(&it["tags"], |t| t["name"].as_str()),
            })
        })
        .collect())
}

// ponytail: MakerWorld sits behind a Cloudflare challenge, so most calls 403 and the
// frontend falls back to the cache. The field names follow the site's own search XHR;
// re-check them if MakerWorld ever opens the endpoint.
async fn makerworld(query: &str) -> anyhow::Result<Vec<ModelSource>> {
    let res = http()
        .get("https://makerworld.com/api/v1/search-service/select/design2")
        .query(&[("keyword", query), ("limit", "40"), ("offset", "0")])
        .header(USER_AGENT, user_agent())
        .header(ACCEPT, "application/json")
        .send()
        .await?;
    match res.status().as_u16() {
        403 => bail!("MakerWorld blocked the request (Cloudflare challenge)"),
        429 => bail!("MakerWorld rate-limited the request"),
        s if !(200..300).contains(&s) => bail!("MakerWorld returned HTTP {s}"),
        _ => {}
    }
    let v: Value = res.json().await.context("MakerWorld returned non-JSON")?;
    let hits = v["hits"].as_array().ok_or_else(|| anyhow!("Unexpected MakerWorld response"))?;
    Ok(hits
        .iter()
        .filter_map(|h| {
            let id = h["id"].as_i64().map(|n| n.to_string()).or_else(|| h["id"].as_str().map(String::from))?;
            Some(ModelSource {
                platform: PlatformType::Makerworld,
                source_url: format!("https://makerworld.com/en/models/{id}"),
                model_id: id,
                title: h["title"].as_str()?.to_string(),
                designer: h["designCreator"]["name"].as_str().unwrap_or("unknown").to_string(),
                thumbnail_url: h["cover"].as_str()?.to_string(),
                download_url: None,
                tags: strings(&h["tags"], |t| t.as_str()),
            })
        })
        .collect())
}

fn strings(arr: &Value, pick: impl Fn(&Value) -> Option<&str>) -> Vec<String> {
    arr.as_array()
        .map(|a| a.iter().filter_map(&pick).map(String::from).collect())
        .unwrap_or_default()
}

async fn get_bytes(url: &str) -> anyhow::Result<(Vec<u8>, String)> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        bail!("Refusing to fetch non-HTTP URL {url}");
    }
    let res = http()
        .get(url)
        .header(USER_AGENT, user_agent())
        .send()
        .await?
        .error_for_status()?;
    let mime = res
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    Ok((res.bytes().await?.to_vec(), mime))
}

/// Thumbnails are proxied through Rust so the roulette canvas stays origin-clean;
/// a tainted canvas cannot be captured by `MediaRecorder`.
#[tauri::command]
pub async fn fetch_image(url: String) -> Result<tauri::ipc::Response, String> {
    let (bytes, _) = get_bytes(&url).await.map_err(|e| format!("{e:#}"))?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// Saves `url` as `{dir}/{stem}.{ext}`, picking the extension from the response type.
pub async fn download_to(url: &str, dir: &Path, stem: &str) -> anyhow::Result<PathBuf> {
    let (bytes, mime) = get_bytes(url).await?;
    let ext = match mime.as_str() {
        "image/png" => "png",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => "jpg",
    };
    let path = dir.join(format!("{stem}.{ext}"));
    tokio::fs::write(&path, bytes).await?;
    Ok(path)
}
