import { afterEach, describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { getPublicAppOrigin } from "./requestOrigin";

const originalPublicUrl = process.env.APP_PUBLIC_URL;

function makeRequest(url: string, headers: Record<string, string> = {}) {
  return {
    headers: new Headers(headers),
    nextUrl: new URL(url),
  } as unknown as NextRequest;
}

afterEach(() => {
  if (originalPublicUrl === undefined) {
    delete process.env.APP_PUBLIC_URL;
  } else {
    process.env.APP_PUBLIC_URL = originalPublicUrl;
  }
});

describe("getPublicAppOrigin", () => {
  it("uses the configured public HTTPS origin behind a reverse proxy", () => {
    process.env.APP_PUBLIC_URL = "https://crm.zhaojikeji.cn/app";
    const request = makeRequest("http://127.0.0.1:3000/api/profile/signatures/capture-sessions");
    expect(getPublicAppOrigin(request)).toBe("https://crm.zhaojikeji.cn");
  });

  it("falls back to proxy-aware request headers without a configured origin", () => {
    delete process.env.APP_PUBLIC_URL;
    const request = makeRequest("http://127.0.0.1:3000/api/profile/signatures/capture-sessions", {
      host: "crm.zhaojikeji.cn",
      "x-forwarded-proto": "https",
    });
    expect(getPublicAppOrigin(request)).toBe("https://crm.zhaojikeji.cn");
  });

  it("ignores an invalid configured origin", () => {
    process.env.APP_PUBLIC_URL = "not-a-url";
    const request = makeRequest("http://localhost:3458/api/profile/signatures/capture-sessions", {
      host: "localhost:3458",
    });
    expect(getPublicAppOrigin(request)).toBe("http://localhost:3458");
  });
});
