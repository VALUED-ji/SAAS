type Db = any;

function uniqueIds(values: unknown[]) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

export function migrateQuotationCreatedCustomersToTemporary(db: Db, companyId: string) {
  const normalizedCompanyId = String(companyId || "").trim();
  if (!normalizedCompanyId) return { migratedCustomers: 0, migratedQuotations: 0 };

  const customers = db.prepare(`
    SELECT c.*
    FROM customers c
    WHERE c.company_id = ?
      AND c.deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM operation_logs created_log
        WHERE created_log.entity = 'customer'
          AND created_log.entity_id = c.id
          AND created_log.action = 'customer.create.from_quotation'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM contracts ct
        INNER JOIN projects contract_project ON contract_project.id = ct.project_id
        WHERE contract_project.customer_id = c.id
          AND ct.company_id = ?
          AND ct.deleted_at IS NULL
          AND UPPER(COALESCE(ct.status, '')) IN ('SIGNED', 'RESIGNED')
      )
  `).all(normalizedCompanyId, normalizedCompanyId) as any[];

  let migratedCustomers = 0;
  let migratedQuotations = 0;
  const updateQuotation = db.prepare(`
    UPDATE quotations
    SET project_id = NULL,
      temp_customer_name = COALESCE(NULLIF(TRIM(COALESCE(temp_customer_name, '')), ''), ?),
      temp_customer_designer_name = COALESCE(NULLIF(TRIM(COALESCE(temp_customer_designer_name, '')), ''), ?),
      temp_customer_phone = COALESCE(NULLIF(TRIM(COALESCE(temp_customer_phone, '')), ''), ?),
      temp_customer_weixin = COALESCE(NULLIF(TRIM(COALESCE(temp_customer_weixin, '')), ''), ?),
      temp_customer_address = COALESCE(NULLIF(TRIM(COALESCE(temp_customer_address, '')), ''), ?),
      temp_customer_house_address = COALESCE(NULLIF(TRIM(COALESCE(temp_customer_house_address, '')), ''), ?),
      temp_customer_address_location_name = COALESCE(NULLIF(TRIM(COALESCE(temp_customer_address_location_name, '')), ''), ?),
      temp_customer_address_location_address = COALESCE(NULLIF(TRIM(COALESCE(temp_customer_address_location_address, '')), ''), ?),
      temp_customer_address_latitude = COALESCE(temp_customer_address_latitude, ?),
      temp_customer_address_longitude = COALESCE(temp_customer_address_longitude, ?),
      temp_customer_building_no = COALESCE(NULLIF(TRIM(COALESCE(temp_customer_building_no, '')), ''), ?),
      temp_customer_unit_no = COALESCE(NULLIF(TRIM(COALESCE(temp_customer_unit_no, '')), ''), ?),
      temp_customer_room_no = COALESCE(NULLIF(TRIM(COALESCE(temp_customer_room_no, '')), ''), ?),
      temp_customer_no_room_number = COALESCE(temp_customer_no_room_number, ?),
      temp_customer_area = COALESCE(temp_customer_area, ?),
      temp_customer_decoration_type = COALESCE(NULLIF(TRIM(COALESCE(temp_customer_decoration_type, '')), ''), ?),
      updated_at = datetime('now')
    WHERE id = ? AND company_id = ? AND deleted_at IS NULL
  `);

  for (const customer of customers) {
    const projects = db.prepare(`
      SELECT id
      FROM projects
      WHERE customer_id = ? AND company_id = ? AND deleted_at IS NULL
    `).all(customer.id, normalizedCompanyId) as Array<{ id: string }>;
    const projectIds = uniqueIds(projects.map((project) => project.id));
    if (projectIds.length === 0) continue;

    const placeholders = projectIds.map(() => "?").join(",");
    const quotations = db.prepare(`
      SELECT id
      FROM quotations
      WHERE company_id = ?
        AND deleted_at IS NULL
        AND project_id IN (${placeholders})
    `).all(normalizedCompanyId, ...projectIds) as Array<{ id: string }>;
    if (quotations.length === 0) {
      const cleanupTx = db.transaction(() => {
        db.prepare(`
          UPDATE projects
          SET deleted_at = datetime('now'), updated_at = datetime('now')
          WHERE id IN (${placeholders}) AND company_id = ?
        `).run(...projectIds, normalizedCompanyId);
        db.prepare(`
          UPDATE customers
          SET deleted_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ? AND company_id = ?
        `).run(customer.id, normalizedCompanyId);
      });
      cleanupTx();
      migratedCustomers += 1;
      continue;
    }

    const address = String(customer.house_address || customer.address || customer.area || "").trim();
    const tx = db.transaction(() => {
      quotations.forEach((quotation) => {
        updateQuotation.run(
          String(customer.name || "").trim() || null,
          String(customer.designer_name_manual || "").trim() || null,
          String(customer.phone || "").trim() || null,
          String(customer.weixin || "").trim() || null,
          address || null,
          address || null,
          String(customer.address_location_name || address || "").trim() || null,
          String(customer.address_location_address || address || "").trim() || null,
          customer.address_latitude ?? null,
          customer.address_longitude ?? null,
          String(customer.building_no || "").trim() || null,
          String(customer.unit_no || "").trim() || null,
          String(customer.room_no || "").trim() || null,
          customer.no_room_number ? 1 : 0,
          Number(customer.area_size || 0) || null,
          String(customer.decoration_type || "").trim() || null,
          quotation.id,
          normalizedCompanyId,
        );
      });
      db.prepare(`
        UPDATE projects
        SET deleted_at = datetime('now'), updated_at = datetime('now')
        WHERE id IN (${placeholders}) AND company_id = ?
      `).run(...projectIds, normalizedCompanyId);
      db.prepare(`
        UPDATE customers
        SET deleted_at = datetime('now'), updated_at = datetime('now')
        WHERE id = ? AND company_id = ?
      `).run(customer.id, normalizedCompanyId);
    });
    tx();
    migratedCustomers += 1;
    migratedQuotations += quotations.length;
  }

  return { migratedCustomers, migratedQuotations };
}
