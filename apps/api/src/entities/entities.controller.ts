import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { EntitiesService } from "./entities.service";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { SelfService, RequireGlobalPermissions, RequirePermissions } from "../common/decorators/permissions.decorator";
import { PERMISSIONS } from "@rhcm/shared";
import { CreateEntityDto } from "./dto/create-entity.dto";
import { UpdateEntitySettingsDto } from "./dto/update-entity-settings.dto";
import type { AuthenticatedUser } from "../common/types/authenticated-user";

@Controller("entities")
export class EntitiesController {
  constructor(private readonly entitiesService: EntitiesService) {}

  @SelfService()
  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.entitiesService.listForUser(user);
  }

  @RequireGlobalPermissions(PERMISSIONS.ENTITY_MANAGE)
  @Post()
  create(@Body() dto: CreateEntityDto, @CurrentUser() user: AuthenticatedUser) {
    return this.entitiesService.create(dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.ENTITY_SETTINGS_MANAGE)
  @Get(":entityId/settings")
  getSettings(@Param("entityId") entityId: string) {
    return this.entitiesService.getSettings(entityId);
  }

  @RequirePermissions(PERMISSIONS.ENTITY_SETTINGS_MANAGE)
  @Patch(":entityId/settings")
  updateSettings(
    @Param("entityId") entityId: string,
    @Body() dto: UpdateEntitySettingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.entitiesService.updateSettings(entityId, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.RESOURCE_MANAGE)
  @Get(":entityId/resources")
  listResources(@Param("entityId") entityId: string) {
    return this.entitiesService.listResources(entityId);
  }
}
