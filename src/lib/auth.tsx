"use client";

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const queryClient = useQueryClient();
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
      queryClient.clear();
      setUser(null);
      originalFetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
      const currentPath = redirectPath || `${window.location.pathname}${window.location.search}`;
      const redirect = currentPath && currentPath !== "/login" ? `?redirect=${encodeURIComponent(currentPath)}&reason=session-expired` : "?reason=session-expired";
      router.replace(`/login${redirect}`);
    };

    const touchSessionAfterActivity = (event?: Event) => {
      if (!userRef.current || handlingSessionExpiredRef.current) return;
      const now = Date.now();
      const isDirectInteraction = event?.type === "pointerdown" || event?.type === "touchstart";
      if (!isDirectInteraction && now - lastSessionTouchAtRef.current < SESSION_ACTIVITY_TOUCH_INTERVAL_MS) return;
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
    const activityEvents = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    activityEvents.forEach((eventName) => window.addEventListener(eventName, touchSessionAfterActivity, { passive: true }));
    window.addEventListener("app:navigation-start", checkSessionBeforeNavigation);
    return () => {
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, touchSessionAfterActivity));
      window.removeEventListener("app:navigation-start", checkSessionBeforeNavigation);
    };
  }, [queryClient, router]);

  // Restore session on mount
  useEffect(() => {
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
    queryClient.clear();
    const data = await api.post<{ user: User }>("/api/auth/login", { username, password });
    localStorage.removeItem("zxgj_token");
    handlingSessionExpiredRef.current = false;
    lastSessionTouchAtRef.current = Date.now();
    queryClient.clear();
    setUser(data.user);
    return data.user;
  }, [queryClient]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    localStorage.removeItem("zxgj_token");
    queryClient.clear();
    setUser(null);
    router.push("/login");
  }, [queryClient, router]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
