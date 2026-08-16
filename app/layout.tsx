import type { Metadata, Viewport } from "next";
import { SoundProvider } from "./SoundProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "鬥陣來一局｜台灣撲克牌線上房",
  description: "不註冊、不下注，只要六位數房號就能和朋友開一局台灣撲克牌。"
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant-TW">
      <body>
        <SoundProvider>{children}</SoundProvider>
      </body>
    </html>
  );
}
