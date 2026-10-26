/** Options for `assemble_project`; mirrors `ExportOptions` in src-tauri/src/commands/project.rs. */
export interface CapCutExportOptions {
  recordingDurationMs?: number;
  thumbnailWidth?: number;
  thumbnailHeight?: number;
  /** CapCut's own drafts folder; when set the draft is installed there as well. */
  capcutDraftsDir?: string;
  sfxOverrides: Record<string, string>;
}

export interface ExportReport {
  rootDirectory: string;
  draftDirectories: string[];
  sfxFiles: string[];
  warnings: string[];
}
