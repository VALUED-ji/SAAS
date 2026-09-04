import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuthContext } from "@/lib/security/authorization";
import {
  activateApprovedContract,
  ensureContractApprovalTables,
  rejectContract,
} from "@/lib/contractApproval";
import {
  approvalSignatureSelect,
  ensureSignatureTables,
  recordApprovalSignatureSnapshot,
} from "@/lib/signatures";

function makeId(prefix: string) {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function notifyUser(db: ReturnType<typeof getDb>, userId: string, title: string, content: string, linkUrl: string) {
  db.prepare(`
    INSERT INTO notifications (id, user_id, type, title, content, link_url, created_at)
    VALUES (?, ?, 'APPROVAL', ?, ?, ?, datetime('now'))
  `).run(makeId("NTF"), userId, title, content, linkUrl);
}

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "未登录" }, { status: 401 });

  const db = getDb();
  ensureContractApprovalTables(db);
  ensureSignatureTables(db);
  const items = db.prepare(`
    SELECT s.*, i.status as instance_status, i.flow_name, i.current_node_index,
      c.title as contract_title, c.contract_no, c.total_amount, c.signed_at, c.status as contract_status,
      customer.id as customer_id, customer.name as customer_name, customer.phone as customer_phone,
      project.name as project_name, project.address as project_address,
      creator.name as created_by_name,
      ${approvalSignatureSelect("contract")}
    FROM contract_approval_steps s
    INNER JOIN contract_approval_instances i ON s.instance_id = i.id
    INNER JOIN contracts c ON s.contract_id = c.id
    INNER JOIN projects project ON c.project_id = project.id
    INNER JOIN customers customer ON i.customer_id = customer.id
    LEFT JOIN users creator ON i.created_by_id = creator.id
    LEFT JOIN approval_signature_snapshots snapshot ON snapshot.approval_type = 'contract' AND snapshot.step_id = s.id
    WHERE s.approver_id = ?
      AND customer.company_id = ?
      AND s.deleted_at IS NULL
      AND i.deleted_at IS NULL
      AND c.deleted_at IS NULL
    ORDER BY CASE s.status WHEN 'pending' THEN 0 WHEN 'waiting' THEN 1 ELSE 2 END, s.created_at DESC
  `).all(auth.userId, auth.companyId);
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "未登录" }, { status: 401 });

  try {
    const body = await req.json();
    const id = String(body.id || "").trim();
    const action = String(body.action || "").trim();
    const comment = String(body.comment || "").trim();
    const signatureId = String(body.signature_id || "").trim();
    if (!id || !["approve", "reject"].includes(action)) return NextResponse.json({ message: "操作无效" }, { status: 400 });
    if (!signatureId) return NextResponse.json({ message: "请选择审批签名" }, { status: 400 });
    if (action === "reject" && !comment) return NextResponse.json({ message: "驳回时请填写审批意见" }, { status: 400 });

    const db = getDb();
    ensureContractApprovalTables(db);
    const step = db.prepare(`
      SELECT s.*, i.customer_id, i.flow_name, c.title as contract_title
      FROM contract_approval_steps s
      INNER JOIN contract_approval_instances i ON s.instance_id = i.id
      INNER JOIN contracts c ON s.contract_id = c.id
      INNER JOIN customers customer ON i.customer_id = customer.id
      WHERE s.id = ?
        AND s.approver_id = ?
        AND customer.company_id = ?
        AND s.status = 'pending'
        AND s.deleted_at IS NULL
        AND i.deleted_at IS NULL
        AND c.deleted_at IS NULL
    `).get(id, auth.userId, auth.companyId) as any;
    if (!step) return NextResponse.json({ message: "待审批合同不存在或当前不可处理" }, { status: 404 });

    if (action === "reject") {
      if (!step.can_reject) return NextResponse.json({ message: "当前节点不允许驳回" }, { status: 400 });
      const rejectTransaction = (db as any).transaction(() => {
        const update = db.prepare(`
          UPDATE contract_approval_steps
          SET status = 'rejected', comment = ?, action_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ? AND status = 'pending'
        `).run(comment || "驳回", id);
        if (update.changes !== 1) throw new Error("该审批已被处理，请刷新后查看");
        recordApprovalSignatureSnapshot(db, {
          approvalType: "contract",
          stepId: id,
          instanceId: step.instance_id,
          signatureId,
          companyId: auth.companyId,
          userId: auth.userId,
        });
        db.prepare(`
          UPDATE contract_approval_instances
          SET status = 'rejected', error_message = ?, updated_at = datetime('now'), completed_at = datetime('now')
          WHERE id = ?
        `).run(comment || "合同审批被驳回", step.instance_id);
        rejectContract(db, step.contract_id, comment);
      });
      rejectTransaction();
      return NextResponse.json({ success: true });
    }

    const approveTransaction = (db as any).transaction(() => {
      const update = db.prepare(`
        UPDATE contract_approval_steps
        SET status = 'approved', comment = ?, action_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ? AND status = 'pending'
      `).run(comment || "同意", id);
      if (update.changes !== 1) throw new Error("该审批已被处理，请刷新后查看");
      recordApprovalSignatureSnapshot(db, {
        approvalType: "contract",
        stepId: id,
        instanceId: step.instance_id,
        signatureId,
        companyId: auth.companyId,
        userId: auth.userId,
      });

    let currentNodeCompleted = false;
    if (step.approve_mode === "any") {
      db.prepare(`
        UPDATE contract_approval_steps
        SET status = 'skipped', updated_at = datetime('now')
        WHERE instance_id = ? AND sort_order = ? AND status = 'pending' AND deleted_at IS NULL
      `).run(step.instance_id, step.sort_order);
      currentNodeCompleted = true;
    } else {
      const sameNodePending = db.prepare(`
        SELECT COUNT(*) as count
        FROM contract_approval_steps
        WHERE instance_id = ? AND sort_order = ? AND status = 'pending' AND deleted_at IS NULL
      `).get(step.instance_id, step.sort_order) as any;
      currentNodeCompleted = Number(sameNodePending?.count || 0) === 0;
    }

    if (currentNodeCompleted) {
      const nextOrder = db.prepare(`
        SELECT MIN(sort_order) as sort_order
        FROM contract_approval_steps
        WHERE instance_id = ? AND sort_order > ? AND status = 'waiting' AND deleted_at IS NULL
      `).get(step.instance_id, step.sort_order) as any;
      if (nextOrder?.sort_order !== null && nextOrder?.sort_order !== undefined) {
        db.prepare(`
          UPDATE contract_approval_steps
          SET status = 'pending', updated_at = datetime('now')
          WHERE instance_id = ? AND sort_order = ? AND status = 'waiting' AND deleted_at IS NULL
        `).run(step.instance_id, nextOrder.sort_order);
        db.prepare("UPDATE contract_approval_instances SET current_node_index = ?, updated_at = datetime('now') WHERE id = ?")
          .run(nextOrder.sort_order, step.instance_id);
        const nextSteps = db.prepare(`
          SELECT approver_id, approver_name, node_name
          FROM contract_approval_steps
          WHERE instance_id = ? AND sort_order = ? AND status = 'pending' AND deleted_at IS NULL
        `).all(step.instance_id, nextOrder.sort_order) as any[];
        nextSteps.forEach((nextStep) => {
          notifyUser(db, nextStep.approver_id, "合同待审批", `合同「${step.contract_title}」已提交到「${nextStep.node_name}」，请及时审批。`, `/projects/${step.customer_id}?tab=contract`);
        });
      } else {
        db.prepare(`
          UPDATE contract_approval_instances
          SET status = 'approved', updated_at = datetime('now'), completed_at = datetime('now')
          WHERE id = ?
        `).run(step.instance_id);
        activateApprovedContract(db, step.contract_id);
      }
    }

    });
    approveTransaction();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "处理失败" }, { status: 500 });
  }
}
