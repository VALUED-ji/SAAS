import type { getDb } from "@/lib/db";

type Db = ReturnType<typeof getDb>;

function cleanText(value?: string | null) {
  return String(value || "").trim();
}

export function getMaterialOrderStoreCode(storeName?: string | null) {
  const text = cleanText(storeName).replace(/(分公司|分店|门店|旗舰店|店)$/g, "");
  if (!text) return "DD";

  const namedCodes: Record<string, string> = {
    番禺: "PY",
    新塘: "XT",
    增城: "ZC",
    云浮: "YF",
    广州: "GZ",
    上海: "SH",
    浦东: "PD",
    徐汇: "XH",
    杭州: "HZ",
    西湖: "XH",
    北京: "BJ",
  };
  const matched = Object.entries(namedCodes).find(([name]) => text.includes(name));
  if (matched) return matched[1];

  const asciiCode = text.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase();
  if (asciiCode.length >= 2) return asciiCode;

  const initialMap: Record<string, string> = {
    广: "G", 州: "Z", 番: "P", 禺: "Y", 新: "X", 塘: "T",
    增: "Z", 城: "C", 云: "Y", 浮: "F", 上: "S", 海: "H",
    浦: "P", 东: "D", 徐: "X", 汇: "H", 杭: "H", 西: "X",
    湖: "H", 北: "B", 京: "J",
  };
  const initials = Array.from(text).map((char) => initialMap[char] || "").join("").slice(0, 2);
  return initials.length >= 2 ? initials : "DD";
}

export function getChinaDateNumber() {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date()).replace(/\D/g, "");
}

export function makeMaterialOrderNo(db: Db, storeName?: string | null) {
  const prefix = `${getMaterialOrderStoreCode(storeName)}${getChinaDateNumber()}`;
  const latest = db.prepare(`
    SELECT order_no
    FROM material_orders
    WHERE order_no LIKE ?
    ORDER BY order_no DESC
    LIMIT 1
  `).get(`${prefix}%`) as any;
  let sequence = Number(String(latest?.order_no || "").slice(prefix.length)) + 1;
  if (!Number.isFinite(sequence) || sequence <= 0) sequence = 1;
  let orderNo = `${prefix}${String(sequence).padStart(4, "0")}`;
  while (db.prepare("SELECT id FROM material_orders WHERE order_no = ? LIMIT 1").get(orderNo)) {
    sequence += 1;
    orderNo = `${prefix}${String(sequence).padStart(4, "0")}`;
  }
  return orderNo;
}
