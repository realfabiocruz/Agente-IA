import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Ponto único de leitura de dados da plataforma (simulados na PoC). */
@Injectable()
export class PlatformService {
  constructor(private readonly prisma: PrismaService) {}

  /** Histórico do profissional na plataforma, usado no lugar de CV. */
  async getCandidateHistory(userId: string): Promise<unknown> {
    const user = await this.prisma.mockUser.findUnique({ where: { id: userId } });
    return user?.history ?? {};
  }

  async getUserName(userId: string): Promise<string> {
    const user = await this.prisma.mockUser.findUnique({ where: { id: userId } });
    return user?.name ?? userId;
  }

  /** Trecho do manual da plataforma devolvido pela ferramenta consultar_manual. */
  manualFor(_question: string): string {
    return [
      'Manual do profissional Whizz (trecho):',
      '- O resultado da entrevista passa por revisão humana antes de aparecer no seu perfil.',
      '- Prazos, próximos passos e status ficam em "Minhas avaliações" na plataforma.',
      '- Você pode abrir uma contestação pela tela da entrevista concluída, com prazo de resposta informado lá.',
      '- Dúvidas gerais: Central de Ajuda da plataforma.',
    ].join('\n');
  }
}
