import type Database from "better-sqlite3";
import type { ApprovalFlow, ApprovalNode } from "@/lib/branchSettings";
import { getBranchSettingsForCustomer } from "@/lib/branchSettingsLookup";
import { approvalSignatureSelect, ensureSignatureTables } from "@/lib/signatures";
import { syncCustomerProgress } from "@/lib/customerProgress";
import { getActiveOrgManagers } from "@/lib/orgManagers";

type Db = Database.Database;

type ApprovalPlanStep = {
  node: ApprovalNode;
  sortOrder: number;
  approver: { id: string; name: string };
};

export type DepositApprovalPlan = {
  branchOrgUnitId: string;
  flow: ApprovalFlow;
  steps: ApprovalPlanStep[];
};

export type DepositRefundApprovalPlan = DepositApprovalPlan;

function makeId(prefix: string) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function toMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function normalizeRecordType(value: unknown) {
  return String(value || "").trim() === "design_fee" ? "design_fee" : "deposit";
}

function getPaymentLabel(recordOrType: unknown) {
  const recordType = typeof recordOrType === "string"
    ? normalizeRecordType(recordOrType)
    : normalizeRecordType((recordOrType as any)?.record_type);
  return recordType === "design_fee" ? "设计费" : "定金";
}

function getPendingTopUpApprovalAmount(db: Db, depositId: string, excludeInstanceId?: string | null) {
  const params = [depositId] as any[];
  let excludeWhere = "";
  if (excludeInstanceId) {
    excludeWhere = "AND id <> ?";
    params.push(excludeInstanceId);
  }
  const row = db.prepare(`
    SELECT COALESCE(SUM(approval_amount), 0) as amount
    FROM deposit_approval_instances
    WHERE deposit_id = ?
      AND approval_kind = 'top_up'
      AND status = 'pending'
      AND deleted_at IS NULL
      ${excludeWhere}
  `).get(...params) as any;
  return toMoney(Number(row?.amount || 0));
}

function getPendingWaiverApprovalAmount(db: Db, depositId: string, excludeInstanceId?: string | null) {
  const params = [depositId] as any[];
  let excludeWhere = "";
  if (excludeInstanceId) {
    excludeWhere = "AND id <> ?";
    params.push(excludeInstanceId);
  }
  const row = db.prepare(`
    SELECT COALESCE(SUM(approval_amount), 0) as amount
    FROM deposit_approval_instances
    WHERE deposit_id = ?
      AND approval_kind = 'waiver'
      AND status = 'pending'
      AND deleted_at IS NULL
      ${excludeWhere}
  `).get(...params) as any;
  return toMoney(Number(row?.amount || 0));
}

function getRefundLabel(recordOrType: unknown) {
  const recordType = typeof recordOrType === "string"
    ? normalizeRecordType(recordOrType)
    : normalizeRecordType((recordOrType as any)?.record_type);
  return recordType === "design_fee" ? "退设计费" : "退定金";
}

export function ensureDepositApprovalTables(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS deposit_approval_instances (
      id TEXT PRIMARY KEY,
      deposit_id TEXT NOT NULL REFERENCES customer_deposit_records(id),
      customer_id TEXT NOT NULL REFERENCES customers(id),
      branch_org_unit_id TEXT REFERENCES org_units(id),
      flow_id TEXT NOT NULL,
      flow_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      current_node_index INTEGER DEFAULT 0,
      flow_snapshot TEXT,
      approval_kind TEXT DEFAULT 'initial',
      approval_amount REAL,
      approval_meta TEXT,
      error_message TEXT,
      created_by_id TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS deposit_approval_steps (
      id TEXT PRIMARY KEY,
      instance_id TEXT NOT NULL REFERENCES deposit_approval_instances(id),
      deposit_id TEXT NOT NULL REFERENCES customer_deposit_records(id),
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
    CREATE INDEX IF NOT EXISTS idx_deposit_approval_instances_deposit ON deposit_approval_instances(deposit_id, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_deposit_approval_steps_approver ON deposit_approval_steps(approver_id, status, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_deposit_approval_steps_instance ON deposit_approval_steps(instance_id, sort_order, status);
  `);
  const columns = db.prepare("PRAGMA table_info(deposit_approval_instances)").all() as { name: string }[];
  const names = new Set(columns.map((column) => column.name));
  if (!names.has("approval_kind")) db.prepare("ALTER TABLE deposit_approval_instances ADD COLUMN approval_kind TEXT DEFAULT 'initial'").run();
  if (!names.has("approval_amount")) db.prepare("ALTER TABLE deposit_approval_instances ADD COLUMN approval_amount REAL").run();
  if (!names.has("approval_meta")) db.prepare("ALTER TABLE deposit_approval_instances ADD COLUMN approval_meta TEXT").run();
}

export function ensureDepositRefundApprovalTables(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS deposit_refund_approval_instances (
      id TEXT PRIMARY KEY,
      deposit_id TEXT NOT NULL REFERENCES customer_deposit_records(id),
      customer_id TEXT NOT NULL REFERENCES customers(id),
      branch_org_unit_id TEXT REFERENCES org_units(id),
      flow_id TEXT NOT NULL,
      flow_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      current_node_index INTEGER DEFAULT 0,
      flow_snapshot TEXT,
      error_message TEXT,
      refund_amount REAL,
      refund_reason TEXT,
      created_by_id TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS deposit_refund_approval_steps (
      id TEXT PRIMARY KEY,
      instance_id TEXT NOT NULL REFERENCES deposit_refund_approval_instances(id),
      deposit_id TEXT NOT NULL REFERENCES customer_deposit_records(id),
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
    CREATE INDEX IF NOT EXISTS idx_deposit_refund_approval_instances_deposit ON deposit_refund_approval_instances(deposit_id, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_deposit_refund_approval_steps_approver ON deposit_refund_approval_steps(approver_id, status, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_deposit_refund_approval_steps_instance ON deposit_refund_approval_steps(instance_id, sort_order, status);
  `);
}

export function getDepositApprovalFlowForCustomer(db: Db, customerId: string, amount: number): { branchOrgUnitId: string; flow: ApprovalFlow } | null {
  const branch = getBranchSettingsForCustomer(db, customerId);
  if (!branch.org_unit_id) return null;
  const depositFlows = branch.settings.approvalFlows
    .filter((flow) => flow.type === "deposit" && flow.isEnabled && flow.nodes.length > 0)
    .filter((flow) => amount >= Number(flow.thresholdAmount || 0));
  if (depositFlows.length === 0) return null;
  const flow = depositFlows.find((item) => item.isDefault) || depositFlows[0];
  return { branchOrgUnitId: branch.org_unit_id, flow };
}

export function getDepositRefundApprovalFlowForCustomer(db: Db, customerId: string, amount: number): { branchOrgUnitId: string; flow: ApprovalFlow } | null {
  const branch = getBranchSettingsForCustomer(db, customerId);
  if (!branch.org_unit_id) return null;
  const refundFlows = branch.settings.approvalFlows
    .filter((flow) => flow.type === "refund" && flow.isEnabled && flow.nodes.length > 0)
    .filter((flow) => amount >= Number(flow.thresholdAmount || 0));
  if (refundFlows.length === 0) return null;
  const flow = refundFlows.find((item) => item.isDefault) || refundFlows[0];
  return { branchOrgUnitId: branch.org_unit_id, flow };
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

function getLatestProject(db: Db, customerId: string) {
  return db.prepare(`
    SELECT *
    FROM projects
    WHERE customer_id = ? AND deleted_at IS NULL
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 1
  `).get(customerId) as any;
}

function resolveTeamRoleApprovers(db: Db, customerId: string, node: ApprovalNode, source: "customer" | "project") {
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
    const project = getLatestProject(db, customerId);
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

function resolveNodeApprovers(db: Db, node: ApprovalNode, context: { customerId: string; branchOrgUnitId: string; initiatorId: string }) {
  if (node.approverSource === "direct_user") {
    const user = getActiveUser(db, node.userId);
    return user ? [{ id: user.id, name: user.name }] : [];
  }
  if (node.approverSource === "initiator_manager") return resolveInitiatorManager(db, context.initiatorId);
  if (node.approverSource === "org_role") return resolveOrgRoleApprovers(db, node, context.branchOrgUnitId);
  if (node.approverSource === "project_team_role") return resolveTeamRoleApprovers(db, context.customerId, node, "project");
  return resolveTeamRoleApprovers(db, context.customerId, node, "customer");
}

export function prepareDepositApprovalPlan(
  db: Db,
  params: { customerId: string; branchOrgUnitId: string; flow: ApprovalFlow; initiatorId: string },
): DepositApprovalPlan {
  ensureDepositApprovalTables(db);
  const steps: ApprovalPlanStep[] = [];
  params.flow.nodes.forEach((node, index) => {
    const approvers = resolveNodeApprovers(db, node, {
      customerId: params.customerId,
      branchOrgUnitId: params.branchOrgUnitId,
      initiatorId: params.initiatorId,
    });
    if (approvers.length === 0) {
      throw new Error(`收款审批流「${params.flow.name}」的节点「${node.name}」未找到审批人，请检查分公司审批流配置`);
    }
    approvers.forEach((approver) => steps.push({ node, sortOrder: index, approver }));
  });
  return { branchOrgUnitId: params.branchOrgUnitId, flow: params.flow, steps };
}

export function prepareDepositRefundApprovalPlan(
  db: Db,
  params: { customerId: string; branchOrgUnitId: string; flow: ApprovalFlow; initiatorId: string },
): DepositRefundApprovalPlan {
  ensureDepositRefundApprovalTables(db);
  const steps: ApprovalPlanStep[] = [];
  params.flow.nodes.forEach((node, index) => {
    const approvers = resolveNodeApprovers(db, node, {
      customerId: params.customerId,
      branchOrgUnitId: params.branchOrgUnitId,
      initiatorId: params.initiatorId,
    });
    if (approvers.length === 0) {
      throw new Error(`退款审批流「${params.flow.name}」的节点「${node.name}」未找到审批人，请检查分公司审批流配置`);
    }
    approvers.forEach((approver) => steps.push({ node, sortOrder: index, approver }));
  });
  return { branchOrgUnitId: params.branchOrgUnitId, flow: params.flow, steps };
}

export function notifyDepositApprovalUser(db: Db, userId: string, title: string, content: string, linkUrl: string) {
  if (!userId) return;
  db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, content, link_url, created_at)
    VALUES (?, ?, 'APPROVAL', ?, ?, ?, datetime('now'))
  `).run(makeId("NTF"), userId, title, content, linkUrl);
}

export function createDepositApprovalInstance(
  db: Db,
  plan: DepositApprovalPlan,
  params: { depositId: string; customerId: string; createdById: string; title: string; amount: number; recordType?: string; approvalKind?: "initial" | "top_up" | "waiver"; approvalMeta?: Record<string, any> },
) {
  ensureDepositApprovalTables(db);
  db.prepare("UPDATE deposit_approval_instances SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE deposit_id = ? AND status = 'pending' AND deleted_at IS NULL").run(params.depositId);
  const instanceId = makeId("DAI");
  db.prepare(`
    INSERT INTO deposit_approval_instances (
      id, deposit_id, customer_id, branch_org_unit_id, flow_id, flow_name,
      status, current_node_index, flow_snapshot, approval_kind, approval_amount, approval_meta, created_by_id, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    instanceId,
    params.depositId,
    params.customerId,
    plan.branchOrgUnitId,
    plan.flow.id,
    plan.flow.name,
    JSON.stringify(plan.flow),
    params.approvalKind || "initial",
    toMoney(params.amount),
    params.approvalMeta ? JSON.stringify(params.approvalMeta) : null,
    params.createdById,
  );

  const insertStep = db.prepare(`
    INSERT INTO deposit_approval_steps (
      id, instance_id, deposit_id, node_id, node_name, sort_order, approver_id, approver_name,
      approve_mode, can_reject, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);
  plan.steps.forEach((step) => {
    const status = step.sortOrder === 0 ? "pending" : "waiting";
    insertStep.run(
      makeId("DAS"),
      instanceId,
      params.depositId,
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
      const label = getPaymentLabel(params.recordType || "deposit");
      const actionLabel = params.approvalKind === "top_up" ? `补收${label}` : params.approvalKind === "waiver" ? `${label}尾款减免` : label;
      notifyDepositApprovalUser(
        db,
        step.approver.id,
        `${actionLabel}待审批`,
        `客户「${params.title}」提交了 ${toMoney(params.amount).toFixed(2)} 元${actionLabel}，请及时审批。`,
        `/projects/${params.customerId}?tab=deposit`,
      );
    }
  });
  return instanceId;
}

export function createDepositRefundApprovalInstance(
  db: Db,
  plan: DepositRefundApprovalPlan,
  params: { depositId: string; customerId: string; createdById: string; title: string; refundAmount: number; refundReason: string; recordType?: string },
) {
  ensureDepositRefundApprovalTables(db);
  db.prepare("UPDATE deposit_refund_approval_instances SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE deposit_id = ? AND status = 'pending' AND deleted_at IS NULL").run(params.depositId);
  const instanceId = makeId("DRAI");
  db.prepare(`
    INSERT INTO deposit_refund_approval_instances (
      id, deposit_id, customer_id, branch_org_unit_id, flow_id, flow_name,
      status, current_node_index, flow_snapshot, refund_amount, refund_reason, created_by_id, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    instanceId,
    params.depositId,
    params.customerId,
    plan.branchOrgUnitId,
    plan.flow.id,
    plan.flow.name,
    JSON.stringify(plan.flow),
    toMoney(params.refundAmount),
    params.refundReason,
    params.createdById,
  );

  const insertStep = db.prepare(`
    INSERT INTO deposit_refund_approval_steps (
      id, instance_id, deposit_id, node_id, node_name, sort_order, approver_id, approver_name,
      approve_mode, can_reject, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);
  plan.steps.forEach((step) => {
    const status = step.sortOrder === 0 ? "pending" : "waiting";
    insertStep.run(
      makeId("DRAS"),
      instanceId,
      params.depositId,
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
      const refundLabel = getRefundLabel(params.recordType || "deposit");
      notifyDepositApprovalUser(
        db,
        step.approver.id,
        `${refundLabel}待审批`,
        `客户「${params.title}」申请${refundLabel} ${toMoney(params.refundAmount).toFixed(2)} 元，请及时审批。`,
        `/projects/${params.customerId}?tab=deposit`,
      );
    }
  });
  return instanceId;
}

export function getDepositApprovalMapForDeposits(db: Db, depositIds: string[]) {
  ensureDepositApprovalTables(db);
  ensureSignatureTables(db);
  if (depositIds.length === 0) return new Map<string, any>();
  const placeholders = depositIds.map(() => "?").join(",");
  const instances = db.prepare(`
    SELECT *
    FROM deposit_approval_instances
    WHERE deposit_id IN (${placeholders}) AND deleted_at IS NULL
    ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'rejected' THEN 2 ELSE 3 END, created_at DESC
  `).all(...depositIds) as any[];
  const map = new Map<string, any>();
  instances.forEach((instance) => {
    const kind = instance.approval_kind === "top_up" ? "top_up" : instance.approval_kind === "waiver" ? "waiver" : "initial";
    const item = map.get(instance.deposit_id) || { initial: null, topUps: [], waivers: [] };
    if (kind === "top_up") {
      item.topUps.push({ instance, steps: [] });
    } else if (kind === "waiver") {
      item.waivers.push({ instance, steps: [] });
    } else if (!item.initial) {
      item.initial = { instance, steps: [] };
    }
    map.set(instance.deposit_id, item);
  });
  if (map.size === 0) return map;
  const instanceIds = Array.from(map.values())
    .flatMap((item) => [item.initial?.instance?.id, ...item.topUps.map((topUp: any) => topUp.instance?.id), ...(item.waivers || []).map((waiver: any) => waiver.instance?.id)])
    .filter(Boolean);
  if (instanceIds.length === 0) return map;
  const instancePlaceholders = instanceIds.map(() => "?").join(",");
  const steps = db.prepare(`
    SELECT s.*, approver.avatar as approver_avatar, ${approvalSignatureSelect("deposit")}
    FROM deposit_approval_steps s
    LEFT JOIN users approver ON approver.id = s.approver_id
    LEFT JOIN approval_signature_snapshots snapshot ON snapshot.approval_type = 'deposit' AND snapshot.step_id = s.id
    WHERE s.instance_id IN (${instancePlaceholders}) AND s.deleted_at IS NULL
    ORDER BY s.sort_order ASC, s.created_at ASC
  `).all(...instanceIds) as any[];
  const instanceToItem = new Map<string, any>();
  map.forEach((item) => {
    if (item.initial?.instance?.id) instanceToItem.set(item.initial.instance.id, item.initial);
    item.topUps.forEach((topUp: any) => {
      if (topUp.instance?.id) instanceToItem.set(topUp.instance.id, topUp);
    });
    (item.waivers || []).forEach((waiver: any) => {
      if (waiver.instance?.id) instanceToItem.set(waiver.instance.id, waiver);
    });
  });
  steps.forEach((step) => {
    const item = instanceToItem.get(step.instance_id);
    if (item) item.steps.push(step);
  });
  return map;
}

export function getDepositRefundApprovalMapForDeposits(db: Db, depositIds: string[]) {
  ensureDepositRefundApprovalTables(db);
  ensureSignatureTables(db);
  if (depositIds.length === 0) return new Map<string, any>();
  const placeholders = depositIds.map(() => "?").join(",");
  const instances = db.prepare(`
    SELECT *
    FROM deposit_refund_approval_instances
    WHERE deposit_id IN (${placeholders}) AND deleted_at IS NULL
    ORDER BY created_at DESC
  `).all(...depositIds) as any[];
  const map = new Map<string, any>();
  instances.forEach((instance) => {
    if (!map.has(instance.deposit_id)) map.set(instance.deposit_id, { instance, steps: [] });
  });
  if (map.size === 0) return map;
  const instanceIds = Array.from(map.values()).map((item) => item.instance.id);
  const instancePlaceholders = instanceIds.map(() => "?").join(",");
  const steps = db.prepare(`
    SELECT s.*, approver.avatar as approver_avatar, ${approvalSignatureSelect("deposit_refund")}
    FROM deposit_refund_approval_steps s
    LEFT JOIN users approver ON approver.id = s.approver_id
    LEFT JOIN approval_signature_snapshots snapshot ON snapshot.approval_type = 'deposit_refund' AND snapshot.step_id = s.id
    WHERE s.instance_id IN (${instancePlaceholders}) AND s.deleted_at IS NULL
    ORDER BY s.sort_order ASC, s.created_at ASC
  `).all(...instanceIds) as any[];
  steps.forEach((step) => {
    const item = map.get(step.deposit_id);
    if (item) item.steps.push(step);
  });
  return map;
}

export function getDepositApprovalSummary(approval: any) {
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

export function getDepositRefundApprovalSummary(approval: any) {
  return getDepositApprovalSummary(approval);
}

function getDepositResultNotifyUserIds(db: Db, depositId: string, fallbackUserId?: string | null) {
  const latestApproval = db.prepare(`
    SELECT created_by_id
    FROM deposit_approval_instances
    WHERE deposit_id = ? AND deleted_at IS NULL
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 1
  `).get(depositId) as any;
  return Array.from(new Set([latestApproval?.created_by_id, fallbackUserId].filter(Boolean))) as string[];
}

function getDepositRefundResultNotifyUserIds(db: Db, depositId: string, fallbackUserId?: string | null) {
  const latestApproval = db.prepare(`
    SELECT created_by_id
    FROM deposit_refund_approval_instances
    WHERE deposit_id = ? AND deleted_at IS NULL
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 1
  `).get(depositId) as any;
  return Array.from(new Set([latestApproval?.created_by_id, fallbackUserId].filter(Boolean))) as string[];
}

export function promoteCustomerToDeposited(db: Db, customer: any) {
  syncCustomerProgress(db, customer.id);
}

export function approveDeposit(db: Db, depositId: string) {
  const deposit = db.prepare(`
    SELECT d.*, c.name as customer_name, c.status as customer_status, c.id as customer_id
    FROM customer_deposit_records d
    INNER JOIN customers c ON d.customer_id = c.id
    WHERE d.id = ? AND d.deleted_at IS NULL AND c.deleted_at IS NULL
  `).get(depositId) as any;
  if (!deposit) throw new Error("款项记录不存在或已删除");
  const approval = db.prepare(`
    SELECT *
    FROM deposit_approval_instances
    WHERE deposit_id = ? AND status = 'approved' AND deleted_at IS NULL
    ORDER BY completed_at DESC, updated_at DESC, created_at DESC
    LIMIT 1
  `).get(depositId) as any;
  const approvalAmount = toMoney(Number(approval?.approval_amount || 0));
  const approvalMeta = (() => {
    try {
      return approval?.approval_meta ? JSON.parse(approval.approval_meta) : {};
    } catch {
      return {};
    }
  })();
  if (approval?.approval_kind === "waiver") {
    if (approvalAmount <= 0) throw new Error("尾款减免审批金额无效");
    const receivableAmount = toMoney(Number(deposit.receivable_amount ?? deposit.amount ?? 0));
    const currentAmount = toMoney(Number(deposit.amount || 0));
    const waivedAmount = toMoney(Number(deposit.waived_amount || 0));
    const pendingTopUpAmount = getPendingTopUpApprovalAmount(db, depositId);
    const pendingWaiverAmount = getPendingWaiverApprovalAmount(db, depositId, approval.id);
    const remainingAmount = Math.max(0, toMoney(receivableAmount - currentAmount - waivedAmount - pendingTopUpAmount - pendingWaiverAmount));
    if (approvalAmount > remainingAmount + 0.005) throw new Error(`尾款减免金额不能大于待收金额 ${remainingAmount.toFixed(2)}`);
    const nextWaivedAmount = toMoney(waivedAmount + approvalAmount);
    const noteParts = [
      String(deposit.notes || "").trim(),
      `尾款减免审批通过：${approvalAmount.toFixed(2)} 元${approvalMeta.reason ? `，原因：${approvalMeta.reason}` : ""}${approvalMeta.notes ? `，备注：${approvalMeta.notes}` : ""}`,
    ].filter(Boolean);
    db.prepare(`
      UPDATE customer_deposit_records
      SET waived_amount = ?,
          waiver_status = 'approved',
          waiver_reason = ?,
          waiver_processed_at = datetime('now'),
          notes = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(nextWaivedAmount, approvalMeta.reason || deposit.waiver_reason || "", noteParts.join("\n"), depositId);
    getDepositResultNotifyUserIds(db, depositId, deposit.waiver_requested_by_id || deposit.created_by_id).forEach((userId) => {
      const label = getPaymentLabel(deposit);
      notifyDepositApprovalUser(db, userId, `${label}尾款减免审批通过`, `客户「${deposit.customer_name}」的${label}尾款减免 ${approvalAmount.toFixed(2)} 元已审批通过。`, `/projects/${deposit.customer_id}?tab=deposit`);
    });
    return;
  }
  if (approval?.approval_kind === "top_up") {
    if (approvalAmount <= 0) throw new Error("补收审批金额无效");
    const receivableAmount = toMoney(Number(deposit.receivable_amount ?? deposit.amount ?? 0));
    const currentAmount = toMoney(Number(deposit.amount || 0));
    const pendingTopUpAmount = getPendingTopUpApprovalAmount(db, depositId, approval.id);
    const remainingAmount = Math.max(0, toMoney(receivableAmount - currentAmount - pendingTopUpAmount));
    if (approvalAmount > remainingAmount + 0.005) throw new Error(`补收金额不能大于待补金额 ${remainingAmount.toFixed(2)}`);
    const nextAmount = toMoney(currentAmount + approvalAmount);
    const noteParts = [
      String(deposit.notes || "").trim(),
      `补收审批通过：${approvalAmount.toFixed(2)} 元，方式：${approvalMeta.payment_channel || "-"}，时间：${approvalMeta.received_at || "-"}${approvalMeta.receiver_name ? `，收款人：${approvalMeta.receiver_name}` : ""}${approvalMeta.voucher_url ? `，凭证：${approvalMeta.voucher_url}` : ""}${approvalMeta.notes ? `，备注：${approvalMeta.notes}` : ""}`,
    ].filter(Boolean);
    db.prepare(`
      UPDATE customer_deposit_records
      SET amount = ?,
          status = 'received',
          voucher_url = COALESCE(voucher_url, NULLIF(?, '')),
          notes = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(nextAmount, approvalMeta.voucher_url || "", noteParts.join("\n"), depositId);
    if (normalizeRecordType(deposit.record_type) === "deposit") {
      promoteCustomerToDeposited(db, { id: deposit.customer_id, status: deposit.customer_status });
    }
    getDepositResultNotifyUserIds(db, depositId, deposit.created_by_id).forEach((userId) => {
      const label = getPaymentLabel(deposit);
      notifyDepositApprovalUser(db, userId, `补收${label}审批通过`, `客户「${deposit.customer_name}」的补收${label} ${approvalAmount.toFixed(2)} 元已审批通过。`, `/projects/${deposit.customer_id}?tab=deposit`);
    });
    return;
  }
  db.prepare("UPDATE customer_deposit_records SET status = 'received', updated_at = datetime('now') WHERE id = ?").run(depositId);
  if (normalizeRecordType(deposit.record_type) === "deposit") {
    promoteCustomerToDeposited(db, { id: deposit.customer_id, status: deposit.customer_status });
  }
  getDepositResultNotifyUserIds(db, depositId, deposit.created_by_id).forEach((userId) => {
    const label = getPaymentLabel(deposit);
    notifyDepositApprovalUser(db, userId, `${label}审批通过`, `客户「${deposit.customer_name}」的${label} ${toMoney(Number(deposit.amount || 0)).toFixed(2)} 元已审批通过。`, `/projects/${deposit.customer_id}?tab=deposit`);
  });
}

export function rejectDeposit(db: Db, depositId: string, reason: string) {
  const deposit = db.prepare(`
    SELECT d.*, c.name as customer_name
    FROM customer_deposit_records d
    INNER JOIN customers c ON d.customer_id = c.id
    WHERE d.id = ? AND d.deleted_at IS NULL AND c.deleted_at IS NULL
  `).get(depositId) as any;
  if (!deposit) throw new Error("款项记录不存在或已删除");
  const approval = db.prepare(`
    SELECT *
    FROM deposit_approval_instances
    WHERE deposit_id = ? AND status = 'rejected' AND deleted_at IS NULL
    ORDER BY completed_at DESC, updated_at DESC, created_at DESC
    LIMIT 1
  `).get(depositId) as any;
  if (approval?.approval_kind === "waiver") {
    db.prepare(`
      UPDATE customer_deposit_records
      SET waiver_status = 'rejected',
          waiver_processed_at = datetime('now'),
          updated_at = datetime('now')
      WHERE id = ?
    `).run(depositId);
    getDepositResultNotifyUserIds(db, depositId, deposit.waiver_requested_by_id || deposit.created_by_id).forEach((userId) => {
      const label = getPaymentLabel(deposit);
      const amount = toMoney(Number(approval.approval_amount || 0));
      notifyDepositApprovalUser(db, userId, `${label}尾款减免审批驳回`, `客户「${deposit.customer_name}」的${label}尾款减免 ${amount.toFixed(2)} 元审批被驳回${reason ? `：${reason}` : ""}`, `/projects/${deposit.customer_id}?tab=deposit`);
    });
    return;
  }
  if (approval?.approval_kind === "top_up") {
    getDepositResultNotifyUserIds(db, depositId, deposit.created_by_id).forEach((userId) => {
      const label = getPaymentLabel(deposit);
      const amount = toMoney(Number(approval.approval_amount || 0));
      notifyDepositApprovalUser(db, userId, `补收${label}审批驳回`, `客户「${deposit.customer_name}」的补收${label} ${amount.toFixed(2)} 元审批被驳回${reason ? `：${reason}` : ""}`, `/projects/${deposit.customer_id}?tab=deposit`);
    });
    return;
  }
  db.prepare("UPDATE customer_deposit_records SET status = 'rejected', updated_at = datetime('now') WHERE id = ?").run(depositId);
  getDepositResultNotifyUserIds(db, depositId, deposit.created_by_id).forEach((userId) => {
    const label = getPaymentLabel(deposit);
    notifyDepositApprovalUser(db, userId, `${label}审批驳回`, `客户「${deposit.customer_name}」的${label}审批被驳回${reason ? `：${reason}` : ""}`, `/projects/${deposit.customer_id}?tab=deposit`);
  });
}

export function approveDepositRefund(db: Db, depositId: string) {
  const deposit = db.prepare(`
    SELECT d.*, c.name as customer_name, c.id as customer_id
    FROM customer_deposit_records d
    INNER JOIN customers c ON d.customer_id = c.id
    WHERE d.id = ? AND d.deleted_at IS NULL AND c.deleted_at IS NULL
  `).get(depositId) as any;
  if (!deposit) throw new Error("款项记录不存在或已删除");
  const approvedTotalRow = db.prepare(`
    SELECT COALESCE(SUM(refund_amount), 0) as total
    FROM deposit_refund_approval_instances
    WHERE deposit_id = ? AND status = 'approved' AND deleted_at IS NULL
  `).get(depositId) as any;
  const latestApproved = db.prepare(`
    SELECT refund_amount
    FROM deposit_refund_approval_instances
    WHERE deposit_id = ? AND status = 'approved' AND deleted_at IS NULL
    ORDER BY completed_at DESC, updated_at DESC, created_at DESC
    LIMIT 1
  `).get(depositId) as any;
  const depositAmount = toMoney(Number(deposit.amount || 0));
  const approvedTotal = toMoney(Math.min(depositAmount, Number(approvedTotalRow?.total || deposit.refund_amount || 0)));
  const nextStatus = approvedTotal >= depositAmount ? "refunded" : "partial_refunded";
  db.prepare(`
    UPDATE customer_deposit_records
    SET refund_status = ?,
        refund_amount = ?,
        refund_processed_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(nextStatus, approvedTotal, depositId);
  getDepositRefundResultNotifyUserIds(db, depositId, deposit.refund_requested_by_id || deposit.created_by_id).forEach((userId) => {
    const label = getRefundLabel(deposit);
    notifyDepositApprovalUser(
      db,
      userId,
      `${label}审批通过`,
      `客户「${deposit.customer_name}」的${label} ${toMoney(Number(latestApproved?.refund_amount || deposit.refund_amount || 0)).toFixed(2)} 元已审批通过。`,
      `/projects/${deposit.customer_id}?tab=deposit`,
    );
  });
}

export function rejectDepositRefund(db: Db, depositId: string, reason: string) {
  const deposit = db.prepare(`
    SELECT d.*, c.name as customer_name, c.id as customer_id
    FROM customer_deposit_records d
    INNER JOIN customers c ON d.customer_id = c.id
    WHERE d.id = ? AND d.deleted_at IS NULL AND c.deleted_at IS NULL
  `).get(depositId) as any;
  if (!deposit) throw new Error("款项记录不存在或已删除");
  const approvedTotalRow = db.prepare(`
    SELECT COALESCE(SUM(refund_amount), 0) as total
    FROM deposit_refund_approval_instances
    WHERE deposit_id = ? AND status = 'approved' AND deleted_at IS NULL
  `).get(depositId) as any;
  const approvedTotal = toMoney(Number(approvedTotalRow?.total || 0));
  const nextStatus = approvedTotal > 0 ? "partial_refunded" : "rejected";
  db.prepare(`
    UPDATE customer_deposit_records
    SET refund_status = ?,
        refund_amount = ?,
        refund_processed_at = datetime('now'),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(nextStatus, approvedTotal || deposit.refund_amount || null, depositId);
  getDepositRefundResultNotifyUserIds(db, depositId, deposit.refund_requested_by_id || deposit.created_by_id).forEach((userId) => {
    const label = getRefundLabel(deposit);
    notifyDepositApprovalUser(
      db,
      userId,
      `${label}审批驳回`,
      `客户「${deposit.customer_name}」的${label}审批被驳回${reason ? `：${reason}` : ""}`,
      `/projects/${deposit.customer_id}?tab=deposit`,
    );
  });
}
