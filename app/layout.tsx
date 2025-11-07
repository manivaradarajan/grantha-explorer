import type { Metadata } from "next";
import { Noto_Sans_Devanagari, Noto_Serif_Devanagari } from "next/font/google";
import "./globals.css";

const notoSans = Noto_Sans_Devanagari({
  subsets: ["devanagari", "latin"],
  weight: ["400", "600", "700"],
  variable: "--font-sans",
});

const notoSerif = Noto_Serif_Devanagari({
  subsets: ["devanagari", "latin"],
  weight: ["400", "600", "700"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "Hello Next.js",
  description: "A simple Next.js hello world",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sa">
      <body className={`${notoSans.variable} ${notoSerif.variable} font-sans`}>{children}</body>
    </html>
  );
}
