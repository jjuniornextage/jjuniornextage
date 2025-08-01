import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as client from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly register: client.Registry;
  private readonly httpRequestDuration: client.Histogram<string>;
  private readonly httpRequestTotal: client.Counter<string>;
  private readonly activeConnections: client.Gauge<string>;
  private readonly databaseConnections: client.Gauge<string>;
  private readonly redisConnections: client.Gauge<string>;

  constructor(private configService: ConfigService) {
    this.register = new client.Registry();
    
    // Set default labels
    this.register.setDefaultLabels({
      app: 'nestjs-api-backend',
      version: '1.0.0',
      environment: this.configService.get('app.nodeEnv', 'development'),
    });

    // HTTP request duration histogram
    this.httpRequestDuration = new client.Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
    });

    // HTTP request total counter
    this.httpRequestTotal = new client.Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
    });

    // Active connections gauge
    this.activeConnections = new client.Gauge({
      name: 'active_connections',
      help: 'Number of active connections',
    });

    // Database connections gauge
    this.databaseConnections = new client.Gauge({
      name: 'database_connections',
      help: 'Number of database connections',
      labelNames: ['pool', 'state'],
    });

    // Redis connections gauge
    this.redisConnections = new client.Gauge({
      name: 'redis_connections',
      help: 'Number of Redis connections',
      labelNames: ['state'],
    });

    // Register metrics
    this.register.registerMetric(this.httpRequestDuration);
    this.register.registerMetric(this.httpRequestTotal);
    this.register.registerMetric(this.activeConnections);
    this.register.registerMetric(this.databaseConnections);
    this.register.registerMetric(this.redisConnections);

    // Collect default metrics
    client.collectDefaultMetrics({
      register: this.register,
      prefix: 'nodejs_',
    });
  }

  onModuleInit() {
    // Initialize some metrics
    this.activeConnections.set(0);
    this.databaseConnections.set({ pool: 'main', state: 'active' }, 0);
    this.databaseConnections.set({ pool: 'main', state: 'idle' }, 0);
    this.redisConnections.set({ state: 'connected' }, 0);
    this.redisConnections.set({ state: 'disconnected' }, 0);
  }

  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    duration: number,
  ): void {
    const labels = {
      method: method.toUpperCase(),
      route,
      status_code: statusCode.toString(),
    };

    this.httpRequestDuration.observe(labels, duration / 1000);
    this.httpRequestTotal.inc(labels);
  }

  incrementActiveConnections(): void {
    this.activeConnections.inc();
  }

  decrementActiveConnections(): void {
    this.activeConnections.dec();
  }

  setDatabaseConnections(active: number, idle: number): void {
    this.databaseConnections.set({ pool: 'main', state: 'active' }, active);
    this.databaseConnections.set({ pool: 'main', state: 'idle' }, idle);
  }

  setRedisConnections(connected: number, disconnected: number): void {
    this.redisConnections.set({ state: 'connected' }, connected);
    this.redisConnections.set({ state: 'disconnected' }, disconnected);
  }

  async getMetrics(): Promise<string> {
    return this.register.metrics();
  }

  getRegister(): client.Registry {
    return this.register;
  }

  // Custom business metrics
  createCounter(name: string, help: string, labelNames?: string[]): client.Counter<string> {
    const counter = new client.Counter({
      name,
      help,
      labelNames,
    });
    this.register.registerMetric(counter);
    return counter;
  }

  createGauge(name: string, help: string, labelNames?: string[]): client.Gauge<string> {
    const gauge = new client.Gauge({
      name,
      help,
      labelNames,
    });
    this.register.registerMetric(gauge);
    return gauge;
  }

  createHistogram(
    name: string,
    help: string,
    labelNames?: string[],
    buckets?: number[],
  ): client.Histogram<string> {
    const histogram = new client.Histogram({
      name,
      help,
      labelNames,
      buckets: buckets || client.exponentialBuckets(0.1, 2, 10),
    });
    this.register.registerMetric(histogram);
    return histogram;
  }
}