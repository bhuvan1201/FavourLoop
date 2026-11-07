import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "FavourLoop — A little help goes a long way",
  description:
    "A voice-first space for classmates to ask, share, and learn together.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
