import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import * as jose from "jose";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Role, UserStatus } from "@/app/generated/prisma/enums";
import { findOrCreateCustomer } from "@/lib/customers";
import { UPLOAD_PREFIX } from "@/lib/profilePhoto";
import {
  GOOGLE_STATE_COOKIE,
  GOOGLE_STATE_PATH,
  googleConfig,
  safeNext,
  websiteUrl,
} from "@/lib/google";
import { createLoginToken, setLoginCookie } from "@/utils/authentication";

// Google's public keys, to check the signature of the id_token
const GOOGLE_KEYS = jose.createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

type GoogleProfile = {
  email?: string;
  email_verified?: boolean;
  given_name?: string;
  family_name?: string;
  name?: string;
  picture?: string;
};

// GET /api/auth/google/callback?code=...&state=...
// Google sends the visitor back here. We sign in the customer with that
// email, or create a new customer account for it, then return to the website.
export async function GET(request: NextRequest) {
  const fail = (error: string) => {
    const response = NextResponse.redirect(websiteUrl(`/login?error=${error}`));
    response.cookies.delete({ name: GOOGLE_STATE_COOKIE, path: GOOGLE_STATE_PATH });
    return response;
  };

  const config = googleConfig();
  if (config == null) {
    return fail("google_not_configured");
  }

  const params = request.nextUrl.searchParams;
  if (params.get("error")) {
    return fail("google_cancelled"); // e.g. the visitor pressed "Cancel"
  }

  let saved: { state?: string; next?: string } = {};
  try {
    saved = JSON.parse(request.cookies.get(GOOGLE_STATE_COOKIE)?.value ?? "{}");
  } catch {
    saved = {};
  }
  const code = params.get("code");
  if (!code || !saved.state || params.get("state") != saved.state) {
    return fail("google_failed");
  }

  try {
    // Swap the one-time code for the visitor's id_token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokens = await tokenResponse.json().catch(() => ({}));
    if (!tokenResponse.ok || typeof tokens.id_token != "string") {
      console.error("Google token exchange failed", tokens);
      return fail("google_failed");
    }

    const { payload } = await jose.jwtVerify(tokens.id_token, GOOGLE_KEYS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: config.clientId,
    });
    const profile = payload as GoogleProfile;
    if (!profile.email || profile.email_verified != true) {
      return fail("google_email");
    }
    const email = profile.email.trim().toLowerCase();
    // Google account photo (always an https address on googleusercontent.com)
    const googlePhoto =
      typeof profile.picture == "string" && profile.picture.startsWith("https://")
        ? profile.picture
        : undefined;

    let user = await prisma.user.findUnique({ where: { email: email } });

    if (user != null) {
      // Staff keep using their password (and the admin portal)
      if (user.role != Role.CUSTOMER) {
        return fail("google_staff");
      }
      if (user.status != UserStatus.ACTIVE) {
        return fail("account_inactive");
      }
      // use the Google photo unless the customer uploaded their own
      const keepOwnPhoto = user.profileImage.startsWith(UPLOAD_PREFIX);
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          lastLogin: new Date(),
          profileImage: !keepOwnPhoto && googlePhoto ? googlePhoto : undefined,
        },
      });
    } else {
      // New customer. Google proved the email, so no password is needed:
      // store a random one nobody knows (they can always use Google again).
      const firstName = (profile.given_name || profile.name || email.split("@")[0]).slice(0, 50);
      const lastName = (profile.family_name || "").slice(0, 50);
      const unusablePassword = await bcrypt.hash(randomBytes(32).toString("hex"), 12);

      user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: {
            email: email,
            firstName: firstName,
            lastName: lastName,
            password: unusablePassword,
            role: Role.CUSTOMER,
            lastLogin: new Date(),
            profileImage: googlePhoto,
          },
        });
        // link (or create) the customer record, like normal sign-up
        await findOrCreateCustomer(
          { email: email, firstName: firstName, lastName: lastName || null, userId: created.id },
          tx,
        );
        return created;
      });
    }

    const response = NextResponse.redirect(websiteUrl(safeNext(saved.next)));
    setLoginCookie(response, await createLoginToken(user.id));
    response.cookies.delete({ name: GOOGLE_STATE_COOKIE, path: GOOGLE_STATE_PATH });
    return response;
  } catch (error) {
    console.error("Google sign-in failed", error);
    return fail("google_failed");
  }
}
