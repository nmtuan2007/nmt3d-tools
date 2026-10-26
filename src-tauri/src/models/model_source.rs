use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum PlatformType {
    Makerworld,
    Printables,
    Thingiverse,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModelSource {
    pub platform: PlatformType,
    pub model_id: String,
    pub title: String,
    pub designer: String,
    pub source_url: String,
    pub thumbnail_url: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub download_url: Option<String>,
    pub tags: Vec<String>,
}
