//! Typed view of the parts of a CapCut draft we generate. CapCut expects dozens of
//! extra fields per object; `extra` carries them through verbatim from the template
//! and the segment builders so the typed fields stay small.

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq)]
pub struct CapCutTimerange {
    pub start: i64,
    pub duration: i64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CapCutSegment {
    pub id: String,
    pub material_id: String,
    pub target_timerange: CapCutTimerange,
    pub source_timerange: Option<CapCutTimerange>,
    pub speed: f64,
    pub volume: f64,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CapCutTrack {
    pub id: String,
    pub r#type: String, // "video" | "audio" | "text"
    pub segments: Vec<CapCutSegment>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CapCutDraftContent {
    pub id: String,
    pub canvas_config: CanvasConfig,
    pub materials: DraftMaterials,
    pub tracks: Vec<CapCutTrack>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CanvasConfig {
    pub width: i32,
    pub height: i32,
    pub ratio: String,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DraftMaterials {
    pub audios: Vec<Value>,
    pub videos: Vec<Value>,
    pub texts: Vec<Value>,
    pub speeds: Vec<Value>,
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}
