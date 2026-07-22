import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  MissingDataFile,
  MissingDataFileSchema,
} from './schemas/missing-data-file.schema';
import {
  MasterDataUploadRequest,
  MasterDataUploadRequestSchema,
} from '../master-data/schemas/master-data-upload-request.schema';
import {
  MasterDataRecord,
  MasterDataSchema,
} from '../master-data/schemas/master-data.schema';
import {
  MasterDataChunk,
  MasterDataChunkSchema,
} from '../master-data/schemas/master-data-chunk.schema';
import { MissingDataService } from './missing-data.service';
import { MissingDataController } from './missing-data.controller';
import { MasterDataModule } from '../master-data/master-data.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MissingDataFile.name, schema: MissingDataFileSchema },
      { name: MasterDataUploadRequest.name, schema: MasterDataUploadRequestSchema },
      { name: MasterDataRecord.name, schema: MasterDataSchema },
      { name: MasterDataChunk.name, schema: MasterDataChunkSchema },
    ]),
    forwardRef(() => MasterDataModule),
  ],
  controllers: [MissingDataController],
  providers: [MissingDataService],
  exports: [MissingDataService],
})
export class MissingDataModule {}
