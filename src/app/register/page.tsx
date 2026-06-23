"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Une erreur est survenue");
      setLoading(false);
      return;
    }

    // Connexion automatique après inscription
    const result = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);

    if (result?.error) {
      router.push("/login");
      return;
    }

    router.push("/onboarding");
    router.refresh();
  }

  function handleGoogle() {
    setGoogleLoading(true);
    signIn("google", { callbackUrl: "/onboarding" });
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: "#0e0c16", color: "#f0edf8", fontFamily: "var(--font-body, 'Plus Jakarta Sans', system-ui)" }}
    >
      <div
        className="w-full max-w-sm rounded-[22px] border p-8"
        style={{ borderColor: "rgba(255,255,255,.07)", background: "#1a1628", boxShadow: "0 2px 8px rgba(0,0,0,.3), 0 20px 50px -28px rgba(120,80,240,.45)" }}
      >
        <div className="mb-6 flex items-center gap-[11px]">
          <Image src="/folio-logo.svg" alt="Folio" width={36} height={36} className="rounded-xl" />
          <div>
            <h1 className="text-[19px] font-extrabold tracking-tight text-[#f0edf8]">Folio</h1>
            <p className="text-[12.5px] text-[#a79fbd]">Crée ton compte</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleLoading}
          className="mb-5 flex w-full items-center justify-center gap-[10px] rounded-[11px] border px-4 py-[10px] text-[13px] font-semibold transition disabled:opacity-50"
          style={{ borderColor: "rgba(255,255,255,.07)", background: "#221c34", color: "#f0edf8" }}
        >
          <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.85 2.09-1.82 2.73v2.27h2.94c1.72-1.59 2.71-3.93 2.71-6.64z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.94-2.27c-.81.55-1.85.87-3.02.87-2.32 0-4.28-1.57-4.98-3.68H1.08v2.32C2.56 16.06 5.53 18 9 18z" />
            <path fill="#FBBC05" d="M4.02 10.74c-.18-.55-.28-1.13-.28-1.74s.1-1.19.28-1.74V4.94H1.08C.39 6.27 0 7.6 0 9s.39 2.73 1.08 4.06l2.94-2.32z" />
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.61-2.61C13.46.89 11.43 0 9 0 5.53 0 2.56 1.94 1.08 4.94l2.94 2.32C4.72 5.15 6.68 3.58 9 3.58z" />
          </svg>
          {googleLoading ? "Connexion…" : "Continuer avec Google"}
        </button>

        <div className="mb-5 flex items-center gap-3">
          <div className="h-px flex-1" style={{ background: "rgba(255,255,255,.07)" }} />
          <span className="text-[11px] uppercase tracking-wide text-[#6e6685]">ou</span>
          <div className="h-px flex-1" style={{ background: "rgba(255,255,255,.07)" }} />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-[12.5px] text-[#a79fbd]" htmlFor="name">
              Nom (optionnel)
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-[11px] border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{ borderColor: "rgba(255,255,255,.07)", background: "#0e0c16", color: "#f0edf8" }}
              placeholder="Jeremy"
            />
          </div>

          <div>
            <label className="mb-1 block text-[12.5px] text-[#a79fbd]" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-[11px] border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{ borderColor: "rgba(255,255,255,.07)", background: "#0e0c16", color: "#f0edf8" }}
              placeholder="toi@example.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-[12.5px] text-[#a79fbd]" htmlFor="password">
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-[11px] border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{ borderColor: "rgba(255,255,255,.07)", background: "#0e0c16", color: "#f0edf8" }}
              placeholder="8 caractères minimum"
            />
          </div>

          {error && <p className="text-[12.5px] text-[#e08a8a]">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 rounded-[11px] px-4 py-[10px] text-[13px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ background: "linear-gradient(140deg, #9d7bf5, #c9b6fb)" }}
          >
            {loading ? "Création…" : "Créer mon compte"}
          </button>
        </form>

        <p className="mt-6 text-center text-[12.5px] text-[#a79fbd]">
          Déjà un compte ?{" "}
          <Link href="/login" className="font-semibold text-[#c9b6fb] hover:underline">
            Se connecter
          </Link>
        </p>
      </div>
    </main>
  );
}
