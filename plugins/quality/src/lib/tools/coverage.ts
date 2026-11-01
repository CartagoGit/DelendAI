export interface ICoverageMetric {
	readonly covered: number;
	readonly total: number;
	readonly pct: number;
}

export interface ICoverageSummary {
	readonly lines: ICoverageMetric;
	readonly branches: ICoverageMetric;
	readonly functions: ICoverageMetric;
}

interface IIstanbulFileCoverage {
	readonly statementMap?: Record<string, { start?: { line?: number } }>;
	readonly s?: Record<string, number>;
	readonly b?: Record<string, readonly number[]>;
	readonly f?: Record<string, number>;
}

const metricOf = (covered: number, total: number): ICoverageMetric => ({
	covered,
	total,
	pct: total === 0 ? 100 : Number(((covered / total) * 100).toFixed(2)),
});

const asCoverageMap = (
	value: unknown,
): Record<string, IIstanbulFileCoverage> => {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return {};
	}
	return value as Record<string, IIstanbulFileCoverage>;
};

export const summarizeCoverage = (raw: string): ICoverageSummary => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		parsed = {};
	}
	const coverageMap = asCoverageMap(parsed);
	const coveredLines = new Set<string>();
	const totalLines = new Set<string>();
	let coveredBranches = 0;
	let totalBranches = 0;
	let coveredFunctions = 0;
	let totalFunctions = 0;

	for (const entry of Object.values(coverageMap)) {
		for (const [statementId, statement] of Object.entries(
			entry.statementMap ?? {},
		)) {
			const line = statement.start?.line;
			if (typeof line !== 'number') continue;
			const key = String(line);
			totalLines.add(key);
			if ((entry.s?.[statementId] ?? 0) > 0) coveredLines.add(key);
		}
		for (const branchCounts of Object.values(entry.b ?? {})) {
			for (const count of branchCounts) {
				totalBranches += 1;
				if (count > 0) coveredBranches += 1;
			}
		}
		for (const count of Object.values(entry.f ?? {})) {
			totalFunctions += 1;
			if (count > 0) coveredFunctions += 1;
		}
	}

	return {
		lines: metricOf(coveredLines.size, totalLines.size),
		branches: metricOf(coveredBranches, totalBranches),
		functions: metricOf(coveredFunctions, totalFunctions),
	};
};
