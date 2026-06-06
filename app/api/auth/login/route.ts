import { NextResponse } from "next/server";
import {
  createSessionToken,
  getSessionCookieName,
  verifyLogin,
} from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  const login = body?.login;
  const password = body?.password;

  if (typeof login !== "string" || typeof password !== "string") {
    return NextResponse.json({ message: "Login details invalid hai." }, { status: 400 });
  }

  if (!verifyLogin(login, password)) {
    return NextResponse.json({ message: "Login ya password galat hai." }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });

  response.cookies.set(getSessionCookieName(), createSessionToken(login), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  return response;
}