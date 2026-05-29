import "./globals.css";
import Navbar from "../components/Nav";

export const metadata = {
  title: "On Point Inspection",
  description: "Inspection Dashboard",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "On Point Inspect",
  },
};

export const viewport = {
  themeColor: "#14b8a6",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />

        <meta
          name="theme-color"
          content="#14b8a6"
        />

        <meta
          name="apple-mobile-web-app-capable"
          content="yes"
        />

        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />

        <meta
          name="apple-mobile-web-app-title"
          content="On Point Inspect"
        />

        <link
          rel="apple-touch-icon"
          href="/logo.jpg"
        />

        <link
          rel="icon"
          type="image/png"
          sizes="192x192"
          href="/icons/icon-192.png"
        />

        <link
          rel="icon"
          type="image/png"
          sizes="512x512"
          href="/icons/icon-512.png"
        />
      </head>

      <body className="bg-[#050816] text-white">
        <Navbar />

        {children}
      </body>
    </html>
  );
}