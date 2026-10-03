# Agente Entrevistador Whizz · PoC em modo texto

Prova de conceito da etapa 2 da [proposta de integração](https://claude.ai/code/artifact/fba67422-bbf7-48f8-b1b5-8d3dc230fff3): uma entrevista curta **por skill**, em tela cheia com URL própria, conduzida por um agente de IA em texto, com avaliador separado gerando um dossiê que uma pessoa revisa.

Roda isolada da plataforma, com a mesma stack (Next.js + TypeScript + Tailwind, NestJS + TypeScript + Prisma, Postgres 16), para migrar depois como módulo. Login e histórico do profissional são simulados.

## Rodar no navegador (GitHub Codespaces), sem instalar nada

1. No GitHub, abra o repositório no branch da PoC e clique em **Code → Codespaces → Create codespace**.
2. Na criação, o GitHub pede o segredo `ANTHROPIC_API_KEY`. Cole sua chave para usar o Claude de verdade, ou deixe em branco para o modo simulado. A chave fica guardada nos segredos do Codespaces, nunca no repositório (dá para mudar depois em github.com/settings/codespaces).
3. Espere a preparação (instala dependências, cria o banco Postgres 16, carrega os dados de exemplo e compila; leva alguns minutos na primeira vez).
4. A aba **Ports** abre a porta 3000 ("Entrevistador") no navegador. Se não abrir sozinha, clique no ícone de globo dela.

Para ver os logs: `tail -f /tmp/api.log /tmp/web.log` no terminal do Codespace. Para reiniciar depois de mudar código: `npm run build && bash .devcontainer/start.sh`.

## Publicar no Render

O `render.yaml` na raiz descreve um Postgres 16 e um serviço que roda o site e a API juntos (o site repassa `/api` para a API). No Render: **New → Blueprint**, escolha este repositório e informe `ANTHROPIC_API_KEY` (opcional; sem ela roda em modo simulado). A preparação roda as migrações e o seed. Para o site em um serviço separado (por exemplo no Vercel), aponte `API_INTERNAL_URL` para o endereço público da API na hora do build.

## Como rodar no seu computador

Pré-requisitos: Node 22+, Docker (ou um Postgres 16 local).

```bash
cp .env.example apps/api/.env   # ajuste DATABASE_URL se não usar o docker; ANTHROPIC_API_KEY é opcional
npm install
npm run prisma:generate -w apps/api
npm run db:up                   # Postgres 16 no docker
npm run db:migrate              # cria as tabelas
npm run db:seed                 # skill C# back-end com rubrica v1, Scrum Master sem rubrica, usuários simulados
npm run dev:api                 # http://localhost:3001
npm run dev:web                 # http://localhost:3000 (em outro terminal)
```

No topo da página, escolha um usuário simulado:

| Usuário | Papel | Para testar |
|---|---|---|
| Ana Souza, Bruno Lima | Profissional | Fazer a entrevista de C# back-end |
| Rita Mendes | Revisora | Revisar dossiês, ver ranking por skill |
| Admin Whizz | Admin | Gerar, editar e aprovar rubricas |

### Com ou sem a API da Anthropic

- **Sem `ANTHROPIC_API_KEY`** (ou com `LLM_MODE=mock`): entrevistador e avaliador roteirizados. Serve para ver o fluxo inteiro sem custo; as notas não significam nada.
- **Com `ANTHROPIC_API_KEY`**: entrevistador em `claude-sonnet-5-5` (streaming, esforço `low` por latência), avaliador e gerador de rubrica em `claude-opus-5-5` (saída estruturada validada com zod). Os modelos mudam por variável de ambiente (`INTERVIEWER_MODEL`, `EVALUATOR_MODEL`, `RUBRIC_MODEL`). As chamadas usam o fallback do lado do servidor (`fallbacks: "default"`) para quando um classificador recusa uma resposta.

Antes de usar com candidatos reais, confira preços e retenção de dados na página oficial da Anthropic e no contrato.

### Testes

```bash
npm test                                   # unitários (blocos, tempo, ferramentas, nota ponderada)
LLM_MODE=mock npm run dev:api              # em um terminal
npm run smoke -w apps/api                  # entrevista completa → dossiê → revisão → ranking
```

## Como funciona

1. **Rubrica por skill** (admin, `/admin`): o Claude gera um rascunho com competências, pesos, descritores de 1 a 4 e perguntas-âncora; uma pessoa edita e aprova. Cada entrevista fica presa à versão aprovada em que começou. A rubrica de C# do seed está marcada como aprovada só para a PoC rodar; ela precisa da assinatura de um especialista.
2. **Entrevista** (`/entrevistas/[id]`): navegando de dentro da plataforma abre sobreposta em tela cheia (rota interceptada `app/@modal/(.)entrevistas/[id]`); recarregar ou abrir o link cai na mesma tela como página. Termo de consentimento e aviso de IA antes de tudo, opção de rota humana o tempo todo.
3. **Conversa**: blocos Abertura → Trajetória → Técnico → Fechamento (18 min de orçamento). A cada fala, o backend calcula o tempo e as competências sem evidência e injeta isso como mensagem de sistema; o modelo não conta o tempo. O entrevistador não dá nota: ele registra evidências e muda de bloco por ferramentas que o backend valida (competência fora da rubrica, trecho que não aparece nas falas do candidato e volta de bloco são recusados).
4. **Pausa e retomada**: fechar a tela pausa; o relógio só corre com a entrevista ativa. A entrevista expira em 7 dias.
5. **Avaliação**: ao encerrar, um job no pg-boss (no próprio Postgres) roda o avaliador sobre a transcrição inteira. Nota sem trecho literal que confira com a transcrição vira N/A e vai para "pontos para conferir". Nota ponderada só sobre competências pontuadas, mais a cobertura do peso explorado. Pode ser reprocessado.
6. **Revisão humana** (`/revisao`): a revisora confirma, ajusta (com motivo) ou invalida. Só então a entrevista entra no **ranking do skill** (`/ranking/[skillId]`), filtrado pela mesma versão de rubrica. O profissional pode abrir contestação.

## Onde está cada parte da proposta

| Proposta | Código |
|---|---|
| Modelo de dados Prisma | `apps/api/prisma/schema.prisma` (+ `currentBlock`, `blockStartMs`, `activeMs`, `resumedAt` para o relógio) |
| `SkillsModule` (rubricas) | `apps/api/src/skills` |
| `InterviewsModule` (endpoints do candidato e revisor) | `apps/api/src/interviews` |
| Prompt e ferramentas do entrevistador | `apps/api/src/interviews/interviewer.prompt.ts`, `tool-executor.ts` |
| Orçamento de tempo por bloco | `apps/api/src/interviews/plan.ts` |
| `EvaluationModule` (avaliador + job) | `apps/api/src/evaluation` |
| `ClaudeModule` | `apps/api/src/claude` |
| Tela cheia sobreposta com URL própria | `apps/web/app/@modal/(.)entrevistas/[id]`, `apps/web/app/entrevistas/[id]`, `apps/web/components/interview-screen.tsx` |

Endpoints principais: `POST /interviews`, `POST /interviews/:id/consent`, `POST /interviews/:id/messages` (SSE), `POST /interviews/:id/pause|resume|finish`, `GET /interviews/:id`, `GET /interviews/:id/report`, `POST /interviews/:id/review`, `POST /interviews/:id/contestations`, `POST /interviews/:id/reevaluate`, `POST /skills/:skillId/rubrics/draft`, `PATCH /rubrics/:id`, `POST /rubrics/:id/approve`, `GET /skills/:skillId/ranking`.

## O que é simulado e como migrar

Tudo que é simulado está isolado para ser trocado:

- **Login**: `apps/api/src/platform/auth.guard.ts` lê o usuário do header `x-user-id`. Na plataforma, use o guard de autenticação e papéis existente e mantenha o formato `CurrentUser` (`id`, `name`, `role`).
- **Histórico do profissional e manual**: `apps/api/src/platform/platform.service.ts`. Troque pelas consultas reais.
- **Usuários**: o modelo `MockUser` no fim do `schema.prisma`; `Interview.candidateId` já é só o id do `User` da plataforma, sem relação, para a migração não depender dele.
- **Front**: `apps/web/components/user-context.tsx` e o seletor do cabeçalho. As rotas `entrevistas/[id]` e `@modal/(.)entrevistas/[id]` copiam direto para o App Router da plataforma.

## Fora desta PoC

- Modo voz (LiveKit Agents) e o endpoint interno `/internal/interviews/:id/events` do worker de voz: etapa 3.
- Vaga atrelada com blocos cultural e expectativa: fase 2 (o plano de blocos já existe em `plan.ts`, mas a API recusa `jobOpeningId`).
- Feature flag, guards reais, retenção de gravações (`Recording`) e painel de resposta a contestações.
- A trava contra mensagens simultâneas é em memória (uma instância); com mais réplicas, trocar por trava no banco.
