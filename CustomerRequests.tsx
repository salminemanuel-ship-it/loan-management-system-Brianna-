import { useEffect, useState, type FormEvent } from "react";
import { getCustomerRequests, getCustomerZones, submitCustomerRequest } from "../api";
import LoanTermsGuide from "./LoanTermsGuide";
import { calculateLoanTerms } from "../loanTerms";
import type { CustomerRequest, CustomerRequestType } from "../types";

type Language = "en" | "sw";
type Field = { name: string; label: string; type?: "number" | "date"; required?: boolean; placeholder?: string; multiline?: boolean };
type GroupMemberRow = { fullName: string; location: string; nationalId: string; phoneNumber: string; age: number; businessType: string; referees: string };

const memberColumns = ["Full Names", "Location", "National ID", "Phone Number", "Age", "Business Type", "Referees"];

const requestCopy = {
  en: {
    title: "Customer requests", intro: "Send a request directly to your BML Loan Officer and follow its progress.",
    types: ["Request a loan", "Register a group", "Request an assessment", "Report member performance", "Group requests"],
    summaries: ["Loan application request", "Group registration request", "Assessment request", "Member performance report"],
    fields: [
      [{ name: "product", label: "Loan product" }, { name: "amount", label: "Amount requested (TZS)", type: "number" as const }, { name: "purpose", label: "How will you use the loan?" }, { name: "repayment", label: "Expected repayment source" }],
      [{ name: "groupName", label: "Group name" }, { name: "location", label: "Group location" }, { name: "zone", label: "Service zone" }, { name: "chairpersonName", label: "Chairperson full name" }, { name: "chairpersonPhone", label: "Chairperson mobile number", type: "tel" as const }, { name: "accountantName", label: "Accountant full name" }, { name: "accountantPhone", label: "Accountant phone number", type: "tel" as const }],
      [{ name: "subject", label: "Who or what should be assessed?", placeholder: "Your business or group name" }, { name: "location", label: "Business or meeting location" }, { name: "preferredDate", label: "Preferred visit date", type: "date" as const }, { name: "notes", label: "What should the officer know?" }],
      [{ name: "memberName", label: "Group member's full name" }, { name: "groupName", label: "Group name" }, { name: "details", label: "Describe the member's performance" }],
    ] as Field[][],
    submit: "Submit request", submitting: "Submitting…", sent: "Your request was sent to BML.", loadError: "Could not load your requests.", empty: "You have not submitted any requests yet.", loading: "Loading requests…", status: { new: "New", reviewing: "Reviewing", visited: "Visit recorded", approved: "Approved", rejected: "Not approved", completed: "Completed" }, failed: "Could not submit your request.",
  },
  sw: {
    title: "Maombi ya mteja", intro: "Tuma ombi moja kwa moja kwa Afisa Mikopo wa BML na ufuatilie hatua yake.",
    types: ["Omba mkopo", "Sajili kikundi", "Omba tathmini", "Ripoti utendaji wa mwanachama", "Maombi ya kikundi"],
    summaries: ["Ombi la mkopo", "Ombi la usajili wa kikundi", "Ombi la tathmini", "Ripoti ya utendaji wa mwanachama"],
    fields: [
      [{ name: "product", label: "Aina ya mkopo" }, { name: "amount", label: "Kiasi kinachoombwa (TZS)", type: "number" as const }, { name: "purpose", label: "Utatumia mkopo kwa ajili gani?" }, { name: "repayment", label: "Chanzo cha marejesho" }],
      [{ name: "groupName", label: "Jina la kikundi" }, { name: "location", label: "Mahali kilipo kikundi" }, { name: "zone", label: "Eneo la huduma" }, { name: "chairpersonName", label: "Jina kamili la mwenyekiti" }, { name: "chairpersonPhone", label: "Namba ya simu ya mwenyekiti", type: "tel" as const }, { name: "accountantName", label: "Jina kamili la mweka hazina" }, { name: "accountantPhone", label: "Namba ya simu ya mweka hazina", type: "tel" as const }],
      [{ name: "subject", label: "Nani au nini kifanyiwe tathmini?", placeholder: "Biashara au jina la kikundi" }, { name: "location", label: "Eneo la biashara au mikutano" }, { name: "preferredDate", label: "Tarehe unayopendelea ya ziara", type: "date" as const }, { name: "notes", label: "Afisa anapaswa kujua nini?" }],
      [{ name: "memberName", label: "Jina kamili la mwanachama" }, { name: "groupName", label: "Jina la kikundi" }, { name: "details", label: "Eleza utendaji wa mwanachama" }],
    ] as Field[][],
    submit: "Tuma ombi", submitting: "Inatuma…", sent: "Ombi lako limetumwa BML.", loadError: "Imeshindwa kupakia maombi yako.", empty: "Bado hujatuma ombi.", loading: "Inapakia maombi…", status: { new: "Jipya", reviewing: "Linakaguliwa", visited: "Ziara imerekodiwa", approved: "Limeidhinishwa", rejected: "Halijaidhinishwa", completed: "Limekamilika" }, failed: "Imeshindwa kutuma ombi lako.",
  },
} as const;

const requestTypeForIndex: CustomerRequestType[] = ["loan", "group_registration", "assessment", "member_performance"];
const typeIndex = (type: CustomerRequestType) => requestTypeForIndex.indexOf(type);

export default function CustomerRequests({ section, language, registeredPhone, onNavigate }: { section: string; language: Language; registeredPhone: string; onNavigate: (section: string) => void }) {
  const t = requestCopy[language];
  const index = ["request-loan", "register-group", "request-assessment", "report-performance"].indexOf(section);
  const isHistory = section === "requests";
  const [values, setValues] = useState<Record<string, string>>(() => ({
    product: localStorage.getItem("bml_customer_selected_product") ?? "",
    amount: "",
  }));
  const [loanTermsReviewed, setLoanTermsReviewed] = useState(false);
  const [members, setMembers] = useState<GroupMemberRow[]>([]);
  const [rosterError, setRosterError] = useState("");
  const [requests, setRequests] = useState<CustomerRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [requestLoadError, setRequestLoadError] = useState("");
  const [zones, setZones] = useState<string[]>([]);
  const workflowSection = isHistory || ["register-group", "request-assessment", "request-loan", "report-performance"].includes(section);
  const selectedProduct = localStorage.getItem("bml_customer_selected_product") ?? "";
  const qualificationsReviewed = localStorage.getItem("bml_customer_qualifications_reviewed") === "true";

  async function refreshRequests() {
    setRequestsLoading(true); setRequestLoadError("");
    try { setRequests(await getCustomerRequests()); }
    catch { setRequestLoadError(t.loadError); }
    finally { setRequestsLoading(false); }
  }

  useEffect(() => {
    if (!workflowSection) return;
    void refreshRequests();
  }, [workflowSection, section, notice]);

  useEffect(() => { getCustomerZones().then(setZones).catch(() => setZones([])); }, []);

  const hasGroupRegistration = requests.some(request => request.requestType === "group_registration");
  const groupRegistration = requests.filter(request => request.requestType === "group_registration").sort((a, b) => b.id - a.id)[0];
  const registeredMembers = Array.isArray(groupRegistration?.details.members) ? groupRegistration.details.members : [];
  const normalizePhone = (phone: string) => phone.replace(/\D/g, "").replace(/^0/, "255");
  const chairpersonPhoneMatches = normalizePhone(values.chairpersonPhone ?? "") === normalizePhone(registeredPhone);
  const assessment = requests.filter(request => request.requestType === "assessment").sort((a, b) => b.id - a.id)[0];
  const loanApproved = assessment?.status === "approved";
  const assessmentActive = assessment && ["new", "reviewing", "visited", "approved"].includes(assessment.status);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (index < 0) return;
    if (index === 1 && !selectedProduct) {
      setError(language === "en" ? "Choose a loan product before registering your group." : "Chagua aina ya mkopo kabla ya kusajili kikundi.");
      return;
    }
    if (index === 1 && !qualificationsReviewed) {
      setError(language === "en" ? "Review the selected product's qualifications before registering your group." : "Pitia vigezo vya mkopo uliochagua kabla ya kusajili kikundi.");
      return;
    }
    if (index === 2 && !hasGroupRegistration) {
      setError("Submit your group registration before requesting an assessment.");
      return;
    }
    if (index === 2 && assessmentActive) {
      setError("Your current assessment request is still active. Check its status before submitting another.");
      return;
    }
    if (index === 0 && !loanApproved) {
      setError("A loan officer must visit and approve your assessment before you can request a loan.");
      return;
    }
    if (index === 0 && !loanTermsReviewed) {
      setError(language === "en" ? "Review and acknowledge the loan estimate before submitting." : "Pitia na uthibitishe kuwa umeelewa makadirio ya mkopo kabla ya kutuma.");
      return;
    }
    if (index === 1 && members.length === 0) {
      setRosterError(language === "en" ? "Upload a completed member spreadsheet first." : "Pakia kwanza jedwali la wanachama lililojazwa.");
      return;
    }
    if (index === 1 && !chairpersonPhoneMatches) {
      setError(language === "en" ? "Only the chairperson can register this group. Use the mobile number linked to the chairperson's customer account." : "Mwenyekiti pekee ndiye anayeruhusiwa kusajili kikundi hiki. Tumia namba ya simu iliyosajiliwa kwenye akaunti ya mwenyekiti.");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const details = index === 1
        ? { ...values, memberCount: members.length, members }
        : index === 0
          ? {
              ...values,
              groupName: groupRegistration?.details.groupName ?? "",
              zone: groupRegistration?.details.zone ?? "",
              groupLoanStatus: "Assessment approved",
              memberCount: registeredMembers.length,
              members: registeredMembers,
              repaymentEstimate: {
                ...calculateLoanTerms(Number(values.amount)),
                reviewed: true,
                reviewedAt: new Date().toISOString(),
              },
            }
          : values;
      await submitCustomerRequest({ requestType: requestTypeForIndex[index], summary: t.summaries[index], details });
      setValues({}); setMembers([]); setLoanTermsReviewed(false); setNotice(t.sent);
    } catch (reason) { setError((reason as Error).message || t.failed); }
    finally { setBusy(false); }
  }

  async function downloadRosterTemplate() {
    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Group Members");
    sheet.addRow(memberColumns);
    sheet.addRow(["", "", "", "", "", "", ""]);
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.columns = [24, 26, 20, 18, 10, 24, 30].map((width) => ({ width }));
    const data = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "bml-group-members-template.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importRoster(file?: File) {
    setMembers([]); setRosterError("");
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("The spreadsheet must be 10 MB or smaller.");
      const ExcelJS = await import("exceljs");
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const sheet = workbook.worksheets[0];
      if (!sheet) throw new Error("The workbook has no worksheet.");
      if (sheet.rowCount > 501) throw new Error("A roster can contain at most 500 member rows.");
      const headerRow = sheet.getRow(1);
      const headerCells = Array.from({ length: headerRow.cellCount }, (_, index) => headerRow.getCell(index + 1).text ?? "");
      const headers = headerCells.reduce<Record<string, string>>((map, header) => {
        map[header.trim().toLowerCase().replace(/[^a-z]/g, "")] = header;
        return map;
      }, {});
      const rows: Record<string, unknown>[] = [];
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        rows.push(Object.fromEntries(headerCells.map((header, index) => [header, row.getCell(index + 1).text ?? ""])));
      });
      const aliases: Record<keyof GroupMemberRow, string[]> = {
        fullName: ["fullnames", "fullname", "name"], location: ["location"], nationalId: ["nationalid", "nationalidentification"],
        phoneNumber: ["phonenumber", "phone", "mobile"], age: ["age"], businessType: ["businesstype", "business"], referees: ["referees", "referee"],
      };
      const headerFor = (key: keyof GroupMemberRow) => aliases[key].map(alias => headers[alias]).find(Boolean);
      const missing = Object.keys(aliases).filter(key => !headerFor(key as keyof GroupMemberRow));
      if (missing.length) throw new Error(`Missing columns: ${missing.join(", ")}. Download the template and keep its column headings.`);
      const imported = rows.map((row, index) => {
        const value = (key: keyof GroupMemberRow) => String(row[headerFor(key)!] ?? "").trim();
        const raw = { fullName: value("fullName"), location: value("location"), nationalId: value("nationalId"), phoneNumber: value("phoneNumber"), age: value("age"), businessType: value("businessType"), referees: value("referees") };
        return { ...raw, age: Number(raw.age), rowNumber: index + 2, isBlank: Object.values(raw).every(item => item === "") };
      }).filter(row => !row.isBlank);
      if (!imported.length) throw new Error("Add at least one member row to the spreadsheet.");
      const invalid = imported.find(row => !row.fullName || !row.location || !row.nationalId || !row.phoneNumber || !Number.isInteger(row.age) || row.age < 18 || !row.businessType || !row.referees);
      if (invalid) throw new Error(`Complete all fields and enter an age of 18 or above (check spreadsheet row ${invalid.rowNumber}).`);
      setMembers(imported.map(({ rowNumber: _rowNumber, isBlank: _isBlank, ...member }) => member));
    } catch (reason) {
      setRosterError((reason as Error).message || "Could not read this spreadsheet.");
    }
  }

  return <section className="portal-section customer-request-area">
    {error && <p className="note note-error" role="alert">{error}</p>}
    {notice && <div className="notice-success" role="status">{notice}{index === 1 && <button className="text-action next-workflow-action" type="button" onClick={() => onNavigate("request-assessment")}>Request assessment →</button>}</div>}
    {isHistory ? <>
      {loading && <p className="muted" role="status">{t.loading}</p>}
      {!loading && !error && !requests.length && <p className="empty-state">{t.empty}</p>}
      <div className="request-list">{requests.map((request) => {
        const typeNumber = typeIndex(request.requestType);
        return <article className="customer-request-row" key={request.id}>
          <div className="customer-request-title"><div><span className="eyebrow">{t.summaries[typeNumber]}</span><h3>{request.summary}</h3><time dateTime={request.createdAt}>{new Date(request.createdAt).toLocaleDateString(language === "en" ? "en-GB" : "sw-TZ", { day: "numeric", month: "short", year: "numeric" })}</time></div><span className={`status-pill ${request.status === "completed" ? "status-green" : request.status === "reviewing" ? "status-amber" : "status-neutral"}`}>{t.status[request.status]}</span></div>
          <dl className="request-details">{Object.entries(request.details).filter(([key, value]) => key !== "members" && !Array.isArray(value) && (value === null || typeof value !== "object")).map(([key, value]) => <div key={key}><dt>{key.replace(/([A-Z])/g, " $1")}</dt><dd>{String(value)}</dd></div>)}</dl>
          {Array.isArray(request.details.members) && <><p className="roster-count">{request.details.members.length} group members included</p><div className="table-wrap roster-table-wrap"><table><thead><tr><th>Full names</th><th>Location</th><th>National ID</th><th>Phone number</th><th>Age</th><th>Business type</th><th>Referees</th></tr></thead><tbody>{request.details.members.map((item, memberIndex) => { const member = item && typeof item === "object" ? item as Record<string, unknown> : {}; return <tr key={`${String(member.nationalId ?? memberIndex)}-${memberIndex}`}><td>{String(member.fullName ?? "")}</td><td>{String(member.location ?? "")}</td><td>{String(member.nationalId ?? "")}</td><td>{String(member.phoneNumber ?? "")}</td><td>{String(member.age ?? "")}</td><td>{String(member.businessType ?? "")}</td><td>{String(member.referees ?? "")}</td></tr>; })}</tbody></table></div></>}
        </article>;
      })}</div>
    </> : index >= 0 && <form className="customer-request-form" onSubmit={handleSubmit}>
      {workflowSection && requestLoadError && <p className="note note-error" role="alert">{requestLoadError}<button className="text-action" type="button" onClick={() => void refreshRequests()}>Retry</button></p>}
      {workflowSection && <button className="text-action workflow-refresh" type="button" disabled={requestsLoading} onClick={() => void refreshRequests()}>{requestsLoading ? "Refreshing status…" : "Refresh workflow status"}</button>}
      {index === 1 && !selectedProduct && <p className="note">{language === "en" ? "Choose a loan product first." : "Chagua kwanza aina ya mkopo."}</p>}
      {index === 1 && selectedProduct && !qualificationsReviewed && <p className="note">{language === "en" ? "Review qualifications for your selected product before registering the group." : "Pitia vigezo vya aina ya mkopo uliyochagua kabla ya kusajili kikundi."}</p>}
      {index === 2 && !hasGroupRegistration && <p className="note">Submit your group registration before requesting an assessment.</p>}
      {index === 2 && assessment && <p className={assessment.status === "rejected" ? "note note-error" : "notice-success"}>Assessment status: {t.status[assessment.status]}{assessmentActive && ". Your current request must be completed before starting another."}</p>}
      {index === 0 && !loanApproved && <p className="note">{assessment ? `Assessment status: ${t.status[assessment.status]}. A loan officer must visit and approve it before this request is available.` : "Request an assessment after group registration. A loan officer must visit and approve it before you can request a loan."}</p>}
      {index === 0 && loanApproved && <><div className="loan-request-summary"><div><span>Group</span><strong>{String(groupRegistration?.details.groupName ?? "Registered group")}</strong></div><div><span>Group loan status</span><strong className="status-pill status-green">Assessment approved</strong></div><div><span>Registered members</span><strong>{registeredMembers.length}</strong></div></div>{registeredMembers.length > 0 && <div className="table-wrap roster-table-wrap loan-roster-preview"><table><thead><tr><th>Full names</th><th>Location</th><th>National ID</th><th>Phone number</th><th>Age</th><th>Business type</th><th>Referees</th></tr></thead><tbody>{registeredMembers.map((item, memberIndex) => { const member = item && typeof item === "object" ? item as Record<string, unknown> : {}; return <tr key={`${String(member.nationalId ?? memberIndex)}-${memberIndex}`}><td>{String(member.fullName ?? "")}</td><td>{String(member.location ?? "")}</td><td>{String(member.nationalId ?? "")}</td><td>{String(member.phoneNumber ?? "")}</td><td>{String(member.age ?? "")}</td><td>{String(member.businessType ?? "")}</td><td>{String(member.referees ?? "")}</td></tr>; })}</tbody></table></div>}</>}
      {t.fields[index].map((field) => <label key={field.name}>{field.label}{field.name === "product" ? <select required value={values.product ?? ""} onChange={(event) => { setValues((current) => ({ ...current, product: event.target.value })); localStorage.setItem("bml_customer_selected_product", event.target.value); }}><option value="">{language === "en" ? "Select a loan product" : "Chagua aina ya mkopo"}</option><option value="Group">{language === "en" ? "Group Loan" : "Mkopo wa Kikundi"}</option><option value="Business Emergency">{language === "en" ? "Business Emergency Loan" : "Mkopo wa Dharura wa Biashara"}</option></select> : field.multiline ? <textarea required={field.required ?? true} rows={5} placeholder={field.placeholder} value={values[field.name] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))} /> : <input required={field.required ?? true} list={field.name === "zone" ? "bml-zone-options" : undefined} type={field.type ?? "text"} min={field.type === "number" ? "1" : undefined} step={field.type === "number" ? "1" : undefined} placeholder={field.name === "zone" ? (language === "en" ? "Choose or enter your existing loan group zone" : "Chagua au andika eneo la kikundi") : field.placeholder} value={values[field.name] ?? ""} onChange={(event) => { setValues((current) => ({ ...current, [field.name]: event.target.value })); if (index === 0 && field.name === "amount") { setLoanTermsReviewed(false); localStorage.setItem("bml_customer_loan_estimate_amount", event.target.value); } }} />}{field.name === "zone" && <><datalist id="bml-zone-options">{zones.map((zone) => <option key={zone} value={zone} />)}</datalist><small className="field-help">Use the same zone name used for BML loan groups. The zone supervisor receives this assessment request.</small></>}{index === 1 && field.name === "chairpersonPhone" && <small className="field-help">Register using the chairperson's customer account phone number. Other members are included in the roster.</small>}</label>)}
      {index === 0 && <LoanTermsGuide
        language={language}
        amount={values.amount ?? ""}
        acknowledged={loanTermsReviewed}
        onAcknowledgedChange={setLoanTermsReviewed}
      />}
      {index === 1 && <div className="group-roster-upload"><div className="roster-heading"><div><strong>Member details spreadsheet</strong><p>Fill full names, location, national ID, phone number, age, business type, and referees for each member.</p></div><button className="btn btn-ghost" type="button" onClick={() => void downloadRosterTemplate()}>Download Excel template</button></div><label className="roster-file-label">Upload completed Excel file (.xlsx or .xls)<input type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={(event) => void importRoster(event.target.files?.[0])} /></label>{rosterError && <p className="note note-error" role="alert">{rosterError}</p>}{members.length > 0 && <><p className="roster-count" role="status">{members.length} members ready to submit</p><div className="table-wrap roster-table-wrap"><table><thead><tr>{memberColumns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{members.map((member, memberIndex) => <tr key={`${member.nationalId}-${memberIndex}`}><td>{member.fullName}</td><td>{member.location}</td><td>{member.nationalId}</td><td>{member.phoneNumber}</td><td>{member.age}</td><td>{member.businessType}</td><td>{member.referees}</td></tr>)}</tbody></table></div><button className="text-action" type="button" onClick={() => { setMembers([]); setRosterError(""); }}>Remove uploaded spreadsheet</button></>}</div>}
      <button className="btn btn-primary" type="submit" disabled={busy || (index === 1 && (!selectedProduct || !qualificationsReviewed || !chairpersonPhoneMatches)) || (index === 2 && (!hasGroupRegistration || Boolean(assessmentActive))) || (index === 0 && (!loanApproved || !loanTermsReviewed)) || requestsLoading}>{busy ? t.submitting : t.submit}</button>
    </form>}
  </section>;
}
