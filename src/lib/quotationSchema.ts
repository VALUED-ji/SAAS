const quotationTempColumns = [
  ["quotation_type", "TEXT"],
  ["temp_customer_name", "TEXT"],
  ["temp_customer_designer_name", "TEXT"],
  ["temp_customer_phone", "TEXT"],
  ["temp_customer_weixin", "TEXT"],
  ["temp_customer_address", "TEXT"],
  ["temp_customer_house_address", "TEXT"],
  ["temp_customer_address_location_name", "TEXT"],
  ["temp_customer_address_location_address", "TEXT"],
  ["temp_customer_address_latitude", "REAL"],
  ["temp_customer_address_longitude", "REAL"],
  ["temp_customer_building_no", "TEXT"],
  ["temp_customer_unit_no", "TEXT"],
  ["temp_customer_room_no", "TEXT"],
  ["temp_customer_no_room_number", "INTEGER DEFAULT 0"],
  ["temp_customer_area", "REAL"],
  ["temp_customer_decoration_type", "TEXT"],
] as const;

function quoteIdentifier(name: string) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function ensureColumn(db: any, table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as { name: string }[];
  if (!columns.some((item) => item.name === column)) {
    db.prepare(`ALTER TABLE ${quoteIdentifier(table)} ADD COLUMN ${quoteIdentifier(column)} ${definition}`).run();
  }
}

function getColumnDefinition(column: any) {
  if (column.name === "project_id") return `${quoteIdentifier(column.name)} TEXT REFERENCES projects(id)`;
  const type = String(column.type || "TEXT").trim() || "TEXT";
  const parts = [quoteIdentifier(column.name), type];
  if (column.pk) parts.push("PRIMARY KEY");
  if (column.notnull) parts.push("NOT NULL");
  if (column.dflt_value !== null && column.dflt_value !== undefined) {
    const defaultValue = String(column.dflt_value).trim();
    const normalizedDefault = /^datetime\s*\(\s*'now'\s*\)$/i.test(defaultValue) || /^\(\s*datetime\s*\(\s*'now'\s*\)\s*\)$/i.test(defaultValue)
      ? "CURRENT_TIMESTAMP"
      : /\w+\s*\(/.test(defaultValue) && !defaultValue.startsWith("(")
      ? `(${defaultValue})`
      : defaultValue;
    parts.push(`DEFAULT ${normalizedDefault}`);
  }
  return parts.join(" ");
}

function recreateQuotationIndexes(db: any) {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_quotations_project ON quotations(project_id);
    CREATE INDEX IF NOT EXISTS idx_quotations_dashboard_created_status ON quotations(deleted_at, created_at, status);
    CREATE INDEX IF NOT EXISTS idx_quotations_deleted_updated_created ON quotations(deleted_at, updated_at DESC, created_at DESC);
  `);
}

export function ensureQuotationSchema(db: any) {
  const columns = db.prepare("PRAGMA table_info(quotations)").all() as any[];
  const projectIdColumn = columns.find((column) => column.name === "project_id");
  const needsProjectNullableMigration = Boolean(projectIdColumn?.notnull);

  if (needsProjectNullableMigration) {
    const migrationTable = `quotations_migration_${Date.now()}`;
    const existingColumnNames = columns.map((column) => column.name);
    const existingColumnSet = new Set(existingColumnNames);
    const definitions = columns.map(getColumnDefinition);
    quotationTempColumns.forEach(([name, definition]) => {
      if (!existingColumnSet.has(name)) definitions.push(`${quoteIdentifier(name)} ${definition}`);
    });
    const copyColumns = existingColumnNames.map(quoteIdentifier).join(", ");
    const tx = db.transaction(() => {
      db.prepare(`CREATE TABLE ${quoteIdentifier(migrationTable)} (${definitions.join(", ")})`).run();
      db.prepare(`INSERT INTO ${quoteIdentifier(migrationTable)} (${copyColumns}) SELECT ${copyColumns} FROM quotations`).run();
      db.prepare("DROP TABLE quotations").run();
      db.prepare(`ALTER TABLE ${quoteIdentifier(migrationTable)} RENAME TO quotations`).run();
    });
    db.pragma("foreign_keys = OFF");
    try {
      tx();
    } finally {
      db.pragma("foreign_keys = ON");
    }
  }

  ensureColumn(db, "quotations", "title", "TEXT");
  ensureColumn(db, "quotations", "terms", "TEXT");
  ensureColumn(db, "quotations", "settings", "TEXT");
  ensureColumn(db, "quotations", "customer_visible_note", "TEXT");
  quotationTempColumns.forEach(([name, definition]) => ensureColumn(db, "quotations", name, definition));
  recreateQuotationIndexes(db);
}
