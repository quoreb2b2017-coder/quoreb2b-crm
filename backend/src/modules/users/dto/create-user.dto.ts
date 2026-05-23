import {
  IsArray,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { PanelType, SystemRole } from '../../../common/constants/roles.constant';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsOptional()
  @IsString()
  employeeId?: string;

  @IsArray()
  @IsEnum(SystemRole, { each: true })
  roles: SystemRole[];

  @IsOptional()
  @IsEnum(PanelType)
  panel?: PanelType;
}
