"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRequireRole, useTitle } from "@/lib/auth";
import type { Resource } from "@/lib/types";

export default function StudentDashboard() {
  useTitle("My lessons");
  const user = useRequireRole("student");
  const [items, setItems] = useState<Resource[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { if (user) api<Resource[]>("/lessons").then(setItems).catch((e) => setError(e.message)); }, [user]);
  if (!user) return <div className="wrap page-head"><p>Loading…</p></div>;

  const recent = items?.filter((i) => i.progress?.last_opened_at).sort((a, b) => (b.progress!.last_opened_at! > a.progress!.last_opened_at! ? 1 : -1))[0];

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>My lessons</h1>
        <p>Hello, {user.name}. Choose a lesson to explore its diagrams, ask questions and practise.</p>
      </div>
      {error && <div className="notice error" role="alert"><p>{error}</p></div>}
      {recent && (
        <section className="panel" aria-labelledby="cont-h" style={{ marginBottom: "2rem" }}>
          <h2 id="cont-h" style={{ fontSize: "1.3rem" }}>Continue where you left off</h2>
          <p><Link href={`/student/lessons/${recent.id}`}>{recent.title}</Link>: explored {recent.progress!.structures_viewed.length} of {recent.structure_count} structures.</p>
        </section>
      )}
      <h2>All lessons</h2>
      {items === null && !error && <p>Loading lessons…</p>}
      {items?.length === 0 && <p className="panel">No lessons have been published yet. When your teacher publishes one, it will appear here.</p>}
      <ul className="cards">
        {items?.map((l) => {
          const viewed = l.progress?.structures_viewed.length ?? 0;
          const total = l.structure_count || 0;
          return (
            <li key={l.id} className="panel lesson-card">
              <h3><Link href={`/student/lessons/${l.id}`}>{l.title}</Link></h3>
              <p className="muted small" style={{ margin: 0 }}>{[l.subject, l.topic].filter(Boolean).join(": ")}. From {l.teacher}.</p>
              <p style={{ margin: "0.4rem 0 0.2rem" }}>Explored {viewed} of {total} structures{l.progress?.best_score != null ? `. Best quiz score ${l.progress.best_score} of ${l.progress.quiz_total}` : ""}.</p>
              <div className="meter" aria-hidden="true"><span style={{ width: `${total ? (viewed / total) * 100 : 0}%` }} /></div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
