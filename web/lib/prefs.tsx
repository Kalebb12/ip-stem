"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { Prefs } from "./types";
import { setSpeechLanguage, setSpeechRate } from "./speech";

export const DEFAULT_PREFS: Prefs = { textScale: 100, contrast: "default", speechRate: 1, verbosity: "full", reduceMotion: false, screenReader: false, listenLanguage: "en" };
const KEY = "sa.prefs";

interface PrefsCtx { prefs: Prefs; update: (p: Partial<Prefs>) => void; replace: (p: Partial<Prefs>) => void }
const Ctx = createContext<PrefsCtx>({ prefs: DEFAULT_PREFS, update: () => {}, replace: () => {} });

function apply(p: Prefs) {
  const html = document.documentElement;
  html.style.fontSize = `${p.textScale}%`;
  html.dataset.contrast = p.contrast;
  html.dataset.reduceMotion = p.reduceMotion ? "true" : "false";
  setSpeechRate(p.speechRate);
  setSpeechLanguage(p.listenLanguage || "en");
}

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || "null");
      if (saved) setPrefs({ ...DEFAULT_PREFS, ...saved });
    } catch { /* ignore */ }
    setLoaded(true);
  }, []);
  useEffect(() => {
    // never write the defaults over saved settings before they have been read
    if (!loaded) return;
    apply(prefs);
    try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
  }, [prefs, loaded]);
  const update = useCallback((p: Partial<Prefs>) => setPrefs((cur) => ({ ...cur, ...p })), []);
  const replace = useCallback((p: Partial<Prefs>) => setPrefs({ ...DEFAULT_PREFS, ...p }), []);
  return <Ctx.Provider value={{ prefs, update, replace }}>{children}</Ctx.Provider>;
}
export const usePrefs = () => useContext(Ctx);
