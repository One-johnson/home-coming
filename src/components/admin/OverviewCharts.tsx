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

const CHART = {
  gold: "#b8860b",
  goldLight: "#d4af37",
  forest: "#1b4332",
  forestLight: "#2d6a4f",
  stone: "#6b6358",
  amber: "#c0782a",
  red: "#c0392b",
  muted: "#e8e0d4",
  ink: "#0a0a0a",
};

const STATUS_COLORS: Record<string, string> = {
  Paid: CHART.forest,
  Pending: CHART.amber,
  Failed: CHART.red,
  "Mock paid": CHART.goldLight,
  Stub: CHART.stone,
  Sent: CHART.forest,
};

const PIE_PALETTE = [
  CHART.gold,
  CHART.forest,
  CHART.stone,
  CHART.goldLight,
  CHART.forestLight,
  CHART.amber,
];

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
    stub: number;
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
        { name: "Stub", value: emails.stub },
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
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Registrations · last 7 days
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!hasTrend ? (
                <EmptyChart message="No registrations in the last 7 days" />
              ) : (
                <div className="h-[240px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={registrations.last7Days}
                      margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke={CHART.muted}
                      />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: CHART.stone, fontSize: 12 }}
                      />
                      <YAxis
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: CHART.stone, fontSize: 12 }}
                        width={32}
                      />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(184,134,11,0.08)" }} />
                      <Bar
                        dataKey="count"
                        name="Registrations"
                        fill={CHART.gold}
                        radius={[6, 6, 0, 0]}
                        maxBarSize={40}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Payment status</CardTitle>
            </CardHeader>
            <CardContent>
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
                        strokeWidth={0}
                      >
                        {statusData.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={STATUS_COLORS[entry.name] ?? CHART.gold}
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                      <Legend
                        verticalAlign="bottom"
                        height={28}
                        formatter={(value) => (
                          <span className="text-xs text-muted-foreground">
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
                <span className="font-semibold tabular-nums text-ink">
                  {registrations.revenue.toLocaleString()}
                </span>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">By region</CardTitle>
            </CardHeader>
            <CardContent>
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
                        stroke={CHART.muted}
                      />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: CHART.stone, fontSize: 12 }}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        width={88}
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: CHART.stone, fontSize: 11 }}
                      />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(27,67,50,0.06)" }} />
                      <Bar
                        dataKey="value"
                        name="Registrations"
                        fill={CHART.forest}
                        radius={[0, 6, 6, 0]}
                        maxBarSize={22}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Paid by gateway</CardTitle>
            </CardHeader>
            <CardContent>
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
                        strokeWidth={0}
                      >
                        {gatewayData.map((entry, i) => (
                          <Cell
                            key={entry.name}
                            fill={PIE_PALETTE[i % PIE_PALETTE.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                      <Legend
                        verticalAlign="bottom"
                        height={28}
                        formatter={(value) => (
                          <span className="text-xs text-muted-foreground">
                            {value}
                          </span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {(showAccommodation || showEmails) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {showAccommodation && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Housing occupancy</CardTitle>
              </CardHeader>
              <CardContent>
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
                          stroke={CHART.muted}
                        />
                        <XAxis
                          dataKey="name"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: CHART.stone, fontSize: 12 }}
                        />
                        <YAxis
                          allowDecimals={false}
                          tickLine={false}
                          axisLine={false}
                          tick={{ fill: CHART.stone, fontSize: 12 }}
                          width={32}
                        />
                        <Tooltip content={<ChartTooltip />} />
                        <Legend
                          formatter={(value) => (
                            <span className="text-xs text-muted-foreground">
                              {value}
                            </span>
                          )}
                        />
                        <Bar
                          dataKey="Booked"
                          stackId="housing"
                          fill={CHART.gold}
                          radius={[0, 0, 0, 0]}
                          maxBarSize={48}
                        />
                        <Bar
                          dataKey="Remaining"
                          stackId="housing"
                          fill={CHART.muted}
                          radius={[6, 6, 0, 0]}
                          maxBarSize={48}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                {bookings.total > 0 && (
                  <p className="mt-1 text-center text-sm text-muted-foreground">
                    Bookings: {bookings.paid} paid · {bookings.pending} pending
                    · ${bookings.revenue.toLocaleString()} revenue
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {showAccommodation && bookingStatusData.length > 0 && !showEmails && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Booking payment status</CardTitle>
              </CardHeader>
              <CardContent>
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
                        strokeWidth={0}
                      >
                        {bookingStatusData.map((entry) => (
                          <Cell
                            key={entry.name}
                            fill={STATUS_COLORS[entry.name] ?? CHART.gold}
                          />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                      <Legend
                        verticalAlign="bottom"
                        height={28}
                        formatter={(value) => (
                          <span className="text-xs text-muted-foreground">
                            {value}
                          </span>
                        )}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {showEmails && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Email delivery</CardTitle>
              </CardHeader>
              <CardContent>
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
                          strokeWidth={0}
                        >
                          {emailData.map((entry) => (
                            <Cell
                              key={entry.name}
                              fill={STATUS_COLORS[entry.name] ?? CHART.gold}
                            />
                          ))}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                        <Legend
                          verticalAlign="bottom"
                          height={28}
                          formatter={(value) => (
                            <span className="text-xs text-muted-foreground">
                              {value}
                            </span>
                          )}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
