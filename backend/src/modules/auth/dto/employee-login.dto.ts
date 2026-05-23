import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class EmployeeIdLoginDto {
  @IsString()
  @IsNotEmpty()
  employeeId: string;

  @IsString()
  @MinLength(8)
  password: string;
}

export class SendOtpDto {
  @IsString()
  @IsNotEmpty()
  email: string;
}

export class VerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  otp: string;
}
