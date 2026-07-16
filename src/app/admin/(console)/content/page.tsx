"use client";

import Image from "next/image";
import { useMutation, useQuery } from "convex/react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { ConfirmDeleteDialog } from "@/components/admin/ConfirmDeleteDialog";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { canAccessArea } from "@/lib/adminRoles";
import { uploadFileToConvex } from "@/lib/galleryUpload";

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
  const bulkDeleteFaqs = useMutation(api.content.bulkDeleteFaqs);
  const upsertStat = useMutation(api.content.upsertStat);
  const deleteStat = useMutation(api.content.deleteStat);
  const upsertAnnouncement = useMutation(api.content.upsertAnnouncement);
  const deleteAnnouncement = useMutation(api.content.deleteAnnouncement);
  const upsertAbout = useMutation(api.content.upsertAbout);
  const generateUploadUrl = useMutation(api.galleryStorage.generateUploadUrl);

  const welcomeImageInputRef = useRef<HTMLInputElement>(null);
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
  const [welcomeImagePreview, setWelcomeImagePreview] = useState<string | null>(
    null,
  );
  const [pendingWelcomeFile, setPendingWelcomeFile] = useState<File | null>(
    null,
  );
  const [removeWelcomeImage, setRemoveWelcomeImage] = useState(false);
  const [savingAbout, setSavingAbout] = useState(false);

  useEffect(() => {
    if (!about) return;
    setAboutForm({
      history: about.history,
      purpose: about.purpose,
      vision: about.vision,
      impact: about.impact,
      firstLadyMessage: about.firstLadyMessage,
    });
    if (!pendingWelcomeFile) {
      setWelcomeImagePreview(about.firstLadyImageUrl ?? null);
      setRemoveWelcomeImage(false);
    }
  }, [about, pendingWelcomeFile]);

  useEffect(() => {
    if (!pendingWelcomeFile) return;
    const objectUrl = URL.createObjectURL(pendingWelcomeFile);
    setWelcomeImagePreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [pendingWelcomeFile]);

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
                  <DropdownMenu>
                    <DropdownMenuTrigger className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background hover:bg-muted">
                      <MoreHorizontal className="size-4" />
                      <span className="sr-only">Stat actions</span>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => startEditStat(stat)}>
                        <Pencil />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
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
                        <Trash2 />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
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

        <Card>
          <CardHeader>
            <CardTitle>About page</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!sessionToken) return;
                setSavingAbout(true);
                try {
                  let firstLadyImageStorageId:
                    | Id<"_storage">
                    | undefined;
                  if (pendingWelcomeFile) {
                    firstLadyImageStorageId = await uploadFileToConvex(
                      pendingWelcomeFile,
                      () => generateUploadUrl({ sessionToken }),
                    );
                  }

                  await upsertAbout({
                    sessionToken,
                    ...aboutForm,
                    ...(firstLadyImageStorageId
                      ? { firstLadyImageStorageId }
                      : {}),
                    ...(removeWelcomeImage && !pendingWelcomeFile
                      ? { removeFirstLadyImage: true }
                      : {}),
                  });
                  setPendingWelcomeFile(null);
                  setRemoveWelcomeImage(false);
                  if (welcomeImageInputRef.current) {
                    welcomeImageInputRef.current.value = "";
                  }
                  toast.success("About page saved");
                } catch (err) {
                  toast.error(
                    err instanceof Error ? err.message : "Failed to save about",
                  );
                } finally {
                  setSavingAbout(false);
                }
              }}
            >
              {(
                ["history", "purpose", "vision", "impact"] as const
              ).map((key) => (
                <div key={key}>
                  <label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {key}
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

              <div className="space-y-3 rounded-lg border border-border p-3">
                <div>
                  <p className="text-sm font-medium">Word of Welcome</p>
                  <p className="text-xs text-muted-foreground">
                    Image and message shown in the “From the First Lady”
                    section on the public About page.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="welcome-image">Welcome image</Label>
                  {welcomeImagePreview ? (
                    <div className="relative aspect-[4/3] max-w-sm overflow-hidden rounded-lg border bg-muted">
                      <Image
                        src={welcomeImagePreview}
                        alt="Word of Welcome preview"
                        fill
                        className="object-cover"
                        sizes="384px"
                        unoptimized={welcomeImagePreview.startsWith("blob:")}
                      />
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No image uploaded yet.
                    </p>
                  )}
                  <Input
                    id="welcome-image"
                    ref={welcomeImageInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    onChange={(e) => {
                      const file = e.target.files?.[0] ?? null;
                      setPendingWelcomeFile(file);
                      setRemoveWelcomeImage(false);
                    }}
                  />
                  <div className="flex flex-wrap gap-2">
                    {(welcomeImagePreview || pendingWelcomeFile) && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setPendingWelcomeFile(null);
                          setRemoveWelcomeImage(true);
                          setWelcomeImagePreview(null);
                          if (welcomeImageInputRef.current) {
                            welcomeImageInputRef.current.value = "";
                          }
                        }}
                      >
                        Remove image
                      </Button>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="welcome-message">Welcome message</Label>
                  <Textarea
                    id="welcome-message"
                    rows={5}
                    value={aboutForm.firstLadyMessage}
                    onChange={(e) =>
                      setAboutForm({
                        ...aboutForm,
                        firstLadyMessage: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <Button type="submit" disabled={savingAbout}>
                {savingAbout ? "Saving…" : "Save about page"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

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
