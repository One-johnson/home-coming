import type { MutationCtx } from "../_generated/server";

export type ReferenceKind = "registration" | "stay" | "tour";

const DIGIT_LENGTH = 5;
const MAX_SUFFIX = 10 ** DIGIT_LENGTH; // 100_000 codes: HC00000–HC99999

/** Easy spoken format: HC + 5 digits, e.g. HC42187 */
export function formatReferenceNumber(suffix: string) {
  return `HC${suffix}`;
}

function randomDigits() {
  return String(Math.floor(Math.random() * MAX_SUFFIX)).padStart(
    DIGIT_LENGTH,
    "0",
  );
}

export async function createUniqueReferenceNumber(
  ctx: MutationCtx,
  _kind: ReferenceKind,
  table: "registrations" | "housingBookings" | "tourOrders",
) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const referenceNumber = formatReferenceNumber(randomDigits());
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
