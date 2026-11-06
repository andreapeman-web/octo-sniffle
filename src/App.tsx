import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { requestPersistence } from "./lib/backup";
import { getUploadInfo, invalidatePool } from "./lib/questions";
import { getRun, listAdventures, loadLevels, loadSettings, saveRun, saveSettings } from "./lib/store";
import type { Adventure, LevelRow, Run, Settings, UploadInfo } from "./lib/types";
import { Home } from "./screens/Home";
import { NewRun } from "./screens/NewRun";
import { Play } from "./screens/Play";
import { StoryMap } from "./screens/StoryMap";
import { CharacterScreen } from "./screens/Character";
import { Review } from "./screens/Review";
import { Stats } from "./screens/Stats";
import { SettingsScreen } from "./screens/Settings";
import { Upload } from "./screens/Upload";

export type Screen = "home" | "newrun" | "play" | "map" | "character" | "review" | "stats" | "settings" | "upload";

interface AppCtx {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  levels: LevelRow[];
  upload?: UploadInfo;
  refreshUpload: () => Promise<void>;
  adventures: Adventure[];
  refreshAdventures: () => Promise<void>;
  adventure?: Adventure;
  run?: Run;
  /** Persist and set the active run (called after every answer). */
  setRun: (r: Run) => Promise<void>;
  openAdventure: (id: string) => Promise<void>;
  go: (s: Screen) => void;
  reloadAll: () => Promise<void>;
}

const Ctx = createContext<AppCtx | null>(null);
export const useApp = () => useContext(Ctx)!;

export default function App() {
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>("home");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [upload, setUpload] = useState<UploadInfo>();
  const [adventures, setAdventures] = useState<Adventure[]>([]);
  const [run, setRunState] = useState<Run>();
  const [adventureId, setAdventureId] = useState<string>();

  const reloadAll = useCallback(async () => {
    const [s, l, u, advs] = await Promise.all([loadSettings(), loadLevels(), getUploadInfo(), listAdventures()]);
    setSettings(s);
    setLevels(l);
    setUpload(u);
    setAdventures(advs);
    const id = s.activeAdventureId && advs.some((a) => a.id === s.activeAdventureId) ? s.activeAdventureId : advs[0]?.id;
    setAdventureId(id);
    setRunState(id ? await getRun(id) : undefined);
    invalidatePool();
  }, []);

  useEffect(() => {
    void reloadAll().then(() => setReady(true));
    void requestPersistence();
  }, [reloadAll]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  if (!ready || !settings) return <div className="splash">Loading…</div>;

  const ctx: AppCtx = {
    settings,
    updateSettings: async (patch) => {
      const s = { ...settings, ...patch };
      setSettings(s);
      if ("selectedTags" in patch) invalidatePool();
      await saveSettings(s);
    },
    levels,
    upload,
    refreshUpload: async () => setUpload(await getUploadInfo()),
    adventures,
    refreshAdventures: async () => setAdventures(await listAdventures()),
    adventure: adventures.find((a) => a.id === adventureId),
    run,
    setRun: async (r) => {
      setRunState(r);
      await saveRun(r);
    },
    openAdventure: async (id) => {
      setAdventureId(id);
      setRunState(await getRun(id));
      const s = { ...settings, activeAdventureId: id };
      setSettings(s);
      await saveSettings(s);
    },
    go: setScreen,
    reloadAll,
  };

  return (
    <Ctx.Provider value={ctx}>
      <div className="app">
        {screen === "home" && <Home />}
        {screen === "newrun" && <NewRun />}
        {screen === "play" && <Play />}
        {screen === "map" && <StoryMap />}
        {screen === "character" && <CharacterScreen />}
        {screen === "review" && <Review />}
        {screen === "stats" && <Stats />}
        {screen === "settings" && <SettingsScreen />}
        {screen === "upload" && <Upload />}
      </div>
    </Ctx.Provider>
  );
}
