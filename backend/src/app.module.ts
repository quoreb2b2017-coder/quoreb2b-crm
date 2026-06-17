import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { CustomThrottlerGuard } from './common/guards/custom-throttler.guard';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ActivityLoggingInterceptor } from './common/interceptors/activity-logging.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { BullModule } from '@nestjs/bullmq';
import configuration from './config/configuration';
import { isRedisEnabled } from './config/env';
import { buildRedisOptions } from './redis/redis.factory';
import { DatabaseModule } from './database/database.module';
import { CacheModule } from './redis/cache.module';
import { RedisModule } from './redis/redis.module';
import { ElasticsearchModule } from './elasticsearch/elasticsearch.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { PermissionsModule } from './modules/permissions/permissions.module';
import { LeadsModule } from './modules/leads/leads.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { EmailModule } from './modules/email/email.module';
import { WhatsappModule } from './modules/whatsapp/whatsapp.module';
import { AutomationModule } from './modules/automation/automation.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AiModule } from './modules/ai/ai.module';
import { ActivityLogsModule } from './modules/activity-logs/activity-logs.module';
import { SettingsModule } from './modules/settings/settings.module';
import { MasterDataModule } from './modules/master-data/master-data.module';
import { EventsModule } from './events/events.module';
import { HealthModule } from './health/health.module';
import { BatchesModule } from './modules/batches/batches.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { LeaveModule } from './modules/leave/leave.module';
import { BulkEmailVerificationModule } from './modules/bulk-email-verification/bulk-email-verification.module';
import { PersonalNotesModule } from './modules/personal-notes/personal-notes.module';
import { BreakPunchesModule } from './modules/break-punches/break-punches.module';

@Module({})
export class AppModule {
  static register(): DynamicModule {
    const redisEnabled = isRedisEnabled();

    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
        ThrottlerModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (config: ConfigService) => [
            {
              ttl: config.get<number>('THROTTLE_TTL', 60) * 1000,
              limit: config.get<number>('THROTTLE_LIMIT', 100),
            },
          ],
        }),
        MongooseModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            uri: config.get<string>('MONGODB_URI'),
            maxPoolSize: config.get<number>('MONGODB_MAX_POOL_SIZE', 10),
          }),
        }),
        ...(redisEnabled
          ? [
              BullModule.forRootAsync({
                inject: [ConfigService],
                useFactory: (config: ConfigService) => ({
                  connection: buildRedisOptions(config),
                  prefix: config.get<string>('BULLMQ_PREFIX', 'quoreb2b'),
                }),
              }),
            ]
          : []),
        ...(redisEnabled ? [RedisModule] : []),
        CacheModule,
        DatabaseModule,
        ElasticsearchModule.register(),
        AuthModule,
        UsersModule,
        RolesModule,
        PermissionsModule,
        LeadsModule,
        CompaniesModule,
        CampaignsModule,
        EmailModule.register(),
        WhatsappModule.register(),
        AutomationModule.register(),
        AnalyticsModule,
        NotificationsModule,
        AiModule,
        ActivityLogsModule,
        SettingsModule,
        MasterDataModule,
        BatchesModule,
        AttendanceModule,
        LeaveModule,
        PersonalNotesModule,
        BreakPunchesModule,
        BulkEmailVerificationModule.register(),
        EventsModule,
        HealthModule,
      ],
      providers: [
        { provide: APP_GUARD, useClass: CustomThrottlerGuard },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_INTERCEPTOR, useExisting: ActivityLoggingInterceptor },
      ],
    };
  }
}
