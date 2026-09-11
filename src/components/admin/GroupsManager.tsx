"use client";

import { useMutation, useQuery } from "convex/react";
import { ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { ConfirmDeleteDialog } from "@/components/admin/ConfirmDeleteDialog";
import {
  useAdminSession,
  useSessionArgs,
} from "@/components/admin/AdminSessionProvider";
import { Button } from "@/components/ui/app-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REGION_OPTIONS } from "@/lib/registrationConfig";
import { cn } from "@/lib/utils";

type GroupDoc = Doc<"registrationGroups"> & {
  denominations: Doc<"registrationDenominations">[];
};

type GroupForm = {
  name: string;
  price: string;
  currency: string;
  currencySymbol: string;
  gateway: "stripe" | "paystack" | "paypal";
  defaultCountryCode: string;
  regionKey: Doc<"registrationGroups">["regionKey"];
  order: string;
  active: boolean;
};

type DenomForm = {
  name: string;
  order: string;
  active: boolean;
};

function emptyGroupForm(order = 0): GroupForm {
  return {
    name: "",
    price: "20",
    currency: "USD",
    currencySymbol: "$",
    gateway: "stripe",
    defaultCountryCode: "+",
    regionKey: "rest_of_world",
    order: String(order),
    active: true,
  };
}

function toGroupForm(group: GroupDoc): GroupForm {
  return {
    name: group.name,
    price: String(group.price),
    currency: group.currency,
    currencySymbol: group.currencySymbol,
    gateway: group.gateway,
    defaultCountryCode: group.defaultCountryCode,
    regionKey: group.regionKey,
    order: String(group.order),
    active: group.active,
  };
}

export function GroupsManager() {
  const { sessionToken } = useAdminSession();
  const sessionArgs = useSessionArgs();
  const groups = useQuery(
    api.registrationCatalog.listAdmin,
    sessionArgs ? sessionArgs : "skip",
  );
  const upsertGroup = useMutation(api.registrationCatalog.upsertGroup);
  const deleteGroup = useMutation(api.registrationCatalog.deleteGroup);
  const upsertDenomination = useMutation(
    api.registrationCatalog.upsertDenomination,
  );
  const deleteDenomination = useMutation(
    api.registrationCatalog.deleteDenomination,
  );
  const seedDefaults = useMutation(api.registrationCatalog.seedDefaults);

  const [expandedId, setExpandedId] = useState<Id<"registrationGroups"> | null>(
    null,
  );
  const [editingGroupId, setEditingGroupId] = useState<
    Id<"registrationGroups"> | null | "new"
  >(null);
  const [groupForm, setGroupForm] = useState<GroupForm>(emptyGroupForm());
  const [denomForms, setDenomForms] = useState<Record<string, DenomForm>>({});
  const [newDenomByGroup, setNewDenomByGroup] = useState<
    Record<string, DenomForm>
  >({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<
    | { type: "group"; id: Id<"registrationGroups">; name: string }
    | { type: "denomination"; id: Id<"registrationDenominations">; name: string }
    | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  const sorted = useMemo(
    () => [...(groups ?? [])].sort((a, b) => a.order - b.order),
    [groups],
  );

  const startCreateGroup = () => {
    setEditingGroupId("new");
    setGroupForm(emptyGroupForm(sorted.length));
  };

  const startEditGroup = (group: GroupDoc) => {
    setEditingGroupId(group._id);
    setGroupForm(toGroupForm(group));
  };

  const saveGroup = async () => {
    if (!sessionToken) return;
    const price = Number(groupForm.price);
    const order = Number(groupForm.order);
    if (!groupForm.name.trim()) {
      toast.error("Group name is required");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      toast.error("Enter a valid price");
      return;
    }
    if (!Number.isFinite(order)) {
      toast.error("Order must be a number");
      return;
    }

    setSaving(true);
    try {
      await upsertGroup({
        sessionToken,
        id: editingGroupId === "new" ? undefined : editingGroupId ?? undefined,
        name: groupForm.name,
        price,
        currency: groupForm.currency,
        currencySymbol: groupForm.currencySymbol,
        gateway: groupForm.gateway,
        defaultCountryCode: groupForm.defaultCountryCode,
        regionKey: groupForm.regionKey,
        order,
        active: groupForm.active,
      });
      toast.success(editingGroupId === "new" ? "Group created" : "Group saved");
      setEditingGroupId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const saveDenomination = async (
    groupId: Id<"registrationGroups">,
    id: Id<"registrationDenominations"> | undefined,
    form: DenomForm,
  ) => {
    if (!sessionToken) return;
    const order = Number(form.order);
    if (!form.name.trim()) {
      toast.error("Denomination name is required");
      return;
    }
    if (!Number.isFinite(order)) {
      toast.error("Order must be a number");
      return;
    }
    try {
      await upsertDenomination({
        sessionToken,
        id,
        groupId,
        name: form.name,
        order,
        active: form.active,
      });
      toast.success(id ? "Denomination saved" : "Denomination added");
      if (!id) {
        setNewDenomByGroup((prev) => {
          const next = { ...prev };
          delete next[groupId];
          return next;
        });
      } else {
        setDenomForms((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleConfirmDelete = async () => {
    if (!sessionToken || !deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === "group") {
        await deleteGroup({ sessionToken, id: deleteTarget.id });
        toast.success("Group deleted");
        if (expandedId === deleteTarget.id) setExpandedId(null);
      } else {
        await deleteDenomination({ sessionToken, id: deleteTarget.id });
        toast.success("Denomination deleted");
      }
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  };

  const handleSeed = async (replace: boolean) => {
    if (!sessionToken) return;
    try {
      const result = await seedDefaults({ sessionToken, replace });
      if (result.seeded) {
        toast.success(
          `Loaded ${result.groups} groups and ${result.denominations} denominations`,
        );
      } else {
        toast.message("Catalog already exists — use Replace defaults to reset");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Seed failed");
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <div>
            <CardTitle>Groups & denominations</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage registration groups, ticket pricing, and denomination /
              country / hub lists.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {sorted.length === 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleSeed(false)}
              >
                Load defaults
              </Button>
            )}
            {sorted.length > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (
                    window.confirm(
                      "Replace all groups and denominations with the default seed set?",
                    )
                  ) {
                    void handleSeed(true);
                  }
                }}
              >
                Replace defaults
              </Button>
            )}
            <Button type="button" onClick={startCreateGroup}>
              <Plus className="size-4" />
              Add group
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {editingGroupId === "new" && (
            <GroupEditor
              form={groupForm}
              setForm={setGroupForm}
              saving={saving}
              onCancel={() => setEditingGroupId(null)}
              onSave={() => void saveGroup()}
              title="New group"
            />
          )}

          {groups === undefined ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : sorted.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              No groups yet. Load defaults or add a group.
            </p>
          ) : (
            sorted.map((group) => {
              const expanded = expandedId === group._id;
              const editing = editingGroupId === group._id;
              return (
                <div
                  key={group._id}
                  className="overflow-hidden rounded-xl border border-border"
                >
                  <div className="flex flex-wrap items-center gap-2 px-3 py-3">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      onClick={() =>
                        setExpandedId(expanded ? null : group._id)
                      }
                    >
                      <ChevronDown
                        className={cn(
                          "size-4 shrink-0 transition",
                          expanded ? "rotate-0" : "-rotate-90",
                        )}
                      />
                      <span className="truncate font-medium">{group.name}</span>
                      <Badge variant="secondary">
                        {group.currencySymbol}
                        {group.price} {group.currency}
                      </Badge>
                      {!group.active && (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {group.denominations.length} denominations
                      </span>
                    </button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => startEditGroup(group)}
                    >
                      <Pencil className="size-3.5" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        setDeleteTarget({
                          type: "group",
                          id: group._id,
                          name: group.name,
                        })
                      }
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>

                  {editing && (
                    <div className="border-t border-border px-3 py-3">
                      <GroupEditor
                        form={groupForm}
                        setForm={setGroupForm}
                        saving={saving}
                        onCancel={() => setEditingGroupId(null)}
                        onSave={() => void saveGroup()}
                        title="Edit group"
                      />
                    </div>
                  )}

                  {expanded && (
                    <div className="space-y-2 border-t border-border bg-muted/20 px-3 py-3">
                      {group.denominations
                        .slice()
                        .sort((a, b) => a.order - b.order)
                        .map((denom) => {
                          const form = denomForms[denom._id] ?? {
                            name: denom.name,
                            order: String(denom.order),
                            active: denom.active,
                          };
                          const dirty =
                            form.name !== denom.name ||
                            form.order !== String(denom.order) ||
                            form.active !== denom.active;
                          return (
                            <div
                              key={denom._id}
                              className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-end"
                            >
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <Label>Name</Label>
                                <Input
                                  value={form.name}
                                  onChange={(e) =>
                                    setDenomForms((prev) => ({
                                      ...prev,
                                      [denom._id]: {
                                        ...form,
                                        name: e.target.value,
                                      },
                                    }))
                                  }
                                />
                              </div>
                              <div className="w-24 space-y-1.5">
                                <Label>Order</Label>
                                <Input
                                  value={form.order}
                                  onChange={(e) =>
                                    setDenomForms((prev) => ({
                                      ...prev,
                                      [denom._id]: {
                                        ...form,
                                        order: e.target.value,
                                      },
                                    }))
                                  }
                                />
                              </div>
                              <Label className="flex items-center gap-2 pb-2 text-sm">
                                <Checkbox
                                  checked={form.active}
                                  onCheckedChange={(checked) =>
                                    setDenomForms((prev) => ({
                                      ...prev,
                                      [denom._id]: {
                                        ...form,
                                        active: checked === true,
                                      },
                                    }))
                                  }
                                />
                                Active
                              </Label>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={!dirty}
                                onClick={() =>
                                  void saveDenomination(group._id, denom._id, form)
                                }
                              >
                                Save
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={() =>
                                  setDeleteTarget({
                                    type: "denomination",
                                    id: denom._id,
                                    name: denom.name,
                                  })
                                }
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          );
                        })}

                      {(() => {
                        const form = newDenomByGroup[group._id] ?? {
                          name: "",
                          order: String(group.denominations.length),
                          active: true,
                        };
                        return (
                          <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3 sm:flex-row sm:items-end">
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <Label>New denomination</Label>
                              <Input
                                value={form.name}
                                placeholder="Name"
                                onChange={(e) =>
                                  setNewDenomByGroup((prev) => ({
                                    ...prev,
                                    [group._id]: {
                                      ...form,
                                      name: e.target.value,
                                    },
                                  }))
                                }
                              />
                            </div>
                            <div className="w-24 space-y-1.5">
                              <Label>Order</Label>
                              <Input
                                value={form.order}
                                onChange={(e) =>
                                  setNewDenomByGroup((prev) => ({
                                    ...prev,
                                    [group._id]: {
                                      ...form,
                                      order: e.target.value,
                                    },
                                  }))
                                }
                              />
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() =>
                                void saveDenomination(group._id, undefined, form)
                              }
                            >
                              <Plus className="size-3.5" />
                              Add
                            </Button>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <ConfirmDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={
          deleteTarget?.type === "group"
            ? "Delete group?"
            : "Delete denomination?"
        }
        description={
          deleteTarget?.type === "group"
            ? `“${deleteTarget.name}” and all of its denominations will be permanently removed.`
            : `“${deleteTarget?.name ?? "This denomination"}” will be permanently removed.`
        }
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

function GroupEditor({
  form,
  setForm,
  saving,
  onCancel,
  onSave,
  title,
}: {
  form: GroupForm;
  setForm: (form: GroupForm) => void;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
  title: string;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3">
      <p className="text-sm font-medium">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Name</Label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Price</Label>
          <Input
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Currency</Label>
          <Input
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Currency symbol</Label>
          <Input
            value={form.currencySymbol}
            onChange={(e) =>
              setForm({ ...form, currencySymbol: e.target.value })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label>Default country code</Label>
          <Input
            value={form.defaultCountryCode}
            onChange={(e) =>
              setForm({ ...form, defaultCountryCode: e.target.value })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label>Gateway</Label>
          <Select
            value={form.gateway}
            items={[
              { value: "paystack", label: "Paystack" },
              { value: "stripe", label: "Stripe" },
              { value: "paypal", label: "PayPal" },
            ]}
            onValueChange={(value) => {
              if (!value) return;
              setForm({
                ...form,
                gateway: value as GroupForm["gateway"],
              });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="paystack">Paystack</SelectItem>
              <SelectItem value="stripe">Stripe</SelectItem>
              <SelectItem value="paypal">PayPal</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Region key</Label>
          <Select
            value={form.regionKey}
            items={REGION_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            onValueChange={(value) => {
              if (!value) return;
              setForm({
                ...form,
                regionKey: value as GroupForm["regionKey"],
              });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REGION_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Order</Label>
          <Input
            value={form.order}
            onChange={(e) => setForm({ ...form, order: e.target.value })}
          />
        </div>
        <Label className="flex items-center gap-2 self-end pb-2 text-sm">
          <Checkbox
            checked={form.active}
            onCheckedChange={(checked) =>
              setForm({ ...form, active: checked === true })
            }
          />
          Active
        </Label>
      </div>
      <div className="flex gap-2">
        <Button type="button" disabled={saving} onClick={onSave}>
          {saving ? "Saving…" : "Save group"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
