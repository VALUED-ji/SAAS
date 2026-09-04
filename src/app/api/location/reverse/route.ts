import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/security/authorization";

const amapKeyEnvNames = ["AMAP_WEB_SERVICE_KEY", "GAODE_WEB_SERVICE_KEY", "AMAP_KEY", "GAODE_KEY"] as const;

function getAmapKey() {
  for (const name of amapKeyEnvNames) {
    const value = process.env[name];
    if (value?.trim()) return value.trim();
  }
  return "";
}

function cleanText(value: unknown): string {
  return String(value || "")
    .replace(/[()（）]/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function getAmapName(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return cleanText(value);
  if (Array.isArray(value)) return value.map(getAmapName).find(Boolean) || "";
  if (typeof value === "object") return cleanText(value.name || value.alias || "");
  return "";
}

function getAmapType(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return cleanText(value);
  if (Array.isArray(value)) return value.map(getAmapType).find(Boolean) || "";
  if (typeof value === "object") return cleanText(value.type || "");
  return "";
}

function toDistance(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 99999;
}

const communityNamePattern = /([\u4e00-\u9fa5A-Za-z0-9·\-]{2,28}(?:小区|花园|家园|公寓|公馆|华府|府|苑|园|城|湾|郡|庭|院|里|台|雅居|名邸|新村|社区|住宅区|别墅|山庄))/;
const residentialTypePattern = /(商务住宅|住宅区|住宅小区|楼宇|小区|公寓|别墅|社区)/;
type AmapPlaceCandidate = { name: string; type?: string; distance?: number; source: string; score?: number };

function getAmapErrorMessage(info?: unknown, infocode?: unknown) {
  const code = String(info || "").trim();
  const detail = infocode ? `（${infocode}）` : "";
  if (code === "INVALID_USER_IP") {
    return `高德定位失败：当前服务器 IP 不在该 Key 的白名单中，请在高德控制台放行服务器出口 IP，或取消 IP 白名单限制${detail}`;
  }
  if (code === "INVALID_USER_KEY") return `高德定位失败：Key 无效，请检查 Web 服务 Key${detail}`;
  if (code === "SERVICE_NOT_AVAILABLE") return `高德定位失败：该 Key 未开通 Web 服务或服务不可用${detail}`;
  if (code === "DAILY_QUERY_OVER_LIMIT") return `高德定位失败：该 Key 今日调用量已用完${detail}`;
  if (code === "USER_DAILY_QUERY_OVER_LIMIT") return `高德定位失败：账号今日调用量已用完${detail}`;
  return `高德定位失败：${code || "服务异常"}${detail}`;
}

function normalizeCommunityName(name: string): string {
  const cleaned = cleanText(name);
  const matched = cleaned.match(communityNamePattern);
  return matched?.[1] || cleaned;
}

function scoreCommunityCandidate(candidate: { name: string; type?: string; distance?: number; source: string }): number {
  const name = cleanText(candidate.name);
  const type = cleanText(candidate.type);
  if (!name) return -1;
  let score = 0;
  if (candidate.source === "neighborhood") score += 120;
  if (candidate.source === "aoi") score += 95;
  if (candidate.source === "building") score += 75;
  if (candidate.source === "poi") score += 65;
  if (communityNamePattern.test(name)) score += 45;
  if (residentialTypePattern.test(type)) score += 45;
  if (candidate.distance !== undefined) {
    if (candidate.distance <= 80) score += 25;
    else if (candidate.distance <= 200) score += 15;
    else if (candidate.distance <= 500) score += 5;
    else score -= 20;
  }
  return score;
}

function isLikelyCommunityCandidate(candidate: { name: string; type?: string; source: string }): boolean {
  const name = cleanText(candidate.name);
  const type = cleanText(candidate.type);
  if (!name) return false;
  if (communityNamePattern.test(name) || residentialTypePattern.test(type)) return true;
  return candidate.source === "neighborhood" && name.length >= 2 && name.length <= 28;
}

function scoreClickedPlaceCandidate(candidate: AmapPlaceCandidate): number {
  const name = cleanText(candidate.name);
  const type = cleanText(candidate.type);
  const distance = candidate.distance ?? 99999;
  if (!name || name === "[]" || distance > 160) return -1;
  let score = candidate.source === "poi" ? 90 : 70;
  if (distance <= 15) score += 110;
  else if (distance <= 40) score += 80;
  else if (distance <= 80) score += 40;
  else if (distance <= 160) score += 10;
  if (residentialTypePattern.test(type) || communityNamePattern.test(name)) score += 12;
  return score;
}

function pickAmapClickedPlace(regeocode: any) {
  const candidates: AmapPlaceCandidate[] = [];
  const push = (source: string, name: string, type?: string, distance?: number) => {
    const cleanedName = cleanText(name);
    if (!cleanedName || cleanedName === "[]") return;
    candidates.push({ source, name: cleanedName, type, distance });
  };

  if (Array.isArray(regeocode?.pois)) {
    regeocode.pois.forEach((item: any) => {
      push("poi", item?.name, item?.type, toDistance(item?.distance));
    });
  }
  if (Array.isArray(regeocode?.aois)) {
    regeocode.aois.forEach((item: any) => {
      push("aoi", item?.name, item?.type, toDistance(item?.distance));
    });
  }

  return candidates
    .map((candidate) => ({ ...candidate, score: scoreClickedPlaceCandidate(candidate) }))
    .filter((candidate) => (candidate.score || 0) >= 120)
    .sort((a, b) => (b.score || 0) - (a.score || 0) || (a.distance || 99999) - (b.distance || 99999))[0];
}

function pickAmapCommunity(regeocode: any) {
  const component = regeocode?.addressComponent || {};
  const candidates: { name: string; type?: string; distance?: number; source: string }[] = [];
  const push = (source: string, name: string, type?: string, distance?: number) => {
    const cleanedName = cleanText(name);
    if (!cleanedName || cleanedName === "[]") return;
    candidates.push({ source, name: cleanedName, type, distance });
  };

  push("neighborhood", getAmapName(component.neighborhood), getAmapType(component.neighborhood), 0);
  push("building", getAmapName(component.building), getAmapType(component.building), 0);

  if (Array.isArray(regeocode?.aois)) {
    regeocode.aois.forEach((item: any) => {
      push("aoi", item?.name, item?.type, toDistance(item?.distance));
    });
  }
  if (Array.isArray(regeocode?.pois)) {
    regeocode.pois.forEach((item: any) => {
      push("poi", item?.name, item?.type, toDistance(item?.distance));
    });
  }

  return candidates
    .map((candidate) => ({
      ...candidate,
      name: normalizeCommunityName(candidate.name),
      score: scoreCommunityCandidate(candidate),
    }))
    .filter((candidate) => candidate.score >= 90 && isLikelyCommunityCandidate(candidate))
    .sort((a, b) => b.score - a.score || (a.distance || 99999) - (b.distance || 99999))[0];
}

function pickAmapFallbackName(regeocode: any) {
  const component = regeocode?.addressComponent || {};
  const street = getAmapName(component.streetNumber?.street);
  const number = getAmapName(component.streetNumber?.number);
  const township = getAmapName(component.township);
  const district = getAmapName(component.district);
  return [[street, number].filter(Boolean).join(""), township, district].filter(Boolean).slice(0, 2).join(" · ");
}

async function convertGpsToAmap(lng: number, lat: number, key: string) {
  const url = new URL("https://restapi.amap.com/v3/assistant/coordinate/convert");
  url.searchParams.set("key", key);
  url.searchParams.set("locations", `${lng.toFixed(6)},${lat.toFixed(6)}`);
  url.searchParams.set("coordsys", "gps");
  url.searchParams.set("output", "json");
  const response = await fetch(url, { cache: "no-store" });
  const result = await response.json();
  if (result?.status !== "1") {
    throw new Error(getAmapErrorMessage(result?.info, result?.infocode));
  }
  if (result?.status === "1" && result?.locations) {
    const [convertedLng, convertedLat] = String(result.locations).split(";")[0].split(",").map(Number);
    if (Number.isFinite(convertedLng) && Number.isFinite(convertedLat)) {
      return { lng: convertedLng, lat: convertedLat, converted: true };
    }
  }
  return { lng, lat, converted: false };
}

export async function GET(req: NextRequest) {
  if (!getAuthContext(req)) return NextResponse.json({ message: "请先登录" }, { status: 401 });
  const key = getAmapKey();
  if (!key) {
    return NextResponse.json({ message: "未配置高德 Web 服务 Key" }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng") || searchParams.get("lon"));
  const coordsys = String(searchParams.get("coordsys") || "").toLowerCase();
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ message: "经纬度参数错误" }, { status: 400 });
  }

  try {
    const amapCoordinate = coordsys === "amap" || coordsys === "gcj02"
      ? { lng, lat, converted: false }
      : await convertGpsToAmap(lng, lat, key);
    const url = new URL("https://restapi.amap.com/v3/geocode/regeo");
    url.searchParams.set("key", key);
    url.searchParams.set("location", `${amapCoordinate.lng.toFixed(6)},${amapCoordinate.lat.toFixed(6)}`);
    url.searchParams.set("radius", "1000");
    url.searchParams.set("extensions", "all");
    url.searchParams.set("batch", "false");
    url.searchParams.set("roadlevel", "0");
    url.searchParams.set("homeorcorp", "1");
    url.searchParams.set("output", "json");

    const response = await fetch(url, { cache: "no-store" });
    const result = await response.json();
    if (result?.status !== "1") {
      return NextResponse.json({ message: getAmapErrorMessage(result?.info, result?.infocode) }, { status: 502 });
    }

    const regeocode = result?.regeocode || {};
    const component = regeocode?.addressComponent || {};
    const province = getAmapName(component.province);
    const city = getAmapName(component.city) || province;
    const district = getAmapName(component.district);
    const clickedPlace = pickAmapClickedPlace(regeocode);
    const community = pickAmapCommunity(regeocode);
    const displayPlace = clickedPlace || community;
    const fallbackName = pickAmapFallbackName(regeocode) || `当前位置 ${lat.toFixed(5)}, ${lng.toFixed(5)} 附近`;
    return NextResponse.json({
      provider: "amap",
      coordinate_system: "gcj02",
      converted: amapCoordinate.converted,
      latitude: lat,
      longitude: lng,
      amap_latitude: amapCoordinate.lat,
      amap_longitude: amapCoordinate.lng,
      province,
      city,
      district,
      adcode: getAmapName(component.adcode),
      place_name: displayPlace?.name || "",
      place_type: displayPlace?.type || "",
      place_distance: displayPlace?.distance ?? null,
      place_source: displayPlace?.source || "",
      location_name: displayPlace?.name ? `${displayPlace.name}附近` : fallbackName,
      location_address: regeocode?.formatted_address || "",
    });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "高德定位服务请求失败" }, { status: 502 });
  }
}
