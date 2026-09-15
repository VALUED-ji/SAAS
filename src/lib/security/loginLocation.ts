import type { NextRequest } from "next/server";
import { getRequestIp } from "./requestIp";

export type LoginLocation = {
  ip: string;
  location: string;
};

const regionNames: Record<string, string> = {
  Anhui: "安徽省",
  Beijing: "北京市",
  Chongqing: "重庆市",
  Fujian: "福建省",
  Gansu: "甘肃省",
  Guangdong: "广东省",
  Guangxi: "广西壮族自治区",
  Guizhou: "贵州省",
  Hainan: "海南省",
  Hebei: "河北省",
  Heilongjiang: "黑龙江省",
  Henan: "河南省",
  Hubei: "湖北省",
  Hunan: "湖南省",
  Inner_Mongolia: "内蒙古自治区",
  Jiangsu: "江苏省",
  Jiangxi: "江西省",
  Jilin: "吉林省",
  Liaoning: "辽宁省",
  Ningxia: "宁夏回族自治区",
  Qinghai: "青海省",
  Shaanxi: "陕西省",
  Shandong: "山东省",
  Shanghai: "上海市",
  Shanxi: "山西省",
  Sichuan: "四川省",
  Tianjin: "天津市",
  Tibet: "西藏自治区",
  Xinjiang: "新疆维吾尔自治区",
  Yunnan: "云南省",
  Zhejiang: "浙江省",
  Hong_Kong: "香港特别行政区",
  Macao: "澳门特别行政区",
  Taiwan: "台湾省",
};

const cityNames: Record<string, string> = {
  Beijing: "北京市",
  Shanghai: "上海市",
  Guangzhou: "广州市",
  Shenzhen: "深圳市",
  Foshan: "佛山市",
  Dongguan: "东莞市",
  Zhuhai: "珠海市",
  Zhongshan: "中山市",
  Huizhou: "惠州市",
  Jiangmen: "江门市",
  Zhaoqing: "肇庆市",
  Chengdu: "成都市",
  Hangzhou: "杭州市",
  Nanjing: "南京市",
  Suzhou: "苏州市",
  Wuhan: "武汉市",
  Changsha: "长沙市",
  Zhengzhou: "郑州市",
  Jinan: "济南市",
  Xian: "西安市",
  Xi_an: "西安市",
  Fuzhou: "福州市",
  Xiamen: "厦门市",
  Kunming: "昆明市",
  Haikou: "海口市",
  Nanning: "南宁市",
  Hefei: "合肥市",
  Nanchang: "南昌市",
  Shijiazhuang: "石家庄市",
  Taiyuan: "太原市",
  Changchun: "长春市",
  Shenyang: "沈阳市",
};

function isPublicIp(ip: string) {
  if (!ip || ip === "unknown" || ip === "0.0.0.0" || ip === "::1" || ip === "127.0.0.1") return false;
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip)) return false;
  return true;
}

function toChineseName(value: unknown, names: Record<string, string>, suffix: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return names[raw.replace(/\s+/g, "_")] || (/[省市区县]$/.test(raw) ? raw : `${raw}${suffix}`);
}

function formatLocation(data: any) {
  const countryCode = String(data?.country_code || "").toUpperCase();
  const country = countryCode === "CN" ? "中国" : String(data?.country || "").trim();
  const region = countryCode === "CN"
    ? toChineseName(data?.region, regionNames, "省")
    : String(data?.region || "").trim();
  const city = countryCode === "CN"
    ? toChineseName(data?.city, cityNames, "市")
    : String(data?.city || "").trim();
  return [country, region, city].filter(Boolean).join(" ") || "未知地区";
}

export async function resolveLoginLocation(req: NextRequest): Promise<LoginLocation> {
  const ip = getRequestIp(req);
  if (!isPublicIp(ip)) return { ip, location: "本地网络" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 800);
  try {
    const response = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN&fields=status,country,regionName,city,query`, {
      signal: controller.signal,
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    return { ip, location: data?.status !== "success" ? "未知地区" : formatLocation({
      country_code: data?.country === "中国" ? "CN" : "",
      country: data?.country,
      region: data?.regionName,
      city: data?.city,
    }) };
  } catch {
    return { ip, location: "未知地区" };
  } finally {
    clearTimeout(timeout);
  }
}
