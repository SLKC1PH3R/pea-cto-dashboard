"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/dashboard", label: "Synthèse" },
  { href: "/portefeuille", label: "Portefeuille" },
  { href: "/marches", label: "Marchés" },
  { href: "/objectifs", label: "Objectifs" },
  { href: "/import", label: "Importer" },
];

export function DashboardNav() {
  const pathname = usePathname();

  return (
    <nav className="flex gap-1 rounded-2xl border border-[var(--line)] bg-[var(--panel2)] p-[5px]">
      {TABS.map((t) => {
        const active = pathname === t.href || (t.href !== "/dashboard" && pathname?.startsWith(t.href));
        return active ? (
          <span
            key={t.href}
            className="rounded-[10px] bg-[var(--accent)] px-[15px] py-[7px] text-[13px] font-semibold text-white"
          >
            {t.label}
          </span>
        ) : (
          <Link
            key={t.href}
            href={t.href}
            className="rounded-[10px] px-[15px] py-[7px] text-[13px] font-medium text-[var(--fg2)] hover:text-[var(--fg)]"
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
