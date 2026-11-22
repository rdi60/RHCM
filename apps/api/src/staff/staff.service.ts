import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import type { CreateStaffDto } from "./dto/create-staff.dto";

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listForEntity(entityId: string) {
    return this.prisma.client.staff.findMany({
      where: { assignments: { some: { entityId } } },
      orderBy: { fullName: "asc" },
    });
  }

  async create(dto: CreateStaffDto, actorUserId: string) {
    const existing = await this.prisma.client.staff.findUnique({ where: { employeeCode: dto.employeeCode } });
    if (existing) throw new ConflictException("A staff member with this employee code already exists");

    const staff = await this.prisma.client.staff.create({
      data: {
        fullName: dto.fullName,
        designation: dto.designation,
        employeeCode: dto.employeeCode,
        userId: dto.userId,
        assignments: { create: { entityId: dto.entityId } },
      },
    });

    await this.audit.record({
      actorUserId,
      entityId: dto.entityId,
      action: "staff.created",
      resourceType: "staff",
      resourceId: staff.id,
      after: { fullName: staff.fullName, employeeCode: staff.employeeCode },
    });

    return staff;
  }

  async assign(staffId: string, entityId: string, actorUserId: string) {
    const staff = await this.prisma.client.staff.findUnique({ where: { id: staffId } });
    if (!staff) throw new NotFoundException("Staff member not found");

    const assignment = await this.prisma.client.staffEntityAssignment.upsert({
      where: { staffId_entityId: { staffId, entityId } },
      update: {},
      create: { staffId, entityId },
    });
    await this.audit.record({ actorUserId, entityId, action: "staff.assigned", resourceType: "staff", resourceId: staffId });
    return assignment;
  }

  async unassign(staffId: string, entityId: string, actorUserId: string) {
    await this.prisma.client.staffEntityAssignment.deleteMany({ where: { staffId, entityId } });
    await this.audit.record({ actorUserId, entityId, action: "staff.unassigned", resourceType: "staff", resourceId: staffId });
    return { success: true };
  }
}
