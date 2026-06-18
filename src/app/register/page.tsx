"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: "#ece2cf" }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-[#d8cbb0] bg-[#fbf8f1] p-8 shadow-sm">
        <h1 className="mb-1 font-serif text-2xl text-[#2b2620]">Folio</h1>
        <p className="mb-6 text-sm text-[#8a7a5f]">Crée ton compte</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm text-[#6b5f48]" htmlFor="name">
              Nom (optionnel)
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-[#d8cbb0] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c87a4d]"
              placeholder="Jeremy"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-[#6b5f48]" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-[#d8cbb0] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c87a4d]"
              placeholder="toi@example.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-[#6b5f48]" htmlFor="password">
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-[#d8cbb0] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c87a4d]"
              placeholder="8 caractères minimum"
            />
          </div>

          {error && <p className="text-sm text-[#a14f3f]">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="mt-2 rounded-md bg-[#c87a4d] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Création…" : "Créer mon compte"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-[#8a7a5f]">
          Déjà un compte ?{" "}
          <Link href="/login" className="font-medium text-[#c87a4d] hover:underline">
            Se connecter
          </Link>
        </p>
      </div>
    </main>
  );
}
