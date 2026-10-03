import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { CurrentUser, Role } from './types';

export const ROLES_KEY = 'roles';
export const PUBLIC_KEY = 'public';

/** Restringe a rota aos papéis informados. Sem o decorator, qualquer usuário logado passa. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
export const Public = () => SetMetadata(PUBLIC_KEY, true);

export const User = createParamDecorator((_: unknown, ctx: ExecutionContext): CurrentUser => {
  return ctx.switchToHttp().getRequest().user;
});
