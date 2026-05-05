import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JtiBlacklistService } from '../common/guards/jti-blacklist.service';
import { RedisService } from '../common/redis/redis.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { Customer } from './entities/customer.entity';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          algorithm: 'HS512',
          expiresIn: '30d',
          issuer: 'license-server',
          audience: 'fcp-client',
        },
      }),
    }),
    TypeOrmModule.forFeature([Customer]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JtiBlacklistService, RedisService],
  exports: [PassportModule, JwtModule, AuthService],
})
export class AuthModule {}
