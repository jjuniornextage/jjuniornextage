import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiExcludeEndpoint } from '@nestjs/swagger';

import { MetricsService } from './metrics.service';
import { Public } from '@modules/auth/decorators/public.decorator';

@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private metricsService: MetricsService) {}

  @Get()
  @Public()
  @Header('Content-Type', 'text/plain')
  @ApiExcludeEndpoint() // Exclude from Swagger docs for security
  @ApiOperation({ summary: 'Métricas Prometheus' })
  @ApiResponse({ status: 200, description: 'Métricas em formato Prometheus' })
  async getMetrics(): Promise<string> {
    return this.metricsService.getMetrics();
  }
}