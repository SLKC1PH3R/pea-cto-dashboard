import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { parseBoursoramaStatement } from "@/lib/parsers/boursorama-pdf";
import { resolveAssetName } from "@/lib/parsers/asset-mapping";
import { PDFParse } from "pdf-parse";

type ImportFileResult = {
  filename: string;
  status: "ok" | "warning" | "error";
  transactionsCreated: number;
  depositsCreated: number;
  unresolvedAssets: string[];
  message?: string;
};

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

  // Vérifie que le compte appartient bien à l'utilisateur connecté
  const account = await prisma.account.findFirst({
    where: { id: accountId, userId: session.user.id },
  });
  if (!account) {
    return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
  }

  const results: ImportFileResult[] = [];

  for (const file of files) {
    const result: ImportFileResult = {
      filename: file.name,
      status: "ok",
      transactionsCreated: 0,
      depositsCreated: 0,
      unresolvedAssets: [],
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

      // Évite les doublons : on vérifie si une transaction avec le même
      // sourceDocument (nom de fichier) a déjà été importée.
      const alreadyImported = await prisma.transaction.findFirst({
        where: { sourceDocument: file.name },
      });
      if (alreadyImported) {
        result.status = "warning";
        result.message = "Ce fichier semble déjà avoir été importé (même nom de fichier détecté en base).";
        results.push(result);
        continue;
      }

      for (const tx of parsed.transactions) {
        const resolution = resolveAssetName(tx.assetName);

        if (!resolution.matched) {
          result.unresolvedAssets.push(tx.assetName);
          result.status = "warning";
          continue; // on ne peut pas créer la transaction sans actif identifié
        }

        const known = resolution.asset;

        // Upsert de l'actif
        const asset = await prisma.asset.upsert({
          where: { ticker: known.ticker },
          update: {},
          create: {
            ticker: known.ticker,
            isin: known.isin,
            name: known.name,
            sector: known.sector,
            region: known.region,
            currency: known.currency,
            assetType: known.assetType,
            benchmarkTicker: known.benchmarkTicker,
          },
        });

        // Upsert de la position (compte + actif)
        const position = await prisma.position.upsert({
          where: { accountId_assetId: { accountId, assetId: asset.id } },
          update: {},
          create: { accountId, assetId: asset.id },
        });

        // Prix unitaire = montant total / quantité (le relevé donne le montant
        // total débité, pas le prix unitaire)
        const unitPrice = tx.amount / tx.quantity;

        await prisma.transaction.create({
          data: {
            positionId: position.id,
            type: tx.type,
            status: "CONFIRMED",
            quantity: tx.quantity,
            price: unitPrice,
            fees: 0, // le relevé ne distingue pas les frais du montant total ici
            date: tx.date,
            sourceDocument: file.name,
            note: `Importé depuis PDF — ${tx.operationLabel}`,
          },
        });

        result.transactionsCreated++;
      }

      for (const dep of parsed.deposits) {
        await prisma.deposit.create({
          data: {
            accountId,
            amount: dep.amount,
            date: dep.date,
            note: `Importé depuis PDF — ${dep.label}`,
          },
        });
        result.depositsCreated++;
      }

      if (result.unresolvedAssets.length > 0) {
        result.message = `Actifs non reconnus (à ajouter dans la table de correspondance) : ${result.unresolvedAssets.join(", ")}`;
      }
    } catch (err) {
      result.status = "error";
      result.message = err instanceof Error ? err.message : "Erreur inconnue lors du parsing";
    }

    results.push(result);
  }

  return NextResponse.json({ results });
}
