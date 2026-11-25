"use client";
import { useEffect, useState } from "react";
import { pauseSpeech, resumeSpeech, speak, stopSpeech, useSpeechState, useSpeechSupported } from "@/lib/speech";
import { usePrefs } from "@/lib/prefs";
import { useSystem } from "@/lib/system";

/** Play / pause / start again / speed for a block of text, or for the element with id `targetId`. */
export default function ListenBar({ text, targetId, label = "Listen" }: { text?: string; targetId?: string; label?: string }) {
  const { prefs, update } = usePrefs();
  const supported = useSpeechSupported();
  const system = useSystem();
  const langs = system?.languages.enabled ? system.languages.options : null;
  const global = useSpeechState();
  const [mine, setMine] = useState(false); // is the current speech ours?
  const [loading, setLoading] = useState(false);
  useEffect(() => () => { if (mine) stopSpeech(); }, [mine]);
  useEffect(() => { if (global === "idle") { setMine(false); setLoading(false); } }, [global]);
  // screen-reader users already have a voice, unless they want to hear the lesson in another language
  if (!supported || (prefs.screenReader && prefs.listenLanguage === "en")) return null;

  const state = mine ? global : "idle";
  const getText = () => text ?? (targetId ? (document.getElementById(targetId)?.innerText ?? "").replace(/\n+/g, ". ") : "");
  const play = async () => {
    setMine(true);
    setLoading(true);
    await speak(getText());
    setLoading(false);
  };

  return (
    <div className="listen-bar" role="group" aria-label={`${label}: listen controls`}>
      <span className="title" aria-hidden="true">{label}</span>
      {state === "idle" && <button type="button" className="btn small" onClick={play}>Play {label.toLowerCase()}</button>}
      {state === "playing" && <button type="button" className="btn small" onClick={pauseSpeech}>{loading ? (prefs.listenLanguage !== "en" ? "Translating…" : "Starting…") : "Pause"}</button>}
      {state === "paused" && <button type="button" className="btn small" onClick={resumeSpeech}>Resume</button>}
      <button type="button" className="btn secondary small" onClick={play}>Start again</button>
      {state !== "idle" && <button type="button" className="btn secondary small" onClick={stopSpeech}>Stop</button>}
      <label className="sr-only" htmlFor={`rate-${label}`}>Speech speed</label>
      <select id={`rate-${label}`} value={prefs.speechRate} onChange={(e) => update({ speechRate: Number(e.target.value) })}>
        {[0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => <option key={r} value={r}>{r}× speed</option>)}
      </select>
      {langs && (
        <>
          <label className="sr-only" htmlFor={`lang-${label}`}>Listening language</label>
          <select id={`lang-${label}`} value={prefs.listenLanguage} onChange={(e) => { stopSpeech(); update({ listenLanguage: e.target.value }); }}>
            {Object.entries(langs).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </>
      )}
    </div>
  );
}
