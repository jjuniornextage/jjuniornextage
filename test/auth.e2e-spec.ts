import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import * as request from 'supertest';

import { AppModule } from '../src/app.module';
import { User } from '../src/modules/users/entities/user.entity';
import { RefreshToken } from '../src/modules/auth/entities/refresh-token.entity';

describe('Authentication (e2e)', () => {
  let app: INestApplication;
  let userRepository: any;
  let refreshTokenRepository: any;

  const testUser = {
    name: 'Test User',
    username: 'testuser',
    email: 'test@example.com',
    password: 'TestPassword123!',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [User, RefreshToken],
          synchronize: true,
          logging: false,
        }),
        AppModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    
    // Set up global pipes
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    // Get repositories for cleanup
    userRepository = app.get('UserRepository');
    refreshTokenRepository = app.get('RefreshTokenRepository');
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    // Clean up data after each test
    if (refreshTokenRepository) {
      await refreshTokenRepository.delete({});
    }
    if (userRepository) {
      await userRepository.delete({});
    }
  });

  describe('/auth/register (POST)', () => {
    it('should register a new user successfully', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(testUser)
        .expect(201)
        .expect((res) => {
          expect(res.body.data).toHaveProperty('accessToken');
          expect(res.body.data).toHaveProperty('refreshToken');
          expect(res.body.data).toHaveProperty('user');
          expect(res.body.data.user.email).toBe(testUser.email);
          expect(res.body.data.user.password).toBeUndefined();
        });
    });

    it('should return 400 for invalid email', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          ...testUser,
          email: 'invalid-email',
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('email');
        });
    });

    it('should return 400 for weak password', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          ...testUser,
          password: 'weak',
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('password');
        });
    });

    it('should return 409 for duplicate email', async () => {
      // First registration
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(testUser)
        .expect(201);

      // Second registration with same email
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          ...testUser,
          username: 'different',
        })
        .expect(409)
        .expect((res) => {
          expect(res.body.message).toContain('Email already exists');
        });
    });

    it('should return 409 for duplicate username', async () => {
      // First registration
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(testUser)
        .expect(201);

      // Second registration with same username
      return request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send({
          ...testUser,
          email: 'different@example.com',
        })
        .expect(409)
        .expect((res) => {
          expect(res.body.message).toContain('Username already exists');
        });
    });
  });

  describe('/auth/login (POST)', () => {
    beforeEach(async () => {
      // Register a user for login tests
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(testUser);
    });

    it('should login with email successfully', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          login: testUser.email,
          password: testUser.password,
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.data).toHaveProperty('accessToken');
          expect(res.body.data).toHaveProperty('refreshToken');
          expect(res.body.data).toHaveProperty('user');
          expect(res.body.data.user.email).toBe(testUser.email);
        });
    });

    it('should login with username successfully', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          login: testUser.username,
          password: testUser.password,
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.data).toHaveProperty('accessToken');
          expect(res.body.data).toHaveProperty('refreshToken');
        });
    });

    it('should return 401 for invalid credentials', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          login: testUser.email,
          password: 'wrongpassword',
        })
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toBe('Invalid credentials');
        });
    });

    it('should return 401 for non-existent user', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          login: 'nonexistent@example.com',
          password: testUser.password,
        })
        .expect(401)
        .expect((res) => {
          expect(res.body.message).toBe('Invalid credentials');
        });
    });

    it('should return 400 for missing fields', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({
          login: testUser.email,
          // missing password
        })
        .expect(400);
    });
  });

  describe('/auth/refresh (POST)', () => {
    let refreshToken: string;

    beforeEach(async () => {
      // Register and login to get refresh token
      const registerResponse = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(testUser);

      refreshToken = registerResponse.body.data.refreshToken;
    });

    it('should refresh tokens successfully', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken })
        .expect(200)
        .expect((res) => {
          expect(res.body.data).toHaveProperty('accessToken');
          expect(res.body.data).toHaveProperty('refreshToken');
          expect(res.body.data.refreshToken).not.toBe(refreshToken); // Should be different
        });
    });

    it('should return 401 for invalid refresh token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'invalid-token' })
        .expect(401);
    });

    it('should return 401 for missing refresh token', () => {
      return request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({})
        .expect(400);
    });
  });

  describe('Protected routes', () => {
    let accessToken: string;
    let refreshToken: string;

    beforeEach(async () => {
      // Register and login to get tokens
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(testUser);

      accessToken = response.body.data.accessToken;
      refreshToken = response.body.data.refreshToken;
    });

    describe('/auth/me (GET)', () => {
      it('should return user profile with valid token', () => {
        return request(app.getHttpServer())
          .get('/api/v1/auth/me')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200)
          .expect((res) => {
            expect(res.body.data.email).toBe(testUser.email);
            expect(res.body.data.password).toBeUndefined();
          });
      });

      it('should return 401 without token', () => {
        return request(app.getHttpServer())
          .get('/api/v1/auth/me')
          .expect(401);
      });

      it('should return 401 with invalid token', () => {
        return request(app.getHttpServer())
          .get('/api/v1/auth/me')
          .set('Authorization', 'Bearer invalid-token')
          .expect(401);
      });
    });

    describe('/auth/logout (POST)', () => {
      it('should logout successfully', () => {
        return request(app.getHttpServer())
          .post('/api/v1/auth/logout')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ refreshToken })
          .expect(204);
      });

      it('should return 401 without token', () => {
        return request(app.getHttpServer())
          .post('/api/v1/auth/logout')
          .send({ refreshToken })
          .expect(401);
      });
    });

    describe('/auth/logout-all (POST)', () => {
      it('should logout from all devices successfully', () => {
        return request(app.getHttpServer())
          .post('/api/v1/auth/logout-all')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(204);
      });
    });

    describe('/auth/verify-token (POST)', () => {
      it('should verify valid token', () => {
        return request(app.getHttpServer())
          .post('/api/v1/auth/verify-token')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200)
          .expect((res) => {
            expect(res.body.data.valid).toBe(true);
            expect(res.body.data.user.email).toBe(testUser.email);
          });
      });
    });
  });

  describe('/auth/change-password (PATCH)', () => {
    let accessToken: string;

    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(testUser);

      accessToken = response.body.data.accessToken;
    });

    it('should change password successfully', () => {
      return request(app.getHttpServer())
        .patch('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: testUser.password,
          newPassword: 'NewPassword123!',
        })
        .expect(204);
    });

    it('should return 400 for wrong current password', () => {
      return request(app.getHttpServer())
        .patch('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: 'wrongpassword',
          newPassword: 'NewPassword123!',
        })
        .expect(400)
        .expect((res) => {
          expect(res.body.message).toContain('Current password is incorrect');
        });
    });

    it('should return 400 for weak new password', () => {
      return request(app.getHttpServer())
        .patch('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          currentPassword: testUser.password,
          newPassword: 'weak',
        })
        .expect(400);
    });
  });

  describe('Rate limiting', () => {
    it('should rate limit login attempts', async () => {
      const loginData = {
        login: 'test@example.com',
        password: 'wrongpassword',
      };

      // Make multiple failed login attempts
      const promises = Array(15).fill(0).map(() =>
        request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send(loginData)
      );

      const responses = await Promise.all(promises);
      
      // Some requests should be rate limited (429)
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });
});