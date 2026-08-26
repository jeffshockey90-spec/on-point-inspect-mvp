import "./globals.css";
import { Manrope, JetBrains_Mono } from "next/font/google";
import Navbar from "../components/Nav";
import TimeLocationEngine from "../components/time-location/TimeLocationEngine";
import PageShell from "../components/PageShell";
import DeferredGlobals from "../components/DeferredGlobals";
import ServiceWorkerRegister from "../components/ServiceWorkerRegister";

// App-wide UI typeface — Manrope (clean, geometric, professional) for UI/body,
// JetBrains Mono for figures/labels (precise, instrument-like). Self-hosted by
// next/font at build time (no runtime CDN), exposed as CSS variables that
// globals.css maps onto the body + the .fl-figure utility.
const sans = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
});

export const metadata = {
  title: "FLOW",
  description:
    "Inspection management, reports, agreements, payments, analytics, and client portals for home inspectors.",
  manifest: "/manifest.json",
  applicationName: "FLOW",

  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "FLOW",
  },

  icons: {
    icon: [
      {
        url: "/icons/icon-192-v2.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/icons/icon-512-v2.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],

    apple: "/icons/icon-512-v2.png",
  },
};

export const viewport = {
  themeColor: "#14c8d2",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} overflow-x-clip`}>
      <body className="min-h-screen overflow-x-clip bg-[#050816] text-white antialiased">
        <ServiceWorkerRegister />

        <Navbar />

        <TimeLocationEngine />

        <DeferredGlobals />

        <PageShell>{children}</PageShell>
      </body>
    </html>
  );
}