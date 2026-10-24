export interface IBenchResult {
	readonly name: string;
	readonly ops: number;
	readonly sampleCount: number;
	readonly meanMs: number;
	readonly p95Ms: number;
}

const percentileIndex = (size: number, percentile: number): number =>
	Math.max(0, Math.ceil(size * percentile) - 1);

export const runBench = (
	name: string,
	samples: readonly number[],
): IBenchResult => {
	if (samples.length === 0) {
		throw new RangeError('runBench requires at least one sample');
	}

	const sampleCount = samples.length;
	const meanMs =
		samples.reduce((total, sample) => total + sample, 0) / sampleCount;
	const sorted = [...samples].sort((left, right) => left - right);
	const p95Ms =
		sorted[percentileIndex(sorted.length, 0.95)] ?? sorted[0] ?? 0;
	const ops = meanMs === 0 ? Number.POSITIVE_INFINITY : 1000 / meanMs;

	return {
		name,
		ops,
		sampleCount,
		meanMs,
		p95Ms,
	};
};
