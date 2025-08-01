import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject } from '@nestjs/common';
import { Cache } from 'cache-manager';
import * as bcrypt from 'bcryptjs';

import { User, UserStatus } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { KafkaService } from '@config/kafka/kafka.service';

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly cachePrefix = 'user';
  private readonly cacheTTL = 300; // 5 minutes

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Inject(CACHE_MANAGER)
    private readonly cacheManager: Cache,
    private readonly kafkaService: KafkaService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    // Check if user already exists
    await this.checkUserExists(createUserDto.email, createUserDto.username);

    // Hash password
    const hashedPassword = await bcrypt.hash(createUserDto.password, 12);

    // Create user
    const user = this.userRepository.create({
      ...createUserDto,
      password: hashedPassword,
      birthDate: createUserDto.birthDate ? new Date(createUserDto.birthDate) : undefined,
    });

    try {
      const savedUser = await this.userRepository.save(user);
      
      // Remove sensitive data
      delete savedUser.password;
      
      // Clear cache
      await this.clearUserCache(savedUser.id);
      
      // Send Kafka event
      await this.kafkaService.sendUserCreatedEvent(savedUser.id, {
        email: savedUser.email,
        username: savedUser.username,
        name: savedUser.name,
        role: savedUser.role,
      });

      this.logger.log(`User created successfully: ${savedUser.email}`);
      return savedUser;
    } catch (error) {
      this.logger.error(`Failed to create user: ${error.message}`);
      throw new BadRequestException('Failed to create user');
    }
  }

  async findAll(queryDto: QueryUserDto): Promise<PaginatedResult<User>> {
    const { page, limit, search, role, status, sortBy, sortOrder, includeDeleted } = queryDto;
    
    const cacheKey = `${this.cachePrefix}:list:${JSON.stringify(queryDto)}`;
    const cached = await this.cacheManager.get<PaginatedResult<User>>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const queryBuilder = this.createQueryBuilder('user', includeDeleted);

    // Apply filters
    if (search) {
      queryBuilder.andWhere(
        '(user.name ILIKE :search OR user.email ILIKE :search OR user.username ILIKE :search)',
        { search: `%${search}%` },
      );
    }

    if (role) {
      queryBuilder.andWhere('user.role = :role', { role });
    }

    if (status) {
      queryBuilder.andWhere('user.status = :status', { status });
    }

    // Apply sorting
    queryBuilder.orderBy(`user.${sortBy}`, sortOrder);

    // Apply pagination
    const skip = (page - 1) * limit;
    queryBuilder.skip(skip).take(limit);

    // Execute query
    const [data, total] = await queryBuilder.getManyAndCount();

    // Remove sensitive data
    data.forEach(user => delete user.password);

    const result: PaginatedResult<User> = {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: skip + limit < total,
        hasPrevPage: page > 1,
      },
    };

    // Cache result
    await this.cacheManager.set(cacheKey, result, this.cacheTTL);

    return result;
  }

  async findOne(id: string, includeDeleted = false): Promise<User> {
    const cacheKey = `${this.cachePrefix}:${id}`;
    const cached = await this.cacheManager.get<User>(cacheKey);
    
    if (cached) {
      return cached;
    }

    const queryBuilder = this.createQueryBuilder('user', includeDeleted);
    queryBuilder.andWhere('user.id = :id', { id });

    const user = await queryBuilder.getOne();

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    delete user.password;

    // Cache result
    await this.cacheManager.set(cacheKey, user, this.cacheTTL);

    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { email: email.toLowerCase() },
    });
  }

  async findByUsername(username: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: { username: username.toLowerCase() },
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    // Check for conflicts
    if (updateUserDto.username) {
      const existingUser = await this.findByUsername(updateUserDto.username);
      if (existingUser && existingUser.id !== id) {
        throw new ConflictException('Username already exists');
      }
    }

    // Update user
    Object.assign(user, {
      ...updateUserDto,
      birthDate: updateUserDto.birthDate ? new Date(updateUserDto.birthDate) : user.birthDate,
    });

    try {
      const updatedUser = await this.userRepository.save(user);
      
      // Clear cache
      await this.clearUserCache(id);
      
      // Send Kafka event
      await this.kafkaService.sendUserUpdatedEvent(id, updateUserDto);

      this.logger.log(`User updated successfully: ${updatedUser.email}`);
      return updatedUser;
    } catch (error) {
      this.logger.error(`Failed to update user: ${error.message}`);
      throw new BadRequestException('Failed to update user');
    }
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);

    try {
      await this.userRepository.softDelete(id);
      
      // Clear cache
      await this.clearUserCache(id);
      
      // Send Kafka event
      await this.kafkaService.sendUserDeletedEvent(id);

      this.logger.log(`User deleted successfully: ${user.email}`);
    } catch (error) {
      this.logger.error(`Failed to delete user: ${error.message}`);
      throw new BadRequestException('Failed to delete user');
    }
  }

  async restore(id: string): Promise<User> {
    const user = await this.findOne(id, true);

    if (!user.deletedAt) {
      throw new BadRequestException('User is not deleted');
    }

    try {
      await this.userRepository.restore(id);
      
      // Clear cache
      await this.clearUserCache(id);

      const restoredUser = await this.findOne(id);
      this.logger.log(`User restored successfully: ${restoredUser.email}`);
      
      return restoredUser;
    } catch (error) {
      this.logger.error(`Failed to restore user: ${error.message}`);
      throw new BadRequestException('Failed to restore user');
    }
  }

  async updateStatus(id: string, status: UserStatus): Promise<User> {
    const user = await this.findOne(id);
    user.status = status;

    try {
      const updatedUser = await this.userRepository.save(user);
      
      // Clear cache
      await this.clearUserCache(id);

      this.logger.log(`User status updated: ${user.email} -> ${status}`);
      return updatedUser;
    } catch (error) {
      this.logger.error(`Failed to update user status: ${error.message}`);
      throw new BadRequestException('Failed to update user status');
    }
  }

  async updateLastLogin(id: string, ip?: string): Promise<void> {
    await this.userRepository.update(id, {
      lastLoginAt: new Date(),
      lastLoginIp: ip,
      failedLoginAttempts: 0,
      lockedUntil: null,
    });

    // Clear cache
    await this.clearUserCache(id);
  }

  async incrementFailedLoginAttempts(id: string): Promise<void> {
    const user = await this.findOne(id);
    user.failedLoginAttempts += 1;

    // Lock user after 5 failed attempts for 15 minutes
    if (user.failedLoginAttempts >= 5) {
      user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
    }

    await this.userRepository.save(user);
    await this.clearUserCache(id);
  }

  private async checkUserExists(email: string, username: string): Promise<void> {
    const existingUser = await this.userRepository.findOne({
      where: [
        { email: email.toLowerCase() },
        { username: username.toLowerCase() },
      ],
    });

    if (existingUser) {
      if (existingUser.email === email.toLowerCase()) {
        throw new ConflictException('Email already exists');
      }
      if (existingUser.username === username.toLowerCase()) {
        throw new ConflictException('Username already exists');
      }
    }
  }

  private createQueryBuilder(alias: string, includeDeleted = false): SelectQueryBuilder<User> {
    const queryBuilder = this.userRepository.createQueryBuilder(alias);
    
    if (!includeDeleted) {
      queryBuilder.where(`${alias}.deletedAt IS NULL`);
    }

    return queryBuilder;
  }

  private async clearUserCache(userId: string): Promise<void> {
    const keys = [`${this.cachePrefix}:${userId}`, `${this.cachePrefix}:list:*`];
    
    for (const key of keys) {
      if (key.includes('*')) {
        // Clear all list cache keys
        await this.cacheManager.del(key);
      } else {
        await this.cacheManager.del(key);
      }
    }
  }
}