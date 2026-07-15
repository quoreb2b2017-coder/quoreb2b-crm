import {
  ArrayMaxSize,
  IsArray,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  IsNumber,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StartChatDto {
  @IsMongoId()
  peerUserId: string;
}

export class ChatAttachmentMetaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  key: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  mimeType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(25 * 1024 * 1024)
  sizeBytes?: number;
}

export class SendChatMessageDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  text?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => ChatAttachmentMetaDto)
  attachments?: ChatAttachmentMetaDto[];
}

export class PresignChatAttachmentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contentType?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(25 * 1024 * 1024)
  fileSizeBytes: number;
}

export class ListMessagesDto {
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsString()
  before?: string;
}
