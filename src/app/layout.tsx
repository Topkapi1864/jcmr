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
      <body>{children}</body>
    </html>
  );
}
