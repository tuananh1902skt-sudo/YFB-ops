import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Inter covers Vietnamese diacritics fully (docs/06 §3.1).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "vietnamese"],
});

export const metadata: Metadata = {
  title: "YFB Live Agency OS",
  description: "Hệ thống vận hành livestream của YFB",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
