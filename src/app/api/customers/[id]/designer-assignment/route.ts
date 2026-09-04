import { NextRequest, NextResponse } from "next/server";
import { ensureDesignerAssignmentSchema, getDb } from "@/lib/db";
import { getBranchSettingsForCustomer, getCustomerBranchScope } from "@/lib/branchSettingsLookup";
import { resolveDesignerAssignmentDispatchers } from "@/lib/designerAssignmentDispatchers";
import { getRequestIp, recordCustomerOperation } from "@/lib/operationLog";
import { canViewCustomers, customerBelongsToCompany, getAuthContext } from "@/lib/security/authorization";

type Db = ReturnType<typeof getDb>;
type WorkflowMode = "approval" | "dispatch";
type AssignmentRequestRow = {
  id: string;
  customer_id: string;
  store_id?: string | null;
  approver_id?: string | null;
  requester_id?: string | null;
  preferred_designer_id?: string | null;
  request_group_id?: string | null;
  workflow_mode?: string | null;
  dispatcher_source?: string | null;
  dispatcher_label?: string | null;
  handler_id?: string | null;
  dispatched_by_id?: string | null;
  dispatched_at?: string | null;
  status?: string | null;
  assigned_user_id?: string | null;
  resolved_by_id?: string | null;
  created_at?: string | null;
  resolved_at?: string | null;
  customer_name?: string | null;
};

function makeId(prefix: string) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function createWorkflowError(message: string, status: number) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

function runInTransaction<T>(db: Db, callback: () => T): T {
  db.prepare("BEGIN IMMEDIATE").run();
  try {
    const result = callback();
    db.prepare("COMMIT").run();
    return result;
  } catch (error) {
    try {
      db.prepare("ROLLBACK").run();
    } catch {
      // The transaction may already have been rolled back by SQLite after a failed statement.
    }
    throw error;
  }
}

function getWorkflowMode(row?: Pick<AssignmentRequestRow, "workflow_mode"> | null): WorkflowMode {
  return row?.workflow_mode === "dispatch" ? "dispatch" : "approval";
}

function getActiveRequests(db: Db, customerId: string) {
  return db.prepare(`
    SELECT r.*, c.name as customer_name
    FROM designer_assignment_requests r
    LEFT JOIN customers c ON c.id = r.customer_id
    WHERE r.customer_id = ?
      AND r.deleted_at IS NULL
      AND r.status IN ('pending', 'pending_dispatch', 'pending_handler')
    ORDER BY r.created_at ASC, r.id ASC
  `).all(customerId) as AssignmentRequestRow[];
}

function getActiveApproverSummary(db: Db, customerId: string, currentUserId?: string | null) {
  const rows = db.prepare(`
    SELECT DISTINCT r.approver_id as id, approver.name
    FROM designer_assignment_requests r
    LEFT JOIN users approver ON r.approver_id = approver.id
    WHERE r.customer_id = ?
      AND r.status IN ('pending', 'pending_dispatch')
      AND r.deleted_at IS NULL
    ORDER BY
      CASE WHEN r.approver_id = ? THEN 0 ELSE 1 END,
      r.created_at ASC
  `).all(customerId, currentUserId || "") as { id?: string | null; name?: string | null }[];
  const seen = new Set<string>();
  const approvers = rows
    .filter((row) => {
      const id = String(row.id || "").trim();
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((row) => ({
      id: String(row.id || "").trim(),
      name: String(row.name || "派单处理人").trim() || "派单处理人",
    }));

  return {
    approver_ids: approvers.map((approver) => approver.id),
    approver_names: approvers.map((approver) => approver.name),
    approver_count: approvers.length,
    approver_name: approvers.map((approver) => approver.name).join("、"),
  };
}

function getRequestDetail(db: Db, customerId: string, currentUserId?: string | null) {
  const request = db.prepare(`
    SELECT r.*, c.name as customer_name, c.service_store, s.name as store_name,
      requester.name as requester_name, approver.name as approver_name,
      preferred.name as preferred_designer_name, assignee.name as assigned_user_name,
      handler.name as handler_name, dispatcher.name as dispatched_by_name,
      resolver.name as resolved_by_name
    FROM designer_assignment_requests r
    LEFT JOIN customers c ON r.customer_id = c.id
    LEFT JOIN org_units s ON r.store_id = s.id
    LEFT JOIN users requester ON r.requester_id = requester.id
    LEFT JOIN users approver ON r.approver_id = approver.id
    LEFT JOIN users preferred ON r.preferred_designer_id = preferred.id
    LEFT JOIN users assignee ON r.assigned_user_id = assignee.id
    LEFT JOIN users handler ON r.handler_id = handler.id
    LEFT JOIN users dispatcher ON r.dispatched_by_id = dispatcher.id
    LEFT JOIN users resolver ON r.resolved_by_id = resolver.id
    WHERE r.customer_id = ? AND r.deleted_at IS NULL
    ORDER BY
      CASE
        WHEN r.status = 'pending_handler' AND r.handler_id = ? THEN 0
        WHEN r.status IN ('pending', 'pending_dispatch') AND r.approver_id = ? THEN 0
        WHEN r.status IN ('pending', 'pending_dispatch', 'pending_handler') THEN 1
        ELSE 2
      END,
      r.created_at DESC
    LIMIT 1
  `).get(customerId, currentUserId || "", currentUserId || "") as any;
  if (!request) return null;

  const requestWithDispatcher = {
    ...request,
    dispatcher_source: request.dispatcher_source || "store_manager",
    dispatcher_label: request.dispatcher_label || "客户所属门店负责人",
  };

  if (["pending", "pending_dispatch"].includes(String(request.status || ""))) {
    const approverSummary = getActiveApproverSummary(db, customerId, currentUserId);
    return {
      ...requestWithDispatcher,
      approver_name: approverSummary.approver_name || requestWithDispatcher.approver_name,
      approver_ids: approverSummary.approver_ids,
      approver_names: approverSummary.approver_names,
      approver_count: approverSummary.approver_count,
    };
  }
  return requestWithDispatcher;
}

function findActiveBranchEmployee(db: Db, customerId: string, userId: string, requiredRole?: string) {
  const scope = getCustomerBranchScope(db, customerId);
  if ("error" in scope) return scope;
  const placeholders = scope.orgIds.map(() => "?").join(",");
  const whereRole = requiredRole ? "AND UPPER(u.role) = ?" : "";
  const user = db.prepare(`
    SELECT u.id, u.name, u.role, u.org_unit_id
    FROM users u
    WHERE u.id = ?
      AND u.company_id = ?
      AND u.deleted_at IS NULL
      AND COALESCE(u.is_active, 1) = 1
      AND u.org_unit_id IN (${placeholders})
      ${whereRole}
    LIMIT 1
  `).get(userId, scope.customer.company_id, ...scope.orgIds, ...(requiredRole ? [requiredRole] : [])) as { id: string; name?: string | null; role?: string | null } | undefined;
  if (!user) return { error: requiredRole === "DESIGNER" ? "所选设计师不在客户所属分公司或已停用" : "所选处理人不在客户所属分公司或已停用" };
  return { user, scope };
}

function notify(db: Db, userId: string, title: string, content: string, customerId: string) {
  db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, content, link_url, created_at)
    VALUES (?, ?, 'APPROVAL', ?, ?, ?, datetime('now'))
  `).run(makeId("NTF"), userId, title, content, `/projects/${customerId}`);
}

function assertManagerCanHandle(rows: AssignmentRequestRow[], userId: string) {
  if (!rows.some((row) => String(row.approver_id || "") === userId)) {
    throw createWorkflowError("当前设计师分配申请不由你处理", 403);
  }
}

function assertAssignmentPermission(rows: AssignmentRequestRow[], userId: string) {
  const workflowMode = getWorkflowMode(rows[0]);
  const status = String(rows[0]?.status || "");
  if (workflowMode === "approval") {
    assertManagerCanHandle(rows, userId);
    return { workflowMode, status };
  }
  if (status === "pending_dispatch") {
    assertManagerCanHandle(rows, userId);
    return { workflowMode, status };
  }
  if (status === "pending_handler") {
    if (!rows.some((row) => String(row.handler_id || "") === userId)) {
      throw createWorkflowError("该申请已分派给指定处理人，当前无权分配设计师", 403);
    }
    return { workflowMode, status };
  }
  throw createWorkflowError("当前申请状态不能分配设计师", 409);
}

export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canViewCustomers(auth)) return NextResponse.json({ message: "没有客户查看权限" }, { status: 403 });
  if (!customerBelongsToCompany(auth, params.id)) return NextResponse.json({ message: "客户不存在" }, { status: 404 });

  const db = getDb();
  ensureDesignerAssignmentSchema(db);
  return NextResponse.json({ request: getRequestDetail(db, params.id, auth.userId) });
}

export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  try {
    const auth = getAuthContext(req);
    if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
    if (!canViewCustomers(auth)) return NextResponse.json({ message: "没有客户查看权限" }, { status: 403 });
    if (!customerBelongsToCompany(auth, params.id)) return NextResponse.json({ message: "客户不存在" }, { status: 404 });

    const db = getDb();
    ensureDesignerAssignmentSchema(db);
    const requesterId = auth.userId;

    const body = await req.json().catch(() => ({}));
    const preferredDesignerId = String(body.preferred_designer_id || "").trim();
    const branchSettings = getBranchSettingsForCustomer(db, params.id).settings;
    if (branchSettings.businessRules.designerAssignmentMode === "direct") {
      return NextResponse.json({ message: "当前门店已启用直接分配设计师，无需发起申请" }, { status: 400 });
    }
    const workflowMode: WorkflowMode = branchSettings.businessRules.designerAssignmentMode === "dispatch" ? "dispatch" : "approval";
    const dispatchers = resolveDesignerAssignmentDispatchers(
      db,
      params.id,
      branchSettings.businessRules.designerAssignmentDispatcher,
    );
    if ("error" in dispatchers) return NextResponse.json({ message: dispatchers.error }, { status: 400 });
    const dispatcherLabel = dispatchers.label;
    const preferred = preferredDesignerId
      ? findActiveBranchEmployee(db, params.id, preferredDesignerId, "DESIGNER")
      : null;
    if (preferred && "error" in preferred) return NextResponse.json({ message: preferred.error }, { status: 400 });

    const outcome = runInTransaction(db, () => {
      const existing = getActiveRequests(db, params.id);
      if (existing.length) return { existing: true };

      const requestGroupId = makeId("DARG");
      const status = workflowMode === "dispatch" ? "pending_dispatch" : "pending";
      const workflowLabel = workflowMode === "dispatch" ? `待${dispatcherLabel}分派` : `待${dispatcherLabel}分配设计师`;
      dispatchers.users.forEach((dispatcher) => {
        db.prepare(`
          INSERT INTO designer_assignment_requests (
            id, request_group_id, customer_id, store_id, approver_id, requester_id,
            preferred_designer_id, workflow_mode, dispatcher_source, dispatcher_label, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).run(
          makeId("DAR"),
          requestGroupId,
          params.id,
          dispatchers.store.id,
          dispatcher.id,
          requesterId,
          preferred && "user" in preferred ? preferred.user.id : null,
          workflowMode,
          dispatchers.source,
          dispatcherLabel,
          status,
        );
        notify(
          db,
          dispatcher.id,
          workflowMode === "dispatch" ? "待分派设计师" : "待分配设计师",
          workflowMode === "dispatch"
            ? `客户「${dispatchers.customer.name}」申请分配设计师。你因「${dispatcherLabel}」被设置为本次派单处理人，可直接分配设计师或先分派处理人${preferred && "user" in preferred ? `。意向设计师：${preferred.user.name || "未命名设计师"}` : ""}`
            : `客户「${dispatchers.customer.name}」申请分配设计师。你因「${dispatcherLabel}」被设置为本次派单处理人，请完成设计师分配${preferred && "user" in preferred ? `。意向设计师：${preferred.user.name || "未命名设计师"}` : ""}`,
          params.id,
        );
      });
      recordCustomerOperation(db, {
        userId: requesterId,
        customerId: params.id,
        action: "customer.designer_assignment.request",
        module: "服务团队",
        title: "申请分配设计师",
        content: workflowMode === "dispatch" ? `已提交申请，等待${dispatcherLabel}分派处理人或直接分配设计师` : `已提交申请，等待${dispatcherLabel}分配设计师`,
        changes: [{
          label: "设计师分配流程",
          before: "未发起",
          after: workflowLabel,
        }],
        metadata: {
          workflowMode,
          dispatcherSource: dispatchers.source,
          dispatcherLabel,
          preferredDesignerId: preferred && "user" in preferred ? preferred.user.id : null,
          approverIds: dispatchers.users.map((dispatcher) => dispatcher.id),
        },
        ipAddress: getRequestIp(req),
      });
      return { existing: false };
    });

    const request = getRequestDetail(db, params.id, requesterId);
    return NextResponse.json({ request }, { status: outcome.existing ? 200 : 201 });
  } catch (err: any) {
    const status = Number(err?.status || 500);
    return NextResponse.json({ message: status < 500 ? err.message : "申请失败" }, { status });
  }
}

export async function PATCH(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  try {
    const auth = getAuthContext(req);
    if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
    if (!canViewCustomers(auth)) return NextResponse.json({ message: "没有客户查看权限" }, { status: 403 });
    if (!customerBelongsToCompany(auth, params.id)) return NextResponse.json({ message: "客户不存在" }, { status: 404 });

    const db = getDb();
    ensureDesignerAssignmentSchema(db);
    const operatorId = auth.userId;

    const operator = db.prepare("SELECT id, name FROM users WHERE id = ? AND company_id = ? AND deleted_at IS NULL AND COALESCE(is_active, 1) = 1").get(operatorId, auth.companyId) as { id: string; name?: string | null } | undefined;
    if (!operator) return NextResponse.json({ message: "当前账号已停用，不能处理申请" }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "").trim();

    if (action === "dispatch_handler") {
      const handlerId = String(body.handler_id || "").trim();
      if (!handlerId) return NextResponse.json({ message: "请选择处理人" }, { status: 400 });
      const activeDispatcher = findActiveBranchEmployee(db, params.id, operatorId);
      if ("error" in activeDispatcher) return NextResponse.json({ message: "当前派单处理人已不在客户所属分公司或已停用，无法继续办理" }, { status: 403 });
      const handler = findActiveBranchEmployee(db, params.id, handlerId);
      if ("error" in handler) return NextResponse.json({ message: handler.error }, { status: 400 });

      runInTransaction(db, () => {
        const rows = getActiveRequests(db, params.id);
        if (!rows.length) throw createWorkflowError("当前没有待处理的设计师分配申请", 409);
        if (getWorkflowMode(rows[0]) !== "dispatch" || String(rows[0].status || "") !== "pending_dispatch") {
          throw createWorkflowError("当前申请不能再分派处理人", 409);
        }
        assertManagerCanHandle(rows, operatorId);
        const dispatcherLabel = String(rows[0]?.dispatcher_label || "客户所属门店负责人");
        const customerName = String(rows[0]?.customer_name || "未知客户");

        const updated = db.prepare(`
          UPDATE designer_assignment_requests
          SET status = 'pending_handler', handler_id = ?, dispatched_by_id = ?, dispatched_at = datetime('now')
          WHERE customer_id = ?
            AND deleted_at IS NULL
            AND workflow_mode = 'dispatch'
            AND status = 'pending_dispatch'
        `).run(handler.user.id, operatorId, params.id);
        if (updated.changes === 0) throw createWorkflowError("申请状态已变化，请刷新后重试", 409);

        if (handler.user.id !== operatorId) {
          notify(
            db,
            handler.user.id,
            "待分配设计师",
            `派单处理人「${operator.name || "未命名人员"}」已将客户「${customerName}」的设计师分配事项交由你处理，请及时分配设计师。`,
            params.id,
          );
        }
        recordCustomerOperation(db, {
          userId: operatorId,
          customerId: params.id,
          action: "customer.designer_assignment.dispatch",
          module: "服务团队",
          title: "分派设计师处理人",
          content: `将设计师分配事项交由「${handler.user.name || "未命名人员"}」处理`,
          targetName: handler.user.name || "",
          changes: [
            { label: "处理人", before: "未分派", after: handler.user.name || "未命名人员" },
            { label: "设计师分配流程", before: `待${dispatcherLabel}分派`, after: "待处理人分配设计师" },
          ],
          metadata: {
            handlerId: handler.user.id,
            workflowMode: "dispatch",
            dispatcherSource: rows[0]?.dispatcher_source || "store_manager",
            dispatcherLabel,
          },
          ipAddress: getRequestIp(req),
        });
      });

      return NextResponse.json({ request: getRequestDetail(db, params.id, operatorId) });
    }

    if (action === "assign_designer") {
      const designerId = String(body.designer_id || "").trim();
      if (!designerId) return NextResponse.json({ message: "请选择设计师" }, { status: 400 });
      const designer = findActiveBranchEmployee(db, params.id, designerId, "DESIGNER");
      if ("error" in designer) return NextResponse.json({ message: designer.error }, { status: 400 });

      runInTransaction(db, () => {
        const rows = getActiveRequests(db, params.id);
        if (!rows.length) throw createWorkflowError("当前没有待处理的设计师分配申请", 409);
        const { workflowMode, status } = assertAssignmentPermission(rows, operatorId);
        const dispatcherLabel = String(rows[0]?.dispatcher_label || "客户所属门店负责人");
        if (workflowMode === "dispatch" && status === "pending_handler") {
          const activeHandler = findActiveBranchEmployee(db, params.id, operatorId);
          if ("error" in activeHandler) throw createWorkflowError("指定处理人已不在客户所属分公司或已停用，无法继续办理", 403);
        } else {
          const activeDispatcher = findActiveBranchEmployee(db, params.id, operatorId);
          if ("error" in activeDispatcher) throw createWorkflowError("当前派单处理人已不在客户所属分公司或已停用，无法继续办理", 403);
        }
        const customerName = String(rows[0].customer_name || "未知客户");
        const previousMembers = db.prepare(`
          SELECT u.name as user_name
          FROM customer_team ct
          LEFT JOIN users u ON u.id = ct.user_id
          WHERE ct.customer_id = ? AND UPPER(ct.role) = 'DESIGNER'
        `).all(params.id) as { user_name?: string | null }[];
        const previousName = previousMembers.map((member) => String(member.user_name || "").trim()).filter(Boolean).join("、") || "未分配";

        db.prepare("DELETE FROM customer_team WHERE customer_id = ? AND UPPER(role) = 'DESIGNER'").run(params.id);
        db.prepare("INSERT INTO customer_team (id, customer_id, user_id, role) VALUES (?, ?, ?, 'DESIGNER')")
          .run(makeId("CT"), params.id, designer.user.id);
        const updated = db.prepare(`
          UPDATE designer_assignment_requests
          SET status = 'completed', assigned_user_id = ?, resolved_by_id = ?, resolved_at = datetime('now')
          WHERE customer_id = ?
            AND deleted_at IS NULL
            AND status IN ('pending', 'pending_dispatch', 'pending_handler')
        `).run(designer.user.id, operatorId, params.id);
        if (updated.changes === 0) throw createWorkflowError("申请状态已变化，请刷新后重试", 409);

        const notifyIds = new Set<string>();
        rows.forEach((row) => {
          [row.requester_id, row.dispatched_by_id].forEach((id) => {
            const value = String(id || "").trim();
            if (value && value !== operatorId) notifyIds.add(value);
          });
        });
        notifyIds.forEach((userId) => {
          notify(
            db,
            userId,
            "设计师分配完成",
            `客户「${customerName}」已分配设计师「${designer.user.name || "未命名设计师"}」。`,
            params.id,
          );
        });
        recordCustomerOperation(db, {
          userId: operatorId,
          customerId: params.id,
          action: "customer.designer_assignment.complete",
          module: "服务团队",
          title: "完成设计师分配",
          content: `由「${operator.name || "未命名人员"}」将设计师由「${previousName}」分配为「${designer.user.name || "未命名设计师"}」`,
          targetName: designer.user.name || "",
          changes: [
            { label: "设计师", before: previousName, after: designer.user.name || "未命名设计师" },
            {
              label: "设计师分配流程",
              before: workflowMode === "dispatch"
                ? status === "pending_handler" ? "待处理人分配设计师" : `待${dispatcherLabel}分派`
                : `待${dispatcherLabel}分配设计师`,
              after: "已完成",
            },
          ],
          metadata: {
            workflowMode,
            status,
            designerId: designer.user.id,
            dispatcherSource: rows[0]?.dispatcher_source || "store_manager",
            dispatcherLabel,
          },
          ipAddress: getRequestIp(req),
        });
      });

      const member = db.prepare(`
        SELECT ct.*, u.name as user_name, u.avatar as user_avatar, u.role as user_role
        FROM customer_team ct
        LEFT JOIN users u ON ct.user_id = u.id
        WHERE ct.customer_id = ? AND UPPER(ct.role) = 'DESIGNER'
        LIMIT 1
      `).get(params.id);
      return NextResponse.json({ request: getRequestDetail(db, params.id, operatorId), member });
    }

    return NextResponse.json({ message: "不支持的操作" }, { status: 400 });
  } catch (err: any) {
    const status = Number(err?.status || 500);
    return NextResponse.json({ message: status < 500 ? err.message : "操作失败" }, { status });
  }
}
