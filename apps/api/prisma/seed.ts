import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Rubrica inicial de C# back-end. Está marcada como APPROVED só para a PoC
// rodar de ponta a ponta; a etapa 1 da proposta pede que um especialista
// revise e assine esta versão antes de qualquer entrevista real.
const csharpCompetencies = [
  {
    key: 'async-await',
    name: 'Programação assíncrona (async/await, Task)',
    kind: 'TECHNICAL',
    weight: 3,
    levels: {
      '1': 'Usa async/await por imitação; não explica deadlocks, .Result/.Wait ou ConfigureAwait.',
      '2': 'Usa corretamente no caso comum; reconhece problemas clássicos quando apontados.',
      '3': 'Explica com exemplo real como evitou bloqueios, paralelizou chamadas (Task.WhenAll) e tratou cancelamento.',
      '4': 'Diagnosticou e corrigiu problema de concorrência em produção; mede impacto e explica trade-offs (thread pool, ValueTask, back-pressure).',
    },
    anchorQuestions: [
      'Conte uma situação em que uma chamada assíncrona causou problema (lentidão, travamento, exceção perdida). O que você fez?',
      'Como você decidiu entre executar chamadas em paralelo ou em sequência num caso real?',
    ],
  },
  {
    key: 'design-api',
    name: 'Design de APIs e organização em camadas',
    kind: 'TECHNICAL',
    weight: 3,
    levels: {
      '1': 'Descreve APIs só como controllers que chamam o banco.',
      '2': 'Separa responsabilidades no básico; conhece verbos e códigos HTTP.',
      '3': 'Mostra decisões de contrato (versionamento, erros, paginação) e de camadas com motivo concreto.',
      '4': 'Evoluiu uma API em uso sem quebrar clientes; equilibra acoplamento, testes e prazo com evidência.',
    },
    anchorQuestions: [
      'Fale de uma API que você desenhou ou mudou. Que decisão de contrato você tomou e por quê?',
      'Como você organizou as camadas desse serviço e o que mudaria hoje?',
    ],
  },
  {
    key: 'dados-ef',
    name: 'Acesso a dados (EF Core e SQL)',
    kind: 'TECHNICAL',
    weight: 2,
    levels: {
      '1': 'Usa o ORM sem saber o SQL gerado.',
      '2': 'Escreve consultas corretas; conhece migrations e transações no básico.',
      '3': 'Já encontrou e resolveu N+1, índice faltando ou tracking desnecessário, com medição.',
      '4': 'Projeta modelo e estratégia de concorrência/transação para volume real; sabe quando sair do ORM.',
    },
    anchorQuestions: [
      'Conte um problema de desempenho em banco que você investigou. Como achou a causa?',
    ],
  },
  {
    key: 'testes',
    name: 'Testes automatizados',
    kind: 'TECHNICAL',
    weight: 2,
    levels: {
      '1': 'Testa manualmente; testes automatizados são raros.',
      '2': 'Escreve testes unitários com mocks no caso comum.',
      '3': 'Escolhe entre unitário, integração e contrato com critério; testes já pegaram regressões reais.',
      '4': 'Define a estratégia de testes do time e reduz testes frágeis com evidência.',
    },
    anchorQuestions: [
      'Dê um exemplo de bug que um teste seu pegou, ou que escapou por falta de teste. O que mudou depois?',
    ],
  },
  {
    key: 'diagnostico',
    name: 'Diagnóstico de problemas em produção',
    kind: 'TECHNICAL',
    weight: 2,
    levels: {
      '1': 'Depende de outras pessoas para investigar incidentes.',
      '2': 'Lê logs e reproduz problemas simples.',
      '3': 'Usa logs estruturados, métricas e traces para isolar a causa; descreve um incidente com começo, meio e fim.',
      '4': 'Conduz incidentes, propõe correções de causa raiz e melhora a observabilidade do sistema.',
    },
    anchorQuestions: [
      'Conte o último incidente em produção em que você participou. Qual foi seu papel e como chegaram à causa?',
    ],
  },
];

// Rubrica inicial de Scrum Master, também marcada como APPROVED só para a PoC.
const scrumCompetencies = [
  {
    key: 'facilitacao',
    name: 'Facilitação de eventos Scrum',
    kind: 'TECHNICAL',
    weight: 3,
    levels: {
      '1': 'Descreve os eventos pela teoria; não traz um caso próprio de facilitação.',
      '2': 'Conduz os eventos no formato padrão; lida com dificuldades simples quando ocorrem.',
      '3': 'Adapta o formato ao problema do time (retrospectiva travada, daily virando status) e explica o resultado.',
      '4': 'Transformou a dinâmica de eventos de um time com evidência de mudança; ensina outras pessoas a facilitar.',
    },
    anchorQuestions: [
      'Conte uma retrospectiva ou planning que não estava funcionando. O que você fez e o que mudou?',
      'Como você percebe que uma daily virou apenas reunião de status e o que faz nesse caso?',
    ],
  },
  {
    key: 'impedimentos',
    name: 'Remoção de impedimentos',
    kind: 'TECHNICAL',
    weight: 3,
    levels: {
      '1': 'Espera o time trazer os impedimentos e os repassa à gestão.',
      '2': 'Identifica impedimentos comuns e acompanha a resolução.',
      '3': 'Antecipa impedimentos, escala com contexto e mostra um caso resolvido com resultado.',
      '4': 'Atua nas causas sistêmicas, entre times e áreas, e reduz impedimentos recorrentes com dados.',
    },
    anchorQuestions: [
      'Qual foi o impedimento mais difícil que você removeu? Como foi e qual foi o resultado?',
    ],
  },
  {
    key: 'metricas-fluxo',
    name: 'Métricas e fluxo de trabalho',
    kind: 'TECHNICAL',
    weight: 2,
    levels: {
      '1': 'Conhece velocity só como número de pontos.',
      '2': 'Acompanha burndown e velocity e as usa no planejamento.',
      '3': 'Usa lead time, cycle time ou WIP para achar gargalos e mostra uma decisão tomada com isso.',
      '4': 'Ajuda o time a prever entregas com dados e evita o uso das métricas como cobrança individual.',
    },
    anchorQuestions: [
      'Que métricas você usa com seu time e que decisão você já tomou a partir delas?',
    ],
  },
  {
    key: 'conflitos',
    name: 'Gestão de conflitos e relação com stakeholders',
    kind: 'BEHAVIORAL',
    weight: 2,
    levels: {
      '1': 'Evita conflitos ou os repassa a outra pessoa.',
      '2': 'Media conflitos simples dentro do time.',
      '3': 'Conduziu um conflito entre o time e o Product Owner ou stakeholders até um acordo, com exemplo concreto.',
      '4': 'Constrói acordos duradouros e ensina o time a resolver conflitos sozinho.',
    },
    anchorQuestions: [
      'Conte um conflito entre o time e o Product Owner ou um stakeholder. Qual foi seu papel e como terminou?',
    ],
  },
  {
    key: 'melhoria-continua',
    name: 'Melhoria contínua e cultura ágil',
    kind: 'BEHAVIORAL',
    weight: 2,
    levels: {
      '1': 'Aplica práticas ágeis porque são regras.',
      '2': 'Propõe melhorias a partir das retrospectivas.',
      '3': 'Acompanha se as ações da retrospectiva funcionaram e mostra uma mudança de prática com resultado.',
      '4': 'Apoia mudança cultural além do time, com exemplos de adoção e de abandono de práticas que não serviam.',
    },
    anchorQuestions: [
      'Dê um exemplo de melhoria que saiu de uma retrospectiva. Como você verificou se funcionou?',
    ],
  },
];

async function main() {
  const csharp = await prisma.skill.upsert({
    where: { slug: 'csharp-backend' },
    update: {},
    create: {
      slug: 'csharp-backend',
      name: 'C# back-end',
      description: 'Desenvolvimento back-end em .NET/C#: APIs, dados, assincronia, testes e produção.',
    },
  });

  const existing = await prisma.skillRubric.findFirst({ where: { skillId: csharp.id, version: 1 } });
  if (!existing) {
    await prisma.skillRubric.create({
      data: {
        skillId: csharp.id,
        version: 1,
        status: 'APPROVED',
        promptVersion: 'seed-manual-v1',
        approvedById: 'admin',
        approvedAt: new Date(),
        competencies: { create: csharpCompetencies },
      },
    });
  }

  const scrum = await prisma.skill.upsert({
    where: { slug: 'scrum-master' },
    update: {},
    create: {
      slug: 'scrum-master',
      name: 'Scrum Master',
      description: 'Facilitação, remoção de impedimentos e melhoria contínua em times ágeis.',
    },
  });

  const scrumExisting = await prisma.skillRubric.findFirst({ where: { skillId: scrum.id } });
  if (!scrumExisting) {
    await prisma.skillRubric.create({
      data: {
        skillId: scrum.id,
        version: 1,
        status: 'APPROVED',
        promptVersion: 'seed-manual-v1',
        approvedById: 'admin',
        approvedAt: new Date(),
        competencies: { create: scrumCompetencies },
      },
    });
  }

  const users = [
    {
      id: 'ana',
      name: 'Ana Souza',
      role: 'CANDIDATE',
      history: {
        resumo: 'Desenvolvedora .NET há 6 anos na plataforma; 3 projetos concluídos com avaliação média 4,7.',
        projetos: [
          { titulo: 'API de pagamentos para e-commerce', skills: ['C#', 'EF Core', 'Azure'], duracaoMeses: 8 },
          { titulo: 'Migração de monólito para serviços', skills: ['C#', 'RabbitMQ'], duracaoMeses: 5 },
        ],
      },
    },
    {
      id: 'bruno',
      name: 'Bruno Lima',
      role: 'CANDIDATE',
      history: {
        resumo: 'Desenvolvedor júnior, 1 ano na plataforma; 1 projeto concluído.',
        projetos: [{ titulo: 'CRUD de cadastro de clientes', skills: ['C#', 'ASP.NET Core'], duracaoMeses: 3 }],
      },
    },
    {
      id: 'carla',
      name: 'Carla Prado',
      role: 'CANDIDATE',
      history: {
        resumo: 'Scrum Master há 5 anos; 4 projetos na plataforma com avaliação média 4,6.',
        projetos: [
          { titulo: 'Transformação ágil de time de produto financeiro', skills: ['Scrum', 'Kanban', 'Facilitação'], duracaoMeses: 10 },
          { titulo: 'Escala de 3 squads com PO compartilhado', skills: ['Scrum', 'OKR'], duracaoMeses: 6 },
        ],
      },
    },
    { id: 'rita', name: 'Rita Mendes', role: 'REVIEWER', history: {} },
    { id: 'admin', name: 'Admin Whizz', role: 'ADMIN', history: {} },
  ];
  for (const u of users) {
    await prisma.mockUser.upsert({ where: { id: u.id }, update: u, create: u });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
