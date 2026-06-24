import { IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

export class CreateSuppressionCampaignDto {
  @ValidateIf((o: CreateSuppressionCampaignDto) => !o.campaignChannel?.trim())
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ValidateIf((o: CreateSuppressionCampaignDto) => !o.name?.trim())
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  campaignChannel?: string;
}
