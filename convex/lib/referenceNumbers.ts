import type { MutationCtx } from "../_generated/server";

export type ReferenceKind = "registration" | "stay";

const REFERENCE_YEAR = 26;
const REF_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomSuffix(length = 4) {
  let suffix = "";
  for (let i = 0; i < length; i++) {
    suffix += REF_CHARS[Math.floor(Math.random() * REF_CHARS.length)]!;
  }
  return suffix;
}

export function formatReferenceNumber(kind: ReferenceKind, suffix: string) {
  const typeCode = kind === "registration" ? "R" : "S";
  return `HC${REFERENCE_YEAR}-${typeCode}-${suffix}`;
}

export async function createUniqueReferenceNumber(
  ctx: MutationCtx,
  kind: ReferenceKind,
  table: "registrations" | "housingBookings",
) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const referenceNumber = formatReferenceNumber(kind, randomSuffix());
    const existing = await ctx.db
      .query(table)
      .withIndex("by_reference_number", (q) =>
        q.eq("referenceNumber", referenceNumber),
      )
      .first();

    if (!existing) {
      return referenceNumber;
    }
  }

  throw new Error("Failed to generate a unique reference number");
}
