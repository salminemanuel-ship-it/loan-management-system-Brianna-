import assert from "node:assert/strict";
import test from "node:test";
import { calculateRepaymentTerms } from "./repaymentTerms";

test("calculates BML flat weekly interest and disbursement deductions", () => {
  assert.deepEqual(calculateRepaymentTerms(100_000), {
    principalAmount: 100_000,
    savingsAmount: 5_000,
    processingFeeAmount: 10_000,
    interestAmount: 118_750,
    amountDue: 218_750,
    installmentCount: 25,
    weeklyInstallmentAmount: 8_750,
    finalInstallmentAmount: 8_750,
    netDisbursedAmount: 85_000,
  });
});

test("rounds currency to cents and adjusts the final installment", () => {
  const terms = calculateRepaymentTerms(101.01);
  assert.equal(terms.amountDue, 220.96);
  assert.equal(terms.weeklyInstallmentAmount, 8.84);
  assert.equal(terms.finalInstallmentAmount, 8.8);
  assert.equal(terms.weeklyInstallmentAmount * 24 + terms.finalInstallmentAmount, terms.amountDue);
});

test("rejects non-positive and non-finite principal", () => {
  for (const principal of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => calculateRepaymentTerms(principal));
  }
});