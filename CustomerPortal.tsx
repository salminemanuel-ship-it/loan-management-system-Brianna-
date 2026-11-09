import { useEffect, useState, type ChangeEvent } from "react";
import { getCustomerLoans, getCustomerPaymentIntents, getCustomerPaymentRecords, getCustomerRequests, startCustomerRepayment, updateCustomerProfileImage } from "../api";
import LoanTermsGuide from "./LoanTermsGuide";
import type { CustomerLoan, CustomerPaymentIntent, CustomerPaymentRecord, CustomerRequest } from "../types";

type Language = "en" | "sw";
const copy = {
  en: {
    kicker: "YOUR BML CUSTOMER SPACE", hello: "Welcome", intro: "Explore BML's loan services, understand the application process, and find our office. Your loan details will appear here when BML links them to your account.",
    profile: "Profile photo", change: "Change photo", photoHelp: "Add a profile photo if you like. It is visible only in your customer account.",
    offers: "What Brianna offers", offerIntro: "Brianna Microfinance Limited (BML) supports individuals and business groups through these loan products:", group: "Group Loan", groupText: "A group-based loan for members who organize together and go through joint and individual assessment.", business: "Business Emergency Loan", businessText: "A loan for an individual business customer, introduced by the customer, BML, or a Loan Officer and assessed in the field.",
    requirements: "Loan application requirements", requirementsIntro: "These are the assessment steps described for BML products. Ask a BML Loan Officer to confirm current eligibility, documents, fees, rates, and loan limits.", groupReq: "Group Loan", businessReq: "Business Emergency Loan", groupItems: ["Group identification and registration with member details", "Assessment of group cohesion, member character, businesses, and premises where applicable", "Business information such as sales, working capital, cash flow, assets, and existing obligations", "Field observations and supporting evidence requested by BML", "Supervisor verification, Credit Committee decision, and signing before disbursement"], businessItems: ["Customer introduction and registration (self, BML staff, or Loan Officer)", "Valid contact details and business location for a field visit", "Assessment of business conduct, stability, repayment behaviour, and ability to repay", "Business figures including sales, working capital, cash flow, assets, and obligations", "Photos or documents requested by BML to support the assessment"], assessmentQuestions: "Questions to prepare for", assessmentIntro: "A Loan Officer may ask these questions during your assessment. Bring your best estimates and supporting records if available.", groupQuestions: ["What businesses do the group members operate, and where are they located?", "How long has each business been operating, and what are its usual monthly sales and costs?", "What amount is the group requesting, and how will the members use it?", "What regular income will be used to repay, and what monthly repayment can the group manage?", "Do any members or the group currently have loans or other repayment commitments?", "How does the group make decisions, support members, and handle a late contribution or repayment?"], businessQuestions: ["What do you sell or do, and how long have you operated this business?", "About how much does the business sell in a typical month, and what are its regular costs?", "After business costs and household needs, how much cash is usually available each month?", "Do you have any current loans or other regular repayment commitments?", "How much are you requesting, and what specifically will the loan pay for?", "What income will you use to repay, and what monthly repayment amount can you manage?", "Where does the business operate, and is the premises owned, rented, or otherwise used with permission?"],
    about: "About Brianna Microfinance", aboutText: "Brianna Microfinance Limited (BML) is a microfinance provider in Tanzania. BML's proposed loan services include Group Loans and Business Emergency Loans. Its service model is designed around Loan Officers, centres, zones, and mobile or virtual operations.",
    loans: "Group loans", loanIntro: "Review group loan balances, payments, arrears, and account status.", noLoans: "No group loan accounts are linked to this profile yet.", loanNumber: "Loan number", product: "Product", loanBalance: "Loan balance", amountDue: "Amount due", amountPaid: "Amount paid", outstanding: "Outstanding balance", performance: "Repayment performance", arrears: "Arrears", nextDue: "Next due date", unavailable: "Not recorded", loadingLoans: "Loading group loan accounts…", loadLoansError: "Could not load group loan accounts.", statusLabels: { in_progress: "In progress", active: "Active", closed: "Closed" },
    news: "News from Brianna", newsIntro: "Official BML updates will appear here when published.", newsEmpty: "There are no news updates yet.",
    location: "Find Brianna", locationText: "Tabata Segerea Street, near Tabata General Hospital, Ilala, Dar es Salaam.", openMap: "Open in Google Maps", mapLabel: "Map showing Brianna Microfinance Limited's listed Tabata location", help: "Need assistance? Contact your assigned BML Loan Officer or visit our office.", language: "Language", saved: "Profile photo updated.",
  },
  sw: {
    kicker: "ENEO LAKO LA MTEJA WA BML", hello: "Karibu", intro: "Fahamu huduma za mikopo za BML, mchakato wa maombi, na mahali ofisi yetu ilipo. Taarifa za mkopo zitaonekana hapa BML itakapounganisha na akaunti yako.",
    profile: "Picha ya wasifu", change: "Badili picha", photoHelp: "Unaweza kuongeza picha ya wasifu ukipenda. Inaonekana kwenye akaunti yako ya mteja pekee.",
    offers: "Huduma za Brianna", offerIntro: "Brianna Microfinance Limited (BML) hutoa huduma kwa watu binafsi na vikundi vya biashara kupitia mikopo hii:", group: "Mkopo wa Kikundi", groupText: "Mkopo wa kikundi kwa wanachama wanaojiunga pamoja na kufanyiwa tathmini ya kikundi na mtu mmoja mmoja.", business: "Mkopo wa Dharura wa Biashara", businessText: "Mkopo kwa mteja binafsi wa biashara, anayetambulishwa na yeye mwenyewe, BML au Afisa Mikopo na kutembelewa kwa tathmini.",
    requirements: "Mahitaji ya maombi ya mkopo", requirementsIntro: "Hizi ni hatua za tathmini zilizoelezwa kwa bidhaa za BML. Muulize Afisa Mikopo athibitishe vigezo, nyaraka, ada, viwango na ukomo wa mkopo wa sasa.", groupReq: "Mkopo wa Kikundi", businessReq: "Mkopo wa Dharura wa Biashara", groupItems: ["Utambuzi na usajili wa kikundi pamoja na taarifa za wanachama", "Tathmini ya mshikamano, tabia za wanachama, biashara na makazi inapohitajika", "Taarifa za biashara kama mauzo, mtaji, mtiririko wa fedha, mali na madeni yaliyopo", "Maoni ya ziara na vielelezo vinavyoombwa na BML", "Uhakiki wa msimamizi, uamuzi wa Kamati ya Mikopo na kusaini kabla ya fedha kutolewa"], businessItems: ["Utambulisho na usajili wa mteja (mteja mwenyewe, BML au Afisa Mikopo)", "Taarifa sahihi za mawasiliano na eneo la biashara kwa ziara", "Tathmini ya mwenendo, uimara, tabia ya marejesho na uwezo wa kulipa", "Taarifa za biashara kama mauzo, mtaji, mtiririko wa fedha, mali na madeni", "Picha au nyaraka zitakazoombwa na BML kusaidia tathmini"], assessmentQuestions: "Maswali ya kujiandaa", assessmentIntro: "Afisa Mikopo anaweza kukuuliza maswali haya wakati wa tathmini. Andaa makadirio sahihi na nyaraka za kuthibitisha ikiwa unazo.", groupQuestions: ["Wanachama wa kikundi wanaendesha biashara gani, na biashara hizo ziko wapi?", "Kila biashara imekuwepo kwa muda gani, na mauzo na gharama zake za kawaida kwa mwezi ni kiasi gani?", "Kikundi kinaomba kiasi gani, na wanachama watakitumia kwa madhumuni gani?", "Ni mapato gani ya kawaida yatatumika kulipa, na kikundi kinaweza kumudu marejesho ya kiasi gani kwa mwezi?", "Je, wanachama au kikundi wana mikopo au majukumu mengine ya marejesho kwa sasa?", "Kikundi hufanyaje maamuzi, kusaidiana, na kushughulikia mwanachama anapochelewa kuchangia au kulipa?"], businessQuestions: ["Unauza bidhaa au unatoa huduma gani, na biashara imekuwepo kwa muda gani?", "Kwa kawaida biashara huuza kiasi gani kwa mwezi, na gharama zake za kawaida ni zipi?", "Baada ya gharama za biashara na mahitaji ya nyumbani, kwa kawaida unabakiwa na fedha kiasi gani kwa mwezi?", "Je, una mikopo au majukumu mengine ya kawaida ya marejesho kwa sasa?", "Unaomba kiasi gani, na fedha hizo zitatumika kwa madhumuni gani hasa?", "Ni mapato gani utatumia kulipa, na unaweza kumudu marejesho ya kiasi gani kwa mwezi?", "Biashara inafanyia kazi wapi, na eneo hilo ni lako, la kupanga, au unalitumia kwa ruhusa?"],
    about: "Kuhusu Brianna Microfinance", aboutText: "Brianna Microfinance Limited (BML) ni mtoa huduma za mikopo midogo nchini Tanzania. Huduma zake za mikopo zilizopangwa zinajumuisha Mikopo ya Vikundi na Mikopo ya Dharura ya Biashara. Mfumo wa huduma unajumuisha Maafisa Mikopo, vituo, kanda na huduma za kutembea au mtandaoni.",
    loans: "Mikopo ya kikundi", loanIntro: "Angalia salio, malipo, malimbikizo na hali ya mikopo ya kikundi.", noLoans: "Bado hakuna akaunti ya mkopo wa kikundi iliyounganishwa na wasifu huu.", loanNumber: "Namba ya mkopo", product: "Aina ya mkopo", loanBalance: "Kiasi cha mkopo", amountDue: "Kiasi kinachodaiwa", amountPaid: "Kiasi kilicholipwa", outstanding: "Salio lililobaki", performance: "Ufanisi wa marejesho", arrears: "Malimbikizo", nextDue: "Tarehe ijayo ya malipo", unavailable: "Haijawekwa", loadingLoans: "Inapakia akaunti za mikopo ya kikundi…", loadLoansError: "Imeshindwa kupakia akaunti za mikopo ya kikundi.", statusLabels: { in_progress: "Inaendelea", active: "Unaendelea", closed: "Umefungwa" },
    news: "Habari kutoka Brianna", newsIntro: "Taarifa rasmi za BML zitaonekana hapa zitakapochapishwa.", newsEmpty: "Bado hakuna taarifa za habari.",
    location: "Mahali pa Brianna", locationText: "Barabara ya Tabata Segerea, karibu na Hospitali ya Tabata General, Ilala, Dar es Salaam.", openMap: "Fungua Google Maps", mapLabel: "Ramani inayoonyesha eneo la Brianna Microfinance Limited Tabata", help: "Unahitaji msaada? Wasiliana na Afisa Mikopo wako wa BML au tembelea ofisi yetu.", language: "Lugha", saved: "Picha ya wasifu imesasishwa.",
  },
} as const;

const addressQuery = encodeURIComponent("Brianna Microfinance Limited, Tabata Segerea Street near Tabata General Hospital, Dar es Salaam, Tanzania");
const address = "Tabata Segerea Street, near Tabata General Hospital, Ilala, Dar es Salaam";

export default function CustomerPortal({ username, profileImage, language, section, onProfileImage, onNavigate }: { username: string; profileImage?: string; language: Language; section: string; onProfileImage: (image: string) => void; onNavigate: (section: string) => void }) {
  const [photo, setPhoto] = useState(profileImage ?? "");
  const [selectedProduct, setSelectedProduct] = useState(() => localStorage.getItem("bml_customer_selected_product") ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loans, setLoans] = useState<CustomerLoan[]>([]);
  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [paymentIntents, setPaymentIntents] = useState<CustomerPaymentIntent[]>([]);
  const [paymentRecords, setPaymentRecords] = useState<CustomerPaymentRecord[]>([]);
  const [paymentValues, setPaymentValues] = useState<Record<number, { amount: string; mobile: string }>>({});
  const [paymentBusyId, setPaymentBusyId] = useState<number | null>(null);
  const [paymentMessage, setPaymentMessage] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [loansLoading, setLoansLoading] = useState(false);
  const [loansError, setLoansError] = useState("");
  const [loanEstimateAmount, setLoanEstimateAmount] = useState(() => localStorage.getItem("bml_customer_loan_estimate_amount") ?? "100000");
  const [qualificationsReviewed, setQualificationsReviewed] = useState(() => localStorage.getItem("bml_customer_qualifications_reviewed") === "true");
  const t = copy[language];
  const groupItems = t.groupItems as readonly string[];
  const businessItems = t.businessItems as readonly string[];
  const groupQuestions = t.groupQuestions as readonly string[];
  const businessQuestions = t.businessQuestions as readonly string[];

  useEffect(() => {
    if (section === "requirements") {
      localStorage.setItem("bml_customer_qualifications_reviewed", "true");
      setQualificationsReviewed(true);
    }
    if (section !== "loans" && section !== "home") return;
    setLoansLoading(true);
    setLoansError("");
    let active = true;
    Promise.all([getCustomerLoans(), getCustomerRequests(), getCustomerPaymentIntents(), getCustomerPaymentRecords()])
      .then(([customerLoans, customerRequests, intents, records]) => {
        if (!active) return;
        setLoans(customerLoans);
        setRequests(customerRequests);
        setPaymentIntents(intents);
        setPaymentRecords(records);
      })
      .catch(() => { if (active) setLoansError(t.loadLoansError); })
      .finally(() => { if (active) setLoansLoading(false); });
    return () => { active = false; };
  }, [section, t.loadLoansError]);

  const latestRequest = (type: CustomerRequest["requestType"]) => requests.filter(request => request.requestType === type).sort((a, b) => b.id - a.id)[0];
  const groupRequest = latestRequest("group_registration");
  const assessmentRequest = latestRequest("assessment");
  const applicationRequest = latestRequest("loan");
  const currentLoan = loans[0];
  const english = language === "en";
  const journeySteps = [
    { label: english ? "Choose a loan type" : "Chagua aina ya mkopo", status: selectedProduct ? (english ? selectedProduct : selectedProduct === "Group" ? "Mkopo wa Kikundi" : "Mkopo wa Dharura wa Biashara") : (english ? "Not selected" : "Haijachaguliwa"), done: Boolean(selectedProduct), action: english ? "View loan types" : "Angalia aina za mikopo", section: "offers" },
    { label: english ? "Review qualifications" : "Pitia vigezo", status: qualificationsReviewed ? (english ? "Reviewed" : "Vimepitiwa") : (english ? "Not reviewed" : "Havijapitiwa"), done: qualificationsReviewed, action: english ? "View qualifications" : "Angalia vigezo", section: "requirements" },
    { label: english ? "Register group as chairperson" : "Sajili kikundi kama mwenyekiti", status: groupRequest ? `${english ? "Submitted" : "Limetumwa"} · ${groupRequest.status}` : (english ? "Not registered" : "Hakijasajiliwa"), done: Boolean(groupRequest), action: english ? "Register group" : "Sajili kikundi", section: "register-group" },
    { label: english ? "Request group assessment" : "Omba tathmini ya kikundi", status: assessmentRequest ? `${english ? "Officer review" : "Uhakiki wa afisa"} · ${assessmentRequest.status}` : (english ? "Waiting for group registration" : "Inasubiri usajili wa kikundi"), done: assessmentRequest?.status === "approved", action: english ? "Request assessment" : "Omba tathmini", section: "request-assessment" },
    { label: english ? "Loan application approval" : "Idhini ya maombi ya mkopo", status: currentLoan ? currentLoan.stage === "approval" ? (english ? "Credit Committee review" : "Kamati inakagua") : currentLoan.stage === "verification" ? (english ? "Supervisor verification" : "Uhakiki wa msimamizi") : currentLoan.stage === "disbursement" || currentLoan.stage === "repayment" ? (english ? "Approved" : "Imeidhinishwa") : applicationRequest ? `${english ? "Application" : "Ombi"} · ${applicationRequest.status}` : (english ? "Officer processing" : "Afisa anashughulikia") : applicationRequest ? `${english ? "Application" : "Ombi"} · ${applicationRequest.status}` : assessmentRequest?.status === "approved" ? (english ? "Ready to apply" : "Tayari kuomba") : (english ? "Waiting for assessment approval" : "Inasubiri idhini ya tathmini"), done: Boolean(applicationRequest?.status === "approved" || currentLoan && ["disbursement", "repayment"].includes(currentLoan.stage)), action: english ? "View application" : "Angalia ombi", section: "requests" },
    { label: english ? "Disbursement status" : "Hali ya utoaji wa fedha", status: currentLoan?.stage === "disbursement" ? (english ? "Approved · awaiting transfer" : "Imeidhinishwa · inasubiri kutumwa") : ["repayment"].includes(currentLoan?.stage ?? "") ? (english ? `Disbursed${currentLoan?.transferReference ? ` · ${currentLoan.transferReference}` : ""}` : `Imetolewa${currentLoan?.transferReference ? ` · ${currentLoan.transferReference}` : ""}`) : (english ? "Not yet disbursed" : "Bado haijatolewa"), done: Boolean(currentLoan && ["repayment"].includes(currentLoan.stage)), action: english ? "View loan" : "Angalia mkopo", section: "loans" },
    { label: english ? "Repayment status" : "Hali ya marejesho", status: currentLoan?.loanStatus === "closed" ? (english ? "Fully repaid" : "Umelipwa wote") : currentLoan?.loanStatus === "active" ? (english ? "Repayment in progress" : "Marejesho yanaendelea") : (english ? "Not started" : "Hayajaanza"), done: currentLoan?.loanStatus === "closed", action: currentLoan?.loanStatus === "active" ? (english ? "Make a repayment" : "Fanya marejesho") : (english ? "View repayments" : "Angalia marejesho"), section: "loans" },
  ];

  const formatMoney = (value: number | null) => value === null ? t.unavailable : `TZS ${Number(value).toLocaleString("en-TZ")}`;
  const formatDate = (value: string | null) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString(language === "en" ? "en-GB" : "sw-TZ", { day: "numeric", month: "short", year: "numeric" }) : t.unavailable;

  async function refreshPayments() {
    const [intents, records] = await Promise.all([getCustomerPaymentIntents(), getCustomerPaymentRecords()]);
    setPaymentIntents(intents); setPaymentRecords(records);
  }

  function updateLoanEstimateAmount(amount: string) {
    setLoanEstimateAmount(amount);
    localStorage.setItem("bml_customer_loan_estimate_amount", amount);
  }

  async function payLoan(loan: CustomerLoan) {
    const values = paymentValues[loan.id] ?? { amount: "", mobile: "" };
    setPaymentBusyId(loan.id); setPaymentError(""); setPaymentMessage("");
    try {
      await startCustomerRepayment(loan.id, Number(values.amount), values.mobile);
      await refreshPayments();
      setPaymentMessage(language === "en" ? "Snippe sent a payment request to your phone. Approve it there; your loan balance updates after Snippe confirms payment." : "Snippe imetuma ombi la malipo kwenye simu yako. Thibitisha kwenye simu; salio litasasishwa Snippe ikithibitisha malipo.");
    } catch (reason) { setPaymentError((reason as Error).message); }
    finally { setPaymentBusyId(null); }
  }

  async function handlePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setMessage(""); setError("");
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setError(language === "en" ? "Choose a JPEG, PNG or WebP image." : "Chagua picha ya JPEG, PNG au WebP."); return; }
    if (file.size > 1_500_000) { setError(language === "en" ? "The photo must be 1.5 MB or smaller." : "Picha isiwe kubwa kuliko MB 1.5."); return; }
    const reader = new FileReader();
    reader.onerror = () => setError(language === "en" ? "Could not read that photo." : "Picha haikuweza kusomwa.");
    reader.onload = async () => {
      const image = typeof reader.result === "string" ? reader.result : "";
      if (!image) return;
      setSaving(true);
      try {
        await updateCustomerProfileImage(image);
        setPhoto(image); onProfileImage(image); setMessage(t.saved);
      } catch (e) { setError((e as Error).message); }
      finally { setSaving(false); }
    };
    reader.readAsDataURL(file);
  }

  return <div className="customer-portal">
    {message && <div className="notice-success">✓ {message}</div>}{error && <div className="note note-error">{error}</div>}
    {section === "home" && <>
      <div className="portal-topline"><span className="eyebrow">{t.kicker}</span></div>
      <section className="customer-welcome customer-home-card">
        <div className="customer-profile">
          {photo ? <img className="profile-photo" src={photo} alt={t.profile} /> : <div className="profile-photo profile-photo-empty">{username.slice(0,1).toUpperCase()}</div>}
          <div><span className="customer-info-icon">BML</span><h2>{t.hello}, {username}</h2><p>{t.intro}</p></div>
        </div>
      </section>
      <div className="home-summary-grid"><article><span>01</span><strong>{language === "en" ? "Loan information" : "Taarifa za mikopo"}</strong><p>{language === "en" ? "Explore available BML loan products and their requirements from the sidebar." : "Angalia mikopo ya BML na mahitaji yake kupitia menyu ya pembeni."}</p></article><article><span>02</span><strong>{language === "en" ? "Your profile" : "Wasifu wako"}</strong><p>{language === "en" ? "Keep your customer profile photo up to date." : "Hakikisha picha ya wasifu wako iko sahihi."}</p></article></div>
      <section className="customer-journey-section"><div className="section-heading"><div><span className="eyebrow">{english ? "YOUR LOAN JOURNEY" : "MCHAKATO WAKO WA MKOPO"}</span><h2>{english ? "Application progress" : "Maendeleo ya maombi"}</h2></div><button className="text-action" type="button" disabled={loansLoading} onClick={() => onNavigate("requests")}>{english ? "View all requests →" : "Angalia maombi yote →"}</button></div>
        {loansError && <p className="note note-error" role="alert">{loansError}</p>}
        {loansLoading && <p className="muted" role="status">{english ? "Loading your progress…" : "Inapakia maendeleo yako…"}</p>}
        <ol className="customer-journey">{journeySteps.map((step, index) => <li className={step.done ? "journey-step journey-step-done" : "journey-step"} key={step.label}><span className="journey-number">{step.done ? "✓" : String(index + 1).padStart(2, "0")}</span><div className="journey-copy"><strong>{step.label}</strong><span>{step.status}</span></div><button className="text-action" type="button" onClick={() => onNavigate(step.section)}>{step.action} →</button></li>)}</ol>
      </section>
    </>}

    {section === "profile" && <section className="customer-welcome customer-welcome-profile">
      <div className="customer-profile">
        {photo ? <img className="profile-photo" src={photo} alt={t.profile} /> : <div className="profile-photo profile-photo-empty">{username.slice(0,1).toUpperCase()}</div>}
        <div><span className="customer-info-icon">BML</span><h2>{t.profile}</h2><p>{t.photoHelp}</p></div>
      </div>
      <label className="profile-change"><span>{saving ? (language === "en" ? "Saving…" : "Inahifadhi…") : t.change}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhoto} disabled={saving} /></label>
    </section>}

    {section === "loans" && <section className="portal-section"><div className="section-heading"><div><span className="eyebrow">BML CUSTOMER ACCOUNTS</span><p>{t.loanIntro}</p></div></div>
      {paymentMessage && <div className="notice-success" role="status">{paymentMessage}</div>}{paymentError && <p className="note note-error" role="alert">{paymentError}</p>}
      {loansLoading && <p className="muted" role="status">{t.loadingLoans}</p>}
      {loansError && <p className="note note-error" role="alert">{loansError}</p>}
      {!loansLoading && !loansError && loans.length === 0 && <p className="empty-state">{t.noLoans}</p>}
      <div className="customer-loan-list">{loans.map(loan => <article className="customer-loan" key={loan.id}>
        <div className="customer-loan-heading"><div><span className="eyebrow">{loan.loanNumber || `${t.loanNumber} #${loan.id}`}</span><h3>{loan.product}</h3></div><span className={`status-pill ${loan.loanStatus === "active" ? "status-green" : loan.loanStatus === "in_progress" ? "status-amber" : "status-neutral"}`}>{t.statusLabels[loan.loanStatus]}</span></div>
        <p className="customer-loan-stage">{language === "en" ? "Application stage" : "Hatua ya maombi"}: <strong>{loan.stage === "approval" ? (language === "en" ? "Credit Committee review" : "Uhakiki wa Kamati ya Mikopo") : loan.stage === "disbursement" ? (language === "en" ? "Approved · awaiting disbursement" : "Imeidhinishwa · inasubiri kutolewa") : loan.stage === "repayment" ? (language === "en" ? "Disbursed · repayment" : "Umetolewa · marejesho") : loan.stage[0].toUpperCase() + loan.stage.slice(1)}</strong>{loan.transferReference && <span> · {language === "en" ? "Transfer reference" : "Namba ya muamala"}: {loan.transferReference}</span>}</p>
        <dl className="customer-loan-metrics">
          <div><dt>{t.loanBalance}</dt><dd>{formatMoney(loan.principalAmount)}</dd></div>
          <div><dt>{language === "en" ? "Net disbursed" : "Kiasi kilichopokelewa"}</dt><dd>{formatMoney(loan.principalAmount === null ? null : Number(loan.principalAmount) - Number(loan.savingsAmount ?? 0) - Number(loan.processingFeeAmount ?? 0))}</dd></div>
          <div><dt>{t.amountDue}</dt><dd>{formatMoney(loan.amountDue)}</dd></div>
          <div><dt>{language === "en" ? "Weekly installment" : "Malipo ya wiki"}</dt><dd>{formatMoney(loan.weeklyInstallmentAmount)}</dd></div>
          <div><dt>{language === "en" ? "Installments" : "Idadi ya malipo"}</dt><dd>{loan.installmentCount ?? "—"}</dd></div>
          <div><dt>{language === "en" ? "Final installment" : "Malipo ya mwisho"}</dt><dd>{formatMoney(loan.finalInstallmentAmount)}</dd></div>
          <div><dt>{t.amountPaid}</dt><dd>{formatMoney(loan.amountPaid)}</dd></div>
          <div><dt>{language === "en" ? "Savings deducted" : "Akiba iliyokatwa"}</dt><dd>{formatMoney(loan.savingsAmount)}</dd></div>
          <div><dt>{language === "en" ? "Processing fee" : "Ada ya uchakataji"}</dt><dd>{formatMoney(loan.processingFeeAmount)}</dd></div>
          <div><dt>{language === "en" ? "Total interest" : "Jumla ya riba"}</dt><dd>{formatMoney(loan.interestAmount)}</dd></div>
          <div><dt>{t.outstanding}</dt><dd>{formatMoney(loan.outstandingBalance)}</dd></div>
          <div><dt>{t.performance}</dt><dd>{loan.repaymentPerformance === null ? t.unavailable : `${Number(loan.repaymentPerformance).toLocaleString()}%`}</dd></div>
          <div><dt>{t.arrears}</dt><dd>{formatMoney(loan.arrears)}</dd></div>
          <div><dt>{t.nextDue}</dt><dd>{formatDate(loan.nextDueDate)}</dd></div>
        </dl>
        {loan.loanStatus === "active" && <div className="customer-repayment-form">
          <strong>{language === "en" ? "Make a repayment" : "Lipa marejesho"}</strong>
          <div className="customer-repayment-controls">
            <label>{language === "en" ? "Amount (TZS)" : "Kiasi (TZS)"}<input type="number" min="500" max={loan.outstandingBalance} step="1" value={paymentValues[loan.id]?.amount ?? ""} onChange={(event) => setPaymentValues(current => ({ ...current, [loan.id]: { ...current[loan.id], amount: event.target.value, mobile: current[loan.id]?.mobile ?? "" } }))} /></label>
            <label>{language === "en" ? "Mobile number for Snippe USSD prompt (255…)" : "Namba ya simu ya ombi la Snippe (255…)"}<input type="tel" inputMode="numeric" placeholder="2557XXXXXXXX" value={paymentValues[loan.id]?.mobile ?? ""} onChange={(event) => setPaymentValues(current => ({ ...current, [loan.id]: { ...current[loan.id], amount: current[loan.id]?.amount ?? "", mobile: event.target.value } }))} /></label>
            <button className="btn btn-primary" type="button" disabled={paymentBusyId !== null || !paymentValues[loan.id]?.amount} onClick={() => void payLoan(loan)}>{paymentBusyId === loan.id ? (language === "en" ? "Starting…" : "Inaanza…") : (language === "en" ? "Make a repayment" : "Fanya marejesho")}</button>
          </div>
        </div>}
      </article>)}</div>
      {paymentIntents.length > 0 && <section className="customer-payment-followups"><h3>{language === "en" ? "Snippe payment requests" : "Maombi ya malipo ya Snippe"}</h3>{paymentIntents.slice(0, 5).map(intent => <article key={intent.id}><div><strong>{intent.loanNumber} · {formatMoney(intent.amount)}</strong><small>Ref {intent.gatewayReference || intent.orderId} · {intent.status}</small></div></article>)}</section>}
      <section className="customer-payment-history"><div className="section-heading"><div><h2>{language === "en" ? "Payment history" : "Historia ya malipo"}</h2></div><button type="button" className="text-action" onClick={() => void refreshPayments()}>{language === "en" ? "Refresh" : "Sasisha"}</button></div><div className="table-wrap"><table><thead><tr><th>{language === "en" ? "Date" : "Tarehe"}</th><th>{language === "en" ? "Loan" : "Mkopo"}</th><th>{language === "en" ? "Amount" : "Kiasi"}</th><th>{language === "en" ? "Payment method" : "Njia ya malipo"}</th><th>{language === "en" ? "Reference" : "Kumbukumbu"}</th></tr></thead><tbody>{paymentRecords.map(record => <tr key={record.id}><td>{new Date(record.receivedAt).toLocaleString()}</td><td>{record.loanNumber}</td><td>{formatMoney(record.amount)}</td><td>{record.provider === "snippe" ? "Snippe" : record.provider}</td><td>{record.reference || "—"}</td></tr>)}{!paymentRecords.length && <tr><td colSpan={5} className="empty-state">{language === "en" ? "No repayments have been confirmed yet." : "Bado hakuna marejesho yaliyothibitishwa."}</td></tr>}</tbody></table></div></section>
    </section>}

    {section === "offers" && <section className="portal-section"><div className="section-heading"><div><span className="eyebrow">STEP 1 · LOAN PRODUCTS</span><h2>{t.offers}</h2><p>{t.offerIntro}</p></div></div><div className="offer-grid">
      <article className="offer-card offer-group"><span className="offer-symbol">G</span><span className="offer-tag">GROUP FINANCING</span><h3>{t.group}</h3><p>{t.groupText}</p><button className="btn btn-primary" type="button" onClick={() => { localStorage.setItem("bml_customer_selected_product", "Group"); localStorage.setItem("bml_customer_qualifications_reviewed", "false"); setSelectedProduct("Group"); setQualificationsReviewed(false); onNavigate("requirements"); }}>{selectedProduct === "Group" ? "Selected · review qualifications" : "Choose Group Loan"} →</button></article>
      <article className="offer-card offer-business"><span className="offer-symbol">B</span><span className="offer-tag">BUSINESS FINANCING</span><h3>{t.business}</h3><p>{t.businessText}</p><button className="btn btn-primary" type="button" onClick={() => { localStorage.setItem("bml_customer_selected_product", "Business Emergency"); localStorage.setItem("bml_customer_qualifications_reviewed", "false"); setSelectedProduct("Business Emergency"); setQualificationsReviewed(false); onNavigate("requirements"); }}>{selectedProduct === "Business Emergency" ? "Selected · review qualifications" : "Choose Business Emergency"} →</button></article>
    </div><LoanTermsGuide language={language} amount={loanEstimateAmount} onAmountChange={updateLoanEstimateAmount} /></section>}

    {section === "requirements" && <section className="portal-section"><div className="section-heading"><div><span className="eyebrow">STEP 2 · GET READY</span><h2>{t.requirements}</h2><p>{t.requirementsIntro}{selectedProduct ? ` ${english ? "Selected product:" : "Aina iliyochaguliwa:"} ${selectedProduct}.` : ""}</p></div><button className="btn btn-primary" type="button" onClick={() => onNavigate("register-group")}>{english ? "Continue to group registration" : "Endelea kusajili kikundi"} →</button></div><div className="requirements-grid">
      <article className="requirements-card"><h3><span className="requirements-number">01</span>{t.groupReq}</h3><ul>{groupItems.map(item => <li key={item}>{item}</li>)}</ul></article>
      <article className="requirements-card"><h3><span className="requirements-number">02</span>{t.businessReq}</h3><ul>{businessItems.map(item => <li key={item}>{item}</li>)}</ul></article>
    </div><div className="section-heading"><div><h2>{t.assessmentQuestions}</h2><p>{t.assessmentIntro}</p></div></div><div className="requirements-grid">
      <article className="requirements-card"><h3><span className="requirements-number">03</span>{t.groupReq}</h3><ul>{groupQuestions.map(question => <li key={question}>{question}</li>)}</ul></article>
      <article className="requirements-card"><h3><span className="requirements-number">04</span>{t.businessReq}</h3><ul>{businessQuestions.map(question => <li key={question}>{question}</li>)}</ul></article>
    </div></section>}

    {section === "about" && <section className="portal-section about-section"><div><span className="eyebrow">BRIANNA MICROFINANCE LIMITED</span><h2>{t.about}</h2><p>{t.aboutText}</p></div><img className="about-logo" src="/assets/brianna-logo.png" alt="Brianna Microfinance logo" /></section>}

    {section === "news" && <section className="portal-section"><div className="section-heading"><div><span className="eyebrow">CUSTOMER INFORMATION</span><h2>{t.news}</h2><p>{t.newsIntro}</p></div></div><p className="empty-state">{t.newsEmpty}</p></section>}

    {section === "location" && <section className="portal-section"><div className="section-heading"><div><span className="eyebrow">VISIT OUR OFFICE</span><h2>{t.location}</h2><p>{t.locationText}</p></div><a className="btn btn-ghost" href={`https://www.google.com/maps/search/?api=1&query=${addressQuery}`} target="_blank" rel="noreferrer">{t.openMap} ↗</a></div><div className="map-card"><iframe title={t.mapLabel} src={`https://maps.google.com/maps?q=${addressQuery}&output=embed`} loading="lazy" referrerPolicy="no-referrer-when-downgrade"/><div className="map-address"><span className="map-pin">⌖</span><div><strong>Brianna Microfinance Limited</strong><p>{address}</p></div></div></div></section>}
    <footer className="customer-footer">{t.help}<span>© Brianna Microfinance Limited</span></footer>
  </div>;
}