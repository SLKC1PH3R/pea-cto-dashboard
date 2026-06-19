import type { NextAuthConfig } from "next-auth";

export default {
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        if ("onboarded" in user) {
          token.onboarded = (user as { onboarded?: boolean }).onboarded ?? false;
        }
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
