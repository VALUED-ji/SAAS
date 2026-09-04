import { NextRequest, NextResponse } from "next/server";
import { ensureMaterialSystemSchema, getDb } from "@/lib/db";
import { findDuplicateApprovalFlowType, mergeBranchSettings } from "@/lib/branchSettings";
import { validateDesignerAssignmentDispatcher } from "@/lib/designerAssignmentDispatchers";
import { canManageOrganization, getAuthContext, hasPermission } from "@/lib/security/authorization";

const approvalFlowTypeLabels: Record<string, string> = {
  contract: "合同审批",
  quote: "报价审批",
  deposit: "收款审批",
  discount: "折扣审批",
  refund: "退款审批",
  payment: "付款审批",
  material: "材料审批",
  change_order: "变更单审批",
  custom: "自定义",
};

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const orgUnitId = req.nextUrl.searchParams.get("org_unit_id");
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS branch_settings (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      org_unit_id TEXT NOT NULL REFERENCES org_units(id),
      settings TEXT NOT NULL DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_branch_settings_org ON branch_settings(org_unit_id);
  `);

  if (!orgUnitId) {
    const rows = db.prepare(`
      SELECT org_unit_id, settings, updated_at
      FROM branch_settings
      WHERE company_id = ? AND deleted_at IS NULL
      ORDER BY updated_at DESC
    `).all(auth.companyId);
    const items = rows.map((row: any) => {
      const settings = mergeBranchSettings(row?.settings ? JSON.parse(row.settings) : {});
      return {
        org_unit_id: row.org_unit_id,
        legalCompanyName: settings.basicInfo.legalCompanyName,
        companyShortName: settings.basicInfo.companyShortName,
        companyLogoUrl: settings.basicInfo.companyLogoUrl,
        companyBrandSubtitle: settings.basicInfo.companyBrandSubtitle,
        province: settings.basicInfo.province,
        city: settings.basicInfo.city,
        district: settings.basicInfo.district,
        updated_at: row.updated_at,
      };
    });
    return NextResponse.json({ items });
  }

  const org = db.prepare("SELECT * FROM org_units WHERE id = ? AND company_id = ? AND type = 'company' AND deleted_at IS NULL")
    .get(orgUnitId, auth.companyId) as any;
  if (!org) return NextResponse.json({ message: "分公司不存在" }, { status: 404 });

  const row = db.prepare("SELECT * FROM branch_settings WHERE org_unit_id = ? AND company_id = ? AND deleted_at IS NULL")
    .get(orgUnitId, auth.companyId) as any;
  const rawSettings = row?.settings ? JSON.parse(row.settings) : {};
  ensureMaterialSystemSchema(db);
  const materials = db.prepare(`
    SELECT m.id, m.code, m.name, m.brand, m.product_name, m.material_model, m.color, m.spec, m.unit,
      m.cost_price, m.unit_price, m.supplier_id, m.stock, m.min_stock, m.image, m.images,
      CASE WHEN parent_mc.name IS NOT NULL THEN parent_mc.name || ' / ' || mc.name ELSE mc.name END as category_name,
      s.name as supplier_name
    FROM materials m
    LEFT JOIN material_categories mc ON m.category_id = mc.id
    LEFT JOIN material_categories parent_mc ON mc.parent_id = parent_mc.id
    LEFT JOIN suppliers s ON m.supplier_id = s.id
    WHERE m.deleted_at IS NULL
      AND m.is_active = 1
      AND m.company_id = ?
      AND COALESCE(m.material_type, 'AUXILIARY') <> 'MAIN'
      AND COALESCE(m.supply_mode, 'WAREHOUSE') = 'WAREHOUSE'
    ORDER BY COALESCE(parent_mc.sort_order, mc.sort_order, 999) ASC,
      COALESCE(mc.sort_order, 999) ASC,
      datetime(COALESCE(m.created_at, '1970-01-01')) DESC,
      m.name ASC
  `).all(org.company_id);
  const suppliers = db.prepare(`
    SELECT s.id, s.name, s.supplier_type, s.contact, s.phone,
      (SELECT COUNT(*) FROM materials m
        WHERE m.supplier_id = s.id
          AND m.deleted_at IS NULL
          AND m.is_active = 1
          AND COALESCE(m.material_type, 'AUXILIARY') <> 'MAIN'
          AND COALESCE(m.supply_mode, 'WAREHOUSE') = 'WAREHOUSE'
      ) as material_count
    FROM suppliers s
    WHERE s.deleted_at IS NULL
      AND s.is_active = 1
      AND COALESCE(s.cooperation_status, 'ACTIVE') = 'ACTIVE'
      AND s.company_id = ?
      AND (
        COALESCE(s.supplier_type, '') IN ('COMPANY_WAREHOUSE', 'WAREHOUSE')
        OR s.name LIKE '%仓%'
        OR EXISTS (
          SELECT 1 FROM materials m
          WHERE m.supplier_id = s.id
            AND m.deleted_at IS NULL
            AND m.is_active = 1
            AND COALESCE(m.material_type, 'AUXILIARY') <> 'MAIN'
            AND COALESCE(m.supply_mode, 'WAREHOUSE') = 'WAREHOUSE'
        )
      )
    ORDER BY CASE COALESCE(s.supplier_type, '')
        WHEN 'COMPANY_WAREHOUSE' THEN 0
        WHEN 'WAREHOUSE' THEN 0
        ELSE 1
      END,
      s.name ASC
  `).all(org.company_id);
  return NextResponse.json({
    id: row?.id || null,
    org_unit_id: orgUnitId,
    org_unit_name: org.name,
    settings: mergeBranchSettings(rawSettings),
    materials,
    suppliers,
    updated_at: row?.updated_at || null,
  });
}

export async function PUT(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canManageOrganization(auth) && !hasPermission(auth, "settings.manage")) {
    return NextResponse.json({ message: "没有分公司设置管理权限" }, { status: 403 });
  }
  try {
    const body = await req.json();
    const orgUnitId = String(body.org_unit_id || "").trim();
    if (!orgUnitId) return NextResponse.json({ message: "缺少分公司 ID" }, { status: 400 });

    const db = getDb();
    db.exec(`
      CREATE TABLE IF NOT EXISTS branch_settings (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(id),
        org_unit_id TEXT NOT NULL REFERENCES org_units(id),
        settings TEXT NOT NULL DEFAULT '{}',
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        deleted_at TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_branch_settings_org ON branch_settings(org_unit_id);
    `);

    const org = db.prepare("SELECT *, COALESCE(is_active, 1) as is_active FROM org_units WHERE id = ? AND company_id = ? AND type = 'company' AND deleted_at IS NULL")
      .get(orgUnitId, auth.companyId) as any;
    if (!org) return NextResponse.json({ message: "分公司不存在" }, { status: 404 });
    if (Number(org.is_active ?? 1) !== 1) return NextResponse.json({ message: "该分公司已停用，不能继续修改分公司设置" }, { status: 400 });

    const settings = mergeBranchSettings(body.settings);
    const companyShortName = String(settings.basicInfo.companyShortName || "").trim();
    if (Array.from(companyShortName).length > 6) {
      return NextResponse.json({ message: "公司简称最多不超过6个字" }, { status: 400 });
    }
    settings.basicInfo.companyShortName = companyShortName;
    const companyBrandSubtitle = String(settings.basicInfo.companyBrandSubtitle || "").trim();
    if (Array.from(companyBrandSubtitle).length > 40) {
      return NextResponse.json({ message: "品牌英文标识最多不超过40个字符" }, { status: 400 });
    }
    settings.basicInfo.companyBrandSubtitle = companyBrandSubtitle;
    const companyLogoUrl = String(settings.basicInfo.companyLogoUrl || "").trim();
    if (companyLogoUrl && !companyLogoUrl.startsWith(`/uploads/branches/${orgUnitId}/`)) {
      return NextResponse.json({ message: "公司Logo地址无效，请重新上传" }, { status: 400 });
    }
    settings.basicInfo.companyLogoUrl = companyLogoUrl;
    const quotationLogoUrl = String(settings.printSettings.quotationLogoUrl || "").trim();
    if (quotationLogoUrl && !quotationLogoUrl.startsWith(`/uploads/branches/${orgUnitId}/`)) {
      return NextResponse.json({ message: "报价打印Logo地址无效，请重新上传" }, { status: 400 });
    }
    settings.printSettings.quotationLogoUrl = quotationLogoUrl;
    const duplicateFlowType = findDuplicateApprovalFlowType(settings.approvalFlows);
    if (duplicateFlowType) {
      return NextResponse.json({ message: `审批流程中「${approvalFlowTypeLabels[duplicateFlowType] || "同类型审批"}」只能配置一条` }, { status: 400 });
    }
    if (settings.businessRules.designerAssignmentMode !== "direct") {
      const dispatcherError = validateDesignerAssignmentDispatcher(
        db,
        orgUnitId,
        settings.businessRules.designerAssignmentDispatcher,
      );
      if (dispatcherError) return NextResponse.json({ message: dispatcherError }, { status: 400 });
    }
    const existing = db.prepare("SELECT id FROM branch_settings WHERE org_unit_id = ? AND company_id = ? AND deleted_at IS NULL")
      .get(orgUnitId, auth.companyId) as any;
    if (existing) {
      db.prepare("UPDATE branch_settings SET settings = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?")
        .run(JSON.stringify(settings), existing.id, auth.companyId);
    } else {
      const id = `BS${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      db.prepare(`
        INSERT INTO branch_settings (id, company_id, org_unit_id, settings, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(id, org.company_id, orgUnitId, JSON.stringify(settings));
    }

    const saved = db.prepare("SELECT * FROM branch_settings WHERE org_unit_id = ? AND company_id = ? AND deleted_at IS NULL")
      .get(orgUnitId, auth.companyId) as any;
    return NextResponse.json({
      id: saved.id,
      org_unit_id: orgUnitId,
      org_unit_name: org.name,
      settings,
      updated_at: saved.updated_at,
    });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "保存分公司设置失败" }, { status: 500 });
  }
}
