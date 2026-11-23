import { IsBoolean, IsIn, IsOptional, IsString } from "class-validator";

const CONSENT_TYPES = ["TREATMENT", "DATA_SHARING", "CROSS_ENTITY_IDENTITY_LINKING", "PHOTO_VIDEO", "MARKETING"] as const;

export class CreateConsentRecordDto {
  @IsString()
  entityId!: string;

  @IsIn(CONSENT_TYPES)
  consentType!: (typeof CONSENT_TYPES)[number];

  @IsBoolean()
  granted!: boolean;

  @IsOptional()
  @IsString()
  documentRef?: string;
}
