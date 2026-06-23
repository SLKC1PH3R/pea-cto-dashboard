/**
 * Génère les icônes PWA de Folio à partir du logo réel (`public/folio-logo.svg`)
 * — plus de mark générée à la main. Utilise `next/og` (satori, déjà une
 * dépendance de Next) en dehors du runtime HTTP pour rasteriser le SVG en
 * PNG aux tailles requises, écrites une fois dans /public. Le favicon.ico
 * est un simple conteneur ICO enveloppant un PNG 48x48 (supporté par tous
 * les navigateurs modernes depuis longtemps), pour éviter une dépendance
 * d'encodage BMP.
 *
 * Usage : npm run generate-icons
 */
import { ImageResponse } from "next/og";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BG = "#0e0c16";

async function loadLogoDataUri(): Promise<string> {
  const svg = await readFile(join(__dirname, "..", "public", "folio-logo.svg"), "utf8");
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

async function renderPng(logoDataUri: string, size: number, opts: { padded?: boolean } = {}): Promise<Buffer> {
  // Les icônes "maskable" ont besoin d'une zone de sécurité (~20%) car l'OS
  // peut rogner les bords en cercle/squircle — on réduit le logo et on
  // remplit tout le canevas avec le fond pour qu'il n'y ait pas de bord vide.
  const logoSize = opts.padded ? Math.round(size * 0.7) : size;
  const node = {
    type: "div",
    props: {
      style: {
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: opts.padded ? BG : "transparent",
      },
      children: [
        {
          type: "img",
          props: { src: logoDataUri, width: logoSize, height: logoSize },
        },
      ],
    },
  };

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
  const extensionIconsDir = join(__dirname, "..", "extension", "icons");
  await mkdir(iconsDir, { recursive: true });
  await mkdir(extensionIconsDir, { recursive: true });

  const logoDataUri = await loadLogoDataUri();

  const icon192 = await renderPng(logoDataUri, 192);
  const icon512 = await renderPng(logoDataUri, 512);
  const maskable512 = await renderPng(logoDataUri, 512, { padded: true });
  const appleTouch = await renderPng(logoDataUri, 180);
  const faviconPng = await renderPng(logoDataUri, 48);

  await writeFile(join(iconsDir, "icon-192.png"), icon192);
  await writeFile(join(iconsDir, "icon-512.png"), icon512);
  await writeFile(join(iconsDir, "icon-512-maskable.png"), maskable512);
  await writeFile(join(root, "apple-touch-icon.png"), appleTouch);
  await writeFile(join(root, "favicon.ico"), wrapAsIco(faviconPng, 48));
  // app/favicon.ico (convention Next.js — prioritaire sur public/favicon.ico)
  await writeFile(join(__dirname, "..", "src", "app", "favicon.ico"), wrapAsIco(faviconPng, 48));

  // Icônes de l'extension navigateur (manifest MV3 attend 16/32/48/128)
  for (const size of [16, 32, 48, 128]) {
    const png = await renderPng(logoDataUri, size);
    await writeFile(join(extensionIconsDir, `icon-${size}.png`), png);
  }

  console.log("Icônes PWA + extension générées depuis folio-logo.svg.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
