import type Database from "better-sqlite3";

type SiteNodeEventInput = {
  projectId: string;
  stageId?: string | null;
  stageName?: string | null;
  nodeId?: string | null;
  nodeName?: string | null;
  nodeType?: string | null;
  eventType: string;
  title: string;
  content?: string | null;
  statusFrom?: string | null;
  statusTo?: string | null;
  operatorId?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export function parseSiteNodeAttachmentCategory(category: unknown) {
  const text = String(category || "").trim();
  if (!text.startsWith("施工节点-")) return null;
  const parts = text.slice("施工节点-".length).split("-").filter(Boolean);
  if (parts.length < 2) return null;
  return { stageId: parts[0], nodeId: parts.slice(1).join("-") };
}

export function ensureSiteNodeEventTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS site_node_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      stage_id TEXT,
      stage_name TEXT,
      node_id TEXT,
      node_name TEXT,
      node_type TEXT,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      status_from TEXT,
      status_to TEXT,
      operator_id TEXT REFERENCES users(id),
      source_type TEXT,
      source_id TEXT,
      metadata TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_site_node_events_project_time
      ON site_node_events(project_id, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_site_node_events_node
      ON site_node_events(project_id, stage_id, node_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_site_node_events_source
      ON site_node_events(source_type, source_id);
  `);
}

export function recordSiteNodeEvent(db: Database.Database, input: SiteNodeEventInput) {
  const projectId = String(input.projectId || "").trim();
  const eventType = String(input.eventType || "").trim();
  const title = String(input.title || "").trim();
  if (!projectId || !eventType || !title) return "";

  ensureSiteNodeEventTables(db);
  const id = `SNE${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  db.prepare(`
    INSERT INTO site_node_events (
      id, project_id, stage_id, stage_name, node_id, node_name, node_type,
      event_type, title, content, status_from, status_to, operator_id,
      source_type, source_id, metadata, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `).run(
    id,
    projectId,
    String(input.stageId || "").trim() || null,
    String(input.stageName || "").trim() || null,
    String(input.nodeId || "").trim() || null,
    String(input.nodeName || "").trim() || null,
    String(input.nodeType || "").trim() || null,
    eventType,
    title,
    String(input.content || "").trim() || null,
    String(input.statusFrom || "").trim() || null,
    String(input.statusTo || "").trim() || null,
    String(input.operatorId || "").trim() || null,
    String(input.sourceType || "").trim() || null,
    String(input.sourceId || "").trim() || null,
    input.metadata ? JSON.stringify(input.metadata) : null,
  );
  return id;
}
