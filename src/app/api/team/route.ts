import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { DEFAULT_ROLES, ensureDefaultRoles, getDb } from "@/lib/db";
import { getCustomerBranchScope } from "@/lib/branchSettingsLookup";
import { ensureQuotationAccessColumns, serializeQuotationAccessOrgUnitIds } from "@/lib/quotationOrgAccess";
import { canManageTeam, getAuthContext } from "@/lib/security/authorization";

function normalizeQuotationAccessOrgUnitIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean)));
}

function validateQuotationAccessOrgUnitIds(db: ReturnType<typeof getDb>, companyId: string, ids: string[]) {
  if (ids.length === 0) return true;
  const placeholders = ids.map(() => "?").join(",");
  const row = db.prepare(`
    SELECT COUNT(*) as total
    FROM org_units
    WHERE company_id = ?
      AND id IN (${placeholders})
      AND deleted_at IS NULL
      AND COALESCE(is_active, 1) = 1
  `).get(companyId, ...ids) as { total?: number } | undefined;
  return Number(row?.total || 0) === ids.length;
}

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const db = getDb();
  ensureQuotationAccessColumns(db);
  const url = new URL(req.url);
  const pickerMode = url.searchParams.get("picker") === "1";
  const now = new Date().toISOString();
  db.prepare("UPDATE users SET last_seen_at = ?, last_login_at = COALESCE(last_login_at, ?), updated_at = datetime('now') WHERE id = ? AND company_id = ? AND deleted_at IS NULL")
    .run(now, now, auth.userId, auth.companyId);

  if (pickerMode) {
    const keyword = (url.searchParams.get("q") || "").trim();
    const role = (url.searchParams.get("role") || "").trim().toUpperCase();
    const orgUnitId = (url.searchParams.get("org_unit_id") || "").trim();
    const customerId = (url.searchParams.get("customer_id") || "").trim();
    const branchId = (url.searchParams.get("branch_id") || "").trim();
    const requestedLimit = Number.parseInt(url.searchParams.get("limit") || "50", 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 10), 100) : 50;
    const offset = Math.max(Number.parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);
    const where = ["u.company_id = ?", "u.deleted_at IS NULL", "COALESCE(u.is_active, 1) = 1"];
    const params: unknown[] = [auth.companyId];
    let branchScope:
      | ReturnType<typeof getCustomerBranchScope>
      | null = null;

    if (customerId) {
      const customer = db.prepare("SELECT id FROM customers WHERE id = ? AND company_id = ? AND deleted_at IS NULL LIMIT 1")
        .get(customerId, auth.companyId);
      if (!customer) {
        return NextResponse.json({ message: "客户不存在", items: [], total: 0, limit, offset, hasMore: false }, { status: 404 });
      }
      branchScope = getCustomerBranchScope(db, customerId);
      if ("error" in branchScope) {
        return NextResponse.json({ message: branchScope.error, items: [], total: 0, limit, offset, hasMore: false }, { status: 400 });
      }
      const orgPlaceholders = branchScope.orgIds.map(() => "?").join(",");
      where.push(`u.org_unit_id IN (${orgPlaceholders})`);
      params.push(...branchScope.orgIds);
    } else if (branchId) {
      const branch = db.prepare(`
        SELECT id
        FROM org_units
        WHERE id = ?
          AND company_id = ?
          AND type = 'company'
          AND deleted_at IS NULL
          AND COALESCE(is_active, 1) = 1
        LIMIT 1
      `).get(branchId, auth.companyId) as { id?: string } | undefined;
      if (!branch?.id) {
        return NextResponse.json({ message: "分公司不存在或已停用", items: [], total: 0, limit, offset, hasMore: false }, { status: 400 });
      }
      const orgIds = (db.prepare(`
        WITH RECURSIVE org_tree(id) AS (
          SELECT id
          FROM org_units
          WHERE id = ? AND deleted_at IS NULL AND COALESCE(is_active, 1) = 1
          UNION ALL
          SELECT child.id
          FROM org_units child
          INNER JOIN org_tree parent ON child.parent_id = parent.id
          WHERE child.deleted_at IS NULL AND COALESCE(child.is_active, 1) = 1
        )
        SELECT id FROM org_tree
      `).all(branch.id) as { id: string }[]).map((item) => item.id).filter(Boolean);
      if (!orgIds.length) {
        return NextResponse.json({ message: "分公司下暂无可用组织", items: [], total: 0, limit, offset, hasMore: false }, { status: 400 });
      }
      const orgPlaceholders = orgIds.map(() => "?").join(",");
      where.push(`u.org_unit_id IN (${orgPlaceholders})`);
      params.push(...orgIds);
    }

    if (keyword) {
      const likeKeyword = `%${keyword}%`;
      where.push("(u.name LIKE ? OR u.employee_no LIKE ? OR u.phone LIKE ? OR o.name LIKE ?)");
      params.push(likeKeyword, likeKeyword, likeKeyword, likeKeyword);
    }

    if (role && role !== "ALL") {
      where.push("UPPER(u.role) = ?");
      params.push(role);
    }

    if (!customerId && orgUnitId) {
      where.push("u.org_unit_id = ?");
      params.push(orgUnitId);
    }

    const whereSql = where.join(" AND ");
    const totalRow = db.prepare(`
      SELECT COUNT(*) as total
      FROM users u
      LEFT JOIN org_units o ON u.org_unit_id = o.id
      WHERE ${whereSql}
    `).get(...params) as { total?: number };

    const items = db.prepare(`
      SELECT
        u.id,
        u.name,
        u.avatar,
        u.role,
        COALESCE((SELECT r.name FROM roles r WHERE r.company_id = u.company_id AND r.code = u.role AND r.deleted_at IS NULL LIMIT 1), u.role) as role_name,
        u.employee_no,
        u.org_unit_id,
        u.quotation_access_org_unit_ids,
        o.name as org_unit_name,
        COALESCE(u.is_active, 1) as is_active,
        (SELECT COUNT(*) FROM projects WHERE manager_id = u.id AND company_id = ? AND deleted_at IS NULL AND status IN ('CONSTRUCTION','SIGNED')) as project_count
      FROM users u
      LEFT JOIN org_units o ON u.org_unit_id = o.id
      WHERE ${whereSql}
      ORDER BY
        CASE WHEN ? <> '' AND u.name = ? THEN 0 ELSE 1 END,
        CASE WHEN ? <> '' AND u.name LIKE ? THEN 0 ELSE 1 END,
        datetime(COALESCE(u.last_seen_at, u.last_login_at, u.updated_at, u.created_at)) DESC,
        u.created_at DESC
      LIMIT ? OFFSET ?
    `).all(auth.companyId, ...params, keyword, keyword, keyword, `${keyword}%`, limit, offset);

    const total = Number(totalRow?.total || 0);
    return NextResponse.json({
      items,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
      scope: branchScope && !("error" in branchScope) ? {
        org_unit_id: branchScope.rootOrg.id,
        org_unit_name: branchScope.rootOrg.name,
        service_store: branchScope.customer.service_store || "",
      } : null,
    });
  }

  const users = db.prepare(`
    SELECT
      u.id, u.name, u.phone, u.avatar, u.role,
      COALESCE((SELECT r.name FROM roles r WHERE r.company_id = u.company_id AND r.code = u.role AND r.deleted_at IS NULL LIMIT 1), u.role) as role_name,
      u.org_unit_id,
      u.quotation_access_org_unit_ids,
      u.employee_no, u.hire_date, u.notes, u.last_login_at, u.last_seen_at,
      COALESCE(u.is_active, 1) as is_active,
      o.name as org_unit_name,
      (SELECT COUNT(*) FROM projects WHERE manager_id = u.id AND company_id = ? AND deleted_at IS NULL AND status IN ('CONSTRUCTION','SIGNED')) as project_count
    FROM users u
    LEFT JOIN org_units o ON u.org_unit_id = o.id AND o.company_id = ?
    WHERE u.company_id = ? AND u.deleted_at IS NULL
    ORDER BY u.created_at DESC
  `).all(auth.companyId, auth.companyId, auth.companyId);
  return NextResponse.json(users);
}

const fallbackAllowedRoles = new Set(DEFAULT_ROLES.map((role) => role.code));

function isAllowedRole(db: ReturnType<typeof getDb>, companyId: string, role: string) {
  if (!role) return false;
  ensureDefaultRoles(db);
  const matched = db.prepare("SELECT id FROM roles WHERE company_id = ? AND code = ? AND is_active = 1 AND deleted_at IS NULL")
    .get(companyId, role);
  return Boolean(matched) || fallbackAllowedRoles.has(role);
}

function isStrongInitialPassword(password: string) {
  return password.length >= 8 && password.length <= 32 && /[A-Za-z]/.test(password) && /\d/.test(password) && !/\s/.test(password);
}

function parseAvatarInput(value: unknown): { value: string | null; error?: string } {
  const avatar = String(value || "").trim();
  if (!avatar) return { value: null };
  if (avatar.length > 500) return { value: null, error: "头像地址过长" };
  if (!avatar.startsWith("/uploads/users/")) return { value: null, error: "头像地址无效，请重新上传头像" };
  return { value: avatar };
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageTeam(auth)) return NextResponse.json({ message: "没有员工管理权限" }, { status: 403 });
  try {
    const body = await req.json();
    const {
      name,
      phone,
      password,
      role,
      org_unit_id,
      employee_no,
      hire_date,
      is_active = 1,
      notes,
      avatar,
      quotation_access_org_unit_ids,
    } = body;
    const quotationAccessOrgUnitIds = normalizeQuotationAccessOrgUnitIds(quotation_access_org_unit_ids);

    const rows = Array.isArray(body?.employees) ? body.employees : null;
    if (rows) {
      const db = getDb();
      ensureQuotationAccessColumns(db);
      const insert = db.prepare(`
        INSERT INTO users (id, company_id, name, phone, password, role, org_unit_id, quotation_access_org_unit_ids, employee_no, hire_date, is_active, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);
      const created: { id: string; name: string }[] = [];
      const errors: { row: number; message: string }[] = [];
      const filePhones = new Set<string>();

      for (let index = 0; index < rows.length; index += 1) {
        const item = rows[index] as any;
        const rowNumber = index + 2;
        const rowName = item.name?.trim();
        const rowPhone = item.phone?.trim();
        const rowPassword = String(item.password || "").trim();
        const rowRole = item.role?.trim();
        const rowOrgUnitId = item.org_unit_id?.trim();
        const rowIsActive = item.is_active === false || item.is_active === 0 || item.is_active === "0" || item.is_active === "停用" ? 0 : 1;

        if (!rowName) {
          errors.push({ row: rowNumber, message: "员工姓名为必填项" });
          continue;
        }
        if (!rowPhone) {
          errors.push({ row: rowNumber, message: "手机号为必填项" });
          continue;
        }
        if (!/^1[3-9]\d{9}$/.test(rowPhone)) {
          errors.push({ row: rowNumber, message: "请输入有效的手机号" });
          continue;
        }
        if (filePhones.has(rowPhone)) {
          errors.push({ row: rowNumber, message: "导入文件内手机号重复" });
          continue;
        }
        filePhones.add(rowPhone);
        if (!isStrongInitialPassword(rowPassword)) {
          errors.push({ row: rowNumber, message: "初始密码需为 8-32 位且同时包含字母和数字，不能包含空格" });
          continue;
        }
        if (!isAllowedRole(db, auth.companyId, rowRole)) {
          errors.push({ row: rowNumber, message: "员工角色无效" });
          continue;
        }
        if (!rowOrgUnitId) {
          errors.push({ row: rowNumber, message: "所属组织为必填项" });
          continue;
        }

        const existing = db.prepare("SELECT id FROM users WHERE phone = ? AND deleted_at IS NULL").get(rowPhone);
        if (existing) {
          errors.push({ row: rowNumber, message: "该手机号已存在员工账号" });
          continue;
        }

        const org = db.prepare("SELECT id, COALESCE(is_active, 1) as is_active FROM org_units WHERE id = ? AND company_id = ? AND deleted_at IS NULL")
          .get(rowOrgUnitId, auth.companyId) as any;
        if (!org) {
          errors.push({ row: rowNumber, message: "所属组织不存在" });
          continue;
        }
        if (Number(org.is_active ?? 1) !== 1) {
          errors.push({ row: rowNumber, message: "所属组织已停用，不能新增员工" });
          continue;
        }

        const id = `U${Date.now()}${index}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const hashed = await bcrypt.hash(rowPassword, 10);
        insert.run(
          id,
          auth.companyId,
          rowName,
          rowPhone,
          hashed,
          rowRole,
          rowOrgUnitId,
          "[]",
          item.employee_no?.trim() || null,
          item.hire_date || null,
          rowIsActive,
          item.notes?.trim() || null
        );
        created.push({ id, name: rowName });
      }

      return NextResponse.json({ created: created.length, errors }, { status: errors.length ? 207 : 201 });
    }

    if (!name?.trim()) return NextResponse.json({ message: "员工姓名为必填项" }, { status: 400 });
    if (!phone?.trim()) return NextResponse.json({ message: "手机号为必填项" }, { status: 400 });
    if (!/^1[3-9]\d{9}$/.test(phone.trim())) return NextResponse.json({ message: "请输入有效的手机号" }, { status: 400 });
    if (!isStrongInitialPassword(String(password || ""))) {
      return NextResponse.json({ message: "初始密码需为 8-32 位且同时包含字母和数字，不能包含空格" }, { status: 400 });
    }
    const db = getDb();
    ensureQuotationAccessColumns(db);
    if (!isAllowedRole(db, auth.companyId, role)) return NextResponse.json({ message: "请选择员工角色" }, { status: 400 });
    if (!org_unit_id) return NextResponse.json({ message: "请选择所属组织" }, { status: 400 });
    if (!validateQuotationAccessOrgUnitIds(db, auth.companyId, quotationAccessOrgUnitIds)) {
      return NextResponse.json({ message: "额外报价范围包含无效组织" }, { status: 400 });
    }

    const existing = db.prepare("SELECT id FROM users WHERE phone = ? AND deleted_at IS NULL").get(phone.trim());
    if (existing) return NextResponse.json({ message: "该手机号已存在员工账号" }, { status: 400 });

    const org = db.prepare("SELECT id, COALESCE(is_active, 1) as is_active FROM org_units WHERE id = ? AND company_id = ? AND deleted_at IS NULL")
      .get(org_unit_id, auth.companyId) as any;
    if (!org) return NextResponse.json({ message: "所属组织不存在" }, { status: 400 });
    if (Number(org.is_active ?? 1) !== 1) return NextResponse.json({ message: "所属组织已停用，不能新增员工" }, { status: 400 });
    const avatarInput = parseAvatarInput(avatar);
    if (avatarInput.error) return NextResponse.json({ message: avatarInput.error }, { status: 400 });

    const id = `U${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const hashed = await bcrypt.hash(String(password), 10);

    db.prepare(`
      INSERT INTO users (id, company_id, name, phone, password, avatar, role, org_unit_id, quotation_access_org_unit_ids, employee_no, hire_date, is_active, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).run(
      id,
      auth.companyId,
      name.trim(),
      phone.trim(),
      hashed,
      avatarInput.value,
      role,
      org_unit_id,
      serializeQuotationAccessOrgUnitIds(quotationAccessOrgUnitIds),
      employee_no?.trim() || null,
      hire_date || null,
      is_active ? 1 : 0,
      notes?.trim() || null
    );

    const user = db.prepare(`
      SELECT u.id, u.name, u.phone, u.avatar, u.role,
        COALESCE((SELECT r.name FROM roles r WHERE r.company_id = u.company_id AND r.code = u.role AND r.deleted_at IS NULL LIMIT 1), u.role) as role_name,
        u.org_unit_id, u.quotation_access_org_unit_ids, u.employee_no,
        u.hire_date, u.notes, u.last_login_at, u.last_seen_at, COALESCE(u.is_active, 1) as is_active,
        o.name as org_unit_name, 0 as project_count
      FROM users u
      LEFT JOIN org_units o ON u.org_unit_id = o.id AND o.company_id = ?
      WHERE u.id = ? AND u.company_id = ?
    `).get(auth.companyId, id, auth.companyId);
    return NextResponse.json(user, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "创建失败" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageTeam(auth)) return NextResponse.json({ message: "没有员工管理权限" }, { status: 403 });
  try {
    const body = await req.json();
    const {
      id,
      name,
      phone,
      password,
      role,
      org_unit_id,
      employee_no,
      hire_date,
      is_active = 1,
      notes,
      avatar,
      quotation_access_org_unit_ids,
    } = body;
    const quotationAccessOrgUnitIds = normalizeQuotationAccessOrgUnitIds(quotation_access_org_unit_ids);

    if (!id) return NextResponse.json({ message: "缺少员工 ID" }, { status: 400 });
    if (!name?.trim()) return NextResponse.json({ message: "员工姓名为必填项" }, { status: 400 });
    if (!phone?.trim()) return NextResponse.json({ message: "手机号为必填项" }, { status: 400 });
    if (!/^1[3-9]\d{9}$/.test(phone.trim())) return NextResponse.json({ message: "请输入有效的手机号" }, { status: 400 });
    if (password && !isStrongInitialPassword(String(password))) {
      return NextResponse.json({ message: "新密码需为 8-32 位且同时包含字母和数字，不能包含空格" }, { status: 400 });
    }
    const db = getDb();
    ensureQuotationAccessColumns(db);
    if (!isAllowedRole(db, auth.companyId, role)) return NextResponse.json({ message: "请选择员工角色" }, { status: 400 });
    if (!org_unit_id) return NextResponse.json({ message: "请选择所属组织" }, { status: 400 });
    if (!validateQuotationAccessOrgUnitIds(db, auth.companyId, quotationAccessOrgUnitIds)) {
      return NextResponse.json({ message: "额外报价范围包含无效组织" }, { status: 400 });
    }

    const user = db.prepare("SELECT id, org_unit_id, avatar FROM users WHERE id = ? AND company_id = ? AND deleted_at IS NULL")
      .get(id, auth.companyId) as any;
    if (!user) return NextResponse.json({ message: "员工不存在或已删除" }, { status: 404 });

    const existing = db.prepare("SELECT id FROM users WHERE phone = ? AND id != ? AND deleted_at IS NULL").get(phone.trim(), id);
    if (existing) return NextResponse.json({ message: "该手机号已存在员工账号" }, { status: 400 });

    const org = db.prepare("SELECT id, COALESCE(is_active, 1) as is_active FROM org_units WHERE id = ? AND company_id = ? AND deleted_at IS NULL")
      .get(org_unit_id, auth.companyId) as any;
    if (!org) return NextResponse.json({ message: "所属组织不存在" }, { status: 400 });

    const nextIsActive = is_active === true || is_active === 1 || is_active === "1" ? 1 : 0;
    if (Number(org.is_active ?? 1) !== 1 && user.org_unit_id !== org_unit_id) {
      return NextResponse.json({ message: "所属组织已停用，不能转入员工" }, { status: 400 });
    }
    const avatarProvided = Object.prototype.hasOwnProperty.call(body, "avatar");
    const avatarInput = parseAvatarInput(avatar);
    if (avatarProvided && avatarInput.error) return NextResponse.json({ message: avatarInput.error }, { status: 400 });
    const nextAvatar = avatarProvided ? avatarInput.value : user.avatar || null;
    const passwordValue = String(password || "").trim();

    if (passwordValue) {
      const hashed = await bcrypt.hash(passwordValue, 10);
      db.prepare(`
        UPDATE users
        SET name = ?, phone = ?, password = ?, avatar = ?, role = ?, org_unit_id = ?, quotation_access_org_unit_ids = ?, employee_no = ?, hire_date = ?, is_active = ?, notes = ?,
          session_version = COALESCE(session_version, 0) + 1, updated_at = datetime('now')
        WHERE id = ? AND company_id = ?
      `).run(
        name.trim(),
        phone.trim(),
        hashed,
        nextAvatar,
        role,
        org_unit_id,
        serializeQuotationAccessOrgUnitIds(quotationAccessOrgUnitIds),
        employee_no?.trim() || null,
        hire_date || null,
        nextIsActive,
        notes?.trim() || null,
        id,
        auth.companyId
      );
    } else {
      db.prepare(`
        UPDATE users
        SET name = ?, phone = ?, avatar = ?, role = ?, org_unit_id = ?, quotation_access_org_unit_ids = ?, employee_no = ?, hire_date = ?, is_active = ?, notes = ?, updated_at = datetime('now')
        WHERE id = ? AND company_id = ?
      `).run(
        name.trim(),
        phone.trim(),
        nextAvatar,
        role,
        org_unit_id,
        serializeQuotationAccessOrgUnitIds(quotationAccessOrgUnitIds),
        employee_no?.trim() || null,
        hire_date || null,
        nextIsActive,
        notes?.trim() || null,
        id,
        auth.companyId
      );
    }

    const updated = db.prepare(`
      SELECT u.id, u.name, u.phone, u.avatar, u.role,
        COALESCE((SELECT r.name FROM roles r WHERE r.company_id = u.company_id AND r.code = u.role AND r.deleted_at IS NULL LIMIT 1), u.role) as role_name,
        u.org_unit_id, u.quotation_access_org_unit_ids, u.employee_no,
        u.hire_date, u.notes, u.last_login_at, u.last_seen_at, COALESCE(u.is_active, 1) as is_active,
        o.name as org_unit_name,
        (SELECT COUNT(*) FROM projects WHERE manager_id = u.id AND company_id = ? AND deleted_at IS NULL AND status IN ('CONSTRUCTION','SIGNED')) as project_count
      FROM users u
      LEFT JOIN org_units o ON u.org_unit_id = o.id AND o.company_id = ?
      WHERE u.id = ? AND u.company_id = ?
    `).get(auth.companyId, auth.companyId, id, auth.companyId);

    return NextResponse.json(updated);
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "保存失败" }, { status: 500 });
  }
}
