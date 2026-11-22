-- DropIndex
DROP INDEX "temporary_registrations_entityId_idx";

-- DropIndex
DROP INDEX "temporary_registrations_tempId_key";

-- CreateIndex
CREATE UNIQUE INDEX "temporary_registrations_entityId_tempId_key" ON "temporary_registrations"("entityId", "tempId");

