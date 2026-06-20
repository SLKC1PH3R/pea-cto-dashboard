import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import authConfig from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isOnboarded = !!req.auth?.user?.onboarded;
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
    pathname.startsWith("/api/goal") ||
    pathname.startsWith("/api/profile") ||
    pathname.startsWith("/api/quotes");

  if (isProtected && !isLoggedIn) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
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
    "/api/profile",
    "/api/quotes",
  ],
};
