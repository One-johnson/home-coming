"use client";

import { useState } from "react";
import { LogOutIcon } from "lucide-react";
import { toast } from "sonner";
import {
  RepSessionFallbackProvider,
  useRepSession,
} from "@/components/portal/RepSessionProvider";
import {
  RepFirstTimeSetup,
  RepSignIn,
} from "@/components/portal/RepAuthForms";
import { RepRegistrationTab } from "@/components/portal/RepRegistrationTab";
import { RepAccommodationTab } from "@/components/portal/RepAccommodationTab";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isConvexConfigured } from "@/lib/convex-config";
import { EVENT } from "@/lib/eventConfig";

function ConvexRequiredMessage() {
  return (
    <Alert className="mx-auto max-w-lg border-amber-200 bg-amber-50 text-amber-900">
      <AlertTitle>Convex required</AlertTitle>
      <AlertDescription>
        The representative portal requires Convex. Run{" "}
        <code className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs">
          npx convex dev
        </code>{" "}
        to enable it.
      </AlertDescription>
    </Alert>
  );
}

function PortalBody() {
  const { sessionToken, isReady, rep, clearSession } = useRepSession();
  const [tab, setTab] = useState("registration");

  if (!isReady) {
    return (
      <Card className="mx-auto max-w-md">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Loading…
        </CardContent>
      </Card>
    );
  }

  if (!sessionToken) {
    return <RepSignIn />;
  }

  if (rep === undefined) {
    // Profile query still in flight for a stored token.
    return (
      <Card className="mx-auto max-w-md">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Loading your portal…
        </CardContent>
      </Card>
    );
  }

  if (!rep) {
    return <RepSignIn />;
  }

  if (rep.profileComplete === false) {
    return <RepFirstTimeSetup username={rep.username} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div>
          <p className="font-display text-lg text-primary">{rep.hubName}</p>
          <p className="text-xs text-muted-foreground">
            {rep.firstName} {rep.lastName} · {rep.email} · Hub: {rep.username}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void clearSession();
            toast.success("You've been signed out. See you soon!");
          }}
        >
          <LogOutIcon className="size-4" />
          Sign out
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full space-y-6">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1">
          <TabsTrigger
            value="registration"
            className="min-h-11 px-2 text-sm sm:text-base"
          >
            Registration
          </TabsTrigger>
          <TabsTrigger
            value="accommodation"
            className="min-h-11 px-2 text-sm sm:text-base"
          >
            Accommodation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="registration">
          <RepRegistrationTab />
        </TabsContent>
        <TabsContent value="accommodation">
          <RepAccommodationTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function PortalShell() {
  if (!isConvexConfigured()) {
    return <ConvexRequiredMessage />;
  }

  return (
    <RepSessionFallbackProvider>
      <div className="mx-auto w-full max-w-6xl px-4 py-10">
        <header className="mb-8 text-center">
          <p className="text-sm uppercase tracking-widest text-muted-foreground">
            {EVENT.fullTitle}
          </p>
          <h1 className="font-display text-3xl text-primary sm:text-4xl">
            Representative Portal
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
            Bulk registration and accommodation for your hub — one account per
            hub, managed by your hub representative.
          </p>
        </header>
        <PortalBody />
      </div>
    </RepSessionFallbackProvider>
  );
}
