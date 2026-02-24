import type { Metadata } from "next";
import { Syne, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { ThemeScript } from "@/components/theme-script";
import { Nav } from "@/components/nav";

const syne = Syne({
  variable: "--font-display",
  subsets: ["latin"]
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"]
});

export const metadata: Metadata = {
  title: "Hive Mind Club",
  description: "A signed, economic, bot-native knowledge graph for shared markdown intelligence.",
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/icon.png", type: "image/png", sizes: "32x32" }],
    apple: "/apple-icon.png"
  },
  manifest: "/site.webmanifest"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className={`${syne.variable} ${ibmPlexMono.variable}`}>
        <Nav />
        {children}
      </body>
    </html>
  );
}
