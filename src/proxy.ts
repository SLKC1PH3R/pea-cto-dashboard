import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "@/lib/auth.config";
import { prisma } from "@/lib/prisma";

const { auth } = NextAuth(authConfig);

export default auth(async (req) => {
  const isLoggedIn = !!req.auth;
  const userId = req.auth?.user?.id;
  const { pathname } = req.nextUrl;
  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/register");
  const isOnboardingPage = pathname.startsWith("/onboarding");
  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/import") ||
    pathname.startsWith("/api/portfolio") ||
    pathname.startsWith("/api/accounts") ||
    pathname.startsWith("/api/onboarding") ||
    pathname.startsWith("/api/watchlist") ||
    pathname.startsWith("/api/goal");

  if (isProtected && !isLoggedIn) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // On lit `onboarded` directement en base plutôt que depuis le JWT : le
  // claim embarqué dans le token au moment du login peut rester périmé
  // (provider OAuth, refresh de session…) et provoquait une boucle vers
  // /onboarding même pour des comptes déjà configurés.
  let isOnboarded = false;
  if (isLoggedIn && userId) {
    const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { onboarded: true } });
    isOnboarded = !!dbUser?.onboarded;
  }

  if (isLoggedIn && !isOnboarded && (isProtected || isAuthPage) && !isOnboardingPage) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  if (isAuthPage && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  if (isOnboardingPage && isLoggedIn && isOnboarded) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/import/:path*",
    "/login",
    "/register",
    "/onboarding",
    "/api/portfolio/:path*",
    "/api/accounts/:path*",
    "/api/onboarding",
    "/api/watchlist",
    "/api/goal",
  ],
};
