"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { api, imageUrl } from "@/lib/api";
import { useRequireRole, useTitle } from "@/lib/auth";
import { useAnnounce } from "@/lib/announcer";
import type { DiagramContent, ResourceDetail, Structure, QuizItem } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";
import { DiagramFigure } from "@/components/Figures";
import { EVIDENCE_TEXT } from "@/components/Explorer";
import FormError from "@/components/FormError";

const STEPS = [
  { key: "extracting", label: "Extracting text and pages" },
  { key: "detecting", label: "Finding diagrams" },
  { key: "interpreting", label: "Reading the diagram" },
  { key: "validating", label: "Checking quality and flagging uncertainty" },
];

interface DiagramRow { id: number; page: number; caption: string; found_labels: string[]; content: DiagramContent | null; version: number }

const needsReview = (x: { flags?: string[]; reviewed?: boolean }) => !!x.flags?.length && !x.reviewed;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `item_${Date.now()}`;

export default function ResourcePage() {
  const { id } = useParams<{ id: string }>();
  const user = useRequireRole("teacher");
  const announce = useAnnounce();
  const [res, setRes] = useState<ResourceDetail | null>(null);
  const [diagrams, setDiagrams] = useState<DiagramRow[]>([]);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  useTitle(res ? `Review: ${res.title}` : "Resource");

  const loadAll = useCallback(async () => {
    const r = await api<ResourceDetail>(`/resources/${id}`);
    setRes(r);
    if (!["processing", "uploaded", "failed"].includes(r.status)) setDiagrams(await api<DiagramRow[]>(`/resources/${id}/diagrams`));
    return r;
  }, [id]);

  useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setTimeout>;
    let lastStep = "";
    const tick = async () => {
      try {
        const r = await loadAll();
        if (r.progress_step !== lastStep && (r.status === "processing" || r.status === "uploaded")) {
          const s = STEPS.find((x) => x.key === r.progress_step);
          if (s) announce(`${s.label}…`);
          lastStep = r.progress_step;
        }
        if (r.status === "processing" || r.status === "uploaded") timer = setTimeout(tick, 1500);
        else if (lastStep) announce(r.status === "failed" ? "Processing failed." : "Processing finished. The description is ready for you to review.");
      } catch (e) { setLoadError((e as Error).message); }
    };
    tick();
    return () => clearTimeout(timer);
  }, [user, loadAll, announce]);

  async function act(path: string, done: string) {
    setError("");
    try {
      await api(`/resources/${id}/${path}`, { method: "POST" });
      await loadAll();
      announce(done);
    } catch (e) { setError((e as Error).message); }
  }

  if (!user || (!res && !loadError)) return <div className="wrap page-head"><p>Loading…</p></div>;
  if (loadError && !res) return <div className="wrap page-head"><h1>Resource not available</h1><p>{loadError}</p><Link href="/teacher">Back to my resources</Link></div>;
  const r = res!;
  const processing = r.status === "processing" || r.status === "uploaded";
  const stepIdx = STEPS.findIndex((s) => s.key === r.progress_step);

  return (
    <div className="wrap">
      <div className="page-head">
        <nav aria-label="Breadcrumb" className="crumbs"><ol><li><Link href="/teacher">My resources</Link></li><li aria-current="page">{r.title}</li></ol></nav>
        <h1>{r.title}</h1>
        <p className="btn-row" style={{ gap: "0.6rem" }}><StatusBadge status={r.status} /> <span className="muted small">{[r.subject, r.topic, r.audience].filter(Boolean).join(", ")} · {r.filename}</span></p>
      </div>
      <FormError message={error} />

      {processing && (
        <section className="panel" aria-labelledby="proc-h">
          <h2 id="proc-h">Processing your upload</h2>
          <p>This usually takes under a minute. You can leave this page; processing continues in the background.</p>
          <ol className="steps">
            {STEPS.map((s, i) => {
              const state = i < stepIdx ? "done" : i === stepIdx ? "active" : "todo";
              return <li key={s.key} data-state={state}><span className="dot" aria-hidden="true">{state === "done" ? "✓" : i + 1}</span>{s.label}<span className="sr-only">{state === "done" ? ", done" : state === "active" ? ", in progress" : ", waiting"}</span></li>;
            })}
          </ol>
        </section>
      )}

      {r.status === "failed" && (
        <section className="notice error" aria-labelledby="fail-h">
          <h2 id="fail-h">Processing failed</h2>
          <p>{r.error}</p>
          <button className="btn" type="button" onClick={() => act("process", "Processing started again.")}>Try processing again</button>
        </section>
      )}

      {!processing && r.status !== "failed" && (
        <>
          <PublishBar res={r} onApprove={() => act("approve", "Approved. You can now publish it.")}
            onPublish={() => act("publish", "Published. Students can now open this lesson.")}
            onWithdraw={() => act("withdraw", "Withdrawn. Students can no longer see this lesson.")} />
          {diagrams.map((d) => d.content && (
            <DiagramEditor key={d.id} row={d as DiagramRow & { content: DiagramContent }}
              onSaved={async (row) => { setDiagrams((ds) => ds.map((x) => (x.id === row.id ? row : x))); await loadAll(); }} />
          ))}
          <details className="panel" style={{ marginTop: "2rem" }}>
            <summary><strong>Extracted lecture text and review history</strong></summary>
            <h2 style={{ fontSize: "1.2rem", marginTop: "1rem" }}>Extracted text</h2>
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: "0.95rem" }}>{r.text_excerpt || "No text was found in this file."}</pre>
            <h2 style={{ fontSize: "1.2rem" }}>History</h2>
            <ul>{r.history.map((h, i) => <li key={i}>{h.action} on {new Date(h.created_at).toLocaleString()}{h.note ? `: ${h.note}` : ""}</li>)}{!r.history.length && <li>No changes yet.</li>}</ul>
            <button type="button" className="btn secondary small" onClick={() => { if (confirm("Run the AI again? Your edits to this resource will be replaced.")) act("process", "Processing started again."); }}>Process the file again</button>
          </details>
        </>
      )}
    </div>
  );
}

function PublishBar({ res, onApprove, onPublish, onWithdraw }: { res: ResourceDetail; onApprove: () => void; onPublish: () => void; onWithdraw: () => void }) {
  const flags = res.unresolved_flags ?? 0;
  return (
    <section className="panel" aria-labelledby="pub-h" style={{ marginBottom: "1.5rem" }}>
      <h2 id="pub-h" style={{ fontSize: "1.35rem" }}>Review and publish</h2>
      {res.status === "needs_review" && (
        <>
          <p id="approve-why">{flags ? `${flags} flagged item${flags === 1 ? "" : "s"} still need${flags === 1 ? "s" : ""} checking. Open each one marked “Needs checking”, correct it if needed, then tick “I have checked this” and save.` : "Everything flagged has been checked. Approve the content when you are happy with it."}</p>
          <div className="btn-row">
            <button type="button" className="btn" onClick={onApprove} disabled={flags > 0} aria-describedby="approve-why">Approve content</button>
            <Link className="btn secondary" href={`/student/lessons/${res.id}`}>Preview as a student</Link>
          </div>
        </>
      )}
      {res.status === "approved" && (
        <>
          <p>Approved. Publish to make it available to your students.</p>
          <div className="btn-row"><button type="button" className="btn" onClick={onPublish}>Publish to students</button><Link className="btn secondary" href={`/student/lessons/${res.id}`}>Preview as a student</Link></div>
        </>
      )}
      {res.status === "published" && (
        <>
          <p className="notice ok">Published{res.published_at ? ` on ${new Date(res.published_at).toLocaleString()}` : ""}. Students can open this lesson. Editing will take it back to review until you approve it again.</p>
          <div className="btn-row" style={{ marginTop: "1rem" }}><Link className="btn secondary" href={`/student/lessons/${res.id}`}>View as a student</Link><button type="button" className="btn danger" onClick={onWithdraw}>Withdraw from students</button></div>
        </>
      )}
    </section>
  );
}

function DiagramEditor({ row, onSaved }: { row: DiagramRow & { content: DiagramContent }; onSaved: (row: DiagramRow) => Promise<void> }) {
  const announce = useAnnounce();
  const [c, setC] = useState<DiagramContent>(() => ({
    ...row.content,
    // flagged items first, so the teacher meets them straight away
    structures: [...row.content.structures].sort((a, b) => Number(needsReview(b)) - Number(needsReview(a))),
  }));
  const [dirty, setDirty] = useState(false);
  const [focusId, setFocusId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const newRef = useRef<string | null>(null);

  const edit = (fn: (draft: DiagramContent) => void) => {
    setC((cur) => { const next = structuredClone(cur); fn(next); return next; });
    setDirty(true);
  };
  const editS = (i: number, patch: Partial<Structure>) => edit((d) => { Object.assign(d.structures[i], patch); });
  const editQ = (i: number, patch: Partial<QuizItem>) => edit((d) => { Object.assign(d.quiz[i], patch); });

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (newRef.current) { document.getElementById(`s-name-${newRef.current}`)?.focus(); newRef.current = null; }
  }, [c.structures.length]);

  async function save() {
    setSaving(true); setError("");
    try {
      const out = await api<{ content: DiagramContent; version: number; unresolved_flags: number }>(`/diagrams/${row.id}/content`, { method: "PATCH", json: { content: c, version: row.version } });
      setDirty(false);
      announce(`Changes saved. ${out.unresolved_flags ? `${out.unresolved_flags} flagged items still need checking.` : "No flagged items left."}`);
      await onSaved({ ...row, content: out.content, version: out.version });
    } catch (e) { setError((e as Error).message); } finally { setSaving(false); }
  }

  const flagged = c.structures.filter(needsReview).length + c.quiz.filter(needsReview).length;

  return (
    <section aria-labelledby={`d-${row.id}-h`} style={{ marginBottom: "2.5rem" }}>
      <h2 id={`d-${row.id}-h`}>Diagram on page {row.page}</h2>
      <p className="muted small">Generated by {c.generated_by === "demo-fixture" ? "built-in demo content" : c.generated_by === "offline-draft" ? "an offline draft from the figure labels" : `${c.generated_by} (AI-assisted, check it carefully)`}.</p>
      {c.ai_note && <div className="notice warn" style={{ marginBottom: "1rem" }}><p><strong>Live AI was not used. </strong>{c.ai_note}</p></div>}
      <FormError message={error} />
      <div className="review-layout">
        <div className="sticky stack">
          <DiagramFigure src={imageUrl(row.id)} content={c} highlight={focusId ? [focusId] : []} caption={row.caption} />
          {row.found_labels.length > 0 && <p className="small"><strong>Label text found in the figure:</strong> {row.found_labels.join("; ")}</p>}
          <div className="panel" style={{ padding: "1rem" }}>
            <p style={{ margin: 0 }} aria-live="polite"><strong>{flagged ? `${flagged} item${flagged === 1 ? "" : "s"} need checking.` : "No items need checking."}</strong> {dirty ? "You have unsaved changes." : "All changes saved."}</p>
            <div className="btn-row" style={{ marginTop: "0.75rem" }}>
              <button type="button" className="btn" onClick={save} disabled={!dirty || saving}>{saving ? "Saving…" : "Save changes"}</button>
            </div>
          </div>
        </div>

        <div className="stack">
          <div className="field">
            <label htmlFor={`ov-${row.id}`}>Overview</label>
            <span className="hint">Read first by students. Say what the diagram shows, its viewpoint, and what colours and arrows mean.</span>
            <textarea id={`ov-${row.id}`} value={c.overview} onChange={(e) => edit((d) => { d.overview = e.target.value; })} rows={5} />
          </div>
          <div className="field">
            <label htmlFor={`or-${row.id}`}>Orientation note</label>
            <textarea id={`or-${row.id}`} value={c.orientation_note} onChange={(e) => edit((d) => { d.orientation_note = e.target.value; })} rows={2} />
          </div>

          <h3>Structures ({c.structures.length})</h3>
          <ul className="edit-list">
            {c.structures.map((s, i) => {
              const flaggedS = !!s.flags?.length;
              return (
                <li key={s.id}>
                  <details className={`edit-card ${flaggedS ? "flagged" : ""} ${s.reviewed ? "resolved" : ""}`} open={needsReview(s)}
                    onToggle={(e) => { if ((e.target as HTMLDetailsElement).open) setFocusId(s.id); }} onFocus={() => setFocusId(s.id)}>
                    <summary>
                      {s.name || "New structure"}
                      {flaggedS && !s.reviewed && <span className="badge flag">Needs checking</span>}
                      {flaggedS && s.reviewed && <span className="badge high">Checked</span>}
                      <span className={`badge ${s.confidence}`}>{s.confidence} confidence</span>
                    </summary>
                    {flaggedS && <ul className="flags" aria-label="Why this was flagged">{s.flags!.map((f) => <li key={f}>{f}</li>)}</ul>}
                    <div className="two-col" style={{ marginTop: "0.75rem" }}>
                      <div className="field"><label htmlFor={`s-name-${s.id}`}>Name</label><input id={`s-name-${s.id}`} type="text" value={s.name} onChange={(e) => editS(i, { name: e.target.value })} /></div>
                      <div className="field">
                        <label htmlFor={`s-ev-${s.id}`}>Where this comes from</label>
                        <select id={`s-ev-${s.id}`} value={s.evidence} onChange={(e) => editS(i, { evidence: e.target.value as Structure["evidence"] })}>
                          {Object.entries(EVIDENCE_TEXT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="field"><label htmlFor={`s-loc-${s.id}`}>Where it is</label><textarea id={`s-loc-${s.id}`} rows={2} value={s.location} onChange={(e) => editS(i, { location: e.target.value })} /></div>
                    <div className="field"><label htmlFor={`s-fn-${s.id}`}>What it does</label><textarea id={`s-fn-${s.id}`} rows={2} value={s.function} onChange={(e) => editS(i, { function: e.target.value })} /></div>
                    <div className="field">
                      <label htmlFor={`s-conf-${s.id}`}>Confidence</label>
                      <select id={`s-conf-${s.id}`} value={s.confidence} onChange={(e) => editS(i, { confidence: e.target.value as Structure["confidence"] })}>
                        <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                      </select>
                    </div>
                    <div className="btn-row">
                      {flaggedS && <label className="choice"><input type="checkbox" checked={!!s.reviewed} onChange={(e) => editS(i, { reviewed: e.target.checked })} /> I have checked this</label>}
                      <button type="button" className="btn danger small" onClick={() => { if (confirm(`Remove ${s.name}?`)) { edit((d) => { d.structures.splice(i, 1); }); announce(`${s.name} removed`); } }}>Remove {s.name}</button>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>
          <button type="button" className="btn secondary" onClick={() => { const nid = slug(`structure ${c.structures.length + 1} ${Date.now() % 1000}`); newRef.current = nid; edit((d) => { d.structures.push({ id: nid, name: "", evidence: "labelled", confidence: "high", location: "", function: "", adjacent_to: [], connections: [], reviewed: true, flags: [] }); }); }}>Add a structure</button>

          {c.processes.map((p, pi) => (
            <div key={p.id}>
              <h3>{p.name}</h3>
              <ol className="edit-list" style={{ listStyle: "decimal", paddingLeft: "1.5rem" }}>
                {p.steps.map((st, si) => (
                  <li key={si}>
                    <label className="sr-only" htmlFor={`p-${p.id}-${si}`}>Step {si + 1}</label>
                    <textarea id={`p-${p.id}-${si}`} rows={2} value={st.text} onChange={(e) => edit((d) => { d.processes[pi].steps[si].text = e.target.value; })} />
                  </li>
                ))}
              </ol>
              <button type="button" className="btn secondary small" onClick={() => edit((d) => { d.processes[pi].steps.push({ text: "", structure_ids: [] }); })}>Add a step</button>
            </div>
          ))}

          <h3>Practice questions ({c.quiz.length})</h3>
          <ul className="edit-list">
            {c.quiz.map((q, qi) => (
              <li key={q.id} className={`edit-card ${q.flags?.length ? "flagged" : ""} ${q.reviewed ? "resolved" : ""}`}>
                {!!q.flags?.length && <ul className="flags">{q.flags.map((f) => <li key={f}>{f}</li>)}</ul>}
                <div className="field"><label htmlFor={`q-${q.id}`}>Question {qi + 1}</label><input id={`q-${q.id}`} type="text" value={q.question} onChange={(e) => editQ(qi, { question: e.target.value })} /></div>
                <fieldset>
                  <legend>Options. Select the correct answer.</legend>
                  {q.options.map((o, oi) => (
                    <div key={oi} className="choice" style={{ alignItems: "center" }}>
                      <input type="radio" name={`ans-${q.id}`} checked={q.answer === oi} onChange={() => editQ(qi, { answer: oi })} aria-label={`Option ${oi + 1} is correct`} />
                      <label className="sr-only" htmlFor={`q-${q.id}-o${oi}`}>Option {oi + 1}</label>
                      <input id={`q-${q.id}-o${oi}`} type="text" value={o} onChange={(e) => edit((d) => { d.quiz[qi].options[oi] = e.target.value; })} />
                    </div>
                  ))}
                </fieldset>
                <div className="field"><label htmlFor={`qe-${q.id}`}>Explanation shown after answering</label><textarea id={`qe-${q.id}`} rows={2} value={q.explanation} onChange={(e) => editQ(qi, { explanation: e.target.value })} /></div>
                <div className="btn-row">
                  {!!q.flags?.length && <label className="choice"><input type="checkbox" checked={!!q.reviewed} onChange={(e) => editQ(qi, { reviewed: e.target.checked })} /> I have checked this</label>}
                  <button type="button" className="btn danger small" onClick={() => edit((d) => { d.quiz.splice(qi, 1); })}>Remove question {qi + 1}</button>
                </div>
              </li>
            ))}
          </ul>
          <div className="btn-row"><button type="button" className="btn" onClick={save} disabled={!dirty || saving}>{saving ? "Saving…" : "Save changes"}</button></div>
        </div>
      </div>
    </section>
  );
}
