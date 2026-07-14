"use client";

import { useAction, useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, User } from "lucide-react";
import { api } from "@convex/_generated/api";
import { LinkButton as Button } from "@/components/ui/app-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useAdminSession } from "@/components/admin/AdminSessionProvider";
import { ROLE_LABELS } from "@/lib/adminRoles";

export default function AdminProfilePage() {
  const { user, sessionToken, clearSession } = useAdminSession();
  const updateProfile = useMutation(api.users.updateProfile);
  const changePassword = useAction(api.authActions.changePassword);

  const [name, setName] = useState(user?.name ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

  if (!user || !sessionToken) {
    return (
      <p className="text-sm text-muted-foreground">Loading profile...</p>
    );
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await updateProfile({ sessionToken, name });
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error("New passwords do not match");
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword({
        sessionToken,
        currentPassword,
        newPassword,
      });
      toast.success("Password changed. Please sign in again.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      await clearSession();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to change password",
      );
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Profile</h2>
        <p className="text-sm text-muted-foreground">
          Manage your account details and password.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Account</CardTitle>
          <Badge variant="outline">{ROLE_LABELS[user.role]}</Badge>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="profile-name">Full name</Label>
              <div className="relative">
                <User className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone" />
                <Input
                  id="profile-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-11 pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="profile-email">Email</Label>
              <Input
                id="profile-email"
                value={user.email}
                disabled
                className="h-11 bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Email cannot be changed here. Ask an admin if you need a new
                account.
              </p>
            </div>
            <Button type="submit" disabled={savingProfile}>
              {savingProfile ? "Saving..." : "Save profile"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone" />
                <Input
                  id="current-password"
                  type={showCurrent ? "text" : "password"}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="h-11 pr-11 pl-10"
                />
                <button
                  type="button"
                  className="absolute top-1/2 right-2.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-stone hover:bg-muted"
                  onClick={() => setShowCurrent((v) => !v)}
                  aria-label={showCurrent ? "Hide password" : "Show password"}
                >
                  {showCurrent ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone" />
                <Input
                  id="new-password"
                  type={showNew ? "text" : "password"}
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="h-11 pr-11 pl-10"
                />
                <button
                  type="button"
                  className="absolute top-1/2 right-2.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-stone hover:bg-muted"
                  onClick={() => setShowNew((v) => !v)}
                  aria-label={showNew ? "Hide password" : "Show password"}
                >
                  {showNew ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                type="password"
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-11"
              />
            </div>
            <Button type="submit" disabled={savingPassword}>
              {savingPassword ? "Updating..." : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
