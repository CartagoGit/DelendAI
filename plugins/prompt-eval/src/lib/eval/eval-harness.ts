export interface IEvalProvider {
	readonly id: string;
	readonly label: string;
	readonly costTier: 1 | 2 | 3 | 4 | 5;
}

export interface IProviderRunResult {
	readonly output: unknown;
	readonly costUsd: number;
}

export interface IEvalAttempt {
	readonly providerId: string;
	readonly costTier: number;
	readonly costUsd: number;
	readonly passed: boolean;
	readonly skipped?: 'spend-denied' | undefined;
}

export interface IEvalHarnessDeps {
	/** Must authorise an individual provider invocation before it can run. */
	readonly allowSpend: (provider: IEvalProvider) => Promise<boolean>;
	readonly runProvider: (
		provider: IEvalProvider,
		prompt: string,
	) => Promise<IProviderRunResult>;
	readonly checkAcceptance: (
		output: unknown,
		provider: IEvalProvider,
	) => Promise<boolean>;
}

export interface IEvalHarnessInput {
	readonly prompt: string;
	readonly providers: readonly IEvalProvider[];
}

export interface IEvalHarnessResult {
	readonly attempts: readonly IEvalAttempt[];
	readonly passed: number;
	readonly totalCostUsd: number;
	readonly winner: string | null;
}

const normalizeUsd = (value: number): number =>
	Math.round(value * 1_000_000) / 1_000_000;

/**
 * Evaluate every ranked provider independently. A denied spend guard is a
 * recorded skip, never a provider invocation, so callers can distinguish a
 * quality failure from a safety refusal.
 */
export const runEvalHarness = async (
	input: IEvalHarnessInput,
	deps: IEvalHarnessDeps,
): Promise<IEvalHarnessResult> => {
	const attempts: IEvalAttempt[] = [];
	let totalCostUsd = 0;

	for (const provider of input.providers) {
		if (!(await deps.allowSpend(provider))) {
			attempts.push({
				providerId: provider.id,
				costTier: provider.costTier,
				costUsd: 0,
				passed: false,
				skipped: 'spend-denied',
			});
			continue;
		}

		const run = await deps.runProvider(provider, input.prompt);
		if (!Number.isFinite(run.costUsd) || run.costUsd < 0) {
			throw new Error(`provider ${provider.id} returned an invalid cost`);
		}
		const passed = await deps.checkAcceptance(run.output, provider);
		totalCostUsd = normalizeUsd(totalCostUsd + run.costUsd);
		attempts.push({
			providerId: provider.id,
			costTier: provider.costTier,
			costUsd: run.costUsd,
			passed,
		});
	}

	const winners = attempts
		.filter((attempt) => attempt.passed)
		.sort(
			(left, right) =>
				left.costUsd - right.costUsd || left.costTier - right.costTier,
		);
	return {
		attempts,
		passed: winners.length,
		totalCostUsd,
		winner: winners[0]?.providerId ?? null,
	};
};
