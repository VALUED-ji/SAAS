import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureOperationLogSchema } from "@/lib/operationLog";
import { canViewCustomers, customerBelongsToCompany, getAuthContext } from "@/lib/security/authorization";

type CompletionRow = {
  operator_name?: string | null;
  completed_at?: string | null;
};

function toCompletion(stage: string, source: string, row?: CompletionRow) {
  const completedAt = String(row?.completed_at || "").trim();
  return {
    stage,
    completed: Boolean(completedAt),
    operator_name: completedAt ? String(row?.operator_name || "未知用户") : "",
    completed_at: completedAt || null,
    source,
  };
}

export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canViewCustomers(auth)) return NextResponse.json({ message: "没有客户查看权限" }, { status: 403 });
  if (!customerBelongsToCompany(auth, params.id)) return NextResponse.json({ message: "客户不存在" }, { status: 404 });

  const db = getDb();
  ensureOperationLogSchema(db);

  const created = db.prepare(`
    SELECT creator.name AS operator_name, c.created_at AS completed_at
    FROM customers c
    LEFT JOIN users creator ON creator.id = c.created_by_id
    WHERE c.id = ? AND c.company_id = ? AND c.deleted_at IS NULL
    LIMIT 1
  `).get(params.id, auth.companyId) as CompletionRow | undefined;

  const contacted = db.prepare(`
    SELECT operator.name AS operator_name, follow.created_at AS completed_at
    FROM follow_ups follow
    LEFT JOIN users operator ON operator.id = follow.user_id
    WHERE follow.customer_id = ? AND follow.deleted_at IS NULL
    ORDER BY datetime(follow.created_at) ASC, follow.id ASC
    LIMIT 1
  `).get(params.id) as CompletionRow | undefined;

  const invited = db.prepare(`
    SELECT operator.name AS operator_name, follow.created_at AS completed_at
    FROM follow_ups follow
    LEFT JOIN users operator ON operator.id = follow.user_id
    WHERE follow.customer_id = ? AND follow.deleted_at IS NULL AND follow.type = '到店'
    ORDER BY datetime(follow.created_at) ASC, follow.id ASC
    LIMIT 1
  `).get(params.id) as CompletionRow | undefined;

  const measured = db.prepare(`
    SELECT operator.name AS operator_name, attachment.created_at AS completed_at
    FROM attachments attachment
    LEFT JOIN projects project ON project.id = attachment.project_id AND project.deleted_at IS NULL
    LEFT JOIN users operator ON operator.id = attachment.user_id
    WHERE (attachment.customer_id = ? OR project.customer_id = ?)
      AND (attachment.category = '量房资料' OR attachment.category LIKE '量房资料/%')
    ORDER BY datetime(attachment.created_at) ASC, attachment.id ASC
    LIMIT 1
  `).get(params.id, params.id) as CompletionRow | undefined;

  const deposited = db.prepare(`
    SELECT operator.name AS operator_name, deposit.received_at AS completed_at
    FROM customer_deposit_records deposit
    LEFT JOIN users operator ON operator.id = deposit.created_by_id
    WHERE deposit.customer_id = ?
      AND deposit.deleted_at IS NULL
      AND COALESCE(deposit.record_type, 'deposit') = 'deposit'
      AND deposit.status = 'received'
    ORDER BY datetime(deposit.received_at) ASC, deposit.id ASC
    LIMIT 1
  `).get(params.id) as CompletionRow | undefined;

  const proposal = db.prepare(`
    SELECT operator.name AS operator_name, quotation.created_at AS completed_at
    FROM quotations quotation
    INNER JOIN projects project ON project.id = quotation.project_id AND project.deleted_at IS NULL
    LEFT JOIN users operator ON operator.id = quotation.created_by_id
    WHERE project.customer_id = ? AND quotation.deleted_at IS NULL
    ORDER BY datetime(quotation.created_at) ASC, quotation.id ASC
    LIMIT 1
  `).get(params.id) as CompletionRow | undefined;

  const signed = db.prepare(`
    SELECT operator.name AS operator_name, COALESCE(contract.signed_at, contract.created_at) AS completed_at
    FROM contracts contract
    INNER JOIN projects project ON project.id = contract.project_id AND project.deleted_at IS NULL
    LEFT JOIN users operator ON operator.id = contract.created_by_id
    WHERE project.customer_id = ?
      AND contract.deleted_at IS NULL
      AND UPPER(COALESCE(contract.status, '')) <> 'DRAFT'
    ORDER BY datetime(COALESCE(contract.signed_at, contract.created_at)) ASC, contract.id ASC
    LIMIT 1
  `).get(params.id) as CompletionRow | undefined;

  const constructionLog = db.prepare(`
    SELECT operator.name AS operator_name, log.created_at AS completed_at
    FROM operation_logs log
    LEFT JOIN users operator ON operator.id = log.user_id
    WHERE log.entity = 'customer' AND log.entity_id = ? AND log.action = 'customer.site.start.confirm'
    ORDER BY datetime(log.created_at) ASC, log.id ASC
    LIMIT 1
  `).get(params.id) as CompletionRow | undefined;
  const constructionFallback = db.prepare(`
    SELECT manager.name AS operator_name, COALESCE(project.start_date, project.updated_at) AS completed_at
    FROM projects project
    LEFT JOIN users manager ON manager.id = project.manager_id
    WHERE project.customer_id = ? AND project.deleted_at IS NULL
      AND (project.status IN ('CONSTRUCTION', 'COMPLETED') OR project.site_stage IN ('CONSTRUCTION', 'OWNER_SETTLEMENT', 'SITE_SETTLEMENT'))
    ORDER BY datetime(COALESCE(project.start_date, project.updated_at)) ASC, project.id ASC
    LIMIT 1
  `).get(params.id) as CompletionRow | undefined;

  const completed = db.prepare(`
    SELECT manager.name AS operator_name, COALESCE(project.actual_end_date, project.updated_at) AS completed_at
    FROM projects project
    LEFT JOIN users manager ON manager.id = project.manager_id
    WHERE project.customer_id = ? AND project.deleted_at IS NULL AND project.status = 'COMPLETED'
    ORDER BY datetime(COALESCE(project.actual_end_date, project.updated_at)) ASC, project.id ASC
    LIMIT 1
  `).get(params.id) as CompletionRow | undefined;

  return NextResponse.json([
    toCompletion("NEW", "customer", created),
    toCompletion("CONTACTED", "followup", contacted),
    toCompletion("INVITED", "store_followup", invited),
    toCompletion("MEASURED", "measurement", measured),
    toCompletion("DEPOSITED", "deposit", deposited),
    toCompletion("PROPOSAL", "quotation", proposal),
    toCompletion("SIGNED", "contract", signed),
    toCompletion("CONSTRUCTION", "site_start", constructionLog || constructionFallback),
    toCompletion("COMPLETED", "project_completion", completed),
  ]);
}
