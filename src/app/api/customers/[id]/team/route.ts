import { NextRequest, NextResponse } from "next/server";
import { ensureDesignerAssignmentSchema, getDb } from "@/lib/db";
import { normalizeCustomerStatus } from "@/lib/customerStatus";
import { getRequestIp, recordCustomerOperation, type OperationChange } from "@/lib/operationLog";
import { canAssignCustomers, canViewCustomers, customerBelongsToCompany, getAuthContext } from "@/lib/security/authorization";

function normalizeTeamRole(role: unknown) {
  return String(role || "").trim().toUpperCase();
}

function getTeamRoleLabel(role: string) {
  const labels: Record<string, string> = {
    ADVISOR: "家装顾问",
    DESIGNER: "设计师",
    PM: "项目经理",
    WORKER: "施工员",
  };
  return labels[normalizeTeamRole(role)] || role || "服务人员";
}

function formatTeamMemberNames(members: { user_name?: string | null }[]) {
  const names = members.map((member) => String(member.user_name || "").trim()).filter(Boolean);
  return names.length ? names.join("、") : "未分配";
}

function isCustomerContractSigned(db: ReturnType<typeof getDb>, customerId: string, companyId: string) {
  const row = db.prepare(`
    SELECT c.status,
      EXISTS (
        SELECT 1
        FROM contracts contract
        INNER JOIN projects p ON contract.project_id = p.id
        WHERE p.customer_id = c.id
          AND contract.deleted_at IS NULL
          AND UPPER(contract.status) IN ('SIGNED', 'RESIGNED')
      ) as has_signed_contract
    FROM customers c
    WHERE c.id = ? AND c.company_id = ? AND c.deleted_at IS NULL
    LIMIT 1
  `).get(customerId, companyId) as any;
  if (!row) return { signed: false, missing: true };
  return {
    signed: normalizeCustomerStatus(row.status) === "SIGNED" || Number(row.has_signed_contract || 0) === 1,
    missing: false,
  };
}

export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canViewCustomers(auth)) return NextResponse.json({ message: "没有客户查看权限" }, { status: 403 });
  if (!customerBelongsToCompany(auth, params.id)) return NextResponse.json({ message: "客户不存在" }, { status: 404 });
  const db = getDb();
  const team = db.prepare(`
    SELECT ct.*, u.name as user_name, u.avatar as user_avatar, u.role as user_role
    FROM customer_team ct
    LEFT JOIN users u ON ct.user_id = u.id
    WHERE ct.customer_id = ?
    ORDER BY ct.assigned_at
  `).all(params.id) as any[];
  const hasAdvisor = team.some((member) => normalizeTeamRole(member.role) === "ADVISOR");
  if (!hasAdvisor) {
    const advisor = db.prepare(`
      SELECT
        c.id as customer_id,
        COALESCE(inviter.id, creator.id) as user_id,
        COALESCE(inviter.name, creator.name) as user_name,
        COALESCE(inviter.avatar, creator.avatar) as user_avatar,
        COALESCE(inviter.role, creator.role) as user_role
      FROM customers c
      LEFT JOIN users inviter ON c.inviter_id = inviter.id
      LEFT JOIN users creator ON c.created_by_id = creator.id
      WHERE c.id = ?
    `).get(params.id) as any;
    if (advisor?.user_id) {
      team.unshift({
        id: `AUTO_ADVISOR_${params.id}`,
        customer_id: params.id,
        user_id: advisor.user_id,
        role: "ADVISOR",
        assigned_at: null,
        user_name: advisor.user_name,
        user_avatar: advisor.user_avatar,
        user_role: advisor.user_role,
        is_auto: 1,
      });
    }
  }
  return NextResponse.json(team);
}

export async function POST(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canAssignCustomers(auth)) return NextResponse.json({ message: "没有客户分配权限" }, { status: 403 });
  if (!customerBelongsToCompany(auth, params.id)) return NextResponse.json({ message: "客户不存在" }, { status: 404 });
  try {
    const { user_id, role } = await req.json();
    if (!user_id || !role) {
      return NextResponse.json({ message: "user_id and role are required" }, { status: 400 });
    }
    const normalizedRole = normalizeTeamRole(role);
    const db = getDb();
    const operatorId = auth.userId;
    const ipAddress = getRequestIp(req);
    if (normalizedRole === "ADVISOR") {
      const status = isCustomerContractSigned(db, params.id, auth.companyId);
      if (status.missing) return NextResponse.json({ message: "客户不存在" }, { status: 404 });
      if (status.signed) return NextResponse.json({ message: "客户已签约，家装顾问不允许修改" }, { status: 400 });
    }
    const user = db.prepare("SELECT id, name FROM users WHERE id = ? AND company_id = ? AND deleted_at IS NULL AND is_active = 1 LIMIT 1")
      .get(user_id, auth.companyId) as any;
    if (!user) return NextResponse.json({ message: "所选人员不存在或已停用" }, { status: 400 });
    if (normalizedRole === "DESIGNER") {
      ensureDesignerAssignmentSchema(db);
      const activeRequest = db.prepare(`
        SELECT id
        FROM designer_assignment_requests
        WHERE customer_id = ?
          AND deleted_at IS NULL
          AND status IN ('pending', 'pending_dispatch', 'pending_handler')
        LIMIT 1
      `).get(params.id) as { id?: string } | undefined;
      if (activeRequest?.id) {
        return NextResponse.json({ message: "该客户的设计师分配申请仍在处理中，请通过分配流程完成操作" }, { status: 409 });
      }
    }
    const previousMembers = db.prepare(`
      SELECT ct.user_id, u.name as user_name
      FROM customer_team ct
      LEFT JOIN users u ON u.id = ct.user_id
      WHERE ct.customer_id = ? AND UPPER(ct.role) = ?
    `).all(params.id, normalizedRole) as { user_id?: string | null; user_name?: string | null }[];
    // Upsert: remove existing assignment for this role, then add new one
    db.prepare("DELETE FROM customer_team WHERE customer_id = ? AND UPPER(role) = ?").run(params.id, normalizedRole);
    const id = `CT${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    db.prepare("INSERT INTO customer_team (id, customer_id, user_id, role) VALUES (?, ?, ?, ?)").run(id, params.id, user_id, normalizedRole);
    if (normalizedRole === "ADVISOR") {
      db.prepare("UPDATE customers SET inviter_id = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?")
        .run(user_id, params.id, auth.companyId);
    }
    const member = db.prepare("SELECT ct.*, u.name as user_name, u.avatar as user_avatar, u.role as user_role FROM customer_team ct LEFT JOIN users u ON ct.user_id = u.id WHERE ct.id = ?").get(id);
    const roleLabel = getTeamRoleLabel(normalizedRole);
    const changes: OperationChange[] = [{
      label: roleLabel,
      before: formatTeamMemberNames(previousMembers),
      after: user.name || "未命名人员",
    }];
    recordCustomerOperation(db, {
      userId: operatorId,
      customerId: params.id,
      action: "customer.team.assign",
      module: "服务团队",
      title: `分配${roleLabel}`,
      content: `${roleLabel}由「${changes[0].before}」调整为「${changes[0].after}」`,
      targetName: user.name || "",
      changes,
      metadata: { role: normalizedRole, userId: user_id, previousUserIds: previousMembers.map((member) => member.user_id).filter(Boolean) },
      ipAddress,
    });
    return NextResponse.json(member, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "操作失败" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canAssignCustomers(auth)) return NextResponse.json({ message: "没有客户分配权限" }, { status: 403 });
  if (!customerBelongsToCompany(auth, params.id)) return NextResponse.json({ message: "客户不存在" }, { status: 404 });
  try {
    const role = req.nextUrl.searchParams.get("role");
    if (!role) return NextResponse.json({ message: "role is required" }, { status: 400 });
    const db = getDb();
    const operatorId = auth.userId;
    const ipAddress = getRequestIp(req);
    const normalizedRole = normalizeTeamRole(role);
    if (normalizedRole === "ADVISOR") {
      const status = isCustomerContractSigned(db, params.id, auth.companyId);
      if (status.missing) return NextResponse.json({ message: "客户不存在" }, { status: 404 });
      if (status.signed) return NextResponse.json({ message: "客户已签约，家装顾问不允许修改" }, { status: 400 });
      return NextResponse.json({ message: "家装顾问请通过修改更换人员" }, { status: 400 });
    }
    const removedMembers = db.prepare(`
      SELECT ct.user_id, u.name as user_name
      FROM customer_team ct
      LEFT JOIN users u ON u.id = ct.user_id
      WHERE ct.customer_id = ? AND UPPER(ct.role) = ?
    `).all(params.id, normalizedRole) as any[];
    db.prepare("DELETE FROM customer_team WHERE customer_id = ? AND UPPER(role) = ?").run(params.id, normalizedRole);
    const roleLabel = getTeamRoleLabel(normalizedRole);
    const previousNames = formatTeamMemberNames(removedMembers);
    const changes: OperationChange[] = [{
      label: roleLabel,
      before: previousNames,
      after: "未分配",
    }];
    recordCustomerOperation(db, {
      userId: operatorId,
      customerId: params.id,
      action: "customer.team.remove",
      module: "服务团队",
      title: `移除${roleLabel}`,
      content: removedMembers.length
        ? `移除了${roleLabel}：${previousNames}`
        : `清空了${roleLabel}`,
      changes,
      metadata: { role: normalizedRole, userIds: removedMembers.map((member) => member.user_id).filter(Boolean) },
      ipAddress,
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "操作失败" }, { status: 500 });
  }
}
