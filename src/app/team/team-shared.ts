// 团队管理页共享工具模块
// 存放页面主体与员工导入组件共用的类型、常量与纯计算函数。

export type RoleOption = {
  value: string;
  label: string;
  description?: string | null;
};

export const defaultRoleOptions: RoleOption[] = [
  { value: "OWNER", label: "老板" },
  { value: "ADMIN", label: "管理员" },
  { value: "PM", label: "项目经理" },
  { value: "DESIGNER", label: "设计师" },
  { value: "FINANCE", label: "财务" },
  { value: "SALES", label: "销售/跟单" },
];

export const employeeImportHeaders = ["员工姓名", "手机号", "初始密码", "角色", "所属组织", "工号", "入职日期", "在职状态", "备注"];

export interface OrgUnit {
  id: string;
  name: string;
  type: string;
  parent_id: string | null;
  is_active?: number;
}

export const orgTypeLabels: Record<string, string> = {
  group: "集团",
  region: "大区",
  company: "公司",
  store: "门店",
  dept: "部门",
  team: "小组",
};

export interface OrgOption extends OrgUnit {
  depth: number;
  path: string;
}

export function isOrgActive(unit?: OrgUnit | null) {
  return Number(unit?.is_active ?? 1) === 1;
}

export function buildOrgOptions(units: OrgUnit[]): OrgOption[] {
  const map = new Map<string, OrgUnit & { children: OrgUnit[] }>();
  units.forEach((unit) => map.set(unit.id, { ...unit, children: [] }));

  const roots: (OrgUnit & { children: OrgUnit[] })[] = [];
  units.forEach((unit) => {
    const node = map.get(unit.id)!;
    if (unit.parent_id && map.has(unit.parent_id)) {
      map.get(unit.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const options: OrgOption[] = [];
  const walk = (node: OrgUnit & { children: OrgUnit[] }, depth: number, ancestors: string[]) => {
    const pathParts = [...ancestors, node.name];
    options.push({ ...node, depth, path: pathParts.join(" / ") });
    node.children.forEach((child) => walk(child as OrgUnit & { children: OrgUnit[] }, depth + 1, pathParts));
  };

  roots.forEach((root) => walk(root, 0, []));
  return options;
}
