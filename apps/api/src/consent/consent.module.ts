import { Module } from "@nestjs/common";
import { PatientsModule } from "../patients/patients.module";
import { ConsentService } from "./consent.service";
import { ConsentController } from "./consent.controller";

@Module({
  imports: [PatientsModule],
  controllers: [ConsentController],
  providers: [ConsentService],
  exports: [ConsentService],
})
export class ConsentModule {}
