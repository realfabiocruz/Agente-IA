import type { Block, Competency, InterviewTurn } from '@prisma/client';

export interface MockAction {
  tool: string;
  input: object;
}

export interface MockTurn {
  actions: MockAction[];
  text: string;
}

const FOLLOW_UP = 'Pode detalhar o que você fez nessa situação e qual foi o resultado concreto?';

function excerpt(text: string): string {
  const firstSentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  if (firstSentence.length <= 160) return firstSentence;
  return firstSentence.slice(0, 160).replace(/\s+\S*$/, '');
}

/**
 * Entrevistador roteirizado para LLM_MODE=mock: percorre os blocos e as
 * perguntas-âncora usando as mesmas ferramentas do modo real.
 */
export function mockInterviewerTurn(args: {
  block: Block;
  turns: InterviewTurn[];
  competencies: Competency[];
  candidateName: string;
  skillName: string;
  manual: (q: string) => string;
}): MockTurn {
  const { block, turns, competencies, candidateName, skillName } = args;
  const last = [...turns].reverse().find((t) => t.speaker === 'CANDIDATE');
  const first = candidateName.split(' ')[0];

  if (!last) {
    return {
      actions: [],
      text: `Olá, ${first}! Eu sou o agente de IA da Whizz e vou conduzir sua entrevista de ${skillName}. A conversa leva cerca de 18 minutos e você pode pedir para falar com uma pessoa a qualquer momento. Podemos começar?`,
    };
  }

  if (/\b(humano|pessoa de verdade)\b/i.test(last.text)) {
    return {
      actions: [{ tool: 'encerrar_entrevista', input: { motivo: 'pedido_do_candidato' } }],
      text: 'Claro. Vou encerrar por aqui e registrar que você pediu a rota com uma pessoa. As orientações ficam na plataforma, em "Minhas avaliações".',
    };
  }
  if (/\b(encerrar|parar|desistir)\b/i.test(last.text)) {
    return {
      actions: [{ tool: 'encerrar_entrevista', input: { motivo: 'pedido_do_candidato' } }],
      text: 'Tudo bem, vamos encerrar. Obrigado pelo seu tempo!',
    };
  }

  const ordered = [...competencies].sort((a, b) => b.weight - a.weight);
  const questions = ordered.flatMap((c, i) => {
    const anchor = (c.anchorQuestions as string[])[0];
    return i === 0 ? [{ c, q: anchor }, { c, q: FOLLOW_UP }] : [{ c, q: anchor }];
  });

  switch (block) {
    case 'OPENING':
      return {
        actions: [{ tool: 'avancar_bloco', input: { proximo_bloco: 'TRAJECTORY', motivo: 'candidato pronto' } }],
        text: `Ótimo. Vi no seu histórico na plataforma alguns projetos com ${skillName}. Qual deles foi o mais desafiador para você, e qual era o seu papel?`,
      };
    case 'TRAJECTORY':
      return {
        actions: [{ tool: 'avancar_bloco', input: { proximo_bloco: 'TECHNICAL', motivo: 'trajetória calibrada' } }],
        text: `Obrigado pelo contexto. Vamos para a parte técnica. ${questions[0].q}`,
      };
    case 'TECHNICAL': {
      const asked = turns.filter((t) => t.speaker === 'AGENT' && t.block === 'TECHNICAL').length;
      const previous = questions[asked - 1];
      const actions: MockAction[] = [];
      if (previous && last.text.trim().length >= 15) {
        actions.push({
          tool: 'registrar_evidencia',
          input: { competencia: previous.c.key, trecho: excerpt(last.text) },
        });
      }
      const next = questions[asked];
      if (next) return { actions, text: next.q };
      actions.push({ tool: 'avancar_bloco', input: { proximo_bloco: 'CLOSING', motivo: 'competências cobertas' } });
      return { actions, text: 'Obrigado, cobrimos a parte técnica. Você tem alguma dúvida sobre a entrevista?' };
    }
    case 'CLOSING':
    default: {
      const asksDeadline = /prazo|resultado|quando|pr[oó]xim/i.test(last.text);
      const actions: MockAction[] = [];
      let text = 'Obrigado pela conversa! ';
      if (asksDeadline) {
        actions.push({ tool: 'consultar_manual', input: { pergunta: last.text } });
        text +=
          'O resultado passa por revisão humana antes de aparecer no seu perfil, e prazos e próximos passos ficam em "Minhas avaliações" na plataforma. ';
      }
      actions.push({ tool: 'encerrar_entrevista', input: { motivo: 'cobertura_completa' } });
      return { actions, text: text + 'Boa sorte!' };
    }
  }
}
