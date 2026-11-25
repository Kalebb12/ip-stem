"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useTitle } from "@/lib/auth";
import FormError from "@/components/FormError";

export default function RegisterPage() {
  useTitle("Create an account");
  const { register } = useAuth();
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "student", institution: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (form.password.length < 8) { setError("Password must be at least 8 characters."); return; }
    setError(""); setBusy(true);
    try {
      const u = await register(form);
      router.push(u.role === "teacher" ? "/teacher" : "/settings?welcome=1");
    } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="wrap" style={{ maxWidth: "38rem" }}>
      <div className="page-head">
        <h1>Create an account</h1>
        <p>We only ask for what we need to sign you in.</p>
      </div>
      <FormError message={error} />
      <form className="panel" onSubmit={submit} noValidate>
        <fieldset>
          <legend>I am a</legend>
          <label className="choice"><input type="radio" name="role" value="student" checked={form.role === "student"} onChange={set("role")} /> Student</label>
          <label className="choice"><input type="radio" name="role" value="teacher" checked={form.role === "teacher"} onChange={set("role")} /> Teacher or lecturer</label>
        </fieldset>
        <div className="field"><label htmlFor="name">Your name</label><input id="name" type="text" autoComplete="name" required value={form.name} onChange={set("name")} /></div>
        <div className="field"><label htmlFor="email">Email address</label><input id="email" type="email" autoComplete="email" required value={form.email} onChange={set("email")} /></div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <span className="hint" id="pw-hint">At least 8 characters.</span>
          <input id="password" type="password" autoComplete="new-password" aria-describedby="pw-hint" required value={form.password} onChange={set("password")} />
        </div>
        <div className="field">
          <label htmlFor="inst">School or university <span className="muted">(optional)</span></label>
          <input id="inst" type="text" autoComplete="organization" value={form.institution} onChange={set("institution")} />
        </div>
        <button className="btn" type="submit" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
      </form>
      <p style={{ marginTop: "1.5rem" }}>Already have an account? <Link href="/login">Sign in</Link>.</p>
    </div>
  );
}
