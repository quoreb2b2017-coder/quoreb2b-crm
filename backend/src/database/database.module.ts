import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../modules/users/schemas/user.schema';
import { SeedService } from './seed.service';
import { IndexSyncService } from './index-sync.service';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  providers: [SeedService, IndexSyncService],
  exports: [SeedService],
})
export class DatabaseModule {}
