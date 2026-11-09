import test from "node:test";
import assert from "node:assert/strict";
import { buildPaymentSummary } from "./paymentSummary.js";

test("buildPaymentSummary totals confirmed payments and pending repayment intents", () => {
  const summary = buildPaymentSummary(
    [
      { id: 1, loanStatus: "active", outstandingBalance: 1200 },
      { id: 2, loanStatus: "closed", outstandingBalance: 0 },
    ],
    [
      { id: 10, amount: 500, receivedAt: "2024-01-01T12:00:00Z" },
      { id: 11, amount: 200, receivedAt: "2024-01-03T12:00:00Z" },
    ],
    [
      { id: 20, status: "pending", amount: 300 },
      { id: 21, status: "paid", amount: 150 },
      { id: 22, status: "ambiguous", amount: 90 },
    ]
  );

  assert.equal(summary.totalPaid, 700);
  assert.equal(summary.totalOutstanding, 1200);
  assert.equal(summary.pendingPayments, 2);
  assert.equal(summary.activeLoans, 1);
  assert.equal(summary.mostRecentPayment, "2024-01-03T12:00:00Z");
  assert.match(summary.status, /On track|Needs attention/);
});
