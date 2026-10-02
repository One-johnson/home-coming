import { convexTest } from "convex-test";
import schema from "../convex/schema";

/**
 * Explicit modules map — convex-test's default `import.meta.glob` is not
 * transformed in this vitest/vite combination. Paths must be relative to the
 * repo root (the library locates the "convex/" prefix via the _generated
 * entry). Only modules referenced by the functions under test need loading,
 * but listing every module keeps future tests working out of the box.
 */
const modules = {
  // Registers the "convex/" modules root (the library finds it by the
  // "_generated" key) and supplies the generated api references.
  "convex/_generated/api.js": () => import("../convex/_generated/api.js"),
  "convex/schema.ts": () => import("../convex/schema"),
  "convex/schemaTypes.ts": () => import("../convex/schemaTypes"),
  "convex/adminAuthData.ts": () => import("../convex/adminAuthData"),
  "convex/agcAccommodation.ts": () => import("../convex/agcAccommodation"),
  "convex/agcAdmin.ts": () => import("../convex/agcAdmin"),
  "convex/agcAdminData.ts": () => import("../convex/agcAdminData"),
  "convex/agcAuth.ts": () => import("../convex/agcAuth"),
  "convex/agcAuthData.ts": () => import("../convex/agcAuthData"),
  "convex/agcBookings.ts": () => import("../convex/agcBookings"),
  "convex/agcExcel.ts": () => import("../convex/agcExcel"),
  "convex/agcPortal.ts": () => import("../convex/agcPortal"),
  "convex/authActions.ts": () => import("../convex/authActions"),
  "convex/content.ts": () => import("../convex/content"),
  "convex/crons.ts": () => import("../convex/crons"),
  "convex/emailSender.ts": () => import("../convex/emailSender"),
  "convex/emails.ts": () => import("../convex/emails"),
  "convex/galleryStorage.ts": () => import("../convex/galleryStorage"),
  "convex/heroSlides.ts": () => import("../convex/heroSlides"),
  "convex/housing.ts": () => import("../convex/housing"),
  "convex/registrationCatalog.ts": () => import("../convex/registrationCatalog"),
  "convex/registrations.ts": () => import("../convex/registrations"),
  "convex/seed.ts": () => import("../convex/seed"),
  "convex/tourOrders.ts": () => import("../convex/tourOrders"),
  "convex/tourPackages.ts": () => import("../convex/tourPackages"),
  "convex/users.ts": () => import("../convex/users"),
  "convex/lib/audit.ts": () => import("../convex/lib/audit"),
  "convex/lib/loginThrottle.ts": () => import("../convex/lib/loginThrottle"),
  "convex/lib/resetUrls.ts": () => import("../convex/lib/resetUrls"),
  "convex/lib/smtpConfig.ts": () => import("../convex/lib/smtpConfig"),
};

export function createTestConvex() {
  return convexTest({ schema, modules });
}
