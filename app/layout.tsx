import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterServiceWorker } from "./_components/register-sw";
import { inter } from "./_lib/fonts";
import { DEFAULT_THEME, THEME_COLOR, THEME_INIT_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Quits — split bills, settle up",
  description: "Free, mobile-first bill splitting for students, with UPI settle-up.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: { capable: true, title: "Quits", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: THEME_COLOR,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // data-theme is rewritten before first paint from this device's choice (R71), hence the warning opt-out.
    <html lang="en" data-theme={DEFAULT_THEME} className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
