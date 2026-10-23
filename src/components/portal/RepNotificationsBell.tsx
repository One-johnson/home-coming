"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import {
  BellIcon,
  CheckCheckIcon,
  ChevronRightIcon,
  EllipsisIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRepSession } from "@/components/portal/RepSessionProvider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  buildRepNotifications,
  dismissNotification,
  markNotificationsSeen,
  notificationPrefsKey,
  notificationSeenKey,
  parseNotificationPrefs,
  parseSeenIds,
  restoreDismissedNotifications,
  snoozeNotification,
  unseenNotifications,
  visibleNotifications,
} from "@/lib/repNotifications";
import type {
  NotificationPrefs,
  RepNotification,
  RepNotificationTab,
  RepNotificationTone,
} from "@/lib/repNotifications";
import type { RepBooking } from "@/lib/agcBookingTypes";

/**
 * Header bell. The feed is derived from the rep's own live data (holds about
 * to lapse, bounced receipts, published rooming, closing deadline) so nothing
 * has to be written server-side and nothing goes stale. "Seen" is remembered
 * per hub on the device.
 */

const TONE_DOT: Record<RepNotificationTone, string> = {
  danger: "bg-rose-500",
  warning: "bg-amber-500",
  info: "bg-sky-500",
  success: "bg-emerald-500",
};

type OverviewShape = {
  receiptsPending: number;
  awaitingPayment: number;
  deadline: number;
};

type PublishedRoom = { roomId: string; name: string };

export function RepNotificationsBell({
  onNavigate,
  className,
}: {
  onNavigate: (tab: RepNotificationTab, filter?: string) => void;
  className?: string;
}) {
  const { sessionToken, rep } = useRepSession();
  const bookings = useQuery(
    api.agcBookings.listRepBookings,
    sessionToken ? { sessionToken } : "skip",
  ) as RepBooking[] | undefined;
  const overview = useQuery(
    api.agcPortal.getRepOverview,
    sessionToken ? { sessionToken } : "skip",
  ) as OverviewShape | undefined;
  const rooms = useQuery(
    api.agcRoomAssignments.getRepRoomAssignments,
    sessionToken ? { sessionToken } : "skip",
  ) as PublishedRoom[] | undefined;

  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const username = rep?.username ?? "";
  const seenKey = username ? notificationSeenKey(username) : null;
  const prefsKey = username ? notificationPrefsKey(username) : null;
  const [seenIds, setSeenIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    const key = rep?.username ? notificationSeenKey(rep.username) : null;
    if (!key) return [];
    try {
      return parseSeenIds(window.localStorage.getItem(key));
    } catch {
      return [];
    }
  });
  // Dismissed and snoozed entries are remembered per hub on this device.
  const [prefs, setPrefs] = useState<NotificationPrefs>(() => {
    if (typeof window === "undefined") return { dismissed: [], snoozed: {} };
    const key = rep?.username ? notificationPrefsKey(rep.username) : null;
    if (!key) return { dismissed: [], snoozed: {} };
    try {
      return parseNotificationPrefs(window.localStorage.getItem(key));
    } catch {
      return { dismissed: [], snoozed: {} };
    }
  });

  const notifications = useMemo(
    () =>
      buildRepNotifications({
        bookings: bookings ?? [],
        receiptsPending: overview?.receiptsPending ?? 0,
        awaitingPayment: overview?.awaitingPayment ?? 0,
        deadline: overview?.deadline ?? null,
        publishedRooms: rooms ?? [],
        now,
      }),
    [bookings, overview, rooms, now],
  );

  // What the rep actually sees: dismissed entries never come back, snoozed
  // ones return when the snooze lapses.
  const visible = useMemo(
    () => visibleNotifications(notifications, prefs, now),
    [notifications, prefs, now],
  );
  const unseen = unseenNotifications(visible, seenIds);
  const loading = bookings === undefined && Boolean(sessionToken);

  const persistPrefs = (next: NotificationPrefs) => {
    setPrefs(next);
    if (!prefsKey) return;
    try {
      window.localStorage.setItem(prefsKey, JSON.stringify(next));
    } catch {
      // Private mode / full quota: the choice lasts this visit only.
    }
  };

  const dismiss = (item: RepNotification) => {
    const next = dismissNotification(prefs, item.id, Date.now());
    persistPrefs(next);
    toast("Notification dismissed", {
      description: item.title,
      action: {
        label: "Undo",
        onClick: () =>
          persistPrefs({
            dismissed: next.dismissed.filter((id) => id !== item.id),
            snoozed: next.snoozed,
          }),
      },
    });
  };

  const snooze = (item: RepNotification) => {
    persistPrefs(snoozeNotification(prefs, item.id, Date.now()));
    toast.success("Snoozed for 4 hours", { description: item.title });
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next || notifications.length === 0) return;
    // Opening the bell counts as reading it; the badge clears, the items stay.
    const merged = markNotificationsSeen(
      seenIds,
      visible.map((item) => item.id),
    );
    setSeenIds(merged);
    if (!seenKey) return;
    try {
      window.localStorage.setItem(seenKey, JSON.stringify(merged));
    } catch {
      // Private mode / full quota: the badge just reappears next visit.
    }
  };

  const openNotification = (item: RepNotification) => {
    setOpen(false);
    onNavigate(item.tab, item.filter);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        aria-label={
          unseen.length > 0
            ? `Notifications — ${unseen.length} unread`
            : "Notifications"
        }
        className={cn(
          "relative inline-flex size-9 items-center justify-center rounded-lg border border-border bg-white text-muted-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring max-md:size-10",
          className,
        )}
      >
        <BellIcon className="size-4" aria-hidden />
        {unseen.length > 0 && (
          <span className="absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] leading-4 font-semibold text-white">
            {unseen.length > 9 ? "9+" : unseen.length}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[22rem] max-w-[calc(100vw-1.5rem)] gap-0 p-0"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {loading ? (
            <Skeleton className="h-4 w-16" />
          ) : unseen.length > 0 ? (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
              {unseen.length} new
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <CheckCheckIcon className="size-3" /> All read
            </span>
          )}
        </div>

        <ul className="max-h-80 divide-y divide-border overflow-y-auto">
          {loading ? (
            <li className="space-y-2 p-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-full" />
            </li>
          ) : visible.length === 0 ? (
            <li className="px-4 py-8 text-center">
              <BellIcon className="mx-auto size-5 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium">Nothing needs you</p>
              <p className="text-xs text-muted-foreground">
                Holds, receipts and deadlines show up here as they arise.
              </p>
            </li>
          ) : (
            visible.map((item) => (
              <li
                key={item.id}
                className="flex items-start transition-colors hover:bg-muted/60"
              >
                <button
                  type="button"
                  onClick={() => openNotification(item)}
                  className="flex min-w-0 flex-1 items-start gap-2.5 py-2.5 pr-1 pl-3 text-left outline-none focus-visible:bg-muted/60"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1.5 size-2 shrink-0 rounded-full",
                      TONE_DOT[item.tone],
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">
                      {item.title}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                      {item.body}
                    </span>
                  </span>
                  <ChevronRightIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label={`Options for ${item.title}`}
                    className="mt-1.5 mr-1.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring max-md:size-9"
                  >
                    <EllipsisIcon className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-44">
                    <DropdownMenuItem onClick={() => snooze(item)}>
                      Snooze for 4 hours
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => dismiss(item)}
                    >
                      Dismiss
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))
          )}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          <span>Built from your hub&apos;s live bookings, receipts and rooming list.</span>
          {prefs.dismissed.length > 0 && (
            <button
              type="button"
              onClick={() => persistPrefs(restoreDismissedNotifications(prefs))}
              className="rounded font-medium text-foreground underline underline-offset-2 outline-none hover:text-foreground/80 focus-visible:ring-2 focus-visible:ring-ring"
            >
              Restore {prefs.dismissed.length} dismissed
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
