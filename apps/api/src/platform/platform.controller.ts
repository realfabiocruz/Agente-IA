import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Public, User } from './roles.decorator';
import type { CurrentUser } from './types';

@Controller()
export class PlatformController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('mock-users')
  listMockUsers() {
    return this.prisma.mockUser.findMany({ select: { id: true, name: true, role: true }, orderBy: { role: 'asc' } });
  }

  @Get('me')
  me(@User() user: CurrentUser) {
    return user;
  }
}
