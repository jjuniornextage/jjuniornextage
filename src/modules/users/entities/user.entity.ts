import { Entity, Column, Index, OneToMany } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Exclude } from 'class-transformer';
import { BaseEntity } from '@shared/entities/base.entity';

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  MODERATOR = 'moderator',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
}

@Entity('users')
@Index(['email'], { unique: true })
@Index(['username'], { unique: true })
export class User extends BaseEntity {
  @ApiProperty({ description: 'Nome completo do usuário' })
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @ApiProperty({ description: 'Nome de usuário único' })
  @Column({ type: 'varchar', length: 50, unique: true })
  username: string;

  @ApiProperty({ description: 'Email do usuário' })
  @Column({ type: 'varchar', length: 255, unique: true })
  @Index()
  email: string;

  @Exclude()
  @Column({ type: 'varchar', length: 255 })
  password: string;

  @ApiProperty({ description: 'Avatar do usuário', required: false })
  @Column({ type: 'varchar', length: 500, nullable: true })
  avatar?: string;

  @ApiProperty({ description: 'Telefone do usuário', required: false })
  @Column({ type: 'varchar', length: 20, nullable: true })
  phone?: string;

  @ApiProperty({ description: 'Data de nascimento', required: false })
  @Column({ type: 'date', nullable: true })
  birthDate?: Date;

  @ApiProperty({ description: 'Papel do usuário', enum: UserRole })
  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  @ApiProperty({ description: 'Status do usuário', enum: UserStatus })
  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;

  @ApiProperty({ description: 'Se o email foi verificado' })
  @Column({ type: 'boolean', default: false })
  emailVerified: boolean;

  @ApiProperty({ description: 'Token de verificação de email', required: false })
  @Exclude()
  @Column({ type: 'varchar', length: 255, nullable: true })
  emailVerificationToken?: string;

  @ApiProperty({ description: 'Token de reset de senha', required: false })
  @Exclude()
  @Column({ type: 'varchar', length: 255, nullable: true })
  passwordResetToken?: string;

  @ApiProperty({ description: 'Expiração do token de reset de senha', required: false })
  @Exclude()
  @Column({ type: 'timestamp with time zone', nullable: true })
  passwordResetExpires?: Date;

  @ApiProperty({ description: 'Último login do usuário', required: false })
  @Column({ type: 'timestamp with time zone', nullable: true })
  lastLoginAt?: Date;

  @ApiProperty({ description: 'IP do último login', required: false })
  @Column({ type: 'varchar', length: 45, nullable: true })
  lastLoginIp?: string;

  @ApiProperty({ description: 'Tentativas de login falharam' })
  @Column({ type: 'int', default: 0 })
  failedLoginAttempts: number;

  @ApiProperty({ description: 'Bloqueado até', required: false })
  @Column({ type: 'timestamp with time zone', nullable: true })
  lockedUntil?: Date;

  @ApiProperty({ description: 'Metadados adicionais', required: false })
  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;
}