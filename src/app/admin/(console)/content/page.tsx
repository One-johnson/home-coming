"use client";

import { useMutation, useQuery } from "convex/react";
import {
  HelpCircle,
  Megaphone,
  MoreHorizontal,
  Pencil,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { cleanErrorMessage } from "@/lib/friendlyError";
import { ConfirmDeleteDialog } from "@/components/admin/ConfirmDeleteDialog";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { SectionTabs } from "@/components/admin/kit/SectionTabs";
import {
  useAdminSession,
  useSessionArgs,
} from "@/components/admin/AdminSessionProvider";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { LinkButton as Button } from "@/components/ui/app-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { canAccessArea } from "@/lib/adminRoles";

export default function AdminContentPage() {
  const { user, sessionToken } = useAdminSession();
  const sessionArgs = useSessionArgs();
  const allowed = canAccessArea(user?.role, "content");

  const faqs = useQuery(api.content.listFaqs, allowed ? {} : "skip");
  const announcements = useQuery(
    api.content.listAnnouncementsAdmin,
    allowed && sessionArgs ? sessionArgs : "skip",
  );

  const upsertFaq = useMutation(api.content.upsertFaq);
  const deleteFaq = useMutation(api.content.deleteFaq);
  const bulkDeleteFaqs = useMutation(api.content.bulkDeleteFaqs);
  const upsertAnnouncement = useMutation(api.content.upsertAnnouncement);
  const deleteAnnouncement = useMutation(api.content.deleteAnnouncement);
  const seedData = useMutation(api.seed.seed);
  const canSeed = canAccessArea(user?.role, "seed");
  const [seeding, setSeeding] = useState(false);
  const [section, setSection] = useState<"faqs" | "announcements">("faqs");
  const [announcementDelete, setAnnouncementDelete] = useState<{
    id: Id<"announcements">;
    title: string;
  } | null>(null);
  const [deletingAnnouncement, setDeletingAnnouncement] = useState(false);

  const [faqForm, setFaqForm] = useState({
    category: "Registration",
    question: "",
    answer: "",
    order: 1,
  });
  const [editingFaq, setEditingFaq] = useState<Id<"faqs"> | null>(null);
  const [selectedFaqIds, setSelectedFaqIds] = useState<Set<Id<"faqs">>>(
    new Set(),
  );
  const [faqDeleteTarget, setFaqDeleteTarget] = useState<
    | { type: "single"; id: Id<"faqs">; question: string }
    | { type: "bulk" }
    | null
  >(null);
  const [deletingFaqs, setDeletingFaqs] = useState(false);
  const [announcementForm, setAnnouncementForm] = useState({
    title: "",
    body: "",
    active: true,
  });
  const [editingAnnouncement, setEditingAnnouncement] = useState<
    Id<"announcements"> | null
  >(null);

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

  const startEditAnnouncement = (a: Doc<"announcements">) => {
    setEditingAnnouncement(a._id);
    setAnnouncementForm({
      title: a.title,
      body: a.body,
      active: a.active,
    });
  };

  const toggleFaqSelected = (id: Id<"faqs">) => {
    setSelectedFaqIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllFaqs = () => {
    if (!faqs?.length) return;
    if (selectedFaqIds.size === faqs.length) {
      setSelectedFaqIds(new Set());
      return;
    }
    setSelectedFaqIds(new Set(faqs.map((faq) => faq._id)));
  };

  const handleConfirmFaqDelete = async () => {
    if (!sessionToken || !faqDeleteTarget) return;
    setDeletingFaqs(true);
    try {
      if (faqDeleteTarget.type === "single") {
        await deleteFaq({ sessionToken, id: faqDeleteTarget.id });
        setSelectedFaqIds((current) => {
          const next = new Set(current);
          next.delete(faqDeleteTarget.id);
          return next;
        });
        if (editingFaq === faqDeleteTarget.id) {
          setEditingFaq(null);
          setFaqForm({
            category: "Registration",
            question: "",
            answer: "",
            order: 1,
          });
        }
        toast.success("FAQ deleted");
      } else {
        const ids = [...selectedFaqIds];
        const result = await bulkDeleteFaqs({ sessionToken, ids });
        setSelectedFaqIds(new Set());
        if (editingFaq && ids.includes(editingFaq)) {
          setEditingFaq(null);
          setFaqForm({
            category: "Registration",
            question: "",
            answer: "",
            order: 1,
          });
        }
        toast.success(
          `Deleted ${result.deleted} FAQ${result.deleted === 1 ? "" : "s"}`,
        );
      }
      setFaqDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingFaqs(false);
    }
  };

  const faqCount = faqs?.length ?? 0;

  return (
    <div className="space-y-4">
      <AdminPageHeader
        description="FAQs and announcements shown on the public site."
        actions={
          canSeed ? (
            <Button
              size="sm"
              variant="outline"
              disabled={seeding}
              onClick={async () => {
                if (!sessionToken) return;
                setSeeding(true);
                try {
                  await seedData({ sessionToken });
                  toast.success("Default content seeded");
                } catch (err) {
                  toast.error(cleanErrorMessage(err) || "Failed to seed content");
                } finally {
                  setSeeding(false);
                }
              }}
              title="Only fills empty content collections — safe to re-run"
            >
              <Sparkles className="size-4" />
              Seed default content
            </Button>
          ) : undefined
        }
      />
      <SectionTabs
        label="Content sections"
        value={section}
        onChange={setSection}
        items={[
          { id: "faqs", label: "FAQs", icon: HelpCircle, count: faqCount },
          {
            id: "announcements",
            label: "Announcements",
            icon: Megaphone,
            count: announcements?.length ?? 0,
          },
        ]}
      />
      <div className="grid gap-6">
        {section === "faqs" && (
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
                    cleanErrorMessage(err) || "Failed to save FAQ",
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

            <Accordion className="mt-6">
              <AccordionItem value="faqs-list">
                <AccordionTrigger>
                  Existing FAQs ({faqCount})
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 pt-1">
                    {faqCount > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={toggleSelectAllFaqs}
                        >
                          {selectedFaqIds.size === faqCount
                            ? "Clear selection"
                            : "Select all"}
                        </Button>
                        {selectedFaqIds.size > 0 && (
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() => setFaqDeleteTarget({ type: "bulk" })}
                          >
                            Delete selected ({selectedFaqIds.size})
                          </Button>
                        )}
                      </div>
                    )}

                    {(faqs ?? []).map((faq) => {
                      const selected = selectedFaqIds.has(faq._id);
                      return (
                        <div
                          key={faq._id}
                          className="rounded-lg border border-border p-3"
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={selected}
                              onCheckedChange={() => toggleFaqSelected(faq._id)}
                              aria-label={`Select ${faq.question}`}
                              className="mt-1"
                            />
                            <div className="min-w-0 flex-1">
                              <Badge variant="secondary">{faq.category}</Badge>
                              <p className="mt-2 font-medium">{faq.question}</p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {faq.answer}
                              </p>
                            </div>
                            <DropdownMenu>
                              <DropdownMenuTrigger className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background hover:bg-muted">
                                <MoreHorizontal className="size-4" />
                                <span className="sr-only">FAQ actions</span>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() => startEditFaq(faq)}
                                >
                                  <Pencil />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  variant="destructive"
                                  onClick={() =>
                                    setFaqDeleteTarget({
                                      type: "single",
                                      id: faq._id,
                                      question: faq.question,
                                    })
                                  }
                                >
                                  <Trash2 />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      );
                    })}

                    {faqCount === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No FAQs yet.
                      </p>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>
        )}

        {section === "announcements" && (
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
                    cleanErrorMessage(err) || "Failed to save announcement",
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
                <Checkbox
                  checked={announcementForm.active}
                  onCheckedChange={(checked) =>
                    setAnnouncementForm({
                      ...announcementForm,
                      active: checked === true,
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
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background hover:bg-muted">
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">Announcement actions</span>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => startEditAnnouncement(a)}
                        >
                          <Pencil />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() =>
                            setAnnouncementDelete({ id: a._id, title: a.title })
                          }
                        >
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        )}
      </div>

      <ConfirmDeleteDialog
        open={announcementDelete !== null}
        onOpenChange={(open) => {
          if (!open) setAnnouncementDelete(null);
        }}
        title="Delete announcement?"
        description={`“${announcementDelete?.title ?? "This announcement"}” will be permanently removed.`}
        confirmLabel="Delete announcement"
        loading={deletingAnnouncement}
        onConfirm={async () => {
          if (!sessionToken || !announcementDelete) return;
          setDeletingAnnouncement(true);
          try {
            await deleteAnnouncement({ sessionToken, id: announcementDelete.id });
            toast.success("Announcement deleted");
            setAnnouncementDelete(null);
          } catch (err) {
            toast.error(cleanErrorMessage(err) || "Delete failed");
          } finally {
            setDeletingAnnouncement(false);
          }
        }}
      />

      <ConfirmDeleteDialog
        open={faqDeleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setFaqDeleteTarget(null);
        }}
        title={
          faqDeleteTarget?.type === "bulk"
            ? `Delete ${selectedFaqIds.size} FAQ${selectedFaqIds.size === 1 ? "" : "s"}?`
            : "Delete FAQ?"
        }
        description={
          faqDeleteTarget?.type === "bulk"
            ? "Selected FAQs will be permanently removed."
            : `“${faqDeleteTarget?.question ?? "This FAQ"}” will be permanently removed.`
        }
        confirmLabel={
          faqDeleteTarget?.type === "bulk"
            ? `Delete ${selectedFaqIds.size}`
            : "Delete FAQ"
        }
        loading={deletingFaqs}
        onConfirm={handleConfirmFaqDelete}
      />
    </div>
  );
}
