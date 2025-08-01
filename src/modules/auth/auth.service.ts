import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';

import { UsersService } from '@modules/users/users.service';
import { User, UserStatus } from '@modules/users/entities/user.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import {
  LoginDto,
  RegisterDto,
  RefreshTokenDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  AuthResponseDto,
} from './dto/auth.dto';
import { KafkaService } from '@config/kafka/kafka.service';

export interface JwtPayload {
  sub: string;
  email: string;
  username: string;
  role: string;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

export interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly kafkaService: KafkaService,
  ) {}

  async register(
    registerDto: RegisterDto,
    clientInfo?: ClientInfo,
  ): Promise<AuthResponseDto> {
    try {
      // Create user through users service
      const user = await this.usersService.create(registerDto);

      // Generate tokens
      const tokens = await this.generateTokens(user, clientInfo);

      this.logger.log(`User registered successfully: ${user.email}`);

      return {
        ...tokens,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          username: user.username,
          role: user.role,
          status: user.status,
        },
      };
    } catch (error) {
      this.logger.error(`Registration failed: ${error.message}`);
      throw error;
    }
  }

  async login(
    loginDto: LoginDto,
    clientInfo?: ClientInfo,
  ): Promise<AuthResponseDto> {
    const { login, password } = loginDto;

    // Find user by email or username
    let user = await this.usersService.findByEmail(login);
    if (!user) {
      user = await this.usersService.findByUsername(login);
    }

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingTime = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / (1000 * 60),
      );
      throw new UnauthorizedException(
        `Account locked. Try again in ${remainingTime} minutes.`,
      );
    }

    // Check user status
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      await this.usersService.incrementFailedLoginAttempts(user.id);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login
    await this.usersService.updateLastLogin(user.id, clientInfo?.ip);

    // Generate tokens
    const tokens = await this.generateTokens(user, clientInfo);

    // Send login event
    await this.kafkaService.sendAuthLoginEvent(user.id, {
      ip: clientInfo?.ip,
      userAgent: clientInfo?.userAgent,
      timestamp: new Date(),
    });

    this.logger.log(`User logged in successfully: ${user.email}`);

    return {
      ...tokens,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        username: user.username,
        role: user.role,
        status: user.status,
      },
    };
  }

  async refresh(
    refreshTokenDto: RefreshTokenDto,
    clientInfo?: ClientInfo,
  ): Promise<AuthResponseDto> {
    const { refreshToken } = refreshTokenDto;

    // Verify refresh token
    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('jwt.refreshSecret'),
      });
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    // Find refresh token in database
    const storedToken = await this.refreshTokenRepository.findOne({
      where: { token: refreshToken, isRevoked: false },
      relations: ['user'],
    });

    if (!storedToken) {
      throw new UnauthorizedException('Refresh token not found or revoked');
    }

    if (storedToken.expiresAt < new Date()) {
      await this.revokeRefreshToken(refreshToken, 'expired');
      throw new UnauthorizedException('Refresh token expired');
    }

    // Check user status
    if (storedToken.user.status !== UserStatus.ACTIVE) {
      await this.revokeRefreshToken(refreshToken, 'user_inactive');
      throw new UnauthorizedException('User account is not active');
    }

    // Revoke old refresh token
    await this.revokeRefreshToken(refreshToken, 'rotated');

    // Generate new tokens
    const tokens = await this.generateTokens(storedToken.user, clientInfo);

    this.logger.log(`Tokens refreshed for user: ${storedToken.user.email}`);

    return {
      ...tokens,
      user: {
        id: storedToken.user.id,
        name: storedToken.user.name,
        email: storedToken.user.email,
        username: storedToken.user.username,
        role: storedToken.user.role,
        status: storedToken.user.status,
      },
    };
  }

  async logout(refreshToken: string, userId?: string): Promise<void> {
    try {
      if (refreshToken) {
        await this.revokeRefreshToken(refreshToken, 'logout');
      }

      if (userId) {
        // Send logout event
        await this.kafkaService.sendAuthLogoutEvent(userId, {
          timestamp: new Date(),
        });
      }

      this.logger.log(`User logged out successfully${userId ? ` (ID: ${userId})` : ''}`);
    } catch (error) {
      this.logger.error(`Logout failed: ${error.message}`);
      // Don't throw error on logout
    }
  }

  async logoutAll(userId: string): Promise<void> {
    try {
      await this.refreshTokenRepository.update(
        { userId, isRevoked: false },
        {
          isRevoked: true,
          revokedAt: new Date(),
          revokedReason: 'logout_all',
        },
      );

      // Send logout event
      await this.kafkaService.sendAuthLogoutEvent(userId, {
        type: 'logout_all',
        timestamp: new Date(),
      });

      this.logger.log(`All sessions revoked for user ID: ${userId}`);
    } catch (error) {
      this.logger.error(`Logout all failed: ${error.message}`);
      throw new BadRequestException('Failed to logout from all devices');
    }
  }

  async changePassword(
    userId: string,
    changePasswordDto: ChangePasswordDto,
  ): Promise<void> {
    const { currentPassword, newPassword } = changePasswordDto;

    const user = await this.usersService.findByEmail(
      (await this.usersService.findOne(userId)).email,
    );

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    // Update password
    await this.usersService.update(userId, { password: hashedNewPassword } as any);

    // Revoke all refresh tokens for security
    await this.logoutAll(userId);

    this.logger.log(`Password changed for user: ${user.email}`);
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto): Promise<void> {
    const { email } = forgotPasswordDto;

    const user = await this.usersService.findByEmail(email);
    if (!user) {
      // Don't reveal if email exists
      return;
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Save reset token (in real app, you'd save this to user entity)
    await this.usersService.update(user.id, {
      passwordResetToken: resetToken,
      passwordResetExpires: resetExpires,
    } as any);

    // In real application, send email with reset link
    this.logger.log(`Password reset requested for: ${email}`);
    console.log(`Reset token for ${email}: ${resetToken}`);
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<void> {
    const { token, password } = resetPasswordDto;

    const user = await this.usersService.findByEmail(''); // You'd query by reset token
    if (!user?.passwordResetToken || user.passwordResetToken !== token) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (!user.passwordResetExpires || user.passwordResetExpires < new Date()) {
      throw new BadRequestException('Reset token has expired');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Update password and clear reset token
    await this.usersService.update(user.id, {
      password: hashedPassword,
      passwordResetToken: null,
      passwordResetExpires: null,
    } as any);

    // Revoke all refresh tokens
    await this.logoutAll(user.id);

    this.logger.log(`Password reset completed for user: ${user.email}`);
  }

  async validateUser(payload: JwtPayload): Promise<User> {
    const user = await this.usersService.findOne(payload.sub);
    
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return user;
  }

  private async generateTokens(
    user: User,
    clientInfo?: ClientInfo,
  ): Promise<Omit<AuthResponseDto, 'user'>> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      type: 'access',
    };

    const refreshPayload: JwtPayload = {
      ...payload,
      type: 'refresh',
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('jwt.secret'),
        expiresIn: this.configService.get('jwt.expiresIn'),
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: this.configService.get('jwt.refreshSecret'),
        expiresIn: this.configService.get('jwt.refreshExpiresIn'),
      }),
    ]);

    // Store refresh token
    await this.storeRefreshToken(refreshToken, user.id, clientInfo);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: this.configService.get('jwt.expiresIn'),
    };
  }

  private async storeRefreshToken(
    token: string,
    userId: string,
    clientInfo?: ClientInfo,
  ): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setSeconds(
      expiresAt.getSeconds() + this.configService.get('jwt.refreshExpiresIn'),
    );

    const refreshToken = this.refreshTokenRepository.create({
      token,
      userId,
      expiresAt,
      clientIp: clientInfo?.ip,
      userAgent: clientInfo?.userAgent,
    });

    await this.refreshTokenRepository.save(refreshToken);
  }

  private async revokeRefreshToken(
    token: string,
    reason: string,
  ): Promise<void> {
    await this.refreshTokenRepository.update(
      { token },
      {
        isRevoked: true,
        revokedAt: new Date(),
        revokedReason: reason,
      },
    );
  }

  // Cleanup expired tokens (should be run periodically)
  async cleanupExpiredTokens(): Promise<void> {
    const result = await this.refreshTokenRepository.delete({
      expiresAt: LessThan(new Date()),
    });

    this.logger.log(`Cleaned up ${result.affected} expired refresh tokens`);
  }
}