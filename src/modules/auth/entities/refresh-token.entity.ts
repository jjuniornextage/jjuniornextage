import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '@shared/entities/base.entity';
import { User } from '@modules/users/entities/user.entity';

@Entity('refresh_tokens')
@Index(['token'], { unique: true })
@Index(['userId'])
export class RefreshToken extends BaseEntity {
  @ApiProperty({ description: 'Token de refresh único' })
  @Column({ type: 'varchar', length: 255, unique: true })
  token: string;

  @ApiProperty({ description: 'ID do usuário proprietário do token' })
  @Column({ type: 'uuid' })
  userId: string;

  @ApiProperty({ description: 'Data de expiração do token' })
  @Column({ type: 'timestamp with time zone' })
  expiresAt: Date;

  @ApiProperty({ description: 'IP do cliente que criou o token' })
  @Column({ type: 'varchar', length: 45, nullable: true })
  clientIp?: string;

  @ApiProperty({ description: 'User Agent do cliente' })
  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent?: string;

  @ApiProperty({ description: 'Se o token foi revogado' })
  @Column({ type: 'boolean', default: false })
  isRevoked: boolean;

  @ApiProperty({ description: 'Data de revogação do token' })
  @Column({ type: 'timestamp with time zone', nullable: true })
  revokedAt?: Date;

  @ApiProperty({ description: 'Motivo da revogação' })
  @Column({ type: 'varchar', length: 255, nullable: true })
  revokedReason?: string;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}