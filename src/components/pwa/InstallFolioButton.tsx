"use client";

import { useEffect, useState } from "react";

// v2 : nouvelle clé pour ne pas hériter d'un refus mémorisé sous l'ancien
// design (encart flottant) — sans ça, un clic accidentel sur "Non merci"
// avant ce changement cacherait le nouveau bouton intégré à la topbar.
const DISMISS_KEY = "folio-install-dismissed-v2";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari expose ce flag plutôt que le media query display-mode.
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Bouton d'installation compact, intégré à la barre du haut à côté du
 * sélecteur de thème (et pas un encart flottant séparé) :
 * - Chrome/Edge/Brave (desktop + Android) : capte `beforeinstallprompt` et
 *   déclenche le prompt natif au clic.
 * - Safari iOS : pas d'API d'installation programmable — ouvre un petit
 *   popover d'instructions ("Partager → Sur l'écran d'accueil") à la place.
 * - Invisible si l'app est déjà installée (display-mode: standalone) ou si
 *   l'utilisateur a déjà refusé une fois (mémorisé en localStorage).
 */
export function InstallFolioButton() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [iosPopoverOpen, setIosPopoverOpen] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");

    if (isStandalone()) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    if (isIos()) setShowIosHint(true);

    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  async function handleClick() {
    if (promptEvent) {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      setPromptEvent(null);
      if (outcome === "dismissed") {
        localStorage.setItem(DISMISS_KEY, "1");
        setDismissed(true);
      }
      return;
    }
    if (showIosHint) setIosPopoverOpen((v) => !v);
  }

  if (dismissed || (!promptEvent && !showIosHint)) return null;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        title="Ajouter au navigateur"
        className="flex items-center gap-[7px] rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-[7px] text-[12px] font-semibold text-[var(--fg2)] hover:border-[var(--accent)] hover:text-[var(--fg)]"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3v12" />
          <path d="m7 11 5 5 5-5" />
          <path d="M5 21h14" />
        </svg>
        Ajouter au navigateur
      </button>

      {iosPopoverOpen && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[230px] rounded-[12px] border border-[var(--line)] bg-[var(--panel)] p-3 text-[11.5px] text-[var(--fg2)] shadow-lg">
          <p className="mb-2">
            Appuie sur Partager <span aria-hidden>⬆</span> puis « Sur l'écran d'accueil » pour installer Folio.
          </p>
          <button
            type="button"
            onClick={() => {
              localStorage.setItem(DISMISS_KEY, "1");
              setDismissed(true);
            }}
            className="text-[11px] text-[var(--fg3)]"
          >
            Ne plus afficher
          </button>
        </div>
      )}
    </div>
  );
}
