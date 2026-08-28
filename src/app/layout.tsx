import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Inter } from "next/font/google";
import localFont from "next/font/local";
import { AppShell } from "@/components/app-shell";
import { PwaRegister } from "@/components/pwa-register";
import { usesSupabase } from "@/lib/config";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const editorial = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-editorial", display: "swap" });
const chinese = localFont({ src: "./fonts/canger-huaxin.ttf", weight: "400", style: "normal", variable: "--font-canger-huaxin", display: "swap" });

export const metadata: Metadata = {
  title: { default: "EvaOrbit", template: "%s · EvaOrbit" },
  description: "属于自己的生活与思考空间",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/icons/app-icon-192.png", type: "image/png", sizes: "192x192" },
      { url: "/icons/app-icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#f5f2e9", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN" className={`${inter.variable} ${editorial.variable} ${chinese.variable}`}><body><PwaRegister /><AppShell cloudMode={usesSupabase()}>{children}</AppShell></body></html>;
}
