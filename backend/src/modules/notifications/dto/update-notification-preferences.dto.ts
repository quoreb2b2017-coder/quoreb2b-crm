import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  toastEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  emailAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  batchAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  leaveAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  attendanceAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  systemAlerts?: boolean;

  @IsOptional()
  @IsBoolean()
  activityAlerts?: boolean;
}
