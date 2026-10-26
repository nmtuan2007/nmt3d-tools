use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TimelineBlockType {
    HookGacha,
    SlicerPreview,
    TimelapsePrint,
    PlateSnapAsmr,
    SupportPeelAsmr,
    MechanicalTest,
    VerdictOutro,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AudioAssignment {
    pub sfx_id: String,
    pub asset_path: String,
    /// Relative to the start of the owning block.
    pub start_offset_microseconds: i64,
    pub duration_microseconds: i64,
    pub volume: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TimelineNode {
    pub block_id: String,
    pub r#type: TimelineBlockType,
    pub label: String,
    pub duration_ms: i64,
    pub visual_direction: String,
    pub audio_cues: Vec<AudioAssignment>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub on_screen_text: Option<String>,
}
