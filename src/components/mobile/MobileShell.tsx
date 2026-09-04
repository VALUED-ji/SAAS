"use client";

import { useAuth } from "@/lib/auth";
import { CheckSquare, ContactRound, Gauge, HardHat, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { consumeMobileNavigationDirection, markMobileNavigation, type MobileNavDirection } from "@/lib/mobileNavigation";
import styles from "./mobile-shell.module.css";

const navItems = [
  { href: "/m/todos", label: "待办", icon: CheckSquare },
  { href: "/m/customers", label: "客户", icon: ContactRound },
  { href: "/m/dashboard", label: "驾驶舱", icon: Gauge },
  { href: "/m/site", label: "工地", icon: HardHat },
  { href: "/m/profile", label: "我的", icon: UserRound },
];

function MobileShellContent({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  const [direction, setDirection] = useState<MobileNavDirection>("none");
  const showTabbar = pathname === "/m" || navItems.some((item) => pathname === item.href);
  const isMobileHref = useMemo(() => (href: string) => {
    try {
      const url = new URL(href, window.location.origin);
      return url.origin === window.location.origin && url.pathname.startsWith("/m") && `${url.pathname}${url.search}` !== `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
    } catch {
      return false;
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!loading && !isAuthenticated) router.replace(`/login?redirect=${encodeURIComponent(pathname)}`);
  }, [isAuthenticated, loading, pathname, router]);

  useEffect(() => {
    setDirection(consumeMobileNavigationDirection());
  }, [routeKey]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as HTMLElement | null)?.closest("a[href]");
      const href = anchor?.getAttribute("href") || "";
      if (href && isMobileHref(href)) markMobileNavigation("forward");
    };
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [isMobileHref]);

  if (loading) {
    return (
      <div className={styles.loading}>
        <span>正在进入移动端</span>
      </div>
    );
  }
  if (!isAuthenticated) return null;

  return (
    <div className={styles.shell}>
      <main className={styles.main} data-tabbar={showTabbar || undefined}>
        <div key={routeKey} className={styles.pageTransition} data-direction={direction === "none" ? undefined : direction}>{children}</div>
      </main>
      {showTabbar && <nav className={styles.tabbar} aria-label="移动端主导航">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.href === "/m/customers"
              ? pathname.startsWith("/m/customers") && searchParams.get("focus") !== "followup"
              : item.href === "/m/todos"
                ? pathname === "/m" || pathname.startsWith("/m/todos")
              : item.href === "/m/dashboard"
                ? pathname.startsWith("/m/dashboard")
              : item.href === "/m/site"
                ? pathname.startsWith("/m/site")
              : item.href === "/m/profile"
                ? pathname.startsWith("/m/profile")
              : pathname === item.href;
          return (
            <Link key={item.href} href={item.href} className={styles.navItem} data-active={active || undefined} onClick={() => markMobileNavigation("forward")}>
              <span className={styles.navIcon}><Icon /></span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>}
    </div>
  );
}

export default function MobileShell({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className={styles.loading}><span>正在进入移动端</span></div>}>
      <MobileShellContent>{children}</MobileShellContent>
    </Suspense>
  );
}
