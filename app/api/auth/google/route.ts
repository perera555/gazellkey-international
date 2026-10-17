import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  GOOGLE_STATE_COOKIE,
  GOOGLE_STATE_PATH,
  googleConfig,
  safeNext,
  websiteUrl,
} from "@/lib/google";

// GET /api/auth/google?next=/travel - start "Sign in with Google".
// A random "state" is kept in a short-lived cookie and checked on the way
// back, so nobody can trick a browser into signing in to someone else's account.
export async function GET(request: NextRequest) {
  const config = googleConfig();
  if (config == null) {
    return NextResponse.redirect(websiteUrl("/login?error=google_not_configured"));
  }

  const state = randomBytes(24).toString("base64url");
  const next = safeNext(request.nextUrl.searchParams.get("next"));

  const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  google.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: state,
    prompt: "select_account",
  }).toString();

  const response = NextResponse.redirect(google);
  response.cookies.set({
    name: GOOGLE_STATE_COOKIE,
    value: JSON.stringify({ state, next }),
    httpOnly: true,
    secure: process.env.NODE_ENV == "production",
    sameSite: "lax", // sent back when Google redirects to the callback
    path: GOOGLE_STATE_PATH,
    maxAge: 10 * 60,
  });
  return response;
}
