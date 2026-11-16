import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, type Me, type Prefs } from "./api";

export const THEMES = [
  { id: "daylight", name: "Daylight", swatch: ["#ffffff", "#0c66e4", "#172b4d"] },
  { id: "midnight", name: "Midnight", swatch: ["#1d2125", "#579dff", "#b6c2cf"] },
  { id: "rosewood", name: "Rosewood", swatch: ["#fbf7f4", "#7a1838", "#c8963e"] },
  { id: "nord", name: "Nord", swatch: ["#2e3440", "#88c0d0", "#eceff4"] },
  { id: "solarized", name: "Solarized", swatch: ["#fdf6e3", "#268bd2", "#586e75"] },
  { id: "contrast", name: "High contrast", swatch: ["#000000", "#ffd400", "#ffffff"] },
] as const;

export const WIDTHS = [
  { id: "narrow", name: "Narrow", hint: "Book-like, easiest to read" },
  { id: "standard", name: "Standard", hint: "Default page width" },
  { id: "wide", name: "Wide", hint: "Room for tables and diagrams" },
  { id: "full", name: "Full width", hint: "Use the whole window" },
] as const;

export const DENSITIES = [
  { id: "compact", name: "Compact" },
  { id: "comfortable", name: "Comfortable" },
  { id: "spacious", name: "Spacious" },
] as const;

const DEFAULTS: Required<Prefs> = { theme: "daylight", width: "standard", density: "comfortable", editorMode: "visual" };
const LS = "minerva.prefs";

function readLocal(): Prefs {
  try {
    return JSON.parse(localStorage.getItem(LS) ?? "{}");
  } catch {
    return {};
  }
}

interface Ctx {
  prefs: Required<Prefs>;
  setPrefs: (p: Prefs) => void;
}

const PrefsContext = createContext<Ctx>({ prefs: DEFAULTS, setPrefs: () => {} });

export function PrefsProvider({ me, children }: { me: Me | null; children: ReactNode }) {
  const [prefs, set] = useState<Required<Prefs>>({ ...DEFAULTS, ...readLocal() });

  // The server copy wins once signed in, so preferences follow the user between browsers.
  useEffect(() => {
    if (me?.prefs) set((p) => ({ ...p, ...me.prefs }));
  }, [me]);

  useEffect(() => {
    const h = document.documentElement;
    h.dataset.theme = prefs.theme;
    h.dataset.width = prefs.width;
    h.dataset.density = prefs.density;
    try {
      localStorage.setItem(LS, JSON.stringify(prefs));
    } catch {
      /* private mode */
    }
  }, [prefs]);

  const setPrefs = useCallback(
    (p: Prefs) => {
      set((cur) => ({ ...cur, ...p }));
      if (me) api.put("/api/me/prefs", p).catch(() => {});
    },
    [me],
  );

  return <PrefsContext.Provider value={{ prefs, setPrefs }}>{children}</PrefsContext.Provider>;
}

export const usePrefs = () => useContext(PrefsContext);
