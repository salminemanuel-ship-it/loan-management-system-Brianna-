export const REPAYMENT_INSTALLMENTS = 25;
export const WEEKLY_INTEREST_RATE = 0.0475;
export const SAVINGS_RATE = 0.05;
export const PROCESSING_FEE_RATE = 0.10;

function roundCurrency(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function calculateRepaymentTerms(principalInput: number) {
  if (!Number.isFinite(principalInput) || principalInput <= 0) {
    throw new Error("Principal must be a positive finite amount.");
  }

  const principal = roundCurrency(principalInput);
  const savingsAmount = roundCurrency(principal * SAVINGS_RATE);
  const processingFeeAmount = roundCurrency(principal * PROCESSING_FEE_RATE);
  const interestAmount = roundCurrency(principal * WEEKLY_INTEREST_RATE * REPAYMENT_INSTALLMENTS);
  const amountDue = roundCurrency(principal + interestAmount);
  const weeklyInstallmentAmount = roundCurrency(amountDue / REPAYMENT_INSTALLMENTS);
  const finalInstallmentAmount = roundCurrency(amountDue - weeklyInstallmentAmount * (REPAYMENT_INSTALLMENTS - 1));

  return {
    principalAmount: principal,
    savingsAmount,
    processingFeeAmount,
    interestAmount,
    amountDue,
    installmentCount: REPAYMENT_INSTALLMENTS,
    weeklyInstallmentAmount,
    finalInstallmentAmount,
    netDisbursedAmount: roundCurrency(principal - savingsAmount - processingFeeAmount),
  };
}