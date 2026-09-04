import { NextResponse } from "next/server";
import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { getCustomerProgressAction, syncCustomerProgress } from "@/lib/customerProgress";
import { getRequestIp, recordCustomerOperation } from "@/lib/operationLog";
import { ensureOrgManagerTable } from "@/lib/orgManagers";
import { canViewCustomers, getAuthContext, hasPermission } from "@/lib/security/authorization";

const customerListStatuses = ["NEW", "CONTACTED", "INVITED", "MEASURED", "DEPOSITED", "PROPOSAL", "SIGNED", "LOST"];
const customerSourceOptions = ["门店", "转介绍", "小程序", "广告投放", "抖音", "小红书", "其它"];
const customerHouseTypeOptions = ["一室一厅", "两室一厅", "两室两厅", "三室一厅", "三室两厅", "四室及以上", "别墅/复式"];
const customerDecorationTypeOptions = ["全包", "半包", "清包"];
const customerIntentionOptions = Array.from({ length: 5 }, (_, index) => "★".repeat(index + 1));
const customerDeliveryOptions = ["已交房", "未交房", "1", "0"];
let customerListIndexesReady = false;

type CustomerListScope = "all" | "service" | "managed";
type DepartmentFilterType = "business" | "design" | "service_store" | "participant";

type CustomerFilterOption = {
  value: string;
  label: string;
};

type CustomerListMeta = {
  statusCounts: Record<string, number>;
  sourceOptions: string[];
  storeOptions: string[];
  advisorOptions: CustomerFilterOption[];
  designerOptions: CustomerFilterOption[];
  intentionOptions: string[];
};

const phoneVisibleCustomerTeamRoles = ["ADVISOR", "DESIGNER", "WORKER", "PM", "家装顾问", "设计师", "施工员", "项目经理"];

function ensureCustomerListIndexes(db: ReturnType<typeof getDb>) {
  if (customerListIndexesReady) return;
  const customerColumns = db.prepare("PRAGMA table_info(customers)").all() as { name: string }[];
  if (!customerColumns.some((column) => column.name === "designer_name_manual")) {
    db.prepare("ALTER TABLE customers ADD COLUMN designer_name_manual TEXT").run();
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_customers_deleted_created ON customers(deleted_at, created_at);
    CREATE INDEX IF NOT EXISTS idx_customers_deleted_created_id ON customers(deleted_at, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_customers_status_deleted ON customers(status, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_customers_phone_deleted ON customers(phone, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_customers_source_deleted ON customers(source, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_customers_store_deleted ON customers(service_store, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_customers_inviter_deleted ON customers(inviter_id, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_customers_created_by_deleted ON customers(created_by_id, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_follow_ups_customer_created ON follow_ups(customer_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_follow_ups_customer_next_date ON follow_ups(customer_id, next_date);
    CREATE INDEX IF NOT EXISTS idx_customer_team_customer_role ON customer_team(customer_id, role, assigned_at);
    CREATE INDEX IF NOT EXISTS idx_customer_team_user_customer ON customer_team(user_id, customer_id);
    CREATE INDEX IF NOT EXISTS idx_org_units_manager_deleted ON org_units(manager_id, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_org_units_parent_deleted ON org_units(parent_id, deleted_at);
    CREATE INDEX IF NOT EXISTS idx_org_units_company_type_active ON org_units(company_id, type, deleted_at, is_active, sort_order);
    CREATE INDEX IF NOT EXISTS idx_projects_manager_customer_deleted ON projects(manager_id, customer_id, deleted_at);
  `);
  customerListIndexesReady = true;
}

function getPositiveNumber(value: string | null) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? numberValue : null;
}

function getTrimmedParam(searchParams: URLSearchParams, key: string) {
  return searchParams.get(key)?.trim() || "";
}

function followupDueDateTimeSql(expression: string) {
  const trimmed = `TRIM(COALESCE(${expression}, ''))`;
  return `CASE
    WHEN ${trimmed} = '' THEN NULL
    WHEN length(${trimmed}) <= 10 THEN datetime(${trimmed}, '+1 day')
    ELSE datetime(replace(${trimmed}, 'T', ' '))
  END`;
}

function normalizeRoomSearchText(value: string) {
  return value.toLowerCase().replace(/[\s\-－—_号楼栋幢座单元室房]/g, "");
}

function normalizedRoomSearchSql(expression: string) {
  return [
    "lower(",
    "replace(",
    "replace(",
    "replace(",
    "replace(",
    "replace(",
    "replace(",
    "replace(",
    "replace(",
    "replace(",
    "replace(",
    "replace(",
    "replace(",
    expression,
    ", ' ', '')",
    ", '-', '')",
    ", '－', '')",
    ", '—', '')",
    ", '_', '')",
    ", '号楼', '')",
    ", '栋', '')",
    ", '幢', '')",
    ", '座', '')",
    ", '单元', '')",
    ", '室', '')",
    ", '房', '')",
    ")",
  ].join("");
}

function normalizeCustomerListScope(value: string | null): CustomerListScope {
  return value === "service" || value === "managed" ? value : "all";
}

function getCurrentUserFromRequest(req: NextRequest) {
  return getAuthContext(req);
}

function maskCustomerPhone(phone?: string | null) {
  const text = String(phone || "").trim();
  if (!text || text === "仅微信联系") return text;
  return /^(\d{3})\d{4}(\d{4})$/.test(text) ? text.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2") : text;
}

function getPhoneVisibleCustomerIds(db: ReturnType<typeof getDb>, customerIds: string[], userId?: string) {
  const ids = Array.from(new Set(customerIds.map((id) => String(id || "").trim()).filter(Boolean)));
  if (!userId || ids.length === 0) return new Set<string>();
  const idPlaceholders = ids.map(() => "?").join(",");
  const rolePlaceholders = phoneVisibleCustomerTeamRoles.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT DISTINCT c.id
    FROM customers c
    WHERE c.id IN (${idPlaceholders})
      AND (
        EXISTS (
          SELECT 1
          FROM customer_team ct
          WHERE ct.customer_id = c.id
            AND ct.user_id = ?
            AND TRIM(COALESCE(ct.role, '')) IN (${rolePlaceholders})
        )
        OR c.inviter_id = ?
        OR (TRIM(COALESCE(c.inviter_id, '')) = '' AND c.created_by_id = ?)
        OR EXISTS (
          SELECT 1
          FROM projects service_project
          WHERE service_project.customer_id = c.id
            AND service_project.manager_id = ?
            AND service_project.deleted_at IS NULL
        )
      )
  `).all(...ids, userId, ...phoneVisibleCustomerTeamRoles, userId, userId, userId) as { id: string }[];
  return new Set(rows.map((row) => row.id));
}

function maskUnauthorizedCustomerPhones<T extends Record<string, any>>(db: ReturnType<typeof getDb>, customers: T[], userId?: string) {
  const visibleCustomerIds = getPhoneVisibleCustomerIds(db, customers.map((customer) => customer.id), userId);
  return customers.map((customer) => {
    if (visibleCustomerIds.has(customer.id)) return customer;
    return {
      ...customer,
      phone: maskCustomerPhone(customer.phone),
      phone_duplicate_count: 0,
      phone_masked: true,
    };
  });
}

function getManagedOrgNames(db: ReturnType<typeof getDb>, userId: string) {
  ensureOrgManagerTable(db);
  return (db.prepare(`
    WITH RECURSIVE managed_tree(id) AS (
      SELECT id
      FROM org_units
      WHERE manager_id = ? AND deleted_at IS NULL
      UNION
      SELECT org_unit_id
      FROM org_unit_managers
      WHERE user_id = ? AND deleted_at IS NULL
      UNION
      SELECT child.id
      FROM org_units child
      INNER JOIN managed_tree parent ON child.parent_id = parent.id
      WHERE child.deleted_at IS NULL
    )
    SELECT DISTINCT TRIM(COALESCE(name, '')) as name
    FROM org_units
    WHERE id IN (SELECT id FROM managed_tree)
      AND deleted_at IS NULL
      AND TRIM(COALESCE(name, '')) != ''
  `).all(userId, userId) as { name: string }[])
    .map((row) => row.name)
    .filter(Boolean);
}

function normalizeDepartmentFilterType(value: string | null): DepartmentFilterType {
  if (value === "design" || value === "service_store" || value === "participant") return value;
  return "business";
}

function getDepartmentFilterOrgIds(db: ReturnType<typeof getDb>, orgId: string, includeChildren: boolean) {
  const trimmedId = orgId.trim();
  if (!trimmedId) return [];
  if (!includeChildren) {
    const row = db.prepare("SELECT id FROM org_units WHERE id = ? AND deleted_at IS NULL").get(trimmedId) as { id: string } | undefined;
    return row?.id ? [row.id] : [];
  }
  return (db.prepare(`
    WITH RECURSIVE org_tree(id) AS (
      SELECT id
      FROM org_units
      WHERE id = ? AND deleted_at IS NULL
      UNION
      SELECT child.id
      FROM org_units child
      INNER JOIN org_tree parent ON child.parent_id = parent.id
      WHERE child.deleted_at IS NULL
    )
    SELECT id FROM org_tree
  `).all(trimmedId) as { id: string }[]).map((row) => row.id).filter(Boolean);
}

function getOrgNamesByIds(db: ReturnType<typeof getDb>, orgIds: string[]) {
  if (orgIds.length === 0) return [];
  const placeholders = orgIds.map(() => "?").join(",");
  return (db.prepare(`
    SELECT DISTINCT TRIM(COALESCE(name, '')) as name
    FROM org_units
    WHERE id IN (${placeholders})
      AND deleted_at IS NULL
      AND TRIM(COALESCE(name, '')) != ''
  `).all(...orgIds) as { name: string }[]).map((row) => row.name).filter(Boolean);
}

function addDepartmentFilter(
  db: ReturnType<typeof getDb> | undefined,
  where: string[],
  params: unknown[],
  type: DepartmentFilterType,
  orgId: string,
  includeChildren: boolean,
) {
  if (!orgId) return;
  if (!db) {
    where.push("1 = 0");
    return;
  }
  const orgIds = getDepartmentFilterOrgIds(db, orgId, includeChildren);
  if (orgIds.length === 0) {
    where.push("1 = 0");
    return;
  }
  const orgPlaceholders = orgIds.map(() => "?").join(",");
  if (type === "service_store") {
    const orgNames = getOrgNamesByIds(db, orgIds);
    if (orgNames.length === 0) {
      where.push("1 = 0");
      return;
    }
    const namePlaceholders = orgNames.map(() => "?").join(",");
    where.push(`TRIM(COALESCE(c.service_store, '')) IN (${namePlaceholders})`);
    params.push(...orgNames);
    return;
  }
  if (type === "design") {
    where.push(`EXISTS (
      SELECT 1
      FROM customer_team department_designer_team
      INNER JOIN users department_designer_user
        ON department_designer_user.id = department_designer_team.user_id
        AND department_designer_user.deleted_at IS NULL
        AND COALESCE(department_designer_user.is_active, 1) = 1
      WHERE department_designer_team.customer_id = c.id
        AND UPPER(department_designer_team.role) = 'DESIGNER'
        AND department_designer_user.org_unit_id IN (${orgPlaceholders})
    )`);
    params.push(...orgIds);
    return;
  }
  if (type === "participant") {
    where.push(`(
      EXISTS (
        SELECT 1
        FROM customer_team department_participant_team
        INNER JOIN users department_participant_user
          ON department_participant_user.id = department_participant_team.user_id
          AND department_participant_user.deleted_at IS NULL
          AND COALESCE(department_participant_user.is_active, 1) = 1
        WHERE department_participant_team.customer_id = c.id
          AND department_participant_user.org_unit_id IN (${orgPlaceholders})
      )
      OR EXISTS (
        SELECT 1
        FROM users department_participant_inviter
        WHERE department_participant_inviter.id = c.inviter_id
          AND department_participant_inviter.deleted_at IS NULL
          AND COALESCE(department_participant_inviter.is_active, 1) = 1
          AND department_participant_inviter.org_unit_id IN (${orgPlaceholders})
      )
      OR EXISTS (
        SELECT 1
        FROM users department_participant_creator
        WHERE department_participant_creator.id = c.created_by_id
          AND department_participant_creator.deleted_at IS NULL
          AND COALESCE(department_participant_creator.is_active, 1) = 1
          AND department_participant_creator.org_unit_id IN (${orgPlaceholders})
      )
      OR EXISTS (
        SELECT 1
        FROM projects department_participant_project
        INNER JOIN users department_participant_manager
          ON department_participant_manager.id = department_participant_project.manager_id
          AND department_participant_manager.deleted_at IS NULL
          AND COALESCE(department_participant_manager.is_active, 1) = 1
        WHERE department_participant_project.customer_id = c.id
          AND department_participant_project.deleted_at IS NULL
          AND department_participant_manager.org_unit_id IN (${orgPlaceholders})
      )
    )`);
    params.push(...orgIds, ...orgIds, ...orgIds, ...orgIds);
    return;
  }
  where.push(`(
    EXISTS (
      SELECT 1
      FROM customer_team department_advisor_team
      INNER JOIN users department_advisor_user
        ON department_advisor_user.id = department_advisor_team.user_id
        AND department_advisor_user.deleted_at IS NULL
        AND COALESCE(department_advisor_user.is_active, 1) = 1
      WHERE department_advisor_team.customer_id = c.id
        AND UPPER(department_advisor_team.role) = 'ADVISOR'
        AND department_advisor_user.org_unit_id IN (${orgPlaceholders})
    )
    OR EXISTS (
      SELECT 1
      FROM users department_inviter
      WHERE department_inviter.id = c.inviter_id
        AND department_inviter.deleted_at IS NULL
        AND COALESCE(department_inviter.is_active, 1) = 1
        AND department_inviter.org_unit_id IN (${orgPlaceholders})
    )
    OR (
      TRIM(COALESCE(c.inviter_id, '')) = ''
      AND EXISTS (
        SELECT 1
        FROM users department_creator
        WHERE department_creator.id = c.created_by_id
          AND department_creator.deleted_at IS NULL
          AND COALESCE(department_creator.is_active, 1) = 1
          AND department_creator.org_unit_id IN (${orgPlaceholders})
      )
    )
  )`);
  params.push(...orgIds, ...orgIds, ...orgIds);
}

function applyCustomerScopeFilter(
  db: ReturnType<typeof getDb> | undefined,
  where: string[],
  params: unknown[],
  scope: CustomerListScope,
  userId?: string,
) {
  if (scope === "all") return;
  if (!db || !userId) {
    where.push("1 = 0");
    return;
  }
  if (scope === "service") {
    where.push(`(
      EXISTS (
        SELECT 1
        FROM customer_team ct
        WHERE ct.customer_id = c.id AND ct.user_id = ?
      )
      OR c.inviter_id = ?
      OR (TRIM(COALESCE(c.inviter_id, '')) = '' AND c.created_by_id = ?)
      OR EXISTS (
        SELECT 1
        FROM projects service_project
        WHERE service_project.customer_id = c.id
          AND service_project.manager_id = ?
          AND service_project.deleted_at IS NULL
      )
    )`);
    params.push(userId, userId, userId, userId);
    return;
  }
  const managedOrgNames = getManagedOrgNames(db, userId);
  if (managedOrgNames.length === 0) {
    where.push("1 = 0");
    return;
  }
  const placeholders = managedOrgNames.map(() => "?").join(",");
  where.push(`TRIM(COALESCE(c.service_store, '')) IN (${placeholders})`);
  params.push(...managedOrgNames);
}

function applyQuotationCopyTargetFilter(where: string[], params: unknown[], companyId: string) {
  where.push("COALESCE(c.status, 'NEW') != 'LOST'");
  where.push(`NOT (
    EXISTS (
      SELECT 1
      FROM operation_logs created_log
      WHERE created_log.entity = 'customer'
        AND created_log.entity_id = c.id
        AND created_log.action = 'customer.create.from_quotation'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM quotations q
      INNER JOIN projects p ON p.id = q.project_id
      WHERE p.customer_id = c.id
        AND q.company_id = ?
    )
    AND NOT EXISTS (
      SELECT 1
      FROM contracts ct
      INNER JOIN projects cp ON cp.id = ct.project_id
      WHERE cp.customer_id = c.id
        AND ct.company_id = ?
        AND ct.deleted_at IS NULL
    )
  )`);
  params.push(companyId, companyId);
}

function buildCustomerListWhere(
  searchParams: URLSearchParams,
  options: { includeStatus?: boolean; db?: ReturnType<typeof getDb>; scope?: CustomerListScope; currentUserId?: string; currentCompanyId?: string } = {},
) {
  const includeStatus = options.includeStatus !== false;
  const showDeleted = searchParams.get("deleted") === "1";
  const where = ["c.company_id = ?", showDeleted ? "c.deleted_at IS NOT NULL" : "c.deleted_at IS NULL"];
  const params: unknown[] = [options.currentCompanyId || "__invalid_company__"];
  const duplicatePhone = getTrimmedParam(searchParams, "duplicatePhone");

  if (duplicatePhone) {
    where.push("c.phone = ?");
    params.push(duplicatePhone);
    return { where: where.join(" AND "), params };
  }

  const status = getTrimmedParam(searchParams, "status");
  if (includeStatus) {
    if (status && status !== "all") {
      where.push("COALESCE(c.status, 'NEW') = ?");
      params.push(status);
    } else if (!showDeleted) {
      where.push("COALESCE(c.status, 'NEW') != 'LOST'");
    }
  }

  const search = getTrimmedParam(searchParams, "search").toLowerCase();
  if (search) {
    const like = `%${search}%`;
    const normalizedRoomLike = `%${normalizeRoomSearchText(search)}%`;
    const fullRoomSql = `COALESCE(NULLIF(TRIM(c.address), ''), NULLIF(TRIM(c.house_address), ''), '') || COALESCE(c.building_no, '') || '-' || COALESCE(c.unit_no, '') || '-' || COALESCE(c.room_no, '')`;
    where.push(`(
      lower(COALESCE(c.name, '')) LIKE ?
      OR lower(COALESCE(c.phone, '')) LIKE ?
      OR lower(COALESCE(c.weixin, '')) LIKE ?
      OR lower(COALESCE(c.address, '')) LIKE ?
      OR lower(COALESCE(c.house_address, '')) LIKE ?
      OR lower(COALESCE(c.area, '')) LIKE ?
      OR lower(COALESCE(c.service_store, '')) LIKE ?
      OR lower(COALESCE(c.building_no, '')) LIKE ?
      OR lower(COALESCE(c.unit_no, '')) LIKE ?
      OR lower(COALESCE(c.room_no, '')) LIKE ?
      OR ${normalizedRoomSearchSql(fullRoomSql)} LIKE ?
    )`);
    params.push(like, like, like, like, like, like, like, like, like, like, normalizedRoomLike);
  }

  const createdFrom = getTrimmedParam(searchParams, "createdFrom");
  const createdTo = getTrimmedParam(searchParams, "createdTo");
  if (createdFrom) {
    where.push("datetime(c.created_at) >= datetime(?)");
    params.push(`${createdFrom} 00:00:00`);
  }
  if (createdTo) {
    where.push("datetime(c.created_at) <= datetime(?)");
    params.push(`${createdTo} 23:59:59`);
  }

  const source = getTrimmedParam(searchParams, "source");
  const store = getTrimmedParam(searchParams, "store");
  if (source) {
    where.push("COALESCE(c.source, '') = ?");
    params.push(source);
  }
  if (store) {
    where.push("COALESCE(c.service_store, '') = ?");
    params.push(store);
  }

  const advisor = getTrimmedParam(searchParams, "advisor");
  if (advisor) {
    where.push(`(
      EXISTS (
        SELECT 1
        FROM customer_team advisor_filter_team
        WHERE advisor_filter_team.customer_id = c.id
          AND advisor_filter_team.user_id = ?
          AND UPPER(advisor_filter_team.role) = 'ADVISOR'
      )
      OR c.inviter_id = ?
      OR (TRIM(COALESCE(c.inviter_id, '')) = '' AND c.created_by_id = ?)
    )`);
    params.push(advisor, advisor, advisor);
  }

  const designer = getTrimmedParam(searchParams, "designer");
  if (designer) {
    where.push(`EXISTS (
      SELECT 1
      FROM customer_team designer_filter_team
      WHERE designer_filter_team.customer_id = c.id
        AND designer_filter_team.user_id = ?
        AND UPPER(designer_filter_team.role) = 'DESIGNER'
    )`);
    params.push(designer);
  }

  const intention = getTrimmedParam(searchParams, "intention");
  if (intention === "__empty") {
    where.push("TRIM(COALESCE(c.intention, '')) = ''");
  } else if (intention) {
    where.push("TRIM(COALESCE(c.intention, '')) = ?");
    params.push(intention);
  }

  const followup = getTrimmedParam(searchParams, "followup");
  const currentNextFollowupDateSql = `(
    SELECT latest_followup.next_date
    FROM follow_ups latest_followup
    WHERE latest_followup.customer_id = c.id
      AND latest_followup.deleted_at IS NULL
    ORDER BY datetime(COALESCE(latest_followup.created_at, '1970-01-01')) DESC, latest_followup.id DESC
    LIMIT 1
  )`;
  const currentNextFollowupDateTimeSql = followupDueDateTimeSql(currentNextFollowupDateSql);
  if (followup === "overdue") {
    where.push(`${currentNextFollowupDateTimeSql} IS NOT NULL AND ${currentNextFollowupDateTimeSql} < datetime('now', '+8 hours')`);
  }
  if (followup === "today") {
    where.push(`TRIM(COALESCE(${currentNextFollowupDateSql}, '')) != '' AND date(${currentNextFollowupDateSql}) = date('now', '+8 hours')`);
  }
  if (followup === "upcoming") {
    where.push(`TRIM(COALESCE(${currentNextFollowupDateSql}, '')) != '' AND date(${currentNextFollowupDateSql}) > date('now', '+8 hours')`);
  }
  if (followup === "none") {
    where.push(`TRIM(COALESCE(${currentNextFollowupDateSql}, '')) = ''`);
  }

  const departmentOrgId = getTrimmedParam(searchParams, "departmentOrgId");
  if (departmentOrgId) {
    addDepartmentFilter(
      options.db,
      where,
      params,
      normalizeDepartmentFilterType(searchParams.get("departmentType")),
      departmentOrgId,
      searchParams.get("departmentIncludeChildren") === "1",
    );
  }

  const budgetMin = getPositiveNumber(searchParams.get("budgetMin"));
  const budgetMax = getPositiveNumber(searchParams.get("budgetMax"));
  const areaMin = getPositiveNumber(searchParams.get("areaMin"));
  const areaMax = getPositiveNumber(searchParams.get("areaMax"));
  if (budgetMin !== null) {
    where.push("COALESCE(c.budget, 0) >= ?");
    params.push(budgetMin);
  }
  if (budgetMax !== null) {
    where.push("COALESCE(c.budget, 0) <= ?");
    params.push(budgetMax);
  }
  if (areaMin !== null) {
    where.push("COALESCE(c.area_size, 0) >= ?");
    params.push(areaMin);
  }
  if (areaMax !== null) {
    where.push("COALESCE(c.area_size, 0) <= ?");
    params.push(areaMax);
  }

  const hasPhoneSql = "TRIM(COALESCE(c.phone, '')) != '' AND TRIM(COALESCE(c.phone, '')) != '仅微信联系'";
  const hasWeixinSql = "TRIM(COALESCE(c.weixin, '')) != ''";
  const contact = getTrimmedParam(searchParams, "contact");
  if (contact === "phone") where.push(`(${hasPhoneSql})`);
  if (contact === "weixin") where.push(`(${hasWeixinSql})`);
  if (contact === "both") where.push(`(${hasPhoneSql}) AND (${hasWeixinSql})`);
  if (contact === "incomplete") where.push(`NOT ((${hasPhoneSql}) AND (${hasWeixinSql}))`);

  const duplicate = getTrimmedParam(searchParams, "duplicate");
  if (duplicate === "duplicate") {
    where.push(`(${hasPhoneSql}) AND (
      SELECT COUNT(*)
      FROM customers duplicate_customer
      WHERE duplicate_customer.deleted_at IS NULL AND duplicate_customer.phone = c.phone
    ) > 1`);
  }
  if (duplicate === "unique") {
    where.push(`(
      NOT (${hasPhoneSql})
      OR (
        SELECT COUNT(*)
        FROM customers duplicate_customer
        WHERE duplicate_customer.deleted_at IS NULL AND duplicate_customer.phone = c.phone
      ) <= 1
    )`);
  }

  applyCustomerScopeFilter(options.db, where, params, options.scope || "all", options.currentUserId);

  return { where: where.join(" AND "), params };
}

function getCustomerListSelectSql(whereSql: string, limitSql = "", showDeleted = false) {
  const orderSql = showDeleted
    ? "c.deleted_at DESC, c.id DESC"
    : `CASE WHEN last_followup_at IS NULL OR TRIM(COALESCE(last_followup_at, '')) = '' THEN 1 ELSE 0 END ASC,
    datetime(COALESCE(last_followup_at, '1970-01-01')) DESC,
    c.created_at DESC,
    c.id DESC`;
  return `
    SELECT
      c.*,
      u.name as created_by_name,
      u.avatar as created_by_avatar,
      inviter.name as inviter_name,
      inviter.avatar as inviter_avatar,
      (
        SELECT advisor.name
        FROM customer_team advisor_team
        LEFT JOIN users advisor ON advisor.id = advisor_team.user_id
        WHERE advisor_team.customer_id = c.id
          AND UPPER(advisor_team.role) = 'ADVISOR'
        ORDER BY datetime(COALESCE(advisor_team.assigned_at, '1970-01-01')) DESC, advisor_team.id DESC
        LIMIT 1
      ) as advisor_name,
      (
        SELECT advisor.avatar
        FROM customer_team advisor_team
        LEFT JOIN users advisor ON advisor.id = advisor_team.user_id
        WHERE advisor_team.customer_id = c.id
          AND UPPER(advisor_team.role) = 'ADVISOR'
        ORDER BY datetime(COALESCE(advisor_team.assigned_at, '1970-01-01')) DESC, advisor_team.id DESC
        LIMIT 1
      ) as advisor_avatar,
      COALESCE(
        (
          SELECT advisor_org.name
          FROM customer_team advisor_team
          LEFT JOIN users advisor ON advisor.id = advisor_team.user_id
          LEFT JOIN org_units advisor_org ON advisor_org.id = advisor.org_unit_id AND advisor_org.deleted_at IS NULL
          WHERE advisor_team.customer_id = c.id
            AND UPPER(advisor_team.role) = 'ADVISOR'
          ORDER BY datetime(COALESCE(advisor_team.assigned_at, '1970-01-01')) DESC, advisor_team.id DESC
          LIMIT 1
        ),
        (
          SELECT inviter_org.name
          FROM org_units inviter_org
          WHERE inviter_org.id = inviter.org_unit_id AND inviter_org.deleted_at IS NULL
          LIMIT 1
        ),
        (
          SELECT creator_org.name
          FROM org_units creator_org
          WHERE creator_org.id = u.org_unit_id AND creator_org.deleted_at IS NULL
          LIMIT 1
        )
      ) as business_department_name,
      COALESCE((
        SELECT designer.name
        FROM customer_team designer_team
        LEFT JOIN users designer ON designer.id = designer_team.user_id
        WHERE designer_team.customer_id = c.id
          AND UPPER(designer_team.role) = 'DESIGNER'
        ORDER BY datetime(COALESCE(designer_team.assigned_at, '1970-01-01')) DESC, designer_team.id DESC
        LIMIT 1
      ), NULLIF(TRIM(COALESCE(c.designer_name_manual, '')), '')) as designer_name,
      (
        SELECT designer.avatar
        FROM customer_team designer_team
        LEFT JOIN users designer ON designer.id = designer_team.user_id
        WHERE designer_team.customer_id = c.id
          AND UPPER(designer_team.role) = 'DESIGNER'
        ORDER BY datetime(COALESCE(designer_team.assigned_at, '1970-01-01')) DESC, designer_team.id DESC
        LIMIT 1
      ) as designer_avatar,
      (
        SELECT designer_org.name
        FROM customer_team designer_team
        LEFT JOIN users designer ON designer.id = designer_team.user_id
        LEFT JOIN org_units designer_org ON designer_org.id = designer.org_unit_id AND designer_org.deleted_at IS NULL
        WHERE designer_team.customer_id = c.id
          AND UPPER(designer_team.role) = 'DESIGNER'
        ORDER BY datetime(COALESCE(designer_team.assigned_at, '1970-01-01')) DESC, designer_team.id DESC
        LIMIT 1
      ) as design_department_name,
      (
        SELECT latest_follow.created_at
        FROM follow_ups latest_follow
        WHERE latest_follow.customer_id = c.id
          AND latest_follow.deleted_at IS NULL
        ORDER BY datetime(COALESCE(latest_follow.created_at, '1970-01-01')) DESC, latest_follow.id DESC
        LIMIT 1
      ) as last_followup_at,
      (
        SELECT latest_follow.content
        FROM follow_ups latest_follow
        WHERE latest_follow.customer_id = c.id
          AND latest_follow.deleted_at IS NULL
        ORDER BY datetime(COALESCE(latest_follow.created_at, '1970-01-01')) DESC, latest_follow.id DESC
        LIMIT 1
      ) as latest_followup_content,
      (
        SELECT CASE
          WHEN latest_follow.next_date IS NOT NULL AND TRIM(latest_follow.next_date) != '' THEN latest_follow.next_date
          ELSE NULL
        END
        FROM follow_ups latest_follow
        WHERE latest_follow.customer_id = c.id
          AND latest_follow.deleted_at IS NULL
        ORDER BY datetime(COALESCE(latest_follow.created_at, '1970-01-01')) DESC, latest_follow.id DESC
        LIMIT 1
      ) as next_followup_at,
      (
        SELECT CASE
          WHEN latest_follow.next_date IS NOT NULL
            AND TRIM(latest_follow.next_date) != ''
            AND ${followupDueDateTimeSql("latest_follow.next_date")} < datetime('now', '+8 hours')
          THEN 1
          ELSE 0
        END
        FROM follow_ups latest_follow
        WHERE latest_follow.customer_id = c.id
          AND latest_follow.deleted_at IS NULL
        ORDER BY datetime(COALESCE(latest_follow.created_at, '1970-01-01')) DESC, latest_follow.id DESC
        LIMIT 1
      ) as has_overdue_followup,
      (
        SELECT CASE
          WHEN latest_follow.next_date IS NOT NULL
            AND TRIM(latest_follow.next_date) != ''
            AND ${followupDueDateTimeSql("latest_follow.next_date")} < datetime('now', '+8 hours')
          THEN CAST(julianday(datetime('now', '+8 hours')) - julianday(${followupDueDateTimeSql("latest_follow.next_date")}) AS INTEGER)
          ELSE 0
        END
        FROM follow_ups latest_follow
        WHERE latest_follow.customer_id = c.id
          AND latest_follow.deleted_at IS NULL
        ORDER BY datetime(COALESCE(latest_follow.created_at, '1970-01-01')) DESC, latest_follow.id DESC
        LIMIT 1
      ) as overdue_followup_days,
      CASE
        WHEN TRIM(COALESCE(c.phone, '')) = '' OR TRIM(COALESCE(c.phone, '')) = '仅微信联系' THEN 0
        ELSE (
          SELECT COUNT(*)
          FROM customers duplicate_customer
          WHERE duplicate_customer.deleted_at IS NULL AND duplicate_customer.phone = c.phone
        )
      END as phone_duplicate_count
      ,CASE
        WHEN TRIM(COALESCE(c.service_store, '')) = '' THEN 1
        WHEN EXISTS (
          SELECT 1 FROM org_units store
          WHERE store.deleted_at IS NULL AND TRIM(COALESCE(store.name, '')) = TRIM(c.service_store)
        ) THEN (
          SELECT MAX(COALESCE(store.is_active, 1))
          FROM org_units store
          WHERE store.deleted_at IS NULL AND TRIM(COALESCE(store.name, '')) = TRIM(c.service_store)
        )
        ELSE 1
      END as service_store_is_active
    FROM customers c
    LEFT JOIN users u ON c.created_by_id = u.id
    LEFT JOIN users inviter ON c.inviter_id = inviter.id
    WHERE ${whereSql}
    ORDER BY ${orderSql}
    ${limitSql}
  `;
}

function getDistinctCustomerOptions(db: ReturnType<typeof getDb>, column: "source" | "service_store", companyId: string) {
  return (db.prepare(`
    SELECT DISTINCT TRIM(${column}) as value
    FROM customers
    WHERE company_id = ? AND deleted_at IS NULL
      AND ${column} IS NOT NULL
      AND TRIM(${column}) != ''
    ORDER BY value
  `).all(companyId) as { value: string }[])
    .map((item) => item.value)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

function sortCustomerFilterOptions(options: CustomerFilterOption[]) {
  const seen = new Set<string>();
  return options
    .filter((option) => option.value && option.label)
    .filter((option) => {
      if (seen.has(option.value)) return false;
      seen.add(option.value);
      return true;
    })
    .sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-CN"));
}

function getAdvisorOptions(db: ReturnType<typeof getDb>, companyId: string) {
  const rows = db.prepare(`
    SELECT value, label
    FROM (
      SELECT DISTINCT u.id as value, TRIM(u.name) as label
      FROM customer_team ct
      INNER JOIN customers c ON c.id = ct.customer_id AND c.deleted_at IS NULL
      INNER JOIN users u ON u.id = ct.user_id AND u.deleted_at IS NULL AND COALESCE(u.is_active, 1) = 1
      WHERE UPPER(ct.role) = 'ADVISOR'
        AND c.company_id = ?
        AND TRIM(COALESCE(u.name, '')) != ''
      UNION
      SELECT DISTINCT inviter.id as value, TRIM(inviter.name) as label
      FROM customers c
      INNER JOIN users inviter ON inviter.id = c.inviter_id AND inviter.deleted_at IS NULL AND COALESCE(inviter.is_active, 1) = 1
      WHERE c.deleted_at IS NULL
        AND c.company_id = ?
        AND TRIM(COALESCE(inviter.name, '')) != ''
      UNION
      SELECT DISTINCT creator.id as value, TRIM(creator.name) as label
      FROM customers c
      INNER JOIN users creator ON creator.id = c.created_by_id AND creator.deleted_at IS NULL AND COALESCE(creator.is_active, 1) = 1
      WHERE c.deleted_at IS NULL
        AND c.company_id = ?
        AND TRIM(COALESCE(c.inviter_id, '')) = ''
        AND TRIM(COALESCE(creator.name, '')) != ''
    )
  `).all(companyId, companyId, companyId) as CustomerFilterOption[];
  return sortCustomerFilterOptions(rows);
}

function getDesignerOptions(db: ReturnType<typeof getDb>, companyId: string) {
  const rows = db.prepare(`
    SELECT DISTINCT u.id as value, TRIM(u.name) as label
    FROM customer_team ct
    INNER JOIN customers c ON c.id = ct.customer_id AND c.deleted_at IS NULL
    INNER JOIN users u ON u.id = ct.user_id AND u.deleted_at IS NULL AND COALESCE(u.is_active, 1) = 1
    WHERE UPPER(ct.role) = 'DESIGNER'
      AND c.company_id = ?
      AND TRIM(COALESCE(u.name, '')) != ''
  `).all(companyId) as CustomerFilterOption[];
  return sortCustomerFilterOptions(rows);
}

function getIntentionOptions(db: ReturnType<typeof getDb>, companyId: string) {
  return (db.prepare(`
    SELECT DISTINCT TRIM(intention) as value
    FROM customers
    WHERE company_id = ? AND deleted_at IS NULL
      AND intention IS NOT NULL
      AND TRIM(intention) != ''
    ORDER BY value
  `).all(companyId) as { value: string }[])
    .map((item) => item.value)
    .filter((value) => /^★{1,5}$/.test(value))
    .sort((a, b) => {
      const aStars = /^★+$/.test(a) ? a.length : 99;
      const bStars = /^★+$/.test(b) ? b.length : 99;
      return aStars === bStars ? a.localeCompare(b, "zh-Hans-CN") : aStars - bStars;
    });
}

function getCustomerStatusCounts(
  db: ReturnType<typeof getDb>,
  searchParams: URLSearchParams,
  options: { scope?: CustomerListScope; currentUserId?: string; currentCompanyId?: string } = {},
) {
  const base = buildCustomerListWhere(searchParams, { includeStatus: false, db, ...options });
  const showDeleted = searchParams.get("deleted") === "1";
  const rows = db.prepare(`
    SELECT COALESCE(c.status, 'NEW') as status, COUNT(*) as total
    FROM customers c
    WHERE ${base.where}
    GROUP BY COALESCE(c.status, 'NEW')
  `).all(...base.params) as { status?: string | null; total?: number }[];
  const counts = customerListStatuses.reduce<Record<string, number>>((acc, status) => {
    acc[status] = 0;
    return acc;
  }, { all: 0 });
  rows.forEach((row) => {
    const status = String(row.status || "NEW");
    const total = Number(row.total || 0);
    if (customerListStatuses.includes(status)) {
      counts[status] = total;
    }
    if (showDeleted || status !== "LOST") {
      counts.all += total;
    }
  });
  return counts;
}

function getPagedCustomers(req: NextRequest) {
  const db = getDb();
  ensureCustomerListIndexes(db);
  const searchParams = req.nextUrl.searchParams;
  const scope = normalizeCustomerListScope(searchParams.get("scope"));
  const currentUser = getCurrentUserFromRequest(req);
  if (scope !== "all" && !currentUser?.userId) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  const exportAll = searchParams.get("export") === "1";
  const includeMeta = searchParams.get("includeMeta") !== "0";
  const duplicatePhone = getTrimmedParam(searchParams, "duplicatePhone");
  const showDeleted = searchParams.get("deleted") === "1";
  const page = Math.max(1, Number(searchParams.get("page") || 1) || 1);
  const requestedPageSize = Math.max(1, Number(searchParams.get("pageSize") || 20) || 20);
  const pageSize = exportAll ? 100000 : Math.min(requestedPageSize, duplicatePhone ? 300 : 200);
  const offset = (page - 1) * pageSize;
  const scopeOptions = { scope, currentUserId: currentUser?.userId, currentCompanyId: currentUser?.companyId };
  const filters = buildCustomerListWhere(searchParams, { db, ...scopeOptions });
  const total = Number((db.prepare(`
    SELECT COUNT(*) as total
    FROM customers c
    WHERE ${filters.where}
  `).get(...filters.params) as { total?: number })?.total || 0);
  const limitSql = exportAll ? "" : "LIMIT ? OFFSET ?";
  const params = exportAll ? filters.params : [...filters.params, pageSize, offset];
  const customers = maskUnauthorizedCustomerPhones(
    db,
    db.prepare(getCustomerListSelectSql(filters.where, limitSql, showDeleted)).all(...params) as Record<string, any>[],
    currentUser?.userId,
  );

  const meta = includeMeta ? getCustomerListMetaData(db, searchParams, scopeOptions) : null;
  return NextResponse.json({
    customers,
    total,
    page,
    pageSize: exportAll ? total || pageSize : pageSize,
    statusCounts: meta?.statusCounts || {},
    sourceOptions: meta?.sourceOptions || [],
    storeOptions: meta?.storeOptions || [],
    advisorOptions: meta?.advisorOptions || [],
    designerOptions: meta?.designerOptions || [],
    intentionOptions: meta?.intentionOptions || [],
  });
}

function getCustomerListMetaData(
  db: ReturnType<typeof getDb>,
  searchParams: URLSearchParams,
  scopeOptions: { scope?: CustomerListScope; currentUserId?: string; currentCompanyId?: string } = {},
): CustomerListMeta {
  const companyId = scopeOptions.currentCompanyId || "__invalid_company__";
  return {
    statusCounts: getCustomerStatusCounts(db, searchParams, scopeOptions),
    sourceOptions: getDistinctCustomerOptions(db, "source", companyId),
    storeOptions: searchParams.get("includeStoreOptions") === "0" ? [] : getDistinctCustomerOptions(db, "service_store", companyId),
    advisorOptions: getAdvisorOptions(db, companyId),
    designerOptions: getDesignerOptions(db, companyId),
    intentionOptions: getIntentionOptions(db, companyId),
  };
}

function getCustomerListMeta(req: NextRequest) {
  const db = getDb();
  ensureCustomerListIndexes(db);
  const searchParams = req.nextUrl.searchParams;
  const scope = normalizeCustomerListScope(searchParams.get("scope"));
  const currentUser = getCurrentUserFromRequest(req);
  if (scope !== "all" && !currentUser?.userId) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  return NextResponse.json(getCustomerListMetaData(db, searchParams, { scope, currentUserId: currentUser?.userId, currentCompanyId: currentUser?.companyId }));
}

function getCustomerPhoneDuplicateCheck(req: NextRequest) {
  const currentUser = getCurrentUserFromRequest(req);
  if (!currentUser?.userId) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  const phone = getTrimmedParam(req.nextUrl.searchParams, "phone");
  const excludeId = getTrimmedParam(req.nextUrl.searchParams, "excludeId");
  if (!isValidPhoneValue(phone) || !phone || phone === "仅微信联系") {
    return NextResponse.json({ count: 0 });
  }
  const db = getDb();
  ensureCustomerListIndexes(db);
  const params: unknown[] = [currentUser.companyId, phone];
  let excludeSql = "";
  if (excludeId) {
    excludeSql = "AND id != ?";
    params.push(excludeId);
  }
  const count = Number((db.prepare(`
    SELECT COUNT(*) as total
    FROM customers
    WHERE company_id = ? AND deleted_at IS NULL
      AND phone = ?
      ${excludeSql}
  `).get(...params) as { total?: number })?.total || 0);
  return NextResponse.json({ count });
}

function getCustomerStoreOptions(req: NextRequest) {
  const currentUser = getCurrentUserFromRequest(req);
  if (!currentUser?.userId) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  const db = getDb();
  ensureCustomerListIndexes(db);
  const searchParams = req.nextUrl.searchParams;
  const search = getTrimmedParam(searchParams, "search").toLowerCase();
  const page = Math.max(1, Number(searchParams.get("page") || 1) || 1);
  const pageSize = Math.min(Math.max(4, Number(searchParams.get("pageSize") || 30) || 30), 50);
  const where = [
    "store.company_id = ?",
    "store.deleted_at IS NULL",
    "store.type = 'store'",
    "COALESCE(store.is_active, 1) = 1",
    "TRIM(COALESCE(store.name, '')) != ''",
  ];
  const params: unknown[] = [currentUser.companyId];
  if (search) {
    where.push("lower(store.name) LIKE ?");
    params.push(`%${search}%`);
  }
  const rows = db.prepare(`
    SELECT store.id, TRIM(store.name) as name, TRIM(COALESCE(parent.name, '')) as parent_name
    FROM org_units store
    LEFT JOIN org_units parent ON parent.id = store.parent_id AND parent.deleted_at IS NULL
    WHERE ${where.join(" AND ")}
    ORDER BY COALESCE(store.sort_order, 0), store.name, store.id
    LIMIT ? OFFSET ?
  `).all(...params, pageSize + 1, (page - 1) * pageSize) as { id: string; name: string; parent_name?: string | null }[];
  const hasMore = rows.length > pageSize;
  return NextResponse.json({ stores: hasMore ? rows.slice(0, pageSize) : rows, page, pageSize, hasMore });
}

function getCustomerPicker(req: NextRequest) {
  const currentUser = getCurrentUserFromRequest(req);
  if (!currentUser?.userId) {
    return NextResponse.json({ message: "未登录" }, { status: 401 });
  }
  const db = getDb();
  ensureCustomerListIndexes(db);
  const searchParams = req.nextUrl.searchParams;
  const search = getTrimmedParam(searchParams, "search").toLowerCase();
  const limit = Math.min(Math.max(1, Number(searchParams.get("limit") || 80) || 80), 1000);
  const usage = getTrimmedParam(searchParams, "usage");
  const where = ["c.company_id = ?", "c.deleted_at IS NULL"];
  const params: unknown[] = [currentUser.companyId];
  if (usage === "quotation-copy-target") applyQuotationCopyTargetFilter(where, params, currentUser.companyId);
  if (search) {
    const like = `%${search}%`;
    const normalizedRoomLike = `%${normalizeRoomSearchText(search)}%`;
    const fullRoomSql = `COALESCE(NULLIF(TRIM(c.address), ''), NULLIF(TRIM(c.house_address), ''), '') || COALESCE(c.building_no, '') || '-' || COALESCE(c.unit_no, '') || '-' || COALESCE(c.room_no, '')`;
    const combinedSearchSql = `lower(
      COALESCE(c.name, '') || ' ' || COALESCE(c.phone, '') || ' ' || COALESCE(c.weixin, '') || ' ' ||
      COALESCE(c.address, '') || ' ' || COALESCE(c.house_address, '') || ' ' || COALESCE(c.area, '') || ' ' ||
      COALESCE(c.building_no, '') || ' ' || COALESCE(c.unit_no, '') || ' ' || COALESCE(c.room_no, '')
    )`;
    const needsNormalizedRoomSearch = /[\d号楼栋幢座单元室房\-－—_]/.test(search);
    where.push(needsNormalizedRoomSearch
      ? `(${combinedSearchSql} LIKE ? OR ${normalizedRoomSearchSql(fullRoomSql)} LIKE ?)`
      : `${combinedSearchSql} LIKE ?`);
    params.push(like);
    if (needsNormalizedRoomSearch) params.push(normalizedRoomLike);
  }
  const whereSql = where.join(" AND ");
  const rowsWithOverflow = db.prepare(`
    SELECT c.id, c.name, c.phone, c.weixin, c.address, c.house_address,
      c.address_location_name, c.address_location_address, c.address_latitude, c.address_longitude,
      c.building_no, c.unit_no, c.room_no, c.no_room_number,
      c.area, c.area_size, c.decoration_type, c.status, c.created_at
    FROM customers c
    WHERE ${whereSql}
    ORDER BY c.created_at DESC, c.id DESC
    LIMIT ?
  `).all(...params, limit + 1) as Record<string, any>[];
  const hasMore = rowsWithOverflow.length > limit;
  const rows = hasMore ? rowsWithOverflow.slice(0, limit) : rowsWithOverflow;
  const total = search
    ? rows.length
    : Number((db.prepare(`
        SELECT COUNT(*) as total
        FROM customers c
        WHERE ${whereSql}
      `).get(...params) as { total?: number })?.total || 0);

  return NextResponse.json({
    customers: maskUnauthorizedCustomerPhones(db, rows, currentUser.userId),
    total,
    hasMore,
  });
}

export async function GET(req: NextRequest) {
  const currentUser = getCurrentUserFromRequest(req);
  if (!currentUser) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canViewCustomers(currentUser)) return NextResponse.json({ message: "没有客户查看权限" }, { status: 403 });
  if (req.nextUrl.searchParams.get("mode") === "store-options") {
    return getCustomerStoreOptions(req);
  }
  if (req.nextUrl.searchParams.get("mode") === "picker") {
    return getCustomerPicker(req);
  }
  if (req.nextUrl.searchParams.get("mode") === "phone-check") {
    return getCustomerPhoneDuplicateCheck(req);
  }
  if (req.nextUrl.searchParams.get("mode") === "list-meta") {
    return getCustomerListMeta(req);
  }
  const wantsPagedList = req.nextUrl.searchParams.get("mode") === "list"
    || req.nextUrl.searchParams.has("page")
    || req.nextUrl.searchParams.has("export")
    || req.nextUrl.searchParams.has("duplicatePhone");
  if (wantsPagedList) return getPagedCustomers(req);

  const db = getDb();
  ensureCustomerListIndexes(db);
  const customerIds = db.prepare("SELECT id FROM customers WHERE company_id = ? AND deleted_at IS NULL")
    .all(currentUser.companyId) as { id: string }[];
  customerIds.forEach((customer) => syncCustomerProgress(db, customer.id));
  const customers = maskUnauthorizedCustomerPhones(db, db.prepare(`
    SELECT
      c.*,
      u.name as created_by_name,
      u.avatar as created_by_avatar,
      inviter.name as inviter_name,
      inviter.avatar as inviter_avatar,
      (
        SELECT advisor.name
        FROM customer_team advisor_team
        LEFT JOIN users advisor ON advisor.id = advisor_team.user_id
        WHERE advisor_team.customer_id = c.id
          AND UPPER(advisor_team.role) = 'ADVISOR'
        ORDER BY datetime(COALESCE(advisor_team.assigned_at, '1970-01-01')) DESC, advisor_team.id DESC
        LIMIT 1
      ) as advisor_name,
      (
        SELECT advisor.avatar
        FROM customer_team advisor_team
        LEFT JOIN users advisor ON advisor.id = advisor_team.user_id
        WHERE advisor_team.customer_id = c.id
          AND UPPER(advisor_team.role) = 'ADVISOR'
        ORDER BY datetime(COALESCE(advisor_team.assigned_at, '1970-01-01')) DESC, advisor_team.id DESC
        LIMIT 1
      ) as advisor_avatar,
      COALESCE(
        (
          SELECT advisor_org.name
          FROM customer_team advisor_team
          LEFT JOIN users advisor ON advisor.id = advisor_team.user_id
          LEFT JOIN org_units advisor_org ON advisor_org.id = advisor.org_unit_id AND advisor_org.deleted_at IS NULL
          WHERE advisor_team.customer_id = c.id
            AND UPPER(advisor_team.role) = 'ADVISOR'
          ORDER BY datetime(COALESCE(advisor_team.assigned_at, '1970-01-01')) DESC, advisor_team.id DESC
          LIMIT 1
        ),
        (
          SELECT inviter_org.name
          FROM org_units inviter_org
          WHERE inviter_org.id = inviter.org_unit_id AND inviter_org.deleted_at IS NULL
          LIMIT 1
        ),
        (
          SELECT creator_org.name
          FROM org_units creator_org
          WHERE creator_org.id = u.org_unit_id AND creator_org.deleted_at IS NULL
          LIMIT 1
        )
      ) as business_department_name,
      COALESCE((
        SELECT designer.name
        FROM customer_team designer_team
        LEFT JOIN users designer ON designer.id = designer_team.user_id
        WHERE designer_team.customer_id = c.id
          AND UPPER(designer_team.role) = 'DESIGNER'
        ORDER BY datetime(COALESCE(designer_team.assigned_at, '1970-01-01')) DESC, designer_team.id DESC
        LIMIT 1
      ), NULLIF(TRIM(COALESCE(c.designer_name_manual, '')), '')) as designer_name,
      (
        SELECT designer.avatar
        FROM customer_team designer_team
        LEFT JOIN users designer ON designer.id = designer_team.user_id
        WHERE designer_team.customer_id = c.id
          AND UPPER(designer_team.role) = 'DESIGNER'
        ORDER BY datetime(COALESCE(designer_team.assigned_at, '1970-01-01')) DESC, designer_team.id DESC
        LIMIT 1
      ) as designer_avatar,
      (
        SELECT designer_org.name
        FROM customer_team designer_team
        LEFT JOIN users designer ON designer.id = designer_team.user_id
        LEFT JOIN org_units designer_org ON designer_org.id = designer.org_unit_id AND designer_org.deleted_at IS NULL
        WHERE designer_team.customer_id = c.id
          AND UPPER(designer_team.role) = 'DESIGNER'
        ORDER BY datetime(COALESCE(designer_team.assigned_at, '1970-01-01')) DESC, designer_team.id DESC
        LIMIT 1
      ) as design_department_name,
      (
        SELECT latest_follow.created_at
        FROM follow_ups latest_follow
        WHERE latest_follow.customer_id = c.id
          AND latest_follow.deleted_at IS NULL
        ORDER BY datetime(COALESCE(latest_follow.created_at, '1970-01-01')) DESC, latest_follow.id DESC
        LIMIT 1
      ) as last_followup_at,
      (
        SELECT latest_follow.content
        FROM follow_ups latest_follow
        WHERE latest_follow.customer_id = c.id
          AND latest_follow.deleted_at IS NULL
        ORDER BY datetime(COALESCE(latest_follow.created_at, '1970-01-01')) DESC, latest_follow.id DESC
        LIMIT 1
      ) as latest_followup_content,
      (
        SELECT CASE
          WHEN latest_follow.next_date IS NOT NULL AND TRIM(latest_follow.next_date) != '' THEN latest_follow.next_date
          ELSE NULL
        END
        FROM follow_ups latest_follow
        WHERE latest_follow.customer_id = c.id
          AND latest_follow.deleted_at IS NULL
        ORDER BY datetime(COALESCE(latest_follow.created_at, '1970-01-01')) DESC, latest_follow.id DESC
        LIMIT 1
      ) as next_followup_at,
      (
        SELECT CASE
          WHEN latest_follow.next_date IS NOT NULL
            AND TRIM(latest_follow.next_date) != ''
            AND ${followupDueDateTimeSql("latest_follow.next_date")} < datetime('now', '+8 hours')
          THEN 1
          ELSE 0
        END
        FROM follow_ups latest_follow
        WHERE latest_follow.customer_id = c.id
          AND latest_follow.deleted_at IS NULL
        ORDER BY datetime(COALESCE(latest_follow.created_at, '1970-01-01')) DESC, latest_follow.id DESC
        LIMIT 1
      ) as has_overdue_followup,
      (
        SELECT CASE
          WHEN latest_follow.next_date IS NOT NULL
            AND TRIM(latest_follow.next_date) != ''
            AND ${followupDueDateTimeSql("latest_follow.next_date")} < datetime('now', '+8 hours')
          THEN CAST(julianday(datetime('now', '+8 hours')) - julianday(${followupDueDateTimeSql("latest_follow.next_date")}) AS INTEGER)
          ELSE 0
        END
        FROM follow_ups latest_follow
        WHERE latest_follow.customer_id = c.id
          AND latest_follow.deleted_at IS NULL
        ORDER BY datetime(COALESCE(latest_follow.created_at, '1970-01-01')) DESC, latest_follow.id DESC
        LIMIT 1
      ) as overdue_followup_days
    FROM customers c
    LEFT JOIN users u ON c.created_by_id = u.id
    LEFT JOIN users inviter ON c.inviter_id = inviter.id
    WHERE c.company_id = ? AND c.deleted_at IS NULL
    ORDER BY CASE WHEN last_followup_at IS NULL OR TRIM(COALESCE(last_followup_at, '')) = '' THEN 1 ELSE 0 END ASC,
      datetime(COALESCE(last_followup_at, '1970-01-01')) DESC,
      c.created_at DESC,
      c.id DESC
  `).all(currentUser.companyId) as Record<string, any>[], currentUser.userId);
  return NextResponse.json(customers);
}

function getCompanyRootId(db: any, orgUnitId?: string | null) {
  if (!orgUnitId) return null;
  let current = db.prepare("SELECT id, type, parent_id FROM org_units WHERE id = ? AND deleted_at IS NULL").get(orgUnitId) as any;
  while (current) {
    if (current.type === "company") return current.id;
    current = current.parent_id
      ? db.prepare("SELECT id, type, parent_id FROM org_units WHERE id = ? AND deleted_at IS NULL").get(current.parent_id)
      : null;
  }
  return null;
}

function isDescendantOf(db: any, orgUnitId: string | null | undefined, ancestorId: string) {
  if (!orgUnitId) return false;
  let current = db.prepare("SELECT id, parent_id FROM org_units WHERE id = ? AND deleted_at IS NULL").get(orgUnitId) as any;
  while (current) {
    if (current.id === ancestorId) return true;
    current = current.parent_id
      ? db.prepare("SELECT id, parent_id FROM org_units WHERE id = ? AND deleted_at IS NULL").get(current.parent_id)
      : null;
  }
  return false;
}

function validateInviterInSameCompany(db: any, currentUserId: string, inviterId?: string | null) {
  if (!inviterId) return null;
  const currentUser = db.prepare("SELECT id, company_id, org_unit_id FROM users WHERE id = ? AND deleted_at IS NULL").get(currentUserId) as any;
  const inviter = db.prepare("SELECT id, company_id, org_unit_id FROM users WHERE id = ? AND deleted_at IS NULL AND is_active = 1").get(inviterId) as any;
  if (!inviter) return "邀约人不存在或已停用";
  if (!currentUser?.company_id || inviter.company_id !== currentUser.company_id) return "邀约人必须选择同公司的员工";
  const companyRootId = getCompanyRootId(db, currentUser?.org_unit_id);
  if (!companyRootId) return null;
  if (!isDescendantOf(db, inviter.org_unit_id, companyRootId)) return "邀约人必须选择同分公司的员工";
  return null;
}

function isValidPhoneValue(phone: string) {
  return !phone || /^\d{11}$/.test(phone);
}

function toNullableCoordinate(value: unknown, min: number, max: number) {
  if (value === undefined || value === null || value === "") return { value: null, error: false };
  const numberValue = Number(value);
  return {
    value: Number.isFinite(numberValue) ? numberValue : null,
    error: !Number.isFinite(numberValue) || numberValue < min || numberValue > max,
  };
}

function validateServiceStoreActive(db: ReturnType<typeof getDb>, companyId: string, serviceStore?: string | null) {
  const storeName = String(serviceStore || "").trim();
  if (!storeName) return null;
  const rows = db.prepare(`
    SELECT id, COALESCE(is_active, 1) as is_active
    FROM org_units
    WHERE company_id = ? AND deleted_at IS NULL AND TRIM(COALESCE(name, '')) = ?
  `).all(companyId, storeName) as { id: string; is_active: number }[];
  if (rows.length === 0) return "服务门店不在系统组织架构中，请先维护门店";
  const hasActiveStore = rows.some((row) => Number(row.is_active ?? 1) === 1);
  return hasActiveStore ? null : "服务门店已停用，不能新增客户";
}

function validateCustomerOptionValue(label: string, value: unknown, options: string[]) {
  const text = String(value || "").trim();
  if (!text) return null;
  return options.includes(text) ? null : `${label}「${text}」不在系统选项中`;
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "未登录" }, { status: 401 });
  try {
    const body = await req.json();
    const createFromQuotation = body?.create_from_quotation === true || body?.create_from_quotation === "1";
    const canCreateCustomer = hasPermission(auth, "customers.create");
    const canCreateQuotationCustomer = createFromQuotation && hasPermission(auth, "quotations.manage");
    if (!canCreateCustomer && !canCreateQuotationCustomer) {
      return NextResponse.json({ message: "没有新增客户权限" }, { status: 403 });
    }
    const ipAddress = getRequestIp(req);
    const rows = Array.isArray(body?.customers) ? body.customers : null;
    if (rows) {
      if (!hasPermission(auth, "customers.import_export")) return NextResponse.json({ message: "没有客户导入权限" }, { status: 403 });
      const db = getDb();
      const insert = db.prepare(`
        INSERT INTO customers (id, company_id, name, phone, weixin, source, address, house_address,
          address_location_name, address_location_address, address_latitude, address_longitude,
          building_no, unit_no, room_no, no_room_number, area_size,
          house_type, decoration_type, budget, is_delivered, intention, requirements, remarks,
          service_store, current_action, status, created_by_id, inviter_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);
      const created: any[] = [];
      const errors: { row: number; message: string }[] = [];

      rows.forEach((item: any, index: number) => {
        const rowNumber = index + 2;
        const name = item.name?.trim();
        const phoneVal = item.phone?.trim() || "";
        const weixinVal = item.weixin?.trim() || "";
        const address = item.address?.trim();
        const areaSize = Number(item.area_size);
        const inviterId = item.inviter_id?.trim() || auth.userId;
        const latitude = toNullableCoordinate(item.address_latitude ?? item.site_latitude ?? item.latitude, -90, 90);
        const longitude = toNullableCoordinate(item.address_longitude ?? item.site_longitude ?? item.longitude, -180, 180);

        if (!name) {
          errors.push({ row: rowNumber, message: "客户姓名为必填项" });
          return;
        }
        if (!address) {
          errors.push({ row: rowNumber, message: "小区/楼盘为必填项" });
          return;
        }
        if (!areaSize || Number.isNaN(areaSize) || areaSize <= 0) {
          errors.push({ row: rowNumber, message: "装修面积必填且须大于0" });
          return;
        }
        if (!phoneVal && !weixinVal) {
          errors.push({ row: rowNumber, message: "手机号和微信号至少填一项" });
          return;
        }
        if (!isValidPhoneValue(phoneVal)) {
          errors.push({ row: rowNumber, message: "手机号必须为11位数字" });
          return;
        }
        const optionErrors = [
          validateCustomerOptionValue("客户来源", item.source, customerSourceOptions),
          validateCustomerOptionValue("客户意向", item.intention, customerIntentionOptions),
          validateCustomerOptionValue("户型", item.house_type, customerHouseTypeOptions),
          validateCustomerOptionValue("装修类型", item.decoration_type, customerDecorationTypeOptions),
          validateCustomerOptionValue("是否交房", item.is_delivered, customerDeliveryOptions),
        ].filter(Boolean);
        if (optionErrors.length > 0) {
          errors.push({ row: rowNumber, message: optionErrors.join("；") });
          return;
        }
        const inviterError = validateInviterInSameCompany(db, auth.userId, inviterId);
        if (inviterError) {
          errors.push({ row: rowNumber, message: inviterError });
          return;
        }
        const serviceStoreError = validateServiceStoreActive(db, auth.companyId, item.service_store);
        if (serviceStoreError) {
          errors.push({ row: rowNumber, message: serviceStoreError });
          return;
        }
        if (latitude.error || longitude.error) {
          errors.push({ row: rowNumber, message: "地址定位坐标无效" });
          return;
        }

        const id = `CUST${Date.now()}${index}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        insert.run(
          id, auth.companyId, name, phoneVal || "仅微信联系",
          weixinVal || null, item.source || null, address,
          item.house_address?.trim() || address,
          item.address_location_name?.trim() || address,
          item.address_location_address?.trim() || item.house_address?.trim() || address,
          latitude.value,
          longitude.value,
          item.building_no?.trim() || null,
          item.unit_no?.trim() || null,
          item.room_no?.trim() || null,
          item.no_room_number === true || item.no_room_number === "1" || item.no_room_number === 1 ? 1 : 0,
          areaSize, item.house_type || null, item.decoration_type || null,
          item.budget ? Number(item.budget) : null,
          item.is_delivered === "已交房" || item.is_delivered === "1" ? 1 : 0,
          item.intention || null, item.requirements || null, item.remarks || null,
          item.service_store || null, getCustomerProgressAction("NEW"), "NEW", auth.userId, inviterId
        );
        recordCustomerOperation(db, {
          userId: auth.userId,
          customerId: id,
          action: "customer.create.import",
          module: "客户资料",
          title: "导入客户",
          content: `通过导入创建客户「${name}」`,
          targetName: name,
          ipAddress,
        });
        created.push({ id, name });
      });
      return NextResponse.json({ created: created.length, errors }, { status: errors.length ? 207 : 201 });
    }

    const {
      name, phone, weixin, source, address, house_address,
      address_location_name, address_location_address, address_latitude, address_longitude,
      building_no, unit_no, room_no, no_room_number, area_size,
      house_type, decoration_type, budget, is_delivered,
      intention, requirements, remarks, service_store, inviter_id, designer_name,
    } = body;

    if (createFromQuotation) {
      const addressText = String(address || "").trim();
      if (!addressText) {
        return NextResponse.json({ message: "小区/楼盘为必填项" }, { status: 400 });
      }
      const phoneVal = phone?.trim() || "";
      const weixinVal = weixin?.trim() || "";
      if (!isValidPhoneValue(phoneVal)) {
        return NextResponse.json({ message: "手机号必须为11位数字" }, { status: 400 });
      }
      const latitude = toNullableCoordinate(address_latitude, -90, 90);
      const longitude = toNullableCoordinate(address_longitude, -180, 180);
      if (latitude.error || longitude.error) {
        return NextResponse.json({ message: "地址定位坐标无效" }, { status: 400 });
      }
      const db = getDb();
      ensureCustomerListIndexes(db);
      const finalInviterId = inviter_id || auth.userId;
      const inviterError = validateInviterInSameCompany(db, auth.userId, finalInviterId);
      if (inviterError) {
        return NextResponse.json({ message: inviterError }, { status: 400 });
      }
      const serviceStoreError = validateServiceStoreActive(db, auth.companyId, service_store);
      if (serviceStoreError) {
        return NextResponse.json({ message: serviceStoreError }, { status: 400 });
      }

      const customerName = String(name || "").trim() || "未命名客户";
      const manualDesignerName = String(designer_name || "").trim();
      const finalPhone = phoneVal || "仅微信联系";
      const areaSize = Number(area_size || 0);
      const id = `CUST${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

      db.prepare(`
        INSERT INTO customers (id, company_id, name, phone, weixin, source, address, house_address,
          address_location_name, address_location_address, address_latitude, address_longitude,
          building_no, unit_no, room_no, no_room_number, area_size,
          house_type, decoration_type, designer_name_manual, budget, is_delivered, intention, requirements, remarks,
          service_store, current_action, status, created_by_id, inviter_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, datetime('now'), datetime('now'))
      `).run(
        id, auth.companyId, customerName, finalPhone,
        weixinVal || null, source || null, addressText,
        house_address?.trim() || addressText,
        String(address_location_name || "").trim() || addressText,
        String(address_location_address || "").trim() || house_address?.trim() || addressText,
        latitude.value,
        longitude.value,
        building_no?.trim() || null,
        unit_no?.trim() || null,
        room_no?.trim() || null,
        no_room_number ? 1 : 0,
        Number.isFinite(areaSize) && areaSize > 0 ? areaSize : 0,
        house_type || null, decoration_type || null, manualDesignerName || null,
        budget ? Number(budget) : null, is_delivered === "已交房" ? 1 : 0,
        intention || null, requirements || null, remarks || null,
        service_store || null, getCustomerProgressAction("NEW"), auth.userId, finalInviterId
      );

      const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(id);
      recordCustomerOperation(db, {
        userId: auth.userId,
        customerId: id,
        action: "customer.create.from_quotation",
        module: "报价管理",
        title: "新建报价时新增客户",
        content: `新建报价时创建客户「${customerName}」`,
        targetName: customerName,
        ipAddress,
      });
      return NextResponse.json(customer, { status: 201 });
    }

    // Validate required fields
    if (!name?.trim()) {
      return NextResponse.json({ message: "客户姓名为必填项" }, { status: 400 });
    }
    if (!address?.trim()) {
      return NextResponse.json({ message: "小区/楼盘为必填项" }, { status: 400 });
    }
    if (!area_size || Number(area_size) <= 0) {
      return NextResponse.json({ message: "装修面积必填且须大于0" }, { status: 400 });
    }

    // Phone and weixin: at least one required
    const phoneVal = phone?.trim() || "";
    const weixinVal = weixin?.trim() || "";
    if (!phoneVal && !weixinVal) {
      return NextResponse.json({ message: "手机号和微信号至少填一项" }, { status: 400 });
    }
    if (!isValidPhoneValue(phoneVal)) {
      return NextResponse.json({ message: "手机号必须为11位数字" }, { status: 400 });
    }
    const latitude = toNullableCoordinate(address_latitude, -90, 90);
    const longitude = toNullableCoordinate(address_longitude, -180, 180);
    if (latitude.error || longitude.error) {
      return NextResponse.json({ message: "地址定位坐标无效" }, { status: 400 });
    }
    const db = getDb();
    ensureCustomerListIndexes(db);
    const finalInviterId = inviter_id || auth.userId;
    const inviterError = validateInviterInSameCompany(db, auth.userId, finalInviterId);
    if (inviterError) {
      return NextResponse.json({ message: inviterError }, { status: 400 });
    }
    const serviceStoreError = validateServiceStoreActive(db, auth.companyId, service_store);
    if (serviceStoreError) {
      return NextResponse.json({ message: serviceStoreError }, { status: 400 });
    }

    const id = `CUST${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    // If no phone provided, store a placeholder
    const finalPhone = phoneVal || "仅微信联系";

    db.prepare(`
      INSERT INTO customers (id, company_id, name, phone, weixin, source, address, house_address,
        address_location_name, address_location_address, address_latitude, address_longitude,
        building_no, unit_no, room_no, no_room_number, area_size,
        house_type, decoration_type, designer_name_manual, budget, is_delivered, intention, requirements, remarks,
        service_store, current_action, status, created_by_id, inviter_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NEW', ?, ?, datetime('now'), datetime('now'))
    `).run(
      id, auth.companyId, name.trim(), finalPhone,
      weixinVal || null, source || null, address.trim(),
      house_address?.trim() || address.trim(),
      String(address_location_name || "").trim() || address.trim(),
      String(address_location_address || "").trim() || house_address?.trim() || address.trim(),
      latitude.value,
      longitude.value,
      building_no?.trim() || null,
      unit_no?.trim() || null,
      room_no?.trim() || null,
      no_room_number ? 1 : 0,
      Number(area_size), house_type || null, decoration_type || null, String(designer_name || "").trim() || null,
      budget ? Number(budget) : null, is_delivered === "已交房" ? 1 : 0,
      intention || null, requirements || null, remarks || null,
      service_store || null, getCustomerProgressAction("NEW"), auth.userId, finalInviterId
    );

    const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(id);
    recordCustomerOperation(db, {
      userId: auth.userId,
      customerId: id,
      action: "customer.create",
      module: "客户资料",
      title: "新增客户",
      content: `创建客户「${name.trim()}」`,
      targetName: name.trim(),
      ipAddress,
    });
    return NextResponse.json(customer, { status: 201 });
  } catch {
    return NextResponse.json({ message: "创建失败" }, { status: 500 });
  }
}
