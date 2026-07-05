import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Lumen — The tutor that draws while it talks",
    template: "%s · Lumen",
  },
  description:
    "Type any topic and Lumen builds a narrated, animated lesson in front of you — live, at 60fps, in your browser. Interrupt it mid-sentence and it adapts.",
  keywords: ["AI tutor", "animated lessons", "math visualization", "interactive learning"],
  openGraph: {
    title: "Lumen — The tutor that draws while it talks",
    description:
      "Narrated, animated lessons built live for any topic. Interrupt mid-lesson and it adapts.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`h-full antialiased ${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
