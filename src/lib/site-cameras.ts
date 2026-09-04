import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "crypto";
import type Database from "better-sqlite3";

export type SiteCameraRow = {
  id: string;
  company_id: string;
  project_id: string;
  provider: string;
  name: string;
  location: string | null;
  device_serial: string;
  channel_no: number;
  verify_code: string | null;
  status: string;
  owner_visible: number;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

function makeId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

function getSecretKey() {
  const source = String(process.env.CAMERA_SECRET_KEY || process.env.JWT_SECRET || "").trim();
  return createHash("sha256").update(source || "local-camera-secret").digest();
}

export function encryptCameraSecret(value: string) {
  const secret = String(value || "").trim();
  if (!secret) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getSecretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptCameraSecret(value?: string | null) {
  const input = String(value || "").trim();
  if (!input) return "";
  if (!input.startsWith("enc:v1:")) return input;
  const [, , ivText, tagText, dataText] = input.split(":");
  if (!ivText || !tagText || !dataText) return "";
  try {
    const decipher = createDecipheriv("aes-256-gcm", getSecretKey(), Buffer.from(ivText, "base64url"));
    decipher.setAuthTag(Buffer.from(tagText, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataText, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}

export function maskCameraSecret(value?: string | null) {
  const secret = decryptCameraSecret(value);
  if (!secret) return "";
  if (secret.length <= 2) return "*".repeat(secret.length);
  return `${secret.slice(0, 1)}${"*".repeat(Math.min(6, secret.length - 2))}${secret.slice(-1)}`;
}

export function ensureSiteCameraTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS site_cameras (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      project_id TEXT NOT NULL REFERENCES projects(id),
      provider TEXT NOT NULL DEFAULT 'ezviz',
      name TEXT NOT NULL,
      location TEXT,
      device_serial TEXT NOT NULL,
      channel_no INTEGER NOT NULL DEFAULT 1,
      verify_code TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      owner_visible INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_by TEXT REFERENCES users(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_site_cameras_project
      ON site_cameras(company_id, project_id, deleted_at, sort_order);
    CREATE INDEX IF NOT EXISTS idx_site_cameras_device
      ON site_cameras(company_id, provider, device_serial, channel_no, deleted_at);
  `);
}

export function sanitizeSiteCamera(row: SiteCameraRow) {
  return {
    id: row.id,
    company_id: row.company_id,
    project_id: row.project_id,
    provider: row.provider || "ezviz",
    name: row.name || "工地摄像头",
    location: row.location || "",
    device_serial: row.device_serial || "",
    channel_no: Number(row.channel_no || 1),
    status: row.status || "active",
    owner_visible: Number(row.owner_visible || 0),
    sort_order: Number(row.sort_order || 0),
    has_verify_code: Boolean(String(row.verify_code || "").trim()),
    verify_code_masked: maskCameraSecret(row.verify_code),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function getSiteCameraById(db: Database.Database, cameraId: string, companyId: string) {
  ensureSiteCameraTables(db);
  return db.prepare(`
    SELECT *
    FROM site_cameras
    WHERE id = ? AND company_id = ? AND deleted_at IS NULL
    LIMIT 1
  `).get(cameraId, companyId) as SiteCameraRow | undefined;
}

export function listSiteCameras(db: Database.Database, companyId: string, projectIds: string[]) {
  ensureSiteCameraTables(db);
  if (projectIds.length === 0) return [];
  return db.prepare(`
    SELECT *
    FROM site_cameras
    WHERE company_id = ?
      AND project_id IN (${projectIds.map(() => "?").join(",")})
      AND deleted_at IS NULL
    ORDER BY project_id, sort_order ASC, created_at ASC
  `).all(companyId, ...projectIds).map((row: any) => sanitizeSiteCamera(row));
}

export function createSiteCamera(db: Database.Database, params: {
  companyId: string;
  projectId: string;
  userId: string;
  name: string;
  location?: string;
  deviceSerial: string;
  channelNo: number;
  verifyCode?: string;
  ownerVisible?: boolean;
}) {
  ensureSiteCameraTables(db);
  const id = makeId("SCAM");
  const sortOrder = Number((db.prepare(`
    SELECT COALESCE(MAX(sort_order), 0) + 10 as sort_order
    FROM site_cameras
    WHERE company_id = ? AND project_id = ? AND deleted_at IS NULL
  `).get(params.companyId, params.projectId) as any)?.sort_order || 10);
  db.prepare(`
    INSERT INTO site_cameras (
      id, company_id, project_id, provider, name, location, device_serial, channel_no,
      verify_code, status, owner_visible, sort_order, created_by, created_at, updated_at
    ) VALUES (?, ?, ?, 'ezviz', ?, ?, ?, ?, ?, 'active', ?, ?, ?, datetime('now'), datetime('now'))
  `).run(
    id,
    params.companyId,
    params.projectId,
    params.name,
    params.location || "",
    params.deviceSerial,
    params.channelNo,
    params.verifyCode ? encryptCameraSecret(params.verifyCode) : "",
    params.ownerVisible ? 1 : 0,
    sortOrder,
    params.userId,
  );
  return getSiteCameraById(db, id, params.companyId);
}

