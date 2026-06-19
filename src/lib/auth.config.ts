import type { NextAuthConfig } from "next-auth";

export default {
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        if ("onboarded" in user) {
          token.onboarded = (user as { onboarded?: boolean }).onboarded ?? false;
        }
      }
      // Déclenché par `useSession().update(...)` côté client : permet de
      // rafraîchir le JWT juste après la mise à jour de `onboarded` en base,
      // sans attendre une reconnexion complète.
      if (trigger === "update" && session && typeof session === "object" && "onboarded" in session) {
        token.onboarded = (session as { onboarded?: boolean }).onboarded ?? token.onboarded;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
        session.user.onboarded = (token.onboarded as boolean) ?? false;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
