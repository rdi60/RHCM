import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ClinicalService } from "./clinical.service";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { PERMISSIONS } from "@rhcm/shared";
import { CreateDiagnosisDto } from "./dto/diagnosis.dto";
import { CreateAddendumDto, CreateClinicalNoteDto } from "./dto/clinical-note.dto";
import { CreatePrescriptionDto } from "./dto/prescription.dto";
import type { AuthenticatedUser } from "../common/types/authenticated-user";

@Controller()
export class VisitClinicalController {
  constructor(private readonly clinicalService: ClinicalService) {}

  @RequirePermissions(PERMISSIONS.CLINICAL_READ)
  @Get("visits/:visitId/diagnoses")
  listDiagnoses(@Param("visitId") visitId: string, @Query("entityId") entityId: string) {
    return this.clinicalService.listDiagnoses(visitId, entityId);
  }

  @RequirePermissions(PERMISSIONS.CLINICAL_DIAGNOSE)
  @Post("visits/:visitId/diagnoses")
  createDiagnosis(@Param("visitId") visitId: string, @Body() dto: CreateDiagnosisDto, @CurrentUser() user: AuthenticatedUser) {
    return this.clinicalService.createDiagnosis(visitId, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.CLINICAL_READ)
  @Get("visits/:visitId/notes")
  listNotes(@Param("visitId") visitId: string, @Query("entityId") entityId: string) {
    return this.clinicalService.listClinicalNotes(visitId, entityId);
  }

  @RequirePermissions(PERMISSIONS.CLINICAL_NOTE_WRITE)
  @Post("visits/:visitId/notes")
  createNote(@Param("visitId") visitId: string, @Body() dto: CreateClinicalNoteDto, @CurrentUser() user: AuthenticatedUser) {
    return this.clinicalService.createClinicalNote(visitId, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.CLINICAL_NOTE_WRITE)
  @Post("clinical-notes/:noteId/addendum")
  addAddendum(@Param("noteId") noteId: string, @Body() dto: CreateAddendumDto, @CurrentUser() user: AuthenticatedUser) {
    return this.clinicalService.createAddendum(noteId, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.CLINICAL_READ)
  @Get("visits/:visitId/prescriptions")
  listPrescriptions(@Param("visitId") visitId: string, @Query("entityId") entityId: string) {
    return this.clinicalService.listPrescriptions(visitId, entityId);
  }

  @RequirePermissions(PERMISSIONS.CLINICAL_PRESCRIBE)
  @Post("visits/:visitId/prescriptions")
  createPrescription(@Param("visitId") visitId: string, @Body() dto: CreatePrescriptionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.clinicalService.createPrescription(visitId, dto, user.id);
  }
}
