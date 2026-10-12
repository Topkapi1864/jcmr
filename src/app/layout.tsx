import type { Metadata, Viewport } from "next";
import "../../design/tokens.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "The Janet Channon Memorial Ride", template: "%s · JCMR" },
  description: "The Janet Channon Memorial Ride, 14–15 November 2026.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Literata:opsz,wght@7..72,400;7..72,600&family=Figtree:wght@400;500;600;800&family=JetBrains+Mono:wght@500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
