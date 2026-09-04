import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  createDefaultTemplate,
  ensureContractTemplateTables,
  getContractTemplateById,
  listContractTemplates,
  sanitizeContractTemplateHtml,
} from "@/lib/contractTemplates";
import { canManageOrganization, getAuthContext, hasPermission } from "@/lib/security/authorization";

function makeId(prefix: string) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function canManageBranchSettings(auth: NonNullable<ReturnType<typeof getAuthContext>>) {
  return canManageOrganization(auth) || hasPermission(auth, "settings.manage");
}

function verifyBranch(db: ReturnType<typeof getDb>, auth: NonNullable<ReturnType<typeof getAuthContext>>, orgUnitId: string) {
  return db.prepare(`
    SELECT id, company_id, name, COALESCE(is_active, 1) as is_active
    FROM org_units
    WHERE id = ? AND company_id = ? AND type = 'company' AND deleted_at IS NULL
    LIMIT 1
  `).get(orgUnitId, auth.companyId) as any;
}

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageBranchSettings(auth)) return NextResponse.json({ message: "没有合同模板查看权限" }, { status: 403 });

  const orgUnitId = String(req.nextUrl.searchParams.get("org_unit_id") || "").trim();
  const contractType = String(req.nextUrl.searchParams.get("contract_type") || "").trim();
  const enabledOnly = req.nextUrl.searchParams.get("enabled_only") === "1";
  if (!orgUnitId) return NextResponse.json({ message: "缺少分公司 ID" }, { status: 400 });

  const db = getDb();
  ensureContractTemplateTables(db);
  const org = verifyBranch(db, auth, orgUnitId);
  if (!org) return NextResponse.json({ message: "分公司不存在" }, { status: 404 });

  let items = listContractTemplates(db, {
    companyId: auth.companyId,
    orgUnitId,
    contractType: contractType || undefined,
    enabledOnly,
  });
  if (items.length === 0 && contractType && !enabledOnly) {
    createDefaultTemplate(db, {
      companyId: auth.companyId,
      orgUnitId,
      contractType,
      userId: auth.userId,
    });
    items = listContractTemplates(db, {
      companyId: auth.companyId,
      orgUnitId,
      contractType,
      enabledOnly,
    });
  }

  return NextResponse.json({
    org_unit_id: orgUnitId,
    items,
  });
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageBranchSettings(auth)) return NextResponse.json({ message: "没有合同模板管理权限" }, { status: 403 });

  try {
    const body = await req.json();
    const action = String(body.action || "save").trim();
    const orgUnitId = String(body.org_unit_id || "").trim();
    if (!orgUnitId) return NextResponse.json({ message: "缺少分公司 ID" }, { status: 400 });

    const db = getDb();
    ensureContractTemplateTables(db);
    const org = verifyBranch(db, auth, orgUnitId);
    if (!org) return NextResponse.json({ message: "分公司不存在" }, { status: 404 });
    if (Number(org.is_active ?? 1) !== 1) return NextResponse.json({ message: "该分公司已停用，不能修改合同模板" }, { status: 400 });

    if (action === "create_default") {
      const created = createDefaultTemplate(db, {
        companyId: auth.companyId,
        orgUnitId,
        contractType: String(body.contract_type || "装修施工合同").trim(),
        userId: auth.userId,
      });
      return NextResponse.json(created, { status: 201 });
    }

    const templateId = String(body.id || "").trim();
    const name = String(body.name || "").trim();
    const contractType = String(body.contract_type || "").trim();
    const html = sanitizeContractTemplateHtml(body.html);
    if (["save", "publish"].includes(action)) {
      if (!name) return NextResponse.json({ message: "请填写模板名称" }, { status: 400 });
      if (!contractType) return NextResponse.json({ message: "请选择合同类型" }, { status: 400 });
      if (!html) return NextResponse.json({ message: "请填写合同模板内容" }, { status: 400 });
    }

    if (action === "disable") {
      const existing = getContractTemplateById(db, templateId, auth.companyId);
      if (!existing || existing.org_unit_id !== orgUnitId) return NextResponse.json({ message: "合同模板不存在" }, { status: 404 });
      db.prepare(`
        UPDATE contract_templates
        SET status = 'disabled', is_default = 0, updated_by_id = ?, updated_at = datetime('now')
        WHERE id = ? AND company_id = ?
      `).run(auth.userId, templateId, auth.companyId);
      return NextResponse.json(getContractTemplateById(db, templateId, auth.companyId));
    }

    if (action === "delete_draft") {
      const existing = getContractTemplateById(db, templateId, auth.companyId);
      if (!existing || existing.org_unit_id !== orgUnitId) return NextResponse.json({ message: "合同模板不存在" }, { status: 404 });
      if (existing.status !== "draft") return NextResponse.json({ message: "只有草稿模板可以删除" }, { status: 400 });
      const publishedVersion = db.prepare(`
        SELECT id
        FROM contract_template_versions
        WHERE template_id = ? AND (published_at IS NOT NULL OR published_by_id IS NOT NULL)
        LIMIT 1
      `).get(templateId) as { id?: string } | undefined;
      if (publishedVersion) {
        return NextResponse.json({ message: "该模板曾经发布过，不能删除；可停用保留历史记录" }, { status: 400 });
      }
      db.prepare(`
        UPDATE contract_templates
        SET deleted_at = datetime('now'), is_default = 0, updated_by_id = ?, updated_at = datetime('now')
        WHERE id = ? AND company_id = ?
      `).run(auth.userId, templateId, auth.companyId);
      return NextResponse.json({ ok: true, id: templateId });
    }

    if (action === "publish_saved") {
      const existing = getContractTemplateById(db, templateId, auth.companyId);
      if (!existing || existing.org_unit_id !== orgUnitId) return NextResponse.json({ message: "合同模板不存在" }, { status: 404 });
      const tx = (db as any).transaction(() => {
        db.prepare(`
          UPDATE contract_templates
          SET status = CASE WHEN status = 'published' THEN 'disabled' ELSE status END,
              is_default = 0,
              updated_at = datetime('now')
          WHERE company_id = ? AND org_unit_id = ? AND contract_type = ? AND id <> ? AND deleted_at IS NULL
        `).run(auth.companyId, orgUnitId, existing.contract_type, templateId);
        db.prepare(`
          UPDATE contract_templates
          SET status = 'published', is_default = 1, updated_by_id = ?, updated_at = datetime('now')
          WHERE id = ? AND company_id = ?
        `).run(auth.userId, templateId, auth.companyId);
        db.prepare(`
          UPDATE contract_template_versions
          SET published_by_id = ?, published_at = COALESCE(published_at, datetime('now'))
          WHERE template_id = ? AND version = ?
        `).run(auth.userId, templateId, existing.current_version);
      });
      tx();
      return NextResponse.json(getContractTemplateById(db, templateId, auth.companyId));
    }

    if (action === "set_default") {
      const existing = getContractTemplateById(db, templateId, auth.companyId);
      if (!existing || existing.org_unit_id !== orgUnitId) return NextResponse.json({ message: "合同模板不存在" }, { status: 404 });
      if (existing.status !== "published") return NextResponse.json({ message: "只有已发布模板可以设为默认" }, { status: 400 });
      const tx = (db as any).transaction(() => {
        db.prepare(`
          UPDATE contract_templates
          SET is_default = 0, updated_at = datetime('now')
          WHERE company_id = ? AND org_unit_id = ? AND contract_type = ? AND deleted_at IS NULL
        `).run(auth.companyId, orgUnitId, existing.contract_type);
        db.prepare(`
          UPDATE contract_templates
          SET is_default = 1, updated_by_id = ?, updated_at = datetime('now')
          WHERE id = ? AND company_id = ?
        `).run(auth.userId, templateId, auth.companyId);
      });
      tx();
      return NextResponse.json(getContractTemplateById(db, templateId, auth.companyId));
    }

    const tx = (db as any).transaction(() => {
      let finalTemplateId = templateId;
      let nextVersion = 1;
      if (finalTemplateId) {
        const existing = getContractTemplateById(db, finalTemplateId, auth.companyId);
        if (!existing || existing.org_unit_id !== orgUnitId) throw new Error("合同模板不存在");
        nextVersion = Number(existing.current_version || 0) + 1;
        db.prepare(`
          UPDATE contract_templates
          SET name = ?, contract_type = ?, status = ?, is_default = CASE WHEN ? = 'publish' THEN is_default ELSE 0 END,
              current_version = ?, updated_by_id = ?, updated_at = datetime('now')
          WHERE id = ? AND company_id = ?
        `).run(name, contractType, action === "publish" ? "published" : "draft", action, nextVersion, auth.userId, finalTemplateId, auth.companyId);
      } else {
        finalTemplateId = makeId("CTPL");
        db.prepare(`
          INSERT INTO contract_templates (
            id, company_id, org_unit_id, name, contract_type, status, is_default, current_version,
            created_by_id, updated_by_id, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?, datetime('now'), datetime('now'))
        `).run(finalTemplateId, auth.companyId, orgUnitId, name, contractType, action === "publish" ? "published" : "draft", auth.userId, auth.userId);
      }

      db.prepare(`
        INSERT INTO contract_template_versions (
          id, template_id, version, content_json, html, created_by_id, published_by_id, created_at, published_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), ${action === "publish" ? "datetime('now')" : "NULL"})
      `).run(
        makeId("CTPV"),
        finalTemplateId,
        nextVersion,
        JSON.stringify({ mode: "html" }),
        html,
        auth.userId,
        action === "publish" ? auth.userId : null,
      );

      if (action === "publish") {
        db.prepare(`
          UPDATE contract_templates
          SET status = CASE WHEN status = 'published' THEN 'disabled' ELSE status END,
              is_default = 0,
              updated_at = datetime('now')
          WHERE company_id = ? AND org_unit_id = ? AND contract_type = ? AND id <> ? AND deleted_at IS NULL
        `).run(auth.companyId, orgUnitId, contractType, finalTemplateId);
        db.prepare("UPDATE contract_templates SET is_default = 1 WHERE id = ? AND company_id = ?").run(finalTemplateId, auth.companyId);
      }
      return finalTemplateId;
    });

    const savedId = tx();
    return NextResponse.json(getContractTemplateById(db, savedId, auth.companyId), { status: templateId ? 200 : 201 });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "保存合同模板失败" }, { status: 500 });
  }
}
