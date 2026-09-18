import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import {
  getQuotationEditorPresenceMap,
  leaveQuotationPresence,
  pruneQuotationPresence,
  touchQuotationPresence,
} from "./quotationPresence";

function createDb() {
  return new Database(":memory:");
}

describe("quotation presence", () => {
  let db: ReturnType<typeof createDb>;

  beforeEach(() => {
    db = createDb();
  });

  it("counts active editors once per user and excludes left sessions", () => {
    touchQuotationPresence(db, {
      quotationId: "quote-1",
      userId: "user-1",
      sessionId: "tab-1",
      userName: "张三",
    });
    touchQuotationPresence(db, {
      quotationId: "quote-1",
      userId: "user-1",
      sessionId: "tab-2",
      userName: "张三",
    });
    touchQuotationPresence(db, {
      quotationId: "quote-1",
      userId: "user-2",
      sessionId: "tab-3",
      userName: "李四",
    });

    expect(getQuotationEditorPresenceMap(db, ["quote-1"]).get("quote-1")).toEqual([
      expect.objectContaining({ user_id: "user-1", user_name: "张三" }),
      expect.objectContaining({ user_id: "user-2", user_name: "李四" }),
    ]);

    leaveQuotationPresence(db, "quote-1", "user-2", "tab-3");
    expect(getQuotationEditorPresenceMap(db, ["quote-1"]).get("quote-1")).toHaveLength(1);
  });

  it("removes stale editors after the presence ttl", () => {
    touchQuotationPresence(db, {
      quotationId: "quote-1",
      userId: "user-1",
      sessionId: "tab-1",
      userName: "张三",
    });
    db.prepare(`
      UPDATE quotation_edit_presence
      SET last_seen_at = datetime('now', '-2 minutes')
      WHERE quotation_id = 'quote-1'
    `).run();

    pruneQuotationPresence(db);
    expect(getQuotationEditorPresenceMap(db, ["quote-1"]).get("quote-1") || []).toEqual([]);
  });

  it("does not leak presence across quotations", () => {
    touchQuotationPresence(db, {
      quotationId: "quote-1",
      userId: "user-1",
      sessionId: "tab-1",
      userName: "张三",
    });
    expect(getQuotationEditorPresenceMap(db, ["quote-2"]).get("quote-2") || []).toEqual([]);
  });
});
