#!/usr/bin/env bun
/**
 * coverage-ratchet.script.ts — t00030 S3 ("arquitectura ideal"): fails
 * when `vitest.config.ts`'s global coverage thresholds have drifted
 * stale below the real, measured coverage.
 *
 * Same idiom as `tools/scripts/lint/type-naming.script.ts`: the
 * config file is the single source of truth (no separate baseline
 * file to keep in sync), and the script only reads + compares — it
 * never writes `vitest.config.ts` itself. The RATCHET POLICY comment
 * above `coverage.thresholds` in `vitest.config.ts` documents the
 * exact tightening rule this script encodes: `floor(measured − 1.0)`.
 *
 * Usage:
 *   bun run test:coverage \
 *     -- --reporter=json-summary        # produce a fresh
 *                                        # .cache/coverage/coverage-summary.json
 *   bun tools/scripts/coverage-ratchet.script.ts   # check
 *
 * (`bun run coverage:ratchet` runs both steps together.)
 *
 * Exit codes:
 *   0 — every global threshold already equals `floor(measured − margin)`
 *       (nothing to tighten) or is stricter.
 *   1 — coverage improved and `vitest.config.ts` was not tightened to
 *       match, or no coverage report was found (run `test:coverage`
 *       with `--reporter=json-summary` first).
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from './lib/monorepo-paths';

export type ICoverageMetricKey =
	| 'statements'
	| 'branches'
	| 'functions'
	| 'lines';

export interface ICoverageMetrics {
	readonly statements: number;
	readonly branches: number;
	readonly functions: number;
	readonly lines: number;
}

/**
 * Same flat margin the RATCHET POLICY comment in `vitest.config.ts`
 * uses: ~10x the observed run-to-run drift (well under 0.1pt/metric),
 * floored to a whole number.
 */
export const RATCHET_MARGIN = 1.0;

export const COVERAGE_METRIC_KEYS: readonly ICoverageMetricKey[] = [
	'statements',
	'branches',
	'functions',
	'lines',
];

export interface ICoverageRatchetViolation {
	readonly metric: ICoverageMetricKey;
	readonly configured: number;
	readonly measured: number;
	readonly expected: number;
}

/**
 * Pure: given the four global thresholds currently in
 * `vitest.config.ts` and a fresh measurement, find every metric whose
 * configured floor sits BELOW `floor(measured − margin)` — i.e.
 * coverage improved for real and the config was never tightened to
 * follow it.
 */
export const computeCoverageRatchetViolations = (
	configured: ICoverageMetrics,
	measured: ICoverageMetrics,
	margin: number = RATCHET_MARGIN,
): readonly ICoverageRatchetViolation[] => {
	const violations: ICoverageRatchetViolation[] = [];
	for (const metric of COVERAGE_METRIC_KEYS) {
		const expected = Math.floor(measured[metric] - margin);
		if (configured[metric] < expected) {
			violations.push({
				metric,
				configured: configured[metric],
				measured: measured[metric],
				expected,
			});
		}
	}
	return violations;
};

interface IVitestCoverageSummaryTotal {
	readonly statements: { readonly pct: number };
	readonly branches: { readonly pct: number };
	readonly functions: { readonly pct: number };
	readonly lines: { readonly pct: number };
}

interface IVitestCoverageSummary {
	readonly total: IVitestCoverageSummaryTotal;
}

/** Pure: parse vitest's `--reporter=json-summary` output shape. */
export const parseCoverageSummary = (raw: string): ICoverageMetrics => {
	const parsed = JSON.parse(raw) as IVitestCoverageSummary;
	return {
		statements: parsed.total.statements.pct,
		branches: parsed.total.branches.pct,
		functions: parsed.total.functions.pct,
		lines: parsed.total.lines.pct,
	};
};

/**
 * Pure: read the four GLOBAL threshold numbers out of
 * `vitest.config.ts`'s `coverage.thresholds` block, ignoring the
 * per-module glob overrides (`'packages/core/src/lib/plugins/**': {
 * branches: 80 }`, …) that t00030 S2 added below them. Deliberately a
 * light regex scan — same idiom `type-naming.script.ts` uses for
 * source scanning — rather than importing/executing the config
 * module, since this script has to run standalone without spinning up
 * Vite.
 */
export const parseGlobalThresholds = (source: string): ICoverageMetrics => {
	const thresholdsStart = source.indexOf('thresholds: {');
	if (thresholdsStart < 0) {
		throw new Error(
			'coverage-ratchet: could not find "thresholds: {" in vitest.config.ts',
		);
	}
	// The per-module glob overrides always follow the four global keys
	// (see the S2 comment above `coverage.thresholds`) and are the
	// only entries keyed by a string path rather than a bare
	// identifier — stop scanning at the first one.
	const overridesStart = source.indexOf("'packages/", thresholdsStart);
	const globalSection =
		overridesStart > thresholdsStart
			? source.slice(thresholdsStart, overridesStart)
			: source.slice(thresholdsStart, thresholdsStart + 400);

	const read = (key: ICoverageMetricKey): number => {
		const match = new RegExp(`\\b${key}:\\s*(\\d+(?:\\.\\d+)?)`, 'u').exec(
			globalSection,
		);
		if (match?.[1] === undefined) {
			throw new Error(
				`coverage-ratchet: missing global threshold for "${key}" in vitest.config.ts`,
			);
		}
		return Number(match[1]);
	};

	return {
		statements: read('statements'),
		branches: read('branches'),
		functions: read('functions'),
		lines: read('lines'),
	};
};

const formatReport = (
	violations: readonly ICoverageRatchetViolation[],
): string => {
	if (violations.length === 0) {
		return 'coverage-ratchet: ok — global thresholds already match measured minus the margin\n';
	}
	const lines = [
		`coverage-ratchet: ${violations.length} stale threshold(s) — coverage rose but vitest.config.ts was not tightened`,
		'',
	];
	for (const violation of violations) {
		lines.push(
			`- ${violation.metric}: configured=${violation.configured} measured=${violation.measured} → tighten to ${violation.expected}`,
		);
	}
	lines.push('');
	return lines.join('\n');
};

if (import.meta.main) {
	const summaryPath = join(
		repoRoot(),
		'.cache/coverage/coverage-summary.json',
	);
	if (!existsSync(summaryPath)) {
		process.stderr.write(
			'coverage-ratchet: no .cache/coverage/coverage-summary.json found — run `bun run test:coverage -- --reporter=json-summary` first\n',
		);
		process.exit(1);
	}
	const measured = parseCoverageSummary(readFileSync(summaryPath, 'utf8'));
	const configured = parseGlobalThresholds(
		readFileSync(join(repoRoot(), 'vitest.config.ts'), 'utf8'),
	);
	const violations = computeCoverageRatchetViolations(configured, measured);
	process.stdout.write(formatReport(violations));
	process.exit(violations.length === 0 ? 0 : 1);
}
