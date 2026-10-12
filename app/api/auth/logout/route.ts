import { NextResponse } from "next/server";
import { LOGIN_COOKIE } from "@/utils/authentication";

export async function POST() {
  const response = NextResponse.json({ message: "Logged out" });
  response.cookies.set({
    name: LOGIN_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV == "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0, // delete the cookie
  });
  return response;
}
