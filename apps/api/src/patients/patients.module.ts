import { Module } from "@nestjs/common";
import { PatientsController } from "./patients.controller";
import { TempRegistrationsController } from "./temp-registrations.controller";
import { PatientsService } from "./patients.service";

@Module({
  controllers: [PatientsController, TempRegistrationsController],
  providers: [PatientsService],
  exports: [PatientsService],
})
export class PatientsModule {}
