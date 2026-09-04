import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/security/authorization";

const amapKeyEnvNames = ["AMAP_WEB_SERVICE_KEY", "GAODE_WEB_SERVICE_KEY", "AMAP_KEY", "GAODE_KEY"] as const;
const residentialPoiTypes = "120000|120100|120200|120201|120202|120203|120300|120301|120302|120303";

function getAmapKey() {
  for (const name of amapKeyEnvNames) {
    const value = process.env[name];
    if (value?.trim()) return value.trim();
  }
  return "";
}

function asText(value: unknown): string {
  if (Array.isArray(value)) return value.map(asText).filter(Boolean).join("");
  return String(value || "").trim();
}

function toCoordinate(location: unknown) {
  const [longitude, latitude] = asText(location).split(",").map(Number);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    return { longitude: null, latitude: null };
  }
  return { longitude, latitude };
}

function normalizeCityName(value: unknown) {
  return asText(value).replace(/市$/, "");
}

function normalizeSearchText(value: unknown) {
  return asText(value).replace(/[\s·\-()（）]/g, "");
}

function getAmapErrorMessage(info?: unknown, infocode?: unknown) {
  const code = String(info || "").trim();
  const detail = infocode ? `（${infocode}）` : "";
  if (code === "INVALID_USER_IP") return `高德搜索失败：当前服务器 IP 不在该 Key 的白名单中${detail}`;
  if (code === "INVALID_USER_KEY") return `高德搜索失败：Key 无效，请检查 Web 服务 Key${detail}`;
  if (code === "SERVICE_NOT_AVAILABLE") return `高德搜索失败：该 Key 未开通 Web 服务或服务不可用${detail}`;
  if (code === "DAILY_QUERY_OVER_LIMIT") return `高德搜索失败：该 Key 今日调用量已用完${detail}`;
  if (code === "USER_DAILY_QUERY_OVER_LIMIT") return `高德搜索失败：账号今日调用量已用完${detail}`;
  return `高德搜索失败：${code || "服务异常"}${detail}`;
}

function normalizePoi(poi: any) {
  const coordinate = toCoordinate(poi?.location);
  const city = asText(poi?.cityname);
  const address = [poi?.pname, poi?.cityname, poi?.adname, poi?.address]
    .map(asText)
    .filter(Boolean)
    .join("");
  return {
    id: asText(poi?.id) || `${asText(poi?.name)}-${asText(poi?.location)}`,
    name: asText(poi?.name),
    address,
    city,
    district: [poi?.pname, poi?.cityname, poi?.adname].map(asText).filter(Boolean).join(""),
    location: asText(poi?.location),
    longitude: coordinate.longitude,
    latitude: coordinate.latitude,
    type: asText(poi?.type),
    searchScope: "residential",
    source: "poi",
  };
}

function normalizeTip(tip: any) {
  const coordinate = toCoordinate(tip?.location);
  const district = asText(tip?.district);
  const address = [district, tip?.address].map(asText).filter(Boolean).join("");
  return {
    id: asText(tip?.id) || `${asText(tip?.name)}-${asText(tip?.location)}`,
    name: asText(tip?.name),
    address,
    city: "",
    district,
    location: asText(tip?.location),
    longitude: coordinate.longitude,
    latitude: coordinate.latitude,
    type: asText(tip?.type),
    searchScope: "residential",
    source: "tip",
  };
}

async function fetchPoiSearch(key: string, keywords: string, city: string, cityLimit: boolean, scope: "residential" | "general") {
  const url = new URL("https://restapi.amap.com/v3/place/text");
  url.searchParams.set("key", key);
  url.searchParams.set("keywords", keywords);
  if (scope === "residential") url.searchParams.set("types", residentialPoiTypes);
  url.searchParams.set("city", city || "全国");
  url.searchParams.set("citylimit", city && cityLimit ? "true" : "false");
  url.searchParams.set("offset", "20");
  url.searchParams.set("page", "1");
  url.searchParams.set("extensions", "base");
  url.searchParams.set("output", "json");

  const response = await fetch(url, { cache: "no-store" });
  const result = await response.json();
  if (result?.status !== "1") {
    throw new Error(getAmapErrorMessage(result?.info, result?.infocode));
  }
  const pois = Array.isArray(result?.pois) ? result.pois : [];
  return pois.map((poi: any) => ({ ...normalizePoi(poi), searchScope: scope }));
}

async function fetchInputTips(key: string, keywords: string, city: string, cityLimit: boolean, scope: "residential" | "general") {
  const url = new URL("https://restapi.amap.com/v3/assistant/inputtips");
  url.searchParams.set("key", key);
  url.searchParams.set("keywords", keywords);
  if (scope === "residential") url.searchParams.set("type", residentialPoiTypes);
  if (city) url.searchParams.set("city", city);
  url.searchParams.set("citylimit", city && cityLimit ? "true" : "false");
  url.searchParams.set("datatype", "poi");
  url.searchParams.set("output", "json");

  const response = await fetch(url, { cache: "no-store" });
  const result = await response.json();
  if (result?.status !== "1") {
    throw new Error(getAmapErrorMessage(result?.info, result?.infocode));
  }
  const tips = Array.isArray(result?.tips) ? result.tips : [];
  return tips.map((tip: any) => ({ ...normalizeTip(tip), searchScope: scope }));
}

function scoreResult(item: ReturnType<typeof normalizePoi>, keywords: string, preferredCity = "") {
  const name = normalizeSearchText(item.name);
  const query = normalizeSearchText(keywords);
  const city = normalizeCityName(preferredCity);
  const itemCityText = normalizeCityName([item.city, item.district, item.address].filter(Boolean).join(""));
  let score = 0;
  if (item.source === "tip") score += 20;
  if (city && itemCityText.includes(city)) score += 120;
  if (item.searchScope === "residential") score += 18;
  if (name === query) score += 260;
  else if (name.startsWith(query)) score += 80;
  else if (name.includes(query)) score += 60;
  if (item.longitude !== null && item.latitude !== null) score += 10;
  return score;
}

function resultMatchesKeyword(item: ReturnType<typeof normalizePoi>, keywords: string) {
  const query = normalizeSearchText(keywords);
  if (!query) return false;
  const searchableText = [item.name, item.address, item.district, item.city]
    .map(normalizeSearchText)
    .join("");
  return searchableText.includes(query);
}

function shouldExpandBeyondCurrentCity(results: ReturnType<typeof normalizePoi>[], keywords: string, city: string) {
  if (!city || !results.length) return false;
  const query = normalizeSearchText(keywords);
  if (query.length < 3) return false;
  return !results.some((item) => resultMatchesKeyword(item, keywords));
}

function mergeResults(results: ReturnType<typeof normalizePoi>[], keywords: string, preferredCity = "") {
  const map = new Map<string, ReturnType<typeof normalizePoi>>();
  results
    .filter((item) => item.name)
    .forEach((item) => {
      const key = item.id || item.location || `${item.name}-${item.address}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, item);
        return;
      }
      map.set(key, {
        ...existing,
        ...item,
        address: item.address || existing.address,
        city: item.city || existing.city,
        district: item.district || existing.district,
        location: item.location || existing.location,
        longitude: item.longitude ?? existing.longitude,
        latitude: item.latitude ?? existing.latitude,
        searchScope: existing.searchScope === "residential" ? existing.searchScope : item.searchScope,
      });
    });

  return Array.from(map.values())
    .sort((a, b) => scoreResult(b, keywords, preferredCity) - scoreResult(a, keywords, preferredCity))
    .slice(0, 20);
}

async function fetchSearchBatch(key: string, keywords: string, city: string, cityLimit: boolean) {
  const settled = await Promise.allSettled([
    fetchInputTips(key, keywords, city, cityLimit, "residential"),
    fetchPoiSearch(key, keywords, city, cityLimit, "residential"),
    fetchInputTips(key, keywords, city, cityLimit, "general"),
    fetchPoiSearch(key, keywords, city, cityLimit, "general"),
  ]);
  return {
    errors: settled.filter((item) => item.status === "rejected") as PromiseRejectedResult[],
    results: settled.flatMap((item) => (item.status === "fulfilled" ? item.value : [])),
  };
}

export async function GET(req: NextRequest) {
  if (!getAuthContext(req)) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const key = getAmapKey();
  if (!key) {
    return NextResponse.json({ message: "未配置高德 Web 服务 Key" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const keywords = asText(searchParams.get("keywords"));
  const city = asText(searchParams.get("city"));
  if (!keywords) {
    return NextResponse.json({ message: "请输入搜索关键词" }, { status: 400 });
  }

  try {
    const cityLimited = Boolean(city);
    let { errors, results } = await fetchSearchBatch(key, keywords, city, cityLimited);
    let usedCityLimit = cityLimited;
    if ((!results.length || shouldExpandBeyondCurrentCity(results, keywords, city)) && cityLimited) {
      const fallback = await fetchSearchBatch(key, keywords, "", false);
      errors = fallback.errors.length ? fallback.errors : errors;
      results = [...results, ...fallback.results];
      usedCityLimit = false;
    }
    if (!results.length && errors.length >= 2) {
      throw errors[0].reason;
    }
    return NextResponse.json({ pois: mergeResults(results, keywords, city), city, cityLimited: usedCityLimit });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "高德搜索服务请求失败" }, { status: 502 });
  }
}
