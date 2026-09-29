"use node";

import bcrypt from "bcryptjs";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdminViaAction } from "./agcAdminData";
import { AGC_REGIONS } from "./lib/agcConfig";
import { buildPortalUrl } from "./lib/resetUrls";

const BCRYPT_ROUNDS = 12;

function generateTempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

/** Hub name -> rep username ("Ashanti Mampong" -> "ashanti_mampong"). */
function deriveUsername(hubName: string) {
  return hubName.toLowerCase().replace(/\s+/g, "_");
}

// ------------------------------------------------------------------
// Seeds — thin action wrapper (the real work is in agcAdminData)
// ------------------------------------------------------------------

export const seedAgcDefaults = action({
  args: { sessionToken: v.string() },
  handler: async (ctx, args): Promise<{ success: true }> => {
    await requireAdminViaAction(ctx, args.sessionToken);
    await ctx.runMutation(internal.agcAdminData.seedAgcDefaultsInternal, {});
    return { success: true };
  },
});

// ------------------------------------------------------------------
// Hubs — bulk import (SRS §4)
// ------------------------------------------------------------------

export const importHubs = action({
  args: {
    sessionToken: v.string(),
    rows: v.array(
      v.object({
        name: v.string(),
        region: v.union(
          v.literal("ghana"),
          v.literal("west_africa"),
          v.literal("rest_of_africa"),
          v.literal("north_america"),
          v.literal("england"),
          v.literal("switzerland"),
          v.literal("rest_of_europe"),
          v.literal("rest_of_world"),
          v.string(),
        ),
      }),
    ),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ created: number; updated: number; skipped: number }> => {
    await requireAdminViaAction(ctx, args.sessionToken);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const seen = new Set<string>();

    for (const row of args.rows) {
      const name = row.name.trim();
      const region = row.region as keyof typeof AGC_REGIONS;
      const country = (row as { country?: string }).country?.trim() ?? "";
      if (!name || !AGC_REGIONS[region]) {
        skipped += 1;
        continue;
      }
      const dedupeKey = name.toLowerCase();
      if (seen.has(dedupeKey)) {
        skipped += 1;
        continue;
      }
      seen.add(dedupeKey);

      const existing: Doc<"agcHubs"> | null = await ctx.runQuery(
        internal.agcAdminData.getHubByName,
        { name },
      );
      if (existing) {
        if (
          existing.region !== region ||
          existing.country !== country ||
          existing.active === false
        ) {
          await ctx.runMutation(internal.agcAdminData.patchHub, {
            hubId: existing._id,
            region,
            country,
            active: true,
          });
          updated += 1;
        } else {
          skipped += 1;
        }
      } else {
        await ctx.runMutation(internal.agcAdminData.insertHub, {
          name,
          region,
          country,
        });
        created += 1;
      }
    }

    await ctx.runMutation(internal.agcAdminData.insertAuditEntry, {
      summary: `Imported hubs: ${created} created, ${updated} updated, ${skipped} skipped`,
    });
    return { created, updated, skipped };
  },
});

// ------------------------------------------------------------------
// Representative accounts (SRS §5–6, §58)
// ------------------------------------------------------------------

export const createRep = action({
  args: {
    sessionToken: v.string(),
    hubId: v.id("agcHubs"),
    email: v.optional(v.string()),
    /** Admin-chosen default (temporary) password; auto-generated when omitted. */
    tempPassword: v.optional(v.string()),
    /** Browser origin, used to build the portal link in the credentials email. */
    clientOrigin: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ repId: Id<"agcRepresentatives">; username: string; tempPassword: string }> => {
    const actor = await requireAdminViaAction(ctx, args.sessionToken);
    const hub: Doc<"agcHubs"> | null = await ctx.runQuery(
      internal.agcAdminData.getHubById,
      { hubId: args.hubId },
    );
    if (!hub) throw new ConvexError("Hub not found");

    const username = deriveUsername(hub.name);
    const existing: Doc<"agcRepresentatives"> | null = await ctx.runQuery(
      internal.agcAdminData.getRepByUsername,
      { username },
    );
    if (existing) {
      throw new ConvexError(
        `A representative account already exists for ${hub.name} (username: ${username})`,
      );
    }

    const tempPassword = args.tempPassword?.trim() || generateTempPassword();
    if (tempPassword.length < 8) {
      throw new ConvexError("Default password must be at least 8 characters");
    }
    const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
    const repId: Id<"agcRepresentatives"> = await ctx.runMutation(
      internal.agcAdminData.insertRep,
      {
        hubId: hub._id,
        username,
        passwordHash,
        tempPassword,
        email: args.email?.trim().toLowerCase() || undefined,
      },
    );

    // Send the credentials to the rep's email (no-op without one on file).
    const credsEmail = await ctx.runMutation(
      internal.agcAuthData.queueRepCredentialsEmail,
      {
        repId,
        hubName: hub.name,
        username,
        tempPassword,
        isResend: false,
        portalUrl: buildPortalUrl(args.clientOrigin),
      },
    );
    if (credsEmail.shouldSend) {
      await ctx.scheduler.runAfter(0, internal.emailSendAction.sendEmail, {
        emailLogId: credsEmail.emailLogId as Id<"emailLogs">,
      });
    }

    await ctx.runMutation(internal.agcAdminData.insertAuditEntry, {
      actorEmail: actor.email,
      summary: `Created representative account ${username} for hub ${hub.name}`,
    });

    return { repId, username, tempPassword };
  },
});

export const bulkCreateReps = action({
  args: {
    sessionToken: v.string(),
    /** Admin-chosen default (temporary) password for every created account; auto-generate per rep when omitted. */
    tempPassword: v.optional(v.string()),
    /** Limit creation to these hub ids; all hub-less hubs when omitted. */
    hubIds: v.optional(v.array(v.id("agcHubs"))),
    /** Browser origin, used to build the portal link in credentials emails. */
    clientOrigin: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    created: Array<{
      hubId: Id<"agcHubs">;
      hubName: string;
      username: string;
      tempPassword: string;
    }>;
    skipped: Array<{ hubId: Id<"agcHubs">; hubName: string; reason: string }>;
    errors: Array<{ hubName: string; reason: string }>;
  }> => {
    const actor = await requireAdminViaAction(ctx, args.sessionToken);

    const trimmed = args.tempPassword?.trim();
    if (trimmed && trimmed.length < 8) {
      throw new ConvexError("Default password must be at least 8 characters");
    }
    // All reps created in this run share ONE temporary password
    // (auto-generated once when the admin did not choose one).
    const sharedTempPassword = trimmed || generateTempPassword();

    const hubs: Doc<"agcHubs">[] = await ctx.runQuery(
      internal.agcAdminData.listAllHubsInternal,
      {},
    );
    const reps: Doc<"agcRepresentatives">[] = await ctx.runQuery(
      internal.agcAdminData.listAllRepsInternal,
      {},
    );
    const hubIdsWithRep = new Set(reps.map((rep) => rep.hubId));

    const candidates = hubs
      .filter(
        (hub) =>
          hub.active !== false &&
          !hubIdsWithRep.has(hub._id) &&
          (!args.hubIds || args.hubIds.includes(hub._id)),
      )
      .map((hub) => ({ hub, username: deriveUsername(hub.name) }));

    const usernameSeen = new Set(
      reps.map((rep) => rep.username.toLowerCase()),
    );
    const results: {
      created: Array<{
        hubId: Id<"agcHubs">;
        hubName: string;
        username: string;
        tempPassword: string;
      }>;
      skipped: Array<{ hubId: Id<"agcHubs">; hubName: string; reason: string }>;
      errors: Array<{ hubName: string; reason: string }>;
    } = { created: [], skipped: [], errors: [] };

    for (const { hub, username } of candidates) {
      if (usernameSeen.has(username.toLowerCase())) {
        results.skipped.push({
          hubId: hub._id,
          hubName: hub.name,
          reason: `username "${username}" is already taken`,
        });
        continue;
      }
      try {
        const tempPassword = trimmed || sharedTempPassword;
        const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
        const repId: Id<"agcRepresentatives"> = await ctx.runMutation(
          internal.agcAdminData.insertRep,
          {
            hubId: hub._id,
            username,
            passwordHash,
            tempPassword,
          },
        );
        usernameSeen.add(username.toLowerCase());
        results.created.push({
          hubId: hub._id,
          hubName: hub.name,
          username,
          tempPassword,
        });

        // Queue the credentials email for this rep (no-op without email).
        const credsEmail = await ctx.runMutation(
          internal.agcAuthData.queueRepCredentialsEmail,
          {
            repId: repId,
            hubName: hub.name,
            username,
            tempPassword,
            isResend: false,
            portalUrl: buildPortalUrl(args.clientOrigin),
          },
        );
        if (credsEmail.shouldSend) {
          await ctx.scheduler.runAfter(0, internal.emailSendAction.sendEmail, {
            emailLogId: credsEmail.emailLogId as Id<"emailLogs">,
          });
        }
      } catch (err) {
        results.errors.push({
          hubName: hub.name,
          reason: err instanceof Error ? err.message : "Unknown error",
        });
      }
    }

    await ctx.runMutation(internal.agcAdminData.insertAuditEntry, {
      actorEmail: actor.email,
      summary: `Bulk-created representative accounts: ${results.created.length} created, ${results.skipped.length} skipped, ${results.errors.length} errors`,
    });

    return results;
  },
});

export const issueTempPassword = action({
  args: {
    sessionToken: v.string(),
    repId: v.id("agcRepresentatives"),
    /** Admin-chosen temporary password; auto-generated when omitted. */
    tempPassword: v.optional(v.string()),
    /** Browser origin, used to build the portal link in the credentials email. */
    clientOrigin: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ username: string; tempPassword: string }> => {
    const actor = await requireAdminViaAction(ctx, args.sessionToken);
    const rep: Doc<"agcRepresentatives"> | null = await ctx.runQuery(
      internal.agcAdminData.getRepById,
      { repId: args.repId },
    );
    if (!rep) throw new ConvexError("Representative not found");

    const tempPassword = args.tempPassword?.trim() || generateTempPassword();
    if (tempPassword.length < 8) {
      throw new ConvexError("Temporary password must be at least 8 characters");
    }
    const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
    await ctx.runMutation(internal.agcAdminData.resetRepCredentials, {
      repId: rep._id,
      passwordHash,
      tempPassword,
    });

    await ctx.runMutation(internal.agcAdminData.insertAuditEntry, {
      actorEmail: actor.email,
      summary: `Issued a new temporary password for ${rep.username}`,
    });

    // Resend the credentials (new temp password) to the rep's email.
    const hub: Doc<"agcHubs"> | null = await ctx.runQuery(
      internal.agcAdminData.getHubById,
      { hubId: rep.hubId },
    );
    const credsEmail = await ctx.runMutation(
      internal.agcAuthData.queueRepCredentialsEmail,
      {
        repId: rep._id,
        hubName: hub?.name ?? rep.username,
        username: rep.username,
        tempPassword,
        isResend: true,
        portalUrl: buildPortalUrl(args.clientOrigin),
      },
    );
    if (credsEmail.shouldSend) {
      await ctx.scheduler.runAfter(0, internal.emailSendAction.sendEmail, {
        emailLogId: credsEmail.emailLogId as Id<"emailLogs">,
      });
    }

    return { username: rep.username, tempPassword };
  },
});
