# PEA/CTO Dashboard

Dashboard personnel customisable pour suivre tes investissements PEA (Boursorama) et CTO (Trade Republic).

## Stack

- Next.js 15 (App Router) + TypeScript
- PostgreSQL + Prisma ORM 7
- Tailwind CSS v4 + shadcn/ui (cohérence design avec Patrimo : fond crème, accent terracotta)
- react-grid-layout pour le dashboard customisable (drag & resize)
- Recharts pour les graphiques
- Finnhub pour les cours de marché

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
    (dashboard)/dashboard/   → page principale du dashboard
    api/
      accounts/              → CRUD comptes (PEA/CTO)
      portfolio/
        summary/             → valeur totale, P&L
        fees/                → résumé des frais
        positions/           → tableau détaillé des positions
      layouts/[id]/widgets/  → persistance du layout customisé
  components/
    dashboard/
      DashboardGrid.tsx      → grid customisable (drag & resize)
      WidgetRenderer.tsx     → dispatch vers chaque widget
    widgets/                 → un composant par type de widget
  lib/
    prisma.ts                → client Prisma singleton
    finnhub.ts                → client API Finnhub
    finance-calculations.ts  → logique métier pure (PRU, P&L, yield, TWR...)
  types/
    dashboard.ts              → catalogue des widgets + types partagés
prisma/
  schema.prisma                → modèle de données complet
```

## État actuel (MVP)

✅ Schéma de données complet (comptes, positions, transactions, dividendes, frais, dashboard)
✅ Logique de calcul financier (PRU, P&L latent/réalisé, yield on cost, frais annualisés, TWR)
✅ Dashboard customisable avec drag & resize + persistance
✅ 3 widgets fonctionnels : Valeur totale, Résumé des frais, Tableau des positions
✅ Intégration Finnhub pour les cours temps réel

🚧 À faire (prochaines étapes suggérées) :
- Import CSV Boursorama + Trade Republic (mapping vers Transaction/Dividend)
- Widgets restants : courbe P&L historique, allocations (secteur/géo/devise), calendrier dividendes, comparaison benchmark, stock vs ETF équivalent
- Page de gestion des comptes (création, édition)
- Historique de prix (`PriceHistory`) pour calculer les performances sur période précise plutôt que des approximations spot
- Authentification (NextAuth) — actuellement le dashboard est mono-layout sans notion d'utilisateur

## Notes sur les calculs

- **PRU** : coût moyen pondéré (méthode standard PEA/CTO en France)
- **Yield on cost** : rendement dividendes/coût d'acquisition (pas vs valeur de marché — donne la vraie rentabilité de l'achat initial)
- **Frais annuel %** : actuellement calculé sur la valeur de marché *actuelle* en proxy de la valeur moyenne sur 12 mois. À affiner avec `PriceHistory` pour une vraie moyenne historique.
- **ETF capitalisant** : pas de `Dividend` enregistré ; la performance totale (gains réinvestis) se lit directement dans le P&L de la position.
