import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';

export interface KafkaMessage {
  topic: string;
  partition?: number;
  key?: string;
  value: any;
  headers?: Record<string, any>;
}

@Injectable()
export class KafkaService implements OnModuleInit {
  private readonly logger = new Logger(KafkaService.name);

  constructor(
    @Inject('KAFKA_SERVICE') private readonly kafkaClient: ClientKafka,
  ) {}

  async onModuleInit() {
    // Subscribe to topics for consuming
    const topics = [
      'user.created',
      'user.updated',
      'user.deleted',
      'auth.login',
      'auth.logout',
    ];

    topics.forEach(topic => {
      this.kafkaClient.subscribeToResponseOf(topic);
    });

    try {
      await this.kafkaClient.connect();
      this.logger.log('✅ Kafka client connected successfully');
    } catch (error) {
      this.logger.error('❌ Failed to connect to Kafka:', error);
    }
  }

  async sendMessage(message: KafkaMessage): Promise<void> {
    try {
      await this.kafkaClient.emit(message.topic, {
        key: message.key,
        value: message.value,
        headers: {
          ...message.headers,
          timestamp: new Date().toISOString(),
        },
      });

      this.logger.log(`📤 Message sent to topic: ${message.topic}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send message to topic ${message.topic}:`, error);
      throw error;
    }
  }

  async sendUserCreatedEvent(userId: string, userData: any): Promise<void> {
    await this.sendMessage({
      topic: 'user.created',
      key: userId,
      value: {
        userId,
        ...userData,
        eventType: 'USER_CREATED',
      },
    });
  }

  async sendUserUpdatedEvent(userId: string, userData: any): Promise<void> {
    await this.sendMessage({
      topic: 'user.updated',
      key: userId,
      value: {
        userId,
        ...userData,
        eventType: 'USER_UPDATED',
      },
    });
  }

  async sendUserDeletedEvent(userId: string): Promise<void> {
    await this.sendMessage({
      topic: 'user.deleted',
      key: userId,
      value: {
        userId,
        eventType: 'USER_DELETED',
      },
    });
  }

  async sendAuthLoginEvent(userId: string, metadata: any): Promise<void> {
    await this.sendMessage({
      topic: 'auth.login',
      key: userId,
      value: {
        userId,
        ...metadata,
        eventType: 'AUTH_LOGIN',
      },
    });
  }

  async sendAuthLogoutEvent(userId: string, metadata: any): Promise<void> {
    await this.sendMessage({
      topic: 'auth.logout',
      key: userId,
      value: {
        userId,
        ...metadata,
        eventType: 'AUTH_LOGOUT',
      },
    });
  }
}