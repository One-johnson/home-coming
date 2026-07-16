"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { LinkButton as Button } from "@/components/ui/app-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  useAdminSession,
  useSessionArgs,
} from "@/components/admin/AdminSessionProvider";
import { canAccessArea } from "@/lib/adminRoles";

export default function AdminContentPage() {
  const { user, sessionToken } = useAdminSession();
  const sessionArgs = useSessionArgs();
  const allowed = canAccessArea(user?.role, "content");

  const faqs = useQuery(api.content.listFaqs, allowed ? {} : "skip");
  const stats = useQuery(api.content.listStats, allowed ? {} : "skip");
  const announcements = useQuery(
    api.content.listAnnouncementsAdmin,
    allowed && sessionArgs ? sessionArgs : "skip",
  );
  const about = useQuery(api.content.getAbout, allowed ? {} : "skip");

  const upsertFaq = useMutation(api.content.upsertFaq);
  const deleteFaq = useMutation(api.content.deleteFaq);
  const upsertStat = useMutation(api.content.upsertStat);
  const deleteStat = useMutation(api.content.deleteStat);
  const upsertAnnouncement = useMutation(api.content.upsertAnnouncement);
  const deleteAnnouncement = useMutation(api.content.deleteAnnouncement);
  const upsertAbout = useMutation(api.content.upsertAbout);

  const [faqForm, setFaqForm] = useState({
    category: "Registration",
    question: "",
    answer: "",
    order: 1,
  });
  const [editingFaq, setEditingFaq] = useState<Id<"faqs"> | null>(null);
  const [statForm, setStatForm] = useState({ label: "", value: "", order: 1 });
  const [editingStat, setEditingStat] = useState<Id<"stats"> | null>(null);
  const [announcementForm, setAnnouncementForm] = useState({
    title: "",
    body: "",
    active: true,
  });
  const [editingAnnouncement, setEditingAnnouncement] = useState<
    Id<"announcements"> | null
  >(null);
  const [aboutForm, setAboutForm] = useState({
    history: "",
    purpose: "",
    vision: "",
    impact: "",
    firstLadyMessage: "",
  });

  useEffect(() => {
    if (!about) return;
    setAboutForm({
      history: about.history,
      purpose: about.purpose,
      vision: about.vision,
      impact: about.impact,
      firstLadyMessage: about.firstLadyMessage,
    });
  }, [about]);

  if (!allowed) {
    return (
      <p className="text-sm text-muted-foreground">
        You do not have access to content.
      </p>
    );
  }

  const startEditFaq = (faq: Doc<"faqs">) => {
    setEditingFaq(faq._id);
    setFaqForm({
      category: faq.category,
      question: faq.question,
      answer: faq.answer,
      order: faq.order,
    });
  };

  const startEditStat = (stat: Doc<"stats">) => {
    setEditingStat(stat._id);
    setStatForm({
      label: stat.label,
      value: stat.value,
      order: stat.order,
    });
  };

  const startEditAnnouncement = (a: Doc<"announcements">) => {
    setEditingAnnouncement(a._id);
    setAnnouncementForm({
      title: a.title,
      body: a.body,
      active: a.active,
    });
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{editingFaq ? "Edit FAQ" : "Add FAQ"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!sessionToken) return;
                try {
                  await upsertFaq({
                    sessionToken,
                    id: editingFaq ?? undefined,
                    ...faqForm,
                  });
                  setFaqForm({
                    category: "Registration",
                    question: "",
                    answer: "",
                    order: 1,
                  });
                  setEditingFaq(null);
                  toast.success(editingFaq ? "FAQ updated" : "FAQ saved");
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : "Failed to save FAQ",
                  );
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
                required
                value={faqForm.question}
                onChange={(e) =>
                  setFaqForm({ ...faqForm, question: e.target.value })
                }
              />
              <Textarea
                placeholder="Answer"
                required
                value={faqForm.answer}
                onChange={(e) =>
                  setFaqForm({ ...faqForm, answer: e.target.value })
                }
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit">
                  {editingFaq ? "Update FAQ" : "Save FAQ"}
                </Button>
                {editingFaq && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingFaq(null);
                      setFaqForm({
                        category: "Registration",
                        question: "",
                        answer: "",
                        order: 1,
                      });
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </form>

            <div className="mt-6 space-y-3">
              {(faqs ?? []).map((faq) => (
                <div
                  key={faq._id}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Badge variant="secondary">{faq.category}</Badge>
                      <p className="mt-2 font-medium">{faq.question}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {faq.answer}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startEditFaq(faq)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (!sessionToken) return;
                          try {
                            await deleteFaq({ sessionToken, id: faq._id });
                            toast.success("FAQ deleted");
                          } catch (err) {
                            toast.error(
                              err instanceof Error
                                ? err.message
                                : "Delete failed",
                            );
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{editingStat ? "Edit stat" : "Add stat"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!sessionToken) return;
                try {
                  await upsertStat({
                    sessionToken,
                    id: editingStat ?? undefined,
                    ...statForm,
                  });
                  setStatForm({ label: "", value: "", order: 1 });
                  setEditingStat(null);
                  toast.success("Stat saved");
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : "Failed to save stat",
                  );
                }
              }}
            >
              <Input
                placeholder="Label"
                required
                value={statForm.label}
                onChange={(e) =>
                  setStatForm({ ...statForm, label: e.target.value })
                }
              />
              <Input
                placeholder="Value"
                required
                value={statForm.value}
                onChange={(e) =>
                  setStatForm({ ...statForm, value: e.target.value })
                }
              />
              <div className="flex flex-wrap gap-2">
                <Button type="submit">
                  {editingStat ? "Update stat" : "Save stat"}
                </Button>
                {editingStat && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingStat(null);
                      setStatForm({ label: "", value: "", order: 1 });
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </form>
            <div className="mt-6 space-y-2">
              {(stats ?? []).map((stat) => (
                <div
                  key={stat._id}
                  className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-0"
                >
                  <p className="text-sm">
                    {stat.label}: <strong>{stat.value}</strong>
                  </p>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => startEditStat(stat)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        if (!sessionToken) return;
                        try {
                          await deleteStat({ sessionToken, id: stat._id });
                          toast.success("Stat deleted");
                        } catch (err) {
                          toast.error(
                            err instanceof Error
                              ? err.message
                              : "Delete failed",
                          );
                        }
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              {editingAnnouncement ? "Edit announcement" : "Add announcement"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!sessionToken) return;
                try {
                  await upsertAnnouncement({
                    sessionToken,
                    id: editingAnnouncement ?? undefined,
                    ...announcementForm,
                  });
                  setAnnouncementForm({ title: "", body: "", active: true });
                  setEditingAnnouncement(null);
                  toast.success("Announcement saved");
                } catch (err) {
                  toast.error(
                    err instanceof Error
                      ? err.message
                      : "Failed to save announcement",
                  );
                }
              }}
            >
              <Input
                placeholder="Title"
                required
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
                required
                value={announcementForm.body}
                onChange={(e) =>
                  setAnnouncementForm({
                    ...announcementForm,
                    body: e.target.value,
                  })
                }
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={announcementForm.active}
                  onChange={(e) =>
                    setAnnouncementForm({
                      ...announcementForm,
                      active: e.target.checked,
                    })
                  }
                />
                Active
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="submit">
                  {editingAnnouncement ? "Update" : "Save"} announcement
                </Button>
                {editingAnnouncement && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingAnnouncement(null);
                      setAnnouncementForm({
                        title: "",
                        body: "",
                        active: true,
                      });
                    }}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </form>
            <div className="mt-6 space-y-3">
              {(announcements ?? []).map((a) => (
                <div
                  key={a._id}
                  className="rounded-lg border border-border p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{a.title}</p>
                        <Badge variant={a.active ? "secondary" : "outline"}>
                          {a.active ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {a.body}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startEditAnnouncement(a)}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (!sessionToken) return;
                          try {
                            await deleteAnnouncement({
                              sessionToken,
                              id: a._id,
                            });
                            toast.success("Announcement deleted");
                          } catch (err) {
                            toast.error(
                              err instanceof Error
                                ? err.message
                                : "Delete failed",
                            );
                          }
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>About page</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!sessionToken) return;
                try {
                  await upsertAbout({ sessionToken, ...aboutForm });
                  toast.success("About page saved");
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : "Failed to save about",
                  );
                }
              }}
            >
              {(
                [
                  "history",
                  "purpose",
                  "vision",
                  "impact",
                  "firstLadyMessage",
                ] as const
              ).map((key) => (
                <div key={key}>
                  <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {key === "firstLadyMessage" ? "First lady message" : key}
                  </label>
                  <Textarea
                    className="mt-1"
                    value={aboutForm[key]}
                    onChange={(e) =>
                      setAboutForm({ ...aboutForm, [key]: e.target.value })
                    }
                  />
                </div>
              ))}
              <Button type="submit">Save about page</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
