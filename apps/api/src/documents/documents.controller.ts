import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { PERMISSIONS } from "@rhcm/shared";
import { DocumentsService } from "./documents.service";
import { RequirePermissions } from "../common/decorators/permissions.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../common/types/authenticated-user";
import { EntityScopedDto, RequestDocumentUploadDto } from "./dto/document.dto";

@Controller()
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @RequirePermissions(PERMISSIONS.DOCUMENT_DOWNLOAD)
  @Get("patients/:patientId/documents")
  list(@Param("patientId") patientId: string, @Query("entityId") entityId: string) {
    return this.documentsService.listForPatient(patientId, entityId);
  }

  @RequirePermissions(PERMISSIONS.DOCUMENT_UPLOAD)
  @Post("patients/:patientId/documents/upload-url")
  requestUpload(@Param("patientId") patientId: string, @Body() dto: RequestDocumentUploadDto, @CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.requestUpload(patientId, dto, user.id);
  }

  @RequirePermissions(PERMISSIONS.DOCUMENT_UPLOAD)
  @Post("documents/:id/confirm")
  confirm(@Param("id") id: string, @Body() dto: EntityScopedDto, @CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.confirmUpload(id, dto.entityId, user.id);
  }

  @RequirePermissions(PERMISSIONS.DOCUMENT_DOWNLOAD)
  @Get("documents/:id/download-url")
  download(@Param("id") id: string, @Query("entityId") entityId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.getDownloadUrl(id, entityId, user.id);
  }

  @RequirePermissions(PERMISSIONS.DOCUMENT_DELETE)
  @Delete("documents/:id")
  remove(@Param("id") id: string, @Query("entityId") entityId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.documentsService.softDelete(id, entityId, user.id);
  }
}
