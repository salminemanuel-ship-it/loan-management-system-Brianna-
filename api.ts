import type { AdminAccount, CommitteeDecisionRecord, CustomerPaymentIntent, CustomerPaymentRecord, LoanPayoutIntent, MessageRecipient, PasswordResetRequest, RecentSignIn, UserMessage, LoanRecord, ManagementWorkspace, Overview, AssessmentPayload, AssessmentRecord, AssessmentSaveResult, AssessmentSubject, ClientInput, ClientRecord, ClientSaveResult, ClientSummary, CustomerLoan, CustomerRequest, CustomerRequestStatus, CustomerRequestType, DashboardData, GroupDetail, GroupInput, GroupResult, GroupSummary, LoginResult, Member, MemberInput, PendingStaffRequest, Role, User } from "./types";

// Leave VITE_API_URL empty to use the same origin (production reverse proxy).
// Local-only accounts must be opted into explicitly and should never be enabled in a host build.
const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.trim() ?? "";
const LOCAL_DEMO_MODE = import.meta.env.VITE_LOCAL_DEMO_MODE === "true";
const API_LOCATION = API_URL || "this site";
const LOCAL_CUSTOMER_ACCOUNTS_KEY = "bml_local_customer_accounts";

interface LocalCustomerAccount { username: string; email: string; phone?: string; fullName: string; passwordDigest: string; profileImage?: string }

async function passwordDigest(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function localCustomerAccounts(): LocalCustomerAccount[] {
  try {
    const stored = localStorage.getItem(LOCAL_CUSTOMER_ACCOUNTS_KEY);
    if (stored) return JSON.parse(stored) as LocalCustomerAccount[];
    // Preserve customer accounts created by the earlier local signup flow.
    const previousKey = localStorage.getItem("bml_demo_customer_accounts");
    if (!previousKey) return [];
    localStorage.setItem(LOCAL_CUSTOMER_ACCOUNTS_KEY, previousKey);
    localStorage.removeItem("bml_demo_customer_accounts");
    return JSON.parse(previousKey) as LocalCustomerAccount[];
  }
  catch { return []; }
}

export async function getDashboard(role: Role): Promise<DashboardData> {
  if (!LOCAL_DEMO_MODE) {
    const res = await fetch(`${API_URL}/api/dashboard`, { credentials: "include" });
    if (!res.ok) throw new Error("Could not load the dashboard. Try again.");
    return res.json();
  }
  const roleLabel: Record<Role, string> = { loan_officer: "Loan Officer view", supervisor: "Supervisor view", committee: "Credit Committee view", finance: "Finance Officer view", management: "Manager view", director: "Company Director view", ceo: "Chief Executive Officer view", admin: "System Admin view", customer: "Customer view" };
  return { roleLabel: roleLabel[role], stats: [], rows: [], nextScreen: "" };
}

export async function login(
  username: string,
  password: string
): Promise<LoginResult> {
  if (!LOCAL_DEMO_MODE) {
    let res: Response;
    try {
      res = await fetch(`${API_URL}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
    } catch {
      throw new Error(`Cannot reach the BML server at ${API_LOCATION}. Start the backend and try again.`);
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message ?? "Sign-in failed. Check your details and try again.");
    }
    return res.json();
  }

  // Local-only customer accounts remain available when developing the public signup flow.
  const name = username.trim().toLowerCase();
  const localAccount = localCustomerAccounts().find((account) => account.username.toLowerCase() === name);
  if (localAccount) {
    if (localAccount.passwordDigest !== await passwordDigest(password)) {
      throw new Error("Incorrect username or password.");
    }
    sessionStorage.setItem("bml_customer_username", localAccount.username);
    return { token: "local-customer-session", user: { username: localAccount.username, role: "customer", profileImage: localAccount.profileImage } };
  }
  throw new Error("Staff sign-in requires the BML backend. Connect the backend or register a customer account.");
}

export function requestPasswordReset(email: string): Promise<{ message: string }> {
  return sendJson<{ message: string }>("/api/auth/password-reset/start", "POST", { email });
}

export function completePasswordReset(email: string, code: string, newPassword: string): Promise<{ ok: true; message: string }> {
  return sendJson<{ ok: true; message: string }>("/api/auth/password-reset/complete", "POST", { email, code, newPassword });
}

export function verifyRegistrationEmail(email: string, code: string): Promise<{ ok: true; message: string }> {
  return sendJson<{ ok: true; message: string }>("/api/auth/register/verify", "POST", { email, code });
}

export function changePassword(currentPassword: string, newPassword: string): Promise<{ ok: true }> {
  return sendJson<{ ok: true }>("/api/auth/change-password", "POST", { currentPassword, newPassword });
}

export async function getCurrentUser(): Promise<User | null> {
  if (!LOCAL_DEMO_MODE) {
    try {
      const response = await fetch(`${API_URL}/api/auth/me`, { credentials: "include" });
      if (!response.ok) return null;
      return await response.json() as User;
    } catch { return null; }
  }
  const token = sessionStorage.getItem("bml_token");
  if (!token) return null;
  if (token === "local-customer-session") {
    const username = sessionStorage.getItem("bml_customer_username");
    const account = localCustomerAccounts().find((item) => item.username === username);
    return account ? { username: account.username, role: "customer", profileImage: account.profileImage } : null;
  }
  return null;
}

export async function registerCustomer(fullName: string, username: string, email: string, phone: string, password: string, profileImage?: string): Promise<{ message: string }> {
  if (LOCAL_DEMO_MODE) throw new Error("Email verification requires the BML server and configured email service.");
  if (!LOCAL_DEMO_MODE) {
    let res: Response;
    try {
      res = await fetch(`${API_URL}/api/auth/register`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, username, email, phone, password, ...(profileImage ? { profileImage } : {}) }),
      });
    } catch {
      throw new Error(`Cannot reach the BML server at ${API_LOCATION}. Start the backend and try again.`);
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message ?? "Could not create your account.");
    return body as { message: string };
  }
  throw new Error("Email verification requires the BML server and configured email service.");
}

export async function requestStaffRegistration(input: { fullName: string; username: string; email: string; phone: string; password: string; profileImage?: string; requestedRole: Exclude<Role, "customer" | "admin">; requestedZone?: string }): Promise<{ message: string }> {
  if (LOCAL_DEMO_MODE) throw new Error("Staff registration needs the BML server. Please connect the registration service and try again.");
  const res = await fetch(`${API_URL}/api/auth/register-staff`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).catch(() => { throw new Error(`Cannot reach the BML server at ${API_LOCATION}. Try again when the server is available.`); });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message ?? "Could not submit the staff registration request.");
  return body as { message: string };
}

export function listPendingStaffRequests(): Promise<PendingStaffRequest[]> {
  return sendJson<PendingStaffRequest[]>("/api/auth/pending-users", "GET");
}

export function approveStaffRequest(id: number): Promise<{ ok: true }> {
  return sendJson<{ ok: true }>(`/api/auth/pending-users/${id}/approve`, "POST");
}

export function rejectStaffRequest(id: number): Promise<{ ok: true }> {
  return sendJson<{ ok: true }>(`/api/auth/pending-users/${id}`, "DELETE");
}

export function getAdminAccounts(): Promise<AdminAccount[]> { return sendJson<AdminAccount[]>("/api/admin/accounts", "GET"); }
export function getPasswordResetRequests(): Promise<PasswordResetRequest[]> { return sendJson<PasswordResetRequest[]>("/api/admin/password-reset-requests", "GET"); }
export function getSupervisorZones(): Promise<{ zones: { zone: string; supervisorId: number | null; supervisorName: string | null }[]; supervisors: { id: number; username: string; fullName: string }[] }> { return sendJson("/api/admin/supervisor-zones", "GET"); }
export function saveSupervisorZone(zone: string, supervisorId: number): Promise<{ ok: true }> { return sendJson("/api/admin/supervisor-zones", "PUT", { zone, supervisorId }); }
export function emailPasswordResetCode(id: number): Promise<{ username: string; message: string }> {
  return sendJson<{ username: string; message: string }>(`/api/admin/password-reset-requests/${id}/issue`, "POST");
}
export function dismissPasswordResetRequest(id: number): Promise<{ ok: true }> {
  return sendJson<{ ok: true }>(`/api/admin/password-reset-requests/${id}/dismiss`, "POST");
}
export function getRecentSignIns(): Promise<RecentSignIn[]> { return sendJson<RecentSignIn[]>("/api/admin/recent-signins", "GET"); }
export function setAccountLock(id: number, locked: boolean): Promise<{ ok: true }> {
  return sendJson<{ ok: true }>(`/api/admin/accounts/${id}/${locked ? "lock" : "unlock"}`, "POST");
}
export function getMessageRecipients(): Promise<MessageRecipient[]> { return sendJson<MessageRecipient[]>("/api/admin/message-recipients", "GET"); }
export type AdminMessageAudience = number | "all" | "customers" | "customers_due_soon" | "customers_overdue";
export function sendAdminMessage(recipientId: AdminMessageAudience, subject: string, body: string, delivery: "in_app" | "sms" = "in_app"): Promise<{ sent: number; skipped?: number; requestId?: string | null }> {
  return sendJson<{ sent: number; skipped?: number; requestId?: string | null }>("/api/admin/messages", "POST", { recipientId, subject, body, delivery });
}
export function getMyMessages(): Promise<UserMessage[]> { return sendJson<UserMessage[]>("/api/messages", "GET"); }
export function markMessageRead(id: number): Promise<{ ok: true }> { return sendJson<{ ok: true }>(`/api/messages/${id}/read`, "POST"); }
export function saveProfile(input: { fullName?: string; profileImage?: string; username?: string; currentPassword?: string }): Promise<{ ok: true; username: string; fullName: string; profileImage?: string }> {
  return sendJson<{ ok: true; username: string; fullName: string; profileImage?: string }>("/api/auth/profile", "PATCH", input);
}
export function listLoans(): Promise<LoanRecord[]> { return sendJson<LoanRecord[]>("/api/loans", "GET"); }
export function listCommitteeDecisions(): Promise<CommitteeDecisionRecord[]> { return sendJson<CommitteeDecisionRecord[]>("/api/loans/decisions", "GET"); }
export function initiateLoanPayout(id: number, input: { amount: number; provider: "snippe_mobile" | "snippe_bank"; destination: string; destinationName: string; bankCode?: string; nextDueDate: string }): Promise<{ ok: true; status: string; transactionId: string; message: string }> {
  return sendJson<{ ok: true; status: string; transactionId: string; message: string }>(`/api/loans/${id}/payout`, "POST", input);
}
export function getPendingLoanPayouts(): Promise<LoanPayoutIntent[]> { return sendJson<LoanPayoutIntent[]>("/api/loans/payouts/pending", "GET"); }
export function reconcileLoanPayout(transactionId: string): Promise<{ ok: true; status?: string; message?: string }> {
  return sendJson<{ ok: true; status?: string; message?: string }>(`/api/loans/payouts/${encodeURIComponent(transactionId)}/reconcile`, "POST");
}
export function performLoanAction(id: number, action: string, data: Record<string, unknown> = {}): Promise<{ ok: true; stage?: string }> {
  return sendJson<{ ok: true; stage?: string }>(`/api/loans/${id}/action`, "POST", { action, ...data });
}
export function getManagementWorkspace(): Promise<ManagementWorkspace> { return sendJson<ManagementWorkspace>("/api/management/workspace", "GET"); }
export function sendOfficerMessage(staffId: number, subject: string, body: string): Promise<{ ok: true; officerName: string }> {
  return sendJson<{ ok: true; officerName: string }>("/api/management/messages", "POST", { staffId, subject, body });
}

export async function updateCustomerProfileImage(profileImage: string): Promise<void> {
  if (!LOCAL_DEMO_MODE) {
    await sendJson<{ ok: true }>("/api/auth/profile", "PATCH", { profileImage });
    return;
  }
  const username = sessionStorage.getItem("bml_customer_username");
  const accounts = localCustomerAccounts();
  const account = accounts.find((item) => item.username === username);
  if (!account) throw new Error("Could not find this customer account on this device.");
  account.profileImage = profileImage;
  localStorage.setItem(LOCAL_CUSTOMER_ACCOUNTS_KEY, JSON.stringify(accounts));
}

export async function logout(): Promise<void> {
  if (LOCAL_DEMO_MODE) { sessionStorage.removeItem("bml_token"); sessionStorage.removeItem("bml_customer_username"); return; }
  await sendJson<{ ok: true }>("/api/auth/logout", "POST");
}

export function getCustomerLoans(): Promise<CustomerLoan[]> {
  if (!LOCAL_DEMO_MODE) return sendJson<CustomerLoan[]>("/api/customer/loans", "GET");
  return Promise.resolve([]);
}

export function getCustomerPaymentIntents(): Promise<CustomerPaymentIntent[]> {
  return sendJson<CustomerPaymentIntent[]>("/api/customer/payment-intents", "GET");
}

export function getCustomerPaymentRecords(): Promise<CustomerPaymentRecord[]> {
  return sendJson<CustomerPaymentRecord[]>("/api/customer/payments", "GET");
}

export function startCustomerRepayment(loanId: number, amount: number, mobile?: string): Promise<{ intentId: number; orderId: string; provider: "snippe"; status: string; amount: number; checkoutUrl?: string; reference?: string; message?: string }> {
  return sendJson(`/api/customer/loans/${loanId}/payment-intents`, "POST", { amount, provider: "snippe", mobile });
}

export function getCustomerRequests(): Promise<CustomerRequest[]> {
  return sendJson<CustomerRequest[]>("/api/customer/requests", "GET");
}

export function getCustomerZones(): Promise<string[]> { return sendJson<string[]>("/api/customer/zones", "GET"); }
export function getCustomerOfficers(): Promise<{ id: number; username: string; fullName: string }[]> { return sendJson("/api/customer/officers", "GET"); }

export function submitCustomerRequest(input: { requestType: CustomerRequestType; summary: string; details: Record<string, unknown> }): Promise<CustomerRequest> {
  return sendJson<CustomerRequest>("/api/customer/requests", "POST", input);
}

export function updateCustomerRequest(id: number, status: Exclude<CustomerRequestStatus, "new">, visitNotes?: string, assignedOfficerId?: number): Promise<{ ok: true }> {
  return sendJson<{ ok: true }>(`/api/customer/requests/${id}`, "PATCH", { status, ...(visitNotes ? { visitNotes } : {}), ...(assignedOfficerId ? { assignedOfficerId } : {}) });
}

async function sendJson<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message ?? "Something went wrong. Try again.");
  return data as T;
}

// Creates the group, or updates it when it was already saved.
export function saveGroup(input: GroupInput, id?: number): Promise<GroupResult> {
  return id === undefined
    ? sendJson<GroupResult>("/api/groups", "POST", input)
    : sendJson<GroupResult>(`/api/groups/${id}`, "PUT", input);
}

export function convertGroup(id: number): Promise<GroupResult> {
  return sendJson<GroupResult>(`/api/groups/${id}/convert`, "POST");
}

export function listGroups(status?: string): Promise<GroupSummary[]> {
  return sendJson<GroupSummary[]>(`/api/groups${status ? `?status=${status}` : ""}`, "GET");
}

export function getGroup(id: number): Promise<GroupDetail> {
  return sendJson<GroupDetail>(`/api/groups/${id}`, "GET");
}

export function addMember(groupId: number, input: MemberInput): Promise<Member> {
  return sendJson<Member>(`/api/groups/${groupId}/members`, "POST", input);
}

export function removeMember(groupId: number, memberId: number): Promise<{ ok: true }> {
  return sendJson<{ ok: true }>(`/api/groups/${groupId}/members/${memberId}`, "DELETE");
}

export function submitGroup(groupId: number): Promise<{ id: number; status: string }> {
  return sendJson<{ id: number; status: string }>(`/api/groups/${groupId}/submit`, "POST");
}

export function listClients(): Promise<ClientSummary[]> {
  return sendJson<ClientSummary[]>("/api/clients", "GET");
}

export function getClient(id: number): Promise<ClientRecord> {
  return sendJson<ClientRecord>(`/api/clients/${id}`, "GET");
}

// Creates the application, or updates it when it was already saved.
export function saveClient(input: ClientInput, id?: number): Promise<ClientSaveResult> {
  return id === undefined
    ? sendJson<ClientSaveResult>("/api/clients", "POST", input)
    : sendJson<ClientSaveResult>(`/api/clients/${id}`, "PUT", input);
}

export function submitClient(id: number): Promise<{ id: number; status: string }> {
  return sendJson<{ id: number; status: string }>(`/api/clients/${id}/submit`, "POST");
}

export function listAssessmentSubjects(): Promise<AssessmentSubject[]> {
  return sendJson<AssessmentSubject[]>("/api/assessments/subjects", "GET");
}

export function getAssessment(
  type: "client" | "group",
  id: number
): Promise<{ assessment: AssessmentRecord | null }> {
  return sendJson<{ assessment: AssessmentRecord | null }>(`/api/assessments/${type}/${id}`, "GET");
}

export function saveAssessment(
  type: "client" | "group",
  id: number,
  payload: AssessmentPayload
): Promise<AssessmentSaveResult> {
  return sendJson<AssessmentSaveResult>(`/api/assessments/${type}/${id}`, "PUT", payload);
}

export function getOverview(): Promise<Overview> {
  if (!LOCAL_DEMO_MODE) return sendJson<Overview>("/api/overview", "GET");
  return Promise.resolve({
    customers: 0, customersThisMonth: 0, activeLoans: 0, loansThisMonth: 0,
    pendingApplications: 0, portfolioBalance: 0, monthly: [], stages: [],
  });
}
