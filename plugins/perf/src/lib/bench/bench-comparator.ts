import type { IBenchResult } from './bench-runner';

export interface IBenchmarkYaml {
	readonly entries: Readonly<Record<string, { readonly ops: number }>>;
}

export interface IRegression {
	readonly name: string;
	readonly baselineOps: number;
	readonly currentOps: number;
	readonly ratio: number;
	readonly threshold: number;
}

export const compareToBaseline = (
	baseline: IBenchmarkYaml,
	current: readonly IBenchResult[],
	threshold: number,
): readonly IRegression[] =>
	current.flatMap((result) => {
		const baselineEntry = baseline.entries[result.name];
		if (baselineEntry === undefined || baselineEntry.ops <= 0) {
			return [];
		}

		const ratio = result.ops / baselineEntry.ops;
		if (ratio >= 1 - threshold) {
			return [];
		}

		return [
			{
				name: result.name,
				baselineOps: baselineEntry.ops,
				currentOps: result.ops,
				ratio,
				threshold,
			},
		];
	});
