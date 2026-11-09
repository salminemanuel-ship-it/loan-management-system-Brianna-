import {
  calculateLoanTerms,
  LOAN_TERM_SAMPLE_AMOUNT,
  LOAN_TERM_WEEKLY_INTEREST_RATE,
} from "../loanTerms";

type Language = "en" | "sw";

const copy = {
  en: {
    title: "Understand the loan cost before you apply",
    intro: "Illustrative estimate using the current standard BML calculation. Change the amount to see how the estimate changes.",
    amount: "Amount to estimate (TZS)",
    example: "Example estimate for TZS 100,000",
    principal: "Loan principal",
    interest: "Total flat interest",
    total: "Total to repay",
    installment: "Weekly installments",
    finalInstallment: "Final installment",
    savings: "Savings contribution deducted",
    fee: "Processing fee deducted",
    net: "Estimated amount you receive",
    formula: `Interest is calculated once on the original principal: principal × ${(LOAN_TERM_WEEKLY_INTEREST_RATE * 100).toFixed(2)}% per week × 25 weeks. It is flat interest, not interest on a declining balance. A 5% savings contribution and 10% processing fee are deducted from the principal before disbursement.`,
    caution: "This is an estimate, not an offer or loan approval. Actual approved amount and terms may differ. Ask BML to confirm all terms in writing and make sure you can afford the weekly repayment before accepting a loan.",
    review: "I have reviewed and understand this estimate. I will confirm the final loan terms with BML before accepting a loan.",
    firstPayment: "24 equal weekly installments, then the final installment shown",
  },
  sw: {
    title: "Elewa gharama ya mkopo kabla ya kuomba",
    intro: "Makadirio ya mfano kwa kutumia hesabu za kawaida za sasa za BML. Badili kiasi uone jinsi makadirio yanavyobadilika.",
    amount: "Kiasi cha kukadiria (TZS)",
    example: "Mfano wa makadirio kwa TZS 100,000",
    principal: "Mtaji wa mkopo",
    interest: "Jumla ya riba ya kiwango kisichobadilika",
    total: "Jumla ya kulipa",
    installment: "Malipo ya kila wiki",
    finalInstallment: "Malipo ya mwisho",
    savings: "Akiba inayokatwa",
    fee: "Ada ya uchakataji inayokatwa",
    net: "Kiasi kinachokadiriwa kupokelewa",
    formula: `Riba huhesabiwa mara moja kwa mtaji wote wa awali: mtaji × ${(LOAN_TERM_WEEKLY_INTEREST_RATE * 100).toFixed(2)}% kwa wiki × wiki 25. Hii ni riba ya kiwango kisichobadilika, si riba ya salio linalopungua. Akiba ya 5% na ada ya uchakataji ya 10% hukatwa kwenye mtaji kabla ya fedha kutolewa.`,
    caution: "Haya ni makadirio tu, si ofa wala idhini ya mkopo. Kiasi na masharti halisi yaliyoidhinishwa yanaweza kutofautiana. Omba BML ithibitishe masharti yote kwa maandishi na hakikisha unaweza kumudu malipo ya kila wiki kabla ya kukubali mkopo.",
    review: "Nimesoma na kuelewa makadirio haya. Nitathibitisha masharti ya mwisho ya mkopo na BML kabla ya kukubali mkopo.",
    firstPayment: "Malipo 24 sawa ya kila wiki, kisha malipo ya mwisho yaliyoonyeshwa",
  },
} as const;

function formatMoney(amount: number, language: Language): string {
  return `TZS ${amount.toLocaleString(language === "en" ? "en-TZ" : "sw-TZ", {
    maximumFractionDigits: 2,
  })}`;
}

export default function LoanTermsGuide({
  language,
  amount,
  onAmountChange,
  acknowledged,
  onAcknowledgedChange,
}: {
  language: Language;
  amount: string;
  onAmountChange?: (amount: string) => void;
  acknowledged?: boolean;
  onAcknowledgedChange?: (acknowledged: boolean) => void;
}) {
  const t = copy[language];
  const enteredAmount = Number(amount);
  const hasEnteredAmount = amount.trim() !== "" && Number.isFinite(enteredAmount) && enteredAmount > 0;
  const terms = calculateLoanTerms(hasEnteredAmount ? enteredAmount : LOAN_TERM_SAMPLE_AMOUNT);

  return (
    <section className="loan-terms-guide" aria-labelledby="loan-terms-title">
      <div className="loan-terms-heading">
        <h3 id="loan-terms-title">{t.title}</h3>
        <p>{t.intro}</p>
      </div>
      {onAmountChange && (
        <label className="loan-terms-amount">
          {t.amount}
          <input
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={amount}
            onChange={(event) => onAmountChange(event.target.value)}
          />
        </label>
      )}
      {!hasEnteredAmount && <p className="loan-terms-example">{t.example}</p>}
      <dl className="loan-terms-breakdown" aria-live="polite">
        <div><dt>{t.principal}</dt><dd>{formatMoney(terms.principalAmount, language)}</dd></div>
        <div><dt>{t.interest}</dt><dd>{formatMoney(terms.interestAmount, language)}</dd></div>
        <div className="loan-terms-total"><dt>{t.total}</dt><dd>{formatMoney(terms.amountDue, language)}</dd></div>
        <div><dt>{t.installment}</dt><dd>{formatMoney(terms.weeklyInstallmentAmount, language)}</dd></div>
        <div><dt>{t.finalInstallment}</dt><dd>{formatMoney(terms.finalInstallmentAmount, language)}</dd></div>
        <div className="loan-terms-note"><dt>{language === "en" ? "Schedule" : "Ratiba"}</dt><dd>{t.firstPayment}</dd></div>
        <div><dt>{t.savings}</dt><dd>{formatMoney(terms.savingsAmount, language)}</dd></div>
        <div><dt>{t.fee}</dt><dd>{formatMoney(terms.processingFeeAmount, language)}</dd></div>
        <div className="loan-terms-net"><dt>{t.net}</dt><dd>{formatMoney(terms.netDisbursedAmount, language)}</dd></div>
      </dl>
      <p className="loan-terms-formula">{t.formula}</p>
      <p className="loan-terms-caution">{t.caution}</p>
      {onAcknowledgedChange && (
        <label className="loan-terms-review">
          <input
            type="checkbox"
            required
            checked={acknowledged ?? false}
            onChange={(event) => onAcknowledgedChange(event.target.checked)}
          />
          <span>{t.review}</span>
        </label>
      )}
    </section>
  );
}
