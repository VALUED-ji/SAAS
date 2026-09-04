"use client";

import { usePathname } from "next/navigation";
import { AuthProvider } from "@/lib/auth";
import DashboardLayout from "./DashboardLayout";
import MobileShell from "@/components/mobile/MobileShell";

function isPublicPage(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/login" ||
    pathname.startsWith("/quotation-share/") ||
    pathname.startsWith("/contract-template-share/") ||
    pathname.startsWith("/vr-share/") ||
    pathname.startsWith("/projects/upload/") ||
    pathname.startsWith("/site-checkin/") ||
    pathname.startsWith("/signature-capture/")
  );
}

function isMobilePage(pathname: string) {
  return pathname === "/m" || pathname.startsWith("/m/");
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <AuthProvider>
      {isPublicPage(pathname)
        ? children
        : isMobilePage(pathname)
          ? <MobileShell>{children}</MobileShell>
          : <DashboardLayout>{children}</DashboardLayout>}
    </AuthProvider>
  );
}
