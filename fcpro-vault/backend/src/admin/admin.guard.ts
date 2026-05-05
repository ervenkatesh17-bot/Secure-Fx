import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { CustomerRole } from '../auth/entities/customer.entity';
import { JwtPayload } from '../auth/jwt.strategy';

interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (request.user?.role !== CustomerRole.ADMIN) {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
