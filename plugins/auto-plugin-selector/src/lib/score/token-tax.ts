/**
 * token-tax.ts — r00025 S1: token cost signal for plugin selection.
 *
 * Pure: no I/O, no clock, no random. Given a candidate's declared
 * `tokenBudget` in any of the three accepted shapes
 * (`number`, `ITokenBudgetCeiling`, or the new f00179
 * `IPluginTokenBudget` with real `staticBytes` + `caps.hard`),
 * produce a 0..1 score with `1 = cheap` and `0 = hard-cap break`.
 *
 * Scoring semantics:
 *  - Missing budget: neutral `0.5` (we have no opinion either way).
 *  - Legacy number form (raw token count): cheap when small.
 *    `1 - clamp(value / HARD_REFERENCE, 0, 1)`.
 *  - Structured ceiling form: cheap when `hard` is generous. Same
 *    mapping as the legacy form, applied to `hard`.
 *  - New f00179 form: prefer `caps.hard` (real ceiling) over
 *    `staticBytes` (cold-start surface) when both are present, and
 *    fall back to whichever is non-zero.
 *  - `hard-cap break`: when the projected budget reaches or exceeds
 *    the budgeted `hard` ceiling, score is forced to `0` so the
 *    selector demotes the plugin regardless of fit.
 *
 * The `HARD_REFERENCE` constant is the historical "this is roughly
 * what a tool surface should weigh" anchor (matches the
 * `TOKEN_BUDGETS.toolPayloads.search.hard` ceiling). It is
 * project-agnostic: every plugin scoring against this signal uses
 * the same reference, which keeps the ranking deterministic across
 * workspaces.
 */
import type {
	IPluginTokenBudget,
	ITokenBudgetCeiling,
} from '@mcp-vertex/core/public';

/** Reference ceiling used to normalise legacy `tokenBudget: number`. */
const HARD_REFERENCE = 3_000;

/**
 * The candidate's token budget, in whatever shape the host surfaces.
 *
 * - `number`              — legacy form (raw token count).
 * - `ITokenBudgetCeiling` — legacy structured form (hard / warning /
 *                            releaseRelativePercent).
 * - `IPluginTokenBudget`  — f00179 form with `staticBytes` + `caps`.
 */
export type ITokenBudgetInput =
	| number
	| ITokenBudgetCeiling
	| IPluginTokenBudget
	| null
	| undefined;

/** Inputs accepted by `scoreTokenTax`. */
export interface ITokenTaxInput {
	readonly tokenBudget?: ITokenBudgetInput | undefined;
}

/**
 * Resolve the effective "hard" budget for the scoring formula.
 *
 * Order of preference when the structured form is provided:
 *  1. f00179 `caps.hard` (the real ceiling).
 *  2. Legacy `hard` field.
 *  3. f00179 `staticBytes` (the cold-start surface, treated as a
 *     fallback ceiling when no explicit cap is declared).
 *  4. `HARD_REFERENCE` — neutral fallback so we never divide by zero.
 */
const resolveHard = (
	budget: ITokenBudgetInput,
): { hard: number; isBreak: boolean } => {
	if (typeof budget === 'number') {
		if (budget >= HARD_REFERENCE) return { hard: budget, isBreak: true };
		return { hard: budget, isBreak: false };
	}
	if (budget === null || budget === undefined) {
		return { hard: HARD_REFERENCE, isBreak: false };
	}
	// f00179 form takes precedence when both `caps` and `staticBytes`
	// are present.
	const candidate = budget as ITokenBudgetCeiling & {
		readonly caps?: { readonly hard?: number; readonly warning?: number };
		readonly staticBytes?: number;
	};
	const capsHard = candidate.caps?.hard;
	if (typeof capsHard === 'number') {
		if (capsHard >= HARD_REFERENCE) {
			return { hard: capsHard, isBreak: true };
		}
		return { hard: capsHard, isBreak: false };
	}
	if (typeof candidate.hard === 'number') {
		if (candidate.hard >= HARD_REFERENCE) {
			return { hard: candidate.hard, isBreak: true };
		}
		return { hard: candidate.hard, isBreak: false };
	}
	if (typeof candidate.staticBytes === 'number') {
		return { hard: candidate.staticBytes, isBreak: false };
	}
	return { hard: HARD_REFERENCE, isBreak: false };
};

/**
 * Score the token-tax signal for one candidate. Range `0..1`:
 * `1` means cheap, `0` means the candidate breaks the hard cap.
 */
export const scoreTokenTax = (input: ITokenTaxInput): number => {
	const budget = input.tokenBudget;
	if (budget === null || budget === undefined) return 0.5;
	const { hard, isBreak } = resolveHard(budget);
	if (isBreak) return 0;
	const ratio = hard / HARD_REFERENCE;
	if (ratio <= 0) return 0.5;
	const score = 1 - ratio;
	return Math.max(0, Math.min(1, score));
};
