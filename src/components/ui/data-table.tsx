"use client";

import {
  type ColumnDef,
  type ColumnFiltersState,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  Download,
  Search,
  X,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { exportToCsv } from "@/lib/exportCsv";
import { cn } from "@/lib/utils";

export type FacetFilter = {
  columnId: string;
  title: string;
  options: { label: string; value: string }[];
};

type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchPlaceholder?: string;
  exportFilename?: string;
  exportRow?: (row: TData) => Record<string, unknown>;
  getRowId?: (row: TData) => string;
  facetFilters?: FacetFilter[];
  bulkActions?: (ctx: {
    selectedRows: TData[];
    clearSelection: () => void;
  }) => React.ReactNode;
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: TData) => void;
};

function SortHeader({
  label,
  sorted,
  onToggle,
}: {
  label: string;
  sorted: false | "asc" | "desc";
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="-ml-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-medium hover:bg-muted"
      onClick={onToggle}
    >
      {label}
      {sorted === "asc" ? (
        <ArrowUp className="size-3.5" />
      ) : sorted === "desc" ? (
        <ArrowDown className="size-3.5" />
      ) : (
        <ArrowUpDown className="size-3.5 opacity-40" />
      )}
    </button>
  );
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchPlaceholder = "Search...",
  exportFilename = "export.csv",
  exportRow,
  getRowId,
  facetFilters = [],
  bulkActions,
  isLoading = false,
  emptyMessage = "No results.",
  onRowClick,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [globalFilter, setGlobalFilter] = useState("");

  const tableColumns = useMemo<ColumnDef<TData, TValue>[]>(() => {
    const selectColumn: ColumnDef<TData, TValue> = {
      id: "select",
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllPageRowsSelected()}
          indeterminate={
            table.getIsSomePageRowsSelected() &&
            !table.getIsAllPageRowsSelected()
          }
          onCheckedChange={(value) =>
            table.toggleAllPageRowsSelected(value === true)
          }
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(value === true)}
          aria-label="Select row"
          onClick={(e) => e.stopPropagation()}
        />
      ),
    };

    const sortableColumns = columns.map((column) => {
      if (typeof column.header !== "string") return column;

      const label = column.header;
      return {
        ...column,
        header: ({
          column: col,
        }: {
          column: {
            getIsSorted: () => false | "asc" | "desc";
            toggleSorting: (desc?: boolean) => void;
          };
        }) => (
          <SortHeader
            label={label}
            sorted={col.getIsSorted()}
            onToggle={() => col.toggleSorting(col.getIsSorted() === "asc")}
          />
        ),
      } as ColumnDef<TData, TValue>;
    });

    return [selectColumn, ...sortableColumns];
  }, [columns]);

  const table = useReactTable({
    data,
    columns: tableColumns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
    },
    enableRowSelection: true,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    getRowId,
    initialState: { pagination: { pageSize: 10 } },
  });

  const handleExport = (onlySelected: boolean) => {
    const rows = onlySelected
      ? table.getFilteredSelectedRowModel().rows
      : table.getFilteredRowModel().rows;

    if (!rows.length) return;

    const payload = rows.map((row) => {
      if (exportRow) return exportRow(row.original);
      const record: Record<string, unknown> = {};
      row.getVisibleCells().forEach((cell) => {
        if (cell.column.id === "select") return;
        record[cell.column.id] = cell.getValue();
      });
      return record;
    });

    exportToCsv(payload, exportFilename);
  };

  const selectedRows = table
    .getFilteredSelectedRowModel()
    .rows.map((r) => r.original);
  const selectedCount = selectedRows.length;

  const clearSelection = () => setRowSelection({});

  const activeFacetCount = facetFilters.filter((f) => {
    const value = table.getColumn(f.columnId)?.getFilterValue();
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  }).length;

  return (
    <div className="w-full min-w-0 max-w-full space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full min-w-0 sm:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="h-9 pl-9"
          />
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {facetFilters.map((facet) => {
            const column = table.getColumn(facet.columnId);
            if (!column) return null;
            const filterValue = (column.getFilterValue() as string[]) ?? [];
            return (
              <DropdownMenu key={facet.columnId}>
                <DropdownMenuTrigger className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted">
                  {facet.title}
                  {filterValue.length > 0 && (
                    <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums">
                      {filterValue.length}
                    </span>
                  )}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel>{facet.title}</DropdownMenuLabel>
                    {facet.options.map((option) => {
                      const checked = filterValue.includes(option.value);
                      return (
                        <DropdownMenuCheckboxItem
                          key={option.value}
                          checked={checked}
                          onCheckedChange={(value) => {
                            const next = value
                              ? [...filterValue, option.value]
                              : filterValue.filter((v) => v !== option.value);
                            column.setFilterValue(
                              next.length ? next : undefined,
                            );
                          }}
                        >
                          <span className="flex items-center gap-2">
                            {checked && <Check className="size-3.5" />}
                            {option.label}
                          </span>
                        </DropdownMenuCheckboxItem>
                      );
                    })}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            );
          })}

          {activeFacetCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => {
                facetFilters.forEach((f) =>
                  table.getColumn(f.columnId)?.setFilterValue(undefined),
                );
              }}
            >
              <X className="size-4" />
              Clear filters
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-muted">
              <Columns3 className="size-4" />
              Columns
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                {table
                  .getAllColumns()
                  .filter((column) => column.getCanHide())
                  .map((column) => (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) =>
                        column.toggleVisibility(!!value)
                      }
                      className="capitalize"
                    >
                      {column.id}
                    </DropdownMenuCheckboxItem>
                  ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5"
            onClick={() => handleExport(false)}
            disabled={!table.getFilteredRowModel().rows.length}
          >
            <Download className="size-4" />
            Export CSV
          </Button>

          {selectedCount > 0 && (
            <Button
              variant="secondary"
              size="sm"
              className="h-9 gap-1.5"
              onClick={() => handleExport(true)}
            >
              <Download className="size-4" />
              Export selected ({selectedCount})
            </Button>
          )}
        </div>
      </div>

      {selectedCount > 0 && bulkActions && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium">{selectedCount} selected</span>
          <div className="h-4 w-px bg-border" />
          {bulkActions({ selectedRows, clearSelection })}
          <Button variant="ghost" size="sm" onClick={clearSelection}>
            Clear
          </Button>
        </div>
      )}

      <div className="min-w-0 overflow-hidden rounded-xl border bg-card">
        <div className="w-full max-w-full overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow
                  key={headerGroup.id}
                  className="bg-muted/40 hover:bg-muted/40"
                >
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className="h-11 whitespace-nowrap"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={`skeleton-${i}`}>
                    {tableColumns.map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-24" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    className={cn(
                      row.getIsSelected() && "bg-muted/50",
                      onRowClick && "cursor-pointer",
                    )}
                    onClick={() => onRowClick?.(row.original)}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="whitespace-nowrap">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={tableColumns.length}
                    className="h-28 text-center text-muted-foreground"
                  >
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {selectedCount > 0
            ? `${selectedCount} of ${table.getFilteredRowModel().rows.length} row(s) selected`
            : `${table.getFilteredRowModel().rows.length} row(s)`}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Rows</span>
            <Select
              value={String(table.getState().pagination.pageSize)}
              onValueChange={(value) => {
                if (value) table.setPageSize(Number(value));
              }}
            >
              <SelectTrigger className="h-8 w-[4.5rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 30, 50, 100].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-sm font-medium tabular-nums">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount() || 1}
          </p>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronsLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              <ChevronsRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
