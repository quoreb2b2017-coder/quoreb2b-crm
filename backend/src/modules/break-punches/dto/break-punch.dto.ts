import { IsEnum } from 'class-validator';
import type { BreakType } from '../break-punch.constants';

export class ToggleBreakPunchDto {
  @IsEnum(['tea', 'lunch', 'meeting'])
  type: BreakType;
}
