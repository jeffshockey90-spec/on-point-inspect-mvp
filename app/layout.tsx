import "./globals.css";
import Navbar from "../components/Nav";
import GlobalLiveActivity from "../components/GlobalLiveActivity";
import TimeLocationEngine from "../components/time-location/TimeLocationEngine";
import PageShell from "../components/PageShell";

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
        url: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],

    apple: "/icons/icon-512.png",
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
    <html lang="en" className="overflow-x-hidden">
      <body className="min-h-screen overflow-x-hidden bg-[#050816] text-white antialiased">
        <Navbar />

        <GlobalLiveActivity />

        <TimeLocationEngine />

        <PageShell>{children}</PageShell>
      </body>
    </html>
  );
}