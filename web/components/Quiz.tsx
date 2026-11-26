"use client";
import { useRef, useState } from "react";
import { api } from "@/lib/api";
import type { QuizItem } from "@/lib/types";
import { useAnnounce } from "@/lib/announcer";

export default function Quiz({ lessonId, items, canSubmit, onDone }: { lessonId: number; items: QuizItem[]; canSubmit: boolean; onDone?: (score: number, total: number) => void }) {
  const announce = useAnnounce();
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<{ score: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);

  if (!items.length) return <p>This lesson has no practice questions.</p>;

  function check(q: QuizItem) {
    if (answers[q.id] === undefined) { announce("Choose an answer first.", true); return; }
    setChecked((c) => ({ ...c, [q.id]: true }));
    const ok = answers[q.id] === q.answer;
    announce(`${ok ? "Correct." : `Not quite. The answer is ${q.options[q.answer]}.`} ${q.explanation}`);
  }

  async function finish() {
    setError("");
    const score = items.filter((q) => answers[q.id] === q.answer).length;
    try {
      if (canSubmit) await api(`/lessons/${lessonId}/quiz-attempts`, { method: "POST", json: { answers } });
      setResult({ score, total: items.length });
      setChecked(Object.fromEntries(items.map((q) => [q.id, true])));
      onDone?.(score, items.length);
      requestAnimationFrame(() => resultRef.current?.focus());
    } catch (e) { setError((e as Error).message); }
  }

  const answered = Object.keys(answers).length;

  return (
    <div>
      <p>{items.length} questions. Check each answer as you go, or answer them all and finish at the end. This is practice, not a test.</p>
      <ol className="quiz-list">
        {items.map((q, qi) => {
          const done = checked[q.id];
          const ok = answers[q.id] === q.answer;
          return (
            <li key={q.id}>
              <fieldset>
                <legend><span className="q-num" aria-hidden="true">{qi + 1}. </span>{q.question}</legend>
                {q.options.map((o, oi) => (
                  <label key={oi} className="choice">
                    <input type="radio" name={`quiz-${q.id}`} checked={answers[q.id] === oi} disabled={!!result}
                      onChange={() => { setAnswers((a) => ({ ...a, [q.id]: oi })); setChecked((c) => ({ ...c, [q.id]: false })); }} />
                    {o}
                  </label>
                ))}
                {!result && <button type="button" className="btn secondary small" onClick={() => check(q)}>Check answer {qi + 1}</button>}
                {done && (
                  <p className={`notice ${ok ? "ok" : "warn"}`} style={{ marginTop: "0.75rem" }}>
                    <strong>{ok ? "Correct. " : answers[q.id] === undefined ? "Not answered. " : `Not quite. The answer is: ${q.options[q.answer]}. `}</strong>{q.explanation}
                  </p>
                )}
              </fieldset>
            </li>
          );
        })}
      </ol>
      {error && <p className="field-error" role="alert">{error}</p>}
      {!result ? (
        <button type="button" className="btn" onClick={finish}>Finish and see my score ({answered} of {items.length} answered)</button>
      ) : (
        <div ref={resultRef} tabIndex={-1} className="notice ok">
          <p><strong>You scored {result.score} out of {result.total}.</strong> {result.score === result.total ? "Excellent work." : "Review the explanations above, then explore those structures again."}</p>
          <button type="button" className="btn secondary small" onClick={() => { setAnswers({}); setChecked({}); setResult(null); }}>Try the questions again</button>
        </div>
      )}
    </div>
  );
}
