import { readFileSync, writeFileSync } from "node:fs";

const path = "src/components/admin/agc/ArrivalPage.tsx";
let src = readFileSync(path, "utf8");
const N = "\r\n";

function edit(from, to, label, expected = 1) {
  const count = src.split(from).length - 1;
  if (count !== expected) {
    throw new Error(`${label}: expected ${expected} match(es), got ${count}`);
  }
  src = src.split(from).join(to);
}

// 1. Chevron icon for the pager.
edit(
  `  Search,${N}  ChevronRight,${N}`,
  `  Search,${N}  ChevronLeft,${N}  ChevronRight,${N}`,
  "imports",
);

// 2. Page size constant.
edit(
  `const STAT_FILTER_LABEL: Record<Exclude<DeskStatFilter, "all">, string> = {`,
  `/** Rows the sheet shows at a time — a screenful, never the whole roster. */${N}const SHEET_PAGE_SIZE = 25;${N}${N}const STAT_FILTER_LABEL: Record<Exclude<DeskStatFilter, "all">, string> = {`,
  "page-size constant",
);

// 3. Check-in status filter state.
edit(
  `  const [hubFilter, setHubFilter] = useState<string>("all");${N}  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);${N}`,
  `  const [hubFilter, setHubFilter] = useState<string>("all");${N}  /**${N}   * Check-in status as its own filter rather than only a stat tile: "not${N}   * checked in" is the door queue, which is what a volunteer looks for first.${N}   */${N}  const [checkInFilter, setCheckInFilter] = useState<${N}    "any" | "checked_in" | "not_checked_in"${N}  >("any");${N}  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);${N}`,
  "check-in filter state",
);

// 4. Apply the filter.
edit(
  `      if (genderFilter !== "any" && row.gender !== genderFilter) return false;${N}`,
  `      if (checkInFilter === "checked_in" && row.checkInStatus !== "checked_in")${N}        return false;${N}      if (checkInFilter === "not_checked_in" && row.checkInStatus !== "not_arrived")${N}        return false;${N}      if (genderFilter !== "any" && row.gender !== genderFilter) return false;${N}`,
  "check-in filter application",
);

edit(
  `  }, [baseRows, genderFilter, hubFilter, typeFilter, statFilter, issuesByRoom]);${N}`,
  `  }, [${N}    baseRows,${N}    checkInFilter,${N}    genderFilter,${N}    hubFilter,${N}    typeFilter,${N}    statFilter,${N}    issuesByRoom,${N}  ]);${N}`,
  "rosterRows deps",
);

// 5. Pagination state, before the selected-row lookup.
edit(
  `  const selectedRow = useMemo(${N}    () => rosterRows.find((row) => row.guestId === selectedGuestId) ?? null,${N}`,
  `  /**${N}   * The sheet pages rather than scrolls. Every row is a live-state row, so${N}   * hundreds of them re-render on each check-in write — on a desk tablet that${N}   * is the slowest thing on the page, and a volunteer reads one screenful at a${N}   * time. The page is keyed to the filters, so changing one starts the list${N}   * over at page 1 without a reset effect.${N}   */${N}  const sheetFilterKey = [${N}    search.trim(),${N}    statFilter,${N}    checkInFilter,${N}    genderFilter,${N}    hubFilter,${N}    typeFilter,${N}    deskLocation,${N}  ].join("|");${N}  const [sheetPage, setSheetPage] = useState({ key: "", page: 1 });${N}  const sheetPageCount = Math.max(1, Math.ceil(rosterRows.length / SHEET_PAGE_SIZE));${N}  // Clamped, not just stored: checking a delegate in shrinks the view under the${N}  // open page.${N}  const sheetPageNumber =${N}    sheetPage.key === sheetFilterKey${N}      ? Math.min(Math.max(1, sheetPage.page), sheetPageCount)${N}      : 1;${N}  const pageRows = useMemo(${N}    () =>${N}      rosterRows.slice(${N}        (sheetPageNumber - 1) * SHEET_PAGE_SIZE,${N}        sheetPageNumber * SHEET_PAGE_SIZE,${N}      ),${N}    [rosterRows, sheetPageNumber],${N}  );${N}  const goToSheetPage = (next: number) =>${N}    setSheetPage({${N}      key: sheetFilterKey,${N}      page: Math.min(Math.max(1, next), sheetPageCount),${N}    });${N}${N}  const selectedRow = useMemo(${N}    () => rosterRows.find((row) => row.guestId === selectedGuestId) ?? null,${N}`,
  "pagination state",
);

// 6. Render one page in both layouts (phone list + table).
edit(
  `rosterRows.map((row) => (`,
  `pageRows.map((row) => (`,
  "page rendering",
  2,
);

// 7. Colour-coded check-in pill in the table cell.
edit(
  `      <TableCell className={cn("text-sm font-medium", cell.className)}>${N}`,
  `      <TableCell className="text-sm font-medium">${N}`,
  "status cell wrapper",
);

edit(
  `        ) : (${N}          cell.label${N}        )}${N}`,
  `        ) : (${N}          <StatusBadge tone={cell.tone} title={cell.hint} className="text-[11px]">${N}            {cell.label}${N}          </StatusBadge>${N}        )}${N}`,
  "status pill",
);

// 8. checkInCell: label + tone + hover reason.
const oldCell = `function checkInCell(row: SearchRow): { label: string; className: string } {${N}  if (row.checkInStatus === "checked_in") {${N}    return { label: "Checked in", className: "text-emerald-700 dark:text-emerald-400" };${N}  }${N}  if (row.checkInStatus === "checked_out") {${N}    return { label: "Checked out", className: "text-muted-foreground" };${N}  }${N}  if (row.assignmentStatus !== "assigned") {${N}    return { label: "No room", className: "text-amber-800 dark:text-amber-400" };${N}  }${N}  const paid =${N}    row.paymentStatus === "confirmed" || row.poaStatus === "confirmed";${N}  if (!paid) {${N}    return { label: "Payment first", className: "text-amber-800 dark:text-amber-400" };${N}  }${N}  return { label: "Not yet", className: "text-slate-600 dark:text-slate-400" };${N}}`;

const newCell = `function checkInCell(row: SearchRow): {${N}  label: string;${N}  className: string;${N}  /** Pill colour: emerald done, amber blocked, slate waiting. */${N}  tone: StatusTone;${N}  /** Hover text saying why the row is in this state. */${N}  hint: string;${N}} {${N}  if (row.checkInStatus === "checked_in") {${N}    return {${N}      label: "Checked in",${N}      className: "text-emerald-700 dark:text-emerald-400",${N}      tone: "done",${N}      hint: "Arrived and checked in at the desk",${N}    };${N}  }${N}  if (row.checkInStatus === "checked_out") {${N}    return {${N}      label: "Checked out",${N}      className: "text-muted-foreground",${N}      tone: "waiting",${N}      hint: "Already departed — the record is kept",${N}    };${N}  }${N}  if (row.assignmentStatus !== "assigned") {${N}    return {${N}      label: "No room",${N}      className: "text-amber-800 dark:text-amber-400",${N}      tone: "blocked",${N}      hint: "No bed assigned — send them to accommodation",${N}    };${N}  }${N}  const paid =${N}    row.paymentStatus === "confirmed" || row.poaStatus === "confirmed";${N}  if (!paid) {${N}    return {${N}      label: "Payment first",${N}      className: "text-amber-800 dark:text-amber-400",${N}      tone: "blocked",${N}      hint: "Payment or POA must be cleared before check-in",${N}    };${N}  }${N}  return {${N}    label: "Ready — check in",${N}    className: "text-slate-600 dark:text-slate-400",${N}    tone: "done",${N}    hint: "Bed assigned and paid — ready to check in now",${N}  };${N}}`;

edit(oldCell, newCell, "checkInCell");

// 9. Check-in filter control, beside gender / hub / room type.
edit(
  `          <Select${N}            value={deskLocation}${N}`,
  `          <Select${N}            value={checkInFilter}${N}            onValueChange={(value) =>${N}              setCheckInFilter(${N}                (value ?? "any") as "any" | "checked_in" | "not_checked_in",${N}              )${N}            }${N}          >${N}            <SelectTrigger${N}              className="h-8 w-auto min-w-40 gap-1 rounded-full px-3 text-xs"${N}              aria-label="Filter by check-in status"${N}            >${N}              <SelectValue>${N}                {checkInFilter === "checked_in"${N}                  ? "Check-in: Checked in"${N}                  : checkInFilter === "not_checked_in"${N}                    ? "Check-in: Not checked in"${N}                    : "Check-in: Any"}${N}              </SelectValue>${N}            </SelectTrigger>${N}            <SelectContent>${N}              <SelectItem value="any">Check-in: Any</SelectI
