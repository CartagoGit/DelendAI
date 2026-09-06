#!/usr/bin/env bun
/**
 * state-engine-coverage.script.ts — q00019 meta gate.
 *
 * Runs the hermetic state-engine audit and turns coverage gaps into a
 * CI-failing lint.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

import {
	formatStateEngineCoverageReport,
	scanStateEngineCoverage,
} from '../audit/state-engine-coverage.script';
import { repoRoot } from '../lib/monorepo-paths';

const REGISTRY_METHODS = [
	'rebuild',
	'hydrate',
	'incremental',
	'snapshot',
	'fork',
	'discard',
	'record',
] as const;

const TEST_FILE_RE = /\.(?:spec|test)\.ts$/;
const TEXT_EXTENSIONS = new Set([
	'.ts',
	'.tsx',
	'.js',
	'.jsx',
	'.mjs',
	'.cjs',
	'.mts',
	'.cts',
]);

const walkFiles = (absDir: string): string[] => {
	if (!existsSync(absDir)) return [];
	const out: string[] = [];
	for (const entry of readdirSync(absDir)) {
		if (entry === 'dist' || entry === 'coverage' || entry === 'node_modules') {
			continue;
		}
		const absPath = join(absDir, entry);
		const stat = statSync(absPath);
		if (stat.isDirectory()) {
			out.push(...walkFiles(absPath));
			continue;
		}
		if (stat.isFile() && TEXT_EXTENSIONS.has(extname(entry))) out.push(absPath);
	}
	return out.sort();
};

export interface IRegistryMethodCoverage {
	readonly method: (typeof REGISTRY_METHODS)[number];
	readonly tests: readonly string[];
}

export const scanStateSqliteMethodCoverage = (
	root: string = repoRoot(),
): readonly IRegistryMethodCoverage[] => {
	const packageRoot = join(root, 'packages', 'state-sqlite');
	const files = walkFiles(packageRoot).filter((file) => TEST_FILE_RE.test(file));
	return REGISTRY_METHODS.map((method) => {
		const references: string[] = [];
		const callRe = new RegExp(`\\.\\s*${method}\\s*\\(`);
		for (const absFile of files) {
			const relFile = relative(root, absFile);
			const lines = readFileSync(absFile, 'utf8').split('\n');
			for (const [index, line] of lines.entries()) {
				if (callRe.test(line)) {
					references.push(`${relFile}:${index + 1}`);
				}
			}
		}
		return { method, tests: references };
	});
};

export const computeStateEngineCoverageGaps = (root: string = repoRoot()) => {
	const audit = scanStateEngineCoverage(root);
	const gaps = [
		...audit.mismatches.map((line) =>
			line.replace('not handled by driver', 'not in any driver file'),
		),
		...audit.outsideDriverSqliteImports.map(
			(ref) => `import of bun:sqlite outside state-sqlite: ${ref.file}:${ref.line}`,
		),
	];

	for (const coverage of scanStateSqliteMethodCoverage(root)) {
		if (coverage.tests.length === 0) {
			gaps.push(`IStateRegistry method with 0 tests: ${coverage.method}`);
		}
	}

	return { audit, gaps };
};

const main = (): number => {
	const { audit, gaps } = computeStateEngineCoverageGaps(repoRoot());
	process.stdout.write(formatStateEngineCoverageReport(audit));
	process.stdout.write('\nCoverage gates\n');
	if (gaps.length === 0) {
		process.stdout.write('✓ state-engine-coverage: no gaps detected.\n');
		return 0;
	}
	for (const gap of gaps) process.stdout.write(`- ${gap}\n`);
	return 1;
};

if (import.meta.main) process.exit(main());