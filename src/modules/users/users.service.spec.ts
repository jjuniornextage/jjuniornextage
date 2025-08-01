import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { ConflictException, NotFoundException } from '@nestjs/common';

import { UsersService } from './users.service';
import { User, UserRole, UserStatus } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { KafkaService } from '@config/kafka/kafka.service';

describe('UsersService', () => {
  let service: UsersService;
  let repository: Repository<User>;
  let cacheManager: any;
  let kafkaService: KafkaService;

  const mockUser: User = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Test User',
    username: 'testuser',
    email: 'test@example.com',
    password: 'hashedpassword',
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    emailVerified: false,
    failedLoginAttempts: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
  } as User;

  const mockRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    softDelete: jest.fn(),
    restore: jest.fn(),
    update: jest.fn(),
  };

  const mockCacheManager = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  };

  const mockKafkaService = {
    sendUserCreatedEvent: jest.fn(),
    sendUserUpdatedEvent: jest.fn(),
    sendUserDeletedEvent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepository,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCacheManager,
        },
        {
          provide: KafkaService,
          useValue: mockKafkaService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repository = module.get<Repository<User>>(getRepositoryToken(User));
    cacheManager = module.get(CACHE_MANAGER);
    kafkaService = module.get<KafkaService>(KafkaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    const createUserDto: CreateUserDto = {
      name: 'Test User',
      username: 'testuser',
      email: 'test@example.com',
      password: 'TestPassword123!',
    };

    it('should create a user successfully', async () => {
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.create.mockReturnValue(mockUser);
      mockRepository.save.mockResolvedValue(mockUser);

      const result = await service.create(createUserDto);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: [
          { email: createUserDto.email.toLowerCase() },
          { username: createUserDto.username.toLowerCase() },
        ],
      });
      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
      expect(mockKafkaService.sendUserCreatedEvent).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({
          email: mockUser.email,
          username: mockUser.username,
          name: mockUser.name,
          role: mockUser.role,
        }),
      );
      expect(result).toEqual(mockUser);
      expect(result.password).toBeUndefined();
    });

    it('should throw ConflictException if email already exists', async () => {
      mockRepository.findOne.mockResolvedValue({
        ...mockUser,
        email: createUserDto.email.toLowerCase(),
      });

      await expect(service.create(createUserDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException if username already exists', async () => {
      mockRepository.findOne.mockResolvedValue({
        ...mockUser,
        username: createUserDto.username.toLowerCase(),
      });

      await expect(service.create(createUserDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findOne', () => {
    it('should return a user when found', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockUser),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockCacheManager.get.mockResolvedValue(null);

      const result = await service.findOne(mockUser.id);

      expect(result).toEqual(mockUser);
      expect(result.password).toBeUndefined();
      expect(mockCacheManager.set).toHaveBeenCalled();
    });

    it('should return cached user when available', async () => {
      mockCacheManager.get.mockResolvedValue(mockUser);

      const result = await service.findOne(mockUser.id);

      expect(result).toEqual(mockUser);
      expect(mockRepository.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when user not found', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockCacheManager.get.mockResolvedValue(null);

      await expect(service.findOne('nonexistent-id')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findByEmail', () => {
    it('should find user by email', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findByEmail('test@example.com');

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findByEmail('nonexistent@example.com');

      expect(result).toBeNull();
    });
  });

  describe('findByUsername', () => {
    it('should find user by username', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.findByUsername('testuser');

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { username: 'testuser' },
      });
      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await service.findByUsername('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('remove', () => {
    it('should soft delete a user', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockUser),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockCacheManager.get.mockResolvedValue(null);
      mockRepository.softDelete.mockResolvedValue({ affected: 1 });

      await service.remove(mockUser.id);

      expect(mockRepository.softDelete).toHaveBeenCalledWith(mockUser.id);
      expect(mockKafkaService.sendUserDeletedEvent).toHaveBeenCalledWith(
        mockUser.id,
      );
    });
  });

  describe('updateStatus', () => {
    it('should update user status', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockUser),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
      mockCacheManager.get.mockResolvedValue(null);
      
      const updatedUser = { ...mockUser, status: UserStatus.SUSPENDED };
      mockRepository.save.mockResolvedValue(updatedUser);

      const result = await service.updateStatus(
        mockUser.id,
        UserStatus.SUSPENDED,
      );

      expect(result.status).toBe(UserStatus.SUSPENDED);
      expect(mockRepository.save).toHaveBeenCalled();
    });
  });
});