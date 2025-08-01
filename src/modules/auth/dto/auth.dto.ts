import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export class LoginDto {
  @ApiProperty({
    description: 'Email ou username do usuário',
    example: 'user@example.com',
  })
  @IsString()
  @Transform(({ value }) => value.toLowerCase().trim())
  login: string;

  @ApiProperty({
    description: 'Senha do usuário',
    example: 'MinhaSenh@123',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}

export class RegisterDto {
  @ApiProperty({
    description: 'Nome completo do usuário',
    example: 'João Silva',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  name: string;

  @ApiProperty({
    description: 'Nome de usuário único',
    example: 'joaosilva',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_-]+$/, {
    message: 'Username deve conter apenas letras, números, underscore e hífen',
  })
  @Transform(({ value }) => value.toLowerCase())
  username: string;

  @ApiProperty({
    description: 'Email do usuário',
    example: 'joao@example.com',
  })
  @IsEmail()
  @MaxLength(255)
  @Transform(({ value }) => value.toLowerCase())
  email: string;

  @ApiProperty({
    description: 'Senha do usuário',
    example: 'MinhaSenh@123',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    {
      message:
        'Senha deve conter pelo menos: 1 letra minúscula, 1 maiúscula, 1 número e 1 caractere especial',
    },
  )
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty({
    description: 'Refresh token para renovar o access token',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  refreshToken: string;
}

export class ChangePasswordDto {
  @ApiProperty({
    description: 'Senha atual do usuário',
    example: 'MinhaSenh@123',
  })
  @IsString()
  currentPassword: string;

  @ApiProperty({
    description: 'Nova senha do usuário',
    example: 'NovaSenha@456',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    {
      message:
        'Senha deve conter pelo menos: 1 letra minúscula, 1 maiúscula, 1 número e 1 caractere especial',
    },
  )
  newPassword: string;
}

export class ForgotPasswordDto {
  @ApiProperty({
    description: 'Email do usuário para reset de senha',
    example: 'user@example.com',
  })
  @IsEmail()
  @Transform(({ value }) => value.toLowerCase())
  email: string;
}

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Token de reset de senha',
    example: 'abc123def456',
  })
  @IsString()
  token: string;

  @ApiProperty({
    description: 'Nova senha do usuário',
    example: 'NovaSenha@456',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    {
      message:
        'Senha deve conter pelo menos: 1 letra minúscula, 1 maiúscula, 1 número e 1 caractere especial',
    },
  )
  password: string;
}

export class AuthResponseDto {
  @ApiProperty({ description: 'Access token JWT' })
  accessToken: string;

  @ApiProperty({ description: 'Refresh token para renovação' })
  refreshToken: string;

  @ApiProperty({ description: 'Tipo do token' })
  tokenType: string;

  @ApiProperty({ description: 'Tempo de expiração em segundos' })
  expiresIn: number;

  @ApiProperty({ description: 'Dados do usuário autenticado' })
  user: {
    id: string;
    name: string;
    email: string;
    username: string;
    role: string;
    status: string;
  };
}