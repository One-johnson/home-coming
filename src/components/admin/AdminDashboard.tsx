"use client";

import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import { LinkButton as Button } from "@/components/ui/app-button";
import { DataTable } from "@/components/ui/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  bookingColumns,
  emailLogColumns,
  registrationColumns,
} from "@/components/admin/columns";
import { GalleryManager } from "@/components/admin/GalleryManager";
import { isConvexConfigured } from "@/lib/convex-config";

function AdminDashboardInner() {
  const user = useQuery(api.users.currentUser);
  const registrations = useQuery(api.registrations.list);
  const bookings = useQuery(api.housing.listBookings);
  const faqs = useQuery(api.content.listFaqs);
  const stats = useQuery(api.content.listStats);
  const announcements = useQuery(api.content.listAnnouncements);
  const emailLogs = useQuery(api.emails.listEmailLogs);
  const about = useQuery(api.content.getAbout);

  const seedData = useMutation(api.seed.seed);
  const upsertFaq = useMutation(api.content.upsertFaq);
  const upsertStat = useMutation(api.content.upsertStat);
  const upsertAnnouncement = useMutation(api.content.upsertAnnouncement);
  const upsertAbout = useMutation(api.content.upsertAbout);
  const { signIn, signOut } = useAuthActions();

  const [tab, setTab] = useState("overview");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");

  const [faqForm, setFaqForm] = useState({
    category: "Registration",
    question: "",
    answer: "",
    order: 1,
  });

  const [statForm, setStatForm] = useState({ label: "", value: "", order: 1 });
  const [announcementForm, setAnnouncementForm] = useState({
    title: "",
    body: "",
    active: true,
  });

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    try {
      await signIn("password", { email, password, flow: "signIn" });
      toast.success("Signed in successfully");
    } catch {
      setAuthError("Sign in failed. Ensure your admin account exists.");
      toast.error("Sign in failed");
    }
  };

  const exportCsv = (rows: Record<string, unknown>[], filename: string) => {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(","),
      ...rows.map((row) =>
        headers.map((h) => JSON.stringify(row[h] ?? "")).join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const registrationRows = useMemo(() => registrations ?? [], [registrations]);
  const bookingRows = useMemo(() => bookings ?? [], [bookings]);
  const emailRows = useMemo(() => emailLogs ?? [], [emailLogs]);

  if (user === undefined) {
    return <p className="text-muted-foreground">Loading...</p>;
  }

  if (!user) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle>Admin Sign In</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Sign in with your administrator credentials.
          </p>
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="admin-email">Email</Label>
              <Input
                id="admin-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="admin-password">Password</Label>
              <Input
                id="admin-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {authError && (
              <Alert variant="destructive">
                <AlertDescription>{authError}</AlertDescription>
              </Alert>
            )}
            <Button type="submit" className="w-full">
              Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">Admin Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as {user.email ?? "admin"} · Role: {user.role ?? "none"}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => {
            signOut();
            toast.info("Signed out");
          }}
        >
          Sign Out
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-6 flex flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="registrations">Registrations</TabsTrigger>
          <TabsTrigger value="bookings">Bookings</TabsTrigger>
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="galleries">Galleries</TabsTrigger>
          <TabsTrigger value="emails">Emails</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="pt-6">
                <p className="text-3xl font-bold text-primary">
                  {registrations?.length ?? 0}
                </p>
                <p className="text-sm text-muted-foreground">Registrations</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-3xl font-bold text-primary">
                  {bookings?.length ?? 0}
                </p>
                <p className="text-sm text-muted-foreground">Housing Bookings</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-3xl font-bold text-primary">
                  {faqs?.length ?? 0}
                </p>
                <p className="text-sm text-muted-foreground">FAQs</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <p className="text-3xl font-bold text-primary">
                  {emailLogs?.length ?? 0}
                </p>
                <p className="text-sm text-muted-foreground">Email Logs</p>
              </CardContent>
            </Card>
          </div>
          <Button
            variant="secondary"
            className="mt-6"
            onClick={async () => {
              try {
                await seedData();
                toast.success("Content seeded successfully");
              } catch {
                toast.error("Failed to seed content");
              }
            }}
          >
            Seed / Refresh Default Content
          </Button>
        </TabsContent>

        <TabsContent value="registrations">
          <div className="mb-4 flex justify-end">
            <Button
              variant="outline"
              onClick={() => {
                exportCsv(
                  registrationRows.map((r) => ({
                    reference: r.referenceNumber ?? "",
                    id: r._id,
                    type: r.type,
                    email: r.email,
                    phone: r.phone,
                    region: r.region,
                    tickets: r.ticketQuantity,
                    total: r.totalAmount,
                    currency: r.currency,
                    status: r.paymentStatus,
                    createdAt: new Date(r.createdAt).toISOString(),
                  })),
                  "registrations.csv",
                );
                toast.success("Registrations exported");
              }}
            >
              Export CSV
            </Button>
          </div>
          <DataTable
            columns={registrationColumns}
            data={registrationRows}
            searchKey="email"
            searchPlaceholder="Search by email..."
          />
        </TabsContent>

        <TabsContent value="bookings">
          <div className="mb-4 flex justify-end">
            <Button
              variant="outline"
              onClick={() => {
                exportCsv(
                  bookingRows.map((b) => ({
                    reference: b.referenceNumber ?? "",
                    id: b._id,
                    type: b.housingType,
                    guest: b.guestName,
                    email: b.guestEmail,
                    checkIn: b.checkIn,
                    checkOut: b.checkOut,
                    total: b.totalAmount,
                    status: b.paymentStatus,
                  })),
                  "housing-bookings.csv",
                );
                toast.success("Bookings exported");
              }}
            >
              Export CSV
            </Button>
          </div>
          <DataTable
            columns={bookingColumns}
            data={bookingRows}
            searchKey="guestName"
            searchPlaceholder="Search by guest..."
          />
        </TabsContent>

        <TabsContent value="content">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Add FAQ</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  className="space-y-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await upsertFaq(faqForm);
                      setFaqForm({
                        category: "Registration",
                        question: "",
                        answer: "",
                        order: 1,
                      });
                      toast.success("FAQ saved");
                    } catch {
                      toast.error("Failed to save FAQ");
                    }
                  }}
                >
                  <Input
                    placeholder="Category"
                    value={faqForm.category}
                    onChange={(e) =>
                      setFaqForm({ ...faqForm, category: e.target.value })
                    }
                  />
                  <Input
                    placeholder="Question"
                    value={faqForm.question}
                    onChange={(e) =>
                      setFaqForm({ ...faqForm, question: e.target.value })
                    }
                  />
                  <Textarea
                    placeholder="Answer"
                    value={faqForm.answer}
                    onChange={(e) =>
                      setFaqForm({ ...faqForm, answer: e.target.value })
                    }
                  />
                  <Button type="submit">Save FAQ</Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Update Stat</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  className="space-y-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await upsertStat(statForm);
                      toast.success("Stat saved");
                    } catch {
                      toast.error("Failed to save stat");
                    }
                  }}
                >
                  <Input
                    placeholder="Label"
                    value={statForm.label}
                    onChange={(e) =>
                      setStatForm({ ...statForm, label: e.target.value })
                    }
                  />
                  <Input
                    placeholder="Value"
                    value={statForm.value}
                    onChange={(e) =>
                      setStatForm({ ...statForm, value: e.target.value })
                    }
                  />
                  <Button type="submit">Save Stat</Button>
                </form>
                <div className="mt-4 space-y-1 text-sm text-muted-foreground">
                  {(stats ?? []).map((stat) => (
                    <p key={stat._id}>
                      {stat.label}: <strong>{stat.value}</strong>
                    </p>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Announcement</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  className="space-y-3"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await upsertAnnouncement(announcementForm);
                      toast.success("Announcement saved");
                    } catch {
                      toast.error("Failed to save announcement");
                    }
                  }}
                >
                  <Input
                    placeholder="Title"
                    value={announcementForm.title}
                    onChange={(e) =>
                      setAnnouncementForm({
                        ...announcementForm,
                        title: e.target.value,
                      })
                    }
                  />
                  <Textarea
                    placeholder="Body"
                    value={announcementForm.body}
                    onChange={(e) =>
                      setAnnouncementForm({
                        ...announcementForm,
                        body: e.target.value,
                      })
                    }
                  />
                  <Button type="submit">Save Announcement</Button>
                </form>
                <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                  {(announcements ?? []).map((a) => (
                    <p key={a._id}>
                      <strong>{a.title}</strong>: {a.body}
                    </p>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>About Page</CardTitle>
              </CardHeader>
              <CardContent>
                {about && (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        await upsertAbout({
                          history: about.history,
                          purpose: about.purpose,
                          vision: about.vision,
                          impact: about.impact,
                          firstLadyMessage: about.firstLadyMessage,
                        });
                        toast.success("About page updated");
                      } catch {
                        toast.error("Failed to update about page");
                      }
                    }}
                  >
                    Touch Updated Timestamp
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="galleries">
          <GalleryManager />
        </TabsContent>

        <TabsContent value="emails">
          <DataTable columns={emailLogColumns} data={emailRows} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function AdminDashboard() {
  if (!isConvexConfigured()) {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-center text-sm text-amber-900">
        Admin dashboard requires Convex. Run{" "}
        <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">
          npx convex dev
        </code>{" "}
        to connect.
      </p>
    );
  }
  return <AdminDashboardInner />;
}
