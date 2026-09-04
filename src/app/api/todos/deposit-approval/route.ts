import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getAuthContext } from "@/lib/security/authorization";
import {
  approveDeposit,
  ensureDepositApprovalTables,
  notifyDepositApprovalUser,
  rejectDeposit,
} from "@/lib/depositApproval";
import { approvalSignatureSelect, ensureSignatureTables, recordApprovalSignatureSnapshot } from "@/lib/signatures";

function getPaymentLabel(record: any) {
  return String(record?.record_type || "") === "design_fee" ? "设计费" : "定金";
}

function getDepositApprovalActionLabel(record: any) {
  const label = getPaymentLabel(record);
  if (record?.approval_kind === "top_up") return `补收${label}`;
  if (record?.approval_kind === "waiver") return `${label}尾款减免`;
  return label;
}

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "未登录" }, { status: 401 });

  const db = getDb();
  ensureDepositApprovalTables(db);
  ensureSignatureTables(db);
  const items = db.prepare(`
    SELECT s.*, i.status as instance_status, i.flow_name, i.current_node_index,
      i.approval_kind, i.approval_amount, i.approval_meta,
      d.amount, d.received_at, d.method, d.payment_channel, d.record_type, d.deposit_type, d.receiver_name,
      d.voucher_url, d.notes, d.status as deposit_status,
      customer.id as customer_id, customer.name as customer_name, customer.phone as customer_phone,
      customer.address as customer_address, customer.house_address,
      branch.name as branch_name,
      creator.name as created_by_name,
      ${approvalSignatureSelect("deposit")}
    FROM deposit_approval_steps s
    INNER JOIN deposit_approval_instances i ON s.instance_id = i.id
    INNER JOIN customer_deposit_records d ON s.deposit_id = d.id
    INNER JOIN customers customer ON i.customer_id = customer.id
    LEFT JOIN org_units branch ON d.branch_org_unit_id = branch.id
    LEFT JOIN users creator ON i.created_by_id = creator.id
    LEFT JOIN approval_signature_snapshots snapshot ON snapshot.approval_type = 'deposit' AND snapshot.step_id = s.id
    WHERE s.approver_id = ?
      AND customer.company_id = ?
      AND s.deleted_at IS NULL
      AND i.deleted_at IS NULL
      AND d.deleted_at IS NULL
      AND customer.deleted_at IS NULL
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
    ensureDepositApprovalTables(db);
    const step = db.prepare(`
      SELECT s.*, i.customer_id, i.flow_name, i.approval_kind, i.approval_amount, i.approval_meta,
        d.amount, d.record_type, d.deposit_type, customer.name as customer_name
      FROM deposit_approval_steps s
      INNER JOIN deposit_approval_instances i ON s.instance_id = i.id
      INNER JOIN customer_deposit_records d ON s.deposit_id = d.id
      INNER JOIN customers customer ON i.customer_id = customer.id
      WHERE s.id = ?
        AND s.approver_id = ?
        AND customer.company_id = ?
        AND s.status = 'pending'
        AND s.deleted_at IS NULL
        AND i.deleted_at IS NULL
        AND d.deleted_at IS NULL
        AND customer.deleted_at IS NULL
    `).get(id, auth.userId, auth.companyId) as any;
    if (!step) return NextResponse.json({ message: "待审批款项不存在或当前不可处理" }, { status: 404 });

    if (action === "reject") {
      if (!step.can_reject) return NextResponse.json({ message: "当前节点不允许驳回" }, { status: 400 });
      const tx = (db as any).transaction(() => {
        const update = db.prepare(`
          UPDATE deposit_approval_steps
          SET status = 'rejected', comment = ?, action_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ? AND status = 'pending'
        `).run(comment || "驳回", id);
        if (update.changes !== 1) throw new Error("该审批已被处理，请刷新后查看");
        recordApprovalSignatureSnapshot(db, {
          approvalType: "deposit",
          stepId: id,
          instanceId: step.instance_id,
          signatureId,
          companyId: auth.companyId,
          userId: auth.userId,
        });
        db.prepare(`
          UPDATE deposit_approval_steps
          SET status = 'skipped', updated_at = datetime('now')
          WHERE instance_id = ? AND id <> ? AND status IN ('pending', 'waiting') AND deleted_at IS NULL
        `).run(step.instance_id, id);
        db.prepare(`
          UPDATE deposit_approval_instances
          SET status = 'rejected', error_message = ?, updated_at = datetime('now'), completed_at = datetime('now')
          WHERE id = ?
        `).run(comment || `${getPaymentLabel(step)}审批被驳回`, step.instance_id);
        rejectDeposit(db, step.deposit_id, comment);
      });
      tx();
      return NextResponse.json({ success: true });
    }

    const tx = (db as any).transaction(() => {
      const update = db.prepare(`
        UPDATE deposit_approval_steps
        SET status = 'approved', comment = ?, action_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ? AND status = 'pending'
      `).run(comment || "同意", id);
      if (update.changes !== 1) throw new Error("该审批已被处理，请刷新后查看");
      recordApprovalSignatureSnapshot(db, {
        approvalType: "deposit",
        stepId: id,
        instanceId: step.instance_id,
        signatureId,
        companyId: auth.companyId,
        userId: auth.userId,
      });

      let currentNodeCompleted = false;
      if (step.approve_mode === "any") {
        db.prepare(`
          UPDATE deposit_approval_steps
          SET status = 'skipped', updated_at = datetime('now')
          WHERE instance_id = ? AND sort_order = ? AND status = 'pending' AND deleted_at IS NULL
        `).run(step.instance_id, step.sort_order);
        currentNodeCompleted = true;
      } else {
        const sameNodePending = db.prepare(`
          SELECT COUNT(*) as count
          FROM deposit_approval_steps
          WHERE instance_id = ? AND sort_order = ? AND status = 'pending' AND deleted_at IS NULL
        `).get(step.instance_id, step.sort_order) as any;
        currentNodeCompleted = Number(sameNodePending?.count || 0) === 0;
      }

      if (currentNodeCompleted) {
        const nextOrder = db.prepare(`
          SELECT MIN(sort_order) as sort_order
          FROM deposit_approval_steps
          WHERE instance_id = ? AND sort_order > ? AND status = 'waiting' AND deleted_at IS NULL
        `).get(step.instance_id, step.sort_order) as any;
        if (nextOrder?.sort_order !== null && nextOrder?.sort_order !== undefined) {
          db.prepare(`
            UPDATE deposit_approval_steps
            SET status = 'pending', updated_at = datetime('now')
            WHERE instance_id = ? AND sort_order = ? AND status = 'waiting' AND deleted_at IS NULL
          `).run(step.instance_id, nextOrder.sort_order);
          db.prepare("UPDATE deposit_approval_instances SET current_node_index = ?, updated_at = datetime('now') WHERE id = ?")
            .run(nextOrder.sort_order, step.instance_id);
          const nextSteps = db.prepare(`
            SELECT approver_id, node_name
            FROM deposit_approval_steps
            WHERE instance_id = ? AND sort_order = ? AND status = 'pending' AND deleted_at IS NULL
          `).all(step.instance_id, nextOrder.sort_order) as any[];
          nextSteps.forEach((nextStep) => {
            const actionLabel = getDepositApprovalActionLabel(step);
            notifyDepositApprovalUser(
              db,
              nextStep.approver_id,
              `${actionLabel}待审批`,
              `客户「${step.customer_name}」的${actionLabel}已提交到「${nextStep.node_name}」，请及时审批。`,
              `/projects/${step.customer_id}?tab=deposit`,
            );
          });
        } else {
          db.prepare(`
            UPDATE deposit_approval_instances
            SET status = 'approved', updated_at = datetime('now'), completed_at = datetime('now')
            WHERE id = ?
          `).run(step.instance_id);
          approveDeposit(db, step.deposit_id);
        }
      }
    });
    tx();

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "处理失败" }, { status: 500 });
  }
}
