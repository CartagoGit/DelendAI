#!/usr/bin/env bun

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const REPO_ROOT = process.cwd();
const SOURCE_ROOT = join(REPO_ROOT, 'plugins/commit-policy/src');
const DRIVER_PATH = join(SOURCE_ROOT, 'lib/services/commit-driver.ts');

export interface ICommitDriverGuardViolation {
	readonly rule: string;
	readonly file: string;
	readonly detail: string;
}

export interface ICommitDriverGuardResult {
	readonly ok: boolean;
	readonly violations: readonly ICommitDriverGuardViolation[];
}

export interface ICommitDriverGuardSourceFile {
	readonly file: string;
	readonly body: string;
}

const collectTsFiles = (dir: string): string[] => {
	const entries = readdirSync(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...collectTsFiles(path));
			continue;
		}
		if (
			entry.isFile() &&
			path.endsWith('.ts') &&
			!path.endsWith('.spec.ts')
		) {
			files.push(path);
		}
	}
	return files;
};

const extractBlock = (source: string, anchor: string): string => {
	const start = source.indexOf(anchor);
	if (start < 0) {
		throw new Error(`missing anchor: ${anchor}`);
	}
	const bodyStart = source.indexOf('{', start);
	if (bodyStart < 0) {
		throw new Error(`missing body for anchor: ${anchor}`);
	}
	let depth = 0;
	for (let index = bodyStart; index < source.length; index += 1) {
		const char = source[index];
		if (char === '{') depth += 1;
		if (char === '}') depth -= 1;
		if (depth === 0) {
			return source.slice(start, index + 1);
		}
	}
	throw new Error(`unclosed block for anchor: ${anchor}`);
};

const assertOrder = (
	body: string,
	markers: readonly { readonly label: string; readonly token: string }[],
	rule: string,
	file: string,
	violations: ICommitDriverGuardViolation[],
): void => {
	const positions = markers.map((marker) => ({
		label: marker.label,
		token: marker.token,
		index: body.indexOf(marker.token),
	}));
	for (const position of positions) {
		if (position.index >= 0) continue;
		violations.push({
			rule,
			file,
			detail: `missing marker ${position.label}: ${position.token}`,
		});
		return;
	}
	for (let index = 1; index < positions.length; index += 1) {
		const previous = positions[index - 1];
		const current = positions[index];
		if ((previous?.index ?? -1) < (current?.index ?? -1)) continue;
		violations.push({
			rule,
			file,
			detail: `expected ${previous?.label} before ${current?.label}`,
		});
		return;
	}
};

const assertSubsetInvariant = (
	source: string,
	file: string,
	violations: ICommitDriverGuardViolation[],
): void => {
	const shared = extractBlock(
		source,
		'const commitWithSharedIndexGuard = async (',
	);
	assertOrder(
		shared,
		[
			{
				label: 'add',
				token: 'const addResult = await gitAdd(args.run, args.allowList);',
			},
			{ label: 'assertSubset', token: 'const extras = staged.filter(' },
			{
				label: 'commit',
				token: 'const commitResult = await gitCommit(args.run, args.message, {',
			},
		],
		'commitWithSharedIndexGuard-order',
		file,
		violations,
	);

	const isolated = extractBlock(
		source,
		'export const commitWithGuard = async (',
	);
	assertOrder(
		isolated,
		[
			{
				label: 'add',
				token: 'const addResult = await gitAdd(isolatedRun, args.allowList);',
			},
			{ label: 'assertSubset', token: 'const extras = staged.filter(' },
			{
				label: 'write-tree',
				token: "const writeTreeResult = await isolatedRun(['write-tree']);",
			},
			{
				label: 'commit-tree',
				token: 'const commitTreeResult = await isolatedRun(commitTreeArgs);',
			},
		],
		'commitWithGuard-order',
		file,
		violations,
	);
};

export const lintCommitDriverGuardFromSources = (
	driverSource: string,
	otherSources: readonly ICommitDriverGuardSourceFile[],
	driverFile = relative(REPO_ROOT, DRIVER_PATH),
): ICommitDriverGuardResult => {
	const violations: ICommitDriverGuardViolation[] = [];
	for (const { file, body } of otherSources) {
		for (const [rule, pattern] of [
			['gitCommit-outside-driver', /\bgitCommit\s*\(/u],
			['commit-tree-outside-driver', /['"]commit-tree['"]/u],
			['update-ref-outside-driver', /['"]update-ref['"]/u],
		] as const) {
			if (!pattern.test(body)) continue;
			violations.push({
				rule,
				file,
				detail: 'direct commit primitive found outside commit-driver.ts',
			});
		}
	}

	assertSubsetInvariant(driverSource, driverFile, violations);

	return {
		ok: violations.length === 0,
		violations,
	};
};

export const lintCommitDriverGuard = (): ICommitDriverGuardResult => {
	const sourceFiles = collectTsFiles(SOURCE_ROOT);
	const otherSources = sourceFiles
		.filter((file) => file !== DRIVER_PATH)
		.map((file) => ({
			file: relative(REPO_ROOT, file),
			body: readFileSync(file, 'utf8'),
		}));
	return lintCommitDriverGuardFromSources(
		readFileSync(DRIVER_PATH, 'utf8'),
		otherSources,
	);
};

const formatReport = (result: ICommitDriverGuardResult): string => {
	if (result.ok) return 'commit-driver-guard: ok\n';
	const lines = [
		`commit-driver-guard: ${result.violations.length} violation(s)`,
		'',
	];
	for (const violation of result.violations) {
		lines.push(
			`- ${violation.file} [${violation.rule}] ${violation.detail}`,
		);
	}
	lines.push('');
	return lines.join('\n');
};

if (import.meta.main) {
	const result = lintCommitDriverGuard();
	process.stdout.write(formatReport(result));
	process.exit(result.ok ? 0 : 1);
}
