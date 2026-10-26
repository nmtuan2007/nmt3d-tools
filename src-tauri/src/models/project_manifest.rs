use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::model_source::ModelSource;
use super::timeline::TimelineNode;

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectManifest {
    pub project_id: String,
    pub project_name: String,
    pub created_at: DateTime<Utc>,
    pub model: ModelSource,
    pub timeline: Vec<TimelineNode>,
    pub script: ProjectScript,
    pub export_paths: ExportPaths,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectScript {
    pub hook_narrative: String,
    pub caption_text: String,
    pub hashtags: Vec<String>,
    pub affiliate_slots: Vec<AffiliateSlot>,
    #[serde(default)]
    pub hook_titles: Vec<String>,
    #[serde(default)]
    pub contingency: Contingency,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AffiliateSlot {
    pub category: String,
    pub suggested_search: String,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct Contingency {
    pub pass: String,
    pub fail: String,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ExportPaths {
    pub root_directory: String,
    pub screen_record_file: String,
    pub capcut_draft_directory: String,
}
