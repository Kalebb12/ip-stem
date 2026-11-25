"use client";
import { AnnouncerProvider } from "@/lib/announcer";
import { AuthProvider } from "@/lib/auth";
import { PrefsProvider } from "@/lib/prefs";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PrefsProvider>
      <AnnouncerProvider>
        <AuthProvider>{children}</AuthProvider>
      </AnnouncerProvider>
    </PrefsProvider>
  );
}
