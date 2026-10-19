"use client";

import { useMemo, useState } from "react";
import {
  type ColumnDef, type RowSelectionState, type SortingState, type VisibilityState,
  flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3, Download, Search } from "lucide-react";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Props<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  loading?: boolean;
  searchPlaceholder?: string;
  pageSize?: number;
  selectable?: boolean;
  /** Rendered in the toolbar when rows are selected. */
  bulkActions?: (rows: T[]) => React.ReactNode;
  /** Filters (tabs, selects) rendered beside search. */
  filters?: React.ReactNode;
  exportName?: string;
  empty?: { title: string; description?: string; action?: React.ReactNode };
  /** Mobile card renderer; below `md` rows render as cards when provided. */
  renderCard?: (row: T) => React.ReactNode;
  onRowClick?: (row: T) => void;
  /** A stable id per row, so a selection survives the data refreshing. */
  getRowId?: (row: T) => string;
}

function toCsv<T>(rows: T[], cols: ColumnDef<T, unknown>[]) {
  const keys = cols.map((c) => ("accessorKey" in c ? String(c.accessorKey) : "")).filter(Boolean);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [keys.join(","), ...rows.map((r) => keys.map((k) => esc((r as Record<string, unknown>)[k])).join(","))].join("\n");
}

export function DataTable<T>({
  data, columns, loading, searchPlaceholder = "Search…", pageSize = 10, selectable, bulkActions,
  filters, exportName, empty, renderCard, onRowClick, getRowId,
}: Props<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [visibility, setVisibility] = useState<VisibilityState>({});
  const [selection, setSelection] = useState<RowSelectionState>({});

  const cols = useMemo<ColumnDef<T, unknown>[]>(() => {
    if (!selectable) return columns;
    return [{
      id: "_select",
      enableHiding: false,
      header: ({ table }) => (
        <input type="checkbox" aria-label="Select all" className="accent-[var(--primary)]"
          checked={table.getIsAllRowsSelected()} ref={(el) => { if (el) el.indeterminate = table.getIsSomeRowsSelected(); }} onChange={table.getToggleAllRowsSelectedHandler()} />
      ),
      cell: ({ row }) => (
        <input type="checkbox" aria-label="Select row" className="accent-[var(--primary)]"
          checked={row.getIsSelected()} onClick={(e) => e.stopPropagation()} onChange={row.getToggleSelectedHandler()} />
      ),
    }, ...columns];
  }, [columns, selectable]);

  const table = useReactTable({
    data, columns: cols, ...(getRowId ? { getRowId: (r: T) => getRowId(r) } : {}),
    state: { sorting, globalFilter, columnVisibility: visibility, rowSelection: selection },
    onSortingChange: setSorting, onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setVisibility, onRowSelectionChange: setSelection,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(), getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  const selected = table.getSelectedRowModel().rows.map((r) => r.original);
  const rows = table.getRowModel().rows;

  const exportCsv = () => {
    const blob = new Blob([toCsv(table.getFilteredRowModel().rows.map((r) => r.original), columns)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${exportName}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="rounded-[16px] border border-border bg-card shadow-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-divider p-3">
        <div className="relative min-w-48 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted" />
          <Input className="pl-8" placeholder={searchPlaceholder} value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} />
        </div>
        {filters}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {selected.length > 0 && bulkActions && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-background-2 px-2 py-1 text-sm">
              <span className="text-foreground-2">{selected.length} selected</span>
              {bulkActions(selected)}
            </div>
          )}
          <Dropdown.Root>
            <Dropdown.Trigger asChild><Button variant="secondary" size="sm"><Columns3 />Columns</Button></Dropdown.Trigger>
            <Dropdown.Portal>
              <Dropdown.Content align="end" className="z-50 min-w-44 rounded-xl border border-border bg-card p-1 shadow-card">
                {table.getAllLeafColumns().filter((c) => c.getCanHide()).map((c) => (
                  <Dropdown.CheckboxItem key={c.id} checked={c.getIsVisible()} onCheckedChange={(v) => c.toggleVisibility(!!v)}
                    onSelect={(e) => e.preventDefault()}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-background-2">
                    <Dropdown.ItemIndicator className="text-primary">✓</Dropdown.ItemIndicator>
                    <span className="data-[state=unchecked]:ml-4">{typeof c.columnDef.header === "string" ? c.columnDef.header : c.id}</span>
                  </Dropdown.CheckboxItem>
                ))}
              </Dropdown.Content>
            </Dropdown.Portal>
          </Dropdown.Root>
          {exportName && <Button variant="secondary" size="sm" onClick={exportCsv}><Download />Export</Button>}
        </div>
      </div>

      {loading ? (
        <div className="space-y-2 p-4">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : rows.length === 0 ? (
        <div className="p-4"><EmptyState {...(empty ?? { title: "Nothing here yet" })} /></div>
      ) : (
        <>
          <div className={cn("overflow-x-auto", renderCard && "hidden md:block")}>
            <table className="w-full text-sm">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-divider text-left text-xs uppercase tracking-wide text-muted">
                    {hg.headers.map((h) => {
                      const dir = h.column.getIsSorted();
                      return (
                        <th key={h.id} className="px-4 py-2.5 font-medium whitespace-nowrap">
                          {h.isPlaceholder ? null : h.column.getCanSort() ? (
                            <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={h.column.getToggleSortingHandler()}>
                              {flexRender(h.column.columnDef.header, h.getContext())}
                              {dir === "asc" ? <ArrowUp className="size-3" /> : dir === "desc" ? <ArrowDown className="size-3" /> : null}
                            </button>
                          ) : flexRender(h.column.columnDef.header, h.getContext())}
                        </th>
                      );
                    })}
                  </tr>
                ))}
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} onClick={() => onRowClick?.(row.original)}
                    className={cn("border-b border-divider last:border-0 hover:bg-background-2/60", onRowClick && "cursor-pointer", row.getIsSelected() && "bg-gold-soft/40")}>
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 align-middle">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {renderCard && <div className="space-y-3 p-3 md:hidden">{rows.map((r) => <div key={r.id}>{renderCard(r.original)}</div>)}</div>}
        </>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-divider px-4 py-2.5 text-sm text-foreground-2">
        <span>{table.getFilteredRowModel().rows.length} results</span>
        <div className="flex items-center gap-2">
          <span>Page {table.getState().pagination.pageIndex + 1} of {Math.max(table.getPageCount(), 1)}</span>
          <Button variant="ghost" size="icon" aria-label="Previous page" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}><ChevronLeft /></Button>
          <Button variant="ghost" size="icon" aria-label="Next page" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}><ChevronRight /></Button>
        </div>
      </div>
    </div>
  );
}
