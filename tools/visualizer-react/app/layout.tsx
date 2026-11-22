import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import localFont from "next/font/local";
import "./globals.css";

const noto = localFont({
  src: "../public/fonts/NotoSansSC.woff2",
  variable: "--font-noto",
  display: "swap",
  weight: "400 700",
});

export const metadata: Metadata = {
  title: "SleepPosture 3D",
  description: "SleepPosture 板子实时姿态 3D 可视化",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="zh-CN"
      className={`${GeistSans.variable} ${GeistMono.variable} ${noto.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
