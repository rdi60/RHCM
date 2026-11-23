import { Controller, Get, Query } from "@nestjs/common";
import { ClinicalService } from "./clinical.service";
import { RequireGlobalPermissions } from "../common/decorators/permissions.decorator";
import { PERMISSIONS } from "@rhcm/shared";
import { ApiTags } from "@nestjs/swagger";

@ApiTags("Clinical - Treatment Catalog")
@Controller("treatment-catalog")
export class TreatmentCatalogController {
  constructor(private readonly clinicalService: ClinicalService) {}

  // Global, not entity-scoped data — any entity's CLINICAL_READ grant is enough.
  @RequireGlobalPermissions(PERMISSIONS.CLINICAL_READ)
  @Get()
  list(@Query("active") active?: string) {
    return this.clinicalService.listCatalog(active !== "false");
  }
}
