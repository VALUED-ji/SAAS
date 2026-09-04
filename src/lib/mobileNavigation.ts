"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

const DIRECTION_KEY = "zxgj_mobile_nav_direction";
const INTERNAL_NAV_KEY = "zxgj_mobile_internal_nav";

export type MobileNavDirection = "forward" | "back" | "none";

export function markMobileNavigation(direction: Exclude<MobileNavDirection, "none">) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(DIRECTION_KEY, direction);
  window.sessionStorage.setItem(INTERNAL_NAV_KEY, "1");
}

export function consumeMobileNavigationDirection(): MobileNavDirection {
  if (typeof window === "undefined") return "none";
  const direction = window.sessionStorage.getItem(DIRECTION_KEY);
  window.sessionStorage.removeItem(DIRECTION_KEY);
  return direction === "back" || direction === "forward" ? direction : "none";
}

export function useMobileBack(fallbackHref = "/m") {
  const router = useRouter();
  return useCallback(() => {
    markMobileNavigation("back");
    if (typeof window !== "undefined") {
      const referrer = document.referrer ? new URL(document.referrer, window.location.origin) : null;
      const hasMobileReferrer = Boolean(referrer && referrer.origin === window.location.origin && referrer.pathname.startsWith("/m"));
      const hasInternalNavigation = window.sessionStorage.getItem(INTERNAL_NAV_KEY) === "1";
      if (hasMobileReferrer || hasInternalNavigation) {
        router.back();
        return;
      }
    }
    router.replace(fallbackHref);
  }, [fallbackHref, router]);
}
