import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { parseBoursoramaStatement } from "@/lib/parsers/boursorama-pdf";
import { resolveAssetName } from "@/lib/parsers/asset-mapping";
import { searchSymbol } from "@/lib/finnhub";
import { PDFParse } from "pdf-parse";

export type PreviewTransaction = {
  date: string;
  operationLabel: string;
  assetName: string;
  ticker: string | null;
  resolvedName: string | null;
  quantity: number;
  amount: number;
  type: "BUY" | "SELL";
  suggested: boolean; // ticker proposé automatiquement via recherche Finnhub, à vérifier avant confirmation
};

/**
 * Quand le nom Boursorama n'est pas reconnu dans la table statique
 * (asset-mapping.ts), ou qu'il l'est mais sans ticker connu avec certitude
 * (fonds identifié par son ISIN uniquement), on tente une recherche Finnhub
 * (par nom ou par ISIN, selon ce qu'on a de plus fiable) pour proposer un
 * ticker — l'utilisateur reste libre de le corriger/retirer avant de
 * confirmer l'import (rien n'est jamais assigné silencieusement).
 */
async function suggestTicker(query: string): Promise<{ ticker: string; name: string } | null> {
  try {
    const results = await searchSymbol(query);
    const best = results.find((r) => r.symbol && r.description) ?? null;
    if (!best) return null;
    return { ticker: best.symbol, name: best.description };
  } catch {
    return null;
  }
}

export type PreviewDeposit = {
  date: string;
  label: string;
  amount: number;
};

type PreviewFileResult = {
  filename: string;
  status: "ok" | "warning" | "error";
  message?: string;
  alreadyImported: boolean;
  transactions: PreviewTransaction[];
  deposits: PreviewDeposit[];
};

/**
 * Parse les PDF déposés et renvoie un aperçu — aucune écriture en base ici.
 * L'utilisateur valide/édite les lignes côté client puis confirme via
 * POST /api/import/boursorama/confirm.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const formData = await req.formData();
  const accountId = formData.get("accountId") as string | null;
  const files = formData.getAll("files") as File[];

  if (!accountId) {
    return NextResponse.json({ error: "accountId requis" }, { status: 400 });
  }
  if (files.length === 0) {
    return NextResponse.json({ error: "Aucun fichier fourni" }, { status: 400 });
  }

  const account = await prisma.account.findFirst({
    where: { id: accountId, userId: session.user.id },
  });
  if (!account) {
    return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
  }

  const results: PreviewFileResult[] = [];

  for (const file of files) {
    const result: PreviewFileResult = {
      filename: file.name,
      status: "ok",
      alreadyImported: false,
      transactions: [],
      deposits: [],
    };

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const parser = new PDFParse({ data: buffer });
      const { text } = await parser.getText();
      await parser.destroy();
      const parsed = parseBoursoramaStatement(text);

      if (parsed.warnings.length > 0) {
        result.status = "warning";
        result.message = parsed.warnings.join(" ");
      }

      const alreadyImported = await prisma.transaction.findFirst({
        where: { sourceDocument: file.name },
      });
      if (alreadyImported) {
        result.status = "warning";
        result.alreadyImported = true;
        result.message = "Ce fichier semble déjà avoir été importé (même nom de fichier détecté en base).";
      }

      result.transactions = await Promise.all(
        parsed.transactions.map(async (tx) => {
          const resolution = resolveAssetName(tx.assetName);

          if (resolution.matched && resolution.asset.ticker) {
            return {
              date: tx.date.toISOString(),
              operationLabel: tx.operationLabel,
              assetName: tx.assetName,
              ticker: resolution.asset.ticker,
              resolvedName: resolution.asset.name,
              quantity: tx.quantity,
              amount: tx.amount,
              type: tx.type,
              suggested: false,
            };
          }

          if (resolution.matched && resolution.asset.isin) {
            // Fonds connu (nom + ISIN) mais sans ticker fiabilisé : on
            // recherche le ticker exact via Finnhub par ISIN.
            const suggestion = await suggestTicker(resolution.asset.isin);
            return {
              date: tx.date.toISOString(),
              operationLabel: tx.operationLabel,
              assetName: tx.assetName,
              ticker: suggestion?.ticker ?? null,
              resolvedName: resolution.asset.name,
              quantity: tx.quantity,
              amount: tx.amount,
              type: tx.type,
              suggested: true,
            };
          }

          const suggestion = await suggestTicker(tx.assetName);
          return {
            date: tx.date.toISOString(),
            operationLabel: tx.operationLabel,
            assetName: tx.assetName,
            ticker: suggestion?.ticker ?? null,
            resolvedName: suggestion?.name ?? null,
            quantity: tx.quantity,
            amount: tx.amount,
            type: tx.type,
            suggested: suggestion !== null,
          };
        })
      );

      result.deposits = parsed.deposits.map((d) => ({
        date: d.date.toISOString().slice(0, 10),
        label: d.label,
        amount: d.amount,
      }));

      if (result.transactions.some((t) => !t.ticker) && result.status === "ok") {
        result.status = "warning";
        result.message = "Certains actifs n'ont pas pu être reconnus automatiquement — renseigne leur ticker avant de confirmer.";
      } else if (result.transactions.some((t) => t.suggested) && result.status === "ok") {
        result.status = "warning";
        result.message = "Certains tickers ont été proposés automatiquement via une recherche Finnhub — vérifie-les avant de confirmer.";
      }
    } catch (err) {
      result.status = "error";
      result.message = err instanceof Error ? err.message : "Erreur inconnue lors du parsing";
    }

    results.push(result);
  }

  return NextResponse.json({ results });
}
