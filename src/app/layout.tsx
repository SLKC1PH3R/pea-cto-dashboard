import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { InstallFolioButton } from "@/components/pwa/InstallFolioButton";
import "./globals.css";

const bodyFont = Plus_Jakarta_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const numFont = Space_Grotesk({
  variable: "--font-num",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Folio",
  description: "Suivi patrimonial PEA / CTO",
  manifest: "/manifest.webmanifest",
  applicationName: "Folio",
  appleWebApp: {
    capable: true,
    title: "Folio",
    statusBarStyle: "black-translucent",
  },
  icons: {
    // favicon.ico est déjà servi automatiquement via app/favicon.ico (convention
    // Next.js) — pas besoin de le redéclarer ici, ça créerait un <link> dupliqué.
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  other: {
    // Safari iOS historique lit ce nom-ci plutôt que le standard
    // "mobile-web-app-capable" déjà généré par `appleWebApp.capable`.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0e0c16",
  colorScheme: "dark light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="fr"
      className={`${bodyFont.variable} ${numFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SessionProvider>{children}</SessionProvider>
        <ServiceWorkerRegister />
        <InstallFolioButton />
      </body>
    </html>
  );
}
