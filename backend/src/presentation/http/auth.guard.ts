import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
export const APP_TOKEN = Symbol('AppToken');
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(APP_TOKEN) private readonly token: string) {}
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const supplied = Buffer.from(req.headers.authorization?.replace(/^Bearer /, '') ?? '');
    const expected = Buffer.from(this.token);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected))
      throw new UnauthorizedException('Your session has expired. Unlock the workspace again.');
    return true;
  }
}
