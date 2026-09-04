// 定额库页共享工具模块
// 存放列表页类型、常量与纯计算函数。

export type QuotaItem = {
  id: string;
  code: string;
  scope: string;
  category: string;
  workTypeId?: string;
  workTypeName?: string;
  materialCategoryId?: string;
  materialCategoryName?: string;
  name: string;
  constructionDescription: string;
  unit: string;
  laborPrice: number;
  materialPrice: number;
  internalLaborCost: number;
  internalMaterialCost: number;
  costLossRate: number;
  totalPrice: number;
  isSpecialPrice: boolean;
  status: "enabled" | "disabled";
  updatedAt: string;
};

export type DictionaryOption = {
  id: string;
  name: string;
  parentName?: string;
};


export type QuotaImportError = {
  rowNumber: number;
  scope: string;
  category: string;
  name: string;
  unit: string;
  reason: string;
};

export type OrgUnit = {
  id: string;
  name: string;
  type: string;
  parent_id?: string | null;
  is_active?: number;
};

export const DEFAULT_QUOTA_SCOPE = "全部门店";
export const FALLBACK_STORE_SCOPES = ["番禺店", "新塘店"];
export const COMMON_QUOTA_UNITS = ["㎡", "m", "项", "个", "套", "处", "间", "樘", "组", "台", "块", "片", "根", "卷", "桶", "kg"];
export const quotaImportHeaders = ["分类", "项目名称", "施工说明", "单位", "人工单价", "材料单价", "内部人工成本", "内部材料成本", "损耗率", "是否特价"];
export const requiredQuotaImportHeaders = new Set(["项目名称", "单位", "人工单价", "材料单价"]);
export const QUOTA_LIBRARY_STORAGE_KEY = "zxgj_quota_library_items";
export const QUOTA_TEMPLATE_STORAGE_KEY = "zxgj_quota_templates";

export const initialQuotaItems: QuotaItem[] = [];


export function normalizeQuotaItem(value: any): QuotaItem | null {
  if (!value || typeof value !== "object") return null;
  const laborPrice = Number(value.laborPrice || 0);
  const materialPrice = Number(value.materialPrice || 0);
  const internalLaborCost = Number(value.internalLaborCost ?? value.costLaborPrice ?? value.cost_labor_unit ?? 0);
  const internalMaterialCost = Number(value.internalMaterialCost ?? value.costMaterialPrice ?? value.cost_material_unit ?? 0);
  const costLossRate = Number(value.costLossRate ?? value.cost_loss_rate ?? 0);
  const totalPrice = Number.isFinite(Number(value.totalPrice)) ? Number(value.totalPrice) : laborPrice + materialPrice;
  return {
    id: String(value.id || `quota-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    code: String(value.code || ""),
    scope: String(value.scope || ""),
    category: String(value.category || "未分类"),
    workTypeId: String(value.workTypeId || value.work_type_id || ""),
    workTypeName: String(value.workTypeName || value.work_type_name || ""),
    materialCategoryId: String(value.materialCategoryId || value.material_category_id || ""),
    materialCategoryName: String(value.materialCategoryName || value.material_category_name || ""),
    name: String(value.name || ""),
    constructionDescription: String(value.constructionDescription || ""),
    unit: String(value.unit || ""),
    laborPrice: Number.isFinite(laborPrice) ? Math.max(0, laborPrice) : 0,
    materialPrice: Number.isFinite(materialPrice) ? Math.max(0, materialPrice) : 0,
    internalLaborCost: Number.isFinite(internalLaborCost) ? Math.max(0, internalLaborCost) : 0,
    internalMaterialCost: Number.isFinite(internalMaterialCost) ? Math.max(0, internalMaterialCost) : 0,
    costLossRate: Number.isFinite(costLossRate) ? Math.max(0, costLossRate) : 0,
    totalPrice: Number.isFinite(totalPrice) ? Math.max(0, totalPrice) : 0,
    isSpecialPrice: Boolean(value.isSpecialPrice),
    status: value.status === "disabled" ? "disabled" : "enabled",
    updatedAt: String(value.updatedAt || new Date().toISOString().slice(0, 10)),
  };
}

export function loadQuotaItemsFromStorage() {
  if (typeof window === "undefined") return initialQuotaItems;
  const raw = window.localStorage.getItem(QUOTA_LIBRARY_STORAGE_KEY);
  if (raw == null) return initialQuotaItems;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return initialQuotaItems;
    return parsed.map(normalizeQuotaItem).filter(Boolean) as QuotaItem[];
  } catch {
    return initialQuotaItems;
  }
}

export function recoverQuotaItemsFromTemplates() {
  if (typeof window === "undefined") return initialQuotaItems;
  try {
    const raw = window.localStorage.getItem(QUOTA_TEMPLATE_STORAGE_KEY);
    if (!raw) return initialQuotaItems;
    const templates = JSON.parse(raw);
    if (!Array.isArray(templates)) return initialQuotaItems;
    const items = new Map<string, QuotaItem>();
    templates.forEach((template: any) => {
      const scope = String(template?.autoScope?.orgUnitName || template?.scope?.orgUnitName || template?.accessScope?.orgUnitName || "").trim();
      const spaces = Array.isArray(template?.spaces) ? template.spaces : [];
      spaces.forEach((space: any) => {
        const quotaItems = Array.isArray(space?.quotaItems) ? space.quotaItems : [];
        quotaItems.forEach((item: any) => {
          const name = String(item?.name || "").trim();
          const unit = String(item?.unit || "").trim();
          if (!name || !unit) return;
          const category = String(item?.category || "未分类").trim() || "未分类";
          const key = [scope, category, name, unit].join("||");
          if (items.has(key)) return;
          const laborPrice = Number(item?.laborPrice || 0);
          const materialPrice = Number(item?.materialPrice || 0);
          const totalPrice = Number.isFinite(Number(item?.totalPrice)) ? Number(item.totalPrice) : laborPrice + materialPrice;
          const quota: QuotaItem = {
            id: `quota-recovered-${items.size + 1}-${Date.now()}`,
            code: String(item?.code || ""),
            scope,
            category,
            workTypeId: String(item?.workTypeId || item?.work_type_id || ""),
            workTypeName: String(item?.workTypeName || item?.work_type_name || ""),
            materialCategoryId: String(item?.materialCategoryId || item?.material_category_id || ""),
            materialCategoryName: String(item?.materialCategoryName || item?.material_category_name || ""),
            name,
            constructionDescription: String(item?.constructionDescription || "").trim(),
            unit,
            laborPrice: Number.isFinite(laborPrice) ? Math.max(0, laborPrice) : 0,
            materialPrice: Number.isFinite(materialPrice) ? Math.max(0, materialPrice) : 0,
            internalLaborCost: 0,
            internalMaterialCost: 0,
            costLossRate: 0,
            totalPrice: Number.isFinite(totalPrice) ? Math.max(0, totalPrice) : 0,
            isSpecialPrice: Boolean(item?.isSpecialPrice),
            status: "enabled",
            updatedAt: new Date().toISOString().slice(0, 10),
          };
          items.set(key, quota);
        });
      });
    });
    return Array.from(items.values());
  } catch {
    return initialQuotaItems;
  }
}

export function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];
    if (char === "\"" && inQuotes && nextChar === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function parseImportLine(line: string) {
  return line.includes("\t") ? line.split("\t").map((cell) => cell.trim()) : parseCsvLine(line);
}

export function normalizeImportText(value: string) {
  return value.replace(/\s+/g, "").toLowerCase();
}

const quotaImportHeaderAliases = [
  "适用门店", "服务门店", "门店",
  "分类", "定额分类", "专业",
  "项目名称", "名称", "定额名称",
  "施工说明", "施工描述", "工艺说明", "说明",
  "单位", "计量单位",
  "人工单价", "材料单价", "人工费", "材料费",
  "内部人工成本", "人工成本", "成本人工单价",
  "内部材料成本", "材料成本", "成本材料单价",
  "损耗率", "材料损耗率",
  "是否特价", "是否特价项目", "特价",
  "定额编码", "编码",
].map(normalizeImportText);

function findQuotaImportHeaderRowIndex(rows: string[][]) {
  return rows.slice(0, 8).findIndex((row) => {
    const normalized = row.map(normalizeImportText);
    const matchedCount = normalized.filter((cell) => quotaImportHeaderAliases.includes(cell)).length;
    const hasName = normalized.some((cell) => ["项目名称", "名称", "定额名称"].map(normalizeImportText).includes(cell));
    const hasUnit = normalized.some((cell) => ["单位", "计量单位"].map(normalizeImportText).includes(cell));
    const hasDescription = normalized.some((cell) => ["施工说明", "施工描述", "工艺说明", "说明"].map(normalizeImportText).includes(cell));
    return matchedCount >= 3 || (hasName && hasUnit) || (hasName && hasDescription);
  });
}

export function parseImportAmount(value: string) {
  const amount = Number(String(value || "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

export function isNegativeImportAmount(value: string) {
  const text = String(value || "").trim();
  if (!text) return false;
  const amount = Number(text.replace(/[^\d.-]/g, ""));
  return Number.isFinite(amount) && amount < 0;
}

export function parseImportBoolean(value: string) {
  const text = normalizeImportText(value);
  return ["是", "特价", "yes", "y", "true", "1"].includes(text);
}

export function findNearestStore(units: OrgUnit[], orgUnitId?: string | null) {
  if (!orgUnitId) return null;
  const map = new Map(units.map((unit) => [unit.id, unit]));
  let current = map.get(orgUnitId);
  while (current) {
    if (current.type === "store") return current;
    current = current.parent_id ? map.get(current.parent_id) : undefined;
  }
  return null;
}

export function isOrgActive(unit?: OrgUnit | null) {
  return Number(unit?.is_active ?? 1) === 1;
}

export function isDisallowedQuotaScope(scope: string) {
  const text = scope.trim();
  return !text || text === DEFAULT_QUOTA_SCOPE || text === "全部门店通用" || text === "通用";
}

export const STORE_PREFIX_OVERRIDES: Record<string, string> = {
  全部门店: "TY",
  全部门店通用: "TY",
  通用: "TY",
  番禺: "PY",
  新塘: "XT",
  福州: "FZ",
  抚州: "FUZ",
};

export const PINYIN_SYLLABLES: Record<string, string> = {
  一: "yi", 七: "qi", 万: "wan", 三: "san", 上: "shang", 下: "xia", 东: "dong", 中: "zhong", 丰: "feng", 丹: "dan", 乌: "wu", 乐: "le",
  九: "jiu", 云: "yun", 五: "wu", 京: "jing", 亭: "ting", 亳: "bo", 仁: "ren", 仓: "cang", 仙: "xian", 仪: "yi", 任: "ren",
  佛: "fo", 佳: "jia", 保: "bao", 信: "xin", 六: "liu", 兰: "lan", 兴: "xing", 内: "nei", 冀: "ji", 冠: "guan", 冷: "leng",
  凉: "liang", 凌: "ling", 凤: "feng", 凯: "kai", 包: "bao", 北: "bei", 十: "shi", 南: "nan", 博: "bo", 厦: "xia", 双: "shuang",
  台: "tai", 合: "he", 吉: "ji", 吕: "lv", 吴: "wu", 周: "zhou", 哈: "ha", 唐: "tang", 商: "shang", 嘉: "jia", 四: "si",
  园: "yuan", 固: "gu", 国: "guo", 土: "tu", 坪: "ping", 城: "cheng", 塘: "tang", 增: "zeng", 壁: "bi", 大: "da", 天: "tian",
  太: "tai", 奉: "feng", 威: "wei", 娄: "lou", 孝: "xiao", 宁: "ning", 安: "an", 定: "ding", 宜: "yi", 宝: "bao", 宣: "xuan",
  宿: "su", 富: "fu", 寿: "shou", 小: "xiao", 尧: "yao", 山: "shan", 岳: "yue", 崇: "chong", 川: "chuan", 州: "zhou",
  巢: "chao", 巴: "ba", 常: "chang", 平: "ping", 广: "guang", 庆: "qing", 庐: "lu", 廊: "lang", 延: "yan", 张: "zhang",
  徐: "xu", 德: "de", 忻: "xin", 惠: "hui", 成: "cheng", 扬: "yang", 承: "cheng", 抚: "fu", 拉: "la", 揭: "jie", 攀: "pan",
  文: "wen", 新: "xin", 无: "wu", 日: "ri", 昆: "kun", 昌: "chang", 明: "ming", 星: "xing", 晋: "jin", 普: "pu", 景: "jing",
  曲: "qu", 朔: "shuo", 朝: "chao", 本: "ben", 杭: "hang", 松: "song", 林: "lin", 枣: "zao", 柳: "liu", 株: "zhu", 桂: "gui",
  梅: "mei", 梧: "wu", 楚: "chu", 榆: "yu", 武: "wu", 毕: "bi", 永: "yong", 汉: "han", 汕: "shan", 江: "jiang", 池: "chi",
  沈: "shen", 沧: "cang", 河: "he", 泉: "quan", 泰: "tai", 泸: "lu", 洛: "luo", 济: "ji", 浙: "zhe", 浦: "pu", 海: "hai",
  涛: "tao", 涪: "fu", 淮: "huai", 深: "shen", 清: "qing", 温: "wen", 渭: "wei", 湖: "hu", 湘: "xiang", 湛: "zhan", 溪: "xi",
  滁: "chu", 滨: "bin", 漳: "zhang", 潍: "wei", 潮: "chao", 澳: "ao", 濮: "pu", 烟: "yan", 焦: "jiao", 燕: "yan", 玉: "yu",
  珠: "zhu", 甘: "gan", 田: "tian", 番: "pan", 白: "bai", 益: "yi", 盐: "yan", 盘: "pan", 眉: "mei", 石: "shi", 福: "fu",
  秦: "qin", 章: "zhang", 红: "hong", 绍: "shao", 绵: "mian", 聊: "liao", 肇: "zhao", 自: "zi", 舟: "zhou", 苏: "su",
  茂: "mao", 荆: "jing", 莆: "pu", 莱: "lai", 菏: "he", 萍: "ping", 营: "ying", 蚌: "beng", 衡: "heng", 襄: "xiang",
  西: "xi", 许: "xu", 贵: "gui", 赣: "gan", 赤: "chi", 辽: "liao", 达: "da", 运: "yun", 连: "lian", 迪: "di", 通: "tong",
  邢: "xing", 邯: "han", 邵: "shao", 郑: "zheng", 郴: "chen", 鄂: "e", 酒: "jiu", 重: "chong", 金: "jin", 钦: "qin",
  铜: "tong", 银: "yin", 锦: "jin", 镇: "zhen", 长: "chang", 阳: "yang", 阿: "a", 陇: "long", 陵: "ling", 随: "sui",
  雅: "ya", 青: "qing", 靖: "jing", 鞍: "an", 韶: "shao", 马: "ma", 驻: "zhu", 骆: "luo", 高: "gao", 鸡: "ji",
  鹰: "ying", 黄: "huang", 黑: "hei", 齐: "qi", 龙: "long", 禺: "yu", 圳: "zhen", 汇: "hui",
};

export function normalizeQuotaScope(scope: string) {
  const text = (scope || DEFAULT_QUOTA_SCOPE).trim() || DEFAULT_QUOTA_SCOPE;
  if (text === DEFAULT_QUOTA_SCOPE || text === "全部门店通用") return "通用";
  return text.replace(/(旗舰店|分公司|分店|门店|公司|店)$/g, "").trim() || text;
}

export function getScopeRomanText(scope: string) {
  const normalized = normalizeQuotaScope(scope);
  const override = STORE_PREFIX_OVERRIDES[normalized];
  if (override) return { initials: override, full: override };

  const parts: string[] = [];
  let latinBuffer = "";
  const flushLatin = () => {
    if (!latinBuffer) return;
    parts.push(latinBuffer.toLowerCase());
    latinBuffer = "";
  };

  Array.from(normalized).forEach((char) => {
    if (/[A-Za-z0-9]/.test(char)) {
      latinBuffer += char;
      return;
    }
    flushLatin();
    const syllable = PINYIN_SYLLABLES[char];
    if (syllable) {
      parts.push(syllable);
    }
  });
  flushLatin();

  if (parts.length === 0) return { initials: "MD", full: "MENDIAN" };
  const initials = parts.map((part) => part[0]).join("").toUpperCase();
  const full = parts.join("").toUpperCase();
  return { initials: initials.length >= 2 ? initials : full.slice(0, 2).padEnd(2, initials), full };
}

export function makePrefixCandidates(scope: string) {
  const { initials, full } = getScopeRomanText(scope);
  const candidates = new Set<string>();
  candidates.add(initials.slice(0, 6));
  for (let length = Math.max(3, initials.length + 1); length <= Math.min(full.length, 6); length += 1) {
    candidates.add(full.slice(0, length));
  }
  if (full.length > 0) candidates.add(full.slice(0, Math.min(full.length, 6)));
  return Array.from(candidates).map((item) => item.replace(/[^A-Z0-9]/g, "").slice(0, 6)).filter((item) => item.length >= 2);
}

export function makeScopePrefix(scope: string, allScopes: string[] = []) {
  const uniqueScopes = Array.from(new Set([DEFAULT_QUOTA_SCOPE, ...FALLBACK_STORE_SCOPES, ...allScopes, scope].map((item) => item.trim()).filter(Boolean)));
  const used = new Set<string>();
  const assigned = new Map<string, string>();

  uniqueScopes.forEach((currentScope) => {
    const candidates = makePrefixCandidates(currentScope);
    let prefix = candidates.find((candidate) => !used.has(candidate));
    if (!prefix) {
      const base = candidates[candidates.length - 1] || "MD";
      let index = 2;
      do {
        prefix = `${base.slice(0, Math.max(2, 6 - String(index).length))}${index}`;
        index += 1;
      } while (used.has(prefix));
    }
    used.add(prefix);
    assigned.set(currentScope, prefix);
  });

  return assigned.get(scope.trim()) || assigned.get(DEFAULT_QUOTA_SCOPE) || "TY";
}

export function makeQuotaCode(index: number, scope: string, allScopes: string[] = []) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${makeScopePrefix(scope, allScopes)}${year}${month}${String(index).padStart(4, "0")}`;
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function makeNextQuotaCode(usedCodes: Set<string>, scope: string, allScopes: string[] = []) {
  const now = new Date();
  const year = now.getFullYear();
  const yearMonth = `${year}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prefix = makeScopePrefix(scope, allScopes);
  let nextIndex = 1;
  usedCodes.forEach((code) => {
    const currentFormatMatch = code.match(new RegExp(`^${escapeRegExp(prefix)}${yearMonth}(\\d{4})$`, "i"));
    const legacyFormatMatch = code.match(new RegExp(`^DE-${year}-(\\d+)$`));
    const match = currentFormatMatch || legacyFormatMatch;
    if (match) nextIndex = Math.max(nextIndex, Number(match[1]) + 1);
  });
  let code = makeQuotaCode(nextIndex, scope, allScopes);
  while (usedCodes.has(code)) {
    nextIndex += 1;
    code = makeQuotaCode(nextIndex, scope, allScopes);
  }
  usedCodes.add(code);
  return code;
}

export function makeEmptyQuotaItem(existingItems: QuotaItem[], allScopes: string[], scope: string): QuotaItem {
  const code = makeNextQuotaCode(new Set(existingItems.map((item) => item.code)), scope, allScopes);
  return {
    id: `quota-${Date.now()}`,
    code,
    scope,
    category: "",
    workTypeId: "",
    workTypeName: "",
    materialCategoryId: "",
    materialCategoryName: "",
    name: "",
    constructionDescription: "",
    unit: "",
    laborPrice: 0,
    materialPrice: 0,
    internalLaborCost: 0,
    internalMaterialCost: 0,
    costLossRate: 0,
    totalPrice: 0,
    isSpecialPrice: false,
    status: "enabled",
    updatedAt: new Date().toISOString().slice(0, 10),
  };
}

export function isQuotaCodeLike(value: string) {
  const text = value.trim();
  return /^[A-Z0-9]{2,6}\d{10}$/i.test(text) || /^DE-\d{4}-\d+$/i.test(text);
}

export function parseQuotaImport(text: string, existingItems: QuotaItem[], allScopes: string[] = [], fallbackScope = "") {
  const rawRows = text.split(/\r?\n/).filter((line) => line.trim());
  const rows = rawRows.map(parseImportLine);
  const headerRowIndex = findQuotaImportHeaderRowIndex(rows);
  const hasHeader = headerRowIndex >= 0;
  const header = hasHeader ? rows[headerRowIndex].map(normalizeImportText) : [];
  const dataRows = hasHeader ? rows.slice(headerRowIndex + 1) : rows;
  const errors: QuotaImportError[] = [];
  const importedItems: QuotaItem[] = [];
  const usedCodes = new Set(existingItems.map((item) => item.code));
  const findHeaderIndex = (labels: string[]) => header.findIndex((cell) => labels.map(normalizeImportText).includes(cell));
  const fallbackOffset = !hasHeader && isQuotaCodeLike(rows[0]?.[0] || "") ? 1 : 0;
  const hasStoreColumn = hasHeader
    ? findHeaderIndex(["适用门店", "服务门店", "门店"]) >= 0
    : rows.some((row) => {
        const firstCell = row[fallbackOffset]?.trim() || "";
        return allScopes.includes(firstCell) || /店$/.test(firstCell);
      });
  const fallbackDataOffset = fallbackOffset + (hasStoreColumn ? 1 : 0);
  const readCell = (row: string[], fallbackIndex: number, labels: string[]) => {
    if (!hasHeader) return row[fallbackIndex + fallbackDataOffset] || "";
    const index = findHeaderIndex(labels);
    return index >= 0 ? row[index] || "" : "";
  };
  const readScope = (row: string[]) => {
    const value = hasHeader
      ? readCell(row, 0, ["适用门店", "服务门店", "门店"])
      : hasStoreColumn ? row[fallbackOffset] || "" : "";
    return fallbackScope.trim() || value.trim();
  };
  const importScopes = dataRows.map(readScope);
  const knownScopes = [...allScopes, ...existingItems.map((item) => item.scope), ...importScopes];

  dataRows.forEach((row, rowIndex) => {
    const rowNumber = rowIndex + (hasHeader ? headerRowIndex + 2 : 1);
    const scope = readScope(row);
    const category = readCell(row, 0, ["分类", "定额分类", "专业"]).trim() || "未分类";
    const name = readCell(row, 1, ["项目名称", "名称", "定额名称"]).trim();
    const unit = readCell(row, 3, ["单位", "计量单位"]).trim();
    const laborPrice = parseImportAmount(readCell(row, 4, ["人工费", "人工单价"]));
    const materialPrice = parseImportAmount(readCell(row, 5, ["材料费", "材料单价"]));
    const reasons = [
      isDisallowedQuotaScope(scope) ? "请选择导入门店，且不能为全部门店通用" : "",
      !name ? "项目名称不能为空" : "",
      !unit ? "单位不能为空" : "",
      isNegativeImportAmount(readCell(row, 4, ["人工费", "人工单价"])) ? "人工单价不能为负数" : "",
      isNegativeImportAmount(readCell(row, 5, ["材料费", "材料单价"])) ? "材料单价不能为负数" : "",
    ].filter(Boolean);
    if (reasons.length > 0) {
      errors.push({
        rowNumber,
        scope,
        category,
        name,
        unit,
        reason: reasons.join("；"),
      });
      return;
    }
    const internalLaborCost = parseImportAmount(readCell(row, 6, ["内部人工成本", "人工成本", "成本人工单价"]));
    const internalMaterialCost = parseImportAmount(readCell(row, 7, ["内部材料成本", "材料成本", "成本材料单价"]));
    const costLossRate = parseImportAmount(readCell(row, 8, ["损耗率", "材料损耗率"]));
    const isSpecialPrice = parseImportBoolean(readCell(row, 9, ["是否特价", "是否特价项目", "特价"]));
    importedItems.push({
      id: `import-${Date.now()}-${rowIndex}`,
      code: makeNextQuotaCode(usedCodes, scope, knownScopes),
      scope,
      category,
      name,
      constructionDescription: readCell(row, 2, ["施工说明", "施工描述", "工艺说明", "说明"]).trim(),
      unit,
      laborPrice,
      materialPrice,
      internalLaborCost,
      internalMaterialCost,
      costLossRate,
      totalPrice: laborPrice + materialPrice,
      isSpecialPrice,
      status: "enabled",
      updatedAt: new Date().toISOString().slice(0, 10),
    });
  });

  return { items: importedItems, errors };
}

export async function downloadQuotaImportErrors(errors: QuotaImportError[]) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("导入错误明细", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const rows = [
    ["Excel行号", "导入门店", "分类", "项目名称", "单位", "错误原因"],
    ...errors.map((error) => [error.rowNumber, error.scope, error.category, error.name, error.unit, error.reason]),
  ];
  sheet.addRows(rows as any[][]);
  sheet.columns = [{ width: 12 }, { width: 16 }, { width: 18 }, { width: 30 }, { width: 12 }, { width: 46 }];
  sheet.eachRow((row) => {
    row.height = row.number === 1 ? 24 : 26;
    row.eachCell((cell) => {
      cell.font = { name: "SimSun", size: 11, color: { argb: "FF111827" }, bold: row.number === 1 };
      cell.alignment = { vertical: "middle", horizontal: row.number === 1 ? "center" : undefined, wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };
      if (row.number === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `定额导入错误明细_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function buildQuotaImportPreviewRows(text: string) {
  return buildQuotaImportPreviewData(text).rows;
}

export function buildQuotaImportPreviewData(text: string) {
  const rawRows = text.split(/\r?\n/).filter((line) => line.trim());
  const rows = rawRows.map(parseImportLine);
  const headerRowIndex = findQuotaImportHeaderRowIndex(rows);
  const hasHeader = headerRowIndex >= 0;
  const header = hasHeader ? rows[headerRowIndex].map(normalizeImportText) : [];
  const dataRows = hasHeader ? rows.slice(headerRowIndex + 1) : rows;
  const findHeaderIndex = (labels: string[]) => header.findIndex((cell) => labels.map(normalizeImportText).includes(cell));
  const fallbackOffset = !hasHeader && isQuotaCodeLike(rows[0]?.[0] || "") ? 1 : 0;
  const hasStoreColumn = hasHeader
    ? findHeaderIndex(["适用门店", "服务门店", "门店"]) >= 0
    : rows.some((row) => {
        const firstCell = row[fallbackOffset]?.trim() || "";
        return /店$/.test(firstCell);
      });
  const fallbackDataOffset = fallbackOffset + (hasStoreColumn ? 1 : 0);
  const readCell = (row: string[], fallbackIndex: number, labels: string[]) => {
    if (!hasHeader) return row[fallbackIndex + fallbackDataOffset] || "";
    const index = findHeaderIndex(labels);
    return index >= 0 ? row[index] || "" : "";
  };
  const previewFields = [
    { header: "分类", fallbackIndex: 0, labels: ["分类", "定额分类", "专业"] },
    { header: "项目名称", fallbackIndex: 1, labels: ["项目名称", "名称", "定额名称"] },
    { header: "施工说明", fallbackIndex: 2, labels: ["施工说明", "施工描述", "工艺说明", "说明"] },
    { header: "单位", fallbackIndex: 3, labels: ["单位", "计量单位"] },
    { header: "人工单价", fallbackIndex: 4, labels: ["人工费", "人工单价"] },
    { header: "材料单价", fallbackIndex: 5, labels: ["材料费", "材料单价"] },
    { header: "内部人工成本", fallbackIndex: 6, labels: ["内部人工成本", "人工成本", "成本人工单价"] },
    { header: "内部材料成本", fallbackIndex: 7, labels: ["内部材料成本", "材料成本", "成本材料单价"] },
    { header: "损耗率", fallbackIndex: 8, labels: ["损耗率", "材料损耗率"] },
    { header: "是否特价", fallbackIndex: 9, labels: ["是否特价", "是否特价项目", "特价"] },
  ];
  const visibleFields = hasHeader
    ? previewFields.filter((field) => findHeaderIndex(field.labels) >= 0)
    : previewFields;
  const fields = visibleFields.length > 0 ? visibleFields : previewFields;

  return {
    headers: fields.map((field) => field.header),
    rows: dataRows
      .map((row) => fields.map((field) => readCell(row, field.fallbackIndex, field.labels).trim()))
      .filter((row) => row.some(Boolean)),
  };
}

export function cellToText(value: unknown) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const cellValue = value as any;
    if (cellValue.text != null) return String(cellValue.text).trim();
    if (cellValue.result != null) return String(cellValue.result).trim();
    if (Array.isArray(cellValue.richText)) return cellValue.richText.map((item: any) => item?.text || "").join("").trim();
  }
  return String(value).trim();
}

export function matrixToImportText(rows: string[][]) {
  return rows
    .map((row) => row.map((cell) => cell.replace(/\t/g, " ").replace(/\r?\n/g, " ")).join("\t"))
    .join("\n");
}

export function parseLegacyExcelTable(text: string) {
  const parser = new DOMParser();
  const isXmlWorkbook = text.includes("urn:schemas-microsoft-com:office:spreadsheet");
  const doc = parser.parseFromString(text, isXmlWorkbook ? "text/xml" : "text/html");
  const xmlRows = Array.from(doc.getElementsByTagName("Row"));
  const htmlRows = Array.from(doc.querySelectorAll("tr"));
  const sourceRows = xmlRows.length > 0 ? xmlRows : htmlRows;
  return sourceRows
    .map((row) => {
      const cells = xmlRows.length > 0 ? Array.from(row.getElementsByTagName("Cell")) : Array.from(row.querySelectorAll("th,td"));
      return cells.map((cell) => cell.textContent?.trim() || "");
    })
    .filter((row) => row.some(Boolean));
}

export async function readExcelFileAsImportText(file: File) {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".xlsx")) {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    const sheet = workbook.worksheets[0];
    if (!sheet) return "";
    const columnCount = Math.max(sheet.columnCount || 0, quotaImportHeaders.length);
    const rows: string[][] = [];
    sheet.eachRow((row) => {
      const values = Array.from({ length: columnCount }, (_, index) => cellToText(row.getCell(index + 1).value));
      if (values.some(Boolean)) rows.push(values);
    });
    return matrixToImportText(rows);
  }

  if (lowerName.endsWith(".xls")) {
    const rows = parseLegacyExcelTable(await file.text());
    if (rows.length > 0) return matrixToImportText(rows);
    throw new Error("该 .xls 是旧版二进制格式，浏览器无法直接读取，请在 Excel 中另存为 .xlsx 后再上传");
  }

  throw new Error("请上传 Excel 文件（.xlsx 或 .xls）");
}

export async function downloadQuotaImportTemplate() {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("定额导入模板", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  const rows = [
    quotaImportHeaders,
  ];
  sheet.addRows(rows as any[][]);
  sheet.columns.forEach((column, index) => {
    const widths = [16, 28, 46, 10, 12, 12, 14, 14, 10, 12];
    column.width = widths[index] || 16;
  });
  sheet.eachRow((row) => {
    row.height = row.number === 1 ? 24 : 26;
    row.eachCell((cell) => {
      cell.font = { name: "SimSun", size: 11, color: { argb: "FF111827" }, bold: row.number === 1 };
      cell.alignment = { vertical: "middle", horizontal: row.number === 1 ? "center" : undefined, wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };
      if (row.number === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    });
  });

  const ruleSheet = workbook.addWorksheet("填写说明");
  ruleSheet.addRows([
    ["字段", "要求", "说明"],
    ["定额编码", "无需填写", "导入时由系统按导入门店自动生成，如福州店为 FZ 开头，抚州店冲突时为 FUZ 开头。"],
    ["导入门店", "页面选择", "模板中不需要填写。账号有所属门店时自动导入到该门店；账号没有所属门店时，在导入页面选择导入门店。"],
    ["分类", "建议填写", "如拆除工程、水电工程、泥瓦工程，用于列表筛选。"],
    ["项目名称", "必填", "填写定额项目名称。"],
    ["施工说明", "选填", "填写施工范围、工艺要求、验收口径等。"],
    ["单位", "必填", "如 ㎡、m、个、项；不能为空。"],
    ["人工单价/材料单价", "必填", "可填写 0，不能为负数，客户单价由系统自动合计。"],
    ["内部人工成本/内部材料成本", "数字", "用于工地成本管控预算核算，不会展示给客户。"],
    ["损耗率", "数字", "材料预算成本会按内部材料成本 × 数量 ×（1 + 损耗率）计算。"],
    ["是否特价", "选填", "填写“是”表示特价项目；填写“否”或留空表示普通项目。"],
    ["导入规则", "自动启用", "所有导入后的定额默认启用，状态不需要在模板中填写。"],
  ]);
  ruleSheet.columns = [{ width: 18 }, { width: 16 }, { width: 72 }];
  ruleSheet.eachRow((row) => {
    row.height = row.number === 1 ? 24 : 30;
    row.eachCell((cell) => {
      cell.font = { name: "SimSun", size: 11, color: { argb: "FF111827" }, bold: row.number === 1 };
      cell.alignment = { vertical: "middle", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };
      if (row.number === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `定额导入模板_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
