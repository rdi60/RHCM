import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { PatientsService } from "./patients.service";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { PERMISSIONS } from "@rhcm/shared";
import { UpdatePatientDto } from "./dto/update-patient.dto";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { ApiTags } from "@nestjs/swagger";

@ApiTags("Patients")
@Controller("patients")
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @RequirePermissions(PERMISSIONS.PATIENT_READ)
  @Get("search")
  search(@Query("entityId") entityId: string, @Query("q") q: string) {
    return this.patientsService.searchWithinEntity(entityId, q ?? "");
  }

  @RequirePermissions(PERMISSIONS.PATIENT_CROSS_ENTITY_LINK)
  @Get("cross-entity-search")
  crossEntitySearch(@Query("entityId") entityId: string, @Query("q") q: string) {
    return this.patientsService.searchCrossEntity(entityId, q ?? "");
  }

  @RequirePermissions(PERMISSIONS.PATIENT_READ)
  @Get(":id")
  get(@Param("id") id: string, @Query("entityId") entityId: string) {
    return this.patientsService.getPatient(id, entityId);
  }

  @RequirePermissions(PERMISSIONS.PATIENT_REGISTER)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdatePatientDto, @CurrentUser() user: AuthenticatedUser) {
    return this.patientsService.updatePatient(id, dto, user.id);
  }
}
