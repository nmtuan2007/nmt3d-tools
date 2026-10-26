# `nmt3d-tools` — Comprehensive Technical Execution & Implementation Plan

> **System Overview:** A high-performance desktop application designed to automate the production pipeline for short-form 3D printing videos (TikTok, YouTube Shorts, Instagram Reels). It handles automated random model discovery (Gacha mechanism), programmatic screen recording, LLM-driven multi-track scripting, asset gathering with a unified Global Sound Bank, and direct project export into a CapCut Desktop compatible draft.

---

## 1. System Architecture & Tech Stack

- **Application Shell:** **Tauri v2** (`Rust` Core Backend + `Node.js` Frontend Bridge).
- **Frontend UI Layer:** **React 19**, **TypeScript**, **Vite**, **Tailwind CSS v4**, **Lucide React**.
- **State Management & Data Layer:**
- Client UI State: **Zustand**.
- Persistent Data: **SQLite** via `@tauri-apps/plugin-sql` (stores scraped model cache, past runs, custom SFX mappings).

- **Media Processing & Automation:**
- Screen Capture: HTML5 Canvas API + `MediaRecorder` (`video/webm; codecs=vp9` or native VP8/H.264) piped to native Rust for MP4 transcoding.
- Audio/Video I/O: Native Rust backend utilizing `ffmpeg-sidecar` (or native Tauri file streaming) and `rodio` for local preview playback.

- **LLM Engine:** Multi-provider API abstraction (OpenAI, Anthropic Claude, and Google Gemini SDKs) focused on structured JSON extraction (`json_schema` / response format enforcement).

---

## 2. Directory Layout Specification

```text
nmt3d-tools/
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── capabilities/
│   │   └── default.json               # Permissions: fs, dialog, shell, sql
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   ├── commands/                  # Tauri IPC Handlers
│   │   │   ├── scraper.rs             # Scraping & discovery engine
│   │   │   ├── recorder.rs            # Native video assembly & file write
│   │   │   ├── project.rs             # Folder builder & asset copier
│   │   │   ├── audio.rs               # Global SFX lookup & validation
│   │   │   └── capcut.rs              # CapCut Draft JSON generator
│   │   ├── models/                    # Serde Data Structs
│   │   │   ├── model_source.rs
│   │   │   ├── timeline.rs
│   │   │   ├── project_manifest.rs
│   │   │   └── capcut_draft.rs
│   │   └── utils/
│   │       ├── paths.rs
│   │       └── hashing.rs
│   └── assets/
│       └── global_sfx/                # Bundled Core Audio Assets
│           ├── foley/                 # stepper_fast.wav, flex_plate_snap.wav
│           ├── asmr/                  # tree_support_crack_01.wav, peel_01.wav
│           ├── ui/                    # roulette_tick.wav, ding.wav, click.wav
│           └── memes/                 # vine_boom.wav, sad_violin.wav
├── src/
│   ├── assets/
│   ├── components/
│   │   ├── layout/                    # AppShell, Sidebar, Header
│   │   ├── gacha/                     # RouletteCanvas, ModelPreviewCard, SpinControls
│   │   ├── timeline/                  # StoryboardTrack, MarkerNode, AudioSyncViewer
│   │   ├── script-editor/             # LLM Prompt Drawer, ScriptCard, BeatMatcher
│   │   └── settings/                  # APIConfig, CapCutPathSelector, GlobalSFXTable
│   ├── services/
│   │   ├── api/                       # LLM Providers (Gemini, Claude, OpenAI)
│   │   ├── scraper/                   # Platform parsers (MakerWorld, Printables)
│   │   └── tauriBridge.ts             # Strongly typed invoke wrappers
│   ├── store/
│   │   ├── useGachaStore.ts
│   │   ├── useProjectStore.ts
│   │   └── useConfigStore.ts
│   ├── types/
│   │   ├── index.ts
│   │   └── capcut.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── templates/
│   ├── capcut_draft_template.json     # Clean 9:16 1080x1920 60FPS draft template
│   └── capcut_meta_template.json      # Draft meta information structure
├── package.json
├── tsconfig.json
└── vite.config.ts

```

---

## 3. Data Schemas & Core Interfaces

### 3.1 Project Manifest Schema (`src/types/index.ts`)

```typescript
export type PlatformType = "makerworld" | "printables" | "thingiverse";

export interface ModelSource {
  platform: PlatformType;
  modelId: string;
  title: string;
  designer: string;
  sourceUrl: string;
  thumbnailUrl: string;
  downloadUrl?: string;
  tags: string[];
}

export type TimelineBlockType =
  | "hook_gacha"
  | "slicer_preview"
  | "timelapse_print"
  | "plate_snap_asmr"
  | "support_peel_asmr"
  | "mechanical_test"
  | "verdict_outro";

export interface AudioAssignment {
  sfxId: string;
  assetPath: string;
  startOffsetMicroseconds: number;
  durationMicroseconds: number;
  volume: number; // 0.0 - 1.0
}

export interface TimelineNode {
  blockId: string;
  type: TimelineBlockType;
  label: string;
  durationMs: number;
  visualDirection: string;
  audioCues: AudioAssignment[];
  onScreenText?: string;
}

export interface ProjectManifest {
  projectId: string;
  projectName: string;
  createdAt: string;
  model: ModelSource;
  timeline: TimelineNode[];
  script: {
    hookNarrative: string;
    captionText: string;
    hashtags: string[];
    affiliateSlots: Array<{ category: string; suggestedSearch: string }>;
  };
  exportPaths: {
    rootDirectory: string;
    screenRecordFile: string;
    capcutDraftDirectory: string;
  };
}
```

### 3.2 CapCut Desktop Structural Mapping (`src-tauri/src/models/capcut_draft.rs`)

CapCut tracks time in microseconds ($1\text{ second} = 1,000,000\text{ }\mu\text{s}$).

```rust
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Clone)]
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
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CapCutTrack {
    pub id: String,
    pub r#type: String, // "video" | "audio"
    pub segments: Vec<CapCutSegment>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CapCutDraftContent {
    pub id: String,
    pub canvas_config: CanvasConfig,
    pub materials: DraftMaterials,
    pub tracks: Vec<CapCutTrack>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CanvasConfig {
    pub width: i32,  // 1080
    pub height: i32, // 1920
    pub ratio: String, // "9:16"
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DraftMaterials {
    pub audios: Vec<serde_json::Value>,
    pub videos: Vec<serde_json::Value>,
    pub texts: Vec<serde_json::Value>,
}

```

---

## 4. Phase-by-Phase Step Execution Guide

### Phase 1: Environment Bootstrapping & Core Scaffolding

1. **Initialize Workspace:**

```bash
pnpm create tauri-app@latest nmt3d-tools --template react-ts
cd nmt3d-tools
pnpm install clsx tailwindcss @tailwindcss/vite lucide-react zustand @tauri-apps/plugin-fs @tauri-apps/plugin-dialog @tauri-apps/plugin-sql

```

2. **Configure Rust Dependencies (`src-tauri/Cargo.toml`):**

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-fs = "2"
tauri-plugin-dialog = "2"
tauri-plugin-sql = { version = "2", features = ["sqlite"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
tokio = { version = "1", features = ["full"] }
reqwest = { version = "0.12", features = ["json", "stream"] }
uuid = { version = "1.8", features = ["v4"] }
chrono = { version = "0.4", features = ["serde"] }
anyhow = "1.0"

```

3. **Configure Tauri Permissions (`src-tauri/capabilities/default.json`):**
   Ensure unrestricted access for target local project generation folders and CapCut user draft directories:

```json
{
  "permissions": [
    "core:default",
    "fs:default",
    "fs:allow-read-recursive",
    "fs:allow-write-recursive",
    "dialog:default",
    "sql:default"
  ]
}
```

---

### Phase 2: Web Scraping & Gacha Engine with Canvas Auto-Record

1. **Scraper Subsystem (`src-tauri/src/commands/scraper.rs`):**

- Expose `fetch_curated_models(platform: String, category: String) -> Result<Vec<ModelSource>, String>`.
- Implement HTTP client with rotating user agents targeting MakerWorld explore endpoints and Printables public GraphQL APIs.
- Fallback to a local pre-cached SQLite table if external calls are rate-limited.

2. **Interactive Roulette Component (`src/components/gacha/RouletteCanvas.tsx`):**

- Build a dynamic HTML5 Canvas spinning disc rendering downloaded model cards (thumbnail image, title, designer).
- Implement easing curves (`cubic-bezier(0.15, 0.9, 0.2, 1.0)`) with an exact spin duration of $3.2\text{ seconds}$.

3. **Programmatic Screen Capture Pipeline:**

- Bind `canvas.captureStream(60)` to `MediaRecorder`.
- Bind UI audio node: Every boundary pass of the wheel triggers a synchronized Web Audio API click/tick sound.
- On "SPIN" click:
- Start `MediaRecorder.start()`.
- Spin animation starts and halts on the target selected model.
- Trigger win fanfare sound.
- Wait 600ms, then trigger `MediaRecorder.stop()`.
- Convert `dataavailable` Blobs to an `ArrayBuffer` and stream down to Tauri command `save_recorded_clip(project_id, buffer)`.

---

### Phase 3: Global Sound Bank & Asset Resolution Engine

1. **Structure Global SFX Repository:**
   Place lossless WAV/MP3 files into `src-tauri/assets/global_sfx/`. Ensure each item has an exact semantic ID:

- `sfx_gacha_spin` $\rightarrow$ mechanical clicks.
- `sfx_gacha_win` $\rightarrow$ bell tone chime.
- `sfx_slicer_pass` $\rightarrow$ paper whoosh or quick sweep.
- `sfx_stepper_loop` $\rightarrow$ rhythmic high-speed stepper motor hum.
- `sfx_plate_snap_sharp` $\rightarrow$ crisp, clean flex plate unsticking.
- `sfx_tree_support_crush` $\rightarrow$ dense, crunchy plastic separation.
- `sfx_action_flick` $\rightarrow$ physical snap/blade extension.
- `sfx_verdict_boost` $\rightarrow$ digital confirmation pop.

2. **Asset Copier Command (`src-tauri/src/commands/project.rs`):**

- `resolve_and_copy_sfx(target_project_dir: PathBuf, sfx_ids: Vec<String>) -> Result<HashMap<String, PathBuf>, String>`.
- Automatically moves mapped audio files directly into `03_audio_sfx/` inside the isolated project directory.

---

### Phase 4: Structured LLM Production Director Integration

1. **System Prompt Formulation:**
   Configure a strict JSON schema enforcement prompt inside `src/services/api/llmDirector.ts`:

```text
You are an elite short-form 3D printing content producer.
Analyze the provided 3D model metadata (title, tags, category).
Generate a dynamic 22-26 second video storyboard structured for a high-retention video.
You MUST return a JSON payload with:
1. 3 Viral Hook Titles (High curiosity/controversy).
2. Timeline Array: Ordered sequence of segments with exact durations in milliseconds.
3. Mapped SFX Keys matching: [sfx_slicer_pass, sfx_stepper_loop, sfx_plate_snap_sharp, sfx_tree_support_crush, sfx_action_flick, sfx_verdict_boost].
4. Dual contingency instructions: Actions for PASS (perfect print) vs FAIL (spaghetti / print detachment).
5. Optimized viral social metadata (caption, hashtags).

```

2. **Execution Flow:**

- Once Gacha resolves a model, automatically feed its attributes into the LLM service.
- Populate the UI Storyboard editor with generated blocks, allowing one-click duration overrides or SFX remapping.

---

### Phase 5: Project Directory Exporter & CapCut Draft Generator

1. **Standardized Directory Assembly:**
   When the user clicks **"Assemble & Export Project"**, write out the following tree:

```text
{output_dir}/PROJECT_{DATE}_{MODEL_SLUG}/
├── 01_screen_record/
│   └── gacha_intro.mp4
├── 02_model_assets/
│   ├── thumbnail.png
│   └── model_metadata.json
├── 03_audio_sfx/
│   ├── sfx_gacha_spin.wav
│   ├── sfx_plate_snap_sharp.wav
│   └── sfx_tree_support_crush.wav
├── 04_footage_raw/                     # User places camera/timelapse clips here
├── script_plan.md                      # Formatted markdown guide
└── capcut_draft/
    ├── draft_content.json              # Fully compliant CapCut Desktop draft
    └── draft_meta_info.json

```

2. **CapCut Draft Assembler Command (`src-tauri/src/commands/capcut.rs`):**

- Ingest baseline template from `templates/capcut_base_draft.json`.
- Populate `materials.videos`: Register `01_screen_record/gacha_intro.mp4`.
- Populate `materials.audios`: Register every copied file in `03_audio_sfx/`.
- Build **Video Track 1 (Primary)**:
- Segment 0 to $t_{\text{gacha}}$: Point to `gacha_intro.mp4`.
- Remaining timeline: Insert marker spacers or placeholder color clips corresponding to timeline blocks.

- Build **Audio Track 1 (SFX Master)**:
- Insert each audio segment at its exact calculated `start_time` (in microseconds):

$$\text{offset\_microseconds} = \text{start\_time\_ms} \times 1,000$$

- Write output to `{output_dir}/capcut_draft/draft_content.json` or write directly into the host OS CapCut Drafts folder:
- Windows: `%LOCALAPPDATA%\CapCut\User Data\Projects\com.lveditor.draft\`
- macOS: `~/Movies/CapCut/User Data/Projects/com.lveditor.draft/`

---

## 5. Verification & Acceptance Criteria

1. **Gacha & Recorder Check:** Triggering the roulette results in a smooth 60fps spin that resolves cleanly and deposits a valid, playable video file (`gacha_intro.mp4`) into the project directory within 2 seconds of completion.
2. **LLM Structured Output Check:** The LLM integration reliably responds with valid, parsed JSON matching `TimelineNode[]` without throwing syntax or deserialization exceptions.
3. **Asset Resolution Check:** Selected timeline audio cues are correctly identified, verified against the internal sound bank, and cloned to `03_audio_sfx/` with zero missing reference links.
4. **CapCut Ingestion Test:** Opening the generated draft folder inside CapCut Desktop successfully mounts the canvas at 1080x1920 (9:16), shows the intro video on Track 1, and displays all SFX segments correctly placed at their designated microsecond markers across the timeline.
