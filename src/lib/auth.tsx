"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api } from "./api";

interface User {
  id: string;
  name: string;
  phone: string;
  avatar?: string | null;
  role: string;
  permissions?: string[];
  org_unit_id: string | null;
  quotation_access_org_unit_ids?: string[];
  companyName: string;
  companyShortName?: string;
  sidebarBrandName?: string;
  sidebarBrandLogoUrl?: string;
  sidebarBrandSubtitle?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => {
    throw new Error("AuthProvider 未初始化");
  },
  logout: async () => {},
  isAuthenticated: false,
});

const SESSION_EXPIRED_MESSAGE = "登录已过期，请重新登录";
const SESSION_EXPIRED_STORAGE_KEY = "zxgj_session_expired_message";
const SESSION_ACTIVITY_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

function getFetchUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function isProtectedSystemRequest(input: RequestInfo | URL) {
  if (typeof window === "undefined") return false;
  try {
    const url = new URL(getFetchUrl(input), window.location.href);
    if (url.origin !== window.location.origin) return false;
    const pathname = url.pathname;
    if (pathname === "/api/auth/login" || pathname === "/api/auth/logout" || pathname === "/api/auth/me") return false;
    if (pathname.startsWith("/api/site-checkin/")) return false;
    if (pathname.startsWith("/api/signature-capture/")) return false;
    if (pathname.startsWith("/api/vr-shares/")) return false;
    if (pathname.startsWith("/api/quotation-shares/")) return false;
    if (pathname.startsWith("/api/")) return true;
    return [
      "/uploads/customers/",
      "/uploads/projects/",
      "/uploads/materials/",
      "/uploads/users/",
      "/uploads/branches/",
    ].some((prefix) => pathname.startsWith(prefix));
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const userRef = useRef<User | null>(null);
  const handlingSessionExpiredRef = useRef(false);
  const lastSessionTouchAtRef = useRef(0);

  useEffect(() => {
    userRef.current = user;
    if (user) handlingSessionExpiredRef.current = false;
  }, [user]);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    const redirectToLogin = (redirectPath?: string) => {
      if (handlingSessionExpiredRef.current) return;
      handlingSessionExpiredRef.current = true;
      localStorage.removeItem("zxgj_token");
      sessionStorage.setItem(SESSION_EXPIRED_STORAGE_KEY, SESSION_EXPIRED_MESSAGE);
      setUser(null);
      originalFetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
      const currentPath = redirectPath || `${window.location.pathname}${window.location.search}`;
      const redirect = currentPath && currentPath !== "/login" ? `?redirect=${encodeURIComponent(currentPath)}&reason=session-expired` : "?reason=session-expired";
      router.replace(`/login${redirect}`);
    };

    window.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      if (
        response.status === 401
        && userRef.current
        && isProtectedSystemRequest(input)
        && !handlingSessionExpiredRef.current
      ) {
        redirectToLogin();
      }
      return response;
    };

    const touchSessionAfterActivity = () => {
      if (!userRef.current || handlingSessionExpiredRef.current) return;
      const now = Date.now();
      if (now - lastSessionTouchAtRef.current < SESSION_ACTIVITY_TOUCH_INTERVAL_MS) return;
      lastSessionTouchAtRef.current = now;
      originalFetch("/api/auth/me", { credentials: "same-origin" })
        .then((response) => {
          if (response.status === 401 && userRef.current) redirectToLogin();
        })
        .catch(() => undefined);
    };

    const checkSessionBeforeNavigation = (event: Event) => {
      if (!userRef.current || handlingSessionExpiredRef.current) return;
      const nextHref = event instanceof CustomEvent && typeof event.detail?.href === "string" ? event.detail.href : undefined;
      originalFetch("/api/auth/me", { credentials: "same-origin" })
        .then((response) => {
          if (response.status === 401 && userRef.current) redirectToLogin(nextHref);
        })
        .catch(() => undefined);
    };
    const activityEvents = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
    activityEvents.forEach((eventName) => window.addEventListener(eventName, touchSessionAfterActivity, { passive: true }));
    document.addEventListener("visibilitychange", touchSessionAfterActivity);
    window.addEventListener("app:navigation-start", checkSessionBeforeNavigation);
    return () => {
      window.fetch = originalFetch;
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, touchSessionAfterActivity));
      document.removeEventListener("visibilitychange", touchSessionAfterActivity);
      window.removeEventListener("app:navigation-start", checkSessionBeforeNavigation);
    };
  }, [router]);

  // Restore session on mount
  useEffect(() => {
    localStorage.removeItem("zxgj_token");
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setUser(data))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const refreshCurrentUser = () => {
      fetch("/api/auth/me")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data) setUser(data);
        })
        .catch(() => {});
    };
    window.addEventListener("auth:user-updated", refreshCurrentUser);
    return () => window.removeEventListener("auth:user-updated", refreshCurrentUser);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const data = await api.post<{ user: User }>("/api/auth/login", { username, password });
    localStorage.removeItem("zxgj_token");
    handlingSessionExpiredRef.current = false;
    lastSessionTouchAtRef.current = Date.now();
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    localStorage.removeItem("zxgj_token");
    setUser(null);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
