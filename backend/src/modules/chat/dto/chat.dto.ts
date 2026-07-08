import { IsMongoId, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Type } from 'class-transformer';

export class StartChatDto {
  @IsMongoId()
  peerUserId: string;
}

export class SendChatMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  text: string;
}

export class ListMessagesDto {
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsString()
  before?: string;
}
