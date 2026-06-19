import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  // Le statut `onboarded` est vérifié en base par le proxy (src/proxy.ts) à
  // chaque requête, qui redirige déjà vers /dashboard si le compte est
  // configuré — pas de re-check ici sur le claim JWT (potentiellement périmé).

  return <OnboardingForm />;
}
