import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckResult,
} from '@nestjs/terminus';

import { HealthService } from './health.service';
import { Public } from '@modules/auth/decorators/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private healthService: HealthService) {}

  @Get()
  @Public()
  @HealthCheck()
  @ApiOperation({ summary: 'Health check completo' })
  @ApiResponse({ status: 200, description: 'Serviço saudável' })
  @ApiResponse({ status: 503, description: 'Serviço não saudável' })
  async check(): Promise<HealthCheckResult> {
    return this.healthService.checkHealth();
  }

  @Get('ready')
  @Public()
  @HealthCheck()
  @ApiOperation({ summary: 'Readiness check' })
  @ApiResponse({ status: 200, description: 'Serviço pronto' })
  @ApiResponse({ status: 503, description: 'Serviço não pronto' })
  async ready(): Promise<HealthCheckResult> {
    return this.healthService.checkReadiness();
  }

  @Get('live')
  @Public()
  @HealthCheck()
  @ApiOperation({ summary: 'Liveness check' })
  @ApiResponse({ status: 200, description: 'Serviço vivo' })
  @ApiResponse({ status: 503, description: 'Serviço não responsivo' })
  async live(): Promise<HealthCheckResult> {
    return this.healthService.checkLiveness();
  }

  @Get('info')
  @Public()
  @ApiOperation({ summary: 'Informações do serviço' })
  @ApiResponse({ status: 200, description: 'Informações do serviço' })
  info() {
    return this.healthService.getInfo();
  }
}