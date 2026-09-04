import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { unlink } from "fs/promises";
import path from "path";
import { getDb } from "@/lib/db";
import { getAuthContext } from "@/lib/security/authorization";
import { clearSessionCookie } from "@/lib/security/session";

function getProfile(db: ReturnType<typeof getDb>, userId: string, companyId: string) {
  return db.prepare(`
    SELECT
      u.id,
      u.name,
      u.phone,
      u.email,
      u.avatar,
      u.role,
      COALESCE(r.name, u.role) as role_name,
      u.org_unit_id,
      o.name as org_unit_name,
      (
        WITH RECURSIVE org_tree(id, name, type, parent_id, depth) AS (
          SELECT id, name, type, parent_id, 0
          FROM org_units
          WHERE id = u.org_unit_id AND deleted_at IS NULL
          UNION ALL
          SELECT parent.id, parent.name, parent.type, parent.parent_id, org_tree.depth + 1
          FROM org_units parent
          JOIN org_tree ON parent.id = org_tree.parent_id
          WHERE parent.deleted_at IS NULL
        )
        SELECT GROUP_CONCAT(name, ' / ')
        FROM (
          SELECT name
          FROM org_tree
          ORDER BY depth DESC
        )
      ) as org_unit_path,
      c.name as company_name,
      (
        WITH RECURSIVE org_tree(id, name, type, parent_id, depth) AS (
          SELECT id, name, type, parent_id, 0
          FROM org_units
          WHERE id = u.org_unit_id AND deleted_at IS NULL
          UNION ALL
          SELECT parent.id, parent.name, parent.type, parent.parent_id, org_tree.depth + 1
          FROM org_units parent
          JOIN org_tree ON parent.id = org_tree.parent_id
          WHERE parent.deleted_at IS NULL
        )
        SELECT name
        FROM org_tree
        WHERE type = 'company'
        ORDER BY depth
        LIMIT 1
      ) as branch_company_name,
      u.employee_no,
      u.hire_date,
      u.notes,
      COALESCE(u.is_active, 1) as is_active,
      u.created_at,
      u.updated_at,
      u.last_login_at,
      u.last_seen_at
    FROM users u
    LEFT JOIN companies c ON c.id = u.company_id
    LEFT JOIN org_units o ON o.id = u.org_unit_id
    LEFT JOIN roles r ON r.company_id = u.company_id AND r.code = u.role AND r.deleted_at IS NULL
    WHERE u.id = ? AND u.company_id = ? AND u.deleted_at IS NULL
    LIMIT 1
  `).get(userId, companyId) as any;
}

function parseAvatarInput(value: unknown, userId: string) {
  const avatar = String(value || "").trim();
  if (!avatar) return { value: null as string | null };
  if (avatar.length > 500) return { value: null, error: "头像地址过长" };
  if (!avatar.startsWith(`/uploads/users/${userId}/`)) {
    return { value: null, error: "头像地址无效，请重新上传头像" };
  }
  return { value: avatar };
}

function getPasswordErrors(password: string, profile: { phone?: string | null; name?: string | null }) {
  const errors: string[] = [];
  const trimmed = password.trim();
  const lower = password.toLowerCase();
  const commonPasswords = new Set(["12345678", "123456789", "password", "qwerty123", "abc123456", "11111111"]);
  if (password !== trimmed) errors.push("新密码首尾不能包含空格");
  if (password.length < 8 || password.length > 32) errors.push("新密码长度必须为 8-32 位");
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) errors.push("新密码必须同时包含字母和数字");
  if (!/[A-Z]/.test(password) && !/[a-z]/.test(password)) errors.push("新密码必须包含英文字母");
  if (commonPasswords.has(lower)) errors.push("新密码过于简单，请更换");
  if (profile.phone && password.includes(String(profile.phone))) errors.push("新密码不能包含手机号");
  if (profile.name && String(profile.name).trim() && lower.includes(String(profile.name).trim().toLowerCase())) {
    errors.push("新密码不能包含姓名");
  }
  return errors;
}

async function removeLocalAvatar(fileUrl?: string | null) {
  const value = String(fileUrl || "").trim();
  if (!value.startsWith("/uploads/users/")) return;
  try {
    await unlink(path.join(process.cwd(), "public", value));
  } catch {
    // Old avatar files may already have been removed; keeping the update successful is more important.
  }
}

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });

  const db = getDb();
  const profile = getProfile(db, auth.userId, auth.companyId);
  if (!profile) return NextResponse.json({ message: "账号不存在或已停用" }, { status: 404 });

  return NextResponse.json(profile);
}

export async function PATCH(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "").trim();
    const db = getDb();
    const profile = getProfile(db, auth.userId, auth.companyId);
    if (!profile) return NextResponse.json({ message: "账号不存在或已停用" }, { status: 404 });

    if (action === "update_avatar") {
      const avatarInput = parseAvatarInput(body.avatar, auth.userId);
      if (avatarInput.error) return NextResponse.json({ message: avatarInput.error }, { status: 400 });

      const previousAvatar = String(profile.avatar || "").trim();
      db.prepare("UPDATE users SET avatar = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?")
        .run(avatarInput.value, auth.userId, auth.companyId);
      if (previousAvatar && previousAvatar !== avatarInput.value) await removeLocalAvatar(previousAvatar);
      return NextResponse.json(getProfile(db, auth.userId, auth.companyId));
    }

    if (action === "change_password") {
      const currentPassword = String(body.current_password || "");
      const newPassword = String(body.new_password || "");
      const confirmPassword = String(body.confirm_password || "");
      if (!currentPassword) return NextResponse.json({ message: "请输入当前密码" }, { status: 400 });
      if (!newPassword) return NextResponse.json({ message: "请输入新密码" }, { status: 400 });
      if (newPassword !== confirmPassword) return NextResponse.json({ message: "两次输入的新密码不一致" }, { status: 400 });

      const user = db.prepare("SELECT id, name, phone, password FROM users WHERE id = ? AND company_id = ? AND deleted_at IS NULL")
        .get(auth.userId, auth.companyId) as any;
      if (!user) return NextResponse.json({ message: "账号不存在或已停用" }, { status: 404 });
      if (!user.password) return NextResponse.json({ message: "账号尚未设置密码，请联系管理员重置" }, { status: 409 });
      const currentOk = await bcrypt.compare(currentPassword, user.password);
      if (!currentOk) return NextResponse.json({ message: "当前密码不正确" }, { status: 400 });
      if (currentPassword === newPassword) return NextResponse.json({ message: "新密码不能和当前密码相同" }, { status: 400 });

      const passwordErrors = getPasswordErrors(newPassword, user);
      if (passwordErrors.length) {
        return NextResponse.json({ message: passwordErrors[0], errors: passwordErrors }, { status: 400 });
      }

      const hashed = await bcrypt.hash(newPassword, 12);
      db.prepare(`
        UPDATE users
        SET password = ?, session_version = COALESCE(session_version, 0) + 1, updated_at = datetime('now')
        WHERE id = ? AND company_id = ?
      `)
        .run(hashed, auth.userId, auth.companyId);
      const response = NextResponse.json({ success: true, message: "密码已修改，请重新登录" });
      clearSessionCookie(response);
      return response;
    }

    return NextResponse.json({ message: "未知操作" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ message: err?.message || "保存失败" }, { status: 500 });
  }
}
