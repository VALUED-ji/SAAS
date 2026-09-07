import Database from "better-sqlite3";
import path from "path";

const DB_PATH = path.join(process.cwd(), "prisma", "dev.db");

type GlobalDatabaseState = typeof globalThis & {
  __renovationSaasDb?: Database.Database;
  __renovationSaasSchemaReady?: boolean;
  __renovationSaasSchemaInitializing?: boolean;
  __renovationSaasMaterialSchemaReady?: boolean;
  __renovationSaasDesignerAssignmentSchemaReady?: boolean;
  __renovationSaasDefaultRolesReady?: boolean;
};

const globalDatabaseState = globalThis as GlobalDatabaseState;
let db: Database.Database | null = globalDatabaseState.__renovationSaasDb || null;
let schemaReady = Boolean(globalDatabaseState.__renovationSaasSchemaReady);
let schemaInitializing = Boolean(globalDatabaseState.__renovationSaasSchemaInitializing);
let materialSystemSchemaReady = Boolean(globalDatabaseState.__renovationSaasMaterialSchemaReady);
let designerAssignmentSchemaReady = Boolean(globalDatabaseState.__renovationSaasDesignerAssignmentSchemaReady);
let defaultRolesReady = Boolean(globalDatabaseState.__renovationSaasDefaultRolesReady);

export function getDb(): Database.Database {
  if (!db) {
    db = globalDatabaseState.__renovationSaasDb || new Database(DB_PATH);
    globalDatabaseState.__renovationSaasDb = db;
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
  }
  if (globalDatabaseState.__renovationSaasSchemaReady) schemaReady = true;
  if (globalDatabaseState.__renovationSaasSchemaInitializing) schemaInitializing = true;
  if (!schemaReady && !schemaInitializing) {
    schemaInitializing = true;
    globalDatabaseState.__renovationSaasSchemaInitializing = true;
    try {
      ensureDatabaseSchema(db);
      schemaReady = true;
      globalDatabaseState.__renovationSaasSchemaReady = true;
    } finally {
      schemaInitializing = false;
      globalDatabaseState.__renovationSaasSchemaInitializing = false;
    }
  }
  return db;
}

function makeDbId(prefix: string): string {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

// SQL Schema for all tables
const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  logo TEXT,
  phone TEXT,
  address TEXT,
  province TEXT,
  city TEXT,
  district TEXT,
  industry TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  password TEXT,
  session_version INTEGER DEFAULT 0,
  avatar TEXT,
  role TEXT NOT NULL DEFAULT 'SALES',
  org_unit_id TEXT REFERENCES org_units(id),
  employee_no TEXT,
  hire_date TEXT,
  notes TEXT,
  last_login_at TEXT,
  last_seen_at TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  permissions TEXT DEFAULT '[]',
  data_scope TEXT DEFAULT 'self',
  is_system INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  area TEXT,
  address TEXT,
  house_address TEXT,
  address_location_name TEXT,
  address_location_address TEXT,
  address_latitude REAL,
  address_longitude REAL,
  building_no TEXT,
  unit_no TEXT,
  room_no TEXT,
  no_room_number INTEGER DEFAULT 0,
  source TEXT,
  status TEXT DEFAULT 'NEW',
  current_action TEXT,
  intention TEXT,
  budget REAL,
  area_size REAL,
  weixin TEXT,
  service_store TEXT,
  house_type TEXT,
  decoration_type TEXT,
  designer_name_manual TEXT,
  is_delivered INTEGER DEFAULT 0,
  requirements TEXT,
  remarks TEXT,
  created_by_id TEXT REFERENCES users(id),
  inviter_id TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS customer_team (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  role TEXT NOT NULL,
  assigned_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS designer_assignment_requests (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  store_id TEXT REFERENCES org_units(id),
  approver_id TEXT NOT NULL REFERENCES users(id),
  requester_id TEXT REFERENCES users(id),
  preferred_designer_id TEXT REFERENCES users(id),
  request_group_id TEXT,
  workflow_mode TEXT NOT NULL DEFAULT 'approval',
  dispatcher_source TEXT,
  dispatcher_label TEXT,
  handler_id TEXT REFERENCES users(id),
  dispatched_by_id TEXT REFERENCES users(id),
  dispatched_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  assigned_user_id TEXT REFERENCES users(id),
  resolved_by_id TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  resolved_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS follow_ups (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  reply_to_id TEXT REFERENCES follow_ups(id),
  type TEXT NOT NULL,
  scene TEXT,
  content TEXT NOT NULL,
  next_date TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS customer_deposit_records (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  company_id TEXT NOT NULL REFERENCES companies(id),
  branch_org_unit_id TEXT REFERENCES org_units(id),
  amount REAL NOT NULL,
  received_at TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'manual',
  payment_channel TEXT,
  record_type TEXT DEFAULT 'deposit',
  deposit_type TEXT,
  receivable_amount REAL,
  design_fee_mode TEXT,
  quotation_id TEXT REFERENCES quotations(id),
  quotation_amount REAL,
  design_fee_base_amount REAL,
  design_fee_rate REAL,
  design_fee_area REAL,
  design_fee_unit_price REAL,
  designer_level TEXT,
  is_refundable INTEGER DEFAULT 0,
  receiver_name TEXT,
  voucher_url TEXT,
  notes TEXT,
  status TEXT DEFAULT 'received',
  refund_status TEXT,
  refund_amount REAL,
  refund_reason TEXT,
  refund_requested_by_id TEXT REFERENCES users(id),
  refund_requested_at TEXT,
  refund_processed_at TEXT,
  waived_amount REAL DEFAULT 0,
  waiver_status TEXT,
  waiver_reason TEXT,
  waiver_requested_by_id TEXT REFERENCES users(id),
  waiver_requested_at TEXT,
  waiver_processed_at TEXT,
  created_by_id TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  manager_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  address TEXT,
  area REAL,
  style TEXT,
  status TEXT DEFAULT 'LEAD',
  finance_no TEXT,
  budget_amount REAL,
  contract_amount REAL,
  start_date TEXT,
  planned_end_date TEXT,
  actual_end_date TEXT,
  site_location_name TEXT,
  site_location_address TEXT,
  site_latitude REAL,
  site_longitude REAL,
  weekend_construction INTEGER DEFAULT 0,
  holiday_construction INTEGER DEFAULT 0,
  has_floor_heating INTEGER DEFAULT 0,
  description TEXT,
  progress INTEGER DEFAULT 0,
  site_stage TEXT,
  current_phase TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS project_phases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  phase TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  status TEXT DEFAULT 'PENDING',
  start_date TEXT,
  end_date TEXT,
  description TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  phase_id TEXT REFERENCES project_phases(id),
  name TEXT NOT NULL,
  description TEXT,
  assignee_id TEXT REFERENCES users(id),
  status TEXT DEFAULT 'PENDING',
  priority TEXT DEFAULT 'MEDIUM',
  planned_start TEXT,
  planned_end TEXT,
  actual_start TEXT,
  actual_end TEXT,
  labor_cost REAL,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

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

CREATE TABLE IF NOT EXISTS quotations (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id),
  company_id TEXT NOT NULL REFERENCES companies(id),
  title TEXT,
  version INTEGER DEFAULT 1,
  total_amount REAL NOT NULL,
  discount REAL DEFAULT 0,
  final_amount REAL,
  status TEXT DEFAULT 'DRAFT',
  notes TEXT,
  customer_visible_note TEXT,
  terms TEXT,
  settings TEXT,
  temp_customer_name TEXT,
  temp_customer_designer_name TEXT,
  temp_customer_phone TEXT,
  temp_customer_weixin TEXT,
  temp_customer_address TEXT,
  temp_customer_area REAL,
  temp_customer_decoration_type TEXT,
  created_by_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS quotation_items (
  id TEXT PRIMARY KEY,
  quotation_id TEXT NOT NULL REFERENCES quotations(id),
  category TEXT NOT NULL,
  space TEXT,
  work_type_id TEXT,
  work_type_name TEXT,
  material_category_id TEXT,
  material_category_name TEXT,
  name TEXT NOT NULL,
  spec TEXT,
  material_model TEXT,
  remark TEXT,
  unit TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  total_price REAL NOT NULL,
  material_cost REAL,
  labor_cost REAL,
  profit_margin REAL,
  row_color TEXT,
  fee_calc_method TEXT,
  fee_calc_base TEXT,
  fee_rate REAL,
  quota_source_id TEXT,
  quota_source_type TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS custom_quota_items (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  org_unit_id TEXT REFERENCES org_units(id),
  store_name TEXT,
  category TEXT,
  work_type_id TEXT,
  work_type_name TEXT,
  material_category_id TEXT,
  material_category_name TEXT,
  name TEXT NOT NULL,
  construction_description TEXT,
  unit TEXT NOT NULL,
  labor_price REAL DEFAULT 0,
  material_price REAL DEFAULT 0,
  total_price REAL DEFAULT 0,
  is_special_price INTEGER DEFAULT 0,
  status TEXT DEFAULT 'enabled',
  source_quotation_id TEXT REFERENCES quotations(id),
  source_quotation_item_id TEXT,
  created_by_id TEXT REFERENCES users(id),
  promoted_quota_code TEXT,
  promoted_at TEXT,
  promoted_by_id TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS quotation_receipt_todos (
  id TEXT PRIMARY KEY,
  quotation_id TEXT NOT NULL REFERENCES quotations(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  designer_id TEXT NOT NULL REFERENCES users(id),
  sender_id TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT DEFAULT (datetime('now')),
  received_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS contracts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  company_id TEXT NOT NULL REFERENCES companies(id),
  contract_no TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  total_amount REAL NOT NULL,
  status TEXT DEFAULT 'DRAFT',
  signed_at TEXT,
  effective_at TEXT,
  expire_at TEXT,
  file_url TEXT,
  content TEXT,
  created_by_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS payment_plans (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  contract_id TEXT REFERENCES contracts(id),
  milestone TEXT NOT NULL,
  due_date TEXT,
  amount REAL NOT NULL,
  status TEXT DEFAULT 'PENDING',
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payment_records (
  id TEXT PRIMARY KEY,
  payment_plan_id TEXT NOT NULL REFERENCES payment_plans(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  amount REAL NOT NULL,
  pay_method TEXT NOT NULL,
  pay_date TEXT DEFAULT (datetime('now')),
  receipt_no TEXT,
  notes TEXT,
  reversal_of_record_id TEXT,
  reversed_at TEXT,
  reversed_by_id TEXT,
  reversal_reason TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS material_categories (
  id TEXT PRIMARY KEY,
  company_id TEXT REFERENCES companies(id),
  name TEXT NOT NULL,
  parent_id TEXT REFERENCES material_categories(id),
  material_type TEXT DEFAULT 'AUXILIARY',
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS work_types (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  code TEXT,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  remark TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  name TEXT NOT NULL,
  contact TEXT,
  phone TEXT,
  address TEXT,
  remark TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS supplier_accounts (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id),
  company_id TEXT NOT NULL REFERENCES companies(id),
  login_account TEXT NOT NULL,
  display_name TEXT,
  phone TEXT,
  role TEXT DEFAULT 'ORDER',
  is_active INTEGER DEFAULT 1,
  remark TEXT,
  last_login_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS materials (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  code TEXT,
  category_id TEXT REFERENCES material_categories(id),
  name TEXT NOT NULL,
  brand TEXT,
  product_name TEXT,
  material_model TEXT,
  color TEXT,
  spec TEXT,
  product_attributes TEXT,
  product_highlights TEXT,
  product_detail TEXT,
  unit TEXT NOT NULL,
  unit_price REAL NOT NULL,
  market_price REAL,
  cost_price REAL,
  internal_control_price REAL,
  supplier_id TEXT REFERENCES suppliers(id),
  stock INTEGER DEFAULT 0,
  min_stock INTEGER DEFAULT 0,
  image TEXT,
  images TEXT,
  remark TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS material_price_history (
  id TEXT PRIMARY KEY,
  material_id TEXT NOT NULL REFERENCES materials(id),
  company_id TEXT NOT NULL REFERENCES companies(id),
  cost_price REAL,
  unit_price REAL NOT NULL DEFAULT 0,
  changed_fields TEXT,
  changed_by_id TEXT REFERENCES users(id),
  changed_by_name TEXT,
  source TEXT DEFAULT 'manual',
  changed_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS material_product_skus (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  material_id TEXT NOT NULL REFERENCES materials(id),
  sku_code TEXT,
  sku_name TEXT NOT NULL,
  spec TEXT,
  color TEXT,
  attributes TEXT,
  unit TEXT,
  unit_price REAL NOT NULL DEFAULT 0,
  market_price REAL,
  cost_price REAL,
  internal_control_price REAL,
  stock REAL DEFAULT 0,
  min_stock REAL DEFAULT 0,
  image TEXT,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS material_stock_movements (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  material_id TEXT NOT NULL REFERENCES materials(id),
  movement_type TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  before_stock REAL NOT NULL DEFAULT 0,
  after_stock REAL NOT NULL DEFAULT 0,
  source_type TEXT DEFAULT 'manual',
  source_id TEXT,
  source_no TEXT,
  operator_id TEXT REFERENCES users(id),
  operator_name TEXT,
  reason TEXT,
  remark TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS material_orders (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  project_id TEXT REFERENCES projects(id),
  supplier_id TEXT REFERENCES suppliers(id),
  order_no TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'PENDING',
  total_amount REAL DEFAULT 0,
  paid_amount REAL DEFAULT 0,
  order_date TEXT DEFAULT (datetime('now')),
  delivery_date TEXT,
  notes TEXT,
  created_by_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS material_order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES material_orders(id),
  material_id TEXT NOT NULL REFERENCES materials(id),
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  total_price REAL NOT NULL,
  received_qty REAL DEFAULT 0,
  stock_deducted_qty REAL DEFAULT 0,
  remark TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS material_inbound_orders (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  supplier_id TEXT REFERENCES suppliers(id),
  warehouse_id TEXT REFERENCES suppliers(id),
  inbound_no TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'DRAFT',
  source_type TEXT DEFAULT 'PURCHASE',
  total_amount REAL DEFAULT 0,
  inbound_date TEXT DEFAULT (datetime('now')),
  handler_name TEXT,
  notes TEXT,
  created_by_id TEXT REFERENCES users(id),
  confirmed_by_id TEXT REFERENCES users(id),
  confirmed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS material_inbound_order_items (
  id TEXT PRIMARY KEY,
  inbound_id TEXT NOT NULL REFERENCES material_inbound_orders(id),
  material_id TEXT NOT NULL REFERENCES materials(id),
  quantity REAL NOT NULL,
  unit_price REAL DEFAULT 0,
  total_price REAL DEFAULT 0,
  remark TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS material_requisitions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  requisition_no TEXT UNIQUE NOT NULL,
  issued_by_id TEXT NOT NULL REFERENCES users(id),
  received_by_id TEXT REFERENCES users(id),
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS material_requisition_items (
  id TEXT PRIMARY KEY,
  requisition_id TEXT NOT NULL REFERENCES material_requisitions(id),
  material_id TEXT NOT NULL REFERENCES materials(id),
  quantity REAL NOT NULL,
  unit_price REAL,
  remark TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS daily_logs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  author_id TEXT NOT NULL REFERENCES users(id),
  log_date TEXT DEFAULT (datetime('now')),
  phase TEXT,
  weather TEXT,
  temperature INTEGER,
  content TEXT NOT NULL,
  worker_count INTEGER,
  completed_work TEXT,
  material_notes TEXT,
  quality_notes TEXT,
  safety_notes TEXT,
  issue_notes TEXT,
  next_plan TEXT,
  location_name TEXT,
  location_address TEXT,
  latitude REAL,
  longitude REAL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS daily_log_photos (
  id TEXT PRIMARY KEY,
  log_id TEXT NOT NULL REFERENCES daily_logs(id),
  url TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

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

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  is_read INTEGER DEFAULT 0,
  link_url TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS org_units (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  parent_id TEXT REFERENCES org_units(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  manager_id TEXT REFERENCES users(id),
  manager_name TEXT,
  is_active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS org_unit_managers (
  id TEXT PRIMARY KEY,
  org_unit_id TEXT NOT NULL REFERENCES org_units(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  is_primary INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS branch_settings (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  org_unit_id TEXT NOT NULL REFERENCES org_units(id),
  settings TEXT NOT NULL DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS operation_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT,
  detail TEXT,
  ip_address TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quotation_change_logs (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  quotation_id TEXT NOT NULL REFERENCES quotations(id),
  user_id TEXT REFERENCES users(id),
  user_name TEXT,
  action TEXT NOT NULL,
  summary TEXT,
  change_count INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS quotation_change_log_items (
  id TEXT PRIMARY KEY,
  log_id TEXT NOT NULL REFERENCES quotation_change_logs(id),
  quotation_id TEXT NOT NULL REFERENCES quotations(id),
  quotation_item_id TEXT,
  item_name TEXT,
  space TEXT,
  category TEXT,
  change_type TEXT NOT NULL,
  field_key TEXT,
  field_label TEXT,
  old_value TEXT,
  new_value TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payroll_records (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  period TEXT NOT NULL,
  base_pay REAL NOT NULL,
  bonus REAL,
  deduction REAL,
  total_pay REAL NOT NULL,
  status TEXT DEFAULT 'PENDING',
  pay_date TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_company_code ON roles(company_id, code);
CREATE INDEX IF NOT EXISTS idx_roles_company ON roles(company_id);
CREATE INDEX IF NOT EXISTS idx_projects_company ON projects(company_id);
CREATE INDEX IF NOT EXISTS idx_projects_customer ON projects(customer_id);
CREATE INDEX IF NOT EXISTS idx_projects_manager ON projects(manager_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_customers_company ON customers(company_id);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
CREATE INDEX IF NOT EXISTS idx_customers_dashboard_created ON customers(deleted_at, created_at);
CREATE INDEX IF NOT EXISTS idx_projects_dashboard_created_status ON projects(deleted_at, created_at, status);
CREATE INDEX IF NOT EXISTS idx_quotations_dashboard_created_status ON quotations(deleted_at, created_at, status);
CREATE INDEX IF NOT EXISTS idx_quotations_deleted_updated_created ON quotations(deleted_at, updated_at DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_records_pay_date ON payment_records(pay_date);
CREATE INDEX IF NOT EXISTS idx_follow_ups_deleted_created_id ON follow_ups(deleted_at, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_users_deleted_active_created ON users(deleted_at, is_active, created_at);
CREATE INDEX IF NOT EXISTS idx_org_units_deleted_parent ON org_units(deleted_at, parent_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_deleted_status_updated ON suppliers(deleted_at, cooperation_status, updated_at);
CREATE INDEX IF NOT EXISTS idx_customer_deposit_records_customer ON customer_deposit_records(customer_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_customer_deposit_records_company ON customer_deposit_records(company_id, received_at);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_quotations_project ON quotations(project_id);
CREATE INDEX IF NOT EXISTS idx_custom_quota_items_scope ON custom_quota_items(company_id, org_unit_id, status, deleted_at);
CREATE INDEX IF NOT EXISTS idx_custom_quota_items_lookup ON custom_quota_items(company_id, name, unit, category, deleted_at);
CREATE INDEX IF NOT EXISTS idx_payment_plans_project ON payment_plans(project_id);
CREATE INDEX IF NOT EXISTS idx_materials_company ON materials(company_id);
CREATE INDEX IF NOT EXISTS idx_work_types_company ON work_types(company_id, is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_material_orders_company ON material_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_material_inbound_orders_company ON material_inbound_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_daily_logs_project ON daily_logs(project_id);
CREATE INDEX IF NOT EXISTS idx_site_node_events_project_time ON site_node_events(project_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_site_node_events_node ON site_node_events(project_id, stage_id, node_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_node_events_source ON site_node_events(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_org_unit_managers_org ON org_unit_managers(org_unit_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_org_unit_managers_user ON org_unit_managers(user_id, deleted_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_unit_managers_active_unique
  ON org_unit_managers(org_unit_id, user_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_designer_assignment_requests_approver ON designer_assignment_requests(approver_id, status);
CREATE INDEX IF NOT EXISTS idx_designer_assignment_requests_customer ON designer_assignment_requests(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_quotation_receipt_todos_designer ON quotation_receipt_todos(designer_id, status);
CREATE INDEX IF NOT EXISTS idx_quotation_receipt_todos_quotation ON quotation_receipt_todos(quotation_id, designer_id, status);
CREATE INDEX IF NOT EXISTS idx_operation_logs_user ON operation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_operation_logs_entity ON operation_logs(entity, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_quotation_change_logs_company ON quotation_change_logs(company_id, created_at);
CREATE INDEX IF NOT EXISTS idx_quotation_change_logs_quotation ON quotation_change_logs(quotation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_quotation_change_log_items_log ON quotation_change_log_items(log_id);
CREATE INDEX IF NOT EXISTS idx_quotation_change_log_items_quotation ON quotation_change_log_items(quotation_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_branch_settings_org ON branch_settings(org_unit_id);
`;

export function initializeDatabase(): void {
  const database = getDb();
  if (schemaReady || globalDatabaseState.__renovationSaasSchemaReady) return;
  ensureDatabaseSchema(database);
  schemaReady = true;
  globalDatabaseState.__renovationSaasSchemaReady = true;
}

function ensureDatabaseSchema(database: Database.Database): void {
  database.exec(SCHEMA_SQL);
  ensureColumn(database, "users", "avatar", "TEXT");
  ensureColumn(database, "users", "last_login_at", "TEXT");
  ensureColumn(database, "users", "last_seen_at", "TEXT");
  ensureColumn(database, "customers", "inviter_id", "TEXT REFERENCES users(id)");
  ensureColumn(database, "customers", "house_address", "TEXT");
  ensureColumn(database, "customers", "address_location_name", "TEXT");
  ensureColumn(database, "customers", "address_location_address", "TEXT");
  ensureColumn(database, "customers", "address_latitude", "REAL");
  ensureColumn(database, "customers", "address_longitude", "REAL");
  ensureColumn(database, "customers", "building_no", "TEXT");
  ensureColumn(database, "customers", "unit_no", "TEXT");
  ensureColumn(database, "customers", "room_no", "TEXT");
  ensureColumn(database, "customers", "no_room_number", "INTEGER DEFAULT 0");
  ensureColumn(database, "customers", "designer_name_manual", "TEXT");
  ensureColumn(database, "projects", "weekend_construction", "INTEGER DEFAULT 0");
  ensureColumn(database, "projects", "holiday_construction", "INTEGER DEFAULT 0");
  ensureColumn(database, "projects", "has_floor_heating", "INTEGER DEFAULT 0");
  ensureColumn(database, "projects", "finance_no", "TEXT");
  ensureColumn(database, "org_units", "manager_id", "TEXT REFERENCES users(id)");
  ensureColumn(database, "org_units", "manager_name", "TEXT");
  ensureColumn(database, "org_units", "is_active", "INTEGER DEFAULT 1");
  ensureDesignerAssignmentSchema(database);
  ensureColumn(database, "follow_ups", "reply_to_id", "TEXT REFERENCES follow_ups(id)");
  ensureColumn(database, "follow_ups", "scene", "TEXT");
  ensureColumn(database, "follow_ups", "deleted_at", "TEXT");
  database.exec("CREATE INDEX IF NOT EXISTS idx_follow_ups_reply_to ON follow_ups(reply_to_id);");
  ensureColumn(database, "customer_deposit_records", "record_type", "TEXT DEFAULT 'deposit'");
  ensureColumn(database, "customer_deposit_records", "receivable_amount", "REAL");
  ensureColumn(database, "customer_deposit_records", "design_fee_mode", "TEXT");
  ensureColumn(database, "customer_deposit_records", "quotation_id", "TEXT REFERENCES quotations(id)");
  ensureColumn(database, "customer_deposit_records", "quotation_amount", "REAL");
  ensureColumn(database, "customer_deposit_records", "design_fee_base_amount", "REAL");
  ensureColumn(database, "customer_deposit_records", "design_fee_rate", "REAL");
  ensureColumn(database, "customer_deposit_records", "design_fee_area", "REAL");
  ensureColumn(database, "customer_deposit_records", "design_fee_unit_price", "REAL");
  ensureColumn(database, "customer_deposit_records", "designer_level", "TEXT");
  ensureColumn(database, "users", "session_version", "INTEGER DEFAULT 0");
  ensureColumn(database, "payment_records", "reversal_of_record_id", "TEXT");
  ensureColumn(database, "payment_records", "reversed_at", "TEXT");
  ensureColumn(database, "payment_records", "reversed_by_id", "TEXT");
  ensureColumn(database, "payment_records", "reversal_reason", "TEXT");
  ensureColumn(database, "quotations", "title", "TEXT");
  ensureColumn(database, "quotations", "terms", "TEXT");
  ensureColumn(database, "quotations", "settings", "TEXT");
  ensureColumn(database, "quotations", "temp_customer_name", "TEXT");
  ensureColumn(database, "quotations", "temp_customer_designer_name", "TEXT");
  ensureColumn(database, "quotations", "temp_customer_phone", "TEXT");
  ensureColumn(database, "quotations", "temp_customer_weixin", "TEXT");
  ensureColumn(database, "quotations", "temp_customer_address", "TEXT");
  ensureColumn(database, "quotations", "temp_customer_area", "REAL");
  ensureColumn(database, "quotations", "temp_customer_decoration_type", "TEXT");
  ensureColumn(database, "roles", "data_scope", "TEXT DEFAULT 'self'");
  ensureColumn(database, "attachments", "customer_id", "TEXT REFERENCES customers(id)");
  ensureColumn(database, "attachments", "followup_id", "TEXT REFERENCES follow_ups(id)");
  ensureColumn(database, "attachments", "user_id", "TEXT REFERENCES users(id)");
  database.exec("CREATE INDEX IF NOT EXISTS idx_attachments_customer ON attachments(customer_id);");
  database.exec("CREATE INDEX IF NOT EXISTS idx_attachments_followup ON attachments(followup_id);");
  ensureColumn(database, "quotation_items", "space", "TEXT");
  ensureColumn(database, "quotation_items", "work_type_id", "TEXT");
  ensureColumn(database, "quotation_items", "work_type_name", "TEXT");
  ensureColumn(database, "quotation_items", "material_category_id", "TEXT");
  ensureColumn(database, "quotation_items", "material_category_name", "TEXT");
  ensureColumn(database, "quotation_items", "material_model", "TEXT");
  ensureColumn(database, "quotation_items", "remark", "TEXT");
  ensureColumn(database, "quotation_items", "row_color", "TEXT");
  ensureColumn(database, "quotation_items", "fee_calc_method", "TEXT");
  ensureColumn(database, "quotation_items", "fee_calc_base", "TEXT");
  ensureColumn(database, "quotation_items", "fee_rate", "REAL");
  ensureColumn(database, "quotation_items", "quota_source_id", "TEXT");
  ensureColumn(database, "quotation_items", "quota_source_type", "TEXT");
  ensureColumn(database, "custom_quota_items", "work_type_id", "TEXT");
  ensureColumn(database, "custom_quota_items", "work_type_name", "TEXT");
  ensureColumn(database, "custom_quota_items", "material_category_id", "TEXT");
  ensureColumn(database, "custom_quota_items", "material_category_name", "TEXT");
  ensureColumn(database, "daily_logs", "phase", "TEXT");
  ensureColumn(database, "daily_logs", "completed_work", "TEXT");
  ensureColumn(database, "daily_logs", "material_notes", "TEXT");
  ensureColumn(database, "daily_logs", "quality_notes", "TEXT");
  ensureColumn(database, "daily_logs", "issue_notes", "TEXT");
  ensureColumn(database, "daily_logs", "next_plan", "TEXT");
  ensureColumn(database, "daily_logs", "location_name", "TEXT");
  ensureColumn(database, "daily_logs", "location_address", "TEXT");
  ensureColumn(database, "daily_logs", "latitude", "REAL");
  ensureColumn(database, "daily_logs", "longitude", "REAL");
  ensureColumn(database, "daily_logs", "deleted_at", "TEXT");
  ensureMaterialSystemSchema(database);
  ensureDefaultRoles(database);
}

function ensureColumn(database: Database.Database, table: string, column: string, definition: string): void {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((item) => item.name === column)) {
    database.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}

export function ensureDesignerAssignmentSchema(database: Database.Database = getDb()): void {
  if (designerAssignmentSchemaReady || globalDatabaseState.__renovationSaasDesignerAssignmentSchemaReady) {
    designerAssignmentSchemaReady = true;
    return;
  }

  ensureColumn(database, "designer_assignment_requests", "preferred_designer_id", "TEXT REFERENCES users(id)");
  ensureColumn(database, "designer_assignment_requests", "request_group_id", "TEXT");
  ensureColumn(database, "designer_assignment_requests", "workflow_mode", "TEXT NOT NULL DEFAULT 'approval'");
  ensureColumn(database, "designer_assignment_requests", "dispatcher_source", "TEXT");
  ensureColumn(database, "designer_assignment_requests", "dispatcher_label", "TEXT");
  ensureColumn(database, "designer_assignment_requests", "handler_id", "TEXT REFERENCES users(id)");
  ensureColumn(database, "designer_assignment_requests", "dispatched_by_id", "TEXT REFERENCES users(id)");
  ensureColumn(database, "designer_assignment_requests", "dispatched_at", "TEXT");
  ensureColumn(database, "designer_assignment_requests", "resolved_by_id", "TEXT REFERENCES users(id)");
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_designer_assignment_requests_handler
      ON designer_assignment_requests(handler_id, status);
    CREATE INDEX IF NOT EXISTS idx_designer_assignment_requests_group
      ON designer_assignment_requests(request_group_id, status);
  `);
  designerAssignmentSchemaReady = true;
  globalDatabaseState.__renovationSaasDesignerAssignmentSchemaReady = true;
}

export function ensureMaterialSystemSchema(database: Database.Database = getDb()): void {
  if (materialSystemSchemaReady || globalDatabaseState.__renovationSaasMaterialSchemaReady) {
    const categoryColumns = database.prepare("PRAGMA table_info(material_categories)").all() as { name: string }[];
    const materialColumns = database.prepare("PRAGMA table_info(materials)").all() as { name: string }[];
    const categoryColumnNames = new Set(categoryColumns.map((item) => item.name));
    const materialColumnNames = new Set(materialColumns.map((item) => item.name));
	    const schemaReady =
	      categoryColumnNames.has("material_type") &&
	      materialColumnNames.has("product_attributes") &&
	      materialColumnNames.has("product_highlights") &&
	      materialColumnNames.has("product_detail") &&
	      Boolean(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'material_product_skus'").get());
    if (schemaReady) {
      materialSystemSchemaReady = true;
      return;
    }
    materialSystemSchemaReady = false;
    globalDatabaseState.__renovationSaasMaterialSchemaReady = false;
  }

	  const materialColumns = database.prepare("PRAGMA table_info(materials)").all() as { name: string }[];
	  const supplierColumns = database.prepare("PRAGMA table_info(suppliers)").all() as { name: string }[];
	  const orderColumns = database.prepare("PRAGMA table_info(material_orders)").all() as { name: string }[];
  const isFirstMaterialMigration = !materialColumns.some((item) => item.name === "material_type");
  const isFirstSupplierMigration = !supplierColumns.some((item) => item.name === "supplier_type");
  const isFirstOrderMigration = !orderColumns.some((item) => item.name === "order_type");
  ensureColumn(database, "materials", "code", "TEXT");
  ensureColumn(database, "materials", "material_type", "TEXT DEFAULT 'AUXILIARY'");
  ensureColumn(database, "materials", "supply_mode", "TEXT DEFAULT 'WAREHOUSE'");
  ensureColumn(database, "materials", "product_name", "TEXT");
  ensureColumn(database, "materials", "material_model", "TEXT");
  ensureColumn(database, "materials", "color", "TEXT");
  ensureColumn(database, "materials", "product_attributes", "TEXT");
  ensureColumn(database, "materials", "product_highlights", "TEXT");
  ensureColumn(database, "materials", "product_detail", "TEXT");
  ensureColumn(database, "materials", "warehouse_name", "TEXT");
  ensureColumn(database, "materials", "owner_name", "TEXT");
  ensureColumn(database, "materials", "settlement_cycle", "TEXT DEFAULT 'MONTHLY'");
	  ensureColumn(database, "materials", "images", "TEXT");
	  ensureColumn(database, "materials", "is_core", "INTEGER DEFAULT 1");
	  database.exec(`
	    CREATE TABLE IF NOT EXISTS material_product_skus (
	      id TEXT PRIMARY KEY,
	      company_id TEXT NOT NULL REFERENCES companies(id),
	      material_id TEXT NOT NULL REFERENCES materials(id),
	      sku_code TEXT,
	      sku_name TEXT NOT NULL,
	      spec TEXT,
	      color TEXT,
	      attributes TEXT,
	      unit TEXT,
	      unit_price REAL NOT NULL DEFAULT 0,
	      market_price REAL,
	      cost_price REAL,
	      internal_control_price REAL,
	      stock REAL DEFAULT 0,
	      min_stock REAL DEFAULT 0,
	      image TEXT,
	      is_active INTEGER DEFAULT 1,
	      sort_order INTEGER DEFAULT 0,
	      created_at TEXT DEFAULT (datetime('now')),
	      updated_at TEXT DEFAULT (datetime('now')),
	      deleted_at TEXT
	    );
	    CREATE INDEX IF NOT EXISTS idx_material_product_skus_material
	      ON material_product_skus(material_id, deleted_at, is_active, sort_order);
	    CREATE INDEX IF NOT EXISTS idx_material_product_skus_company
	      ON material_product_skus(company_id, material_id, deleted_at);
	  `);
	  ensureColumn(database, "materials", "market_price", "REAL");
	  ensureColumn(database, "materials", "internal_control_price", "REAL");
	  ensureColumn(database, "material_product_skus", "market_price", "REAL");
	  ensureColumn(database, "material_product_skus", "internal_control_price", "REAL");
	  ensureColumn(database, "material_categories", "company_id", "TEXT REFERENCES companies(id)");
  ensureColumn(database, "material_categories", "parent_id", "TEXT");
  ensureColumn(database, "material_categories", "material_type", "TEXT DEFAULT 'AUXILIARY'");
  ensureColumn(database, "material_categories", "is_active", "INTEGER DEFAULT 1");
  ensureColumn(database, "material_categories", "updated_at", "TEXT");
  ensureColumn(database, "material_categories", "deleted_at", "TEXT");
  ensureColumn(database, "suppliers", "supplier_type", "TEXT DEFAULT 'MAIN_MATERIAL'");
  ensureColumn(database, "suppliers", "settlement_cycle", "TEXT DEFAULT 'MONTHLY'");
  ensureColumn(database, "suppliers", "bank_account", "TEXT");
  ensureColumn(database, "suppliers", "tax_no", "TEXT");
  ensureColumn(database, "suppliers", "cooperation_status", "TEXT DEFAULT 'ACTIVE'");
  ensureColumn(database, "suppliers", "owner_name", "TEXT");
  ensureColumn(database, "suppliers", "settlement_method", "TEXT");
  ensureColumn(database, "suppliers", "main_categories", "TEXT");
  ensureColumn(database, "suppliers", "rating", "TEXT DEFAULT 'UNRATED'");
  database.exec(`
    CREATE TABLE IF NOT EXISTS supplier_accounts (
      id TEXT PRIMARY KEY,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id),
      company_id TEXT NOT NULL REFERENCES companies(id),
      login_account TEXT NOT NULL,
      display_name TEXT,
      phone TEXT,
      role TEXT DEFAULT 'ORDER',
      is_active INTEGER DEFAULT 1,
      remark TEXT,
      last_login_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
  `);
  ensureColumn(database, "material_orders", "order_type", "TEXT DEFAULT 'MAIN_SUPPLIER'");
  ensureColumn(database, "material_orders", "warehouse_status", "TEXT DEFAULT 'WAITING'");
  ensureColumn(database, "material_orders", "settlement_status", "TEXT DEFAULT 'UNSETTLED'");
  ensureColumn(database, "material_orders", "settlement_month", "TEXT");
  ensureColumn(database, "material_orders", "handler_name", "TEXT");
  ensureColumn(database, "material_orders", "received_at", "TEXT");
  ensureColumn(database, "material_orders", "print_count", "INTEGER DEFAULT 0");
  ensureColumn(database, "material_orders", "last_printed_at", "TEXT");
  ensureColumn(database, "material_orders", "stock_deducted", "INTEGER DEFAULT 0");
  ensureColumn(database, "material_order_items", "stock_deducted_qty", "REAL DEFAULT 0");
  database.exec(`
    CREATE TABLE IF NOT EXISTS material_inbound_orders (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      supplier_id TEXT REFERENCES suppliers(id),
      warehouse_id TEXT REFERENCES suppliers(id),
      inbound_no TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'DRAFT',
      source_type TEXT DEFAULT 'PURCHASE',
      total_amount REAL DEFAULT 0,
      inbound_date TEXT DEFAULT (datetime('now')),
      handler_name TEXT,
      notes TEXT,
      created_by_id TEXT REFERENCES users(id),
      confirmed_by_id TEXT REFERENCES users(id),
      confirmed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS material_inbound_order_items (
      id TEXT PRIMARY KEY,
      inbound_id TEXT NOT NULL REFERENCES material_inbound_orders(id),
      material_id TEXT NOT NULL REFERENCES materials(id),
      quantity REAL NOT NULL,
      unit_price REAL DEFAULT 0,
      total_price REAL DEFAULT 0,
      remark TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  ensureColumn(database, "material_inbound_orders", "supplier_id", "TEXT REFERENCES suppliers(id)");
  ensureColumn(database, "material_inbound_orders", "warehouse_id", "TEXT REFERENCES suppliers(id)");
  ensureColumn(database, "material_inbound_orders", "status", "TEXT DEFAULT 'DRAFT'");
  ensureColumn(database, "material_inbound_orders", "source_type", "TEXT DEFAULT 'PURCHASE'");
  ensureColumn(database, "material_inbound_orders", "total_amount", "REAL DEFAULT 0");
  ensureColumn(database, "material_inbound_orders", "inbound_date", "TEXT");
  ensureColumn(database, "material_inbound_orders", "handler_name", "TEXT");
  ensureColumn(database, "material_inbound_orders", "notes", "TEXT");
  ensureColumn(database, "material_inbound_orders", "confirmed_by_id", "TEXT REFERENCES users(id)");
  ensureColumn(database, "material_inbound_orders", "confirmed_at", "TEXT");
  ensureColumn(database, "material_inbound_orders", "updated_at", "TEXT");
  ensureColumn(database, "material_inbound_orders", "deleted_at", "TEXT");

  const activeCompanies = database.prepare(`
    SELECT id
    FROM companies
    WHERE deleted_at IS NULL
    ORDER BY datetime(COALESCE(created_at, '1970-01-01')) ASC, id ASC
  `).all() as { id: string }[];
  const legacyCategories = database.prepare(`
    SELECT id, name, parent_id, sort_order, is_active, created_at, updated_at, deleted_at
    FROM material_categories
    WHERE company_id IS NULL
    ORDER BY CASE WHEN parent_id IS NULL THEN 0 ELSE 1 END, sort_order ASC, id ASC
  `).all() as Array<{
    id: string;
    name: string;
    parent_id?: string | null;
    sort_order?: number | null;
    is_active?: number | null;
    created_at?: string | null;
    updated_at?: string | null;
    deleted_at?: string | null;
  }>;
  if (activeCompanies.length > 0 && legacyCategories.length > 0) {
    const migrateLegacyCategories = (database as any).transaction(() => {
      const ownerCompanyId = activeCompanies[0].id;
      database.prepare("UPDATE material_categories SET company_id = ? WHERE company_id IS NULL").run(ownerCompanyId);

      activeCompanies.slice(1).forEach(({ id: companyId }) => {
        const idMap = new Map<string, string>();
        legacyCategories.forEach((category) => idMap.set(category.id, makeDbId("MC")));
        const insertCategory = database.prepare(`
          INSERT INTO material_categories (
            id, company_id, name, parent_id, sort_order, is_active, created_at, updated_at, deleted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        legacyCategories.forEach((category) => {
          insertCategory.run(
            idMap.get(category.id),
            companyId,
            category.name,
            category.parent_id ? idMap.get(category.parent_id) || null : null,
            category.sort_order ?? 0,
            category.is_active ?? 1,
            category.created_at || new Date().toISOString(),
            category.updated_at || category.created_at || new Date().toISOString(),
            category.deleted_at || null,
          );
        });
        const updateMaterialCategory = database.prepare(`
          UPDATE materials
          SET category_id = ?, updated_at = COALESCE(updated_at, datetime('now'))
          WHERE company_id = ? AND category_id = ?
        `);
        legacyCategories.forEach((category) => {
          updateMaterialCategory.run(idMap.get(category.id), companyId, category.id);
        });
      });
    });
    migrateLegacyCategories();
  }
  database.exec(`
    CREATE TABLE IF NOT EXISTS material_price_history (
      id TEXT PRIMARY KEY,
      material_id TEXT NOT NULL REFERENCES materials(id),
      company_id TEXT NOT NULL REFERENCES companies(id),
      cost_price REAL,
      unit_price REAL NOT NULL DEFAULT 0,
      changed_fields TEXT,
      source TEXT DEFAULT 'manual',
      changed_at TEXT DEFAULT (datetime('now')),
      created_at TEXT DEFAULT (datetime('now'))
    );
	  `);
  database.exec(`
    CREATE TABLE IF NOT EXISTS material_stock_movements (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      material_id TEXT NOT NULL REFERENCES materials(id),
      movement_type TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      before_stock REAL NOT NULL DEFAULT 0,
      after_stock REAL NOT NULL DEFAULT 0,
      source_type TEXT DEFAULT 'manual',
      source_id TEXT,
      source_no TEXT,
      operator_id TEXT REFERENCES users(id),
      operator_name TEXT,
      reason TEXT,
      remark TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
	  ensureColumn(database, "material_price_history", "changed_fields", "TEXT");
	  ensureColumn(database, "material_price_history", "changed_by_id", "TEXT");
	  ensureColumn(database, "material_price_history", "changed_by_name", "TEXT");
  const materialCodePrefix = (() => {
    const now = new Date();
    return `XY${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  })();
  const makeUniqueMaterialCode = (existingCodes: Set<string>) => {
    let sequence = 1;
    let code = "";
    do {
      code = `${materialCodePrefix}${String(sequence).padStart(4, "0")}`;
      sequence += 1;
    } while (existingCodes.has(code));
    return code;
  };
  const companiesWithLegacyMaterialCodes = database.prepare(`
    SELECT DISTINCT company_id
    FROM materials
    WHERE deleted_at IS NULL AND code LIKE 'MAT%'
  `).all() as { company_id: string }[];
  companiesWithLegacyMaterialCodes.forEach((company) => {
    const existingCodes = new Set(
      (database.prepare("SELECT code FROM materials WHERE company_id = ? AND deleted_at IS NULL AND COALESCE(code, '') <> ''").all(company.company_id) as { code: string }[])
        .map((item) => item.code)
    );
    const legacyRows = (database.prepare(`
      SELECT id, code
      FROM materials
      WHERE company_id = ? AND deleted_at IS NULL AND code LIKE 'MAT%'
      ORDER BY created_at ASC, id ASC
    `).all(company.company_id) as { id: string; code: string }[])
      .filter((row) => /^MAT\d{10}$/.test(String(row.code || "")));

    legacyRows.forEach((row) => {
      existingCodes.delete(row.code);
      let code = `XY${row.code.slice(3)}`;
      if (existingCodes.has(code)) code = makeUniqueMaterialCode(existingCodes);
      existingCodes.add(code);
      database.prepare("UPDATE materials SET code = ?, updated_at = COALESCE(updated_at, datetime('now')) WHERE id = ?").run(code, row.id);
    });
  });
  const companiesWithMissingMaterialCodes = database.prepare(`
    SELECT DISTINCT company_id
    FROM materials
    WHERE deleted_at IS NULL AND COALESCE(code, '') = ''
  `).all() as { company_id: string }[];
  companiesWithMissingMaterialCodes.forEach((company) => {
    const existingCodes = new Set(
      (database.prepare("SELECT code FROM materials WHERE company_id = ? AND deleted_at IS NULL AND COALESCE(code, '') <> ''").all(company.company_id) as { code: string }[])
        .map((item) => item.code)
    );
    const missingRows = database.prepare(`
      SELECT id
      FROM materials
      WHERE company_id = ? AND deleted_at IS NULL AND COALESCE(code, '') = ''
      ORDER BY created_at ASC, id ASC
    `).all(company.company_id) as { id: string }[];
    let sequence = 1;
    missingRows.forEach((row) => {
      let code = "";
      do {
        code = `${materialCodePrefix}${String(sequence).padStart(4, "0")}`;
        sequence += 1;
      } while (existingCodes.has(code));
      existingCodes.add(code);
      database.prepare("UPDATE materials SET code = ?, updated_at = COALESCE(updated_at, datetime('now')) WHERE id = ?").run(code, row.id);
    });
  });
  const duplicateMaterialCodes = database.prepare(`
    SELECT company_id, code, GROUP_CONCAT(id) as ids
    FROM materials
    WHERE deleted_at IS NULL AND COALESCE(code, '') <> ''
    GROUP BY company_id, code
    HAVING COUNT(*) > 1
  `).all() as { company_id: string; code: string; ids: string }[];
  duplicateMaterialCodes.forEach((group) => {
    const ids = String(group.ids || "").split(",").filter(Boolean).slice(1);
    const existingCodes = new Set(
      (database.prepare("SELECT code FROM materials WHERE company_id = ? AND deleted_at IS NULL AND COALESCE(code, '') <> ''").all(group.company_id) as { code: string }[])
        .map((item) => item.code)
    );
    let sequence = 1;
    ids.forEach((id) => {
      let code = "";
      do {
        code = `${materialCodePrefix}${String(sequence).padStart(4, "0")}`;
        sequence += 1;
      } while (existingCodes.has(code));
      existingCodes.add(code);
      database.prepare("UPDATE materials SET code = ?, updated_at = COALESCE(updated_at, datetime('now')) WHERE id = ?").run(code, id);
    });
  });
	  database.prepare(`
	    INSERT INTO material_price_history (id, material_id, company_id, cost_price, unit_price, changed_fields, changed_by_id, changed_by_name, source, changed_at, created_at)
	    SELECT 'MPH_INIT_' || m.id,
	      m.id,
	      m.company_id,
	      m.cost_price,
	      COALESCE(m.unit_price, 0),
	      'cost_price,unit_price',
	      NULL,
	      '系统初始化',
	      'initial',
	      COALESCE(m.updated_at, m.created_at, datetime('now')),
	      datetime('now')
    FROM materials m
    WHERE m.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM material_price_history mph
        WHERE mph.material_id = m.id
      )
  `).run();
  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_materials_company_code ON materials(company_id, code) WHERE deleted_at IS NULL AND code IS NOT NULL AND code <> '';
    CREATE INDEX IF NOT EXISTS idx_material_price_history_material ON material_price_history(material_id, changed_at);
	    CREATE INDEX IF NOT EXISTS idx_material_price_history_company ON material_price_history(company_id, changed_at);
    CREATE INDEX IF NOT EXISTS idx_material_stock_movements_material ON material_stock_movements(material_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_material_stock_movements_company ON material_stock_movements(company_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_supplier_accounts_supplier ON supplier_accounts(supplier_id);
	    CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_accounts_login ON supplier_accounts(company_id, login_account) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS idx_materials_type_mode ON materials(company_id, material_type, supply_mode);
    CREATE INDEX IF NOT EXISTS idx_material_categories_type ON material_categories(company_id, material_type, is_active, sort_order);
    CREATE INDEX IF NOT EXISTS idx_material_categories_company ON material_categories(company_id, is_active, sort_order);
    CREATE INDEX IF NOT EXISTS idx_material_categories_active ON material_categories(is_active, sort_order);
    CREATE INDEX IF NOT EXISTS idx_suppliers_type ON suppliers(company_id, supplier_type);
    CREATE INDEX IF NOT EXISTS idx_material_orders_type_status ON material_orders(company_id, order_type, status, settlement_status);
    CREATE INDEX IF NOT EXISTS idx_material_inbound_orders_company ON material_inbound_orders(company_id, status, inbound_date);
    CREATE INDEX IF NOT EXISTS idx_material_inbound_items_inbound ON material_inbound_order_items(inbound_id);
  `);
  database.prepare(`
    UPDATE material_categories
    SET is_active = COALESCE(is_active, 1),
      updated_at = COALESCE(updated_at, created_at, datetime('now'))
    WHERE deleted_at IS NULL
  `).run();
  const categoryRenames = [
    ["瓷砖", "瓷砖石材"],
    ["地板", "地板木门"],
    ["涂料", "油漆涂料"],
    ["卫浴", "卫浴洁具"],
    ["橱柜", "定制柜类"],
    ["开关", "电器五金"],
    ["板材", "木作板材"],
  ];
  const categoryDefaults = [
    { name: "水电材料", materialType: "AUXILIARY", children: ["强电线缆", "弱电线缆", "强电设备", "弱电箱体", "电气保护器件", "线管线盒", "给水管件", "排水管件", "水电工具耗材"] },
    { name: "泥瓦材料", materialType: "AUXILIARY", children: ["水泥砂浆", "砖砌材料", "瓷砖胶背胶", "填缝美缝", "找平材料", "防水材料", "地漏辅件"] },
    { name: "木作板材", materialType: "AUXILIARY", children: ["生态板免漆板", "多层板", "石膏板", "轻钢龙骨", "木方木线", "木作胶粘剂", "收口辅料"] },
    { name: "油漆涂料", materialType: "AUXILIARY", children: ["腻子粉", "乳胶漆", "底漆面漆", "艺术漆", "木器漆", "墙固界面剂", "油漆辅料"] },
    { name: "瓷砖石材", materialType: "MAIN", children: ["墙砖", "地砖", "岩板大板", "过门石窗台石", "踢脚线", "石材辅料", "阳角线收边条"] },
    { name: "地板木门", materialType: "MAIN", children: ["强化地板", "实木复合地板", "实木地板", "室内门", "门套窗套", "门锁合页", "踢脚线压条"] },
    { name: "卫浴洁具", materialType: "MAIN", children: ["马桶", "浴室柜", "花洒龙头", "台盆水槽", "淋浴房隔断", "五金挂件", "卫浴配件"] },
    { name: "电器五金", materialType: "MAIN", children: ["开关插座", "照明灯具", "厨卫电器", "中央空调新风", "智能家居", "基础五金", "安装辅件"] },
    { name: "定制柜类", materialType: "MAIN", children: ["橱柜", "衣柜", "玄关柜", "阳台柜", "浴室柜", "柜门板材", "定制五金"] },
    { name: "软装配饰", materialType: "MAIN", children: ["窗帘布艺", "墙纸墙布", "家具", "灯饰软装", "装饰画摆件", "家居饰品", "软装安装辅料"] },
    { name: "综合其他", materialType: "AUXILIARY", children: ["成品保护", "临时设施", "搬运上楼", "清洁保洁", "施工耗材", "安全文明", "其他杂项"] },
  ];
  const getCategoryByName = database.prepare(`
    SELECT id
    FROM material_categories
    WHERE company_id = ? AND name = ?
      AND COALESCE(parent_id, '') = COALESCE(?, '')
      AND deleted_at IS NULL
    LIMIT 1
  `);
  const insertCategory = database.prepare(`
      INSERT INTO material_categories (id, company_id, name, parent_id, material_type, sort_order, is_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `);
  const emptyLegacyCategories = ["泥工材料"];
  activeCompanies.forEach(({ id: companyId }) => {
    categoryRenames.forEach(([oldName, nextName]) => {
      const oldRow = getCategoryByName.get(companyId, oldName, null) as { id: string } | undefined;
      const nextRow = getCategoryByName.get(companyId, nextName, null) as { id: string } | undefined;
      if (oldRow?.id && !nextRow?.id) {
        database.prepare("UPDATE material_categories SET name = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?")
          .run(nextName, oldRow.id, companyId);
      }
    });

    categoryDefaults.forEach((category, index) => {
      const parentRow = getCategoryByName.get(companyId, category.name, null) as { id: string } | undefined;
      const parentId = parentRow?.id || makeDbId("MC");
      if (!parentRow?.id) {
        insertCategory.run(parentId, companyId, category.name, null, category.materialType, (index + 1) * 10);
      } else {
        database.prepare("UPDATE material_categories SET material_type = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?")
          .run(category.materialType, parentId, companyId);
      }
      category.children.forEach((childName, childIndex) => {
        const childRow = getCategoryByName.get(companyId, childName, parentId) as { id: string } | undefined;
        if (!childRow?.id) {
          insertCategory.run(makeDbId("MC"), companyId, childName, parentId, category.materialType, (childIndex + 1) * 10);
        } else {
          database.prepare("UPDATE material_categories SET material_type = ?, updated_at = datetime('now') WHERE id = ? AND company_id = ?")
            .run(category.materialType, childRow.id, companyId);
        }
      });
    });

    emptyLegacyCategories.forEach((name) => {
      const row = database.prepare(`
        SELECT id,
          (SELECT COUNT(*) FROM materials m WHERE m.category_id = material_categories.id AND m.company_id = ? AND m.deleted_at IS NULL) as material_count,
          (SELECT COUNT(*) FROM material_categories child WHERE child.parent_id = material_categories.id AND child.company_id = ? AND child.deleted_at IS NULL) as child_count
        FROM material_categories
        WHERE company_id = ? AND name = ? AND parent_id IS NULL AND deleted_at IS NULL
        LIMIT 1
      `).get(companyId, companyId, companyId, name) as { id: string; material_count: number; child_count: number } | undefined;
      if (row?.id && Number(row.material_count || 0) === 0 && Number(row.child_count || 0) === 0) {
        database.prepare("UPDATE material_categories SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND company_id = ?")
          .run(row.id, companyId);
      }
    });

    database.prepare(`
      UPDATE material_categories
      SET material_type = 'MAIN', updated_at = datetime('now')
      WHERE company_id = ? AND deleted_at IS NULL
        AND (
          name LIKE '%瓷砖%' OR name LIKE '%地砖%' OR name LIKE '%墙砖%' OR name LIKE '%岩板%'
          OR name LIKE '%石材%' OR name LIKE '%地板%' OR name LIKE '%木门%' OR name LIKE '%室内门%'
          OR name LIKE '%卫浴%' OR name LIKE '%洁具%' OR name LIKE '%马桶%' OR name LIKE '%浴室柜%'
          OR name LIKE '%花洒%' OR name LIKE '%龙头%' OR name LIKE '%橱柜%' OR name LIKE '%衣柜%'
          OR name LIKE '%柜%' OR name LIKE '%灯%' OR name LIKE '%开关%' OR name LIKE '%插座%'
          OR name LIKE '%电器%' OR name LIKE '%家具%' OR name LIKE '%窗帘%' OR name LIKE '%墙纸%'
          OR name LIKE '%墙布%' OR name LIKE '%软装%'
        )
    `).run(companyId);

    const waterproofSource = database.prepare(`
      SELECT child.id
      FROM material_categories child
      INNER JOIN material_categories parent ON child.parent_id = parent.id
      WHERE child.company_id = ? AND parent.company_id = ?
        AND parent.name = '水电材料' AND child.name = '防水辅料'
        AND parent.deleted_at IS NULL AND child.deleted_at IS NULL
      LIMIT 1
    `).get(companyId, companyId) as { id: string } | undefined;
    const waterproofTarget = database.prepare(`
      SELECT child.id
      FROM material_categories child
      INNER JOIN material_categories parent ON child.parent_id = parent.id
      WHERE child.company_id = ? AND parent.company_id = ?
        AND parent.name = '泥瓦材料' AND child.name = '防水材料'
        AND parent.deleted_at IS NULL AND child.deleted_at IS NULL
      LIMIT 1
    `).get(companyId, companyId) as { id: string } | undefined;
    if (waterproofSource?.id && waterproofTarget?.id) {
      database.prepare(`
        UPDATE materials
        SET category_id = ?, updated_at = datetime('now')
        WHERE company_id = ? AND category_id = ? AND deleted_at IS NULL
      `).run(waterproofTarget.id, companyId, waterproofSource.id);
      database.prepare("UPDATE material_categories SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND company_id = ?")
        .run(waterproofSource.id, companyId);
    }

    const waterParent = getCategoryByName.get(companyId, "水电材料", null) as { id: string } | undefined;
    const reassignByName = (categoryName: string, patterns: string[]) => {
      if (!waterParent?.id) return;
      const target = getCategoryByName.get(companyId, categoryName, waterParent.id) as { id: string } | undefined;
      if (!target?.id) return;
      const condition = patterns.map(() => "name LIKE ?").join(" OR ");
      database.prepare(`
        UPDATE materials
        SET category_id = ?, updated_at = datetime('now')
        WHERE company_id = ? AND deleted_at IS NULL AND (${condition})
      `).run(target.id, companyId, ...patterns.map((pattern) => `%${pattern}%`));
    };
    reassignByName("强电设备", ["配电箱", "强电箱", "电表箱"]);
    reassignByName("弱电箱体", ["弱电箱", "多媒体箱", "网络箱"]);
    reassignByName("电气保护器件", ["空开", "漏保", "断路器", "空气开关", "漏电保护"]);
  });
  database.prepare(`
    UPDATE materials
    SET product_name = COALESCE(NULLIF(TRIM(product_name), ''), (
      SELECT mc.name
      FROM material_categories mc
      WHERE mc.id = materials.category_id
        AND mc.deleted_at IS NULL
      LIMIT 1
    ), NULLIF(TRIM(name), '')),
      updated_at = COALESCE(updated_at, datetime('now'))
    WHERE deleted_at IS NULL
      AND COALESCE(TRIM(product_name), '') = ''
  `).run();
	  if (isFirstMaterialMigration) {
    database.prepare(`
      UPDATE materials
      SET material_type = CASE
        WHEN name LIKE '%瓷砖%' OR name LIKE '%地板%' OR name LIKE '%木门%' OR name LIKE '%洁具%' OR name LIKE '%卫浴%' OR name LIKE '%橱柜%' OR name LIKE '%灯%' OR name LIKE '%柜%' THEN 'MAIN'
        ELSE 'AUXILIARY'
      END,
      supply_mode = CASE
        WHEN name LIKE '%水泥%' OR name LIKE '%沙%' OR name LIKE '%木工板%' THEN 'MONTHLY_SETTLEMENT'
        WHEN name LIKE '%瓷砖%' OR name LIKE '%地板%' OR name LIKE '%木门%' OR name LIKE '%洁具%' OR name LIKE '%卫浴%' OR name LIKE '%橱柜%' OR name LIKE '%灯%' OR name LIKE '%柜%' THEN 'SUPPLIER_ORDER'
        ELSE 'WAREHOUSE'
      END,
      warehouse_name = CASE
        WHEN name LIKE '%瓷砖%' OR name LIKE '%地板%' OR name LIKE '%木门%' OR name LIKE '%洁具%' OR name LIKE '%卫浴%' OR name LIKE '%橱柜%' OR name LIKE '%灯%' OR name LIKE '%柜%' OR name LIKE '%水泥%' OR name LIKE '%沙%' OR name LIKE '%木工板%' THEN warehouse_name
        ELSE COALESCE(warehouse_name, '直营辅材仓')
      END,
      settlement_cycle = COALESCE(settlement_cycle, 'MONTHLY')
      WHERE deleted_at IS NULL
    `).run();
  } else {
    database.prepare(`
      UPDATE materials
      SET material_type = COALESCE(material_type, 'AUXILIARY'),
        supply_mode = COALESCE(supply_mode, CASE WHEN material_type = 'MAIN' THEN 'SUPPLIER_ORDER' ELSE 'WAREHOUSE' END),
        warehouse_name = COALESCE(warehouse_name, CASE WHEN supply_mode = 'WAREHOUSE' THEN '直营辅材仓' ELSE NULL END),
        settlement_cycle = COALESCE(settlement_cycle, 'MONTHLY')
      WHERE deleted_at IS NULL
    `).run();
  }
  if (isFirstSupplierMigration) {
    database.prepare(`
      UPDATE suppliers
      SET supplier_type = CASE
          WHEN name LIKE '%仓%' THEN 'COMPANY_WAREHOUSE'
          WHEN name LIKE '%水泥%' OR name LIKE '%沙%' OR name LIKE '%板%' THEN 'AUXILIARY'
          WHEN name LIKE '%柜%' OR name LIKE '%定制%' OR name LIKE '%橱柜%' OR name LIKE '%衣柜%' THEN 'CUSTOM'
          WHEN name LIKE '%软装%' OR name LIKE '%窗帘%' OR name LIKE '%家具%' OR name LIKE '%灯饰%' THEN 'SOFT_DECOR'
          ELSE 'OTHER'
        END,
        settlement_cycle = COALESCE(settlement_cycle, 'MONTHLY')
      WHERE deleted_at IS NULL
    `).run();
  } else {
    database.prepare(`
      UPDATE suppliers
      SET supplier_type = CASE
          WHEN supplier_type = 'WAREHOUSE' THEN 'COMPANY_WAREHOUSE'
          WHEN supplier_type = 'AUXILIARY_SETTLEMENT' THEN 'AUXILIARY'
          WHEN supplier_type = 'GENERAL' THEN 'OTHER'
          WHEN supplier_type = 'LABOR' THEN 'AUXILIARY'
          WHEN supplier_type = 'SERVICE' THEN 'SOFT_DECOR'
          WHEN supplier_type IS NULL OR supplier_type = '' THEN 'MAIN_MATERIAL'
          ELSE supplier_type
        END,
        settlement_cycle = COALESCE(settlement_cycle, 'MONTHLY')
      WHERE deleted_at IS NULL
    `).run();
  }
  database.prepare(`
    UPDATE suppliers
    SET supplier_type = 'COMPANY_WAREHOUSE',
      updated_at = COALESCE(updated_at, datetime('now'))
    WHERE deleted_at IS NULL
      AND (name LIKE '%仓%' OR name LIKE '%仓库%')
      AND COALESCE(supplier_type, '') IN ('', 'WAREHOUSE')
  `).run();
  database.prepare(`
    UPDATE materials
    SET material_type = 'AUXILIARY',
      supply_mode = 'WAREHOUSE',
      warehouse_name = COALESCE(warehouse_name, (
        SELECT suppliers.name
        FROM suppliers
        WHERE suppliers.id = materials.supplier_id
        LIMIT 1
      ), '直营辅材仓'),
      updated_at = datetime('now')
    WHERE deleted_at IS NULL
      AND COALESCE(material_type, 'AUXILIARY') <> 'MAIN'
      AND COALESCE(supply_mode, 'WAREHOUSE') = 'SUPPLIER_ORDER'
      AND supplier_id IN (
        SELECT id
        FROM suppliers
        WHERE deleted_at IS NULL
          AND (
            COALESCE(supplier_type, '') IN ('COMPANY_WAREHOUSE', 'WAREHOUSE')
            OR name LIKE '%仓%'
            OR name LIKE '%仓库%'
          )
      )
  `).run();
  if (isFirstOrderMigration) {
    database.prepare(`
      UPDATE material_orders
      SET order_type = CASE
          WHEN supplier_id IS NULL THEN 'AUXILIARY_WAREHOUSE'
          ELSE 'MAIN_SUPPLIER'
        END,
        warehouse_status = CASE WHEN status = 'RECEIVED' THEN 'DONE' ELSE 'WAITING' END,
        settlement_status = CASE WHEN paid_amount >= total_amount AND total_amount > 0 THEN 'SETTLED' ELSE 'UNSETTLED' END
      WHERE deleted_at IS NULL
    `).run();
	  } else {
	    database.prepare(`
	      UPDATE material_orders
	      SET order_type = COALESCE(order_type, 'MAIN_SUPPLIER'),
	        warehouse_status = COALESCE(warehouse_status, CASE WHEN status = 'RECEIVED' THEN 'DONE' ELSE 'WAITING' END),
	        settlement_status = COALESCE(settlement_status, CASE WHEN paid_amount >= total_amount AND total_amount > 0 THEN 'SETTLED' ELSE 'UNSETTLED' END)
	      WHERE deleted_at IS NULL
	    `).run();
	  }
	  const mainMaterialsWithoutSku = database.prepare(`
	    SELECT m.*
	    FROM materials m
	    WHERE m.deleted_at IS NULL
	      AND COALESCE(m.material_type, 'AUXILIARY') = 'MAIN'
	      AND NOT EXISTS (
	        SELECT 1
	        FROM material_product_skus sku
	        WHERE sku.material_id = m.id AND sku.deleted_at IS NULL
	      )
	  `).all() as any[];
	  const insertDefaultSku = database.prepare(`
	    INSERT INTO material_product_skus (
	      id, company_id, material_id, sku_code, sku_name, spec, color, attributes, unit,
	      unit_price, market_price, cost_price, internal_control_price, stock, min_stock, image, is_active, sort_order, created_at, updated_at
	    )
	    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, datetime('now'), datetime('now'))
	  `);
	  mainMaterialsWithoutSku.forEach((material, index) => {
	    const skuName = [material.color, material.spec].map((value: unknown) => String(value || "").trim()).filter(Boolean).join(" / ") || "默认规格";
	    insertDefaultSku.run(
	      `MSKU${Date.now()}${index}${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
	      material.company_id,
	      material.id,
	      material.code ? `${material.code}-01` : null,
	      skuName,
	      material.spec || null,
	      material.color || null,
	      material.product_attributes || null,
	      material.unit || null,
	      Number(material.unit_price || 0),
	      material.market_price == null ? null : Number(material.market_price),
	      material.cost_price == null ? null : Number(material.cost_price),
	      material.internal_control_price == null ? null : Number(material.internal_control_price),
	      Number(material.stock || 0),
	      Number(material.min_stock || 0),
	      material.image || null,
	    );
	  });
	  materialSystemSchemaReady = true;
  globalDatabaseState.__renovationSaasMaterialSchemaReady = true;
}

export const DEFAULT_ROLES = [
  { code: "OWNER", name: "老板", description: "拥有系统最高管理权限", sort_order: 10 },
  { code: "ADMIN", name: "管理员", description: "负责系统配置、组织和人员管理", sort_order: 20 },
  { code: "PM", name: "项目经理", description: "负责项目交付、施工过程和协作推进", sort_order: 30 },
  { code: "DESIGNER", name: "设计师", description: "负责量房、方案和报价配合", sort_order: 40 },
  { code: "FINANCE", name: "财务", description: "负责收款、成本和财务数据查看", sort_order: 50 },
  { code: "SALES", name: "销售/跟单", description: "负责线索跟进、邀约和客户维护", sort_order: 60 },
];

export function ensureDefaultRoles(database: Database.Database = getDb()): void {
  if (defaultRolesReady || globalDatabaseState.__renovationSaasDefaultRolesReady) {
    defaultRolesReady = true;
    return;
  }

  database.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id),
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      permissions TEXT DEFAULT '[]',
      data_scope TEXT DEFAULT 'self',
      is_system INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      deleted_at TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_roles_company_code ON roles(company_id, code);
    CREATE INDEX IF NOT EXISTS idx_roles_company ON roles(company_id);
  `);

  const company = database.prepare("SELECT id FROM companies LIMIT 1").get() as { id?: string } | undefined;
  const companyId = company?.id || "comp_001";
  const insert = database.prepare(`
    INSERT OR IGNORE INTO roles (id, company_id, code, name, description, permissions, data_scope, is_system, is_active, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, datetime('now'), datetime('now'))
  `);

  for (const role of DEFAULT_ROLES) {
    insert.run(
      `ROLE_${role.code}`,
      companyId,
      role.code,
      role.name,
      role.description,
      JSON.stringify(defaultPermissionsForRole(role.code)),
      defaultDataScopeForRole(role.code),
      role.sort_order
    );
    database.prepare("UPDATE roles SET data_scope = COALESCE(data_scope, ?) WHERE code = ? AND deleted_at IS NULL")
      .run(defaultDataScopeForRole(role.code), role.code);
  }
  defaultRolesReady = true;
  globalDatabaseState.__renovationSaasDefaultRolesReady = true;
}

function defaultDataScopeForRole(code: string): string {
  if (code === "OWNER" || code === "ADMIN") return "group";
  if (code === "PM" || code === "FINANCE") return "company";
  if (code === "DESIGNER" || code === "SALES") return "store";
  return "self";
}

function defaultPermissionsForRole(code: string): string[] {
  const all = [
    "dashboard.view",
    "customers.view",
    "customers.create",
    "customers.edit",
    "customers.import_export",
    "customers.assign",
    "team.view",
    "team.manage",
    "organization.manage",
    "roles.manage",
    "quotations.manage",
    "materials.manage",
    "finance.view",
    "logs.view",
  ];
  if (code === "OWNER" || code === "ADMIN") return all;
  if (code === "FINANCE") return ["dashboard.view", "customers.view", "quotations.manage", "finance.view"];
  if (code === "PM") return ["dashboard.view", "customers.view", "customers.edit", "customers.assign", "team.view", "quotations.manage", "materials.manage"];
  if (code === "DESIGNER") return ["customers.view", "customers.edit", "quotations.manage"];
  return ["dashboard.view", "customers.view", "customers.create", "customers.edit"];
}
