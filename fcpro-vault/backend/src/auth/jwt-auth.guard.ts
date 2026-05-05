import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = unknown>(
    error: Error | null,
    user: TUser | false,
    info: Error | null,
    context: ExecutionContext,
  ): TUser {
    void context;

    if (info instanceof TokenExpiredError) {
      throw new UnauthorizedException('Token expired. Re-verify.');
    }

    if (info instanceof JsonWebTokenError) {
      throw new UnauthorizedException('Invalid token signature');
    }

    if (error !== null) {
      throw error;
    }

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    return user;
  }
}
