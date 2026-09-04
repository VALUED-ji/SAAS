"use client";

import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";
import DataPagination from "@/components/ui/DataPagination";
import ThinScrollArea from "@/components/ui/ThinScrollArea";
import styles from "./SystemResourceTable.module.css";

type Alignment = "left" | "center" | "right";

const alignmentClass = (alignment: Alignment) => {
  if (alignment === "center") return styles.center;
  if (alignment === "right") return styles.right;
  return undefined;
};

function Panel({ className, ...props }: ComponentPropsWithoutRef<"section">) {
  return <section data-system-resource-panel className={cn(styles.panel, className)} {...props} />;
}

type ScrollProps = {
  children: ReactNode;
  className?: string;
  scrollClassName?: string;
};

function Scroll({ children, className, scrollClassName }: ScrollProps) {
  return (
    <ThinScrollArea className={cn(styles.scroll, className)} scrollClassName={cn("h-full overflow-auto", scrollClassName)}>
      {children}
    </ThinScrollArea>
  );
}

type EmptyStateProps = {
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
};

function EmptyState({ children, className, icon }: EmptyStateProps) {
  return (
    <div className={cn(styles.emptyState, className)}>
      {icon && <span className={styles.emptyIcon}>{icon}</span>}
      <p className={styles.emptyTitle}>{children}</p>
    </div>
  );
}

type TableProps = ComponentPropsWithoutRef<"table"> & {
  minWidth?: number;
  fixed?: boolean;
};

function Table({ className, minWidth = 1700, fixed = false, style, ...props }: TableProps) {
  const tableStyle = {
    ...style,
    "--resource-table-min-width": `${minWidth}px`,
    "--resource-table-layout": fixed ? "fixed" : "auto",
  } as CSSProperties;

  return <table data-system-resource-table className={cn(styles.table, className)} style={tableStyle} {...props} />;
}

type HeaderCellProps = ComponentPropsWithoutRef<"th"> & {
  align?: Alignment;
};

function HeaderCell({ align = "left", className, ...props }: HeaderCellProps) {
  return <th className={cn(styles.headerCell, alignmentClass(align), className)} {...props} />;
}

type RowProps = ComponentPropsWithoutRef<"tr"> & {
  interactive?: boolean;
  opening?: boolean;
};

function Row({ interactive = true, opening = false, className, ...props }: RowProps) {
  return <tr className={cn(styles.row, !interactive && styles.rowStatic, opening && styles.rowOpening, className)} {...props} />;
}

type CellProps = ComponentPropsWithoutRef<"td"> & {
  align?: Alignment;
  emphasis?: boolean;
  index?: boolean;
};

function Cell({ align = "left", emphasis = false, index = false, className, ...props }: CellProps) {
  return (
    <td
      className={cn(styles.cell, alignmentClass(align), emphasis && styles.emphasis, index && styles.index, className)}
      {...props}
    />
  );
}

function Pagination({ className, ...props }: ComponentPropsWithoutRef<typeof DataPagination>) {
  return <DataPagination className={cn(styles.pagination, className)} {...props} />;
}

export const SystemResourceTable = {
  Panel,
  Scroll,
  EmptyState,
  Table,
  HeaderCell,
  Row,
  Cell,
  Pagination,
};
