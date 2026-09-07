-- AlterTable
ALTER TABLE "visa_cases" ADD COLUMN     "appointmentDateSetAt" TIMESTAMP(3),
ADD COLUMN     "fileProcessingStartedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "client_documents" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "client_documents_key_key" ON "client_documents"("key");

-- CreateIndex
CREATE INDEX "client_documents_clientId_idx" ON "client_documents"("clientId");

-- AddForeignKey
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
