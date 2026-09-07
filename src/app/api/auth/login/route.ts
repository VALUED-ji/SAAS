import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { setSessionCookie, signSessionToken } from "@/lib/security/session";
import { isSameOriginMutation } from "@/lib/security/authorization";
import { getRequestIp } from "@/lib/security/requestIp";
import { getCompanyShortNameForOrgUnit, getSidebarBrandLogoUrlForOrgUnit, getSidebarBrandNameForOrgUnit, getSidebarBrandSubtitleForOrgUnit } from "@/lib/branchSettingsLookup";

const DUMMY_PASSWORD_HASH = "$2b$10$K81ebwPQ.NQxF.HhcaYgeO6XmFcNITNI3OEKxwHt4rktjUDC2i41i";
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;

type LoginAttempt = { count: number; resetAt: number };
const globalLoginState = globalThis as typeof globalThis & { __zxgjLoginAttempts?: Map<string, LoginAttempt> };
const loginAttempts = globalLoginState.__zxgjLoginAttempts || new Map<string, LoginAttempt>();
globalLoginState.__zxgjLoginAttempts = loginAttempts;

function parsePermissions(value: unknown) {
  try {
    const parsed = JSON.parse(String(value || "[]"));
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
  } catch {
    return [];
  }
}

function getAttemptKey(req: NextRequest, username: string) {
  return `${getRequestIp(req)}:${username.toLowerCase()}`;
}

function isRateLimited(key: string) {
  const now = Date.now();
  const attempt = loginAttempts.get(key);
  if (!attempt || attempt.resetAt <= now) {
    loginAttempts.delete(key);
    return false;
  }
  return attempt.count >= MAX_LOGIN_ATTEMPTS;
}

function recordFailedAttempt(key: string) {
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (!current || current.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return;
  }
  current.count += 1;
}

export async function POST(req: NextRequest) {
  if (!isSameOriginMutation(req)) return NextResponse.json({ message: "请求来源无效" }, { status: 403 });
  try {
    const body = await req.json();
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "");
    if (!username || !password || username.length > 80 || password.length > 128) {
      return NextResponse.json({ message: "请输入正确的账号和密码" }, { status: 400 });
    }
    const attemptKey = getAttemptKey(req, username);
    if (isRateLimited(attemptKey)) {
      return NextResponse.json({ message: "登录尝试次数过多，请15分钟后再试" }, { status: 429 });
    }
    const db = getDb();

    const user = db.prepare(`
      SELECT id, company_id, name, phone, password, avatar, role, org_unit_id, COALESCE(session_version, 0) as session_version
      FROM users
      WHERE phone = ? AND is_active = 1 AND deleted_at IS NULL
      LIMIT 1
    `).get(username) as any;

    const storedPassword = String(user?.password || "");
    const passwordMatchesHash = await bcrypt.compare(password, storedPassword || DUMMY_PASSWORD_HASH);
    const usesLegacyDefault = Boolean(user) && !storedPassword && password === "123456";
    if (!user || (!passwordMatchesHash && !usesLegacyDefault)) {
      recordFailedAttempt(attemptKey);
      return NextResponse.json({ message: "账号或密码错误" }, { status: 401 });
    }
    loginAttempts.delete(attemptKey);

    if (usesLegacyDefault) {
      const migratedPassword = await bcrypt.hash(password, 12);
      db.prepare(`
        UPDATE users
        SET password = ?, updated_at = datetime('now')
        WHERE id = ? AND (password IS NULL OR TRIM(password) = '')
      `).run(migratedPassword, user.id);
    }

    const now = new Date().toISOString();
    db.prepare("UPDATE users SET last_login_at = ?, last_seen_at = ?, updated_at = datetime('now') WHERE id = ?").run(now, now, user.id);

    const company = db.prepare("SELECT name FROM companies WHERE id = ? AND deleted_at IS NULL").get(user.company_id) as any;
    if (!company) return NextResponse.json({ message: "账号所属公司不可用" }, { status: 403 });
    const role = db.prepare(`
      SELECT permissions
      FROM roles
      WHERE company_id = ? AND code = ? AND deleted_at IS NULL AND COALESCE(is_active, 1) = 1
      LIMIT 1
    `).get(user.company_id, user.role) as any;
    const companyShortName = getCompanyShortNameForOrgUnit(db, user.org_unit_id, user.company_id);
    const sidebarBrandName = getSidebarBrandNameForOrgUnit(db, user.org_unit_id, user.company_id);
    const sidebarBrandLogoUrl = getSidebarBrandLogoUrlForOrgUnit(db, user.org_unit_id, user.company_id);
    const sidebarBrandSubtitle = getSidebarBrandSubtitleForOrgUnit(db, user.org_unit_id, user.company_id);

    const token = signSessionToken({
      userId: user.id,
      companyId: user.company_id,
      role: user.role,
      sessionVersion: Number(user.session_version || 0),
    });

    const response = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        phone: user.phone,
        avatar: user.avatar || null,
        role: user.role,
        permissions: parsePermissions(role?.permissions),
        org_unit_id: user.org_unit_id,
        companyName: company?.name || "",
        companyShortName,
        sidebarBrandName,
        sidebarBrandLogoUrl,
        sidebarBrandSubtitle,
      },
    });
    setSessionCookie(response, token);
    return response;
  } catch (error) {
    console.error("Login failed", error);
    return NextResponse.json({ message: "服务器错误" }, { status: 500 });
  }
}
