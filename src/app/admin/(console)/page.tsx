"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowUpRight,
  BedDouble,
  ClipboardList,
  Mail,
  Newspaper,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { OverviewCharts } from "@/components/admin/OverviewCharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAdminSession,
  useSessionArgs,
} from "@/components/admin/AdminSessionProvider";
import { ROLE_LABELS, canAccessArea } from "@/lib/adminRoles";
import { EVENT } from "@/lib/eventConfig";

export default function AdminOverviewPage() {
  const { user, sessionToken } = useAdminSession();
  const role = user?.role;
  const sessionArgs = useSessionArgs();
  const seedData = useMutation(api.seed.seed);
  const overview = useQuery(
    api.admin.getOverview,
    sessionArgs ? sessionArgs : "skip",
  );

  const canRegistration = canAccessArea(role, "registration");
  const canAccommodation = canAccessArea(role, "accommodation");
  const canContent = canAccessArea(role, "content");
  const canEmails = canAccessArea(role, "emails");
  const canSeed = canAccessArea(role, "seed");

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-border bg-gradient-to-br from-white via-white to-cream/80">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              Welcome back{user?.name ? `, ${user.name.split(" ")[0]}` : ""}
            </p>
            <h2 className="mt-1 font-display text-3xl font-normal tracking-tight">
              {EVENT.name}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {EVENT.dates} · {EVENT.location}
              {role ? ` · ${ROLE_LABELS[role]}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href="/admin/profile" />}
            >
              <UserRound className="size-4" />
              Profile
            </Button>
            {canRegistration && (
              <Button
                size="sm"
                nativeButton={false}
                render={<Link href="/admin/registrations" />}
              >
                View registrations
                <ArrowUpRight className="size-4" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {!overview ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-72 rounded-xl" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {canRegistration && (
              <Link href="/admin/registrations">
                <Card className="h-full transition-colors hover:border-gold/40">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Registrations
                    </CardTitle>
                    <ClipboardList className="size-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-semibold tabular-nums text-ink">
                      {overview.registrations.total}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {overview.registrations.paid} paid ·{" "}
                      {overview.registrations.pending} pending
                    </p>
                  </CardContent>
                </Card>
              </Link>
            )}
            {canAccommodation && (
              <Link href="/admin/bookings">
                <Card className="h-full transition-colors hover:border-gold/40">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Bookings
                    </CardTitle>
                    <BedDouble className="size-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-semibold tabular-nums text-ink">
                      {overview.bookings.total}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      ${overview.bookings.revenue} revenue
                    </p>
                  </CardContent>
                </Card>
              </Link>
            )}
            {canContent && (
              <Link href="/admin/content">
                <Card className="h-full transition-colors hover:border-gold/40">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      FAQs
                    </CardTitle>
                    <Newspaper className="size-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-semibold tabular-nums text-ink">
                      {overview.content.faqs}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            )}
            {canEmails && (
              <Link href="/admin/emails">
                <Card className="h-full transition-colors hover:border-gold/40">
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">
                      Emails
                    </CardTitle>
                    <Mail className="size-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-semibold tabular-nums text-ink">
                      {overview.emails.total}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {overview.emails.stub} stub · {overview.emails.sent} sent
                    </p>
                  </CardContent>
                </Card>
              </Link>
            )}
          </div>

          <OverviewCharts
            registrations={overview.registrations}
            bookings={overview.bookings}
            housing={overview.housing}
            emails={overview.emails}
            showRegistrations={canRegistration}
            showAccommodation={canAccommodation}
            showEmails={canEmails}
          />

          {canAccommodation && overview.housing.length > 0 && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Housing inventory</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/admin/housing" />}
                >
                  Manage
                </Button>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                {overview.housing.map((h) => (
                  <div
                    key={h._id}
                    className="rounded-lg border border-border p-3"
                  >
                    <p className="font-medium capitalize">{h.type}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {h.booked}/{h.capacityLimit} booked · {h.remaining} left
                    </p>
                    <p className="text-sm tabular-nums">${h.pricePerStay}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {canSeed && sessionToken && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Content tools</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await seedData({ sessionToken });
                  toast.success("Default content seeded");
                } catch (err) {
                  toast.error(
                    err instanceof Error
                      ? err.message
                      : "Failed to seed content",
                  );
                }
              }}
            >
              Seed / refresh default content
            </Button>
            <p className="text-sm text-muted-foreground">
              Safe to re-run — only fills empty content collections.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
