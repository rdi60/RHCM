import { PartialType, OmitType } from "@nestjs/mapped-types";
import { IsString } from "class-validator";
import { CreateTempRegistrationDto } from "./create-temp-registration.dto";

export class UpdateTempRegistrationDto extends PartialType(OmitType(CreateTempRegistrationDto, ["entityId"] as const)) {
  @IsString()
  entityId!: string;
}
