"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DiagramContent, Structure } from "@/lib/types";
import { useAnnounce } from "@/lib/announcer";
import { usePrefs } from "@/lib/prefs";
import { speak, useSpeechSupported } from "@/lib/speech";

type TabId = "overview" | "structures" | "relationships" | `process:${string}`;

export interface ExplorerProps {
  content: DiagramContent;
  idPrefix: string;
  /** Render the visual figure, given the ids that should be highlighted. */
  renderFigure?: (highlight: string[], select: (id: string) => void) => React.ReactNode;
  onViewStructure?: (id: string) => void;
  onStep?: (stepNumber: number) => void;
  headingLevel?: 2 | 3;
  compact?: boolean;
  /** Ask the explorer to open a structure from outside (e.g. a companion citation). */
  externalSelect?: { id: string; nonce: number } | null;
}

export const EVIDENCE_TEXT: Record<Structure["evidence"], string> = {
  labelled: "Labelled in the diagram",
  visible_unlabelled: "Shown in the diagram without a label",
  inferred_from_text: "From the lecture notes, not shown in the diagram",
};

function joinNames(names: string[]) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function relationshipSentences(s: Structure, byId: Map<string, Structure>): { text: string; ids: string[] }[] {
  const name = (id?: string | null) => (id && byId.get(id)?.name.toLowerCase()) || id || "";
  const out: { text: string; ids: string[] }[] = [];
  for (const c of s.connections) {
    const via = c.via ? ` through the ${name(c.via)}` : "";
    out.push(c.direction === "in"
      ? { text: `Receives blood from the ${name(c.to)}${via}.`, ids: [c.to, ...(c.via ? [c.via] : [])] }
      : { text: `Sends blood to the ${name(c.to)}${via}.`, ids: [c.to, ...(c.via ? [c.via] : [])] });
  }
  if (s.adjacent_to.length) out.push({ text: `Sits next to the ${joinNames(s.adjacent_to.map(name))}.`, ids: s.adjacent_to });
  return out;
}

export default function Explorer({ content, idPrefix, renderFigure, onViewStructure, onStep, headingLevel = 2, compact, externalSelect }: ExplorerProps) {
  const announce = useAnnounce();
  const { prefs } = usePrefs();
  const canSpeak = useSpeechSupported() && !prefs.screenReader;
  const H = (headingLevel === 2 ? "h2" : "h3") as "h2";
  const H2 = (headingLevel === 2 ? "h3" : "h4") as "h3";

  const byId = useMemo(() => new Map(content.structures.map((s) => [s.id, s])), [content]);
  const tabs = useMemo(() => {
    const t: { id: TabId; label: string }[] = [
      { id: "overview", label: "Overview" },
      { id: "structures", label: "Structures" },
      { id: "relationships", label: "Relationships" },
    ];
    content.processes.forEach((p) => t.push({ id: `process:${p.id}`, label: p.name.replace(/^path of /i, "Path of ") }));
    return t;
  }, [content]);

  const [tab, setTab] = useState<TabId>(compact ? "structures" : "overview");
  const [selected, setSelected] = useState<string>(content.structures[0]?.id ?? "");
  const [step, setStep] = useState(0);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const detailHeading = useRef<HTMLHeadingElement | null>(null);

  const current = byId.get(selected);
  const activeProcess = tab.startsWith("process:") ? content.processes.find((p) => `process:${p.id}` === tab) : undefined;

  const highlight = activeProcess ? activeProcess.steps[step]?.structure_ids ?? [] : tab === "structures" && current ? [current.id] : [];

  function describe(s: Structure, withName = true) {
    const body = prefs.verbosity === "brief" ? s.location : `${s.location} ${s.function}`;
    return withName ? `${s.name}. ${body}` : body;
  }

  function select(id: string, opts: { focus?: "item" | "detail" } = {}) {
    const s = byId.get(id);
    if (!s) return;
    if (tab !== "structures") setTab("structures");
    setSelected(id);
    onViewStructure?.(id);
    if (opts.focus === "item") itemRefs.current[id]?.focus();
    if (opts.focus === "detail") requestAnimationFrame(() => detailHeading.current?.focus());
    // when focus moves, the screen reader already says the name; announce only the new information
    announce(describe(s, !opts.focus));
  }

  function onTabKey(e: React.KeyboardEvent, i: number) {
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = tabs.length - 1;
    if (next >= 0) {
      e.preventDefault();
      setTab(tabs[next].id);
      tabRefs.current[tabs[next].id]?.focus();
    }
  }

  function onListKey(e: React.KeyboardEvent, i: number) {
    const list = content.structures;
    let next = -1;
    if (e.key === "ArrowDown") next = Math.min(i + 1, list.length - 1);
    if (e.key === "ArrowUp") next = Math.max(i - 1, 0);
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = list.length - 1;
    if (next >= 0) { e.preventDefault(); select(list[next].id, { focus: "item" }); }
  }

  function goStep(n: number) {
    if (!activeProcess) return;
    const clamped = Math.max(0, Math.min(n, activeProcess.steps.length - 1));
    setStep(clamped);
    onStep?.(clamped + 1);
    const st = activeProcess.steps[clamped];
    announce(`Step ${clamped + 1} of ${activeProcess.steps.length}. ${st.text}`);
  }

  useEffect(() => { setStep(0); }, [tab]);
  useEffect(() => {
    if (externalSelect) select(externalSelect.id, { focus: "detail" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalSelect]);

  const panelId = (t: TabId) => `${idPrefix}-panel-${t.replace(":", "-")}`;
  const tabId = (t: TabId) => `${idPrefix}-tab-${t.replace(":", "-")}`;

  return (
    <div className="explorer">
      <div role="tablist" aria-label="Ways to explore this diagram" className="tablist">
        {tabs.map((t, i) => (
          <button key={t.id} id={tabId(t.id)} ref={(el) => { tabRefs.current[t.id] = el; }}
            role="tab" type="button" className="tab" aria-selected={tab === t.id} aria-controls={panelId(t.id)}
            tabIndex={tab === t.id ? 0 : -1} onClick={() => setTab(t.id)} onKeyDown={(e) => onTabKey(e, i)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className={`explorer-body ${renderFigure ? "with-figure" : ""}`}>
        {renderFigure && <div aria-hidden={false}>{renderFigure(highlight, (id) => select(id, { focus: "detail" }))}</div>}

        <div role="tabpanel" id={panelId(tab)} aria-labelledby={tabId(tab)} tabIndex={0}>
          {tab === "overview" && (
            <div className="stack">
              <H className="sr-only">Overview</H>
              <p style={{ fontSize: "1.2rem" }}>{content.overview}</p>
              {content.orientation_note && (
                <div className="notice"><p><strong>Orientation: </strong>{content.orientation_note}</p></div>
              )}
              <p>
                This diagram has {content.structures.length} structures
                {content.processes.length ? ` and ${content.processes.length === 1 ? "one process" : `${content.processes.length} processes`} you can follow step by step` : ""}.
                Use the tabs above to explore them. Use the left and right arrow keys to move between tabs.
              </p>
              <div className="btn-row">
                <button type="button" className="btn" onClick={() => { setTab("structures"); requestAnimationFrame(() => itemRefs.current[selected]?.focus()); }}>
                  Start exploring structures
                </button>
                {canSpeak && (
                  <button type="button" className="btn secondary" onClick={() => speak(`${content.overview} ${content.orientation_note}`)}>Read overview aloud</button>
                )}
              </div>
            </div>
          )}

          {tab === "structures" && (
            <div className="explorer-body list-detail">
              <div>
                <H className={compact ? "sr-only" : "small"} id={`${idPrefix}-list-h`} style={{ fontSize: "1.05rem" }}>
                  Structures ({content.structures.length})
                </H>
                <p className="small muted" id={`${idPrefix}-list-hint`}>Use the up and down arrow keys to move through the list.</p>
                <ul className="structure-list" aria-labelledby={`${idPrefix}-list-h`} aria-describedby={`${idPrefix}-list-hint`}>
                  {content.structures.map((s, i) => (
                    <li key={s.id}>
                      <button type="button" ref={(el) => { itemRefs.current[s.id] = el; }}
                        aria-current={s.id === selected ? "true" : undefined} tabIndex={s.id === selected ? 0 : -1}
                        onClick={() => select(s.id, { focus: "detail" })} onKeyDown={(e) => onListKey(e, i)}>
                        <span>{s.name}</span>
                        {s.evidence === "inferred_from_text" && <span className="side">not in diagram</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
              {current && (
                <section className="detail" aria-labelledby={`${idPrefix}-detail-h`}>
                  <H2 id={`${idPrefix}-detail-h`} ref={detailHeading} tabIndex={-1}>{current.name}</H2>
                  <p className="small muted" style={{ margin: 0 }}>{EVIDENCE_TEXT[current.evidence]}.</p>
                  <dl>
                    <div><dt>Where it is</dt><dd>{current.location}</dd></div>
                    <div><dt>What it does</dt><dd>{current.function}</dd></div>
                    {relationshipSentences(current, byId).length > 0 && (
                      <div>
                        <dt>How it connects</dt>
                        <dd>
                          <ul style={{ margin: "0.2rem 0 0", paddingLeft: "1.1rem" }}>
                            {relationshipSentences(current, byId).map((r) => <li key={r.text}>{r.text}</li>)}
                          </ul>
                        </dd>
                      </div>
                    )}
                    {current.adjacent_to.length > 0 && (
                      <div>
                        <dt id={`${idPrefix}-goto`}>Go to a neighbouring structure</dt>
                        <dd>
                          <ul className="link-list" aria-labelledby={`${idPrefix}-goto`}>
                            {[...new Set([...current.adjacent_to, ...current.connections.map((c) => c.to)])].filter((id) => byId.has(id)).map((id) => (
                              <li key={id}><button type="button" className="chip" onClick={() => select(id, { focus: "detail" })}>{byId.get(id)!.name}</button></li>
                            ))}
                          </ul>
                        </dd>
                      </div>
                    )}
                    {current.source_quote && !compact && (
                      <div><dt>From the lecture notes</dt><dd><blockquote style={{ margin: 0, fontStyle: "italic" }}>&ldquo;{current.source_quote}&rdquo;</blockquote></dd></div>
                    )}
                  </dl>
                  {canSpeak && (
                    <button type="button" className="btn secondary small" onClick={() => speak(describe(current))}>Read {current.name} aloud</button>
                  )}
                </section>
              )}
            </div>
          )}

          {tab === "relationships" && (
            <div>
              <H className="sr-only">Relationships</H>
              <p>How each structure connects to the others. Choose a name to explore it.</p>
              <ul style={{ listStyle: "none", padding: 0 }}>
                {content.structures.map((s) => {
                  const rel = relationshipSentences(s, byId);
                  if (!rel.length) return null;
                  return (
                    <li key={s.id} style={{ marginBottom: "1rem" }}>
                      <H2 style={{ fontSize: "1.15rem", marginBottom: "0.2rem" }}>
                        <button type="button" className="chip" onClick={() => select(s.id, { focus: "detail" })}>{s.name}</button>
                      </H2>
                      <ul>{rel.map((r) => <li key={r.text}>{r.text}</li>)}</ul>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {activeProcess && (
            <div>
              <H className="sr-only">{activeProcess.name}</H>
              <p>Follow the process one step at a time. Each step is read out when you move to it.</p>
              <p className="process-count" aria-hidden="true">Step {step + 1} of {activeProcess.steps.length}</p>
              <div className="meter" aria-hidden="true" style={{ marginBottom: "1rem" }}>
                <span style={{ width: `${((step + 1) / activeProcess.steps.length) * 100}%` }} />
              </div>
              <p className="process-step"><span className="sr-only">Step {step + 1} of {activeProcess.steps.length}. </span>{activeProcess.steps[step]?.text}</p>
              {(activeProcess.steps[step]?.structure_ids.length ?? 0) > 0 && (
                <p className="small">
                  <span id={`${idPrefix}-stepstructs`}>Structures in this step: </span>
                  <span className="link-list" style={{ display: "inline-flex" }}>
                    {activeProcess.steps[step].structure_ids.filter((id) => byId.has(id)).map((id) => (
                      <button key={id} type="button" className="chip" onClick={() => select(id, { focus: "detail" })}>{byId.get(id)!.name}</button>
                    ))}
                  </span>
                </p>
              )}
              <div className="btn-row">
                <button type="button" className="btn secondary" onClick={() => goStep(step - 1)} disabled={step === 0}>Previous step</button>
                <button type="button" className="btn" onClick={() => goStep(step + 1)} disabled={step >= activeProcess.steps.length - 1}>Next step</button>
                <button type="button" className="btn secondary small" onClick={() => goStep(0)}>Start again</button>
                {canSpeak && (
                  <button type="button" className="btn secondary small" onClick={() => speak(activeProcess.steps[step].text)}>Read step aloud</button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
