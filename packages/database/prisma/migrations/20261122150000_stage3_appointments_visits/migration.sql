-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('CONSULTATION', 'TREATMENT', 'FOLLOW_UP', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('BOOKED', 'CONFIRMED', 'ARRIVED', 'CHECKED_IN', 'WAITING', 'IN_TREATMENT', 'COMPLETED', 'CANCELLED', 'NO_SHOW', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('WAITING', 'IN_TREATMENT', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "entity_settings" ADD COLUMN     "visitNextSeq" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "visitPrefix" TEXT NOT NULL DEFAULT 'VS';

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "patientId" TEXT,
    "temporaryRegistrationId" TEXT,
    "doctorId" TEXT NOT NULL,
    "resourceId" TEXT,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "type" "AppointmentType" NOT NULL DEFAULT 'CONSULTATION',
    "status" "AppointmentStatus" NOT NULL DEFAULT 'BOOKED',
    "procedureHint" TEXT,
    "remarks" TEXT,
    "isEmergencyOverride" BOOLEAN NOT NULL DEFAULT false,
    "rescheduledFromId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "visitNumber" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "doctorId" TEXT NOT NULL,
    "resourceId" TEXT,
    "chiefComplaint" TEXT,
    "status" "VisitStatus" NOT NULL DEFAULT 'WAITING',
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkedOutAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "appointments_rescheduledFromId_key" ON "appointments"("rescheduledFromId");

-- CreateIndex
CREATE INDEX "appointments_entityId_startAt_idx" ON "appointments"("entityId", "startAt");

-- CreateIndex
CREATE INDEX "appointments_doctorId_startAt_idx" ON "appointments"("doctorId", "startAt");

-- CreateIndex
CREATE INDEX "appointments_resourceId_startAt_idx" ON "appointments"("resourceId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "visits_appointmentId_key" ON "visits"("appointmentId");

-- CreateIndex
CREATE INDEX "visits_entityId_status_idx" ON "visits"("entityId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "visits_entityId_visitNumber_key" ON "visits"("entityId", "visitNumber");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_temporaryRegistrationId_fkey" FOREIGN KEY ("temporaryRegistrationId") REFERENCES "temporary_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "clinic_resources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_rescheduledFromId_fkey" FOREIGN KEY ("rescheduledFromId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "clinic_resources"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Hand-written additions (Prisma schema can't express these): see
-- docs/ARCHITECTURE.md Section 5.3 and the Appointment model's doc comment.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Exactly one of patientId / temporaryRegistrationId is set.
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patient_or_tempreg_check"
  CHECK (
    ("patientId" IS NOT NULL AND "temporaryRegistrationId" IS NULL)
    OR ("patientId" IS NULL AND "temporaryRegistrationId" IS NOT NULL)
  );

-- No two LIVE appointments for the same doctor may overlap in time, unless
-- one of them is an authorized emergency override (isEmergencyOverride).
-- "Live" excludes terminal/non-occupying statuses.
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctor_no_overlap"
  EXCLUDE USING gist (
    "doctorId" WITH =,
    tstzrange("startAt", "endAt") WITH &&
  )
  WHERE (
    "status" NOT IN ('CANCELLED', 'NO_SHOW', 'RESCHEDULED')
    AND NOT "isEmergencyOverride"
  );

-- No two LIVE appointments for the same chair/OT may overlap in time — this
-- one has NO override exception: two patients cannot physically occupy the
-- same chair/OT regardless of permission.
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_resource_no_overlap"
  EXCLUDE USING gist (
    "resourceId" WITH =,
    tstzrange("startAt", "endAt") WITH &&
  )
  WHERE (
    "resourceId" IS NOT NULL
    AND "status" NOT IN ('CANCELLED', 'NO_SHOW', 'RESCHEDULED')
  );
