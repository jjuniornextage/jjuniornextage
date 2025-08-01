import { registerAs } from '@nestjs/config';

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  apiPrefix: process.env.API_PREFIX || 'api/v1',
  swaggerEnabled: process.env.SWAGGER_ENABLED === 'true',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  trustProxy: process.env.TRUST_PROXY === 'true',
}));