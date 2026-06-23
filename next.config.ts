import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (et pdfjs-dist en dessous) résolvent leur worker via un chemin
  // relatif au fichier sur disque ; si Next.js les bundle, ce chemin casse
  // ("Cannot find module '.../pdf.worker.mjs'"). On les laisse en require
  // natif côté serveur pour que la résolution reste correcte.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],

  // Le Service Worker doit toujours être revérifié par le navigateur (sinon
  // une mise à jour de sw.js peut rester invisible des heures derrière un
  // cache HTTP) ; le manifest peut l'être occasionnellement.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600" }],
      },
    ];
  },
};

export default nextConfig;
