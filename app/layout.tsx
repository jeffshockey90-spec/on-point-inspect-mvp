import "./globals.css";
import Navbar from "../components/Nav";
import GlobalLiveActivity from "../components/GlobalLiveActivity";

export const metadata = {
  title: "On Point Inspect",
  description:
    "Inspection management, reports, agreements, payments, analytics, and client portals for home inspectors.",
  manifest: "/manifest.json",
  applicationName: "On Point Inspect",

  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "On Point Inspect",
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
  themeColor: "#14b8a6",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen overflow-x-hidden bg-[#050816] text-white antialiased">
        <Navbar />

        <GlobalLiveActivity />

        {children}
      </body>
    </html>
  );
}