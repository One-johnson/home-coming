"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { isConvexConfigured } from "@/lib/convex-config";

/**
 * Preferred commercial hotels near campus. Accommodation itself is booked
 * through hub representatives in the rep portal — this list is informational
 * (contact, rates, distance, discount codes).
 *
 * The `isConvexConfigured()` guard lives OUTSIDE the component that calls
 * `useQuery`, so static prerendering (no Convex env) never mounts the hook —
 * same pattern as the old AccommodationPortal.
 */
export function PreferredHotels() {
  if (!isConvexConfigured()) return null;
  return <PreferredHotelsConnected />;
}

function PreferredHotelsConnected() {
  const hotels = useQuery(api.content.listHotels);

  return (
    <div className="space-y-6">
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="font-display text-2xl text-primary">
          Preferred Hotels
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          Prefer to stay off campus? These preferred hotels are near Anagkazo
          Campus in Mampong. Contact them directly — mention Homecoming for
          any listed discount.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {(hotels ?? []).map((hotel) => (
          <Card key={hotel._id}>
            <CardHeader>
              <CardTitle>{hotel.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="font-medium text-primary">Contact</p>
                <p className="text-muted-foreground">
                  {hotel.contact ?? "Coming soon"}
                </p>
              </div>
              <Separator />
              <div>
                <p className="font-medium text-primary">Rate</p>
                <p className="text-muted-foreground">
                  {hotel.rate ?? "To be confirmed"}
                </p>
              </div>
              <Separator />
              <div>
                <p className="font-medium text-primary">Location</p>
                <p className="text-muted-foreground">
                  {hotel.distance ?? "To be confirmed"}
                </p>
              </div>
              {hotel.instructions && (
                <>
                  <Separator />
                  <div>
                    <p className="font-medium text-primary">Rooms &amp; capacity</p>
                    <p className="text-muted-foreground">{hotel.instructions}</p>
                  </div>
                </>
              )}
              {hotel.discountCode && (
                <>
                  <Separator />
                  <div>
                    <p className="font-medium text-primary">Discount code</p>
                    <Badge variant="outline" className="text-accent">
                      {hotel.discountCode}
                    </Badge>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ))}
        {!hotels?.length && (
          <p className="text-muted-foreground">
            Preferred hotel details coming soon.
          </p>
        )}
      </div>
    </div>
  );
}
