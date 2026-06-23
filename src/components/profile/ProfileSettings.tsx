"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const COLORS = ["#9d7bf5", "#5fc7a0", "#e08a8a", "#c9a978", "#6ea8c9", "#e0a85f", "#c9b6fb"];
const MAX_DIM = 128;

type ProfileSettingsProps = {
  name: string;
  email: string;
  avatarColor: string | null;
  avatarUrl: string | null;
};

export function ProfileSettings({ name, email, avatarColor, avatarUrl }: ProfileSettingsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editName, setEditName] = useState(name);
  const [color, setColor] = useState(avatarColor ?? COLORS[0]);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(avatarUrl);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        setImageDataUrl(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);

    const res = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, avatarColor: color, avatarUrl: imageDataUrl }),
    });

    setSaving(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Erreur lors de l'enregistrement");
      return;
    }

    setOpen(false);
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-[38px] w-[38px] items-center justify-center overflow-hidden rounded-full text-[14px] font-bold text-white"
        style={{ background: imageDataUrl ? undefined : `linear-gradient(140deg, ${color}, var(--accent2))` }}
        title={email}
      >
        {imageDataUrl ? <img src={imageDataUrl} alt="Avatar" className="h-full w-full object-cover" /> : name.charAt(0).toUpperCase()}
      </button>

      {open && (
        <div
          className="absolute right-0 top-[46px] z-20 w-[280px] rounded-[16px] border p-5"
          style={{ borderColor: "var(--line)", background: "var(--panel)", boxShadow: "var(--shadow)" }}
        >
          <h3 className="mb-3 text-[14px] font-bold text-[var(--fg)]">Mon profil</h3>

          <div className="mb-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-14 w-14 flex-none items-center justify-center overflow-hidden rounded-full text-[20px] font-bold text-white"
              style={{ background: imageDataUrl ? undefined : `linear-gradient(140deg, ${color}, var(--accent2))` }}
            >
              {imageDataUrl ? <img src={imageDataUrl} alt="Avatar" className="h-full w-full object-cover" /> : (editName || "?").charAt(0).toUpperCase()}
            </button>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="rounded-[8px] border px-2 py-1 text-[11px] font-medium text-[var(--fg2)]"
                style={{ borderColor: "var(--line)" }}
              >
                Choisir une image
              </button>
              {imageDataUrl && (
                <button
                  type="button"
                  onClick={() => setImageDataUrl(null)}
                  className="text-[11px] text-[var(--fg3)] hover:text-[var(--neg)]"
                >
                  Retirer l'image
                </button>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>

          {!imageDataUrl && (
            <div className="mb-4 flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className="h-6 w-6 rounded-full"
                  style={{ background: c, outline: color === c ? "2px solid var(--fg)" : "none", outlineOffset: 2 }}
                />
              ))}
            </div>
          )}

          <label className="mb-1 block text-[11.5px] font-semibold text-[var(--fg2)]">Pseudo / prénom</label>
          <input
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            className="mb-3 w-full rounded-[10px] border px-3 py-2 text-[13px] outline-none"
            style={{ borderColor: "var(--line)", background: "var(--panel2)", color: "var(--fg)" }}
          />

          {error && <p className="mb-2 text-[11.5px]" style={{ color: "var(--neg)" }}>{error}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="flex-1 rounded-[10px] px-3 py-[8px] text-[12.5px] font-semibold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(140deg, var(--accent), var(--accent2))" }}
            >
              {saving ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-[10px] border px-3 py-[8px] text-[12.5px] font-medium text-[var(--fg2)]"
              style={{ borderColor: "var(--line)" }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
