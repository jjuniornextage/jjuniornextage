import { registerAs } from '@nestjs/config';

export const kafkaConfig = registerAs('kafka', () => ({
  brokers: process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'],
  clientId: process.env.KAFKA_CLIENT_ID || 'nestjs-api',
  groupId: process.env.KAFKA_GROUP_ID || 'nestjs-api-group',
  retry: {
    initialRetryTime: 100,
    retries: 8,
  },
  connectionTimeout: 45000,
  requestTimeout: 30000,
}));