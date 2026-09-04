import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Cormorant_Garamond } from "next/font/google";
import localFont from "next/font/local";
import { AppShell } from "@/components/app-shell";
import { LocaleController } from "@/components/locale-controller";
import { PwaRegister } from "@/components/pwa-register";
import { usesSupabase } from "@/lib/config";
import "./globals.css";

const chinese = localFont({ src: "./fonts/canger-huaxin.ttf", weight: "400", style: "normal", variable: "--font-canger-huaxin", display: "swap" });
const zenSerif = localFont({ src: "./fonts/zen-serif-regular.otf", weight: "400", style: "normal", variable: "--font-zen-serif", display: "swap" });
const lxgw = localFont({ src: "./fonts/lxgw-wenkai-regular.ttf", weight: "400", style: "normal", variable: "--font-lxgw", display: "swap", preload: false });
const ibmPlex = localFont({ src: "./fonts/ibm-plex-sans-sc-regular.otf", weight: "400", style: "normal", variable: "--font-ibm-plex", display: "swap", preload: false });
const polyamine = localFont({ src: "./fonts/polyamine.ttf", weight: "400", style: "normal", variable: "--font-polyamine", display: "swap", preload: false });
const alimama = localFont({ src: "./fonts/alimama-fangyuan-thin.ttf", weight: "100 900", style: "normal", variable: "--font-alimama", display: "swap", preload: false });
const cormorant = Cormorant_Garamond({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-cormorant", display: "swap", preload: false });

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
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#f5f2e9", width: "device-width", initialScale: 1, viewportFit: "cover", colorScheme: "light dark" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN" className={`${chinese.variable} ${zenSerif.variable} ${lxgw.variable} ${ibmPlex.variable} ${polyamine.variable} ${alimama.variable} ${cormorant.variable}`} suppressHydrationWarning><body><Script src="/theme-init.js" strategy="beforeInteractive" /><PwaRegister /><LocaleController><AppShell cloudMode={usesSupabase()}>{children}</AppShell></LocaleController></body></html>;
}
