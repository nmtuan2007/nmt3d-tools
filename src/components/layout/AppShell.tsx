import { documentDir, join } from "@tauri-apps/api/path";
import { useEffect, useState } from "react";
import { defaultCapcutDir } from "../../services/tauriBridge";
import { useConfigStore } from "../../store/useConfigStore";
import { useProjectStore } from "../../store/useProjectStore";
import { ModelPreviewCard } from "../gacha/ModelPreviewCard";
import { RouletteCanvas } from "../gacha/RouletteCanvas";
import { SpinControls } from "../gacha/SpinControls";
import { BeatMatcher } from "../script-editor/BeatMatcher";
import { LlmPromptDrawer } from "../script-editor/LlmPromptDrawer";
import { ScriptCard } from "../script-editor/ScriptCard";
import { APIConfig } from "../settings/APIConfig";
import { CapCutPathSelector } from "../settings/CapCutPathSelector";
import { GlobalSFXTable } from "../settings/GlobalSFXTable";
import { StoryboardTrack } from "../timeline/StoryboardTrack";
import { Header } from "./Header";
import { Sidebar, type View } from "./Sidebar";

export function AppShell() {
  const [view, setView] = useState<View>("gacha");
  const hasProject = useProjectStore((s) => !!s.manifest);
  const [bankError, setBankError] = useState<string>();

  useEffect(() => {
    useProjectStore.getState().loadBank().catch((e) => setBankError(`Sound bank failed to load: ${e}`));
    const { outputDir, capcutDir, set } = useConfigStore.getState();
    if (!outputDir) documentDir().then((d) => join(d, "nmt3d-projects")).then((dir) => set({ outputDir: dir }));
    if (!capcutDir) defaultCapcutDir().then((dir) => dir && set({ capcutDir: dir }));
  }, []);

  return (
    <div className="flex h-full">
      <Sidebar view={view} onNavigate={setView} />
      <main className="flex min-w-0 flex-1 flex-col">
        <Header />
        {bankError && <p className="mx-6 mt-3 rounded-md bg-red-500/10 px-2 py-1 text-xs text-red-300">{bankError}</p>}
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {/* Views stay mounted so a spin keeps recording while you look elsewhere. */}
          <section className={view === "gacha" ? "flex h-full gap-6" : "hidden"}>
            <div className="w-96 shrink-0 space-y-4">
              <SpinControls />
              <ModelPreviewCard />
            </div>
            <div className="flex min-w-0 flex-1 justify-center">
              <RouletteCanvas />
            </div>
          </section>
          <section className={view === "storyboard" ? "space-y-4" : "hidden"}>
            {hasProject ? (
              <>
                <LlmPromptDrawer />
                <StoryboardTrack />
                <div className="grid grid-cols-2 items-start gap-4">
                  <BeatMatcher />
                  <ScriptCard />
                </div>
              </>
            ) : (
              <p className="text-sm text-zinc-400">Spin the gacha wheel first; the storyboard is built from the model it picks.</p>
            )}
          </section>
          <section className={view === "settings" ? "max-w-4xl space-y-4" : "hidden"}>
            <APIConfig />
            <CapCutPathSelector />
            <GlobalSFXTable />
          </section>
        </div>
      </main>
    </div>
  );
}
