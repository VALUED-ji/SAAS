import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { ensureSiteNodeEventTables, parseSiteNodeAttachmentCategory, recordSiteNodeEvent } from "./siteNodeEvents";

describe("site node events", () => {
  it("records immutable node operation details", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE projects (id TEXT PRIMARY KEY);
      CREATE TABLE users (id TEXT PRIMARY KEY);
      INSERT INTO projects (id) VALUES ('project-1');
      INSERT INTO users (id) VALUES ('user-1');
    `);
    ensureSiteNodeEventTables(db);

    const id = recordSiteNodeEvent(db, {
      projectId: "project-1",
      stageId: "stage-1",
      stageName: "水电工程",
      nodeId: "node-1",
      nodeName: "水电布管布线",
      nodeType: "construction",
      eventType: "NODE_STATUS",
      title: "开始施工",
      statusFrom: "PENDING",
      statusTo: "IN_PROGRESS",
      operatorId: "user-1",
      sourceType: "task",
      sourceId: "task-1",
    });

    const row = db.prepare("SELECT * FROM site_node_events WHERE id = ?").get(id) as Record<string, unknown>;
    expect(row.project_id).toBe("project-1");
    expect(row.node_name).toBe("水电布管布线");
    expect(row.status_from).toBe("PENDING");
    expect(row.status_to).toBe("IN_PROGRESS");
    db.close();
  });

  it("extracts stage and node ids from attachment categories", () => {
    expect(parseSiteNodeAttachmentCategory("施工节点-STAGE_1-NODE_2")).toEqual({ stageId: "STAGE_1", nodeId: "NODE_2" });
    expect(parseSiteNodeAttachmentCategory("施工日志-2026-07-31")).toBeNull();
  });
});
