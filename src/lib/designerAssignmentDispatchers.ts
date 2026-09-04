import { getDb } from "@/lib/db";
import { type DesignerAssignmentDispatcher, type DesignerAssignmentDispatcherSource } from "@/lib/branchSettings";
import { getCustomerBranchScope } from "@/lib/branchSettingsLookup";
import { getActiveOrgManagers, type OrgManagerUser, uniqueManagers } from "@/lib/orgManagers";

type Db = ReturnType<typeof getDb>;

export const designerAssignmentDispatcherSourceLabels: Record<DesignerAssignmentDispatcherSource, string> = {
  store_manager: "客户所属门店负责人",
  org_manager: "指定组织负责人",
  role: "指定岗位人员",
  user: "指定员工",
};

export type DesignerAssignmentDispatcherResolution = {
  source: DesignerAssignmentDispatcherSource;
  label: string;
  users: OrgManagerUser[];
  customer: { id: string; name: string; service_store?: string | null };
  store: { id: string; name: string; type: string };
};

function normalizeIds(value: unknown): string[] {
  const values = Array.isArray(value) ? value : value ? [value] : [];
  const seen = new Set<string>();
  return values
    .map((item) => String(item || "").trim())
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

export function getOrgDescendantIds(db: Db, rootOrgId?: string | null): string[] {
  const rootId = String(rootOrgId || "").trim();
  if (!rootId) return [];
  return (db.prepare(`
    WITH RECURSIVE org_tree(id) AS (
      SELECT id
      FROM org_units
      WHERE id = ? AND deleted_at IS NULL
      UNION ALL
      SELECT child.id
      FROM org_units child
      INNER JOIN org_tree parent ON child.parent_id = parent.id
      WHERE child.deleted_at IS NULL
    )
    SELECT id FROM org_tree
  `).all(rootId) as { id: string }[])
    .map((row) => String(row.id || "").trim())
    .filter(Boolean);
}

function getActiveUsersByIdsInScope(db: Db, userIds: string[], orgIds: string[]): OrgManagerUser[] {
  const ids = normalizeIds(userIds);
  if (!ids.length || !orgIds.length) return [];
  const userPlaceholders = ids.map(() => "?").join(",");
  const orgPlaceholders = orgIds.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT u.id, u.name, u.avatar, u.role, u.org_unit_id, org.name as org_unit_name, u.phone
    FROM users u
    LEFT JOIN org_units org ON org.id = u.org_unit_id AND org.deleted_at IS NULL
    WHERE u.id IN (${userPlaceholders})
      AND u.org_unit_id IN (${orgPlaceholders})
      AND u.deleted_at IS NULL
      AND COALESCE(u.is_active, 1) = 1
  `).all(...ids, ...orgIds) as OrgManagerUser[];
  const rowById = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => rowById.get(id)).filter(Boolean) as OrgManagerUser[];
}

function getActiveUsersByRolesInScope(db: Db, roleCodes: string[], orgIds: string[]): OrgManagerUser[] {
  const roles = normalizeIds(roleCodes).map((role) => role.toUpperCase());
  if (!roles.length || !orgIds.length) return [];
  const rolePlaceholders = roles.map(() => "?").join(",");
  const orgPlaceholders = orgIds.map(() => "?").join(",");
  return db.prepare(`
    SELECT u.id, u.name, u.avatar, u.role, u.org_unit_id, org.name as org_unit_name, u.phone
    FROM users u
    LEFT JOIN org_units org ON org.id = u.org_unit_id AND org.deleted_at IS NULL
    WHERE UPPER(u.role) IN (${rolePlaceholders})
      AND u.org_unit_id IN (${orgPlaceholders})
      AND u.deleted_at IS NULL
      AND COALESCE(u.is_active, 1) = 1
    ORDER BY u.name ASC, u.created_at ASC
  `).all(...roles, ...orgIds) as OrgManagerUser[];
}

export function validateDesignerAssignmentDispatcher(
  db: Db,
  branchOrgId: string,
  dispatcher: DesignerAssignmentDispatcher,
): string | null {
  const branch = db.prepare(`
    SELECT id, company_id
    FROM org_units
    WHERE id = ? AND type = 'company' AND deleted_at IS NULL AND COALESCE(is_active, 1) = 1
    LIMIT 1
  `).get(branchOrgId) as { id: string; company_id: string } | undefined;
  if (!branch) return "分公司不存在或已停用";

  const branchOrgIds = getOrgDescendantIds(db, branch.id);
  if (!branchOrgIds.length) return "分公司下暂无可用组织";
  if (dispatcher.source === "store_manager") return null;

  if (dispatcher.source === "org_manager") {
    const ids = normalizeIds(dispatcher.orgUnitIds);
    if (!ids.length) return "请选择至少一个指定组织";
    const validIds = ids.filter((id) => branchOrgIds.includes(id));
    if (validIds.length !== ids.length) return "指定组织必须属于当前分公司";
    const placeholders = ids.map(() => "?").join(",");
    const activeCount = db.prepare(`
      SELECT COUNT(*) as total
      FROM org_units
      WHERE id IN (${placeholders})
        AND deleted_at IS NULL
        AND COALESCE(is_active, 1) = 1
    `).get(...ids) as { total?: number };
    if (Number(activeCount?.total || 0) !== ids.length) return "指定组织不存在或已停用";
    const managers = uniqueManagers(ids.flatMap((orgId) => getActiveOrgManagers(db, orgId)))
      .filter((user) => branchOrgIds.includes(String(user.org_unit_id || "")));
    if (!managers.length) return "指定组织暂未设置可处理的在职负责人";
    return null;
  }

  if (dispatcher.source === "role") {
    const roleCodes = normalizeIds(dispatcher.roleCodes).map((role) => role.toUpperCase());
    if (!roleCodes.length) return "请选择至少一个员工岗位";
    const placeholders = roleCodes.map(() => "?").join(",");
    const activeCount = db.prepare(`
      SELECT COUNT(DISTINCT code) as total
      FROM roles
      WHERE company_id = ?
        AND code IN (${placeholders})
        AND deleted_at IS NULL
        AND is_active = 1
    `).get(branch.company_id, ...roleCodes) as { total?: number };
    if (Number(activeCount?.total || 0) !== roleCodes.length) return "所选员工岗位不存在或已停用";
    if (!getActiveUsersByRolesInScope(db, roleCodes, branchOrgIds).length) {
      return "当前分公司下没有符合所选岗位的在职员工";
    }
    return null;
  }

  const userIds = normalizeIds(dispatcher.userIds);
  if (!userIds.length) return "请选择至少一位指定员工";
  const users = getActiveUsersByIdsInScope(db, userIds, branchOrgIds);
  if (users.length !== userIds.length) return "指定员工必须是在职且属于当前分公司的员工";
  return null;
}

export function resolveDesignerAssignmentDispatchers(
  db: Db,
  customerId: string,
  dispatcher: DesignerAssignmentDispatcher,
): DesignerAssignmentDispatcherResolution | { error: string } {
  const scope = getCustomerBranchScope(db, customerId);
  if ("error" in scope) return scope;
  const source = dispatcher.source;
  let users: OrgManagerUser[] = [];
  const isInCustomerBranch = (user: OrgManagerUser) => scope.orgIds.includes(String(user.org_unit_id || ""));

  if (source === "store_manager") {
    users = getActiveOrgManagers(db, scope.matchedOrg.id).filter(isInCustomerBranch);
  } else if (source === "org_manager") {
    const orgIds = normalizeIds(dispatcher.orgUnitIds).filter((id) => scope.orgIds.includes(id));
    const activeOrgIds = orgIds.filter((id) => {
      const org = db.prepare("SELECT id FROM org_units WHERE id = ? AND deleted_at IS NULL AND COALESCE(is_active, 1) = 1").get(id) as { id?: string } | undefined;
      return Boolean(org?.id);
    });
    users = uniqueManagers(activeOrgIds.flatMap((orgId) => getActiveOrgManagers(db, orgId))).filter(isInCustomerBranch);
  } else if (source === "role") {
    users = uniqueManagers(getActiveUsersByRolesInScope(db, dispatcher.roleCodes, scope.orgIds));
  } else {
    users = uniqueManagers(getActiveUsersByIdsInScope(db, dispatcher.userIds, scope.orgIds));
  }

  if (!users.length) {
    return { error: `当前${designerAssignmentDispatcherSourceLabels[source]}没有可处理的在职员工，请检查分公司派单规则` };
  }

  return {
    source,
    label: designerAssignmentDispatcherSourceLabels[source],
    users,
    customer: scope.customer,
    store: scope.matchedOrg,
  };
}
