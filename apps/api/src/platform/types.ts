// Contrato mínimo que o módulo do entrevistador espera da plataforma.
// Na migração, AuthGuard e PlatformService passam a usar o User e os guards reais.
export type Role = 'CANDIDATE' | 'REVIEWER' | 'ADMIN';

export interface CurrentUser {
  id: string;
  name: string;
  role: Role;
}
