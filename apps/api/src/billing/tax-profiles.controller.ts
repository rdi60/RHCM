import { Body, Controller, Get, Param, Patch, Post, Put } from "@nestjs/common";
import { PERMISSIONS } from "@rhcm/shared";
import { BillingService } from "./billing.service";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateTaxProfileDto, UpdateTaxProfileDto } from "./dto/tax-profile.dto";
import { UpsertEntityTreatmentPriceDto } from "./dto/entity-treatment-price.dto";

@Controller()
export class TaxProfilesController {
  constructor(private readonly billingService: BillingService) {}

  @RequirePermissions(PERMISSIONS.ESTIMATE_CREATE)
  @Get("entities/:entityId/tax-profiles")
  list(@Param("entityId") entityId: string) {
    return this.billingService.listTaxProfiles(entityId);
  }

  @RequirePermissions(PERMISSIONS.ENTITY_SETTINGS_MANAGE)
  @Post("tax-profiles")
  create(@Body() dto: CreateTaxProfileDto, @CurrentUser() user: AuthenticatedUser) {
    return this.billingService.createTaxProfile(dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.ENTITY_SETTINGS_MANAGE)
  @Patch("tax-profiles/:id")
  update(@Param("id") id: string, @Body() dto: UpdateTaxProfileDto, @CurrentUser() user: AuthenticatedUser) {
    return this.billingService.updateTaxProfile(id, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.ESTIMATE_CREATE)
  @Get("entities/:entityId/treatment-prices")
  listPrices(@Param("entityId") entityId: string) {
    return this.billingService.listEntityTreatmentPrices(entityId);
  }

  @RequirePermissions(PERMISSIONS.ENTITY_SETTINGS_MANAGE)
  @Put("treatment-prices")
  upsertPrice(@Body() dto: UpsertEntityTreatmentPriceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.billingService.upsertEntityTreatmentPrice(dto, user.id);
  }
}
