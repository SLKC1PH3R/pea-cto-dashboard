# PEA/CTO Dashboard

Dashboard personnel customisable pour suivre tes investissements PEA (Boursorama) et CTO (Trade Republic).

## Stack

- Next.js 16 (App Router) + TypeScript
- PostgreSQL + Prisma ORM 7
- NextAuth v5 (beta) — auth credentials email/password avec bcryptjs
- Tailwind CSS v4 + shadcn/ui (cohérence design avec Patrimo : fond crème, accent terracotta)
- react-grid-layout v1.5 pour le dashboard customisable (drag & resize)
- Recharts pour les graphiques
- Finnhub pour les cours de marché
- pdf-parse v2 pour l'extraction de texte des relevés Boursorama

## Setup sur le VPS (Dokploy)

### 1. Variables d'environnement

Copie `.env.example` → `.env` et renseigne :

```
DATABASE_URL="postgresql://user:password@host:5432/pea_cto_dashboard"
FINNHUB_API_KEY="ta_clé_finnhub"
NEXTAUTH_SECRET="génère avec: openssl rand -base64 32"
NEXTAUTH_URL="https://invest.digitalstack.cloud"  # ou ton domaine
```

### 2. Installation et génération Prisma

```bash
npm install
npx prisma generate
npx prisma migrate dev --name init   # ou `migrate deploy` en prod
```

> **Note** : si tu développes dans un environnement avec accès réseau restreint
> (ex: sandbox CI), `prisma generate` peut échouer car il télécharge ses
> moteurs binaires depuis `binaries.prisma.sh`. Ça fonctionnera normalement
> sur ton VPS qui a un accès réseau complet.

### 3. Build et lancement

```bash
npm run build
npm start
```

Sur Dokploy : déploiement via Dockerfile (Next.js standalone) ou buildpack Node, avec PostgreSQL en service séparé (ou réutilise ta base Patrimo existante si tu préfères isoler par schéma).

## Architecture

```
src/
  app/
    login/, register/             → pages d'authentification
    (dashboard)/
      dashboard/                  → page principale du dashboard
      import/                    → page d'import PDF + saisie manuelle + DCA
    api/
      auth/[...nextauth]/         → NextAuth (credentials email/password)
      register/                  → inscription utilisateur
      accounts/                   → CRUD comptes (PEA/CTO)
      transactions/               → création/édition/suppression manuelle
      dca-rules/                  → plans d'investissement programmé
      import/boursorama/         → import PDF multi-fichiers
      portfolio/
        summary/                  → valeur totale, P&L
        fees/                     → résumé des frais
        positions/                → tableau détaillé des positions
      layouts/[id]/widgets/      → persistance du layout customisé
  components/
    dashboard/
      DashboardGrid.tsx          → grid customisable (drag & resize)
      WidgetRenderer.tsx         → dispatch vers chaque widget
    widgets/                     → un composant par type de widget
    import/
      ImportDropzone.tsx         → drag & drop multi-PDF
      ManualTransactionForm.tsx  → saisie manuelle
      DcaRuleForm.tsx             → création de plan DCA
  lib/
    prisma.ts                    → client Prisma singleton
    auth.ts                      → config NextAuth (credentials)
    finnhub.ts                   → client API Finnhub
    finance-calculations.ts      → logique métier pure (PRU, P&L, yield, TWR, DCA)
    parsers/
      boursorama-pdf.ts           → parser PDF (2 formats : multi-ligne et single-line)
      asset-mapping.ts             → table de correspondance nom Boursorama → ticker
  middleware.ts                  → protection des routes /dashboard, /import
  types/
    dashboard.ts                  → catalogue des widgets + types partagés
    next-auth.d.ts                 → extension des types de session
prisma/
  schema.prisma                   → modèle de données complet
```

## État actuel (MVP)

✅ Schéma de données complet (users, comptes, positions, transactions, dividendes, frais, DCA, dashboard)
✅ Authentification email/password (NextAuth credentials) avec pages login/register
✅ Logique de calcul financier (PRU, P&L latent/réalisé, yield on cost, frais annualisés, TWR, projections DCA)
✅ Dashboard customisable avec drag & resize + persistance, scopé par utilisateur
✅ 3 widgets fonctionnels : Valeur totale, Résumé des frais, Tableau des positions
✅ Import PDF multi-fichiers des confirmations Boursorama (calibré et testé sur formats réels CTO + PEA)
✅ Saisie manuelle de transactions (pour Trade Republic ou tout actif non couvert par l'import)
✅ Plans DCA (investissement programmé) avec génération automatique des exécutions passées en projection
✅ Intégration Finnhub pour les cours temps réel

🚧 À faire (prochaines étapes suggérées) :
- Enrichir `asset-mapping.ts` au fil des imports (actuellement 4 actifs connus : MSCI World, Nasdaq-100, MSCI World Small Cap, Physical Silver)
- Widgets restants : courbe P&L historique, allocations (secteur/géo/devise), calendrier dividendes, comparaison benchmark, stock vs ETF équivalent
- Page de gestion des comptes (création, édition) — actuellement uniquement via API
- Interface pour ajuster/confirmer les transactions PROJECTED issues d'un DCA avec leur prix réel
- Historique de prix (`PriceHistory`) pour calculer les performances sur période précise plutôt que des approximations spot
- Import des dividendes (actuellement seules les transactions BUY/SELL et les dépôts sont extraits des PDF)

## Format des relevés Boursorama pris en charge

Le parser (`lib/parsers/boursorama-pdf.ts`) gère deux variantes observées dans les relevés réels :

1. **Format multi-lignes** ("Extrait de compte") :
   ```
   08/05/2026 ACHAT ETRANGER 11/05/2026 479,44
   Nom de la valeur: ISHS COR MSCI WLD
   Quantité: 4
   ```
2. **Format single-line** ("Relevé compte espèces") :
   ```
   04/04/2025 ACHAT ETRANGER 101 ISHS VI-ISMWSPE EO 496,08
   ```

Si Boursorama utilise un troisième format non couvert, l'import renverra un warning explicite
plutôt que d'échouer silencieusement ou de produire des données fausses.

## Plans DCA (Trade Republic)

Comme Trade Republic ne fournit qu'une confirmation de **création** du plan (pas de confirmation
par exécution), le système génère des transactions `PROJECTED` pour chaque exécution passée
théorique, en utilisant le cours Finnhub actuel comme approximation du prix. Ces transactions
sont incluses dans les calculs de P&L par défaut (affichées avec un badge "estimation" dans le
dashboard) et peuvent être ajustées une à une via `PATCH /api/transactions/:id` une fois le prix
réel connu.

## Points d'attention techniques

- **`WidgetType`** est défini à deux endroits : l'enum Prisma (`schema.prisma`) et l'union de
  types `@/types/dashboard.ts`. Les deux doivent rester synchronisés (mêmes valeurs) — si tu
  ajoutes un nouveau type de widget, mets à jour les deux.
- **`pdf-parse`** est en v2, dont l'API a changé (classe `PDFParse` avec `.getText()`/`.destroy()`,
  plus de fonction par défaut). Le parser dans `lib/parsers/boursorama-pdf.ts` a été testé et
  validé sur de vrais relevés Boursorama (formats CTO et PEA).
- **`react-grid-layout`** est volontairement fixé en v1.5.x (pas la v2, qui a une API à base de
  hooks très différente) pour rester sur l'API `Responsive` + `WidthProvider` documentée.
- **Erreurs TypeScript liées à `@prisma/client`** : tant que `npx prisma generate` n'a pas été
  exécuté (ce qui nécessite un accès réseau complet, absent dans certains sandboxes de dev), tu
  verras des erreurs `any` implicites sur les retours de `prisma.findMany(...)`. Elles disparaissent
  automatiquement une fois le client généré.

## Notes sur les calculs

- **PRU** : coût moyen pondéré (méthode standard PEA/CTO en France)
- **Yield on cost** : rendement dividendes/coût d'acquisition (pas vs valeur de marché — donne la vraie rentabilité de l'achat initial)
- **Frais annuel %** : actuellement calculé sur la valeur de marché *actuelle* en proxy de la valeur moyenne sur 12 mois. À affiner avec `PriceHistory` pour une vraie moyenne historique.
- **ETF capitalisant** : pas de `Dividend` enregistré ; la performance totale (gains réinvestis) se lit directement dans le P&L de la position.
- **Transactions `PROJECTED`** : générées par un plan DCA sans confirmation d'exécution réelle, avec le cours actuel comme approximation de prix. Incluses dans les calculs par défaut, signalées par un badge dans le widget Valeur totale.
