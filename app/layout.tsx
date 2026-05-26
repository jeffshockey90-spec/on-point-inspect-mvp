import "./globals.css";
import Navbar from "../components/Nav";
import PWARegister from "../components/PWARegister";

export const metadata = {
  title: "On Point Inspection",
  description: "Inspection Dashboard",
  manifest: "/manifest.json",
  themeColor: "#14b8a6",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "On Point Inspect",
  },
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
      </head>

      <body className="bg-[#050816] text-white">
        <PWARegister />

        <Navbar />

        {children}
      </body>
    </html>
  );
}