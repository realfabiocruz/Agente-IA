export interface WeightedCompetency {
  key: string;
  weight: number;
}

/**
 * Nota ponderada só sobre as competências pontuadas, e cobertura como a fração
 * do peso total que foi efetivamente explorada (N/A não puxa a nota para baixo,
 * mas reduz a cobertura).
 */
export function weightedResult(
  competencies: WeightedCompetency[],
  scores: Record<string, number | null | undefined>,
): { weightedScore: number | null; coverage: number } {
  const totalWeight = competencies.reduce((s, c) => s + c.weight, 0);
  let scoredWeight = 0;
  let sum = 0;
  for (const c of competencies) {
    const score = scores[c.key];
    if (score == null) continue;
    scoredWeight += c.weight;
    sum += score * c.weight;
  }
  return {
    weightedScore: scoredWeight ? Math.round((sum / scoredWeight) * 100) / 100 : null,
    coverage: totalWeight ? Math.round((scoredWeight / totalWeight) * 1000) / 1000 : 0,
  };
}

export interface ScoreAdjustment {
  competencyKey: string;
  score: number | null;
  reason: string;
}

/** Aplica os ajustes do revisor sobre as notas do avaliador. */
export function applyAdjustments(
  scores: Record<string, number | null>,
  adjustments: ScoreAdjustment[] | null | undefined,
): Record<string, number | null> {
  const out = { ...scores };
  for (const a of adjustments ?? []) out[a.competencyKey] = a.score;
  return out;
}
