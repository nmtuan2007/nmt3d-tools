mod commands;
mod models;
mod utils;

use commands::{audio, capcut, project, recorder, scraper};
use tauri_plugin_sql::{Migration, MigrationKind};

fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "model cache, past runs, custom sfx mappings",
        sql: "
            CREATE TABLE model_cache (
                platform TEXT NOT NULL,
                model_id TEXT NOT NULL,
                category TEXT NOT NULL,
                data TEXT NOT NULL,
                fetched_at TEXT NOT NULL,
                PRIMARY KEY (platform, model_id)
            );
            CREATE TABLE runs (
                project_id TEXT PRIMARY KEY,
                project_dir TEXT NOT NULL,
                model_title TEXT NOT NULL,
                manifest TEXT NOT NULL,
                exported_at TEXT NOT NULL
            );
            CREATE TABLE sfx_mappings (
                sfx_id TEXT PRIMARY KEY,
                asset_path TEXT NOT NULL
            );
        ",
        kind: MigrationKind::Up,
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:nmt3d.db", migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            scraper::fetch_curated_models,
            scraper::fetch_image,
            recorder::save_recorded_clip,
            project::resolve_and_copy_sfx,
            project::assemble_project,
            audio::list_sfx,
            capcut::default_capcut_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
