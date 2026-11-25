"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { api, imageUrl } from "@/lib/api";
import { useAuth, useTitle } from "@/lib/auth";
import type { Lesson, Progress } from "@/lib/types";
import Explorer from "@/components/Explorer";
import { DiagramFigure } from "@/components/Figures";
import ListenBar from "@/components/ListenBar";
import Companion from "@/components/Companion";
import Quiz from "@/components/Quiz";

export default function LessonPage() {
  const { id } = useParams<{ id: string }>();
  const { user, ready, signedOut } = useAuth();
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [cite, setCite] = useState<{ id: string; nonce: number } | null>(null);
  const exploreRef = useRef<HTMLElement>(null);
  useTitle(lesson ? lesson.title : "Lesson");

  useEffect(() => {
    if (!ready) return;
    if (!user) { window.location.href = signedOut ? "/" : `/login?next=/student/lessons/${id}`; return; }
    api<Lesson>(`/lessons/${id}`).then((l) => { setLesson(l); setProgress(l.progress); }).catch((e) => setError(e.message));
  }, [ready, user, id, signedOut]);

  if (error) return <div className="wrap page-head"><h1>Lesson not available</h1><p>{error}</p><Link href="/student">Back to my lessons</Link></div>;
  if (!lesson || !user) return <div className="wrap page-head"><p>Loading lesson…</p></div>;

  const isStudent = user.role === "student";
  const d = lesson.diagrams[0];
  const content = d?.content;
  const total = lesson.diagrams.reduce((n, x) => n + x.content.structures.length, 0);

  const track = (structure_id?: string, steps_completed?: number) => {
    if (!isStudent) return;
    api<Progress>(`/lessons/${lesson.id}/progress`, { method: "POST", json: { structure_id, steps_completed } }).then(setProgress).catch(() => {});
  };

  const listenText = content
    ? [content.overview, content.orientation_note, ...content.structures.map((s) => `${s.name}. ${s.location} ${s.function}`)].join(" ")
    : "";

  return (
    <div className="wrap">
      <div className="page-head">
        <nav aria-label="Breadcrumb" className="crumbs"><ol>
          <li><Link href={isStudent ? "/student" : `/teacher/resources/${lesson.id}`}>{isStudent ? "My lessons" : "Back to review"}</Link></li>
          <li>{[lesson.subject, lesson.topic].filter(Boolean).join(": ")}</li>
        </ol></nav>
        <h1>{lesson.title}</h1>
        <p className="muted">From {lesson.teacher}. AI-assisted description, checked and approved by your teacher.</p>
        {lesson.preview && <p className="notice warn">Teacher preview. {lesson.status !== "published" ? "Students can't see this yet." : ""} The companion and quiz scores only work for students.</p>}
        {isStudent && progress && (
          <p>You have explored {progress.structures_viewed.length} of {total} structures{progress.best_score != null ? ` and your best quiz score is ${progress.best_score} of ${progress.quiz_total}` : ""}.</p>
        )}
        <ListenBar text={listenText} label="Lesson" />
      </div>

      <nav aria-labelledby="contents-h" className="panel" style={{ marginBottom: "2rem" }}>
        <h2 id="contents-h" style={{ fontSize: "1.2rem" }}>Lesson contents</h2>
        <ol style={{ margin: 0 }}>
          <li><a href="#explore">Explore the diagram</a></li>
          <li><a href="#companion">Ask your learning companion</a></li>
          <li><a href="#practice">Check your understanding</a></li>
          <li><a href="#notes">Lecture notes</a></li>
        </ol>
      </nav>

      {!content && <p className="notice">This lesson has no diagram content yet.</p>}

      {content && (
        <section id="explore" ref={exploreRef} aria-labelledby="explore-h" className="panel" style={{ marginBottom: "2rem", scrollMarginTop: "1rem" }}>
          <h2 id="explore-h">Explore the diagram</h2>
          <p>Explore by overview, by structure, by how parts connect, or by following a process step by step.</p>
          <Explorer content={content} idPrefix="lesson" headingLevel={3} externalSelect={cite}
            onViewStructure={(sid) => track(sid)} onStep={(n) => track(undefined, n)}
            renderFigure={(hl) => <DiagramFigure src={imageUrl(d.id)} content={content} highlight={hl} caption={d.caption} />} />
        </section>
      )}

      {content && (
        <section id="companion" aria-labelledby="comp-h" className="panel" style={{ marginBottom: "2rem", scrollMarginTop: "1rem" }}>
          <h2 id="comp-h">Ask your learning companion</h2>
          <Companion lessonId={lesson.id} content={content} enabled={isStudent}
            onCite={(sid) => { setCite({ id: sid, nonce: Date.now() }); exploreRef.current?.scrollIntoView({ block: "start" }); }} />
        </section>
      )}

      {content && (
        <section id="practice" aria-labelledby="quiz-h" className="panel" style={{ marginBottom: "2rem", scrollMarginTop: "1rem" }}>
          <h2 id="quiz-h">Check your understanding</h2>
          <Quiz lessonId={lesson.id} items={lesson.diagrams.flatMap((x) => x.content.quiz)} canSubmit={isStudent}
            onDone={(score, totalQ) => isStudent && setProgress((p) => p && ({ ...p, best_score: Math.max(p.best_score ?? 0, score), quiz_total: totalQ }))} />
        </section>
      )}

      <section id="notes" aria-labelledby="notes-h" className="panel" style={{ scrollMarginTop: "1rem" }}>
        <h2 id="notes-h">Lecture notes</h2>
        <details>
          <summary>Show the text extracted from the lecture file</summary>
          <div style={{ whiteSpace: "pre-wrap", marginTop: "1rem" }}>{lesson.lecture_text.replace(/\[Page (\d+)\]/g, "\nPage $1\n") || "No text was extracted."}</div>
        </details>
      </section>
    </div>
  );
}
