"use client";
import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth, useTitle } from "@/lib/auth";
import FormError from "@/components/FormError";

function LoginForm() {
  useTitle("Sign in");
  const { signIn } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent, preset?: { email: string; password: string }) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const u = await signIn(preset?.email ?? email, preset?.password ?? password);
      router.push(next && next.startsWith(`/${u.role}`) ? next : u.role === "teacher" ? "/teacher" : "/student");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="wrap" style={{ maxWidth: "36rem" }}>
      <div className="page-head">
        <h1>Sign in</h1>
        <p>Sign in to your teacher or student account.</p>
      </div>
      <FormError message={error} />
      <form className="panel" onSubmit={submit} noValidate>
        <div className="field">
          <label htmlFor="email">Email address</label>
          <input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button className="btn" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
      <section className="panel" style={{ marginTop: "1.5rem" }} aria-labelledby="demo-h">
        <h2 id="demo-h" style={{ fontSize: "1.3rem" }}>Use a demo account</h2>
        <p className="small">Both use the password <code>demo1234</code>.</p>
        <div className="btn-row">
          <button type="button" className="btn secondary" disabled={busy} onClick={(e) => submit(e, { email: "student@demo.school", password: "demo1234" })}>Sign in as demo student</button>
          <button type="button" className="btn secondary" disabled={busy} onClick={(e) => submit(e, { email: "teacher@demo.school", password: "demo1234" })}>Sign in as demo teacher</button>
        </div>
      </section>
      <p style={{ marginTop: "1.5rem" }}>New here? <Link href="/register">Create an account</Link>.</p>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense><LoginForm /></Suspense>;
}
