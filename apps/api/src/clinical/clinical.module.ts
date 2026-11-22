import { Module } from "@nestjs/common";
import { PatientsModule } from "../patients/patients.module";
import { ClinicalService } from "./clinical.service";
import { TreatmentCatalogController } from "./treatment-catalog.controller";
import { DentalChartController } from "./dental-chart.controller";
import { VisitClinicalController } from "./visit-clinical.controller";
import { TreatmentPlansController } from "./treatment-plans.controller";

@Module({
  imports: [PatientsModule],
  controllers: [TreatmentCatalogController, DentalChartController, VisitClinicalController, TreatmentPlansController],
  providers: [ClinicalService],
  exports: [ClinicalService],
})
export class ClinicalModule {}
