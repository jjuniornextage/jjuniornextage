import {
  IsOptional,
  IsEnum,
  IsString,
  IsNumber,
  Min,
  Max,
  IsIn,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { UserRole, UserStatus } from '../entities/user.entity';

export class QueryUserDto {
  @ApiPropertyOptional({
    description: 'Página da consulta',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Quantidade de itens por página',
    default: 10,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Busca por nome, email ou username',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value.trim())
  search?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por papel',
    enum: UserRole,
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({
    description: 'Filtrar por status',
    enum: UserStatus,
  })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({
    description: 'Campo para ordenação',
    default: 'createdAt',
  })
  @IsOptional()
  @IsString()
  @IsIn(['name', 'email', 'username', 'createdAt', 'updatedAt', 'lastLoginAt'])
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({
    description: 'Direção da ordenação',
    default: 'DESC',
    enum: ['ASC', 'DESC'],
  })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';

  @ApiPropertyOptional({
    description: 'Incluir usuários removidos (soft delete)',
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  includeDeleted?: boolean = false;
}