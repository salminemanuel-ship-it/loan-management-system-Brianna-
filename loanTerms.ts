// Keep these values aligned with bml-lms/backend/src/repaymentTerms.ts.
export const LOAN_TERM_SAMPLE_AMOUNT = 100_000;
export const LOAN_TERM_INSTALLMENTS = 25;
export const LOAN_TERM_WEEKLY_INTEREST_RATE = 0.0475;
export const LOAN_TERM_SAVINGS_RATE = 0.05;
export const LOAN_TERM_PROCESSING_FEE_RATE = 0.10;

function roundCurrency(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function calculateLoanTerms(principalInput: number) {
  if (!Number.isFinite(principalInput) || principalInput <= 0) {
    throw new Error("Principal must be a positive finite amount.");
  }

  const principalAmount = roundCurrency(principalInput);
  const savingsAmount = roundCurrency(principalAmount * LOAN_TERM_SAVINGS_RATE);
  const processingFeeAmount = roundCurrency(principalAmount * LOAN_TERM_PROCESSING_FEE_RATE);
  const interestAmount = roundCurrency(
    principalAmount * LOAN_TERM_WEEKLY_INTEREST_RATE * LOAN_TERM_INSTALLMENTS,
  );
  const amountDue = roundCurrency(principalAmount + interestAmount);
  const weeklyInstallmentAmount = roundCurrency(amountDue / LOAN_TERM_INSTALLMENTS);
  const finalInstallmentAmount = roundCurrency(
    amountDue - weeklyInstallmentAmount * (LOAN_TERM_INSTALLMENTS - 1),
  );

  return {
    principalAmount,
    savingsAmount,
    processingFeeAmount,
    interestAmount,
    amountDue,
    installmentCount: LOAN_TERM_INSTALLMENTS,
    weeklyInstallmentAmount,
    finalInstallmentAmount,
    netDisbursedAmount: roundCurrency(principalAmount - savingsAmount - processingFeeAmount),
  };
}
