// 待办中心分类图标组件模块
// 从 page.tsx 渐进拆出的纯 SVG 图标组件。

import type { SVGProps } from "react";

export type CategoryIconProps = SVGProps<SVGSVGElement>;

export function CategoryAllIcon(props: CategoryIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="4" y="3.5" width="16" height="17" rx="4" fill="currentColor" opacity="0.16" />
      <path d="M8 8.25h8M8 12h8M8 15.75h5.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M6.7 8.25h.05M6.7 12h.05M6.7 15.75h.05" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

export function CategoryNoticeIcon(props: CategoryIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M6.3 10.4A5.7 5.7 0 0 1 12 4.7a5.7 5.7 0 0 1 5.7 5.7v2.9l1.15 2.1a1.2 1.2 0 0 1-1.05 1.78H6.2a1.2 1.2 0 0 1-1.05-1.78l1.15-2.1v-2.9Z" fill="currentColor" opacity="0.18" />
      <path d="M8.15 10.55A3.85 3.85 0 0 1 12 6.7a3.85 3.85 0 0 1 3.85 3.85v3.05l.85 1.58H7.3l.85-1.58v-3.05Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9.85 18.05a2.25 2.25 0 0 0 4.3 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="17.5" cy="5.5" r="2.2" fill="currentColor" />
    </svg>
  );
}

export function CategoryMentionIcon(props: CategoryIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M4.5 7.8A4.3 4.3 0 0 1 8.8 3.5h6.4a4.3 4.3 0 0 1 4.3 4.3v3.95a4.3 4.3 0 0 1-4.3 4.3h-3.4l-4.15 3.15a.9.9 0 0 1-1.45-.72v-2.6a4.3 4.3 0 0 1-1.7-3.43V7.8Z" fill="currentColor" opacity="0.16" />
      <path d="M8.4 15.7v1.45l2.22-1.68a1.7 1.7 0 0 1 1.03-.35h3.55a2.45 2.45 0 0 0 2.45-2.45V7.8a2.45 2.45 0 0 0-2.45-2.45H8.8A2.45 2.45 0 0 0 6.35 7.8v4.65c0 .82.4 1.6 1.08 2.05.6.4.97.83.97 1.2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M13.9 11.1a1.9 1.9 0 1 1-.35-1.1v1.1a1.1 1.1 0 0 0 2.2 0A3.75 3.75 0 1 0 14.62 13.78" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CategoryDesignerIcon(props: CategoryIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M5.2 18.25c.55-3.05 3.15-5.2 6.8-5.2s6.25 2.15 6.8 5.2a1.5 1.5 0 0 1-1.48 1.75H6.68a1.5 1.5 0 0 1-1.48-1.75Z" fill="currentColor" opacity="0.16" />
      <circle cx="12" cy="8.1" r="3.65" fill="currentColor" opacity="0.16" />
      <path d="M8.35 8.1a3.65 3.65 0 1 0 7.3 0 3.65 3.65 0 0 0-7.3 0ZM5.45 19.15c.28-3.5 2.92-5.55 6.55-5.55 1.54 0 2.9.36 3.98 1.04" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
      <path d="m16.55 18.8 2.9-2.9a1.02 1.02 0 0 0-1.44-1.44l-2.9 2.9-.42 1.86 1.86-.42Z" fill="currentColor" />
    </svg>
  );
}

export function CategoryPaymentIcon(props: CategoryIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="4" y="5.2" width="16" height="13.6" rx="3.2" fill="currentColor" opacity="0.16" />
      <path d="M6.2 9.2h11.6M7.7 15.05h3.6" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" />
      <circle cx="15.2" cy="14.2" r="3.05" fill="currentColor" opacity="0.2" />
      <path d="M15.2 12.2v4M13.65 13.2c.25-.55.78-.9 1.55-.9.85 0 1.45.42 1.45 1.05 0 .78-.75.95-1.45.95s-1.45.22-1.45.95c0 .64.6 1.05 1.45 1.05.75 0 1.3-.34 1.57-.88" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function CategoryRefundIcon(props: CategoryIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <circle cx="12" cy="12.4" r="7.3" fill="currentColor" opacity="0.16" />
      <path d="M15.8 8.75h-4.45a3.5 3.5 0 1 0 0 7h3.95" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="m9.7 6.9-2.1 1.95 2.1 1.95M13 10.65v4M11.45 11.65c.25-.55.78-.9 1.55-.9.85 0 1.45.42 1.45 1.05 0 .78-.75.95-1.45.95s-1.45.22-1.45.95c0 .64.6 1.05 1.45 1.05.75 0 1.3-.34 1.57-.88" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CategoryChangeIcon(props: CategoryIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <rect x="5" y="4.5" width="14" height="15.5" rx="3.2" fill="currentColor" opacity="0.16" />
      <path d="M9.2 4h5.6a1.2 1.2 0 0 1 1.2 1.2v.45a1.2 1.2 0 0 1-1.2 1.2H9.2A1.2 1.2 0 0 1 8 5.65V5.2A1.2 1.2 0 0 1 9.2 4Z" fill="currentColor" />
      <path d="M8.6 11.3h6.8M15.4 11.3l-1.55-1.55M15.4 11.3l-1.55 1.55M15.4 15.7H8.6M8.6 15.7l1.55-1.55M8.6 15.7l1.55 1.55" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CategoryQuotationIcon(props: CategoryIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M5.2 5.4A2.4 2.4 0 0 1 7.6 3h7.1l4.1 4.1v11.5a2.4 2.4 0 0 1-2.4 2.4H7.6a2.4 2.4 0 0 1-2.4-2.4V5.4Z" fill="currentColor" opacity="0.16" />
      <path d="M14.7 3.35v3.1a1.25 1.25 0 0 0 1.25 1.25h3.1M8.5 10.2h6.8M8.5 13.4h3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.65 17.4h4.15M16.72 15.32v4.16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export function CategoryContractIcon(props: CategoryIconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M5.4 5.5A2.5 2.5 0 0 1 7.9 3h6.4l4.3 4.3v11.2a2.5 2.5 0 0 1-2.5 2.5H7.9a2.5 2.5 0 0 1-2.5-2.5v-13Z" fill="currentColor" opacity="0.16" />
      <path d="M14.3 3.35V6.6a1.3 1.3 0 0 0 1.3 1.3h3.15M8.7 10.9h6.6M8.7 14h4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="m13.9 17.05 1.35 1.35 2.85-3.05" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
