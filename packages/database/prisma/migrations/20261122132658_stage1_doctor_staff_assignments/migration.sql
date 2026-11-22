-- AlterTable
ALTER TABLE "users" ADD COLUMN     "passwordResetExpiresAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetTokenHash" TEXT,
ADD COLUMN     "pendingMfaSecretEncrypted" TEXT;

-- CreateTable
CREATE TABLE "doctor_entity_assignments" (
    "id" TEXT NOT NULL,
    "doctorId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctor_entity_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_entity_assignments" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_entity_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "doctor_entity_assignments_entityId_idx" ON "doctor_entity_assignments"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "doctor_entity_assignments_doctorId_entityId_key" ON "doctor_entity_assignments"("doctorId", "entityId");

-- CreateIndex
CREATE INDEX "staff_entity_assignments_entityId_idx" ON "staff_entity_assignments"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "staff_entity_assignments_staffId_entityId_key" ON "staff_entity_assignments"("staffId", "entityId");

-- AddForeignKey
ALTER TABLE "doctor_entity_assignments" ADD CONSTRAINT "doctor_entity_assignments_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_entity_assignments" ADD CONSTRAINT "doctor_entity_assignments_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_entity_assignments" ADD CONSTRAINT "staff_entity_assignments_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_entity_assignments" ADD CONSTRAINT "staff_entity_assignments_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
