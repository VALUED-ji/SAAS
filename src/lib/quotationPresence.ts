type Db = any;

export type QuotationEditorPresence = {
  user_id: string;
  user_name: string;
  avatar?: string | null;
};

export const QUOTATION_PRESENCE_TTL_SECONDS = 45;

export function ensureQuotationPresenceSchema(db: Db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS quotation_edit_presence (
      quotation_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      user_name TEXT,
      avatar TEXT,
      last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (quotation_id, user_id, session_id)
    );
    CREATE INDEX IF NOT EXISTS idx_quotation_edit_presence_active
      ON quotation_edit_presence(quotation_id, last_seen_at);
  `);
}

export function pruneQuotationPresence(db: Db) {
  ensureQuotationPresenceSchema(db);
  db.prepare(`
    DELETE FROM quotation_edit_presence
    WHERE last_seen_at < datetime('now', ?)
  `).run(`-${QUOTATION_PRESENCE_TTL_SECONDS} seconds`);
}

export function touchQuotationPresence(
  db: Db,
  input: {
    quotationId: string;
    userId: string;
    sessionId: string;
    userName: string;
    avatar?: string | null;
  },
) {
  ensureQuotationPresenceSchema(db);
  db.prepare(`
    INSERT INTO quotation_edit_presence (
      quotation_id, user_id, session_id, user_name, avatar, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(quotation_id, user_id, session_id) DO UPDATE SET
      user_name = excluded.user_name,
      avatar = excluded.avatar,
      last_seen_at = datetime('now')
  `).run(
    input.quotationId,
    input.userId,
    input.sessionId,
    input.userName,
    input.avatar || null,
  );
}

export function leaveQuotationPresence(
  db: Db,
  quotationId: string,
  userId: string,
  sessionId: string,
) {
  ensureQuotationPresenceSchema(db);
  db.prepare(`
    DELETE FROM quotation_edit_presence
    WHERE quotation_id = ? AND user_id = ? AND session_id = ?
  `).run(quotationId, userId, sessionId);
}

export function getQuotationEditorPresenceMap(
  db: Db,
  quotationIds: string[],
): Map<string, QuotationEditorPresence[]> {
  const ids = Array.from(new Set(quotationIds.map((id) => String(id || "").trim()).filter(Boolean)));
  const result = new Map<string, QuotationEditorPresence[]>();
  if (ids.length === 0) return result;
  pruneQuotationPresence(db);
  const placeholders = ids.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT quotation_id, user_id, user_name, avatar, MAX(last_seen_at) as last_seen_at
    FROM quotation_edit_presence
    WHERE quotation_id IN (${placeholders})
    GROUP BY quotation_id, user_id
    ORDER BY last_seen_at DESC
  `).all(...ids) as any[];
  rows.forEach((row) => {
    const quotationId = String(row.quotation_id || "");
    const userId = String(row.user_id || "");
    if (!quotationId || !userId) return;
    const editors = result.get(quotationId) || [];
    editors.push({
      user_id: userId,
      user_name: String(row.user_name || "未知用户"),
      avatar: row.avatar ? String(row.avatar) : null,
    });
    result.set(quotationId, editors);
  });
  return result;
}

export function getQuotationEditorCountMap(db: Db, quotationIds: string[]) {
  const presenceMap = getQuotationEditorPresenceMap(db, quotationIds);
  return new Map(Array.from(presenceMap.entries()).map(([quotationId, editors]) => [quotationId, editors.length]));
}
