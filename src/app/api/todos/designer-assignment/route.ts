import { NextRequest, NextResponse } from "next/server";
import { ensureDesignerAssignmentSchema, getDb } from "@/lib/db";
import { getAuthContext } from "@/lib/security/authorization";

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "未登录" }, { status: 401 });

  const db = getDb();
  ensureDesignerAssignmentSchema(db);
  const items = db.prepare(`
    WITH visible_requests AS (
      SELECT
        r.*,
        c.name as customer_name,
        c.service_store,
        s.name as store_name,
        requester.name as requester_name,
        approver.name as approver_name,
        handler.name as handler_name,
        dispatcher.name as dispatched_by_name,
        preferred.name as preferred_designer_name,
        assignee.name as assigned_user_name,
        resolver.name as resolved_by_name,
        CASE
          WHEN r.status IN ('pending', 'pending_dispatch') AND r.approver_id = ? THEN 1
          WHEN r.status = 'pending_handler' AND r.handler_id = ? THEN 1
          ELSE 0
        END as is_actionable,
        ROW_NUMBER() OVER (
          PARTITION BY COALESCE(NULLIF(r.request_group_id, ''), r.id)
          ORDER BY
            CASE
              WHEN r.status = 'pending_handler' AND r.handler_id = ? THEN 0
              WHEN r.status IN ('pending', 'pending_dispatch') AND r.approver_id = ? THEN 0
              WHEN r.status IN ('pending', 'pending_dispatch', 'pending_handler') THEN 1
              ELSE 2
            END,
            r.created_at DESC,
            r.id ASC
        ) as request_rank
      FROM designer_assignment_requests r
      LEFT JOIN customers c ON r.customer_id = c.id
      LEFT JOIN org_units s ON r.store_id = s.id
      LEFT JOIN users requester ON r.requester_id = requester.id
      LEFT JOIN users approver ON r.approver_id = approver.id
      LEFT JOIN users handler ON r.handler_id = handler.id
      LEFT JOIN users dispatcher ON r.dispatched_by_id = dispatcher.id
      LEFT JOIN users preferred ON r.preferred_designer_id = preferred.id
      LEFT JOIN users assignee ON r.assigned_user_id = assignee.id
      LEFT JOIN users resolver ON r.resolved_by_id = resolver.id
      WHERE r.deleted_at IS NULL
        AND c.company_id = ?
        AND (r.approver_id = ? OR r.handler_id = ?)
    )
    SELECT *
    FROM visible_requests
    WHERE request_rank = 1
    ORDER BY
      is_actionable DESC,
      CASE status WHEN 'pending_dispatch' THEN 0 WHEN 'pending_handler' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END,
      created_at DESC
  `).all(auth.userId, auth.userId, auth.userId, auth.userId, auth.companyId, auth.userId, auth.userId);

  return NextResponse.json({ items });
}
