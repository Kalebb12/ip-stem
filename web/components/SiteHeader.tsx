"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Logo from "./Logo";
import { useAuth } from "@/lib/auth";
import { usePrefs } from "@/lib/prefs";
import { useAnnounce } from "@/lib/announcer";

const CONTRAST_NAME = { default: "Standard colours", high: "High contrast", dark: "Dark" } as const;
const NEXT_CONTRAST = { default: "high", high: "dark", dark: "default" } as const;

export default function SiteHeader() {
  const { user, signOut } = useAuth();
  const { prefs, update } = usePrefs();
  const announce = useAnnounce();
  const path = usePathname();
  const router = useRouter();

  const links = !user
    ? [{ href: "/#how-it-works", label: "How it works" }, { href: "/#try-it", label: "Try the demo" }]
    : user.role === "teacher"
      ? [{ href: "/teacher", label: "My resources" }, { href: "/teacher/upload", label: "Upload" }, { href: "/settings", label: "Settings" }]
      : [{ href: "/student", label: "My lessons" }, { href: "/settings", label: "Settings" }];

  const size = (delta: number) => {
    const next = Math.min(200, Math.max(100, prefs.textScale + delta));
    update({ textScale: next });
    announce(`Text size ${next} percent`);
  };
  const contrast = () => {
    const next = NEXT_CONTRAST[prefs.contrast];
    update({ contrast: next });
    announce(`${CONTRAST_NAME[next]} turned on`);
  };

  return (
    <header className="site-header">
      <a className="skip-link" href="#main">Skip to main content</a>
      <div className="wrap">
        <Link href={user ? (user.role === "teacher" ? "/teacher" : "/student") : "/"} className="brand">
          <Logo /> SenseAtlas
        </Link>
        <nav aria-label="Main" className="site-nav">
          {links.map((l) => (
            <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined}>{l.label}</Link>
          ))}
        </nav>
        <div className="display-tools" role="group" aria-label="Display settings">
          <span className="label" aria-hidden="true">Text</span>
          <button type="button" className="btn secondary icon" onClick={() => size(-25)} disabled={prefs.textScale <= 100} aria-label="Make text smaller">A−</button>
          <button type="button" className="btn secondary icon" onClick={() => size(25)} disabled={prefs.textScale >= 200} aria-label="Make text larger">A+</button>
          <button type="button" className="btn secondary small" onClick={contrast} aria-label={`Colours: ${CONTRAST_NAME[prefs.contrast]}. Switch to ${CONTRAST_NAME[NEXT_CONTRAST[prefs.contrast]]}`}>
            {CONTRAST_NAME[prefs.contrast]}
          </button>
        </div>
        {user ? (
          <div className="btn-row">
            <span className="small muted">Signed in as {user.name}</span>
            <button type="button" className="btn secondary small" onClick={async () => { await signOut(); announce("Signed out"); router.push("/"); }}>Sign out</button>
          </div>
        ) : (
          <Link className="btn small" href="/login">Sign in</Link>
        )}
      </div>
    </header>
  );
}
