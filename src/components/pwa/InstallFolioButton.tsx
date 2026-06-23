"use client";

import { useEffect, useState } from "react";

const DISMISS_KEY = "folio-install-dismissed";

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
 * Bouton d'installation discret, affiché seulement quand c'est pertinent :
 * - Chrome/Edge/Brave (desktop + Android) : capte `beforeinstallprompt` et
 *   déclenche le prompt natif au clic.
 * - Safari iOS : ne supporte pas `beforeinstallprompt` — il n'existe aucune
 *   API pour déclencher l'installation, on affiche donc une instruction
 *   ("Partager → Sur l'écran d'accueil") à la place.
 * - Jamais affiché si l'app est déjà installée (display-mode: standalone)
 *   ou si l'utilisateur a déjà refusé une fois (mémorisé en localStorage).
 */
export function InstallFolioButton() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
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

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  async function install() {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    setPromptEvent(null);
    if (outcome === "dismissed") dismiss();
  }

  if (dismissed || (!promptEvent && !showIosHint)) return null;

  return (
    <div className="fixed bottom-5 right-5 z-50 flex max-w-[280px] items-center gap-3 rounded-[14px] border border-[var(--line)] bg-[var(--panel)] p-3 shadow-lg">
      <div
        className="flex h-9 w-9 flex-none items-center justify-center rounded-xl"
        style={{ background: "linear-gradient(140deg, var(--accent), var(--accent2))" }}
      >
        <div className="h-[13px] w-[13px] rounded-[4px] bg-white" />
      </div>
      <div className="flex flex-1 flex-col gap-1">
        {promptEvent ? (
          <>
            <span className="text-[12.5px] font-semibold text-[var(--fg)]">Installer Folio</span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={install}
                className="rounded-[8px] px-[10px] py-[5px] text-[11.5px] font-semibold text-white"
                style={{ background: "var(--accent)" }}
              >
                Installer
              </button>
              <button type="button" onClick={dismiss} className="text-[11.5px] text-[var(--fg3)]">
                Non merci
              </button>
            </div>
          </>
        ) : (
          <>
            <span className="text-[12.5px] font-semibold text-[var(--fg)]">Installer Folio</span>
            <span className="text-[11px] text-[var(--fg2)]">
              Appuie sur Partager <span aria-hidden>⬆</span> puis « Sur l'écran d'accueil »
            </span>
            <button type="button" onClick={dismiss} className="self-start text-[11.5px] text-[var(--fg3)]">
              Non merci
            </button>
          </>
        )}
      </div>
    </div>
  );
}
