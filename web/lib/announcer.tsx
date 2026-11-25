"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// One polite and one assertive live region for the whole app.
const Ctx = createContext<(msg: string, urgent?: boolean) => void>(() => {});

export function AnnouncerProvider({ children }: { children: React.ReactNode }) {
  const [polite, setPolite] = useState("");
  const [assertive, setAssertive] = useState("");
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announce = useCallback((msg: string, urgent = false) => {
    const set = urgent ? setAssertive : setPolite;
    set("");
    if (t.current) clearTimeout(t.current);
    // clear then set so repeating the same message is still announced
    t.current = setTimeout(() => set(msg), 60);
  }, []);
  const [toast, setToast] = useState("");
  useEffect(() => {
    const onErr = (e: Event) => { const msg = (e as CustomEvent<string>).detail; setToast(msg); announce(msg, true); };
    window.addEventListener("sa-speech-error", onErr);
    return () => window.removeEventListener("sa-speech-error", onErr);
  }, [announce]);
  return (
    <Ctx.Provider value={announce}>
      {children}
      {toast && (
        <div className="toast notice error">
          <p>{toast}</p>
          <button type="button" className="btn secondary small" onClick={() => setToast("")}>Dismiss</button>
        </div>
      )}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{polite}</div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">{assertive}</div>
    </Ctx.Provider>
  );
}
export const useAnnounce = () => useContext(Ctx);
