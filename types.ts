import type { Role } from "./permissions";
export type { Role };

export type ClientStatus = "Due" | "Overdue" | "On track";

export interface Stat {
  label: string;
  value: number | string;
  highlight?: boolean;
}

export interface ClientRow {
  id: number;
  client: string;
  product: "Emergency" | "Group" | "Business Emergency";
  due: string;
  status: ClientStatus;
}

export interface DashboardData {
  roleLabel: string;
  stats: Stat[];
  rows: ClientRow[];
  nextScreen: string;
}

export interface User {
  username: string;
  phone?: string | null;
  role: Role;
  fullName?: string;
  profileImage?: string;
  mustChangePassword?: boolean;
}

export interface CustomerLoan {
  id: number;
  loanNumber: string;
  product: string;
  principalAmount: number | null;
  amountDue: number | null;
  amountPaid: number | null;
  savingsAmount: number | null;
  savingsRate: number | null;
  processingFeeAmount: number | null;
  processingFeeRate: number | null;
  interestAmount: number | null;
  weeklyInterestRate: number | null;
  installmentCount: number | null;
  weeklyInstallmentAmount: number | null;
  finalInstallmentAmount: number | null;
  outstandingBalance: number;
  repaymentPerformance: number | null;
  arrears: number | null;
  stage: "assessment" | "verification" | "approval" | "disbursement" | "repayment";
  transferReference: string | null;
  loanStatus: "in_progress" | "active" | "closed";
  nextDueDate: string | null;
}

export interface CustomerPaymentIntent {
  id: number;
  loanId: number;
  loanNumber: string;
  orderId: string;
  amount: number;
  provider: "snippe";
  status: "pending" | "paid" | "failed" | "cancelled" | "ambiguous";
  checkoutUrl: string | null;
  customerReference: string | null;
  gatewayReference: string | null;
  createdAt: string;
  paidAt: string | null;
}

export interface CustomerPaymentRecord {
  id: number;
  loanId: number;
  loanNumber: string;
  amount: number;
  provider: string;
  reference: string;
  receivedAt: string;
}

export interface LoanPayoutIntent {
  id: number;
  loanId: number;
  loanNumber: string;
  clientName: string;
  provider: "snippe_mobile" | "snippe_bank";
  transactionId: string;
  amount: number;
  destination: string;
  destinationName: string;
  status: "pending" | "paid" | "failed" | "ambiguous" | "reversed";
  createdAt: string;
}

export type CustomerRequestType = "loan" | "group_registration" | "assessment" | "member_performance";
export type CustomerRequestStatus = "new" | "reviewing" | "visited" | "approved" | "rejected" | "completed";

export interface CustomerRequest {
  id: number;
  requestType: CustomerRequestType;
  summary: string;
  details: Record<string, unknown>;
  status: CustomerRequestStatus;
  createdAt: string;
  updatedAt?: string;
  customerName?: string;
  customerPhone?: string | null;
  zone?: string | null;
  assignedOfficerId?: number | null;
  assignedOfficer?: string | null;
  assignedSupervisor?: string | null;
}

export interface LoginResult {
  token?: string;
  user: User;
}

export interface PendingStaffRequest {
  id: number;
  username: string;
  fullName: string;
  phone: string | null;
  requestedRole: Exclude<Role, "customer" | "admin">;
  requestedZone?: string | null;
  createdAt: string;
}

export interface AdminAccount {
  id: number;
  username: string;
  fullName: string;
  phone: string | null;
  role: Role;
  requestedRole: Exclude<Role, "customer" | "admin"> | null;
  active: boolean;
  adminLocked: boolean;
  createdAt: string;
}

export interface PasswordResetRequest {
  id: number;
  requestedUsername: string;
  contactPhone: string;
  accountUsername: string | null;
  fullName: string | null;
  role: Role | null;
  createdAt: string;
}

export interface RecentSignIn {
  id: number;
  username: string;
  signedInAt: string;
}

export interface MessageRecipient {
  id: number;
  username: string;
  fullName: string;
  phone?: string | null;
  role: Role;
}

export interface UserMessage {
  id: number;
  subject: string;
  body: string;
  sentAt: string;
  readAt: string | null;
  senderName: string;
}

export interface LoanRecord {
  id: number;
  loanNumber: string;
  clientId: number;
  clientName: string;
  clientPhone?: string | null;
  businessType?: string;
  businessLocation?: string;
  product: "Emergency" | "Group" | "Business Emergency";
  stage: "assessment" | "verification" | "approval" | "disbursement" | "repayment";
  status: "in_progress" | "active" | "closed";
  principalAmount: number | null;
  amountDue: number | null;
  amountPaid: number | null;
  savingsAmount?: number | null;
  savingsRate?: number | null;
  processingFeeAmount?: number | null;
  processingFeeRate?: number | null;
  interestAmount?: number | null;
  weeklyInterestRate?: number | null;
  installmentCount?: number | null;
  weeklyInstallmentAmount?: number | null;
  finalInstallmentAmount?: number | null;
  repaymentPerformance: number | null;
  balance: number;
  nextDueDate: string | null;
  transferReference: string | null;
  disbursedAmount?: number | null;
  arrears?: number | null;
  overdueAmount?: number | null;
  paymentDate?: string | null;
  createdAt: string;
  updatedAt: string;
  officerId: number | null;
  officerName: string;
  officerPhone: string;
}

export interface CommitteeDecisionRecord {
  id: number;
  loanId: number;
  loanNumber: string;
  clientName: string;
  product: string;
  amount: number;
  decision: "approved" | "returned";
  rationale: string;
  decidedBy: string;
  decidedAt: string;
  signedBy: string | null;
  signedAt: string | null;
}

export interface ManagementOfficer {
  id: number;
  name: string;
  username: string;
  phone: string;
  activeLoans: number;
  inProgress: number;
  portfolioBalance: number;
  collectedThisMonth: number;
}

export interface ManagementWorkspace {
  officers: ManagementOfficer[];
  supervisors: { id: number; name: string; username: string; phone: string; zones: string[] }[];
  loans: ManagementLoan[];
  messages: { id: number; subject: string; body: string; sentAt: string; officerId: number; officerName: string }[];
}

export interface ManagementLoan {
  id: number;
  clientId: number;
  loanNumber: string;
  clientName: string;
  centre: string | null;
  zone: string | null;
  product: string;
  stage: LoanRecord["stage"];
  status: LoanRecord["status"];
  amount: number;
  balance: number;
  amountDue: number;
  amountPaid: number;
  savingsAmount?: number;
  savingsRate?: number;
  processingFeeAmount?: number;
  processingFeeRate?: number;
  interestAmount?: number;
  weeklyInterestRate?: number;
  installmentCount?: number;
  weeklyInstallmentAmount?: number;
  finalInstallmentAmount?: number;
  arrears: number;
  repaymentPerformance: number | null;
  nextDueDate: string | null;
  disbursedAmount: number | null;
  disbursedAt: string | null;
  updatedAt: string;
  officerId: number | null;
  officerName: string;
  officerPhone: string;
}

export interface GroupInput {
  name: string;
  location: string;
  centre: string;
  zone: string;
  membersExpected: number;
  meetingDay: string;
  notes: string;
}

export interface GroupResult {
  id: number;
  status: "prospect" | "registration";
}

export interface MemberInput {
  fullName: string;
  nationalId: string;
  phone: string;
  business: string;
  role: string;
}

export interface Member {
  id: number;
  fullName: string;
  idMasked: string;
  phoneMasked: string;
  business: string;
  role: string;
}

export interface GroupSummary {
  id: number;
  name: string;
  status: string;
  membersExpected: number;
  memberCount: number;
}

export interface GroupDetail {
  id: number;
  name: string;
  location: string;
  centre: string;
  zone: string;
  membersExpected: number;
  meetingDay: string;
  notes: string;
  status: "prospect" | "registration" | "assessment" | "closed";
  members: Member[];
}

export interface ClientInput {
  source: string;
  fullName: string;
  nationalId: string;
  phone: string;
  businessType: string;
  businessLocation: string;
  introducedBy: string;
}

export interface ClientRecord extends ClientInput {
  id: number;
  status: "draft" | "submitted";
  introducedAt: string;
}

export interface ClientSummary {
  id: number;
  fullName: string;
  status: "draft" | "submitted";
  introducedAt: string;
  businessType: string;
}

export interface ClientSaveResult {
  id: number;
  status: "draft" | "submitted";
  introducedAt: string;
  introducedBy: string;
}

export interface AssessmentSubject {
  type: "client" | "group";
  id: number;
  name: string;
  assessmentStatus: "none" | "draft" | "submitted";
}

export interface AssessmentPayload {
  characterRating: string;
  characterNote: string;
  attitudeRating: string;
  attitudeNote: string;
  cohesionRating: string;
  cohesionNote: string;
  monthlySales: number | null;
  workingCapital: number | null;
  monthlyCashFlow: number | null;
  existingObligations: number | null;
  premisesVisited: boolean;
  premisesOwnership: string;
  premisesNotes: string;
  submit: boolean;
}

export interface AssessmentRecord {
  status: "draft" | "submitted";
  characterRating: string | null;
  characterNote: string;
  attitudeRating: string | null;
  attitudeNote: string;
  cohesionRating: string | null;
  cohesionNote: string;
  monthlySales: number | null;
  workingCapital: number | null;
  monthlyCashFlow: number | null;
  existingObligations: number | null;
  repaymentCapacity: number | null;
  recommendedAmount: number | null;
  premisesVisited: boolean;
  premisesOwnership: string | null;
  premisesNotes: string;
}

export interface AssessmentSaveResult {
  status: "draft" | "submitted";
  repaymentCapacity: number | null;
  recommendedAmount: number | null;
}

export interface Overview {
  customers: number;
  customersThisMonth: number;
  activeLoans: number;
  loansThisMonth: number;
  pendingApplications: number;
  portfolioBalance: number;
  monthly: { label: string; value: number }[];
  stages: { label: string; count: number }[];
}
