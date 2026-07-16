import { IsOptional, IsString, Length } from 'class-validator';

export class DeleteUserDto {
  /** Required when deleting a Super Admin account. */
  @IsOptional()
  @IsString()
  @Length(4, 12)
  otp?: string;
}
