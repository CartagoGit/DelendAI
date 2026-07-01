#!/usr/bin/env bun
/**
 * cli-coverage.script.ts - f00034 s7 (gate).
 *
 * The human CLI is command-oriented, so every registered command must be
 * named by the CLI test suite. This is intentionally a cheap structural gate:
 * Vitest owns behavioral assertions, this script catches the easy drift where
 * a command is added to the registry with no test surface at all.
 */
import { readdir, readFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';

const REPO_ROOT = process.cwd();
const DEFAULT_REGISTRY = 'packages/cli/src/commands/registry.ts';
const DEFAULT_TEST_ROOT = 'packages/cli/tests';

export interface ICliCoverageFinding {
	readonly command: string;
	readonly reason: string;
}

export interface ICliCoverageReport {
	readonly commands: readonly string[];
	readonly specFiles: readonly string[];
	readonly findings: readonly ICliCoverageFinding[];
}

const TS_SPEC_FILE = /\.spec\.ts$/;
const COMMAND_NAME = /\bname:\s*['"]([^'"]+)['"]/g;
const TEST_CASE = /\b(?:it|test)\s*\(/g;

const abs = (path: string): string =>
	isAbsolute(path) ? path : join(REPO_ROOT, path);

const walkSpecs = async (root: string): Promise<readonly string[]> => {
	const out: string[] = [];
	const stack = [root];
	while (stack.length > 0) {
		const dir = stack.pop();
		if (dir === undefined) break;
		let entries: import('node:fs').Dirent[];
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name !== 'node_modules' && entry.name !== 'dist') {
					stack.push(full);
				}
				continue;
			}
			if (entry.isFile() && TS_SPEC_FILE.test(entry.name)) out.push(full);
		}
	}
	return out.sort();
};

export const extractRegisteredCommands = (
	registryText: string,
): readonly string[] => {
	const commands = new Set<string>();
	for (const match of registryText.matchAll(COMMAND_NAME)) {
		const name = match[1]?.trim();
		if (name !== undefined && name.length > 0) commands.add(name);
	}
	return [...commands].sort();
};

const containsCommand = (testsText: string, command: string): boolean => {
	const quoted = [`'${command}'`, `"${command}"`, `\`${command}\``];
	return quoted.some((needle) => testsText.includes(needle));
};

export const detectCliCoverage = async (
	registryPath: string = DEFAULT_REGISTRY,
	testRoot: string = DEFAULT_TEST_ROOT,
): Promise<ICliCoverageReport> => {
	const registryAbs = abs(registryPath);
	const testsAbs = abs(testRoot);
	const registryText = await readFile(registryAbs, 'utf8');
	const commands = extractRegisteredCommands(registryText);
	const specFiles = await walkSpecs(testsAbs);
	const testTexts = await Promise.all(
		specFiles.map((file) => readFile(file, 'utf8')),
	);
	const testsText = testTexts.join('\n');
	const testCaseCount = [...testsText.matchAll(TEST_CASE)].length;
	const findings: ICliCoverageFinding[] = [];

	if (commands.length === 0) {
		findings.push({
			command: '<registry>',
			reason: 'no registered CLI commands were found',
		});
	}
	if (testCaseCount < 3) {
		findings.push({
			command: '<tests>',
			reason: `expected at least 3 CLI test cases, found ${testCaseCount}`,
		});
	}
	for (const command of commands) {
		if (!containsCommand(testsText, command)) {
			findings.push({
				command,
				reason: `registered command "${command}" is not named in packages/cli/tests`,
			});
		}
	}

	return {
		commands,
		specFiles: specFiles.map((file) => relative(REPO_ROOT, file)),
		findings,
	};
};

export const formatReport = (report: ICliCoverageReport): string => {
	if (report.findings.length === 0) {
		return `cli-coverage: ${report.commands.length} commands covered by ${report.specFiles.length} spec files.\n`;
	}
	const lines = [
		`cli-coverage: ${report.findings.length} finding${report.findings.length === 1 ? '' : 's'}.`,
		'',
	];
	for (const finding of report.findings) {
		lines.push(`  ${finding.command}: ${finding.reason}`);
	}
	lines.push(
		'',
		'Add or update packages/cli/tests/*.spec.ts so every registered command is named by the test suite.',
	);
	return `${lines.join('\n')}\n`;
};

export const main = async (): Promise<number> => {
	const report = await detectCliCoverage();
	const text = formatReport(report);
	if (report.findings.length === 0) {
		process.stdout.write(text);
		return 0;
	}
	process.stderr.write(text);
	return 1;
};

if (import.meta.main) {
	process.exit(await main());
}
