/**
 * Génère les icônes PWA de Folio à partir du même mark que le logo affiché
 * dans l'app (carré dégradé violet --accent → --accent2 avec un carré blanc
 * centré, cf. AtelierDashboard.tsx) — pas de logo externe à importer, on
 * réutilise l'identité visuelle existante. Utilise `next/og` (satori, déjà
 * une dépendance de Next) en dehors du runtime HTTP pour produire des PNG
 * statiques, écrits une fois dans /public. Le favicon.ico est un simple
 * conteneur ICO enveloppant un PNG 48x48 (supporté par tous les navigateurs
 * modernes depuis longtemps), pour éviter une dépendance d'encodage BMP.
 *
 * Usage : npm run generate-icons
 */
import { ImageResponse } from "next/og";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ACCENT = "#9d7bf5";
const ACCENT2 = "#c9b6fb";
const BG = "#0e0c16";

function mark(size: number, innerRatio: number, radiusRatio: number) {
  const inner = Math.round(size * innerRatio);
  const radius = Math.round(size * radiusRatio);
  const innerRadius = Math.round(inner * 0.32);
  return {
    type: "div",
    props: {
      style: {
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(140deg, ${ACCENT}, ${ACCENT2})`,
        borderRadius: radius,
      },
      children: [
        {
          type: "div",
          props: {
            style: { width: inner, height: inner, background: "#fff", borderRadius: innerRadius },
          },
        },
      ],
    },
  };
}

async function renderPng(size: number, opts: { padded?: boolean } = {}): Promise<Buffer> {
  // Les icônes "maskable" ont besoin d'une zone de sécurité (~10%) car l'OS
  // peut rogner les bords en cercle/squircle — on réduit le mark et on
  // remplit tout le canevas avec le fond pour qu'il n'y ait pas de bord vide.
  const node = opts.padded
    ? {
        type: "div",
        props: {
          style: {
            width: size,
            height: size,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: BG,
          },
          children: [mark(Math.round(size * 0.7), 0.36, 0.22)],
        },
      }
    : mark(size, 0.36, 0.22);

  const res = new ImageResponse(node as never, { width: size, height: size });
  return Buffer.from(await res.arrayBuffer());
}

/** Enveloppe un PNG dans un conteneur .ico minimal (1 image, format "PNG compression"). */
function wrapAsIco(png: Buffer, size: number): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(1, 4); // count

  const entry = Buffer.alloc(16);
  entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 = 256)
  entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
  entry.writeUInt8(0, 2); // color count
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bit count
  entry.writeUInt32LE(png.length, 8); // size in bytes
  entry.writeUInt32LE(22, 12); // offset (6 + 16)

  return Buffer.concat([header, entry, png]);
}

async function main() {
  const root = join(__dirname, "..", "public");
  const iconsDir = join(root, "icons");
  await mkdir(iconsDir, { recursive: true });

  const icon192 = await renderPng(192);
  const icon512 = await renderPng(512);
  const maskable512 = await renderPng(512, { padded: true });
  const appleTouch = await renderPng(180);
  const faviconPng = await renderPng(48);

  await writeFile(join(iconsDir, "icon-192.png"), icon192);
  await writeFile(join(iconsDir, "icon-512.png"), icon512);
  await writeFile(join(iconsDir, "icon-512-maskable.png"), maskable512);
  await writeFile(join(root, "apple-touch-icon.png"), appleTouch);
  await writeFile(join(root, "favicon.ico"), wrapAsIco(faviconPng, 48));
  // app/favicon.ico (convention Next.js — prioritaire sur public/favicon.ico)
  await writeFile(join(__dirname, "..", "src", "app", "favicon.ico"), wrapAsIco(faviconPng, 48));

  console.log("Icônes PWA générées dans /public (icons/, apple-touch-icon.png, favicon.ico).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
