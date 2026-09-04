import jwt from "jsonwebtoken";
import type { NextRequest, NextResponse } from "next/server";

export const SESSION_COOKIE_NAME = "zxgj_session";
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

export type SessionClaims = {
  userId: string;
  companyId: string;
  role: string;
  sessionVersion: number;
};

export function getJwtSecret() {
  const secret = String(process.env.JWT_SECRET || "").trim();
  if (secret.length < 32 || secret === "zxgj-dev-secret-key-2026") {
    throw new Error("JWT_SECRET must be configured with at least 32 characters");
  }
  return secret;
}

export function signSessionToken(claims: SessionClaims) {
  return jwt.sign(claims, getJwtSecret(), { expiresIn: SESSION_MAX_AGE_SECONDS });
}

export function verifySessionToken(token: string): SessionClaims | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as Partial<SessionClaims>;
    if (!decoded.userId || !decoded.companyId || !decoded.role || !Number.isInteger(decoded.sessionVersion)) return null;
    return {
      userId: String(decoded.userId),
      companyId: String(decoded.companyId),
      role: String(decoded.role),
      sessionVersion: Number(decoded.sessionVersion),
    };
  } catch {
    return null;
  }
}

export function getRequestSessionToken(req: NextRequest) {
  const cookieToken = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (cookieToken) return cookieToken;
  const authHeader = req.headers.get("authorization");
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
}

export function getRequestSession(req: NextRequest) {
  const token = getRequestSessionToken(req);
  return token ? verifySessionToken(token) : null;
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
