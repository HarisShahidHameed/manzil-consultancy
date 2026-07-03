-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED');

-- CreateEnum
CREATE TYPE "CaseStage" AS ENUM ('INTAKE', 'APPOINTMENT', 'FILE_PROCESSING', 'INVOICED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE', 'NOT_REQUIRED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('WAITING', 'REGISTERED', 'ASSIGNED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIAL', 'PAID');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "passwordResetToken" TEXT,
    "passwordResetTokenExpiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_groups" (
    "id" TEXT NOT NULL,
    "groupRef" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relation" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "clientRef" TEXT NOT NULL,
    "groupId" TEXT,
    "receivedDate" TIMESTAMP(3) NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "gender" "Gender",
    "dob" TIMESTAMP(3),
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "whatsapp" TEXT,
    "residentialAddress" TEXT,
    "passportNumber" TEXT,
    "passportIssue" TIMESTAMP(3),
    "passportExpiry" TIMESTAMP(3),
    "birthCity" TEXT,
    "nationality" TEXT,
    "maritalStatus" "MaritalStatus",
    "previousSchengenVisa" TEXT,
    "registeredEmail" TEXT,
    "eVisa" BOOLEAN NOT NULL DEFAULT false,
    "contract" BOOLEAN NOT NULL DEFAULT false,
    "visaAndTravelHistory" TEXT,
    "source" TEXT,
    "referredBy" TEXT,
    "hrComments" TEXT,
    "folderUrl" TEXT,
    "assignedToId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visa_cases" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "destination" TEXT,
    "city" TEXT,
    "visaType" TEXT,
    "ukVisaExpiry" TIMESTAMP(3),
    "stage" "CaseStage" NOT NULL DEFAULT 'INTAKE',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "advance" DECIMAL(10,2),
    "charges" DECIMAL(10,2),
    "discount" DECIMAL(10,2),
    "advancePaid" BOOLEAN NOT NULL DEFAULT false,
    "advancePaidDate" TIMESTAMP(3),
    "onHold" BOOLEAN NOT NULL DEFAULT false,
    "onHoldReason" TEXT,
    "appointmentStatus" "AppointmentStatus",
    "appointmentDate" TIMESTAMP(3),
    "bookedById" TEXT,
    "appointmentAssignedToId" TEXT,
    "fileAssignedToId" TEXT,
    "fraNo" TEXT,
    "tlsAccount" TEXT,
    "appointmentNotes" TEXT,
    "travelDate" TIMESTAMP(3),
    "hotelDate" TIMESTAMP(3),
    "salamComments" TEXT,
    "hrComments" TEXT,
    "docAppointment" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "docTicket" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "docInsurance" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "docHotel" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "docEVisa" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "docSop" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "docVisaForm" "DocumentStatus" NOT NULL DEFAULT 'PENDING',
    "docAppointmentCost" DECIMAL(10,2),
    "docTicketCost" DECIMAL(10,2),
    "docInsuranceCost" DECIMAL(10,2),
    "docHotelCost" DECIMAL(10,2),
    "docEVisaCost" DECIMAL(10,2),
    "docSopCost" DECIMAL(10,2),
    "docVisaFormCost" DECIMAL(10,2),
    "paymentReceived" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visa_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "invoiceRef" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "charges" DECIMAL(10,2) NOT NULL,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "advance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(10,2) NOT NULL,
    "paidAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "outstanding" DECIMAL(10,2) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_name_key" ON "permissions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_userId_roleId_key" ON "user_roles"("userId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_roleId_permissionId_key" ON "role_permissions"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "client_groups_groupRef_key" ON "client_groups"("groupRef");

-- CreateIndex
CREATE UNIQUE INDEX "clients_clientRef_key" ON "clients"("clientRef");

-- CreateIndex
CREATE UNIQUE INDEX "clients_passportNumber_key" ON "clients"("passportNumber");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoiceRef_key" ON "invoices"("invoiceRef");

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "client_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visa_cases" ADD CONSTRAINT "visa_cases_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visa_cases" ADD CONSTRAINT "visa_cases_bookedById_fkey" FOREIGN KEY ("bookedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visa_cases" ADD CONSTRAINT "visa_cases_appointmentAssignedToId_fkey" FOREIGN KEY ("appointmentAssignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visa_cases" ADD CONSTRAINT "visa_cases_fileAssignedToId_fkey" FOREIGN KEY ("fileAssignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "visa_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
