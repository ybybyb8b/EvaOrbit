import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { AppShell } from "@/components/app-shell";
import { ActionToastViewport } from "@/components/action-toast";
import { ErrorFeedbackProvider } from "@/components/error-feedback";
import { LocaleController } from "@/components/locale-controller";
import { ThemeController } from "@/components/theme-controller";
import { PwaRegister } from "@/components/pwa-register";
import { usesSupabase } from "@/lib/config";
import { getClientCacheScope } from "@/lib/services/home-cache-scope";
import "./globals.css";
import "./fonts.css";

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

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cacheScope = await getClientCacheScope();
  return <html lang="zh-CN" suppressHydrationWarning><body><Script src="/theme-init.js" strategy="beforeInteractive" /><PwaRegister /><LocaleController><ThemeController /><ErrorFeedbackProvider><AppShell cloudMode={usesSupabase()} cacheScope={cacheScope}>{children}</AppShell><ActionToastViewport/></ErrorFeedbackProvider></LocaleController></body></html>;
}
