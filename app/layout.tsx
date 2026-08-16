import type { Metadata } from "next";
import { Noto_Sans_Devanagari, Noto_Serif_Devanagari, Anek_Devanagari, Tiro_Devanagari_Sanskrit } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

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

const anekDevanagari = Anek_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "500", "600"],
  variable: "--font-wordmark",
});

const tiroSerif = Tiro_Devanagari_Sanskrit({
  subsets: ["devanagari"],
  weight: ["400"],
  variable: "--font-reading",
});

export const metadata: Metadata = {
  title: "Grantha Explorer",
  description:
    "Explore classical Upanishad texts with Sanskrit commentary in an interactive reader",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="sa">
      <body className={`${notoSans.variable} ${notoSerif.variable} ${anekDevanagari.variable} ${tiroSerif.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
