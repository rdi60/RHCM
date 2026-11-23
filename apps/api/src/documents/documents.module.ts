import { Module } from "@nestjs/common";
import { PatientsModule } from "../patients/patients.module";
import { DocumentsService } from "./documents.service";
import { DocumentsController } from "./documents.controller";

@Module({
  imports: [PatientsModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
