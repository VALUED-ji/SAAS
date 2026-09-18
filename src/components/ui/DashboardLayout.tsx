"use client";

import { useAuth } from "@/lib/auth";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import RouteLoading from "./RouteLoading";
import { Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { canAccessMenuPath, getDefaultAuthorizedPath } from "@/lib/menuAccess";

function DashboardInner({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [routeLoading, setRouteLoading] = useState(false);
  const routeLoadingTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, loading, router]);

  useEffect(() => {
    if (loading || !isAuthenticated || !user) return;
    if (canAccessMenuPath(user, pathname)) return;
    const nextPath = getDefaultAuthorizedPath(user);
    if (nextPath !== pathname) router.replace(nextPath);
  }, [isAuthenticated, loading, pathname, router, user]);

  useEffect(() => {
    setRouteLoading(false);
    if (routeLoadingTimerRef.current) {
      window.clearTimeout(routeLoadingTimerRef.current);
      routeLoadingTimerRef.current = null;
    }
  }, [pathname]);

  useEffect(() => {
    const handleNavigationStart = () => {
      setRouteLoading(true);
      if (routeLoadingTimerRef.current) window.clearTimeout(routeLoadingTimerRef.current);
      routeLoadingTimerRef.current = window.setTimeout(() => {
        setRouteLoading(false);
        routeLoadingTimerRef.current = null;
      }, 8000);
    };
    window.addEventListener("app:navigation-start", handleNavigationStart);
    return () => {
      window.removeEventListener("app:navigation-start", handleNavigationStart);
      if (routeLoadingTimerRef.current) {
        window.clearTimeout(routeLoadingTimerRef.current);
        routeLoadingTimerRef.current = null;
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  if (user && !canAccessMenuPath(user, pathname)) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="dashboard-scale-root min-h-screen bg-[#F5F7FB] text-surface-800">
      <div className="dashboard-scale-viewport flex flex-col overflow-hidden bg-[#F5F7FB] md:flex-row">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TopBar />
          <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-[#F5F7FB] p-5 lg:p-7">
            {routeLoading ? <RouteLoading /> : children}
          </main>
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <DashboardInner>{children}</DashboardInner>;
}
