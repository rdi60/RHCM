-- DropForeignKey
ALTER TABLE "visits" DROP CONSTRAINT "visits_doctorId_fkey";

-- AlterTable
ALTER TABLE "visits" ALTER COLUMN "doctorId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "doctors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

