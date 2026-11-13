#!/usr/bin/env bun
/**
 * plugin-size-report.script.ts — one published definition of "how big is it".
 *
 * Arguments about the size of a package (is the proposals plugin a monolith,
 * does the process machinery grow faster than the product) were settled with
 * figures that counted different things: lines with and without tests, with
 * and without blanks, the working tree against a commit. This prints the
 * numbers together with the definition they were counted under, so anyone
 * can reproduce them at any commit.
 *
 *   bun tools/scripts/report/plugin-size-report.script.ts            # tracked files, working tree
 *   bun tools/scripts/report/plugin-size-report.script.ts --ref=<rev> # the files of that commit
 *   bun tools/scripts/report/plugin-size-report.script.ts --json
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { repoRoot } from '../lib/monorepo-paths';

export const SIZE_DEFINITION = [
	'Files: every git-tracked .ts/.tsx file, excluding declaration files (.d.ts) and generated files',
	'  (a "generated" path segment or a ".generated." basename).',
	'Lines: physical lines of the file, blank lines and comments included.',
	'Test: a basename ending in .spec/.test(.ts|.tsx), or a "tests" or "__tests__" path segment.',
	'Source: every other counted file.',
	'Package: the first two path segments for packages/, plugins/, extensions/ and apps/; the first segment otherwise.',
	'Scope: the git-tracked tree of the working directory, or of --ref=<rev>; nothing untracked is counted.',
].join('\n');

const PACKAGE_ROOTS: ReadonlySet<string> = new Set([
	'packages',
	'plugins',
	'extensions',
	'apps',
]);

export interface IMeasuredFile {
	readonly path: string;
	readonly lines: number;
}

export interface IPackageSize {
	readonly name: string;
	readonly sourceFiles: number;
	readonly sourceLines: number;
	readonly testFiles: number;
	readonly testLines: number;
}

const TS_FILE = /\.tsx?$/u;
const TEST_BASENAME = /\.(?:spec|test)\.tsx?$/u;

export const isCountedFile = (path: string): boolean => {
	if (!TS_FILE.test(path) || path.endsWith('.d.ts')) return false;
	const segments = path.split('/');
	const base = segments.at(-1) ?? '';
	return !segments.includes('generated') && !base.includes('.generated.');
};

export const isTestFile = (path: string): boolean => {
	const segments = path.split('/');
	return (
		TEST_BASENAME.test(segments.at(-1) ?? '') ||
		segments.includes('tests') ||
		segments.includes('__tests__')
	);
};

export const packageOf = (path: string): string => {
	const segments = path.split('/');
	const first = segments[0] ?? '';
	return PACKAGE_ROOTS.has(first) && segments.length > 2
		? `${first}/${segments[1] ?? ''}`
		: first;
};

export const countLines = (text: string): number => {
	if (text.length === 0) return 0;
	const breaks = text.split('\n').length - 1;
	return text.endsWith('\n') ? breaks : breaks + 1;
};

export const measurePackages = (
	files: readonly IMeasuredFile[],
): readonly IPackageSize[] => {
	const rows = new Map<string, IPackageSize>();
	for (const file of files) {
		if (!isCountedFile(file.path)) continue;
		const name = packageOf(file.path);
		const row = rows.get(name) ?? {
			name,
			sourceFiles: 0,
			sourceLines: 0,
			testFiles: 0,
			testLines: 0,
		};
		rows.set(
			name,
			isTestFile(file.path)
				? {
						...row,
						testFiles: row.testFiles + 1,
						testLines: row.testLines + file.lines,
					}
				: {
						...row,
						sourceFiles: row.sourceFiles + 1,
						sourceLines: row.sourceLines + file.lines,
					},
		);
	}
	return [...rows.values()].sort((a, b) =>
		a.name.localeCompare(b.name, 'en'),
	);
};

const total = (rows: readonly IPackageSize[]): IPackageSize =>
	rows.reduce(
		(sum, row) => ({
			name: 'total',
			sourceFiles: sum.sourceFiles + row.sourceFiles,
			sourceLines: sum.sourceLines + row.sourceLines,
			testFiles: sum.testFiles + row.testFiles,
			testLines: sum.testLines + row.testLines,
		}),
		{
			name: 'total',
			sourceFiles: 0,
			sourceLines: 0,
			testFiles: 0,
			testLines: 0,
		},
	);

export const formatSizeReport = (
	rows: readonly IPackageSize[],
	revision: string,
): string => {
	const header = [
		'package',
		'src files',
		'src LOC',
		'test files',
		'test LOC',
	];
	const cells = [...rows, total(rows)].map((row) => [
		row.name,
		String(row.sourceFiles),
		String(row.sourceLines),
		String(row.testFiles),
		String(row.testLines),
	]);
	const widths = header.map((title, column) =>
		Math.max(title.length, ...cells.map((row) => row[column]?.length ?? 0)),
	);
	const line = (row: readonly string[]): string =>
		row
			.map((cell, column) =>
				column === 0
					? cell.padEnd(widths[column] ?? 0)
					: cell.padStart(widths[column] ?? 0),
			)
			.join('  ');
	return [
		`Revision: ${revision}`,
		'Definition:',
		...SIZE_DEFINITION.split('\n').map((each) => `  ${each}`),
		'',
		line(header),
		...cells.map(line),
	].join('\n');
};

const git = (root: string, args: readonly string[]): string => {
	const result = spawnSync('git', [...args], {
		cwd: root,
		encoding: 'utf8',
		maxBuffer: 256 * 1024 * 1024,
	});
	if (result.status !== 0) {
		throw new Error(
			`git ${args.join(' ')} failed: ${result.stderr.trim() || 'no output'}`,
		);
	}
	return result.stdout;
};

const linesOfRef = (
	root: string,
	ref: string,
	paths: readonly string[],
): readonly IMeasuredFile[] => {
	const out: IMeasuredFile[] = [];
	for (const path of paths) {
		out.push({
			path,
			lines: countLines(git(root, ['show', `${ref}:${path}`])),
		});
	}
	return out;
};

export const measureRepository = (
	root: string,
	ref?: string,
): { readonly revision: string; readonly rows: readonly IPackageSize[] } => {
	const listed = (
		ref === undefined
			? git(root, ['ls-files', '-z'])
			: git(root, ['ls-tree', '-r', '-z', '--name-only', ref])
	)
		.split('\0')
		.filter((path) => isCountedFile(path));
	const files =
		ref === undefined
			? listed.map((path) => ({
					path,
					lines: countLines(readFileSync(join(root, path), 'utf8')),
				}))
			: linesOfRef(root, ref, listed);
	const revision = git(root, ['rev-parse', ref ?? 'HEAD']).trim();
	return {
		revision: ref === undefined ? `${revision} (working tree)` : revision,
		rows: measurePackages(files),
	};
};

export const main = (
	argv: readonly string[] = process.argv.slice(2),
): number => {
	const refArg = argv.find((arg) => arg.startsWith('--ref='));
	const ref = refArg?.slice('--ref='.length);
	const { revision, rows } = measureRepository(repoRoot(), ref);
	console.log(
		argv.includes('--json')
			? JSON.stringify(
					{
						revision,
						definition: SIZE_DEFINITION,
						rows,
						total: total(rows),
					},
					null,
					2,
				)
			: formatSizeReport(rows, revision),
	);
	return 0;
};

if (import.meta.main) process.exit(main());
