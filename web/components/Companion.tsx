"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { ChatMsg, DiagramContent } from "@/lib/types";
import { speak, useSpeechSupported } from "@/lib/speech";
import { usePrefs } from "@/lib/prefs";

const GROUNDING: Record<string, string> = {
  lesson: "From your lesson",
  general: "General knowledge, not from your lesson",
  not_covered: "Not covered in your lesson",
};

type SR = { start: () => void; stop: () => void; onresult: (e: { results: { 0: { transcript: string } }[] }) => void; onend: () => void; lang: string };

export default function Companion({ lessonId, content, enabled, onCite }: { lessonId: number; content: DiagramContent; enabled: boolean; onCite: (id: string) => void }) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [canVoice, setCanVoice] = useState(false);
  const recRef = useRef<SR | null>(null);
  const { prefs } = usePrefs();
  const canSpeak = useSpeechSupported() && !prefs.screenReader;
  const logRef = useRef<HTMLDivElement>(null);
  const names = new Map(content.structures.map((s) => [s.id, s.name]));

  useEffect(() => {
    if (enabled) api<ChatMsg[]>(`/lessons/${lessonId}/questions`).then(setMsgs).catch(() => {});
    setCanVoice(typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window));
  }, [lessonId, enabled]);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [msgs]);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setError(""); setBusy(true);
    setMsgs((m) => [...m, { role: "student", text: question }]);
    setQ("");
    try {
      const a = await api<ChatMsg>(`/lessons/${lessonId}/questions`, { method: "POST", json: { question } });
      setMsgs((m) => [...m, a]);
    } catch (e) {
      setError((e as Error).message);
    } finally { setBusy(false); }
  }

  function voice() {
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) return;
    if (listening) { recRef.current?.stop(); return; }
    const rec = new Ctor();
    rec.lang = "en-GB";
    rec.onresult = (e) => { const text = e.results[0][0].transcript; setQ(text); ask(text); };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  // suggestions built from real relationships in the lesson
  const visible = content.structures.filter((s) => s.evidence !== "inferred_from_text");
  const flow = visible.flatMap((s) => s.connections.filter((c) => c.direction === "out" && c.via && names.has(c.to)).map((c) => [s.name, names.get(c.to)!]))[0];
  const focus = visible.find((s) => /ventricle/i.test(s.name)) ?? visible[0];
  const suggestions = [
    focus && `What does the ${focus.name.toLowerCase()} do?`,
    content.processes[0] && `Explain the ${content.processes[0].name.toLowerCase()}`,
    flow && `How does blood get from the ${flow[0].toLowerCase()} to the ${flow[1].toLowerCase()}?`,
  ].filter(Boolean) as string[];

  if (!enabled) return <p className="notice">The learning companion is available to students once the lesson is published.</p>;

  return (
    <div>
      <div ref={logRef} className="chat-log" role="log" aria-label="Conversation with your learning companion" aria-live="polite">
        {msgs.length === 0 && <p className="muted">No questions yet. Ask anything about this lesson. Answers come from the approved lesson content.</p>}
        {msgs.map((m, i) => (
          <div key={i} className={`msg ${m.role}`}>
            <span className="who">{m.role === "student" ? "You asked" : "Companion"}</span>
            <p style={{ margin: 0 }}>{m.text}</p>
            {m.role === "companion" && (
              <>
                {m.grounding && <span className={`grounding ${m.grounding}`}>{GROUNDING[m.grounding] ?? m.grounding}</span>}
                {!!m.cited_structure_ids?.length && (
                  <p className="small" style={{ margin: "0.4rem 0 0" }}>
                    Explore: {m.cited_structure_ids.map((id) => names.has(id) && (
                      <button key={id} type="button" className="chip" style={{ marginRight: "0.35rem" }} onClick={() => onCite(id)}>{names.get(id)}</button>
                    ))}
                  </p>
                )}
                {canSpeak && <button type="button" className="btn secondary small" style={{ marginTop: "0.5rem" }} onClick={() => speak(m.text)}>Read answer aloud</button>}
              </>
            )}
          </div>
        ))}
        {busy && <p className="muted">The companion is thinking…</p>}
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      <form onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <label htmlFor="companion-q">Your question</label>
        <span className="hint" id="companion-hint">Press Control and Enter, or use the Ask button, to send.</span>
        <textarea id="companion-q" rows={2} value={q} aria-describedby="companion-hint" onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ask(q); } }} />
        <div className="btn-row" style={{ marginTop: "0.75rem" }}>
          <button className="btn" type="submit" disabled={busy || !q.trim()}>Ask</button>
          {canVoice && <button className="btn secondary" type="button" onClick={voice} aria-pressed={listening}>{listening ? "Stop listening" : "Ask by voice"}</button>}
        </div>
      </form>
      {suggestions.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <p className="small" id="sugg-h" style={{ marginBottom: "0.3rem" }}>Or try one of these:</p>
          <ul className="link-list" aria-labelledby="sugg-h">
            {suggestions.map((s) => <li key={s}><button type="button" className="chip" onClick={() => ask(s)} disabled={busy}>{s}</button></li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
