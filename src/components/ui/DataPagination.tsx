"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import SystemSelect from "@/components/ui/SystemSelect";

const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

function clampPage(page: number, totalPages: number) {
  return Math.min(Math.max(page, 1), Math.max(totalPages, 1));
}

function getPageNumbers(currentPage: number, totalPages: number) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  if (currentPage <= 3) [2, 3, 4].forEach((page) => pages.add(page));
  if (currentPage >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1].forEach((page) => pages.add(page));
  return Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
}

export function useDataPagination<T>(items: T[], resetKey = "", defaultPageSize = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(defaultPageSize);

  useEffect(() => {
    setPageSizeState(defaultPageSize);
    setPage(1);
  }, [defaultPageSize]);

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    setPage((current) => clampPage(current, totalPages));
  }, [totalPages]);

  const pageItems = useMemo(() => {
    const safePage = clampPage(page, totalPages);
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize, totalPages]);

  const setPageSize = (nextPageSize: number) => {
    setPageSizeState(nextPageSize);
    setPage(1);
  };

  return {
    page: clampPage(page, totalPages),
    pageSize,
    pageItems,
    totalPages,
    setPage,
    setPageSize,
  };
}

type DataPaginationProps = {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
  itemName?: string;
  className?: string;
  hidePageSizeSelect?: boolean;
};

export default function DataPagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  itemName = "条",
  className,
  hidePageSizeSelect = false,
}: DataPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = clampPage(page, totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);
  const pageNumbers = getPageNumbers(safePage, totalPages);

  return (
    <div className={cn("flex flex-col gap-3 border-t border-surface-200 bg-white px-4 py-3 text-sm text-surface-600 md:flex-row md:items-center md:justify-between", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-surface-500">
          本页 <b className="font-semibold text-surface-900">{start}-{end}</b>
        </span>
        <span className="text-surface-300">|</span>
        <span className="text-surface-500">
          共 <b className="font-semibold text-surface-900">{total}</b> {itemName}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {!hidePageSizeSelect && (
          <SystemSelect
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            menuPlacement="top"
            aria-label="每页显示数量"
            data-pagination-size
            className="h-8 min-w-[112px] rounded-lg border border-surface-200 bg-white px-2.5 text-xs font-medium text-surface-700 outline-none transition-colors hover:border-surface-300 focus-visible:border-primary-400 focus-visible:ring-2 focus-visible:ring-primary-100"
            menuClassName="!rounded-lg"
            optionClassName="!rounded-md"
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                每页 {option} {itemName}
              </option>
            ))}
          </SystemSelect>
        )}

        <div className="flex items-center gap-1" aria-label="分页导航">
          <button
            type="button"
            aria-label="上一页"
            title="上一页"
            data-pagination-control
            onClick={() => onPageChange(safePage - 1)}
            disabled={safePage <= 1}
            className="grid h-8 w-8 place-items-center rounded-lg border border-transparent bg-transparent text-surface-600 transition-colors hover:bg-surface-100 hover:text-surface-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          {pageNumbers.map((pageNumber, index) => {
            const previous = pageNumbers[index - 1];
            const showGap = previous && pageNumber - previous > 1;
            const isActive = safePage === pageNumber;
            return (
              <span key={pageNumber} className="inline-flex items-center gap-1">
                {showGap && (
                  <span className="grid h-8 w-8 place-items-center font-mono text-[13px] text-surface-400" aria-hidden="true">
                    ...
                  </span>
                )}
                <button
                  type="button"
                  aria-label={`第 ${pageNumber} 页`}
                  aria-current={isActive ? "page" : undefined}
                  data-pagination-control
                  data-pagination-page
                  data-active={isActive ? "true" : undefined}
                  onClick={() => onPageChange(pageNumber)}
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-lg border border-transparent font-mono text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-200",
                    isActive
                      ? "bg-primary-50 font-semibold text-primary-700"
                      : "bg-transparent text-surface-600 hover:bg-surface-100 hover:text-surface-900",
                  )}
                >
                  {pageNumber}
                </button>
              </span>
            );
          })}
          <button
            type="button"
            aria-label="下一页"
            title="下一页"
            data-pagination-control
            onClick={() => onPageChange(safePage + 1)}
            disabled={safePage >= totalPages}
            className="grid h-8 w-8 place-items-center rounded-lg border border-transparent bg-transparent text-surface-600 transition-colors hover:bg-surface-100 hover:text-surface-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
