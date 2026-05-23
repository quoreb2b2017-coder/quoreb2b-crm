import { IsArray, IsMongoId } from 'class-validator';

export class ShareMasterDataDto {
  @IsArray()
  @IsMongoId({ each: true })
  userIds: string[];
}
