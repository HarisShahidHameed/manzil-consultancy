export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAt: string;
  updatedAt: string;
  userRoles?: UserRole[];
}

export interface Role {
  id: string;
  name: string;
  description?: string;
  isSystem: boolean;
  createdAt: string;
  rolePermissions?: RolePermission[];
  _count?: { userRoles: number };
}

export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  description?: string;
}

export interface UserRole {
  id: string;
  role: Pick<Role, 'id' | 'name'>;
}

export interface RolePermission {
  id: string;
  permission: Permission;
}

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export interface AuthState {
  user: AuthUser | null;
  roles: string[];
  permissions: string[];
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginResponse {
  accessToken: string;
  user: AuthUser;
  roles: string[];
  permissions: string[];
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  errors?: Record<string, string[]>;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
  };
}

export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ── Phase 2 types ────────────────────────────────────────────

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type MaritalStatus = 'SINGLE' | 'MARRIED' | 'DIVORCED' | 'WIDOWED';
export type AppointmentStatus = 'WAITING' | 'REGISTERED' | 'ASSIGNED';

export interface ClientGroup {
  id: string;
  groupRef: string;
  name: string;
  relation?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
  clients?: Array<{
    id: string; clientRef: string; firstName: string; lastName: string; nationality: string;
    visaCases?: Array<{ id: string; destination: string; stage: CaseStage }>;
  }>;
  _count?: { clients: number };
}
export type CaseStage = 'APPOINTMENT' | 'FILE_PROCESSING' | 'INVOICED' | 'COMPLETED' | 'CANCELLED';
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type DocumentStatus = 'PENDING' | 'IN_PROGRESS' | 'DONE' | 'NOT_REQUIRED';
export type InvoiceStatus = 'DRAFT' | 'SENT' | 'PARTIAL' | 'PAID';
export type CaseRequiredField = 'passportNumber' | 'nationality' | 'dob' | 'passportIssue' | 'passportExpiry' | 'destination';

export interface AssignableUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  roles: string[];
}

export interface Client {
  id: string;
  clientRef: string;
  receivedDate: string;
  firstName: string;
  lastName: string | null;
  gender: Gender | null;
  dob: string | null;
  phone: string;
  email?: string;
  whatsapp?: string;
  residentialAddress?: string;
  passportNumber: string | null;
  passportIssue: string | null;
  passportExpiry: string | null;
  birthCity?: string;
  nationality: string | null;
  maritalStatus?: MaritalStatus;
  previousSchengenVisa?: string;
  registeredEmail?: string;
  groupId?: string;
  group?: { id: string; groupRef: string; name: string; relation?: string };
  eVisa: boolean;
  contract: boolean;
  visaAndTravelHistory?: string;
  source?: string;
  referredBy?: string;
  hrComments?: string;
  folderUrl?: string;
  assignedToId?: string;
  assignedTo?: { id: string; firstName: string; lastName: string; email: string };
  visaCases: VisaCase[];
  createdAt: string;
  updatedAt: string;
}

export interface VisaCase {
  id: string;
  clientId: string;
  destination: string | null;
  city?: string;
  visaType?: string;
  ukVisaExpiry?: string;
  stage: CaseStage;
  priority: Priority;
  // Present (non-empty) only while stage is APPOINTMENT — fields still needed
  // before the case can move to File Processing.
  missingRequiredFields?: CaseRequiredField[];
  advance?: number | string;
  charges?: number | string;
  discount?: number | string;
  advancePaid?: boolean;
  advancePaidDate?: string;
  onHold?: boolean;
  onHoldReason?: string;
  appointmentStatus?: AppointmentStatus | null;
  appointmentDate?: string;
  bookedById?: string;
  appointmentAssignedToId?: string;
  fileAssignedToId?: string;
  fraNo?: string;
  tlsAccount?: string;
  appointmentNotes?: string;
  travelDate?: string;
  hotelDate?: string;
  salamComments?: string;
  hrComments?: string;
  docAppointment: DocumentStatus;
  docTicket: DocumentStatus;
  docInsurance: DocumentStatus;
  docHotel: DocumentStatus;
  docEVisa: DocumentStatus;
  docSop: DocumentStatus;
  docVisaForm: DocumentStatus;
  docAppointmentCost?: number | string | null;
  docTicketCost?: number | string | null;
  docInsuranceCost?: number | string | null;
  docHotelCost?: number | string | null;
  docEVisaCost?: number | string | null;
  docSopCost?: number | string | null;
  docVisaFormCost?: number | string | null;
  paymentReceived?: number | string;
  client?: {
    id: string; clientRef: string; firstName: string; lastName: string;
    phone: string; email?: string; nationality: string; passportNumber: string;
    dob?: string | null; passportIssue?: string | null; passportExpiry?: string | null;
    residentialAddress?: string; maritalStatus?: MaritalStatus;
    previousSchengenVisa?: string; visaAndTravelHistory?: string; registeredEmail?: string;
  };
  bookedBy?: { id: string; firstName: string; lastName: string };
  appointmentAssigned?: { id: string; firstName: string; lastName: string };
  fileAssigned?: { id: string; firstName: string; lastName: string };
  invoices?: Invoice[];
  createdAt: string;
  updatedAt: string;
}

export interface Invoice {
  id: string;
  invoiceRef: string;
  caseId: string;
  issueDate: string;
  dueDate?: string;
  charges: number | string;
  discount: number | string;
  advance: number | string;
  totalAmount: number | string;
  paidAmount: number | string;
  outstanding: number | string;
  status: InvoiceStatus;
  notes?: string;
  case?: {
    id: string; destination: string; visaType?: string;
    client: { id: string; clientRef: string; firstName: string; lastName: string; phone: string };
  };
  createdBy?: { id: string; firstName: string; lastName: string };
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsFilters {
  dateFrom?: string;
  dateTo?: string;
  destination?: string;
  assignedToId?: string;
}

export interface AnalyticsData {
  pipeline: {
    casesByStage: Array<{ stage: CaseStage; count: number }>;
    casesByPriority: Array<{ priority: Priority; count: number }>;
    casesByDestination: Array<{ destination: string; count: number }>;
    appointmentFunnel: Array<{ status: string; count: number }>;
    workload: Array<{ userId: string; name: string; count: number }>;
    documentCompletion: Array<{ field: string; statuses: Array<{ status: DocumentStatus; count: number }> }>;
    caseTrend: Array<{ month: string; count: number }>;
  };
  financials: {
    invoicesByStatus: Array<{
      status: InvoiceStatus; count: number; totalAmount: number; paidAmount: number; outstanding: number;
    }>;
    revenueTrend: Array<{ month: string; charges: number; paid: number; outstanding: number }>;
  };
  demographics: {
    clientsByNationality: Array<{ nationality: string; count: number }>;
    clientsByGender: Array<{ gender: Gender; count: number }>;
    clientsBySource: Array<{ source: string; count: number }>;
    newClientsTrend: Array<{ month: string; count: number }>;
  };
}

export interface DashboardStats {
  totalClients: number;
  appointmentCases: number;
  fileProcessingCases: number;
  invoicedCases: number;
  completedCases: number;
  totalInvoices: number;
  pendingAmount: number;
  recentClients: Array<{
    id: string; clientRef: string; firstName: string; lastName: string; createdAt: string;
    visaCases: Array<{ destination: string; stage: CaseStage }>;
  }>;
}

export interface AuditLog {
  id: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  createdAt: string;
  user?: Pick<User, 'email' | 'firstName' | 'lastName'>;
}
