"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useRequireRole, useTitle } from "@/lib/auth";
import type { Resource } from "@/lib/types";
import StatusBadge from "@/components/StatusBadge";

export default function TeacherDashboard() {
  useTitle("My resources");
  const user = useRequireRole("teacher");
  const [items, setItems] = useState<Resource[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    let timer: ReturnType<typeof setTimeout>;
    const load = () => api<Resource[]>("/resources").then((r) => {
      setItems(r);
      if (r.some((x) => x.status === "processing" || x.status === "uploaded")) timer = setTimeout(load, 2500);
    }).catch((e) => setError(e.message));
    load();
    return () => clearTimeout(timer);
  }, [user]);

  if (!user) return <div className="wrap page-head"><p>Loading…</p></div>;
  const counts = { review: items?.filter((i) => i.status === "needs_review").length ?? 0, published: items?.filter((i) => i.status === "published").length ?? 0 };

  return (
    <div className="wrap">
      <div className="page-head">
        <h1>My resources</h1>
        <p>Welcome, {user.name}. Upload lecture material, check what the AI wrote, and publish it to your students.</p>
        <div className="btn-row"><Link className="btn" href="/teacher/upload">Upload a resource</Link></div>
      </div>
      {error && <div className="notice error" role="alert"><p>{error}</p></div>}
      {items && items.length > 0 && (
        <p aria-live="polite">{items.length} resources. {counts.review} need your review. {counts.published} published.</p>
      )}
      {items === null && !error && <p>Loading your resources…</p>}
      {items && items.length === 0 && (
        <div className="panel stack">
          <h2>No resources yet</h2>
          <p>Upload a lecture PDF or a diagram image to create your first accessible lesson. You can use the <a href="/samples/heart-lecture.pdf" download>sample heart lecture</a>.</p>
          <Link className="btn" href="/teacher/upload">Upload a resource</Link>
        </div>
      )}
      {items && items.length > 0 && (
        <div className="table-scroll">
          <table className="data">
            <caption className="sr-only">Your uploaded resources</caption>
            <thead><tr><th scope="col">Title</th><th scope="col">Topic</th><th scope="col">Status</th><th scope="col">Needs checking</th><th scope="col">Last changed</th></tr></thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id}>
                  <th scope="row"><Link href={`/teacher/resources/${r.id}`}>{r.title}</Link><div className="small muted">{r.filename}</div></th>
                  <td>{r.topic || r.subject || "—"}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td>{r.status === "needs_review" ? (r.unresolved_flags ? `${r.unresolved_flags} flagged item${r.unresolved_flags === 1 ? "" : "s"}` : "Ready to approve") : "—"}</td>
                  <td>{new Date(r.updated_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
