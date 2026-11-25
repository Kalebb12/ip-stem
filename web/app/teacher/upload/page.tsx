"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useRequireRole, useTitle } from "@/lib/auth";
import FormError from "@/components/FormError";
import type { Resource } from "@/lib/types";

export default function UploadPage() {
  useTitle("Upload a resource");
  const user = useRequireRole("teacher");
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("Human Anatomy");
  const [topic, setTopic] = useState("");
  const [audience, setAudience] = useState("Undergraduate");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) { setError("Choose a file to upload."); return; }
    if (!title.trim()) { setError("Give the resource a title."); return; }
    setError(""); setBusy(true);
    const fd = new FormData();
    fd.append("file", file); fd.append("title", title); fd.append("subject", subject); fd.append("topic", topic); fd.append("audience", audience);
    try {
      const r = await api<Resource>("/resources/upload", { method: "POST", body: fd });
      router.push(`/teacher/resources/${r.id}`);
    } catch (err) { setError((err as Error).message); setBusy(false); }
  }

  if (!user) return <div className="wrap page-head"><p>Loading…</p></div>;
  return (
    <div className="wrap" style={{ maxWidth: "42rem" }}>
      <div className="page-head">
        <h1>Upload a resource</h1>
        <p>Upload lecture notes that contain a diagram. SenseAtlas will find the diagram, describe it, and ask you to check the result before anything is published.</p>
      </div>
      <FormError message={error} />
      <form className="panel" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="file">File</label>
          <span className="hint" id="file-hint">PDF, PNG or JPG, up to 25 MB. Digital PDFs work best.</span>
          <input id="file" type="file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" aria-describedby="file-hint"
            onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ")); }} />
          {file && <p className="small" style={{ marginTop: "0.4rem" }}>Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)</p>}
        </div>
        <div className="field"><label htmlFor="title">Title</label><input id="title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="two-col">
          <div className="field"><label htmlFor="subject">Subject</label><input id="subject" type="text" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
          <div className="field"><label htmlFor="topic">Topic</label><input id="topic" type="text" placeholder="For example, Cardiovascular system" value={topic} onChange={(e) => setTopic(e.target.value)} /></div>
        </div>
        <div className="field">
          <label htmlFor="audience">Intended students</label>
          <select id="audience" value={audience} onChange={(e) => setAudience(e.target.value)}>
            <option>Secondary school</option><option>Undergraduate</option><option>Postgraduate</option><option>Professional training</option>
          </select>
        </div>
        <button className="btn" type="submit" disabled={busy}>{busy ? "Uploading…" : "Upload and process"}</button>
      </form>
      <p className="small muted" style={{ marginTop: "1rem" }}>No file to hand? <a href="/samples/heart-lecture.pdf" download>Download the sample heart lecture</a> and upload it here.</p>
    </div>
  );
}
