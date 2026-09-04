import { NextRequest, NextResponse } from "next/server";
import { customerStatusLabels, legacyCustomerStatusMap, normalizeCustomerStatus } from "@/lib/customerStatus";
import { getCustomerProgressAction, syncCustomerProgress } from "@/lib/customerProgress";
import { getRequestIp, recordCustomerOperation, type OperationChange } from "@/lib/operationLog";
import { canEditCustomers, canViewCustomers, getAuthContext } from "@/lib/security/authorization";

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

function validateServiceStoreCanReceiveNewData(db: any, companyId: string, serviceStore?: string | null, currentServiceStore?: string | null) {
  const nextStoreName = String(serviceStore || "").trim();
  const currentStoreName = String(currentServiceStore || "").trim();
  if (!nextStoreName || nextStoreName === currentStoreName) return null;
  const rows = db.prepare(`
    SELECT id, COALESCE(is_active, 1) as is_active
    FROM org_units
    WHERE company_id = ? AND deleted_at IS NULL AND TRIM(COALESCE(name, '')) = ?
  `).all(companyId, nextStoreName) as { id: string; is_active: number }[];
  if (rows.length === 0) return null;
  const hasActiveStore = rows.some((row) => Number(row.is_active ?? 1) === 1);
  return hasActiveStore ? null : "服务门店已停用，不能转入客户";
}

function normalizeLogValue(value: unknown) {
  return String(value ?? "").trim();
}

function followupDueDateTimeSql(expression: string) {
  const trimmed = `TRIM(COALESCE(${expression}, ''))`;
  return `CASE
    WHEN ${trimmed} = '' THEN NULL
    WHEN length(${trimmed}) <= 10 THEN datetime(${trimmed}, '+1 day')
    ELSE datetime(replace(${trimmed}, 'T', ' '))
  END`;
}

function formatEmptyLogValue(value: unknown) {
  const text = normalizeLogValue(value);
  return text || "未填写";
}

function formatPhoneLogValue(value: unknown) {
  const text = normalizeLogValue(value);
  if (!text || text === "仅微信联系") return text || "未填写";
  return /^(\d{3})\d{4}(\d{4})$/.test(text) ? text.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2") : text;
}

function formatMoneyLogValue(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return "未填写";
  return `${numberValue.toFixed(2)}元`;
}

function formatAreaLogValue(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) return "未填写";
  return `${numberValue}㎡`;
}

function formatBooleanLogValue(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "已交房" ? "是" : "否";
}

function formatDeliveredLogValue(value: unknown) {
  return formatBooleanLogValue(value) === "是" ? "已交房" : "未交房";
}

function formatNoRoomNumberLogValue(value: unknown) {
  return formatBooleanLogValue(value) === "是" ? "暂无房号" : "填写房号";
}

function formatStatusLogValue(value: unknown) {
  const status = normalizeCustomerStatus(normalizeLogValue(value));
  return customerStatusLabels[status] || status || "未填写";
}

function addOperationChange(
  changes: OperationChange[],
  label: string,
  before: unknown,
  after: unknown,
  formatter: (value: unknown) => string = formatEmptyLogValue,
) {
  const beforeValue = formatter(before);
  const afterValue = formatter(after);
  if (beforeValue !== afterValue) {
    changes.push({ label, before: beforeValue, after: afterValue });
  }
}

type CustomerMutationOperator = {
  id: string;
  company_id: string;
  name?: string | null;
  role?: string | null;
};

type CustomerMutationTarget = {
  id: string;
  company_id: string;
  service_store?: string | null;
  created_by_id?: string | null;
  inviter_id?: string | null;
};

function getActiveOperator(db: any, operatorId?: string | null, companyId?: string | null) {
  const id = String(operatorId || "").trim();
  if (!id) return null;
  const operator = db.prepare(`
    SELECT id, company_id, name, role
    FROM users
    WHERE id = ? AND company_id = ? AND deleted_at IS NULL AND COALESCE(is_active, 1) = 1
    LIMIT 1
  `).get(id, companyId || "") as CustomerMutationOperator | undefined;
  return operator || null;
}

function canManageCustomerMutation(db: any, operator: CustomerMutationOperator, customer: CustomerMutationTarget) {
  if (operator.company_id !== customer.company_id) return false;
  const isAdmin = ["OWNER", "ADMIN"].includes(String(operator.role || "").toUpperCase());
  if (isAdmin) return true;

  const isDirectOwner = [customer.created_by_id, customer.inviter_id].some((id) => id && id === operator.id);
  if (isDirectOwner) return true;

  const isTeamMember = Boolean(db.prepare(`
    SELECT 1
    FROM customer_team
    WHERE customer_id = ? AND user_id = ?
    LIMIT 1
  `).get(customer.id, operator.id));
  if (isTeamMember) return true;

  const isProjectManager = Boolean(db.prepare(`
    SELECT 1
    FROM projects
    WHERE customer_id = ? AND company_id = ? AND manager_id = ? AND deleted_at IS NULL
    LIMIT 1
  `).get(customer.id, customer.company_id, operator.id));
  if (isProjectManager) return true;

  return Boolean(String(customer.service_store || "").trim()) && Boolean(db.prepare(`
    WITH RECURSIVE managed_tree(id, name) AS (
      SELECT id, name
      FROM org_units
      WHERE manager_id = ? AND company_id = ? AND deleted_at IS NULL
      UNION
      SELECT child.id, child.name
      FROM org_units child
      INNER JOIN managed_tree parent ON child.parent_id = parent.id
      WHERE child.company_id = ? AND child.deleted_at IS NULL
    )
    SELECT 1
    FROM managed_tree
    WHERE TRIM(COALESCE(name, '')) = TRIM(COALESCE(?, ''))
    LIMIT 1
  `).get(operator.id, customer.company_id, customer.company_id, customer.service_store));
}

export async function GET(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  try {
    const auth = getAuthContext(req);
    if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
    if (!canViewCustomers(auth)) return NextResponse.json({ message: "没有客户查看权限" }, { status: 403 });

    const { getDb } = await import("@/lib/db");
    const db = getDb();
    const operator = getActiveOperator(db, auth.userId, auth.companyId);
    if (!operator) {
      return NextResponse.json({ message: "登录已失效，请重新登录" }, { status: 401 });
    }

    const customer = db.prepare(`
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
        (
          SELECT designer.name
          FROM customer_team designer_team
          LEFT JOIN users designer ON designer.id = designer_team.user_id
          WHERE designer_team.customer_id = c.id
            AND UPPER(designer_team.role) = 'DESIGNER'
          ORDER BY datetime(COALESCE(designer_team.assigned_at, '1970-01-01')) DESC, designer_team.id DESC
          LIMIT 1
        ) as designer_name,
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
          WHEN TRIM(COALESCE(c.service_store, '')) = '' THEN 1
          WHEN EXISTS (
            SELECT 1 FROM org_units store
            WHERE store.company_id = c.company_id AND store.deleted_at IS NULL AND TRIM(COALESCE(store.name, '')) = TRIM(c.service_store)
          ) THEN (
            SELECT MAX(COALESCE(store.is_active, 1))
            FROM org_units store
            WHERE store.company_id = c.company_id AND store.deleted_at IS NULL AND TRIM(COALESCE(store.name, '')) = TRIM(c.service_store)
          )
          ELSE 1
        END as service_store_is_active
      FROM customers c
      LEFT JOIN users u ON c.created_by_id = u.id
      LEFT JOIN users inviter ON c.inviter_id = inviter.id
      WHERE c.id = ? AND c.company_id = ? AND c.deleted_at IS NULL
      LIMIT 1
    `).get(params.id, auth.companyId) as (Record<string, any> & CustomerMutationTarget) | undefined;

    if (!customer) {
      return NextResponse.json({ message: "客户不存在或已删除" }, { status: 404 });
    }
    if (!canManageCustomerMutation(db, operator, customer)) {
      return NextResponse.json({ message: "无权查看该客户" }, { status: 403 });
    }

    syncCustomerProgress(db, params.id);
    const refreshedProgress = db.prepare("SELECT status, current_action FROM customers WHERE id = ? AND company_id = ? AND deleted_at IS NULL")
      .get(params.id, auth.companyId) as { status?: string | null; current_action?: string | null } | undefined;
    return NextResponse.json({ ...customer, ...refreshedProgress });
  } catch {
    return NextResponse.json({ message: "客户详情加载失败" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  try {
    const auth = getAuthContext(req);
    if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
    if (!canEditCustomers(auth)) return NextResponse.json({ message: "没有客户编辑权限" }, { status: 403 });

    const body = await req.json();
    const { status, current_action } = body;
    const normalizedStatus = status ? legacyCustomerStatusMap[status] ?? status : null;
    if (normalizedStatus && !["NEW", "CONTACTED", "INVITED", "MEASURED", "DEPOSITED", "PROPOSAL", "SIGNED", "LOST"].includes(normalizedStatus)) {
      return NextResponse.json({ message: "无效的客户状态" }, { status: 400 });
    }
    
    const { getDb } = await import("@/lib/db");
    const db = getDb();
    const operatorId = auth.userId;
    const operator = getActiveOperator(db, auth.userId, auth.companyId);
    if (!operator) return NextResponse.json({ message: "登录已失效，请重新登录" }, { status: 401 });
    const ipAddress = getRequestIp(req);

    if (body?.restore_deleted === true) {
      const deletedCustomer = db.prepare(`
        SELECT c.*
        FROM customers c
        WHERE c.id = ? AND c.company_id = ? AND c.deleted_at IS NOT NULL
        LIMIT 1
      `).get(params.id, auth.companyId) as (Record<string, any> & CustomerMutationTarget & { name?: string | null; status?: string | null }) | undefined;
      if (!deletedCustomer) {
        return NextResponse.json({ message: "客户不存在或未删除" }, { status: 404 });
      }
      if (!canManageCustomerMutation(db, operator, deletedCustomer)) {
        return NextResponse.json({ message: "无权恢复该客户" }, { status: 403 });
      }

      const customerStatus = normalizeCustomerStatus(deletedCustomer.status);
      const tx = (db as any).transaction(() => {
        db.prepare("UPDATE customers SET deleted_at = NULL, updated_at = datetime('now') WHERE id = ? AND company_id = ?")
          .run(deletedCustomer.id, auth.companyId);
        recordCustomerOperation(db, {
          userId: operator.id,
          customerId: deletedCustomer.id,
          action: "customer.restore",
          module: "客户资料",
          title: "恢复已删除客户",
          content: `将客户「${deletedCustomer.name || "未命名客户"}」恢复到客户列表`,
          targetName: deletedCustomer.name || "",
          changes: [{
            label: "删除状态",
            before: "已删除",
            after: "已恢复",
          }],
          metadata: {
            customerStatus,
            restoredFromDeleted: true,
          },
          ipAddress,
        });
      });
      tx();

      return NextResponse.json({ success: true, status: customerStatus });
    }
    
    const existing = db.prepare(`
      SELECT
        c.*,
        inviter.name as inviter_name
      FROM customers c
      LEFT JOIN users inviter ON c.inviter_id = inviter.id
      WHERE c.id = ? AND c.company_id = ? AND c.deleted_at IS NULL
      LIMIT 1
    `).get(params.id, auth.companyId) as
      | (Record<string, any> & { id: string; company_id: string; status: string | null; current_action: string | null; service_store: string | null; inviter_name?: string | null })
      | undefined;
    if (!existing) {
      return NextResponse.json({ message: "客户不存在" }, { status: 404 });
    }
    if (!canManageCustomerMutation(db, operator, existing)) {
      return NextResponse.json({ message: "无权编辑该客户" }, { status: 403 });
    }

    const statusOnlyFields = new Set(["status", "current_action"]);
    const isProfileUpdate = Object.keys(body).some((key) => !statusOnlyFields.has(key));
    const existingStatus = normalizeCustomerStatus(existing.status);

    if (isProfileUpdate) {
      if (existingStatus === "SIGNED") {
        return NextResponse.json({ message: "签约客户资料不允许编辑" }, { status: 400 });
      }

      const {
        name, phone, weixin, source, address, house_address,
        address_location_name, address_location_address, address_latitude, address_longitude,
        building_no, unit_no, room_no, no_room_number, area_size,
        house_type, decoration_type, budget, is_delivered,
        intention, requirements, remarks, service_store, inviter_id,
      } = body;

      if (!name?.trim()) {
        return NextResponse.json({ message: "客户姓名为必填项" }, { status: 400 });
      }
      if (!address?.trim()) {
        return NextResponse.json({ message: "小区/楼盘为必填项" }, { status: 400 });
      }
      if (!area_size || Number(area_size) <= 0) {
        return NextResponse.json({ message: "装修面积必填且须大于0" }, { status: 400 });
      }

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
      const serviceStoreError = validateServiceStoreCanReceiveNewData(db, auth.companyId, service_store, existing.service_store);
      if (serviceStoreError) {
        return NextResponse.json({ message: serviceStoreError }, { status: 400 });
      }

      const nextName = name.trim();
      const nextPhone = phoneVal || "仅微信联系";
      const nextWeixin = weixinVal || null;
      const nextSource = source || null;
      const nextAddress = address.trim();
      const nextHouseAddress = house_address?.trim() || address.trim();
      const nextAddressLocationName = String(address_location_name || "").trim() || nextAddress;
      const nextAddressLocationAddress = String(address_location_address || "").trim() || nextHouseAddress || nextAddress;
      const nextAddressLatitude = latitude.value;
      const nextAddressLongitude = longitude.value;
      const nextBuildingNo = building_no?.trim() || null;
      const nextUnitNo = unit_no?.trim() || null;
      const nextRoomNo = room_no?.trim() || null;
      const nextNoRoomNumber = no_room_number ? 1 : 0;
      const nextAreaSize = Number(area_size);
      const nextHouseType = house_type || null;
      const nextDecorationType = decoration_type || null;
      const nextBudget = budget ? Number(budget) : null;
      const nextIsDelivered = is_delivered === true || is_delivered === 1 || is_delivered === "1" || is_delivered === "已交房" ? 1 : 0;
      const nextIntention = intention || null;
      const nextRequirements = requirements || null;
      const nextRemarks = remarks || null;
      const nextServiceStore = service_store || null;
      const nextInviterId = inviter_id || null;
      const nextInviter = nextInviterId
        ? (db.prepare("SELECT name FROM users WHERE id = ? AND company_id = ? AND deleted_at IS NULL LIMIT 1")
          .get(nextInviterId, auth.companyId) as { name?: string | null } | undefined)
        : null;
      if (nextInviterId && !nextInviter) return NextResponse.json({ message: "邀约人不存在" }, { status: 400 });
      const changes: OperationChange[] = [];
      addOperationChange(changes, "客户姓名", existing.name, nextName);
      addOperationChange(changes, "手机号", existing.phone, nextPhone, formatPhoneLogValue);
      addOperationChange(changes, "微信号", existing.weixin, nextWeixin);
      addOperationChange(changes, "客户来源", existing.source, nextSource);
      addOperationChange(changes, "小区/楼盘", existing.address, nextAddress);
      addOperationChange(changes, "房屋地址", existing.house_address, nextHouseAddress);
      addOperationChange(changes, "地址定位", existing.address_latitude && existing.address_longitude ? "已选点" : "未选点", nextAddressLatitude !== null && nextAddressLongitude !== null ? "已选点" : "未选点");
      addOperationChange(changes, "楼栋", existing.building_no, nextBuildingNo);
      addOperationChange(changes, "单元", existing.unit_no, nextUnitNo);
      addOperationChange(changes, "房号", existing.room_no, nextRoomNo);
      addOperationChange(changes, "房号状态", existing.no_room_number, nextNoRoomNumber, formatNoRoomNumberLogValue);
      addOperationChange(changes, "装修面积", existing.area_size, nextAreaSize, formatAreaLogValue);
      addOperationChange(changes, "户型", existing.house_type, nextHouseType);
      addOperationChange(changes, "装修类型", existing.decoration_type, nextDecorationType);
      addOperationChange(changes, "预算", existing.budget, nextBudget, formatMoneyLogValue);
      addOperationChange(changes, "交房状态", existing.is_delivered, nextIsDelivered, formatDeliveredLogValue);
      addOperationChange(changes, "意向度", existing.intention, nextIntention);
      addOperationChange(changes, "装修需求", existing.requirements, nextRequirements);
      addOperationChange(changes, "备注说明", existing.remarks, nextRemarks);
      addOperationChange(changes, "服务门店", existing.service_store, nextServiceStore);
      addOperationChange(changes, "邀约人", existing.inviter_name || existing.inviter_id, nextInviter?.name || nextInviterId);

      db.prepare(`
        UPDATE customers SET
          name = ?, phone = ?, weixin = ?, source = ?, address = ?, house_address = ?,
          address_location_name = ?, address_location_address = ?, address_latitude = ?, address_longitude = ?,
          building_no = ?, unit_no = ?, room_no = ?, no_room_number = ?, area_size = ?,
          house_type = ?, decoration_type = ?, budget = ?, is_delivered = ?,
          intention = ?, requirements = ?, remarks = ?, service_store = ?, inviter_id = ?,
          updated_at = datetime('now')
        WHERE id = ? AND company_id = ?
      `).run(
        nextName,
        nextPhone,
        nextWeixin,
        nextSource,
        nextAddress,
        nextHouseAddress,
        nextAddressLocationName,
        nextAddressLocationAddress,
        nextAddressLatitude,
        nextAddressLongitude,
        nextBuildingNo,
        nextUnitNo,
        nextRoomNo,
        nextNoRoomNumber,
        nextAreaSize,
        nextHouseType,
        nextDecorationType,
        nextBudget,
        nextIsDelivered,
        nextIntention,
        nextRequirements,
        nextRemarks,
        nextServiceStore,
        nextInviterId,
        params.id,
        auth.companyId,
      );

      const updated = db.prepare(`
        SELECT c.*, u.name as created_by_name, u.avatar as created_by_avatar, inviter.name as inviter_name, inviter.avatar as inviter_avatar
        FROM customers c
        LEFT JOIN users u ON c.created_by_id = u.id
        LEFT JOIN users inviter ON c.inviter_id = inviter.id
        WHERE c.id = ? AND c.company_id = ?
      `).get(params.id, auth.companyId);
      recordCustomerOperation(db, {
        userId: operatorId,
        customerId: params.id,
        action: "customer.profile.update",
        module: "客户资料",
        title: "更新客户资料",
        content: changes.length
          ? `修改了客户「${nextName}」的${changes.slice(0, 4).map((item) => item.label).join("、")}${changes.length > 4 ? `等 ${changes.length} 项资料` : ""}`
          : `保存了客户「${nextName}」的基础资料，内容未发生变化`,
        targetName: nextName,
        changes,
        ipAddress,
      });
      return NextResponse.json(updated);
    }

    if (status === undefined && current_action === undefined) {
      return NextResponse.json({ message: "客户进度由系统根据操作自动判断" }, { status: 400 });
    }

    if (status === undefined) {
      return NextResponse.json({ message: "当前动作由系统根据客户进度自动生成" }, { status: 400 });
    }

    if (normalizedStatus === "LOST") {
      const nextAction = current_action || "失败/流失";
      const changes: OperationChange[] = [];
      addOperationChange(changes, "客户进度", existing.status, "LOST", formatStatusLogValue);
      addOperationChange(changes, "当前动作", existing.current_action, nextAction);
      db.prepare("UPDATE customers SET status = 'LOST', current_action = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?")
        .run(nextAction, params.id, auth.companyId);
      recordCustomerOperation(db, {
        userId: operatorId,
        customerId: params.id,
        action: "customer.status.lost",
        module: "客户进度",
        title: "标记客户失败/流失",
        content: `将客户标记为失败/流失，原因：${nextAction}`,
        changes,
        ipAddress,
      });
      return NextResponse.json({ success: true, status: "LOST" });
    }

    const isRecoveringCustomer = existingStatus === "LOST";
    const nextStatus = syncCustomerProgress(db, params.id, { force: isRecoveringCustomer }) || normalizedStatus || "NEW";
    const nextAction = getCustomerProgressAction(nextStatus);
    if (nextStatus === "LOST") {
      db.prepare("UPDATE customers SET status = ?, current_action = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?")
        .run(normalizedStatus || "NEW", getCustomerProgressAction(normalizedStatus || "NEW"), params.id, auth.companyId);
    }
    const changes: OperationChange[] = [];
    addOperationChange(changes, "客户进度", existing.status, nextStatus, formatStatusLogValue);
    addOperationChange(changes, "当前动作", existing.current_action, nextAction);
    recordCustomerOperation(db, {
      userId: operatorId,
      customerId: params.id,
      action: isRecoveringCustomer ? "customer.status.recover" : "customer.status.update",
      module: "客户进度",
      title: isRecoveringCustomer ? "恢复客户" : "更新客户进度",
      content: isRecoveringCustomer
        ? "将失败/流失客户恢复到跟进流程"
        : `客户进度更新为：${nextStatus}`,
      changes,
      ipAddress,
    });
      
    return NextResponse.json({ success: true, status: nextStatus });
  } catch {
    return NextResponse.json({ message: "更新失败" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  try {
    const auth = getAuthContext(req);
    if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
    if (!canEditCustomers(auth)) return NextResponse.json({ message: "没有客户删除权限" }, { status: 403 });

    const { getDb } = await import("@/lib/db");
    const db = getDb();
    const operator = getActiveOperator(db, auth.userId, auth.companyId);
    if (!operator) {
      return NextResponse.json({ message: "登录已失效，请重新登录" }, { status: 401 });
    }

    const customer = db.prepare(`
      SELECT
        c.*,
        (SELECT COUNT(*) FROM projects p WHERE p.customer_id = c.id AND p.deleted_at IS NULL) as project_count,
        (
          SELECT COUNT(*)
          FROM quotations q
          INNER JOIN projects p ON p.id = q.project_id
          WHERE p.customer_id = c.id AND q.deleted_at IS NULL
        ) as quotation_count,
        (
          SELECT COUNT(*)
          FROM contracts ct
          INNER JOIN projects p ON p.id = ct.project_id
          WHERE p.customer_id = c.id AND ct.deleted_at IS NULL
        ) as contract_count,
        (
          SELECT COUNT(*)
          FROM customer_deposit_records deposit
          WHERE deposit.customer_id = c.id AND deposit.deleted_at IS NULL
        ) as deposit_count
      FROM customers c
      WHERE c.id = ? AND c.company_id = ? AND c.deleted_at IS NULL
      LIMIT 1
    `).get(params.id, auth.companyId) as
      | (Record<string, any> & {
        id: string;
        company_id: string;
        name?: string | null;
        status?: string | null;
        current_action?: string | null;
        service_store?: string | null;
        created_by_id?: string | null;
        inviter_id?: string | null;
      })
      | undefined;
    if (!customer) {
      return NextResponse.json({ message: "客户不存在或已删除" }, { status: 404 });
    }

    const customerStatus = normalizeCustomerStatus(customer.status);
    if (customerStatus !== "LOST") {
      return NextResponse.json({ message: "只有失败/流失客户支持删除" }, { status: 400 });
    }

    if (!canManageCustomerMutation(db, operator, customer)) {
      return NextResponse.json({ message: "无权删除该客户" }, { status: 403 });
    }

    const tx = (db as any).transaction(() => {
      db.prepare("UPDATE customers SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND company_id = ? AND deleted_at IS NULL")
        .run(customer.id, auth.companyId);
      recordCustomerOperation(db, {
        userId: operator.id,
        customerId: customer.id,
        action: "customer.delete",
        module: "客户资料",
        title: "删除失败/流失客户",
        content: `将失败/流失客户「${customer.name || "未命名客户"}」移出客户列表`,
        targetName: customer.name || "",
        changes: [{
          label: "客户状态",
          before: customerStatusLabels[customerStatus] || "失败/流失",
          after: "已删除",
        }],
        metadata: {
          customerStatus,
          currentAction: customer.current_action || "",
          projectCount: Number(customer.project_count || 0),
          quotationCount: Number(customer.quotation_count || 0),
          contractCount: Number(customer.contract_count || 0),
          depositCount: Number(customer.deposit_count || 0),
        },
        ipAddress: getRequestIp(req),
      });
    });
    tx();

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ message: "删除失败" }, { status: 500 });
  }
}
