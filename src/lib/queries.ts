import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

// Query key constants
export const queryKeys = {
  dashboard: ["dashboard"] as const,
  projects: ["projects"] as const,
  project: (id: string) => ["projects", id] as const,
  customers: ["customers"] as const,
  customer: (id: string) => ["customers", id] as const,
  materials: ["materials"] as const,
  team: ["team"] as const,
  finance: ["finance"] as const,
};

// Hook types
export interface DashboardData {
  activeProjects: number;
  monthlyRevenue: number;
  pendingQuotations: number;
  totalProjects: number;
  completedProjects: number;
}

export interface ProjectData {
  id: string;
  name: string;
  customer_name: string;
  manager_name: string;
  manager_avatar?: string | null;
  area: number;
  style: string;
  status: string;
  contract_amount: number;
  progress: number;
  start_date: string | null;
  planned_end_date: string | null;
  current_phase: string | null;
}

export interface ProjectDetailData extends ProjectData {
  customer_phone: string;
  tasks: any[];
  paymentPlans: any[];
}

export interface CustomerData {
  id: string;
  name: string;
  phone: string;
  area: string;
  address?: string | null;
  house_address?: string | null;
  building_no?: string | null;
  unit_no?: string | null;
  room_no?: string | null;
  no_room_number?: number | boolean | null;
  source: string;
  status: string;
  current_action: string | null;
  intention: string;
  budget: number;
  area_size: number;
  weixin: string | null;
  service_store: string | null;
  house_type: string | null;
  decoration_type: string | null;
  is_delivered: number | null;
  requirements: string | null;
  remarks: string | null;
  created_by_id?: string | null;
  created_by_name: string;
  created_by_avatar?: string | null;
  advisor_name?: string | null;
  advisor_avatar?: string | null;
  business_department_name?: string | null;
  inviter_id: string | null;
  inviter_name: string | null;
  inviter_avatar?: string | null;
  designer_name?: string | null;
  designer_avatar?: string | null;
  design_department_name?: string | null;
  last_followup_at?: string | null;
  next_followup_at?: string | null;
  has_overdue_followup?: number | boolean | null;
  overdue_followup_days?: number | string | null;
  created_at: string;
  manager_id: string | null;
}

export interface FollowupData {
  id: string;
  customer_id: string;
  user_id: string;
  reply_to_id?: string | null;
  reply_to_user_id?: string | null;
  reply_to_user_name?: string | null;
  reply_to_user_avatar?: string | null;
  user_name: string;
  user_avatar?: string | null;
  type: string;
  scene?: string | null;
  content: string;
  next_date: string | null;
  created_at: string;
  deleted_at?: string | null;
  attachments?: Array<{
    id: string;
    file_name: string;
    file_url: string;
    file_size?: number | null;
    mime_type?: string | null;
    category?: string | null;
    created_at?: string | null;
    followup_id?: string | null;
  }>;
}

export interface MaterialData {
  id: string;
  company_id: string;
  category_id: string | null;
  name: string;
  category_name: string;
  brand: string | null;
  product_name?: string | null;
  material_model?: string | null;
  color?: string | null;
  spec: string | null;
  unit: string | null;
  unit_price: number;
  cost_price?: number | null;
  supplier_id?: string | null;
  supplier_name: string | null;
  supplier_phone?: string | null;
  stock: number;
  min_stock: number;
  material_type?: string;
  supply_mode?: string;
  warehouse_name?: string | null;
  owner_name?: string | null;
  settlement_cycle?: string | null;
  is_core?: number;
  remark?: string | null;
}

export interface MaterialSupplierData {
  id: string;
  company_id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  address: string | null;
  remark: string | null;
  supplier_type?: string | null;
  settlement_cycle?: string | null;
  material_count?: number;
  order_count?: number;
  order_amount?: number;
}

export interface MaterialOrderData {
  id: string;
  company_id: string;
  project_id: string | null;
  supplier_id: string | null;
  order_no: string;
  status: string;
  order_type?: string | null;
  total_amount: number;
  paid_amount: number;
  order_date: string;
  delivery_date: string | null;
  settlement_status?: string | null;
  settlement_month?: string | null;
  handler_name?: string | null;
  notes: string | null;
  supplier_name?: string | null;
  supplier_contact?: string | null;
  supplier_phone?: string | null;
  project_name?: string | null;
  project_address?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_address?: string | null;
  created_by_name?: string | null;
  item_count?: number;
  total_quantity?: number;
  received_quantity?: number;
}

export interface MaterialOrderItemData {
  id: string;
  order_id: string;
  material_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  received_qty: number;
  remark: string | null;
  material_name?: string | null;
  material_brand?: string | null;
  material_product_name?: string | null;
  material_model?: string | null;
  material_color?: string | null;
  material_spec?: string | null;
  material_unit?: string | null;
  material_type?: string | null;
  supply_mode?: string | null;
  category_name?: string | null;
}

export interface MaterialWorkspaceData {
  materials: MaterialData[];
  categories: { id: string; name: string; parent_id?: string | null; sort_order?: number }[];
  suppliers: MaterialSupplierData[];
  orders: MaterialOrderData[];
  orderItems: MaterialOrderItemData[];
  summary: {
    materialCount: number;
    warehouseMaterialCount: number;
    lowStockCount: number;
    monthlyMaterialCount: number;
    mainMaterialCount: number;
    pendingWarehouseOrders: number;
    pendingMainOrders: number;
    unsettledAmount: number;
    supplierCount: number;
  };
  monthlySettlements: {
    key: string;
    month: string;
    supplier_name: string;
    order_count: number;
    total_amount: number;
    paid_amount: number;
    unsettled_amount: number;
    unsettled_count: number;
  }[];
}

export interface TeamData {
  id: string;
  name: string;
  phone: string;
  avatar: string | null;
  role: string;
  org_unit_id: string | null;
  org_unit_name: string | null;
  quotation_access_org_unit_ids?: string | null | string[];
  employee_no: string | null;
  hire_date: string | null;
  notes: string | null;
  last_login_at: string | null;
  last_seen_at: string | null;
  is_active: number;
  project_count: number;
}

export interface FinanceData {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  profitRate: number;
  topProjects: { id: string; name: string; contract_amount: number; status: string }[];
}

// Hooks
export function useDashboard() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => api.get<DashboardData>("/api/dashboard"),
  });
}

export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => api.get<ProjectData[]>("/api/projects"),
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: queryKeys.project(id),
    queryFn: () => api.get<ProjectDetailData>(`/api/projects/${id}`),
    enabled: !!id,
  });
}

export function useCustomers() {
  return useQuery({
    queryKey: queryKeys.customers,
    queryFn: () => api.get<CustomerData[]>("/api/customers"),
  });
}

export function useCustomer(id: string) {
  return useQuery({
    queryKey: queryKeys.customer(id),
    queryFn: () => api.get<CustomerData>(`/api/customers/${id}`),
    enabled: !!id,
  });
}

export function useFollowups(customerId: string) {
  return useQuery({
    queryKey: ["followups", customerId],
    queryFn: () => api.get<FollowupData[]>(`/api/followups?customer_id=${customerId}`),
    enabled: !!customerId,
  });
}

export function useMaterials() {
  return useQuery({
    queryKey: queryKeys.materials,
    queryFn: () => api.get<MaterialWorkspaceData>("/api/materials"),
  });
}

export function useTeam() {
  return useQuery({
    queryKey: queryKeys.team,
    queryFn: () => api.get<TeamData[]>("/api/team"),
  });
}

export function useFinance() {
  return useQuery({
    queryKey: queryKeys.finance,
    queryFn: () => api.get<FinanceData>("/api/finance"),
  });
}

export interface QuotationData {
  id: string;
  project_id: string | null;
  project_name: string;
  project_address?: string | null;
  project_area?: number | string | null;
  title?: string;
  quotation_type?: string | null;
  customer_id?: string;
  is_unbound?: number | boolean;
  temp_customer_name?: string | null;
  temp_customer_phone?: string | null;
  temp_customer_weixin?: string | null;
  temp_customer_address?: string | null;
  temp_customer_area?: number | string | null;
  temp_customer_decoration_type?: string | null;
  quotation_decoration_type?: string | null;
  customer_name: string;
  customer_phone?: string | null;
  customer_weixin?: string | null;
  customer_address?: string | null;
  customer_house_address?: string | null;
  customer_building_no?: string | null;
  customer_unit_no?: string | null;
  customer_room_no?: string | null;
  customer_no_room_number?: number | boolean | null;
  customer_decoration_type?: string | null;
  customer_area_size?: number | string | null;
  designer_name?: string | null;
  contract_amount: number;
  total_amount: number;
  final_amount?: number | null;
  direct_amount?: number | null;
  status: string;
  signed_contract_count?: number;
  signed_contract_amount?: number;
  signed_quotation_contract_count?: number;
  version: number;
  created_at: string;
  updated_at?: string | null;
  deleted_at?: string | null;
  item_count?: number;
  latest_change_at?: string | null;
  latest_change_user_name?: string | null;
  latest_change_summary?: string | null;
  latest_change_count?: number;
}

function buildQuotationListPath(deleted: boolean, orgUnitId?: string) {
  const params = new URLSearchParams();
  if (deleted) params.set("deleted", "1");
  if (orgUnitId) params.set("org_unit_id", orgUnitId);
  const query = params.toString();
  return query ? `/api/quotations?${query}` : "/api/quotations";
}

export function useQuotations(orgUnitId = "") {
  return useQuery({
    queryKey: ["quotations", orgUnitId || "all"],
    queryFn: () => api.get<QuotationData[]>(buildQuotationListPath(false, orgUnitId)),
  });
}

export function useDeletedQuotations(orgUnitId = "") {
  return useQuery({
    queryKey: ["quotations", "deleted", orgUnitId || "all"],
    queryFn: () => api.get<QuotationData[]>(buildQuotationListPath(true, orgUnitId)),
  });
}
