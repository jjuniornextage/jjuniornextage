import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule } from '@nestjs/throttler';
import { CacheModule } from '@nestjs/cache-manager';
import { WinstonModule } from 'nest-winston';

import { DatabaseModule } from '@database/database.module';
import { RedisModule } from '@config/redis/redis.module';
import { KafkaModule } from '@config/kafka/kafka.module';
import { AuthModule } from '@modules/auth/auth.module';
import { UsersModule } from '@modules/users/users.module';
import { HealthModule } from '@modules/health/health.module';
import { MetricsModule } from '@modules/metrics/metrics.module';

import { appConfig } from '@config/app.config';
import { databaseConfig } from '@config/database.config';
import { jwtConfig } from '@config/jwt.config';
import { redisConfig } from '@config/redis.config';
import { kafkaConfig } from '@config/kafka.config';
import { loggerConfig } from '@config/logger.config';

import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      load: [
        appConfig,
        databaseConfig,
        jwtConfig,
        redisConfig,
        kafkaConfig,
      ],
      validationSchema: require('joi').object({
        NODE_ENV: require('joi').string()
          .valid('development', 'production', 'test')
          .default('development'),
        PORT: require('joi').number().default(3000),
        DATABASE_HOST: require('joi').string().required(),
        DATABASE_PORT: require('joi').number().default(5432),
        DATABASE_USERNAME: require('joi').string().required(),
        DATABASE_PASSWORD: require('joi').string().required(),
        DATABASE_NAME: require('joi').string().required(),
        REDIS_HOST: require('joi').string().required(),
        REDIS_PORT: require('joi').number().default(6379),
        JWT_SECRET: require('joi').string().required(),
        JWT_EXPIRES_IN: require('joi').number().default(3600),
      }),
    }),

    // Logging
    WinstonModule.forRootAsync({
      useFactory: loggerConfig,
    }),

    // Database
    DatabaseModule,

    // Cache
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: () => ({
        store: 'redis',
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0'),
        ttl: 300, // 5 minutes default
      }),
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.THROTTLE_TTL || '60') * 1000,
        limit: parseInt(process.env.THROTTLE_LIMIT || '10'),
      },
    ]),

    // Infrastructure modules
    RedisModule,
    KafkaModule,

    // Business modules
    AuthModule,
    UsersModule,
    HealthModule,
    MetricsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}