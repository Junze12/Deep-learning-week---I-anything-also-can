/**
 * Bayesian Knowledge Tracing (BKT) with confidence-adjusted emission parameters.
 *
 * Ported from mastery_score.py (previous project).
 *
 * Standard BKT models mastery as a hidden binary state that evolves with each
 * response. This variant adjusts the guess/slip rates using the student's declared
 * confidence level, making higher-confidence responses carry more evidential weight.
 *
 * Parameters (research-plausible defaults):
 *   prior  = 0.40  P(mastered at start)
 *   learn  = 0.20  P(transitions from not mastered → mastered per step)
 *   guess  = 0.14  P(correct | not mastered)
 *   slip   = 0.05  P(incorrect | mastered)
 *   forget = 0.00  P(mastered → not mastered per step)  [classic BKT = 0]
 */

export interface BKTParams {
  prior: number;
  learn: number;
  guess: number;
  slip: number;
  forget: number;
  guessMin: number;
  guessMax: number;
  slipMin: number;
  slipMax: number;
}

export const DEFAULT_BKT_PARAMS: BKTParams = {
  prior:    0.40,
  learn:    0.20,
  guess:    0.14,
  slip:     0.05,
  forget:   0.00,
  guessMin: 0.01,
  guessMax: 0.30,
  slipMin:  0.01,
  slipMax:  0.10,
};

/** Confidence bucket → numeric weight in [0, 1] */
const CONFIDENCE_MAP: Record<string, number> = {
  low:    0.25,
  medium: 0.50,
  high:   0.85,
};

function clip(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Converts 'low' | 'medium' | 'high' | null/undefined → numeric [0, 1]. */
function normalizeConfidence(conf: string | null | undefined): number {
  if (!conf) return 0.5;
  const key = conf.trim().toLowerCase();
  return key in CONFIDENCE_MAP ? CONFIDENCE_MAP[key] : 0.5;
}

export interface BKTResponse {
  correct: boolean | number;    // 1/true = correct, 0/false = incorrect
  confidence?: string | null;   // 'low' | 'medium' | 'high' | null
}

/**
 * Compute BKT mastery from a chronologically ordered sequence of responses.
 *
 * @param responses   Ordered array of attempt objects.
 * @param priorMastery  Override initial mastery belief (defaults to params.prior).
 * @param params      BKT hyperparameters.
 * @returns Mastery probability in [0, 1] after the last transition step.
 */
export function computeBKTMastery(
  responses: BKTResponse[],
  priorMastery?: number,
  params: BKTParams = DEFAULT_BKT_PARAMS,
): number {
  if (responses.length === 0) return priorMastery ?? params.prior;

  let pi = priorMastery !== undefined
    ? clip(priorMastery, 0, 1)
    : params.prior;

  for (const r of responses) {
    const y = Boolean(r.correct);
    const conf = normalizeConfidence(r.confidence);

    // Confidence-adjusted emission params:
    // High confidence correct → lower effective guess (strong mastery evidence)
    // High confidence wrong   → lower effective slip  (strong non-mastery evidence)
    const guessEff = clip(lerp(params.guessMax, params.guess, conf), params.guessMin, params.guessMax);
    const slipEff  = clip(lerp(params.slipMax,  params.slip,  conf), params.slipMin, params.slipMax);

    let piPost: number;
    if (y) {
      // P(correct | L=1) = 1 - slip,  P(correct | L=0) = guess
      const num = pi * (1 - slipEff);
      const den = num + (1 - pi) * guessEff;
      piPost = den > 0 ? num / den : pi;
    } else {
      // High-confidence wrong answer is stronger evidence of non-mastery → push slip further down
      const slipEffWrong = clip(lerp(slipEff, params.slipMin, conf), params.slipMin, params.slipMax);
      // P(wrong | L=1) = slip,  P(wrong | L=0) = 1 - guess
      const num = pi * slipEffWrong;
      const den = num + (1 - pi) * (1 - guessEff);
      piPost = den > 0 ? num / den : pi;
    }

    // Transition: learn from not-mastered, or forget from mastered
    pi = clip(piPost * (1 - params.forget) + (1 - piPost) * params.learn, 0, 1);
  }

  return pi;
}
