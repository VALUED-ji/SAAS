type EzvizTokenCache = {
  accessToken: string;
  expireAt: number;
};

type EzvizLiveAddressParams = {
  deviceSerial: string;
  channelNo: number;
  validateCode?: string;
};

let tokenCache: EzvizTokenCache | null = null;

function getEzvizEndpoint(path: string) {
  const base = String(process.env.EZVIZ_API_BASE || "https://open.ys7.com").replace(/\/+$/, "");
  return `${base}${path}`;
}

function getEzvizCredentials() {
  const appKey = String(process.env.EZVIZ_APP_KEY || "").trim();
  const appSecret = String(process.env.EZVIZ_APP_SECRET || "").trim();
  return { appKey, appSecret, ready: Boolean(appKey && appSecret) };
}

function makeForm(params: Record<string, string | number | undefined>) {
  const form = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    const text = String(value ?? "").trim();
    if (text) form.append(key, text);
  });
  return form;
}

function getEzvizMessage(payload: any, fallback: string) {
  return String(payload?.msg || payload?.message || payload?.code || fallback).trim();
}

export function getEzvizConfigStatus() {
  const credentials = getEzvizCredentials();
  return { ready: credentials.ready, missing: credentials.ready ? [] : ["EZVIZ_APP_KEY", "EZVIZ_APP_SECRET"] };
}

export async function getEzvizAccessToken() {
  const credentials = getEzvizCredentials();
  if (!credentials.ready) throw new Error("萤石开放平台 AppKey 或 AppSecret 未配置");
  if (tokenCache?.accessToken && tokenCache.expireAt - Date.now() > 5 * 60 * 1000) {
    return tokenCache.accessToken;
  }

  const response = await fetch(getEzvizEndpoint("/api/lapp/token/get"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: makeForm({ appKey: credentials.appKey, appSecret: credentials.appSecret }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || String(payload?.code || "") !== "200" || !payload?.data?.accessToken) {
    throw new Error(`萤石授权失败：${getEzvizMessage(payload, "请检查 AppKey 和 AppSecret")}`);
  }

  const expireAt = Number(payload.data.expireTime || Date.now() + 60 * 60 * 1000);
  tokenCache = { accessToken: String(payload.data.accessToken), expireAt };
  return tokenCache.accessToken;
}

export async function getEzvizLiveAddress(params: EzvizLiveAddressParams) {
  const accessToken = await getEzvizAccessToken();
  const deviceSerial = String(params.deviceSerial || "").trim();
  const channelNo = Math.max(1, Number(params.channelNo || 1) || 1);
  if (!deviceSerial) throw new Error("缺少萤石设备序列号");

  const requestBody = makeForm({
    accessToken,
    deviceSerial,
    channelNo,
    code: params.validateCode,
  });
  const response = await fetch(getEzvizEndpoint("/api/lapp/v2/live/address/get"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: requestBody,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null);
  const data = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;
  const url = String(data?.url || data?.hls || data?.hlsUrl || "").trim();
  if (!response.ok || String(payload?.code || "") !== "200" || !url) {
    throw new Error(`萤石播放地址生成失败：${getEzvizMessage(payload, "请检查设备是否在线、验证码是否正确")}`);
  }
  return {
    url,
    accessToken,
    expireTime: Number(data?.expireTime || Date.now() + 15 * 60 * 1000),
    protocol: url.startsWith("ezopen:") ? "ezopen" : "hls",
  };
}
