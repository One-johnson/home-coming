import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireRole, sessionTokenValidator } from "./users";
import { writeAuditLog } from "./lib/audit";
import { agcRoomIssueCategory } from "./schemaTypes";

/**
 * Room maintenance flags (Phase 2 rooms).
 *
 * A physical problem stays with the room, not with a delegate: "the toilet is
 * broken in Room 214" outlives whoever was assigned there. One row per
 * problem, so a room can carry several at once and fixing one never erases the
 * record of the others. Flags do NOT block assignment — the room team still
 * needs to know it exists, and the assign screen shows the open ones.
 */

/** Anyone who physically works with the rooms may raise a problem. */
const ROOM_FLAG_ROLES = ["admin", "accommodation", "room_assignment", "checkin"] as const;

/** Only the accommodation team closes a flag — the desk reports, it doesn't fix. */
const ROOM_FLAG_RESOLVE_ROLES = ["admin", "accommodation"] as const;

/**
 * Every room flag, newest first, plus a per-room open count the room grid can
 * read without walking the list again. `includeFixed` is for the history view;
 * the grid only wants what is still wrong.
 */
export const listRoomIssues = query({
  args: {
    sessionToken: sessionTokenValidator,
    includeFixed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, [...ROOM_FLAG_ROLES]);
    const issues = (await ctx.db.query("agcRoomIssues").collect()).filter(
      (issue) => !issue.resolvedAt || args.includeFixed,
    );
    issues.sort((a, b) => b.reportedAt - a.reportedAt);
    return {
      issues: issues.map((issue) => ({
        _id: issue._id as string,
        roomId: issue.roomId as string,
        roomName: issue.roomName,
        accommodationType: issue.accommodationType,
        building: issue.building ?? null,
        category: issue.category,
        note: issue.note,
        status: issue.status,
        reportedAt: issue.reportedAt,
        reportedBy: issue.reportedBy,
        resolvedAt: issue.resolvedAt ?? null,
        resolvedBy: issue.resolvedBy ?? null,
        resolutionNote: issue.resolutionNote ?? null,
      })),
      openCount: issues.filter((issue) => issue.status === "open").length,
    };
  },
});

/** Raise a problem against one room. The note is the detail; it is required. */
export const flagRoom = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    roomId: v.id("agcRooms"),
    category: agcRoomIssueCategory,
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [...ROOM_FLAG_ROLES]);
    const room = await ctx.db.get(args.roomId);
    if (!room || room.deletedAt) throw new ConvexError("Room not found");
    const note = args.note.trim();
    if (!note) {
      throw new ConvexError("Describe the problem — a flag without a note is not actionable");
    }

    // Flagging the same problem twice is almost always a double click, so the
    // second attempt returns the flag that already covers it.
    const existing = (await ctx.db.query("agcRoomIssues").collect()).find(
      (issue) =>
        issue.roomId === room._id &&
        issue.status === "open" &&
        issue.category === args.category &&
        issue.note.trim().toLowerCase() === note.toLowerCase(),
    );
    if (existing) {
      return { issueId: existing._id, created: false as const };
    }

    const issueId = await ctx.db.insert("agcRoomIssues", {
      roomId: room._id,
      roomName: room.name,
      accommodationType: room.accommodationType,
      building: room.building,
      category: args.category,
      note,
      status: "open",
      reportedAt: Date.now(),
      reportedBy: actor.email,
      reportedByRole: actor.role,
    });

    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "agc_room.issue_flagged",
      entityType: "agcRooms",
      entityId: room._id,
      summary: `Flagged ${room.name} (${args.category}): ${note}`,
      metadata: { issueId, category: args.category, note },
    });
    return { issueId, created: true as const };
  },
});

/** Close a flag once the problem is fixed. The row stays for the history. */
export const resolveRoomIssue = mutation({
  args: {
    sessionToken: sessionTokenValidator,
    issueId: v.id("agcRoomIssues"),
    resolutionNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, args.sessionToken, [...ROOM_FLAG_RESOLVE_ROLES]);
    const issue = await ctx.db.get(args.issueId);
    if (!issue) throw new ConvexError("That room flag no longer exists");
    if (issue.resolvedAt) {
      return { success: true as const, alreadyFixed: true as const };
    }
    const resolutionNote = args.resolutionNote?.trim() || undefined;
    await ctx.db.patch(issue._id, {
      status: "fixed",
      resolvedAt: Date.now(),
      resolvedBy: actor.email,
      resolutionNote,
    });
    await writeAuditLog(ctx, {
      actorUserId: actor._id,
      actorEmail: actor.email,
      action: "agc_room.issue_fixed",
      entityType: "agcRooms",
      entityId: issue.roomId,
      summary: `Closed the ${issue.category} flag on ${issue.roomName}${
        resolutionNote ? ` — ${resolutionNote}` : ""
      }`,
      metadata: { issueId: issue._id, category: issue.category, resolutionNote },
    });
    return { success: true as const, alreadyFixed: false as const };
  },
});

/** Open flags for one room, newest first — used by the room drawer if needed. */
export const listRoomIssuesForRoom = query({
  args: { sessionToken: sessionTokenValidator, roomId: v.id("agcRooms") },
  handler: async (ctx, args) => {
    await requireRole(ctx, args.sessionToken, [...ROOM_FLAG_ROLES]);
    const rows = await ctx.db
      .query("agcRoomIssues")
      .withIndex("by_room", (q) => q.eq("roomId", args.roomId))
      .collect();
    return rows
      .filter((row) => row.status === "open")
      .sort((a, b) => b.reportedAt - a.reportedAt)
      .map((row) => ({
        _id: row._id as string,
        category: row.category,
        note: row.note,
        reportedAt: row.reportedAt,
        reportedBy: row.reportedBy,
      }));
  },
});
