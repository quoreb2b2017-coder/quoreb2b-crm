import { Global, Module } from '@nestjs/common';
import { S3Service } from './s3/s3.service';
import { SesService } from './ses/ses.service';

@Global()
@Module({
  providers: [S3Service, SesService],
  exports: [S3Service, SesService],
})
export class AwsModule {}
