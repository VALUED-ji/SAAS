import { normalizeCustomerStatus, type CustomerStatus } from "@/lib/customerStatus";

type Db = {
  prepare: (sql: string) => {
    get: (...params: any[]) => any;
    run: (...params: any[]) => any;
  };
};

const customerProgressActions: Record<Exclude<CustomerStatus, "LOST">, string> = {
  NEW: "新线索完成",
  CONTACTED: "已有跟进记录",
  INVITED: "已有到店跟进",
  MEASURED: "已上传量房资料",
  DEPOSITED: "已完成交定金",
  PROPOSAL: "已有报价记录",
  SIGNED: "已提交合同",
};

function hasRecord(db: Db, sql: string, ...params: any[]) {
  return Boolean(db.prepare(sql).get(...params));
}

export function calculateCustomerProgress(db: Db, customerId: string): Exclude<CustomerStatus, "LOST"> {
  if (hasRecord(db, `
    SELECT c.id
    FROM contracts c
    INNER JOIN projects p ON p.id = c.project_id
    WHERE p.customer_id = ?
      AND c.deleted_at IS NULL
      AND UPPER(COALESCE(c.status, '')) <> 'DRAFT'
    LIMIT 1
  `, customerId)) return "SIGNED";

  if (hasRecord(db, `
    SELECT q.id
    FROM quotations q
    INNER JOIN projects p ON p.id = q.project_id
    WHERE p.customer_id = ?
      AND q.deleted_at IS NULL
    LIMIT 1
  `, customerId)) return "PROPOSAL";

  if (hasRecord(db, `
    SELECT id
    FROM customer_deposit_records
    WHERE customer_id = ?
      AND deleted_at IS NULL
      AND COALESCE(record_type, 'deposit') = 'deposit'
      AND status = 'received'
    LIMIT 1
  `, customerId)) return "DEPOSITED";

  if (hasRecord(db, `
    SELECT a.id
    FROM attachments a
    LEFT JOIN projects p ON p.id = a.project_id AND p.deleted_at IS NULL
    WHERE (a.customer_id = ? OR p.customer_id = ?)
      AND (a.category = '量房资料' OR a.category LIKE '量房资料/%')
    LIMIT 1
  `, customerId, customerId)) return "MEASURED";

  if (hasRecord(db, `
    SELECT id
    FROM follow_ups
    WHERE customer_id = ?
      AND deleted_at IS NULL
      AND type = '到店'
    LIMIT 1
  `, customerId)) return "INVITED";

  if (hasRecord(db, `
    SELECT id
    FROM follow_ups
    WHERE customer_id = ?
      AND deleted_at IS NULL
    LIMIT 1
  `, customerId)) return "CONTACTED";

  return "NEW";
}

export function getCustomerProgressAction(status: CustomerStatus) {
  return status === "LOST" ? null : customerProgressActions[status];
}

export function syncCustomerProgress(db: Db, customerId: string, options: { force?: boolean } = {}) {
  const customer = db.prepare("SELECT id, status, current_action FROM customers WHERE id = ? AND deleted_at IS NULL").get(customerId) as
    | { id: string; status?: string | null; current_action?: string | null }
    | undefined;
  if (!customer) return null;

  const currentStatus = normalizeCustomerStatus(customer.status);
  if (currentStatus === "LOST" && !options.force) {
    return currentStatus;
  }

  const nextStatus = calculateCustomerProgress(db, customerId);
  const nextAction = getCustomerProgressAction(nextStatus);
  if (currentStatus === nextStatus && String(customer.current_action || "") === String(nextAction || "")) {
    return nextStatus;
  }
  db.prepare(`
    UPDATE customers
    SET status = ?,
        current_action = ?,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(nextStatus, nextAction, customerId);
  return nextStatus;
}
