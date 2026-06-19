import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { parseBoursoramaStatement } from "@/lib/parsers/boursorama-pdf";
import { resolveAssetName } from "@/lib/parsers/asset-mapping";
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
};

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

      result.transactions = parsed.transactions.map((tx) => {
        const resolution = resolveAssetName(tx.assetName);
        return {
          date: tx.date.toISOString().slice(0, 10),
          operationLabel: tx.operationLabel,
          assetName: tx.assetName,
          ticker: resolution.matched ? resolution.asset.ticker : null,
          resolvedName: resolution.matched ? resolution.asset.name : null,
          quantity: tx.quantity,
          amount: tx.amount,
          type: tx.type,
        };
      });

      result.deposits = parsed.deposits.map((d) => ({
        date: d.date.toISOString().slice(0, 10),
        label: d.label,
        amount: d.amount,
      }));

      if (result.transactions.some((t) => !t.ticker) && result.status === "ok") {
        result.status = "warning";
        result.message = "Certains actifs n'ont pas pu être reconnus automatiquement — renseigne leur ticker avant de confirmer.";
      }
    } catch (err) {
      result.status = "error";
      result.message = err instanceof Error ? err.message : "Erreur inconnue lors du parsing";
    }

    results.push(result);
  }

  return NextResponse.json({ results });
}
