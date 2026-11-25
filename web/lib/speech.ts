"use client";
import { useEffect, useState } from "react";
import { API_URL } from "./api";

// Speech for low-vision users and listeners. Screen-reader users mostly rely on their own reader.
//
// Two engines:
//  1. the browser's own voices (instant, works offline): used whenever the browser has any;
//  2. the API's /tts endpoint (Groq voice): the alternative when it has none,
//     e.g. Chrome on Linux, which has no voices unless started with --enable-speech-dispatcher.

let currentRate = 1;
export function setSpeechRate(r: number) { currentRate = r; }
// "en" = browser voice (or Groq when the browser has none); anything else = YarnGPT translates and speaks
let currentLang = "en";
export function setSpeechLanguage(lang: string) { currentLang = lang; }

type State = "idle" | "playing" | "paused";
let state: State = "idle";
let session = 0; // bumps on every new speak/stop so stale callbacks are ignored
let audio: HTMLAudioElement | null = null;
let keepAlive: SpeechSynthesisUtterance[] = []; // Chrome drops utterances that get garbage-collected
const listeners = new Set<(s: State) => void>();

function setState(s: State) { state = s; listeners.forEach((l) => l(s)); }
export function getSpeechState() { return state; }
export function onSpeechState(fn: (s: State) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

export function speechSupported() {
  return typeof window !== "undefined" && (typeof Audio !== "undefined" || "speechSynthesis" in window);
}

// Voices load asynchronously; start loading as soon as the module runs and remember the answer.
let voiceCache: SpeechSynthesisVoice[] | null = null;
let voiceLoad: Promise<SpeechSynthesisVoice[]> | null = null;
function browserVoices(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return Promise.resolve([]);
  if (voiceCache?.length) return Promise.resolve(voiceCache);
  if (!voiceLoad) {
    voiceLoad = new Promise((resolve) => {
      const finish = () => { voiceCache = window.speechSynthesis.getVoices(); resolve(voiceCache); };
      if (window.speechSynthesis.getVoices().length) return finish();
      window.speechSynthesis.addEventListener("voiceschanged", finish, { once: true });
      setTimeout(finish, 2000); // browsers with no voices never fire voiceschanged
    });
  }
  return voiceLoad;
}
if (typeof window !== "undefined") browserVoices();

// Like a screen reader: pressing a key to move on stops the app's voice, so it never talks over
// the user's own screen reader. Keys pressed on the listen controls themselves don't count.
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => {
    if (state === "idle" || ["Shift", "Control", "Alt", "Meta", "CapsLock", "Insert"].includes(e.key)) return;
    const t = e.target as Element | null;
    if (t?.closest?.(".listen-bar, [data-speech-control]")) return;
    stopSpeech();
  }, true);
}

/** Split into sentence-sized pieces: Chrome cuts off long utterances and the server caps text length. */
function chunks(text: string, max = 280, firstMax = max): string[] {
  const sentences = text.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    const limit = out.length ? max : firstMax; // a short first piece starts speech sooner
    if ((cur + s).length > limit && cur) { out.push(cur.trim()); cur = ""; }
    if (s.length > max) { for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max)); continue; }
    cur += s;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function pickVoice(voices: SpeechSynthesisVoice[]) {
  return voices.find((v) => /^en[-_]GB/i.test(v.lang) && !/espeak/i.test(v.name))
    ?? voices.find((v) => /^en/i.test(v.lang) && !/espeak/i.test(v.name))
    ?? voices.find((v) => /^en[-_]GB/i.test(v.lang))
    ?? voices.find((v) => /^en/i.test(v.lang))
    ?? voices[0];
}

async function speakBrowser(parts: string[], my: number, voices: SpeechSynthesisVoice[], onEnd?: () => void) {
  const voice = pickVoice(voices);
  keepAlive = parts.map((p, i) => {
    const u = new SpeechSynthesisUtterance(p);
    u.voice = voice; u.lang = voice?.lang ?? "en-GB"; u.rate = currentRate;
    if (i === parts.length - 1) {
      u.onend = () => { if (my === session) { setState("idle"); onEnd?.(); } };
    }
    u.onerror = (e) => { if (my === session && e.error !== "interrupted" && e.error !== "canceled") { setState("idle"); onEnd?.(); } };
    return u;
  });
  keepAlive.forEach((u) => window.speechSynthesis.speak(u));
}

/** English (Groq): fetch the whole WAV. Translated (YarnGPT): get a ticket and stream it,
 *  so playback starts within seconds while the rest is still being generated. */
async function audioSource(text: string): Promise<{ url: string; revoke: boolean }> {
  if (currentLang !== "en") {
    const res = await fetch(`${API_URL}/tts/ticket`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, lang: currentLang }),
    });
    if (!res.ok) throw new Error(await errorDetail(res));
    const { url } = await res.json();
    return { url: `${API_URL}${url}`, revoke: false };
  }
  const res = await fetch(`${API_URL}/tts`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, lang: "en" }),
  });
  if (!res.ok) throw new Error(await errorDetail(res));
  return { url: URL.createObjectURL(await res.blob()), revoke: true };
}

async function errorDetail(res: Response) {
  try { const d = await res.json(); if (typeof d.detail === "string") return d.detail; } catch { /* not json */ }
  return `speech service returned ${res.status}`;
}

function makeAudio(src: { url: string }) {
  const a = new Audio();
  a.preload = "auto";
  a.src = src.url; // starts downloading (and, for YarnGPT, generating) straight away
  return a;
}

/** Resolves once the first chunk is playing; the rest plays in the background. */
function speakServer(parts: string[], my: number, onEnd?: () => void): Promise<void> {
  return new Promise((started, failed) => {
    let begun = false;
    (async () => {
      let nextSrc: Promise<{ url: string; revoke: boolean }> | null = audioSource(parts[0]);
      let nextEl: HTMLAudioElement | null = null;
      for (let i = 0; i < parts.length; i++) {
        const src = await nextSrc!;
        if (my !== session) { if (src.revoke) URL.revokeObjectURL(src.url); return; }
        const el = nextEl ?? makeAudio(src);
        nextEl = null;
        nextSrc = i + 1 < parts.length ? audioSource(parts[i + 1]) : null;
        await new Promise<void>((resolve, reject) => {
          audio = el;
          audio.playbackRate = currentRate;
          audio.onended = () => { if (src.revoke) URL.revokeObjectURL(src.url); resolve(); };
          audio.onerror = () => reject(new Error("the audio could not be played"));
          audio.play().then(() => {
            if (!begun) { begun = true; started(); }
            // warm up the next piece while this one plays
            nextSrc?.then((n) => { if (my === session) nextEl = makeAudio(n); }).catch(() => {});
          }, reject);
        });
        if (my !== session) return;
      }
      setState("idle");
      onEnd?.();
    })().catch((e) => {
      if (!begun) { failed(e); return; }
      if (my === session) { setState("idle"); window.dispatchEvent(new CustomEvent("sa-speech-error", { detail: `Speech stopped: ${(e as Error).message}` })); }
    });
  });
}

/** Speak text. Resolves once speech has started (or failed); `onEnd` fires when it finishes. */
export async function speak(text: string, opts: { onEnd?: () => void; onError?: (msg: string) => void } = {}) {
  stopSpeech();
  const my = ++session;
  const translated = currentLang !== "en";
  // translation needs context, so YarnGPT gets bigger pieces (and fewer paid calls)
  // YarnGPT translates a whole piece before it starts speaking: keep the first piece to about a
  // sentence so listening starts quickly, then use bigger pieces (generated while earlier ones play)
  const parts = translated ? chunks(text, 600, 140) : chunks(text, 280);
  if (!parts.length) return false;
  setState("playing");
  try {
    const voices = translated ? [] : await browserVoices();
    if (my !== session) return false;
    if (voices.length) await speakBrowser(parts, my, voices, opts.onEnd);
    else await speakServer(parts, my, opts.onEnd);
    return true;
  } catch (e) {
    if (my === session) {
      setState("idle");
      const msg = translated
        ? `Listening in your chosen language failed. ${(e as Error).message} You can switch back to English in the listen controls or Settings.`
        : `This browser has no built-in voices, and the fallback voice failed. ${(e as Error).message}`;
      opts.onError?.(msg);
      window.dispatchEvent(new CustomEvent("sa-speech-error", { detail: msg }));
    }
    return false;
  }
}

export function pauseSpeech() {
  if (state !== "playing") return;
  if (audio && !audio.paused) audio.pause();
  else if ("speechSynthesis" in window) window.speechSynthesis.pause();
  setState("paused");
}
export function resumeSpeech() {
  if (state !== "paused") return;
  if (audio && audio.paused && !audio.ended) audio.play().catch(() => {});
  else if ("speechSynthesis" in window) window.speechSynthesis.resume();
  setState("playing");
}
export function stopSpeech() {
  session++;
  if (audio) { audio.pause(); audio = null; }
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  keepAlive = [];
  if (state !== "idle") setState("idle");
}

/** Hydration-safe: false on the server and first client render, then the real value. */
export function useSpeechSupported() {
  const [ok, setOk] = useState(false);
  useEffect(() => setOk(speechSupported()), []);
  return ok;
}

/** Current speech state, kept in sync across components. */
export function useSpeechState() {
  const [s, setS] = useState<State>("idle");
  useEffect(() => onSpeechState(setS), []);
  return s;
}
