import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import Providers from "./providers";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";

export const metadata: Metadata = {
  title: "SenseAtlas: anatomy diagrams blind students can explore",
  description: "Teachers upload anatomy lectures. SenseAtlas turns their diagrams into structured lessons that blind and low-vision students explore with a screen reader, keyboard or large text.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// Applies saved display settings before first paint, so large-text users never see a flash of small text.
const prefsScript = `try{var p=JSON.parse(localStorage.getItem('sa.prefs')||'null');if(p){var h=document.documentElement;if(p.textScale)h.style.fontSize=p.textScale+'%';if(p.contrast)h.dataset.contrast=p.contrast;h.dataset.reduceMotion=p.reduceMotion?'true':'false';}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" data-contrast="default" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;600;700;800&display=swap" />
      </head>
      <body>
        <Script id="apply-prefs" strategy="beforeInteractive">{prefsScript}</Script>
        <Providers>
          <SiteHeader />
          <main id="main" tabIndex={-1}>{children}</main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
