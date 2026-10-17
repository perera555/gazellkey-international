// "Sign in with Google" for website customers (OAuth 2.0 / OpenID Connect).
//
// The website forwards /api/... to this API, so the whole flow runs on the
// website's address and the login cookie lands there:
//   1. GET /api/auth/google?next=/travel        -> redirect to Google
//   2. GET /api/auth/google/callback?code=...   -> sign in / create the account,
//      then redirect back to the website page in "next"
//
// .env:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET   (Google Cloud console > OAuth client)
//   GOOGLE_REDIRECT_URI  e.g. http://localhost:3002/api/auth/google/callback
//   WEBSITE_URL          e.g. http://localhost:3002

export const GOOGLE_STATE_COOKIE = "google-oauth";
export const GOOGLE_STATE_PATH = "/api/auth/google";

export function googleConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }
  return { clientId, clientSecret, redirectUri };
}

// Absolute address of a page on the customer website
export function websiteUrl(path: string) {
  const base = (process.env.WEBSITE_URL ?? "http://localhost:3002").replace(/\/$/, "");
  return `${base}${path}`;
}

// Only same-site paths ("/x", never "//evil.com")
export function safeNext(next: string | null | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}
