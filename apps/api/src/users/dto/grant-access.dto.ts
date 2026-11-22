import { IsString } from "class-validator";

export class GrantAccessDto {
  @IsString()
  entityId!: string;

  @IsString()
  roleId!: string;
}
