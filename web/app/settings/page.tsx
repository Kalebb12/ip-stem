"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { usePrefs } from "@/lib/prefs";
import { useAuth, useTitle } from "@/lib/auth";
import { api } from "@/lib/api";
import { useAnnounce } from "@/lib/announcer";
import { speak, useSpeechSupported } from "@/lib/speech";
import type { Prefs } from "@/lib/types";
import { useSystem } from "@/lib/system";

function Settings() {
  useTitle("Accessibility settings");
  const { prefs, update } = usePrefs();
  const { user } = useAuth();
  const announce = useAnnounce();
  const welcome = useSearchParams().get("welcome");
  const [saved, setSaved] = useState("");
  const canSpeak = useSpeechSupported();
  const system = useSystem();

  function change(p: Partial<Prefs>) {
    update(p);
    setSaved("");
  }
  async function save() {
    if (user) {
      try { await api("/auth/me/prefs", { method: "PUT", json: prefs }); } catch { /* local copy still saved */ }
    }
    const msg = user ? "Settings saved to your account." : "Settings saved on this device.";
    setSaved(msg);
    announce(msg);
  }

  return (
    <div className="wrap" style={{ maxWidth: "46rem" }}>
      <div className="page-head">
        <h1>Accessibility settings</h1>
        <p>{welcome ? "Welcome. Set things up the way you like to read. You can change these at any time from Settings." : "Changes apply and are saved straight away. When you are signed in, they follow you to every device."}</p>
      </div>
      <form className="panel" onSubmit={(e) => { e.preventDefault(); save(); }}>
        <fieldset>
          <legend>Screen reader</legend>
          <label className="choice">
            <input type="checkbox" checked={prefs.screenReader} onChange={(e) => change({ screenReader: e.target.checked })} />
            <span>I use a screen reader. Hide SenseAtlas&rsquo;s own read-aloud buttons, so only my screen reader talks. If you choose a listening language other than English, the listen controls stay so you can hear lessons in that language.</span>
          </label>
        </fieldset>
        <fieldset aria-describedby="lang-hint">
          <legend>Listening language</legend>
          <p className="hint" id="lang-hint">
            Lessons are written in English. Other languages are translated automatically by YarnGPT and read aloud with a Nigerian voice.
            Machine translation can get anatomy terms wrong, so check important details against the English text.
          </p>
          {system?.languages.enabled ? (
            Object.entries(system.languages.options).map(([code, name]) => (
              <label key={code} className="choice"><input type="radio" name="lang" checked={prefs.listenLanguage === code} onChange={() => change({ listenLanguage: code })} /> {name}</label>
            ))
          ) : (
            <p className="small">Other languages are not switched on for this site yet. An administrator needs to add a YarnGPT API key.</p>
          )}
        </fieldset>
        <fieldset>
          <legend>Text size</legend>
          {[100, 125, 150, 175, 200].map((v) => (
            <label key={v} className="choice"><input type="radio" name="size" checked={prefs.textScale === v} onChange={() => change({ textScale: v })} /> {v}%{v === 100 ? " (standard)" : ""}</label>
          ))}
        </fieldset>
        <fieldset>
          <legend>Colours</legend>
          <label className="choice"><input type="radio" name="contrast" checked={prefs.contrast === "default"} onChange={() => change({ contrast: "default" })} /> Standard</label>
          <label className="choice"><input type="radio" name="contrast" checked={prefs.contrast === "high"} onChange={() => change({ contrast: "high" })} /> High contrast: black on white with thicker borders</label>
          <label className="choice"><input type="radio" name="contrast" checked={prefs.contrast === "dark"} onChange={() => change({ contrast: "dark" })} /> Dark: light text on black</label>
        </fieldset>
        <fieldset>
          <legend>How much is announced when you move through a diagram</legend>
          <label className="choice"><input type="radio" name="verb" checked={prefs.verbosity === "full"} onChange={() => change({ verbosity: "full" })} /> Name, position and function</label>
          <label className="choice"><input type="radio" name="verb" checked={prefs.verbosity === "brief"} onChange={() => change({ verbosity: "brief" })} /> Name and position only</label>
        </fieldset>
        <div className="field">
          <label htmlFor="rate">Built-in speech speed</label>
          <span className="hint" id="rate-hint">Used by the Listen and Read aloud buttons. Your screen reader keeps its own speed. Pressing any key outside the listen controls stops the voice.</span>
          <select id="rate" aria-describedby="rate-hint" value={prefs.speechRate} onChange={(e) => change({ speechRate: Number(e.target.value) })}>
            {[0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => <option key={r} value={r}>{r}× {r === 1 ? "(normal)" : ""}</option>)}
          </select>
          {canSpeak && <button type="button" className="btn secondary small" style={{ marginTop: "0.6rem" }} onClick={() => speak("This is how fast the built-in voice will read.")}>Test speech speed</button>}
        </div>
        <label className="choice" style={{ marginBottom: "1.25rem" }}>
          <input type="checkbox" checked={prefs.reduceMotion} onChange={(e) => change({ reduceMotion: e.target.checked })} /> Turn off animation
        </label>
        <div className="btn-row">
          <button className="btn" type="submit">Save settings</button>
          {user && <Link href={user.role === "teacher" ? "/teacher" : "/student"}>Back to {user.role === "teacher" ? "my resources" : "my lessons"}</Link>}
        </div>
        {saved && <p className="notice ok" style={{ marginTop: "1rem" }}>{saved}</p>}
      </form>
    </div>
  );
}
export default function SettingsPage() { return <Suspense><Settings /></Suspense>; }
