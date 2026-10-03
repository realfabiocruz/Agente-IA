import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { PUBLIC_KEY, ROLES_KEY } from './roles.decorator';
import type { Role } from './types';

/**
 * Login SIMULADO: o front manda o id do usuário em `x-user-id`.
 * Na plataforma, troque pelo guard de autenticação e papéis que ela já usa.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const req = ctx.switchToHttp().getRequest();
    const userId = req.headers['x-user-id'];
    if (typeof userId !== 'string' || !userId) throw new UnauthorizedException('Escolha um usuário simulado');
    const user = await this.prisma.mockUser.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Usuário simulado não encontrado');
    req.user = { id: user.id, name: user.name, role: user.role as Role };

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    if (roles?.length && !roles.includes(req.user.role)) throw new ForbiddenException();
    return true;
  }
}
