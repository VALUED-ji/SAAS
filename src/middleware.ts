import { SignJWT, jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { isSameOriginMutation } from "@/lib/security/requestOrigin";

const SESSION_COOKIE_NAME = "zxgj_session";
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

async function signSlidingSessionToken(input: { userId: string; companyId: string; role: string; sessionVersion: number }, secret: string) {
  return new SignJWT({
    userId: input.userId,
    companyId: input.companyId,
    role: input.role,
    sessionVersion: input.sessionVersion,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(new TextEncoder().encode(secret));
}

function isPublicRequest(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  if (pathname === "/api/auth/login" || pathname === "/api/auth/logout") return true;
  if (pathname.startsWith("/api/site-checkin/")) return true;
  if (pathname.startsWith("/api/signature-capture/")) return true;
  if (pathname.startsWith("/api/vr-shares/")) return true;
  if (pathname.startsWith("/api/quotation-shares/")) return true;
  if (pathname.startsWith("/api/contract-template-shares/")) return true;
  if (req.method === "GET" && pathname.startsWith("/api/quotations/") && req.nextUrl.searchParams.has("share")) return true;
  return false;
}

function unauthorized(message = "请先登录") {
  return NextResponse.json({ message }, { status: 401 });
}

function applySecurityHeaders(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "SAMEORIGIN");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function middleware(req: NextRequest) {
  if (isPublicRequest(req)) return NextResponse.next();

  const secret = String(process.env.JWT_SECRET || "").trim();
  if (secret.length < 32 || secret === "zxgj-dev-secret-key-2026") {
    return NextResponse.json({ message: "系统安全配置不完整" }, { status: 503 });
  }

  const cookieToken = req.cookies.get(SESSION_COOKIE_NAME)?.value || "";
  const authHeader = req.headers.get("authorization") || "";
  const bearerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  const token = cookieToken || bearerToken;
  if (!token) return unauthorized();

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    const userId = String(payload.userId || "");
    const companyId = String(payload.companyId || "");
    const role = String(payload.role || "");
    const sessionVersion = Number(payload.sessionVersion);
    if (!userId || !companyId || !role || !Number.isInteger(sessionVersion)) return unauthorized("登录已失效，请重新登录");

    if (!isSameOriginMutation(req)) {
      return NextResponse.json({ message: "请求来源无效" }, { status: 403 });
    }

    const headers = new Headers(req.headers);
    headers.set("authorization", `Bearer ${token}`);
    headers.set("x-auth-user-id", userId);
    headers.set("x-auth-company-id", companyId);
    headers.set("x-auth-role", role);
    headers.set("x-auth-session-version", String(sessionVersion));
    if (
      req.nextUrl.pathname.startsWith("/uploads/customers/")
      || req.nextUrl.pathname.startsWith("/uploads/projects/")
      || req.nextUrl.pathname.startsWith("/uploads/materials/")
      || req.nextUrl.pathname.startsWith("/uploads/users/")
      || req.nextUrl.pathname.startsWith("/uploads/branches/")
    ) {
      const target = req.nextUrl.clone();
      target.pathname = `/api/private-files${req.nextUrl.pathname.slice("/uploads".length)}`;
      return applySecurityHeaders(NextResponse.rewrite(target, { request: { headers } }));
    }
    const response = applySecurityHeaders(NextResponse.next({ request: { headers } }));
    const refreshedToken = await signSlidingSessionToken({ userId, companyId, role, sessionVersion }, secret);
    response.cookies.set(SESSION_COOKIE_NAME, refreshedToken, {
      httpOnly: true,
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch {
    return unauthorized("登录已失效，请重新登录");
  }
}

export const config = {
  matcher: [
    "/api/:path*",
    "/uploads/customers/:path*",
    "/uploads/projects/:path*",
    "/uploads/materials/:path*",
    "/uploads/users/:path*",
    "/uploads/branches/:path*",
  ],
};
