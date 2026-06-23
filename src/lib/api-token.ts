import { randomBytes, createHash } from "node:crypto";

/**
 * Tokens d'accès personnels (extension navigateur) — même logique que
 * passwordHash : seul le hash SHA-256 est stocké en base, le token brut
 * n'existe que côté client (chrome.storage de l'extension) et n'est montré
 * qu'une fois à l'utilisateur, à sa création.
 */

const PREFIX = "folio_ext_";

export function generateApiToken(): string {
  return `${PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
