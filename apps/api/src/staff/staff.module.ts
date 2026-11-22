import { Module } from "@nestjs/common";
import { DoctorsController } from "./doctors.controller";
import { DoctorsService } from "./doctors.service";
import { StaffController } from "./staff.controller";
import { StaffService } from "./staff.service";

@Module({
  controllers: [DoctorsController, StaffController],
  providers: [DoctorsService, StaffService],
  exports: [DoctorsService, StaffService],
})
export class StaffModule {}
