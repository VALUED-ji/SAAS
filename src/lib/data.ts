// Mock data for the Renovation SaaS prototype

export interface Project {
  id: string;
  name: string;
  customer: string;
  address: string;
  area: number;
  style: string;
  contractAmount: number;
  status: "lead" | "designed" | "quoted" | "signed" | "construction" | "completed" | "closed";
  manager: string;
  progress: number;
  startDate: string;
  plannedEndDate: string;
  phase: string;
}

export interface Task {
  id: string;
  projectId: string;
  name: string;
  phase: string;
  assignee: string;
  status: "pending" | "in_progress" | "review" | "completed";
  plannedStart: string;
  plannedEnd: string;
  priority: "low" | "medium" | "high";
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  area: string;
  source: string;
  status: "new" | "contacted" | "invited" | "measured" | "proposal" | "signed" | "lost";
  intention: string;
  budget: number;
  createdDate: string;
  lastFollowUp: string;
}

export interface Material {
  id: string;
  name: string;
  category: string;
  brand: string;
  spec: string;
  unit: string;
  unitPrice: number;
  supplier: string;
  stock: number;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  phone: string;
  projects: number;
  status: "active" | "busy" | "vacation";
}

export interface MonthlyData {
  month: string;
  revenue: number;
  cost: number;
  profit: number;
}

export const statusLabels: Record<string, string> = {
  lead: "线索",
  designed: "已设计",
  quoted: "已报价",
  signed: "已签约",
  construction: "施工中",
  completed: "已竣工",
  closed: "已结案",
  new: "新客户",
  contacted: "已联系",
  invited: "已到店",
  measured: "已量房",
  proposal: "方案报价",
  lost: "已流失",
};

export const phaseLabels: Record<string, string> = {
  demolition: "拆改阶段",
  plumbing: "水电阶段",
  masonry: "泥瓦阶段",
  carpentry: "木工阶段",
  painting: "油漆阶段",
  installation: "安装阶段",
  decoration: "软装阶段",
  inspection: "验收阶段",
};

export const monthlyData: MonthlyData[] = [
  { month: "1月", revenue: 520000, cost: 370000, profit: 150000 },
  { month: "2月", revenue: 280000, cost: 210000, profit: 70000 },
  { month: "3月", revenue: 860000, cost: 580000, profit: 280000 },
  { month: "4月", revenue: 1100000, cost: 720000, profit: 380000 },
  { month: "5月", revenue: 1286000, cost: 830000, profit: 456000 },
  { month: "6月", revenue: 960000, cost: 620000, profit: 340000 },
];

export interface ProjectStatusDist {
  name: string;
  value: number;
  color: string;
}

export const projectStatusDist: ProjectStatusDist[] = [
  { name: "施工中", value: 3, color: "#3b82f6" },
  { name: "已签约", value: 1, color: "#22c55e" },
  { name: "方案报价", value: 1, color: "#f59e0b" },
  { name: "已设计", value: 1, color: "#407AFF" },
  { name: "新线索", value: 1, color: "#ec4899" },
  { name: "已竣工", value: 1, color: "#14b8a6" },
];

export { formatCurrency, formatDate, formatPercent } from "./utils";
