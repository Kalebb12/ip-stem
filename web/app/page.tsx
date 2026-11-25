"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Explorer from "@/components/Explorer";
import { HeartSchematic } from "@/components/Figures";
import ListenBar from "@/components/ListenBar";
import heart from "@/lib/heart-demo.json";
import type { DiagramContent } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { useAnnounce } from "@/lib/announcer";

const demo = heart as unknown as DiagramContent;

const STEPS = [
  { who: "Teacher", title: "Upload a lecture", text: "Upload a PDF or an image of a diagram, and say which subject and topic it covers." },
  { who: "SenseAtlas", title: "Read the diagram", text: "The AI finds each diagram, reads its labels and writes a structured description: every part, where it sits, what it does, and how things flow between parts. Anything it is unsure about is flagged." },
  { who: "Teacher", title: "Check and publish", text: "The teacher sees the original diagram next to the description, fixes anything wrong, resolves every flag, and publishes. Nothing reaches students without this approval." },
  { who: "Student", title: "Explore at your own pace", text: "Students move through the diagram part by part, follow processes such as blood flow step by step, and ask questions. Answers come from the approved lesson." },
  { who: "Student", title: "Check understanding", text: "A short practice quiz, fully usable with a screen reader, shows what has sunk in. It is for learning, not grading." },
];

export default function Home() {
  const { signIn, user } = useAuth();
  const router = useRouter();
  const announce = useAnnounce();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [ai, setAi] = useState<{ ai_enabled: boolean; vision_model: string | null } | null>(null);
  const names = useMemo(() => Object.fromEntries(demo.structures.map((s) => [s.id, s.name])), []);

  useEffect(() => { document.title = "SenseAtlas: anatomy diagrams blind students can explore"; }, []);
  useEffect(() => { api<{ ai_enabled: boolean; vision_model: string | null }>("/system").then(setAi).catch(() => setAi(null)); }, []);

  async function demoSignIn(role: "student" | "teacher") {
    setError("");
    setBusy(role);
    announce(`Signing in as the demo ${role}`);
    try {
      await signIn(`${role}@demo.school`, "demo1234");
      router.push(role === "teacher" ? "/teacher" : "/student");
    } catch (e) {
      setError((e as Error).message);
      announce((e as Error).message, true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div id="page-content">
      <section className="page-guide" aria-labelledby="guide-h">
        <div className="wrap">
          <h2 id="guide-h" className="guide-title">About this page</h2>
          <p>
            SenseAtlas helps blind and low-vision students learn from anatomy diagrams on their own. This page has six parts:
            a live example you can try, the problem, how it works, accessibility features, a demo you can sign in to, and how we use AI.
            Screen reader users can jump between parts with the heading key, and can turn off our read-aloud buttons in Settings
            so only their own screen reader talks. Text size and colour buttons are at the top of every page.
          </p>
          <ListenBar targetId="page-content" label="This page" />
        </div>
      </section>

      <section className="hero" aria-labelledby="hero-h">
        <div className="wrap hero-grid">
          <div className="hero-copy">
            <h1 id="hero-h">Anatomy diagrams that blind students can explore on their own.</h1>
            <p className="lede">
              A teacher uploads a lecture. SenseAtlas turns each diagram into a structured lesson, the teacher checks it,
              and students explore every part with a screen reader, a keyboard or large text, without asking someone to describe the picture.
            </p>
            <div className="btn-row">
              {user ? (
                <Link className="btn" href={user.role === "teacher" ? "/teacher" : "/student"}>Go to {user.role === "teacher" ? "my resources" : "my lessons"}</Link>
              ) : (
                <>
                  <button type="button" className="btn" onClick={() => demoSignIn("student")} disabled={!!busy}>{busy === "student" ? "Signing in…" : "Try it as a student"}</button>
                  <button type="button" className="btn secondary" onClick={() => demoSignIn("teacher")} disabled={!!busy}>{busy === "teacher" ? "Signing in…" : "Try it as a teacher"}</button>
                </>
              )}
            </div>
            {error && <p className="field-error" role="alert">{error}</p>}
          </div>

          <div className="hero-demo panel" aria-labelledby="try-h">
            <h2 id="try-h" className="demo-title">Try it now: explore a heart</h2>
            <p className="small">
              This is the student explorer, working on a real lesson. Move to the list with <kbd>Tab</kbd>, then use the <kbd>↑</kbd> and <kbd>↓</kbd> keys.
              Each part is read out as you reach it. The tab named &ldquo;Path of blood through the heart&rdquo; walks through circulation step by step.
            </p>
            <Explorer content={demo} idPrefix="hero" headingLevel={3} compact
              renderFigure={(hl, select) => <HeartSchematic highlight={hl} onSelect={select} names={names} />} />
          </div>
        </div>
      </section>

      <section className="band" aria-labelledby="problem-h">
        <div className="wrap narrow">
          <h2 id="problem-h">The problem: screen readers can read the words around a diagram, but not the diagram</h2>
          <p>
            A heart diagram holds fourteen labelled parts, their positions, and arrows showing which way blood moves. Alt text squeezes all of that
            into a sentence like &ldquo;Diagram of the heart&rdquo;. Students who are blind or have low vision end up waiting for a sighted
            person to explain the picture, or they skip it.
          </p>
          <p>
            Describing diagrams by hand takes teachers hours per lecture. SenseAtlas writes the first draft in minutes, and keeps the teacher in charge of what is correct.
          </p>
        </div>
      </section>

      <section id="how-it-works" className="band alt" aria-labelledby="how-h">
        <div className="wrap">
          <h2 id="how-h">How it works</h2>
          <p>Five steps from a lecture PDF to a student learning on their own.</p>
          <ol className="journey">
            {STEPS.map((s, i) => (
              <li key={s.title} data-who={s.who.toLowerCase()}>
                <span className="journey-num" aria-hidden="true">{i + 1}</span>
                <div>
                  <h3><span className="sr-only">Step {i + 1}: </span>{s.title}</h3>
                  <p className="journey-who">Done by: {s.who}</p>
                  <p>{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="band" aria-labelledby="a11y-h">
        <div className="wrap">
          <h2 id="a11y-h">Made for the way you read</h2>
          <div className="ways">
            <div>
              <h3>If you use a screen reader</h3>
              <ul>
                <li>Every page has a clear heading structure and a &ldquo;Skip to main content&rdquo; link.</li>
                <li>Moving through the explorer announces each part&rsquo;s name and position.</li>
                <li>Answers and quiz feedback are read out automatically.</li>
                <li>Built to WCAG 2.2 AA with standard HTML controls, so NVDA, JAWS, VoiceOver and TalkBack behave as you expect.</li>
              </ul>
            </div>
            <div>
              <h3>If you have low vision</h3>
              <ul>
                <li>Text can grow to double size without breaking the layout.</li>
                <li>Standard, high-contrast and dark colours.</li>
                <li>The part you are reading about is outlined on the diagram in thick yellow and black.</li>
                <li>The typeface, Atkinson Hyperlegible, was designed for low-vision readers.</li>
              </ul>
            </div>
            <div>
              <h3>If you use a keyboard or switch</h3>
              <ul>
                <li>Everything works without a mouse.</li>
                <li>Focus is always shown with a thick yellow-and-black outline.</li>
                <li>Arrow keys move through tabs and lists; buttons are at least 44 pixels tall.</li>
                <li>Built-in speech with play, pause, repeat and speed controls.</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section id="try-it" className="band alt" aria-labelledby="demo-h">
        <div className="wrap">
          <h2 id="demo-h">Try the full demo</h2>
          <p>Two demo accounts are ready. A heart lesson is already published, so the student account has something to explore straight away.</p>
          <div className="grid-2">
            <div className="panel stack">
              <h3>As a student</h3>
              <p>Open the published heart lesson, explore it, ask the learning companion a question, and take the practice quiz.</p>
              <p className="small">Email: <code>student@demo.school</code><br />Password: <code>demo1234</code></p>
              <button type="button" className="btn" onClick={() => demoSignIn("student")} disabled={!!busy}>Sign in as the demo student</button>
            </div>
            <div className="panel stack">
              <h3>As a teacher</h3>
              <p>Upload the sample lecture, watch the diagram being read, resolve a flagged item, and publish it to students.</p>
              <p className="small">Email: <code>teacher@demo.school</code><br />Password: <code>demo1234</code></p>
              <div className="btn-row">
                <button type="button" className="btn" onClick={() => demoSignIn("teacher")} disabled={!!busy}>Sign in as the demo teacher</button>
                <a className="btn secondary small" href="/samples/heart-lecture.pdf" download>Download the sample lecture PDF</a>
              </div>
            </div>
          </div>
          <p className="small muted" style={{ marginTop: "1rem" }}>
            {ai === null ? "The API is not reachable right now, so only the explorer above works."
              : ai.ai_enabled ? `Diagram reading is live, using ${ai.vision_model} on Groq.`
                : "Diagram reading is in demo mode: the sample lecture uses pre-written content until an AI key is added."}
          </p>
        </div>
      </section>

      <section className="band" aria-labelledby="ai-h">
        <div className="wrap narrow">
          <h2 id="ai-h">How we use AI, and where we stop it</h2>
          <ul className="plain-list">
            <li><strong>Teachers approve everything.</strong> AI drafts the description; only teacher-approved content is published.</li>
            <li><strong>Seen versus assumed.</strong> Each part is marked as labelled in the diagram, visible without a label, or taken from the lecture notes. Uncertain parts are flagged for the teacher.</li>
            <li><strong>Grounded answers.</strong> The learning companion answers from the approved lesson, says when it is using general knowledge, and says when it doesn&rsquo;t know.</li>
            <li><strong>Documents are data.</strong> Text inside an uploaded file can&rsquo;t give the AI instructions.</li>
            <li><strong>Private by default.</strong> Student questions are not used to train models.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
