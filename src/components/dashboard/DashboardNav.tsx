import Link from "next/link";

const TABS = [
  { href: "/dashboard", label: "Synthèse" },
  { href: "/dashboard?tab=portefeuille", label: "Portefeuille" },
  { href: "/dashboard?tab=marches", label: "Marchés" },
  { href: "/dashboard?tab=objectifs", label: "Objectifs" },
];

export function DashboardNav() {
  return (
    <nav className="flex gap-1 rounded-2xl border border-[var(--line)] bg-[var(--panel2)] p-[5px]">
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className="rounded-[10px] px-[15px] py-[7px] text-[13px] font-medium text-[var(--fg2)] hover:text-[var(--fg)]"
        >
          {t.label}
        </Link>
      ))}
      <span className="rounded-[10px] bg-[var(--accent)] px-[15px] py-[7px] text-[13px] font-semibold text-white">Importer</span>
    </nav>
  );
}
