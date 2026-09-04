import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { syncCustomerProgress } from "@/lib/customerProgress";
import { getRequestIp, recordCustomerOperation } from "@/lib/operationLog";
import { ensureSiteNodeEventTables, parseSiteNodeAttachmentCategory, recordSiteNodeEvent } from "@/lib/siteNodeEvents";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import {
  canEditCustomers,
  canManageMaterials,
  canManageOrganization,
  canManageTeam,
  canViewCustomers,
  customerBelongsToCompany,
  getAuthContext,
  hasPermission,
  orgBelongsToCompany,
  projectBelongsToCompany,
} from "@/lib/security/authorization";

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_UPLOAD_BYTES + 1024 * 1024;
const SAFE_BUSINESS_ID = /^[A-Za-z0-9_-]{1,100}$/;
const ALLOWED_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".heic", ".heif",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".csv", ".txt",
  ".dwg", ".dxf", ".zip", ".rar", ".7z", ".mp4", ".mov",
]);
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".tif", ".tiff", ".heic", ".heif"]);

function hasPrefix(buffer: Buffer, bytes: number[]) {
  return bytes.every((value, index) => buffer[index] === value);
}

function hasAscii(buffer: Buffer, offset: number, value: string) {
  return buffer.subarray(offset, offset + value.length).toString("ascii") === value;
}

function hasAllowedSignature(buffer: Buffer, extension: string) {
  if (extension === ".jpg" || extension === ".jpeg") return hasPrefix(buffer, [0xff, 0xd8, 0xff]);
  if (extension === ".png") return hasPrefix(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (extension === ".gif") return hasAscii(buffer, 0, "GIF87a") || hasAscii(buffer, 0, "GIF89a");
  if (extension === ".webp") return hasAscii(buffer, 0, "RIFF") && hasAscii(buffer, 8, "WEBP");
  if (extension === ".bmp") return hasAscii(buffer, 0, "BM");
  if (extension === ".tif" || extension === ".tiff") return hasPrefix(buffer, [0x49, 0x49, 0x2a, 0x00]) || hasPrefix(buffer, [0x4d, 0x4d, 0x00, 0x2a]);
  if (extension === ".heic" || extension === ".heif") return hasAscii(buffer, 4, "ftyp");
  if (extension === ".pdf") return hasAscii(buffer, 0, "%PDF-");
  if ([".docx", ".xlsx", ".pptx", ".zip"].includes(extension)) return hasPrefix(buffer, [0x50, 0x4b]);
  if ([".doc", ".xls", ".ppt"].includes(extension)) return hasPrefix(buffer, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if (extension === ".rar") return hasAscii(buffer, 0, "Rar!");
  if (extension === ".7z") return hasPrefix(buffer, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]);
  if (extension === ".dwg") return hasAscii(buffer, 0, "AC10");
  if (extension === ".mp4" || extension === ".mov") return hasAscii(buffer, 4, "ftyp");
  if ([".csv", ".txt", ".dxf"].includes(extension)) return !buffer.subarray(0, 1024).includes(0);
  return false;
}

function validateLocalFile(file: File, buffer: Buffer, imageOnly = false) {
  const originalName = path.basename(String(file.name || "")).trim();
  const extension = path.extname(originalName).toLowerCase();
  if (!originalName || originalName.length > 180) return "文件名无效或过长";
  if (!ALLOWED_EXTENSIONS.has(extension)) return "不支持该文件类型";
  if (imageOnly && !IMAGE_EXTENSIONS.has(extension)) return "这里只能上传图片文件";
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) return "文件大小必须在 20MB 以内";
  if (buffer.length !== file.size || !hasAllowedSignature(buffer, extension)) return "文件内容与文件类型不一致";
  return null;
}

function normalizeBusinessId(value: FormDataEntryValue | null) {
  const id = String(value || "").trim();
  return id && SAFE_BUSINESS_ID.test(id) ? id : "";
}

function safeFileName(name: string) {
  return path.basename(name).replace(/[^a-zA-Z0-9._\u4e00-\u9fa5-]/g, "_").slice(-180) || "file";
}

function makeAttachmentId() {
  return `ATT${Date.now()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function normalizeExternalUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function ensureAttachmentTable(db: ReturnType<typeof getDb>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      project_id TEXT REFERENCES projects(id),
      customer_id TEXT REFERENCES customers(id),
      followup_id TEXT REFERENCES follow_ups(id),
      user_id TEXT REFERENCES users(id),
      file_name TEXT NOT NULL,
      file_url TEXT NOT NULL,
      file_size INTEGER,
      mime_type TEXT,
      category TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  const columns = db.prepare("PRAGMA table_info(attachments)").all() as { name: string }[];
  if (!columns.some((item) => item.name === "customer_id")) {
    db.prepare("ALTER TABLE attachments ADD COLUMN customer_id TEXT REFERENCES customers(id)").run();
  }
  if (!columns.some((item) => item.name === "followup_id")) {
    db.prepare("ALTER TABLE attachments ADD COLUMN followup_id TEXT REFERENCES follow_ups(id)").run();
  }
  if (!columns.some((item) => item.name === "user_id")) {
    db.prepare("ALTER TABLE attachments ADD COLUMN user_id TEXT REFERENCES users(id)").run();
  }
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_attachments_project ON attachments(project_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_customer ON attachments(customer_id);
    CREATE INDEX IF NOT EXISTS idx_attachments_followup ON attachments(followup_id);
  `);
}

function selectAttachment(db: ReturnType<typeof getDb>, id: string) {
  return db.prepare(`
    SELECT a.*, uploader.name AS uploader_name
    FROM attachments a
    LEFT JOIN users uploader ON uploader.id = a.user_id
    WHERE a.id = ?
  `).get(id);
}

function getProjectCustomerId(db: ReturnType<typeof getDb>, projectId?: string | null) {
  const id = String(projectId || "").trim();
  if (!id) return "";
  const row = db.prepare("SELECT customer_id FROM projects WHERE id = ? AND deleted_at IS NULL LIMIT 1").get(id) as
    | { customer_id?: string | null }
    | undefined;
  return String(row?.customer_id || "").trim();
}

function getAttachmentCustomerId(db: ReturnType<typeof getDb>, file: any) {
  const customerId = String(file?.customer_id || "").trim();
  if (customerId) return customerId;
  return getProjectCustomerId(db, file?.project_id);
}

function attachmentBelongsToCompany(db: ReturnType<typeof getDb>, file: any, companyId: string) {
  const customerId = String(file?.customer_id || "").trim();
  if (customerId) {
    return Boolean(db.prepare("SELECT id FROM customers WHERE id = ? AND company_id = ? AND deleted_at IS NULL LIMIT 1")
      .get(customerId, companyId));
  }
  const projectId = String(file?.project_id || "").trim();
  if (projectId) {
    return Boolean(db.prepare("SELECT id FROM projects WHERE id = ? AND company_id = ? AND deleted_at IS NULL LIMIT 1")
      .get(projectId, companyId));
  }
  return false;
}

function getLocalAttachmentPath(fileUrl?: string | null) {
  const value = String(fileUrl || "").trim();
  if (!value.startsWith("/uploads/customers/") && !value.startsWith("/uploads/projects/")) return null;
  const uploadRoot = path.resolve(process.cwd(), "public", "uploads");
  const absolutePath = path.resolve(process.cwd(), "public", value.replace(/^\/+/, ""));
  return absolutePath.startsWith(`${uploadRoot}${path.sep}`) ? absolutePath : null;
}

function getAttachmentModule(file: { customer_id?: string | null; project_id?: string | null }) {
  return file.project_id && !file.customer_id ? "工地资料" : "客户资料";
}

function getAttachmentActionLabel(category?: string | null) {
  const text = String(category || "资料").trim();
  if (text.startsWith("量房资料")) return "量房资料";
  if (text.startsWith("设计方案") || text.startsWith("设计图纸")) return "设计方案";
  if (text.startsWith("工地归档-")) return text.replace(/^工地归档-/, "") || "归档资料";
  return text || "资料";
}

function isHandoverAttachmentCategory(category?: string | null) {
  return String(category || "").trim() === "开工交底资料";
}

function isProjectHandoverCompleted(db: ReturnType<typeof getDb>, projectId?: string | null) {
  const id = String(projectId || "").trim();
  if (!id) return false;
  const table = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'site_start_handovers'").get() as any;
  if (!table) return false;
  const handover = db.prepare(`
    SELECT status, completed_at
    FROM site_start_handovers
    WHERE project_id = ? AND deleted_at IS NULL
    ORDER BY datetime(COALESCE(updated_at, created_at, '1970-01-01')) DESC
    LIMIT 1
  `).get(id) as any;
  return Boolean(String(handover?.status || "").toLowerCase() === "completed" || handover?.completed_at);
}

function rejectCompletedHandoverAttachmentChange(db: ReturnType<typeof getDb>, projectId?: string | null, category?: string | null) {
  if (!isHandoverAttachmentCategory(category)) return null;
  if (!isProjectHandoverCompleted(db, projectId)) return null;
  return NextResponse.json({ message: "开工交底已完成，只能查看，不能修改资料" }, { status: 409 });
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_MULTIPART_BYTES) return NextResponse.json({ message: "文件大小必须在 20MB 以内" }, { status: 413 });
  try {
    const userId = auth.userId;
    const formData = await req.formData();
    const fileValue = formData.get("file");
    const file = fileValue && typeof fileValue === "object" && "arrayBuffer" in fileValue ? fileValue as File : null;
    const linkUrl = String(formData.get("link_url") || "").trim();
    const linkName = String(formData.get("link_name") || "").trim();
    const projectId = normalizeBusinessId(formData.get("project_id"));
    const orgUnitId = normalizeBusinessId(formData.get("org_unit_id"));
    const customerId = normalizeBusinessId(formData.get("customer_id"));
    const materialId = normalizeBusinessId(formData.get("material_id"));
    const avatarUserId = normalizeBusinessId(formData.get("avatar_user_id"));
    const skipAttachment = formData.get("skip_attachment") === "1";
    const category = String(formData.get("category") || "通用").trim().slice(0, 80) || "通用";
    const nodeCategory = parseSiteNodeAttachmentCategory(category);
    const eventStageId = normalizeBusinessId(formData.get("stage_id")) || nodeCategory?.stageId || "";
    const eventStageName = String(formData.get("stage_name") || "").trim().slice(0, 100);
    const eventNodeId = normalizeBusinessId(formData.get("node_id")) || nodeCategory?.nodeId || "";
    const eventNodeName = String(formData.get("node_name") || "").trim().slice(0, 100);
    const eventNodeType = String(formData.get("node_type") || "construction").trim().slice(0, 30);
    const targets = [projectId, orgUnitId, customerId, materialId, avatarUserId].filter(Boolean);
    
    if ((!file && !linkUrl) || targets.length !== 1) {
      return NextResponse.json({ message: "文件和业务ID不能为空" }, { status: 400 });
    }

    const db = getDb();
    ensureAttachmentTable(db);
    ensureSiteNodeEventTables(db);
    if (projectId && (!canEditCustomers(auth) || !projectBelongsToCompany(auth, projectId))) {
      return NextResponse.json({ message: canEditCustomers(auth) ? "工地不存在" : "没有工地资料上传权限" }, { status: canEditCustomers(auth) ? 404 : 403 });
    }
    if (customerId && (!canEditCustomers(auth) || !customerBelongsToCompany(auth, customerId))) {
      return NextResponse.json({ message: canEditCustomers(auth) ? "客户不存在" : "没有客户资料上传权限" }, { status: canEditCustomers(auth) ? 404 : 403 });
    }
    if (orgUnitId && (!canManageOrganization(auth) && !hasPermission(auth, "settings.manage"))) {
      return NextResponse.json({ message: "没有分公司资料上传权限" }, { status: 403 });
    }
    if (orgUnitId && !orgBelongsToCompany(auth, orgUnitId)) return NextResponse.json({ message: "组织不存在" }, { status: 404 });
    if (materialId) {
      if (!canManageMaterials(auth)) return NextResponse.json({ message: "没有材料图片上传权限" }, { status: 403 });
      const material = db.prepare("SELECT id FROM materials WHERE id = ? AND company_id = ? AND deleted_at IS NULL LIMIT 1")
        .get(materialId, auth.companyId);
      if (!material) return NextResponse.json({ message: "材料不存在" }, { status: 404 });
    }
    if (avatarUserId) {
      if (avatarUserId !== auth.userId && !canManageTeam(auth)) return NextResponse.json({ message: "只能修改自己的头像" }, { status: 403 });
      const user = db.prepare("SELECT id FROM users WHERE id = ? AND company_id = ? AND deleted_at IS NULL LIMIT 1")
        .get(avatarUserId, auth.companyId);
      if (!user) return NextResponse.json({ message: "员工不存在或已删除" }, { status: 404 });
    }

    if (avatarUserId && linkUrl) {
      return NextResponse.json({ message: "头像不支持链接上传，请选择本地图片" }, { status: 400 });
    }

    if (linkUrl && !projectId && !customerId) {
      return NextResponse.json({ message: "在线链接只支持客户或工地资料" }, { status: 400 });
    }

    if (projectId && isHandoverAttachmentCategory(category)) {
      const lockedResponse = rejectCompletedHandoverAttachmentChange(db, projectId, category);
      if (lockedResponse) return lockedResponse;
    }

    if (linkUrl) {
      const normalizedUrl = normalizeExternalUrl(linkUrl);
      try {
        const parsed = new URL(normalizedUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return NextResponse.json({ message: "链接只支持 http 或 https" }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ message: "请输入正确的链接地址" }, { status: 400 });
      }
      const id = makeAttachmentId();
      const fileName = linkName?.trim() || "效果图链接";
      db.prepare(`
        INSERT INTO attachments (id, project_id, customer_id, user_id, file_name, file_url, file_size, mime_type, category, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(id, projectId || null, customerId || null, userId, fileName, normalizedUrl, 0, "text/uri-list", category);
      const operationCustomerId = customerId || getProjectCustomerId(db, projectId);
      if (operationCustomerId) syncCustomerProgress(db, operationCustomerId);
      if (operationCustomerId) {
        recordCustomerOperation(db, {
          userId,
          customerId: operationCustomerId,
          action: "customer.attachment.link_create",
          module: getAttachmentModule({ customer_id: customerId, project_id: projectId }),
          title: `添加${getAttachmentActionLabel(category)}链接`,
          content: `${category || "资料"}：${fileName}`,
          targetName: fileName,
          metadata: { attachmentId: id, category, url: normalizedUrl },
          ipAddress: getRequestIp(req),
        });
      }
      const saved = selectAttachment(db, id);
      return NextResponse.json(saved);
    }

    if (!file) return NextResponse.json({ message: "请选择文件" }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ message: "文件大小必须在 20MB 以内" }, { status: 413 });
    }
    if (file.size <= 0) return NextResponse.json({ message: "文件内容不能为空" }, { status: 400 });
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const validationError = validateLocalFile(file, buffer, Boolean(avatarUserId || materialId || orgUnitId));
    if (validationError) return NextResponse.json({ message: validationError }, { status: 400 });
    const safeName = safeFileName(file.name);
    const fileName = `${Date.now()}_${safeName}`;

    if (avatarUserId) {
      if (file.size > 2 * 1024 * 1024) {
        return NextResponse.json({ message: "头像图片不能超过 2MB" }, { status: 400 });
      }
      const dir = path.join(process.cwd(), "public", "uploads", "users", avatarUserId);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, fileName), buffer);
      const fileUrl = `/uploads/users/${avatarUserId}/${fileName}`;
      return NextResponse.json({ file_name: file.name, file_url: fileUrl, file_size: file.size, mime_type: file.type, category });
    }

    if (materialId) {
      const dir = path.join(process.cwd(), "public", "uploads", "materials", materialId);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, fileName), buffer);
      const fileUrl = `/uploads/materials/${materialId}/${fileName}`;
      return NextResponse.json({ file_name: file.name, file_url: fileUrl, file_size: file.size, mime_type: file.type, category });
    }

    if (orgUnitId) {
      const dir = path.join(process.cwd(), "public", "uploads", "branches", orgUnitId);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, fileName), buffer);
      const fileUrl = `/uploads/branches/${orgUnitId}/${fileName}`;
      return NextResponse.json({ file_name: file.name, file_url: fileUrl, file_size: file.size, category });
    }

    if (customerId) {
      const dir = path.join(process.cwd(), "public", "uploads", "customers", customerId);
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(dir, fileName), buffer);
      const fileUrl = `/uploads/customers/${customerId}/${fileName}`;
      const id = makeAttachmentId();
      db.prepare(`
        INSERT INTO attachments (id, customer_id, user_id, file_name, file_url, file_size, mime_type, category, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(id, customerId, userId, file.name, fileUrl, file.size, file.type, category);
      syncCustomerProgress(db, customerId);
      recordCustomerOperation(db, {
        userId,
        customerId,
        action: "customer.attachment.upload",
        module: "客户资料",
        title: "上传客户资料",
        content: `${category || "资料"}：${file.name}`,
        targetName: file.name,
        metadata: { attachmentId: id, category, fileSize: file.size, mimeType: file.type },
        ipAddress: getRequestIp(req),
      });
      const saved = selectAttachment(db, id);
      return NextResponse.json(saved);
    }

    const dir = path.join(process.cwd(), "public", "uploads", "projects", projectId);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, fileName), buffer);

    const id = makeAttachmentId();
    const fileUrl = `/uploads/projects/${projectId}/${fileName}`;

    if (skipAttachment) {
      return NextResponse.json({ file_name: file.name, file_url: fileUrl, file_size: file.size, mime_type: file.type, category });
    }
    
    db.prepare(`
      INSERT INTO attachments (id, project_id, user_id, file_name, file_url, file_size, mime_type, category, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(id, projectId, userId, file.name, fileUrl, file.size, file.type, category);

    const operationCustomerId = getProjectCustomerId(db, projectId);
    if (operationCustomerId) {
      syncCustomerProgress(db, operationCustomerId);
      recordCustomerOperation(db, {
        userId,
        customerId: operationCustomerId,
        action: "customer.attachment.upload",
        module: "工地资料",
        title: `上传${getAttachmentActionLabel(category)}`,
        content: `${category || "资料"}：${file.name}`,
        targetName: file.name,
        metadata: { attachmentId: id, projectId, category, fileSize: file.size, mimeType: file.type },
        ipAddress: getRequestIp(req),
      });
    }

    const saved = selectAttachment(db, id);
    if (projectId && (eventStageId || eventNodeId || eventNodeName)) {
      recordSiteNodeEvent(db, {
        projectId,
        stageId: eventStageId,
        stageName: eventStageName,
        nodeId: eventNodeId,
        nodeName: eventNodeName,
        nodeType: eventNodeType,
        eventType: "ATTACHMENT_UPLOAD",
        title: "上传节点附件",
        content: file.name,
        operatorId: userId,
        sourceType: "attachment",
        sourceId: id,
        metadata: { category, fileSize: file.size, mimeType: file.type, fileUrl },
      });
    }
    return NextResponse.json(saved);
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "上传失败" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canViewCustomers(auth)) return NextResponse.json({ message: "没有资料查看权限" }, { status: 403 });
  const projectId = normalizeBusinessId(req.nextUrl.searchParams.get("project_id"));
  const customerId = normalizeBusinessId(req.nextUrl.searchParams.get("customer_id"));
  if (!projectId && !customerId) {
    return NextResponse.json({ message: "project_id or customer_id is required" }, { status: 400 });
  }
  if (projectId && !projectBelongsToCompany(auth, projectId)) return NextResponse.json({ message: "工地不存在" }, { status: 404 });
  if (customerId && !customerBelongsToCompany(auth, customerId)) return NextResponse.json({ message: "客户不存在" }, { status: 404 });
  const db = getDb();
  ensureAttachmentTable(db);
  const files = customerId
    ? db.prepare(`
        SELECT a.*, uploader.name AS uploader_name
        FROM attachments a
        LEFT JOIN users uploader ON uploader.id = a.user_id
        WHERE a.customer_id = ?
        ORDER BY a.created_at DESC
      `).all(customerId)
    : db.prepare(`
        SELECT a.*, uploader.name AS uploader_name
        FROM attachments a
        LEFT JOIN users uploader ON uploader.id = a.user_id
        WHERE a.project_id = ?
        ORDER BY a.created_at DESC
      `).all(projectId);
  return NextResponse.json(files);
}

export async function PATCH(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canEditCustomers(auth)) return NextResponse.json({ message: "没有资料修改权限" }, { status: 403 });
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    const fileName = String(body?.file_name || "").trim();
    if (!id) return NextResponse.json({ message: "附件ID不能为空" }, { status: 400 });
    if (!fileName) return NextResponse.json({ message: "资料名称不能为空" }, { status: 400 });
    if (fileName.length > 100) return NextResponse.json({ message: "资料名称不能超过100个字" }, { status: 400 });

    const db = getDb();
    ensureAttachmentTable(db);
    ensureSiteNodeEventTables(db);
    const file = db.prepare("SELECT * FROM attachments WHERE id = ?").get(id) as any;
    if (!file) return NextResponse.json({ message: "资料不存在" }, { status: 404 });
    if (!attachmentBelongsToCompany(db, file, auth.companyId)) return NextResponse.json({ message: "资料不存在" }, { status: 404 });
    const lockedResponse = rejectCompletedHandoverAttachmentChange(db, file.project_id, file.category);
    if (lockedResponse) return lockedResponse;
    if (file.mime_type === "text/uri-list" || /^https?:\/\//i.test(String(file.file_url || ""))) {
      return NextResponse.json({ message: "在线链接不支持重命名" }, { status: 400 });
    }

    db.prepare("UPDATE attachments SET file_name = ? WHERE id = ?").run(fileName, id);
    const renamedNodeCategory = parseSiteNodeAttachmentCategory(file.category);
    if (file.project_id && renamedNodeCategory) {
      recordSiteNodeEvent(db, {
        projectId: file.project_id,
        stageId: renamedNodeCategory.stageId,
        nodeId: renamedNodeCategory.nodeId,
        eventType: "ATTACHMENT_RENAME",
        title: "重命名节点附件",
        content: `${file.file_name || "未命名资料"} 改为 ${fileName}`,
        operatorId: auth.userId,
        sourceType: "attachment",
        sourceId: id,
        metadata: { category: file.category || "", oldName: file.file_name || "", newName: fileName },
      });
    }
    const operationCustomerId = getAttachmentCustomerId(db, file);
    if (operationCustomerId) {
      recordCustomerOperation(db, {
        userId: auth.userId,
        customerId: operationCustomerId,
        action: "customer.attachment.rename",
        module: getAttachmentModule(file),
        title: `重命名${getAttachmentActionLabel(file.category)}`,
        content: `${file.file_name || "资料"} 改为 ${fileName}`,
        targetName: fileName,
        metadata: { attachmentId: id, projectId: file.project_id || "", category: file.category || "", oldName: file.file_name || "", newName: fileName },
        ipAddress: getRequestIp(req),
      });
    }
    const saved = selectAttachment(db, id);
    return NextResponse.json(saved);
  } catch (err: any) {
    return NextResponse.json({ message: err.message || "重命名失败" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  if (!canEditCustomers(auth)) return NextResponse.json({ message: "没有资料删除权限" }, { status: 403 });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ message: "id is required" }, { status: 400 });
  const db = getDb();
  ensureAttachmentTable(db);
  ensureSiteNodeEventTables(db);
  const file = db.prepare("SELECT * FROM attachments WHERE id = ?").get(id) as any;
  if (file) {
    if (!attachmentBelongsToCompany(db, file, auth.companyId)) return NextResponse.json({ message: "资料不存在" }, { status: 404 });
    const lockedResponse = rejectCompletedHandoverAttachmentChange(db, file.project_id, file.category);
    if (lockedResponse) return lockedResponse;
    const operationCustomerId = getAttachmentCustomerId(db, file);
    const deletedNodeCategory = parseSiteNodeAttachmentCategory(file.category);
    if (file.project_id && deletedNodeCategory) {
      recordSiteNodeEvent(db, {
        projectId: file.project_id,
        stageId: deletedNodeCategory.stageId,
        nodeId: deletedNodeCategory.nodeId,
        eventType: "ATTACHMENT_DELETE",
        title: "删除节点附件",
        content: file.file_name || "未命名资料",
        operatorId: auth.userId,
        sourceType: "attachment",
        sourceId: id,
        metadata: { category: file.category || "", fileName: file.file_name || "" },
      });
    }
    const localPath = getLocalAttachmentPath(file.file_url);
    if (localPath) {
      try { await unlink(localPath); } catch {}
    }
    db.prepare("DELETE FROM attachments WHERE id = ?").run(id);
    if (operationCustomerId) syncCustomerProgress(db, operationCustomerId);
    if (operationCustomerId) {
      recordCustomerOperation(db, {
        userId: auth.userId,
        customerId: operationCustomerId,
        action: "customer.attachment.delete",
        module: getAttachmentModule(file),
        title: `删除${getAttachmentActionLabel(file.category)}`,
        content: `${file.category || "资料"}：${file.file_name || "未命名资料"}`,
        targetName: file.file_name || "",
        metadata: { attachmentId: id, projectId: file.project_id || "", category: file.category || "" },
        ipAddress: getRequestIp(req),
      });
    }
  }
  return NextResponse.json({ success: true });
}
