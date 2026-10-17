import { NextRequest, NextResponse } from "next/server";
import * as jose from "jose";
import prisma from "@/lib/prisma";
import { Division, Role, UserStatus } from "@/app/generated/prisma/enums";
import { RequestUserType } from "@/types/requestUser";

export const LOGIN_COOKIE = "login-token";
export const TOKEN_LIFETIME_SECONDS = 60 * 60 * 24 * 7; // 1 week
// "Remember me" ticked on the login form
export const REMEMBER_ME_SECONDS = 60 * 60 * 24 * 30; // 30 days
// "Remember me" not ticked: signed out when the browser closes, or after a day
export const SESSION_SECONDS = 60 * 60 * 24;

export function getSecret() {
  const secretText = process.env.JOSE_SECRET;
  if (!secretText || secretText.length < 32) {
    throw new Error("JOSE_SECRET must be set and at least 32 characters long");
  }
  return new TextEncoder().encode(secretText); // Convert the secret key to a Uint8Array
}

export async function createLoginToken(userId: string, lifetimeSeconds = TOKEN_LIFETIME_SECONDS) {
  // Only the user id goes in the token. Role, privileges and status are
  // read fresh from the database on each request, so a ban or a role
  // change works immediately instead of after the token expires.
  return new jose.SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${lifetimeSeconds}s`)
    .sign(getSecret());
}

// Puts the login token in the httpOnly cookie (password and Google sign-in).
// maxAge null = a browser-session cookie, deleted when the browser closes.
export function setLoginCookie(
  response: NextResponse,
  token: string,
  maxAge: number | null = TOKEN_LIFETIME_SECONDS,
) {
  response.cookies.set({
    name: LOGIN_COOKIE,
    value: token,
    httpOnly: true, // JavaScript in the browser cannot read it
    secure: process.env.NODE_ENV == "production", // HTTPS only in production
    sameSite: "lax",
    path: "/",
    ...(maxAge == null ? {} : { maxAge: maxAge }),
  });
}

export async function getUser(
  request: NextRequest,
): Promise<RequestUserType | null> {
  return getUserFromToken(request.cookies.get(LOGIN_COOKIE)?.value);
}

// Also used by server components (lib/session.ts), which read the cookie
// with cookies() instead of a NextRequest.
export async function getUserFromToken(
  loginToken: string | undefined,
): Promise<RequestUserType | null> {
  if (!loginToken) {
    return null;
  }

  try {
    const { payload } = await jose.jwtVerify(loginToken, getSecret());
    if (!payload.sub) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        privileges: true,
        divisions: true,
        status: true,
      },
    });

    // banned or inactive users are treated as signed out
    if (user == null || user.status != UserStatus.ACTIVE) {
      return null;
    }

    const { status, ...requestUser } = user;
    return requestUser;
  } catch (error) {
    return null; // invalid or expired token
  }
}

export function hasPrivilege(
  user: RequestUserType | null,
  privilege: string,
): boolean {
  if (user == null) {
    return false;
  }
  if (user.role == Role.ADMIN) {
    return true; // administrators have full access
  }
  // Privileges only count for staff. A customer (or supplier) account never
  // gets staff powers, even if privileges were ticked on it by mistake.
  if (!isStaffUser(user)) {
    return false;
  }
  return user.privileges.includes(privilege);
}

export async function isprivileged(
  request: NextRequest,
  privilege: string,
): Promise<boolean> {
  const user = await getUser(request); //get the user from the request
  return hasPrivilege(user, privilege);
}

type AuthResult =
  | { user: RequestUserType; error: null }
  | { user: null; error: NextResponse };

// Use in routes:
//   const auth = await requireUser(request);
//   if (auth.error) return auth.error;
export async function requireUser(request: NextRequest): Promise<AuthResult> {
  const user = await getUser(request);
  if (user == null) {
    return {
      user: null,
      error: NextResponse.json(
        { message: "You are not authenticated" },
        { status: 401 },
      ),
    };
  }
  return { user, error: null };
}

export async function requirePrivilege(
  request: NextRequest,
  privilege: string,
): Promise<AuthResult> {
  const auth = await requireUser(request);
  if (auth.error) {
    return auth;
  }
  if (!hasPrivilege(auth.user, privilege)) {
    return {
      user: null,
      error: NextResponse.json(
        {
          message:
            "You do not have the required privilege to access this resource.",
        },
        { status: 403 },
      ),
    };
  }
  return auth;
}

export function isStaffUser(user: RequestUserType | null): boolean {
  return (
    user != null &&
    (user.role == Role.STAFF ||
      user.role == Role.FINANCE ||
      user.role == Role.ADMIN)
  );
}

// Divisions a user may see. undefined means "all divisions".
// Staff only see the divisions they are assigned to (SRS Section 8).
export function divisionScope(user: RequestUserType): Division[] | undefined {
  if (user.role == Role.ADMIN || user.role == Role.FINANCE) {
    return undefined;
  }
  // customers and suppliers work in no division, whatever is stored on them
  return user.role == Role.STAFF ? user.divisions : [];
}

export function canAccessDivision(
  user: RequestUserType,
  division: Division,
): boolean {
  const scope = divisionScope(user);
  return scope == undefined || scope.includes(division);
}

// Prisma "where" fragment that limits a query to the user's divisions
export function divisionWhere(user: RequestUserType) {
  const scope = divisionScope(user);
  return scope == undefined ? {} : { division: { in: scope } };
}
