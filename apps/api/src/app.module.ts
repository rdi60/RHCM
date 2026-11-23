import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { EntitiesModule } from "./entities/entities.module";
import { RolesModule } from "./roles/roles.module";
import { UsersModule } from "./users/users.module";
import { StaffModule } from "./staff/staff.module";
import { PatientsModule } from "./patients/patients.module";
import { AppointmentsModule } from "./appointments/appointments.module";
import { VisitsModule } from "./visits/visits.module";
import { ClinicalModule } from "./clinical/clinical.module";
import { BillingModule } from "./billing/billing.module";
import { StorageModule } from "./storage/storage.module";
import { DocumentsModule } from "./documents/documents.module";
import { ConsentModule } from "./consent/consent.module";
import { ReportsModule } from "./reports/reports.module";
import { SessionAuthGuard } from "./common/guards/session-auth.guard";
import { PermissionsGuard } from "./common/guards/permissions.guard";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 120 }] }),
    PrismaModule,
    AuditModule,
    AuthModule,
    EntitiesModule,
    RolesModule,
    UsersModule,
    StaffModule,
    PatientsModule,
    AppointmentsModule,
    VisitsModule,
    ClinicalModule,
    BillingModule,
    StorageModule,
    DocumentsModule,
    ConsentModule,
    ReportsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
