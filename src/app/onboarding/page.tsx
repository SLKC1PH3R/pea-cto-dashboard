import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { OnboardingForm } from "@/components/onboarding/OnboardingForm";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  // Le proxy (src/proxy.ts) se base sur le claim `onboarded` du JWT, qui peut
  // être périmé/faux juste après une reconnexion (token expiré, navigation
  // privée) selon le moment exact où le token a été émis — on revérifie donc
  // ici directement en base, source de vérité, avant d'afficher le formulaire.
  const dbUser = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { onboarded: true },
  });
  if (dbUser?.onboarded) {
    redirect("/dashboard");
  }

  return <OnboardingForm />;
}
