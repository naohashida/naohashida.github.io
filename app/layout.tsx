import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") || incoming.get("host") || "localhost:3000";
  const protocol = incoming.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const title = "発音練習・食事の自己管理 | Articulation & Meal Self-Care";
  const description = "成人の発音学習と反復練習を支援する、録音・発音判定付きWebアプリです。";
  return {
    title,
    description,
    applicationName: "発音練習・食事の自己管理",
    manifest: "/manifest.webmanifest",
    icons: { icon: "/app-icon.png", apple: "/app-icon.png" },
    openGraph: {
      title,
      description,
      type: "website",
      locale: "ja_JP",
      images: [{ url: `${origin}/og.png`, width: 1731, height: 909, alt: "発音練習 Articulation & Meal Self-Care" }],
    },
    twitter: { card: "summary_large_image", title, description, images: [`${origin}/og.png`] },
  };
}

export const viewport: Viewport = {
  themeColor: "#164b48",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
