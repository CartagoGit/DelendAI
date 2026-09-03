#!/usr/bin/env bun

import { parseBarrel } from '../inspect/core-public-inventory.script';

// Raised by one, deliberately, for `announceLines`: it REMOVES four
// duplicated copies of the same never-throw stderr write loop (two of
// them in plugins, which `lint:solid` flags as cross-plugin
// duplication). Spending a public export to delete four copies of a
// safety guarantee is the trade this budget exists to make consciously.
//
// Raised by eight more (2026-09-04) for q00017's capability ontology and
// host capability registry. This is the trade the budget exists to force
// out into the open, so here it is: the eight exports replace TWO
// detectors that answered the same question with different shapes —
// `analyze-project` and `detect-stack` — and the eight canonical types
// are what let the second become a projection of the first instead of a
// rival source of truth. A public surface that grows to delete a
// duplicate truth is worth more than one that stays small by keeping it.
export const DEFAULT_MAX_CORE_PUBLIC_EXPORTS = 759;

export interface ICorePublicSurfaceBudgetReport {
	readonly ok: boolean;
	readonly actual: number;
	readonly max: number;
	readonly excess: number;
	readonly message: string;
}

interface IMainOptions {
	readonly argv?: readonly string[];
	readonly countExports?: () => Promise<number>;
	readonly stdout?: Pick<typeof process.stdout, 'write'>;
	readonly stderr?: Pick<typeof process.stderr, 'write'>;
}

const parseMax = (argv: readonly string[]): number | null => {
	for (const token of argv) {
		if (!token.startsWith('--max=')) continue;
		const raw = token.slice('--max='.length).trim();
		const value = Number(raw);
		if (!Number.isInteger(value) || value < 0) return null;
		return value;
	}
	return DEFAULT_MAX_CORE_PUBLIC_EXPORTS;
};

export const evaluateCorePublicSurfaceBudget = (
	actual: number,
	max: number,
): ICorePublicSurfaceBudgetReport => {
	const excess = Math.max(0, actual - max);
	if (actual <= max) {
		return {
			ok: true,
			actual,
			max,
			excess,
			message: `core-public-surface-budget: ${actual}/${max} exports within budget.`,
		};
	}
	return {
		ok: false,
		actual,
		max,
		excess,
		message: `core-public-surface-budget: ${actual} exports exceeds budget ${max} by ${excess}. Reduce packages/core/src/public/index.ts or raise the limit deliberately.`,
	};
};

export const countCorePublicExports = async (): Promise<number> => {
	const exports = await parseBarrel();
	return exports.length;
};

export const main = async ({
	argv = process.argv.slice(2),
	countExports = countCorePublicExports,
	stdout = process.stdout,
	stderr = process.stderr,
}: IMainOptions = {}): Promise<number> => {
	const max = parseMax(argv);
	if (max === null) {
		stderr.write(
			'core-public-surface-budget: invalid --max value; expected a non-negative integer.\n',
		);
		return 2;
	}
	const actual = await countExports();
	const report = evaluateCorePublicSurfaceBudget(actual, max);
	const writer = report.ok ? stdout : stderr;
	writer.write(`${report.message}\n`);
	return report.ok ? 0 : 1;
};

if (import.meta.main) {
	process.exit(await main());
}
