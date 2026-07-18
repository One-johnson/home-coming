"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ADMIN_CHART,
  ADMIN_PIE_PALETTE,
  ADMIN_STATUS_CHART,
} from "@/lib/adminColors";

type OverviewChartsProps = {
  registrations: {
    paid: number;
    pending: number;
    failed: number;
    revenue: number;
    regionBreakdown: Record<string, number>;
    gatewayBreakdown: Record<string, number>;
    last7Days: { label: string; count: number }[];
  };
  bookings: {
    total: number;
    paid: number;
    pending: number;
    revenue: number;
  };
  housing: {
    type: string;
    capacityLimit: number;
    booked: number;
    remaining: number;
  }[];
  emails?: {
    pending: number;
    sent: number;
    failed: number;
  };
  showRegistrations: boolean;
  showAccommodation: boolean;
  showEmails: boolean;
};

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2 text-xs shadow-elevate">
      {label ? <p className="mb-1 font-medium text-ink">{label}</p> : null}
      {payload.map((entry, i) => (
        <p key={i} className="text-muted-foreground">
          <span style={{ color: entry.color }}>{entry.name}</span>:{" "}
          <span className="font-medium tabular-nums text-ink">
            {entry.value?.toLocaleString()}
          </span>
        </p>
      ))}
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function ChartCard({
  title,
  accent,
  children,
  footer,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="h-1 w-full" style={{ backgroundColor: accent }} />
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {children}
        {footer}
      </CardContent>
    </Card>
  );
}

export function OverviewCharts({
  registrations,
  bookings,
  housing,
  emails,
  showRegistrations,
  showAccommodation,
  showEmails,
}: OverviewChartsProps) {
  const statusData = [
    { name: "Paid", value: registrations.paid },
    { name: "Pending", value: registrations.pending },
    { name: "Failed", value: registrations.failed },
  ].filter((d) => d.value > 0);

  const regionData = Object.entries(registrations.regionBreakdown)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const gatewayData = Object.entries(registrations.gatewayBreakdown).map(
    ([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
    }),
  );

  const housingData = housing.map((h) => ({
    name: h.type.charAt(0).toUpperCase() + h.type.slice(1),
    Booked: h.booked,
    Remaining: h.remaining,
  }));

  const emailData = emails
    ? [
        { name: "Pending", value: emails.pending },
        { name: "Sent", value: emails.sent },
        { name: "Failed", value: emails.failed },
      ].filter((d) => d.value > 0)
    : [];

  const bookingStatusData = [
    { name: "Paid", value: bookings.paid },
    { name: "Pending", value: bookings.pending },
  ].filter((d) => d.value > 0);

  const hasTrend = registrations.last7Days.some((d) => d.count > 0);

  return (
    <div className="space-y-4">
      {showRegistrations && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard
            title="Registrations · last 7 days"
            accent={ADMIN_CHART.gold}
          >
            {!hasTrend ? (
              <EmptyChart message="No registrations in the last 7 days" />
            ) : (
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={registrations.last7Days}
                    margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="regBar" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor={ADMIN_CHART.goldLight}
                          stopOpacity={1}
                        />
                        <stop
                          offset="100%"
                          stopColor={ADMIN_CHART.gold}
                          stopOpacity={1}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={ADMIN_CHART.grid}
                    />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: ADMIN_CHART.stone, fontSize: 12 }}
                    />
                    <YAxis
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: ADMIN_CHART.stone, fontSize: 12 }}
                      width={32}
                    />
                    <Tooltip
                      content={<ChartTooltip />}
                      cursor={{ fill: "rgba(184,134,11,0.1)" }}
                    />
                    <Bar
                      dataKey="count"
                      name="Registrations"
                      fill="url(#regBar)"
                      radius={[6, 6, 0, 0]}
                      maxBarSize={40}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>

          <ChartCard title="Payment status" accent={ADMIN_CHART.emerald}>
            {statusData.length === 0 ? (
              <EmptyChart message="No payment data yet" />
            ) : (
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={88}
                      paddingAngle={3}
                      strokeWidth={2}
                      stroke="#fff"
                    >
                      {statusData.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={
                            ADMIN_STATUS_CHART[entry.name] ?? ADMIN_CHART.gold
                          }
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend
                      verticalAlign="bottom"
                      height={28}
                      formatter={(value) => (
                        <span className="text-xs font-medium text-ink/80">
                          {value}
                        </span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="mt-1 text-center text-sm text-muted-foreground">
              Revenue (paid):{" "}
              <span className="font-semibold tabular-nums text-emerald-700">
                {registrations.revenue.toLocaleString()}
              </span>
            </p>
          </ChartCard>

          <ChartCard title="By region" accent={ADMIN_CHART.forest}>
            {regionData.length === 0 ? (
              <EmptyChart message="No region breakdown yet" />
            ) : (
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={regionData}
                    margin={{ top: 4, right: 12, left: 8, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      stroke={ADMIN_CHART.grid}
                    />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: ADMIN_CHART.stone, fontSize: 12 }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={88}
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: ADMIN_CHART.stone, fontSize: 11 }}
                    />
                    <Tooltip
                      content={<ChartTooltip />}
                      cursor={{ fill: "rgba(27,67,50,0.08)" }}
                    />
                    <Bar
                      dataKey="value"
                      name="Registrations"
                      radius={[0, 6, 6, 0]}
                      maxBarSize={22}
                    >
                      {regionData.map((_, i) => (
                        <Cell
                          key={i}
                          fill={ADMIN_PIE_PALETTE[i % ADMIN_PIE_PALETTE.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>

          <ChartCard title="Paid by gateway" accent={ADMIN_CHART.violet}>
            {gatewayData.length === 0 ? (
              <EmptyChart message="No paid gateway data yet" />
            ) : (
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={gatewayData}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={88}
                      paddingAngle={2}
                      strokeWidth={2}
                      stroke="#fff"
                    >
                      {gatewayData.map((entry, i) => (
                        <Cell
                          key={entry.name}
                          fill={ADMIN_PIE_PALETTE[i % ADMIN_PIE_PALETTE.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend
                      verticalAlign="bottom"
                      height={28}
                      formatter={(value) => (
                        <span className="text-xs font-medium text-ink/80">
                          {value}
                        </span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>
        </div>
      )}

      {(showAccommodation || showEmails) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {showAccommodation && (
            <ChartCard title="Housing occupancy" accent={ADMIN_CHART.amber}>
              {housingData.length === 0 ? (
                <EmptyChart message="No housing inventory yet" />
              ) : (
                <div className="h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={housingData}
                      margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke={ADMIN_CHART.grid}
                      />
                      <XAxis
                        dataKey="name"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: ADMIN_CHART.stone, fontSize: 12 }}
                      />
                      <YAxis
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: ADMIN_CHART.stone, fontSize: 12 }}
                        width={32}
                      />
                      <Tooltip content={<ChartTooltip />} />
                      <Legend
                        formatter={(value) => (
                          <span className="text-xs font-medium text-ink/80">
                            {value}
                          </span>
                        )}
                      />
                      <Bar
                        dataKey="Booked"
                        stackId="housing"
                        fill={ADMIN_CHART.amber}
                        maxBarSize={48}
                      />
                      <Bar
                        dataKey="Remaining"
                        stackId="housing"
                        fill={ADMIN_CHART.forestSoft}
                        radius={[6, 6, 0, 0]}
                        maxBarSize={48}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {bookings.total > 0 && (
                <p className="mt-1 text-center text-sm text-muted-foreground">
                  Bookings:{" "}
                  <span className="font-medium text-emerald-700">
                    {bookings.paid} paid
                  </span>{" "}
                  ·{" "}
                  <span className="font-medium text-amber-700">
                    {bookings.pending} pending
                  </span>{" "}
                  · ${bookings.revenue.toLocaleString()} revenue
                </p>
              )}
            </ChartCard>
          )}

          {showAccommodation && bookingStatusData.length > 0 && !showEmails && (
            <ChartCard
              title="Booking payment status"
              accent={ADMIN_CHART.emerald}
            >
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={bookingStatusData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={88}
                      paddingAngle={3}
                      strokeWidth={2}
                      stroke="#fff"
                    >
                      {bookingStatusData.map((entry) => (
                        <Cell
                          key={entry.name}
                          fill={
                            ADMIN_STATUS_CHART[entry.name] ?? ADMIN_CHART.gold
                          }
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                    <Legend
                      verticalAlign="bottom"
                      height={28}
                      formatter={(value) => (
                        <span className="text-xs font-medium text-ink/80">
                          {value}
                        </span>
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          )}

          {showEmails && (
            <ChartCard title="Email delivery" accent={ADMIN_CHART.sky}>
              {emailData.length === 0 ? (
                <EmptyChart message="No email logs yet" />
              ) : (
                <div className="h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={emailData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={58}
                        outerRadius={88}
                        paddingAngle={3}
                        strokeWidth={2}
                        stroke="#fff"
                      >
                        {emailData.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={
                              ADMIN_STATUS_CHART[entry.name] ?? ADMIN_CHART.gold
                            }
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                      <Legend
                        verticalAlign="bottom"
                        height={28}
                        formatter={(value) => (
                          <span className="text-xs font-medium text-ink/80">
                            {value}
                          </span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </ChartCard>
          )}
        </div>
      )}
    </div>
  );
}
