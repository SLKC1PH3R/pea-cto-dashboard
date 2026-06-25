import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { parseBoursoramaStatement } from "@/lib/parsers/boursorama-pdf";
import { resolveAssetName, resolveAssetByIsin } from "@/lib/parsers/asset-mapping";
import { findTradingViewSymbolByIsin, findTradingViewSymbolByName, toDisplayTicker } from "@/lib/tradingview-quote";
import { txHeuristicKey, txHeuristicKeyVariants, txReferenceKey, depositDuplicateKey, dividendDuplicateKey } from "@/lib/parsers/duplicate-key";
import { PDFParse } from "pdf-parse";

export type PreviewTransaction = {
  date: string;
  operationLabel: string;
  assetName: string;
  isin: string | null;
  reference: string | null;
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

export type PreviewDividend = {
  date: string;
  label: string;
  assetName: string | null;
  isin: string | null;
  ticker: string | null;
  resolvedName: string | null;
  amount: number;
  suggested: boolean;
  duplicate: boolean;
};

type PreviewFileResult = {
  filename: string;
  status: "ok" | "warning" | "error";
  message?: string;
  alreadyImported: boolean;
  transactions: PreviewTransaction[];
  deposits: PreviewDeposit[];
  dividends: PreviewDividend[];
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
  // déposés dans le même import, OU avec un import antérieur dans une autre
  // requête (ex: relevé espèces confirmé un jour, avis d'opéré du même ordre
  // importé plus tard). Trois ensembles :
  // - seenRefKeys : toutes les références d'ordre déjà connues.
  // - allHeuristicKeys : empreinte jour/actif/sens/montant de TOUT mouvement
  //   déjà accepté (avec ou sans référence) — sert à repérer un doublon
  //   arrivant SANS référence (relevé espèces).
  // - noRefHeuristicKeys : empreinte des seuls mouvements acceptés SANS
  //   référence — sert à repérer un doublon arrivant AVEC référence (avis
  //   d'opéré). On ne compare jamais un avis à un autre avis sur cette seule
  //   empreinte : deux ordres distincts peuvent légitimement partager la
  //   même quantité/le même montant le même jour (exécution fractionnée).
  // Seules les transactions CONFIRMED comptent comme doublons potentiels —
  // une PROJECTED (exécution DCA en attente, cf. dca-sync.ts) ne doit jamais
  // bloquer l'import d'une exécution réelle correspondante : elle sera
  // remplacée par celle-ci à la confirmation (voir dca-reconcile.ts).
  const existingTx = await prisma.transaction.findMany({
    where: { position: { accountId }, status: "CONFIRMED" },
    select: {
      date: true,
      quantity: true,
      price: true,
      type: true,
      externalRef: true,
      position: { select: { asset: { select: { ticker: true } } } },
    },
  });
  const seenRefKeys = new Set(existingTx.filter((t) => t.externalRef).map((t) => txReferenceKey(t.externalRef!)));
  const allHeuristicKeys = new Set(
    existingTx.map((t) => txHeuristicKey(t.position.asset.ticker, t.type, Number(t.quantity) * Number(t.price), t.date))
  );
  const noRefHeuristicKeys = new Set(
    existingTx
      .filter((t) => !t.externalRef)
      .map((t) => txHeuristicKey(t.position.asset.ticker, t.type, Number(t.quantity) * Number(t.price), t.date))
  );
  const existingDeposits = await prisma.deposit.findMany({ where: { accountId }, select: { date: true, amount: true } });
  const seenDepKeys = new Set(existingDeposits.map((d) => depositDuplicateKey(Number(d.amount), d.date)));

  const existingDividends = await prisma.dividend.findMany({
    where: { position: { accountId } },
    select: { date: true, netAmount: true, position: { select: { asset: { select: { ticker: true } } } } },
  });
  const seenDivKeys = new Set(
    existingDividends.map((d) => dividendDuplicateKey(d.position.asset.ticker, Number(d.netAmount), d.date))
  );

  // Phase 1 : parser chaque fichier et résoudre les tickers, sans encore
  // décider des doublons (qui se fait en phase 2, sur l'ensemble du batch —
  // voir plus bas pour pourquoi l'ordre de traitement des fichiers ne doit
  // pas influencer le résultat).
  type ResolvedTx = PreviewTransaction;
  const fileResolvedTx: ResolvedTx[][] = [];
  const results: PreviewFileResult[] = [];

  for (const file of files) {
    const result: PreviewFileResult = {
      filename: file.name,
      status: "ok",
      alreadyImported: false,
      transactions: [],
      deposits: [],
      dividends: [],
    };
    let resolvedTransactions: Omit<ResolvedTx, "duplicate">[] = [];

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

      resolvedTransactions = await Promise.all(
        parsed.transactions.map(async (tx) => {
          const base = {
            date: tx.date.toISOString(),
            operationLabel: tx.operationLabel,
            assetName: tx.assetName,
            isin: tx.isin,
            reference: tx.reference,
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

      result.deposits = parsed.deposits.map((d) => {
        const key = depositDuplicateKey(d.amount, d.date);
        const duplicate = seenDepKeys.has(key);
        seenDepKeys.add(key);
        return { date: d.date.toISOString().slice(0, 10), label: d.label, amount: d.amount, duplicate };
      });

      if (result.deposits.some((d) => d.duplicate)) {
        result.status = "warning";
        result.message = [result.message, "Des dépôts déjà importés (même jour/montant) ont été détectés et décochés par défaut."]
          .filter(Boolean)
          .join(" ");
      }

      result.dividends = await Promise.all(
        parsed.dividends.map(async (div) => {
          let ticker: string | null = null;
          let resolvedName: string | null = null;
          let suggested = false;

          if (div.isin) {
            const byIsin = resolveAssetByIsin(div.isin);
            if (byIsin?.matched && byIsin.asset.ticker) {
              ticker = byIsin.asset.ticker;
              resolvedName = byIsin.asset.name;
            } else {
              resolvedName = byIsin?.matched ? byIsin.asset.name : null;
              const suggestion = await suggestTicker(div.isin, true);
              if (suggestion) {
                ticker = suggestion.ticker;
                resolvedName = resolvedName ?? suggestion.name;
                suggested = true;
              }
            }
          }

          if (!ticker && div.assetName) {
            const resolution = resolveAssetName(div.assetName);
            if (resolution.matched && resolution.asset.ticker) {
              ticker = resolution.asset.ticker;
              resolvedName = resolution.asset.name;
            } else if (resolution.matched && resolution.asset.isin) {
              const suggestion = await suggestTicker(resolution.asset.isin, true);
              ticker = suggestion?.ticker ?? null;
              resolvedName = resolution.asset.name;
              suggested = true;
            } else {
              const suggestion = await suggestTicker(div.assetName, false);
              ticker = suggestion?.ticker ?? null;
              resolvedName = suggestion?.name ?? null;
              suggested = suggestion !== null;
            }
          }

          const duplicate = ticker ? seenDivKeys.has(dividendDuplicateKey(ticker, div.amount, div.date)) : false;
          if (ticker && !duplicate) seenDivKeys.add(dividendDuplicateKey(ticker, div.amount, div.date));

          return {
            date: div.date.toISOString(),
            label: div.label,
            assetName: div.assetName,
            isin: div.isin,
            ticker,
            resolvedName,
            amount: div.amount,
            suggested,
            duplicate,
          };
        })
      );
    } catch (err) {
      result.status = "error";
      result.message = err instanceof Error ? err.message : "Erreur inconnue lors du parsing";
    }

    fileResolvedTx.push(resolvedTransactions.map((tx) => ({ ...tx, duplicate: false })));
    results.push(result);
  }

  // Phase 2 : déduplication sur l'ensemble du batch — l'ordre de traitement
  // n'a plus d'importance (contrairement à une version antérieure de cette
  // logique) grâce à la distinction entre allHeuristicKeys (empreinte de
  // tout mouvement accepté) et noRefHeuristicKeys (empreinte des seuls
  // mouvements SANS référence). Une ligne avec référence n'est comparée
  // qu'à noRefHeuristicKeys (jamais à un autre avis d'opéré, pour ne pas
  // fusionner deux ordres distincts) ; une ligne sans référence est comparée
  // à allHeuristicKeys (elle doit détecter un doublon avec n'importe quel
  // mouvement déjà connu, avis ou relevé). Cela reste valable même si le
  // mouvement "déjà connu" provient d'un import confirmé dans une requête
  // précédente, puisque seenRefKeys/allHeuristicKeys/noRefHeuristicKeys
  // partent de l'état réel en base.
  const allTx: { fileIdx: number; txIdx: number; tx: Omit<ResolvedTx, "duplicate"> }[] = [];
  fileResolvedTx.forEach((txs, fileIdx) => txs.forEach((tx, txIdx) => allTx.push({ fileIdx, txIdx, tx })));

  for (const { fileIdx, txIdx, tx } of allTx) {
    if (!tx.ticker) continue;
    const date = new Date(tx.date);
    const exactKey = txHeuristicKey(tx.ticker, tx.type, tx.amount, date);
    // Tolérance J-1/J/J+1 : le relevé espèces utilise la date de
    // comptabilisation, qui peut différer d'un jour de la date d'exécution
    // imprimée sur l'avis d'opéré pour le même ordre.
    const variants = txHeuristicKeyVariants(tx.ticker, tx.type, tx.amount, date);

    if (tx.reference) {
      const refKey = txReferenceKey(tx.reference);
      const duplicate = seenRefKeys.has(refKey) || variants.some((k) => noRefHeuristicKeys.has(k));
      if (!duplicate) {
        seenRefKeys.add(refKey);
        allHeuristicKeys.add(exactKey);
      }
      fileResolvedTx[fileIdx][txIdx].duplicate = duplicate;
    } else {
      const duplicate = variants.some((k) => allHeuristicKeys.has(k));
      if (!duplicate) {
        allHeuristicKeys.add(exactKey);
        noRefHeuristicKeys.add(exactKey);
      }
      fileResolvedTx[fileIdx][txIdx].duplicate = duplicate;
    }
  }

  results.forEach((result, fileIdx) => {
    result.transactions = fileResolvedTx[fileIdx];

    if (result.transactions.some((t) => t.duplicate)) {
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
  });

  return NextResponse.json({ results });
}
