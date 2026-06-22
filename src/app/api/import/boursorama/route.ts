import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { parseBoursoramaStatement } from "@/lib/parsers/boursorama-pdf";
import { resolveAssetName, resolveAssetByIsin } from "@/lib/parsers/asset-mapping";
import { findTradingViewSymbolByIsin, findTradingViewSymbolByName, toDisplayTicker } from "@/lib/tradingview-quote";
import { txDuplicateKey, depositDuplicateKey } from "@/lib/parsers/duplicate-key";
import { PDFParse } from "pdf-parse";

export type PreviewTransaction = {
  date: string;
  operationLabel: string;
  assetName: string;
  isin: string | null;
  ticker: string | null;
  resolvedName: string | null;
  quantity: number;
  amount: number;
  type: "BUY" | "SELL";
  suggested: boolean; // ticker proposé automatiquement via recherche tradingview.com, à vérifier avant confirmation
  duplicate: boolean; // un mouvement au même jour/actif/sens/montant existe déjà (en base ou plus haut dans ce même import)
};

/**
 * Quand le nom Boursorama n'est pas reconnu dans la table statique
 * (asset-mapping.ts), ou qu'il l'est mais sans ticker connu avec certitude
 * (fonds identifié par son ISIN uniquement), on tente une recherche
 * tradingview.com (par ISIN ou par nom, selon ce qu'on a de plus fiable)
 * pour proposer un ticker — tradingview.com couvre nettement mieux les
 * petits fonds UCITS PEA français que Finnhub. L'utilisateur reste libre de
 * corriger/retirer la suggestion avant de confirmer l'import (rien n'est
 * jamais assigné silencieusement). Mise en cache mémoire le temps de la
 * requête : un même fonds apparaît souvent des dizaines de fois dans un gros
 * relevé, pas besoin de le rechercher à chaque ligne.
 */
const suggestCache = new Map<string, { ticker: string; name: string } | null>();

async function suggestTicker(query: string, byIsin: boolean): Promise<{ ticker: string; name: string } | null> {
  const cacheKey = `${byIsin ? "isin" : "name"}:${query.toUpperCase()}`;
  if (suggestCache.has(cacheKey)) return suggestCache.get(cacheKey)!;

  const sym = byIsin ? await findTradingViewSymbolByIsin(query) : await findTradingViewSymbolByName(query);
  const result = sym ? { ticker: toDisplayTicker(sym), name: sym.description } : null;
  suggestCache.set(cacheKey, result);
  return result;
}

export type PreviewDeposit = {
  date: string;
  label: string;
  amount: number;
  duplicate: boolean;
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

  // Clés de mouvements déjà connus (en base) pour ce compte — étendues au fil
  // de l'analyse pour repérer aussi les doublons entre plusieurs fichiers
  // déposés dans le même import (ex: un avis d'opéré + le relevé espèces du
  // même mois, qui contiennent la même opération sous deux mises en page).
  const existingTx = await prisma.transaction.findMany({
    where: { position: { accountId } },
    select: { date: true, quantity: true, price: true, type: true, position: { select: { asset: { select: { ticker: true } } } } },
  });
  const seenTxKeys = new Set(
    existingTx.map((t) => txDuplicateKey(t.position.asset.ticker, t.type, Number(t.quantity) * Number(t.price), t.date))
  );
  const existingDeposits = await prisma.deposit.findMany({ where: { accountId }, select: { date: true, amount: true } });
  const seenDepKeys = new Set(existingDeposits.map((d) => depositDuplicateKey(Number(d.amount), d.date)));

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

      const resolvedTransactions = await Promise.all(
        parsed.transactions.map(async (tx) => {
          const base = {
            date: tx.date.toISOString(),
            operationLabel: tx.operationLabel,
            assetName: tx.assetName,
            isin: tx.isin,
            quantity: tx.quantity,
            amount: tx.amount,
            type: tx.type,
          };

          // 1) ISIN imprimé sur le document — identifiant le plus fiable,
          // on le préfère systématiquement au nom abrégé Boursorama.
          if (tx.isin) {
            const byIsin = resolveAssetByIsin(tx.isin);
            if (byIsin?.matched && byIsin.asset.ticker) {
              return { ...base, ticker: byIsin.asset.ticker, resolvedName: byIsin.asset.name, suggested: false };
            }
            const resolvedName = byIsin?.matched ? byIsin.asset.name : null;
            const suggestion = await suggestTicker(tx.isin, true);
            if (suggestion) {
              return { ...base, ticker: suggestion.ticker, resolvedName: resolvedName ?? suggestion.name, suggested: true };
            }
            // ISIN connu mais introuvable sur tradingview.com : on continue avec le nom.
          }

          // 2) Nom Boursorama reconnu dans la table statique.
          const resolution = resolveAssetName(tx.assetName);
          if (resolution.matched && resolution.asset.ticker) {
            return { ...base, ticker: resolution.asset.ticker, resolvedName: resolution.asset.name, suggested: false };
          }
          if (resolution.matched && resolution.asset.isin) {
            const suggestion = await suggestTicker(resolution.asset.isin, true);
            return { ...base, ticker: suggestion?.ticker ?? null, resolvedName: resolution.asset.name, suggested: true };
          }

          // 3) Dernier recours : recherche tradingview.com sur le nom brut.
          const suggestion = await suggestTicker(tx.assetName, false);
          return {
            ...base,
            ticker: suggestion?.ticker ?? null,
            resolvedName: suggestion?.name ?? null,
            suggested: suggestion !== null,
          };
        })
      );

      // Marque comme doublon tout mouvement dont la clé jour/actif/sens/montant
      // a déjà été vue (en base, ou plus haut dans ce même import) — et
      // l'enregistre pour repérer aussi les doublons entre fichiers de ce batch.
      result.transactions = resolvedTransactions.map((tx) => {
        if (!tx.ticker) return { ...tx, duplicate: false };
        const key = txDuplicateKey(tx.ticker, tx.type, tx.amount, new Date(tx.date));
        const duplicate = seenTxKeys.has(key);
        seenTxKeys.add(key);
        return { ...tx, duplicate };
      });

      result.deposits = parsed.deposits.map((d) => {
        const key = depositDuplicateKey(d.amount, d.date);
        const duplicate = seenDepKeys.has(key);
        seenDepKeys.add(key);
        return { date: d.date.toISOString().slice(0, 10), label: d.label, amount: d.amount, duplicate };
      });

      if (result.transactions.some((t) => t.duplicate) || result.deposits.some((d) => d.duplicate)) {
        result.status = "warning";
        result.message = [result.message, "Des lignes correspondant à un mouvement déjà importé (même jour/actif/montant) ont été détectées et décochées par défaut."]
          .filter(Boolean)
          .join(" ");
      }

      if (result.transactions.some((t) => !t.ticker) && result.status === "ok") {
        result.status = "warning";
        result.message = "Certains actifs n'ont pas pu être reconnus automatiquement — renseigne leur ticker avant de confirmer.";
      } else if (result.transactions.some((t) => t.suggested) && result.status === "ok") {
        result.status = "warning";
        result.message = "Certains tickers ont été proposés automatiquement via une recherche tradingview.com — vérifie-les avant de confirmer.";
      }
    } catch (err) {
      result.status = "error";
      result.message = err instanceof Error ? err.message : "Erreur inconnue lors du parsing";
    }

    results.push(result);
  }

  return NextResponse.json({ results });
}
