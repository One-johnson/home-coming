import { query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export type AdminRole = "admin" | "editor" | "registration" | "accommodation";

type Ctx = QueryCtx | MutationCtx;

export async function getCurrentUser(ctx: Ctx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  return await ctx.db.get(userId);
}

export async function requireRole(ctx: Ctx, allowedRoles: AdminRole[]) {
  const user = await getCurrentUser(ctx);
  if (!user?.role || !allowedRoles.includes(user.role)) {
    throw new Error("Unauthorized");
  }
  return user;
}

export const currentUser = query({
  args: {},
  handler: async (ctx) => {
    return await getCurrentUser(ctx);
  },
});
