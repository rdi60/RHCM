-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED');

-- CreateEnum
CREATE TYPE "PatientStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DECEASED', 'MERGED');

-- CreateEnum
CREATE TYPE "TempRegistrationStatus" AS ENUM ('OPEN', 'CHECKED_IN', 'EXPIRED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "ConsentType" AS ENUM ('TREATMENT', 'DATA_SHARING', 'CROSS_ENTITY_IDENTITY_LINKING', 'PHOTO_VIDEO', 'MARKETING');

-- AlterTable
ALTER TABLE "entity_settings" ADD COLUMN     "tempRegNextSeq" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "tempRegPrefix" TEXT NOT NULL DEFAULT 'TMP';

-- CreateTable
CREATE TABLE "uhid_counter" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "prefix" TEXT NOT NULL DEFAULT 'RD',
    "nextSeq" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "uhid_counter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" TEXT NOT NULL,
    "uhid" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "dob" DATE,
    "ageYears" INTEGER,
    "gender" "Gender" NOT NULL DEFAULT 'UNSPECIFIED',
    "phone" TEXT,
    "email" TEXT,
    "addressJson" JSONB,
    "emergencyContactJson" JSONB,
    "guardianJson" JSONB,
    "medicalAlertsJson" JSONB,
    "allergiesJson" JSONB,
    "medicalHistoryJson" JSONB,
    "status" "PatientStatus" NOT NULL DEFAULT 'ACTIVE',
    "mergedIntoPatientId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_entity_links" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "firstVisitAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_entity_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "temporary_registrations" (
    "id" TEXT NOT NULL,
    "tempId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "dob" DATE,
    "ageYears" INTEGER,
    "gender" "Gender" NOT NULL DEFAULT 'UNSPECIFIED',
    "visitReason" TEXT,
    "preferredDoctorId" TEXT,
    "status" "TempRegistrationStatus" NOT NULL DEFAULT 'OPEN',
    "matchedPatientId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "temporary_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent_records" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "consentType" "ConsentType" NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "capturedById" TEXT,
    "documentRef" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patients_uhid_key" ON "patients"("uhid");

-- CreateIndex
CREATE INDEX "patients_fullName_idx" ON "patients"("fullName");

-- CreateIndex
CREATE INDEX "patients_phone_idx" ON "patients"("phone");

-- CreateIndex
CREATE INDEX "patient_entity_links_entityId_idx" ON "patient_entity_links"("entityId");

-- CreateIndex
CREATE UNIQUE INDEX "patient_entity_links_patientId_entityId_key" ON "patient_entity_links"("patientId", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "temporary_registrations_tempId_key" ON "temporary_registrations"("tempId");

-- CreateIndex
CREATE INDEX "temporary_registrations_entityId_idx" ON "temporary_registrations"("entityId");

-- CreateIndex
CREATE INDEX "temporary_registrations_phone_idx" ON "temporary_registrations"("phone");

-- CreateIndex
CREATE INDEX "consent_records_patientId_idx" ON "consent_records"("patientId");

-- CreateIndex
CREATE INDEX "consent_records_entityId_idx" ON "consent_records"("entityId");

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_mergedIntoPatientId_fkey" FOREIGN KEY ("mergedIntoPatientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_entity_links" ADD CONSTRAINT "patient_entity_links_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_entity_links" ADD CONSTRAINT "patient_entity_links_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temporary_registrations" ADD CONSTRAINT "temporary_registrations_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temporary_registrations" ADD CONSTRAINT "temporary_registrations_preferredDoctorId_fkey" FOREIGN KEY ("preferredDoctorId") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temporary_registrations" ADD CONSTRAINT "temporary_registrations_matchedPatientId_fkey" FOREIGN KEY ("matchedPatientId") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temporary_registrations" ADD CONSTRAINT "temporary_registrations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_capturedById_fkey" FOREIGN KEY ("capturedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
