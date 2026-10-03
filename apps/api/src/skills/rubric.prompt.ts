import { z } from 'zod';

export const RUBRIC_PROMPT_VERSION = 'rubric-draft-v1';

export const CompetencyDraftSchema = z.object({
  key: z.string(),
  name: z.string(),
  kind: z.enum(['TECHNICAL', 'BEHAVIORAL']),
  weight: z.number().int(),
  levels: z.object({ '1': z.string(), '2': z.string(), '3': z.string(), '4': z.string() }),
  anchorQuestions: z.array(z.string()),
});

export const RubricDraftSchema = z.object({ competencies: z.array(CompetencyDraftSchema) });
export type RubricDraft = z.infer<typeof RubricDraftSchema>;

export function rubricSystemPrompt(): string {
  return `Você ajuda a equipe da Whizz a preparar rubricas de avaliação técnica por skill. A rubrica será revisada, editada e aprovada por um especialista humano antes de qualquer uso.

Gere de 4 a 6 competências que diferenciam um bom profissional do skill pedido. Para cada uma:
- key: identificador curto em kebab-case, sem acentos.
- name: nome claro em português.
- kind: TECHNICAL, ou BEHAVIORAL só quando o próprio skill pedir (ex.: facilitação para Scrum Master).
- weight: inteiro de 1 a 3 conforme a importância.
- levels: descritores observáveis para as notas 1 a 4, baseados no que a pessoa fez e explicou, não em definições decoradas.
- anchorQuestions: 1 a 3 perguntas situacionais que peçam um exemplo vivido (situação, ação, resultado). Nunca perguntas de definição.

Não inclua nada sobre características pessoais, idade, gênero, origem ou estilo de comunicação.`;
}

/** Rascunho simulado (LLM_MODE=mock). */
export function mockRubricDraft(skillName: string): RubricDraft {
  const generic = (key: string, name: string, weight: number) => ({
    key,
    name,
    kind: 'TECHNICAL' as const,
    weight,
    levels: {
      '1': `Fala de ${name.toLowerCase()} só em termos gerais, sem exemplo próprio.`,
      '2': 'Dá exemplo próprio simples, com pouca justificativa das decisões.',
      '3': 'Dá exemplo real com decisões justificadas e resultado concreto.',
      '4': 'Mostra domínio em contexto complexo, com trade-offs, medição e impacto no time.',
    },
    anchorQuestions: [`Conte uma situação real em que ${name.toLowerCase()} foi decisivo no seu trabalho com ${skillName}.`],
  });
  return {
    competencies: [
      generic('fundamentos', 'Fundamentos do skill', 3),
      generic('pratica', 'Aplicação prática', 3),
      generic('qualidade', 'Qualidade e boas práticas', 2),
      generic('resolucao-problemas', 'Resolução de problemas', 2),
    ],
  };
}
