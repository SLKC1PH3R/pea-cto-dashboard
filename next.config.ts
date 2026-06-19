import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (et pdfjs-dist en dessous) résolvent leur worker via un chemin
  // relatif au fichier sur disque ; si Next.js les bundle, ce chemin casse
  // ("Cannot find module '.../pdf.worker.mjs'"). On les laisse en require
  // natif côté serveur pour que la résolution reste correcte.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
