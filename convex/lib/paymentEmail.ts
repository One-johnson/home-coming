import { internal } from "../_generated/api";
import type { MutationCtx } from "../_generated/server";

export type PaymentRecordType = "registration" | "booking" | "tour";

export type ConfirmationEmailType =
  | "registration_confirmation"
  | "accommodation_confirmation"
  | "tour_confirmation";

export function isSuccessfulPayment(status: string) {
  return status === "paid" || status === "mock_paid";
}

export function confirmationTypeForRecord(
  recordType: PaymentRecordType,
): ConfirmationEmailType {
  switch (recordType) {
    case "registration":
      return "registration_confirmation";
    case "booking":
      return "accommodation_confirmation";
    case "tour":
      return "tour_confirmation";
  }
}

export async function queuePaymentConfirmation(
  ctx: MutationCtx,
  recordType: PaymentRecordType,
  recordId: string,
  paymentStatus: string,
  previousStatus?: string,
) {
  if (!isSuccessfulPayment(paymentStatus)) return;
  if (previousStatus && isSuccessfulPayment(previousStatus)) return;

  await ctx.scheduler.runAfter(0, internal.emailSender.queueConfirmationEmail, {
    type: confirmationTypeForRecord(recordType),
    recordId,
  });
}
