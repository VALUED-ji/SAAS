import type { Metadata, Viewport } from "next";
import "./globals.css";
import QueryProvider from "@/components/ui/QueryProvider";
import AppShell from "@/components/ui/AppShell";
import NativeDatePickerActivator from "@/components/ui/NativeDatePickerActivator";

export const metadata: Metadata = {
  title: "着急信息",
  description: "一站式装修公司数字化管理平台",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <NativeDatePickerActivator />
        <QueryProvider>
          <AppShell>{children}</AppShell>
        </QueryProvider>
      </body>
    </html>
  );
}
