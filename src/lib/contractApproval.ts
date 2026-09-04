import type Database from "better-sqlite3";
import { mergeBranchSettings } from "@/lib/branchSettings";
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

export type ContractApprovalPlan = {
  branchOrgUnitId: string;
  flow: ApprovalFlow;
  steps: ApprovalPlanStep[];
};

function makeId(prefix: string) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function parseJson(value: string | null | undefined) {
  if (!value) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function toMoney(value: number) {
  return Math.round(Number(value || 0) * 100) / 100;
}

export function ensureContractApprovalTables(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contract_approval_instances (
      id TEXT PRIMARY KEY,
      contract_id TEXT NOT NULL REFERENCES contracts(id),
      customer_id TEXT NOT NULL REFERENCES customers(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      branch_org_unit_id TEXT REFERENCES org_units(id),
      flow_id TEXT NOT NULL,
      flow_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      current_node_index INTEGER DEFAULT 0,
      flow_snapshot TEXT,
      error_message TEXT,
      created_by_id TEXT REFERENCES users(id),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      deleted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS contract_approval_steps (
      id TEXT PRIMARY KEY,
      instance_id TEXT NOT NULL REFERENCES contract_approval_instances(id),
      contract_id TEXT NOT NULL REFERENCES contracts(id),
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
    CREATE INDEX IF NOT EXISTS idx_contract_approval_instances_contract ON contract_approval_instances(contract_id, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_contract_approval_steps_approver ON contract_approval_steps(approver_id, status, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_contract_approval_steps_instance ON contract_approval_steps(instance_id, sort_order, status);
  `);
  const projectColumns = db.prepare("PRAGMA table_info(projects)").all() as { name: string }[];
  if (!projectColumns.some((column) => column.name === "site_stage")) {
    db.prepare("ALTER TABLE projects ADD COLUMN site_stage TEXT").run();
  }
}

export function getContractApprovalFlowForCustomer(db: Db, customerId: string, totalAmount: number): { branchOrgUnitId: string; flow: ApprovalFlow } | null {
  const branch = getBranchSettingsForCustomer(db, customerId);
  if (!branch.org_unit_id) return null;
  const row = db.prepare("SELECT settings FROM branch_settings WHERE org_unit_id = ? AND deleted_at IS NULL").get(branch.org_unit_id) as any;
  if (!row?.settings) return null;
  const rawSettings = parseJson(row.settings) as any;
  if (!Array.isArray(rawSettings.approvalFlows)) return null;
  const settings = mergeBranchSettings(rawSettings);
  const contractFlows = settings.approvalFlows
    .filter((flow) => flow.type === "contract" && flow.isEnabled && flow.nodes.length > 0)
    .filter((flow) => totalAmount >= Number(flow.thresholdAmount || 0));
  if (contractFlows.length === 0) return null;
  const flow = contractFlows.find((item) => item.isDefault) || contractFlows[0];
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

export function prepareContractApprovalPlan(
  db: Db,
  params: { customerId: string; project: any; branchOrgUnitId: string; flow: ApprovalFlow; initiatorId: string },
): ContractApprovalPlan {
  ensureContractApprovalTables(db);
  const steps: ApprovalPlanStep[] = [];
  params.flow.nodes.forEach((node, index) => {
    const approvers = resolveNodeApprovers(db, node, {
      customerId: params.customerId,
      project: params.project,
      branchOrgUnitId: params.branchOrgUnitId,
      initiatorId: params.initiatorId,
    });
    if (approvers.length === 0) {
      throw new Error(`合同审批流「${params.flow.name}」的节点「${node.name}」未找到审批人，请检查分公司审批流配置`);
    }
    approvers.forEach((approver) => steps.push({ node, sortOrder: index, approver }));
  });
  return { branchOrgUnitId: params.branchOrgUnitId, flow: params.flow, steps };
}

function notifyUser(db: Db, userId: string, title: string, content: string, linkUrl: string) {
  if (!userId) return;
  db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, content, link_url, created_at)
    VALUES (?, ?, 'APPROVAL', ?, ?, ?, datetime('now'))
  `).run(makeId("NTF"), userId, title, content, linkUrl);
}

function getContractResultNotifyUserIds(db: Db, contractId: string, fallbackUserId?: string | null) {
  const latestApproval = db.prepare(`
    SELECT created_by_id
    FROM contract_approval_instances
    WHERE contract_id = ? AND deleted_at IS NULL
    ORDER BY updated_at DESC, created_at DESC
    LIMIT 1
  `).get(contractId) as any;
  return Array.from(new Set([latestApproval?.created_by_id, fallbackUserId].filter(Boolean))) as string[];
}

function markSourceContractResigned(db: Db, sourceContractId?: string | null, newContractId?: string | null) {
  if (!sourceContractId || !newContractId) return;
  const source = db.prepare("SELECT content FROM contracts WHERE id = ? AND deleted_at IS NULL").get(sourceContractId) as any;
  const content = parseJson(source?.content);
  db.prepare(`
    UPDATE contracts
    SET status = 'RESIGNED',
        content = ?,
        updated_at = datetime('now')
    WHERE id = ? AND status = 'SIGNED' AND deleted_at IS NULL
  `).run(JSON.stringify({
    ...content,
    resigned_by_contract_id: newContractId,
    resigned_at: new Date().toISOString(),
  }), sourceContractId);
}

export function createContractApprovalInstance(
  db: Db,
  plan: ContractApprovalPlan,
  params: { contractId: string; customerId: string; projectId: string; createdById: string; title: string },
) {
  ensureContractApprovalTables(db);
  db.prepare("UPDATE contract_approval_instances SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE contract_id = ? AND deleted_at IS NULL").run(params.contractId);
  const instanceId = makeId("CAI");
  db.prepare(`
    INSERT INTO contract_approval_instances (
      id, contract_id, customer_id, project_id, branch_org_unit_id, flow_id, flow_name,
      status, current_node_index, flow_snapshot, created_by_id, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, datetime('now'), datetime('now'))
  `).run(
    instanceId,
    params.contractId,
    params.customerId,
    params.projectId,
    plan.branchOrgUnitId,
    plan.flow.id,
    plan.flow.name,
    JSON.stringify(plan.flow),
    params.createdById,
  );

  const insertStep = db.prepare(`
    INSERT INTO contract_approval_steps (
      id, instance_id, contract_id, node_id, node_name, sort_order, approver_id, approver_name,
      approve_mode, can_reject, status, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
  `);
  plan.steps.forEach((step) => {
    const status = step.sortOrder === 0 ? "pending" : "waiting";
    insertStep.run(
      makeId("CAS"),
      instanceId,
      params.contractId,
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
      notifyUser(db, step.approver.id, "合同待审批", `合同「${params.title}」已提交到「${step.node.name}」，请及时审批。`, `/projects/${params.customerId}?tab=contract`);
    }
  });
  return instanceId;
}

export function getApprovalMapForContracts(db: Db, contractIds: string[]) {
  ensureContractApprovalTables(db);
  ensureSignatureTables(db);
  if (contractIds.length === 0) return new Map<string, any>();
  const placeholders = contractIds.map(() => "?").join(",");
  const instances = db.prepare(`
    SELECT *
    FROM contract_approval_instances
    WHERE contract_id IN (${placeholders}) AND deleted_at IS NULL
    ORDER BY created_at DESC
  `).all(...contractIds) as any[];
  const map = new Map<string, any>();
  instances.forEach((instance) => {
    if (!map.has(instance.contract_id)) map.set(instance.contract_id, { instance, steps: [] });
  });
  if (map.size === 0) return map;
  const instanceIds = Array.from(map.values()).map((item) => item.instance.id);
  const instancePlaceholders = instanceIds.map(() => "?").join(",");
  const steps = db.prepare(`
    SELECT s.*, approver.avatar as approver_avatar, ${approvalSignatureSelect("contract")}
    FROM contract_approval_steps s
    LEFT JOIN users approver ON approver.id = s.approver_id
    LEFT JOIN approval_signature_snapshots snapshot ON snapshot.approval_type = 'contract' AND snapshot.step_id = s.id
    WHERE s.instance_id IN (${instancePlaceholders}) AND s.deleted_at IS NULL
    ORDER BY s.sort_order ASC, s.created_at ASC
  `).all(...instanceIds) as any[];
  steps.forEach((step) => {
    const item = map.get(step.contract_id);
    if (item) item.steps.push(step);
  });
  return map;
}

export function getApprovalSummary(approval: any) {
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

export function activateApprovedContract(db: Db, contractId: string) {
  const contract = db.prepare(`
    SELECT c.*, p.customer_id
    FROM contracts c
    INNER JOIN projects p ON c.project_id = p.id
    WHERE c.id = ? AND c.deleted_at IS NULL
  `).get(contractId) as any;
  if (!contract) throw new Error("合同不存在或已删除");
  const content = parseJson(contract.content) as any;
  const amountInfo = content.amount_info || {};
  const paymentStages = Array.isArray(amountInfo.payment_stages) ? amountInfo.payment_stages : [];
  const payableAmount = toMoney(Number(amountInfo.payable_amount || contract.total_amount || 0));
  db.prepare("DELETE FROM payment_plans WHERE contract_id = ?").run(contractId);
  const insertPlan = db.prepare(`
    INSERT INTO payment_plans (id, project_id, contract_id, milestone, due_date, amount, status, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, datetime('now'), datetime('now'))
  `);
  paymentStages.forEach((stage: any, index: number) => {
    const ratio = Number(stage.ratio || 0);
    const amount = Number.isFinite(Number(stage.amount)) ? toMoney(Number(stage.amount)) : toMoney(payableAmount * ratio / 100);
    if (amount <= 0 && ratio <= 0) return;
    insertPlan.run(makeId("PP"), contract.project_id, contractId, String(stage.name || `第${index + 1}期款`).trim(), String(stage.due_date || "").trim() || null, amount, index + 1);
  });
  markSourceContractResigned(db, content.resign_source_contract_id, contractId);
  db.prepare("UPDATE contracts SET status = 'SIGNED', updated_at = datetime('now') WHERE id = ?").run(contractId);
  db.prepare(`
    UPDATE projects
    SET contract_amount = ?,
        status = CASE WHEN status IN ('LEAD','DESIGNED','QUOTED') THEN 'SIGNED' ELSE status END,
        site_stage = COALESCE(site_stage, 'PENDING_START'),
        updated_at = datetime('now')
    WHERE id = ?
  `).run(toMoney(Number(contract.total_amount || 0)), contract.project_id);
  db.prepare(`
    UPDATE customers
    SET status = CASE WHEN status IN ('NEW','CONTACTED','INVITED','MEASURED','DEPOSITED','PROPOSAL') THEN 'SIGNED' ELSE status END,
        current_action = '合同审批通过',
        updated_at = datetime('now')
    WHERE id = ?
  `).run(contract.customer_id);
  syncCustomerProgress(db, contract.customer_id);
  getContractResultNotifyUserIds(db, contractId, contract.created_by_id).forEach((userId) => {
    notifyUser(db, userId, "合同审批通过", `合同「${contract.title}」已审批通过。`, `/projects/${contract.customer_id}?tab=contract`);
  });
}

export function rejectContract(db: Db, contractId: string, reason: string) {
  const contract = db.prepare(`
    SELECT c.*, p.customer_id
    FROM contracts c
    INNER JOIN projects p ON c.project_id = p.id
    WHERE c.id = ? AND c.deleted_at IS NULL
  `).get(contractId) as any;
  if (!contract) throw new Error("合同不存在或已删除");
  db.prepare("UPDATE contracts SET status = 'REJECTED', updated_at = datetime('now') WHERE id = ?").run(contractId);
  syncCustomerProgress(db, contract.customer_id);
  getContractResultNotifyUserIds(db, contractId, contract.created_by_id).forEach((userId) => {
    notifyUser(db, userId, "合同审批驳回", `合同「${contract.title}」被驳回${reason ? `：${reason}` : ""}`, `/projects/${contract.customer_id}?tab=contract`);
  });
}
