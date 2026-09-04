import { getDb } from "@/lib/db";
import { mergeBranchSettings } from "@/lib/branchSettings";

type Db = ReturnType<typeof getDb>;

type CustomerBranchScopeOrg = {
  id: string;
  name: string;
  type: string;
  parent_id?: string | null;
  is_active?: number | null;
};

export type CustomerBranchScope = {
  customer: { id: string; company_id: string; name: string; service_store?: string | null };
  rootOrg: CustomerBranchScopeOrg;
  matchedOrg: CustomerBranchScopeOrg;
  orgIds: string[];
};

export function getCompanyRootId(db: Db, orgUnitId?: string | null, companyId?: string | null) {
  if (!orgUnitId) return null;
  let current = db.prepare(`
    SELECT id, type, parent_id
    FROM org_units
    WHERE id = ? AND deleted_at IS NULL
      AND (? = '' OR company_id = ?)
  `).get(orgUnitId, companyId || "", companyId || "") as any;
  while (current) {
    if (current.type === "company") return current.id as string;
    current = current.parent_id
      ? db.prepare(`
        SELECT id, type, parent_id
        FROM org_units
        WHERE id = ? AND deleted_at IS NULL
          AND (? = '' OR company_id = ?)
      `).get(current.parent_id, companyId || "", companyId || "")
      : null;
  }
  return null;
}

export function getCompanyRootIdByOrgName(db: Db, name?: string | null, companyId?: string | null) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return null;
  const org = db.prepare(`
    SELECT id
    FROM org_units
    WHERE deleted_at IS NULL AND name = ?
      AND (? = '' OR company_id = ?)
    ORDER BY CASE type WHEN 'store' THEN 0 WHEN 'company' THEN 1 ELSE 2 END
    LIMIT 1
  `).get(trimmed, companyId || "", companyId || "") as any;
  return getCompanyRootId(db, org?.id, companyId);
}

export function getCompanyShortNameForOrgUnit(db: Db, orgUnitId?: string | null, companyId?: string | null) {
  const rootId = getCompanyRootId(db, orgUnitId, companyId);
  if (!rootId || !companyId) return "";
  const row = db.prepare(`
    SELECT settings
    FROM branch_settings
    WHERE org_unit_id = ? AND company_id = ? AND deleted_at IS NULL
    LIMIT 1
  `).get(rootId, companyId) as { settings?: string | null } | undefined;
  const settings = mergeBranchSettings(row?.settings ? JSON.parse(row.settings) : {});
  return Array.from(String(settings.basicInfo.companyShortName || "").trim()).slice(0, 6).join("");
}

export function getCompanyLogoUrlForOrgUnit(db: Db, orgUnitId?: string | null, companyId?: string | null) {
  const rootId = getCompanyRootId(db, orgUnitId, companyId);
  if (!rootId || !companyId) return "";
  const row = db.prepare(`
    SELECT settings
    FROM branch_settings
    WHERE org_unit_id = ? AND company_id = ? AND deleted_at IS NULL
    LIMIT 1
  `).get(rootId, companyId) as { settings?: string | null } | undefined;
  const settings = mergeBranchSettings(row?.settings ? JSON.parse(row.settings) : {});
  return String(settings.basicInfo.companyLogoUrl || "").trim();
}

export function getCompanyBrandSubtitleForOrgUnit(db: Db, orgUnitId?: string | null, companyId?: string | null) {
  const rootId = getCompanyRootId(db, orgUnitId, companyId);
  if (!rootId || !companyId) return "";
  const row = db.prepare(`
    SELECT settings
    FROM branch_settings
    WHERE org_unit_id = ? AND company_id = ? AND deleted_at IS NULL
    LIMIT 1
  `).get(rootId, companyId) as { settings?: string | null } | undefined;
  const settings = mergeBranchSettings(row?.settings ? JSON.parse(row.settings) : {});
  return String(settings.basicInfo.companyBrandSubtitle || "").trim();
}

export function getSidebarBrandNameForOrgUnit(db: Db, orgUnitId?: string | null, companyId?: string | null) {
  if (!orgUnitId || !companyId) return "";
  const org = db.prepare(`
    SELECT id, name, type
    FROM org_units
    WHERE id = ? AND company_id = ? AND deleted_at IS NULL
    LIMIT 1
  `).get(orgUnitId, companyId) as { id?: string; name?: string | null; type?: string | null } | undefined;
  const orgName = String(org?.name || "").trim();
  const orgType = String(org?.type || "").trim();
  if (orgType === "group" || orgType === "region") return orgName;
  return getCompanyShortNameForOrgUnit(db, orgUnitId, companyId);
}

export function getSidebarBrandLogoUrlForOrgUnit(db: Db, orgUnitId?: string | null, companyId?: string | null) {
  if (!orgUnitId || !companyId) return "";
  const org = db.prepare(`
    SELECT type
    FROM org_units
    WHERE id = ? AND company_id = ? AND deleted_at IS NULL
    LIMIT 1
  `).get(orgUnitId, companyId) as { type?: string | null } | undefined;
  const orgType = String(org?.type || "").trim();
  if (orgType === "group" || orgType === "region") return "";
  return getCompanyLogoUrlForOrgUnit(db, orgUnitId, companyId);
}

export function getSidebarBrandSubtitleForOrgUnit(db: Db, orgUnitId?: string | null, companyId?: string | null) {
  if (!orgUnitId || !companyId) return "";
  const org = db.prepare(`
    SELECT type
    FROM org_units
    WHERE id = ? AND company_id = ? AND deleted_at IS NULL
    LIMIT 1
  `).get(orgUnitId, companyId) as { type?: string | null } | undefined;
  const orgType = String(org?.type || "").trim();
  if (orgType === "group" || orgType === "region") return "";
  return getCompanyBrandSubtitleForOrgUnit(db, orgUnitId, companyId);
}

export function getCustomerBranchScope(db: Db, customerId: string): CustomerBranchScope | { error: string } {
  const customer = db.prepare(`
    SELECT id, company_id, name, service_store
    FROM customers
    WHERE id = ? AND deleted_at IS NULL
    LIMIT 1
  `).get(customerId) as CustomerBranchScope["customer"] | undefined;
  if (!customer) return { error: "客户不存在" };

  const serviceStoreName = String(customer.service_store || "").trim();
  if (!serviceStoreName) return { error: "该客户未设置服务门店" };

  const matchedOrg = db.prepare(`
    SELECT id, name, type, parent_id, COALESCE(is_active, 1) as is_active
    FROM org_units
    WHERE deleted_at IS NULL
      AND company_id = ?
      AND TRIM(COALESCE(name, '')) = TRIM(?)
    ORDER BY
      CASE WHEN COALESCE(is_active, 1) = 1 THEN 0 ELSE 1 END,
      CASE type WHEN 'store' THEN 0 WHEN 'company' THEN 1 WHEN 'dept' THEN 2 WHEN 'team' THEN 3 ELSE 4 END,
      created_at DESC
    LIMIT 1
  `).get(customer.company_id, serviceStoreName) as CustomerBranchScopeOrg | undefined;
  if (!matchedOrg) return { error: "客户所属服务门店未匹配到组织，请先检查客户服务门店" };
  if (Number(matchedOrg.is_active ?? 1) !== 1) return { error: "客户所属服务门店已停用" };

  const rootId = matchedOrg.type === "company" ? matchedOrg.id : getCompanyRootId(db, matchedOrg.id, customer.company_id);
  const rootOrg = rootId
    ? db.prepare(`
      SELECT id, name, type, parent_id, COALESCE(is_active, 1) as is_active
      FROM org_units
      WHERE id = ? AND company_id = ? AND deleted_at IS NULL
      LIMIT 1
    `).get(rootId, customer.company_id) as CustomerBranchScopeOrg | undefined
    : undefined;
  const effectiveRoot = rootOrg || matchedOrg;
  const orgIds = (db.prepare(`
    WITH RECURSIVE org_tree(id) AS (
      SELECT id
      FROM org_units
      WHERE id = ? AND company_id = ? AND deleted_at IS NULL
      UNION ALL
      SELECT child.id
      FROM org_units child
      INNER JOIN org_tree parent ON child.parent_id = parent.id
      WHERE child.company_id = ? AND child.deleted_at IS NULL
    )
    SELECT id FROM org_tree
  `).all(effectiveRoot.id, customer.company_id, customer.company_id) as { id: string }[])
    .map((row) => row.id)
    .filter(Boolean);
  if (!orgIds.length) return { error: "客户所属分公司下暂无可用组织" };

  return { customer, rootOrg: effectiveRoot, matchedOrg, orgIds };
}

export function getBranchSettingsForCustomer(db: Db, customerId?: string | null) {
  if (!customerId) return { org_unit_id: null, settings: mergeBranchSettings({}) };
  const customer = db.prepare(`
    SELECT c.id, c.company_id, c.created_by_id, c.inviter_id, c.service_store,
      inviter.org_unit_id as inviter_org_unit_id,
      creator.org_unit_id as creator_org_unit_id,
      manager.org_unit_id as manager_org_unit_id
    FROM customers c
    LEFT JOIN users inviter ON c.inviter_id = inviter.id
    LEFT JOIN users creator ON c.created_by_id = creator.id
    LEFT JOIN projects p ON p.customer_id = c.id AND p.deleted_at IS NULL
    LEFT JOIN users manager ON p.manager_id = manager.id
    WHERE c.id = ? AND c.deleted_at IS NULL
    ORDER BY p.created_at DESC
    LIMIT 1
  `).get(customerId) as any;

  const branchId =
    getCompanyRootIdByOrgName(db, customer?.service_store, customer?.company_id) ||
    getCompanyRootId(db, customer?.inviter_org_unit_id, customer?.company_id) ||
    getCompanyRootId(db, customer?.creator_org_unit_id, customer?.company_id) ||
    getCompanyRootId(db, customer?.manager_org_unit_id, customer?.company_id);

  const row = branchId
    ? db.prepare("SELECT settings FROM branch_settings WHERE org_unit_id = ? AND company_id = ? AND deleted_at IS NULL").get(branchId, customer?.company_id) as any
    : null;

  return {
    org_unit_id: branchId,
    settings: mergeBranchSettings(row?.settings ? JSON.parse(row.settings) : {}),
  };
}

export function getQuotationPrintSettingsForCustomer(db: Db, customerId?: string | null) {
  const branch = getBranchSettingsForCustomer(db, customerId);
  return {
    org_unit_id: branch.org_unit_id,
    quotationSignatureLabels: branch.settings.printSettings.quotationSignatureLabels,
  };
}
