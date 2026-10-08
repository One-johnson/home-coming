/**
 * Pure helpers for the payment-on-arrival (POA) feature: status badges and
 * the printable IOU / paid-receipt document. Kept free of React and Convex
 * imports so they can be unit-tested and reused on both portal and console.
 */

export type PoaStatus = "pending" | "evidence_submitted" | "confirmed";

export const POA_STATUS_META: Record<
  PoaStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "IOU — payment on arrival",
    className: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
  evidence_submitted: {
    label: "Evidence submitted",
    className: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300",
  },
  confirmed: {
    label: "Payment confirmed",
    className: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
};

export function poaStatusMeta(status: string): {
  label: string;
  className: string;
} {
  return (
    POA_STATUS_META[status as PoaStatus] ?? {
      label: status.replace(/_/g, " "),
      className: "border-border bg-muted text-muted-foreground",
    }
  );
}

/** Shape returned by the convex/agcPoa.getPoaIou query. */
export type IouReceiptDoc = {
  kind: "registration" | "booking";
  referenceNumber: string;
  hubName: string;
  region: string;
  repName: string;
  currency: string;
  issuedAt: number;
  poaStatus: string;
  confirmedAt: number | null;
  totalAmount: number;
  lines: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    amount: number;
  }>;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render the IOU (unpaid) or paid receipt as a standalone printable HTML
 * document. The receipt is generated on demand from live record data — it is
 * never persisted to the database until the payment itself is confirmed.
 */
export function iouReceiptHtml(doc: IouReceiptDoc): string {
  const paid = doc.poaStatus === "confirmed";
  const title = paid ? "PAID RECEIPT" : "IOU RECEIPT";
  const banner = paid
    ? "background:#065f46;color:#fff;"
    : "background:#92400e;color:#fff;";
  const rows = doc.lines
    .map(
      (line) => `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(line.description)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right;">${line.quantity}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right;">${doc.currency} ${line.unitPrice}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e5e7eb;text-align:right;">${doc.currency} ${line.amount}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${title} — ${escapeHtml(doc.referenceNumber)}</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 40px; color: #111827; }
  .card { max-width: 640px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; }
  .banner { padding: 16px 24px; font-size: 18px; font-weight: 700; letter-spacing: 0.08em; ${banner} }
  .body { padding: 24px; }
  h1 { font-size: 16px; margin: 0 0 4px; }
  .muted { color: #6b7280; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; padding: 6px 10px; border-bottom: 2px solid #e5e7eb; }
  .total-row td { font-weight: 700; border-top: 2px solid #111827; border-bottom: none; }
  .footer { margin-top: 24px; font-size: 11px; color: #6b7280; line-height: 1.5; }
  @media print { body { margin: 0; } .card { border: none; } }
</style>
</head>
<body>
  <div class="card">
    <div class="banner">${title}</div>
    <div class="body">
      <h1>Homecoming 2026 — ${doc.kind === "registration" ? "Registration" : "Accommodation"}</h1>
      <p class="muted">Reference: <strong>${escapeHtml(doc.referenceNumber)}</strong></p>
      <p class="muted">
        Hub: ${escapeHtml(doc.hubName)} · Representative: ${escapeHtml(doc.repName)} ·
        Issued: ${new Date(doc.issuedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
        ${paid ? `· Payment confirmed: ${new Date(doc.confirmedAt ?? doc.issuedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}` : ""}
      </p>
      <table>
        <thead>
          <tr><th>Item</th><th style="text-align:right;">Qty</th><th style="text-align:right;">Unit</th><th style="text-align:right;">Amount</th></tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="total-row"><td>Total</td><td></td><td></td><td style="text-align:right;">${doc.currency} ${doc.totalAmount}</td></tr>
        </tbody>
      </table>
      <p class="footer">
        ${
          paid
            ? "Payment has been received and confirmed by the Homecoming 2026 registration desk. This document is your official paid receipt."
            : "This document acknowledges a payment-on-arrival booking. The total above is due on arrival at the convention. Once payment is confirmed by the registration desk, this receipt becomes a paid receipt."
        }<br />
        Lighthouse Chapel International — Homecoming 2026 · Generated from the representative portal.
      </p>
    </div>
  </div>
</body>
</html>`;
}
