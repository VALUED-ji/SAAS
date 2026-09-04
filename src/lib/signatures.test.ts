import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import {
  confirmCaptureSession,
  createCaptureSession,
  approvalSignatureSelect,
  ensureSignatureTables,
  getApprovalSnapshot,
  getCaptureSessionByToken,
  getUserSignatureImage,
  listUserSignatures,
  recordApprovalSignatureSnapshot,
  removeUserSignature,
  submitCaptureSession,
  updateUserSignature,
} from "./signatures";

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const TEST_IMAGE = `data:image/png;base64,${Buffer.concat([PNG_HEADER, Buffer.alloc(192, 1)]).toString("base64")}`;

describe("signature domain", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    db.exec(`
      CREATE TABLE companies (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(id),
        name TEXT NOT NULL,
        is_active INTEGER DEFAULT 1,
        deleted_at TEXT
      );
      INSERT INTO companies (id, name) VALUES ('company-a', '测试公司A'), ('company-b', '测试公司B');
      INSERT INTO users (id, company_id, name) VALUES
        ('user-a', 'company-a', '测试员工A'),
        ('user-b', 'company-a', '测试员工B'),
        ('user-c', 'company-b', '测试员工C');
    `);
    ensureSignatureTables(db);
  });

  afterEach(() => db.close());

  function createSignature(userId = "user-a", name = "日常审批") {
    const session = createCaptureSession(db, userId === "user-c" ? "company-b" : "company-a", userId);
    submitCaptureSession(db, session.token, TEST_IMAGE, [[{ x: 0.1, y: 0.2 }]]);
    return confirmCaptureSession(db, {
      id: session.id,
      companyId: userId === "user-c" ? "company-b" : "company-a",
      userId,
      name,
    });
  }

  it("stores only a token hash and enforces expiry and single use", () => {
    const first = createCaptureSession(db, "company-a", "user-a");
    const stored = db.prepare("SELECT token_hash FROM signature_capture_sessions WHERE id = ?").get(first.id) as any;
    expect(stored.token_hash).not.toBe(first.token);
    expect(stored.token_hash).toHaveLength(64);

    submitCaptureSession(db, first.token, TEST_IMAGE, []);
    expect(() => submitCaptureSession(db, first.token, TEST_IMAGE, [])).toThrow("已经使用");

    const expired = createCaptureSession(db, "company-a", "user-a");
    db.prepare("UPDATE signature_capture_sessions SET expires_at = '2000-01-01 00:00:00' WHERE id = ?").run(expired.id);
    expect(getCaptureSessionByToken(db, expired.token)?.status).toBe("expired");
    expect(() => submitCaptureSession(db, expired.token, TEST_IMAGE, [])).toThrow("已失效");
  });

  it("creates multiple signatures while keeping exactly one default", () => {
    const firstId = createSignature("user-a", "签名一");
    const secondId = createSignature("user-a", "签名二");
    let items = listUserSignatures(db, "company-a", "user-a");
    expect(items).toHaveLength(2);
    expect(items.filter((item) => Number(item.is_default) === 1).map((item) => item.id)).toEqual([firstId]);

    updateUserSignature(db, { id: secondId, companyId: "company-a", userId: "user-a", makeDefault: true });
    items = listUserSignatures(db, "company-a", "user-a");
    expect(items.filter((item) => Number(item.is_default) === 1).map((item) => item.id)).toEqual([secondId]);
  });

  it("does not expose another user's signature image", () => {
    const signatureId = createSignature();
    expect(getUserSignatureImage(db, signatureId, "company-a", "user-a")?.image_data).toBeTruthy();
    expect(getUserSignatureImage(db, signatureId, "company-a", "user-b")).toBeUndefined();
    expect(getUserSignatureImage(db, signatureId, "company-b", "user-c")).toBeUndefined();
  });

  it("rejects another user's or inactive signature for approval", () => {
    const signatureId = createSignature();
    expect(() => recordApprovalSignatureSnapshot(db, {
      approvalType: "contract",
      stepId: "step-other-user",
      instanceId: "instance-1",
      signatureId,
      companyId: "company-a",
      userId: "user-b",
    })).toThrow("不存在或已停用");

    removeUserSignature(db, signatureId, "company-a", "user-a");
    expect(() => recordApprovalSignatureSnapshot(db, {
      approvalType: "contract",
      stepId: "step-inactive",
      instanceId: "instance-1",
      signatureId,
      companyId: "company-a",
      userId: "user-a",
    })).toThrow("不存在或已停用");
  });

  it("keeps an immutable snapshot after the source signature is deleted", () => {
    const signatureId = createSignature("user-a", "签约专用");
    recordApprovalSignatureSnapshot(db, {
      approvalType: "deposit",
      stepId: "step-immutable",
      instanceId: "instance-2",
      signatureId,
      companyId: "company-a",
      userId: "user-a",
    });
    const before = db.prepare("SELECT signature_name, image_hash FROM approval_signature_snapshots WHERE step_id = ?").get("step-immutable") as any;
    updateUserSignature(db, { id: signatureId, companyId: "company-a", userId: "user-a", name: "新名称" });
    removeUserSignature(db, signatureId, "company-a", "user-a");
    const after = db.prepare("SELECT signature_name, image_hash FROM approval_signature_snapshots WHERE step_id = ?").get("step-immutable") as any;
    expect(after).toEqual(before);
    expect(listUserSignatures(db, "company-a", "user-a")).toHaveLength(0);
    expect(getUserSignatureImage(db, signatureId, "company-a", "user-a")).toBeUndefined();
    expect((db.prepare("SELECT signature_id FROM approval_signature_snapshots WHERE step_id = ?").get("step-immutable") as any).signature_id).toBeNull();
    expect(getApprovalSnapshot(db, "deposit", "step-immutable", "company-a")?.image_data).toBeTruthy();
    expect(getApprovalSnapshot(db, "deposit", "step-immutable", "company-b")).toBeUndefined();
  });

  it("adds stable snapshot metadata to approval history queries", () => {
    const signatureId = createSignature();
    db.exec("CREATE TABLE fake_history_steps (id TEXT PRIMARY KEY);");
    db.prepare("INSERT INTO fake_history_steps (id) VALUES ('step-history')").run();
    recordApprovalSignatureSnapshot(db, {
      approvalType: "contract",
      stepId: "step-history",
      instanceId: "instance-history",
      signatureId,
      companyId: "company-a",
      userId: "user-a",
    });
    const row = db.prepare(`
      SELECT s.*, ${approvalSignatureSelect("contract")}
      FROM fake_history_steps s
      LEFT JOIN approval_signature_snapshots snapshot
        ON snapshot.approval_type = 'contract' AND snapshot.step_id = s.id
    `).get() as any;
    expect(row.signature_name).toBe("日常审批");
    expect(row.signature_url).toBe("/api/approval-signatures/contract/step-history");
  });

  it("rolls back the approval state when signature validation fails", () => {
    db.exec("CREATE TABLE fake_approval_steps (id TEXT PRIMARY KEY, status TEXT NOT NULL);");
    db.prepare("INSERT INTO fake_approval_steps (id, status) VALUES ('step-rollback', 'pending')").run();
    const transaction = (db as any).transaction(() => {
      db.prepare("UPDATE fake_approval_steps SET status = 'approved' WHERE id = 'step-rollback'").run();
      recordApprovalSignatureSnapshot(db, {
        approvalType: "change_order",
        stepId: "step-rollback",
        instanceId: "instance-3",
        signatureId: "missing-signature",
        companyId: "company-a",
        userId: "user-a",
      });
    });
    expect(transaction).toThrow("不存在或已停用");
    expect((db.prepare("SELECT status FROM fake_approval_steps WHERE id = 'step-rollback'").get() as any).status).toBe("pending");
    expect(db.prepare("SELECT COUNT(*) as count FROM approval_signature_snapshots").get()).toEqual({ count: 0 });
  });
});
