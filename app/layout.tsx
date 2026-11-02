import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Figtree, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Self-hosted at build time by next/font (no runtime request to Google). Figtree for everything; JetBrains Mono only
// for rule IDs in the trace.
const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap", variable: "--font-figtree" });
const jbmono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "500"], display: "swap", variable: "--font-jbmono" });

const TAGLINE = "SureSend · independent concept for Slite Agent";
const DESCRIPTION = "Checks a support reply against messy team docs before it reaches the customer. Synthetic data only.";

export const metadata: Metadata = {
  metadataBase: new URL("https://suresend-demo.vercel.app"),
  title: TAGLINE,
  description: DESCRIPTION,
  applicationName: "SureSend",
  openGraph: {
    type: "website",
    url: "https://suresend-demo.vercel.app",
    siteName: "SureSend",
    title: TAGLINE,
    description: DESCRIPTION,
    images: [{ url: "/demo.gif", alt: "SureSend demo: a wrong reply is held at Send, the checked reply is used and sent." }],
  },
  twitter: { card: "summary_large_image", title: TAGLINE, description: DESCRIPTION, images: ["/demo.gif"] },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${figtree.variable} ${jbmono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
