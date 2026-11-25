"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken, setToken } from "./api";
import type { User } from "./types";
import { usePrefs } from "./prefs";

interface AuthCtx {
  user: User | null; ready: boolean; signedOut: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  register: (data: Record<string, string>) => Promise<User>;
  signOut: () => Promise<void>;
}
const Ctx = createContext<AuthCtx>(null as unknown as AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const { prefs, replace } = usePrefs();

  useEffect(() => {
    if (!getToken()) { setReady(true); return; }
    // On reload this device's settings are newest, so keep them (autosave pushes them to the account).
    // The account copy is only applied when signing in, e.g. on a new device.
    api<User>("/auth/me")
      .then((u) => setUser(u))
      .catch(() => setToken(null))
      .finally(() => setReady(true));
  }, []);

  // Save display settings to the account as they change, so a reload never brings back old ones.
  const synced = useRef(false);
  useEffect(() => {
    if (!user) { synced.current = false; return; }
    if (!synced.current) { synced.current = true; return; } // skip the copy that just came from the server
    const t = setTimeout(() => { api("/auth/me/prefs", { method: "PUT", json: prefs }).catch(() => {}); }, 500);
    return () => clearTimeout(t);
  }, [prefs, user]);

  const finish = useCallback((r: { token: string; user: User }) => {
    setToken(r.token);
    setSignedOut(false);
    setUser(r.user);
    if (r.user.prefs && Object.keys(r.user.prefs).length) replace(r.user.prefs);
    else api("/auth/me/prefs", { method: "PUT", json: prefs }).catch(() => {});
    return r.user;
  }, [prefs, replace]);

  const signIn = useCallback(async (email: string, password: string) =>
    finish(await api<{ token: string; user: User }>("/auth/login", { method: "POST", json: { email, password } })), [finish]);
  const register = useCallback(async (data: Record<string, string>) =>
    finish(await api<{ token: string; user: User }>("/auth/register", { method: "POST", json: data })), [finish]);
  const signOut = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    setToken(null);
    setSignedOut(true);
    setUser(null);
  }, []);

  return <Ctx.Provider value={{ user, ready, signedOut, signIn, register, signOut }}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);

/** Redirects to /login unless the signed-in user has the role. Returns the user once allowed. */
export function useRequireRole(role: "teacher" | "student") {
  const { user, ready, signedOut } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    // after a deliberate sign-out, go home rather than to the sign-in page
    if (!user) router.replace(signedOut ? "/" : `/login?next=${encodeURIComponent(window.location.pathname)}`);
    else if (user.role !== role) router.replace(user.role === "teacher" ? "/teacher" : "/student");
  }, [ready, user, role, router, signedOut]);
  return ready && user?.role === role ? user : null;
}

export function useTitle(title: string) {
  useEffect(() => { document.title = `${title} | SenseAtlas`; }, [title]);
}
