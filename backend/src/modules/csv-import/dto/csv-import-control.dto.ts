import { IsEnum } from 'class-validator';

export class CsvImportControlDto {
  @IsEnum(['pause', 'resume', 'cancel'])
  action: 'pause' | 'resume' | 'cancel';
}
