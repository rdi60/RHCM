import { Module } from "@nestjs/common";
import { VisitsModule } from "../visits/visits.module";
import { PatientsController } from "./patients.controller";
import { TempRegistrationsController } from "./temp-registrations.controller";
import { PatientsService } from "./patients.service";

@Module({
  imports: [VisitsModule],
  controllers: [PatientsController, TempRegistrationsController],
  providers: [PatientsService],
  exports: [PatientsService],
})
export class PatientsModule {}
