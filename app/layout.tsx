import "./globals.css";
import Navbar from "../components/Nav";

export const metadata = {
  title: "On Point Inspection",
  description: "Inspection Dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-black text-white">
        <Navbar />
        {children}
      </body>
    </html>
  );
}