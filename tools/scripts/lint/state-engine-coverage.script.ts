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

/** Where the registry contract is declared: the methods are read from it. */
const REGISTRY_CONTRACT = join('packages', 'contracts', 'src', 'state.ts');

/**
 * The methods `IStateRegistry` declares, read from the contract. A list
 * kept here named methods the registry no longer had (rebuild, snapshot,
 * fork…), so the methods it does have went unchecked.
 */
export const registryMethods = (
	root: string = repoRoot(),
): readonly string[] => {
	const text = readFileSync(join(root, REGISTRY_CONTRACT), 'utf8');
	const start = text.indexOf('export interface IStateRegistry {');
	if (start < 0)
		throw new Error(
			`state-engine-coverage: no IStateRegistry in ${REGISTRY_CONTRACT}`,
		);
	const body = text.slice(start, text.indexOf('\n}', start));
	return [
		...new Set(
			[...body.matchAll(/^\t([a-zA-Z]+)\??\(/gmu)].map(
				(match) => match[1] ?? '',
			),
		),
	].sort();
};

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
		if (
			entry === 'dist' ||
			entry === 'coverage' ||
			entry === 'node_modules'
		) {
			continue;
		}
		const absPath = join(absDir, entry);
		const stat = statSync(absPath);
		if (stat.isDirectory()) {
			out.push(...walkFiles(absPath));
			continue;
		}
		if (stat.isFile() && TEXT_EXTENSIONS.has(extname(entry)))
			out.push(absPath);
	}
	return out.sort();
};

export interface IRegistryMethodCoverage {
	readonly method: string;
	readonly tests: readonly string[];
}

export const scanStateSqliteMethodCoverage = (
	root: string = repoRoot(),
): readonly IRegistryMethodCoverage[] => {
	const packageRoot = join(root, 'packages', 'state-sqlite');
	// The SQLite specs run the shared driver contract
	// (`registry-contract.spec.ts`), so its assertions are the SQLite
	// driver's tests as much as the specs written here.
	const contractRoot = join(
		root,
		'packages',
		'state',
		'tests',
		'src',
		'contract',
	);
	const files = [
		...walkFiles(packageRoot).filter((file) => TEST_FILE_RE.test(file)),
		...walkFiles(contractRoot).filter((file) =>
			file.endsWith('.helper.ts'),
		),
	];
	return registryMethods(root).map((method) => {
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
			(ref) =>
				`import of bun:sqlite outside state-sqlite: ${ref.file}:${ref.line}`,
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
		process.stdout.write('✓ state-engine-coverage: no gaps.\n');
		return 0;
	}
	for (const gap of gaps) process.stdout.write(`- ${gap}\n`);
	process.stdout.write(`\nstate-engine-coverage: ${gaps.length} gap(s).\n`);
	return 1;
};

if (import.meta.main) process.exit(main());
