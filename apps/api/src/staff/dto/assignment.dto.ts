import { IsString } from "class-validator";

export class AssignEntityDto {
  @IsString()
  entityId!: string;
}
