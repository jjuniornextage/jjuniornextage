import { Injectable } from '@nestjs/common';
import {
  HealthCheckService,
  TypeOrmHealthIndicator,
  MemoryHealthIndicator,
  DiskHealthIndicator,
} from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class HealthService {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private memory: MemoryHealthIndicator,
    private disk: DiskHealthIndicator,
    private configService: ConfigService,
  ) {}

  async checkHealth() {
    return this.health.check([
      // Database check
      () => this.db.pingCheck('database'),
      
      // Memory check (heap should not exceed 512MB)
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024),
      
      // RSS memory check (should not exceed 1GB)
      () => this.memory.checkRSS('memory_rss', 1024 * 1024 * 1024),
      
      // Disk storage check (should have at least 1GB free)
      () => this.disk.checkStorage('storage', {
        thresholdPercent: 0.9,
        path: '/',
      }),
    ]);
  }

  async checkReadiness() {
    return this.health.check([
      // Only database check for readiness
      () => this.db.pingCheck('database'),
    ]);
  }

  async checkLiveness() {
    return this.health.check([
      // Memory checks for liveness
      () => this.memory.checkHeap('memory_heap', 512 * 1024 * 1024),
      () => this.memory.checkRSS('memory_rss', 1024 * 1024 * 1024),
    ]);
  }

  getInfo() {
    const nodeEnv = this.configService.get('app.nodeEnv');
    const port = this.configService.get('app.port');
    
    return {
      service: 'NestJS API Backend',
      version: '1.0.0',
      environment: nodeEnv,
      port,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      memory: process.memoryUsage(),
      nodeVersion: process.version,
    };
  }
}