import { IsEnum, IsMongoId, IsOptional } from 'class-validator';
import type { BreakType } from '../break-punch.constants';

export class ToggleBreakPunchDto {
  @IsEnum(['tea', 'lunch', 'meeting'])
  type: BreakType;
}

export class ReviewMeetingRequestDto {
  @IsMongoId()
  requestId: string;

  @IsOptional()
  @IsEnum(['approve', 'reject'])
  action?: 'approve' | 'reject';
}
