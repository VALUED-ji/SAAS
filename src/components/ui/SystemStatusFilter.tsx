"use client";

import type { ReactNode } from "react";

export type SystemStatusFilterItem = {
  value: string;
  label: string;
  count: ReactNode;
};

type SystemStatusFilterProps = {
  items: SystemStatusFilterItem[];
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
};

export default function SystemStatusFilter({ items, value, onChange, ariaLabel }: SystemStatusFilterProps) {
  return (
    <div className="system-status-toolbar-row">
      <nav className="system-status-toolbar-scroller" aria-label={ariaLabel}>
        <div className="system-status-segmented">
          {items.map((item) => {
            const isActive = value === item.value;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => onChange(item.value)}
                className={`system-status-option ${isActive ? "system-status-option-active" : ""}`}
                aria-pressed={isActive}
              >
                <span>{item.label}</span>
                <span className="system-status-count">{item.count}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
