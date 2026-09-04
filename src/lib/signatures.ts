import { createHash, randomBytes, randomUUID } from "crypto";
import type Database from "better-sqlite3";

export const SIGNATURE_CAPTURE_TTL_MINUTES = 5;
export const MAX_SIGNATURE_IMAGE_BYTES = 500 * 1024;
export type ApprovalSignatureType = "contract" | "deposit" | "deposit_refund" | "change_order";
type Db = Database.Database;

type SignatureImage = {
  data: Buffer;
  mimeType: "image/png";
  hash: string;
};

function makeId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}
function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function toSqliteTime(date: Date) {
  return date.toISOString().slice(0, 19).replace("T", " ");
}
function validateName(value: unknown) {
  const name = String(value || "").trim();
  if (!name) throw new Error("请输入签名名称");
  if (name.length > 30) throw new Error("签名名称不能超过 30 个字");
  return name;
}

export function parseSignatureImage(value: unknown): SignatureImage {
  const input = String(value || "");
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(input);
  if (!match) throw new Error("签名图片格式无效，请重新签写");
  const data = Buffer.from(match[1], "base64");
  if (data.length < 100 || data.length > MAX_SIGNATURE_IMAGE_BYTES) {
    throw new Error("签名图片大小无效，请重新签写");
  }
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!data.subarray(0, 8).equals(pngHeader)) throw new Error("签名图片内容无效，请重新签写");
  return {
    data,
    mimeType: "image/png",
    hash: createHash("sha256").update(data).digest("hex"),
  };
}

export function ensureSignatureTables(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_signatures (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      image_data BLOB NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'image/png',
      image_hash TEXT NOT NULL,
      strokes_json TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_used_at TEXT,
      disabled_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_user_signatures_owner
      ON user_signatures(company_id, user_id, is_active, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_signatures_one_default
      ON user_signatures(company_id, user_id)
      WHERE is_default = 1 AND is_active = 1;

    CREATE TABLE IF NOT EXISTS signature_capture_sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      company_id TEXT NOT NULL REFERENCES companies(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at TEXT NOT NULL,
      submitted_image_data BLOB,
      submitted_mime_type TEXT,
      submitted_image_hash TEXT,
      strokes_json TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      submitted_at TEXT,
      confirmed_at TEXT,
      cancelled_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_signature_capture_owner
      ON signature_capture_sessions(company_id, user_id, status, created_at);

    CREATE TABLE IF NOT EXISTS approval_signature_snapshots (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      approval_type TEXT NOT NULL,
      step_id TEXT NOT NULL,
      instance_id TEXT NOT NULL,
      signature_id TEXT REFERENCES user_signatures(id),
      signature_name TEXT NOT NULL,
      signer_user_id TEXT NOT NULL REFERENCES users(id),
      signer_name TEXT NOT NULL,
      image_data BLOB NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'image/png',
      image_hash TEXT NOT NULL,
      signed_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(approval_type, step_id)
    );
    CREATE INDEX IF NOT EXISTS idx_approval_signature_instance
      ON approval_signature_snapshots(company_id, approval_type, instance_id);
  `);
}

export function createCaptureSession(db: Db, companyId: string, userId: string, ttlMinutes = SIGNATURE_CAPTURE_TTL_MINUTES) {
  ensureSignatureTables(db);
  db.prepare(`
    UPDATE signature_capture_sessions
    SET status = 'cancelled', cancelled_at = datetime('now'), submitted_image_data = NULL,
      submitted_image_hash = NULL, strokes_json = NULL
    WHERE company_id = ? AND user_id = ? AND status IN ('pending', 'submitted')
  `).run(companyId, userId);

  const token = randomBytes(32).toString("base64url");
  const id = makeId("SCAP");
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
  db.prepare(`
    INSERT INTO signature_capture_sessions (id, token_hash, company_id, user_id, status, expires_at)
    VALUES (?, ?, ?, ?, 'pending', ?)
  `).run(id, hashToken(token), companyId, userId, toSqliteTime(expiresAt));
  return { id, token, expiresAt: expiresAt.toISOString() };
}

export function getCaptureSessionByToken(db: Db, token: string) {
  ensureSignatureTables(db);
  const row = db.prepare(`
    SELECT id, status, expires_at, created_at, submitted_at
    FROM signature_capture_sessions
    WHERE token_hash = ?
    LIMIT 1
  `).get(hashToken(token)) as any;
  if (!row) return null;
  const expired = new Date(`${String(row.expires_at).replace(" ", "T")}Z`).getTime() <= Date.now();
  return { ...row, status: expired && row.status === "pending" ? "expired" : row.status };
}

export function submitCaptureSession(db: Db, token: string, imageValue: unknown, strokesValue: unknown) {
  ensureSignatureTables(db);
  const image = parseSignatureImage(imageValue);
  const strokesJson = JSON.stringify(strokesValue || []);
  if (Buffer.byteLength(strokesJson, "utf8") > 250 * 1024) throw new Error("签名轨迹数据过大，请重新签写");
  const result = db.prepare(`
    UPDATE signature_capture_sessions
    SET status = 'submitted', submitted_image_data = ?, submitted_mime_type = ?, submitted_image_hash = ?,
      strokes_json = ?, submitted_at = datetime('now')
    WHERE token_hash = ? AND status = 'pending' AND datetime(expires_at) > datetime('now')
  `).run(image.data, image.mimeType, image.hash, strokesJson, hashToken(token));
  if (result.changes !== 1) throw new Error("二维码已失效或已经使用，请在电脑端重新生成");
}

export function getCaptureSessionForOwner(db: Db, id: string, companyId: string, userId: string) {
  ensureSignatureTables(db);
  const row = db.prepare(`
    SELECT id, status, expires_at, created_at, submitted_at,
      CASE WHEN submitted_image_data IS NOT NULL THEN 1 ELSE 0 END as has_preview
    FROM signature_capture_sessions
    WHERE id = ? AND company_id = ? AND user_id = ?
    LIMIT 1
  `).get(id, companyId, userId) as any;
  if (!row) return null;
  const expired = new Date(`${String(row.expires_at).replace(" ", "T")}Z`).getTime() <= Date.now();
  return { ...row, status: expired && ["pending", "submitted"].includes(row.status) ? "expired" : row.status };
}

export function getCapturePreview(db: Db, id: string, companyId: string, userId: string) {
  ensureSignatureTables(db);
  return db.prepare(`
    SELECT submitted_image_data as image_data, submitted_mime_type as mime_type
    FROM signature_capture_sessions
    WHERE id = ? AND company_id = ? AND user_id = ? AND status = 'submitted'
      AND submitted_image_data IS NOT NULL AND datetime(expires_at) > datetime('now')
    LIMIT 1
  `).get(id, companyId, userId) as any;
}

export function confirmCaptureSession(
  db: Db,
  params: { id: string; companyId: string; userId: string; name: unknown; makeDefault?: boolean },
) {
  ensureSignatureTables(db);
  const name = validateName(params.name);
  const transaction = (db as any).transaction(() => {
    const session = db.prepare(`
      SELECT * FROM signature_capture_sessions
      WHERE id = ? AND company_id = ? AND user_id = ? AND status = 'submitted'
        AND submitted_image_data IS NOT NULL AND datetime(expires_at) > datetime('now')
      LIMIT 1
    `).get(params.id, params.companyId, params.userId) as any;
    if (!session) throw new Error("签名预览已失效，请重新扫码签写");

    const activeCount = db.prepare(`
      SELECT COUNT(*) as count FROM user_signatures
      WHERE company_id = ? AND user_id = ? AND is_active = 1
    `).get(params.companyId, params.userId) as { count: number };
    const isDefault = params.makeDefault || Number(activeCount.count || 0) === 0;
    if (isDefault) {
      db.prepare(`
        UPDATE user_signatures SET is_default = 0, updated_at = datetime('now')
        WHERE company_id = ? AND user_id = ?
      `).run(params.companyId, params.userId);
    }

    const signatureId = makeId("SIG");
    db.prepare(`
      INSERT INTO user_signatures (
        id, company_id, user_id, name, image_data, mime_type, image_hash, strokes_json, is_default, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      signatureId,
      params.companyId,
      params.userId,
      name,
      session.submitted_image_data,
      session.submitted_mime_type || "image/png",
      session.submitted_image_hash,
      session.strokes_json,
      isDefault ? 1 : 0,
    );
    db.prepare(`
      UPDATE signature_capture_sessions
      SET status = 'confirmed', confirmed_at = datetime('now'), submitted_image_data = NULL, strokes_json = NULL
      WHERE id = ? AND status = 'submitted'
    `).run(params.id);
    return signatureId;
  });
  return transaction();
}

export function cancelCaptureSession(db: Db, id: string, companyId: string, userId: string) {
  ensureSignatureTables(db);
  db.prepare(`
    UPDATE signature_capture_sessions
    SET status = 'cancelled', cancelled_at = datetime('now'), submitted_image_data = NULL, strokes_json = NULL
    WHERE id = ? AND company_id = ? AND user_id = ? AND status IN ('pending', 'submitted')
  `).run(id, companyId, userId);
}

export function listUserSignatures(db: Db, companyId: string, userId: string, includeInactive = true) {
  ensureSignatureTables(db);
  return db.prepare(`
    SELECT s.id, s.name, s.is_default, s.is_active, s.created_at, s.updated_at, s.last_used_at,
      (SELECT COUNT(*) FROM approval_signature_snapshots snapshot WHERE snapshot.signature_id = s.id) as usage_count
    FROM user_signatures s
    WHERE s.company_id = ? AND s.user_id = ? ${includeInactive ? "" : "AND s.is_active = 1"}
    ORDER BY s.is_active DESC, s.is_default DESC, datetime(s.updated_at) DESC, s.id DESC
  `).all(companyId, userId) as any[];
}

export function updateUserSignature(
  db: Db,
  params: { id: string; companyId: string; userId: string; name?: unknown; makeDefault?: boolean; isActive?: boolean },
) {
  ensureSignatureTables(db);
  const transaction = (db as any).transaction(() => {
    const signature = db.prepare(`
      SELECT id, is_active, is_default FROM user_signatures
      WHERE id = ? AND company_id = ? AND user_id = ?
      LIMIT 1
    `).get(params.id, params.companyId, params.userId) as any;
    if (!signature) throw new Error("签名不存在");
    const nextName = params.name === undefined ? null : validateName(params.name);
    if (nextName !== null) {
      db.prepare("UPDATE user_signatures SET name = ?, updated_at = datetime('now') WHERE id = ?").run(nextName, params.id);
    }
    if (params.isActive === true) {
      db.prepare("UPDATE user_signatures SET is_active = 1, disabled_at = NULL, updated_at = datetime('now') WHERE id = ?").run(params.id);
      const defaultCount = db.prepare(`
        SELECT COUNT(*) as count FROM user_signatures
        WHERE company_id = ? AND user_id = ? AND is_active = 1 AND is_default = 1
      `).get(params.companyId, params.userId) as { count: number };
      if (Number(defaultCount.count || 0) === 0) {
        db.prepare("UPDATE user_signatures SET is_default = 1 WHERE id = ?").run(params.id);
      }
    }
    if (params.makeDefault) {
      const active = params.isActive === true || Number(signature.is_active) === 1;
      if (!active) throw new Error("请先启用该签名，再设为默认");
      db.prepare(`UPDATE user_signatures SET is_default = 0, updated_at = datetime('now') WHERE company_id = ? AND user_id = ?`)
        .run(params.companyId, params.userId);
      db.prepare("UPDATE user_signatures SET is_default = 1, updated_at = datetime('now') WHERE id = ?").run(params.id);
    }
  });
  transaction();
}

export function removeUserSignature(db: Db, id: string, companyId: string, userId: string) {
  ensureSignatureTables(db);
  const transaction = (db as any).transaction(() => {
    const signature = db.prepare(`
      SELECT * FROM user_signatures
      WHERE id = ? AND company_id = ? AND user_id = ?
      LIMIT 1
    `).get(id, companyId, userId) as any;
    if (!signature) throw new Error("签名不存在");

    db.prepare("UPDATE approval_signature_snapshots SET signature_id = NULL WHERE signature_id = ?").run(id);
    db.prepare("DELETE FROM user_signatures WHERE id = ?").run(id);

    if (Number(signature.is_default) === 1) {
      const replacement = db.prepare(`
        SELECT id FROM user_signatures
        WHERE company_id = ? AND user_id = ? AND is_active = 1
        ORDER BY datetime(updated_at) DESC LIMIT 1
      `).get(companyId, userId) as { id?: string } | undefined;
      if (replacement?.id) db.prepare("UPDATE user_signatures SET is_default = 1 WHERE id = ?").run(replacement.id);
    }
  });
  transaction();
}

export function getUserSignatureImage(db: Db, id: string, companyId: string, userId: string) {
  ensureSignatureTables(db);
  return db.prepare(`
    SELECT image_data, mime_type FROM user_signatures
    WHERE id = ? AND company_id = ? AND user_id = ?
    LIMIT 1
  `).get(id, companyId, userId) as any;
}

export function recordApprovalSignatureSnapshot(
  db: Db,
  params: {
    approvalType: ApprovalSignatureType;
    stepId: string;
    instanceId: string;
    signatureId: string;
    companyId: string;
    userId: string;
  },
) {
  ensureSignatureTables(db);
  const signature = db.prepare(`
    SELECT s.*, u.name as signer_name
    FROM user_signatures s
    INNER JOIN users u ON u.id = s.user_id AND u.company_id = s.company_id
    WHERE s.id = ? AND s.company_id = ? AND s.user_id = ? AND s.is_active = 1
      AND u.deleted_at IS NULL AND COALESCE(u.is_active, 1) = 1
    LIMIT 1
  `).get(params.signatureId, params.companyId, params.userId) as any;
  if (!signature) throw new Error("所选签名不存在或已停用，请重新选择");

  db.prepare(`
    INSERT INTO approval_signature_snapshots (
      id, company_id, approval_type, step_id, instance_id, signature_id, signature_name,
      signer_user_id, signer_name, image_data, mime_type, image_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    makeId("ASIG"),
    params.companyId,
    params.approvalType,
    params.stepId,
    params.instanceId,
    signature.id,
    signature.name,
    params.userId,
    signature.signer_name,
    signature.image_data,
    signature.mime_type,
    signature.image_hash,
  );
  db.prepare("UPDATE user_signatures SET last_used_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
    .run(signature.id);
}

export function getApprovalSnapshot(db: Db, approvalType: ApprovalSignatureType, stepId: string, companyId: string) {
  ensureSignatureTables(db);
  return db.prepare(`
    SELECT image_data, mime_type, signer_user_id
    FROM approval_signature_snapshots
    WHERE approval_type = ? AND step_id = ? AND company_id = ?
    LIMIT 1
  `).get(approvalType, stepId, companyId) as any;
}

export function approvalSignatureSelect(approvalType: ApprovalSignatureType, stepAlias = "s") {
  return `
    snapshot.signature_name as signature_name,
    snapshot.signer_name as signature_signer_name,
    snapshot.signed_at as signature_signed_at,
    CASE WHEN snapshot.id IS NOT NULL
      THEN '/api/approval-signatures/${approvalType}/' || ${stepAlias}.id
      ELSE NULL
    END as signature_url
  `;
}
