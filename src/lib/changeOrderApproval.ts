import type Database from "better-sqlite3";
import type { ApprovalFlow, ApprovalNode } from "@/lib/branchSettings";
import { getBranchSettingsForCustomer } from "@/lib/branchSettingsLookup";
import { approvalSignatureSelect, ensureSignatureTables } from "@/lib/signatures";
import { getActiveOrgManagers } from "@/lib/orgManagers";

type Db = Database.Database;

type ApprovalPlanStep = {
  node: ApprovalNode;
  sortOrder: number;
  approver: { id: string; name: string };
};

export type ChangeOrderApprovalPlan = {
  branchOrgUnitId: string;
  flow: ApprovalFlow;
  steps: ApprovalPlanStep[];
};

function makeId(prefix: string) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function toMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function ensureChangeOrderApprovalTables(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS site_change_orders (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      change_no TEXT NOT NULL,
      change_type TEXT NOT NULL DEFAULT 'ADD',
      title TEXT NOT NULL,
      items TEXT,
      space TEXT,
      phase TEXT,
      reason_type TEXT,
      reason_detail TEXT,
      description TEXT,
      gross_amount REAL DEFAULT 0,
      discount_amount REAL DEFAULT 0,
      discount_reason TEXT,
      amount REAL NOT NULL DEFAULT 0,
      cost_estimate REAL DEFAULT 0,
      owner_confirmed INTEGER DEFAULT 1,
      owner_confirmed_at TEXT,
      internal_approval_status TEXT DEFAULT 'PENDING',
      approved_by TEXT REFERENCES users(id),
      approved_at TEXT,
      rejected_reason TEXT,
      included_in_settlement INTEGER DEFAULT 0,
      settlement_status TEXT DEFAULT 'NOT_INCLUDED',
      status TEXT DEFAULT 'PENDING_APPROVAL',
      created_by TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_site_change_orders_project ON site_change_orders(project_id, status, created_at);

    CREATE TABLE IF NOT EXISTS change_order_approval_instances (
      id TEXT PRIMARY KEY,
      change_order_id TEXT NOT NULL REFERENCES site_change_orders(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      customer_id TEXT NOT NULL REFERENCES customers(id),
      branch_org_unit_id TEXT REFERENCES org_units(id),
      flow_id TEXT NOT NULL,
      flow_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      current_node_index INTEGER DEFAULT 0,
      flow_snapshot TEXT,
      error_message TEXT,
      amount REAL,
      created_by_id TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS change_order_approval_steps (
      id TEXT PRIMARY KEY,
      instance_id TEXT NOT NULL REFERENCES change_order_approval_instances(id),
      change_order_id TEXT NOT NULL REFERENCES site_change_orders(id),
      node_id TEXT NOT NULL,
      node_name TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      approver_id TEXT NOT NULL REFERENCES users(id),
      approver_name TEXT,
      approve_mode TEXT NOT NULL DEFAULT 'any',
      can_reject INTEGER DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'waiting',
      comment TEXT,
      action_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_change_order_approval_instances_order ON change_order_approval_instances(change_order_id, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_change_order_approval_steps_approver ON change_order_approval_steps(approver_id, status, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_change_order_approval_steps_instance ON change_order_approval_steps(instance_id, sort_order, status);
  `);
  const changeOrderColumns = db.prepare("PRAGMA table_info(site_change_orders)").all() as { name: string }[];
  const ensureChangeOrderColumn = (name: string, definition: string) => {
    if (!changeOrderColumns.some((column) => column.name === name)) {
      db.prepare(`ALTER TABLE site_change_orders ADD COLUMN ${name} ${definition}`).run();
    }
  };
  ensureChangeOrderColumn("items", "TEXT");
  ensureChangeOrderColumn("gross_amount", "REAL DEFAULT 0");
  ensureChangeOrderColumn("discount_amount", "REAL DEFAULT 0");
  ensureChangeOrderColumn("discount_reason", "TEXT");
  db.prepare(`
    UPDATE site_change_orders
    SET gross_amount = amount
    WHERE (gross_amount IS NULL OR gross_amount = 0) AND amount > 0
  `).run();
}

export function getChangeOrderApprovalFlowForProject(db: Db, projectId: string, amount: number): { branchOrgUnitId: string; flow: ApprovalFlow; project: any } | null {
  const project = db.prepare(`
    SELECT p.*, c.name as customer_name
    FROM projects p
    INNER JOIN customers c ON p.customer_id = c.id
    WHERE p.id = ? AND p.deleted_at IS NULL AND c.deleted_at IS NULL
  `).get(projectId) as any;
  if (!project?.customer_id) return null;

  const branch = getBranchSettingsForCustomer(db, project.customer_id);
  if (!branch.org_unit_id) return null;
  const flows = branch.settings.approvalFlows
    .filter((flow) => flow.type === "change_order" && flow.isEnabled && flow.nodes.length > 0)
    .filter((flow) => Math.abs(Number(amount || 0)) >= Number(flow.thresholdAmount || 0));
  if (flows.length === 0) return null;
  const flow = flows.find((item) => item.isDefault) || flows[0];
  return { branchOrgUnitId: branch.org_unit_id, flow, project };
}

function getDescendantOrgIds(db: Db, rootId?: string | null) {
  if (!rootId) return [];
  const result = new Set<string>([rootId]);
  const walk = (parentId: string) => {
    const children = db.prepare("SELECT id FROM org_units WHERE parent_id = ? AND deleted_at IS NULL").all(parentId) as any[];
    children.forEach((child) => {
      if (!child?.id || result.has(child.id)) return;
      result.add(child.id);
      walk(child.id);
    });
  };
  walk(rootId);
  return Array.from(result);
}

function getActiveUser(db: Db, userId?: string | null) {
  if (!userId) return null;
  return db.prepare("SELECT id, name FROM users WHERE id = ? AND deleted_at IS NULL AND is_active = 1").get(userId) as any;
}

function uniqueApprovers(users: any[]) {
  const seen = new Set<string>();
  return users
    .filter((user) => user?.id && !seen.has(user.id))
    .map((user) => {
      seen.add(user.id);
      return { id: user.id as string, name: String(user.name || "审批人") };
    });
}

function resolveOrgRoleApprovers(db: Db, node: ApprovalNode, branchOrgUnitId: string) {
  if (node.roleCode === "STORE_MANAGER") {
    const managers = getActiveOrgManagers(db, branchOrgUnitId);
    if (managers.length) return uniqueApprovers(managers);
  }
  const orgIds = getDescendantOrgIds(db, branchOrgUnitId);
  if (orgIds.length) {
    const placeholders = orgIds.map(() => "?").join(",");
    const scoped = db.prepare(`
      SELECT id, name
      FROM users
      WHERE role = ? AND org_unit_id IN (${placeholders}) AND deleted_at IS NULL AND is_active = 1
      ORDER BY created_at ASC
    `).all(node.roleCode, ...orgIds) as any[];
    if (scoped.length) return uniqueApprovers(scoped);
  }
  const companyWide = db.prepare(`
    SELECT id, name
    FROM users
    WHERE role = ? AND deleted_at IS NULL AND is_active = 1
    ORDER BY created_at ASC
  `).all(node.roleCode) as any[];
  return uniqueApprovers(companyWide);
}

function resolveTeamRoleApprovers(db: Db, customerId: string, project: any, node: ApprovalNode, source: "customer" | "project") {
  const rows = db.prepare(`
    SELECT u.id, u.name
    FROM customer_team ct
    INNER JOIN users u ON ct.user_id = u.id
    WHERE ct.customer_id = ?
      AND u.deleted_at IS NULL
      AND u.is_active = 1
      AND (UPPER(ct.role) = UPPER(?) OR u.role = ?)
    ORDER BY ct.assigned_at DESC
  `).all(customerId, node.roleCode, node.roleCode) as any[];
  const users = [...rows];
  if (source === "project" && node.roleCode === "PM") {
    const pm = getActiveUser(db, project?.manager_id);
    if (pm) users.unshift(pm);
  }
  return uniqueApprovers(users);
}

function resolveInitiatorManager(db: Db, initiatorId: string) {
  const initiator = db.prepare("SELECT id, org_unit_id FROM users WHERE id = ? AND deleted_at IS NULL").get(initiatorId) as any;
  let orgId = initiator?.org_unit_id;
  while (orgId) {
    const org = db.prepare("SELECT id, parent_id FROM org_units WHERE id = ? AND deleted_at IS NULL").get(orgId) as any;
    const managers = getActiveOrgManagers(db, org?.id).filter((manager) => manager.id !== initiatorId);
    if (managers.length) return uniqueApprovers(managers);
    orgId = org?.parent_id || null;
  }
  return [];
}

function resolveNodeApprovers(db: Db, node: ApprovalNode, context: { customerId: string; project: any; branchOrgUnitId: string; initiatorId: string }) {
  if (node.approverSource === "direct_user") {
    const user = getActiveUser(db, node.userId);
    return user ? [{ id: user.id, name: user.name }] : [];
  }
  if (node.approverSource === "initiator_manager") return resolveInitiatorManager(db, context.initiatorId);
  if (node.approverSource === "org_role") return resolveOrgRoleApprovers(db, node, context.branchOrgUnitId);
  if (node.approverSource === "project_team_role") return resolveTeamRoleApprovers(db, context.customerId, context.project, node, "project");
  return resolveTeamRoleApprovers(db, context.customerId, context.project, node, "customer");
}

export function prepareChangeOrderApprovalPlan(
  db: Db,
  params: { customerId: string; project: any; branchOrgUnitId: string; flow: ApprovalFlow; initiatorId: string },
): ChangeOrderApprovalPlan {
  ensureChangeOrderApprovalTables(db);
  const steps: ApprovalPlanStep[] = [];
  params.flow.nodes.forEach((node, index) => {
    const approvers = resolveNodeApprovers(db, node, {
      customerId: params.customerId,
      project: params.project,
      branchOrgUnitId: params.branchOrgUnitId,
      initiatorId: params.initiatorId,
    });
    if (approvers.length === 0) {
      throw new Error(`变更单审批流「${params.flow.name}」的节点「${node.name}」未找到审批人，请检查分公司审批流配置`);
    }
    approvers.forEach((approver) => steps.push({ node, sortOrder: index, approver }));
  });
  return { branchOrgUnitId: params.branchOrgUnitId, flow: params.flow, steps };
}

export function notifyChangeOrderApprovalUser(db: Db, userId: string, title: string, content: string, linkUrl: string) {
  if (!userId) return;
  db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, content, link_url, created_at)
    VALUES (?, ?, 'APPROVAL', ?, ?, ?, datetime('now'))
  `).run(makeId("NTF"), userId, title, content, linkUrl);
}

export function createChangeOrderApprovalInstance(
  db: Db,
  plan: ChangeOrderApprovalPlan,
  params: { changeOrderId: string; projectId: string; customerId: string; createdById: string; title: string; amount: number },
) {
  ensureChangeOrderApprovalTables(db);
  cancelChangeOrderApprovalInstances(db, params.changeOrderId);
  const instanceId = makeId("COAI");
  db.prepare(`
    INSERT INTO change_order_approval_instances (
      id, change_order_id, project_id, customer_id, branch_org_unit_id, flow_id, flow_name,
      status, current_node_index, flow_snapshot, amount, created_by_id, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    instanceId,
    params.changeOrderId,
    params.projectId,
    params.customerId,
    plan.branchOrgUnitId,
    plan.flow.id,
    plan.flow.name,
    JSON.stringify(plan.flow),
    toMoney(params.amount),
    params.createdById,
  );

  const insertStep = db.prepare(`
    INSERT INTO change_order_approval_steps (
      id, instance_id, change_order_id, node_id, node_name, sort_order, approver_id, approver_name,
      approve_mode, can_reject, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);
  plan.steps.forEach((step) => {
    const status = step.sortOrder === 0 ? "pending" : "waiting";
    insertStep.run(
      makeId("COAS"),
      instanceId,
      params.changeOrderId,
      step.node.id,
      step.node.name,
      step.sortOrder,
      step.approver.id,
      step.approver.name,
      step.node.approveMode,
      step.node.canReject === false ? 0 : 1,
      status,
    );
    if (status === "pending") {
      notifyChangeOrderApprovalUser(
        db,
        step.approver.id,
        "变更单待审批",
        `变更单「${params.title}」金额 ${toMoney(params.amount).toFixed(2)} 元，已提交到「${step.node.name}」，请及时审批。`,
        `/site/${params.projectId}?tab=changes`,
      );
    }
  });
  return instanceId;
}

export function cancelChangeOrderApprovalInstances(db: Db, changeOrderId: string) {
  ensureChangeOrderApprovalTables(db);
  db.prepare(`
    UPDATE change_order_approval_instances
    SET deleted_at = datetime('now'), updated_at = datetime('now')
    WHERE change_order_id = ? AND deleted_at IS NULL
  `).run(changeOrderId);
  db.prepare(`
    UPDATE change_order_approval_steps
    SET deleted_at = datetime('now'), updated_at = datetime('now')
    WHERE change_order_id = ? AND deleted_at IS NULL
  `).run(changeOrderId);
}

export function hasPendingChangeOrderApproval(db: Db, changeOrderId: string) {
  ensureChangeOrderApprovalTables(db);
  const row = db.prepare(`
    SELECT id
    FROM change_order_approval_instances
    WHERE change_order_id = ? AND status = 'pending' AND deleted_at IS NULL
    LIMIT 1
  `).get(changeOrderId) as any;
  return Boolean(row?.id);
}

export function getChangeOrderApprovalMapForOrders(db: Db, changeOrderIds: string[]) {
  ensureChangeOrderApprovalTables(db);
  ensureSignatureTables(db);
  if (changeOrderIds.length === 0) return new Map<string, any>();
  const placeholders = changeOrderIds.map(() => "?").join(",");
  const instances = db.prepare(`
    SELECT *
    FROM change_order_approval_instances
    WHERE change_order_id IN (${placeholders}) AND deleted_at IS NULL
    ORDER BY created_at DESC
  `).all(...changeOrderIds) as any[];
  const map = new Map<string, any>();
  instances.forEach((instance) => {
    if (!map.has(instance.change_order_id)) map.set(instance.change_order_id, { instance, steps: [] });
  });
  if (map.size === 0) return map;
  const instanceIds = Array.from(map.values()).map((item) => item.instance.id);
  const instancePlaceholders = instanceIds.map(() => "?").join(",");
  const steps = db.prepare(`
    SELECT s.*, approver.avatar as approver_avatar, ${approvalSignatureSelect("change_order")}
    FROM change_order_approval_steps s
    LEFT JOIN users approver ON approver.id = s.approver_id
    LEFT JOIN approval_signature_snapshots snapshot ON snapshot.approval_type = 'change_order' AND snapshot.step_id = s.id
    WHERE s.instance_id IN (${instancePlaceholders}) AND s.deleted_at IS NULL
    ORDER BY s.sort_order ASC, s.created_at ASC
  `).all(...instanceIds) as any[];
  steps.forEach((step) => {
    const item = map.get(step.change_order_id);
    if (item) item.steps.push(step);
  });
  return map;
}

export function getChangeOrderApprovalSummary(approval: any) {
  if (!approval?.instance) return null;
  const steps = Array.isArray(approval.steps) ? approval.steps : [];
  const totalNodes = new Set(steps.map((step: any) => step.sort_order)).size;
  const currentSteps = steps.filter((step: any) => step.status === "pending");
  const approvedNodeCount = new Set(steps.filter((step: any) => step.status === "approved" || step.status === "skipped").map((step: any) => step.sort_order)).size;
  return {
    ...approval.instance,
    total_nodes: totalNodes,
    approved_nodes: Math.min(approvedNodeCount, totalNodes),
    current_node_name: currentSteps[0]?.node_name || "",
    current_approvers: currentSteps.map((step: any) => step.approver_name).filter(Boolean),
    steps,
  };
}

function getChangeOrderResultNotifyUserIds(db: Db, changeOrderId: string, fallbackUserId?: string | null) {
  const latestApproval = db.prepare(`
    SELECT created_by_id
    FROM change_order_approval_instances
    WHERE change_order_id = ? AND deleted_at IS NULL
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 1
  `).get(changeOrderId) as any;
  return Array.from(new Set([latestApproval?.created_by_id, fallbackUserId].filter(Boolean))) as string[];
}

export function approveChangeOrder(db: Db, changeOrderId: string, approverId?: string | null) {
  const order = db.prepare(`
    SELECT change_order.*, p.customer_id, p.id as project_id, c.name as customer_name
    FROM site_change_orders change_order
    INNER JOIN projects p ON change_order.project_id = p.id
    INNER JOIN customers c ON p.customer_id = c.id
    WHERE change_order.id = ? AND change_order.deleted_at IS NULL
  `).get(changeOrderId) as any;
  if (!order) throw new Error("变更单不存在或已删除");
  db.prepare(`
    UPDATE site_change_orders
    SET internal_approval_status = 'APPROVED',
      approved_by = ?,
      approved_at = datetime('now'),
      rejected_reason = NULL,
      status = 'APPROVED',
      updated_at = datetime('now')
    WHERE id = ? AND deleted_at IS NULL AND status != 'CANCELLED'
  `).run(approverId || null, changeOrderId);

  getChangeOrderResultNotifyUserIds(db, changeOrderId, order.created_by).forEach((userId) => {
    notifyChangeOrderApprovalUser(
      db,
      userId,
      "变更单审批通过",
      `客户「${order.customer_name}」的变更单「${order.title}」已审批通过。`,
      `/site/${order.project_id}?tab=changes`,
    );
  });
}

export function rejectChangeOrder(db: Db, changeOrderId: string, reason: string) {
  const order = db.prepare(`
    SELECT change_order.*, p.customer_id, p.id as project_id, c.name as customer_name
    FROM site_change_orders change_order
    INNER JOIN projects p ON change_order.project_id = p.id
    INNER JOIN customers c ON p.customer_id = c.id
    WHERE change_order.id = ? AND change_order.deleted_at IS NULL
  `).get(changeOrderId) as any;
  if (!order) throw new Error("变更单不存在或已删除");
  db.prepare(`
    UPDATE site_change_orders
    SET internal_approval_status = 'REJECTED',
      rejected_reason = ?,
      status = 'REJECTED',
      updated_at = datetime('now')
    WHERE id = ? AND deleted_at IS NULL AND status != 'CANCELLED'
  `).run(reason || "审批驳回", changeOrderId);

  getChangeOrderResultNotifyUserIds(db, changeOrderId, order.created_by).forEach((userId) => {
    notifyChangeOrderApprovalUser(
      db,
      userId,
      "变更单审批驳回",
      `客户「${order.customer_name}」的变更单「${order.title}」被驳回${reason ? `：${reason}` : ""}`,
      `/site/${order.project_id}?tab=changes`,
    );
  });
}
