import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'NestJS API Backend is running! 🚀';
  }

  getVersion() {
    return {
      name: 'NestJS API Backend',
      version: '1.0.0',
      description: 'API Backend completa com NestJS e melhores práticas',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
    };
  }
}