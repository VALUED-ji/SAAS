import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuthContext, hasPermission, isSameOriginMutation } from "@/lib/security/authorization";

type Db = ReturnType<typeof getDb>;

function makeId() {
  return `WT_${randomUUID().replace(/-/g, "")}`;
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeSortOrder(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function ensureWorkTypesTable(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_types (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      code TEXT,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      remark TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_work_types_company ON work_types(company_id, is_active, sort_order);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_work_types_company_name ON work_types(company_id, name) WHERE deleted_at IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_work_types_company_code ON work_types(company_id, code) WHERE deleted_at IS NULL AND code IS NOT NULL AND code <> '';
  `);
}

function canManageWorkTypes(auth: NonNullable<ReturnType<typeof getAuthContext>>) {
  return auth.isAdmin;
}

function canViewWorkTypes(auth: NonNullable<ReturnType<typeof getAuthContext>>) {
  return canManageWorkTypes(auth) || hasPermission(auth, "quotations.manage");
}

function mapWorkType(row: any) {
  return {
    id: String(row.id || ""),
    code: String(row.code || ""),
    name: String(row.name || ""),
    sort_order: Number(row.sort_order || 0),
    remark: String(row.remark || ""),
    is_active: Number(row.is_active ?? 1),
    created_at: String(row.created_at || ""),
    updated_at: String(row.updated_at || row.created_at || ""),
  };
}

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canViewWorkTypes(auth)) return NextResponse.json({ message: "没有工种查看权限" }, { status: 403 });

  const db = getDb();
  ensureWorkTypesTable(db);
  const status = normalizeText(req.nextUrl.searchParams.get("status"));
  const keyword = normalizeText(req.nextUrl.searchParams.get("keyword")).toLowerCase();
  const conditions = ["company_id = ?", "deleted_at IS NULL"];
  const params: unknown[] = [auth.companyId];
  if (status === "active") conditions.push("COALESCE(is_active, 1) = 1");
  if (status === "inactive") conditions.push("COALESCE(is_active, 1) = 0");
  if (keyword) {
    conditions.push("LOWER(COALESCE(name, '') || ' ' || COALESCE(code, '') || ' ' || COALESCE(remark, '')) LIKE ?");
    params.push(`%${keyword}%`);
  }

  const workTypes = db.prepare(`
    SELECT *
    FROM work_types
    WHERE ${conditions.join(" AND ")}
    ORDER BY COALESCE(is_active, 1) DESC, COALESCE(sort_order, 0) ASC, name ASC
  `).all(...params).map(mapWorkType);

  return NextResponse.json({ workTypes });
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!isSameOriginMutation(req)) return NextResponse.json({ message: "请求来源无效" }, { status: 403 });
  if (!canManageWorkTypes(auth)) return NextResponse.json({ message: "只有老板或管理员可以维护工种设置" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const action = normalizeText(body.action);
  const db = getDb();
  ensureWorkTypesTable(db);

  if (action === "add" || action === "update") {
    const id = normalizeText(body.id) || makeId();
    const name = normalizeText(body.name);
    const code = normalizeText(body.code).toUpperCase() || null;
    const remark = normalizeText(body.remark) || null;
    const sortOrder = normalizeSortOrder(body.sort_order);
    if (!name) return NextResponse.json({ message: "请填写工种名称" }, { status: 400 });

    const duplicateName = db.prepare(`
      SELECT id
      FROM work_types
      WHERE company_id = ? AND name = ? AND id <> ? AND deleted_at IS NULL
      LIMIT 1
    `).get(auth.companyId, name, id) as any;
    if (duplicateName?.id) return NextResponse.json({ message: "工种名称已存在" }, { status: 400 });

    if (code) {
      const duplicateCode = db.prepare(`
        SELECT id
        FROM work_types
        WHERE company_id = ? AND code = ? AND id <> ? AND deleted_at IS NULL
        LIMIT 1
      `).get(auth.companyId, code, id) as any;
      if (duplicateCode?.id) return NextResponse.json({ message: "工种编码已存在" }, { status: 400 });
    }

    if (action === "update") {
      const existing = db.prepare(`
        SELECT id
        FROM work_types
        WHERE id = ? AND company_id = ? AND deleted_at IS NULL
        LIMIT 1
      `).get(id, auth.companyId) as any;
      if (!existing?.id) return NextResponse.json({ message: "未找到工种" }, { status: 404 });
      db.prepare(`
        UPDATE work_types
        SET code = ?, name = ?, sort_order = ?, remark = ?, updated_at = datetime('now')
        WHERE id = ? AND company_id = ? AND deleted_at IS NULL
      `).run(code, name, sortOrder, remark, id, auth.companyId);
      return NextResponse.json({ success: true, id });
    }

    const row = db.prepare(`
      SELECT COALESCE(MAX(sort_order), 0) + 10 AS sort_order
      FROM work_types
      WHERE company_id = ? AND deleted_at IS NULL
    `).get(auth.companyId) as any;
    db.prepare(`
      INSERT INTO work_types (id, company_id, code, name, sort_order, remark, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `).run(id, auth.companyId, code, name, body.sort_order === undefined || body.sort_order === "" ? Number(row?.sort_order || 10) : sortOrder, remark);
    return NextResponse.json({ success: true, id }, { status: 201 });
  }

  if (action === "toggle_status") {
    const id = normalizeText(body.id);
    if (!id) return NextResponse.json({ message: "缺少工种" }, { status: 400 });
    const active = body.is_active === false || body.is_active === 0 || body.is_active === "0" ? 0 : 1;
    const result = db.prepare(`
      UPDATE work_types
      SET is_active = ?, updated_at = datetime('now')
      WHERE id = ? AND company_id = ? AND deleted_at IS NULL
    `).run(active, id, auth.companyId);
    if (Number(result.changes || 0) === 0) return NextResponse.json({ message: "未找到工种" }, { status: 404 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ message: "未知操作" }, { status: 400 });
}
