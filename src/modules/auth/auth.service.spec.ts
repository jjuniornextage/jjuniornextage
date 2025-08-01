import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

import { AuthService } from './auth.service';
import { UsersService } from '@modules/users/users.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { User, UserRole, UserStatus } from '@modules/users/entities/user.entity';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { KafkaService } from '@config/kafka/kafka.service';

// Mock bcrypt
jest.mock('bcryptjs');
const mockedBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersService;
  let jwtService: JwtService;
  let configService: ConfigService;
  let refreshTokenRepository: Repository<RefreshToken>;
  let kafkaService: KafkaService;

  const mockUser: User = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    name: 'Test User',
    username: 'testuser',
    email: 'test@example.com',
    password: 'hashedpassword',
    role: UserRole.USER,
    status: UserStatus.ACTIVE,
    emailVerified: true,
    failedLoginAttempts: 0,
    lockedUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
  } as User;

  const mockUsersService = {
    create: jest.fn(),
    findByEmail: jest.fn(),
    findByUsername: jest.fn(),
    findOne: jest.fn(),
    updateLastLogin: jest.fn(),
    incrementFailedLoginAttempts: jest.fn(),
    update: jest.fn(),
  };

  const mockJwtService = {
    signAsync: jest.fn(),
    verify: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockRefreshTokenRepository = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  const mockKafkaService = {
    sendAuthLoginEvent: jest.fn(),
    sendAuthLogoutEvent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: mockRefreshTokenRepository,
        },
        {
          provide: KafkaService,
          useValue: mockKafkaService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersService = module.get<UsersService>(UsersService);
    jwtService = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);
    refreshTokenRepository = module.get<Repository<RefreshToken>>(
      getRepositoryToken(RefreshToken),
    );
    kafkaService = module.get<KafkaService>(KafkaService);

    // Setup default config values
    mockConfigService.get.mockImplementation((key: string) => {
      const config = {
        'jwt.secret': 'test-secret',
        'jwt.expiresIn': 3600,
        'jwt.refreshSecret': 'test-refresh-secret',
        'jwt.refreshExpiresIn': 604800,
      };
      return config[key];
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    const registerDto: RegisterDto = {
      name: 'Test User',
      username: 'testuser',
      email: 'test@example.com',
      password: 'TestPassword123!',
    };

    it('should register a user successfully', async () => {
      const userWithoutPassword = { ...mockUser };
      delete userWithoutPassword.password;

      mockUsersService.create.mockResolvedValue(userWithoutPassword);
      mockJwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');
      mockRefreshTokenRepository.create.mockReturnValue({});
      mockRefreshTokenRepository.save.mockResolvedValue({});

      const result = await service.register(registerDto, {
        ip: '127.0.0.1',
        userAgent: 'test-agent',
      });

      expect(mockUsersService.create).toHaveBeenCalledWith(registerDto);
      expect(result).toHaveProperty('accessToken', 'access-token');
      expect(result).toHaveProperty('refreshToken', 'refresh-token');
      expect(result).toHaveProperty('user');
      expect(result.user.id).toBe(mockUser.id);
    });

    it('should propagate errors from users service', async () => {
      mockUsersService.create.mockRejectedValue(
        new BadRequestException('Email already exists'),
      );

      await expect(
        service.register(registerDto, { ip: '127.0.0.1' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('login', () => {
    const loginDto: LoginDto = {
      login: 'test@example.com',
      password: 'TestPassword123!',
    };

    it('should login successfully with email', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      mockUsersService.findByUsername.mockResolvedValue(null);
      mockedBcrypt.compare.mockResolvedValue(true as never);
      mockJwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');
      mockRefreshTokenRepository.create.mockReturnValue({});
      mockRefreshTokenRepository.save.mockResolvedValue({});

      const result = await service.login(loginDto, {
        ip: '127.0.0.1',
        userAgent: 'test-agent',
      });

      expect(mockUsersService.findByEmail).toHaveBeenCalledWith(loginDto.login);
      expect(mockedBcrypt.compare).toHaveBeenCalledWith(
        loginDto.password,
        mockUser.password,
      );
      expect(mockUsersService.updateLastLogin).toHaveBeenCalledWith(
        mockUser.id,
        '127.0.0.1',
      );
      expect(mockKafkaService.sendAuthLoginEvent).toHaveBeenCalled();
      expect(result).toHaveProperty('accessToken', 'access-token');
      expect(result).toHaveProperty('refreshToken', 'refresh-token');
    });

    it('should login successfully with username', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.findByUsername.mockResolvedValue(mockUser);
      mockedBcrypt.compare.mockResolvedValue(true as never);
      mockJwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');
      mockRefreshTokenRepository.create.mockReturnValue({});
      mockRefreshTokenRepository.save.mockResolvedValue({});

      const result = await service.login(
        { ...loginDto, login: 'testuser' },
        { ip: '127.0.0.1' },
      );

      expect(mockUsersService.findByUsername).toHaveBeenCalledWith('testuser');
      expect(result).toHaveProperty('accessToken');
    });

    it('should throw UnauthorizedException for invalid credentials', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.findByUsername.mockResolvedValue(null);

      await expect(
        service.login(loginDto, { ip: '127.0.0.1' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      mockedBcrypt.compare.mockResolvedValue(false as never);

      await expect(
        service.login(loginDto, { ip: '127.0.0.1' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockUsersService.incrementFailedLoginAttempts).toHaveBeenCalledWith(
        mockUser.id,
      );
    });

    it('should throw UnauthorizedException for locked account', async () => {
      const lockedUser = {
        ...mockUser,
        lockedUntil: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes in future
      };
      mockUsersService.findByEmail.mockResolvedValue(lockedUser);

      await expect(
        service.login(loginDto, { ip: '127.0.0.1' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      const inactiveUser = { ...mockUser, status: UserStatus.INACTIVE };
      mockUsersService.findByEmail.mockResolvedValue(inactiveUser);

      await expect(
        service.login(loginDto, { ip: '127.0.0.1' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    const refreshTokenDto = { refreshToken: 'valid-refresh-token' };
    const mockRefreshToken = {
      id: 'token-id',
      token: 'valid-refresh-token',
      userId: mockUser.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      isRevoked: false,
      user: mockUser,
    } as RefreshToken;

    it('should refresh tokens successfully', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: mockUser.id,
        type: 'refresh',
      });
      mockRefreshTokenRepository.findOne.mockResolvedValue(mockRefreshToken);
      mockJwtService.signAsync
        .mockResolvedValueOnce('new-access-token')
        .mockResolvedValueOnce('new-refresh-token');
      mockRefreshTokenRepository.create.mockReturnValue({});
      mockRefreshTokenRepository.save.mockResolvedValue({});

      const result = await service.refresh(refreshTokenDto, {
        ip: '127.0.0.1',
      });

      expect(mockJwtService.verify).toHaveBeenCalledWith(
        refreshTokenDto.refreshToken,
        { secret: 'test-refresh-secret' },
      );
      expect(mockRefreshTokenRepository.update).toHaveBeenCalledWith(
        { token: refreshTokenDto.refreshToken },
        expect.objectContaining({
          isRevoked: true,
          revokedReason: 'rotated',
        }),
      );
      expect(result).toHaveProperty('accessToken', 'new-access-token');
      expect(result).toHaveProperty('refreshToken', 'new-refresh-token');
    });

    it('should throw UnauthorizedException for invalid token', async () => {
      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(
        service.refresh(refreshTokenDto, { ip: '127.0.0.1' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for access token type', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: mockUser.id,
        type: 'access',
      });

      await expect(
        service.refresh(refreshTokenDto, { ip: '127.0.0.1' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for revoked token', async () => {
      mockJwtService.verify.mockReturnValue({
        sub: mockUser.id,
        type: 'refresh',
      });
      mockRefreshTokenRepository.findOne.mockResolvedValue(null);

      await expect(
        service.refresh(refreshTokenDto, { ip: '127.0.0.1' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for expired token', async () => {
      const expiredToken = {
        ...mockRefreshToken,
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
      };

      mockJwtService.verify.mockReturnValue({
        sub: mockUser.id,
        type: 'refresh',
      });
      mockRefreshTokenRepository.findOne.mockResolvedValue(expiredToken);

      await expect(
        service.refresh(refreshTokenDto, { ip: '127.0.0.1' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      await service.logout('refresh-token', mockUser.id);

      expect(mockRefreshTokenRepository.update).toHaveBeenCalledWith(
        { token: 'refresh-token' },
        expect.objectContaining({
          isRevoked: true,
          revokedReason: 'logout',
        }),
      );
      expect(mockKafkaService.sendAuthLogoutEvent).toHaveBeenCalledWith(
        mockUser.id,
        expect.objectContaining({ timestamp: expect.any(Date) }),
      );
    });

    it('should not throw on logout errors', async () => {
      mockRefreshTokenRepository.update.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.logout('refresh-token', mockUser.id),
      ).resolves.not.toThrow();
    });
  });

  describe('validateUser', () => {
    it('should validate user successfully', async () => {
      mockUsersService.findOne.mockResolvedValue(mockUser);

      const result = await service.validateUser({
        sub: mockUser.id,
        email: mockUser.email,
        username: mockUser.username,
        role: mockUser.role,
        type: 'access',
      });

      expect(result).toEqual(mockUser);
    });

    it('should throw UnauthorizedException for inactive user', async () => {
      const inactiveUser = { ...mockUser, status: UserStatus.INACTIVE };
      mockUsersService.findOne.mockResolvedValue(inactiveUser);

      await expect(
        service.validateUser({
          sub: mockUser.id,
          email: mockUser.email,
          username: mockUser.username,
          role: mockUser.role,
          type: 'access',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for non-existent user', async () => {
      mockUsersService.findOne.mockResolvedValue(null);

      await expect(
        service.validateUser({
          sub: 'non-existent-id',
          email: 'test@example.com',
          username: 'test',
          role: UserRole.USER,
          type: 'access',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});