import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { syncCustomerProgress } from "@/lib/customerProgress";
import { getRequestIp, recordCustomerOperation } from "@/lib/operationLog";
import { canEditCustomers, canViewCustomers, customerBelongsToCompany, getAuthContext } from "@/lib/security/authorization";
const FOLLOWUP_SCENE_KEYS = new Set([
  "first_contact",
  "measure_invite",
  "after_measure",
  "after_quote",
  "deposit_contract",
  "silent_follow",
  "lost_recall",
]);

function attachFilesToFollowups(db: ReturnType<typeof getDb>, followups: any[]) {
  if (followups.length === 0) return followups;
  const ids = followups.map((item) => item.id).filter(Boolean);
  const placeholders = ids.map(() => "?").join(",");
  const files = db.prepare(`
    SELECT *
    FROM attachments
    WHERE followup_id IN (${placeholders})
    ORDER BY datetime(created_at) ASC, id ASC
  `).all(...ids) as any[];
  const filesByFollowup = new Map<string, any[]>();
  files.forEach((file) => {
    const list = filesByFollowup.get(file.followup_id) || [];
    list.push(file);
    filesByFollowup.set(file.followup_id, list);
  });
  return followups.map((item) => ({ ...item, attachments: filesByFollowup.get(item.id) || [] }));
}

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canViewCustomers(auth)) return NextResponse.json({ message: "没有客户跟进查看权限" }, { status: 403 });
  const db = getDb();
  const customerId = req.nextUrl.searchParams.get("customer_id");
  if (customerId) {
    if (!customerBelongsToCompany(auth, customerId)) return NextResponse.json({ message: "客户不存在" }, { status: 404 });
    const followups = db.prepare(`
      SELECT f.*, u.name as user_name, u.avatar as user_avatar,
        parent.user_id as reply_to_user_id, parent_user.name as reply_to_user_name, parent_user.avatar as reply_to_user_avatar
      FROM follow_ups f
      LEFT JOIN users u ON f.user_id = u.id
      LEFT JOIN follow_ups parent ON f.reply_to_id = parent.id
      LEFT JOIN users parent_user ON parent.user_id = parent_user.id
      WHERE f.customer_id = ?
      ORDER BY datetime(f.created_at) DESC, f.id DESC
    `).all(customerId);
    return NextResponse.json(attachFilesToFollowups(db, followups));
  }
  if (req.nextUrl.searchParams.get("scope") === "todo") {
    const userId = auth.userId;
    const user = db.prepare("SELECT name FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1").get(userId) as { name?: string | null } | undefined;
    const mentionText = `@${String(user?.name || "").trim()}`;
    const todoFollowups = db.prepare(`
      SELECT f.*, u.name as user_name, u.avatar as user_avatar, c.name as customer_name,
        parent.user_id as reply_to_user_id, parent_user.name as reply_to_user_name, parent_user.avatar as reply_to_user_avatar
      FROM follow_ups f
      LEFT JOIN users u ON f.user_id = u.id
      LEFT JOIN customers c ON f.customer_id = c.id
      LEFT JOIN follow_ups parent ON f.reply_to_id = parent.id
      LEFT JOIN users parent_user ON parent.user_id = parent_user.id
      WHERE c.company_id = ? AND f.deleted_at IS NULL
        AND (
          (? != '@' AND instr(COALESCE(f.content, ''), ?) > 0)
          OR (parent.user_id = ? AND f.user_id != ?)
        )
      ORDER BY f.created_at DESC, f.id DESC
    `).all(auth.companyId, mentionText, mentionText, userId, userId);
    return NextResponse.json(attachFilesToFollowups(db, todoFollowups));
  }
  const allFollowups = db.prepare(`
    SELECT f.*, u.name as user_name, u.avatar as user_avatar, c.name as customer_name,
      parent.user_id as reply_to_user_id, parent_user.name as reply_to_user_name, parent_user.avatar as reply_to_user_avatar
    FROM follow_ups f
    LEFT JOIN users u ON f.user_id = u.id
    LEFT JOIN customers c ON f.customer_id = c.id
    LEFT JOIN follow_ups parent ON f.reply_to_id = parent.id
    LEFT JOIN users parent_user ON parent.user_id = parent_user.id
    WHERE c.company_id = ? AND f.deleted_at IS NULL
    ORDER BY datetime(f.created_at) DESC, f.id DESC
  `).all(auth.companyId);
  return NextResponse.json(attachFilesToFollowups(db, allFollowups));
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canEditCustomers(auth)) return NextResponse.json({ message: "没有客户跟进权限" }, { status: 403 });
  try {
    const userId = auth.userId;

    const { customer_id, type, content, next_date, scene, reply_to_id, attachment_ids } = await req.json();
    const attachmentIds = Array.isArray(attachment_ids)
      ? Array.from(new Set(attachment_ids.map((item: any) => String(item || "").trim()).filter(Boolean))) as string[]
      : [];
    const trimmedContent = String(content || "").trim();
    const normalizedScene = typeof scene === "string" ? scene.trim() : "";
    if (!customer_id || !type || (!trimmedContent && attachmentIds.length === 0)) {
      return NextResponse.json({ message: "缺少必填字段" }, { status: 400 });
    }
    if (!customerBelongsToCompany(auth, String(customer_id))) return NextResponse.json({ message: "客户不存在" }, { status: 404 });
    if (normalizedScene && !FOLLOWUP_SCENE_KEYS.has(normalizedScene)) {
      return NextResponse.json({ message: "跟进场景无效" }, { status: 400 });
    }

    const db = getDb();
    if (reply_to_id) {
      const parent = db.prepare("SELECT id FROM follow_ups WHERE id = ? AND customer_id = ?").get(reply_to_id, customer_id);
      if (!parent) {
        return NextResponse.json({ message: "回复的跟进记录不存在" }, { status: 400 });
      }
    }

    const id = `FU${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    db.prepare(`
      INSERT INTO follow_ups (id, customer_id, user_id, reply_to_id, type, scene, content, next_date, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(id, customer_id, userId, reply_to_id || null, type, normalizedScene || null, trimmedContent || "上传附件", next_date || null);

    if (attachmentIds.length > 0) {
      const placeholders = attachmentIds.map(() => "?").join(",");
      db.prepare(`
        UPDATE attachments
        SET followup_id = ?
        WHERE id IN (${placeholders}) AND customer_id = ?
      `).run(id, ...attachmentIds, customer_id);
    }
    syncCustomerProgress(db, customer_id);
    recordCustomerOperation(db, {
      userId,
      customerId: customer_id,
      action: reply_to_id ? "customer.followup.reply" : "customer.followup.create",
      module: "跟进记录",
      title: reply_to_id ? "回复跟进记录" : `新增${type}跟进`,
      content: trimmedContent || (attachmentIds.length > 0 ? `上传了 ${attachmentIds.length} 个跟进附件` : "新增跟进记录"),
      metadata: { followupId: id, type, scene: normalizedScene || "", nextDate: next_date || "", attachmentCount: attachmentIds.length },
      ipAddress: getRequestIp(req),
    });

    const followup = db.prepare(`
      SELECT f.*, u.name as user_name, u.avatar as user_avatar
      FROM follow_ups f
      LEFT JOIN users u ON f.user_id = u.id
      WHERE f.id = ?
    `).get(id);
    return NextResponse.json(attachFilesToFollowups(db, followup ? [followup] : [])[0] || followup, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "创建失败" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canEditCustomers(auth)) return NextResponse.json({ message: "没有客户跟进权限" }, { status: 403 });
  try {
    const currentUserId = auth.userId;

    const id = req.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ message: "缺少跟进记录ID" }, { status: 400 });
    }

    const db = getDb();
    const followup = db.prepare(`
      SELECT f.id, f.customer_id, f.user_id, f.type, f.content
      FROM follow_ups f
      INNER JOIN customers c ON c.id = f.customer_id
      WHERE f.id = ? AND c.company_id = ? AND f.deleted_at IS NULL AND c.deleted_at IS NULL
    `).get(id, auth.companyId) as any;
    if (!followup) {
      return NextResponse.json({ message: "跟进记录不存在或已删除" }, { status: 404 });
    }
    if (followup.user_id !== currentUserId) {
      return NextResponse.json({ message: "只能删除自己发布的跟进记录" }, { status: 403 });
    }

    db.prepare("UPDATE follow_ups SET deleted_at = datetime('now') WHERE id = ?").run(id);
    syncCustomerProgress(db, followup.customer_id);
    recordCustomerOperation(db, {
      userId: currentUserId,
      customerId: followup.customer_id,
      action: "customer.followup.delete",
      module: "跟进记录",
      title: "删除跟进记录",
      content: `${followup.type || "跟进"}：${String(followup.content || "").slice(0, 80)}`,
      metadata: { followupId: id, type: followup.type || "" },
      ipAddress: getRequestIp(req),
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "删除失败" }, { status: 500 });
  }
}
